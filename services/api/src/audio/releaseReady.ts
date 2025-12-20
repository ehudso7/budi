/**
 * Release-Ready Gate
 *
 * Ensures exported audio meets professional release standards:
 * - True peak ceiling: -2.0 dBTP (default, configurable)
 * - Iteratively adjusts gain until the ceiling is met
 * - No reliance on limiting/clipping - purely gain-based
 */

import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { measureEbur128, type LoudnessMetrics } from './measureEbur128.js';
import { renderWav, type BitDepth } from './render.js';

export interface ReleaseReadyResult {
  finalGainDb: number;
  finalMetrics: LoudnessMetrics;
  attempts: Array<{
    attemptNumber: number;
    gainDb: number;
    metrics: LoudnessMetrics;
    passedCeiling: boolean;
  }>;
  passes: boolean;
}

export interface MakeReleaseReadyParams {
  inputPath: string;
  outputPath: string;
  bitDepth: BitDepth;
  sampleRate: number;
  truePeakCeilingDb: number;  // e.g., -2.0
  maxAttempts?: number;       // Default 8
}

const DEFAULT_MAX_ATTEMPTS = 8;
const CEILING_EPSILON = 0.05;  // Small margin for floating-point comparison
const SAFETY_MARGIN = 0.2;    // Extra reduction per attempt to ensure we pass
const MAX_GAIN_REDUCTION = -18; // Never reduce more than 18dB

/**
 * Process audio to meet release-ready standards
 *
 * Algorithm:
 * 1. Render candidate at current gain in float (for accurate peak measurement)
 * 2. Measure true peak
 * 3. If peak <= ceiling + epsilon, render final output in target bit depth
 * 4. If peak > ceiling, reduce gain by (peak - ceiling) + safety margin
 * 5. Repeat until ceiling is met or max attempts reached
 */
export async function makeReleaseReady(
  params: MakeReleaseReadyParams
): Promise<ReleaseReadyResult> {
  const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const ceiling = params.truePeakCeilingDb;

  // Create unique work directory
  const workDir = path.join(
    tmpdir(),
    `budi-export-${randomBytes(8).toString('hex')}`
  );
  await mkdir(workDir, { recursive: true });

  const tmpCandidate = (n: number) => path.join(workDir, `candidate_${n}.wav`);
  const attempts: ReleaseReadyResult['attempts'] = [];

  let gainDb = 0;

  try {
    for (let i = 0; i < maxAttempts; i++) {
      const candidatePath = tmpCandidate(i);

      // Build filter graph for gain adjustment
      const filterGraph = gainDb === 0 ? undefined : `volume=${gainDb}dB`;

      // Render candidate in 32-bit float for accurate peak measurement
      // This avoids quantization noise affecting our peak checks
      await renderWav({
        inputPath: params.inputPath,
        outputPath: candidatePath,
        bitDepth: '32f',
        sampleRate: params.sampleRate,
        filterGraph,
      });

      // Measure the candidate
      const metrics = await measureEbur128(candidatePath);
      const passedCeiling = metrics.truePeakDbfs <= ceiling + CEILING_EPSILON;

      attempts.push({
        attemptNumber: i + 1,
        gainDb,
        metrics,
        passedCeiling,
      });

      if (passedCeiling) {
        // Success! Now render final output in requested bit depth
        await renderWav({
          inputPath: candidatePath,
          outputPath: params.outputPath,
          bitDepth: params.bitDepth,
          sampleRate: params.sampleRate,
        });

        // Verify final output meets requirements
        const finalMetrics = await measureEbur128(params.outputPath);

        // Double-check the final output (quantization to 16/24 bit could slightly raise peaks)
        const finalPasses = finalMetrics.truePeakDbfs <= ceiling + CEILING_EPSILON;

        if (!finalPasses && params.bitDepth !== '32f') {
          // Quantization raised the peak slightly, apply a bit more reduction
          const extraReduction = 0.3; // Small extra reduction
          gainDb -= extraReduction;
          continue; // Try again with more reduction
        }

        return {
          finalGainDb: gainDb,
          finalMetrics,
          attempts,
          passes: finalPasses,
        };
      }

      // Need more reduction
      // Calculate how much to reduce: (current_peak - ceiling) + safety margin
      const delta = (metrics.truePeakDbfs - ceiling) + SAFETY_MARGIN;
      gainDb -= delta;

      // Clamp to avoid extreme gain reduction
      if (gainDb < MAX_GAIN_REDUCTION) {
        gainDb = MAX_GAIN_REDUCTION;
      }
    }

    // Failed to meet ceiling after max attempts
    const lastAttempt = attempts.at(-1);

    // Still write best-effort output
    const lastCandidate = tmpCandidate(maxAttempts - 1);
    await renderWav({
      inputPath: lastCandidate,
      outputPath: params.outputPath,
      bitDepth: params.bitDepth,
      sampleRate: params.sampleRate,
    });

    const finalMetrics = await measureEbur128(params.outputPath);

    return {
      finalGainDb: gainDb,
      finalMetrics,
      attempts,
      passes: false,
    };
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
 * Check if a file already meets release-ready standards
 */
export async function checkReleaseReady(
  inputPath: string,
  truePeakCeilingDb: number = -2.0
): Promise<{
  passes: boolean;
  metrics: LoudnessMetrics;
  headroomDb: number;
}> {
  const metrics = await measureEbur128(inputPath);
  const passes = metrics.truePeakDbfs <= truePeakCeilingDb + CEILING_EPSILON;
  const headroomDb = truePeakCeilingDb - metrics.truePeakDbfs;

  return {
    passes,
    metrics,
    headroomDb,
  };
}
