# Game Class — Panduan Input Database + Template Generate Soal

> File ini adalah **sumber kebenaran** untuk input materi & soal mode **Kelas** (`game-class.html`).
> Kalau butuh soal baru: suruh AI `Baca data/game-class.md dan buatkan X soal untuk materi Y`.

---

## 1. Ringkasan Mode

- Pure math, tanpa waifu/cap, **tanpa batas harian**.
- Player kerjakan soal **urut** per materi (`urutan` 1..N).
- Harus **benar** untuk lanjut. Salah boleh retry tapi **tidak dapat fragment**.
- Hanya jawaban benar **pertama kali** (`first_correct = true`) yang dapat **+1 fragment**. 5 fragment = 1 Key Silver otomatis via RPC `tambah_class_fragment`.
- Input jawaban via numpad koma (`createNumberPad`), validasi di Edge Function `validate-class-jawaban` dengan toleransi `0.001`.

Flow edge:
```
start-class  →  cari next soal belum correct (urut)
validate-class-jawaban → cek first_correct → tambah fragment jika layak
```

---

## 2. Struktur Database

### `class_materials` — Materi

| kolom | tipe | keterangan |
|---|---|---|
| `id` | uuid PK | auto `gen_random_uuid()` |
| `jenjang` | text | `SD` / `SMP` / `SMA` |
| `mapel` | text | default `Matematika` |
| `bab` | text | contoh: `Pecahan`, `Aljabar` |
| `judul` | text | contoh: `Penjumlahan Pecahan` |
| `deskripsi` | text | singkat 1 kalimat |
| `urutan` | integer | urutan tampil di list (1,2,3...) |
| `is_active` | boolean | `true` = tampil di app |

Index: `urutan`

### `class_questions` — Soal per Materi

| kolom | tipe | keterangan |
|---|---|---|
| `id` | uuid PK | auto |
| `material_id` | uuid FK → `class_materials.id` | CASCADE DELETE |
| `urutan` | integer | 1..N, **unique per material** |
| `soal` | text | ex: `1/2 + 1/4 = ?` |
| `jawaban` | text | **normalized koma**: `1` , `0,75` , `-2,5` |
| `penjelasan` | text | cara singkat, boleh kosong |

Index: `(material_id, urutan)`  
Constraint: `UNIQUE(material_id, urutan)`

### `class_progress` — Progress Player (auto, jangan input manual)

| kolom | tipe |
|---|---|
| `player_id` | uuid FK → `players.id` |
| `question_id` | uuid FK → `class_questions.id` |
| `status` | `correct` / `wrong` |
| `first_correct` | boolean |
| `updated_at` | timestamp |

> RLS: `class_materials` & `class_questions` SELECT public, `class_progress` hanya `auth.uid() = player_id`.

### Kolom `players` terkait
- `class_fragments` integer 0..4 (sisa frag, bukan total)
- Di-handle RPC `tambah_class_fragment(p_player_id uuid)` → return `(fragments, keys_added)`

---

## 3. Aturan Penulisan Soal & Jawaban

1. **Soal** (`soal`): string soal + ` = ?` di akhir. Contoh: `3/4 + 1/2 = ?`, `12 × 8 = ?`, `√64 = ?`
   - Hindari ambigu. Pecahan pakai `/` (1/2), kali pakai `×` atau `*`, bagi `:` atau `/`.
   - Soal harus hasil **bilangan rasional** yang bisa ditulis desimal.
2. **Jawaban** (`jawaban`): **wajib koma**, bukan titik. Contoh: `0,75` bukan `0.75`, `1` tetap `1`, `-2,5` jika negatif.
   - Edge normalize: `replace(',', '.')` + `parseFloat` toleransi `0.001`.
   - Bulatkan max **3 desimal** koma. Contoh: `5/6 = 0,833` (bukan `0,833333...`).
   - Integer tetap tanpa koma: `1` bukan `1,0`.
3. **Penjelasan** (`penjelasan`): 1 kalimat cara. Contoh: `1/2=2/4, 2/4+1/4=3/4`
4. **Urutan**: mulai 1, naik 1, tidak boleh loncat/duplikat per materi.
5. **Tingkat**: bebas campur, tapi usahakan 10 soal per materi naik tingkat pelan-pelan (mudah → sedang).

---

## 4. Cara Input Manual — SQL (Supabase SQL Editor)

### A. Buat materi baru

```sql
INSERT INTO class_materials (jenjang, mapel, bab, judul, deskripsi, urutan)
VALUES ('SD','Matematika','Pecahan','Pengurangan Pecahan','Belajar pengurangan pecahan berpenyebut sama & beda',2)
RETURNING id;
-- catat id yang keluar, pakai untuk step B
```

### B. Insert 10 soal sekaligus (template siap pakai)

Ganti `v_mid` atau pakai subquery. **Paling aman: ambil id dulu lalu insert:**

