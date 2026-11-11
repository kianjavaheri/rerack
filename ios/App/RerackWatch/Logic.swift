import Foundation

// Ports of the app's rules the watch needs offline (src/core/sessions.ts, supersets.ts, SessionPage's `hint`).

/// A set's place: which entry, which set.
struct SetRef: Equatable, Hashable {
    var entryId: String
    var setId: String
}

/// `groupBounds`: the superset an entry belongs to (first and last index).
func groupBounds(_ entries: [SessionEntry], _ index: Int) -> (Int, Int) {
    var start = index
    while start > 0 && entries[start - 1].supersetNext == true { start -= 1 }
    var end = index
    while end < entries.count - 1 && entries[end].supersetNext == true { end += 1 }
    return (start, end)
}

/// The label for a set: "Warm-up", "Drop set" or "Set 2 of 3" (working sets only).
func setLabel(_ entry: SessionEntry, _ set: SetLog) -> String {
    if set.isWarmup { return "Warm-up" }
    if set.isDrop { return "Drop set" }
    let working = entry.sets.filter { !$0.isWarmup && !$0.isDrop }
    let n = (working.firstIndex { $0.id == set.id } ?? 0) + 1
    return "Set \(n) of \(working.count)"
}

/// `currentSet`: the exercise whose set was checked off last if it has sets left (in a superset, the next one round),
/// else the first exercise with a set left. Nil once every set is done.
func currentSet(_ session: Session) -> SetRef? {
    let entries = session.entries
    var lastIndex = -1
    var lastAt = Date.distantPast
    for (i, entry) in entries.enumerated() {
        for set in entry.sets where set.done {
            if let at = set.doneAt.flatMap(parseDate), at > lastAt {
                lastAt = at
                lastIndex = i
            }
        }
    }
    var order: [Int] = []
    if lastIndex >= 0 {
        let (start, end) = groupBounds(entries, lastIndex)
        let size = end - start + 1
        for k in 1...size { order.append(start + (lastIndex - start + k) % size) }
    }
    for i in entries.indices where !order.contains(i) { order.append(i) }
    for i in order {
        if let next = entries[i].sets.first(where: { !$0.done }) {
            return SetRef(entryId: entries[i].id, setId: next.id)
        }
    }
    return nil
}

/// SessionPage's `hint`: what you did in the set above this session (same kind of set) once anything's in it, else the
/// same working set last time.
func hint(_ entry: SessionEntry, _ index: Int, previous: [WatchSet]) -> WatchSet? {
    func kind(_ s: SetLog) -> Int { s.isWarmup ? 1 : s.isDrop ? 2 : 0 }
    let set = entry.sets[index]
    let above = entry.sets[..<index].last { kind($0) == kind(set) }
    let filled = (above?.reps != nil || above?.weightKg != nil) ? above : nil
    // Which of last time's sets this one lines up with (warm-ups don't count; drop sets do).
    let working = set.isWarmup ? -1 : entry.sets[..<index].filter { !$0.isWarmup }.count
    let before: WatchSet? = working < 0 ? nil : (working < previous.count ? previous[working] : previous.last)
    if filled == nil && before == nil { return nil }
    return WatchSet(reps: filled?.reps ?? before?.reps, weightKg: filled?.weightKg ?? before?.weightKg)
}

/// Weights in the user's unit, rounded to 0.1 like the app ("135", "61.2").
func displayWeight(_ kg: Double?, kg isKg: Bool) -> Double? {
    guard let kg else { return nil }
    let value = isKg ? kg : kg / kgPerLb
    return (value * 10).rounded() / 10
}

func formatNumber(_ value: Double) -> String {
    value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
}

func formatSet(reps: Int?, weightKg: Double?, isKg: Bool, bodyweight: Bool) -> String {
    let r = reps.map(String.init) ?? "–"
    guard let w = displayWeight(weightKg, kg: isKg), w > 0 else { return bodyweight ? "\(r) reps" : "\(r) × –" }
    return "\(r) × \(formatNumber(w)) \(isKg ? "kg" : "lb")"
}
