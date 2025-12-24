-- Budi Database Setup SQL
-- Run this in Supabase SQL Editor to create all tables

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');
CREATE TYPE "UsageType" AS ENUM ('TRACK_UPLOAD', 'TRACK_ANALYZE', 'TRACK_MASTER', 'TRACK_EXPORT', 'PROJECT_CREATE', 'API_CALL');
CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID');
CREATE TYPE "DLQStatus" AS ENUM ('PENDING', 'RETRYING', 'EXHAUSTED', 'RESOLVED');
CREATE TYPE "ProjectType" AS ENUM ('SINGLE', 'ALBUM');
CREATE TYPE "ProjectStatus" AS ENUM ('CREATED', 'ANALYZING', 'ANALYZED', 'MASTERING', 'MASTERED', 'EXPORTING', 'EXPORTED', 'FAILED');
CREATE TYPE "TrackStatus" AS ENUM ('UPLOADED', 'ANALYZING', 'ANALYZED', 'FIXING', 'FIXED', 'MASTERING', 'MASTERED', 'FAILED');
CREATE TYPE "MasterProfile" AS ENUM ('BALANCED', 'WARM', 'PUNCHY', 'CUSTOM');
CREATE TYPE "LoudnessTarget" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "JobType" AS ENUM ('ANALYZE', 'FIX', 'MASTER', 'CODEC_PREVIEW', 'ALBUM_MASTER', 'EXPORT');
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'COMPLETED', 'FAILED');
CREATE TYPE "AudioBitDepth" AS ENUM ('BD_16', 'BD_24', 'BD_32F');

-- ============================================================================
-- TABLES
-- ============================================================================

-- User accounts
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "apiKey" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "subscriptionId" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Audit logs
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Usage records
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UsageType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- Plan limits
CREATE TABLE "PlanLimit" (
    "id" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "maxProjects" INTEGER NOT NULL,
    "maxTracksPerMonth" INTEGER NOT NULL,
    "maxStorageGb" INTEGER NOT NULL,
    "priorityQueue" BOOLEAN NOT NULL DEFAULT false,
    "hdExports" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanLimit_pkey" PRIMARY KEY ("id")
);

-- Invoices
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- Device tokens
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- Failed jobs (DLQ)
CREATE TABLE "FailedJob" (
    "id" TEXT NOT NULL,
    "originalJobId" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "status" "DLQStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailedJob_pkey" PRIMARY KEY ("id")
);

-- Projects
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL DEFAULT 'SINGLE',
    "status" "ProjectStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- Tracks
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "fixedUrl" TEXT,
    "status" "TrackStatus" NOT NULL DEFAULT 'UPLOADED',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- Analysis reports
CREATE TABLE "AnalysisReport" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "integratedLufs" DOUBLE PRECISION NOT NULL,
    "loudnessRange" DOUBLE PRECISION NOT NULL,
    "shortTermMax" DOUBLE PRECISION NOT NULL,
    "momentaryMax" DOUBLE PRECISION NOT NULL,
    "samplePeak" DOUBLE PRECISION NOT NULL,
    "truePeak" DOUBLE PRECISION NOT NULL,
    "spectralCentroid" DOUBLE PRECISION,
    "spectralRolloff" DOUBLE PRECISION,
    "stereoCorrelation" DOUBLE PRECISION,
    "stereoWidth" DOUBLE PRECISION,
    "hasClipping" BOOLEAN NOT NULL DEFAULT false,
    "hasDcOffset" BOOLEAN NOT NULL DEFAULT false,
    "dcOffsetValue" DOUBLE PRECISION,
    "clippedSamples" INTEGER NOT NULL DEFAULT 0,
    "sampleRate" INTEGER NOT NULL,
    "bitDepth" INTEGER NOT NULL,
    "channels" INTEGER NOT NULL,
    "durationSecs" DOUBLE PRECISION NOT NULL,
    "reportUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisReport_pkey" PRIMARY KEY ("id")
);

-- Masters
CREATE TABLE "Master" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "profile" "MasterProfile" NOT NULL,
    "loudnessTarget" "LoudnessTarget" NOT NULL,
    "wavHdUrl" TEXT,
    "wav16Url" TEXT,
    "mp3PreviewUrl" TEXT,
    "finalLufs" DOUBLE PRECISION,
    "finalTruePeak" DOUBLE PRECISION,
    "passesQc" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Master_pkey" PRIMARY KEY ("id")
);

