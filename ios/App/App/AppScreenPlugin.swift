import Capacitor
import UIKit

/// `AppScreen` in JS (src/hooks/useWakeLock.ts). Keeps the screen on during a live workout (Settings → Keep the
/// screen on): the web view's Wake Lock API isn't something to rely on in an app, and this is what iOS apps use.
/// iOS turns it off by itself whenever the app is in the background.
@objc(AppScreenPlugin)
public class AppScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppScreenPlugin"
    public let jsName = "AppScreen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
    ]

    @objc func keepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve()
        }
    }
}
