import { supabase } from './supabase.js'
import { requireAuth, showToast, sudahClaimHariIni, sleep } from './utils.js'

let session, player

async function init() {
  session = await requireAuth(supabase)
  if (!session) return

  await muatPlayer()
  await cekDailyFlow()
  initGyroscope()
}

async function muatPlayer() {
  const { data } = await supabase
    .from('players')
    .select('*, player_cards(card_id, cards(image_url, name))')
    .eq('id', session.user.id)
    .single()

  if (!data) return
  player = data

  document.getElementById('txt-username').textContent = data.username
  document.getElementById('txt-rank').textContent = `Rank ${data.rank}`
  document.getElementById('txt-silver').innerHTML = `<img src="assets/ui/icon_key_silver.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> ${data.key_silver}`
  document.getElementById('txt-gold').innerHTML = `<img src="assets/ui/icon_key_gold.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> ${data.key_gold}`

  // Pasang background waifu favorit jika ada
  const { data: favData } = await supabase
    .from('player_favorite')
    .select('cards(image_url)')
    .eq('player_id', session.user.id)
    .single()

  const bgEl = document.getElementById('bg-waifu')
  const dimEl = document.getElementById('dim-overlay')
  const namaTengah = document.getElementById('nama-game-tengah')

  if (favData?.cards?.image_url) {
    bgEl.style.backgroundImage = `url('${favData.cards.image_url}')`
    dimEl.classList.remove('hidden')
    namaTengah.classList.add('hidden')
  }
}

// --- Daily Login & Quest ---
async function cekDailyFlow() {
  const { data } = await supabase
    .from('players')
    .select('last_login_claim, last_quest_claim')
    .eq('id', session.user.id)
    .single()

  if (!data) return

  const loginSudah = sudahClaimHariIni(data.last_login_claim)
  const questSudah = sudahClaimHariIni(data.last_quest_claim)

  if (!loginSudah) {
    tampilModalLogin()
  } else if (!questSudah) {
    tampilModalQuest()
  }
}

function tampilModalLogin() {
  const tanggal = new Date().getDate()
  const reward = tanggal % 2 === 0 ? 2 : 1
  const modal = document.getElementById('modal-login-harian')
  document.getElementById('reward-login-teks').innerHTML = `+${reward} <img src="assets/ui/icon_key_silver.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> Key Silver`
  modal.classList.remove('hidden')

  document.getElementById('btn-claim-login').onclick = async () => {
    modal.classList.add('hidden')
    const { error } = await supabase.rpc('claim_daily_login', { p_player_id: session.user.id })
    if (!error) showToast(`+${reward} Key Silver diklaim!`)
    tampilModalQuest()
    await muatPlayer()
  }
}

function tampilModalQuest() {
  const modal = document.getElementById('modal-quest-harian')
  modal.classList.remove('hidden')
  muatSoalQuest()
}

let questTimer, questData

async function muatSoalQuest() {
  // Minta soal via Edge Function
  const { data, error } = await supabase.functions.invoke('generate-soal', {
    body: { atk: 90 } // Sangat Sulit
  })

  if (error || !data) {
    document.getElementById('quest-soal').textContent = '5 × 12 = ?'
    questData = { soal: '5 × 12 = ?', jawaban: 60, opsi: [55, 60, 65, 70] }
  } else {
    questData = data
  }

  document.getElementById('quest-soal').textContent = questData.soal

  const opsiEl = document.getElementById('quest-opsi')
  opsiEl.innerHTML = ''
  questData.opsi.forEach(opsi => {
    const btn = document.createElement('button')
    btn.className = 'btn-utama'
    btn.textContent = opsi
    btn.style.fontSize = '1.1rem'
    btn.onclick = () => jawabQuest(opsi)
    opsiEl.appendChild(btn)
  })

  mulaiTimerQuest(60)
}

