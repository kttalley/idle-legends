import Foundation
import Capacitor
import Security

/// A three-method Keychain bridge, so the cloud session can outlive an uninstall.
///
/// ── Why this exists ──────────────────────────────────────────────────────────
/// Stillmarch has no login. Identity is an anonymous Supabase user whose refresh token
/// lived only in `localStorage`, and iOS deletes the entire app container — WebView
/// storage included — when the app is deleted. So reinstalling minted a *brand new*
/// anonymous user, and the previous characters were still sitting on the server owned by
/// an identity nobody could prove any more. Not recoverable after the fact: there is no
/// second factor to match them against.
///
/// The Keychain is the one store on iOS that survives app deletion. Putting the refresh
/// token here turns "reinstall" from data loss into a silent, invisible recovery.
///
/// ── Why hand-rolled rather than a plugin dependency ─────────────────────────
/// Every third-party option wraps the same four `Security` calls and brings an SPM package
/// with it. This is the whole surface the app needs, it is auditable in one screen, and it
/// cannot break on someone else's release schedule.
@objc(KeychainPlugin)
public class KeychainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KeychainPlugin"
    public let jsName = "Keychain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    /// Namespaced so a future second secret cannot collide with the session.
    private let service = "com.stillmarch.game.session"

    private func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required"); return
        }
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else {
            // A miss is the normal first-launch case, not an error. Resolved as an EMPTY
            // payload rather than an explicit nil: `["value": nil]` makes Swift coerce
            // `Any?` into `Any` (a compiler warning), and the JS wrapper already reads a
            // missing key and a null as the same thing.
            call.resolve([:])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("key and value are required"); return
        }
        let data = Data(value.utf8)

        // Delete-then-add rather than SecItemUpdate: an update against a missing item fails,
        // and branching on that is more code than simply making the write idempotent.
        SecItemDelete(query(key) as CFDictionary)

        var q = query(key)
        q[kSecValueData as String] = data
        // Readable after the first unlock following a boot, including while the app is in
        // the background. `WhenUnlocked` would make a background refresh fail on a locked
        // phone — which for an idle game is the normal state of the device.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let status = SecItemAdd(q as CFDictionary, nil)
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("keychain write failed: \(status)")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required"); return
        }
        SecItemDelete(query(key) as CFDictionary)
        call.resolve()
    }
}
