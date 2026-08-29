// Service Worker untuk Waifu Math Clash — cache gambar & data gacha/koleksi
// Versi cache — bump jika ada perubahan aset penting
const CACHE_VERSION = 'wmc-v2'
const IMAGE_CACHE = CACHE_VERSION + '-images'
const DATA_CACHE = CACHE_VERSION + '-data'

// Install — langsung aktif tanpa tunggu
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate — hapus cache lama, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

// Helper: cache first untuk gambar
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    // update di background (stale-while-revalidate ringan)
    fetch(request).then(res => {
      if (res && res.ok) cache.put(request, res.clone())
    }).catch(() => {})
    return cached
  }
  try {
    const res = await fetch(request)
    if (res && res.ok) {
      cache.put(request, res.clone())
    }
    return res
  } catch (e) {
    return cached || Response.error()
  }
}

// Helper: network first untuk data API (fallback ke cache jika offline)
async function networkFirst(request, cacheName, ttlMs = 5 * 60 * 1000) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(request)
    if (res && res.ok) {
      // simpan dengan header waktu untuk TTL check manual
      const cloned = res.clone()
      const headers = new Headers(cloned.headers)
      headers.set('x-cache-time', Date.now().toString())
      const withTime = new Response(await cloned.blob(), {
        status: cloned.status,
        statusText: cloned.statusText,
        headers
      })
      cache.put(request, withTime.clone())
      return res
    }
    throw new Error('bad response')
  } catch (e) {
    const cached = await cache.match(request)
    if (cached) {
      const cachedTime = cached.headers.get('x-cache-time')
      if (cachedTime && Date.now() - parseInt(cachedTime, 10) > ttlMs) {
        // expired → tetap kembalikan tapi log
      }
      return cached
    }
    throw e
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Abaikan chrome-extension, dll
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // 1) Gambar: Supabase Storage, assets/ui, atau destination image
  const isImage =
    req.destination === 'image' ||
    /\.(png|jpg|jpeg|webp|gif|svg|avif)$/i.test(url.pathname) ||
    (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/object')) ||
    url.pathname.includes('/assets/ui/')

  if (isImage) {
    event.respondWith(cacheFirst(req, IMAGE_CACHE))
    return
  }

  // 2) Data cards untuk gacha/koleksi (Supabase REST)
  // Contoh: /rest/v1/cards?banner=eq.xxx atau /rest/v1/player_cards
  const isSupabaseRest =
    url.hostname.includes('supabase.co') &&
    url.pathname.includes('/rest/v1/') &&
    (url.pathname.includes('/cards') || url.pathname.includes('/player_cards'))

  if (isSupabaseRest) {
    // Untuk list banner & detail, cache 5 menit; untuk player_cards 2 menit
    const ttl = url.pathname.includes('player_cards') ? 2 * 60 * 1000 : 5 * 60 * 1000
    event.respondWith(networkFirst(req, DATA_CACHE, ttl))
    return
  }

  // 3) File statis lain (css, js) — cache first ringan
  if (/\.(css|js)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, DATA_CACHE))
  }
})
