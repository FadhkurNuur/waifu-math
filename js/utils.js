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

// ===== Number Pad Koma-only (reuse untuk game-class) =====
// Pakai: createNumberPad(containerEl, { onSubmit, onChange, maxLen:10 })
// Container akan diisi: display + grid 3x4 (7 8 9 / 4 5 6 / 1 2 3 / , 0 ⌫) + tombol Kirim
// Display readonly, tidak trigger keyboard sistem. Support koma satu saja, normalisasi koma→titik saat compare.
export function createNumberPad(containerEl, opts = {}) {
  const maxLen = opts.maxLen || 10
  let value = '' // string dengan koma, ex: "1,5"
  const onSubmit = opts.onSubmit || (()=>{})
  const onChange = opts.onChange || (()=>{})

  containerEl.innerHTML = `
    <div class="numpad-display input-field text-center font-extrabold" style="font-size:1.4rem; letter-spacing:0.04em; min-height:48px; display:flex; align-items:center; justify-content:center; background:#fff;"></div>
    <div class="numpad-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-top:8px;"></div>
    <button class="btn-utama numpad-kirim" style="margin-top:8px;">Kirim Jawaban</button>
  `
  const display = containerEl.querySelector('.numpad-display')
  const grid = containerEl.querySelector('.numpad-grid')
  const btnKirim = containerEl.querySelector('.numpad-kirim')

  function renderDisplay() {
    display.textContent = value || '—'
    display.style.color = value ? 'var(--teks)' : 'var(--teks-sekunder)'
    onChange(value)
  }
  function inputKey(k) {
    if (k === 'del') {
      value = value.slice(0, -1)
    } else if (k === ',') {
      if (value.includes(',')) return
      if (value === '' || value === '-') value += '0,'
      else value += ','
    } else if (k === '-') {
      if (value.startsWith('-')) value = value.slice(1)
      else value = '-' + value
    } else {
      // digit
      if (value.replace('-','').replace(',','').length >= maxLen) return
      // hindari leading 0 ganda
      if (value === '0' && k === '0') return
      if (value === '0' && k !== ',') value = k
      else value += k
    }
    renderDisplay()
  }
  const keys = ['7','8','9','4','5','6','1','2','3',',','0','del']
  keys.forEach(k=>{
    const b=document.createElement('button')
    b.type='button'
    b.className='numpad-btn'
    b.style.cssText='padding:0.75rem 0; border-radius:12px; border:2px solid #e8ecef; background:#fff; font-family:Nunito,sans-serif; font-size:1.1rem; font-weight:800; color:var(--teks); cursor:pointer; transition: transform 0.08s, background 0.12s;'
    if(k==='del'){ b.textContent='⌫'; b.style.color='var(--aksen)'; b.style.borderColor='var(--aksen)'; }
    else if(k===','){ b.textContent=','; }
    else { b.textContent=k; }
    b.addEventListener('click', ()=> inputKey(k))
    b.addEventListener('touchstart', ()=> b.style.transform='scale(0.96)', {passive:true})
    b.addEventListener('touchend', ()=> b.style.transform='', {passive:true})
    grid.appendChild(b)
  })
  // tombol minus kecil di bawah grid jika perlu negatif (opsional, tampil selalu)
  const minusBtn=document.createElement('button')
  minusBtn.type='button'
  minusBtn.textContent='±'
  minusBtn.title='Minus'
  minusBtn.style.cssText='position:absolute; top:6px; right:8px; width:28px; height:28px; border-radius:50%; border:1.5px solid var(--teks-sekunder); background:#fff; color:var(--teks-sekunder); font-weight:800; font-size:0.8rem; cursor:pointer;'
  minusBtn.onclick=()=> inputKey('-')
  containerEl.style.position='relative'
  containerEl.appendChild(minusBtn)

  btnKirim.onclick=()=> {
    const trimmed = value.trim()
    if(!trimmed || trimmed==='-' || trimmed===',') { showToast('Isi jawaban dulu'); return }
    onSubmit(trimmed)
  }
  renderDisplay()
  return {
    getValue: ()=> value,
    setValue: (v)=> { value = String(v||''); renderDisplay() },
    clear: ()=> { value=''; renderDisplay() },
    focus: ()=> {},
    destroy: ()=> { containerEl.innerHTML='' }
  }
}

// ===== QWERTY Alphabet Pad (untuk game-decoder) =====
// Layout QWERTY 3 baris: QWERTYUIOP / ASDFGHJKL / ZXCVBNM + del
// Pakai: createQwertyPad(containerEl, { onSubmit, onChange })
// onSubmit menerima huruf string "A".."Z"
export function createQwertyPad(containerEl, opts = {}) {
  const onSubmit = opts.onSubmit || (()=>{})
  const onChange = opts.onChange || (()=>{})
  let value = ''
  containerEl.innerHTML = `
    <div class="qwerty-display input-field text-center font-extrabold" style="font-size:1.5rem; letter-spacing:0.12em; min-height:48px; display:flex; align-items:center; justify-content:center; background:#fff;"></div>
    <div class="qwerty-grid" style="display:flex; flex-direction:column; gap:6px; margin-top:8px;"></div>
    <button class="btn-utama qwerty-kirim" style="margin-top:8px;">Kirim Huruf</button>
  `
  const display = containerEl.querySelector('.qwerty-display')
  const grid = containerEl.querySelector('.qwerty-grid')
  const btnKirim = containerEl.querySelector('.qwerty-kirim')
  function renderDisplay() {
    display.textContent = value || '—'
    display.style.color = value ? 'var(--teks)' : 'var(--teks-sekunder)'
    onChange(value)
  }
  function inputKey(k) {
    if (k === 'del') value = ''
    else {
      value = k
      renderDisplay()
      // auto preview
    }
    renderDisplay()
  }
  const rows = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']
  rows.forEach(row => {
    const r = document.createElement('div')
    r.style.cssText = 'display:flex; gap:4px; justify-content:center;'
    for (const ch of row) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = ch
      b.style.cssText = 'flex:1; max-width:36px; padding:0.6rem 0; border-radius:8px; border:1.5px solid #e8ecef; background:#fff; font-family:Nunito,sans-serif; font-size:0.95rem; font-weight:800; color:var(--teks); cursor:pointer;'
      b.addEventListener('click', ()=> inputKey(ch))
      r.appendChild(b)
    }
    if (row === 'ZXCVBNM') {
      const del = document.createElement('button')
      del.type='button'; del.textContent='⌫'; del.style.cssText='flex:0 0 52px; padding:0.6rem 0; border-radius:8px; border:1.5px solid var(--aksen); background:#fff; color:var(--aksen); font-weight:800; cursor:pointer;'
      del.addEventListener('click', ()=> inputKey('del'))
      r.appendChild(del)
    }
    grid.appendChild(r)
  })
  btnKirim.onclick = ()=> {
    if (!value || !/^[A-Z]$/.test(value)) { showToast('Pilih huruf A-Z dulu'); return }
    onSubmit(value)
  }
  renderDisplay()
  return {
    getValue: ()=> value,
    setValue: (v)=> { value = String(v||'').toUpperCase().slice(0,1); renderDisplay() },
    clear: ()=> { value=''; renderDisplay() },
    destroy: ()=> { containerEl.innerHTML='' }
  }
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
