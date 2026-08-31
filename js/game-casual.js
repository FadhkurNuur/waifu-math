import { supabase } from './supabase.js'
import { requireAuth, showToast, hitungHP } from './utils.js'

// ================= Helper screen management — 3 screen: info, loading, arena =================
function showScreen(nama) {
  const info = document.getElementById('screen-info')
  const loading = document.getElementById('screen-loading')
  const arena = document.getElementById('screen-arena')
  const loadingOld = document.getElementById('loading-mencari')
  if (info) info.classList.toggle('hidden', nama !== 'info')
  if (loading) loading.classList.toggle('hidden', nama !== 'loading')
  if (arena) arena.classList.toggle('hidden', nama !== 'arena')
  if (loadingOld) loadingOld.classList.add('hidden')
  if (nama === 'arena') {
    document.body.style.background = '#1a1a2e'
  } else {
    document.body.style.background = 'var(--bg)'
  }
}
function tampilkanLoadingMencari() { showScreen('loading') }
function sembunyikanLoadingMencari() { showScreen('arena') }

// ================= State pencarian lawan (PvE only) =================
let isSearching = false
let searchTimeout10 = null       // timer 10 detik fallback
let searchDelayTimeout = null    // timer 800ms delay biar loading terlihat
let searchDelayResolve = null    // resolver promise delay agar bisa di-cancel tanpa hang

async function cariBotTerdekat(rank) {
  const { data } = await supabase
    .from('bots')
    .select('*')
    .order('rank', { ascending: true })
    .limit(1)
    .single()
  return data
}

async function buatBattleVsBotOtomatis(player) {
  if (isSearching) return null
  isSearching = true
  tampilkanLoadingMencari()

  // Timeout 10 detik — jika lewat 10 detik belum selesai, batal otomatis
  searchTimeout10 = setTimeout(() => {
    if (isSearching) {
      isSearching = false
      showToast('Gagal mencari lawan dalam 10 detik.')
      showScreen('info')
      setupCariButton(player)
      // bersihkan delay jika masih nunggu
      if (searchDelayTimeout) {
        clearTimeout(searchDelayTimeout)
        searchDelayTimeout = null
      }
      if (searchDelayResolve) {
        const r = searchDelayResolve
        searchDelayResolve = null
        r()
      }
    }
    searchTimeout10 = null
  }, 10000)

  // Cari bot rank setara
  let { data: bot } = await supabase
    .from('bots')
    .select('*')
    .eq('rank', player.rank)
    .limit(1)
    .maybeSingle()

  if (!isSearching) {
    if (searchTimeout10) { clearTimeout(searchTimeout10); searchTimeout10 = null }
    return null
  }

  if (!bot) bot = await cariBotTerdekat(player.rank)

  if (!isSearching) {
    if (searchTimeout10) { clearTimeout(searchTimeout10); searchTimeout10 = null }
    return null
  }

  if (!bot) {
    if (searchTimeout10) { clearTimeout(searchTimeout10); searchTimeout10 = null }
    isSearching = false
    showScreen('info')
    showToast('Tidak ada bot tersedia.')
    return null
  }

  // Simulasi pencarian biar loading terlihat (minimal 800ms), tetap bisa dibatalkan tanpa hang
  await new Promise(r => {
    searchDelayResolve = r
    searchDelayTimeout = setTimeout(() => {
      searchDelayTimeout = null
      searchDelayResolve = null
      r()
    }, 800)
  })

  if (!isSearching) {
    if (searchTimeout10) { clearTimeout(searchTimeout10); searchTimeout10 = null }
    return null
  }

  const hp = hitungHP(player.rank)
  const { data: battle, error } = await supabase
    .from('battles')
    .insert({
      player_id: player.id,
      opponent_id: bot.id,
      opponent_type: 'bot',
      player_hp: hp,
      opponent_hp: hp,
      current_turn: 'player',
      status: 'active',
      last_active: new Date().toISOString()
    })
    .select()
    .single()

  if (searchTimeout10) { clearTimeout(searchTimeout10); searchTimeout10 = null }
  if (searchDelayTimeout) { clearTimeout(searchDelayTimeout); searchDelayTimeout = null }
  searchDelayResolve = null

  if (!isSearching) return null

  if (error || !battle) {
    isSearching = false
    showScreen('info')
    showToast('Gagal membuat battle.')
    return null
  }
  isSearching = false
  window.location.href = `game-casual.html?id=${battle.id}`
  return battle
}

