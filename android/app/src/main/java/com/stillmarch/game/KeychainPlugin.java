package com.stillmarch.game;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A three-method Keychain bridge, so the cloud session can outlive an uninstall.
 * The Android equivalent of `ios/App/App/KeychainPlugin.swift`, registering the SAME
 * jsName ("Keychain") so `src/net/keychain.ts` compiles and runs unchanged.
 *
 * ── Why a file, not the Android Keystore ─────────────────────────────────────
 * The obvious-looking answer, EncryptedSharedPreferences, is the WRONG one here, and it
 * cost a plan revision to see it: its key lives in the Android Keystore, and the Keystore
 * is destroyed on uninstall. Encrypted data plus a destroyed key is unrecoverable
 * ciphertext — the exact data-loss scenario this plugin exists to prevent. There is no
 * "Keychain that survives uninstall" on Android; the closest honest equivalent is app
 * data that Google backs up and restores on reinstall.
 *
 * So the token goes into a dedicated SharedPreferences file. `shared_prefs/` is in the
 * default Auto Backup set (android:allowBackup="true" in the manifest), so a
 * uninstall-reinstall on a device with backup enabled (the default for signed-in users)
 * restores it, and `recoverSessionFromKeychain()` in main.tsx finds it before first
 * paint. WebView localStorage is NOT in the default backup set (`app_webview/` sits
 * outside the backed-up directories), which is precisely why this plugin must exist —
 * the session cannot simply be left where Supabase's client puts it.
 *
 * Not encrypted at rest: the value is an anonymous Supabase refresh token for a no-login
 * game; the OS-level app sandbox is the threat model, matching what the web build
 * already accepts in localStorage. If a second, genuinely secret value ever lands here,
 * revisit this decision.
 *
 * ── The registration trap, iOS edition, restated for Android ─────────────────
 * This class must ALSO be registered in MainActivity (registerPlugin below the class
 * declaration) — Capacitor does not auto-discover plugins in the app target. Unregistered,
 * the bridge answers UNIMPLEMENTED, keychainGet() catches it, logs a warning, and the app
 * runs with sessions-in-localStorage-only: every symptom of "plugin missing" looks like
 * "no value stored".
 */
@CapacitorPlugin(name = "Keychain")
public class KeychainPlugin extends Plugin {

    /** Matches the iOS plugin's service string. Namespaced so a second secret cannot collide. */
    private static final String FILE = "com.stillmarch.game.session";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        String value = prefs().getString(key, null);
        if (value != null) {
            JSObject ret = new JSObject();
            ret.put("value", value);
            call.resolve(ret);
        } else {
            // A miss is the normal first-launch case, not an error. Resolved as an EMPTY
            // payload to mirror the iOS plugin: the JS wrapper reads a missing key and a
            // null value as the same thing.
            call.resolve();
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        // commit() rather than apply(): this write gates whether a reinstall can recover
        // the player's only identity, and it runs on a path that may be racing app death.
        boolean ok = prefs().edit().putString(key, value).commit();
        if (ok) {
            call.resolve();
        } else {
            call.reject("keychain write failed");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        prefs().edit().remove(key).apply();
        call.resolve();
    }
}