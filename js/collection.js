import { supabase } from './supabase.js'
import { requireAuth, showToast, showLoading, hideLoading, hitungATK, initLazyLoad, registerSW, getCache, setCache, clearCache, preCacheImages } from './utils.js'

let session
let kartuList = [] // semua player_cards dalam banner aktif
let indexAktif = 0

const BIAYA_UPGRADE = { legendary: 1, epic: 1, rare: 3, common: 5 }
const CACHE_TTL = 2 * 60 * 1000 // 2 menit — koleksi sering berubah setelah gacha/upgrade

async function init() {
  registerSW()
  session = await requireAuth(supabase)
  if (!session) return
  await muatListBanner()
  setupEventListener()
}

function getCacheKey() {
  return `wmc:collection:list:${session.user.id}`
}

function renderListBanner(playerCards, container) {
  if (!playerCards?.length) {
    container.innerHTML =
      '<p class="text-center text-sm mt-8" style="color: var(--teks-sekunder);">Belum punya kartu. Coba gacha dulu!</p>'
    return
  }

  // Kelompokkan per banner
  const bannerMap = {}
  playerCards.forEach(pc => {
    const banner = pc.cards?.banner
    const bannerLabel = pc.cards?.banner_label
    if (!banner) return
    if (!bannerMap[banner]) {
      bannerMap[banner] = { label: bannerLabel, kartu: [] }
    }
    bannerMap[banner].kartu.push(pc)
  })

  container.innerHTML = ''

  const previewUrls = []
  for (const [bannerKey, info] of Object.entries(bannerMap)) {
    const div = document.createElement('div')
    div.className = 'banner-kol-card'

    // Ambil 3 kartu untuk strip (legendary, epic, rare, common — prioritas tertinggi dulu, max 3)
    const kartuPerRarity = {}
    info.kartu.forEach(k => {
      const r = k.cards?.rarity
      if (r && !kartuPerRarity[r]) kartuPerRarity[r] = k.cards
    })

    // Strip gambar di kiri
    const strip = document.createElement('div')
    strip.className = 'banner-strip'

    const urutan = ['legendary', 'epic', 'rare', 'common']
    const sorted = urutan
      .map(r => kartuPerRarity[r])
      .filter(Boolean)
      .slice(0, 3)

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
        previewUrls.push(k.image_url)
      } else {
        const ph = document.createElement('div')
        ph.className = 'banner-strip-img'
        ph.style.background = 'linear-gradient(135deg,#e5e7eb,#d1d5db)'
        strip.appendChild(ph)
      }
    })

    // Info teks kanan
    const rarityCounts = { legendary: 0, epic: 0, rare: 0, common: 0 }
    info.kartu.forEach(k => {
      const r = k.cards?.rarity
      if (rarityCounts[r] !== undefined) rarityCounts[r]++
    })

    const badges = [
      rarityCounts.legendary > 0 ? `<span class="banner-badge badge-legendary">Legendary ×${rarityCounts.legendary}</span>` : '',
      rarityCounts.epic   > 0 ? `<span class="banner-badge badge-epic">Epic ×${rarityCounts.epic}</span>` : '',
      rarityCounts.rare   > 0 ? `<span class="banner-badge badge-rare">Rare ×${rarityCounts.rare}</span>` : '',
      rarityCounts.common > 0 ? `<span class="banner-badge badge-common">Common ×${rarityCounts.common}</span>` : '',
    ].join('')

    div.innerHTML = `
      <div class="banner-info">
        <p class="banner-nama">${info.label}</p>
        <div class="banner-badge-wrap">${badges}</div>
      </div>
    `
    div.insertBefore(strip, div.firstChild)

    div.addEventListener('click', () => bukaDetailBanner(bannerKey, info.label, info.kartu))
    container.appendChild(div)
  }

  // Lazy load strip banner koleksi
  initLazyLoad(container)
  if (previewUrls.length) preCacheImages(previewUrls)
}

async function muatListBanner() {
  const container = document.getElementById('list-banner-kol')
  const cacheKey = getCacheKey()
  const cached = getCache(cacheKey, CACHE_TTL)

  if (cached?.length) {
    renderListBanner(cached, container)
  } else {
    container.innerHTML = '<p class="text-center text-sm mt-8" style="color: var(--teks-sekunder);">Memuat koleksi...</p>'
  }

  try {
    const { data: playerCards } = await supabase
      .from('player_cards')
      .select('id, player_id, card_id, stars, current_atk, created_at, cards(*)')
      .eq('player_id', session.user.id)

    if (!playerCards?.length) {
      if (!cached?.length) {
        container.innerHTML =
          '<p class="text-center text-sm mt-8" style="color: var(--teks-sekunder);">Belum punya kartu. Coba gacha dulu!</p>'
      }
      // Hapus cache kosong
      if (cached?.length) clearCache(cacheKey)
      return
    }

    setCache(cacheKey, playerCards)

    const cachedStr = cached ? JSON.stringify(cached) : ''
    const freshStr = JSON.stringify(playerCards)
    if (cachedStr !== freshStr) {
      renderListBanner(playerCards, container)
    }
  } catch {
    if (!cached?.length) {
      container.innerHTML =
        '<p class="text-center text-sm mt-8" style="color: var(--teks-sekunder);">Gagal memuat koleksi.</p>'
    }
  }
}

