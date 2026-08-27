import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        return true
    }

    /// Let the game be heard with the Ring/Silent switch set to silent.
    ///
    /// Without this, a Capacitor app gets the default `soloAmbient` session category, which
    /// iOS silences whenever that physical switch is flipped — and it silences the ENTIRE
    /// Web Audio graph, not just music. On device that made the game completely mute: no
    /// score, no biome bed, no combat stingers, with the system volume up and nothing on
    /// screen to explain it. It also made the generative music look broken for weeks when
    /// the truth was that nobody had ever heard it.
    ///
    /// `.playback` is the category for media a user has deliberately opened an app to hear,
    /// and a soundtrack qualifies. `.mixWithOthers` is the manners half: without it, opening
    /// this game stops whatever podcast or album the player already had going, which is a
    /// hostile thing for an idle game people leave running to do.
    ///
    /// Deliberately NOT paired with the `audio` background mode — the session is for audio
    /// while the app is in front. Adding that key would keep the score playing over the
    /// player's lock screen and invites an App Review rejection for a background mode the
    /// app does not need.
    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            // Never fatal. A game that refuses to launch because it could not claim the
            // audio session is strictly worse than a quiet one.
            print("[audio] could not configure AVAudioSession: \(error)")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
