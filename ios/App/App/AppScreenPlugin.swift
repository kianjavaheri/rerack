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
        CAPPluginMethod(name: "setBackground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise),
    ]

    @objc func keepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve()
        }
    }

    /// The colour behind the page, seen when it's pulled past its top or bottom (iOS's bounce): the theme's page
    /// colour, sent by hooks/settings.tsx. Without it the fixed dark one in capacitor.config.ts showed as a black band
    /// over a light or Bamboo page.
    @objc func setBackground(_ call: CAPPluginCall) {
        let r = CGFloat(call.getDouble("r") ?? 15) / 255
        let g = CGFloat(call.getDouble("g") ?? 16) / 255
        let b = CGFloat(call.getDouble("b") ?? 17) / 255
        DispatchQueue.main.async { [weak self] in
            let color = UIColor(red: r, green: g, blue: b, alpha: 1)
            if let webView = self?.bridge?.webView {
                webView.backgroundColor = color
                webView.scrollView.backgroundColor = color
                webView.underPageBackgroundColor = color
            }
            self?.bridge?.viewController?.view.backgroundColor = color
            call.resolve()
        }
    }

    /// The home-screen icon: an alternate one by name (AppIcon-pink-dark…, scripts/ios-accent-icons.mjs), or the
    /// primary with none. Nothing happens if it's the one showing already, since iOS shows a notice on every change.
    @objc func setIcon(_ call: CAPPluginCall) {
        let name = call.getString("name")
        DispatchQueue.main.async {
            let app = UIApplication.shared
            guard app.supportsAlternateIcons, app.alternateIconName != name else {
                call.resolve(["changed": false])
                return
            }
            app.setAlternateIconName(name) { error in
                if let error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["changed": true])
                }
            }
        }
    }
}
