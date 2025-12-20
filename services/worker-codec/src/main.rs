//! Budi Codec Preview Worker - Audio codec quality testing
//!
//! This worker processes codec preview jobs:
//! - Transcodes audio to various lossy codecs (AAC, MP3, Opus)
//! - Measures true peak after encode/decode cycle
//! - Calculates artifact score to estimate quality loss
//! - Detects potential clipping risk

use anyhow::{Context, Result};
use aws_sdk_s3::{
    config::{Credentials, Region},
    primitives::ByteStream,
    Client,
};
use bytes::Bytes;
use redis::AsyncCommands;
use reqwest::Client as HttpClient;
use rubato::{FftFixedIn, Resampler};
use serde::{Deserialize, Serialize};
use std::env;
use std::path::Path;
use std::process::Command;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tempfile::TempDir;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tracing::{error, info, warn};

/// Job definition for codec preview
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum Job {
    #[serde(rename = "codec-preview")]
    CodecPreview {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "masterUrl")]
        master_url: String,
        codecs: Vec<String>,
    },
}

/// Codec preview result
#[derive(Debug, Clone, Serialize)]
struct CodecPreviewResult {
    codec: String,
    preview_url: String,
    true_peak_after: f64,
    artifact_score: f64,
    clipping_risk: bool,
}

/// Audio buffer for processing
struct AudioBuffer {
    samples: Vec<Vec<f32>>,
    sample_rate: u32,
    channels: usize,
}

