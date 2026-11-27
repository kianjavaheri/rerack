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

/// The app's dark theme (src/index.css, and `Palette` in the widget): the accent chosen in the app (`WatchState.colors`,
/// src/core/accents.ts), else the default warm sweep, orange to red. Views redraw when the state changes, since they
/// all watch the store.
@MainActor
enum Theme {
    private static var tone: WatchTone? { WatchStore.shared.state?.colors }
    static var accent: Color { tone.flatMap { hex($0.accent) } ?? rgb(0xF27870) }
    static var sweep: LinearGradient {
        let colors = tone?.sweep.compactMap(hex) ?? []
        return LinearGradient(
            colors: colors.isEmpty ? [rgb(0xF58A5C), rgb(0xF28F82), rgb(0xEF6266), rgb(0xEA5560)] : colors,
            startPoint: .leading, endPoint: .trailing
        )
    }
    /// Text on the sweep (`--on-rainbow`): dark on the default.
    static var onSweep: Color { tone.flatMap { hex($0.on) } ?? rgb(0x1A0D0B) }

    private static func hex(_ string: String) -> Color? {
        guard string.hasPrefix("#"), string.count == 7, let value = Int(string.dropFirst(), radix: 16) else { return nil }
        return rgb(value)
    }
    private static func rgb(_ value: Int) -> Color {
        Color(red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255, blue: Double(value & 0xFF) / 255)
    }
}

func clock(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.rounded()))
    return String(format: "%d:%02d", s / 60, s % 60)
}
