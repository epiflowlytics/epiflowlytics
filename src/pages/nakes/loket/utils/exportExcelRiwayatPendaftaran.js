// ────────────────────────────────────────────────────────────────
// Export laporan Riwayat Pendaftaran ke file .xlsx (SheetJS).
// Berisi 2 sheet: "Daftar Pasien" (data mentah, sama dengan yang
// ditampilkan di tabel & PDF) dan "Rekap" (ringkasan L/P + klaster
// umur), supaya isinya konsisten dengan preview & PDF.
// ────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'
import { kategoriUmur, hitungUmur } from './pasienHelpers'
import { hitungRekap, URUTAN_KLASTER_UMUR } from './rekapRiwayatPendaftaran'
import { labelPeriode } from './periodeHelpers'
import { formatDiagnosa, cekPD3I, cekSKDR } from './diagnosaHelpers'

function formatTanggalIndo(tgl) {
  if (!tgl) return '-'
  return new Date(tgl).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatJamIndo(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export function downloadExcelRiwayatPendaftaran(rows, instansi, periode, tanggalMulai, tanggalAkhir, namaFile) {
  const rekap = hitungRekap(rows)
  const labelPeriodeStr = labelPeriode(periode, tanggalMulai, tanggalAkhir)

  // ── Sheet 1: Daftar Pasien ──
  // Header bertingkat 2 baris:
  //   Baris 1: No | Tanggal | Jam | No.RM | No.NIK | No.BPJS | Nama | [Umur (merge 2 kol)] | Klaster | Alamat | Poli | Kategori | Asal | Diagnosa | Status
  //   Baris 2:                                                          L  |  P
  // Kolom indeks (0-based):
  // 0:No 1:Tgl 2:Jam 3:RM 4:NIK 5:BPJS 6:Nama 7:UmurL 8:UmurP 9:Klaster 10:Alamat 11:Poli 12:Kat 13:Asal 14:Diagnosa 15:Status

  const headerBaris1 = ['No', 'Tanggal', 'Jam', 'No. RM', 'No. NIK', 'No. BPJS', 'Nama Pasien', 'Umur', '', 'Klaster Umur', 'Alamat', 'Poli', 'Kategori', 'Asal', 'Diagnosa', 'Status']
  const headerBaris2 = ['',   '',        '',    '',        '',        '',         '',            'L',    'P', '',             '',       '',     '',         '',     '',          '']

  const alertRowIndexes = [] // indeks baris (0-based) dalam sheet yang perlu ditandai merah

  const dataBaris = rows.map((r, i) => {
    const kategori = kategoriUmur(r.pasien?.tanggal_lahir, r.tanggal_periksa)
    const umurStr  = hitungUmur(r.pasien?.tanggal_lahir, r.tanggal_periksa)
    const jk       = r.pasien?.jenis_kelamin
    const wilayah  = r.pasien?.wilayah === 'dalam' ? 'DW' : r.pasien?.wilayah === 'luar' ? 'LW' : '-'
    if (cekPD3I(r.pemeriksaan) || cekSKDR(r.pemeriksaan)) alertRowIndexes.push(i + 2) // +2 karena 2 baris header di atas data
    return [
      i + 1,
      formatTanggalIndo(r.tanggal_periksa),
      formatJamIndo(r.created_at),
      r.pasien?.no_rekam_medis || '-',
      r.pasien?.no_nik || '-',
      r.pasien?.no_bpjs || '-',
      r.pasien?.nama_lengkap   || '-',
      jk === 'L' ? umurStr : '',
      jk === 'P' ? umurStr : '',
      kategori.label || '-',
      r.pasien?.alamat || '-',
      r.poli?.nama_poli || '-',
      (r.kategori_pasien || '-').toUpperCase(),
      wilayah,
      formatDiagnosa(r.pemeriksaan),
      r.status || '-',
    ]
  })

  const aoa = [headerBaris1, headerBaris2, ...dataBaris]
  const sheetPasien = XLSX.utils.aoa_to_sheet(aoa)

  // Merge cell "Umur" (kolom H baris 1) merentang ke I baris 1
  // XLSX merge pakai indeks 0-based: { s:{r,c}, e:{r,c} }
  sheetPasien['!merges'] = [
    { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } }, // "Umur" → merge H1:I1
  ]

  sheetPasien['!cols'] = [
    { wch: 5  },  // No
    { wch: 20 },  // Tanggal
    { wch: 8  },  // Jam
    { wch: 16 },  // No. RM
    { wch: 18 },  // No. NIK
    { wch: 18 },  // No. BPJS
    { wch: 28 },  // Nama
    { wch: 26 },  // Umur L
    { wch: 26 },  // Umur P
    { wch: 14 },  // Klaster
    { wch: 30 },  // Alamat
    { wch: 20 },  // Poli
    { wch: 10 },  // Kategori
    { wch: 8  },  // Asal
    { wch: 32 },  // Diagnosa
    { wch: 16 },  // Status
  ]

  // Tandai seluruh baris merah (fill merah muda) jika pemeriksaan.adalah_pd3i
  // atau pemeriksaan.adalah_skdr = true.
  // Catatan: fill warna hanya tampil jika workbook dibuka dengan library
  // yang mendukung cell styling (mis. xlsx-js-style). Paket 'xlsx' community
  // standar akan mengabaikan properti style ini saat writeFile.
  if (alertRowIndexes.length > 0) {
    const range = XLSX.utils.decode_range(sheetPasien['!ref'])
    alertRowIndexes.forEach((rowIdx) => {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c })
        if (!sheetPasien[cellRef]) sheetPasien[cellRef] = { t: 's', v: '' }
        sheetPasien[cellRef].s = {
          fill: { patternType: 'solid', fgColor: { rgb: 'FFC7CE' } },
          font: { color: { rgb: '9C0006' } },
        }
      }
    })
  }

  // ── Sheet 2: Rekap ──
  // Blok 1: Ringkasan (2 kolom) — Blok 2: Klaster Umur (4 kolom: L, P, Total)
  const totalPD3I = rows.filter((r) => cekPD3I(r.pemeriksaan)).length
  const totalSKDR = rows.filter((r) => cekSKDR(r.pemeriksaan)).length

  const aoaRingkasan = [
    ['Periode', labelPeriodeStr],
    ['Total Pasien', rekap.total],
    ['Laki-laki', rekap.lakiLaki],
    ['Perempuan', rekap.perempuan],
    ...(rekap.tidakDiketahui > 0 ? [['Tidak Diketahui (JK)', rekap.tidakDiketahui]] : []),
    ['PD3I', totalPD3I],
    ['SKDR Alert', totalSKDR],
    [],
    ['Klaster Umur', 'Laki-laki', 'Perempuan', 'Total'],
    ...URUTAN_KLASTER_UMUR.map((label) => {
      const k = rekap.klaster[label] || { L: 0, P: 0, total: 0 }
      return [label, k.L, k.P, k.total]
    }),
    ...(rekap.klaster['Tidak Diketahui']?.total > 0
      ? [['Tidak Diketahui', rekap.klaster['Tidak Diketahui'].L, rekap.klaster['Tidak Diketahui'].P, rekap.klaster['Tidak Diketahui'].total]]
      : []),
  ]
  const sheetRekap = XLSX.utils.aoa_to_sheet(aoaRingkasan)
  sheetRekap['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 10 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheetRekap, 'Rekap')
  XLSX.utils.book_append_sheet(workbook, sheetPasien, 'Daftar Pasien')

  XLSX.writeFile(workbook, namaFile || 'riwayat-pendaftaran.xlsx', { cellStyles: true })
}
