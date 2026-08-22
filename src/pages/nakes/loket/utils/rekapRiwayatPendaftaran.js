// ────────────────────────────────────────────────────────────────
// Hitung rekap statistik dari daftar kunjungan (hasil query
// RiwayatPendaftaran): total, jumlah laki-laki/perempuan, dan
// pengelompokan 5 klaster umur (Balita/Anak/Remaja/Dewasa/Lansia).
// ────────────────────────────────────────────────────────────────
import { kategoriUmur } from './pasienHelpers'

// Urutan klaster umur ditampilkan tetap 1–5, walau jumlahnya 0.
export const URUTAN_KLASTER_UMUR = ['Balita', 'Anak', 'Remaja', 'Dewasa', 'Lansia']

export function hitungRekap(rows) {
  const rekap = {
    total: rows.length,
    lakiLaki: 0,
    perempuan: 0,
    tidakDiketahui: 0,
    // Tiap klaster sekarang berupa breakdown { L, P, total } bukan angka tunggal,
    // supaya bisa ditampilkan per jenis kelamin di tabel Klaster Umur.
    klaster: {
      Balita: { L: 0, P: 0, total: 0 },
      Anak: { L: 0, P: 0, total: 0 },
      Remaja: { L: 0, P: 0, total: 0 },
      Dewasa: { L: 0, P: 0, total: 0 },
      Lansia: { L: 0, P: 0, total: 0 },
      'Tidak Diketahui': { L: 0, P: 0, total: 0 },
    },
  }

  rows.forEach((r) => {
    const jk = r.pasien?.jenis_kelamin
    if (jk === 'L') rekap.lakiLaki += 1
    else if (jk === 'P') rekap.perempuan += 1
    else rekap.tidakDiketahui += 1

    const kategori = kategoriUmur(r.pasien?.tanggal_lahir)
    const label = kategori.label || 'Tidak Diketahui'
    if (!rekap.klaster[label]) rekap.klaster[label] = { L: 0, P: 0, total: 0 }
    if (jk === 'L') rekap.klaster[label].L += 1
    else if (jk === 'P') rekap.klaster[label].P += 1
    rekap.klaster[label].total += 1
  })

  return rekap
}
