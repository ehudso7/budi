// Budi - Projects View

import SwiftUI

struct ProjectsView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = ProjectsViewModel()
    @State private var showingNewProject = false

    var body: some View {
        NavigationView {
            Group {
                if viewModel.isLoading && viewModel.projects.isEmpty {
                    ProgressView("Loading projects...")
                } else if viewModel.projects.isEmpty {
                    EmptyProjectsView(showingNewProject: $showingNewProject)
                } else {
                    List {
                        ForEach(viewModel.projects) { project in
                            NavigationLink(destination: ProjectDetailView(project: project)) {
                                ProjectRowView(project: project)
                            }
                        }
                    }
                    .refreshable {
                        await viewModel.loadProjects()
                    }
                }
            }
            .navigationTitle("Projects")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingNewProject = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingNewProject) {
                NewProjectView(viewModel: viewModel)
            }
        }
        .task {
            await viewModel.loadProjects()
        }
    }
}

// MARK: - Project Row View

struct ProjectRowView: View {
    let project: Project

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(project.name)
                .font(.headline)

            HStack {
                Label(project.type.capitalized, systemImage: project.type == "album" ? "square.stack" : "music.note")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Spacer()

                StatusBadge(status: project.status)
            }

            Text("\(project.trackCount) track(s)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 5)
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let status: String

    var color: Color {
        switch status.lowercased() {
        case "mastered", "exported", "completed":
            return .green
        case "analyzing", "mastering", "processing":
            return .orange
        case "failed":
            return .red
        default:
            return .gray
        }
    }

    var body: some View {
        Text(status.capitalized)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundColor(color)
            .cornerRadius(4)
    }
}

// MARK: - Empty Projects View

struct EmptyProjectsView: View {
    @Binding var showingNewProject: Bool

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "folder.badge.plus")
                .resizable()
                .frame(width: 80, height: 70)
                .foregroundColor(.gray)

            Text("No Projects Yet")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Create your first project to start mastering audio")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button("Create Project") {
                showingNewProject = true
            }
            .buttonStyle(.borderedProminent)
            .tint(.purple)
        }
        .padding()
    }
}

// MARK: - New Project View

struct NewProjectView: View {
    @ObservedObject var viewModel: ProjectsViewModel
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var type = "single"
    @State private var isLoading = false

    var body: some View {
        NavigationView {
            Form {
                Section("Project Details") {
                    TextField("Project Name", text: $name)

                    Picker("Type", selection: $type) {
                        Text("Single Track").tag("single")
                        Text("Album").tag("album")
                    }
                }

                Section {
                    Button(action: createProject) {
                        if isLoading {
                            ProgressView()
                        } else {
                            Text("Create Project")
                        }
                    }
                    .disabled(name.isEmpty || isLoading)
                }
            }
            .navigationTitle("New Project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func createProject() {
        isLoading = true
        Task {
            do {
                try await viewModel.createProject(name: name, type: type)
                await MainActor.run {
                    dismiss()
                }
            } catch {
                isLoading = false
            }
        }
    }
}

// MARK: - Projects View Model

@MainActor
class ProjectsViewModel: ObservableObject {
    @Published var projects: [Project] = []
    @Published var isLoading = false
    @Published var error: Error?

    func loadProjects() async {
        isLoading = true
        do {
            projects = try await APIService.shared.getProjects()
        } catch {
            self.error = error
        }
        isLoading = false
    }

    func createProject(name: String, type: String) async throws {
        let project = try await APIService.shared.createProject(name: name, type: type)
        projects.insert(project, at: 0)
    }
}
