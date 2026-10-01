// ────────────────────────────────────────────────────────────────
// Generator & pencetak HTML Kartu Rekam Medis (ukuran F4).
// Dipisah dari DashboardLoket.jsx. Dipakai juga oleh
// TabelRiwayatPemeriksaan untuk modal "Lihat Format".
// ────────────────────────────────────────────────────────────────

export function buatHtmlKartuRekamMedis(dataPasien, instansi, riwayat, berkasList) {
  const namaInstansi = instansi?.nama || '-'
  const namaPemerintah = instansi?.nama_pemerintah || ''
  const namaDinas = instansi?.nama_dinas || ''
  const alamatInstansi = instansi?.alamat || ''
  const kotaInstansi = instansi?.kota || ''
  const teleponInstansi = instansi?.telepon || ''
  const emailInstansi = instansi?.email || ''
  const logoUrl = instansi?.logo_url || ''

  const alamatLengkap = [alamatInstansi, kotaInstansi].filter(Boolean).join(', ')

  const noRm = dataPasien?.no_rekam_medis || '-'

  const namaPasien = dataPasien?.nama_lengkap || '-'
  const tempatLahir = dataPasien?.tempat_lahir || ''
  const tanggalLahir = dataPasien?.tanggal_lahir
    ? new Date(dataPasien.tanggal_lahir).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    : ''
  const ttl = [tempatLahir, tanggalLahir].filter(Boolean).join(', ') || '-'
  const jenisKelamin = dataPasien?.jenis_kelamin === 'L' ? 'Tn' : dataPasien?.jenis_kelamin === 'P' ? 'Ny' : ''
  const pekerjaan = dataPasien?.pekerjaan || '-'
  const agama = (dataPasien?.agama || '-').toUpperCase()
  const pendidikan = (dataPasien?.pendidikan || '-').toUpperCase()
  const statusPerkawinan = (dataPasien?.status_perkawinan || '-').toUpperCase().replace(/_/g, ' ')
  const namaKk = dataPasien?.nama_kepala_keluarga || dataPasien?.nama_kk || '-'
  const alamatPasien = dataPasien?.alamat || '-'
  const noKtpBpjs = [dataPasien?.no_nik, dataPasien?.no_bpjs].filter(Boolean).join(' / ') || '-'
  const nomorUrutKk = dataPasien?.urutan_kk != null && dataPasien?.urutan_kk !== '' ? String(dataPasien.urutan_kk) : ''

  const daftarBerkas = berkasList || []
  const htmlBerkas = daftarBerkas.length > 0
    ? daftarBerkas.map((b) => {
        if (b.tipe_file === 'foto') {
          // loading="lazy" -> foto baru diminta browser saat halamannya mau
          // discroll ke situ, bukan semua dimuat sekaligus saat kartu dibuka.
          // Saat print, browser otomatis memuat semua sebelum mencetak, jadi
          // hasil cetak tidak terpengaruh — ini murni mempercepat tampilan layar.
          return `
            <div class="halaman-berkas">
              <p class="judul-berkas">Berkas RM Fisik — ${b.nama_file}</p>
              <img src="${b.url}" alt="${b.nama_file}" class="foto-berkas" loading="lazy" />
            </div>`
        }
        // PDF TIDAK di-embed penuh lewat iframe (berat, tiap iframe buka
        // instance PDF viewer sendiri). Cukup tautan "Buka PDF" yang
        // membuka file aslinya di tab baru saat memang dibutuhkan.
        return `
          <div class="halaman-berkas halaman-pdf">
            <p class="judul-berkas">Berkas RM Fisik — ${b.nama_file}</p>
            <a href="${b.url}" target="_blank" rel="noopener noreferrer" class="link-pdf">
              📄 Buka PDF: ${b.nama_file}
            </a>
          </div>`
      }).join('')
    : ''

  const baris = (riwayat && riwayat.length > 0 ? riwayat : [{}])
    .map((r) => {
      const poliTanggal = [
        r.poli?.nama_poli || '',
        r.tanggal_periksa
          ? new Date(r.tanggal_periksa).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : '',
      ].filter(Boolean).join(' / ')
      return `
        <tr>
          <td class="c-poli">${poliTanggal || ''}</td>
          <td class="c-anamnesa">${r.anamnesa || ''}</td>
          <td class="c-diagnosa">${r.diagnosa || ''}</td>
          <td class="c-therapy">${r.therapy_tindakan || ''}</td>
          <td class="c-icd">${r.icd_x || ''}</td>
          <td class="c-paraf">${r.paraf || ''}</td>
        </tr>`
    })
    .join('')

  return `
    <html>
      <head>
        <title>Kartu Rekam Medis - ${namaPasien}</title>
        <style>
          @page { size: 215mm 330mm; margin: 12mm; } /* F4 */
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 0; margin: 0; }
          .kop { text-align: center; border-bottom: 3px double #000; padding-bottom: 6px; margin-bottom: 14px; position: relative; }
          .kop img.logo { position: absolute; left: 0; top: 0; height: 70px; }
          .kop h1 { font-size: 14px; margin: 0; letter-spacing: 0.5px; }
          .kop h2 { font-size: 15px; margin: 2px 0; letter-spacing: 0.5px; }
          .kop h3 { font-size: 17px; margin: 2px 0; font-weight: bold; }
          .kop p { font-size: 10px; margin: 1px 0; }
          .kop a { color: #111; text-decoration: underline; }
          .nomor-kk { text-align: right; margin-bottom: 10px; }
          .nomor-kk span.label { font-size: 11px; margin-right: 6px; }
          .nomor-kk .box { display: inline-block; border: 1px solid #000; padding: 3px 16px; font-size: 12px; }
          .identitas { font-size: 12px; margin-bottom: 12px; }
          .identitas table { width: 100%; border-collapse: collapse; }
          .identitas td { padding: 2px 4px; vertical-align: top; }
          .identitas td.label { width: 150px; white-space: nowrap; }
          .identitas td.titik { width: 12px; }
          .identitas td.isi { border-bottom: 1px dotted #555; }
          /*
            F4 = 215mm x 330mm, margin @page 12mm di semua sisi ->
            area cetak tersedia = 306mm tinggi, 191mm lebar.
            Judul foto (font 12px + margin) makan sedikit ruang di atas.
            Sisanya dipakai sebagai tinggi MAKSIMUM foto, supaya
            1 foto = 1 halaman, TIDAK LEBIH, berapa pun rasio/orientasi
            foto aslinya (potret HP yang tinggi sekalipun). object-fit:
            contain -> foto diperkecil proporsional agar pas, tidak
            dipotong dan tidak gepeng/distorsi.
          */
          .halaman-berkas {
            page-break-before: always;
            page-break-after: always;
            page-break-inside: avoid;
            padding-top: 10px;
            height: 306mm;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .halaman-berkas .judul-berkas {
            font-size: 12px; font-weight: bold; margin-bottom: 8px; text-align: center;
            flex-shrink: 0;
          }
          .halaman-berkas .foto-berkas {
            display: block;
            width: 100%;
            max-width: 100%;
            flex: 1 1 auto;
            min-height: 0;
            object-fit: contain;
            object-position: top center;
          }
          .halaman-pdf { text-align: center; padding-top: 40px; }
          .halaman-pdf .link-pdf {
            display: inline-block; font-size: 13px; color: #0d9488; text-decoration: none;
            border: 1px solid #0d9488; border-radius: 8px; padding: 10px 20px; font-weight: 600;
          }
          .halaman-pdf .link-pdf:hover { background: #f0fdfa; }
          @media print {
            .halaman-pdf .link-pdf { border: 1px solid #000; color: #000; }
          }
          @media print {
            .halaman-berkas {
              page-break-before: always;
              page-break-after: always;
              page-break-inside: avoid;
            }
          }
          table.riwayat { width: 100%; border-collapse: collapse; font-size: 11px; }
          table.riwayat th, table.riwayat td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
          table.riwayat th { background: #f0f0f0; text-align: center; font-weight: bold; }
          .c-poli { width: 12%; white-space: nowrap; }
          .c-anamnesa { width: 26%; }
          .c-diagnosa { width: 18%; }
          .c-therapy { width: 22%; }
          .c-icd { width: 8%; }
          .c-paraf { width: 6%; }
          table.riwayat td { height: 90px; }
          @media print {
            .no-print { display: none; }
          }
          .no-print { text-align: center; margin-top: 16px; }
          .no-print button { padding: 8px 20px; font-size: 13px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="kop">
          ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="Logo" />` : ''}
          ${namaPemerintah ? `<h1>${namaPemerintah}</h1>` : ''}
          ${namaDinas ? `<h2>${namaDinas}</h2>` : ''}
          <h3>${namaInstansi}</h3>
          ${alamatLengkap ? `<p>${alamatLengkap}</p>` : ''}
          ${emailInstansi || teleponInstansi ? `<p>${emailInstansi ? `Email : <a href="mailto:${emailInstansi}">${emailInstansi}</a>` : ''}${emailInstansi && teleponInstansi ? ' &nbsp;|&nbsp; ' : ''}${teleponInstansi ? `Telp: ${teleponInstansi}` : ''}</p>` : ''}
        </div>

        <div class="nomor-kk">
          <span class="label">Nomor Urut KK :</span>
          <span class="box">${nomorUrutKk || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>
        </div>

        <div class="identitas">
          <table>
            <tr>
              <td class="label">No. Rekam Medis</td><td class="titik">:</td>
              <td class="isi">${noRm}</td>
            </tr>
            <tr>
              <td class="label">Nama</td><td class="titik">:</td>
              <td class="isi">${namaPasien} ${jenisKelamin ? `( ${jenisKelamin} )` : ''}</td>
            </tr>
            <tr>
              <td class="label">Tempat / Tanggal Lahir</td><td class="titik">:</td>
              <td class="isi">${ttl}</td>
            </tr>
            <tr>
              <td class="label">Pekerjaan</td><td class="titik">:</td>
              <td class="isi">${pekerjaan}</td>
            </tr>
            <tr>
              <td class="label">Agama</td><td class="titik">:</td>
              <td class="isi">${agama}</td>
            </tr>
            <tr>
              <td class="label">Pendidikan Terakhir</td><td class="titik">:</td>
              <td class="isi">${pendidikan}</td>
            </tr>
            <tr>
              <td class="label">Status Perkawinan</td><td class="titik">:</td>
              <td class="isi">${statusPerkawinan}</td>
            </tr>
            <tr>
              <td class="label">Nama Kepala Keluarga</td><td class="titik">:</td>
              <td class="isi">${namaKk}</td>
            </tr>
            <tr>
              <td class="label">Alamat / Dusun</td><td class="titik">:</td>
              <td class="isi">${alamatPasien}</td>
            </tr>
            <tr>
              <td class="label">No. KTP / Askes / BPJS / KIS</td><td class="titik">:</td>
              <td class="isi">${noKtpBpjs}</td>
            </tr>
          </table>
        </div>

        <table class="riwayat">
          <thead>
            <tr>
              <th>Poli/Tanggal</th>
              <th>Anamnesa dan Pemeriksaan Fisik</th>
              <th>Diagnosa</th>
              <th>Therapy/Tindakan</th>
              <th>ICD X</th>
              <th>Paraf</th>
            </tr>
          </thead>
          <tbody>
            ${baris}
          </tbody>
        </table>

        ${htmlBerkas}

        <div class="no-print">
          <button onclick="window.print()">🖨️ Cetak</button>
        </div>
      </body>
    </html>
  `
}

// Buka Kartu Rekam Medis di tab baru siap-print (tombol "🖨️ Cetak Kartu RM
// (F4)"). Memakai HTML yang sama persis dengan modal "Lihat Format" karena
// keduanya bersumber dari buatHtmlKartuRekamMedis().
export function cetakKartuRekamMedis(dataPasien, instansi, riwayat, berkasList) {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return
  w.document.write(buatHtmlKartuRekamMedis(dataPasien, instansi, riwayat, berkasList))
  w.document.close()
}