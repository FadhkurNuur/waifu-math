import { supabase } from './supabase.js'
import { requireAuth, showToast } from './utils.js'

// ================= Screen helper (reuse casual 2-state, info vs arena) =================
function showScreen(nama) {
  const info = document.getElementById('screen-info')
  const loading = document.getElementById('screen-loading')
  const arena = document.getElementById('screen-arena')
  if (info) info.classList.toggle('hidden', nama !== 'info')
  if (loading) loading.classList.toggle('hidden', nama !== 'loading')
  if (arena) arena.classList.toggle('hidden', nama !== 'arena')
  if (nama === 'arena') document.body.style.background = '#1a1a2e'
  else document.body.style.background = 'var(--bg)'
}

// ================= State =================
let session, player
let kartuPool = { common: [], rare: [], epic: [] }
let slotPreview = { common: null, rare: null, epic: null }
let kartuTerpilih = null
let runId = null
let totalDamage = 0
let rounds = 0
let capReachedPopupShown = false
let sudahSelesai = false
let timerInterval = null
let afkInterval = null
let waktuMulaiRonde = null

function timerDariatk(atk) {
  if (atk <= 20) return 5
  if (atk <= 40) return 6
  if (atk <= 60) return 7
  if (atk <= 80) return 8
  return 10
}
// borderUrl tidak dipakai di endless (boss statis), tapi disimpan jika perlu selector preview

function getBossSrcForToday() {
  // file kamu: raid-boss-1.webp = Minggu, 2=Senin ... 7=Sabtu
  // getDay(): 0=Minggu ... 6=Sabtu -> +1
  const day1 = new Date().getDay() + 1 // 1..7
  // coba 2 lokasi: assets/boss/ dan assets/ui/ (fallback)
  // prioritas: assets/boss/raid-boss-X.webp
  return `assets/boss/raid-boss-${day1}.webp`
}
function applyBossImage() {
  const img = document.getElementById('boss-img')
  const fallback = document.getElementById('boss-img-fallback')
  if (!img) return
  const src = getBossSrcForToday()
  img.style.display = 'block'
  if (fallback) fallback.style.display = 'none'
  img.src = src
  img.onerror = () => {
    // fallback coba 0-indexed jika 1-indexed tidak ada
    const day0 = new Date().getDay()
    const alt = `assets/boss/raid-boss-${day0}.webp`
    if (img.src.includes(alt)) {
      img.style.display = 'none'
      if (fallback) fallback.style.display = 'block'
    } else {
      // coba 0-indexed sekali
      img.onerror = () => { img.style.display='none'; if(fallback) fallback.style.display='block' }
      img.src = alt
    }
  }
  // update label nama sesuai hari (opsional, biar terasa harian)
  const namaHari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date().getDay()]
  const namaEl = document.getElementById('boss-nama')
  if (namaEl) namaEl.textContent = `BOSS ${namaHari.toUpperCase()} ∞`
}

function updateInfo() {
  const reward = Math.min(10, Math.floor(totalDamage / 200))
  document.getElementById('txt-total-damage').textContent = String(totalDamage)
  document.getElementById('txt-round').textContent = String(rounds)
  document.getElementById('txt-reward').innerHTML = `${reward} / 10 <img src="assets/ui/icon_key_silver.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> ${totalDamage >= 2000 ? '(cap tercapai)' : '(cap 2000 dmg)'}`
  document.getElementById('label-giliran').textContent = `Endless • Round ${rounds+1}`
  if (totalDamage >= 2000 && !capReachedPopupShown) {
    capReachedPopupShown = true
    showCapModal()
  }
}

