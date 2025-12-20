# Budi

**AI-powered audio mastering and quality control platform**

Budi is a comprehensive audio mastering system that uses intelligent DSP algorithms to analyze, fix, and master audio tracks. It provides professional-grade loudness normalization, true peak limiting, and codec preview capabilities.

## Features

- **Audio Analysis**: ITU-R BS.1770 loudness measurement (LUFS, LRA), true peak detection with 4x oversampling, spectral analysis, clipping detection
- **Automatic Fixes**: Normalize, clip repair, de-essing, noise reduction, DC offset removal, silence trimming
- **AI Mastering**: 3-band EQ with genre profiles, multiband compression, saturation, brick-wall limiter with -2.0 dBTP ceiling
- **Album Mastering**: Batch processing with ±1 LU loudness normalization across tracks
- **Codec Preview**: AAC/MP3/Opus encoding with true peak delta and artifact scoring
- **QC Reports**: Automated quality control with loudness and peak compliance checking
- **Mobile Apps**: iOS and Android native apps for project management and playback

## Architecture

```
├── apps/
│   ├── mobile-ios/          # Swift/SwiftUI iOS app
│   └── mobile-android/      # Kotlin/Jetpack Compose Android app
├── packages/
│   └── contracts/           # Shared TypeScript types and job definitions
├── services/
│   ├── api/                 # Fastify REST API with Prisma ORM
│   ├── worker-dsp/          # Rust DSP worker (analysis, fix, mastering)
│   └── worker-codec/        # Rust codec worker (FFmpeg encoding)
└── infra/
    └── docker-compose.yml   # Local development infrastructure
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Rust 1.75+
- Docker & Docker Compose

### Development Setup

```bash
# Clone the repository
git clone https://github.com/ehudso7/Budi.git
cd Budi

# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis, MinIO)
pnpm infra:up

# Run database migrations
pnpm --filter api prisma migrate deploy

# Start all services in development mode
pnpm dev
```

The API will be available at `http://localhost:3000`.

### Docker Deployment

```bash
# Build and start all services
cd infra
docker compose up -d --build

# View logs
docker compose logs -f

# Stop services
docker compose down
```

## API Reference

### Authentication

```bash
# Register/login (returns JWT token)
POST /v1/auth/register
Content-Type: application/json
{"email": "user@example.com"}

# Get current user
GET /v1/auth/me
Authorization: Bearer <token>
```

### Projects

```bash
# Create project
POST /v1/projects
Authorization: Bearer <token>
{"name": "My Album", "type": "album"}

# List projects
GET /v1/projects
Authorization: Bearer <token>

# Get project details
GET /v1/projects/:id
Authorization: Bearer <token>
```

### Tracks

```bash
# Get upload URL
POST /v1/projects/:projectId/tracks/upload-url
Authorization: Bearer <token>

# Import track after upload
POST /v1/projects/:projectId/tracks/import
Authorization: Bearer <token>
{"name": "track.wav", "key": "uploads/..."}

# Analyze track
POST /v1/tracks/:id/analyze
Authorization: Bearer <token>

# Fix track issues
POST /v1/tracks/:id/fix
Authorization: Bearer <token>

# Master track
POST /v1/tracks/:id/master
Authorization: Bearer <token>
{"profile": "balanced", "loudnessTarget": "streaming"}

# Create codec preview
POST /v1/tracks/:id/codec-preview
Authorization: Bearer <token>
{"codec": "aac", "bitrate": 256}
```

### Album Mastering

```bash
# Master entire album (normalizes loudness across tracks)
POST /v1/projects/:projectId/album-master
Authorization: Bearer <token>
{"profile": "balanced", "loudnessTarget": "streaming"}
```

### Jobs

```bash
# List jobs
GET /v1/jobs
Authorization: Bearer <token>

# Get job status
GET /v1/jobs/:id
Authorization: Bearer <token>
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `S3_ENDPOINT` | S3/MinIO endpoint URL | - |
| `S3_ACCESS_KEY` | S3 access key | - |
| `S3_SECRET_KEY` | S3 secret key | - |
| `S3_BUCKET` | S3 bucket name | `budi` |
| `JWT_SECRET` | Secret for JWT signing | - |
| `API_WEBHOOK_URL` | URL for worker callbacks | - |

## Mastering Profiles

| Profile | Description |
|---------|-------------|
| `gentle` | Minimal processing, preserves dynamics |
| `balanced` | Standard mastering for most genres |
| `aggressive` | Heavy compression, louder output |

## Loudness Targets

| Target | LUFS | Use Case |
|--------|------|----------|
| `streaming` | -14 LUFS | Spotify, Apple Music |
| `cd` | -11 LUFS | CD mastering |
| `club` | -8 LUFS | DJ/Club tracks |

## Quality Control

All masters are validated against:
- **True Peak**: Maximum -2.0 dBTP
- **Loudness**: ±1.0 LU of target

QC reports include pass/fail status and specific measurements.

## Testing

```bash
# Run API integration tests
pnpm --filter api test

# Run Rust tests
cd services/worker-dsp && cargo test
cd services/worker-codec && cargo test
```

## Mobile Apps

### iOS

Open `apps/mobile-ios/Budi.xcodeproj` in Xcode and build for your target device.

### Android

Open `apps/mobile-android` in Android Studio and run on your device or emulator.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.
