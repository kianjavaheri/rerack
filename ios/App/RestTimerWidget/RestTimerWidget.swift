import ActivityKit
import SwiftUI
import WidgetKit

/// Colours from src/index.css, so the lock screen matches the app's theme: dark is the warm sweep (orange to red) on
/// near-black, light the blue one (indigo to sky) on the light grey page.
struct Palette {
    let background: Color
    let text: Color
    let muted: Color
    let sweep: [Color]
    /// One colour from the sweep for the countdown and its bar: the system only keeps a timer ticking on the lock
    /// screen when it's drawn plainly, and a gradient (fill or mask) flattens it into a still picture.
    let accent: Color
    /// Laid over the lock screen's own tint: the system draws the background see-through, so in light mode the
    /// wallpaper tinted it (a lavender over a purple one); a white wash keeps it white.
    let wash: Color

    /// `purple`: the app's "Purple in dark mode" (`[data-accent='purple']` in index.css, its --ink-* colours); dark only.
    static func of(dark: Bool, purple: Bool = false) -> Palette {
        if dark && purple {
            return Palette(background: rgb(0x0F1011), text: .white, muted: .white.opacity(0.55),
                           sweep: [rgb(0xF08AFD), rgb(0xCC82FF), rgb(0x9D8EFF), rgb(0x8697FF)], accent: rgb(0xC182FF),
                           wash: .clear)
        }
        return dark
            ? Palette(background: rgb(0x0F1011), text: .white, muted: .white.opacity(0.55),
                      sweep: [rgb(0xF58A5C), rgb(0xF28F82), rgb(0xEF6266), rgb(0xEA5560)], accent: rgb(0xF27870),
                      wash: .clear)
            : Palette(background: .white, text: rgb(0x111111), muted: .black.opacity(0.5),
                      sweep: [rgb(0x3D4AD0), rgb(0x2563CF), rgb(0x1A78C4), rgb(0x1488BB)], accent: rgb(0x2563CF),
                      wash: .white.opacity(0.6))
    }

    var gradient: LinearGradient { LinearGradient(colors: sweep, startPoint: .leading, endPoint: .trailing) }
}

func rgb(_ hex: Int) -> Color {
    Color(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
}

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
        HomeWidget()
    }
}

/// The live workout on the lock screen and in the Dynamic Island: the exercise and set you're on, and while resting
/// the countdown and its bar. The system counts down from the dates, so it stays right while the app is asleep.
struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            ActivityContent(context: context)
        } dynamicIsland: { context in
            // The Dynamic Island is always black, so it uses the dark colours.
            let palette = Palette.of(dark: true)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        if let picture = ExercisePicture.load(context.state.image) {
                            ExercisePicture(image: picture, size: 30)
                        } else {
                            LogoMark().fill(palette.gradient).frame(width: 22, height: 16)
                        }
                        Text(context.state.exercise).font(.headline).lineLimit(1)
                    }
                    .padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if isResting(context) {
                        VStack(alignment: .trailing, spacing: 0) {
                            RestCaption(palette: palette)
                            Countdown(context: context)
                                .font(.title2.weight(.semibold).monospacedDigit())
                                .foregroundStyle(palette.accent)
                        }
                        .padding(.trailing, 6)
                    } else {
                        Text(context.state.detail).font(.subheadline).foregroundStyle(palette.muted).padding(.trailing, 6)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if isResting(context) {
                        RestBar(context: context, palette: palette).padding(.horizontal, 6)
                    } else {
                        Text(context.state.detail).font(.caption).foregroundStyle(palette.muted)
                    }
                }
            } compactLeading: {
                LogoMark().fill(palette.gradient).frame(width: 20, height: 14)
            } compactTrailing: {
                if isResting(context) {
                    Countdown(context: context).monospacedDigit().foregroundStyle(palette.accent).frame(maxWidth: 46)
                } else {
                    Text(context.attributes.startedAt, style: .timer).monospacedDigit().frame(maxWidth: 52)
                }
            } minimal: {
                LogoMark().fill(palette.gradient).frame(width: 18, height: 13)
            }
            .keylineTint(palette.sweep[1])
        }
        // Also on the Apple Watch (its Smart Stack, shown on its own when the activity starts or changes), drawn by
        // WatchActivityView. Tapping it there opens Rerack on the watch (WKSupportsLiveActivityLaunchAttributeTypes).
        .supplementalActivityFamilies([.small])
    }
}

