// pd3iDetector.js (v3)
// Deteksi otomatis kecurigaan penyakit PD3I / surveilans SKDR
// berdasarkan kata kunci DAN variasi kata (sinonim/informal) di teks keluhan.
//
// Kamus sinonim & daftar kata negasi disimpan terpisah di kamusGejala.js
// supaya mudah di-maintain tanpa menyentuh logika deteksi di file ini.
// Lihat kamusGejala.js untuk cara menambah kata baru.
//
// PERUBAHAN DARI VERSI ASLI:
// 1. Kata kunci mentah di ATURAN_PD3I sekarang jadi "key" yang merujuk ke
//    KAMUS_SINONIM (di kamusGejala.js). Kata kunci asli tetap ada di kamus
//    sebagai anggota pertama tiap grup, jadi cakupan deteksi lama tidak hilang.
// 2. Deteksi negasi sederhana, dicek DUA ARAH:
//    - sebelum kata kunci -> menangkap pola "tidak demam"
//    - sesudah kata kunci  -> menangkap pola "demam disangkal"
// 3. Logika wajib/salahSatu/salahSatu2 TIDAK diubah — perilaku inti tetap sama.
//
// CATATAN BELUM SELESAI (perlu keputusan Anda, lihat TODO di kamusGejala.js):
// - Aturan "Gigitan Hewan Penular Rabies" pakai salahSatu2 (butuh 2 match).
//   Setelah kamus sinonim aktif, satu kejadian gigitan bisa menghasilkan 2 match
//   sekaligus (mis. "digigit anjing" cocok ke key 'digigit anjing' DAN
//   'gigitan anjing'). Ini mengubah perilaku dibanding versi asli untuk kasus
//   tertentu. Perlu ditinjau apakah aturan ini sebaiknya diubah ke salahSatu.
//
// Cara pakai (sama seperti sebelumnya):
//   import { deteksiPD3I } from '../../../utils/pd3iDetector'
//   const hasil = deteksiPD3I(keluhanText)
//   // hasil: [{ nama: 'Suspek Campak', cocok: [...] }, ...]

import { KAMUS_SINONIM, KATA_NEGASI } from './kamusGejala.js'

function normalisasi(teks) {
  return (teks || '').toLowerCase().trim()
}

/**
 * Cari satu konsep (key kamus) di teks, termasuk semua sinonimnya,
 * lalu kecualikan kecocokan yang berdekatan dengan kata negasi —
 * baik negasi yang muncul SEBELUM maupun SESUDAH kata kunci.
 *
 * Batasan yang jujur perlu diketahui:
 * - Ini deteksi negasi SEDERHANA berbasis jarak karakter (window ~20 karakter
 *   di tiap sisi), bukan analisis gramatikal/NLP penuh. Kalimat yang rumit
 *   atau negasi yang jauh dari kata kunci (misalnya menyeberang lebih dari
 *   satu klausa) bisa saja tidak tertangkap.
 * - Kamus sinonim masih berupa dugaan variasi kata umum dan sebaiknya
 *   divalidasi oleh tenaga medis/petugas surveilans yang paham istilah nyata
 *   yang dipakai di rekam medis Anda.
 */
function cariKonsep(teks, key) {
  const daftarSinonim = KAMUS_SINONIM[key] || [key]
  const ditemukan = []
  const JARAK_CEK = 20 // jumlah karakter yang dicek di tiap sisi kata kunci

  for (const kata of daftarSinonim) {
    let mulaiCari = 0
    let idx
    while ((idx = teks.indexOf(kata, mulaiCari)) !== -1) {
      const konteksSebelum = teks.slice(Math.max(0, idx - JARAK_CEK), idx).trim()
      const konteksSesudah = teks.slice(idx + kata.length, idx + kata.length + JARAK_CEK).trim()

      const dinegasikanSebelum = KATA_NEGASI.some((neg) => konteksSebelum.endsWith(neg))
      const dinegasikanSesudah = KATA_NEGASI.some((neg) => konteksSesudah.startsWith(neg))

      if (!dinegasikanSebelum && !dinegasikanSesudah) {
        ditemukan.push(kata)
        break // cukup satu kecocokan valid per sinonim, lanjut ke sinonim berikutnya
      }
      mulaiCari = idx + kata.length
    }
  }

  return ditemukan
}

