// Budi - Data Models

import Foundation

// MARK: - Auth

struct AuthResponse: Decodable {
    let user: User
    let apiKey: String
}

struct User: Decodable, Identifiable {
    let id: String
    let email: String
    let name: String?
}

// MARK: - Projects

struct ProjectsResponse: Decodable {
    let projects: [Project]
}

struct Project: Decodable, Identifiable {
    let id: String
    let name: String
    let type: String
    let status: String
    let trackCount: Int
    let createdAt: Date
}

struct ProjectDetail: Decodable {
    let id: String
    let name: String
    let type: String
    let status: String
    let tracks: [Track]
    let createdAt: Date
    let updatedAt: Date
}

// MARK: - Tracks

struct Track: Decodable, Identifiable {
    let id: String
    let name: String
    let status: String
    let orderIndex: Int?
    let hasAnalysis: Bool?
    let hasMaster: Bool?
    let originalUrl: String?
    let fixedUrl: String?
    let analysis: TrackAnalysis?
    let masters: [Master]?
    let codecPreviews: [CodecPreview]?
}

struct TrackDetail: Decodable {
    let id: String
    let name: String
    let status: String
    let originalUrl: String?
    let fixedUrl: String?
    let analysis: TrackAnalysis?
    let masters: [Master]
    let codecPreviews: [CodecPreview]
    let recentJobs: [JobSummary]
}

struct TrackAnalysis: Decodable {
    let integratedLufs: Double
    let loudnessRange: Double
    let truePeak: Double
    let samplePeak: Double
    let hasClipping: Bool
    let hasDcOffset: Bool
    let clippedSamples: Int?
    let durationSecs: Double
    let sampleRate: Int
    let channels: Int
}

// MARK: - Masters

struct Master: Decodable, Identifiable {
    let id: String
    let profile: String
    let loudnessTarget: String
    let wavHdUrl: String?
    let wav16Url: String?
    let mp3PreviewUrl: String?
    let finalLufs: Double?
    let finalTruePeak: Double?
    let passesQc: Bool
}

// MARK: - Codec Previews

struct CodecPreview: Decodable, Identifiable {
    let id: String
    let codec: String
    let previewUrl: String
    let artifactScore: Double?
    let clippingRisk: Bool
}

// MARK: - Jobs

struct JobStatus: Decodable, Identifiable {
    let id: String
    let jobId: String?
    let type: String
    let status: String
    let progress: Int
    let message: String?
    let trackId: String?
    let resultUrl: String?
    let error: String?
    let createdAt: Date?

    // Computed property for Identifiable
    var identifier: String { jobId ?? id }
}

struct JobSummary: Decodable, Identifiable {
    let id: String
    let type: String
    let status: String
    let progress: Int
    let createdAt: Date
}

// MARK: - Reports

struct ReportsResponse: Decodable {
    let trackId: String
    let reports: [Report]
}

struct Report: Decodable {
    let type: String
    let reportUrl: String?
    let createdAt: Date
}

// MARK: - Export

struct ExportStatus: Decodable, Identifiable {
    let id: String
    let formats: [String]
    let includeQc: Bool
    let packUrl: String?
    let status: String
    let createdAt: Date
    let completedAt: Date?
}

// MARK: - Track Export (Release-Ready)

struct ExportJobResponse: Decodable {
    let jobId: String
    let trackId: String
    let status: String
    let settings: ExportSettings
}

struct ExportSettings: Decodable {
    let bitDepth: String
    let sampleRate: Int
    let truePeakCeilingDb: Double
    let includeMp3: Bool
    let includeAac: Bool
}

struct ExportJobStatus: Decodable, Identifiable {
    let id: String
    let trackId: String
    let trackName: String
    let status: String
    let settings: ExportSettings
    let results: ExportResults?
    let error: String?
    let createdAt: Date
    let completedAt: Date?
}

struct ExportResults: Decodable {
    let outputWavUrl: String?
    let outputMp3Url: String?
    let outputAacUrl: String?
    let qcJsonUrl: String?
    let finalGainDb: Double?
    let finalTruePeakDbfs: Double?
    let finalIntegratedLufs: Double?
    let finalLra: Double?
    let releaseReadyPasses: Bool?
    let attempts: Int?
}

struct TrackExportsResponse: Decodable {
    let exports: [ExportListItem]
}

struct ExportListItem: Decodable, Identifiable {
    let id: String
    let status: String
    let bitDepth: String
    let sampleRate: Int
    let truePeakCeilingDb: Double
    let releaseReadyPasses: Bool?
    let finalTruePeakDbfs: Double?
    let createdAt: Date
    let completedAt: Date?
}
