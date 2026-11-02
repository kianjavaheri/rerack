import SwiftUI
import WidgetKit

/// The home-screen widget: the next workout the followed routine plans and when (small), plus this week's trained and
/// planned days (medium). Drawn from what the app last saved (HomeWidgetData); the day itself is worked out here, and
/// a new entry at each midnight keeps "Today" and the week right while the app stays closed.
struct HomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HomeWidget", provider: HomeProvider()) { entry in
            HomeWidgetView(entry: entry)
        }
        .configurationDisplayName("Up next")
        .description("Your next workout, and this week's training.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct HomeEntry: TimelineEntry {
    let date: Date
    let data: HomeWidgetData?
}

struct HomeProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeEntry { HomeEntry(date: Date(), data: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (HomeEntry) -> Void) {
        completion(HomeEntry(date: Date(), data: HomeWidgetData.load() ?? (context.isPreview ? .sample : nil)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HomeEntry>) -> Void) {
        let data = HomeWidgetData.load()
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: Date())
        // Now, then each of the next seven midnights; the app asks for a fresh timeline whenever its data changes.
        var entries = [HomeEntry(date: Date(), data: data)]
        for day in 1...7 {
            if let midnight = calendar.date(byAdding: .day, value: day, to: start) { entries.append(HomeEntry(date: midnight, data: data)) }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

private extension HomeWidgetData {
    static let sample = HomeWidgetData(routine: "Push / Pull / Legs", days: (0..<14).map { i in
        let date = Calendar.current.date(byAdding: .day, value: i - 2, to: Date())!
        return Day(date: dayKey(date), planned: i % 2 == 0 ? [["Push", "Pull", "Legs"][(i / 2) % 3]] : [], done: i < 2 && i % 2 == 0)
    }, writtenAt: Date().timeIntervalSince1970 * 1000)
}

private func dayKey(_ date: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

private func date(fromKey key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
}

/// What the entry's day comes to: the next planned workout (today's is skipped once trained), and this week.
private struct HomeState {
    struct WeekDay {
        let letter: String
        let isToday: Bool
        /// done, planned (still to come), missed (planned, passed, not done), rest.
        let kind: Kind
        enum Kind { case done, planned, missed, rest }
    }

    let next: (names: String, when: String)?
    let routine: String?
    let week: [WeekDay]
    let doneCount: Int
    let plannedCount: Int

    init(data: HomeWidgetData?, now: Date) {
        let calendar = Calendar.current
        let today = dayKey(now)
        let written = dayKey(Date(timeIntervalSince1970: (data?.writtenAt ?? 0) / 1000))
        let byDate = Dictionary((data?.days ?? []).map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        // Trained that day, as far as the app knew when it last wrote (later days aren't known yet).
        func done(_ key: String) -> Bool { key <= written && byDate[key]?.done == true }

        routine = data?.routine
        var found: (String, String)?
        if let days = data?.days {
            for day in days where day.date >= today && !day.planned.isEmpty {
                if day.date == today && done(today) { continue }
                guard let date = date(fromKey: day.date) else { continue }
                let when: String
                if day.date == today { when = "Today" }
                else if calendar.isDateInTomorrow(date) { when = "Tomorrow" }
                else { when = date.formatted(.dateTime.weekday(.wide)) }
                found = (day.planned.joined(separator: " & "), when)
                break
            }
        }
        next = found

        // Monday to Sunday of the entry's week.
        let weekday = calendar.component(.weekday, from: now) // 1 = Sunday
        let monday = calendar.date(byAdding: .day, value: -((weekday + 5) % 7), to: calendar.startOfDay(for: now))!
        var week: [WeekDay] = []
        var doneCount = 0
        var plannedCount = 0
        for i in 0..<7 {
            let date = calendar.date(byAdding: .day, value: i, to: monday)!
            let key = dayKey(date)
            let planned = !(byDate[key]?.planned.isEmpty ?? true)
            let kind: WeekDay.Kind
            if done(key) { kind = .done; doneCount += 1 }
            else if planned && key >= today { kind = .planned }
            else if planned { kind = .missed }
            else { kind = .rest }
            if planned { plannedCount += 1 }
            week.append(WeekDay(letter: String(date.formatted(.dateTime.weekday(.narrow))), isToday: key == today, kind: kind))
        }
        self.week = week
        self.doneCount = doneCount
        self.plannedCount = plannedCount
    }
}

struct HomeWidgetView: View {
    let entry: HomeEntry
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let palette = Palette.of(dark: colorScheme == .dark)
        let state = HomeState(data: entry.data, now: entry.date)
        Group {
            if family == .systemMedium {
                HStack(alignment: .top, spacing: 16) {
                    NextWorkout(state: state, palette: palette)
                    WeekView(state: state, palette: palette)
                }
            } else {
                NextWorkout(state: state, palette: palette)
            }
        }
        .containerBackground(for: .widget) { palette.background }
        // Opens Check in (or the workout already under way), where the next workout is started: src/native/links.ts.
        .widgetURL(URL(string: "rerack://check-in"))
    }
}

private struct NextWorkout: View {
    let state: HomeState
    let palette: Palette

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            LogoMark().fill(palette.gradient).frame(width: 26, height: 20)
            Spacer(minLength: 6)
            Text("UP NEXT")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(palette.muted)
            if let next = state.next {
                Text(next.names)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(palette.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text(next.when)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(palette.accent)
            } else {
                Text(state.routine == nil ? "Pick a routine to follow" : "Nothing planned")
                    .font(.headline)
                    .foregroundStyle(palette.text)
                    .lineLimit(2)
            }
            if let routine = state.routine {
                Text(routine)
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct WeekView: View {
    let state: HomeState
    let palette: Palette

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("THIS WEEK")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(palette.muted)
            HStack(spacing: 0) {
                ForEach(Array(state.week.enumerated()), id: \.offset) { _, day in
                    VStack(spacing: 6) {
                        Text(day.letter)
                            .font(.caption2.weight(day.isToday ? .bold : .medium))
                            .foregroundStyle(day.isToday ? palette.accent : palette.muted)
                        DayMark(kind: day.kind, palette: palette)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            Spacer(minLength: 0)
            Text(state.plannedCount > 0 ? "\(state.doneCount) of \(state.plannedCount) done" : "\(state.doneCount) trained")
                .font(.caption.weight(.medium))
                .foregroundStyle(palette.text)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct DayMark: View {
    let kind: HomeState.WeekDay.Kind
    let palette: Palette

    var body: some View {
        ZStack {
            switch kind {
            case .done:
                Circle().fill(palette.gradient)
                Image(systemName: "checkmark").font(.system(size: 9, weight: .heavy)).foregroundStyle(palette.background)
            case .planned:
                Circle().strokeBorder(palette.accent, lineWidth: 2)
            case .missed:
                Circle().strokeBorder(palette.muted.opacity(0.5), lineWidth: 1.5)
            case .rest:
                Circle().fill(palette.muted.opacity(0.25)).frame(width: 6, height: 6)
            }
        }
        .frame(width: 20, height: 20)
    }
}
