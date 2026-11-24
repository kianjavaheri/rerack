import SwiftUI
import WatchKit

struct RootView: View {
    @EnvironmentObject private var store: WatchStore

    var body: some View {
        NavigationStack {
            if let session = store.session {
                WorkoutView(session: session)
            } else {
                StartView()
            }
        }
    }
}

// MARK: Starting

/// No workout open: the followed routine's Up next, then every workout.
struct StartView: View {
    @EnvironmentObject private var store: WatchStore

    var body: some View {
        List {
            if let state = store.state {
                if let next = store.upNext {
                    Section("Up next") {
                        Button { store.start(next) } label: { WorkoutRow(workout: next, highlighted: true) }
                            .listRowBackground(RoundedRectangle(cornerRadius: 12).fill(Theme.sweep))
                    }
                }
                Section("Workouts") {
                    ForEach(state.workouts) { workout in
                        Button { store.start(workout) } label: { WorkoutRow(workout: workout, highlighted: false) }
                    }
                }
                if state.workouts.isEmpty {
                    Text("Make a workout in Rerack on your iPhone and it shows here.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Open Rerack on your iPhone once to bring your workouts here.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Rerack")
    }
}

private struct WorkoutRow: View {
    let workout: WatchWorkout
    let highlighted: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(workout.name).font(.headline).lineLimit(2)
            Text("\(workout.slots.count) exercises")
                .font(.caption2)
                .opacity(0.75)
        }
        .foregroundStyle(highlighted ? Theme.onSweep : .primary)
        .padding(.vertical, 2)
    }
}

// MARK: The workout

/// Three pages, scrolled with the Crown or a swipe: the set (or the rest), the exercises, and the workout itself.
struct WorkoutView: View {
    @EnvironmentObject private var store: WatchStore
    let session: Session

