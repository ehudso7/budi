// Shared job contract definitions for Budi workers and API.
// Defines the shape of messages passed through the job queue.

// ============================================================================
// Job Types
// ============================================================================

export interface AnalyzeJob {
  type: "analyze";
  /** Unique job identifier */
  jobId: string;
  /** Unique identifier of the track to analyze */
  trackId: string;
  /** S3 or HTTP URL where the original track can be downloaded */
  sourceUrl: string;
}

export interface FixJob {
  type: "fix";
  jobId: string;
  trackId: string;
  sourceUrl: string;
  /** List of fix modules to apply, e.g. ["clip_repair","de_ess","normalize"] */
  modules: FixModule[];
}

export type FixModule =
  | "normalize"
  | "clip_repair"
  | "de_ess"
  | "noise_reduction"
  | "dc_offset"
  | "silence_trim";

export interface MasterJob {
  type: "master";
  jobId: string;
  trackId: string;
  sourceUrl: string;
  /** Name of the mastering profile to use */
  profile: MasterProfile;
  /** Target loudness level */
  loudnessTarget: LoudnessTarget;
}

export type MasterProfile = "balanced" | "warm" | "punchy" | "custom";

export type LoudnessTarget = "low" | "medium" | "high";

export interface CodecPreviewJob {
  type: "codec-preview";
  jobId: string;
  trackId: string;
  masterUrl: string;
  /** Codecs to simulate, e.g. ["aac-128","mp3-128","opus-96"] */
  codecs: CodecFormat[];
}

export type CodecFormat =
  | "aac-128"
  | "aac-256"
  | "mp3-128"
  | "mp3-320"
  | "opus-64"
  | "opus-96"
  | "opus-128";

export interface AlbumMasterJob {
  type: "album-master";
  jobId: string;
  projectId: string;
  /** Track IDs in desired album order */
  trackIds: string[];
  profile: MasterProfile;
  loudnessTarget: LoudnessTarget;
  /** Whether to normalize loudness across all tracks (±1 LU) */
  normalizeLoudness: boolean;
}

export interface ExportJob {
  type: "export";
  jobId: string;
  projectId: string;
  /** Output formats to include */
  formats: ExportFormat[];
  /** Whether to include QC reports */
  includeQc: boolean;
}

export type ExportFormat = "wav-24" | "wav-16" | "mp3-320" | "flac";

// Union type of all possible jobs
export type Job =
  | AnalyzeJob
  | FixJob
  | MasterJob
  | CodecPreviewJob
  | AlbumMasterJob
  | ExportJob;

// ============================================================================
// Job Results
// ============================================================================

export interface JobResult {
  jobId: string;
  type: Job["type"];
  status: "completed" | "failed";
  error?: string;
}

export interface AnalysisResult extends JobResult {
  type: "analyze";
  data?: {
    // Loudness metrics (ITU-R BS.1770)
    integratedLufs: number;
    loudnessRange: number;
    shortTermMax: number;
    momentaryMax: number;
    // Peak metrics
    samplePeak: number;
    truePeak: number;
    // Spectral metrics
    spectralCentroid?: number;
    spectralRolloff?: number;
    // Stereo metrics
    stereoCorrelation?: number;
    stereoWidth?: number;
    // Issues
    hasClipping: boolean;
    hasDcOffset: boolean;
    dcOffsetValue?: number;
    clippedSamples: number;
    // Metadata
    sampleRate: number;
    bitDepth: number;
    channels: number;
    durationSecs: number;
    // Report URL
    reportUrl?: string;
  };
}

export interface FixResult extends JobResult {
  type: "fix";
  data?: {
    fixedUrl: string;
    appliedModules: FixModule[];
    changes: {
      module: FixModule;
      description: string;
    }[];
  };
}

export interface MasterResult extends JobResult {
  type: "master";
  data?: {
    wavHdUrl: string;
    wav16Url: string;
    mp3PreviewUrl: string;
    finalLufs: number;
    finalTruePeak: number;
    passesQc: boolean;
    qcReportUrl?: string;
  };
}

export interface CodecPreviewResult extends JobResult {
  type: "codec-preview";
  data?: {
    previews: {
      codec: CodecFormat;
      previewUrl: string;
      truePeakAfter: number;
      artifactScore: number;
      clippingRisk: boolean;
    }[];
  };
}

export interface AlbumMasterResult extends JobResult {
  type: "album-master";
  data?: {
    tracks: {
      trackId: string;
      masterResult: MasterResult["data"];
    }[];
    albumQcReport: {
      loudnessConsistency: boolean;
      tonalBalance: boolean;
      recommendedOrder: string[];
      outliers: {
        trackId: string;
        issue: string;
      }[];
      reportUrl?: string;
    };
  };
}

export interface ExportResult extends JobResult {
  type: "export";
  data?: {
    packUrl: string;
    files: {
      format: ExportFormat;
      filename: string;
    }[];
    qcReportIncluded: boolean;
  };
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateProjectRequest {
  name: string;
  type: "single" | "album";
}

export interface ImportTrackRequest {
  name: string;
  sourceUrl?: string; // If importing from URL
}

export interface AnalyzeTrackRequest {
  // No additional params needed
}

export interface FixTrackRequest {
  modules: FixModule[];
}

export interface MasterTrackRequest {
  profile: MasterProfile;
  loudnessTarget: LoudnessTarget;
}

export interface CodecPreviewRequest {
  codecs: CodecFormat[];
}

export interface AlbumMasterRequest {
  trackIds?: string[]; // Optional custom order
  profile: MasterProfile;
  loudnessTarget: LoudnessTarget;
  normalizeLoudness?: boolean;
}

export interface ExportProjectRequest {
  formats: ExportFormat[];
  includeQc?: boolean;
}

// ============================================================================
// QC Constants
// ============================================================================

export const QC_CONSTANTS = {
  /** Maximum allowed true peak in dBTP */
  TRUE_PEAK_MAX: -2.0,
  /** Allowed deviation from target loudness in LU */
  LOUDNESS_TOLERANCE: 1.0,
  /** Target LUFS values for each loudness level */
  LOUDNESS_TARGETS: {
    low: -14.0,
    medium: -11.0,
    high: -8.0,
  },
} as const;
