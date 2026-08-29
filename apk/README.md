# Waifu Math Clash — APK Wrapper (Capacitor) — Powerfull

Folder `apk/` ini **hanya WebView** ke `https://waifu-math.vercel.app`. Tidak ada duplikat logic game.

## Fitur powerfull yang sudah aktif
- **Custom offline page** `www/offline.html` — deteksi via `@capacitor/network` + `navigator.onLine`, auto redirect saat koneksi putus/balik.
- **Lock portrait ganda:** JS `ScreenOrientation.lock(portrait)` + patch `AndroidManifest.xml` (`android:screenOrientation="portrait"`). Paling kuat, OS tidak bisa rotate.
- **Cegah 1x back navigasi:** `App.addListener('backButton')` di `www/js/app.js:42` override default WebView history — single back **tidak** `history.back()`, hanya toast. Navigasi hanya via tombol/link di halaman web.
- **Double back to exit:** tekan back 2x dalam 2 detik → `App.exitApp()`, jika tidak → toast `Tekan sekali lagi untuk keluar`.

## Prasyarat
- Node 18+ & npm
- Android Studio + SDK + JDK 17
- `ANDROID_HOME` ter-set

## Setup sekali
```bash
cd apk
npm install          # akan install @capacitor/network & screen-orientation juga
npx cap add android  # auto patch portrait via scripts/fix-portrait.js
npx cap sync         # auto patch lagi
```

Manual patch portrait jika perlu:
```bash
npm run fix:portrait
```

## Run debug
```bash
npx cap open android
# atau
cd android && ./gradlew assembleDebug
# apk di android/app/build/outputs/apk/debug/app-debug.apk
```

## Build release
```bash
keytool -genkey -v -keystore waifu-math.keystore -alias waifu -keyalg RSA -keysize 2048 -validity 10000
cd android && ./gradlew assembleRelease
# atau bundle untuk Play Store:
./gradlew bundleRelease
```

## File penting
- `capacitor.config.json` -> `server.url`, `allowNavigation`, `ScreenOrientation.portrait`
- `www/js/app.js` -> Network + App back + ScreenOrientation + StatusBar
- `www/offline.html` -> UI offline branded
- `scripts/fix-portrait.js` -> patch AndroidManifest otomatis

## Catatan
- `android/` & `node_modules/` di-ignore — generate lokal tiap dev.
- Update URL? Ganti `server.url` lalu `npx cap sync`.
