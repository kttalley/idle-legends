# Uploading a build — the whole path, no Xcode GUI

First run 2026-08-22, shipping 1.0 (1). Every step below is CLI; the GUI Organizer flow
does the same thing but cannot be scripted or repeated reliably.

```sh
npm run cap:sync                       # NEVER `npm run build` — see LAUNCH.md §3
cd ios/App

xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /tmp/stillmarch-archive.xcarchive \
  -allowProvisioningUpdates archive

xcodebuild -exportArchive \
  -archivePath /tmp/stillmarch-archive.xcarchive \
  -exportOptionsPlist store/ExportOptions.plist \
  -exportPath /tmp/stillmarch-ipa \
  -allowProvisioningUpdates

xcrun altool --validate-app -f /tmp/stillmarch-ipa/App.ipa -t ios \
  --apiKey WB8UYW46J7 --apiIssuer 4f36dcad-26a1-4d94-b063-d7f2fae9a5e0

xcrun altool --upload-app -f /tmp/stillmarch-ipa/App.ipa -t ios \
  --apiKey WB8UYW46J7 --apiIssuer 4f36dcad-26a1-4d94-b063-d7f2fae9a5e0
```

## Things that cost time the first run

- **There is no `App.xcworkspace`.** Capacitor 8 uses SwiftPM, not CocoaPods, so the
  target is `-project App.xcodeproj`. Every Capacitor tutorial online says workspace.
- **Export MUST be `signingStyle: automatic`.** Manual export fails with *"profile is
  Xcode managed, but signing settings require a manually managed profile"* — the local
  `iOS Team Store Provisioning Profile` is Xcode-managed and cannot be named manually.
- **The first automatic export can block for minutes with no output**, authenticating to
  the developer portal. It is not hung; the second invocation reuses the cached session
  and returns in seconds. Do not kill it on the first try the way this run did.
- **The archive is signed with the DEVELOPMENT identity** and re-signed to `Apple
  Distribution` during export. `ARCHIVE SUCCEEDED` naming the development cert is normal.
- **Bump `CURRENT_PROJECT_VERSION` before every re-upload.** App Store Connect rejects a
  duplicate build number for the same version outright.

## The API key

`~/.appstoreconnect/private_keys/AuthKey_WB8UYW46J7.p8`, mode 600 — the only path
`altool` searches. Key ID `WB8UYW46J7`, Issuer `4f36dcad-26a1-4d94-b063-d7f2fae9a5e0`.
This is a **secret**: it authorises uploads and App Store Connect API calls under the
account. It is NOT the same key as the In-App Purchase `SubscriptionKey_*.p8` that
RevenueCat holds. Apple allows exactly one download of either; there is no re-download,
only revoke-and-reissue.

## Verifying an IPA before sending it

```sh
cd /tmp && rm -rf ipacheck && mkdir ipacheck && cd ipacheck && unzip -q /tmp/stillmarch-ipa/App.ipa
codesign -dvv Payload/App.app 2>&1 | grep Authority        # want: Apple Distribution
codesign -d --entitlements :- Payload/App.app | grep -o 'get-task-allow.*'   # want: false
grep -rl "local-assets\|ffta" Payload/App.app/public/assets/*.js | wc -l     # want: 0
```

1.0 (1) passed all three, plus `altool --validate-app` clean.