/// The lock screen's layout on the iPhone; the watch's own on the Apple Watch.
private struct ActivityContent: View {
    @Environment(\.activityFamily) private var family
    let context: ActivityViewContext<RestActivityAttributes>

    var body: some View {
        if family == .small {
            let palette = Palette.of(dark: true, purple: context.state.purple == true)
            WatchActivityView(context: context, palette: palette)
                .activityBackgroundTint(palette.background)
        } else {
            let palette = Palette.of(dark: context.state.dark)
            LockScreenView(context: context, palette: palette)
                .background(palette.wash)
                // Dark: pure black, like other workout apps' (Hevy's) on the lock screen.
                .activityBackgroundTint(context.state.dark ? .black : palette.background)
                .activitySystemActionForegroundColor(palette.text)
        }
    }
}

/// On the watch (small, always dark): while resting the countdown big with its bar, else the exercise and set with
/// the workout's time so far.
private struct WatchActivityView: View {
    let context: ActivityViewContext<RestActivityAttributes>
    let palette: Palette
    /// The watch dimmed (wrist turned): timer text then shows dashes for seconds ("1:--"), so the rest shows when it
    /// ends instead, and the workout's time is left out.
    @Environment(\.isLuminanceReduced) private var dimmed

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                LogoMark().fill(palette.gradient).frame(width: 15, height: 11)
                Text(context.attributes.workoutName).lineLimit(1)
                Spacer(minLength: 4)
                if !isResting(context) && !dimmed {
                    Text(context.attributes.startedAt, style: .timer)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 56, alignment: .trailing)
                }
            }
            .font(.caption2)
            .foregroundStyle(palette.muted)

            if isResting(context) {
                HStack(alignment: .firstTextBaseline) {
                    RestCaption(palette: palette)
                    Spacer(minLength: 4)
                    if dimmed, let end = context.state.restEndsAt {
                        Text("until \(Text(end, style: .time))")
                            .font(.system(size: 20, weight: .semibold, design: .rounded).monospacedDigit())
                            .foregroundStyle(palette.accent)
                    } else {
                        Countdown(context: context)
                            .font(.system(size: 30, weight: .semibold, design: .rounded).monospacedDigit())
                            .foregroundStyle(palette.accent)
                    }
                }
                RestBar(context: context, palette: palette)
                Text("Next: \(context.state.exercise)")
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
            } else {
                Text(context.state.exercise)
                    .font(.headline)
                    .foregroundStyle(palette.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Text(context.state.detail)
                    .font(.caption)
                    .foregroundStyle(palette.muted)
            }
        }
        .padding(10)
    }
}

private func isResting(_ context: ActivityViewContext<RestActivityAttributes>) -> Bool {
    context.state.restEndsAt != nil
}

/// Like Hevy's: the logo and workout quietly at the top, then the exercise and set; while resting, the countdown on
/// the right and the bar underneath.
private struct LockScreenView: View {
    let context: ActivityViewContext<RestActivityAttributes>
    let palette: Palette

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                // The logo in plain white (black in light mode), the name and time quieter beside it.
                LogoMark().fill(palette.text).frame(width: 17, height: 12)
                Text(context.attributes.workoutName).lineLimit(1)
                Spacer()
                // The workout's time so far. A timer takes all the width it's offered, so it's capped and
                // right-aligned.
                Text(context.attributes.startedAt, style: .timer)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 110, alignment: .trailing)
            }
            .font(.footnote)
            .foregroundStyle(palette.muted)

            HStack(alignment: .center, spacing: 12) {
                if let picture = ExercisePicture.load(context.state.image) {
                    ExercisePicture(image: picture, size: 44)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.exercise)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(palette.text)
                        .lineLimit(2)
                        // Very long names shrink a little before they'd be cut off.
                        .minimumScaleFactor(0.8)
                    Text(context.state.detail)
                        .font(.subheadline)
                        .foregroundStyle(palette.muted)
                }
                Spacer(minLength: 12)
                if isResting(context) {
                    VStack(alignment: .trailing, spacing: 0) {
                        RestCaption(palette: palette)
                        Countdown(context: context)
                            .font(.system(size: 34, weight: .semibold).monospacedDigit())
                            .foregroundStyle(palette.accent)
                    }
                }
            }

            if isResting(context) {
                RestBar(context: context, palette: palette)
            }
        }
        .padding(16)
    }
}

