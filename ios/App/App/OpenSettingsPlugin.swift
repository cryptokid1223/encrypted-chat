import Capacitor
import UIKit

@objc(OpenSettingsPlugin)
public class OpenSettingsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OpenSettingsPlugin"
    public let jsName = "OpenSettings"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
    ]

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Invalid settings URL")
                return
            }

            UIApplication.shared.open(url) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("Could not open settings")
                }
            }
        }
    }
}
