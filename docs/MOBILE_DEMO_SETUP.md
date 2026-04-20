# Mobile (iOS / Android) demo setup

End-to-end guide to getting a Dhvani native binary running on a real
phone. Capacitor wraps the existing Next.js app — the WebView points
at the live Dhvani server, native plugins expose audio / haptics /
(eventually) Siri Shortcut.

## Why Capacitor (not React Native)

Capacitor reuses **100% of the web code** that's already built. The
Next.js server keeps running — the phone just loads it in a native
WebView. That means:

- Same code ships to web + PWA + Electron desktop + iOS + Android.
- The voice-embedding + local Whisper + intent-routing pipeline
  we landed this session works on the phone unchanged.
- New native capabilities (Siri, lock-screen controls, background
  audio) are added plugin-by-plugin as they're needed, not
  re-implemented from scratch.

A full React Native rewrite would be 3+ months and replace none of
the Azure / NextAuth / transcript pipeline — just the UI shell.

## What works on day one vs. later

| Capability                                  | Day one (Capacitor WebView)       | Requires native plugin later |
|---                                          |---                                |---                           |
| Microphone capture (solo notes, in-person)  | ✅                                | —                            |
| Local Whisper (on-device transcription)     | ✅                                | —                            |
| Voice-embedding diarization                 | ✅                                | —                            |
| Azure cloud transcription                   | ✅                                | —                            |
| Tab-audio / system-audio capture            | ❌ (WebKit limitation on iOS)     | Broadcast Upload Extension   |
| Background recording                        | ⚠️ stops on app background        | AVAudioSession + Foreground Service |
| Siri Shortcut ("Hey Siri, start Dhvani")    | ❌                                | `@capacitor-community/siri-shortcuts` |
| Lock-screen / Now Playing controls          | ❌                                | MediaSession plugin          |
| Push notifications                          | ❌                                | `@capacitor/push-notifications` |

## Prerequisites

### iOS (need both Xcode + CocoaPods)

```bash
# 1) Full Xcode.app from the Mac App Store (NOT just CLT)
#    — confirm with `xcode-select -p` returning a path inside
#    /Applications/Xcode.app/.../Developer
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch

# 2) CocoaPods
sudo gem install cocoapods
pod --version   # expect ≥ 1.15
```

Also: an Apple ID signed into Xcode for sideloading (free tier works
for 7-day dev provisioning to your own iPhone).

### Android (need JDK + Android Studio + SDK)

```bash
# 1) JDK 17 (Temurin or Amazon Corretto)
brew install --cask temurin@17

# 2) Android Studio (includes SDK manager)
# Download from https://developer.android.com/studio

# 3) In Android Studio → SDK Manager:
#    - Android SDK Platform 34 (or latest)
#    - Android SDK Build-Tools 34.0.0
#    - Android SDK Platform-Tools (gives you adb)
#    - Android Emulator (optional — you can plug in a real phone)

# 4) Add to shell:
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Verify with:

```bash
java -version      # 17.x
adb --version
npm run mobile:doctor
```

## One-time project scaffolding

From the Dhvani repo root:

```bash
# Install happens when you run `npm install` — Capacitor platforms
# are already in package.json. If you haven't installed yet:
npm install

# Scaffold the iOS and Android projects. Creates ios/ and android/
# directories. Run once; commit the generated files.
npx cap add ios
npx cap add android

# Every time the web code changes meaningfully, sync native projects:
npm run mobile:sync
```

### Info.plist / AndroidManifest permissions

Capacitor scaffolds sensible defaults, but we need explicit strings
for store review:

**iOS — `ios/App/App/Info.plist`:**

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Dhvani needs your microphone to transcribe meetings and voice notes.</string>
```

**Android — `android/app/src/main/AndroidManifest.xml`:**

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
```

## Running the app on a real phone

### Picking a server URL

The Capacitor WebView needs a live Dhvani server to point at.
`capacitor.config.ts` reads `DHVANI_MOBILE_SERVER_URL`:

- **Laptop dev** (phone on same wifi):
  ```bash
  # Find your laptop's LAN IP:
  ipconfig getifaddr en0          # macOS wifi
  # Then:
  export DHVANI_MOBILE_SERVER_URL=http://192.168.1.42:3000
  npm run dev                     # keep running on the laptop
  ```
  The phone must be on the same wifi. Next.js binds to all
  interfaces in dev, so the LAN IP works.

- **Remote dev** (through a firewall):
  ```bash
  npx ngrok http 3000             # prints https://abc123.ngrok-free.app
  export DHVANI_MOBILE_SERVER_URL=https://abc123.ngrok-free.app
  ```

- **Staging / prod**:
  ```bash
  export DHVANI_MOBILE_SERVER_URL=https://dhvani.itu.int
  ```

After changing the URL, re-sync:

```bash
npm run mobile:sync
```

### iOS — build + run

```bash
npm run mobile:ios          # opens Xcode
```

In Xcode:
1. Select your iPhone as the run destination (needs USB connection
   + "Trust This Computer" on the phone).
2. Signing & Capabilities → select your Apple ID team.
3. Press ▶. First run asks you to trust the developer certificate
   on the phone (Settings → General → VPN & Device Management).

### Android — build + run

Plug in an Android phone with USB debugging enabled
(Settings → System → Developer options → USB debugging). Then:

```bash
npm run mobile:run:android
```

Or to open in Android Studio:

```bash
npm run mobile:android
```

## Demo-day fast path

If you're demoing tomorrow and don't have time to install Xcode +
Android Studio:

- **Fallback A — PWA on your iPhone**: open `https://dhvani.itu.int`
  in Safari, tap Share → Add to Home Screen. You get an app-shaped
  icon, full-screen launch, most of the mobile UX we shipped this
  sprint (safe-area bottom bar, intent picker, local Whisper). What
  you *don't* get: Siri Shortcut, lock-screen controls, background
  recording. Fine for a product demo of the UX direction.
- **Fallback B — PWA on Android** works even better because Chrome
  prompts with a real install banner.
- **Fallback C — PWA in the Electron window** — already running on
  your laptop right now. Shows the same intent-routed flow a
  Capacitor wrapper would, just in a desktop shell.

Use the PWA for "this is the direction" narrative; the Capacitor
wrapper is for "and here's the native build path" — scaffold it
the day after the demo once you have Xcode + Android Studio
installed.

## Troubleshooting

| Symptom                                        | Fix                                                        |
|---                                             |---                                                         |
| `Unable to locate a Java Runtime`              | `brew install --cask temurin@17`, relaunch shell            |
| `xcrun: error: unable to find utility "simctl"`| Switch xcode-select to full Xcode.app, not CLT              |
| `pod install` fails                            | `sudo gem install cocoapods`, `pod repo update`             |
| WebView shows "Cannot connect to server"       | Phone not on same wifi as laptop, or `DHVANI_MOBILE_SERVER_URL` wrong |
| HTTPS-only errors on iOS                       | Use ngrok / prod URL; `cleartext: true` only works for LAN IPs |
| Mic permission denied                          | Verify `NSMicrophoneUsageDescription` in Info.plist         |

## Future native-only capabilities

See [docs/MOBILE_NATIVE_ROADMAP.md](./MOBILE_NATIVE_ROADMAP.md) for
the phased plan to add Siri Shortcut, lock-screen controls,
background audio via AVAudioSession / ForegroundService, and iOS
system-audio via Broadcast Upload Extension.
