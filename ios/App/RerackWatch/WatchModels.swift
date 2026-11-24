import Foundation

// Mirrors of the app's records (src/core/types.ts) and the watch's messages (src/core/watch.ts): keep them in step.
// Only what the watch uses is decoded; it never sends a whole session back except one it started itself.

/// Numbers from JS may come as 8 or 8.0.
private func decodeInt<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Int? {
    (try? c.decodeIfPresent(Double.self, forKey: key)).flatMap { $0.map { Int($0.rounded()) } }
}

struct SetLog: Codable, Identifiable, Equatable {
    var id: String
    var reps: Int?
    var weightKg: Double?
    var done: Bool
    var warmup: Bool?
    var drop: Bool?
    var doneAt: String?
    var right: Side?

    init(id: String = newId(), reps: Int? = nil, weightKg: Double? = nil, done: Bool = false) {
        self.id = id
        self.reps = reps
        self.weightKg = weightKg
        self.done = done
    }

    enum CodingKeys: String, CodingKey { case id, reps, weightKg, done, warmup, drop, doneAt, right }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        reps = decodeInt(c, .reps)
        weightKg = try c.decodeIfPresent(Double.self, forKey: .weightKg)
        done = (try? c.decode(Bool.self, forKey: .done)) ?? false
        warmup = try c.decodeIfPresent(Bool.self, forKey: .warmup)
        drop = try c.decodeIfPresent(Bool.self, forKey: .drop)
        doneAt = try c.decodeIfPresent(String.self, forKey: .doneAt)
        right = try? c.decodeIfPresent(Side.self, forKey: .right)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        // null, not left out: Firestore won't store a missing (undefined) field.
        try c.encode(reps, forKey: .reps)
        try c.encode(weightKg, forKey: .weightKg)
        try c.encode(done, forKey: .done)
        try c.encodeIfPresent(warmup, forKey: .warmup)
        try c.encodeIfPresent(drop, forKey: .drop)
        try c.encodeIfPresent(doneAt, forKey: .doneAt)
        try c.encodeIfPresent(right, forKey: .right)
    }

    var isWarmup: Bool { warmup == true }
    var isDrop: Bool { drop == true }
    /// `isCompletedSet`: counts in stats once it has reps and isn't a warm-up.
    var isCompleted: Bool { (reps ?? 0) > 0 && !isWarmup }
}

struct SessionEntry: Codable, Identifiable, Equatable {
    var id: String
    var exerciseId: String
    var perSide: Bool?
    var sides: Bool?
    var sets: [SetLog]
    var targetSets: Int?
    var targetReps: String?
    var notes: String?
    var supersetNext: Bool?

    init(id: String, exerciseId: String, perSide: Bool?, sides: Bool? = nil, sets: [SetLog], targetSets: Int?, targetReps: String?, notes: String?, supersetNext: Bool?) {
        self.id = id
        self.exerciseId = exerciseId
        self.perSide = perSide
        self.sides = sides
        self.sets = sets
        self.targetSets = targetSets
        self.targetReps = targetReps
        self.notes = notes
        self.supersetNext = supersetNext
    }

    enum CodingKeys: String, CodingKey { case id, exerciseId, perSide, sides, sets, targetSets, targetReps, notes, supersetNext }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        exerciseId = try c.decode(String.self, forKey: .exerciseId)
        perSide = try c.decodeIfPresent(Bool.self, forKey: .perSide)
        sides = try c.decodeIfPresent(Bool.self, forKey: .sides)
        sets = try c.decodeIfPresent([SetLog].self, forKey: .sets) ?? []
        targetSets = decodeInt(c, .targetSets)
        targetReps = try? c.decodeIfPresent(String.self, forKey: .targetReps)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
        supersetNext = try c.decodeIfPresent(Bool.self, forKey: .supersetNext)
    }
}

