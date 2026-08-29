// Helper functions yang dipakai di semua halaman

// Tunggu sejumlah ms sebelum lanjut
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Tampilkan toast notifikasi di atas layar
export function showToast(pesan, durasi = 2500) {
  let toast = document.getElementById('toast-global')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'toast-global'
    toast.className = 'toast-notif'
    document.body.appendChild(toast)
  }
  toast.textContent = pesan
  toast.classList.add('aktif')
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => toast.classList.remove('aktif'), durasi)
}

// Tampilkan spinner loading global
export function showLoading() {
  let el = document.getElementById('loading-global')
  if (!el) {
    el = document.createElement('div')
    el.id = 'loading-global'
    el.innerHTML = '<div class="spinner"></div>'
    document.body.appendChild(el)
  }
  el.style.display = 'flex'
}

// Sembunyikan spinner loading
export function hideLoading() {
  const el = document.getElementById('loading-global')
  if (el) el.style.display = 'none'
}

// Guard session — redirect ke index.html jika tidak login
export async function requireAuth(supabase) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = '/index.html'
    return null
  }
  return session
}

// Redirect ke home jika sudah login (dipakai di index.html)
export async function redirectIfLoggedIn(supabase) {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) window.location.href = '/home.html'
}

// Hitung ATK kartu setelah upgrade bintang
export function hitungATK(baseAtk, bintang) {
  return Math.ceil(baseAtk * (1 + bintang * 0.2))
}

// Hitung rank dari total power
export function hitungRank(totalPower) {
  return Math.floor(totalPower / 100) + 1
}

// Hitung HP dari rank
export function hitungHP(rank) {
  return rank * 100
}

// Format angka dengan titik ribuan
export function formatAngka(n) {
  return n.toLocaleString('id-ID')
}

// Generate kode room 6 karakter (huruf besar + angka)
export function generateKodeRoom() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let kode = ''
  for (let i = 0; i < 6; i++) {
    kode += chars[Math.floor(Math.random() * chars.length)]
  }
  return kode
}

// Cek apakah tanggal terakhir claim sama dengan hari ini
export function sudahClaimHariIni(tanggalStr) {
  if (!tanggalStr) return false
  const hari = new Date().toISOString().slice(0, 10)
  return tanggalStr.slice(0, 10) === hari
}

// Lazy load gambar dengan IntersectionObserver
// Pakai: <img data-src="url" class="lazy-img"> lalu panggil initLazyLoad(container)
let _lazyObserver = null

function getLazyObserver() {
  if (_lazyObserver) return _lazyObserver
  if (!('IntersectionObserver' in window)) return null
  _lazyObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target
        const src = img.dataset.src
        if (src) {
          img.src = src
          img.removeAttribute('data-src')
        }
        // Hapus blur setelah load
        img.addEventListener('load', () => {
          img.classList.add('lazy-loaded')
          img.classList.remove('lazy-img')
        }, { once: true })
        // Fallback jika cache langsung complete
        if (img.complete) {
          img.classList.add('lazy-loaded')
          img.classList.remove('lazy-img')
        }
        observer.unobserve(img)
      }
    })
  }, { rootMargin: '300px 0px', threshold: 0.01 })
  return _lazyObserver
}

export function initLazyLoad(root = document) {
  const container = root instanceof Element ? root : document
  const imgs = container.querySelectorAll('img[data-src]')
  if (!imgs.length) return
  const observer = getLazyObserver()
  if (!observer) {
    // Fallback tanpa IntersectionObserver
    imgs.forEach(img => {
      img.src = img.dataset.src
      img.removeAttribute('data-src')
      img.classList.remove('lazy-img')
    })
    return
  }
  imgs.forEach(img => observer.observe(img))
}

export function observeLazyImage(img) {
  if (!img || !img.dataset.src) return
  const observer = getLazyObserver()
  if (!observer) {
    img.src = img.dataset.src
    img.removeAttribute('data-src')
    img.classList.remove('lazy-img')
    return
  }
  observer.observe(img)
}

// ===== Cache Browser untuk data & gambar =====

// Registrasi Service Worker (dipanggil di gacha.js / collection.js)
export function registerSW() {
  if (!('serviceWorker' in navigator)) return
  // Hanya di http/https, bukan file://
  if (location.protocol === 'file:') return
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // Gagal daftar SW tidak fatal — fallback ke localStorage/Cache API manual
  })
}

// Cache JSON sederhana via localStorage + TTL (untuk data Supabase)
// Key: string, ttlMs: durasi valid (default 5 menit)
export function getCache(key, ttlMs = 5 * 60 * 1000) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.time !== 'number') return null
    if (Date.now() - parsed.time > ttlMs) {
      localStorage.removeItem(key)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

export function setCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, time: Date.now() }))
  } catch {
    // Jika localStorage penuh, hapus cache lama wmc:*
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('wmc:')) localStorage.removeItem(k)
      })
      localStorage.setItem(key, JSON.stringify({ data, time: Date.now() }))
    } catch {}
  }
}

export function clearCache(key) {
  try { localStorage.removeItem(key) } catch {}
}

// Pre-cache gambar ke CacheStorage agar kunjungan berikutnya tidak fetch ulang
// Dipanggil otomatis oleh lazy loader, tapi bisa juga manual
export async function preCacheImages(urls) {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open('wmc-v1-images')
    await Promise.all(urls.filter(Boolean).map(async url => {
      try {
        const match = await cache.match(url)
        if (!match) {
          const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
          if (res.ok) await cache.put(url, res)
        }
      } catch {}
    }))
  } catch {}
}