/// The exercise's picture, small, on white (the app saves it in the app group; see ExerciseImages).
private struct ExercisePicture: View {
    let image: UIImage
    let size: CGFloat

    static func load(_ name: String?) -> UIImage? {
        guard let name, let file = ExerciseImages.file(named: name) else { return nil }
        return UIImage(contentsOfFile: file.path)
    }

    var body: some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
    }
}

/// "REST" over the countdown, so it's clear which of the two times it is (the other, at the top right, is the workout's).
private struct RestCaption: View {
    let palette: Palette

    var body: some View {
        Text("REST").font(.caption2.weight(.semibold)).kerning(0.6).foregroundStyle(palette.muted)
    }
}

/// m:ss counting down to the end of the rest, or "Over".
private struct Countdown: View {
    let context: ActivityViewContext<RestActivityAttributes>

    var body: some View {
        if let start = context.state.restStartedAt, let end = context.state.restEndsAt, end > Date() {
            // A timer takes all the width it's offered, which left the exercise's name little room. Laid over an invisible
            // "0:00" (in the same font) it only gets what its digits need.
            Text(end.timeIntervalSince(start) >= 600 ? "00:00" : "0:00")
                .hidden()
                .overlay(alignment: .trailing) {
                    Text(timerInterval: start...end, countsDown: true)
                        .multilineTextAlignment(.trailing)
                }
        } else {
            // Under the "REST" caption (or alone in the island, beside the logo).
            Text("Over")
        }
    }
}

/// The rest's bar, emptying as it counts down. A plain ProgressView in the theme's colour, so the system animates it
/// (see Palette.accent).
private struct RestBar: View {
    let context: ActivityViewContext<RestActivityAttributes>
    let palette: Palette

    var body: some View {
        if let start = context.state.restStartedAt, let end = context.state.restEndsAt, end > start, end > Date() {
            ProgressView(timerInterval: start...end, countsDown: true) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(palette.accent)
        } else {
            ProgressView(value: 1).tint(palette.accent)
        }
    }
}

/// The app's mark (public/app-icon.svg) as a shape: the barbell, an r on the left (arm at the top) and an upside-down r
/// on the right (foot at the bottom). Drawn from the icon's 1024-unit coordinates, scaled to fit.
struct LogoMark: Shape {
    func path(in rect: CGRect) -> Path {
        // Same outline as the app icon (scripts/app-icon.mjs, its GEOM): the mark spans x 165…859 and y 246…778 there.
        let box = CGRect(x: 165, y: 246, width: 694, height: 532)
        let scale = min(rect.width / box.width, rect.height / box.height)
        let dx = rect.midX - box.midX * scale
        let dy = rect.midY - box.midY * scale
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * scale + dx, y: y * scale + dy) }

        var mark = Path()
        // The left r (strokes 100 wide), then the same turned half a turn about the centre (512, 512) for the right one.
        for flip in [false, true] {
            func q(_ x: CGFloat, _ y: CGFloat) -> CGPoint { flip ? p(1024 - x, 1024 - y) : p(x, y) }
            mark.move(to: q(290, 728))
            mark.addLine(to: q(290, 356))
            mark.addQuadCurve(to: q(400, 246), control: q(290, 246))
            mark.addLine(to: q(490, 246))
            mark.addLine(to: q(490, 346))
            mark.addLine(to: q(414, 346))
            mark.addQuadCurve(to: q(390, 370), control: q(390, 346))
            mark.addLine(to: q(390, 728))
            mark.closeSubpath()
        }
        // The barbell: plates 92 × 208 and a bar 56 thick through the middle.
        for x in [165.0, 767.0] {
            mark.addRoundedRect(in: CGRect(origin: p(x, 408), size: CGSize(width: 92 * scale, height: 208 * scale)),
                                cornerSize: CGSize(width: 26 * scale, height: 26 * scale))
        }
        // The bar in three pieces, between the plates and the stems, so nothing overlaps (overlapping subpaths that
        // wind opposite ways would leave holes).
        for (from, to) in [(257.0, 290.0), (390.0, 634.0), (734.0, 767.0)] {
            mark.addRect(CGRect(origin: p(from, 484), size: CGSize(width: (to - from) * scale, height: 56 * scale)))
        }
        return mark
    }
}
