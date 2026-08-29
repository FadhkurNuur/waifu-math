// apk/www/js/app.js — paling powerful: offline, lock portrait, cegah back navigasi, double-back exit
import { App } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

const OFFLINE_URL = './offline.html'
const HOME_URL = 'https://waifu-math.vercel.app'

// ===== Toast =====
let toastTimer = null
function showToast(msg) {
  let el = document.getElementById('apk-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'apk-toast'
    el.style.cssText = `
      position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
      background:rgba(46,58,53,0.92); color:#fff; padding:10px 18px;
      border-radius:999px; font-size:13px; font-weight:700; z-index:9999;
      max-width:80%; text-align:center; box-shadow:0 4px 16px rgba(0,0,0,0.2);
      opacity:0; transition:opacity 0.2s;
    `
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.style.opacity = '1'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.style.opacity = '0' }, 2000)
}

// ===== Lock portrait sekuat mungkin =====
async function lockPortrait() {
  try {
    await ScreenOrientation.lock({ orientation: 'portrait' })
  } catch {}
  try {
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setStyle({ style: Style.Light })
    await StatusBar.setBackgroundColor({ color: '#3EC99E' })
  } catch {}
}

// ===== Offline handling =====
let isOfflinePage = location.pathname.endsWith('offline.html')

async function cekOfflineAwal() {
  try {
    const status = await Network.getStatus()
    if (!status.connected && !isOfflinePage) {
      location.replace(OFFLINE_URL)
    }
  } catch {
    // fallback navigator.onLine
    if (!navigator.onLine && !isOfflinePage) location.replace(OFFLINE_URL)
  }
}

// Listener network berubah
try {
  Network.addListener('networkStatusChange', status => {
    if (!status.connected) {
      if (!location.pathname.endsWith('offline.html')) {
        showToast('Tidak ada internet 🌸')
        setTimeout(() => location.replace(OFFLINE_URL), 600)
      }
    } else {
      if (location.pathname.endsWith('offline.html')) {
        showToast('Koneksi kembali ✓')
        setTimeout(() => location.replace(HOME_URL), 400)
      }
    }
  })
} catch {}

// Fallback untuk browser biasa (saat cap sync belum)
window.addEventListener('online', () => {
  if (location.pathname.endsWith('offline.html')) location.replace(HOME_URL)
})
window.addEventListener('offline', () => {
  if (!location.pathname.endsWith('offline.html')) location.replace(OFFLINE_URL)
})

// ===== Back button: cegah navigasi, double-back exit =====
let lastBack = 0
const DOUBLE_BACK_MS = 2000

try {
  App.addListener('backButton', () => {
    // SELALU cegah navigasi history WebView — hanya link/tombol di halaman yang boleh navigasi
    // canGoBack kita abaikan, tidak ada window.history.back()

    const now = Date.now()
    // Jika sedang di offline.html dan online kembali, retry dulu jangan exit
    if (location.pathname.endsWith('offline.html')) {
      Network.getStatus().then(s => {
        if (s.connected) location.replace(HOME_URL)
        else showToast('Masih offline, tunggu koneksi ya')
      }).catch(() => showToast('Masih offline'))
      return
    }

    if (now - lastBack < DOUBLE_BACK_MS) {
      App.exitApp()
    } else {
      lastBack = now
      showToast('Tekan sekali lagi untuk keluar ✨')
    }
  })
} catch {}

// ===== Init =====
lockPortrait()
cekOfflineAwal()
SplashScreen.hide().catch(() => {})

// Re-lock saat resume
try {
  App.addListener('resume', () => lockPortrait())
} catch {}