// ================= Init =================
async function init() {
  session = await requireAuth(supabase)
  if (!session) return

  const { data: p } = await supabase.from('players').select('id, username, rank, last_endless_claim').eq('id', session.user.id).single()
  if (!p) { window.location.href = 'home.html'; return }
  player = p

  // boss harian
  applyBossImage()

  // wire surrender & cap & hasil
  document.getElementById('btn-surrender')?.addEventListener('click', showSurrenderModal)
  document.getElementById('btn-confirm-surrender')?.addEventListener('click', confirmSurrender)
  document.getElementById('btn-cancel-surrender')?.addEventListener('click', hideSurrenderModal)
  document.getElementById('modal-surrender')?.addEventListener('click', (e)=> { if(e.target.id==='modal-surrender') hideSurrenderModal() })
  document.getElementById('btn-cap-lanjut')?.addEventListener('click', hideCapModal)
  document.getElementById('btn-cap-selesai')?.addEventListener('click', async ()=> { hideCapModal(); await surrenderViaFinish() })
  document.getElementById('modal-cap')?.addEventListener('click', (e)=> { if(e.target.id==='modal-cap') hideCapModal() })
  document.getElementById('btn-kembali')?.addEventListener('click', ()=> window.location.href='minigame.html')
  document.getElementById('btn-mulai-endless')?.addEventListener('click', mulaiEndless)

  // cek gate 3 rarity & 1x/hari (tampilkan status di info)
  await muatKartuPool()
  await cekGate()

  // cek apakah ada run active hari ini di URL ?id=
  const params = new URLSearchParams(location.search)
  const qid = params.get('id')
  if (qid) {
    // resume run
    runId = qid
    const { data: run } = await supabase.from('endless_runs').select('*').eq('id', runId).single()
    if (run && run.player_id === session.user.id && run.status==='active') {
      totalDamage = run.total_damage || 0
      rounds = run.rounds || 0
      capReachedPopupShown = !!run.cap_reached
      showScreen('arena')
      applyBossImage()
      updateInfo()
      mulaiRonde()
      startAFK()
      return
    }
  }
  showScreen('info')
}

async function muatKartuPool() {
  const { data } = await supabase.from('player_cards').select('id, card_id, stars, current_atk, cards!inner(name, image_url, rarity, base_atk)').eq('player_id', session.user.id)
  kartuPool = { common: [], rare: [], epic: [] }
  ;(data||[]).forEach(row=>{
    const r = row.cards?.rarity
    if(!r || !(r in kartuPool)) return
    kartuPool[r].push({ ...row, ...row.cards, player_card_id: row.id })
  })
}

async function cekGate() {
  const have = Object.entries(kartuPool).filter(([,v])=> v.length>0).map(([k])=>k)
  const gate = document.getElementById('info-gate')
  const statusWrap = document.getElementById('info-status')
  const btn = document.getElementById('btn-mulai-endless')
  let html = ''
  let blocked = false
  if (have.length < 3) {
    html += `<p style="color: var(--aksen); font-weight:800;">Butuh 3 rarity</p><p>Kamu punya: <b>${have.join(', ')||'belum ada'}</b> — kumpulkan Rare & Epic dulu di Gacha.</p><p><a href="gacha.html" style="color: var(--primary); font-weight:800;">→ Ke Gacha</a> <span style="margin:0 6px; opacity:.4;">•</span> <a href="collection.html" style="color: var(--primary); font-weight:800;">Koleksi</a></p>`
    blocked = true
  } else {
    html += `<p style="color: var(--primary); font-weight:800;">Syarat terpenuhi ✓</p><p>Rarity: ${have.join(', ')}</p>`
  }
  // cek 1x/hari
  const today = new Date().toISOString().slice(0,10)
  if (player?.last_endless_claim && String(player.last_endless_claim).slice(0,10)===today) {
    html += `<p style="margin-top:8px; color: var(--aksen); font-weight:700;">Sudah main hari ini (${today}). 1x/hari. Kembali besok!</p>`
    blocked = true
  } else {
    // cek juga endless_runs today finished (fallback jika last_endless_claim belum sync)
    try {
      const { data: existing } = await supabase.from('endless_runs').select('id, status').eq('player_id', session.user.id).eq('tanggal', today).maybeSingle()
      if (existing) {
        if (existing.status==='finished') { html += `<p style="margin-top:8px; color: var(--aksen); font-weight:700;">Sudah selesai hari ini. Kembali besok!</p>`; blocked=true }
        else if (existing.status==='active') { html += `<p style="margin-top:8px;">Kamu punya run aktif hari ini — lanjutkan? <a href="game-endless.html?id=${existing.id}" style="color: var(--primary); font-weight:800;">Lanjutkan</a></p>` }
      }
    } catch {}
  }
  if (html) { gate.innerHTML = html; statusWrap.classList.remove('hidden') }
  if (blocked) { btn.disabled = true; btn.style.background='#ccc'; btn.style.cursor='not-allowed' }
  else { btn.disabled = false; btn.style.background=''; }
}

