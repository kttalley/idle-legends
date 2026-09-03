package com.stillmarch.game;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered explicitly — Capacitor does not auto-discover plugins in the
        // app target. Unregistered, the bridge answers UNIMPLEMENTED, the JS wrapper reads
        // that as "no value stored", and session recovery silently never happens. Same
        // failure mode as the un-registered Swift plugin cost on iOS.
        registerPlugin(KeychainPlugin.class);
        // Audio focus (see AudioFocusPlugin.java): without registration the JS wrapper
        // gets UNIMPLEMENTED and the game mixes over calls and other media forever.
        registerPlugin(AudioFocusPlugin.class);
        super.onCreate(savedInstanceState);
    }
}