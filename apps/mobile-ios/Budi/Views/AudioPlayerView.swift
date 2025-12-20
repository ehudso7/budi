// Budi - Audio Player View

import SwiftUI
import AVFoundation

struct AudioPlayerView: View {
    let title: String
    let audioURL: URL

    @StateObject private var player = AudioPlayerController()
    @State private var showingError = false

    var body: some View {
        VStack(spacing: 16) {
            // Waveform placeholder
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.purple.opacity(0.1))
                .frame(height: 60)
                .overlay {
                    Image(systemName: "waveform")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .foregroundColor(.purple.opacity(0.5))
                        .padding()
                }

            // Progress bar
            VStack(spacing: 4) {
                Slider(value: $player.progress, in: 0...1) { editing in
                    if !editing {
                        player.seek(to: player.progress)
                    }
                }
                .tint(.purple)

                HStack {
                    Text(formatTime(player.currentTime))
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Spacer()

                    Text(formatTime(player.duration))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            // Controls
            HStack(spacing: 40) {
                Button {
                    player.seek(to: max(0, player.progress - 0.1))
                } label: {
                    Image(systemName: "gobackward.10")
                        .font(.title2)
                }

                Button {
                    player.isPlaying ? player.pause() : player.play()
                } label: {
                    Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 50))
                        .foregroundColor(.purple)
                }

                Button {
                    player.seek(to: min(1, player.progress + 0.1))
                } label: {
                    Image(systemName: "goforward.10")
                        .font(.title2)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(radius: 5)
        .onAppear {
            player.load(url: audioURL)
        }
        .onDisappear {
            player.stop()
        }
        .alert("Playback Error", isPresented: $showingError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(player.errorMessage ?? "Unknown error")
        }
        .onChange(of: player.errorMessage) { _, newValue in
            showingError = newValue != nil
        }
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Audio Player Controller

@MainActor
class AudioPlayerController: ObservableObject {
    @Published var isPlaying = false
    @Published var progress: Double = 0
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var errorMessage: String?

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    func load(url: URL) {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            errorMessage = "Failed to configure audio session"
            return
        }

        let playerItem = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: playerItem)

        // Get duration
        Task {
            do {
                let asset = AVURLAsset(url: url)
                let durationCM = try await asset.load(.duration)
                await MainActor.run {
                    duration = CMTimeGetSeconds(durationCM)
                }
            } catch {
                errorMessage = "Failed to load audio"
            }
        }

        // Add time observer
        timeObserver = player?.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.1, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self = self else { return }
            let seconds = CMTimeGetSeconds(time)
            Task { @MainActor in
                self.currentTime = seconds
                if self.duration > 0 {
                    self.progress = seconds / self.duration
                }
            }
        }

        // Observe end of playback
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.isPlaying = false
                self?.progress = 0
                self?.currentTime = 0
            }
        }
    }

    deinit {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
        }
        if let endObserver = endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
    }

    func play() {
        player?.play()
        isPlaying = true
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    func stop() {
        player?.pause()
        player?.seek(to: .zero)
        isPlaying = false
        progress = 0
        currentTime = 0

        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
        }
    }

    func seek(to progress: Double) {
        guard duration > 0 else { return }
        let time = CMTime(seconds: progress * duration, preferredTimescale: 600)
        player?.seek(to: time)
        self.progress = progress
        self.currentTime = progress * duration
    }
}

#Preview {
    AudioPlayerView(
        title: "Preview",
        audioURL: URL(string: "https://example.com/audio.mp3")!
    )
    .padding()
}