async function mulaiEndless() {
  const btn = document.getElementById('btn-mulai-endless')
  if (btn.disabled) return
  btn.disabled = true; btn.textContent = 'Memulai...'
  showScreen('loading')
  const { data, error } = await supabase.functions.invoke('start-endless', { body: {} })
  if (error || !data || data.error) {
    showScreen('info')
    btn.disabled=false; btn.textContent='Mulai Endless'
    const msg = data?.error || error?.message || 'Gagal memulai'
    if (data?.need_rarity) showToast('Butuh 3 rarity dulu!')
    else if (data?.already_played) showToast('Sudah main hari ini')
    else showToast(msg)
    await cekGate()
    return
  }
  runId = data.run_id
  totalDamage = 0; rounds = 0; capReachedPopupShown=false; sudahSelesai=false
  // update URL biar bisa resume
  history.replaceState(null,'', `game-endless.html?id=${runId}`)
  showScreen('arena')
  applyBossImage()
  updateInfo()
  mulaiRonde()
  startAFK()
}

// ================= Ronde loop =================
function tampilState(state) {
  document.getElementById('state-pilih-kartu')?.classList.toggle('hidden', state!=='pilih')
  document.getElementById('state-soal')?.classList.toggle('hidden', state!=='soal')
  document.getElementById('state-tunggu')?.classList.toggle('hidden', state!=='tunggu')
}

function renderSlotRarity() {
  const wrap = document.getElementById('slot-rarity-wrap')
  wrap.innerHTML=''
  for (const rarity of ['common','rare','epic']) {
    const pool = kartuPool[rarity]||[]
    const div = document.createElement('div')
    div.className = 'slot-rarity' + (pool.length>0?'':' disabled')
    if (pool.length>0) {
      const preview = pool[Math.floor(Math.random()*pool.length)]
      slotPreview[rarity]=preview
      div.innerHTML = `<div class="slot-gambar-mini">${preview.image_url?`<img src="${preview.image_url}" alt="${preview.name}">`:''}</div><p class="text-xs font-bold" style="color:var(--teks);text-transform:capitalize;">${rarity} ×${pool.length}</p><p class="text-xs" style="color:var(--teks-sekunder);">ATK ${preview.current_atk}</p>`
      div.addEventListener('click', ()=> pilihKartu(rarity))
    } else {
      div.innerHTML = `<div class="slot-gambar-mini" style="background:#eee;"></div><p class="text-xs font-bold" style="color:#ccc;text-transform:capitalize;">${rarity}</p><p class="text-xs" style="color:#ccc;">—</p>`
    }
    wrap.appendChild(div)
  }
}

function mulaiRonde() {
  waktuMulaiRonde = Date.now()
  tampilState('pilih')
  renderSlotRarity()
  updateInfo()
}

async function pilihKartu(rarity) {
  const pick = slotPreview[rarity] || (kartuPool[rarity]||[])[0]
  if (!pick) return
  kartuTerpilih = pick
  // arena atas tetap boss — tidak ganti waifu, cukup tampilkan soal
  tampilState('soal')
  document.getElementById('teks-soal').textContent='Memuat soal...'
  document.getElementById('opsi-jawaban').innerHTML=''
  stopTimer()
  const { data, error } = await supabase.functions.invoke('generate-soal', { body: { atk: pick.current_atk } })
  if (error || !data) { showToast('Gagal memuat soal'); tampilState('pilih'); return }
  tampilSoal(data)
}

