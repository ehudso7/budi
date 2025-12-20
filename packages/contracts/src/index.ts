// Shared job contract definitions for MasterForge workers and API.
// Defines the shape of messages passed through the job queue.

export interface AnalyzeJob {
  type: "analyze";
  /** Unique identifier of the track to analyze */
  trackId: string;
  /** S3 or HTTP URL where the original track can be downloaded */
  sourceUrl: string;
}

export interface FixJob {
  type: "fix";
  trackId: string;
  sourceUrl: string;
  /** List of fix modules to apply, e.g. ["clip_repair","de_ess"] */
  modules: string[];
}

export interface MasterJob {
  type: "master";
  trackId: string;
  sourceUrl: string;
  /** Name of the mastering profile to use */
  profile: string;
}

export interface CodecPreviewJob {
  type: "codec-preview";
  trackId: string;
  masterUrl: string;
  /** Codecs to simulate, e.g. ["aac-128","mp3-320","opus-64"] */
  codecs: string[];
}

// Union type of all possible jobs.
export type Job = AnalyzeJob | FixJob | MasterJob | CodecPreviewJob;