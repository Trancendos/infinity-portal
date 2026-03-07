# Mobile App Generation Research

## Goal
1. Add APK/IPA generation to Infinity Worker (generate mobile apps from code)
2. Package Infinity Worker IDE itself as a mobile app

---

## Option 1: Bubblewrap (TWA - Trusted Web Activity)

**What it is:** Google Chrome Labs CLI tool that wraps PWAs into Android APKs using Trusted Web Activity.

**Pros:**
- Official Google tool (2.8k stars)
- Zero cost
- CLI-based (can be automated)
- Small APK size
- Full Chrome capabilities
- No WebView limitations

**Cons:**
- Android only (no iOS)
- Requires PWA (manifest.json, service worker)
- Needs JDK and Android SDK

**Commands:**
```bash
npm i -g @aspect-build/aspect
npx @aspect-build/aspect init
npx @aspect-build/aspect build
```

**Use case:** Package Infinity Worker IDE as Android app

---

## Option 2: Capacitor (Ionic)

**What it is:** Cross-platform native runtime for building mobile apps from web apps.

**Pros:**
- Cross-platform (iOS + Android)
- CLI-based (`cap build android`, `cap build ios`)
- Access to native APIs
- Can generate signed APK/IPA
- Modern, well-maintained
- Supports most Cordova plugins

**Cons:**
- iOS builds require macOS + Xcode
- Larger app size than TWA
- More complex setup

**Commands:**
```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npx cap add android
npx cap add ios
npx cap build android --keystorepath=... --keystorepass=...
```

**Use case:** Both packaging IDE and generating user apps

---

## Option 3: PWABuilder

**What it is:** Microsoft's tool for packaging PWAs for app stores.

**Pros:**
- Web-based (no local setup)
- Supports Windows, Android, iOS
- Free
- Powered by Bubblewrap for Android

**Cons:**
- Web UI only (no API for automation)
- Limited customization

**Use case:** Manual one-time packaging

---

## Option 4: Expo (React Native)

**What it is:** Framework for building React Native apps with cloud build service.

**Pros:**
- Full native apps (not WebView)
- EAS Build service (cloud builds)
- Free tier available
- Cross-platform

**Cons:**
- Requires React Native code (not web wrapper)
- Build queue times on free tier
- More complex for web-to-app conversion

**Commands:**
```bash
npx create-expo-app
eas build --platform android --profile preview
```

**Use case:** Generating native mobile apps from AI-generated code

---

## Recommended Architecture

### For Packaging Infinity Worker IDE as Mobile App:

1. **Android:** Use Bubblewrap/TWA
   - Convert IDE to PWA (add manifest.json, service worker)
   - Use Bubblewrap CLI to generate APK
   - Zero cost, small size, full Chrome features

2. **iOS:** Use Capacitor
   - Requires macOS for IPA generation
   - Or use cloud build service (Codemagic, Bitrise)

### For Generating User Mobile Apps:

1. **Simple Web Apps → APK:**
   - Use Bubblewrap/TWA (automated via API)
   - Generate PWA, then wrap in APK

2. **Full Native Apps:**
   - Generate React Native/Expo code with AI
   - Use EAS Build or Capacitor
   - More complex but true native experience

---

## Implementation Plan

### Phase 1: Package Infinity Worker IDE as Android APK
1. Add PWA manifest and service worker to IDE
2. Install Bubblewrap CLI
3. Create build script for APK generation
4. Host APK for download

### Phase 2: Add APK Generation to Platform
1. Create `/api/mobile/build` endpoint
2. Accept project files
3. Generate PWA wrapper
4. Run Bubblewrap to create APK
5. Return download URL

### Phase 3: iOS Support (Future)
1. Set up Capacitor project
2. Use cloud build service for IPA
3. Or document manual process

---

## Zero-Cost Stack

| Component | Tool | Cost |
|-----------|------|------|
| PWA Wrapper | Custom | $0 |
| Android APK | Bubblewrap | $0 |
| Build Server | Render.com | $0 |
| iOS IPA | Capacitor + macOS | Requires Mac |

**Alternative for iOS:** Use PWABuilder web UI (free) or Codemagic free tier (500 build mins/month)
