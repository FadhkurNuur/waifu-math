import { supabase } from './supabase.js'
import { requireAuth, showToast, createNumberPad } from './utils.js'

let session, player
let materiAktif=null
let soalAktif=null
let totalSoal=0, doneSoal=0
let fragments=0
let numpad=null

async function init(){
  session=await requireAuth(supabase)
  if(!session) return
  await muatPlayer()
  await muatListMateri()
  wire()
}
async function muatPlayer(){
  const {data}=await supabase.from('players').select('class_fragments, key_silver').eq('id', session.user.id).single()
  fragments=data?.class_fragments||0
  updateFragHeader()
}
function updateFragHeader(){
  const el=document.getElementById('header-frag')
  if(el) el.innerHTML=`${fragments}/5 <img src="assets/ui/icon_key_silver.svg" style="width:1em;height:1em;vertical-align:middle;display:inline;">`
  const bar=document.getElementById('frag-bar')
  const teks=document.getElementById('frag-teks')
  if(bar) bar.style.width=`${(fragments/5)*100}%`
  if(teks) teks.textContent=`${fragments}/5`
}

async function muatListMateri(){
  const container=document.getElementById('list-materi')
  const {data, error}=await supabase.from('class_materials').select('*').eq('is_active', true).order('urutan')
  if(error||!data||data.length===0){
    container.innerHTML='<p class="text-center text-sm mt-8" style="color: var(--teks-sekunder);">Belum ada materi. Admin perlu buat di DB.</p>'
    return
  }
  container.innerHTML=''
  for(const m of data){
    // hitung progress
    const {data: qs}=await supabase.from('class_questions').select('id').eq('material_id', m.id)
    const total=qs?.length||0
    let done=0
    if(total>0){
      const {data: prog}=await supabase.from('class_progress').select('question_id, status').eq('player_id', session.user.id).in('question_id', qs.map(q=>q.id))
      done=(prog||[]).filter(p=>p.status==='correct').length
    }
    const card=document.createElement('div')
    card.className='materi-card' + (done===total && total>0 ? ' selesai':'')
    card.innerHTML=`
      <div class="flex justify-between items-start">
        <div>
          <p class="text-xs font-bold" style="color: var(--teks-sekunder);">${m.jenjang} • ${m.mapel}</p>
          <p class="font-extrabold" style="color: var(--teks);">${m.judul}</p>
          <p class="text-xs" style="color: var(--teks-sekunder);">${m.bab} • ${total} soal</p>
        </div>
        <span class="text-xs font-bold px-2 py-1 rounded-full" style="background:${done===total&&total>0?'var(--primary)':'#f3f4f6'}; color:${done===total&&total>0?'#fff':'var(--teks-sekunder)'};">${done}/${total}</span>
      </div>
      <p class="text-xs mt-1" style="color: var(--teks-sekunder);">${m.deskripsi||''}</p>
    `
    card.addEventListener('click', ()=> bukaMateri(m))
    container.appendChild(card)
  }
}

function wire(){
  document.getElementById('btn-kembali-list')?.addEventListener('click', ()=>{
    document.getElementById('view-arena').style.display='none'
    document.getElementById('view-arena').classList.add('hidden')
    document.getElementById('view-list').classList.remove('hidden')
    if(numpad) numpad.destroy()
  })
  document.getElementById('btn-next')?.addEventListener('click', async ()=>{
    document.getElementById('btn-next').classList.add('hidden')
    await nextSoal()
  })
}

async function bukaMateri(materi){
  materiAktif=materi
  document.getElementById('view-list').classList.add('hidden')
  const arena=document.getElementById('view-arena')
  arena.classList.remove('hidden')
  arena.style.display='flex'
  document.getElementById('arena-judul').textContent=materi.judul
  await refreshMateriProgress()
  await nextSoal()
}

async function refreshMateriProgress(){
  const {data: qs}=await supabase.from('class_questions').select('id, urutan').eq('material_id', materiAktif.id).order('urutan')
  totalSoal=qs?.length||0
  const {data: prog}=await supabase.from('class_progress').select('question_id, status').eq('player_id', session.user.id).in('question_id', (qs||[]).map(q=>q.id))
  const correctSet=new Set((prog||[]).filter(p=>p.status==='correct').map(p=>p.question_id))
  doneSoal=correctSet.size
  // dots
  const dots=document.getElementById('dots-wrap')
  dots.innerHTML=''
  for(let i=0;i<totalSoal;i++){
    const d=document.createElement('div')
    const q=qs[i]
    const isDone=correctSet.has(q.id)
    d.className='dot' + (isDone?' done':'')
    d.title=`Soal ${i+1}`
    dots.appendChild(d)
  }
  document.getElementById('arena-progress').textContent=`${doneSoal}/${totalSoal}`
  updateFragHeader()
}

