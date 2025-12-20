// Budi - Project Detail View

import SwiftUI
import AVFoundation

struct ProjectDetailView: View {
    let project: Project
    @StateObject private var viewModel: ProjectDetailViewModel
    @State private var showingImportSheet = false
    @State private var showingMasterSheet = false

    init(project: Project) {
        self.project = project
        self._viewModel = StateObject(wrappedValue: ProjectDetailViewModel(project: project))
    }

    var body: some View {
        List {
            // Project Info Section
            Section("Project Info") {
                LabeledContent("Name", value: project.name)
                LabeledContent("Type", value: project.type.capitalized)
                LabeledContent("Status", value: project.status.capitalized)
            }

            // Tracks Section
            Section {
                ForEach(viewModel.tracks) { track in
                    TrackRowView(track: track, viewModel: viewModel)
                }
            } header: {
                HStack {
                    Text("Tracks")
                    Spacer()
                    Button("Add Track") {
                        showingImportSheet = true
                    }
                    .font(.caption)
                }
            }

            // Actions Section
            if !viewModel.tracks.isEmpty {
                Section("Actions") {
                    Button(action: { showingMasterSheet = true }) {
                        Label("Master All Tracks", systemImage: "waveform.badge.plus")
                    }

                    Button(action: viewModel.exportProject) {
                        Label("Export Project", systemImage: "square.and.arrow.up")
                    }
                    .disabled(!viewModel.canExport)
                }
            }
        }
        .navigationTitle(project.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await viewModel.loadProject()
        }
        .sheet(isPresented: $showingImportSheet) {
            ImportTrackView(viewModel: viewModel)
        }
        .sheet(isPresented: $showingMasterSheet) {
            MasterSettingsView(viewModel: viewModel)
        }
        .task {
            await viewModel.loadProject()
        }
    }
}

// MARK: - Track Row View

