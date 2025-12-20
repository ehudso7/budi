package audio.budi.app.data

import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BudiRepository @Inject constructor(
    private val apiService: ApiService
) {
    // Projects
    suspend fun getProjects(): List<Project> = apiService.getProjects()

    suspend fun createProject(name: String, type: String): Project =
        apiService.createProject(CreateProjectRequest(name, type))

    suspend fun getProject(id: String): Project = apiService.getProject(id)

    suspend fun deleteProject(id: String) = apiService.deleteProject(id)

    // Tracks
    suspend fun getTracks(projectId: String): List<Track> = apiService.getTracks(projectId)

    suspend fun getUploadUrl(projectId: String): UploadUrlResponse = apiService.getUploadUrl(projectId)

    suspend fun importTrack(projectId: String, name: String, key: String): Track =
        apiService.importTrack(projectId, ImportTrackRequest(name, key))

    suspend fun getTrack(id: String): Track = apiService.getTrack(id)

    suspend fun deleteTrack(id: String) = apiService.deleteTrack(id)

    // Analysis
    suspend fun analyzeTrack(trackId: String): JobStatus = apiService.analyzeTrack(trackId)

    suspend fun getAnalysis(trackId: String): AnalysisReport = apiService.getAnalysis(trackId)

    // Fix
    suspend fun fixTrack(trackId: String): JobStatus = apiService.fixTrack(trackId)

    // Mastering
    suspend fun masterTrack(
        trackId: String,
        profile: String = "balanced",
        loudnessTarget: String = "streaming"
    ): JobStatus = apiService.masterTrack(trackId, MasterRequest(profile, loudnessTarget))

    suspend fun getMaster(trackId: String): Master = apiService.getMaster(trackId)

    suspend fun getQcReport(masterId: String): QcReport = apiService.getQcReport(masterId)

    // Codec Preview
    suspend fun createCodecPreview(
        trackId: String,
        codec: String = "aac",
        bitrate: Int = 256
    ): JobStatus = apiService.createCodecPreview(trackId, CodecPreviewRequest(codec, bitrate))

    suspend fun getCodecPreviews(trackId: String): List<CodecPreview> = apiService.getCodecPreviews(trackId)

    // Export
    suspend fun exportMaster(
        masterId: String,
        format: String = "wav",
        bitDepth: Int = 24,
        sampleRate: Int = 48000
    ): JobStatus = apiService.exportMaster(masterId, ExportRequest(format, bitDepth, sampleRate))

    // Track Export (Release-Ready)
    suspend fun createTrackExport(
        trackId: String,
        bitDepth: String = "24",
        sampleRate: Int = 44100,
        truePeakCeilingDb: Double = -2.0,
        includeMp3: Boolean = true,
        includeAac: Boolean = true
    ): ExportJobResponse = apiService.createTrackExport(
        trackId,
        TrackExportRequest(bitDepth, sampleRate, truePeakCeilingDb, includeMp3, includeAac)
    )

    suspend fun getExportJobStatus(jobId: String): ExportJobStatus =
        apiService.getExportJobStatus(jobId)

    suspend fun getTrackExports(trackId: String): List<ExportListItem> =
        apiService.getTrackExports(trackId).exports

    // Jobs
    suspend fun getJobs(status: String? = null, type: String? = null): List<JobStatus> =
        apiService.getJobs(status, type)

    suspend fun getJob(id: String): JobStatus = apiService.getJob(id)

    // Downloads
    suspend fun getTrackDownloadUrl(trackId: String): String =
        apiService.getTrackDownloadUrl(trackId).downloadUrl

    suspend fun getMasterDownloadUrl(masterId: String): String =
        apiService.getMasterDownloadUrl(masterId).downloadUrl
}
