/**
 * Export Worker
 *
 * Processes Release-Ready export jobs:
 * 1. Downloads source audio from S3
 * 2. Runs Release-Ready gate (iterative gain reduction to meet true peak ceiling)
 * 3. Renders final WAV in requested bit depth
 * 4. Optionally renders MP3 and AAC
 * 5. Uploads outputs to S3
 * 6. Updates database with results
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import prisma from '../lib/db.js';
import { dequeueJob, QUEUES } from '../lib/redis.js';
import { uploadFile, downloadFile, BUCKETS, generateKey } from '../lib/s3.js';
import {
  makeReleaseReady,
  renderMp3,
  renderAac,
  checkFfmpeg,
  type BitDepth,
  type ReleaseReadyResult,
} from '../audio/index.js';

interface TrackExportJob {
  type: 'track-export';
  jobId: string;
  exportJobId: string;
  trackId: string;
  sourceUrl: string;
  bitDepth: BitDepth;
  sampleRate: number;
  truePeakCeilingDb: number;
  includeMp3: boolean;
  includeAac: boolean;
}

interface QcReport {
  inputSha256: string;
  releaseReadyPasses: boolean;
  finalGainDb: number;
  truePeakCeilingDb: number;
  metrics: {
    integratedLufs: number;
    truePeakDbfs: number;
    lra: number;
    shortTermMax: number;
    momentaryMax: number;
  };
  attempts: ReleaseReadyResult['attempts'];
  outputs: {
    wav: { url: string; bitDepth: string; sampleRate: number };
    mp3?: { url: string; bitrate: number };
    aac?: { url: string; bitrate: number };
  };
  processedAt: string;
}

/**
 * Calculate SHA256 hash of a file
 */
async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Process a single export job
 */
