import Foundation

/// What the home-screen widget shows, written by the app (AppWidgetPlugin, from src/native/widget.ts) into the app
/// group both belong to. Plain dates rather than "Today", so the widget works out the day itself and stays right after
/// midnight without the app.
struct HomeWidgetData: Codable {
    struct Day: Codable {
        /// Local day, "YYYY-MM-DD".
        var date: String
        /// Workouts the followed routine plans that day (none: a rest day).
        var planned: [String]
        /// Trained that day (only known up to when the app last wrote this).
        var done: Bool
    }

    /// The followed routine, or nil when there's none to follow.
    var routine: String?
    /// Monday of the week the app wrote this in, then 13 more days, so next week is covered too.
    var days: [Day]
    /// When the app wrote it (ms), to know which days' "done" is still unknown.
    var writtenAt: Double
    /// The app's accent in both themes (missing from older builds: the default colours).
    var colors: AccentColors?

    static let key = "homeWidget"

    static func load() -> HomeWidgetData? {
        guard let data = UserDefaults(suiteName: ExerciseImages.appGroup)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(HomeWidgetData.self, from: data)
    }
}

/// The app's accent in one theme (src/core/accents.ts `nativeAccent`): four colours along its sweep, one solid colour
/// for timers and rings, and the colour for text and checks on the sweep, each "#rrggbb".
struct AccentTone: Codable, Hashable {
    var sweep: [String]
    var accent: String
    var on: String
}

/// The accent in light and dark mode, and the light theme's page colour when it isn't plain (Bamboo).
struct AccentColors: Codable, Hashable {
    var light: AccentTone
    var dark: AccentTone
    var paper: String?
}