function setupCariButton(player) {
  const btnCari = document.getElementById('btn-cari-musuh')
  if (!btnCari) return
  btnCari.disabled = false
  btnCari.textContent = 'Cari Musuh'
  btnCari.onclick = async () => {
    btnCari.disabled = true
    btnCari.textContent = 'Mencari...'
    showScreen('loading')
    await buatBattleVsBotOtomatis(player)
  }
}

function batalCari() {
  // Hentikan semua timer pencarian agar tidak hang dan tidak redirect
  isSearching = false
  if (searchTimeout10) { clearTimeout(searchTimeout10); searchTimeout10 = null }
  if (searchDelayTimeout) {
    clearTimeout(searchDelayTimeout)
    searchDelayTimeout = null
  }
  if (searchDelayResolve) {
    const r = searchDelayResolve
    searchDelayResolve = null
    r() // resolve promise yang masih nunggu 800ms biar buatBattleVsBotOtomatis bisa return
  }
  showScreen('info')
  const btnCari = document.getElementById('btn-cari-musuh')
  if (btnCari) {
    btnCari.disabled = false
    btnCari.textContent = 'Cari Musuh'
  }
}

function showSurrenderModal() {
  if (sudahSelesai || !battle) return
  document.getElementById('modal-surrender')?.classList.remove('hidden')
}
function hideSurrenderModal() {
  document.getElementById('modal-surrender')?.classList.add('hidden')
}
async function confirmSurrender() {
  hideSurrenderModal()
  if (sudahSelesai || !battle) return
  clearInterval(afkInterval)
  stopTimer()
  try {
    await supabase.functions.invoke('selesai-battle', {
      body: { battle_id: battle.id, winner: 'opponent' }
    })
  } catch {}
  // selesaiBattle punya guard sudahSelesai, jadi jangan set flag sebelum panggil
  selesaiBattle('opponent')
}
async function surrenderBattle() { showSurrenderModal() }

// ================= State battle (PvE only) =================
let session, player, battle, botData
let kartuPlayerPool = { common: [], rare: [], epic: [], legendary: [] }
let kartuBot = { common: null, rare: null, epic: null }
let slotPreview = { common: null, rare: null, epic: null, legendary: null }
let kartuTerpilih = null
let timerInterval = null
let afkInterval = null
let sudahSelesai = false
let hpAwalPlayer, hpAwalLawan
let waktuMulaiGiliranPlayer = null

function timerDariatk(atk) {
  if (atk <= 20) return 5
  if (atk <= 40) return 6
  if (atk <= 60) return 7
  if (atk <= 80) return 8
  return 10
}
const FALLBACK_WAIFU = 'assets/ui/fallback-waifu.webp'
function borderUrl(rarity) {
  // border tidak lagi dipakai di arena — pure img saja, fallback ke fallback-waifu.webp
  return FALLBACK_WAIFU
}
function labelKesulitan(atk) {
  if (atk <= 20) return 'Sangat Mudah'
  if (atk <= 40) return 'Mudah'
  if (atk <= 60) return 'Sedang'
  if (atk <= 80) return 'Sulit'
  return 'Sangat Sulit'
}

// ================= Init =================
let battleId

