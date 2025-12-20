// Budi - API Service

import Foundation

class APIService {
    static let shared = APIService()

    private let baseURL: URL
    private var apiKey: String?

    private init() {
        // Default to localhost for development, configure for production
        let urlString = ProcessInfo.processInfo.environment["API_URL"] ?? "http://localhost:4000"
        self.baseURL = URL(string: urlString)!
    }

    func configure(apiKey: String) {
        self.apiKey = apiKey
    }

    // MARK: - Auth

    func register(email: String) async throws -> AuthResponse {
        let body = ["email": email]
        return try await post("/v1/auth/register", body: body)
    }

    // MARK: - Projects

    func getProjects() async throws -> [Project] {
        let response: ProjectsResponse = try await get("/v1/projects")
        return response.projects
    }

    func getProject(id: String) async throws -> ProjectDetail {
        return try await get("/v1/projects/\(id)")
    }

    func createProject(name: String, type: String) async throws -> Project {
        let body = ["name": name, "type": type]
        return try await post("/v1/projects", body: body)
    }

    // MARK: - Tracks

    func importTrack(projectId: String, name: String, sourceUrl: String?) async throws -> Track {
        var body: [String: Any] = ["name": name]
        if let url = sourceUrl {
            body["sourceUrl"] = url
        }
        return try await post("/v1/projects/\(projectId)/tracks/import", body: body)
    }

    func getTrack(id: String) async throws -> TrackDetail {
        return try await get("/v1/tracks/\(id)")
    }

    // MARK: - Jobs

    func analyzeTrack(trackId: String) async throws -> JobStatus {
        return try await post("/v1/tracks/\(trackId)/analyze", body: [:])
    }

    func fixTrack(trackId: String, modules: [String]) async throws -> JobStatus {
        let body = ["modules": modules]
        return try await post("/v1/tracks/\(trackId)/fix", body: body)
    }

    func masterTrack(trackId: String, profile: String, loudnessTarget: String) async throws -> JobStatus {
        let body = ["profile": profile, "loudnessTarget": loudnessTarget]
        return try await post("/v1/tracks/\(trackId)/master", body: body)
    }

    func codecPreview(trackId: String, codecs: [String]) async throws -> JobStatus {
        let body = ["codecs": codecs]
        return try await post("/v1/tracks/\(trackId)/codec-preview", body: body)
    }

    func albumMaster(projectId: String, profile: String, loudnessTarget: String) async throws -> JobStatus {
        let body: [String: Any] = [
            "profile": profile,
            "loudnessTarget": loudnessTarget,
            "normalizeLoudness": true
        ]
        return try await post("/v1/projects/\(projectId)/album-master", body: body)
    }

    func exportProject(projectId: String, formats: [String]) async throws -> JobStatus {
        let body: [String: Any] = ["formats": formats, "includeQc": true]
        return try await post("/v1/projects/\(projectId)/export", body: body)
    }

    func getJobStatus(jobId: String) async throws -> JobStatus {
        return try await get("/v1/jobs/\(jobId)")
    }

    // MARK: - Track Export (Release-Ready)

    func createTrackExport(
        trackId: String,
        bitDepth: String,
        sampleRate: Int,
        truePeakCeilingDb: Double,
        includeMp3: Bool,
        includeAac: Bool
    ) async throws -> ExportJobResponse {
        let body: [String: Any] = [
            "bitDepth": bitDepth,
            "sampleRate": sampleRate,
            "truePeakCeilingDb": truePeakCeilingDb,
            "includeMp3": includeMp3,
            "includeAac": includeAac
        ]
        return try await post("/v1/tracks/\(trackId)/exports", body: body)
    }

    func getExportJobStatus(jobId: String) async throws -> ExportJobStatus {
        return try await get("/v1/exports/\(jobId)")
    }

    func getTrackExports(trackId: String) async throws -> TrackExportsResponse {
        return try await get("/v1/tracks/\(trackId)/exports")
    }

    // MARK: - Reports

    func getReports(trackId: String) async throws -> ReportsResponse {
        return try await get("/v1/tracks/\(trackId)/reports")
    }

    // MARK: - Private Helpers

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        addHeaders(to: &request)
        return try await execute(request)
    }

    private func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        addHeaders(to: &request)
        return try await execute(request)
    }

    private func addHeaders(to request: inout URLRequest) {
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let key = apiKey ?? UserDefaults.standard.string(forKey: "api_key") {
            request.setValue(key, forHTTPHeaderField: "X-API-Key")
        }
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if let error = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverError(error.error)
            }
            throw APIError.httpError(httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(T.self, from: data)
    }
}

// MARK: - API Errors

enum APIError: LocalizedError {
    case invalidResponse
    case httpError(Int)
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .serverError(let message):
            return message
        }
    }
}

struct ErrorResponse: Decodable {
    let error: String
}
