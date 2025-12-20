//! Budi DSP Worker - Audio analysis, fixing, and mastering
//!
//! This worker processes audio jobs from a Redis queue:
//! - Analyze: Compute loudness, peaks, spectral metrics
//! - Fix: Apply repair operations (normalize, clip repair, etc.)
//! - Master: Apply mastering chain (EQ, compression, limiting)
//! - Album Master: Master multiple tracks with consistent loudness

mod analysis;
mod audio;
mod fix;
mod mastering;
mod s3;
mod types;
mod webhook;

use anyhow::Result;
use redis::AsyncCommands;
use std::env;
use tempfile::TempDir;
use tracing::{error, info, warn};

use crate::s3::S3Client;
use crate::types::{Job, LoudnessTarget, MasterProfile};
use crate::webhook::WebhookClient;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("worker_dsp=info".parse()?)
                .add_directive("warn".parse()?),
        )
        .init();

    info!("Budi DSP Worker starting...");

    // Connect to Redis
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    let client = redis::Client::open(redis_url)?;
    let mut conn = client.get_multiplexed_async_connection().await?;

    // Initialize S3 client
    let s3 = S3Client::from_env().await?;

    // Initialize webhook client
    let webhook = WebhookClient::from_env()?;

    // Queue name for DSP jobs
    let queue = env::var("DSP_QUEUE").unwrap_or_else(|_| "dsp-jobs".to_string());

    info!("Listening for jobs on queue: {}", queue);

    // Main worker loop
    loop {
        // Block until a job is available (0 = block forever)
        let result: Option<(String, String)> = conn.brpop(&queue, 0.0).await?;

        if let Some((_key, payload)) = result {
            match serde_json::from_str::<Job>(&payload) {
                Ok(job) => {
                    let job_id = job.job_id().to_string();
                    info!(
                        "Processing job: {} (type: {:?})",
                        job_id,
                        std::mem::discriminant(&job)
                    );

                    if let Err(e) = process_job(&job, &s3, &webhook).await {
                        error!("Job {} failed: {:?}", job_id, e);
                        let job_type = match &job {
                            Job::Analyze { .. } => "analysis",
                            Job::Fix { .. } => "fix",
                            Job::Master { .. } => "master",
                            Job::AlbumMaster { .. } => "album-master",
                            Job::Export { .. } => "export",
                        };
                        if let Err(we) = webhook
                            .report_failure(&job_id, job_type, &e.to_string())
                            .await
                        {
                            error!("Failed to report job failure: {:?}", we);
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to parse job: {:?}", e);
                    warn!("Payload was: {}", payload);
                }
            }
        }
    }
}

/// Process a single job
async fn process_job(job: &Job, s3: &S3Client, webhook: &WebhookClient) -> Result<()> {
    match job {
        Job::Analyze {
            job_id,
            track_id,
            source_url,
        } => process_analyze_job(job_id, track_id, source_url, s3, webhook).await,
        Job::Fix {
            job_id,
            track_id,
            source_url,
            modules,
        } => process_fix_job(job_id, track_id, source_url, modules, s3, webhook).await,
        Job::Master {
            job_id,
            track_id,
            source_url,
            profile,
            loudness_target,
        } => {
            process_master_job(
                job_id,
                track_id,
                source_url,
                profile,
                loudness_target,
                s3,
                webhook,
            )
            .await
        }
        Job::AlbumMaster { job_id, .. } => {
            // Album master is handled by orchestrating individual master jobs
            info!("Album master job {} - delegating to API", job_id);
            Ok(())
        }
        Job::Export { job_id, .. } => {
            // Export is handled separately
            info!("Export job {} - delegating to API", job_id);
            Ok(())
        }
    }
}

/// Process an analyze job
async fn process_analyze_job(
    job_id: &str,
    track_id: &str,
    source_url: &str,
    s3: &S3Client,
    webhook: &WebhookClient,
) -> Result<()> {
    info!("Analyzing track {}", track_id);
    webhook
        .report_progress(job_id, 10, "Downloading audio file...")
        .await?;

    // Create temp directory for processing
    let temp_dir = TempDir::new()?;
    let input_path = temp_dir.path().join("input.wav");

    // Download the source file
    s3.download_file(source_url, &input_path).await?;
    webhook
        .report_progress(job_id, 30, "Decoding audio...")
        .await?;

    // Read and decode the audio file
    let buffer = audio::read_audio_file(&input_path)?;
    webhook
        .report_progress(job_id, 50, "Analyzing loudness and peaks...")
        .await?;

    // Analyze the audio
    let bit_depth = 24; // Assume 24-bit for analysis
    let result = analysis::analyze_audio(&buffer, bit_depth)?;
    webhook
        .report_progress(job_id, 80, "Generating report...")
        .await?;

    // Generate JSON report
    let report_json = serde_json::to_string_pretty(&result)?;
    let report_key = S3Client::generate_key("reports", track_id, "analysis.json");
    let report_url = s3
        .upload_bytes(report_json.as_bytes(), &report_key, "application/json")
        .await?;

    webhook
        .report_progress(job_id, 100, "Analysis complete")
        .await?;

    // Report results to API
    webhook
        .report_analysis(job_id, &result, Some(&report_url))
        .await?;

    info!(
        "Analysis complete for {}: {:.1} LUFS, {:.1} dBTP",
        track_id, result.integrated_lufs, result.true_peak
    );

    Ok(())
}

/// Process a fix job
async fn process_fix_job(
    job_id: &str,
    track_id: &str,
    source_url: &str,
    modules: &[String],
    s3: &S3Client,
    webhook: &WebhookClient,
) -> Result<()> {
    info!("Fixing track {} with modules: {:?}", track_id, modules);
    webhook
        .report_progress(job_id, 10, "Downloading audio file...")
        .await?;

    let temp_dir = TempDir::new()?;
    let input_path = temp_dir.path().join("input.wav");
    let output_path = temp_dir.path().join("fixed.wav");

    // Download the source file
    s3.download_file(source_url, &input_path).await?;
    webhook
        .report_progress(job_id, 30, "Applying fixes...")
        .await?;

    // Read audio
    let mut buffer = audio::read_audio_file(&input_path)?;

    // Apply fixes
    let changes = fix::apply_fixes(&mut buffer, modules)?;
    webhook
        .report_progress(job_id, 70, "Encoding output...")
        .await?;

    // Write fixed audio
    audio::write_wav_file(&buffer, &output_path, 24)?;

    // Upload fixed file
    let output_key = S3Client::generate_key("fixed", track_id, "fixed.wav");
    let fixed_url = s3
        .upload_file(&output_path, &output_key, "audio/wav")
        .await?;

    webhook.report_progress(job_id, 100, "Fix complete").await?;

    // Report results
    webhook.report_fix(job_id, &fixed_url, &changes).await?;

    info!(
        "Fix complete for {}: {} changes applied",
        track_id,
        changes.len()
    );

    Ok(())
}

/// Process a master job
async fn process_master_job(
    job_id: &str,
    track_id: &str,
    source_url: &str,
    profile: &str,
    loudness_target: &str,
    s3: &S3Client,
    webhook: &WebhookClient,
) -> Result<()> {
    info!(
        "Mastering track {} with profile {} and target {}",
        track_id, profile, loudness_target
    );
    webhook
        .report_progress(job_id, 5, "Downloading audio file...")
        .await?;

    let temp_dir = TempDir::new()?;
    let input_path = temp_dir.path().join("input.wav");
    let output_hd_path = temp_dir.path().join("master_24bit.wav");
    let output_16_path = temp_dir.path().join("master_16bit.wav");
    let output_mp3_path = temp_dir.path().join("master.mp3");

    // Download the source file
    s3.download_file(source_url, &input_path).await?;
    webhook
        .report_progress(job_id, 15, "Decoding audio...")
        .await?;

    // Read audio
    let mut buffer = audio::read_audio_file(&input_path)?;
    webhook
        .report_progress(job_id, 25, "Applying EQ...")
        .await?;

    // Apply mastering chain
    let master_profile = MasterProfile::from(profile);
    let target = LoudnessTarget::from(loudness_target);

    webhook
        .report_progress(job_id, 40, "Applying compression...")
        .await?;
    webhook
        .report_progress(job_id, 55, "Applying limiter...")
        .await?;

    let result = mastering::apply_mastering(&mut buffer, master_profile, target)?;
    webhook
        .report_progress(job_id, 70, "Encoding outputs...")
        .await?;

    // Write 24-bit WAV
    audio::write_wav_file(&buffer, &output_hd_path, 24)?;
    webhook
        .report_progress(job_id, 80, "Encoding 16-bit WAV...")
        .await?;

    // Write 16-bit WAV
    audio::write_wav_file(&buffer, &output_16_path, 16)?;
    webhook
        .report_progress(job_id, 85, "Encoding MP3...")
        .await?;

    // Write MP3
    audio::write_mp3_file(&buffer, &output_mp3_path, 320)?;
    webhook
        .report_progress(job_id, 90, "Uploading files...")
        .await?;

    // Upload all files
    let hd_key = S3Client::generate_key("masters", track_id, "master_24bit.wav");
    let wav_hd_url = s3
        .upload_file(&output_hd_path, &hd_key, "audio/wav")
        .await?;

    let key_16 = S3Client::generate_key("masters", track_id, "master_16bit.wav");
    let wav_16_url = s3
        .upload_file(&output_16_path, &key_16, "audio/wav")
        .await?;

    let mp3_key = S3Client::generate_key("masters", track_id, "master.mp3");
    let mp3_url = s3
        .upload_file(&output_mp3_path, &mp3_key, "audio/mpeg")
        .await?;

    // Generate QC report
    let qc_report = serde_json::json!({
        "trackId": track_id,
        "profile": profile,
        "loudnessTarget": loudness_target,
        "finalLufs": result.final_lufs,
        "finalTruePeak": result.final_true_peak,
        "passesQc": result.passes_qc,
        "qcGate": {
            "truePeakMax": -2.0,
            "truePeakActual": result.final_true_peak,
            "truePeakPasses": result.final_true_peak <= -2.0
        }
    });
    let qc_key = S3Client::generate_key("reports", track_id, "qc.json");
    let qc_url = s3
        .upload_bytes(
            serde_json::to_string_pretty(&qc_report)?.as_bytes(),
            &qc_key,
            "application/json",
        )
        .await?;

    webhook
        .report_progress(job_id, 100, "Mastering complete")
        .await?;

    // Report results
    webhook
        .report_master(
            job_id,
            &wav_hd_url,
            &wav_16_url,
            &mp3_url,
            result.final_lufs,
            result.final_true_peak,
            result.passes_qc,
            Some(&qc_url),
        )
        .await?;

    info!(
        "Mastering complete for {}: {:.1} LUFS, {:.1} dBTP, QC: {}",
        track_id,
        result.final_lufs,
        result.final_true_peak,
        if result.passes_qc { "PASS" } else { "FAIL" }
    );

    Ok(())
}
