// ────────────────────────────────────────────────────────────────
// Generate PDF laporan Riwayat Pendaftaran dengan jsPDF + autoTable.
// Susunan datanya (kop, rekap, tabel) dibuat mengikuti persis
// susunan yang ditampilkan di preview
// (htmlLaporanRiwayatPendaftaran.js) supaya isi PDF identik dengan
// yang dilihat user di modal preview sebelum download.
// ────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
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

// Mengembalikan instance jsPDF yang sudah jadi (siap .save() atau
// dikonversi ke blob URL untuk ditampilkan di <iframe> sebagai preview).
export function buatPdfLaporanRiwayatPendaftaran(rows, instansi, periode, tanggalMulai, tanggalAkhir) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const lebarHalaman = doc.internal.pageSize.getWidth()
  const margin = 12

  const namaInstansi = instansi?.nama || '-'
  const namaPemerintah = instansi?.nama_pemerintah || ''
  const namaDinas = instansi?.nama_dinas || ''
  const alamatInstansi = instansi?.alamat || ''
  const kotaInstansi = instansi?.kota || ''
  const teleponInstansi = instansi?.telepon || ''
  const alamatLengkap = [alamatInstansi, kotaInstansi].filter(Boolean).join(', ')

  let y = margin

  // ── Kop instansi ──
  doc.setFont('helvetica', 'bold')
  if (namaPemerintah) {
    doc.setFontSize(10)
    doc.text(namaPemerintah, lebarHalaman / 2, y, { align: 'center' })
    y += 4.5
  }
  if (namaDinas) {
    doc.setFontSize(10.5)
    doc.text(namaDinas, lebarHalaman / 2, y, { align: 'center' })
    y += 5
  }
  doc.setFontSize(13)
  doc.text(namaInstansi, lebarHalaman / 2, y, { align: 'center' })
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  if (alamatLengkap) {
    const teksAlamat = alamatLengkap + (teleponInstansi ? ` — Telp: ${teleponInstansi}` : '')
    doc.text(teksAlamat, lebarHalaman / 2, y, { align: 'center' })
    y += 4
  }

  y += 2
  doc.setLineWidth(0.6)
  doc.line(margin, y, lebarHalaman - margin, y)
  doc.setLineWidth(0.2)
  y += 1.2
  doc.line(margin, y, lebarHalaman - margin, y)
  y += 6

  // ── Judul laporan ──
  const labelPeriodeStr = labelPeriode(periode, tanggalMulai, tanggalAkhir)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('LAPORAN RIWAYAT PENDAFTARAN PASIEN', lebarHalaman / 2, y, { align: 'center' })
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(`Periode: ${labelPeriodeStr}`, lebarHalaman / 2, y, { align: 'center' })
  y += 7

  // ── Rekap ──
  const rekap = hitungRekap(rows)

  const tabelRingkasan = [
    ['Total Pasien', String(rekap.total)],
    ['Laki-laki', String(rekap.lakiLaki)],
    ['Perempuan', String(rekap.perempuan)],
  ]
  if (rekap.tidakDiketahui > 0) tabelRingkasan.push(['Tidak Diketahui', String(rekap.tidakDiketahui)])

  const totalPD3I = rows.filter((r) => cekPD3I(r.pemeriksaan)).length
  const totalSKDR = rows.filter((r) => cekSKDR(r.pemeriksaan)).length
  tabelRingkasan.push(['PD3I', String(totalPD3I)])
  tabelRingkasan.push(['SKDR Alert', String(totalSKDR)])

  const tabelKlaster = URUTAN_KLASTER_UMUR.map((label) => {
    const k = rekap.klaster[label] || { L: 0, P: 0, total: 0 }
    return [label, String(k.L), String(k.P), String(k.total)]
  })
  if (rekap.klaster['Tidak Diketahui']?.total > 0) {
    const k = rekap.klaster['Tidak Diketahui']
    tabelKlaster.push(['Tidak Diketahui', String(k.L), String(k.P), String(k.total)])
  }

  const lebarKolomRingkasan = (lebarHalaman - margin * 2 - 8) * 0.32
  const lebarKolomKlaster = (lebarHalaman - margin * 2 - 8) * 0.68

  autoTable(doc, {
    startY: y,
    margin: { left: margin },
    tableWidth: lebarKolomRingkasan,
    head: [['Ringkasan', '']],
    body: tabelRingkasan,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  })
  const yRingkasanAkhir = doc.lastAutoTable.finalY

  autoTable(doc, {
    startY: y,
    margin: { left: margin + lebarKolomRingkasan + 8 },
    tableWidth: lebarKolomKlaster,
    head: [['Klaster Umur', 'L', 'P', 'Total']],
    body: tabelKlaster,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
  })
  const yKlasterAkhir = doc.lastAutoTable.finalY

  y = Math.max(yRingkasanAkhir, yKlasterAkhir) + 6

  // ── Tabel utama daftar pasien ──
  // Header bertingkat: baris-1 "Umur" merentang 2 kolom (L & P),
  // baris-2 memecah jadi "L" dan "P".
  // jsPDF-autoTable mendukung head multi-baris via array of arrays.
  // Kolom: 0:No 1:Tgl 2:Jam 3:NoRM 4:NIK 5:BPJS 6:Nama 7:UmurL 8:UmurP
  //        9:Klaster 10:Alamat 11:Poli 12:Kategori 13:Asal 14:Diagnosa 15:Status
  const headTabelUtama = [
    [
      { content: 'No',          rowSpan: 2 },
      { content: 'Tanggal',     rowSpan: 2 },
      { content: 'Jam',         rowSpan: 2 },
      { content: 'No. RM',      rowSpan: 2 },
      { content: 'No. NIK',     rowSpan: 2 },
      { content: 'No. BPJS',    rowSpan: 2 },
      { content: 'Nama Pasien', rowSpan: 2 },
      { content: 'Umur',        colSpan: 2, styles: { halign: 'center' } },
      { content: 'Klaster Umur',rowSpan: 2 },
      { content: 'Alamat',      rowSpan: 2 },
      { content: 'Poli',        rowSpan: 2 },
      { content: 'Kategori',    rowSpan: 2 },
      { content: 'Asal',        rowSpan: 2 },
      { content: 'Diagnosa',    rowSpan: 2 },
      { content: 'Status',      rowSpan: 2 },
    ],
    ['L', 'P'],
  ]

  // Simpan indeks baris (0-based, relatif terhadap body) yang perlu
  // ditandai merah karena pemeriksaan.adalah_pd3i = true atau adalah_skdr = true.
  const alertRowIndexes = []

  const bodyTabelUtama = rows.length > 0
    ? rows.map((r, i) => {
        const kategori = kategoriUmur(r.pasien?.tanggal_lahir, r.tanggal_periksa)
        const umurStr = hitungUmur(r.pasien?.tanggal_lahir, r.tanggal_periksa)
        const jk = r.pasien?.jenis_kelamin
        const wilayah = r.pasien?.wilayah === 'dalam' ? 'DW' : r.pasien?.wilayah === 'luar' ? 'LW' : '-'
        if (cekPD3I(r.pemeriksaan) || cekSKDR(r.pemeriksaan)) alertRowIndexes.push(i)
        return [
          String(i + 1),
          formatTanggalIndo(r.tanggal_periksa),
          formatJamIndo(r.created_at),
          r.pasien?.no_rekam_medis || '-',
          r.pasien?.no_nik || '-',
          r.pasien?.no_bpjs || '-',
          r.pasien?.nama_lengkap || '-',
          jk === 'L' ? umurStr : '',   // kolom Umur-L
          jk === 'P' ? umurStr : '',   // kolom Umur-P
          kategori.label || '-',
          r.pasien?.alamat || '-',
          r.poli?.nama_poli || '-',
          (r.kategori_pasien || '-').toUpperCase(),
          wilayah,
          formatDiagnosa(r.pemeriksaan),
          r.status || '-',
        ]
      })
    : [['-', '-', '-', '-', '-', '-', 'Tidak ada data pendaftaran pada periode ini.', '', '', '-', '-', '-', '-', '-', '-', '-']]

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: headTabelUtama,
    body: bodyTabelUtama,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: { fillColor: [20, 130, 120], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0:  { cellWidth: 7,  halign: 'center' },  // No
      1:  { cellWidth: 20 },                     // Tanggal
      2:  { cellWidth: 11, halign: 'center' },   // Jam
      3:  { cellWidth: 16, halign: 'center' },   // No. RM
      4:  { cellWidth: 20, halign: 'center' },   // No. NIK
      5:  { cellWidth: 18, halign: 'center' },   // No. BPJS
      // 6: Nama — lebar auto
      7:  { halign: 'center' },                  // Umur L
      8:  { halign: 'center' },                  // Umur P
      9:  { halign: 'center' },                  // Klaster Umur
      // 10: Alamat — lebar auto
      12: { cellWidth: 13, halign: 'center' },   // Kategori
      13: { cellWidth: 11, halign: 'center' },   // Asal
      // 14: Diagnosa — lebar auto
      15: { cellWidth: 16, halign: 'center' },   // Status
    },
    // Tandai baris merah jika kunjungan ini PD3I atau SKDR
    didParseCell: (data) => {
      if (data.section === 'body' && alertRowIndexes.includes(data.row.index)) {
        data.cell.styles.fillColor = [253, 226, 226]
        data.cell.styles.textColor = [153, 27, 27]
      }
    },
  })

  // ── Footer waktu cetak ──
  const totalHalaman = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalHalaman; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(
      `Dicetak pada ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })} — Hal. ${p}/${totalHalaman}`,
      lebarHalaman - margin,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'right' }
    )
  }

  return doc
}

// Unduh langsung sebagai file .pdf
export function downloadPdfRiwayatPendaftaran(rows, instansi, periode, tanggalMulai, tanggalAkhir, namaFile) {
  const doc = buatPdfLaporanRiwayatPendaftaran(rows, instansi, periode, tanggalMulai, tanggalAkhir)
  doc.save(namaFile || 'riwayat-pendaftaran.pdf')
}