    var body: some View {
        TabView(selection: $store.page) {
            NowView().tag(0)
            ExercisesView(session: session).tag(1)
            ControlsView(session: session).tag(2)
        }
        .tabViewStyle(.verticalPage)
        .navigationTitle(session.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The rest while it runs, else the set on screen.
struct NowView: View {
    @EnvironmentObject private var store: WatchStore
    /// The rest end that has run out, so the set comes back without the rest being stopped.
    @State private var over: String?
    /// Looking at the next set while still resting.
    @State private var peeking: String?

    var body: some View {
        let restKey = store.session?.restEndsAt
        Group {
            if let end = store.restEnd, end > Date(), over != restKey, peeking != restKey {
                RestView(end: end, length: store.session?.restLength ?? store.barRest) { peeking = restKey }
            } else if let ref = store.focus, let (entry, index) = store.lookup(ref) {
                SetView(entry: entry, index: index, ref: ref).id("\(ref.entryId)|\(ref.setId)|\(entry.perSide == true)|\(entry.sides == true)")
            } else {
                AllDoneView()
            }
        }
        .task(id: restKey) {
            guard let end = store.restEnd else { return }
            let wait = end.timeIntervalSinceNow
            if wait > 0 {
                try? await Task.sleep(for: .seconds(wait))
                guard !Task.isCancelled else { return }
                store.restOver(at: end)
                // Without a workout session there's no "Rest over" notification to tap the wrist: do it here if the
                // app is still running (wrist down it's inactive, not background, so don't require active).
                if !store.restAlertScheduled && WKApplication.shared().applicationState != .background {
                    WKInterfaceDevice.current().play(.notification)
                }
            }
            if wait <= 0 { store.restOver(at: end) }
            over = restKey
        }
        .onChange(of: store.pickedAt) { _, _ in peeking = store.session?.restEndsAt }
    }
}

struct RestView: View {
    @EnvironmentObject private var store: WatchStore
    let end: Date
    let length: Double
    let showNext: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            Text("REST").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            // Drawn every second by a TimelineView, not a timer Text: those show "1:--" when the watch dims (wrist
            // down or turned away). A running workout session lets the timeline tick each second even then.
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let left = max(0, end.timeIntervalSince(context.date))
                VStack(spacing: 6) {
                    Text(clock(left.rounded(.up)))
                        .font(.system(size: 46, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.accent)
                        .frame(maxWidth: .infinity)
                    ProgressView(value: min(1, left / max(length, 1)))
                        .tint(Theme.accent)
                }
            }
            HStack(spacing: 10) {
                RoundButton(systemImage: "gobackward.15", label: "15 seconds less") { store.adjustRest(-15) }
                RoundButton(systemImage: "stop.fill", label: "Stop rest", fill: .red.opacity(0.85)) { store.stopRest() }
                RoundButton(systemImage: "goforward.15", label: "15 seconds more") { store.adjustRest(15) }
            }
            if let next = nextText {
                Button(action: showNext) {
                    Text(next).font(.footnote).lineLimit(2).foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var nextText: String? {
        guard let ref = store.focus, let (entry, index) = store.lookup(ref) else { return nil }
        return "Next: \(store.exerciseName(entry.exerciseId)) · \(setLabel(entry, entry.sets[index]))"
    }
}

/// One set: weight and reps (tap one, turn the Crown), check it off. Starts from what's logged, else its placeholder
/// (the set above, else last time's).
struct SetView: View {
    @EnvironmentObject private var store: WatchStore
    let entry: SessionEntry
    let index: Int
    let ref: SetRef

    private enum Field: Hashable { case weight(Int), reps(Int) }
    private struct Pad {
        var weight: Double = 0
        var reps: Double = 0
        /// The Crown's raw values: turned into whole steps, since watchOS doesn't snap them.
        var weightCrown: Double = 0
        var repsCrown: Double = 0
        var baseWeight: Double = 0
        var baseReps: Double = 0
        var startShown: Double = 0
        var startKg: Double?
        var edited = false
    }
    @FocusState private var field: Field?
    @State private var pads = [Pad(), Pad()]
    @State private var side = 0
    @State private var saveTask: Task<Void, Never>?
    @State private var loaded = false

    private var set: SetLog { entry.sets[index] }
    private var sided: Bool { entry.sides == true }
    private var info: WatchExercise? { store.exercise(entry.exerciseId) }
    private var bodyweight: Bool { info?.bodyweight ?? false }
    private var isKg: Bool { store.isKg }
    private var step: Double { store.weightStep }
    /// Per side (barbell lifts): the weight shown and turned is one side of the bar; the total is what's saved.
    private var bar: Double? { entry.perSide == true && !bodyweight ? info?.bar : nil }
    @AppStorage("platesShown") private var platesShown = true

    var body: some View {
        VStack(spacing: sided ? 4 : 6) {
            VStack(spacing: 1) {
                Text(store.exerciseName(entry.exerciseId))
                    .font(.system(.headline, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .multilineTextAlignment(.center)
                HStack(spacing: 3) {
                    if set.done { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.accent) }
                    Text(subtitle)
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }

            if sided {
                VStack(spacing: 2) {
                    HStack(spacing: 10) {
                        sideTab("Left", 0)
                        sideTab("Right", 1)
                    }
                    TabView(selection: $side) {
                        numbers(0).tag(0)
                        numbers(1).tag(1)
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .frame(height: 56)
                }
            } else {
                numbers(0)
            }

            HStack(spacing: 8) {
                RoundButton(systemImage: "chevron.left", label: "Previous set", enabled: store.canStep(-1)) { store.step(-1) }
                // Gray until checked, then the sweep; tapping a checked set unchecks it (an accidental tap undone).
                Button {
                    saveTask?.cancel()
                    pads[0].edited = false
                    pads[1].edited = false
                    if set.done {
                        store.uncheck(ref)
                    } else {
                        store.check(ref, reps: Int(pads[0].reps), weightKg: weightKg(0), right: rightSide)
                    }
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(set.done ? Theme.onSweep : .white)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background {
                            if set.done { Capsule().fill(Theme.sweep) } else { Capsule().fill(Color.white.opacity(0.14)) }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .opacity(!set.done && !checkable ? 0.4 : 1)
                .disabled(!set.done && !checkable)
                .accessibilityLabel(set.done ? "Uncheck set" : sided ? "Check off both sides" : "Check off set")
                RoundButton(systemImage: "chevron.right", label: "Next set", enabled: store.canStep(1)) { store.step(1) }
            }
        }
        .padding(.horizontal, 2)
        .onAppear(perform: load)
        // Changed elsewhere (typed on the phone, or the set above changed its placeholder): show the new numbers.
        .onChange(of: sourceKey) { _, _ in reload() }
        .onChange(of: side) { _, now in field = bodyweight ? .reps(now) : .weight(now) }
        .onDisappear(perform: saveNow)
    }

    private func sideTab(_ title: String, _ i: Int) -> some View {
        Text(title)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(side == i ? Theme.accent : .secondary)
            .onTapGesture { withAnimation { side = i } }
            .accessibilityAddTraits(side == i ? [.isSelected, .isButton] : .isButton)
    }

    private func numbers(_ i: Int) -> some View {
        HStack(spacing: 6) {
            valueBox(title: weightTitle(i), value: weightText(i), field: .weight(i))
                .digitalCrownRotation($pads[i].weightCrown, from: -(pads[i].baseWeight + step), through: 1500, by: step, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
            valueBox(title: "reps", value: Text(String(Int(pads[i].reps))), field: .reps(i))
                .digitalCrownRotation($pads[i].repsCrown, from: -pads[i].baseReps - 1, through: 200, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
        }
        .onChange(of: pads[i].weightCrown) { _, crown in
            let next = weightTurned(crown, from: pads[i].baseWeight)
            if next != pads[i].weight { pads[i].weight = next; changed(i) }
        }
        .onChange(of: pads[i].repsCrown) { _, crown in
            let next = max(0, pads[i].baseReps + crown.rounded())
            if next != pads[i].reps { pads[i].reps = next; changed(i) }
        }
    }

    private var checkable: Bool { pads[0].reps >= 1 && (!sided || pads[1].reps >= 1) }

    private var rightSide: Side? {
        guard sided else { return nil }
        return Side(reps: pads[1].reps >= 1 ? Int(pads[1].reps) : nil, weightKg: weightKg(1))
    }

    private func weightTurned(_ crown: Double, from start: Double) -> Double {
        let n = Int((crown / step).rounded())
        let tiny = 1e-6
        var value: Double
        if n == 0 {
            value = start
        } else if n > 0 {
            let above = (start / step - tiny).rounded(.up) * step
            value = (above > start + tiny ? above : start + step) + Double(n - 1) * step
        } else {
            let below = (start / step + tiny).rounded(.down) * step
            value = (below < start - tiny ? below : start - step) + Double(n + 1) * step
        }
        return max(0, (value * 100).rounded() / 100)
    }

    private func changed(_ i: Int) {
        pads[i].edited = true
        saveTask?.cancel()
        saveTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            saveNow()
        }
    }

    private func saveNow() {
        saveTask?.cancel()
        saveTask = nil
        let left = pads[0].edited, right = pads[1].edited
        guard left || right else { return }
        pads[0].edited = false
        pads[1].edited = false
        if set.done {
            guard checkable else { return }
            let reps = Int(pads[0].reps), kg = weightKg(0)
            guard reps != set.reps || kg != set.weightKg || (sided && rightSide != set.right) else { return }
            store.check(ref, reps: reps, weightKg: kg, right: rightSide)
        } else {
            let reps = left ? (pads[0].reps >= 1 ? Int(pads[0].reps) : nil) : set.reps
            let kg = left ? weightKg(0) : set.weightKg
            store.update(ref, reps: reps, weightKg: kg, right: sided && right ? rightSide : set.right)
        }
    }

    /// "Set 1 of 2 · 6-12 · Last 8 × 115 lb" (Last left out once it's done; a done set is unchecked by swiping its row
    /// in the exercise's set list).
    private var subtitle: String {
        var parts = [setLabel(entry, set)]
        if let target = entry.targetReps, !target.isEmpty, !set.isWarmup { parts.append(target) }
        if !set.done, let last = lastText { parts.append(last) }
        return parts.joined(separator: " · ")
    }

    private func valueBox(title: String, value: Text, field: Field) -> some View {
        let focused = self.field == field
        return VStack(spacing: 0) {
            value
                .font(.system(size: sided ? 27 : 30, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text(title).font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.5)
        }
        // Kept off the rounded corners, which clipped "per side · 155 lb".
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity, minHeight: sided ? 52 : 58)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(focused ? 0.16 : 0.08)))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(focused ? Theme.accent : .clear, lineWidth: 2))
        .focusable(true)
        .focused($field, equals: field)
        .onTapGesture { self.field = field }
    }

    private var lastText: String? {
        let previous = store.last(for: entry.id)
        let position = entry.sets[..<index].filter { !$0.isWarmup }.count
        guard !set.isWarmup, let last = position < previous.count ? previous[position] : previous.last else { return nil }
        if sided && side == 1 {
            guard let right = last.right else { return nil }
            return "Last " + formatSet(reps: right.reps, weightKg: right.weightKg, isKg: isKg, bodyweight: bodyweight)
        }
        return "Last " + formatSet(reps: last.reps, weightKg: last.weightKg, isKg: isKg, bodyweight: bodyweight)
    }

    private func weightTitle(_ i: Int) -> String {
        let unit = isKg ? "kg" : "lb"
        if bodyweight { return "+" + unit }
        guard let bar else { return unit }
        // One side shown big, the bar's total small: "135 lb total" (watch users know Per side).
        return "\(formatNumber(pads[i].weight * 2 + bar)) \(unit) total"
    }

    /// Per side above the heaviest plate, as plates when that's on: the same plate counted ("45" with a small "×4"),
    /// then the rest ("+10"): 425 lb → 45×4+10. Up to three kinds of plate; more can't be read, so the number.
    private func weightText(_ i: Int) -> Text {
        let weight = pads[i].weight
        if bar != nil, platesShown, weight > (isKg ? 25 : 45), let parts = plateParts(weight, isKg: isKg) {
            let groups = plateGroups(parts)
            if groups.count <= 3 {
                var text = Text("")
                for (n, group) in groups.enumerated() {
                    text = text + Text((n > 0 ? "+" : "") + formatNumber(group.plate))
                    if group.count > 1 {
                        text = text + Text("×\(group.count)").font(.system(size: 17, weight: .semibold, design: .rounded)).foregroundColor(.secondary)
                    }
                }
                return text
            }
        }
        return Text(formatNumber(weight))
    }

    private func weightKg(_ i: Int) -> Double? {
        let weight = pads[i].weight
        if weight == pads[i].startShown { return pads[i].startKg }
        if bodyweight && weight == 0 { return nil }
        let total = bar.map { weight * 2 + $0 } ?? weight
        return isKg ? total : total * kgPerLb
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        reload()
        field = bodyweight ? .reps(side) : .weight(side)
    }

    private var sources: [(kg: Double?, reps: Int?)] {
        let previous = store.last(for: entry.id)
        let suggested = hint(entry, index, previous: previous)
        var list: [(kg: Double?, reps: Int?)] = [(set.weightKg ?? suggested?.weightKg, set.reps ?? suggested?.reps)]
        if sided {
            let r = rightHint(entry, index, previous: previous)
            list.append((set.right?.weightKg ?? r.weightKg, set.right?.reps ?? r.reps))
        }
        return list
    }

    private var sourceKey: String {
        let sides = sources.map { "\($0.kg.map { String($0) } ?? "-")|\($0.reps.map { String($0) } ?? "-")" }
        return sides.joined(separator: "/") + "|\(bar.map { String($0) } ?? "-")"
    }

    private func reload() {
        saveTask?.cancel()
        saveTask = nil
        for (i, source) in sources.enumerated() {
            var pad = Pad()
            var weight = displayWeight(source.kg, kg: isKg) ?? 0
            if let bar, source.kg != nil { weight = max(0, ((weight - bar) / 2 * 100).rounded() / 100) }
            pad.weight = weight
            pad.startShown = weight
            pad.startKg = source.kg
            pad.reps = Double(source.reps ?? firstTarget ?? 0)
            pad.baseWeight = weight
            pad.baseReps = pad.reps
            pads[i] = pad
        }
    }

    /// The low end of the target ("8" of "8-12") when there's nothing else to go on.
    private var firstTarget: Int? {
        guard let target = entry.targetReps else { return nil }
        return Int(target.prefix { $0.isNumber })
    }
}

/// A small round button (‹ ›, −15, +15): white on a faint circle, dimmed when it can't be used.
struct RoundButton: View {
    let systemImage: String
    let label: String
    var enabled = true
    var fill: Color = .white.opacity(0.14)
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Circle().fill(fill))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .opacity(enabled ? 1 : 0.3)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

struct AllDoneView: View {
    @EnvironmentObject private var store: WatchStore
    @State private var asking = false

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 36)).foregroundStyle(Theme.accent)
            Text("All sets done").font(.headline)
            Button("Finish workout") { asking = true }
                .buttonStyle(.borderedProminent)
        }
        .finishDialog(isPresented: $asking)
    }
}

// MARK: Exercises

struct ExercisesView: View {
    @EnvironmentObject private var store: WatchStore
    let session: Session

    var body: some View {
        List(session.entries) { entry in
            NavigationLink {
                SetsView(entryId: entry.id)
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.exerciseName(entry.exerciseId)).lineLimit(2)
                        Text("\(entry.sets.filter(\.done).count)/\(entry.sets.count) sets")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 4)
                    if !entry.sets.isEmpty && entry.sets.allSatisfy(\.done) {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.accent)
                    } else if entry.id == store.focus?.entryId {
                        Circle().fill(Theme.accent).frame(width: 7, height: 7)
                    }
                }
            }
            .listItemTint(entry.supersetNext == true || (session.entries.firstIndex(of: entry).map { $0 > 0 && session.entries[$0 - 1].supersetNext == true } ?? false) ? Theme.accent.opacity(0.35) : nil)
        }
    }
}

/// An exercise's sets: tap one to log it, or add one.
struct SetsView: View {
    @EnvironmentObject private var store: WatchStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage("platesShown") private var platesShown = true
    let entryId: String