async function init() {
  session = await requireAuth(supabase)
  if (!session) return

  const params = new URLSearchParams(window.location.search)
  battleId = params.get('id')

  // Muat data player dulu (dibutuhkan untuk auto buat battle vs bot)
  const { data: p } = await supabase
    .from('players')
    .select('id, username, rank, total_power')
    .eq('id', session.user.id)
    .single()
  if (!p) { window.location.href = 'home.html'; return }
  player = p

  // Wire tombol Batal & Surrender lebih awal agar selalu aktif (fix batal di Screen 2 tidak berfungsi)
  const btnBatalGlobal = document.getElementById('btn-batal-cari')
  if (btnBatalGlobal) btnBatalGlobal.onclick = batalCari
  const btnSurrender = document.getElementById('btn-surrender')
  if (btnSurrender) btnSurrender.onclick = showSurrenderModal
  const btnConfirmSurr = document.getElementById('btn-confirm-surrender')
  if (btnConfirmSurr) btnConfirmSurr.onclick = confirmSurrender
  const btnCancelSurr = document.getElementById('btn-cancel-surrender')
  if (btnCancelSurr) btnCancelSurr.onclick = hideSurrenderModal
  const modalSurr = document.getElementById('modal-surrender')
  if (modalSurr) modalSurr.addEventListener('click', (e) => {
    if (e.target === modalSurr) hideSurrenderModal()
  })
  document.getElementById('btn-kembali')?.addEventListener('click', () => {
    window.location.href = 'game-casual.html'
  })

  // Screen flow: tanpa ?id → Screen 1 (Info), dengan ?id → Screen 2 (Loading) → Screen 3 (Arena)
  if (!battleId) {
    showScreen('info')
    setupCariButton(player)
    return
  }

  // Ada battle id → langsung tampilkan loading sebelum data siap (hindari flash arena)
  showScreen('loading')

  // Muat data battle — hanya PvE
  const { data: b } = await supabase
    .from('battles')
    .select('*')
    .eq('id', battleId)
    .single()
  if (!b || b.status === 'finished') {
    showScreen('info')
    setupCariButton(player)
    showToast('Battle tidak ditemukan / sudah selesai. Cari musuh baru.')
    return
  }
  battle = b

  // Jika battle lama masih bertipe player (sisa data lama), anggap sebagai bot untuk kompatibilitas
  if (battle.opponent_type !== 'bot') {
    console.warn('[WARN] Battle opponent_type bukan bot, fallback ke bot')
    battle.opponent_type = 'bot'
  }

  hpAwalPlayer = battle.player_hp
  hpAwalLawan = battle.opponent_hp

  await muatKartuPlayer()
  await muatInfoLawan()

  updateHP(battle.player_hp, battle.opponent_hp)
  document.getElementById('nama-player').textContent = player.username || 'Kamu'

  await supabase
    .from('battles')
    .update({ last_active: new Date().toISOString() })
    .eq('id', battleId)

  // AFK detection PvE saja — mulai setelah 10 detik
  setTimeout(() => {
    afkInterval = setInterval(() => cekAFK(), 5000)
  }, 10000)

  sembunyikanLoadingMencari()
  prosesGiliran()
}

// ================= Muat Kartu Player =================
async function muatKartuPlayer() {
  const { data, error } = await supabase
    .from('player_cards')
    .select('id, card_id, stars, current_atk, cards!inner(name, image_url, rarity, base_atk)')
    .eq('player_id', session.user.id)

  if (error || !data) return
  kartuPlayerPool = { common: [], rare: [], epic: [], legendary: [] }
  data.forEach(row => {
    const rarity = row.cards?.rarity
    if (!rarity || !(rarity in kartuPlayerPool)) return
    kartuPlayerPool[rarity].push({
      ...row,
      ...row.cards,
      player_card_id: row.id,
      _rowId: row.id
    })
  })
}

