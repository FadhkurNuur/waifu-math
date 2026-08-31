import { supabase } from './supabase.js'
import { requireAuth, showToast, createNumberPad } from './utils.js'

let session
let selectedTier=1
let runId=null
let numbers=[]
let expected=null
let capUsed=0
let numpad=null

async function init(){
  session=await requireAuth(supabase)
  if(!session) return
  await updateCap()
  wireTier()
  wire()
}

function tierReward(t){ return t===1?5 : t===2?10 : 15 }
async function updateCap(){
  const {data}=await supabase.rpc('flash_cap_today', {p_player_id: session.user.id})
  capUsed=Number(data||0)
  const el=document.getElementById('header-cap')
  if(el) el.innerHTML=`${capUsed}/30 <img src="assets/ui/icon_key_silver.svg" style="width:1em;height:1em;vertical-align:middle;display:inline;">`
  const capInfo=document.getElementById('cap-info')
  if(capUsed>=30){
    capInfo.classList.remove('hidden')
    capInfo.textContent='Cap harian 30 keys tercapai — kembali besok!'
    document.getElementById('btn-mulai-flash').disabled=true
    document.getElementById('btn-mulai-flash').style.opacity='0.5'
  } else {
    capInfo.classList.add('hidden')
    const sisa=30-capUsed
    for(let t=1; t<=3; t++){
      const card=document.getElementById(`tier-${t}`)
      const reward=tierReward(t)
      if(reward > sisa){
        card.style.opacity='0.4'
        card.style.pointerEvents='none'
      } else {
        card.style.opacity=''
        card.style.pointerEvents=''
      }
    }
    if(tierReward(selectedTier) > sisa){
      if(sisa>=5) selectTier(1)
      else if(sisa>=10) selectTier(2)
    }
  }
}

function wireTier(){
  for(let t=1; t<=3; t++){
    const el=document.getElementById(`tier-${t}`)
    el?.addEventListener('click', ()=> selectTier(t))
  }
  selectTier(1)
}
function selectTier(t){
  if(capUsed + tierReward(t) > 30) {
    showToast(`Sisa cap ${30-capUsed} keys`)
    return
  }
  selectedTier=t
  for(let i=1;i<=3;i++){
    const el=document.getElementById(`tier-${i}`)
    if(el) el.classList.toggle('selected', i===t)
  }
}

function wire(){
  document.getElementById('btn-mulai-flash')?.addEventListener('click', mulaiFlash)
  document.getElementById('btn-kembali-pilih')?.addEventListener('click', kembaliPilih)
  document.getElementById('btn-hasil-kembali')?.addEventListener('click', ()=> location.href='minigame.html')
  document.getElementById('btn-hasil-lagi')?.addEventListener('click', ()=> {
    document.getElementById('modal-hasil-flash').classList.add('hidden')
    kembaliPilih()
  })
}

function showView(id){
  document.getElementById('view-pilih')?.classList.toggle('hidden', id!=='pilih')
  document.getElementById('view-pilih').style.display = id==='pilih' ? '' : 'none'
  document.getElementById('view-flash')?.classList.toggle('hidden', id!=='flash')
  document.getElementById('view-flash').style.display = id==='flash' ? 'flex' : 'none'
  document.getElementById('view-input')?.classList.toggle('hidden', id!=='input')
  document.getElementById('view-input').style.display = id==='input' ? 'flex' : 'none'
}

function kembaliPilih(){
  if(numpad) numpad.destroy()
  showView('pilih')
  updateCap()
}

