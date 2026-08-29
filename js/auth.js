import { supabase } from './supabase.js'
import { redirectIfLoggedIn, showLoading, hideLoading } from './utils.js'

// Redirect ke home jika sudah login
await redirectIfLoggedIn(supabase)

// ===== Handler Login =====
window.handleLogin = async function () {
  const email = document.getElementById('input-email')?.value.trim()
  const password = document.getElementById('input-password')?.value
  if (!email || !password) { tampilError('Email dan password wajib diisi.'); return }

  setBtnLoading(true)
  showLoading()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  hideLoading()
  setBtnLoading(false)

  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      tampilError('Email belum diverifikasi. Cek inbox kamu.')
    } else {
      tampilError('Login gagal: ' + error.message)
    }
    return
  }
  if (data.session) window.location.href = '/home.html'
}

// ===== Handler Register =====
window.handleRegister = async function () {
  const username = document.getElementById('input-username')?.value.trim()
  const email    = document.getElementById('input-email')?.value.trim()
  const password = document.getElementById('input-password')?.value

  if (!username) { tampilError('Username wajib diisi.'); return }
  if (!email || !password) { tampilError('Email dan password wajib diisi.'); return }

  setBtnLoading(true)
  showLoading()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  })

  hideLoading()
  setBtnLoading(false)

  if (error) { tampilError('Register gagal: ' + error.message); return }

  // Ganti isi drawer dengan notifikasi sukses
  document.getElementById('pesan-error').classList.add('hidden')
  document.getElementById('drawer-body').innerHTML = `
    <div class="sukses-register">
      <div class="icon-sukses">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <strong style="font-family:'Nunito',sans-serif;font-size:1.1rem;font-weight:800;color:var(--teks);">
        Akun berhasil dibuat!
      </strong>
      <p>Cek <strong>inbox email kamu</strong> untuk verifikasi sebelum bisa login.</p>
    </div>
  `
  document.getElementById('drawer-judul').textContent = 'Cek Email Kamu'
}

// ===== Helpers =====
function tampilError(pesan) {
  const el = document.getElementById('pesan-error')
  if (!el) return
  el.textContent = pesan
  el.classList.remove('hidden')
}

function setBtnLoading(loading) {
  const btn = document.getElementById('btn-submit')
  if (!btn) return
  btn.disabled = loading
  if (loading) btn.textContent = 'Loading...'
}
