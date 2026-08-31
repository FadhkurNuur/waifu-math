-- ============================================================
-- Decoder — Batch 5 kata baru
-- MUSYAWARAH (6), KURANG (7), BOLEH (8), AI (9), KAKI (10)
-- Lanjutan dari seed 1-5: LAPTOP, KUCING, ANIME, WAIFU, KIPAS
-- Jalankan di Supabase SQL Editor (sekali Run)
-- Ikuti panduan: data/game-decoder.md
-- ============================================================

-- 1. Insert level (kata harus A-Z tanpa spasi, urutan UNIQUE)
INSERT INTO decoder_levels (kata, urutan) VALUES
  ('MUSYAWARAH', 6),
  ('KURANG', 7),
  ('BOLEH', 8),
  ('AI', 9),
  ('KAKI', 10)
ON CONFLICT (urutan) DO NOTHING;

-- 2. Insert soal per posisi (jawaban 1..26 = A1..Z26, soal {"q":"... = ?"})
DO $$
DECLARE
  v_musyawarah uuid;
  v_kurang     uuid;
  v_boleh      uuid;
  v_ai         uuid;
  v_kaki       uuid;
BEGIN
  SELECT id INTO v_musyawarah FROM decoder_levels WHERE urutan = 6 LIMIT 1;
  SELECT id INTO v_kurang     FROM decoder_levels WHERE urutan = 7 LIMIT 1;
  SELECT id INTO v_boleh      FROM decoder_levels WHERE urutan = 8 LIMIT 1;
  SELECT id INTO v_ai         FROM decoder_levels WHERE urutan = 9 LIMIT 1;
  SELECT id INTO v_kaki       FROM decoder_levels WHERE urutan = 10 LIMIT 1;

  -- MUSYAWARAH = M13 U21 S19 Y25 A1 W23 A1 R18 A1 H8 (10 huruf)
  IF v_musyawarah IS NOT NULL THEN
    INSERT INTO decoder_questions (level_id, posisi, soal, jawaban) VALUES
    (v_musyawarah, 0, '{"q":"6 + 7 = ?"}', 13),
    (v_musyawarah, 1, '{"q":"42 / 2 = ?"}', 21),
    (v_musyawarah, 2, '{"q":"38 / 2 = ?"}', 19),
    (v_musyawarah, 3, '{"q":"50 / 2 = ?"}', 25),
    (v_musyawarah, 4, '{"q":"2 - 1 = ?"}', 1),
    (v_musyawarah, 5, '{"q":"46 / 2 = ?"}', 23),
    (v_musyawarah, 6, '{"q":"5 - 4 = ?"}', 1),
    (v_musyawarah, 7, '{"q":"9 * 2 = ?"}', 18),
    (v_musyawarah, 8, '{"q":"10 - 9 = ?"}', 1),
    (v_musyawarah, 9, '{"q":"4 * 2 = ?"}', 8)
    ON CONFLICT (level_id, posisi) DO NOTHING;
  END IF;

  -- KURANG = K11 U21 R18 A1 N14 G7 (6 huruf)
  IF v_kurang IS NOT NULL THEN
    INSERT INTO decoder_questions (level_id, posisi, soal, jawaban) VALUES
    (v_kurang, 0, '{"q":"22 / 2 = ?"}', 11),
    (v_kurang, 1, '{"q":"30 - 9 = ?"}', 21),
    (v_kurang, 2, '{"q":"36 / 2 = ?"}', 18),
    (v_kurang, 3, '{"q":"3 - 2 = ?"}', 1),
    (v_kurang, 4, '{"q":"7 * 2 = ?"}', 14),
    (v_kurang, 5, '{"q":"14 / 2 = ?"}', 7)
    ON CONFLICT (level_id, posisi) DO NOTHING;
  END IF;

  -- BOLEH = B2 O15 L12 E5 H8 (5 huruf)
  IF v_boleh IS NOT NULL THEN
    INSERT INTO decoder_questions (level_id, posisi, soal, jawaban) VALUES
    (v_boleh, 0, '{"q":"1 + 1 = ?"}', 2),
    (v_boleh, 1, '{"q":"30 / 2 = ?"}', 15),
    (v_boleh, 2, '{"q":"6 + 6 = ?"}', 12),
    (v_boleh, 3, '{"q":"10 / 2 = ?"}', 5),
    (v_boleh, 4, '{"q":"16 / 2 = ?"}', 8)
    ON CONFLICT (level_id, posisi) DO NOTHING;
  END IF;

  -- AI = A1 I9 (2 huruf)
  IF v_ai IS NOT NULL THEN
    INSERT INTO decoder_questions (level_id, posisi, soal, jawaban) VALUES
    (v_ai, 0, '{"q":"2 - 1 = ?"}', 1),
    (v_ai, 1, '{"q":"3 * 3 = ?"}', 9)
    ON CONFLICT (level_id, posisi) DO NOTHING;
  END IF;

  -- KAKI = K11 A1 K11 I9 (4 huruf)
  IF v_kaki IS NOT NULL THEN
    INSERT INTO decoder_questions (level_id, posisi, soal, jawaban) VALUES
    (v_kaki, 0, '{"q":"20 - 9 = ?"}', 11),
    (v_kaki, 1, '{"q":"5 - 4 = ?"}', 1),
    (v_kaki, 2, '{"q":"33 / 3 = ?"}', 11),
    (v_kaki, 3, '{"q":"18 / 2 = ?"}', 9)
    ON CONFLICT (level_id, posisi) DO NOTHING;
  END IF;

END $$;

-- ============================================================
-- VALIDASI (jalankan terpisah jika ingin cek)
-- ============================================================
-- -- 1. Cek semua level urut
-- SELECT urutan, kata, length(kata) as len, is_active FROM decoder_levels ORDER BY urutan;
--
-- -- 2. Cek mismatch jawaban vs huruf kata (harusnya 0 row)
-- SELECT dl.urutan, dl.kata, dq.posisi, dq.jawaban, chr(64+dq.jawaban) as huruf_jawaban,
--        substring(dl.kata from dq.posisi+1 for 1) as huruf_kata,
--        dq.soal->>'q' as soal
-- FROM decoder_levels dl
-- JOIN decoder_questions dq ON dq.level_id = dl.id
-- WHERE chr(64+dq.jawaban) <> substring(dl.kata from dq.posisi+1 for 1)
-- ORDER BY dl.urutan, dq.posisi;
--
-- -- 3. Cek panjang soal != panjang kata (harusnya 0 row)
-- SELECT dl.urutan, dl.kata, length(dl.kata) as len_kata, COUNT(dq.id) as jml_soal
-- FROM decoder_levels dl LEFT JOIN decoder_questions dq ON dq.level_id = dl.id
-- GROUP BY dl.id HAVING COUNT(dq.id) <> length(dl.kata);
--
-- -- 4. Preview soal per level baru
-- SELECT dl.urutan, dl.kata, dq.posisi, dq.soal->>'q' as soal, dq.jawaban, chr(64+dq.jawaban) as huruf
-- FROM decoder_levels dl JOIN decoder_questions dq ON dq.level_id = dl.id
-- WHERE dl.urutan IN (6,7,8,9,10)
-- ORDER BY dl.urutan, dq.posisi;
