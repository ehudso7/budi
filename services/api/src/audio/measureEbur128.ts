/**
 * EBU R128 loudness measurement using FFmpeg
 *
 * Measures integrated loudness (LUFS), loudness range (LRA), and true peak (dBTP).
 * Uses ITU-R BS.1770-4 compliant measurement.
 */

import { run, requireOk } from './ffmpeg.js';

export type LoudnessMetrics = {
  integratedLufs: number;  // Integrated loudness in LUFS
  lra: number;             // Loudness Range in LU
  truePeakDbfs: number;    // True peak in dBFS (treat as dBTP for gating)
  shortTermMax: number;    // Maximum short-term loudness
  momentaryMax: number;    // Maximum momentary loudness
};

/**
 * Parse a numeric value from FFmpeg ebur128 output
 */
function parseNumber(label: string, text: string): number {
  // Handle various FFmpeg output formats:
  // "I: -12.6 LUFS"
  // "LRA: 6.2 LU"
  // "Peak: -0.3 dBFS"
  const patterns = [
    new RegExp(`${label}\\s*[:\\s]+\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'),
    new RegExp(`${label}[^\\d-]*(-?\\d+(?:\\.\\d+)?)`, 'i'),
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match) {
      const value = Number(match[1]);
      if (!isNaN(value)) {
        return value;
      }
    }
  }

  throw new Error(`Failed to parse ${label} from ebur128 output. Output sample:\n${text.slice(-1000)}`);
}

/**
 * Measure audio file loudness using FFmpeg's ebur128 filter
 */
export async function measureEbur128(inputPath: string): Promise<LoudnessMetrics> {
  const args = [
    '-hide_banner',
    '-nostats',
    '-i', inputPath,
    '-af', 'ebur128=peak=true',
    '-f', 'null',
    '-',
  ];

  const result = await run('ffmpeg', args, { timeoutMs: 10 * 60 * 1000 });

  // FFmpeg writes ebur128 summary to stderr
  const output = result.stderr;

  requireOk(result, 'ffmpeg ebur128 measurement');

  // Parse the Summary block from ebur128 output:
  // Summary:
  //
  //   Integrated loudness:
  //     I:         -12.6 LUFS
  //     Threshold: -23.0 LUFS
  //
  //   Loudness range:
  //     LRA:         6.2 LU
  //     Threshold:  -33.2 LUFS
  //     LRA low:    -18.5 LUFS
  //     LRA high:   -12.3 LUFS
  //
  //   True peak:
  //     Peak:        -0.3 dBFS

  const integratedLufs = parseNumber('I:', output);
  const lra = parseNumber('LRA:', output);
  const truePeakDbfs = parseNumber('Peak:', output);

  // Parse short-term and momentary max if available
  let shortTermMax = integratedLufs;
  let momentaryMax = integratedLufs;

  try {
    // These may appear in the per-frame output before Summary
    const stMatch = output.match(/S:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
    const mMatch = output.match(/M:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);

    if (stMatch && stMatch.length > 0) {
      const values = stMatch.map(s => {
        const m = s.match(/(-?\d+(?:\.\d+)?)/);
        return m ? Number(m[1]) : -Infinity;
      });
      shortTermMax = Math.max(...values);
    }

    if (mMatch && mMatch.length > 0) {
      const values = mMatch.map(s => {
        const m = s.match(/(-?\d+(?:\.\d+)?)/);
        return m ? Number(m[1]) : -Infinity;
      });
      momentaryMax = Math.max(...values);
    }
  } catch {
    // Use defaults if parsing fails
  }

  return {
    integratedLufs,
    lra,
    truePeakDbfs,
    shortTermMax: isFinite(shortTermMax) ? shortTermMax : integratedLufs,
    momentaryMax: isFinite(momentaryMax) ? momentaryMax : integratedLufs,
  };
}

/**
 * Quick true peak only measurement (faster than full ebur128)
 */
export async function measureTruePeak(inputPath: string): Promise<number> {
  const args = [
    '-hide_banner',
    '-nostats',
    '-i', inputPath,
    '-af', 'ebur128=peak=true:framelog=quiet',
    '-f', 'null',
    '-',
  ];

  const result = await run('ffmpeg', args, { timeoutMs: 5 * 60 * 1000 });
  requireOk(result, 'ffmpeg true peak measurement');

  return parseNumber('Peak:', result.stderr);
}
