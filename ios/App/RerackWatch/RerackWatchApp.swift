import HealthKit
import SwiftUI
import WatchKit

/// Rerack on the Apple Watch: start a workout, log each set, rest between them and finish, without the phone. See
/// WatchStore for how it stays in step with the iPhone app.
@main
struct RerackWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var delegate
    @ObservedObject private var store = WatchStore.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(store.workout)
                .tint(Theme.accent)
        }
    }
}

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    /// The iPhone app started a workout and launched this app for it (WatchPlugin.startWatchApp on the phone).
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in WatchStore.shared.launchedForWorkout() }
    }

    /// watchOS relaunched the app during a workout (it quit or crashed): pick the workout session back up.
    func handleActiveWorkoutRecovery() {
        Task { @MainActor in
            let store = WatchStore.shared
            await store.workout.recover(sessionId: store.session?.id)
        }
    }
}

/// The app's dark theme (src/index.css, and `Palette` on the lock screen): the warm sweep, orange to red.
enum Theme {
    static let accent = Color(red: 0xF2 / 255, green: 0x78 / 255, blue: 0x70 / 255)
    static let sweep = LinearGradient(
        colors: [
            Color(red: 0xF5 / 255, green: 0x8A / 255, blue: 0x5C / 255),
            Color(red: 0xF2 / 255, green: 0x8F / 255, blue: 0x82 / 255),
            Color(red: 0xEF / 255, green: 0x62 / 255, blue: 0x66 / 255),
            Color(red: 0xEA / 255, green: 0x55 / 255, blue: 0x60 / 255),
        ],
        startPoint: .leading, endPoint: .trailing
    )
    /// Dark text on the sweep (`--on-rainbow`).
    static let onSweep = Color(red: 0x1A / 255, green: 0x0D / 255, blue: 0x0B / 255)
}

func clock(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.rounded()))
    return String(format: "%d:%02d", s / 60, s % 60)
}
