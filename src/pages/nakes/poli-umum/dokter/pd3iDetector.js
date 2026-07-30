// pd3iDetector.js
// Deteksi otomatis kecurigaan penyakit PD3I / surveilans SKDR
// berdasarkan kata kunci di teks keluhan_utama (dan catatan).
//
// Cara pakai:
//   import { deteksiPD3I } from '../../../utils/pd3iDetector'
//   const hasil = deteksiPD3I(keluhanText)
//   // hasil: [{ nama: 'Suspek Campak', skor: 2 }, ...] terurut skor tertinggi

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
    salahSatu2: ['batuk', 'pilek'], // butuh minimal 2 dari daftar ini
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

function normalisasi(teks) {
  return (teks || '').toLowerCase().trim()
}

/**
 * Deteksi kecurigaan penyakit PD3I dari teks bebas.
 * @param {string} teks - gabungan keluhan_utama + catatan
 * @returns {Array<{nama: string, cocok: string[]}>}
 */
export function deteksiPD3I(teks) {
  const t = normalisasi(teks)
  if (!t) return []

  const hasil = []

  for (const aturan of ATURAN_PD3I) {
    const cocok = []

    // Cek kata wajib (semua harus ada)
    const wajibTerpenuhi = (aturan.wajib || []).every((kw) => {
      const ada = t.includes(kw)
      if (ada) cocok.push(kw)
      return ada
    })
    if ((aturan.wajib || []).length > 0 && !wajibTerpenuhi) continue

    // Cek salahSatu (minimal 1 dari daftar)
    if (aturan.salahSatu) {
      const ditemukan = aturan.salahSatu.filter((kw) => t.includes(kw))
      if (aturan.salahSatu.length > 0 && ditemukan.length === 0) continue
      cocok.push(...ditemukan)
    }

    // Cek salahSatu2 (minimal 2 dari daftar, dipakai saat tidak ada kata "wajib")
    if (aturan.salahSatu2) {
      const ditemukan = aturan.salahSatu2.filter((kw) => t.includes(kw))
      if (ditemukan.length < 2) continue
      cocok.push(...ditemukan)
    }

    if (cocok.length > 0) {
      hasil.push({ nama: aturan.nama, cocok: [...new Set(cocok)] })
    }
  }

  return hasil
}
