import { supabase } from './supabase.js'
import { requireAuth, showToast, showLoading, hideLoading, initLazyLoad, registerSW, getCache, setCache, preCacheImages } from './utils.js'

let session, player
let bannerAktif = null // banner yang sedang dibuka di View 2

const CACHE_KEY_LIST = 'wmc:gacha:allCards'
const CACHE_TTL_LIST = 10 * 60 * 1000 // 10 menit — data cards jarang berubah
const CACHE_TTL_DETAIL = 10 * 60 * 1000

async function init() {
  registerSW()
  session = await requireAuth(supabase)
  if (!session) return
  await muatPlayer()
  await muatListBanner()
  setupEventListener()
}

async function muatPlayer() {
  const { data } = await supabase
    .from('players')
    .select('key_silver, pity_rare, pity_epic')
    .eq('id', session.user.id)
    .single()
  if (!data) return
  player = data
  updateFooter()
  updateModalInfo()
}

function updateFooter() {
  if (!player) return
  document.getElementById('footer-key').textContent = player.key_silver
  document.getElementById('footer-pity-rare').textContent = `${player.pity_rare}/15`
  document.getElementById('footer-pity-epic').textContent = `${player.pity_epic}/25`
}

function updateModalInfo() {
  if (!player) return
  document.getElementById('modal-silver').textContent = player.key_silver
  document.getElementById('modal-pity-rare').textContent = `${player.pity_rare}/15`
  document.getElementById('modal-pity-epic').textContent = `${player.pity_epic}/25`
}

function renderListBanner(allCards, container) {
  if (!allCards?.length) {
    container.innerHTML =
      '<p class="text-center text-sm mt-8" style="color: var(--teks-sekunder);">Belum ada banner tersedia.</p>'
    return
  }
  // Kelompokkan per banner
  const bannerMap = new Map()
  allCards.forEach(c => {
    if (!bannerMap.has(c.banner)) {
      bannerMap.set(c.banner, { banner: c.banner, banner_label: c.banner_label, cards: [] })
    }
    bannerMap.get(c.banner).cards.push(c)
  })

  container.innerHTML = ''
  const previewUrls = []
  for (const bannerData of bannerMap.values()) {
    const card = buatBannerCard(bannerData)
    container.appendChild(card)
    // kumpulkan url preview untuk pre-cache (3 per banner saja)
    const urutan = ['epic', 'rare', 'common']
    urutan.forEach(r => {
      const k = bannerData.cards.find(x => x.rarity === r)
      if (k?.image_url) previewUrls.push(k.image_url)
    })
  }
  initLazyLoad(container)
  // Simpan gambar preview ke CacheStorage di background (tidak block render)
  if (previewUrls.length) preCacheImages(previewUrls)
}

async function muatListBanner() {
  const container = document.getElementById('list-banner')
  const cached = getCache(CACHE_KEY_LIST, CACHE_TTL_LIST)

  // Tampilkan cache dulu biar instan (stale-while-revalidate)
  if (cached?.length) {
    renderListBanner(cached, container)
  } else {
    container.innerHTML = '<p class="text-center text-sm mt-8" style="color: var(--teks-sekunder);">Memuat banner...</p>'
  }

  // Fetch fresh di background
  try {
    const { data: allCards } = await supabase
      .from('cards')
      .select('banner, banner_label, image_url, name, rarity')
      .neq('banner', null)

    if (!allCards?.length) {
      if (!cached?.length) {
        container.innerHTML =
          '<p class="text-center text-sm mt-8" style="color: var(--teks-sekunder);">Belum ada banner tersedia.</p>'
      }
      return
    }

    // Simpan ke cache browser
    setCache(CACHE_KEY_LIST, allCards)

    // Re-render hanya jika data berbeda dari cache (hindari flicker)
    const cachedStr = cached ? JSON.stringify(cached) : ''
    const freshStr = JSON.stringify(allCards)
    if (cachedStr !== freshStr) {
      renderListBanner(allCards, container)
    }
  } catch {
    // Jika fetch gagal tapi ada cache, tetap pakai cache
    if (!cached?.length) {
      container.innerHTML =
        '<p class="text-center text-sm mt-8" style="color: var(--teks-sekunder);">Gagal memuat banner.</p>'
    }
  }
}

