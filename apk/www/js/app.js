// apk/www/js/app.js — offline, portrait, fullscreen, double-back (tanpa bundler, pakai window.Capacitor)
const OFFLINE_URL = './offline.html'
const HOME_URL = 'https://waifu-math.vercel.app'

// ===== Helper ambil plugin tanpa static import =====
function getCapacitor() {
  return window.Capacitor || {}
}
function getPlugin(name) {
  try {
    const cap = getCapacitor()
    if (cap.Plugins && cap.Plugins[name]) return cap.Plugins[name]
    // fallback Capacitor.Plugins alias
    if (window[name]) return window[name]
  } catch {}
  return null
}
// Bungkus agar tidak crash jika plugin belum ready
let AppPlugin = null
let NetworkPlugin = null
let ScreenOrientationPlugin = null
let StatusBarPlugin = null
let SplashScreenPlugin = null

function refreshPlugins() {
  const cap = getCapacitor()
  AppPlugin = (cap.Plugins && cap.Plugins.App) || getPlugin('App')
  NetworkPlugin = (cap.Plugins && cap.Plugins.Network) || getPlugin('Network')
  ScreenOrientationPlugin = (cap.Plugins && cap.Plugins.ScreenOrientation) || getPlugin('ScreenOrientation')
  StatusBarPlugin = (cap.Plugins && cap.Plugins.StatusBar) || getPlugin('StatusBar')
  SplashScreenPlugin = (cap.Plugins && cap.Plugins.SplashScreen) || getPlugin('SplashScreen')
  // juga coba global Capacitor untuk statusbar style enum
  if (!StatusBarPlugin && cap.Plugins && cap.Plugins.StatusBar) StatusBarPlugin = cap.Plugins.StatusBar
}
refreshPlugins()
// refresh lagi setelah bridge ready
window.addEventListener('DOMContentLoaded', refreshPlugins)
document.addEventListener('deviceready', refreshPlugins)
setTimeout(refreshPlugins, 500)
setTimeout(refreshPlugins, 1500)

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
      opacity:0; transition:opacity 0.2s; pointer-events:none;
    `
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.style.opacity = '1'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.style.opacity = '0' }, 2000)
}

// ===== Lock portrait + fullscreen hide status bar =====
async function lockPortrait() {
  refreshPlugins()
  try {
    if (ScreenOrientationPlugin && ScreenOrientationPlugin.lock) {
      await ScreenOrientationPlugin.lock({ orientation: 'portrait' })
    }
  } catch {}
  try {
    if (StatusBarPlugin && StatusBarPlugin.hide) {
      await StatusBarPlugin.hide()
    }
    if (StatusBarPlugin && StatusBarPlugin.setOverlaysWebView) {
      await StatusBarPlugin.setOverlaysWebView({ overlay: true })
    }
  } catch {}
  try {
    if (StatusBarPlugin && StatusBarPlugin.setStyle) {
      // Style.Light = 'LIGHT'
      await StatusBarPlugin.setStyle({ style: 'LIGHT' })
    }
  } catch {}
  try {
    document.documentElement.style.setProperty('--safe-top', '0px')
  } catch {}
}

// ===== Offline handling =====
let isOfflinePage = location.pathname.endsWith('offline.html')

async function cekOfflineAwal() {
  refreshPlugins()
  try {
    if (NetworkPlugin && NetworkPlugin.getStatus) {
      const status = await NetworkPlugin.getStatus()
      if (!status.connected && !isOfflinePage) {
        location.replace(OFFLINE_URL)
        return
      }
    } else {
      throw new Error('no network plugin')
    }
  } catch {
    if (!navigator.onLine && !isOfflinePage) location.replace(OFFLINE_URL)
  }
}

// Listener network berubah — pakai plugin jika ada, fallback ke event browser
function setupNetworkListener() {
  refreshPlugins()
  try {
    if (NetworkPlugin && NetworkPlugin.addListener) {
      NetworkPlugin.addListener('networkStatusChange', status => {
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
    }
  } catch {}
}
setupNetworkListener()

// Fallback browser
window.addEventListener('online', () => {
  if (location.pathname.endsWith('offline.html')) location.replace(HOME_URL)
})
window.addEventListener('offline', () => {
  if (!location.pathname.endsWith('offline.html')) location.replace(OFFLINE_URL)
})

// ===== Back button: double-back exit =====
// Native MainActivity.java sudah handle double-back untuk remote site.
// JS ini untuk offline.html & www/index.html fallback.
let lastBack = 0
const DOUBLE_BACK_MS = 2000
function setupBack() {
  refreshPlugins()
  try {
    if (AppPlugin && AppPlugin.addListener) {
      AppPlugin.addListener('backButton', () => {
        const now = Date.now()
        if (location.pathname.endsWith('offline.html')) {
          if (NetworkPlugin && NetworkPlugin.getStatus) {
            NetworkPlugin.getStatus().then(s => {
              if (s.connected) location.replace(HOME_URL)
              else showToast('Masih offline, tunggu koneksi ya')
            }).catch(() => {
              if (navigator.onLine) location.replace(HOME_URL)
              else showToast('Masih offline')
            })
          } else {
            if (navigator.onLine) location.replace(HOME_URL)
            else showToast('Masih offline')
          }
          return
        }
        if (now - lastBack < DOUBLE_BACK_MS) {
          if (AppPlugin && AppPlugin.exitApp) AppPlugin.exitApp()
          else window.close()
        } else {
          lastBack = now
          showToast('Tekan sekali lagi untuk keluar ✨')
        }
      })
    }
  } catch {}
}
setupBack()
setTimeout(setupBack, 800)
setTimeout(setupBack, 2000)

// ===== Init =====
lockPortrait()
cekOfflineAwal()
try {
  refreshPlugins()
  if (SplashScreenPlugin && SplashScreenPlugin.hide) SplashScreenPlugin.hide().catch(() => {})
} catch {}
try {
  // status bar hide lagi setelah splash
  setTimeout(lockPortrait, 800)
} catch {}

// Re-lock saat resume
try {
  refreshPlugins()
  if (AppPlugin && AppPlugin.addListener) {
    AppPlugin.addListener('resume', () => lockPortrait())
  } else {
    document.addEventListener('resume', lockPortrait)
  }
} catch {}
// Re-hide saat visibility change (balik dari recent apps)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lockPortrait()
})
window.addEventListener('focus', lockPortrait)