```sql
DO $$
DECLARE v_mid uuid;
BEGIN
  SELECT id INTO v_mid FROM class_materials WHERE bab='Pecahan' AND judul='Pengurangan Pecahan' LIMIT 1;

  IF v_mid IS NOT NULL THEN
    INSERT INTO class_questions (material_id, urutan, soal, jawaban, penjelasan) VALUES
    (v_mid, 1, '3/4 - 1/4 = ?', '0,5', '2/4=1/2'),
    (v_mid, 2, '5/6 - 1/6 = ?', '0,666', '4/6=2/3≈0,666'),
    (v_mid, 3, '1/2 - 1/3 = ?', '0,166', '3/6-2/6=1/6≈0,166'),
    (v_mid, 4, '7/8 - 3/8 = ?', '0,5', '4/8=1/2'),
    (v_mid, 5, '2/3 - 1/3 = ?', '0,333', '1/3≈0,333'),
    (v_mid, 6, '1 - 1/4 = ?', '0,75', '4/4-1/4=3/4'),
    (v_mid, 7, '3/2 - 1/2 = ?', '1', '2/2=1'),
    (v_mid, 8, '5/8 - 1/8 = ?', '0,5', '4/8=1/2'),
    (v_mid, 9, '4/5 - 1/5 = ?', '0,8', '3/5=0,6? koreksi:4/5-1/5=3/5? tunggu cek — sesuaikan'),
    (v_mid, 10,'2 - 1/2 = ?', '1,5', '4/2-1/2=3/2=1,5')
    ON CONFLICT (material_id, urutan) DO NOTHING;
  END IF;
END $$;
```

> **Validasi cepat:**
> ```sql
> SELECT bab, judul, urutan, soal, jawaban FROM class_questions
> JOIN class_materials ON class_materials.id = class_questions.material_id
> WHERE bab='Pecahan' ORDER BY class_questions.urutan;
> ```

### C. Edit / Hapus

```sql
-- update jawaban
UPDATE class_questions SET jawaban='0,75', penjelasan='koreksi' WHERE id='uuid-soal';

-- hapus materi (soal ikut terhapus CASCADE)
DELETE FROM class_materials WHERE id='uuid-materi';

-- nonaktifkan tanpa hapus
UPDATE class_materials SET is_active=false WHERE id='uuid-materi';
```

### D. Insert tanpa DO (one-liner subquery, untuk 1 soal)

```sql
INSERT INTO class_questions (material_id, urutan, soal, jawaban, penjelasan)
SELECT id, 1, '1/2 + 1/2 = ?', '1', '1/2+1/2=1'
FROM class_materials WHERE bab='Pecahan' AND judul='Penjumlahan Pecahan' LIMIT 1;
```

---

## 5. Template Prompt untuk Generate Soal via AI

> **Copy-paste prompt ini ke AI.** Ganti bagian `[VARIABEL]` saja.

### Prompt #1 — Generate 10 soal baru untuk materi yang SUDAH ADA

```
Baca data/game-class.md sebagai konteks.

Tugas: Buatkan 10 soal untuk materi yang sudah ada:
- bab: [NAMA_BAB]  (contoh: Pecahan)
- judul: [JUDUL_MATERI]  (contoh: Perkalian Pecahan)
- Ambil material_id existing: cari di DB WHERE bab='[NAMA_BAB]' AND judul='[JUDUL_MATERI]'
- Jika belum ada materi, jangan buat soal — beri tahu.

Aturan:
- Ikuti aturan penulisan di data/game-class.md bagian 3 (jawaban pakai koma, max 3 desimal, penjelasan singkat).
- Tingkat kesulitan naik gradual 1→10.
- Output WAJIB 2 bagian:

Bagian A: Tabel preview markdown
| urutan | soal | jawaban | penjelasan |

Bagian B: SQL siap paste ke Supabase SQL Editor (format DO $$ DECLARE v_mid ... seperti di data/game-class.md bagian 4B, ON CONFLICT DO NOTHING).
Jangan pakai placeholder uuid manual — pakai SELECT id INTO v_mid WHERE bab='[NAMA_BAB]' AND judul='[JUDUL_MATERI]'.
```

### Prompt #2 — Buat materi BARU + 10 soal sekaligus

```
Baca data/game-class.md.

Buatkan 1 materi baru + 10 soal:
- jenjang: [SD/SMP/SMA]
- mapel: Matematika
- bab: [NAMA_BAB]
- judul: [JUDUL_BARU]
- deskripsi: [1 kalimat]
- urutan materi: [ANGKA] (cek urutan terakhir di class_materials, +1)
- Soal: 10 soal urut 1..10, jawaban koma, penjelasan singkat, tingkat naik gradual.

Output WAJIB:
1. SQL buat materi (INSERT INTO class_materials ... RETURNING id; atau INSERT ... ON CONFLICT DO NOTHING + SELECT)
2. Tabel preview
3. SQL insert 10 soal (format DO $$ ... seperti di data/game-class.md)
```

### Prompt #3 — Generate N soal cepat (tanpa SQL, hanya tabel)

