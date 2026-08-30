import { supabase } from './supabase.js'
import { requireAuth, showToast } from './utils.js'

let session, player
let season=null
let kartuPool={common:[],rare:[],epic:[]}
let slotPreview={common:null,rare:null,epic:null}
let kartuTerpilih=null
let timerInterval=null
let sudahSelesai=false
let myDamage=0

function showScreen(n){
  document.getElementById('screen-info')?.classList.toggle('hidden', n!=='info')
  const loading=document.getElementById('screen-loading')
  const arena=document.getElementById('screen-arena')
  if(loading){ loading.classList.toggle('hidden', n!=='loading'); loading.style.display = n==='loading' ? 'flex' : '' }
  if(arena){ arena.classList.toggle('hidden', n!=='arena'); arena.style.display = n==='arena' ? 'flex' : '' }
}
function timerDariAtk(atk){ if(atk<=20) return 5; if(atk<=40) return 6; if(atk<=60) return 7; if(atk<=80) return 8; return 10 }
function borderUrl(r){ return `assets/ui/border_${r}.png` }
function getBossSrc(){
  if(!season) return `assets/boss/raid-boss-1.webp`
  // week_start Senin, pakai week number mod 7 untuk rotasi
  const d=new Date(season.week_start)
  const day = (d.getDay()+6)%7 // Senin 0 .. Minggu 6
  const idx = (day %7)+1
  return `assets/boss/raid-boss-${idx}.webp`
}
function applyBoss(){
  const img=document.getElementById('boss-img-raid')
  const fall=document.getElementById('boss-fallback')
  if(!img) return
  img.style.display='block'; if(fall) fall.style.display='none'
  img.src=getBossSrc()
  img.onerror=()=>{ img.style.display='none'; if(fall) fall.style.display='block' }
}

async function init(){
  session=await requireAuth(supabase)
  if(!session) return
  const {data: p}=await supabase.from('players').select('id, username').eq('id', session.user.id).single()
  player=p
  await muatKartuPool()
  await muatSeasonInfo()
  wire()
  // Realtime subscribe boss_hp
  if(season) subscribeRealtime(season.id)
  showScreen('info')
}

async function muatKartuPool(){
  const {data}=await supabase.from('player_cards').select('id, card_id, stars, current_atk, cards!inner(name, image_url, rarity, base_atk)').eq('player_id', session.user.id)
  kartuPool={common:[],rare:[],epic:[]}
  ;(data||[]).forEach(r=>{
    const rar=r.cards?.rarity
    if(!rar||!(rar in kartuPool)) return
    kartuPool[rar].push({...r, ...r.cards, _atk:r.current_atk})
  })
}

