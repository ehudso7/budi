// S3/MinIO client for file storage
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

const endpoint = process.env.MINIO_ENDPOINT || "http://localhost:9000";
const accessKeyId = process.env.MINIO_ACCESS_KEY || "minioadmin";
const secretAccessKey = process.env.MINIO_SECRET_KEY || "minioadmin";

export const s3Client = new S3Client({
  endpoint,
  region: "us-east-1", // MinIO requires a region but doesn't use it
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true, // Required for MinIO
});

export const BUCKETS = {
  AUDIO: process.env.MINIO_BUCKET_AUDIO || "audio",
  EXPORTS: process.env.MINIO_BUCKET_EXPORTS || "exports",
} as const;

/**
 * Generate a pre-signed URL for uploading a file
 */
export async function getUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a pre-signed URL for downloading a file
 */
export async function getDownloadUrl(
  bucket: string,
  key: string,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Check if an object exists in S3
 */
export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete an object from S3
 */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

/**
 * Generate a unique key for storing a file
 */
export function generateKey(prefix: string, filename: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = filename.split(".").pop() || "bin";
  return `${prefix}/${timestamp}-${random}.${ext}`;
}

/**
 * Get the public URL for a file (for internal use within Docker network)
 */
export function getInternalUrl(bucket: string, key: string): string {
  return `${endpoint}/${bucket}/${key}`;
}

/**
 * Download a file from S3 to local filesystem
 */
export async function downloadFile(
  sourceUrl: string,
  destPath: string
): Promise<void> {
  // Parse the URL to extract bucket and key
  // Format: http://localhost:9000/bucket/key or s3://bucket/key
  let bucket: string;
  let key: string;

  if (sourceUrl.startsWith('s3://')) {
    const parts = sourceUrl.slice(5).split('/');
    bucket = parts[0];
    key = parts.slice(1).join('/');
  } else {
    // HTTP URL format: http://host:port/bucket/key
    const url = new URL(sourceUrl);
    const pathParts = url.pathname.slice(1).split('/');
    bucket = pathParts[0];
    key = pathParts.slice(1).join('/');
  }

  const { createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`Failed to download file: ${sourceUrl}`);
  }

  // Convert the response body to a Node.js readable stream
  const bodyStream = response.Body as Readable;
  const fileStream = createWriteStream(destPath);

  await pipeline(bodyStream, fileStream);
}

/**
 * Upload a file from local filesystem to S3
 */
export async function uploadFile(
  sourcePath: string,
  bucket: string,
  key: string,
  contentType: string
): Promise<string> {
  const { createReadStream } = await import('node:fs');
  const { stat } = await import('node:fs/promises');

  const fileStats = await stat(sourcePath);
  const fileStream = createReadStream(sourcePath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
    ContentLength: fileStats.size,
  });

  await s3Client.send(command);

  return `${endpoint}/${bucket}/${key}`;
}