function buatBannerCard(bannerData) {
  const kartuList = bannerData.cards || []
  const div = document.createElement('div')
  div.className = 'banner-card'

  // Strip gambar di kiri
  const strip = document.createElement('div')
  strip.className = 'banner-strip'

  const urutan = ['epic', 'rare', 'common']
  const sorted = urutan
    .map(r => kartuList.find(k => k.rarity === r))
    .filter(Boolean)
    .slice(0, 3)

  // Placeholder 1x1 transparan untuk lazy
  const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

  sorted.forEach(k => {
    if (k?.image_url) {
      const img = document.createElement('img')
      img.className = 'banner-strip-img lazy-img'
      img.src = PLACEHOLDER
      img.dataset.src = k.image_url
      img.alt = k.name || ''
      img.loading = 'lazy'
      img.decoding = 'async'
      strip.appendChild(img)
    } else {
      const ph = document.createElement('div')
      ph.className = 'banner-strip-img'
      ph.style.background = 'linear-gradient(135deg,#e5e7eb,#d1d5db)'
      strip.appendChild(ph)
    }
  })

  // Info teks kanan
  const rarityCounts = { epic: 0, rare: 0, common: 0 }
  kartuList.forEach(k => { if (rarityCounts[k.rarity] !== undefined) rarityCounts[k.rarity]++ })

  const badges = [
    rarityCounts.epic   > 0 ? `<span class="banner-badge badge-epic">Epic ×${rarityCounts.epic}</span>` : '',
    rarityCounts.rare   > 0 ? `<span class="banner-badge badge-rare">Rare ×${rarityCounts.rare}</span>` : '',
    rarityCounts.common > 0 ? `<span class="banner-badge badge-common">Common ×${rarityCounts.common}</span>` : '',
  ].join('')

  div.innerHTML = `
    <div class="banner-info">
      <p class="banner-nama">${bannerData.banner_label}</p>
      <div class="banner-badge-wrap">${badges}</div>
    </div>
  `
  div.insertBefore(strip, div.firstChild)

  // bannerData sudah berisi banner key & label, pakai langsung
  div.addEventListener('click', () => bukaDetailBanner({ banner: bannerData.banner, banner_label: bannerData.banner_label }))
  return div
}

