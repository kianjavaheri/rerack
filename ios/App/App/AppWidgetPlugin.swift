import Capacitor
import WidgetKit

/// `AppWidget` in JS (src/native/widget.ts): saves what the home-screen widget shows (HomeWidgetData, as JSON) into the
/// app group and asks WidgetKit to redraw it, only when it changed.
@objc(AppWidgetPlugin)
public class AppWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppWidgetPlugin"
    public let jsName = "AppWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
    ]

    @objc func update(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let data = json.data(using: .utf8),
              (try? JSONDecoder().decode(HomeWidgetData.self, from: data)) != nil else {
            call.reject("Not widget data")
            return
        }
        let defaults = UserDefaults(suiteName: ExerciseImages.appGroup)
        if defaults?.data(forKey: HomeWidgetData.key) != data {
            defaults?.set(data, forKey: HomeWidgetData.key)
            WidgetCenter.shared.reloadTimelines(ofKind: "HomeWidget")
        }
        call.resolve()
    }
}