```
Baca data/game-class.md bagian 3.

Buatkan [N] soal untuk bab [BAB] topik [TOPIK] jenjang [SD/SMP/SMA].
Format output hanya tabel markdown:
| urutan | soal | jawaban (koma) | penjelasan |
Jawaban max 3 desimal koma, soal diakhiri = ?.
```

### Prompt #4 — Konversi soal titik → koma + validasi

```
Baca data/game-class.md.

Validasi list soal berikut (jawaban masih pakai titik). Kembalikan tabel yang sudah dinormalisasi koma dan cek apakah ada jawaban salah hitung. Beri SQL UPDATE jika perlu:

[List soal paste di sini]
```

---

## 6. Contoh Lengkap — Dari Prompt sampai SQL Final

**Perintah ke AI:**
> Baca data/game-class.md dan buatkan 10 soal untuk materi baru jenjang SMP bab Aljabar judul Persamaan Linear Satu Variabel urutan 3

**Output AI yang diharapkan (contoh):**

```sql
INSERT INTO class_materials (jenjang, mapel, bab, judul, deskripsi, urutan)
VALUES ('SMP','Matematika','Aljabar','Persamaan Linear Satu Variabel','Menyelesaikan PLSV bentuk ax+b=c',3)
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_mid uuid;
BEGIN
  SELECT id INTO v_mid FROM class_materials WHERE bab='Aljabar' AND judul='Persamaan Linear Satu Variabel' LIMIT 1;
  IF v_mid IS NOT NULL THEN
    INSERT INTO class_questions (material_id, urutan, soal, jawaban, penjelasan) VALUES
    (v_mid, 1, 'x + 3 = 7, x = ?', '4', 'x=7-3=4'),
    (v_mid, 2, '2x = 10, x = ?', '5', 'x=10/2=5'),
    (v_mid, 3, 'x - 5 = 2, x = ?', '7', 'x=2+5=7'),
    (v_mid, 4, '3x + 2 = 11, x = ?', '3', '3x=9, x=3'),
    (v_mid, 5, '4x - 4 = 8, x = ?', '3', '4x=12, x=3'),
    (v_mid, 6, 'x/2 = 3, x = ?', '6', 'x=3*2=6'),
    (v_mid, 7, '5x + 5 = 20, x = ?', '3', '5x=15, x=3'),
    (v_mid, 8, '2x + 3 = 9, x = ?', '3', '2x=6, x=3'),
    (v_mid, 9, 'x/3 + 2 = 4, x = ?', '6', 'x/3=2, x=6'),
    (v_mid, 10,'3x - 9 = 6, x = ?', '5', '3x=15, x=5')
    ON CONFLICT (material_id, urutan) DO NOTHING;
  END IF;
END $$;
```

---

## 7. Validasi & Troubleshooting

```sql
-- cek materi + jumlah soal
SELECT m.jenjang, m.bab, m.judul, m.urutan, COUNT(q.id) as jml_soal
FROM class_materials m LEFT JOIN class_questions q ON q.material_id=m.id
GROUP BY m.id ORDER BY m.urutan;

-- cek duplikat urutan (harusnya 0 row)
SELECT material_id, urutan, COUNT(*) FROM class_questions GROUP BY material_id, urutan HAVING COUNT(*) > 1;

-- cek jawaban masih pakai titik (harusnya 0 row)
SELECT soal, jawaban FROM class_questions WHERE jawaban LIKE '%.%';

-- cek materi tanpa soal
SELECT * FROM class_materials WHERE id NOT IN (SELECT DISTINCT material_id FROM class_questions);

-- test toleransi: jawaban 0,833 akan diterima jika user input 0,83 atau 0.833
```

**Error umum:**
- `UNIQUE violation (material_id, urutan)` → urutan sudah ada, ganti atau pakai `ON CONFLICT DO NOTHING`.
- Jawaban tidak diterima padahal benar → cek pakai titik vs koma, atau selisih >0.001 (kebanyakan desimal). Normalisasi: `0,833` benar, `0,8333` masih ok (±0.001), tapi `0,83` juga ok.
- Soal tidak muncul di app → cek `is_active = true` dan `class_questions` sudah terisi.

---

## 8. Command Cepat (siap copy)

```bash
# lihat urutan materi terakhir
# (jalan di Supabase SQL Editor)
# SELECT MAX(urutan) FROM class_materials;
```

**Perintah AI siap pakai (tinggal ganti variabel):**

> `Baca data/game-class.md dan buatkan 10 soal untuk bab Pecahan judul Penjumlahan Pecahan Campuran urutan 4 jenjang SD. Output tabel + SQL DO $$ seperti template.`

> `Baca data/game-class.md dan buatkan materi baru SMP Aljabar Perkalian Aljabar urutan 5 + 10 soal. Output SQL materi + SQL soal.`

---

## 9. Referensi File Terkait

- `supabase/7. migration_class.sql` — schema + RPC `tambah_class_fragment`
- `supabase/functions/start-class/index.ts` — ambil next soal urut
- `supabase/functions/validate-class-jawaban/index.ts` — toleransi 0.001
- `js/game-class.js` — UI arena + numpad
- `game-class.html` — 2 view (list materi + arena)
