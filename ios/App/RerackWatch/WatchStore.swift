import Foundation
import SwiftUI
import UserNotifications
import WatchConnectivity
import WatchKit

/// The watch's copy of the live workout, and its link to the phone.
///
/// The phone sends a `WatchState` (the open workout, set placeholders, rest lengths, workouts to start) as the
/// application context. Everything done here is an op (`WatchOp`): applied to the local copy at once, kept in `pending`
/// and sent to the phone in order (`transferUserInfo`, which WatchConnectivity queues and delivers even if the phone
/// app isn't running; a message alongside wakes it). What's shown is the phone's state with the pending ops replayed
/// over it, so a state from before an op never undoes it. The phone says which ops it has applied (`applied` in the
/// context); those are dropped. Ops carry values (a set as it is now), so replaying one twice does no harm.
@MainActor
final class WatchStore: NSObject, ObservableObject {
    static let shared = WatchStore()

    @Published private(set) var state: WatchState?
    @Published private(set) var pending: [WatchOp] = []
    /// The open workout as the watch sees it (nil when there's none).
    @Published private(set) var session: Session?
    /// The set on screen.
    @Published private(set) var focus: SetRef?
    /// The workout's page: 0 the set (or rest), 1 the exercises, 2 the workout's controls.
    @Published var page = 0

    let workout = WorkoutManager()

    /// Picked by hand (from the list, or ‹ ›): stays put until it's checked off; otherwise the current set follows along.
    private var focusPinned = false
    private var src: String
    private var seq: Int
    private var startingWorkout = false
    private var scheduledRest: String?

    private enum Key {
        static let src = "src", seq = "seq", pending = "pending", state = "state"
    }

