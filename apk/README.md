# Waifu Math Clash — APK Wrapper (Capacitor)

Folder `apk/` ini **hanya WebView** ke `https://waifu-math.vercel.app` (deploy Vercel). Tidak ada logic game duplikat — semua tetap jalan di web.

## Prasyarat
- Node 18+ & npm
- Android Studio + SDK + JDK 17
- `ANDROID_HOME` ter-set

## Setup sekali
```bash
cd apk
npm install
npx cap add android   # generate folder android/ (di-ignore git, generate lokal)
npx cap sync
```

## Run debug
```bash
npx cap open android   # buka Android Studio
# atau build debug langsung:
cd android && ./gradlew assembleDebug
# apk ada di android/app/build/outputs/apk/debug/app-debug.apk
```

## Build release (AAB/APK)
```bash
# Buat keystore dulu (sekali):
keytool -genkey -v -keystore waifu-math.keystore -alias waifu -keyalg RSA -keysize 2048 -validity 10000

# Build release:
cd android && ./gradlew assembleRelease
# atau bundle:
./gradlew bundleRelease  # -> .aab untuk Play Store
```

## Config
- `capacitor.config.json` -> `server.url = https://waifu-math.vercel.app`
- Portrait only, Splash `#EDFCF6`, StatusBar `#3EC99E` (sesuaikan di config)
- Jika ingin lock orientasi portrait, edit `android/app/src/main/AndroidManifest.xml`:
  ```xml
  <activity android:screenOrientation="portrait" ...>
  ```

## Catatan
- `android/` & `node_modules/` di-ignore (lihat `apk/.gitignore`) — tiap dev generate lokal via `npx cap add android`
- Hanya push `package.json`, `capacitor.config.json`, `www/`, dan `README.md`
- Update URL? Ganti `server.url` lalu `npx cap sync`
