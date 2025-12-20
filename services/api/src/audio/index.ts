/**
 * Audio processing pipeline
 *
 * Provides production-grade audio rendering with:
 * - Explicit FFmpeg codec specification (never defaults)
 * - EBU R128 loudness measurement
 * - Release-Ready gate for true peak compliance
 */

export { run, requireOk, checkFfmpeg, checkFfprobe } from './ffmpeg.js';
export { measureEbur128, measureTruePeak, type LoudnessMetrics } from './measureEbur128.js';
export {
  renderWav,
  renderMp3,
  renderAac,
  applyGain,
  getBitsPerSample,
  type BitDepth,
  type RenderWavParams,
  type RenderMp3Params,
  type RenderAacParams,
} from './render.js';
export {
  makeReleaseReady,
  checkReleaseReady,
  type ReleaseReadyResult,
  type MakeReleaseReadyParams,
} from './releaseReady.js';
