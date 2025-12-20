// Budi - AI Audio Mastering App
// Main App Entry Point

import SwiftUI

@main
struct BudiApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}

// MARK: - App State

class AppState: ObservableObject {
    @Published var isAuthenticated = false
    @Published var apiKey: String?
    @Published var currentProject: Project?

    private let apiService = APIService.shared

    init() {
        loadCredentials()
    }

    func loadCredentials() {
        if let key = UserDefaults.standard.string(forKey: "api_key") {
            apiKey = key
            isAuthenticated = true
        }
    }

    func saveCredentials(_ key: String) {
        UserDefaults.standard.set(key, forKey: "api_key")
        apiKey = key
        isAuthenticated = true
    }

    func logout() {
        UserDefaults.standard.removeObject(forKey: "api_key")
        apiKey = nil
        isAuthenticated = false
        currentProject = nil
    }
}
