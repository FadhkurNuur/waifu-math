import { supabase } from './supabase.js'
import { requireAuth, showToast, createNumberPad } from './utils.js'

let session
let run=null
let numpad=null
let attempts=0
let guesses=[]

async function init(){
  session=await requireAuth(supabase)
  if(!session) return
  await cekStatus()
  wire()
}

async function cekStatus(){
  const {data, error}=await supabase.functions.invoke('start-guess')
  if(error){
    showToast('Gagal muat')
    return
  }
  // data.run bisa already
  if(data.already && data.run){
    run=data.run
    attempts=run.attempts||0
    guesses=run.guesses||[]
    if(run.status==='finished'){
      tampilSudahSelesai(run)
    } else {
      // ada run aktif hari ini (belum selesai, misal reload)
      document.getElementById('info-status').classList.remove('hidden')
      document.getElementById('info-status').innerHTML=`<b>Sesi hari ini aktif</b> • ${attempts}/10 tebak sudah dipakai<br><span style="color:var(--primary); font-weight:800;">Lanjutkan</span>`
      document.getElementById('btn-mulai').textContent='Lanjutkan →'
    }
  } else if(data.run){
    // belum ada, siap mulai
    document.getElementById('info-status').classList.add('hidden')
  }
}

function tampilSudahSelesai(r){
  const el=document.getElementById('info-status')
  el.classList.remove('hidden')
  if(r.won){
    el.innerHTML=`<b style="color:var(--primary);">Sudah menang hari ini ✓</b> • Tebakan: ${r.guesses.join(', ')}<br>+1 Key Silver sudah diklaim. Kembali besok!`
  } else if(r.status==='finished'){
    el.innerHTML=`<b style="color:var(--aksen);">Sudah habis 10x hari ini</b> • Jawaban: ${r.secret}<br>Kembali besok!`
  }
  document.getElementById('btn-mulai').textContent='Sudah Selesai'
  document.getElementById('btn-mulai').disabled=true
  document.getElementById('btn-mulai').style.opacity='0.6'
}

function wire(){
  document.getElementById('btn-mulai')?.addEventListener('click', mulaiArena)
  document.getElementById('btn-kembali-list')?.addEventListener('click', ()=>{
    document.getElementById('view-arena').style.display='none'
    document.getElementById('view-arena').classList.add('hidden')
    document.getElementById('view-info').classList.remove('hidden')
    if(numpad) numpad.destroy()
  })
  document.getElementById('btn-hasil-kembali')?.addEventListener('click', ()=> location.href='minigame.html')
  document.getElementById('btn-next')?.addEventListener('click', ()=> location.href='minigame.html')
}

async function mulaiArena(){
  // jika belum ada run, buat dulu
  if(!run || run.status==='finished'){
    const {data, error}=await supabase.functions.invoke('start-guess')
    if(error||!data||!data.run){
      showToast(data?.error || 'Gagal mulai')
      return
    }
    run=data.run
    attempts=run.attempts||0
    guesses=run.guesses||[]
    if(run.status==='finished'){
      tampilSudahSelesai(run)
      return
    }
  }
  document.getElementById('view-info').classList.add('hidden')
  const arena=document.getElementById('view-arena')
  arena.classList.remove('hidden')
  arena.style.display='flex'
  renderDots()
  renderHistory()
  updateHint('Masukkan angka 1-100')
  const wrap=document.getElementById('numpad-wrap')
  wrap.innerHTML=''
  if(numpad) numpad.destroy()
  numpad=createNumberPad(wrap, {
    maxLen:3,
    onSubmit: async (val)=> await submitTebak(val)
  })
  // batasi numpad 1-100: maxLen 3 sudah, tapi cegah 0 dan >100 di submit
}

function renderDots(){
  const dots=document.getElementById('dots-wrap')
  dots.innerHTML=''
  for(let i=0;i<10;i++){
    const d=document.createElement('div')
    d.className='attempt-dot' + (i < attempts ? ' used' : '')
    // jika sudah ada history salah, tandai wrong? semua used sama
    dots.appendChild(d)
  }
  document.getElementById('attempt-teks').textContent=`${attempts}/10`
}

function renderHistory(){
  const h=document.getElementById('history')
  h.innerHTML=''
  guesses.forEach((g,i)=>{
    const div=document.createElement('div')
    div.className='bg-white rounded-xl px-3 py-2 flex justify-between items-center shadow-sm'
    div.innerHTML=`<span class="text-xs font-bold" style="color:var(--teks-sekunder);">#${i+1}</span><span class="font-extrabold" style="color:var(--teks);">${g}</span>`
    h.appendChild(div)
  })
}

function updateHint(teks, color){
  const el=document.getElementById('hint-teks')
  el.textContent=teks
  el.style.color=color||'var(--teks-sekunder)'
}

async function submitTebak(val){
  const num=Number(String(val).replace(',','.'))
  if(!Number.isInteger(num)||num<1||num>100){
    showToast('Masukkan 1-100')
    updateHint('Harus 1-100', 'var(--aksen)')
    return
  }
  // optimis: disable numpad kirim?
  const {data, error}=await supabase.functions.invoke('tebak-guess',{body:{run_id: run.id, tebakan: num}})
  if(error||!data||data.error){
    const msg=data?.error || error?.message || 'Gagal tebak'
    showToast(msg)
    updateHint(msg, 'var(--aksen)')
    return
  }
  // update state
  attempts=data.attempts
  guesses.push(num)
  renderDots()
  renderHistory()
  if(numpad) numpad.clear()

  if(data.hint==='benar'){
    updateHint('Benar! 🎉', 'var(--primary)')
    // dots jadi green semua?
    document.querySelectorAll('.attempt-dot').forEach((d,i)=>{ if(i < attempts) d.classList.add('used') })
    showHasil(true, data)
  } else if(data.status==='finished'){
    // habis 10x
    updateHint(`${data.hint} — kesempatan habis! Jawaban: ${data.secret}`, 'var(--aksen)')
    showHasil(false, data)
  } else {
    const hintText = data.hint==='terlalu kecil' ? 'Terlalu kecil — coba lebih besar ↑' : 'Terlalu besar — coba lebih kecil ↓'
    const col = data.hint==='terlalu kecil' ? 'var(--primary)' : 'var(--aksen)'
    updateHint(hintText, col)
    // tandai dot terakhir sebagai wrong
    const dots=document.querySelectorAll('.attempt-dot')
    if(dots[attempts-1]) dots[attempts-1].classList.add('wrong')
  }
}

function showHasil(menang, data){
  const modal=document.getElementById('modal-hasil')
  const icon=document.getElementById('hasil-icon')
  const judul=document.getElementById('hasil-judul')
  const desc=document.getElementById('hasil-desc')
  const rew=document.getElementById('hasil-reward')
  if(menang){
    icon.textContent='🎉'
    judul.textContent='Tebakan Benar!'
    desc.textContent=`Jawaban: ${data.secret||''} • ${attempts}/10 percobaan`
    rew.innerHTML='+1 <img src="assets/ui/icon_key_silver.svg" style="width:1em;height:1em;vertical-align:middle;display:inline;"> Key Silver'
  } else {
    icon.textContent='😢'
    judul.textContent='Kesempatan Habis'
    desc.textContent=`Jawaban: ${data.secret} • 10/10`
    rew.textContent='+0 — coba lagi besok'
  }
  modal.classList.remove('hidden')
  // update run status
  run.status='finished'
  run.won=menang
}

init()
