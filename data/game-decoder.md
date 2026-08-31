# Game Decoder — Panduan Input Database + Template Generate Soal

> Mode **Decoder** (`game-decoder.html`) — tebak kata hidden, tiap huruf = 1 soal matematika (jawaban 1–26 → A–Z).
> Suruh AI: `Baca data/game-decoder.md dan buatkan level baru KATA + soal per huruf.`

---

## 1. Ringkasan Mode

- Kata hidden **tanpa spasi, huruf A-Z kapital saja**, contoh `LAPTOP`, `KUCING`.
- Panjang kata = jumlah soal. Posisi `0..N-1`.
- Tiap posisi: 1 soal jsonb `{"q":"12 + 1 = ?"}` , jawaban `1..26` (A=1 ... Z=26).
- Unlock **urutan**: harus selesaikan kata `urutan=1` baru buka `urutan=2` (handle di `get-decoder-next`).
- Progress persist per kotak: `decoder_progress_slots` (answered true/false).
- **Fail global 5/hari**: `players.decoder_wrong_count` + `decoder_wrong_date`. Salah 5x → block sampai besok. Reset via `decoder_reset_daily_if_needed`.
- Reward: tiap kata selesai → `+1 Key Silver`.

Flow edge:
```
get-decoder-next → cari level pertama belum completed (urutan asc)
get-decoder-soal  → ambil soal per posisi (tanpa bocorin jawaban)
validate-decoder-jawaban → hurufToAngka(huruf) === jawaban? → upsert slot, cek completed → reward
```

---

## 2. Struktur Database

### `decoder_levels` — Kata Hidden

| kolom | tipe | keterangan |
|---|---|---|
| `id` | uuid PK | auto |
| `kata` | text | `CHECK (kata ~ '^[A-Z]+$')` — tanpa spasi, upper only |
| `urutan` | smallint UNIQUE | 1,2,3... urutan buka level |
| `is_active` | boolean | default true |
| `reward_silver` | smallint | default 1 |
| `created_at` | timestamp |  |

Index: `urutan WHERE is_active`

### `decoder_questions` — Soal per Posisi

| kolom | tipe | keterangan |
|---|---|---|
| `id` | uuid PK | auto |
| `level_id` | uuid FK → `decoder_levels.id` CASCADE | |
| `posisi` | smallint | `0 .. len(kata)-1` |
| `soal` | jsonb | `{"q":"5 + 7 = ?"}` — bisa tambah `{"q":"...","opsi":...}` nanti |
| `jawaban` | smallint | `1..26`, **wajib = huruf kata di posisi itu** |
| `penjelasan` | text | opsional |

Constraint: `UNIQUE(level_id, posisi)` + `CHECK posisi >=0` + `CHECK jawaban 1..26`

### `decoder_progress_slots` — Persist Reveal

| kolom | tipe |
|---|---|
| `player_id` | uuid FK → players |
| `level_id` | uuid FK → decoder_levels |
| `posisi` | smallint |
| `answered` | boolean |
| `tries` | smallint |
PK: `(player_id, level_id, posisi)`

### Kolom `players` terkait

```sql
decoder_wrong_date  date     -- tanggal fail terakhir
decoder_wrong_count smallint 0..5
decoder_last_level  smallint -- urutan terakhir completed (cache)
```

RPC: `decoder_reset_daily_if_needed(p_player_id uuid)` → return `(wrong_count, wrong_date)`

RLS: `decoder_levels` & `decoder_questions` SELECT true (jawaban terlihat raw — anti-cheat via service_role), `decoder_progress_slots` hanya milik sendiri.

---

## 3. Aturan Penulisan Kata & Soal

1. **Kata**: `A-Z` saja, tanpa spasi/angka/symbol. Max ±12 huruf (UI). Contoh valid: `LAPTOP`, `WAIFU`, `KIPAS`. Invalid: `KATA KUNCI`, `hello`, `A1B`.
2. **Urutan**: mulai 1, unik, tidak boleh loncat. Urutan = urutan buka.
3. **Mapping jawaban**: `A=1, B=2, ... Z=26`. Contoh `LAPTOP` → `L12 A1 P16 T20 O15 P16`.
   - **Wajib cek**: `jawaban` di `decoder_questions` harus sama dengan huruf kata di posisi itu. Validasi:
     ```sql
     SELECT kata, chr(64+jawaban) as huruf_jawaban, posisi FROM decoder_levels JOIN decoder_questions ON level_id=decoder_levels.id ORDER BY urutan, posisi;
     ```