async function muatSeasonInfo(){
  const {data, error}=await supabase.functions.invoke('start-raid')
  if(error||!data||data.error){
    document.getElementById('info-status').textContent=data?.error||'Gagal muat season'
    return
  }
  season=data.season
  myDamage=data.myTotal||0
  const pct= season.boss_max ? Math.max(0, (season.boss_hp/season.boss_max)*100) : 0
  const infoHp=document.getElementById('info-boss-hp')
  if(infoHp) infoHp.textContent=`${season.boss_hp}/${season.boss_max}`
  const infoBar=document.getElementById('info-boss-bar')
  if(infoBar) infoBar.style.width=`${pct}%`
  const txtHp=document.getElementById('txt-boss-hp')
  if(txtHp) txtHp.textContent=`${season.boss_hp}/${season.boss_max}`
  const barBoss=document.getElementById('bar-boss')
  if(barBoss) barBoss.style.width=`${pct}%`
  const txtMy=document.getElementById('txt-my-damage')
  if(txtMy) txtMy.textContent=String(myDamage)
  applyBoss()
  // cap info
  const capInfo=document.getElementById('info-status')
  // leaderboard
  const lb=document.getElementById('leaderboard')
  lb.innerHTML=''
  if(!data.leaderboard || data.leaderboard.length===0){
    lb.innerHTML='<p style="color:var(--teks-sekunder);">Belum ada serangan minggu ini — jadi yang pertama!</p>'
  } else {
    data.leaderboard.forEach(row=>{
      const div=document.createElement('div')
      div.className='flex justify-between items-center'
      const rankStyle=row.rank===1?'color:#F59E0B':row.rank===2?'color:#6B7280':row.rank===3?'color:#92400E':'color:var(--teks)'
      div.innerHTML=`<span style="${rankStyle}; font-weight:800;">#${row.rank} ${row.username}</span><span style="font-weight:700; color:var(--aksen);">${row.total} dmg</span>`
      lb.appendChild(div)
    })
  }
  const myRankEl=document.getElementById('my-rank')
  if(data.myRank){
    myRankEl.textContent=`Kamu Rank #${data.myRank} • Damage ${myDamage}`
  } else {
    myRankEl.textContent=`Kamu belum menyerang minggu ini`
  }
  if(data.myReward){
    const r=data.myReward
    myRankEl.textContent+=` • Hadiah: ${r.reward_gold? r.reward_gold+' Gold' : r.reward_silver+' Silver'} (Rank #${r.rank})`
  }
  // cap harian
  const used=data.usedToday||0
  const sisa=data.sisaHari ?? Math.max(0,5-used)
  if(data.cap_harian){
    if(capInfo) capInfo.textContent=`Cap harian 5 serang tercapai (${used}/5) — kembali besok 00:00 WIB`
    const btn=document.getElementById('btn-serang')
    if(btn){ btn.textContent='Cap Harian Tercapai (5/5)'; btn.disabled=true; btn.style.opacity='0.6' }
    // juga tampil di arena log
    const logRaid=document.getElementById('log-raid')
    if(logRaid) logRaid.textContent=`Cap 5 serang/hari tercapai — sisa ${sisa} besok`
  } else {
    if(capInfo) capInfo.textContent = season.status==='finished' ? 'Boss sudah kalah minggu ini — hadiah sudah dibagikan. Tunggu Senin 00:00 WIB reset.' : `Boss HP ${season.boss_hp} — serang bersama! Sisa hari ini: ${sisa}/5`
  }
  if(season.status==='finished'){
    const btn=document.getElementById('btn-serang')
    if(btn){ btn.textContent='Lihat Hasil'; btn.disabled=true; btn.style.opacity='0.6' }
  } else if(!data.cap_harian){
    const btn=document.getElementById('btn-serang')
    if(btn){ btn.textContent='Masuk Arena →'; btn.disabled=false; btn.style.opacity='1' }
  }
  sudahSelesai = season.status==='finished'
  // simpan cap untuk cek di arena (jangan gabung ke sudahSelesai)
  season._usedToday=used
  season._sisaHari=sisa
  season._cap_harian=!!data.cap_harian
  // jika cap, disable tombol tapi jangan anggap finished (boss masih hidup)
  if(data.cap_harian){
    // sudah handle di atas (btn disabled), tapi izinkan lihat leaderboard
  }
}

function wire(){
  document.getElementById('btn-serang')?.addEventListener('click', ()=>{
    if(!season) return
    if(season.status==='finished'){ showToast('Boss sudah kalah — hadiah sudah dibagikan'); return }
    if(season._cap_harian){ showToast('Cap 5 serang/hari tercapai — kembali besok'); return }
    showScreen('arena')
    applyBoss()
    mulaiRonde()
  })
  document.getElementById('btn-kalah-kembali')?.addEventListener('click', ()=> location.href='minigame.html')
}

