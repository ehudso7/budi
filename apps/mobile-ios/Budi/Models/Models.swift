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
