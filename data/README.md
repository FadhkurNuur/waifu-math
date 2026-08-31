# Data — Panduan Input Database

Folder `data/` berisi panduan input manual ke Supabase + **template prompt** untuk suruh AI generate soal/konten.

> Semua file di sini adalah **sumber kebenaran** untuk format `jawaban`, `soal`, dan SQL. Suruh AI `Baca data/xxx.md` dulu sebelum generate.

## Daftar File

| File | Mode | Tabel Utama | Cara pakai AI |
|---|---|---|---|
| `game-class.md` | **Kelas** (`game-class.html`) | `class_materials` + `class_questions` | `Baca data/game-class.md dan buatkan 10 soal untuk bab Pecahan judul Penjumlahan Pecahan` |
| `game-decoder.md` | **Decoder** (`game-decoder.html`) | `decoder_levels` + `decoder_questions` | `Baca data/game-decoder.md dan buatkan level baru kata SEKOLAH urutan 6` |

> Tambahkan file baru per mode jika ada tabel soal lain (misal `game-flash.md`, `game-raid.md`).

---

## Aturan Umum Input

1. **Jangan pakai `localStorage`** untuk HP/currency/soal — semua via Supabase.
2. **Jawaban Kelas**: normalized **koma** (`0,75` bukan `0.75`), toleransi `0.001`.
3. **Jawaban Decoder**: `1..26` mapping `A=1..Z=26`, soal jsonb `{"q":"... = ?"}` hasil harus 1..26.
4. **SQL paste** di **Supabase Dashboard → SQL Editor** → Run. Semua template sudah pakai `ON CONFLICT DO NOTHING` biar aman re-run.
5. **RLS**: `*_questions` & `*_levels` SELECT public. Jangan disable RLS.

---

## Cara Pakai — 3 Langkah

### Langkah 1: Pilih file panduan
Buka `data/game-class.md` atau `data/game-decoder.md` sesuai mode.

### Langkah 2: Copy prompt template
Tiap file bagian **Template Prompt** ada 3–4 prompt siap copy. Ganti `[VARIABEL]` saja.

### Langkah 3: Paste ke AI + Run SQL
- Kirim ke AI: `Baca data/game-class.md dan buatkan ...`
- AI akan balas **tabel preview + SQL**.
- Copy SQL → paste ke Supabase SQL Editor → Run → cek validasi query di file.

---

## Contoh Perintah AI Siap Pakai

```text
Baca data/game-class.md dan buatkan 10 soal untuk materi baru jenjang SMP bab Aljabar judul Persamaan Linear urutan 4. Output tabel + SQL DO $$.
```

```text
Baca data/game-class.md dan buatkan 10 soal untuk bab Pecahan judul Pengurangan Pecahan yang sudah ada. Output SQL insert 10 soal.
```

```text
Baca data/game-decoder.md dan buatkan level baru kata BELAJAR urutan 6 + soal per huruf. Output tabel + SQL DO $$.
```

```text
Baca data/game-decoder.md dan buatkan 3 level batch: CERDAS, PINTAR, SEKOLAH mulai urutan 6. Output SQL batch.
```

```text
Baca data/game-class.md dan validasi soal berikut (masih titik), kembalikan versi koma + SQL UPDATE:
[ paste list ]
```

---

## Validasi Cepat Setelah Insert

**Kelas:**
```sql
-- cek materi + jumlah soal
SELECT m.bab, m.judul, COUNT(q.id) as jml FROM class_materials m LEFT JOIN class_questions q ON q.material_id=m.id GROUP BY m.id ORDER BY m.urutan;
-- cek jawaban masih titik (harusnya 0)
SELECT soal, jawaban FROM class_questions WHERE jawaban LIKE '%.%';
```

**Decoder:**
```sql
-- cek mismatch mapping (harusnya 0 row)
SELECT dl.urutan, dl.kata, dq.posisi, dq.jawaban FROM decoder_levels dl JOIN decoder_questions dq ON dq.level_id=dl.id
WHERE chr(64+dq.jawaban) <> substring(dl.kata from dq.posisi+1 for 1);
-- cek panjang soal != panjang kata (harusnya 0)
SELECT dl.kata, length(dl.kata), COUNT(dq.id) FROM decoder_levels dl LEFT JOIN decoder_questions dq ON dq.level_id=dl.id GROUP BY dl.id HAVING COUNT(dq.id) <> length(dl.kata);
```

---

## Menambah Mode Baru

1. Duplikat salah satu `game-xxx.md` sebagai template.
2. Ganti bagian **Struktur Database** sesuai migration baru.
3. Tambah baris di tabel atas di README ini.
4. Commit:
```bash
git add data/
git commit -m "docs: tambah panduan data/game-xxx"
```

---

## Referensi

- `supabase/7. migration_class.sql` — Kelas
- `supabase/8. migration_decoder.sql` — Decoder
- `supabase/functions/start-class` & `validate-class-jawaban`
- `supabase/functions/get-decoder-next` & `validate-decoder-jawaban`
- `AGENTS.md` — arsitektur lengkap