// ================= Muat Info Lawan (PvE only) =================
async function muatInfoLawan() {
  const { data: bot } = await supabase
    .from('bots')
    .select('*')
    .eq('id', battle.opponent_id)
    .single()
  botData = bot
  document.getElementById('nama-lawan').textContent = bot?.name || 'Bot'

  // Bot tidak boleh random legendary — hanya common/rare/epic
  for (const rarity of ['common', 'rare', 'epic']) {
    const { data } = await supabase
      .from('cards')
      .select('id, name, image_url, rarity, base_atk')
      .eq('rarity', rarity)

    if (data && data.length > 0) {
      const randomCard = data[Math.floor(Math.random() * data.length)]
      const starsFromRank = Math.min(Math.floor((botData?.rank || 1) / 2), 2)
      const modifierMultiplier = 1 + (botData?.accuracy_modifier || 0)
      const current_atk = Math.ceil(randomCard.base_atk * (1 + starsFromRank * 0.2) * modifierMultiplier)
      kartuBot[rarity] = {
        ...randomCard,
        card_id: randomCard.id,
        stars: starsFromRank,
        current_atk
      }
    }
  }
}

// ================= Proses Giliran (PvE only) =================
function prosesGiliran() {
  const giliran = battle.current_turn
  // PvE: hanya 'player' atau 'opponent' (bot)
  if (giliran === 'player') {
    waktuMulaiGiliranPlayer = Date.now()
    tampilStateAksi('pilih-kartu')
    renderSlotRarity()
    labelGiliran('Giliranmu!')
  } else {
    waktuMulaiGiliranPlayer = null
    tampilStateAksi('tunggu')
    labelGiliran('Giliran Bot')
    setTimeout(() => giliranBot(), 1200)
  }
}

function labelGiliran(teks) {
  document.getElementById('label-giliran').textContent = teks
}

// ================= Render Slot Rarity =================
function renderSlotRarity() {
  const wrap = document.getElementById('slot-rarity-wrap')
  wrap.innerHTML = ''
  // Player bisa pakai legendary (dari Shop), legendary tampil paling kanan
  for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
    const pool = kartuPlayerPool[rarity] || []
    const div = document.createElement('div')
    div.className = 'slot-rarity' + (pool.length > 0 ? '' : ' disabled')
    if (pool.length > 0) {
      const preview = pool[Math.floor(Math.random() * pool.length)]
      slotPreview[rarity] = preview
      const atkPreview = preview.current_atk ?? preview.base_atk ?? 0
      div.innerHTML = `
        <div class="slot-gambar-mini">
          ${preview.image_url ? `<img src="${preview.image_url}" alt="${preview.name}" onerror="this.onerror=null;this.src='assets/ui/fallback-waifu.webp'">` : `<img src="assets/ui/fallback-waifu.webp" alt="">`}
        </div>
        <p class="text-xs font-bold" style="color:var(--teks);text-transform:capitalize;">${rarity} ×${pool.length}</p>
        <p class="text-xs font-bold" style="color:var(--primary);">ATK ${atkPreview}</p>
        <p class="text-xs" style="color:var(--teks-sekunder); font-style:italic;">${labelKesulitan(atkPreview)}</p>
      `
      div.addEventListener('click', () => pilihKartu(rarity))
    } else {
      div.innerHTML = `
        <div class="slot-gambar-mini" style="background:#eee;"></div>
        <p class="text-xs font-bold" style="color:#ccc;text-transform:capitalize;">${rarity}</p>
        <p class="text-xs" style="color:#ccc;">—</p>
      `
    }
    wrap.appendChild(div)
  }
}

