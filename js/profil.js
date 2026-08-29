import { supabase } from './supabase.js'
import { requireAuth, showToast } from './utils.js'

let session, player, stats

async function init() {
  session = await requireAuth(supabase)
  if (!session) return

  await muatProfil()

  document.getElementById('btn-ubah-username').addEventListener('click', () => bukaModal('modal-username'))
  document.getElementById('btn-ubah-password').addEventListener('click', () => bukaModal('modal-password'))
  document.getElementById('btn-logout').addEventListener('click', logout)

  document.getElementById('btn-batal-username').addEventListener('click', () => tutupModal('modal-username'))
  document.getElementById('btn-simpan-username').addEventListener('click', simpanUsername)

  document.getElementById('btn-batal-password').addEventListener('click', () => tutupModal('modal-password'))
  document.getElementById('btn-simpan-password').addEventListener('click', simpanPassword)
}

async function muatProfil() {
  const [{ data: p }, { data: s }, { count: totalKartu }] = await Promise.all([
    supabase.from('players').select('id, username, rank, total_power').eq('id', session.user.id).single(),
    supabase.from('player_stats').select('total_wins, total_losses, total_gacha').eq('player_id', session.user.id).single(),
    supabase.from('player_cards').select('id', { count: 'exact', head: true }).eq('player_id', session.user.id),
  ])

  player = p
  stats = s

  document.getElementById('profil-username').textContent = p?.username || '-'
  document.getElementById('profil-rank').textContent = `Rank ${p?.rank || 1}`
  document.getElementById('profil-power').textContent = `Total Power: ${p?.total_power || 0}`

  const menang = s?.total_wins || 0
  const kalah = s?.total_losses || 0
  const winrate = menang + kalah > 0 ? Math.round((menang / (menang + kalah)) * 100) : 0

  document.getElementById('stat-menang').textContent = menang
  document.getElementById('stat-kalah').textContent = kalah
  document.getElementById('stat-winrate').textContent = `${winrate}%`
  document.getElementById('stat-gacha').textContent = s?.total_gacha || 0
  document.getElementById('stat-kartu').textContent = totalKartu || 0

  // Banner favorit: banner dengan kartu terbanyak
  const { data: bannerData } = await supabase
    .from('player_cards')
    .select('cards(banner, banner_label)')
    .eq('player_id', session.user.id)

  if (bannerData?.length) {
    const count = {}
    bannerData.forEach(r => {
      const b = r.cards?.banner
      if (b) count[b] = (count[b] || 0) + 1
    })
    const favBanner = Object.entries(count).sort((a, b) => b[1] - a[1])[0]
    if (favBanner) {
      const labelEl = bannerData.find(r => r.cards?.banner === favBanner[0])?.cards?.banner_label
      document.getElementById('stat-banner').textContent = labelEl || favBanner[0]
    }
  }
}

function bukaModal(id) {
  document.getElementById(id).classList.remove('hidden')
}

function tutupModal(id) {
  document.getElementById(id).classList.add('hidden')
}

async function simpanUsername() {
  const input = document.getElementById('input-username-baru')
  const username = input.value.trim()
  const errorEl = document.getElementById('error-username')
  errorEl.classList.add('hidden')

  if (!username) {
    errorEl.textContent = 'Username tidak boleh kosong.'
    errorEl.classList.remove('hidden')
    return
  }
  if (username === player?.username) {
    errorEl.textContent = 'Username sama dengan sekarang.'
    errorEl.classList.remove('hidden')
    return
  }

  const btn = document.getElementById('btn-simpan-username')
  btn.disabled = true
  btn.textContent = 'Menyimpan...'

  const { error } = await supabase.from('players').update({ username }).eq('id', session.user.id)

  btn.disabled = false
  btn.textContent = 'Simpan'

  if (error) {
    errorEl.textContent = 'Gagal menyimpan username.'
    errorEl.classList.remove('hidden')
    return
  }

  player.username = username
  document.getElementById('profil-username').textContent = username
  input.value = ''
  tutupModal('modal-username')
  showToast('Username berhasil diubah!')
}

async function simpanPassword() {
  const lama = document.getElementById('input-password-lama').value
  const baru = document.getElementById('input-password-baru').value
  const konfirm = document.getElementById('input-password-konfirm').value
  const errorEl = document.getElementById('error-password')
  errorEl.classList.add('hidden')

  if (!lama || !baru || !konfirm) {
    errorEl.textContent = 'Semua field wajib diisi.'
    errorEl.classList.remove('hidden')
    return
  }
  if (baru !== konfirm) {
    errorEl.textContent = 'Password baru tidak cocok.'
    errorEl.classList.remove('hidden')
    return
  }
  if (baru.length < 6) {
    errorEl.textContent = 'Password minimal 6 karakter.'
    errorEl.classList.remove('hidden')
    return
  }

  const btn = document.getElementById('btn-simpan-password')
  btn.disabled = true
  btn.textContent = 'Menyimpan...'

  // Re-auth dengan password lama dulu
  const { error: errLogin } = await supabase.auth.signInWithPassword({
    email: session.user.email,
    password: lama,
  })

  if (errLogin) {
    btn.disabled = false
    btn.textContent = 'Simpan'
    errorEl.textContent = 'Password lama salah.'
    errorEl.classList.remove('hidden')
    return
  }

  const { error } = await supabase.auth.updateUser({ password: baru })

  btn.disabled = false
  btn.textContent = 'Simpan'

  if (error) {
    errorEl.textContent = 'Gagal mengubah password.'
    errorEl.classList.remove('hidden')
    return
  }

  document.getElementById('input-password-lama').value = ''
  document.getElementById('input-password-baru').value = ''
  document.getElementById('input-password-konfirm').value = ''
  tutupModal('modal-password')
  showToast('Password berhasil diubah!')
}

async function logout() {
  await supabase.auth.signOut()
  window.location.href = 'index.html'
}

init()
