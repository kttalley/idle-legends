import UIKit
import Capacitor

/// The bridge controller, subclassed solely to register the app's own plugins.
///
/// Capacitor does NOT auto-discover a plugin that lives in the app target — only ones
/// vended by a Swift package it was told about. Conforming to `CAPBridgedPlugin` is
/// necessary but not sufficient: without this explicit registration every call from JS
/// comes back `UNIMPLEMENTED`, which is exactly what the Keychain session mirror did on
/// its first build. It failed quietly, too, because the JS wrapper treats a plugin error
/// as "no stored value" — so a reinstall looked like it had simply found nothing.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KeychainPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