4. **Soal jsonb**: minimal `{"q":"... = ?"}`. Soal harus **single answer integer 1..26**. Jangan buat soal yang jawaban >26 atau <1.
   - Contoh bagus: `5 + 7 = ?` → 12, `3 * 3 = ?` → 9, `46 / 2 = ?` → 23.
   - Hindari: `100 - 50 = ?` → 50 (invalid >26), `1/2 = ?` → 0.5 (non-integer).
5. **Variasi soal**: campur `+ - * /` biar tidak monoton. Pastikan hasil integer 1..26 persis.
6. **Posisi**: 0-index. Kata 6 huruf → posisi 0,1,2,3,4,5.

---

## 4. Cara Input Manual — SQL (Supabase SQL Editor)

### A. Buat level baru (1 kata)

```sql
INSERT INTO decoder_levels (kata, urutan) VALUES ('BELAJAR',6)
ON CONFLICT (urutan) DO NOTHING
RETURNING id, kata, urutan;
-- catat id
```

### B. Insert soal per huruf (template DO — paling aman)

```sql
DO $$
DECLARE v_id uuid;
BEGIN
  -- ambil id level BELAJAR urutan 6
  SELECT id INTO v_id FROM decoder_levels WHERE urutan=6 LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- BELAJAR = B2 E5 L12 A1 J10 A1 R18
    INSERT INTO decoder_questions (level_id, posisi, soal, jawaban) VALUES
    (v_id, 0, '{"q":"1 + 1 = ?"}', 2),
    (v_id, 1, '{"q":"10 / 2 = ?"}', 5),
    (v_id, 2, '{"q":"5 + 7 = ?"}', 12),
    (v_id, 3, '{"q":"2 - 1 = ?"}', 1),
    (v_id, 4, '{"q":"5 * 2 = ?"}', 10),
    (v_id, 5, '{"q":"3 - 2 = ?"}', 1),
    (v_id, 6, '{"q":"36 / 2 = ?"}', 18)
    ON CONFLICT (level_id, posisi) DO NOTHING;
  END IF;
END $$;
```

### C. Insert banyak level sekaligus (contoh seed 3 kata)

```sql
DO $$
DECLARE v1 uuid; v2 uuid; v3 uuid;
BEGIN
  INSERT INTO decoder_levels (kata, urutan) VALUES ('CERDAS',6),('PINTAR',7),('SEKOLAH',8)
  ON CONFLICT (urutan) DO NOTHING;

  SELECT id INTO v1 FROM decoder_levels WHERE urutan=6;
  SELECT id INTO v2 FROM decoder_levels WHERE urutan=7;
  SELECT id INTO v3 FROM decoder_levels WHERE urutan=8;

  IF v1 IS NOT NULL THEN
    -- CERDAS = C3 E5 R18 D4 A1 S19
    INSERT INTO decoder_questions (level_id, posisi, soal, jawaban) VALUES
    (v1, 0, '{"q":"1 + 2 = ?"}', 3),
    (v1, 1, '{"q":"10 / 2 = ?"}', 5),
    (v1, 2, '{"q":"36 / 2 = ?"}', 18),
    (v1, 3, '{"q":"8 / 2 = ?"}', 4),
    (v1, 4, '{"q":"2 - 1 = ?"}', 1),
    (v1, 5, '{"q":"38 / 2 = ?"}', 19)
    ON CONFLICT (level_id, posisi) DO NOTHING;
  END IF;

  IF v2 IS NOT NULL THEN
    -- PINTAR = P16 I9 N14 T20 A1 R18
    INSERT INTO decoder_questions (level_id, posisi, soal, jawaban) VALUES
    (v2, 0, '{"q":"8 * 2 = ?"}', 16),
    (v2, 1, '{"q":"27 / 3 = ?"}', 9),
    (v2, 2, '{"q":"7 * 2 = ?"}', 14),
    (v2, 3, '{"q":"40 / 2 = ?"}', 20),
    (v2, 4, '{"q":"5 - 4 = ?"}', 1),
    (v2, 5, '{"q":"36 / 2 = ?"}', 18)
    ON CONFLICT (level_id, posisi) DO NOTHING;
  END IF;

  -- dst untuk v3
END $$;
```