struct Session: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var workoutId: String?
    var routineId: String?
    var startedAt: String
    var finishedAt: String?
    var live: Bool?
    var restEndsAt: String?
    var restLength: Double?
    var restExerciseId: String?
    var restHidden: Bool?
    var lastActivityAt: String?
    var entries: [SessionEntry]

    init(id: String, name: String, workoutId: String?, routineId: String?, startedAt: String, entries: [SessionEntry]) {
        self.id = id
        self.name = name
        self.workoutId = workoutId
        self.routineId = routineId
        self.startedAt = startedAt
        self.finishedAt = nil
        self.live = true
        self.lastActivityAt = startedAt
        self.entries = entries
    }

    enum CodingKeys: String, CodingKey {
        case id, name, workoutId, routineId, startedAt, finishedAt, live, restEndsAt, restLength, restExerciseId, restHidden, lastActivityAt, entries
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(workoutId, forKey: .workoutId)
        try c.encode(routineId, forKey: .routineId)
        try c.encode(startedAt, forKey: .startedAt)
        try c.encode(finishedAt, forKey: .finishedAt)
        try c.encodeIfPresent(live, forKey: .live)
        try c.encodeIfPresent(restEndsAt, forKey: .restEndsAt)
        try c.encodeIfPresent(restLength, forKey: .restLength)
        try c.encodeIfPresent(restExerciseId, forKey: .restExerciseId)
        try c.encodeIfPresent(restHidden, forKey: .restHidden)
        try c.encodeIfPresent(lastActivityAt, forKey: .lastActivityAt)
        try c.encode(entries, forKey: .entries)
    }

    var isOpen: Bool { finishedAt == nil && live != false }
    var startDate: Date { parseDate(startedAt) ?? Date() }
    var restEnd: Date? { restEndsAt.flatMap(parseDate) }
}

struct Side: Codable, Equatable {
    var reps: Int?
    var weightKg: Double?

    enum CodingKeys: String, CodingKey { case reps, weightKg }

    init(reps: Int?, weightKg: Double?) {
        self.reps = reps
        self.weightKg = weightKg
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reps = decodeInt(c, .reps)
        weightKg = try c.decodeIfPresent(Double.self, forKey: .weightKg)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(reps, forKey: .reps)
        try c.encode(weightKg, forKey: .weightKg)
    }
}

struct WatchSet: Codable, Equatable {
    var reps: Int?
    var weightKg: Double?
    var right: Side?

    enum CodingKeys: String, CodingKey { case reps, weightKg, right }

    init(reps: Int?, weightKg: Double?, right: Side? = nil) {
        self.reps = reps
        self.weightKg = weightKg
        self.right = right
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reps = decodeInt(c, .reps)
        weightKg = try c.decodeIfPresent(Double.self, forKey: .weightKg)
        right = try? c.decodeIfPresent(Side.self, forKey: .right)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(reps, forKey: .reps)
        try c.encode(weightKg, forKey: .weightKg)
        try c.encodeIfPresent(right, forKey: .right)
    }
}

struct WatchExercise: Codable, Equatable {
    var name: String
    var rest: Double
    var bodyweight: Bool
    var image: String
    /// Barbell lifts only: the bar's weight in the display unit (Per side is offered).
    var bar: Double?
}

struct WatchSlot: Codable, Equatable {
    var exerciseId: String
    var targetSets: Int
    var targetReps: String?
    var notes: String?
    var supersetNext: Bool?
    var perSide: Bool?
    var sides: Bool?
    var last: [WatchSet]
}

struct WatchWorkout: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var routineId: String?
    var slots: [WatchSlot]
}

struct WatchState: Codable, Equatable {
    var v: Int
    var unit: String
    var restOn: Bool
    var defaultRest: Double
    /// Settings' "Rest after an exercise's last set" (missing from older phones: off).
    var restAfterLastSet: Bool?
    /// A turn of the Crown on a set's weight, in `unit` (missing from older phones: 5 lb / 2.5 kg).
    var weightStep: Double?
    /// The app's dark-mode accent ("purple"), or nil for the warm one (`Settings.darkAccent`).
    var accent: String?
    var session: Session?
    var last: [String: [WatchSet]]
    var exercises: [String: WatchExercise]
    var upNext: String?
    var workouts: [WatchWorkout]

