// Request validation schemas using Zod
import { z } from "zod";

// ============================================================================
// Common schemas
// ============================================================================

export const idParamSchema = z.object({
  projectId: z.string().min(1),
});

export const trackIdParamSchema = z.object({
  trackId: z.string().min(1),
});

export const jobIdParamSchema = z.object({
  jobId: z.string().min(1),
});

// ============================================================================
// Project schemas
// ============================================================================

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["single", "album"]).default("single"),
});

// ============================================================================
// Track schemas
// ============================================================================

export const importTrackSchema = z.object({
  name: z.string().min(1).max(255),
  sourceUrl: z.string().url().optional(),
});

export const fixModuleSchema = z.enum([
  "normalize",
  "clip_repair",
  "de_ess",
  "noise_reduction",
  "dc_offset",
  "silence_trim",
]);

export const fixTrackSchema = z.object({
  modules: z.array(fixModuleSchema).min(1),
});

// ============================================================================
// Mastering schemas
// ============================================================================

export const masterProfileSchema = z.enum(["balanced", "warm", "punchy", "custom"]);

export const loudnessTargetSchema = z.enum(["low", "medium", "high"]);

export const masterTrackSchema = z.object({
  profile: masterProfileSchema,
  loudnessTarget: loudnessTargetSchema,
});

// ============================================================================
// Codec preview schemas
// ============================================================================

export const codecFormatSchema = z.enum([
  "aac-128",
  "aac-256",
  "mp3-128",
  "mp3-320",
  "opus-64",
  "opus-96",
  "opus-128",
]);

export const codecPreviewSchema = z.object({
  codecs: z.array(codecFormatSchema).min(1),
});

// ============================================================================
// Album mastering schemas
// ============================================================================

export const albumMasterSchema = z.object({
  trackIds: z.array(z.string().min(1)).optional(),
  profile: masterProfileSchema,
  loudnessTarget: loudnessTargetSchema,
  normalizeLoudness: z.boolean().default(true),
});

// ============================================================================
// Export schemas
// ============================================================================

export const exportFormatSchema = z.enum(["wav-24", "wav-16", "mp3-320", "flac"]);

export const exportProjectSchema = z.object({
  formats: z.array(exportFormatSchema).min(1),
  includeQc: z.boolean().default(true),
});

// ============================================================================
// Auth schemas
// ============================================================================

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  apiKey: z.string().min(1).optional(),
});

// ============================================================================
// Type exports
// ============================================================================

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ImportTrackInput = z.infer<typeof importTrackSchema>;
export type FixTrackInput = z.infer<typeof fixTrackSchema>;
export type MasterTrackInput = z.infer<typeof masterTrackSchema>;
export type CodecPreviewInput = z.infer<typeof codecPreviewSchema>;
export type AlbumMasterInput = z.infer<typeof albumMasterSchema>;
export type ExportProjectInput = z.infer<typeof exportProjectSchema>;
