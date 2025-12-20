//! Webhook client for API callbacks

use anyhow::Result;
use reqwest::Client;
use serde::Serialize;

use crate::types::{AnalysisResult, FixChange};

/// Webhook client for reporting job progress and results
pub struct WebhookClient {
    client: Client,
    api_url: String,
    secret: String,
}

impl WebhookClient {
    /// Create a new webhook client from environment variables
    pub fn from_env() -> Result<Self> {
        let api_url =
            std::env::var("API_URL").unwrap_or_else(|_| "http://localhost:4000".to_string());
        let secret =
            std::env::var("WEBHOOK_SECRET").unwrap_or_else(|_| "budi-webhook-secret".to_string());

        Ok(Self {
            client: Client::new(),
            api_url,
            secret,
        })
    }

    /// Report job progress
    pub async fn report_progress(&self, job_id: &str, progress: u8, message: &str) -> Result<()> {
        let url = format!("{}/webhooks/jobs/{}/progress", self.api_url, job_id);

        #[derive(Serialize)]
        struct ProgressPayload {
            progress: u8,
            message: String,
        }

        self.client
            .post(&url)
            .header("X-Webhook-Secret", &self.secret)
            .json(&ProgressPayload {
                progress,
                message: message.to_string(),
            })
            .send()
            .await?;

        Ok(())
    }

    /// Report analysis job completion
    pub async fn report_analysis(
        &self,
        job_id: &str,
        result: &AnalysisResult,
        report_url: Option<&str>,
    ) -> Result<()> {
        let url = format!("{}/webhooks/jobs/{}/analysis", self.api_url, job_id);

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct AnalysisPayload {
            job_id: String,
            #[serde(rename = "type")]
            job_type: String,
            status: String,
            data: AnalysisData,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct AnalysisData {
            integrated_lufs: f64,
            loudness_range: f64,
            short_term_max: f64,
            momentary_max: f64,
            sample_peak: f64,
            true_peak: f64,
            spectral_centroid: Option<f64>,
            spectral_rolloff: Option<f64>,
            stereo_correlation: Option<f64>,
            stereo_width: Option<f64>,
            has_clipping: bool,
            has_dc_offset: bool,
            dc_offset_value: Option<f64>,
            clipped_samples: usize,
            sample_rate: u32,
            bit_depth: u32,
            channels: usize,
            duration_secs: f64,
            report_url: Option<String>,
        }

        let payload = AnalysisPayload {
            job_id: job_id.to_string(),
            job_type: "analyze".to_string(),
            status: "completed".to_string(),
            data: AnalysisData {
                integrated_lufs: result.integrated_lufs,
                loudness_range: result.loudness_range,
                short_term_max: result.short_term_max,
                momentary_max: result.momentary_max,
                sample_peak: result.sample_peak,
                true_peak: result.true_peak,
                spectral_centroid: result.spectral_centroid,
                spectral_rolloff: result.spectral_rolloff,
                stereo_correlation: result.stereo_correlation,
                stereo_width: result.stereo_width,
                has_clipping: result.has_clipping,
                has_dc_offset: result.has_dc_offset,
                dc_offset_value: result.dc_offset_value,
                clipped_samples: result.clipped_samples,
                sample_rate: result.sample_rate,
                bit_depth: result.bit_depth,
                channels: result.channels,
                duration_secs: result.duration_secs,
                report_url: report_url.map(|s| s.to_string()),
            },
        };

        self.client
            .post(&url)
            .header("X-Webhook-Secret", &self.secret)
            .json(&payload)
            .send()
            .await?;

        Ok(())
    }

    /// Report fix job completion
    pub async fn report_fix(
        &self,
        job_id: &str,
        fixed_url: &str,
        changes: &[FixChange],
    ) -> Result<()> {
        let url = format!("{}/webhooks/jobs/{}/fix", self.api_url, job_id);

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct FixPayload {
            job_id: String,
            #[serde(rename = "type")]
            job_type: String,
            status: String,
            data: FixData,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct FixData {
            fixed_url: String,
            applied_modules: Vec<String>,
            changes: Vec<ChangeEntry>,
        }

        #[derive(Serialize)]
        struct ChangeEntry {
            module: String,
            description: String,
        }

        let payload = FixPayload {
            job_id: job_id.to_string(),
            job_type: "fix".to_string(),
            status: "completed".to_string(),
            data: FixData {
                fixed_url: fixed_url.to_string(),
                applied_modules: changes.iter().map(|c| c.module.clone()).collect(),
                changes: changes
                    .iter()
                    .map(|c| ChangeEntry {
                        module: c.module.clone(),
                        description: c.description.clone(),
                    })
                    .collect(),
            },
        };

        self.client
            .post(&url)
            .header("X-Webhook-Secret", &self.secret)
            .json(&payload)
            .send()
            .await?;

        Ok(())
    }

    /// Report master job completion
    pub async fn report_master(
        &self,
        job_id: &str,
        wav_hd_url: &str,
        wav_16_url: &str,
        mp3_url: &str,
        final_lufs: f64,
        final_true_peak: f64,
        passes_qc: bool,
        qc_report_url: Option<&str>,
    ) -> Result<()> {
        let url = format!("{}/webhooks/jobs/{}/master", self.api_url, job_id);

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct MasterPayload {
            job_id: String,
            #[serde(rename = "type")]
            job_type: String,
            status: String,
            data: MasterData,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct MasterData {
            wav_hd_url: String,
            wav16_url: String,
            mp3_preview_url: String,
            final_lufs: f64,
            final_true_peak: f64,
            passes_qc: bool,
            qc_report_url: Option<String>,
        }

        let payload = MasterPayload {
            job_id: job_id.to_string(),
            job_type: "master".to_string(),
            status: "completed".to_string(),
            data: MasterData {
                wav_hd_url: wav_hd_url.to_string(),
                wav16_url: wav_16_url.to_string(),
                mp3_preview_url: mp3_url.to_string(),
                final_lufs,
                final_true_peak,
                passes_qc,
                qc_report_url: qc_report_url.map(|s| s.to_string()),
            },
        };

        self.client
            .post(&url)
            .header("X-Webhook-Secret", &self.secret)
            .json(&payload)
            .send()
            .await?;

        Ok(())
    }

    /// Report job failure
    pub async fn report_failure(&self, job_id: &str, job_type: &str, error: &str) -> Result<()> {
        let url = format!("{}/webhooks/jobs/{}/{}", self.api_url, job_id, job_type);

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct FailurePayload {
            job_id: String,
            #[serde(rename = "type")]
            job_type: String,
            status: String,
            error: String,
        }

        let payload = FailurePayload {
            job_id: job_id.to_string(),
            job_type: job_type.to_string(),
            status: "failed".to_string(),
            error: error.to_string(),
        };

        self.client
            .post(&url)
            .header("X-Webhook-Secret", &self.secret)
            .json(&payload)
            .send()
            .await?;

        Ok(())
    }
}