function tampilSoal(data) {
  document.getElementById('teks-soal').textContent = data.soal
  const wrap = document.getElementById('opsi-jawaban')
  wrap.innerHTML=''
  data.opsi.forEach(opsi=>{
    const b=document.createElement('button')
    b.className='btn-jawab'; b.textContent=String(opsi)
    b.addEventListener('click', ()=> jawab(opsi, data.jawaban, b))
    wrap.appendChild(b)
  })
  const detik = timerDariatk(kartuTerpilih.current_atk)
  mulaiTimer(detik, ()=> jawab(null, data.jawaban, null))
}

function mulaiTimer(detik, onHabis){
  const bar=document.getElementById('timer-bar'), teks=document.getElementById('timer-teks'), wrap=document.getElementById('wrap-timer')
  if(!bar||!teks||!wrap) return
  wrap.classList.remove('hidden'); bar.style.width='100%'; teks.textContent=`${detik} detik`
  let sisa=detik
  timerInterval=setInterval(()=>{
    sisa--; bar.style.width=`${(sisa/detik)*100}%`; teks.textContent=`${sisa} detik`
    if(sisa<=0){ stopTimer(); onHabis() }
  },1000)
}
function stopTimer(){ clearInterval(timerInterval); timerInterval=null; document.getElementById('wrap-timer')?.classList.add('hidden') }

async function jawab(opsiDipilih, jawabanBenar, btnEl){
  stopTimer()
  document.querySelectorAll('.btn-jawab').forEach(b=> b.disabled=true)
  const benar = opsiDipilih!==null && String(opsiDipilih)===String(jawabanBenar)
  if(btnEl) btnEl.classList.add(benar?'benar':'salah')
  if(!benar) document.querySelectorAll('.btn-jawab').forEach(b=>{ if(String(b.textContent)===String(jawabanBenar)) b.classList.add('benar') })
  await new Promise(r=>setTimeout(r,600))
  if(!runId){ showToast('Run tidak ditemukan'); return }
  const damage = benar ? kartuTerpilih.current_atk : 0
  const { data, error } = await supabase.functions.invoke('validate-endless-jawaban', { body: { run_id: runId, card_id: kartuTerpilih.card_id || kartuTerpilih.id, rarity_slot: kartuTerpilih.rarity, benar, damage } })
  if(error){ showToast('Gagal simpan jawaban'); tampilState('pilih'); return }
  totalDamage = data.total_damage
  rounds = data.rounds
  updateInfo()
  if(benar){
    tampilDamageFloat(damage)
    tambahLog(`Round ${rounds}: ${kartuTerpilih.name} — +${damage} dmg (total ${totalDamage})`)
  } else {
    tambahLog(`Round ${rounds}: salah — selesai!`)
  }
  if(data.status==='finished'){
    sudahSelesai=true; stopAFK(); stopTimer()
    // sudah dihitung reward di DB, tampil modal hasil
    selesaiEndless()
    return
  }
  // masih active → next round
  setTimeout(()=> mulaiRonde(), 700)
}

// ================= Surrender / AFK / Cap =================
function showSurrenderModal(){ if(sudahSelesai) return; document.getElementById('modal-surrender')?.classList.remove('hidden') }
function hideSurrenderModal(){ document.getElementById('modal-surrender')?.classList.add('hidden') }
function showCapModal(){ document.getElementById('modal-cap')?.classList.remove('hidden') }
function hideCapModal(){ document.getElementById('modal-cap')?.classList.add('hidden') }

async function surrenderViaFinish(){
  if(sudahSelesai || !runId) return
  sudahSelesai=true; stopTimer(); stopAFK()
  try{ await supabase.functions.invoke('finish-endless', { body: { run_id: runId } }) }catch{}
  selesaiEndless()
}
async function confirmSurrender(){
  hideSurrenderModal()
  await surrenderViaFinish()
}

