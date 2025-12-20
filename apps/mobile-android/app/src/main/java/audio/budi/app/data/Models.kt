package audio.budi.app.data

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class Project(
    val id: String,
    val name: String,
    val type: String,
    val status: String,
    val trackCount: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

@JsonClass(generateAdapter = true)
data class Track(
    val id: String,
    val projectId: String,
    val name: String,
    val originalKey: String,
    val status: String,
    val duration: Double? = null,
    val sampleRate: Int? = null,
    val bitDepth: Int? = null,
    val channels: Int? = null,
    val analysisReportId: String? = null,
    val masterId: String? = null,
    val createdAt: String? = null
)

@JsonClass(generateAdapter = true)
data class AnalysisReport(
    val id: String,
    val trackId: String,
    val integratedLufs: Double,
    val truePeak: Double,
    val lra: Double,
    val shortTermMax: Double,
    val momentaryMax: Double,
    val spectralCentroid: Double? = null,
    val spectralBandwidth: Double? = null,
    val spectralFlatness: Double? = null,
    val stereoCorrelation: Double? = null,
    val dcOffset: Double? = null,
    val hasClipping: Boolean = false,
    val clipCount: Int = 0,
    val createdAt: String? = null
)

@JsonClass(generateAdapter = true)
data class Master(
    val id: String,
    val trackId: String,
    val masterKey: String,
    val profile: String,
    val loudnessTarget: String,
    val integratedLufs: Double? = null,
    val truePeak: Double? = null,
    val lra: Double? = null,
    val createdAt: String? = null
)

@JsonClass(generateAdapter = true)
data class QcReport(
    val id: String,
    val masterId: String,
    val passed: Boolean,
    val truePeakPass: Boolean,
    val loudnessPass: Boolean,
    val actualTruePeak: Double,
    val actualLufs: Double,
    val targetLufs: Double,
    val issues: List<String> = emptyList()
)

@JsonClass(generateAdapter = true)
data class CodecPreview(
    val id: String,
    val trackId: String,
    val codec: String,
    val bitrate: Int,
    val previewKey: String,
    val truePeakDelta: Double? = null,
    val artifactScore: Double? = null,
    val createdAt: String? = null
)

@JsonClass(generateAdapter = true)
data class JobStatus(
    val id: String,
    val type: String,
    val status: String,
    val progress: Int = 0,
    val trackId: String? = null,
    val projectId: String? = null,
    val error: String? = null,
    val createdAt: String? = null,
    val completedAt: String? = null
)

@JsonClass(generateAdapter = true)
data class User(
    val id: String,
    val email: String,
    val createdAt: String? = null
)

@JsonClass(generateAdapter = true)
data class AuthResponse(
    val token: String,
    val user: User
)

@JsonClass(generateAdapter = true)
data class UploadUrlResponse(
    val uploadUrl: String,
    val key: String
)

@JsonClass(generateAdapter = true)
data class DownloadUrlResponse(
    val downloadUrl: String
)

// Request bodies
@JsonClass(generateAdapter = true)
data class RegisterRequest(val email: String)

@JsonClass(generateAdapter = true)
data class CreateProjectRequest(
    val name: String,
    val type: String = "single"
)

@JsonClass(generateAdapter = true)
data class ImportTrackRequest(
    val name: String,
    val key: String
)

@JsonClass(generateAdapter = true)
data class MasterRequest(
    val profile: String = "balanced",
    val loudnessTarget: String = "streaming"
)

@JsonClass(generateAdapter = true)
data class CodecPreviewRequest(
    val codec: String = "aac",
    val bitrate: Int = 256
)

@JsonClass(generateAdapter = true)
data class ExportRequest(
    val format: String = "wav",
    val bitDepth: Int = 24,
    val sampleRate: Int = 48000
)

// Track Export (Release-Ready)

@JsonClass(generateAdapter = true)
data class TrackExportRequest(
    val bitDepth: String = "24",
    val sampleRate: Int = 44100,
    val truePeakCeilingDb: Double = -2.0,
    val includeMp3: Boolean = true,
    val includeAac: Boolean = true
)

@JsonClass(generateAdapter = true)
data class ExportJobResponse(
    val jobId: String,
    val trackId: String,
    val status: String,
    val settings: ExportSettings
)

@JsonClass(generateAdapter = true)
data class ExportSettings(
    val bitDepth: String,
    val sampleRate: Int,
    val truePeakCeilingDb: Double,
    val includeMp3: Boolean,
    val includeAac: Boolean
)

@JsonClass(generateAdapter = true)
data class ExportJobStatus(
    val id: String,
    val trackId: String,
    val trackName: String,
    val status: String,
    val settings: ExportSettings,
    val results: ExportResults? = null,
    val error: String? = null,
    val createdAt: String,
    val completedAt: String? = null
)

@JsonClass(generateAdapter = true)
data class ExportResults(
    val outputWavUrl: String? = null,
    val outputMp3Url: String? = null,
    val outputAacUrl: String? = null,
    val qcJsonUrl: String? = null,
    val finalGainDb: Double? = null,
    val finalTruePeakDbfs: Double? = null,
    val finalIntegratedLufs: Double? = null,
    val finalLra: Double? = null,
    val releaseReadyPasses: Boolean? = null,
    val attempts: Int? = null
)

@JsonClass(generateAdapter = true)
data class TrackExportsResponse(
    val exports: List<ExportListItem>
)

@JsonClass(generateAdapter = true)
data class ExportListItem(
    val id: String,
    val status: String,
    val bitDepth: String,
    val sampleRate: Int,
    val truePeakCeilingDb: Double,
    val releaseReadyPasses: Boolean? = null,
    val finalTruePeakDbfs: Double? = null,
    val createdAt: String,
    val completedAt: String? = null
)