async function bukaDetailBanner(bannerKey, bannerLabel, kartu) {
  // Hitung duplikat per card_id (jumlah baris - 1 untuk baris utama)
  const semuaData = await supabase
    .from('player_cards')
    .select('id, card_id')
    .eq('player_id', session.user.id)

  const dupCountMap = {}
  if (semuaData.data) {
    semuaData.data.forEach(r => {
      dupCountMap[r.card_id] = (dupCountMap[r.card_id] || 0) + 1
    })
  }
  kartu.forEach(pc => {
    pc.jumlah_duplikat = Math.max(0, (dupCountMap[pc.card_id] || 1) - 1)
  })

  // Filter kartu unik: ambil hanya 1 per card_id dengan stars terbanyak
  const kartuUnikMap = {}
  kartu.forEach(pc => {
    const cardId = pc.card_id
    if (!kartuUnikMap[cardId] || pc.stars > kartuUnikMap[cardId].stars) {
      kartuUnikMap[cardId] = pc
    }
  })
  const kartuUnik = Object.values(kartuUnikMap)

  // Urutkan Legendary → Epic → Rare → Common
  const urutanRarity = { legendary: 0, epic: 1, rare: 2, common: 3 }
  kartuList = kartuUnik.sort((a, b) =>
    (urutanRarity[a.cards?.rarity] ?? 4) - (urutanRarity[b.cards?.rarity] ?? 4)
  )
  indexAktif = 0

  document.getElementById('detail-nama-banner').textContent = bannerLabel
  document.getElementById('view-list').classList.add('hidden')
  document.getElementById('view-detail').classList.remove('hidden')

  tampilKartu(indexAktif)
  setupSwipe()
  // Pre-cache gambar detail (swipe berikutnya biar instan)
  const detailUrls = kartuList.map(pc => pc.cards?.image_url).filter(Boolean)
  if (detailUrls.length) preCacheImages(detailUrls)
}

function tampilKartu(idx) {
  const pc = kartuList[idx]
  if (!pc) return
  const kartu = pc.cards

  // Gambar utama detail — eager karena langsung terlihat, tapi tetap cache via SW
  document.getElementById('kartu-gambar').src = kartu?.image_url || ''
  document.getElementById('kartu-gambar').loading = 'eager'
  document.getElementById('kartu-gambar').decoding = 'async'
  document.getElementById('kartu-border').src = `assets/ui/border_${kartu?.rarity || 'common'}.webp`
  document.getElementById('kartu-nama').textContent = kartu?.name || '-'
  document.getElementById('kartu-atk').textContent = `ATK: ${pc.current_atk}`
  document.getElementById('kartu-duplikat').textContent = `Duplikat: ${pc.jumlah_duplikat ?? 0}`

  // Render bintang
  const bintangWrap = document.getElementById('bintang-wrap')
  bintangWrap.innerHTML = ''
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span')
    s.className = 'bintang' + (i < pc.stars ? ' aktif' : '')
    s.textContent = '★'
    bintangWrap.appendChild(s)
  }

  updateTombolAksi(pc)
}

