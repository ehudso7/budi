// S3/MinIO client for file storage
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