// ================= Pilih Kartu & Muat Soal =================
async function pilihKartu(rarity) {
  if (slotPreview[rarity]) {
    kartuTerpilih = slotPreview[rarity]
  } else {
    const pool = kartuPlayerPool[rarity] || []
    if (!pool.length) return
    kartuTerpilih = pool[Math.floor(Math.random() * pool.length)]
  }
  if (!kartuTerpilih) return

  await supabase
    .from('battles')
    .update({ last_active: new Date().toISOString() })
    .eq('id', battle.id)

  updateWaifuAktif(kartuTerpilih)
  tampilStateAksi('soal')
  document.getElementById('teks-soal').textContent = 'Memuat soal...'
  document.getElementById('opsi-jawaban').innerHTML = ''
  stopTimer()

  const { data, error } = await supabase.functions.invoke('generate-soal', {
    body: { atk: kartuTerpilih.current_atk }
  })

  if (error || !data) {
    showToast('Gagal memuat soal.')
    tampilStateAksi('pilih-kartu')
    return
  }
  tampilSoal(data)
}

function tampilSoal(data) {
  document.getElementById('teks-soal').textContent = data.soal
  const opsiWrap = document.getElementById('opsi-jawaban')
  opsiWrap.innerHTML = ''
  data.opsi.forEach((opsi) => {
    const btn = document.createElement('button')
    btn.className = 'btn-jawab'
    btn.textContent = opsi
    btn.addEventListener('click', () => jawab(opsi, data.jawaban, btn))
    opsiWrap.appendChild(btn)
  })
  const detik = timerDariatk(kartuTerpilih.current_atk)
  mulaiTimer(detik, () => jawab(null, data.jawaban, null))
}

function mulaiTimer(detik, onHabis) {
  const wrap = document.getElementById('wrap-timer')
  const bar = document.getElementById('timer-bar')
  const teks = document.getElementById('timer-teks')
  wrap.classList.remove('hidden')
  bar.style.width = '100%'
  teks.textContent = `${detik} detik`
  let sisa = detik
  timerInterval = setInterval(() => {
    sisa--
    bar.style.width = `${(sisa / detik) * 100}%`
    teks.textContent = `${sisa} detik`
    if (sisa <= 0) {
      stopTimer()
      onHabis()
    }
  }, 1000)
}

function stopTimer() {
  clearInterval(timerInterval)
  timerInterval = null
  document.getElementById('wrap-timer')?.classList.add('hidden')
}

// ================= Jawab Soal =================
async function jawab(opsiDipilih, jawabanBenar, btnEl) {
  stopTimer()
  document.querySelectorAll('.btn-jawab').forEach(b => b.disabled = true)
  const benar = opsiDipilih !== null && opsiDipilih == jawabanBenar
  if (btnEl) btnEl.classList.add(benar ? 'benar' : 'salah')
  if (!benar) {
    document.querySelectorAll('.btn-jawab').forEach(b => {
      if (b.textContent == jawabanBenar) b.classList.add('benar')
    })
  }
  await new Promise(r => setTimeout(r, 800))

  const { data, error } = await supabase.functions.invoke('validasi-jawaban', {
    body: {
      battle_id: battle.id,
      card_id: kartuTerpilih.card_id || kartuTerpilih.id,
      rarity_slot: kartuTerpilih.rarity,
      benar,
      damage: benar ? kartuTerpilih.current_atk : 0,
      actor: 'player'
    }
  })

  if (error) {
    showToast('Gagal menyimpan hasil.')
    return
  }

  battle.player_hp = data.player_hp
  battle.opponent_hp = data.opponent_hp
  battle.current_turn = data.current_turn

  updateHP(battle.player_hp, battle.opponent_hp)
  tambahLog(benar
    ? `Kamu menyerang dengan ${kartuTerpilih.name} — ${kartuTerpilih.current_atk} damage!`
    : `Kamu salah jawab — giliran hangus.`)

  if (benar) tampilDamageFloat(kartuTerpilih.current_atk)

  if (data.status === 'finished') {
    await supabase.functions.invoke('selesai-battle', {
      body: { battle_id: battle.id, winner: data.winner }
    })
    selesaiBattle(data.winner)
    return
  }

  tampilStateAksi('tunggu')
  labelGiliran('Giliran Bot')
  setTimeout(() => giliranBot(), 1500)
}