function renderDetailGrid(kartu, container) {
  container.innerHTML = ''
  const grid = document.createElement('div')
  grid.className = 'kartu-grid'
  const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  // Urutkan: rarity Epic→Rare→Common → ATK tertinggi dulu → nama A-Z
  const urutan = { epic: 0, rare: 1, common: 2 }
  const sortedKartu = [...(kartu || [])].sort((a, b) => {
    const r = (urutan[a.rarity] ?? 3) - (urutan[b.rarity] ?? 3)
    if (r !== 0) return r
    const atk = (b.base_atk ?? 0) - (a.base_atk ?? 0)
    if (atk !== 0) return atk
    return (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' })
  })
  sortedKartu.forEach(k => {
    const item = document.createElement('div')
    item.className = 'kartu-grid-item'
    const borderSrc = `assets/ui/border_${k.rarity}.png`
    item.innerHTML = `
      <div style="position: relative;">
        ${k.image_url
          ? `<img class="kartu-grid-img lazy-img" src="${PLACEHOLDER}" data-src="${k.image_url}" alt="${k.name}" loading="lazy" decoding="async">`
          : `<div class="kartu-grid-img-placeholder">🎴</div>`
        }
        <img src="${borderSrc}" alt="" class="kartu-grid-border" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none;" loading="lazy">
      </div>
      <div class="kartu-grid-info">
        <p class="kartu-grid-nama">${k.name}</p>
        <p class="kartu-grid-atk">ATK: ${k.base_atk}</p>
      </div>
    `
    grid.appendChild(item)
  })
  container.appendChild(grid)
  initLazyLoad(grid)
  // Pre-cache semua gambar detail di background
  const urls = sortedKartu.map(k => k.image_url).filter(Boolean)
  if (urls.length) preCacheImages(urls)
}

async function bukaDetailBanner(banner) {
  bannerAktif = banner
  document.getElementById('view-list').classList.add('hidden')
  document.getElementById('view-detail').classList.remove('hidden')
  document.getElementById('detail-nama-banner').textContent = banner.banner_label
  updateTombolGacha()

  const container = document.getElementById('list-kartu-detail')
  const cacheKey = `wmc:gacha:detail:${banner.banner}`
  const cachedDetail = getCache(cacheKey, CACHE_TTL_DETAIL)

  if (cachedDetail?.length) {
    renderDetailGrid(cachedDetail, container)
  } else {
    container.innerHTML = '<p class="text-center text-sm mt-4" style="color: var(--teks-sekunder);">Memuat kartu...</p>'
  }

  try {
    const { data: kartu } = await supabase
      .from('cards')
      .select('*')
      .eq('banner', banner.banner)

    if (kartu?.length) {
      // Sort: rarity Epic→Rare→Common → ATK desc → nama asc
      const urutan = { epic: 0, rare: 1, common: 2 }
      const sortFn = (a, b) => {
        const r = (urutan[a.rarity] ?? 3) - (urutan[b.rarity] ?? 3)
        if (r !== 0) return r
        const atk = (b.base_atk ?? 0) - (a.base_atk ?? 0)
        if (atk !== 0) return atk
        return (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' })
      }
      kartu.sort(sortFn)
      setCache(cacheKey, kartu)
      // Bandingkan dengan cache yang juga di-sort (renderDetailGrid sort internal)
      const cachedSorted = cachedDetail ? [...cachedDetail].sort(sortFn) : null
      const cachedStr = cachedSorted ? JSON.stringify(cachedSorted) : ''
      const freshStr = JSON.stringify(kartu)
      if (cachedStr !== freshStr) {
        renderDetailGrid(kartu, container)
      }
    } else if (!cachedDetail?.length) {
      container.innerHTML = '<p class="text-center text-sm mt-4" style="color: var(--teks-sekunder);">Tidak ada kartu.</p>'
    }
  } catch {
    if (!cachedDetail?.length) {
      container.innerHTML = '<p class="text-center text-sm mt-4" style="color: var(--teks-sekunder);">Gagal memuat kartu.</p>'
    }
  }
}

function updateTombolGacha() {
  const btn = document.getElementById('btn-gacha')
  if (player?.key_silver >= 1) {
    btn.disabled = false
    btn.style.background = 'var(--primary)'
  } else {
    btn.disabled = true
    btn.style.background = '#ccc'
  }
}

async function lakukanGacha() {
  if (!bannerAktif || !player) return
  if (player.key_silver < 1) {
    showToast('Key Silver tidak cukup!')
    return
  }

  showLoading()
  const { data, error } = await supabase.functions.invoke('gacha', {
    body: { banner: bannerAktif.banner }
  })
  hideLoading()

  if (error || !data) {
    showToast('Gacha gagal, coba lagi.')
    return
  }

  player.key_silver = data.key_silver_baru
  player.pity_rare = data.pity_rare_baru
  player.pity_epic = data.pity_epic_baru
  updateFooter()
  updateTombolGacha()

  // Gacha mengubah koleksi, tapi banner list tidak perlu invalidate — hanya koleksi
  tampilReveal(data)
}

function tampilReveal(data) {
  const modal = document.getElementById('modal-reveal')
  const revealWrap = document.getElementById('reveal-wrap')
  document.getElementById('reveal-gambar').src = data.kartu.image_url || ''
  document.getElementById('reveal-nama').textContent = data.kartu.name
  document.getElementById('reveal-atk').textContent = `ATK: ${data.kartu.base_atk}`
  const rarityMap = {
    epic: { warna: 'var(--rarity-epic)', label: '✨ EPIC' },
    rare: { warna: 'var(--rarity-rare)', label: '⭐ RARE' },
    common: { warna: 'var(--rarity-common)', label: 'COMMON' },
  }
  const info = rarityMap[data.kartu.rarity] || rarityMap.common
  document.getElementById('reveal-rarity').textContent = info.label
  document.getElementById('reveal-rarity').style.color = info.warna
  document.getElementById('reveal-label').textContent = data.baru ? '✨ NEW!' : '🔁 DUPLIKAT'
  document.getElementById('reveal-label').style.color = data.baru ? 'var(--primary)' : 'var(--aksen)'
  const borderEl = document.getElementById('reveal-border')
  borderEl.src = `assets/ui/border_${data.kartu.rarity}.png`
  revealWrap.classList.remove('gacha-reveal')
  void revealWrap.offsetWidth
  revealWrap.classList.add('gacha-reveal')
  modal.classList.remove('hidden')
  modal.onclick = () => modal.classList.add('hidden')
  // Pre-cache gambar hasil gacha
  if (data.kartu?.image_url) preCacheImages([data.kartu.image_url])
}

function setupEventListener() {
  document.getElementById('btn-back').addEventListener('click', () => {
    document.getElementById('view-detail').classList.add('hidden')
    document.getElementById('view-list').classList.remove('hidden')
  })
  document.getElementById('btn-info-gacha').addEventListener('click', () => {
    updateModalInfo()
    document.getElementById('modal-info-gacha').classList.remove('hidden')
  })
  document.getElementById('btn-tutup-info-gacha').addEventListener('click', () => {
    document.getElementById('modal-info-gacha').classList.add('hidden')
  })
  document.getElementById('btn-gacha').addEventListener('click', lakukanGacha)
}

init()
