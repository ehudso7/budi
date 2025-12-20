#!/bin/sh
set -e

# Configure alias for local MinIO
mc alias set local http://minio:9000 minioadmin minioadmin

# Create buckets if they do not exist
mc mb -p local/audio || true
mc mb -p local/exports || true

# Optional: set buckets to allow anonymous read (disabled by default)
# mc anonymous set download local/audio
# mc anonymous set download local/exports

echo "MinIO buckets ready: audio, exports"