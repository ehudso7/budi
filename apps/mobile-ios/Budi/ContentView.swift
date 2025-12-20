// Budi - Main Content View

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if appState.isAuthenticated {
                MainTabView()
            } else {
                AuthView()
            }
        }
    }
}

// MARK: - Main Tab View

struct MainTabView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            ProjectsView()
                .tabItem {
                    Image(systemName: "folder.fill")
                    Text("Projects")
                }
                .tag(0)

            ProcessingView()
                .tabItem {
                    Image(systemName: "waveform")
                    Text("Processing")
                }
                .tag(1)

            SettingsView()
                .tabItem {
                    Image(systemName: "gear")
                    Text("Settings")
                }
                .tag(2)
        }
        .accentColor(.purple)
    }
}

// MARK: - Auth View

struct AuthView: View {
    @EnvironmentObject var appState: AppState
    @State private var email = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                // Logo
                VStack(spacing: 10) {
                    Image(systemName: "waveform.circle.fill")
                        .resizable()
                        .frame(width: 100, height: 100)
                        .foregroundColor(.purple)

                    Text("Budi")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("AI Audio Mastering")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 50)

                // Login Form
                VStack(spacing: 15) {
                    TextField("Email", text: $email)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)
                        .keyboardType(.emailAddress)

                    if let error = errorMessage {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.caption)
                    }

                    Button(action: register) {
                        if isLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        } else {
                            Text("Get Started")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.purple)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .disabled(isLoading || email.isEmpty)
                }
                .padding(.horizontal, 30)

                Spacer()
            }
            .navigationBarHidden(true)
        }
    }

    private func register() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let response = try await APIService.shared.register(email: email)
                await MainActor.run {
                    appState.saveCredentials(response.apiKey)
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}