// ─────────────────────────────────────────────────────────────
// ATURAN_PD3I — struktur & isi IDENTIK dengan file asli,
// hanya kata kunci mentah yang sekarang jadi "key" ke KAMUS_SINONIM.
// ─────────────────────────────────────────────────────────────
const ATURAN_PD3I = [
  {
    nama: 'Suspek Kolera',
    wajib: ['diare'],
    salahSatu: ['air cucian beras', 'dehidrasi berat', 'muntah hebat'],
  },
  {
    nama: 'Diare Berdarah/Disentri',
    wajib: ['diare'],
    salahSatu: ['darah', 'berdarah', 'berlendir', 'lendir'],
  },
  {
    nama: 'Diare Akut',
    wajib: ['diare'],
    salahSatu: [],
  },
  {
    nama: 'Suspek Dengue',
    wajib: ['demam'],
    salahSatu: ['nyeri sendi', 'nyeri otot', 'bintik merah', 'mimisan', 'gusi berdarah', 'trombosit'],
  },
  {
    nama: 'Suspek Chikungunya',
    wajib: ['demam'],
    salahSatu: ['nyeri sendi hebat', 'sendi bengkak', 'nyeri sendi'],
  },
  {
    nama: 'Malaria Konfirmasi',
    wajib: ['demam'],
    salahSatu: ['menggigil', 'berkeringat', 'malaria'],
  },
  {
    nama: 'Suspek Demam Tifoid',
    wajib: ['demam'],
    salahSatu: ['lidah kotor', 'sakit perut', 'tifoid', 'typhoid', 'demam naik turun', 'demam lebih 7 hari', 'demam seminggu'],
  },
  {
    nama: 'Pnemonia',
    wajib: ['batuk'],
    salahSatu: ['sesak napas', 'sesak nafas', 'napas cepat', 'tarikan dinding dada'],
  },
  {
    nama: 'ISPA',
    wajib: [],
    salahSatu2: ['batuk', 'pilek'],
  },
  {
    nama: 'ILI (Penyakit Serupa Influenza)',
    wajib: ['demam'],
    salahSatu: ['batuk', 'pilek', 'sakit tenggorokan'],
  },
  {
    nama: 'Suspek Flu Burung Pada Manusia',
    wajib: ['demam'],
    salahSatu: ['kontak unggas', 'unggas mati', 'ayam mati', 'flu burung', 'sesak berat'],
  },
  {
    nama: 'Covid-19 Konfirmasi',
    wajib: [],
    salahSatu2: ['demam', 'batuk', 'anosmia', 'hilang penciuman', 'covid', 'hasil tes positif'],
  },
  {
    nama: 'Suspek Campak',
    wajib: ['demam'],
    salahSatu: ['ruam', 'bercak merah', 'campak', 'mata merah', 'konjungtivitis'],
  },
  {
    nama: 'Suspek HFMD',
    wajib: ['demam'],
    salahSatu: ['luka mulut', 'sariawan', 'bintik tangan', 'bintik kaki', 'hfmd', 'flu singapura'],
  },
  {
    nama: 'Kasus Observasi Difteri',
    wajib: [],
    salahSatu2: ['sakit tenggorokan', 'selaput putih', 'pseudomembran', 'sesak', 'suara serak'],
  },
  {
    nama: 'Suspek Pertusis',
    wajib: ['batuk'],
    salahSatu: ['batuk rejan', 'whooping', '2 minggu', 'dua minggu', 'batuk lama', 'batuk berkepanjangan'],
  },
  {
    nama: 'Acute Flacid Paralysis (AFP)',
    wajib: [],
    salahSatu2: ['lumpuh', 'lumpuh layu', 'lemas mendadak', 'tidak bisa berjalan', 'kelemahan anggota gerak'],
  },
  {
    nama: 'Gigitan Hewan Penular Rabies',
    wajib: [],
    salahSatu2: ['gigitan anjing', 'gigitan kucing', 'gigitan kera', 'gigitan monyet', 'digigit anjing', 'digigit kucing', 'digigit kera', 'rabies'],
  },
  {
    nama: 'Suspek Antrax',
    wajib: [],
    salahSatu2: ['luka hitam', 'koreng hitam', 'kontak hewan ternak', 'antraks', 'antrax', 'ternak sakit', 'ternak mati'],
  },
  {
    nama: 'Suspek Leptospirosis',
    wajib: ['demam'],
    salahSatu: ['banjir', 'air kotor', 'tikus', 'leptospirosis', 'nyeri betis'],
  },
  {
    nama: 'Suspek Meningitis/Encephalitis',
    wajib: ['demam'],
    salahSatu: ['kaku kuduk', 'penurunan kesadaran', 'kejang demam', 'sakit kepala hebat', 'meningitis'],
  },
  {
    nama: 'Suspek Tetanus Neonatorum',
    wajib: ['kejang'],
    salahSatu: ['bayi', 'baru lahir', 'neonatus', 'tidak bisa menyusu', 'mulut mencucu'],
  },
  {
    nama: 'Suspek Tetanus',
    wajib: ['kejang'],
    salahSatu: ['kaku rahang', 'mulut terkunci', 'kaku otot', 'luka kotor', 'trismus'],
  },
  {
    nama: 'Sindrom Jaundice Akut',
    wajib: [],
    salahSatu2: ['kuning', 'jaundice', 'mata kuning', 'kulit kuning', 'kencing seperti teh'],
  },
]

/**
 * Deteksi kecurigaan penyakit PD3I dari teks bebas.
 * Signature dan bentuk hasil SAMA PERSIS dengan versi asli — aman untuk
 * menggantikan file lama tanpa mengubah kode pemanggil (DashboardDokter.jsx).
 * @param {string} teks - gabungan keluhan_utama + catatan
 * @returns {Array<{nama: string, cocok: string[]}>}
 */
export function deteksiPD3I(teks) {
  const t = normalisasi(teks)
  if (!t) return []

  const hasil = []

  for (const aturan of ATURAN_PD3I) {
    const cocok = []

    const wajibTerpenuhi = (aturan.wajib || []).every((key) => {
      const ditemukan = cariKonsep(t, key)
      if (ditemukan.length > 0) cocok.push(...ditemukan)
      return ditemukan.length > 0
    })
    if ((aturan.wajib || []).length > 0 && !wajibTerpenuhi) continue

    if (aturan.salahSatu) {
      let adaYangCocok = false
      for (const key of aturan.salahSatu) {
        const ditemukan = cariKonsep(t, key)
        if (ditemukan.length > 0) {
          adaYangCocok = true
          cocok.push(...ditemukan)
        }
      }
      if (aturan.salahSatu.length > 0 && !adaYangCocok) continue
    }

    if (aturan.salahSatu2) {
      let jumlahKeyCocok = 0
      for (const key of aturan.salahSatu2) {
        const ditemukan = cariKonsep(t, key)
        if (ditemukan.length > 0) {
          jumlahKeyCocok++
          cocok.push(...ditemukan)
        }
      }
      if (jumlahKeyCocok < 2) continue
    }

    if (cocok.length > 0) {
      hasil.push({ nama: aturan.nama, cocok: [...new Set(cocok)] })
    }
  }

  return hasil
}