function subscribeRealtime(seasonId){
  try{
    const ch=supabase.channel(`raid:${seasonId}`)
    ch.on('postgres_changes', {event:'UPDATE', schema:'public', table:'raid_seasons', filter:`id=eq.${seasonId}`}, payload=>{
      const newRow=payload.new
      if(!newRow) return
      season=newRow
      const pct= season.boss_max ? Math.max(0, (season.boss_hp/season.boss_max)*100) : 0
      document.getElementById('bar-boss').style.width=`${pct}%`
      document.getElementById('txt-boss-hp').textContent=`${season.boss_hp}/${season.boss_max}`
      document.getElementById('info-boss-hp').textContent=`${season.boss_hp}/${season.boss_max}`
      document.getElementById('info-boss-bar').style.width=`${pct}%`
      if(newRow.status==='finished' && !sudahSelesai){
        sudahSelesai=true
        handleBossKalah()
      }
    }).subscribe()
  }catch{}
}

async function handleBossKalah(){
  // fetch reward
  const {data}=await supabase.functions.invoke('start-raid')
  const rew=data?.myReward
  const rank=data?.myRank
  document.getElementById('kalah-rank').textContent = rank ? `Kamu Rank #${rank}` : 'Rank —'
  if(rew){
    const txt=rew.reward_gold? `+${rew.reward_gold} Gold` : `+${rew.reward_silver} Silver`
    document.getElementById('kalah-reward').textContent=txt
  } else {
    document.getElementById('kalah-reward').textContent='Tidak ikut minggu ini'
  }
  document.getElementById('modal-boss-kalah').classList.remove('hidden')
  // konfeti
  tampilKonfeti()
}

function tampilState(state){
  document.getElementById('state-pilih')?.classList.toggle('hidden', state!=='pilih')
  document.getElementById('state-soal')?.classList.toggle('hidden', state!=='soal')
}

function renderSlot(){
  const wrap=document.getElementById('slot-wrap')
  wrap.innerHTML=''
  for(const rarity of ['common','rare','epic']){
    const pool=kartuPool[rarity]||[]
    const div=document.createElement('div')
    div.className='slot-rarity' + (pool.length>0?'':' disabled')
    if(pool.length>0){
      const preview=pool[Math.floor(Math.random()*pool.length)]
      slotPreview[rarity]=preview
      div.innerHTML=`<div class="slot-gambar-mini">${preview.image_url?`<img src="${preview.image_url}" alt="${preview.name}">`:''}</div><p class="text-xs font-bold" style="color:var(--teks);text-transform:capitalize;">${rarity} ×${pool.length}</p><p class="text-xs" style="color:var(--teks-sekunder);">ATK ${preview._atk||preview.current_atk}</p>`
      div.addEventListener('click', ()=> pilihKartu(rarity))
    } else {
      div.innerHTML=`<div class="slot-gambar-mini" style="background:#eee;"></div><p class="text-xs font-bold" style="color:#ccc;text-transform:capitalize;">${rarity}</p><p class="text-xs" style="color:#ccc;">—</p>`
    }
    wrap.appendChild(div)
  }
}

function mulaiRonde(){
  if(sudahSelesai) return
  tampilState('pilih')
  renderSlot()
}

async function pilihKartu(rarity){
  const pick=slotPreview[rarity] || (kartuPool[rarity]||[])[0]
  if(!pick) return
  kartuTerpilih=pick
  tampilState('soal')
  document.getElementById('teks-soal').textContent='Memuat soal...'
  document.getElementById('opsi-jawaban').innerHTML=''
  stopTimer()
  const atk=pick._atk || pick.current_atk || pick.base_atk
  const {data, error}=await supabase.functions.invoke('generate-soal',{body:{atk}})
  if(error||!data){ showToast('Gagal soal'); tampilState('pilih'); return }
  tampilSoal(data)
}

