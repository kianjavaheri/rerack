import Capacitor
import Foundation
import HealthKit
import WatchConnectivity

/// `Watch` in JS (src/native/watch.ts): the web side of WatchBridge. JS sends the watch's state, takes the ops logged
/// on the watch, applies them to the app's data and acknowledges them.
@objc(WatchPlugin)
public class WatchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchPlugin"
    public let jsName = "Watch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeOps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackOps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startWatchApp", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()

    private var observers: [NSObjectProtocol] = []

    override public func load() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: WatchBridge.opsChanged, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("ops", data: [:])
        })
        observers.append(center.addObserver(forName: WatchBridge.statusChanged, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("status", data: [:])
        })
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    @objc func updateState(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("Needs json")
            return
        }
        WatchBridge.shared.updateState(json: json)
        call.resolve()
    }

    @objc func takeOps(_ call: CAPPluginCall) {
        call.resolve(["ops": WatchBridge.shared.pendingOps()])
    }

    @objc func ackOps(_ call: CAPPluginCall) {
        guard let src = call.getString("src"), let seq = call.getInt("seq") else {
            call.reject("Needs src and seq")
            return
        }
        WatchBridge.shared.acknowledge(src: src, seq: seq)
        call.resolve()
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["runningSessionId": WatchBridge.shared.runningSessionId ?? NSNull()])
    }

    /// A workout was just started on the phone: launches Rerack on the watch for it, as Hevy does (the watch taps the
    /// wrist and comes to the front with its workout session running). Resolves `{ launched }`; nothing happens
    /// without a paired watch that has the app.
    @objc func startWatchApp(_ call: CAPPluginCall) {
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated, session.isPaired, session.isWatchAppInstalled,
              HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["launched": false])
            return
        }
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        healthStore.startWatchApp(with: config) { launched, error in
            if let error { NSLog("[Watch] couldn't launch the watch app: %@", error.localizedDescription) }
            call.resolve(["launched": launched])
        }
    }
}