async function mulaiFlash(){
  if(capUsed + tierReward(selectedTier) > 30){
    showToast('Cap tidak cukup untuk tier ini')
    return
  }
  const btn=document.getElementById('btn-mulai-flash')
  btn.disabled=true; btn.textContent='Memulai...'
  const {data, error}=await supabase.functions.invoke('start-flash',{body:{tier: selectedTier}})
  btn.disabled=false; btn.textContent='Mulai Flash →'
  if(error||!data||data.error){
    const msg=data?.error || error?.message || 'Gagal mulai'
    showToast(msg)
    if(data?.cap_harian) updateCap()
    return
  }
  runId=data.run_id
  numbers=data.numbers
  expected=null // jangan bocorkan, server punya
  showView('flash')
  jalankanFlash()
}

async function jalankanFlash(){
  const numEl=document.getElementById('flash-num')
  const countEl=document.getElementById('flash-count')
  const statusEl=document.getElementById('flash-status')
  const progress=document.getElementById('progress-flash')
  progress.innerHTML=''
  for(let i=0;i<numbers.length;i++){
    const d=document.createElement('div')
    d.className='pf-dot'
    progress.appendChild(d)
  }
  const dots=progress.querySelectorAll('.pf-dot')
  for(let i=0;i<numbers.length;i++){
    const n=numbers[i]
    const isPlus = n>=0
    const display = (isPlus ? (i===0 ? '' : '+') : '−') + Math.abs(n)
    numEl.textContent=display
    numEl.className='flash-num ' + (isPlus ? 'plus' : 'minus')
    countEl.textContent=`${i+1}/${numbers.length}`
    dots.forEach((d,idx)=>{
      d.className='pf-dot' + (idx < i ? ' done' : idx===i ? ' active' : '')
    })
    statusEl.textContent=`Angka ${i+1} dari ${numbers.length}`
    await new Promise(r=>setTimeout(r, 1000))
    // blank sebentar
    numEl.textContent=''
    await new Promise(r=>setTimeout(r, 120))
  }
  numEl.textContent='?'
  countEl.textContent='Selesai'
  statusEl.textContent='Masukkan hasil akhir'
  // pindah ke input
  setTimeout(()=> showInput(), 600)
}

function showInput(){
  showView('input')
  const wrap=document.getElementById('numpad-wrap')
  wrap.innerHTML=''
  if(numpad) numpad.destroy()
  numpad=createNumberPad(wrap, {
    maxLen:6,
    onSubmit: async (val)=> await submitJawaban(val)
  })
  document.getElementById('input-status').textContent='Masukkan hasil (boleh negatif, koma untuk desimal)'
}

async function submitJawaban(val){
  const num=Number(String(val).replace(',','.'))
  if(isNaN(num)){
    showToast('Isi angka dulu')
    return
  }
  document.getElementById('input-status').textContent='Memeriksa...'
  const {data, error}=await supabase.functions.invoke('tebak-flash',{body:{run_id: runId, jawaban: val}})
  if(error||!data||data.error){
    const msg=data?.error || error?.message || 'Gagal'
    showToast(msg)
    document.getElementById('input-status').textContent=msg
    if(data?.cap_harian) updateCap()
    return
  }
  if(data.benar){
    capUsed+=data.reward
    updateCap()
    showHasil(true, data)
  } else {
    showHasil(false, data)
  }
}

function showHasil(benar, data){
  const modal=document.getElementById('modal-hasil-flash')
  const icon=document.getElementById('hasil-icon-flash')
  const judul=document.getElementById('hasil-judul-flash')
  const desc=document.getElementById('hasil-desc-flash')
  const rew=document.getElementById('hasil-reward-flash')
  if(benar){
    icon.textContent='🎉'
    judul.textContent='Benar!'
    desc.textContent=`Jawaban: ${data.expected} • Tier ${selectedTier}`
    rew.innerHTML=`+${data.reward} <img src="assets/ui/icon_key_silver.svg" style="width:1em;height:1em;vertical-align:middle;display:inline;"> Key Silver`
  } else {
    icon.textContent='😢'
    judul.textContent='Salah'
    desc.textContent=`Jawaban benar: ${data.expected}`
    rew.textContent='+0 — coba lagi'
  }
  modal.classList.remove('hidden')
}

init()
