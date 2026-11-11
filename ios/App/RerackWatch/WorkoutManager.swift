import Foundation
import HealthKit

/// The watch's workout session (strength training) while a workout is open: keeps the app in front between sets and
/// running with the wrist down, shows heart rate, and on finishing saves the workout to Apple Health with the
/// session's id (`HKMetadataKeyExternalUUID`, as the phone does), so the phone skips its own copy (`savedByWatch`).
@MainActor
final class WorkoutManager: NSObject, ObservableObject {
    @Published private(set) var heartRate: Double?
    /// The app session the workout session is for, while it runs.
    @Published private(set) var runningFor: String?
    /// Running, but for a workout the phone has started and not sent yet (the phone launched the app for it):
    /// `adopt` ties it to that workout once it arrives.
    @Published private(set) var isUnassigned = false

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    private var shareTypes: Set<HKSampleType> { [HKObjectType.workoutType()] }
    private var readTypes: Set<HKObjectType> {
        [HKObjectType.workoutType(), HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned)]
    }

    /// Starts one for this app session (asking for Health permission the first time), backdated to when the workout
    /// started, so a workout started on the phone is timed from then. Does nothing if one is already running for it.
    /// `sessionId` nil: started for a workout that's on its way from the phone (see `isUnassigned`).
    func start(sessionId: String?, name: String?, startedAt: Date) async -> Bool {
        if let sessionId, runningFor == sessionId { return true }
        if runningFor != nil || isUnassigned { discard() }
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        do {
            try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
        } catch {
            NSLog("[Workout] authorization failed: %@", error.localizedDescription)
            return false
        }
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        do {
            let session = try HKWorkoutSession(healthStore: store, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            builder.delegate = self
            self.session = session
            self.builder = builder
            let start = min(startedAt, Date())
            session.startActivity(with: start)
            try await builder.beginCollection(at: start)
            try await builder.addMetadata([HKMetadataKeyIndoorWorkout: true])
            if let sessionId {
                try await tag(sessionId: sessionId, name: name ?? "")
                runningFor = sessionId
            } else {
                isUnassigned = true
            }
            return true
        } catch {
            NSLog("[Workout] couldn't start: %@", error.localizedDescription)
            discard()
            return false
        }
    }

    /// The workout the session was started for has arrived from the phone: it's this one.
    func adopt(sessionId: String, name: String) async {
        guard isUnassigned else { return }
        isUnassigned = false
        runningFor = sessionId
        try? await tag(sessionId: sessionId, name: name)
    }

    /// The session's id (as the phone tags its own copies) and the workout's name, saved with the workout in Health.
    private func tag(sessionId: String, name: String) async throws {
        try await builder?.addMetadata([HKMetadataKeyExternalUUID: sessionId, HKMetadataKeyWorkoutBrandName: name])
    }

    /// After the app relaunched mid-workout (watchOS brings it back): carries on with the session that was running.
    func recover(sessionId: String?) async {
        guard session == nil, let recovered = try? await store.recoverActiveWorkoutSession() else { return }
        let builder = recovered.associatedWorkoutBuilder()
        builder.delegate = self
        session = recovered
        self.builder = builder
        runningFor = sessionId
    }

    /// Ends it and saves the workout to Health. Returns whether it was saved.
    func finish(name: String, at end: Date) async -> Bool {
        guard let session, let builder else { return false }
        session.end()
        do {
            try await builder.endCollection(at: end)
            try await builder.addMetadata([HKMetadataKeyWorkoutBrandName: name])
            _ = try await builder.finishWorkout()
            reset()
            return true
        } catch {
            NSLog("[Workout] couldn't save: %@", error.localizedDescription)
            reset()
            return false
        }
    }

    /// Ends it without saving (cancelled, or finished on the phone, which then saves its own copy).
    func discard() {
        session?.end()
        builder?.discardWorkout()
        reset()
    }

    private func reset() {
        session = nil
        builder = nil
        runningFor = nil
        isUnassigned = false
        heartRate = nil
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let type = HKQuantityType(.heartRate)
        guard collectedTypes.contains(type),
              let bpm = workoutBuilder.statistics(for: type)?.mostRecentQuantity()?.doubleValue(for: .count().unitDivided(by: .minute()))
        else { return }
        Task { @MainActor in self.heartRate = bpm }
    }
}
