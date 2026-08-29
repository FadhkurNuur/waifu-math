import { supabase } from './supabase.js'
import { requireAuth, showToast, createQwertyPad } from './utils.js'

let session, player
let levelId=null, urutan=0, panjang=0, answeredPos=new Set()
let wrongCount=0, sisa=5, blocked=false, allCompleted=false
let qwerty=null
let posisiAktif=null

function showScreen(nama){
  document.getElementById('screen-info')?.classList.toggle('hidden', nama!=='info')
  document.getElementById('screen-arena')?.classList.toggle('hidden', nama!=='arena')
  const info=document.getElementById('screen-info')
  const arena=document.getElementById('screen-arena')
  if(info) info.style.display = nama==='info' ? 'flex':'none'
  if(arena) arena.style.display = nama==='arena' ? 'flex':'none'
}

function updateHeaderWrong(){
  const el=document.getElementById('header-wrong')
  if(el) el.textContent=`${wrongCount}/5 salah`
  if(blocked){
    el.style.borderColor='var(--aksen)'; el.style.color='var(--aksen)'
  }
}

async function muatNext(){
  const {data, error}=await supabase.functions.invoke('get-decoder-next', {body:{}})
  if(error){
    showToast('Gagal muat level')
    return null
  }
  if(data.error){
    showToast(data.error)
    return null
  }
  wrongCount=data.wrongCount||0
  sisa=data.sisa ?? (5-wrongCount)
  blocked=!!data.blocked
  allCompleted=!!data.allCompleted
  updateHeaderWrong()
  const infoLevel=document.getElementById('info-level')
  const infoPanjang=document.getElementById('info-panjang')
  const infoSalah=document.getElementById('info-salah')
  const btnMulai=document.getElementById('btn-mulai')
  const blockMsg=document.getElementById('info-block-msg')

  if(allCompleted){
    infoLevel.textContent=`Semua Level Selesai! (${data.completedCount}/${data.total})`
    infoPanjang.textContent='Kamu sudah menyelesaikan semua kata. Tunggu update level baru!'
    infoSalah.textContent=''
    btnMulai.disabled=true
    btnMulai.style.background='#ccc'
    btnMulai.textContent='Selesai Semua'
    blockMsg.classList.add('hidden')
    return data
  }

  levelId=data.level_id
  urutan=data.urutan
  panjang=data.panjang
  answeredPos=new Set(data.answeredPos||[])

  infoLevel.textContent=`Level ${urutan} • ${panjang} huruf`
  infoPanjang.textContent=`Progress: ${data.answeredCount||0}/${panjang} kotak terisi`
  infoSalah.textContent=`Sisa salah hari ini: ${sisa}/5`

  if(blocked){
    btnMulai.disabled=true
    btnMulai.style.background='#ccc'
    btnMulai.textContent='Terblokir Hari Ini'
    blockMsg.classList.remove('hidden')
  } else {
    btnMulai.disabled=false
    btnMulai.style.background=''
    btnMulai.textContent='Mulai'
    blockMsg.classList.add('hidden')
  }
  // arena header
  document.getElementById('arena-judul').textContent=`Level ${urutan}`
  document.getElementById('arena-progress').textContent=`${answeredPos.size}/${panjang}`
  return data
}

function renderKotak(){
  const wrap=document.getElementById('kotak-wrap')
  wrap.innerHTML=''
  for(let i=0;i<panjang;i++){
    const div=document.createElement('div')
    const isFilled=answeredPos.has(i)
    div.className='kotak' + (isFilled ? ' terisi' : '')
    if(blocked && !isFilled) div.classList.add('blok')
    div.dataset.pos=String(i)
    div.textContent=isFilled ? '?' : '' // huruf akan diisi setelah fetch? kita simpan huruf di data attribute setelah benar
    // ambil huruf tersimpan jika sudah answered via slot? kita perlu fetch huruf via slot? Simpan di memory setelah load?
    // Untuk MVP, setelah benar huruf disimpan di DOM via validate response
    // Jika reload, kita perlu fetch huruf per slot — lakukan di muatNext via detail? Untuk sekarang tampil ? dulu, akan diisi via loadHuruf()
    if(!isFilled && !blocked) div.addEventListener('click', ()=> tapKotak(i))
    // jika terisi, tampilkan huruf jika ada di dataset (diisi saat validate atau load)
    if(isFilled && div.dataset.huruf) div.textContent=div.dataset.huruf
    wrap.appendChild(div)
  }
  // load huruf yang sudah answered dari server (opsional: fetch via validate already)
  loadHurufTerisi()
}