async function nextSoal(){
  // panggil start-class untuk dapat next
  const {data, error}=await supabase.functions.invoke('start-class',{body:{material_id: materiAktif.id}})
  if(error||!data){
    showToast('Gagal muat soal')
    return
  }
  if(data.sudah_selesai || !data.next){
    document.getElementById('soal-teks').textContent='Selesai! Semua soal sudah benar.'
    document.getElementById('soal-urutan').textContent=`${doneSoal}/${totalSoal} selesai`
    document.getElementById('soal-penjelasan').classList.add('hidden')
    document.getElementById('numpad-wrap').innerHTML='<p class="text-center text-sm font-bold" style="color: var(--primary);">Materi selesai ✓ — pilih materi lain</p>'
    document.getElementById('arena-status').textContent='Semua soal sudah correct. Menunggu admin tambah soal lagi.'
    document.getElementById('btn-next').classList.add('hidden')
    return
  }
  soalAktif=data.next
  const urut=data.next.urutan
  document.getElementById('soal-urutan').textContent=`Soal ${urut} / ${totalSoal}`
  document.getElementById('soal-teks').textContent=data.next.soal
  document.getElementById('soal-penjelasan').classList.add('hidden')
  document.getElementById('soal-penjelasan').textContent=''
  document.getElementById('arena-status').textContent='Input jawaban pakai numpad koma, lalu Kirim'
  document.getElementById('btn-next').classList.add('hidden')
  // buat numpad
  const wrap=document.getElementById('numpad-wrap')
  wrap.innerHTML=''
  if(numpad) numpad.destroy()
  numpad=createNumberPad(wrap, {
    onSubmit: async (val)=> await submitJawaban(val)
  })
}

async function submitJawaban(val){
  if(!soalAktif) return
  document.getElementById('arena-status').textContent='Memeriksa...'
  const {data, error}=await supabase.functions.invoke('validate-class-jawaban',{body:{question_id: soalAktif.id, jawaban_user: val}})
  if(error||!data){
    showToast('Gagal validasi')
    document.getElementById('arena-status').textContent='Gagal, coba lagi'
    return
  }
  const statusEl=document.getElementById('arena-status')
  const penEl=document.getElementById('soal-penjelasan')
  if(data.benar){
    if(data.already_correct){
      statusEl.textContent='Sudah pernah benar — lanjut soal (no frag)'
      statusEl.style.color='var(--teks-sekunder)'
    } else if(data.dapat_fragment){
      // first correct
      fragments=data.fragments
      updateFragHeader()
      if(data.keys_added>0){
        statusEl.innerHTML=`Benar! +1 frag → <b>5/5 = 1 Key Silver</b> ✓ (frag sekarang ${fragments}/5)`
        showToast(`+1 Key Silver! (${data.keys_added})`)
        // konfeti kecil
        statusEl.style.color='var(--primary)'
      } else {
        statusEl.textContent=`Benar! +1 frag (${fragments}/5)`
        statusEl.style.color='var(--primary)'
        showToast('+1 fragment')
      }
    } else {
      // benar tapi retry setelah salah -> no frag
      statusEl.textContent='Benar! (retry, tidak dapat frag — hanya syarat lanjut)'
      statusEl.style.color='var(--teks-sekunder)'
    }
    penEl.classList.add('hidden')
    // update dots
    await refreshMateriProgress()
    document.getElementById('btn-next').classList.remove('hidden')
    // auto next setelah 1 detik jika mau
    // setTimeout(()=> document.getElementById('btn-next').click(), 800)
  } else {
    statusEl.textContent=`Salah — coba lagi (no frag). Jawaban benar: ${data.jawaban_benar}`
    statusEl.style.color='var(--aksen)'
    penEl.textContent=data.penjelasan ? `Penjelasan: ${data.penjelasan}` : `Jawaban benar: ${data.jawaban_benar}`
    penEl.classList.remove('hidden')
    // tidak dapat next, harus ulang
    if(numpad) numpad.clear()
  }
}

init()
