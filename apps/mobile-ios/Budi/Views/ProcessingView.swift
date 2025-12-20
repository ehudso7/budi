// Budi - Processing View (Active Jobs)

import SwiftUI

struct ProcessingView: View {
    @StateObject private var viewModel = ProcessingViewModel()

    var body: some View {
        NavigationView {
            Group {
                if viewModel.jobs.isEmpty {
                    EmptyJobsView()
                } else {
                    List {
                        ForEach(viewModel.jobs) { job in
                            JobRowView(job: job)
                        }
                    }
                    .refreshable {
                        await viewModel.loadJobs()
                    }
                }
            }
            .navigationTitle("Processing")
        }
        .task {
            await viewModel.loadJobs()
        }
    }
}

// MARK: - Job Row View

struct JobRowView: View {
    let job: JobStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: iconForJobType(job.type))
                    .foregroundColor(.purple)

                Text(titleForJobType(job.type))
                    .font(.headline)

                Spacer()

                StatusBadge(status: job.status)
            }

            if let message = job.message {
                Text(message)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if job.status == "processing" || job.status == "queued" {
                ProgressView(value: Double(job.progress) / 100.0)
                    .progressViewStyle(.linear)
                    .tint(.purple)
            }

            if let error = job.error {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }

            if let createdAt = job.createdAt {
                Text(createdAt, style: .relative)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func iconForJobType(_ type: String) -> String {
        switch type {
        case "analyze": return "waveform.path.ecg"
        case "fix": return "wrench.and.screwdriver"
        case "master": return "waveform.badge.plus"
        case "codec-preview": return "speaker.wave.3"
        case "album-master": return "square.stack"
        case "export": return "square.and.arrow.up"
        default: return "gearshape"
        }
    }

    private func titleForJobType(_ type: String) -> String {
        switch type {
        case "analyze": return "Analysis"
        case "fix": return "Fix"
        case "master": return "Mastering"
        case "codec-preview": return "Codec Preview"
        case "album-master": return "Album Master"
        case "export": return "Export"
        default: return type.capitalized
        }
    }
}

// MARK: - Empty Jobs View

struct EmptyJobsView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle")
                .resizable()
                .frame(width: 60, height: 60)
                .foregroundColor(.green)

            Text("No Active Jobs")
                .font(.title2)
                .fontWeight(.semibold)

            Text("All processing tasks are complete")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding()
    }
}

// MARK: - Processing View Model

@MainActor
class ProcessingViewModel: ObservableObject {
    @Published var jobs: [JobStatus] = []
    @Published var isLoading = false

    func loadJobs() async {
        isLoading = true
        do {
            jobs = try await APIService.shared.getRecentJobs()
        } catch {
            print("Failed to load jobs: \(error)")
        }
        isLoading = false
    }
}

// Add this extension to APIService
extension APIService {
    func getRecentJobs() async throws -> [JobStatus] {
        struct JobsResponse: Decodable {
            let jobs: [JobStatus]
        }
        let response: JobsResponse = try await get("/v1/jobs")
        return response.jobs
    }
}
