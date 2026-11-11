import Foundation
import UserNotifications
import WatchConnectivity

/// The phone's end of the Apple Watch app (ios/App/RerackWatch). Started from AppDelegate at launch, so it also runs
/// when the watch wakes the app in the background, where no web view (and no JS) exists.
///
/// - Watch → phone: each change logged on the watch is an op (`WatchOp` in src/core/watch.ts), sent as a message
///   when the phone is reachable, else queued by WatchConnectivity (`transferUserInfo`). Ops are kept here, in order,
///   until JS (src/native/watch.ts) has applied them to the app's data and acknowledged them; repeats are ignored by
///   their running number. Meanwhile the lock screen is updated natively from what the op says it shows.
/// - Phone → watch: JS sends a `WatchState` whenever the open workout or the workouts change; it goes out as the
///   application context (only the newest is kept), with the last op applied, so the watch knows which of its own
///   changes the state already has.
final class WatchBridge: NSObject, WCSessionDelegate {
    static let shared = WatchBridge()
    /// Posted (on the main queue) when ops arrive, and when the watch's workout starts or stops.
    static let opsChanged = Notification.Name("WatchBridge.opsChanged")
    static let statusChanged = Notification.Name("WatchBridge.statusChanged")

    private let defaults = UserDefaults.standard
    private let queue = DispatchQueue(label: "WatchBridge")
    private enum Key {
        static let ops = "watch.ops"
        static let src = "watch.src"
        static let received = "watch.receivedSeq"
        static let applied = "watch.appliedSeq"
        static let state = "watch.state"
        static let running = "watch.runningSessionId"
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: For WatchPlugin (JS)

    /// The ops not yet applied, oldest first.
    func pendingOps() -> [String] {
        queue.sync { defaults.stringArray(forKey: Key.ops) ?? [] }
    }

    /// Ops up to `seq` from `src` are applied: drops them. The watch hears with the next state (JS sends one, built
    /// after applying them), so it never takes an older state as having them.
    func acknowledge(src: String, seq: Int) {
        queue.sync {
            let left = (defaults.stringArray(forKey: Key.ops) ?? []).filter { raw in
                guard let op = Self.header(raw) else { return false }
                return !(op.src == src && op.seq <= seq)
            }
            defaults.set(left, forKey: Key.ops)
            if defaults.string(forKey: Key.src) == src, seq > defaults.integer(forKey: Key.applied) {
                defaults.set(seq, forKey: Key.applied)
            }
        }
    }

    /// What the watch should show; sent now if the watch app is there.
    func updateState(json: String) {
        queue.sync { defaults.set(json, forKey: Key.state) }
        sendContext()
    }

    var runningSessionId: String? {
        queue.sync { defaults.string(forKey: Key.running) }
    }

    private func sendContext() {
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        let context: [String: Any] = queue.sync {
            [
                "state": defaults.string(forKey: Key.state) ?? "",
                "src": defaults.string(forKey: Key.src) ?? "",
                "applied": defaults.integer(forKey: Key.applied),
            ]
        }
        do {
            try session.updateApplicationContext(context)
        } catch {
            NSLog("[Watch] context not sent: %@", error.localizedDescription)
        }
    }

    // MARK: Receiving ops

    private struct Header: Decodable {
        let src: String
        let seq: Int
        let kind: String
        let sessionId: String
        let running: Bool?
        /// What the watch shows now, for the lock screen (exercise, set, rest end in ms or 0, picture address).
        let display: Display?
    }

    struct Display: Decodable {
        let exercise: String
        let detail: String
        let restEndsAt: Double
        let image: String?
    }

    private static func header(_ raw: String) -> Header? {
        raw.data(using: .utf8).flatMap { try? JSONDecoder().decode(Header.self, from: $0) }
    }

    private func receive(_ payload: [String: Any]) {
        guard let raw = payload["op"] as? String, let op = Self.header(raw) else { return }
        let isNew: Bool = queue.sync {
            if defaults.string(forKey: Key.src) != op.src {
                // The watch app was reinstalled (or is new): its numbering starts again.
                defaults.set(op.src, forKey: Key.src)
                defaults.set(0, forKey: Key.received)
                defaults.set(0, forKey: Key.applied)
            }
            guard op.seq > defaults.integer(forKey: Key.received) else { return false }
            defaults.set(op.seq, forKey: Key.received)
            var ops = defaults.stringArray(forKey: Key.ops) ?? []
            ops.append(raw)
            defaults.set(ops, forKey: Key.ops)
            if op.kind == "presence" {
                defaults.set(op.running == true ? op.sessionId : nil, forKey: Key.running)
            }
            return true
        }
        guard isNew else { return }
        updateLockScreen(op)
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: Self.opsChanged, object: nil)
            if op.kind == "presence" { NotificationCenter.default.post(name: Self.statusChanged, object: nil) }
        }
    }

    /// The JS that normally keeps the Live Activity and the "Rest over" notification current may not be running, so
    /// the lock screen follows the watch from here: the watch alerts rest itself, so the phone's alert is cancelled.
    private func updateLockScreen(_ op: Header) {
        let center = UNUserNotificationCenter.current()
        switch op.kind {
        case "finish", "cancel":
            center.removePendingNotificationRequests(withIdentifiers: ["1"])
            Task { await RestActivityPlugin.endAll() }
        default:
            guard let display = op.display else { return }
            if op.kind == "rest" { center.removePendingNotificationRequests(withIdentifiers: ["1"]) }
            Task {
                await RestActivityPlugin.updateRunning(
                    exercise: display.exercise,
                    detail: display.detail,
                    restEndsAt: display.restEndsAt > 0 ? Date(timeIntervalSince1970: display.restEndsAt / 1000) : nil,
                    image: display.image
                )
            }
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error { NSLog("[Watch] activation failed: %@", error.localizedDescription) }
        if activationState == .activated { sendContext() }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Switched to another watch: start talking to the new one.
        WCSession.default.activate()
    }

    func sessionWatchStateDidChange(_ session: WCSession) {
        sendContext()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        receive(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        receive(message)
        replyHandler(["ok": true])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        receive(userInfo)
    }
}
