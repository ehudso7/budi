//! Shared type definitions for the DSP worker

use serde::{Deserialize, Serialize};

/// Job types matching @budi/contracts
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum Job {
    #[serde(rename = "analyze")]
    Analyze {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "sourceUrl")]
        source_url: String,
    },
    #[serde(rename = "fix")]
    Fix {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "sourceUrl")]
        source_url: String,
        modules: Vec<String>,
    },
    #[serde(rename = "master")]
    Master {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "sourceUrl")]
        source_url: String,
        profile: String,
        #[serde(rename = "loudnessTarget")]
        loudness_target: String,
    },
    #[serde(rename = "album-master")]
    AlbumMaster {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "projectId")]
        project_id: String,
        #[serde(rename = "trackIds")]
        track_ids: Vec<String>,
        profile: String,
        #[serde(rename = "loudnessTarget")]
        loudness_target: String,
        #[serde(rename = "normalizeLoudness")]
        normalize_loudness: bool,
    },
    #[serde(rename = "export")]
    Export {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "projectId")]
        project_id: String,
        formats: Vec<String>,
        #[serde(rename = "includeQc")]
        include_qc: bool,
    },
}

impl Job {
    pub fn job_id(&self) -> &str {
        match self {
            Job::Analyze { job_id, .. } => job_id,
            Job::Fix { job_id, .. } => job_id,
            Job::Master { job_id, .. } => job_id,
            Job::AlbumMaster { job_id, .. } => job_id,
            Job::Export { job_id, .. } => job_id,
        }
    }
}

/// Audio buffer for processing
#[derive(Debug, Clone)]
pub struct AudioBuffer {
    pub samples: Vec<Vec<f32>>, // Channel-interleaved samples
    pub sample_rate: u32,
    pub channels: usize,
}

impl AudioBuffer {
    pub fn new(channels: usize, sample_rate: u32) -> Self {
        Self {
            samples: vec![Vec::new(); channels],
            sample_rate,
            channels,
        }
    }

    pub fn duration_secs(&self) -> f64 {
        if self.samples.is_empty() || self.samples[0].is_empty() {
            return 0.0;
        }
        self.samples[0].len() as f64 / self.sample_rate as f64
    }

    pub fn frame_count(&self) -> usize {
        if self.samples.is_empty() {
            0
        } else {
            self.samples[0].len()
        }
    }
}

/// Analysis results
#[derive(Debug, Clone, Serialize)]
pub struct AnalysisResult {
    pub integrated_lufs: f64,
    pub loudness_range: f64,
    pub short_term_max: f64,
    pub momentary_max: f64,
    pub sample_peak: f64,
    pub true_peak: f64,
    pub spectral_centroid: Option<f64>,
    pub spectral_rolloff: Option<f64>,
    pub stereo_correlation: Option<f64>,
    pub stereo_width: Option<f64>,
    pub has_clipping: bool,
    pub has_dc_offset: bool,
    pub dc_offset_value: Option<f64>,
    pub clipped_samples: usize,
    pub sample_rate: u32,
    pub bit_depth: u32,
    pub channels: usize,
    pub duration_secs: f64,
}

/// Fix operation result
#[derive(Debug, Clone, Serialize)]
pub struct FixChange {
    pub module: String,
    pub description: String,
}

/// Mastering profile
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MasterProfile {
    Balanced,
    Warm,
    Punchy,
    Custom,
}

impl From<&str> for MasterProfile {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "warm" => Self::Warm,
            "punchy" => Self::Punchy,
            "custom" => Self::Custom,
            _ => Self::Balanced,
        }
    }
}

/// Loudness target
#[derive(Debug, Clone, Copy)]
pub enum LoudnessTarget {
    Low,    // -14 LUFS
    Medium, // -11 LUFS
    High,   // -8 LUFS
}

impl LoudnessTarget {
    pub fn lufs_value(&self) -> f64 {
        match self {
            Self::Low => -14.0,
            Self::Medium => -11.0,
            Self::High => -8.0,
        }
    }
}

impl From<&str> for LoudnessTarget {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "low" => Self::Low,
            "high" => Self::High,
            _ => Self::Medium,
        }
    }
}

/// QC thresholds
pub const QC_TRUE_PEAK_MAX: f64 = -2.0; // dBTP
pub const QC_LOUDNESS_TOLERANCE: f64 = 1.0; // LU