    var body: some View {
        if let entry = store.session?.entries.first(where: { $0.id == entryId }) {
            let bodyweight = store.exercise(entry.exerciseId)?.bodyweight ?? false
            let previous = store.last(for: entry.id)
            List {
                ForEach(Array(entry.sets.enumerated()), id: \.element.id) { index, set in
                    Button {
                        store.pick(SetRef(entryId: entry.id, setId: set.id))
                        dismiss()
                    } label: {
                        HStack {
                            Text(short(entry, set)).font(.caption.weight(.semibold)).frame(width: 22)
                            let shown = set.reps != nil || set.weightKg != nil ? WatchSet(reps: set.reps, weightKg: set.weightKg) : hint(entry, index, previous: previous)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(formatSet(reps: shown?.reps, weightKg: shown?.weightKg, isKg: store.isKg, bodyweight: bodyweight))
                                if entry.sides == true {
                                    let right = set.right ?? rightHint(entry, index, previous: previous)
                                    Text("R " + formatSet(reps: right.reps, weightKg: right.weightKg, isKg: store.isKg, bodyweight: bodyweight))
                                        .font(.caption2)
                                }
                            }
                            .foregroundStyle(set.done ? .primary : .secondary)
                            Spacer(minLength: 2)
                            if set.done { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
                        }
                    }
                    .swipeActions {
                        if set.done {
                            Button("Uncheck") { store.uncheck(SetRef(entryId: entry.id, setId: set.id)) }.tint(.gray)
                        }
                    }
                }
                Button { store.addSet(to: entry.id); dismiss() } label: { Label("Add set", systemImage: "plus") }
                if store.exercise(entry.exerciseId)?.bar != nil && !bodyweight {
                    Toggle("Per side", isOn: Binding(get: { entry.perSide == true }, set: { store.setPerSide($0, entryId: entry.id) }))
                    if entry.perSide == true {
                        Toggle("Show as plates", isOn: $platesShown)
                    }
                }
            }
            .navigationTitle(store.exerciseName(entry.exerciseId))
        } else {
            Text("Not in this workout any more.").foregroundStyle(.secondary)
        }
    }

