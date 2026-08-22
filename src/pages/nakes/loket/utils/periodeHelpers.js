// ────────────────────────────────────────────────────────────────
// Helper untuk menghitung rentang tanggal (awal & akhir) dari
// pilihan periode: hari ini, minggu ini, bulan ini, tahun ini,
// atau rentang custom. Dipakai oleh RiwayatPendaftaran.jsx untuk
// filter query ke kolom kunjungan.tanggal_periksa (format 'YYYY-MM-DD').
// ────────────────────────────────────────────────────────────────

function formatTanggalYMD(date) {
  const tahun = date.getFullYear()
  const bulan = String(date.getMonth() + 1).padStart(2, '0')
  const hari = String(date.getDate()).padStart(2, '0')
  return `${tahun}-${bulan}-${hari}`
}

export const OPSI_PERIODE = [
  { value: 'hari', label: 'Hari Ini' },
  { value: 'minggu', label: 'Minggu Ini' },
  { value: 'bulan', label: 'Bulan Ini' },
  { value: 'tahun', label: 'Tahun Ini' },
  { value: 'custom', label: 'Rentang Tanggal' },
]

// Mengembalikan { mulai, akhir } dalam format 'YYYY-MM-DD' (inklusif),
// dipakai langsung untuk .gte('tanggal_periksa', mulai) dan
// .lte('tanggal_periksa', akhir).
export function hitungRentangPeriode(periode, customMulai, customAkhir) {
  const sekarang = new Date()

  if (periode === 'custom') {
    return {
      mulai: customMulai || formatTanggalYMD(sekarang),
      akhir: customAkhir || formatTanggalYMD(sekarang),
    }
  }

  if (periode === 'minggu') {
    // Senin sebagai awal minggu
    const hariIni = sekarang.getDay() // 0=Minggu, 1=Senin, ...
    const selisihKeSenin = hariIni === 0 ? 6 : hariIni - 1
    const senin = new Date(sekarang)
    senin.setDate(sekarang.getDate() - selisihKeSenin)
    const minggu_akhir = new Date(senin)
    minggu_akhir.setDate(senin.getDate() + 6)
    return { mulai: formatTanggalYMD(senin), akhir: formatTanggalYMD(minggu_akhir) }
  }

  if (periode === 'bulan') {
    const awalBulan = new Date(sekarang.getFullYear(), sekarang.getMonth(), 1)
    const akhirBulan = new Date(sekarang.getFullYear(), sekarang.getMonth() + 1, 0)
    return { mulai: formatTanggalYMD(awalBulan), akhir: formatTanggalYMD(akhirBulan) }
  }

  if (periode === 'tahun') {
    const awalTahun = new Date(sekarang.getFullYear(), 0, 1)
    const akhirTahun = new Date(sekarang.getFullYear(), 11, 31)
    return { mulai: formatTanggalYMD(awalTahun), akhir: formatTanggalYMD(akhirTahun) }
  }

  // default: hari ini
  const hariIniStr = formatTanggalYMD(sekarang)
  return { mulai: hariIniStr, akhir: hariIniStr }
}

// Label ringkas untuk ditampilkan di header laporan/preview
export function labelPeriode(periode, mulai, akhir) {
  const opsi = OPSI_PERIODE.find((o) => o.value === periode)
  if (periode === 'custom') {
    const fmt = (s) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    return `${fmt(mulai)} — ${fmt(akhir)}`
  }
  return opsi?.label || ''
}
