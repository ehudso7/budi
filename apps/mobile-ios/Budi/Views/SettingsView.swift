// Budi - Settings View

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingLogoutConfirmation = false

    var body: some View {
        NavigationView {
            List {
                // Account Section
                Section("Account") {
                    if let user = appState.user {
                        LabeledContent("Email", value: user.email)
                        if let name = user.name {
                            LabeledContent("Name", value: name)
                        }
                    }

                    Button(role: .destructive) {
                        showingLogoutConfirmation = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                // Audio Settings
                Section("Audio Quality") {
                    NavigationLink {
                        AudioSettingsView()
                    } label: {
                        Label("Export Settings", systemImage: "speaker.wave.2")
                    }
                }

                // About Section
                Section("About") {
                    LabeledContent("Version", value: "1.0.0")
                    LabeledContent("Build", value: "1")

                    Link(destination: URL(string: "https://budi.audio")!) {
                        Label("Website", systemImage: "globe")
                    }

                    Link(destination: URL(string: "https://budi.audio/support")!) {
                        Label("Support", systemImage: "questionmark.circle")
                    }
                }

                // QC Info
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Quality Control Standards")
                            .font(.headline)

                        Text("All masters are verified against broadcast standards:")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("True Peak ≤ -2.0 dBTP")
                                .font(.caption)
                        }

                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("ITU-R BS.1770 loudness measurement")
                                .font(.caption)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("Settings")
            .alert("Sign Out", isPresented: $showingLogoutConfirmation) {
                Button("Cancel", role: .cancel) { }
                Button("Sign Out", role: .destructive) {
                    appState.logout()
                }
            } message: {
                Text("Are you sure you want to sign out?")
            }
        }
    }
}

// MARK: - Audio Settings View

struct AudioSettingsView: View {
    @AppStorage("defaultProfile") private var defaultProfile = "balanced"
    @AppStorage("defaultLoudness") private var defaultLoudness = "medium"
    @AppStorage("exportFormats") private var exportFormats = "wav-24,wav-16,mp3-320"

    var body: some View {
        Form {
            Section("Default Mastering Profile") {
                Picker("Profile", selection: $defaultProfile) {
                    Text("Balanced").tag("balanced")
                    Text("Warm").tag("warm")
                    Text("Punchy").tag("punchy")
                }
                .pickerStyle(.segmented)
            }

            Section("Default Loudness Target") {
                Picker("Loudness", selection: $defaultLoudness) {
                    Text("Low (-14 LUFS)").tag("low")
                    Text("Medium (-11 LUFS)").tag("medium")
                    Text("High (-8 LUFS)").tag("high")
                }
            }

            Section("Export Formats") {
                Toggle("24-bit WAV", isOn: formatBinding("wav-24"))
                Toggle("16-bit WAV", isOn: formatBinding("wav-16"))
                Toggle("MP3 320kbps", isOn: formatBinding("mp3-320"))
            }
        }
        .navigationTitle("Audio Settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func formatBinding(_ format: String) -> Binding<Bool> {
        Binding(
            get: { exportFormats.contains(format) },
            set: { enabled in
                var formats = Set(exportFormats.split(separator: ",").map(String.init))
                if enabled {
                    formats.insert(format)
                } else {
                    formats.remove(format)
                }
                exportFormats = formats.joined(separator: ",")
            }
        )
    }
}

// Extension for AppState user property
extension AppState {
    var user: User? {
        // This would normally come from the API
        if isAuthenticated {
            return User(id: "1", email: "user@example.com", name: nil)
        }
        return nil
    }
}

#Preview {
    SettingsView()
        .environmentObject(AppState())
}
