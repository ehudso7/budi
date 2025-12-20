/**
 * Audio rendering with explicit FFmpeg codec specification
 *
 * CRITICAL: Never rely on FFmpeg defaults for output encoding.
 * Always explicitly specify codec, bit depth, and sample rate.
 */

import { run, requireOk } from './ffmpeg.js';

export type BitDepth = '16' | '24' | '32f';

/**
 * Get the explicit WAV PCM codec for a bit depth
 */
function wavCodec(bitDepth: BitDepth): string {
  switch (bitDepth) {
    case '16':
      return 'pcm_s16le';
    case '24':
      return 'pcm_s24le';
    case '32f':
      return 'pcm_f32le';
    default:
      throw new Error(`Invalid bit depth: ${bitDepth}`);
  }
}

/**
 * Get bits per sample for a bit depth
 */
export function getBitsPerSample(bitDepth: BitDepth): number {
  switch (bitDepth) {
    case '16': return 16;
    case '24': return 24;
    case '32f': return 32;
    default: throw new Error(`Invalid bit depth: ${bitDepth}`);
  }
}

export interface RenderWavParams {
  inputPath: string;
  outputPath: string;
  bitDepth: BitDepth;
  sampleRate: number;
  filterGraph?: string;  // e.g., "volume=-3dB"
}

/**
 * Render audio to WAV with explicit bit depth and sample rate
 *
 * Applies proper dithering when reducing to 16-bit.
 */
export async function renderWav(params: RenderWavParams): Promise<void> {
  const codec = wavCodec(params.bitDepth);

  // Build audio filter chain
  const filters: string[] = [];

  // Add user-specified filter if present
  if (params.filterGraph) {
    filters.push(params.filterGraph);
  }

  // Add dithering ONLY when reducing to 16-bit
  // For 24-bit and float, no dither needed
  if (params.bitDepth === '16') {
    filters.push('aresample=dither_method=triangular');
  }

  // If no filters, use null filter (passthrough)
  const af = filters.length > 0 ? filters.join(',') : 'anull';

  const args = [
    '-hide_banner',
    '-y',                          // Overwrite output
    '-i', params.inputPath,
    '-vn',                         // No video
    '-ar', String(params.sampleRate),
    '-af', af,
    '-c:a', codec,                 // EXPLICIT codec - never default!
    params.outputPath,
  ];

  const result = await run('ffmpeg', args, { timeoutMs: 30 * 60 * 1000 });
  requireOk(result, 'ffmpeg renderWav');
}

export interface RenderMp3Params {
  inputPath: string;
  outputPath: string;
  sampleRate: number;
  bitrateKbps?: number;  // Default 320
}

/**
 * Render audio to MP3 with explicit encoder and bitrate
 */
export async function renderMp3(params: RenderMp3Params): Promise<void> {
  const bitrate = `${params.bitrateKbps ?? 320}k`;

  const args = [
    '-hide_banner',
    '-y',
    '-i', params.inputPath,
    '-vn',
    '-ar', String(params.sampleRate),
    '-c:a', 'libmp3lame',          // EXPLICIT codec
    '-b:a', bitrate,
    '-q:a', '0',                   // Highest quality VBR within CBR constraint
    params.outputPath,
  ];

  const result = await run('ffmpeg', args, { timeoutMs: 30 * 60 * 1000 });
  requireOk(result, 'ffmpeg renderMp3');
}

export interface RenderAacParams {
  inputPath: string;
  outputPath: string;
  sampleRate: number;
  bitrateKbps?: number;  // Default 256
}

/**
 * Render audio to AAC with explicit encoder and bitrate
 */
export async function renderAac(params: RenderAacParams): Promise<void> {
  const bitrate = `${params.bitrateKbps ?? 256}k`;

  const args = [
    '-hide_banner',
    '-y',
    '-i', params.inputPath,
    '-vn',
    '-ar', String(params.sampleRate),
    '-c:a', 'aac',                 // EXPLICIT codec
    '-b:a', bitrate,
    '-movflags', '+faststart',     // Web-friendly seeking
    params.outputPath,
  ];

  const result = await run('ffmpeg', args, { timeoutMs: 30 * 60 * 1000 });
  requireOk(result, 'ffmpeg renderAac');
}

/**
 * Apply volume adjustment to audio file
 */
export async function applyGain(
  inputPath: string,
  outputPath: string,
  gainDb: number,
  bitDepth: BitDepth = '32f',
  sampleRate: number = 44100
): Promise<void> {
  await renderWav({
    inputPath,
    outputPath,
    bitDepth,
    sampleRate,
    filterGraph: gainDb === 0 ? undefined : `volume=${gainDb}dB`,
  });
}