struct TrackRowView: View {
    let track: Track
    @ObservedObject var viewModel: ProjectDetailViewModel
    @State private var showingAnalysis = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading) {
                    Text(track.name)
                        .font(.headline)

                    StatusBadge(status: track.status)
                }

                Spacer()

                // Action buttons
                HStack(spacing: 12) {
                    if track.status == "uploaded" || track.status == "fixed" {
                        Button(action: { viewModel.analyzeTrack(track) }) {
                            Image(systemName: "waveform.path.ecg")
                        }
                        .buttonStyle(.bordered)
                    }

                    if track.hasAnalysis {
                        Button(action: { showingAnalysis = true }) {
                            Image(systemName: "chart.bar.doc.horizontal")
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }

            // Analysis Summary (if available)
            if let analysis = track.analysis {
                HStack(spacing: 20) {
                    VStack(alignment: .leading) {
                        Text("\(String(format: "%.1f", analysis.integratedLufs)) LUFS")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    VStack(alignment: .leading) {
                        Text("\(String(format: "%.1f", analysis.truePeak)) dBTP")
                            .font(.caption)
                            .foregroundColor(analysis.truePeak > -2.0 ? .red : .secondary)
                    }

                    if analysis.hasClipping {
                        Label("Clipping", systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }
            }

            // Progress indicator for active jobs
            if let job = viewModel.activeJobs[track.id] {
                ProgressView(value: Double(job.progress) / 100.0) {
                    Text(job.message ?? "Processing...")
                        .font(.caption)
                }
            }
        }
        .padding(.vertical, 4)
        .sheet(isPresented: $showingAnalysis) {
            if let analysis = track.analysis {
                AnalysisDetailView(track: track, analysis: analysis)
            }
        }
    }
}

// MARK: - Analysis Detail View

struct AnalysisDetailView: View {
    let track: Track
    let analysis: TrackAnalysis
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            List {
                Section("Loudness") {
                    LabeledContent("Integrated", value: "\(String(format: "%.1f", analysis.integratedLufs)) LUFS")
                    LabeledContent("Loudness Range", value: "\(String(format: "%.1f", analysis.loudnessRange)) LU")
                }

                Section("Peaks") {
                    LabeledContent("Sample Peak", value: "\(String(format: "%.1f", analysis.samplePeak)) dBFS")
                    LabeledContent("True Peak", value: "\(String(format: "%.1f", analysis.truePeak)) dBTP")

                    if analysis.truePeak > -2.0 {
                        Label("Exceeds -2.0 dBTP limit", systemImage: "exclamationmark.triangle")
                            .foregroundColor(.orange)
                    }
                }

                Section("Issues") {
                    if analysis.hasClipping {
                        Label("Clipping detected (\(analysis.clippedSamples ?? 0) samples)", systemImage: "waveform.badge.exclamationmark")
                            .foregroundColor(.red)
                    }

                    if analysis.hasDcOffset {
                        Label("DC offset detected", systemImage: "arrow.up.and.down")
                            .foregroundColor(.orange)
                    }

                    if !analysis.hasClipping && !analysis.hasDcOffset {
                        Label("No issues detected", systemImage: "checkmark.circle")
                            .foregroundColor(.green)
                    }
                }

                Section("Format") {
                    LabeledContent("Sample Rate", value: "\(analysis.sampleRate) Hz")
                    LabeledContent("Channels", value: "\(analysis.channels)")
                    LabeledContent("Duration", value: formatDuration(analysis.durationSecs))
                }
            }
            .navigationTitle("Analysis Report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Import Track View

struct ImportTrackView: View {
    @ObservedObject var viewModel: ProjectDetailViewModel
    @Environment(\.dismiss) var dismiss
    @State private var trackName = ""
    @State private var sourceUrl = ""
    @State private var isLoading = false

    var body: some View {
        NavigationView {
            Form {
                Section("Track Details") {
                    TextField("Track Name", text: $trackName)
                    TextField("Source URL (optional)", text: $sourceUrl)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                }

                Section {
                    Button("Import Track") {
                        importTrack()
                    }
                    .disabled(trackName.isEmpty || isLoading)
                }
            }
            .navigationTitle("Import Track")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func importTrack() {
        isLoading = true
        Task {
            do {
                try await viewModel.importTrack(name: trackName, sourceUrl: sourceUrl.isEmpty ? nil : sourceUrl)
                await MainActor.run { dismiss() }
            } catch {
                isLoading = false
            }
        }
    }
}

// MARK: - Master Settings View

struct MasterSettingsView: View {
    @ObservedObject var viewModel: ProjectDetailViewModel
    @Environment(\.dismiss) var dismiss
    @State private var profile = "balanced"
    @State private var loudnessTarget = "medium"
    @State private var isLoading = false

    var body: some View {
        NavigationView {
            Form {
                Section("Mastering Profile") {
                    Picker("Profile", selection: $profile) {
                        Text("Balanced").tag("balanced")
                        Text("Warm").tag("warm")
                        Text("Punchy").tag("punchy")
                    }
                    .pickerStyle(.segmented)
                }

                Section("Loudness Target") {
                    Picker("Target", selection: $loudnessTarget) {
                        Text("Low (-14 LUFS)").tag("low")
                        Text("Medium (-11 LUFS)").tag("medium")
                        Text("High (-8 LUFS)").tag("high")
                    }
                }

                Section {
                    Button("Start Mastering") {
                        startMastering()
                    }
                    .disabled(isLoading)
                }

                Section(footer: Text("All tracks will be mastered with a true peak ceiling of -2.0 dBTP")) {
                    EmptyView()
                }
            }
            .navigationTitle("Master Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func startMastering() {
        isLoading = true
        Task {
            do {
                try await viewModel.masterAllTracks(profile: profile, loudnessTarget: loudnessTarget)
                await MainActor.run { dismiss() }
            } catch {
                isLoading = false
            }
        }
    }
}

// MARK: - Project Detail View Model

@MainActor
class ProjectDetailViewModel: ObservableObject {
    @Published var tracks: [Track] = []
    @Published var activeJobs: [String: JobStatus] = [:]
    @Published var isLoading = false

    let project: Project
    private var pollTimer: Timer?

    var canExport: Bool {
        tracks.allSatisfy { $0.status == "mastered" }
    }

    init(project: Project) {
        self.project = project
    }

    func loadProject() async {
        isLoading = true
        do {
            let projectData = try await APIService.shared.getProject(id: project.id)
            tracks = projectData.tracks
        } catch {
            print("Failed to load project: \(error)")
        }
        isLoading = false
    }

    func importTrack(name: String, sourceUrl: String?) async throws {
        let track = try await APIService.shared.importTrack(projectId: project.id, name: name, sourceUrl: sourceUrl)
        tracks.append(track)
    }

    func analyzeTrack(_ track: Track) {
        Task {
            do {
                let job = try await APIService.shared.analyzeTrack(trackId: track.id)
                activeJobs[track.id] = job
                startPolling(jobId: job.id, trackId: track.id)
            } catch {
                print("Failed to start analysis: \(error)")
            }
        }
    }

    func masterAllTracks(profile: String, loudnessTarget: String) async throws {
        let job = try await APIService.shared.albumMaster(
            projectId: project.id,
            profile: profile,
            loudnessTarget: loudnessTarget
        )
        // Track job progress
        for track in tracks {
            activeJobs[track.id] = job
        }
    }

    func exportProject() {
        Task {
            do {
                _ = try await APIService.shared.exportProject(
                    projectId: project.id,
                    formats: ["wav-24", "wav-16", "mp3-320"]
                )
            } catch {
                print("Failed to export: \(error)")
            }
        }
    }

    private func startPolling(jobId: String, trackId: String) {
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.pollJobStatus(jobId: jobId, trackId: trackId)
            }
        }
    }

    private func pollJobStatus(jobId: String, trackId: String) async {
        do {
            let status = try await APIService.shared.getJobStatus(jobId: jobId)
            activeJobs[trackId] = status

            if status.status == "completed" || status.status == "failed" {
                pollTimer?.invalidate()
                activeJobs.removeValue(forKey: trackId)
                await loadProject()
            }
        } catch {
            print("Failed to poll job: \(error)")
        }
    }
}