// ================= Giliran Bot =================
async function giliranBot() {
  if (sudahSelesai) return
  // Bot tidak boleh pakai legendary — filter hanya 3 rarity
  const rarityTersedia = ['common', 'rare', 'epic'].filter(r => kartuBot[r])
  if (rarityTersedia.length === 0) {
    await supabase.functions.invoke('selesai-battle', {
      body: { battle_id: battle.id, winner: 'player' }
    })
    selesaiBattle('player')
    return
  }
  const rarity = rarityTersedia[Math.floor(Math.random() * rarityTersedia.length)]
  const kartuB = kartuBot[rarity]
  updateWaifuAktif(kartuB)

  const modifier = botData?.accuracy_modifier || 0
  const akurasiBase = rarity === 'common' ? 0.8 : rarity === 'rare' ? 0.6 : 0.4
  const akurasi = Math.min(1, Math.max(0, akurasiBase + modifier))
  const benar = Math.random() < akurasi
  const damage = benar ? kartuB.current_atk : 0

  await new Promise(r => setTimeout(r, 1500))

  const { data, error } = await supabase.functions.invoke('validasi-jawaban', {
    body: {
      battle_id: battle.id,
      card_id: kartuB.card_id || kartuB.id,
      rarity_slot: rarity,
      benar,
      damage,
      actor: 'opponent'
    }
  })

  if (error) return

  battle.player_hp = data.player_hp
  battle.opponent_hp = data.opponent_hp
  battle.current_turn = data.current_turn

  updateHP(battle.player_hp, battle.opponent_hp)
  tambahLog(benar
    ? `${botData?.name || 'Bot'} menyerang dengan ${kartuB.name} — ${damage} damage!`
    : `${botData?.name || 'Bot'} salah jawab — giliran hangus.`)

  if (benar) {
    document.getElementById('area-info')?.classList.add('shake')
    setTimeout(() => document.getElementById('area-info')?.classList.remove('shake'), 400)
  }

  if (data.status === 'finished') {
    try {
      await supabase.functions.invoke('selesai-battle', {
        body: { battle_id: battle.id, winner: data.winner }
      })
    } catch {}
    selesaiBattle(data.winner)
    return
  }
  prosesGiliran()
}

// ================= Update HP =================
function updateHP(hpPlayer, hpLawan) {
  const pctPlayer = Math.max(0, (hpPlayer / hpAwalPlayer) * 100)
  const pctLawan = Math.max(0, (hpLawan / hpAwalLawan) * 100)
  document.getElementById('hp-player-bar').style.width = `${pctPlayer}%`
  document.getElementById('hp-lawan-bar').style.width = `${pctLawan}%`
  document.getElementById('hp-player-teks').textContent = `HP: ${hpPlayer}`
  document.getElementById('hp-lawan-teks').textContent = `HP: ${hpLawan}`
}

function updateWaifuAktif(kartu) {
  const img = document.getElementById('waifu-aktif-gambar')
  if (!img) return
  // Pure img tanpa border — fallback ke fallback-waifu.webp jika kosong atau error
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_WAIFU }
  img.src = kartu?.image_url || FALLBACK_WAIFU
}

function tampilDamageFloat(damage) {
  const container = document.getElementById('damage-container')
  if (!container) return
  const el = document.createElement('div')
  el.className = 'damage-float'
  el.textContent = `-${damage}`
  el.style.left = `${45 + Math.random() * 10}%`
  el.style.top = `45%`
  container.appendChild(el)
  setTimeout(() => el.remove(), 1000)
  const info = document.getElementById('area-info')
  if (info) {
    info.classList.add('shake')
    setTimeout(() => info.classList.remove('shake'), 400)
  }
}

