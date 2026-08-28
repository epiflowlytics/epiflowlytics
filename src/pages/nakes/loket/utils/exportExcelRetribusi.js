// ────────────────────────────────────────────────────────────────
// Export laporan Retribusi Loket ke file .xlsx (SheetJS).
// Berisi 2 sheet: "Rekap" (ringkasan total + rekap per poli, hanya
// yang belum disetor) dan "Daftar Transaksi" (data mentah, sama
// dengan yang ditampilkan di tabel modal), supaya isinya konsisten
// dengan yang dilihat petugas di layar.
// ────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'
import { labelPeriode } from './periodeHelpers'

function formatTanggalIndo(tgl) {
  if (!tgl) return '-'
  return new Date(tgl).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function downloadExcelRetribusi(rows, rekapPerPoli, totalBelumDisetor, jumlahBelumDisetor, instansi, periode, tanggalMulai, tanggalAkhir, namaFile, rekapPerPoliSemua, totalSemua, jumlahSemua) {
  const labelPeriodeStr = labelPeriode(periode, tanggalMulai, tanggalAkhir)
  const punyaRekapSemua = Array.isArray(rekapPerPoliSemua)

  // ── Sheet 1: Rekap ──
  const aoaRekap = [
    ['Instansi', instansi?.nama || '-'],
    ['Periode', labelPeriodeStr],
    [],
    ...(punyaRekapSemua
      ? [
          ['Total Semua Transaksi', totalSemua || 0],
          ['Jumlah Semua Transaksi', jumlahSemua || 0],
          [],
          ['Rekap per Poli (semua transaksi)'],
          ['Poli', 'Jumlah Pasien', 'Total'],
          ...rekapPerPoliSemua.map((r) => [r.namaPoli, r.jumlahPasien, r.total]),
          [],
        ]
      : []),
    ['Total Belum Disetor', totalBelumDisetor],
    ['Jumlah Transaksi Belum Disetor', jumlahBelumDisetor],
    [],
    ['Rekap per Poli (belum disetor)'],
    ['Poli', 'Jumlah Pasien', 'Total'],
    ...rekapPerPoli.map((r) => [r.namaPoli, r.jumlahPasien, r.total]),
  ]
  const sheetRekap = XLSX.utils.aoa_to_sheet(aoaRekap)
  sheetRekap['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 16 }]

  // ── Sheet 2: Daftar Transaksi ──
  const headerTransaksi = ['No', 'Tanggal', 'Nama Pasien', 'No. RM', 'Poli', 'Layanan', 'Nominal', 'Status', 'Disetor Pada']

  const dataTransaksi = rows.map((r, i) => [
    i + 1,
    formatTanggalIndo(r.kunjungan?.tanggal_periksa),
    r.kunjungan?.pasien?.nama_lengkap || '-',
    r.kunjungan?.pasien?.no_rekam_medis || '-',
    r.kunjungan?.poli?.nama_poli || '-',
    r.nama_layanan || '-',
    Number(r.nominal || 0),
    r.disetor ? 'Sudah Disetor' : 'Belum',
    r.disetor_pada ? formatTanggalIndo(r.disetor_pada) : '-',
  ])

  const sheetTransaksi = XLSX.utils.aoa_to_sheet([headerTransaksi, ...dataTransaksi])
  sheetTransaksi['!cols'] = [
    { wch: 5 },   // No
    { wch: 20 },  // Tanggal
    { wch: 28 },  // Nama
    { wch: 16 },  // No. RM
    { wch: 20 },  // Poli
    { wch: 22 },  // Layanan
    { wch: 14 },  // Nominal
    { wch: 16 },  // Status
    { wch: 20 },  // Disetor Pada
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheetRekap, 'Rekap')
  XLSX.utils.book_append_sheet(workbook, sheetTransaksi, 'Daftar Transaksi')

  XLSX.writeFile(workbook, namaFile || 'retribusi-loket.xlsx')
}
