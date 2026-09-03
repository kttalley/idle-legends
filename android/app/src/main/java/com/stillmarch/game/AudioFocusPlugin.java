package com.stillmarch.game;

import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * An audio-focus bridge, so the game's Web Audio graph is a polite media citizen on
 * Android. The Android equivalent of iOS's AVAudioSession .playback category (see
 * docs/ANDROID-PLAN.md Phase 4).
 *
 * ── Why this has to be native ────────────────────────────────────────────────
 * A WebView's Web Audio output never touches AudioManager focus on its own: the players
 * it opens (visible in `dumpsys audio` as AAudio/USAGE_MEDIA with no focus entry) simply
 * mix over whatever else is playing, and a phone call or another app's music mixes over
 * the game. Nothing in the web layer can change that; focus is an OS conversation only
 * Java can hold. The JS side owns WHAT to do (suspend/resume its AudioContext); this
 * plugin owns WHEN (focus gained or lost), and reports each change to the page.
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 * JS calls request() once, when the gesture latch starts audio (App.tsx). That registers
 * a listener and takes AUDIOFOCUS_GAIN, matching continuous game audio. Every subsequent
 * focus change is pushed into the page as a `stillmarch-audiofocus` CustomEvent on
 * window, with detail 'loss' or 'gain':
 *   - LOSS / LOSS_TRANSIENT / LOSS_TRANSIENT_CAN_DUCK all report 'loss'. Ducking is not
 *     implemented: the bed + music under a notification blip is not worth a second
 *     volume path, and suspend is always safe.
 *   - AUDIOFOCUS_GAIN reports 'gain' — the JS side resumes only if the page is visible,
 *     so a permanent LOSS followed by a foreground return still recovers through the
 *     visibilitychange path instead.
 * abandon() exists for symmetry and the run-ending path (back at character select the
 * music stops, so the game should release the focus it asked for).
 *
 * Events are dispatched via evaluateJavascript rather than a plugin call listener —
 * the changes can arrive at any moment (mid-call-setup, while backgrounded), and a
 * fire-and-forget page event needs no call to stay alive.
 */
@CapacitorPlugin(name = "AudioFocus")
public class AudioFocusPlugin extends Plugin {

    private AudioManager am;
    private AudioFocusRequest request;
    private boolean holdingFocus;

    @PluginMethod
    public void request(PluginCall call) {
        if (holdingFocus) {
            call.resolve();
            return;
        }
        am = getActivity().getSystemService(AudioManager.class);
        if (am == null) {
            call.reject("AudioManager unavailable");
            return;
        }
        if (request == null) {
            request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build())
                .setOnAudioFocusChangeListener(this::onFocusChange)
                .build();
        }
        holdingFocus = am.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        // Granted or not, resolve — a refusal is a normal OS outcome (a call is active),
        // not an error. The JS side retries on the next visibility gain.
        JSObject ret = new JSObject();
        ret.put("granted", holdingFocus);
        call.resolve(ret);
    }

    @PluginMethod
    public void abandon(PluginCall call) {
        if (am != null && request != null && holdingFocus) {
            am.abandonAudioFocusRequest(request);
        }
        holdingFocus = false;
        call.resolve();
    }

    private void onFocusChange(int change) {
        final String detail =
            change == AudioManager.AUDIOFOCUS_GAIN ? "gain" : "loss";
        getBridge().executeOnMainThread(() -> {
            if (getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('stillmarch-audiofocus',"
                    + "{detail:'" + detail + "'}));",
                null);
        });
    }
}