    override private init() {
        let defaults = UserDefaults.standard
        if let saved = defaults.string(forKey: Key.src) {
            src = saved
        } else {
            src = newId()
            defaults.set(src, forKey: Key.src)
        }
        seq = defaults.integer(forKey: Key.seq)
        if let data = defaults.data(forKey: Key.pending), let ops = try? JSONDecoder().decode([WatchOp].self, from: data) {
            pending = ops
        }
        if let data = defaults.data(forKey: Key.state), let saved = try? JSONDecoder().decode(WatchState.self, from: data) {
            state = saved
        }
        super.init()
        UNUserNotificationCenter.current().delegate = self
        recompute()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    // MARK: Reading

    var isKg: Bool { state?.isKg ?? false }
    var restOn: Bool { state?.restOn ?? true }

    func exercise(_ id: String) -> WatchExercise? { state?.exercises[id] }
    func exerciseName(_ id: String) -> String { exercise(id)?.name ?? "Exercise" }

    /// Last time's sets for an entry: from the phone's state, or (for a workout started here) from the start.
    func last(for entryId: String) -> [WatchSet] {
        if let sets = state?.last[entryId] { return sets }
        for op in pending.reversed() { if let sets = op.startLast?[entryId] { return sets } }
        return []
    }

    func lookup(_ ref: SetRef) -> (entry: SessionEntry, index: Int)? {
        guard let entry = session?.entries.first(where: { $0.id == ref.entryId }),
              let index = entry.sets.firstIndex(where: { $0.id == ref.setId }) else { return nil }
        return (entry, index)
    }

    var restEnd: Date? {
        guard restOn, let session, session.restHidden != true else { return nil }
        return session.restEnd
    }

    /// What the rest bar's Start uses: the last rest's length, else the default.
    var barRest: Double {
        if let length = session?.restLength, length > 0 { return length }
        return state?.defaultRest ?? 120
    }

    var upNext: WatchWorkout? { state?.workouts.first { $0.id == state?.upNext } }

    // MARK: Logging

    /// Checks a set off with these values (or updates a set already checked). Rest starts unless it's a warm-up or the
    /// exercise's last set, or the exercise is linked to the next one (rest after the superset's last).
    func check(_ ref: SetRef, reps: Int, weightKg: Double?) {
        guard let session, let (entry, index) = lookup(ref), reps > 0 else { return }
        var set = entry.sets[index]
        let wasDone = set.done
        set.reps = reps
        set.weightKg = weightKg
        set.done = true
        if !wasDone { set.doneAt = isoNow() }
        var op = WatchOp(kind: "set", sessionId: session.id)
        op.entryId = entry.id
        op.set = set
        focusPinned = false
        let finished = entry.sets.allSatisfy { $0.id == set.id || $0.done }
        push(op)
        if wasDone { return }
        WKInterfaceDevice.current().play(finished ? .success : .click)
        if !set.isWarmup && (!finished || state?.restAfterLastSet == true) && entry.supersetNext != true { startRest(after: entry.exerciseId) }
    }

    func uncheck(_ ref: SetRef) {
        guard let session, let (entry, index) = lookup(ref) else { return }
        var set = entry.sets[index]
        set.done = false
        set.doneAt = nil
        var op = WatchOp(kind: "set", sessionId: session.id)
        op.entryId = entry.id
        op.set = set
        focusPinned = true
        push(op)
        WKInterfaceDevice.current().play(.directionDown)
        // Checked by accident: the rest it started goes too.
        if session.restEnd != nil, session.restExerciseId == entry.exerciseId { stopRest() }
    }

    /// The weight step for the Crown, in the display unit (Settings → Apple Watch weight step).
    var weightStep: Double {
        if let step = state?.weightStep, step > 0 { return step }
        return isKg ? 2.5 : 5
    }

    /// Per side on or off for this exercise in this workout (barbell lifts): the weight shows one side of the bar.
    func setPerSide(_ on: Bool, entryId: String) {
        guard let session else { return }
        var op = WatchOp(kind: "perSide", sessionId: session.id)
        op.entryId = entryId
        op.perSide = on
        push(op)
    }

    /// A set more for this exercise (its weight copied from the last one), shown next.
    func addSet(to entryId: String) {
        guard let session, let entry = session.entries.first(where: { $0.id == entryId }) else { return }
        let set = SetLog(weightKg: entry.sets.last?.weightKg)
        var op = WatchOp(kind: "set", sessionId: session.id)
        op.entryId = entryId
        op.set = set
        push(op)
        pick(SetRef(entryId: entryId, setId: set.id))
    }

    func pick(_ ref: SetRef) {
        focus = ref
        focusPinned = true
        page = 0
    }

    /// The set before or after the one on screen, through every exercise in order.
    func step(_ by: Int) {
        guard let session else { return }
        let all = session.entries.flatMap { e in e.sets.map { SetRef(entryId: e.id, setId: $0.id) } }
        guard let focus, let i = all.firstIndex(of: focus) else { return }
        let next = i + by
        if all.indices.contains(next) {
            self.focus = all[next]
            focusPinned = true
        }
    }

    func canStep(_ by: Int) -> Bool {
        guard let session, let focus else { return false }
        let all = session.entries.flatMap { e in e.sets.map { SetRef(entryId: e.id, setId: $0.id) } }
        guard let i = all.firstIndex(of: focus) else { return false }
        return all.indices.contains(i + by)
    }

    // MARK: Rest

    private func startRest(after exerciseId: String) {
        guard let session, restOn, session.restHidden != true else { return }
        let seconds = exercise(exerciseId)?.rest ?? state?.defaultRest ?? 120
        guard seconds > 0 else { return }
        var op = WatchOp(kind: "rest", sessionId: session.id)
        op.restEndsAt = isoString(Date().addingTimeInterval(seconds))
        op.restLength = seconds
        op.restExerciseId = exerciseId
        push(op)
    }

    /// The rest bar's Start: the last rest's length again.
    func startRest() {
        guard let session else { return }
        var op = WatchOp(kind: "rest", sessionId: session.id)
        op.restEndsAt = isoString(Date().addingTimeInterval(barRest))
        op.restHidden = false
        push(op)
    }

    /// ±15 s, as on the phone (from now if the rest is already over); taken down to nothing, it ends.
    func adjustRest(_ seconds: Double) {
        guard let session, let end = session.restEnd else { return }
        let next = max(Date(), end).addingTimeInterval(seconds)
        var op = WatchOp(kind: "rest", sessionId: session.id)
        op.restEndsAt = next > Date() ? isoString(next) : nil
        push(op)
    }

    func stopRest() {
        guard let session else { return }
        var op = WatchOp(kind: "rest", sessionId: session.id)
        op.restEndsAt = nil
        push(op)
    }

    // MARK: Starting and finishing

    /// Builds the workout's session here (as `createSessionFromWorkout` does), so it starts without the phone.
    func start(_ workout: WatchWorkout) {
        guard session == nil else { return }
        var last: [String: [WatchSet]] = [:]
        let entries = workout.slots.map { slot -> SessionEntry in
            let entry = SessionEntry(
                id: newId(), exerciseId: slot.exerciseId, perSide: slot.perSide,
                sets: (0..<max(1, slot.targetSets)).map { _ in SetLog() },
                targetSets: slot.targetSets, targetReps: slot.targetReps, notes: slot.notes, supersetNext: slot.supersetNext
            )
            last[entry.id] = slot.last
            return entry
        }
        let made = Session(id: newId(), name: workout.name, workoutId: workout.id, routineId: workout.routineId, startedAt: isoNow(), entries: entries)
        var op = WatchOp(kind: "start", sessionId: made.id)
        op.session = made
        op.startLast = last
        focusPinned = false
        focus = nil
        page = 0
        push(op)
    }

    var loggedSets: Int { session?.entries.reduce(0) { $0 + $1.sets.filter(\.isCompleted).count } ?? 0 }

    /// Finishes it: the workout session ends and is saved to Health, then the phone is told (and skips its own save if
    /// this one worked). Needs a logged set, as on the phone.
    func finish() async {
        guard let session, loggedSets > 0 else { return }
        let end = Date()
        let saved = workout.runningFor == session.id ? await workout.finish(name: session.name, at: end) : false
        var op = WatchOp(kind: "finish", sessionId: session.id)
        op.finishedAt = isoString(end)
        op.healthSaved = saved
        push(op)
        sendPresence(sessionId: session.id, running: false)
        WKInterfaceDevice.current().play(.success)
    }

    func cancel() {
        guard let session else { return }
        workout.discard()
        push(WatchOp(kind: "cancel", sessionId: session.id))
        sendPresence(sessionId: session.id, running: false)
    }

    // MARK: Ops

    private func push(_ made: WatchOp) {
        var op = made
        seq += 1
        UserDefaults.standard.set(seq, forKey: Key.seq)
        op.src = src
        op.seq = seq
        if ["set", "rest", "start"].contains(op.kind), let after = Self.replay(session ?? state?.session, op) {
            op.display = display(for: after)
        }
        pending.append(op)
        savePending()
        recompute()
        send(op)
    }

    private func sendPresence(sessionId: String, running: Bool) {
        var op = WatchOp(kind: "presence", sessionId: sessionId)
        op.running = running
        push(op)
    }

    /// What the phone's lock screen shows after this op.
    private func display(for session: Session) -> WatchDisplay {
        var display = WatchDisplay(exercise: "All sets done", detail: "\(session.entries.count) exercises", restEndsAt: 0, image: "")
        if let ref = currentSet(session), let entry = session.entries.first(where: { $0.id == ref.entryId }),
           let set = entry.sets.first(where: { $0.id == ref.setId }) {
            display.exercise = exerciseName(entry.exerciseId)
            display.detail = setLabel(entry, set)
            display.image = exercise(entry.exerciseId)?.image ?? ""
        }
        if restOn, session.restHidden != true, let end = session.restEnd { display.restEndsAt = end.timeIntervalSince1970 * 1000 }
        return display
    }

    private func send(_ op: WatchOp) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        var wire = op
        wire.startLast = nil
        guard let data = try? JSONEncoder().encode(wire), let raw = String(data: data, encoding: .utf8) else { return }
        // Queued, in order, delivered even to a phone app that isn't running…
        WCSession.default.transferUserInfo(["op": raw])
        // …and a message alongside wakes it up (in the background) to take them now.
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(["ping": true], replyHandler: { _ in }, errorHandler: { _ in })
        }
    }

    /// After launching: ops not on their way yet (made before the link was up) go out again. Ones the phone already
    /// has are ignored there by their number.
    private func resendUnsent() {
        let outstanding = Set(WCSession.default.outstandingUserInfoTransfers.compactMap { $0.userInfo["op"] as? String })
        for op in pending {
            var wire = op
            wire.startLast = nil
            guard let data = try? JSONEncoder().encode(wire), let raw = String(data: data, encoding: .utf8) else { continue }
            if !outstanding.contains(raw) { send(op) }
        }
    }

    private func savePending() {
        if let data = try? JSONEncoder().encode(pending) { UserDefaults.standard.set(data, forKey: Key.pending) }
    }

    /// One op applied to a session (`applyWatchOp` on the phone, less the reordering).
    static func replay(_ base: Session?, _ op: WatchOp) -> Session? {
        if op.kind == "start" { return base?.id == op.sessionId ? base : op.session }
        guard var s = base, s.id == op.sessionId else { return base }
        switch op.kind {
        case "set":
            guard let set = op.set, let e = s.entries.firstIndex(where: { $0.id == op.entryId }) else { return s }
            if let i = s.entries[e].sets.firstIndex(where: { $0.id == set.id }) {
                s.entries[e].sets[i] = set
            } else {
                s.entries[e].sets.append(set)
            }
            s.lastActivityAt = op.at
        case "perSide":
            guard let e = s.entries.firstIndex(where: { $0.id == op.entryId }) else { return s }
            s.entries[e].perSide = op.perSide == true ? true : nil
            s.lastActivityAt = op.at
        case "rest":
            guard s.finishedAt == nil else { return s }
            s.restEndsAt = op.restEndsAt
            if let length = op.restLength { s.restLength = length }
            if let id = op.restExerciseId { s.restExerciseId = id }
            if let hidden = op.restHidden { s.restHidden = hidden }
        case "finish":
            s.finishedAt = op.finishedAt
            s.restEndsAt = nil
        case "cancel":
            return nil
        default:
            break
        }
        return s
    }

    private func recompute() {
        var s = state?.session
        for op in pending { s = Self.replay(s, op) }
        let open = (s?.isOpen ?? false) ? s : nil
        if session != open { session = open }
        if let open {
            let valid = focus.map { ref in open.entries.contains { $0.id == ref.entryId && $0.sets.contains { $0.id == ref.setId } } } ?? false
            if !valid || !focusPinned {
                let next = currentSet(open)
                if focus != next { focus = next }
                if !valid { focusPinned = false }
            }
        } else if focus != nil {
            focus = nil
            focusPinned = false
        }
        syncWorkout()
        syncRestAlert()
    }

    /// The workout session runs while a workout is open here (and is dropped when it was finished or cancelled on the
    /// phone; the phone then saves it to Health itself).
    private func syncWorkout() {
        if let session, workout.isUnassigned {
            // The workout the phone launched this app for has arrived.
            Task {
                await workout.adopt(sessionId: session.id, name: session.name)
                sendPresence(sessionId: session.id, running: true)
                syncRestAlert()
            }
        } else if let session, workout.runningFor != session.id, !startingWorkout {
            startingWorkout = true
            Task {
                _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
                if await workout.start(sessionId: session.id, name: session.name, startedAt: session.startDate) {
                    sendPresence(sessionId: session.id, running: true)
                }
                startingWorkout = false
                syncRestAlert()
            }
        } else if session == nil, !workout.isUnassigned, let running = workout.runningFor, !startingWorkout {
            workout.discard()
            sendPresence(sessionId: running, running: false)
        }
    }

    /// The phone started a workout and launched this app for it (`HKHealthStore.startWatchApp`, as Hevy does): a tap on
    /// the wrist, and the workout session starts at once, which brings the app to the front. The workout itself follows
    /// in the phone's state a moment later and is tied to it then (`syncWorkout`); if it never comes, the session is
    /// dropped after a while.
    func launchedForWorkout() {
        WKInterfaceDevice.current().play(.start)
        page = 0
        guard session == nil, workout.runningFor == nil, !workout.isUnassigned, !startingWorkout else {
            recompute()
            return
        }
        startingWorkout = true
        Task {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            _ = await workout.start(sessionId: nil, name: nil, startedAt: Date())
            startingWorkout = false
            recompute()
            try? await Task.sleep(for: .seconds(120))
            if workout.isUnassigned { workout.discard() }
        }
    }

    /// "Rest over", on time even with the wrist down. Only while the workout session runs: the phone sends its own
    /// otherwise (it leaves it to the watch while told the watch is running this workout).
    /// A "Rest over" notification is waiting (it taps the wrist, in front or not), so the rest screen mustn't as well.
    var restAlertScheduled: Bool { !(scheduledRest ?? "").isEmpty }

    private func syncRestAlert() {
        let key = (workout.runningFor != nil && workout.runningFor == session?.id) ? (restEnd.map(isoString) ?? "") : ""
        guard key != scheduledRest else { return }
        scheduledRest = key
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["rest"])
        guard let end = restEnd, end > Date(), !key.isEmpty, let session else { return }
        let content = UNMutableNotificationContent()
        content.title = "Rest over"
        if let ref = currentSet(session), let entry = session.entries.first(where: { $0.id == ref.entryId }) {
            content.body = "Next: \(exerciseName(entry.exerciseId))"
        }
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, end.timeIntervalSinceNow), repeats: false)
        center.add(UNNotificationRequest(identifier: "rest", content: content, trigger: trigger))
    }

    // MARK: From the phone

    fileprivate func receive(context: [String: Any]) {
        guard let json = context["state"] as? String, let data = json.data(using: .utf8), !data.isEmpty,
              let next = try? JSONDecoder().decode(WatchState.self, from: data) else { return }
        state = next
        UserDefaults.standard.set(data, forKey: Key.state)
        if context["src"] as? String == src, let applied = context["applied"] as? Int {
            let before = pending.count
            pending.removeAll { $0.seq <= applied }
            if pending.count != before { savePending() }
        }
        recompute()
    }
}

extension WatchStore: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        let context = session.receivedApplicationContext
        Task { @MainActor in
            self.receive(context: context)
            self.resendUnsent()
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.receive(context: applicationContext) }
    }
}

extension WatchStore: UNUserNotificationCenterDelegate {
    /// "Rest over" with the app in front (screen on, or wrist down while the workout session keeps it there): the rest
    /// screen already shows it's over, so no banner, but the wrist is tapped here. Returning [] alone left it silent.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        guard notification.request.identifier == "rest" else { return [.banner, .sound] }
        await MainActor.run { WKInterfaceDevice.current().play(.notification) }
        return []
    }
}