### D. Edit / Hapus

```sql
-- ganti kata (hati-hati: jawaban harus ikut diganti!)
UPDATE decoder_levels SET kata='BELAJAR' WHERE urutan=6;

-- ganti soal per posisi
UPDATE decoder_questions SET soal='{"q":"6 + 6 = ?"}', jawaban=12
WHERE level_id=(SELECT id FROM decoder_levels WHERE urutan=6) AND posisi=2;

-- nonaktifkan tanpa hapus
UPDATE decoder_levels SET is_active=false WHERE urutan=6;

-- hapus level (soal ikut CASCADE)
DELETE FROM decoder_levels WHERE urutan=6;

-- cek urutan terakhir
SELECT MAX(urutan) FROM decoder_levels;
```

### E. Validasi mapping kata ↔ jawaban (wajib jalan sebelum release)

```sql
-- Harus 0 row. Jika ada row = mismatch jawaban vs huruf kata
SELECT dl.urutan, dl.kata, dq.posisi, dq.jawaban, chr(64+dq.jawaban) as huruf_jawaban,
       substring(dl.kata from dq.posisi+1 for 1) as huruf_kata
FROM decoder_levels dl
JOIN decoder_questions dq ON dq.level_id=dl.id
WHERE chr(64+dq.jawaban) <> substring(dl.kata from dq.posisi+1 for 1)
ORDER BY dl.urutan, dq.posisi;

-- cek ada level yang jumlah soal != panjang kata
SELECT dl.urutan, dl.kata, length(dl.kata) as len_kata, COUNT(dq.id) as jml_soal
FROM decoder_levels dl LEFT JOIN decoder_questions dq ON dq.level_id=dl.id
GROUP BY dl.id HAVING COUNT(dq.id) <> length(dl.kata);

-- cek jawaban di luar 1..26
SELECT * FROM decoder_questions WHERE jawaban <1 OR jawaban >26;

-- cek urutan bolong
SELECT urutan, kata FROM decoder_levels ORDER BY urutan;
```

---

## 5. Template Prompt untuk Generate Soal via AI

### Prompt #1 — Buat 1 level baru + soal per huruf (paling sering)

```
Baca data/game-decoder.md sebagai konteks.

Tugas: Buatkan 1 level baru Decoder.
- kata: [KATA_BARU] (huruf A-Z kapital, tanpa spasi, contoh: SEKOLAH)
- urutan: [N] (cek MAX(urutan) di decoder_levels, +1. Jika tidak tahu, tulis NEXT)
- Soal per huruf: panjang kata = jumlah soal, posisi 0..N-1, tiap soal {"q":"... = ?"} hasil harus = jawaban mapping A1..Z26.

Aturan (ikuti data/game-decoder.md bagian 3):
- Tiap jawaban WAJIB = huruf kata di posisi itu (A=1). Validasi mapping sebelum output.
- Soal harus integer 1..26, variasi +, -, *, /.
- Output WAJIB 3 bagian:

Bagian A: Tabel preview
| posisi | huruf | jawaban | soal (q) |

Bagian B: SQL siap paste (format DO $$ DECLARE v_id ... seperti bagian 4B, ON CONFLICT DO NOTHING)

Bagian C: Validasi mapping (tampilkan kata → deret angka, contoh SEKOLAH → S19 E5 K11 O15 L12 A1 H8)
```

### Prompt #2 — Buatkan N level sekaligus (batch)

```
Baca data/game-decoder.md.

Buatkan [N] level baru Decoder berurutan:
- mulai urutan: [NEXT_URUTAN] (misal 6)
- kata list: [KATA1, KATA2, KATA3] (A-Z, tanpa spasi, panjang 4..8 huruf)
- Tiap kata: buatkan soal {"q":"..."} per posisi mapping A1..Z26.

Output WAJIB:
1. Tabel ringkas | urutan | kata | len | deret jawaban |
2. SQL batch (format DO $$ DECLARE v1 v2 v3 ... seperti bagian 4C, ON CONFLICT DO NOTHING)
3. Hasil validasi mapping (0 mismatch)
```