function mulaiTimerQuest(detik) {
  let sisa = detik
  const bar = document.getElementById('quest-timer-bar')
  const teks = document.getElementById('quest-timer-teks')

  clearInterval(questTimer)
  questTimer = setInterval(() => {
    sisa--
    const persen = (sisa / detik) * 100
    bar.style.width = persen + '%'
    teks.textContent = `${sisa} detik`

    if (sisa <= 0) {
      clearInterval(questTimer)
      jawabQuest(null) // timer habis
    }
  }, 1000)
}

async function jawabQuest(jawaban) {
  clearInterval(questTimer)

  // Nonaktifkan semua tombol
  document.querySelectorAll('#quest-opsi button').forEach(b => b.disabled = true)

  const hasil = document.getElementById('quest-hasil')
  const btnTutup = document.getElementById('btn-tutup-quest')
  const benar = jawaban === questData.jawaban

  if (benar) {
    hasil.textContent = '✅ Benar! +2 Key Silver'
    hasil.style.color = 'var(--primary)'
    hasil.classList.remove('hidden')
    // Klaim reward via Edge Function
    await supabase.rpc('claim_daily_quest', { p_player_id: session.user.id })
    showToast('+2 Key Silver dari Daily Quest!')
  } else {
    hasil.textContent = jawaban === null ? '⏰ Waktu habis!' : '❌ Salah!'
    hasil.style.color = 'var(--aksen)'
    hasil.classList.remove('hidden')
    await supabase
      .from('players')
      .update({ last_quest_claim: new Date().toISOString().slice(0, 10) })
      .eq('id', session.user.id)
  }

  btnTutup.classList.remove('hidden')
  btnTutup.onclick = async () => {
    document.getElementById('modal-quest-harian').classList.add('hidden')
    await muatPlayer()
  }
}

// --- Parallax Gyroscope ---
function initGyroscope() {
  const bg = document.getElementById('bg-waifu')

  if (!bg) {
    return
  }

  // Cek support DeviceOrientation
  if (typeof DeviceOrientationEvent === 'undefined') {
    return
  }

  // iOS memerlukan permission request
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    let permissionRequested = false
    document.addEventListener('click', async () => {
      if (permissionRequested) return
      permissionRequested = true
      try {
        const permission = await DeviceOrientationEvent.requestPermission()
        if (permission === 'granted') {
          startGyroscope(bg)
        }
      } catch (err) {
        // abaikan error permission
      }
    }, { once: true })
  } else {
    // Non-iOS - langsung start
    startGyroscope(bg)
  }
}

function startGyroscope(bg) {
  // Handler untuk event orientation
  const handleOrientation = (e) => {
    if (e.beta === null || e.gamma === null) {
      return
    }

    // beta: rotasi depan-belakang (-180 ~ 180), posisi netral ~90 saat portrait
    // gamma: rotasi kiri-kanan (-90 ~ 90), posisi netral ~0 saat portrait
    const beta = e.beta
    const gamma = e.gamma

    // Normalisasi beta dari posisi netral portrait (90 derajat)
    // Range efektif: 60-120 derajat (±30 dari netral)
    const betaOffset = beta - 90
    const normalizedBeta = Math.max(-30, Math.min(30, betaOffset))

    // Gamma sudah centered di 0
    // Range efektif: -30 ~ 30 derajat
    const normalizedGamma = Math.max(-30, Math.min(30, gamma))

    // Konversi ke pixel offset (max ±15px untuk smooth effect)
    const x = (normalizedGamma / 30) * 15
    const y = (normalizedBeta / 30) * 15

    // Apply transform dengan scale 1.1 untuk hide edges saat parallax
    bg.style.transform = `translate(${x}px, ${y}px) scale(1.1)`
  }

  // Coba deviceorientationabsolute dulu (lebih stabil di beberapa device)
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true)
  } else {
    window.addEventListener('deviceorientation', handleOrientation, true)
  }
}

init()