-- QC reports
CREATE TABLE "QcReport" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "truePeakPasses" BOOLEAN NOT NULL,
    "truePeakValue" DOUBLE PRECISION NOT NULL,
    "loudnessPasses" BOOLEAN NOT NULL,
    "loudnessValue" DOUBLE PRECISION NOT NULL,
    "lowFreqBalance" DOUBLE PRECISION,
    "midFreqBalance" DOUBLE PRECISION,
    "highFreqBalance" DOUBLE PRECISION,
    "tonalWarnings" TEXT[],
    "overallPass" BOOLEAN NOT NULL DEFAULT false,
    "failureReasons" TEXT[],
    "reportUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QcReport_pkey" PRIMARY KEY ("id")
);

-- Codec previews
CREATE TABLE "CodecPreview" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "codec" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "truePeakAfter" DOUBLE PRECISION,
    "artifactScore" DOUBLE PRECISION,
    "clippingRisk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodecPreview_pkey" PRIMARY KEY ("id")
);

-- Jobs
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "trackId" TEXT,
    "projectId" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "resultUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- Exports
CREATE TABLE "Export" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "formats" TEXT[],
    "includeQc" BOOLEAN NOT NULL DEFAULT true,
    "packUrl" TEXT,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Export_pkey" PRIMARY KEY ("id")
);

-- Export jobs (Release-Ready)
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "bitDepth" "AudioBitDepth" NOT NULL DEFAULT 'BD_24',
    "sampleRate" INTEGER NOT NULL DEFAULT 44100,
    "truePeakCeilingDb" DOUBLE PRECISION NOT NULL DEFAULT -2.0,
    "includeMp3" BOOLEAN NOT NULL DEFAULT true,
    "includeAac" BOOLEAN NOT NULL DEFAULT true,
    "inputSha256" TEXT,
    "outputWavUrl" TEXT,
    "outputMp3Url" TEXT,
    "outputAacUrl" TEXT,
    "qcJsonUrl" TEXT,
    "finalGainDb" DOUBLE PRECISION,
    "finalTruePeakDbfs" DOUBLE PRECISION,
    "finalIntegratedLufs" DOUBLE PRECISION,
    "finalLra" DOUBLE PRECISION,
    "releaseReadyPasses" BOOLEAN,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- UNIQUE CONSTRAINTS
-- ============================================================================

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "PlanLimit_plan_key" ON "PlanLimit"("plan");
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE UNIQUE INDEX "AnalysisReport_trackId_key" ON "AnalysisReport"("trackId");
CREATE UNIQUE INDEX "QcReport_masterId_key" ON "QcReport"("masterId");

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "UsageRecord_userId_type_createdAt_idx" ON "UsageRecord"("userId", "type", "createdAt");
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");
CREATE INDEX "FailedJob_status_nextRetryAt_idx" ON "FailedJob"("status", "nextRetryAt");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "Track_projectId_idx" ON "Track"("projectId");
CREATE INDEX "Master_trackId_idx" ON "Master"("trackId");
CREATE INDEX "CodecPreview_trackId_idx" ON "CodecPreview"("trackId");
CREATE INDEX "Job_trackId_idx" ON "Job"("trackId");
CREATE INDEX "Job_projectId_idx" ON "Job"("projectId");
CREATE INDEX "Job_status_idx" ON "Job"("status");
CREATE INDEX "Export_projectId_idx" ON "Export"("projectId");
CREATE INDEX "ExportJob_trackId_createdAt_idx" ON "ExportJob"("trackId", "createdAt");
CREATE INDEX "ExportJob_status_createdAt_idx" ON "ExportJob"("status", "createdAt");

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Track" ADD CONSTRAINT "Track_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Master" ADD CONSTRAINT "Master_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QcReport" ADD CONSTRAINT "QcReport_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodecPreview" ADD CONSTRAINT "CodecPreview_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Export" ADD CONSTRAINT "Export_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- SEED DATA: Plan Limits
-- ============================================================================

INSERT INTO "PlanLimit" ("id", "plan", "maxProjects", "maxTracksPerMonth", "maxStorageGb", "priorityQueue", "hdExports") VALUES
('plan_free', 'FREE', 3, 10, 1, false, false),
('plan_pro', 'PRO', 25, 100, 25, true, true),
('plan_enterprise', 'ENTERPRISE', 999, 9999, 500, true, true);

-- ============================================================================
-- Done! Your Budi database is ready.
-- ============================================================================
