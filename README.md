# Waifu Math Clash

Game web turn-based PvP matematika — pilih kartu waifu, jawab soal untuk menyerang. Jawab benar = damage = ATK, jawab salah = giliran hangus. Portrait-only, mobile-first (Android browser).

> Stack vanilla: HTML/CSS/JS + Tailwind CDN + Supabase + Vercel. Tanpa framework, tanpa build step.

## ✨ Fitur

- **Auth** — Supabase Auth (login/register, verifikasi email, auto-redirect)
- **Home** — parallax gyroscope waifu favorit, rank & currency, Daily Login + Daily Quest (modal wajib)
- **Gacha** — rate Common 95% / Rare 4% / Epic 1%, hard pity Rare 15 & Epic 25 (counter independen), reveal clip-path wipe
- **Koleksi** — per banner (Epic→Rare→Common), swipe 3:4, upgrade bintang `ceil(base_atk * (1+stars*0.2))`, set favorite
- **Minigame Hub** — list card game (`minigame.html`)
  - **Game Casual** (`game-casual.html`) — PvE vs Bot, 3 slot rarity random, soal via Edge Function, timer 5–10 detik, HP = Rank×100, AFK detection
  - **Game Raid** (`game-raid.html`) — placeholder Coming Soon (co-op boss)
- **Shop** — tukar Epic `is_shop=true` pakai Key Gold
- **Profil** — stats `player_stats`, ubah username/password, logout
- **PWA-lite** — `sw.js` cache gambar + REST cards, portrait lock overlay

## 🧱 Stack

| Layer | Teknologi |
|---|---|
| Frontend | Vanilla HTML5/CSS3/JS (ES6+, `async/await`) |
| Styling | Tailwind CDN + `css/style.css` |
| DB/Auth/Storage/Realtime/Edge | Supabase |
| Hosting | Vercel |
| Math | `math.js` via CDN (generate & eval soal) |

## 📁 Struktur

```
waifu-math-clash/
├── index.html          # login / register (drawer)
├── home.html           # menu utama + daily modal
├── gacha.html          # list banner → detail → reveal
├── collection.html     # list banner dimiliki → detail swipe
├── minigame.html       # HUB: card list Game Casual / Raid / …
├── game-casual.html    # Battle PvE
├── game-raid.html      # Placeholder raid (soon)
├── shop.html           # grid Epic shop
├── profil.html         # profil + stats
├── css/style.css       # variabel mint/rose, portrait lock, card, nav, dll
├── js/
│   ├── supabase.js     # createClient (URL + anon key)
│   ├── auth.js         # login/register/logout
│   ├── home.js         # muat player + daily flow + gyroscope
│   ├── gacha.js        # pity, cache, reveal
│   ├── collection.js   # koleksi + upgrade + favorite
│   ├── game-casual.js  # battle turn, soal, timer, bot, AFK
│   ├── shop.js         # beli Epic pakai gold
│   ├── profil.js       # stats & setting
│   └── utils.js        # sleep, toast, rank/HP/ATK, lazy-load, SW, cache
├── assets/ui/          # icon_* , border_common/rare/epic.png
├── supabase/           # Edge Functions (generate-soal, validasi-jawaban, dll)
├── apk/                # Capacitor Android wrapper
├── sw.js               # Service Worker (image + data cache)
└── AGENTS.md           # panduan lengkap agent/arsitektur
```

## 🎨 Desain

- **Palet Mint & Rose**: `#EDFCF6` bg, `#3EC99E` primary, `#FF7FA0` aksen, `#2E3A35` teks
- **Font**: Nunito (Google Fonts)
- **Kartu**: proporsi 3:4, border PNG per rarity (ganti PNG saja)
- **Navigasi**: bottom-nav fix (Home • Gacha • Koleksi • Minigame • Shop • Profil)
- **Portrait only**: overlay `Putar balik HP kamu ya! 🌸` di landscape

## 🗄️ Supabase — Tabel Penting

- `players` (`key_silver`, `key_gold`, `pity_rare`, `pity_epic`, `total_power`, `rank`, `last_login_claim`, `last_quest_claim`)
- `cards` (`rarity`, `base_atk`, `image_url`, `banner`, `banner_label`, `is_shop`, `shop_price`)
- `player_cards` (`stars` 0–5, `current_atk`)
- `bots` / `bot_cards` / `battles` (`player_hp`/`opponent_hp`/`current_turn`/`status`/`winner`/`last_active`) / `battle_log`
- `player_stats` (`total_wins`, `total_losses`, `total_gacha`) + `player_favorite`

Rumus: `rank = floor(total_power/100)+1`, `hp = rank*100`, `current_atk = ceil(base_atk*(1+stars*0.2))`

## 🚀 Jalankan Lokal

Tanpa build — cukup serve statis (butuh `http://`/`https://` karena ES module + Supabase):

```bash
# opsi 1: python
python3 -m http.server 8000
# buka http://localhost:8000/index.html

# opsi 2: https lokal (sudah ada script)
./serve-https.sh
# atau
python3 serve-https.py
```

> `js/supabase.js` sudah berisi URL & anon key project. Ganti jika pakai project sendiri.

## 🔧 Supabase Setup (ringkas)

1. Buat project → jalankan SQL schema di `AGENTS.md` (tabel + RPC `claim_daily_login` / `claim_daily_quest`).
2. Buat bucket Storage untuk gambar waifu, set public read.
3. Deploy Edge Functions: `generate-soal` (soal per tier ATK 1–20/21–40/41–60/61–80/81+, 4 opsi distractor ±1..±5) dan `validasi-jawaban`/`selesai-battle`/`gacha` — wajib `corsHeaders` di setiap response.
4. Isi `cards` & `bots`.

## 🔄 Alur Battle (Game Casual)

1. `minigame.html` → `game-casual.html` (tanpa `?id` = Screen Info → Cari Musuh)
2. Cari bot rank setara (fallback rank terdekat) → insert `battles` → redirect `game-casual.html?id=...`
3. Pilih rarity → random kartu pool player → `generate-soal` (ATK-based) → timer 5/6/7/8/10 detik → jawab → `validasi-jawaban` → update HP → `battle_log` → giliran bot (akurasi 80/60/40% ± modifier) → ulang sampai HP ≤ 0 → `selesai-battle` → modal menang/kalah `+1 Key Silver` → kembali.

## 📱 APK

Wrapper Capacitor di `apk/`:

```bash
cd apk
npm install
npx cap copy
npx cap open android
```

WebView load `https://waifu-math.vercel.app` (lihat `apk/www/js/app.js`), lock portrait, double-back exit, handling offline.

## 🌐 Deploy

Push ke `main` → Vercel auto-deploy. Pastikan `vercel.json` (jika ada) dan env Supabase tidak di-commit (lihat `.gitignore`).

## 📝 Lisensi

Internal / pembelajaran — aset waifu milik masing-masing banner. Jangan commit `cert.pem`/`key.pem`/`.env`.

---
Butuh detail penuh (pity, tier soal, AFK, shop limit `maks_beli = (5-stars)-duplikat`)? Lihat `AGENTS.md`.