### Prompt #3 — Generate soal untuk kata existing (tambah/replace)

```
Baca data/game-decoder.md.

Untuk kata existing urutan [N] kata [KATA], buatkan ulang soal per posisi 0..len-1.
- Jawaban tetap mapping huruf kata.
- Soal baru variasi berbeda dari sebelumnya.

Output: tabel posisi-huruf-jawaban-soal + SQL UPDATE per posisi atau DELETE+INSERT.
```

### Prompt #4 — Validasi & perbaikan batch

```
Baca data/game-decoder.md bagian 4E.

Cek list level berikut (paste SQL atau tabel). Kembalikan:
- Daftar mismatch jawaban vs huruf
- Daftar panjang soal != panjang kata
- SQL perbaikan (UPDATE decoder_questions SET ...)

[Paste data]
```

---

## 6. Contoh Lengkap — Prompt → Output

**Perintah ke AI:**
> Baca data/game-decoder.md dan buatkan level baru kata SEKOLAH urutan 6

**Output yang diharapkan:**

Tabel:
| posisi | huruf | jawaban | soal |
|---|---|---|---|
|0|S|19|`{"q":"38 / 2 = ?"}`|
|1|E|5|`{"q":"10 / 2 = ?"}`|
|2|K|11|`{"q":"22 / 2 = ?"}`|
|3|O|15|`{"q":"30 / 2 = ?"}`|
|4|L|12|`{"q":"6 * 2 = ?"}`|
|5|A|1|`{"q":"2 - 1 = ?"}`|
|6|H|8|`{"q":"16 / 2 = ?"}`|

SQL:
```sql
INSERT INTO decoder_levels (kata, urutan) VALUES ('SEKOLAH',6) ON CONFLICT (urutan) DO NOTHING;

DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM decoder_levels WHERE urutan=6 LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO decoder_questions (level_id, posisi, soal, jawaban) VALUES
    (v_id, 0, '{"q":"38 / 2 = ?"}', 19),
    (v_id, 1, '{"q":"10 / 2 = ?"}', 5),
    (v_id, 2, '{"q":"22 / 2 = ?"}', 11),
    (v_id, 3, '{"q":"30 / 2 = ?"}', 15),
    (v_id, 4, '{"q":"6 * 2 = ?"}', 12),
    (v_id, 5, '{"q":"2 - 1 = ?"}', 1),
    (v_id, 6, '{"q":"16 / 2 = ?"}', 8)
    ON CONFLICT (level_id, posisi) DO NOTHING;
  END IF;
END $$;
```

---

## 7. Command Cepat

> `Baca data/game-decoder.md dan buatkan 1 level kata CERDAS urutan NEXT + soal per huruf. Output tabel + SQL DO $$.`

> `Baca data/game-decoder.md dan buatkan 3 level batch: PINTAR, CERDAS, SEKOLAH mulai urutan 6. Output SQL batch.`

Validasi setelah insert:

```sql
SELECT urutan, kata FROM decoder_levels ORDER BY urutan;
SELECT posisi, soal->>'q' as soal, jawaban, chr(64+jawaban) FROM decoder_questions WHERE level_id=(SELECT id FROM decoder_levels WHERE urutan=6) ORDER BY posisi;
```

---

## 8. Referensi File Terkait

- `supabase/8. migration_decoder.sql` — schema + seed 5 kata awal
- `supabase/functions/get-decoder-next/index.ts` — logic unlock urutan
- `supabase/functions/get-decoder-soal/index.ts` — ambil soal per level
- `supabase/functions/validate-decoder-jawaban/index.ts` — hurufToAngka + fail 5/hari
- `js/game-decoder.js` — UI (jika ada)
- `data/game-class.md` — mode Kelas (format mirip tapi jawaban koma)

---

## 9. Seed Awal (5 kata existing)

Untuk referensi, seed bawaan sudah ada (jangan duplikat urutan):

| urutan | kata | mapping |
|---|---|---|
|1|LAPTOP|L12 A1 P16 T20 O15 P16|
|2|KUCING|K11 U21 C3 I9 N14 G7|
|3|ANIME|A1 N14 I9 M13 E5|
|4|WAIFU|W23 A1 I9 F6 U21|
|5|KIPAS|K11 I9 P16 A1 S19|

Level baru mulai **urutan 6**.