function tambahLog(teks) {
  const log = document.getElementById('isi-log')
  const p = document.createElement('p')
  p.className = `log-item`
  const playerName = player.username || 'Kamu'
  const opponentName = botData?.name || document.getElementById('nama-lawan').textContent || 'Lawan'
  let teksFormatted = teks
  if (teks.includes(playerName)) {
    teksFormatted = teks.replace(playerName, `<span style="color: #3EC99E; font-weight: 700;">${playerName}</span>`)
  }
  if (teks.includes(opponentName)) {
    teksFormatted = teksFormatted.replace(opponentName, `<span style="color: #FF7FA0; font-weight: 700;">${opponentName}</span>`)
  }
  p.innerHTML = `› ${teksFormatted}`
  if (log.firstChild) log.insertBefore(p, log.firstChild)
  else log.appendChild(p)
}

// ================= Cek AFK (PvE only) =================
async function cekAFK() {
  const { data } = await supabase
    .from('battles')
    .select('last_active, current_turn')
    .eq('id', battleId)
    .single()
  if (!data) return

  // Hanya cek AFK saat giliran player vs bot — jika player diam >90 detik, bot menang
  if (data.current_turn === 'player' && waktuMulaiGiliranPlayer) {
    const selisihGiliranPlayer = (Date.now() - waktuMulaiGiliranPlayer) / 1000
    if (selisihGiliranPlayer > 90) {
      clearInterval(afkInterval)
      await supabase.functions.invoke('selesai-battle', {
        body: { battle_id: battle.id, winner: 'opponent' }
      })
      selesaiBattle('opponent')
    }
  }
}

// ================= Selesai Battle =================
async function selesaiBattle(winner) {
  if (sudahSelesai) return
  sudahSelesai = true
  clearInterval(afkInterval)
  stopTimer()

  const menang = winner === 'player'
  const modal = document.getElementById('modal-hasil')
  const icon = document.getElementById('hasil-icon')
  const judul = document.getElementById('hasil-judul')
  const desc = document.getElementById('hasil-desc')

  if (menang) {
    icon.innerHTML = '<img src="assets/ui/icon_cup.svg" alt="trophy" style="width:1em;height:1em;vertical-align:middle;display:inline;">'
    judul.textContent = 'Kamu Menang!'
    desc.innerHTML = '+1 <img src="assets/ui/icon_key_silver.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> Key Silver'
    tampilKonfeti()
  } else {
    icon.textContent = '💔'
    judul.textContent = 'Kamu Kalah!'
    desc.textContent = 'Semangat lagi!'
  }
  modal.classList.remove('hidden')
}

function tampilKonfeti() {
  const container = document.getElementById('konfeti-container')
  const warna = ['#3EC99E', '#FF7FA0', '#FFD700', '#A78BFA']
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div')
    el.style.cssText = `
      position: absolute;
      width: ${6 + Math.random() * 8}px;
      height: ${6 + Math.random() * 8}px;
      background: ${warna[Math.floor(Math.random() * warna.length)]};
      border-radius: 2px;
      left: ${Math.random() * 100}%;
      top: -10px;
      animation: konfetiFall ${1.5 + Math.random() * 2}s ease-in ${Math.random() * 0.8}s forwards;
      transform: rotate(${Math.random() * 360}deg);
    `
    container.appendChild(el)
  }
  setTimeout(() => container.innerHTML = '', 5000)
}

function tampilStateAksi(state) {
  document.getElementById('state-pilih-kartu')?.classList.toggle('hidden', state !== 'pilih-kartu')
  document.getElementById('state-soal')?.classList.toggle('hidden', state !== 'soal')
  document.getElementById('state-tunggu')?.classList.toggle('hidden', state !== 'tunggu')
}

const styleAnim = document.createElement('style')
styleAnim.textContent = `
  @keyframes floatUp {
    0% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-60px); }
  }
  @keyframes konfetiFall {
    0% { opacity: 1; transform: translateY(0) rotate(0deg); }
    100% { opacity: 0; transform: translateY(100vh) rotate(720deg); }
  }
  .shake { animation: shakeAnim 0.4s ease; }
  @keyframes shakeAnim {
    0%,100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
`
document.head.appendChild(styleAnim)

init()
