import { supabase } from './supabase.js'
import { requireAuth, showToast } from './utils.js'

let session, player
let kartuKonfirm = null

async function init() {
  session = await requireAuth(supabase)
  if (!session) return

  await muatPlayer()
  await muatShop()

  document.getElementById('btn-batal-beli').addEventListener('click', tutupModal)
  document.getElementById('btn-konfirm-beli').addEventListener('click', konfirmasiBeli)
}

async function muatPlayer() {
  const { data } = await supabase
    .from('players')
    .select('id, key_gold')
    .eq('id', session.user.id)
    .single()
  if (!data) return
  player = data
  document.getElementById('header-gold').innerHTML = `<img src="assets/ui/icon_key_gold.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> ${data.key_gold}`
}

async function muatShop() {
  const grid = document.getElementById('grid-shop')

  // Ambil semua kartu Epic yang is_shop = true
  const { data: kartu } = await supabase
    .from('cards')
    .select('id, name, image_url, rarity, base_atk, shop_price')
    .eq('is_shop', true)
    .eq('rarity', 'epic')
    .order('base_atk', { ascending: false })

  if (!kartu?.length) {
    grid.innerHTML = '<p class="col-span-2 text-center text-sm mt-8" style="color:var(--teks-sekunder);">Shop kosong.</p>'
    return
  }

  // Ambil kartu yang sudah dimiliki player (player_cards join cards)
  const { data: milik } = await supabase
    .from('player_cards')
    .select('card_id, stars')
    .eq('player_id', session.user.id)

  // Hitung duplikat per card_id
  const duplikatMap = {}
  const bintangMap = {}
  milik?.forEach(m => {
    if (!bintangMap[m.card_id]) {
      bintangMap[m.card_id] = m.stars
      duplikatMap[m.card_id] = 0
    } else {
      duplikatMap[m.card_id] = (duplikatMap[m.card_id] || 0) + 1
    }
  })

  grid.innerHTML = ''

  kartu.forEach(k => {
    const bintang = bintangMap[k.id] ?? -1   // -1 = belum punya sama sekali
    const duplikat = duplikatMap[k.id] ?? 0
    // maks_beli = (5 - bintang) - duplikat, jika belum punya = 6 (bintang 0 + 5 upgrade)
    const maksBeliRaw = bintang === -1 ? 6 : (5 - bintang) - duplikat
    const maksBeli = Math.max(0, maksBeliRaw)
    const bisaBeli = maksBeli > 0 && player.key_gold >= k.shop_price

    const div = document.createElement('div')
    div.className = 'shop-card'
    div.innerHTML = `
      <div class="shop-card-gambar">
        <img class="gambar-waifu" src="${k.image_url || ''}" alt="${k.name}" loading="lazy">
        <img class="gambar-border" src="assets/ui/border_epic.png" alt="">
      </div>
      <div class="shop-card-info">
        <p class="text-xs font-bold mb-1" style="color:var(--teks);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${k.name}</p>
        <p class="text-xs mb-2" style="color:var(--teks-sekunder);">ATK: ${k.base_atk}</p>
        <button class="btn-beli" ${bisaBeli ? '' : 'disabled'}>
          ${bisaBeli ? `Beli (${k.shop_price} <img src="assets/ui/icon_key_gold.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;">)` : maksBeli === 0 ? 'OWNED' : `${k.shop_price} <img src="assets/ui/icon_key_gold.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;">`}
        </button>
      </div>
    `

    if (bisaBeli) {
      div.querySelector('.btn-beli').addEventListener('click', () => bukaModal(k))
    }

    grid.appendChild(div)
  })
}

function bukaModal(kartu) {
  kartuKonfirm = kartu
  document.getElementById('konfirm-gambar').src = kartu.image_url || ''
  document.getElementById('konfirm-border').src = 'assets/ui/border_epic.png'
  document.getElementById('konfirm-nama').textContent = kartu.name
  document.getElementById('konfirm-harga').innerHTML = `${kartu.shop_price} <img src="assets/ui/icon_key_gold.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> Key Gold`
  document.getElementById('modal-beli').classList.remove('hidden')
}

function tutupModal() {
  document.getElementById('modal-beli').classList.add('hidden')
  kartuKonfirm = null
}

async function konfirmasiBeli() {
  if (!kartuKonfirm) return
  const btn = document.getElementById('btn-konfirm-beli')
  btn.disabled = true
  btn.textContent = 'Memproses...'

  const { data, error } = await supabase.functions.invoke('beli-shop', {
    body: { card_id: kartuKonfirm.id }
  })

  btn.disabled = false
  btn.textContent = 'Beli Sekarang'

  if (error || !data?.sukses) {
    showToast(data?.pesan || 'Gagal membeli kartu.')
    tutupModal()
    return
  }

  player.key_gold = data.key_gold_baru
  document.getElementById('header-gold').innerHTML = `<img src="assets/ui/icon_key_gold.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> ${data.key_gold_baru}`
  showToast(`${kartuKonfirm.name} berhasil dibeli!`)
  tutupModal()
  await muatShop()
}

init()
