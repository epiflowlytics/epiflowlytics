// ────────────────────────────────────────────────────────────────
// Generate PDF laporan Retribusi Loket dengan jsPDF + autoTable.
// Susunan: kop instansi → judul & periode → rekap total & per poli
// → tabel daftar transaksi. Dipakai baik untuk preview (blob URL di
// iframe) maupun download langsung, supaya isinya identik.
// ────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { labelPeriode } from './periodeHelpers'

function formatTanggalIndo(tgl) {
  if (!tgl) return '-'
  return new Date(tgl).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function buatPdfLaporanRetribusi(rows, rekapPerPoli, totalBelumDisetor, jumlahBelumDisetor, instansi, periode, tanggalMulai, tanggalAkhir, rekapPerPoliSemua, totalSemua, jumlahSemua) {
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
  doc.text('LAPORAN RETRIBUSI LOKET', lebarHalaman / 2, y, { align: 'center' })
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(`Periode: ${labelPeriodeStr}`, lebarHalaman / 2, y, { align: 'center' })
  y += 7

  // ── Rekap per poli — SEMUA transaksi (disetor + belum) ──
  const adaRekapSemua = Array.isArray(rekapPerPoliSemua)
  if (adaRekapSemua) {
    const tabelRingkasanSemua = [
      ['Total Semua Transaksi', `Rp ${(totalSemua || 0).toLocaleString('id-ID')}`],
      ['Jumlah Transaksi', String(jumlahSemua || 0)],
    ]
    const tabelPerPoliSemua = rekapPerPoliSemua.length > 0
      ? rekapPerPoliSemua.map((r) => [r.namaPoli, String(r.jumlahPasien), `Rp ${r.total.toLocaleString('id-ID')}`])
      : [['-', '-', '-']]

    const lebarKolomRingkasanA = (lebarHalaman - margin * 2 - 8) * 0.32
    const lebarKolomPerPoliA = (lebarHalaman - margin * 2 - 8) * 0.68

    autoTable(doc, {
      startY: y,
      margin: { left: margin },
      tableWidth: lebarKolomRingkasanA,
      head: [['Ringkasan (Semua)', '']],
      body: tabelRingkasanSemua,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: [219, 234, 254], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    })
    const ySemuaRingkasanAkhir = doc.lastAutoTable.finalY

    autoTable(doc, {
      startY: y,
      margin: { left: margin + lebarKolomRingkasanA + 8 },
      tableWidth: lebarKolomPerPoliA,
      head: [['Poli', 'Jumlah Pasien', 'Total (semua transaksi)']],
      body: tabelPerPoliSemua,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: [219, 234, 254], textColor: 20, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right', fontStyle: 'bold' },
      },
    })
    const ySemuaPerPoliAkhir = doc.lastAutoTable.finalY

    y = Math.max(ySemuaRingkasanAkhir, ySemuaPerPoliAkhir) + 6
  }

  // ── Rekap total & per poli — BELUM disetor ──
  const tabelRingkasan = [
    ['Total Belum Disetor', `Rp ${totalBelumDisetor.toLocaleString('id-ID')}`],
    ['Jumlah Transaksi', String(jumlahBelumDisetor)],
  ]

  const tabelPerPoli = rekapPerPoli.length > 0
    ? rekapPerPoli.map((r) => [r.namaPoli, String(r.jumlahPasien), `Rp ${r.total.toLocaleString('id-ID')}`])
    : [['-', '-', '-']]

  const lebarKolomRingkasan = (lebarHalaman - margin * 2 - 8) * 0.32
  const lebarKolomPerPoli = (lebarHalaman - margin * 2 - 8) * 0.68

  autoTable(doc, {
    startY: y,
    margin: { left: margin },
    tableWidth: lebarKolomRingkasan,
    head: [['Ringkasan (Belum Disetor)', '']],
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
    tableWidth: lebarKolomPerPoli,
    head: [['Poli', 'Jumlah Pasien', 'Total (belum disetor)']],
    body: tabelPerPoli,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right', fontStyle: 'bold' },
    },
  })
  const yPerPoliAkhir = doc.lastAutoTable.finalY

  y = Math.max(yRingkasanAkhir, yPerPoliAkhir) + 6

  // ── Tabel daftar transaksi ──
  const headTabelUtama = [['No', 'Tanggal', 'Nama Pasien', 'No. RM', 'Poli', 'Layanan', 'Nominal', 'Status', 'Disetor Pada']]

  const bodyTabelUtama = rows.length > 0
    ? rows.map((r, i) => [
        String(i + 1),
        formatTanggalIndo(r.kunjungan?.tanggal_periksa),
        r.kunjungan?.pasien?.nama_lengkap || '-',
        r.kunjungan?.pasien?.no_rekam_medis || '-',
        r.kunjungan?.poli?.nama_poli || '-',
        r.nama_layanan || '-',
        `Rp ${Number(r.nominal || 0).toLocaleString('id-ID')}`,
        r.disetor ? 'Sudah Disetor' : 'Belum',
        r.disetor_pada ? formatTanggalIndo(r.disetor_pada) : '-',
      ])
    : [['-', '-', 'Tidak ada transaksi retribusi pada periode ini.', '-', '-', '-', '-', '-', '-']]

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: headTabelUtama,
    body: bodyTabelUtama,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },   // No
      1: { cellWidth: 26 },                     // Tanggal
      // 2: Nama — lebar auto
      3: { cellWidth: 20, halign: 'center' },  // No. RM
      4: { cellWidth: 26 },                     // Poli
      5: { cellWidth: 26 },                     // Layanan
      6: { cellWidth: 26, halign: 'right' },   // Nominal
      7: { cellWidth: 24, halign: 'center' },  // Status
      8: { cellWidth: 26, halign: 'center' },  // Disetor Pada
    },
    // Baris "Sudah Disetor" ditandai hijau muda supaya mudah dibedakan dari yang belum.
    didParseCell: (data) => {
      if (data.section === 'body' && rows[data.row.index]?.disetor) {
        data.cell.styles.fillColor = [220, 245, 235]
        data.cell.styles.textColor = [4, 108, 78]
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
export function downloadPdfRetribusi(rows, rekapPerPoli, totalBelumDisetor, jumlahBelumDisetor, instansi, periode, tanggalMulai, tanggalAkhir, namaFile, rekapPerPoliSemua, totalSemua, jumlahSemua) {
  const doc = buatPdfLaporanRetribusi(rows, rekapPerPoli, totalBelumDisetor, jumlahBelumDisetor, instansi, periode, tanggalMulai, tanggalAkhir, rekapPerPoliSemua, totalSemua, jumlahSemua)
  doc.save(namaFile || 'retribusi-loket.pdf')
}
