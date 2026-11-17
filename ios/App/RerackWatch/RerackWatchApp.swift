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

/// The app's dark theme (src/index.css, and `Palette` in the widget): the warm sweep, orange to red, or with Settings'
/// "Purple in dark mode" (`WatchState.accent`) pink through violet to blue. Views redraw when the state changes, since
/// they all watch the store.
@MainActor
enum Theme {
    static var purple: Bool { WatchStore.shared.state?.accent == "purple" }
    static var accent: Color { purple ? hex(0xC182FF) : hex(0xF27870) }
    static var sweep: LinearGradient {
        LinearGradient(
            colors: purple
                ? [hex(0xF08AFD), hex(0xCC82FF), hex(0x9D8EFF), hex(0x8697FF)]
                : [hex(0xF58A5C), hex(0xF28F82), hex(0xEF6266), hex(0xEA5560)],
            startPoint: .leading, endPoint: .trailing
        )
    }

    private static func hex(_ value: Int) -> Color {
        Color(red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255, blue: Double(value & 0xFF) / 255)
    }
    /// Dark text on the sweep (`--on-rainbow`).
    static let onSweep = Color(red: 0x1A / 255, green: 0x0D / 255, blue: 0x0B / 255)
}

func clock(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.rounded()))
    return String(format: "%d:%02d", s / 60, s % 60)
}
