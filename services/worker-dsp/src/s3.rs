//! S3/MinIO file operations

use anyhow::{Context, Result};
use aws_sdk_s3::{
    config::{Credentials, Region},
    primitives::ByteStream,
    Client,
};
use bytes::Bytes;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

/// S3 client wrapper
pub struct S3Client {
    client: Client,
    bucket: String,
}

impl S3Client {
    /// Create a new S3 client from environment variables
    pub async fn from_env() -> Result<Self> {
        let endpoint =
            std::env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());
        let access_key =
            std::env::var("MINIO_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string());
        let secret_key =
            std::env::var("MINIO_SECRET_KEY").unwrap_or_else(|_| "minioadmin".to_string());
        let bucket = std::env::var("MINIO_BUCKET_AUDIO").unwrap_or_else(|_| "audio".to_string());

        let credentials = Credentials::new(access_key, secret_key, None, None, "environment");

        let config = aws_sdk_s3::Config::builder()
            .endpoint_url(&endpoint)
            .region(Region::new("us-east-1"))
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();

        let client = Client::from_conf(config);

        Ok(Self { client, bucket })
    }

    /// Download a file from S3 to a local path
    pub async fn download_file(&self, url: &str, local_path: &Path) -> Result<()> {
        // Parse the URL to get bucket and key
        let (bucket, key) = parse_s3_url(url)?;

        tracing::info!(
            "Downloading from s3://{}/{} to {:?}",
            bucket,
            key,
            local_path
        );

        let response = self
            .client
            .get_object()
            .bucket(&bucket)
            .key(&key)
            .send()
            .await
            .context("Failed to get object from S3")?;

        let body = response.body.collect().await?;
        let bytes = body.into_bytes();

        tokio::fs::write(local_path, bytes)
            .await
            .context("Failed to write file")?;

        Ok(())
    }

    /// Upload a file from local path to S3
    pub async fn upload_file(
        &self,
        local_path: &Path,
        key: &str,
        content_type: &str,
    ) -> Result<String> {
        tracing::info!("Uploading {:?} to s3://{}/{}", local_path, self.bucket, key);

        let mut file = File::open(local_path)
            .await
            .context("Failed to open file for upload")?;

        let mut contents = Vec::new();
        file.read_to_end(&mut contents)
            .await
            .context("Failed to read file")?;

        let body = ByteStream::from(Bytes::from(contents));

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(body)
            .content_type(content_type)
            .send()
            .await
            .context("Failed to upload to S3")?;

        // Return the full URL
        let endpoint =
            std::env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());
        Ok(format!("{}/{}/{}", endpoint, self.bucket, key))
    }

    /// Upload bytes directly to S3
    pub async fn upload_bytes(&self, data: &[u8], key: &str, content_type: &str) -> Result<String> {
        tracing::info!(
            "Uploading {} bytes to s3://{}/{}",
            data.len(),
            self.bucket,
            key
        );

        let body = ByteStream::from(Bytes::from(data.to_vec()));

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(body)
            .content_type(content_type)
            .send()
            .await
            .context("Failed to upload to S3")?;

        let endpoint =
            std::env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());
        Ok(format!("{}/{}/{}", endpoint, self.bucket, key))
    }

    /// Generate a unique key for a file
    pub fn generate_key(prefix: &str, track_id: &str, suffix: &str) -> String {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        format!("{}/{}/{}-{}", prefix, track_id, timestamp, suffix)
    }
}

/// Parse an S3 URL to extract bucket and key
fn parse_s3_url(url: &str) -> Result<(String, String)> {
    // Handle both http://minio:9000/bucket/key and s3://bucket/key formats
    if let Some(stripped) = url.strip_prefix("s3://") {
        let parts: Vec<&str> = stripped.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
    }

    // HTTP URL format: http://host:port/bucket/key
    if url.starts_with("http://") || url.starts_with("https://") {
        let url_parsed = url::Url::parse(url).context("Invalid URL")?;
        let path = url_parsed.path().trim_start_matches('/');
        let parts: Vec<&str> = path.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
    }

    anyhow::bail!("Could not parse S3 URL: {}", url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_s3_url() {
        let (bucket, key) = parse_s3_url("http://localhost:9000/audio/tracks/test.wav").unwrap();
        assert_eq!(bucket, "audio");
        assert_eq!(key, "tracks/test.wav");

        let (bucket, key) = parse_s3_url("s3://audio/tracks/test.wav").unwrap();
        assert_eq!(bucket, "audio");
        assert_eq!(key, "tracks/test.wav");
    }
}
