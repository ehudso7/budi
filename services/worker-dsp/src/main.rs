use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::env;

// Job definitions mirror those in @masterforge/contracts.
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
enum Job {
    #[serde(rename = "analyze")]
    Analyze { trackId: String, sourceUrl: String },
    #[serde(rename = "fix")]
    Fix { trackId: String, sourceUrl: String, modules: Vec<String> },
    #[serde(rename = "master")]
    Master { trackId: String, sourceUrl: String, profile: String },
    #[serde(rename = "codec-preview")]
    CodecPreview { trackId: String, masterUrl: String, codecs: Vec<String> },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Connect to Redis using environment variables or defaults
    let redis_host = env::var("REDIS_HOST").unwrap_or_else(|_| "localhost".into());
    let redis_port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".into());
    let redis_url = format!("redis://{}:{}", redis_host, redis_port);
    let client = redis::Client::open(redis_url)?;
    let mut conn = client.get_async_connection().await?;

    println!("worker-dsp is running and waiting for jobs...");
    // Main worker loop
    loop {
        // brpop returns a tuple (key, value) when an element is popped
        let result: Option<(String, String)> = conn.brpop("jobs", 0).await?;
        if let Some((_queue, payload)) = result {
            match serde_json::from_str::<Job>(&payload) {
                Ok(Job::Analyze { trackId, sourceUrl }) => {
                    println!("[worker-dsp] Analyze job for {} at {}", trackId, sourceUrl);
                    // TODO: download file from sourceUrl, compute loudness and true peak
                    // and store results in database or push a report.
                }
                Ok(Job::Fix { trackId, sourceUrl, modules }) => {
                    println!("[worker-dsp] Fix job for {} with modules {:?}", trackId, modules);
                    // TODO: run fix modules sequentially on audio
                }
                Ok(Job::Master { trackId, sourceUrl, profile }) => {
                    println!("[worker-dsp] Master job for {} using profile {}", trackId, profile);
                    // TODO: apply mastering chain and upload mastered file
                }
                Ok(Job::CodecPreview { trackId, masterUrl, codecs }) => {
                    println!("[worker-dsp] Codec preview job for {} with codecs {:?}", trackId, codecs);
                    // TODO: simulate encoding for each codec and upload previews
                }
                Err(err) => {
                    eprintln!("[worker-dsp] Failed to parse job: {:?}", err);
                }
            }
        }
    }
}