async function loadHurufTerisi(){
  // jika ada answeredPos, kita perlu huruf aslinya — ambil via validate? Simpler: query decoder_progress_slots + join jawaban huruf?
  // Kita akan coba ambil via RPC manual query ke decoder_questions jawaban -> huruf, tapi hanya untuk posisi answered (boleh karena sudah benar).
  // Fallback: tampil '✓' dulu
  const wrap=document.getElementById('kotak-wrap')
  for(const pos of answeredPos){
    const el=wrap.querySelector(`.kotak[data-pos="${pos}"]`)
    if(!el) continue
    if(el.dataset.huruf) continue
    // coba fetch soal untuk dapat jawaban huruf (karena sudah answered, boleh expose)
    try{
      const {data: q}=await supabase.from('decoder_questions').select('jawaban').eq('level_id', levelId).eq('posisi', pos).single()
      if(q?.jawaban){
        const huruf=String.fromCharCode(64+q.jawaban)
        el.textContent=huruf
        el.dataset.huruf=huruf
      } else {
        el.textContent='✓'
      }
    } catch{
      el.textContent='✓'
    }
  }
  document.getElementById('arena-progress').textContent=`${answeredPos.size}/${panjang}`
}

async function tapKotak(pos){
  if(blocked){ showToast('Sudah 5 salah hari ini'); return }
  if(answeredPos.has(pos)){ showToast('Sudah terisi'); return }
  posisiAktif=pos
  // buka modal
  document.getElementById('modal-soal')?.classList.remove('hidden')
  document.getElementById('soal-pos').textContent=`Kotak ${pos+1} / ${panjang}`
  document.getElementById('soal-teks').textContent='Memuat soal...'
  document.getElementById('soal-status').textContent=''
  if(qwerty) qwerty.destroy()
  const wrap=document.getElementById('qwerty-wrap')
  wrap.innerHTML=''
  // fetch soal
  const {data, error}=await supabase.functions.invoke('get-decoder-soal', {body:{level_id: levelId, posisi: pos}})
  if(error || !data || data.error){
    document.getElementById('soal-teks').textContent='Gagal memuat soal'
    return
  }
  document.getElementById('soal-teks').textContent=data.soal
  qwerty=createQwertyPad(wrap, {
    onSubmit: async (huruf)=> await submitHuruf(huruf)
  })
}

