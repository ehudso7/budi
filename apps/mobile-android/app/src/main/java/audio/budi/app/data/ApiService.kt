package audio.budi.app.data

import retrofit2.http.*

interface ApiService {
    // Auth
    @POST("v1/auth/register")
    suspend fun register(@Body request: RegisterRequest): AuthResponse

    @GET("v1/auth/me")
    suspend fun getMe(): User

    // Projects
    @GET("v1/projects")
    suspend fun getProjects(): List<Project>

    @POST("v1/projects")
    suspend fun createProject(@Body request: CreateProjectRequest): Project

    @GET("v1/projects/{id}")
    suspend fun getProject(@Path("id") id: String): Project

    @DELETE("v1/projects/{id}")
    suspend fun deleteProject(@Path("id") id: String)

    // Tracks
    @GET("v1/projects/{projectId}/tracks")
    suspend fun getTracks(@Path("projectId") projectId: String): List<Track>

    @POST("v1/projects/{projectId}/tracks/upload-url")
    suspend fun getUploadUrl(@Path("projectId") projectId: String): UploadUrlResponse

    @POST("v1/projects/{projectId}/tracks/import")
    suspend fun importTrack(
        @Path("projectId") projectId: String,
        @Body request: ImportTrackRequest
    ): Track

    @GET("v1/tracks/{id}")
    suspend fun getTrack(@Path("id") id: String): Track

    @DELETE("v1/tracks/{id}")
    suspend fun deleteTrack(@Path("id") id: String)

    // Analysis
    @POST("v1/tracks/{id}/analyze")
    suspend fun analyzeTrack(@Path("id") id: String): JobStatus

    @GET("v1/tracks/{id}/analysis")
    suspend fun getAnalysis(@Path("id") id: String): AnalysisReport

    // Fix
    @POST("v1/tracks/{id}/fix")
    suspend fun fixTrack(@Path("id") id: String): JobStatus

    // Mastering
    @POST("v1/tracks/{id}/master")
    suspend fun masterTrack(
        @Path("id") id: String,
        @Body request: MasterRequest
    ): JobStatus

    @GET("v1/tracks/{id}/master")
    suspend fun getMaster(@Path("id") id: String): Master

    @GET("v1/masters/{id}/qc")
    suspend fun getQcReport(@Path("id") id: String): QcReport

    // Codec Preview
    @POST("v1/tracks/{id}/codec-preview")
    suspend fun createCodecPreview(
        @Path("id") id: String,
        @Body request: CodecPreviewRequest
    ): JobStatus

    @GET("v1/tracks/{id}/codec-previews")
    suspend fun getCodecPreviews(@Path("id") id: String): List<CodecPreview>

    // Export
    @POST("v1/masters/{id}/export")
    suspend fun exportMaster(
        @Path("id") id: String,
        @Body request: ExportRequest
    ): JobStatus

    // Track Export (Release-Ready)
    @POST("v1/tracks/{id}/exports")
    suspend fun createTrackExport(
        @Path("id") id: String,
        @Body request: TrackExportRequest
    ): ExportJobResponse

    @GET("v1/exports/{id}")
    suspend fun getExportJobStatus(@Path("id") id: String): ExportJobStatus

    @GET("v1/tracks/{id}/exports")
    suspend fun getTrackExports(@Path("id") id: String): TrackExportsResponse

    // Jobs
    @GET("v1/jobs")
    suspend fun getJobs(
        @Query("status") status: String? = null,
        @Query("type") type: String? = null
    ): List<JobStatus>

    @GET("v1/jobs/{id}")
    suspend fun getJob(@Path("id") id: String): JobStatus

    // Download URLs
    @GET("v1/tracks/{id}/download-url")
    suspend fun getTrackDownloadUrl(@Path("id") id: String): DownloadUrlResponse

    @GET("v1/masters/{id}/download-url")
    suspend fun getMasterDownloadUrl(@Path("id") id: String): DownloadUrlResponse
}