function tampilSoal(data){
  document.getElementById('teks-soal').textContent=data.soal
  const wrap=document.getElementById('opsi-jawaban')
  wrap.innerHTML=''
  data.opsi.forEach(opsi=>{
    const b=document.createElement('button')
    b.className='btn-jawab'; b.textContent=String(opsi)
    b.addEventListener('click', ()=> jawab(opsi, data.jawaban, b))
    wrap.appendChild(b)
  })
  const detik=timerDariAtk(kartuTerpilih._atk || kartuTerpilih.current_atk || 20)
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
  const benar=opsiDipilih!==null && String(opsiDipilih)===String(jawabanBenar)
  if(btnEl) btnEl.classList.add(benar?'benar':'salah')
  if(!benar) document.querySelectorAll('.btn-jawab').forEach(b=>{ if(String(b.textContent)===String(jawabanBenar)) b.classList.add('benar') })
  await new Promise(r=>setTimeout(r,500))
  if(!season){ tampilState('pilih'); return }
  if(sudahSelesai){ showToast('Boss sudah kalah'); tampilState('pilih'); return }
  const damage=benar ? (kartuTerpilih._atk||kartuTerpilih.current_atk||0) : 0
  const {data, error}=await supabase.functions.invoke('serang-raid',{body:{season_id: season.id, card_id: kartuTerpilih.card_id||kartuTerpilih.id, rarity_slot: kartuTerpilih.rarity, benar, damage}})
  if(error){
    const msg=String(error.message||'')
    // cek cap dari error body jika ada
    // @ts-ignore supabase-js error context
    const ctx=(error as any)?.context
    if(msg.includes('Cap harian') || (data as any)?.cap_harian){
      showToast('Cap 5 serang/hari tercapai')
      season._cap_harian=true
      document.getElementById('log-raid').textContent='Cap harian tercapai — kembali besok'
      tampilState('pilih')
      return
    }
    showToast('Gagal serang'); tampilState('pilih'); return
  }
  // handle cap dari response 429 yang di-wrap sebagai error=false tapi data.cap_harian
  if((data as any)?.error && (data as any)?.cap_harian){
    showToast('Cap 5 serang/hari tercapai')
    season._cap_harian=true
    document.getElementById('log-raid').textContent='Cap harian tercapai'
    tampilState('pilih')
    return
  }
  if(benar){
    myDamage+=damage
    document.getElementById('txt-my-damage').textContent=String(myDamage)
    tampilDamage(damage)
    tambahLog(`Serang +${damage} dmg (total ${myDamage}) • Boss ${data.boss_hp}/${data.boss_max}`)
  } else {
    tambahLog(`Salah — tidak ada damage`)
  }
  // update boss hp dari response (optimistic, realtime akan sync)
  season.boss_hp=data.boss_hp
  season.boss_max=data.boss_max
  const pct=season.boss_max ? Math.max(0, (season.boss_hp/season.boss_max)*100):0
  document.getElementById('bar-boss').style.width=`${pct}%`
  document.getElementById('txt-boss-hp').textContent=`${season.boss_hp}/${season.boss_max}`
  document.getElementById('info-boss-hp').textContent=`${season.boss_hp}/${season.boss_max}`
  document.getElementById('info-boss-bar').style.width=`${pct}%`
  if(data.is_finished){
    sudahSelesai=true
    season.status='finished'
    setTimeout(()=> handleBossKalah(), 400)
    return
  }
  setTimeout(()=> mulaiRonde(), 600)
}

function tambahLog(teks){
  const log=document.getElementById('isi-log-raid')
  const p=document.createElement('p'); p.className='text-xs'; p.style.color='var(--teks-sekunder)'; p.style.padding='2px 0'; p.textContent=`› ${teks}`
  if(log.firstChild) log.insertBefore(p, log.firstChild); else log.appendChild(p)
}
function tampilDamage(d){
  const c=document.getElementById('damage-container'); if(!c) return
  const el=document.createElement('div'); el.className='damage-float'; el.textContent=`-${d}`; el.style.left=`${45+Math.random()*10}%`; el.style.top='45%'; c.appendChild(el); setTimeout(()=>el.remove(),1000)
}
function tampilKonfeti(){
  const container=document.getElementById('damage-container'); if(!container) return
  // simple
}

init()
