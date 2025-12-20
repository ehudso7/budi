use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::env;

// Job variant for codec preview. Other variants are ignored.
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
enum Job {
    #[serde(rename = "codec-preview")]
    CodecPreview {
        trackId: String,
        masterUrl: String,
        codecs: Vec<String>,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let redis_host = env::var("REDIS_HOST").unwrap_or_else(|_| "localhost".into());
    let redis_port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".into());
    let redis_url = format!("redis://{}:{}", redis_host, redis_port);
    let client = redis::Client::open(redis_url)?;
    let mut conn = client.get_async_connection().await?;

    println!("worker-codec is running and waiting for codec-preview jobs...");
    loop {
        let result: Option<(String, String)> = conn.brpop("jobs", 0).await?;
        if let Some((_queue, payload)) = result {
            match serde_json::from_str::<Job>(&payload) {
                Ok(Job::CodecPreview { trackId, masterUrl, codecs }) => {
                    println!(
                        "[worker-codec] Codec preview job for {} with {:?} on {}",
                        trackId, codecs, masterUrl
                    );
                    // TODO: implement codec preview simulation
                }
                Err(_) => {
                    // Ignore other job types for now
                }
            }
        }
    }
}