function startAFK(){
  stopAFK()
  // cek tiap 5 detik setelah 10 detik, jika diam >90 detik sejak ronde mulai -> surrender
  setTimeout(()=>{
    afkInterval=setInterval(async ()=>{
      if(sudahSelesai || !waktuMulaiRonde) return
      const diff=(Date.now()-waktuMulaiRonde)/1000
      if(diff>90){
        clearInterval(afkInterval)
        showToast('AFK terlalu lama — run diselesaikan')
        await surrenderViaFinish()
      }
    },5000)
  },10000)
}
function stopAFK(){ clearInterval(afkInterval); afkInterval=null }

// ================= Finish modal =================
async function selesaiEndless(){
  // ambil run terbaru untuk reward
  let reward= Math.min(10, Math.floor(totalDamage/200))
  try{
    const { data: run } = await supabase.from('endless_runs').select('reward_silver, total_damage').eq('id', runId).single()
    if(run){ reward=run.reward_silver; totalDamage=run.total_damage }
  }catch{}
  const modal=document.getElementById('modal-hasil')
  const desc=document.getElementById('hasil-desc')
  const rewEl=document.getElementById('hasil-reward')
  const icon=document.getElementById('hasil-icon')
  if(desc) desc.textContent=`Total Damage: ${totalDamage} • Round: ${rounds}`
  if(rewEl) rewEl.innerHTML = reward>0 ? `+${reward} <img src="assets/ui/icon_key_silver.svg" alt="key" style="width:1em;height:1em;vertical-align:middle;display:inline;"> Key Silver` : `+0 Key Silver — capai 200 dmg untuk 1 silver`
  if(icon) icon.textContent = reward>=10 ? '🏆' : reward>0 ? '✨' : '💫'
  document.getElementById('hasil-judul').textContent = reward>=10 ? 'Cap Tercapai!' : 'Run Selesai!'
  modal.classList.remove('hidden')
  if(reward>0) tampilKonfeti()
  // update last_endless_claim di local player
  if(player) player.last_endless_claim = new Date().toISOString().slice(0,10)
}

function tambahLog(teks){
  const log=document.getElementById('isi-log')
  const p=document.createElement('p'); p.className='log-item'; p.innerHTML=`› ${teks}`
  if(log.firstChild) log.insertBefore(p, log.firstChild); else log.appendChild(p)
}
function tampilDamageFloat(damage){
  const c=document.getElementById('damage-container'); if(!c) return
  const el=document.createElement('div'); el.className='damage-float'; el.textContent=`+${damage}`; el.style.left=`${45+Math.random()*10}%`; el.style.top='45%'; c.appendChild(el); setTimeout(()=>el.remove(),1000)
  const info=document.getElementById('area-info'); if(info){ info.classList.add('shake'); setTimeout(()=>info.classList.remove('shake'),400) }
}
function tampilKonfeti(){
  const container=document.getElementById('konfeti-container'); if(!container) return
  const warna=['#3EC99E','#FF7FA0','#FFD700','#A78BFA']
  for(let i=0;i<40;i++){
    const el=document.createElement('div')
    el.style.cssText=`position:absolute;width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;background:${warna[Math.floor(Math.random()*warna.length)]};border-radius:2px;left:${Math.random()*100}%;top:-10px;animation: konfetiFall ${1.5+Math.random()*2}s ease-in ${Math.random()*0.8}s forwards; transform: rotate(${Math.random()*360}deg);`
    container.appendChild(el)
  }
  setTimeout(()=> container.innerHTML='',5000)
}
const styleAnim=document.createElement('style')
styleAnim.textContent=`@keyframes konfetiFall{0%{opacity:1;transform:translateY(0) rotate(0deg)}100%{opacity:0;transform:translateY(100vh) rotate(720deg)}}.shake{animation:shakeAnim .4s ease}@keyframes shakeAnim{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}`
document.head.appendChild(styleAnim)

init()