async function submitHuruf(huruf){
  if(posisiAktif===null) return
  document.getElementById('soal-status').textContent='Memeriksa...'
  document.getElementById('soal-status').style.color='var(--teks-sekunder)'
  const {data, error}=await supabase.functions.invoke('validate-decoder-jawaban', {body:{level_id: levelId, posisi: posisiAktif, huruf}})
  if(error){
    document.getElementById('soal-status').textContent='Gagal validasi'
    return
  }
  if(data.blocked && data.error){
    wrongCount=data.wrongCount||5
    sisa=data.sisa||0
    blocked=true
    updateHeaderWrong()
    document.getElementById('soal-status').textContent=data.error
    document.getElementById('soal-status').style.color='var(--aksen)'
    showToast('Blokir sampai besok')
    // tutup soal, tampil block modal
    setTimeout(()=>{
      document.getElementById('modal-soal')?.classList.add('hidden')
      document.getElementById('modal-block')?.classList.remove('hidden')
      // update info screen block
      muatNext()
      renderKotak()
    }, 600)
    return
  }
  if(data.already){
    answeredPos.add(posisiAktif)
    showToast('Sudah benar sebelumnya')
    document.getElementById('soal-status').textContent=`Sudah terisi: ${data.huruf}`
    setTimeout(()=>{ document.getElementById('modal-soal')?.classList.add('hidden'); renderKotak() }, 400)
    return
  }
  if(!data.benar){
    wrongCount=data.wrongCount
    sisa=data.sisa
    blocked=!!data.blocked
    updateHeaderWrong()
    document.getElementById('soal-status').textContent=`Salah! Sisa ${sisa}/5`
    document.getElementById('soal-status').style.color='var(--aksen)'
    showToast(`Salah - sisa ${sisa}`)
    if(blocked){
      setTimeout(()=>{
        document.getElementById('modal-soal')?.classList.add('hidden')
        document.getElementById('modal-block')?.classList.remove('hidden')
        muatNext()
        renderKotak()
      }, 700)
    } else {
      if(qwerty) qwerty.clear()
    }
    return
  }
  // benar
  wrongCount=data.wrongCount||wrongCount
  sisa=data.sisa
  updateHeaderWrong()
  answeredPos.add(posisiAktif)
  // simpan huruf di DOM
  const wrap=document.getElementById('kotak-wrap')
  const el=wrap.querySelector(`.kotak[data-pos="${posisiAktif}"]`)
  if(el){
    el.textContent=data.huruf
    el.dataset.huruf=data.huruf
    el.classList.add('terisi')
    el.classList.remove('blok')
  }
  document.getElementById('soal-status').textContent=`Benar! Huruf ${data.huruf}`
  document.getElementById('soal-status').style.color='var(--primary)'
  showToast(`Benar! ${data.huruf}`)
  // update progress
  document.getElementById('arena-progress').textContent=`${answeredPos.size}/${panjang}`
  if(data.completed){
    // reward
    setTimeout(()=>{
      document.getElementById('modal-soal')?.classList.add('hidden')
      showHasil(data.keys_added||1)
    }, 600)
  } else {
    setTimeout(()=>{
      document.getElementById('modal-soal')?.classList.add('hidden')
    }, 600)
  }
}

function showHasil(keys){
  const modal=document.getElementById('modal-hasil')
  document.getElementById('hasil-judul').textContent='Level Selesai!'
  document.getElementById('hasil-desc').innerHTML=`Kata terungkap! +${keys} <img src="assets/ui/icon_key_silver.svg" style="width:1em;height:1em;vertical-align:middle;display:inline;"> Key Silver`
  modal.classList.remove('hidden')
}

async function init(){
  session=await requireAuth(supabase)
  if(!session) return
  const {data: p}=await supabase.from('players').select('id, username').eq('id', session.user.id).single()
  player=p
  await muatNext()
  showScreen('info')
  // wire
  document.getElementById('btn-mulai')?.addEventListener('click', async ()=>{
    if(blocked){ showToast('Sudah 5 salah hari ini'); document.getElementById('modal-block')?.classList.remove('hidden'); return }
    if(allCompleted){ showToast('Semua level selesai'); return }
    if(!levelId) await muatNext()
    showScreen('arena')
    renderKotak()
  })
  document.getElementById('btn-kembali-info')?.addEventListener('click', async ()=>{
    await muatNext()
    showScreen('info')
  })
  document.getElementById('btn-tutup-soal')?.addEventListener('click', ()=>{
    document.getElementById('modal-soal')?.classList.add('hidden')
    if(qwerty) qwerty.clear()
  })
  document.getElementById('modal-soal')?.addEventListener('click', (e)=>{
    if(e.target.id==='modal-soal') { document.getElementById('modal-soal')?.classList.add('hidden'); if(qwerty) qwerty.clear() }
  })
  document.getElementById('btn-hasil-lanjut')?.addEventListener('click', async ()=>{
    document.getElementById('modal-hasil')?.classList.add('hidden')
    await muatNext()
    if(allCompleted){
      showScreen('info')
    } else {
      showScreen('arena')
      renderKotak()
    }
  })
  document.getElementById('btn-hasil-kembali')?.addEventListener('click', async ()=>{
    document.getElementById('modal-hasil')?.classList.add('hidden')
    await muatNext()
    showScreen('info')
  })
  document.getElementById('btn-block-ok')?.addEventListener('click', ()=>{
    document.getElementById('modal-block')?.classList.add('hidden')
  })
  document.getElementById('modal-block')?.addEventListener('click', (e)=>{
    if(e.target.id==='modal-block') document.getElementById('modal-block')?.classList.add('hidden')
  })
}

init()
