// Patch AndroidManifest.xml untuk lock portrait paling kuat (OS-level)
// Jalankan otomatis setelah npx cap add android / cap sync
// node apk/scripts/fix-portrait.js

import fs from 'fs'
import path from 'path'

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml')

if (!fs.existsSync(manifestPath)) {
  console.log('[fix-portrait] AndroidManifest belum ada — jalankan npx cap add android dulu')
  process.exit(0)
}

let xml = fs.readFileSync(manifestPath, 'utf8')
const before = xml

// 1) Lock activity utama ke portrait
if (!xml.includes('android:screenOrientation="portrait"')) {
  xml = xml.replace(
    /<activity[^>]*android:name="\.MainActivity"[^>]*>/,
    m => m.includes('screenOrientation') ? m : m.replace('>', ' android:screenOrientation="portrait" android:configChanges="orientation|keyboardHidden|screenSize|smallestScreenSize|screenLayout">')
  )
  // fallback jika pattern beda
  if (xml === before) {
    xml = xml.replace('<activity', '<activity android:screenOrientation="portrait" android:configChanges="orientation|keyboardHidden|screenSize" ')
  }
}

// 2) Pastikan usesCleartextTraffic false untuk prod (server https)
xml = xml.replace(/android:usesCleartextTraffic="true"/, 'android:usesCleartextTraffic="false"')

if (xml !== before) {
  fs.writeFileSync(manifestPath, xml)
  console.log('[fix-portrait] ✓ AndroidManifest di-patch portrait lock')
} else {
  console.log('[fix-portrait] sudah portrait, skip')
}