function updateTombolAksi(pc) {
  const kartu = pc.cards
  const rarity = kartu?.rarity || 'common'
  const biaya = BIAYA_UPGRADE[rarity] ?? 5
  const duplikat = pc.jumlah_duplikat ?? 0
  const bintang = pc.stars ?? 0

  const btnUpgrade = document.getElementById('btn-upgrade')
  const infoUpgrade = document.getElementById('info-upgrade')

  // Set favorite selalu aktif
  document.getElementById('btn-favorite').disabled = false

  if (bintang >= 5 && duplikat > 0) {
    // Bintang max, ada duplikat → konversi ke Key Gold
    btnUpgrade.innerHTML = `Konversi → <img src="assets/ui/icon_key_gold.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> Gold (${duplikat} duplikat)`
    btnUpgrade.style.background = rarity === 'legendary' ? 'var(--rarity-legendary)' : 'var(--rarity-epic)'
    btnUpgrade.disabled = false
    infoUpgrade.textContent = 'Setiap duplikat = 1 Key Gold'
  } else if (bintang >= 5) {
    btnUpgrade.textContent = '⬆ Upgrade (Max)'
    btnUpgrade.disabled = true
    btnUpgrade.style.background = ''
    infoUpgrade.textContent = 'Bintang sudah maksimal'
  } else if (duplikat >= biaya) {
    btnUpgrade.textContent = `⬆ Upgrade (-${biaya} 🃏)`
    btnUpgrade.disabled = false
    btnUpgrade.style.background = ''
    infoUpgrade.textContent = `Duplikat cukup!`
  } else {
    btnUpgrade.textContent = `⬆ Upgrade (-${biaya} 🃏)`
    btnUpgrade.disabled = true
    btnUpgrade.style.background = ''
    infoUpgrade.textContent = `Perlu ${biaya - duplikat} duplikat lagi`
  }
}

function setupSwipe() {
  const wrap = document.getElementById('swipe-wrap')
  let startX = 0

  wrap.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX
  }, { passive: true })

  wrap.addEventListener('touchend', e => {
    const diff = e.changedTouches[0].clientX - startX
    if (Math.abs(diff) > 40) {
      if (diff < 0) geserKanan()
      else geserKiri()
    }
  })

  document.getElementById('btn-prev').onclick = geserKiri
  document.getElementById('btn-next').onclick = geserKanan
}

function geserKiri() {
  if (indexAktif > 0) {
    indexAktif--
    tampilKartu(indexAktif)
  }
}

function geserKanan() {
  if (indexAktif < kartuList.length - 1) {
    indexAktif++
    tampilKartu(indexAktif)
  }
}

function setupEventListener() {
  document.getElementById('btn-back').addEventListener('click', () => {
    document.getElementById('view-detail').classList.add('hidden')
    document.getElementById('view-list').classList.remove('hidden')
  })

  document.getElementById('btn-favorite').addEventListener('click', setFavorite)
  document.getElementById('btn-upgrade').addEventListener('click', lakukanUpgrade)
}

async function setFavorite() {
  const pc = kartuList[indexAktif]
  if (!pc) return

  showLoading()
  // Upsert ke tabel player_favorite
  const { error } = await supabase
    .from('player_favorite')
    .upsert({ player_id: session.user.id, card_id: pc.card_id })
  hideLoading()

  if (error) {
    showToast('Gagal set favorite.')
  } else {
    showToast('✅ Kartu favorite berhasil diset!')
  }
}

async function lakukanUpgrade() {
  const pc = kartuList[indexAktif]
  if (!pc) return

  const bintang = pc.stars ?? 0
  const duplikat = pc.jumlah_duplikat ?? 0
  const rarity = pc.cards?.rarity || 'common'

  showLoading()

  if (bintang >= 5 && duplikat > 0) {
    // Konversi duplikat ke Key Gold
    const { error } = await supabase.rpc('konversi_duplikat', {
      p_player_card_id: pc.id,
      p_jumlah: duplikat
    })
    hideLoading()
    if (error) {
      showToast('Konversi gagal.')
    } else {
      showToast(`+${duplikat} Key Gold dari konversi duplikat!`)
      clearCache(getCacheKey())
      await segarkan(pc.id)
    }
    return
  }

  // Upgrade bintang
  const { error } = await supabase.rpc('upgrade_bintang', {
    p_player_card_id: pc.id
  })
  hideLoading()

  if (error) {
    showToast('Upgrade gagal.')
  } else {
    showToast(`✅ Upgrade berhasil! Bintang ${bintang + 1}`)
    clearCache(getCacheKey())
    await segarkan(pc.id)
  }
}

async function segarkan(playerCardId) {
  const { data } = await supabase
    .from('player_cards')
    .select('id, player_id, card_id, stars, current_atk, created_at, cards(*)')
    .eq('id', playerCardId)
    .single()

  if (data) {
    // Hitung ulang duplikat dari seluruh koleksi
    const { data: semuaRows } = await supabase
      .from('player_cards')
      .select('id, card_id')
      .eq('player_id', session.user.id)

    const dupCountMap = {}
    if (semuaRows) {
      semuaRows.forEach(r => {
        dupCountMap[r.card_id] = (dupCountMap[r.card_id] || 0) + 1
      })
    }
    data.jumlah_duplikat = Math.max(0, (dupCountMap[data.card_id] || 1) - 1)

    kartuList[indexAktif] = data
    tampilKartu(indexAktif)
    // Invalidate list cache agar buka list lagi tidak pakai data lama
    clearCache(getCacheKey())
  }
}

init()