    var isKg: Bool { unit == "kg" }
}

/// What the phone's lock screen should show (WatchBridge on the phone updates the Live Activity from it).
struct WatchDisplay: Codable, Equatable {
    var exercise: String
    var detail: String
    /// ms since 1970, 0 when not resting.
    var restEndsAt: Double
    var image: String
}

/// One change made on the watch (`WatchOp`). Values, not changes: a set as it is now, the rest's end.
struct WatchOp: Codable, Equatable {
    var src: String
    var seq: Int
    var at: String
    var sessionId: String
    var kind: String
    var session: Session?
    var entryId: String?
    var set: SetLog?
    var restEndsAt: String?
    var restLength: Double?
    var restExerciseId: String?
    var restHidden: Bool?
    var finishedAt: String?
    var healthSaved: Bool?
    var running: Bool?
    var perSide: Bool?
    var display: WatchDisplay?
    /// Kept on the watch only: last time's sets for a workout it started, until the phone's state has them.
    var startLast: [String: [WatchSet]]?

    enum CodingKeys: String, CodingKey {
        case src, seq, at, sessionId, kind, session, entryId, set, restEndsAt, restLength, restExerciseId, restHidden, finishedAt, healthSaved, running, perSide, display, startLast
    }

    init(kind: String, sessionId: String) {
        src = ""
        seq = 0
        at = isoNow()
        self.sessionId = sessionId
        self.kind = kind
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(src, forKey: .src)
        try c.encode(seq, forKey: .seq)
        try c.encode(at, forKey: .at)
        try c.encode(sessionId, forKey: .sessionId)
        try c.encode(kind, forKey: .kind)
        try c.encodeIfPresent(session, forKey: .session)
        try c.encodeIfPresent(entryId, forKey: .entryId)
        try c.encodeIfPresent(set, forKey: .set)
        // A rest op always says when it ends (null: stopped).
        if kind == "rest" { try c.encode(restEndsAt, forKey: .restEndsAt) }
        try c.encodeIfPresent(restLength, forKey: .restLength)
        try c.encodeIfPresent(restExerciseId, forKey: .restExerciseId)
        try c.encodeIfPresent(restHidden, forKey: .restHidden)
        try c.encodeIfPresent(finishedAt, forKey: .finishedAt)
        try c.encodeIfPresent(healthSaved, forKey: .healthSaved)
        try c.encodeIfPresent(running, forKey: .running)
        try c.encodeIfPresent(perSide, forKey: .perSide)
        try c.encodeIfPresent(display, forKey: .display)
        try c.encodeIfPresent(startLast, forKey: .startLast)
    }
}

// MARK: Helpers

func newId() -> String { UUID().uuidString.lowercased() }

private let isoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

/// Like JS's `toISOString()`.
func isoString(_ date: Date) -> String { isoFormatter.string(from: date) }
func isoNow() -> String { isoString(Date()) }
func parseDate(_ text: String) -> Date? { isoFormatter.date(from: text) ?? ISO8601DateFormatter().date(from: text) }

let kgPerLb = 0.45359237

/// Plates for one side of the bar, heaviest first ("45 + 25" for 70 lb), as `platesPerSide` in src/core/plates.ts.
/// Nil when standard plates can't make it exactly.
func plateParts(_ side: Double, isKg: Bool) -> [Double]? {
    var left = side
    var parts: [Double] = []
    for plate in isKg ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5] {
        while left >= plate - 1e-9 {
            parts.append(plate)
            left -= plate
        }
    }
    return left < 1e-6 ? parts : nil
}

/// Runs of the same plate: [45, 45, 45, 45, 10] → 45 × 4, 10 × 1.
func plateGroups(_ parts: [Double]) -> [(plate: Double, count: Int)] {
    var groups: [(plate: Double, count: Int)] = []
    for plate in parts {
        if let last = groups.last, last.plate == plate {
            groups[groups.count - 1].count += 1
        } else {
            groups.append((plate, 1))
        }
    }
    return groups
}