impl AudioBuffer {
    fn frame_count(&self) -> usize {
        if self.samples.is_empty() {
            0
        } else {
            self.samples[0].len()
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("worker_codec=info".parse()?)
                .add_directive("warn".parse()?),
        )
        .init();

    info!("Budi Codec Preview Worker starting...");

    // Connect to Redis
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    let client = redis::Client::open(redis_url)?;
    let mut conn = client.get_multiplexed_async_connection().await?;

    // Queue name for codec jobs
    let queue = env::var("CODEC_QUEUE").unwrap_or_else(|_| "codec-jobs".to_string());

    info!("Listening for jobs on queue: {}", queue);

    // Main worker loop
    loop {
        let result: Option<(String, String)> = conn.brpop(&queue, 0.0).await?;

        if let Some((_key, payload)) = result {
            match serde_json::from_str::<Job>(&payload) {
                Ok(Job::CodecPreview {
                    job_id,
                    track_id,
                    master_url,
                    codecs,
                }) => {
                    info!(
                        "Processing codec preview job {} for track {}",
                        job_id, track_id
                    );

                    if let Err(e) =
                        process_codec_preview(&job_id, &track_id, &master_url, &codecs).await
                    {
                        error!("Job {} failed: {:?}", job_id, e);
                        report_failure(&job_id, &e.to_string()).await.ok();
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

/// Process a codec preview job
async fn process_codec_preview(
    job_id: &str,
    track_id: &str,
    master_url: &str,
    codecs: &[String],
) -> Result<()> {
    report_progress(job_id, 5, "Downloading master file...").await?;

    let temp_dir = TempDir::new()?;
    let input_path = temp_dir.path().join("master.wav");

    // Download the master file
    download_file(master_url, &input_path).await?;
    report_progress(job_id, 15, "Reading audio...").await?;

    // Read the original audio for comparison
    let original = read_audio_file(&input_path)?;

    let mut results = Vec::new();
    let codec_count = codecs.len();

    for (i, codec) in codecs.iter().enumerate() {
        let progress = 20 + (i * 60 / codec_count.max(1));
        report_progress(job_id, progress as u8, &format!("Processing {}...", codec)).await?;

        let result =
            process_single_codec(&temp_dir, &input_path, &original, codec, track_id).await?;

        results.push(result);
    }

    report_progress(job_id, 95, "Reporting results...").await?;

    // Report results
    report_codec_results(job_id, &results).await?;

    report_progress(job_id, 100, "Codec preview complete").await?;

    info!(
        "Codec preview complete for {}: {} codecs tested",
        track_id,
        results.len()
    );

    Ok(())
}

/// Process a single codec
async fn process_single_codec(
    temp_dir: &TempDir,
    input_path: &Path,
    original: &AudioBuffer,
    codec: &str,
    track_id: &str,
) -> Result<CodecPreviewResult> {
    let output_path = temp_dir.path().join(format!("preview_{}.audio", codec));
    let decoded_path = temp_dir.path().join(format!("decoded_{}.wav", codec));

    // Parse codec format
    let (format, bitrate) = parse_codec(codec)?;

    // Encode using FFmpeg
    encode_with_ffmpeg(input_path, &output_path, &format, bitrate)?;

    // Decode back to WAV for analysis
    decode_with_ffmpeg(&output_path, &decoded_path)?;

    // Read decoded audio
    let decoded = read_audio_file(&decoded_path)?;

    // Calculate true peak of decoded audio
    let true_peak = calculate_true_peak(&decoded)?;

    // Calculate artifact score (difference from original)
    let artifact_score = calculate_artifact_score(original, &decoded)?;

    // Check clipping risk
    let clipping_risk = true_peak > -0.5;

    // Upload preview file
    let preview_url = upload_file(&output_path, track_id, codec).await?;

    Ok(CodecPreviewResult {
        codec: codec.to_string(),
        preview_url,
        true_peak_after: true_peak,
        artifact_score,
        clipping_risk,
    })
}

/// Parse codec string (e.g., "aac-128" -> ("aac", 128))
fn parse_codec(codec: &str) -> Result<(String, u32)> {
    let parts: Vec<&str> = codec.split('-').collect();
    if parts.len() != 2 {
        anyhow::bail!("Invalid codec format: {}", codec);
    }
    let format = parts[0].to_string();
    let bitrate = parts[1].parse::<u32>().context("Invalid bitrate")?;
    Ok((format, bitrate))
}

/// Encode audio using FFmpeg
fn encode_with_ffmpeg(input: &Path, output: &Path, format: &str, bitrate: u32) -> Result<()> {
    let bitrate_str = format!("{}k", bitrate);
    let codec_args: Vec<&str> = match format {
        "aac" => vec!["-c:a", "aac", "-b:a", &bitrate_str],
        "mp3" => vec!["-c:a", "libmp3lame", "-b:a", &bitrate_str],
        "opus" => vec!["-c:a", "libopus", "-b:a", &bitrate_str],
        _ => anyhow::bail!("Unsupported codec: {}", format),
    };

    let extension = match format {
        "aac" => "m4a",
        "mp3" => "mp3",
        "opus" => "ogg",
        _ => "audio",
    };

    let output_with_ext = output.with_extension(extension);

    let status = Command::new("ffmpeg")
        .args(["-i", input.to_str().unwrap()])
        .args(&codec_args)
        .args(["-y", output_with_ext.to_str().unwrap()])
        .output()
        .context("Failed to run FFmpeg")?;

    if !status.status.success() {
        anyhow::bail!(
            "FFmpeg encoding failed: {}",
            String::from_utf8_lossy(&status.stderr)
        );
    }

    // Rename to expected output path
    std::fs::rename(&output_with_ext, output)?;

    Ok(())
}

/// Decode audio back to WAV using FFmpeg
fn decode_with_ffmpeg(input: &Path, output: &Path) -> Result<()> {
    let status = Command::new("ffmpeg")
        .args([
            "-i",
            input.to_str().unwrap(),
            "-c:a",
            "pcm_s24le",
            "-y",
            output.to_str().unwrap(),
        ])
        .output()
        .context("Failed to run FFmpeg")?;

    if !status.status.success() {
        anyhow::bail!(
            "FFmpeg decoding failed: {}",
            String::from_utf8_lossy(&status.stderr)
        );
    }

    Ok(())
}

/// Read an audio file using Symphonia
fn read_audio_file(path: &Path) -> Result<AudioBuffer> {
    let file = std::fs::File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let format_opts = FormatOptions::default();
    let metadata_opts = MetadataOptions::default();
    let probed =
        symphonia::default::get_probe().format(&hint, mss, &format_opts, &metadata_opts)?;

    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .context("No audio track found")?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();
    let sample_rate = codec_params.sample_rate.unwrap_or(44100);
    let channels = codec_params.channels.map(|c| c.count()).unwrap_or(2);

    let decoder_opts = DecoderOptions::default();
    let mut decoder = symphonia::default::get_codecs().make(&codec_params, &decoder_opts)?;

    let mut buffer = AudioBuffer {
        samples: vec![Vec::new(); channels],
        sample_rate,
        channels,
    };

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => return Err(e.into()),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = decoder.decode(&packet)?;
        append_samples(&mut buffer, decoded)?;
    }

    Ok(buffer)
}

/// Append decoded samples to buffer
fn append_samples(buffer: &mut AudioBuffer, decoded: AudioBufferRef) -> Result<()> {
    match decoded {
        AudioBufferRef::F32(buf) => {
            for ch in 0..buffer.channels.min(buf.spec().channels.count()) {
                buffer.samples[ch].extend_from_slice(buf.chan(ch));
            }
        }
        AudioBufferRef::S16(buf) => {
            for ch in 0..buffer.channels.min(buf.spec().channels.count()) {
                buffer.samples[ch].extend(buf.chan(ch).iter().map(|&s| s as f32 / 32768.0));
            }
        }
        AudioBufferRef::S32(buf) => {
            for ch in 0..buffer.channels.min(buf.spec().channels.count()) {
                buffer.samples[ch].extend(buf.chan(ch).iter().map(|&s| s as f32 / 2147483648.0));
            }
        }
        _ => {}
    }
    Ok(())
}

/// Calculate true peak using 4x oversampling
fn calculate_true_peak(buffer: &AudioBuffer) -> Result<f64> {
    let target_rate = buffer.sample_rate * 4;

    let mut resampler = FftFixedIn::<f32>::new(
        buffer.sample_rate as usize,
        target_rate as usize,
        1024,
        2,
        buffer.channels,
    )?;

    let mut max_peak: f32 = 0.0;
    let chunk_size = resampler.input_frames_next();
    let frame_count = buffer.frame_count();

    for start in (0..frame_count).step_by(chunk_size) {
        let end = (start + chunk_size).min(frame_count);

        let chunk: Vec<Vec<f32>> = if end - start < chunk_size {
            buffer
                .samples
                .iter()
                .map(|ch| {
                    let mut c = ch[start..end].to_vec();
                    c.resize(chunk_size, 0.0);
                    c
                })
                .collect()
        } else {
            buffer
                .samples
                .iter()
                .map(|ch| ch[start..end].to_vec())
                .collect()
        };

        if let Ok(output) = resampler.process(&chunk, None) {
            for ch in &output {
                for &sample in ch {
                    let abs = sample.abs();
                    if abs > max_peak {
                        max_peak = abs;
                    }
                }
            }
        }
    }

    Ok(if max_peak > 0.0 {
        20.0 * (max_peak as f64).log10()
    } else {
        -96.0
    })
}

/// Calculate artifact score (0-100, lower is better)
fn calculate_artifact_score(original: &AudioBuffer, decoded: &AudioBuffer) -> Result<f64> {
    let orig_frames = original.frame_count();
    let dec_frames = decoded.frame_count();
    let min_frames = orig_frames.min(dec_frames);

    if min_frames == 0 {
        return Ok(0.0);
    }

    let mut total_error: f64 = 0.0;
    let mut total_energy: f64 = 0.0;

    for ch in 0..original.channels.min(decoded.channels) {
        for i in 0..min_frames {
            let orig = original.samples[ch][i] as f64;
            let dec = decoded.samples[ch][i] as f64;
            let error = (orig - dec).powi(2);
            total_error += error;
            total_energy += orig.powi(2);
        }
    }

    // Normalize error to 0-100 scale
    let snr = if total_error > 0.0 && total_energy > 0.0 {
        10.0 * (total_energy / total_error).log10()
    } else {
        100.0 // Perfect match
    };

    // Convert SNR to artifact score (higher SNR = lower artifact score)
    let artifact_score = ((60.0 - snr) / 60.0 * 100.0).clamp(0.0, 100.0);

    Ok(artifact_score)
}

/// Download file from S3/MinIO
async fn download_file(url: &str, path: &Path) -> Result<()> {
    let endpoint =
        env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let access_key = env::var("MINIO_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string());
    let secret_key = env::var("MINIO_SECRET_KEY").unwrap_or_else(|_| "minioadmin".to_string());

    let credentials = Credentials::new(access_key, secret_key, None, None, "env");
    let config = aws_sdk_s3::Config::builder()
        .endpoint_url(&endpoint)
        .region(Region::new("us-east-1"))
        .credentials_provider(credentials)
        .force_path_style(true)
        .build();

    let client = Client::from_conf(config);

    // Parse URL to get bucket and key
    let url_parsed = url::Url::parse(url)?;
    let path_str = url_parsed.path().trim_start_matches('/');
    let parts: Vec<&str> = path_str.splitn(2, '/').collect();
    if parts.len() != 2 {
        anyhow::bail!("Invalid S3 URL: {}", url);
    }
    let (bucket, key) = (parts[0], parts[1]);

    let response = client.get_object().bucket(bucket).key(key).send().await?;

    let body = response.body.collect().await?;
    tokio::fs::write(path, body.into_bytes()).await?;

    Ok(())
}

/// Upload file to S3/MinIO
async fn upload_file(path: &Path, track_id: &str, codec: &str) -> Result<String> {
    let endpoint =
        env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let access_key = env::var("MINIO_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string());
    let secret_key = env::var("MINIO_SECRET_KEY").unwrap_or_else(|_| "minioadmin".to_string());
    let bucket = env::var("MINIO_BUCKET_AUDIO").unwrap_or_else(|_| "audio".to_string());

    let credentials = Credentials::new(access_key, secret_key, None, None, "env");
    let config = aws_sdk_s3::Config::builder()
        .endpoint_url(&endpoint)
        .region(Region::new("us-east-1"))
        .credentials_provider(credentials)
        .force_path_style(true)
        .build();

    let client = Client::from_conf(config);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis();
    let key = format!("previews/{}/{}-{}", track_id, timestamp, codec);

    let mut file = File::open(path).await?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents).await?;

    let body = ByteStream::from(Bytes::from(contents));

    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(body)
        .content_type("audio/mpeg")
        .send()
        .await?;

    Ok(format!("{}/{}/{}", endpoint, bucket, key))
}

/// Report job progress
async fn report_progress(job_id: &str, progress: u8, message: &str) -> Result<()> {
    let api_url = env::var("API_URL").unwrap_or_else(|_| "http://localhost:4000".to_string());
    let secret = env::var("WEBHOOK_SECRET").unwrap_or_else(|_| "budi-webhook-secret".to_string());

    let client = HttpClient::new();
    client
        .post(format!("{}/webhooks/jobs/{}/progress", api_url, job_id))
        .header("X-Webhook-Secret", &secret)
        .json(&serde_json::json!({
            "progress": progress,
            "message": message
        }))
        .send()
        .await?;

    Ok(())
}

/// Report codec preview results
async fn report_codec_results(job_id: &str, results: &[CodecPreviewResult]) -> Result<()> {
    let api_url = env::var("API_URL").unwrap_or_else(|_| "http://localhost:4000".to_string());
    let secret = env::var("WEBHOOK_SECRET").unwrap_or_else(|_| "budi-webhook-secret".to_string());

    let client = HttpClient::new();
    client
        .post(format!(
            "{}/webhooks/jobs/{}/codec-preview",
            api_url, job_id
        ))
        .header("X-Webhook-Secret", &secret)
        .json(&serde_json::json!({
            "jobId": job_id,
            "type": "codec-preview",
            "status": "completed",
            "data": {
                "previews": results.iter().map(|r| serde_json::json!({
                    "codec": r.codec,
                    "previewUrl": r.preview_url,
                    "truePeakAfter": r.true_peak_after,
                    "artifactScore": r.artifact_score,
                    "clippingRisk": r.clipping_risk
                })).collect::<Vec<_>>()
            }
        }))
        .send()
        .await?;

    Ok(())
}

/// Report job failure
async fn report_failure(job_id: &str, error: &str) -> Result<()> {
    let api_url = env::var("API_URL").unwrap_or_else(|_| "http://localhost:4000".to_string());
    let secret = env::var("WEBHOOK_SECRET").unwrap_or_else(|_| "budi-webhook-secret".to_string());

    let client = HttpClient::new();
    client
        .post(format!(
            "{}/webhooks/jobs/{}/codec-preview",
            api_url, job_id
        ))
        .header("X-Webhook-Secret", &secret)
        .json(&serde_json::json!({
            "jobId": job_id,
            "type": "codec-preview",
            "status": "failed",
            "error": error
        }))
        .send()
        .await?;

    Ok(())
}