export async function processExportJob(job: TrackExportJob): Promise<void> {
  const workDir = path.join(tmpdir(), `budi-export-${randomBytes(8).toString('hex')}`);
  await mkdir(workDir, { recursive: true });

  const inputPath = path.join(workDir, 'input.wav');
  const outputWavPath = path.join(workDir, 'output.wav');
  const outputMp3Path = path.join(workDir, 'output.mp3');
  const outputAacPath = path.join(workDir, 'output.m4a');
  const qcJsonPath = path.join(workDir, 'qc.json');

  try {
    // Update job status to PROCESSING
    await prisma.exportJob.update({
      where: { id: job.exportJobId },
      data: { status: 'PROCESSING' },
    });

    await prisma.job.update({
      where: { id: job.jobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    console.log(`[ExportWorker] Processing job ${job.exportJobId} for track ${job.trackId}`);

    // Download source file
    console.log('[ExportWorker] Downloading source file...');
    await downloadFile(job.sourceUrl, inputPath);

    // Calculate input hash for verification
    const inputSha256 = await hashFile(inputPath);

    // Run Release-Ready processing
    console.log(`[ExportWorker] Running Release-Ready gate (ceiling: ${job.truePeakCeilingDb} dBTP)...`);
    const result = await makeReleaseReady({
      inputPath,
      outputPath: outputWavPath,
      bitDepth: job.bitDepth,
      sampleRate: job.sampleRate,
      truePeakCeilingDb: job.truePeakCeilingDb,
    });

    console.log(`[ExportWorker] Release-Ready complete. Passes: ${result.passes}, Gain: ${result.finalGainDb} dB`);

    // Upload WAV to S3
    const wavKey = generateKey(`exports/${job.trackId}`, `release-ready-${job.bitDepth}bit.wav`);
    console.log('[ExportWorker] Uploading WAV...');
    const wavUrl = await uploadFile(outputWavPath, BUCKETS.AUDIO, wavKey, 'audio/wav');

    // Initialize output URLs
    let mp3Url: string | null = null;
    let aacUrl: string | null = null;

    // Render and upload MP3 if requested
    if (job.includeMp3) {
      console.log('[ExportWorker] Rendering MP3...');
      await renderMp3({
        inputPath: outputWavPath,
        outputPath: outputMp3Path,
        sampleRate: job.sampleRate,
        bitrateKbps: 320,
      });

      const mp3Key = generateKey(`exports/${job.trackId}`, 'release-ready.mp3');
      mp3Url = await uploadFile(outputMp3Path, BUCKETS.AUDIO, mp3Key, 'audio/mpeg');
    }

    // Render and upload AAC if requested
    if (job.includeAac) {
      console.log('[ExportWorker] Rendering AAC...');
      await renderAac({
        inputPath: outputWavPath,
        outputPath: outputAacPath,
        sampleRate: job.sampleRate,
        bitrateKbps: 256,
      });

      const aacKey = generateKey(`exports/${job.trackId}`, 'release-ready.m4a');
      aacUrl = await uploadFile(outputAacPath, BUCKETS.AUDIO, aacKey, 'audio/mp4');
    }

    // Build QC report
    const qcReport: QcReport = {
      inputSha256,
      releaseReadyPasses: result.passes,
      finalGainDb: result.finalGainDb,
      truePeakCeilingDb: job.truePeakCeilingDb,
      metrics: {
        integratedLufs: result.finalMetrics.integratedLufs,
        truePeakDbfs: result.finalMetrics.truePeakDbfs,
        lra: result.finalMetrics.lra,
        shortTermMax: result.finalMetrics.shortTermMax,
        momentaryMax: result.finalMetrics.momentaryMax,
      },
      attempts: result.attempts,
      outputs: {
        wav: {
          url: wavUrl,
          bitDepth: job.bitDepth,
          sampleRate: job.sampleRate,
        },
        ...(mp3Url && { mp3: { url: mp3Url, bitrate: 320 } }),
        ...(aacUrl && { aac: { url: aacUrl, bitrate: 256 } }),
      },
      processedAt: new Date().toISOString(),
    };

    // Upload QC report
    await writeFile(qcJsonPath, JSON.stringify(qcReport, null, 2));
    const qcKey = generateKey(`exports/${job.trackId}`, 'qc-report.json');
    const qcUrl = await uploadFile(qcJsonPath, BUCKETS.AUDIO, qcKey, 'application/json');

    // Update database with results
    await prisma.exportJob.update({
      where: { id: job.exportJobId },
      data: {
        status: 'SUCCEEDED',
        inputSha256,
        outputWavUrl: wavUrl,
        outputMp3Url: mp3Url,
        outputAacUrl: aacUrl,
        qcJsonUrl: qcUrl,
        finalGainDb: result.finalGainDb,
        finalTruePeakDbfs: result.finalMetrics.truePeakDbfs,
        finalIntegratedLufs: result.finalMetrics.integratedLufs,
        finalLra: result.finalMetrics.lra,
        releaseReadyPasses: result.passes,
        attempts: result.attempts.length,
        completedAt: new Date(),
      },
    });

    await prisma.job.update({
      where: { id: job.jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        resultUrl: qcUrl,
        completedAt: new Date(),
      },
    });

    console.log(`[ExportWorker] Job ${job.exportJobId} completed successfully`);
  } catch (error) {
    console.error(`[ExportWorker] Job ${job.exportJobId} failed:`, error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update database with failure
    await prisma.exportJob.update({
      where: { id: job.exportJobId },
      data: {
        status: 'FAILED',
        errorMessage,
        completedAt: new Date(),
      },
    });

    await prisma.job.update({
      where: { id: job.jobId },
      data: {
        status: 'FAILED',
        error: errorMessage,
        completedAt: new Date(),
      },
    });
  } finally {
    // Clean up work directory
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Process one job from the queue
 */
export async function runOnce(): Promise<boolean> {
  const rawJob = await dequeueJob(QUEUES.DSP_JOBS);
  if (!rawJob) {
    return false;
  }

  try {
    const job = JSON.parse(rawJob) as { type: string };

    if (job.type === 'track-export') {
      await processExportJob(job as TrackExportJob);
      return true;
    }

    // Other job types would be handled by other workers
    console.log(`[ExportWorker] Skipping job of type: ${job.type}`);
    return false;
  } catch (error) {
    console.error('[ExportWorker] Error processing job:', error);
    return false;
  }
}

/**
 * Run the worker forever, polling for jobs
 */
export async function runForever(pollIntervalMs = 1000): Promise<never> {
  console.log('[ExportWorker] Starting export worker...');

  // Check FFmpeg availability
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    console.error('[ExportWorker] FFmpeg not found! Please install FFmpeg.');
    process.exit(1);
  }
  console.log('[ExportWorker] FFmpeg available');

  // Connect to database
  console.log('[ExportWorker] Connected to database');

  while (true) {
    try {
      const processed = await runOnce();

      // If no job was processed, wait before polling again
      if (!processed) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    } catch (error) {
      console.error('[ExportWorker] Worker error:', error);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs * 5));
    }
  }
}