    /// W, D, or the set's number (working sets only).
    private func short(_ entry: SessionEntry, _ set: SetLog) -> String {
        if set.isWarmup { return "W" }
        if set.isDrop { return "D" }
        return String((entry.sets.filter { !$0.isWarmup && !$0.isDrop }.firstIndex { $0.id == set.id } ?? 0) + 1)
    }
}

// MARK: The workout's controls

struct ControlsView: View {
    @EnvironmentObject private var store: WatchStore
    @EnvironmentObject private var workout: WorkoutManager
    let session: Session
    @State private var finishing = false
    @State private var cancelling = false

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(elapsed(context.date.timeIntervalSince(session.startDate)))
                        .font(.system(size: 34, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                }
                HStack(spacing: 10) {
                    if let bpm = workout.heartRate {
                        Label("\(Int(bpm))", systemImage: "heart.fill").foregroundStyle(.red)
                    }
                    let done = session.entries.filter { !$0.sets.isEmpty && $0.sets.allSatisfy(\.done) }.count
                    Text("\(done)/\(session.entries.count) exercises")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)

                if store.restOn && store.restEnd.map({ $0 <= Date() }) ?? true {
                    Button { store.startRest(); store.page = 0 } label: {
                        Label("Rest \(clock(store.barRest))", systemImage: "timer")
                    }
                }
                Button { finishing = true } label: { Text("Finish").fontWeight(.semibold).foregroundStyle(Theme.onSweep) }
                    .background(Capsule().fill(Theme.sweep))
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Capsule())
                Button("Cancel workout", role: .destructive) { cancelling = true }
                    .font(.footnote)
            }
        }
        .finishDialog(isPresented: $finishing)
        .confirmationDialog("Cancel this workout?", isPresented: $cancelling, titleVisibility: .visible) {
            Button("Cancel workout", role: .destructive) { store.cancel() }
            Button("Keep going", role: .cancel) {}
        } message: {
            Text("Nothing from \(session.name) will be saved.")
        }
    }
}

private struct FinishDialog: ViewModifier {
    @EnvironmentObject private var store: WatchStore
    @Binding var isPresented: Bool

    func body(content: Content) -> some View {
        content.confirmationDialog(store.loggedSets > 0 ? "Finish this workout?" : "Nothing is logged yet", isPresented: $isPresented, titleVisibility: .visible) {
            if store.loggedSets > 0 {
                Button("Finish") { Task { await store.finish() } }
            }
            Button(store.loggedSets > 0 ? "Keep going" : "OK", role: .cancel) {}
        } message: {
            Text(store.loggedSets > 0 ? "\(store.loggedSets) sets logged." : "Log a set first, or cancel the workout.")
        }
    }
}

extension View {
    func finishDialog(isPresented: Binding<Bool>) -> some View { modifier(FinishDialog(isPresented: isPresented)) }
}

/// "12:05" or "1:02:05", the workout's time so far.
func elapsed(_ seconds: Double) -> String {
    let s = max(0, Int(seconds))
    return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
}
