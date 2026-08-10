import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import AntrianDisplay from './AntrianDisplay'
import CekAntrian from './CekAntrian'
import DatePickerLahir from './DatePickerLahir'

/* ────────────────────────────────────────────────────────────────
   CATATAN SKEMA DATABASE YANG DIBUTUHKAN (silakan sesuaikan)
   - Tabel `kunjungan` sebaiknya punya kolom baru:
       status_prioritas  text  (nullable) -> '', 'lansia', 'ibu_hamil', 'disabilitas', 'gawat_darurat'
   - Tabel `profiles` diasumsikan punya kolom `nama_lengkap` untuk
     ditampilkan di "Monitoring Loket". Sesuaikan nama kolom bila beda.
   - Disarankan menambah index di tabel `pasien` pada kolom:
       no_nik, no_rekam_medis, no_bpjs, nama_lengkap (untuk pencarian cepat)
   ──────────────────────────────────────────────────────────────── */

// Hitung umur dari tanggal lahir (format teks)
function hitungUmur(tanggalLahir) {
  if (!tanggalLahir) return ''
  const lahir = new Date(tanggalLahir)
  const sekarang = new Date()

  let tahun = sekarang.getFullYear() - lahir.getFullYear()
  let bulan = sekarang.getMonth() - lahir.getMonth()
  let hari = sekarang.getDate() - lahir.getDate()

  if (hari < 0) {
    bulan--
    const hariDibulanLalu = new Date(sekarang.getFullYear(), sekarang.getMonth(), 0).getDate()
    hari += hariDibulanLalu
  }
  if (bulan < 0) {
    tahun--
    bulan += 12
  }

  return `${tahun} Tahun ${bulan} Bulan ${hari} Hari`
}

// Hitung umur dalam tahun (angka) untuk kategorisasi
function hitungUmurTahun(tanggalLahir) {
  if (!tanggalLahir) return null
  const lahir = new Date(tanggalLahir)
  const sekarang = new Date()
  let tahun = sekarang.getFullYear() - lahir.getFullYear()
  const belumUlangTahun =
    sekarang.getMonth() < lahir.getMonth() ||
    (sekarang.getMonth() === lahir.getMonth() && sekarang.getDate() < lahir.getDate())
  if (belumUlangTahun) tahun--
  return tahun
}

// FITUR 9: Kategori umur otomatis
function kategoriUmur(tanggalLahir) {
  const umur = hitungUmurTahun(tanggalLahir)
  if (umur === null) return { label: '', warna: '' }
  if (umur < 5) return { label: 'Balita', warna: 'bg-pink-100 text-pink-700' }
  if (umur < 12) return { label: 'Anak', warna: 'bg-yellow-100 text-yellow-700' }
  if (umur < 18) return { label: 'Remaja', warna: 'bg-green-100 text-green-700' }
  if (umur < 60) return { label: 'Dewasa', warna: 'bg-blue-100 text-blue-700' }
  return { label: 'Lansia', warna: 'bg-orange-100 text-orange-700' }
}

// FITUR 6: Validasi NIK otomatis
function validasiNik(nik) {
  if (!nik) return { status: 'kosong', pesan: '' }
  if (!/^\d+$/.test(nik)) return { status: 'invalid', pesan: 'NIK hanya boleh berisi angka' }
  if (nik.length !== 16) return { status: 'invalid', pesan: `NIK harus 16 digit (saat ini ${nik.length} digit)` }
  return { status: 'valid', pesan: 'NIK valid' }
}

// Generate nomor rekam medis otomatis
function generateNoRM() {
  const now = new Date()
  const thn = now.getFullYear().toString().slice(-2)
  const bln = String(now.getMonth() + 1).padStart(2, '0')
  const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0')
  return `RM${thn}${bln}${random}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// Link resmi PCare BPJS Kesehatan untuk cek keaktifan peserta.
// Nakes/petugas login sendiri pakai akun PCare masing-masing di sana.
const PCARE_URL = 'https://pcarejkn.bpjs-kesehatan.go.id/eclaim/Login'

// Link e-Puskesmas (Infokes) khusus instansi Kabupaten Gowa.
// e-Puskesmas berbasis subdomain per kabupaten/kota (tidak ada portal
// login umum lintas daerah), jadi diarahkan langsung ke subdomain Gowa.
const EPUSKESMAS_URL = 'https://gowa.epuskesmas.id/'

const FORM_AWAL = {
  kategori_pasien: '',
  no_rekam_medis: '',
  mode_rm: 'otomatis',
  tanggal_periksa: todayStr(),
  nama_lengkap: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  alamat: '',
  no_nik: '',
  no_bpjs: '',
  no_kk: '', // Nomor Kartu Keluarga — dipakai untuk menyatukan No. RM satu keluarga
  urutan_kk: '', // Urutan anggota keluarga (1,2,3,...) — beda dari no_kk
  rak_id: '', // Rak Rekam Medis — lokasi fisik penyimpanan berkas RM
  wilayah: '',
  poli_id: '',
  petugas_poli_id: '', // dokter/PJ ruangan yang bertugas di poli tujuan, dipilih saat pendaftaran
  status_prioritas: '', // FITUR 8
  pasien_id_existing: null, // dipakai saat memilih pasien lama
}

const FORM_PASIEN_RAK_AWAL = {
  no_rekam_medis: '',
  mode_rm: 'otomatis',
  rm_terkunci: false, // true = No. RM dikunci karena "Tambah Anggota" ke grup RM yang sudah ada
  urutan_kk: '',
  no_kk: '',
  status_keluarga: '',
  status_keluarga_lainnya: '',
  no_nik: '',
  no_bpjs: '',
  alamat: '',
  nama_lengkap: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  pekerjaan: '',
}

const OPSI_STATUS_KELUARGA = [
  { value: '', label: 'Pilih Status' },
  { value: 'kepala_keluarga', label: 'Kepala Keluarga' },
  { value: 'ayah', label: 'Ayah' },
  { value: 'ibu', label: 'Ibu' },
  { value: 'anak', label: 'Anak' },
  { value: 'cucu', label: 'Cucu' },
  { value: 'menantu', label: 'Menantu' },
  { value: 'famili_lain', label: 'Famili Lain' },
  { value: 'lainnya', label: 'Lainnya...' },
]

// Untuk status 'lainnya', label yang ditampilkan adalah teks manual yang diketik petugas
// (disimpan terpisah di kolom status_keluarga_lainnya).
function labelStatusKeluarga(value, teksLainnya) {
  if (value === 'lainnya') return teksLainnya || 'Lainnya'
  return OPSI_STATUS_KELUARGA.find((o) => o.value === value)?.label || ''
}

const OPSI_PRIORITAS = [
  { value: '', label: 'Tidak Ada', icon: '⬜' },
  { value: 'lansia', label: 'Lansia', icon: '🧓' },
  { value: 'ibu_hamil', label: 'Ibu Hamil', icon: '🤰' },
  { value: 'disabilitas', label: 'Disabilitas', icon: '♿' },
  { value: 'gawat_darurat', label: 'Gawat Darurat', icon: '🚨' },
]

// ─── KOMPONEN MANDIRI: Tabel Riwayat Pemeriksaan ala Kartu Rekam Medis ──
// Dipakai di form pendaftaran & popup konfirmasi pasien lama. Loket hanya
// MELIHAT (read-only) — kolom klinis (Anamnesa, Diagnosa, Therapy/Tindakan,
// ICD X, Paraf) diisi oleh akun perawat/dokter di masing-masing poli, bukan
// oleh loket. Sel yang belum diisi ditampilkan strip (-). Semua riwayat
// ditampilkan, tidak dibatasi jumlah (tidak ada limit 10).
// Generator HTML Kartu Rekam Medis fisik ukuran F4, dengan kop resmi instansi
// dan seluruh baris riwayat pemeriksaan pasien dalam satu tabel. Fungsi ini
// HANYA mengembalikan string HTML (tidak membuka window apa pun), supaya
// bisa dipakai ulang persis sama oleh:
//   - cetakKartuRekamMedis()  -> ditulis ke tab baru (window.open) untuk print
//   - modal "Lihat Format"    -> dirender di dalam <iframe srcDoc=...> di layar
// Dengan begini, "Cetak" dan "Lihat" dijamin menampilkan HTML yang sama
// persis, hanya beda wadah (tab baru vs iframe dalam modal).
function buatHtmlKartuRekamMedis(dataPasien, instansi, riwayat, berkasList) {
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
  const namaKk = dataPasien?.nama_kepala_keluarga || dataPasien?.nama_kk || '-'
  const alamatPasien = dataPasien?.alamat || '-'
  const noKtpBpjs = [dataPasien?.no_nik, dataPasien?.no_bpjs].filter(Boolean).join(' / ') || '-'
  const nomorUrutKk = dataPasien?.urutan_kk != null && dataPasien?.urutan_kk !== '' ? String(dataPasien.urutan_kk) : ''

  const daftarBerkas = berkasList || []
  const htmlBerkas = daftarBerkas.length > 0
    ? daftarBerkas.map((b) => {
        if (b.tipe_file === 'foto') {
          return `
            <div class="halaman-berkas">
              <p class="judul-berkas">Berkas RM Fisik — ${b.nama_file}</p>
              <img src="${b.url}" alt="${b.nama_file}" class="foto-berkas" />
            </div>`
        }
        return `
          <div class="halaman-berkas">
            <p class="judul-berkas">Berkas RM Fisik — ${b.nama_file}</p>
            <iframe src="${b.url}" class="pdf-berkas"></iframe>
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
          .halaman-berkas { page-break-before: always; padding-top: 10px; }
          .halaman-berkas .judul-berkas { font-size: 12px; font-weight: bold; margin-bottom: 8px; text-align: center; }
          .halaman-berkas .foto-berkas { display: block; width: 100%; max-width: 100%; height: auto; }
          .halaman-berkas .pdf-berkas { display: block; width: 100%; height: 950px; border: 1px solid #999; }
          @media print {
            .halaman-berkas { page-break-before: always; }
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
function cetakKartuRekamMedis(dataPasien, instansi, riwayat, berkasList) {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return
  w.document.write(buatHtmlKartuRekamMedis(dataPasien, instansi, riwayat, berkasList))
  w.document.close()
}

function TabelRiwayatPemeriksaan({ riwayat, loading, dataPasien, instansi, profile }) {
  // Panel "Lihat riwayat pemeriksaan" terbuka/tertutup DI DALAM kolom/card
  // ini juga (bukan modal/popup terpisah), supaya petugas tetap bisa lihat
  // riwayat sambil mengisi form pemeriksaan di sebelahnya. Isinya kartu
  // rekam medis PENUH, sama persis dengan hasil Cetak (F4).
  const [panelLihatTerbuka, setPanelLihatTerbuka] = useState(false)

  // Berkas RM fisik (foto/scan/PDF) yang diupload untuk pasien ini.
  const [berkasList, setBerkasList] = useState([])
  const [berkasLoading, setBerkasLoading] = useState(false)
  const [uploadingBerkas, setUploadingBerkas] = useState(false)
  const [errorBerkas, setErrorBerkas] = useState('')
  const inputFotoRef = useRef(null)
  const inputPdfRef = useRef(null)

  const pasienId = dataPasien?.id

  async function muatBerkasRm(idPasien) {
    if (!idPasien) { setBerkasList([]); return }
    setBerkasLoading(true)
    const { data, error } = await supabase
      .from('berkas_rm')
      .select('id, nama_file, tipe_file, path_storage, dibuat_pada')
      .eq('pasien_id', idPasien)
      .order('dibuat_pada', { ascending: false })
    if (error) {
      setBerkasLoading(false)
      return
    }
    // Buat signed URL (bucket privat) untuk tiap berkas supaya bisa ditampilkan/diunduh.
    const denganUrl = await Promise.all(
      (data || []).map(async (b) => {
        const { data: signed } = await supabase
          .storage
          .from('berkas-rm')
          .createSignedUrl(b.path_storage, 60 * 60) // berlaku 1 jam
        return { ...b, url: signed?.signedUrl || null }
      })
    )
    setBerkasList(denganUrl)
    setBerkasLoading(false)
  }

  useEffect(() => {
    muatBerkasRm(pasienId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasienId])

  async function handleUploadBerkas(fileList, tipe) {
    if (!fileList || fileList.length === 0 || !pasienId || !instansi?.id) return
    setErrorBerkas('')
    setUploadingBerkas(true)
    try {
      for (const file of Array.from(fileList)) {
        const ekstensi = file.name.split('.').pop()
        const namaAcak = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ekstensi}`
        const path = `${instansi.id}/${pasienId}/${namaAcak}`

        const { error: uploadError } = await supabase
          .storage
          .from('berkas-rm')
          .upload(path, file, { contentType: file.type, upsert: false })
        if (uploadError) throw uploadError

        const { error: insertError } = await supabase
          .from('berkas_rm')
          .insert({
            pasien_id: pasienId,
            instansi_id: instansi.id,
            nama_file: file.name,
            tipe_file: tipe,
            path_storage: path,
            ukuran_bytes: file.size,
            diupload_oleh: profile?.id || null,
          })
        if (insertError) throw insertError
      }
      await muatBerkasRm(pasienId)
      setPanelLihatTerbuka(true)
    } catch (err) {
      setErrorBerkas(err?.message || 'Gagal upload berkas. Coba lagi.')
    } finally {
      setUploadingBerkas(false)
      if (inputFotoRef.current) inputFotoRef.current.value = ''
      if (inputPdfRef.current) inputPdfRef.current.value = ''
    }
  }

  async function handleHapusBerkas(berkas) {
    if (!window.confirm(`Hapus berkas "${berkas.nama_file}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setErrorBerkas('')
    const { error: storageError } = await supabase.storage.from('berkas-rm').remove([berkas.path_storage])
    if (storageError) { setErrorBerkas(storageError.message); return }
    const { error: dbError } = await supabase.from('berkas_rm').delete().eq('id', berkas.id)
    if (dbError) { setErrorBerkas(dbError.message); return }
    setBerkasList((prev) => prev.filter((b) => b.id !== berkas.id))
  }

  return (
    <div className="mb-4 bg-white border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500">Riwayat Pemeriksaan Sebelumnya</p>
      </div>

      {/* Tombol upload berkas RM fisik — hasil foto/scan kertas RM asli.
          Galerinya SENGAJA tidak ditampilkan di sini; berkas akan tampil
          menyatu di dalam Kartu Rekam Medis (area merge di bawah identitas),
          sama persis baik di pratinjau "Lihat" maupun hasil Cetak (F4). */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap border rounded-xl p-3 bg-gray-50">
        <p className="text-[11px] font-semibold text-gray-500">📁 Berkas RM Fisik (Foto/Scan)</p>
        <div className="flex gap-1.5 items-center">
          <input
            ref={inputFotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleUploadBerkas(e.target.files, 'foto')}
          />
          <input
            ref={inputPdfRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleUploadBerkas(e.target.files, 'pdf')}
          />
          <button
            type="button"
            disabled={!pasienId || uploadingBerkas}
            onClick={() => inputFotoRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            📷 Foto
          </button>
          <button
            type="button"
            disabled={!pasienId || uploadingBerkas}
            onClick={() => inputPdfRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            📄 PDF
          </button>
        </div>
        {uploadingBerkas && (
          <p className="text-[11px] text-blue-600 w-full">Mengunggah berkas...</p>
        )}
        {errorBerkas && (
          <p className="text-[11px] text-red-600 w-full">{errorBerkas}</p>
        )}
        {!pasienId && (
          <p className="text-[11px] text-gray-400 w-full">Simpan/pilih data pasien dulu sebelum upload berkas.</p>
        )}
        {pasienId && berkasList.length > 0 && (
          <div className="w-full flex flex-wrap gap-1.5">
            {berkasList.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1 text-[10px] bg-white border rounded-full pl-2 pr-1 py-0.5">
                {b.tipe_file === 'foto' ? '📷' : '📄'} {b.nama_file.length > 16 ? b.nama_file.slice(0, 16) + '…' : b.nama_file}
                <button
                  type="button"
                  onClick={() => handleHapusBerkas(b)}
                  title="Hapus berkas"
                  className="w-3.5 h-3.5 rounded-full text-red-500 hover:bg-red-50 leading-none"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <p className="text-xs text-gray-400 text-center py-3">Memuat riwayat...</p>
      )}

      {!loading && riwayat.length === 0 && (
        <div className="text-center py-3">
          <p className="text-xs text-gray-400 mb-2">Belum ada riwayat pemeriksaan.</p>
          <button
            type="button"
            onClick={() => setPanelLihatTerbuka((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-[11px] font-semibold"
          >
            {panelLihatTerbuka ? '🔽 Tutup riwayat pemeriksaan' : '👁️ Lihat riwayat pemeriksaan'}
          </button>
        </div>
      )}

      {!loading && riwayat.length > 0 && (
        <div className="overflow-x-auto overflow-y-auto max-h-80 border rounded-xl">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 whitespace-nowrap">
                  Poli/Tanggal
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 min-w-[160px]">
                  Anamnesa dan Pemeriksaan Fisik
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 min-w-[120px]">
                  Diagnosa
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 min-w-[130px]">
                  Therapy/Tindakan
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 whitespace-nowrap">
                  ICD X
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 whitespace-nowrap">
                  Paraf
                </th>
                <th className="text-center align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 whitespace-nowrap">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-2 border border-gray-200 align-top whitespace-nowrap">
                    <span className="font-medium text-gray-700">{r.poli?.nama_poli || 'Poli tidak diketahui'}</span>
                    <span className="text-gray-400"> · {r.tanggal_periksa}</span>
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700">
                    {r.anamnesa || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700">
                    {r.diagnosa || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700">
                    {r.therapy_tindakan || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700 whitespace-nowrap">
                    {r.icd_x || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700 whitespace-nowrap">
                    {r.paraf || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setPanelLihatTerbuka(true)}
                      className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-[11px] font-semibold"
                    >
                      👁️ Lihat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Panel "Lihat riwayat pemeriksaan" — TETAP DI DALAM kolom/card ini
          (bukan modal/popup yang menutupi layar), supaya petugas bisa cek
          riwayat sambil tetap mengisi form pemeriksaan di sebelahnya.
          Kontennya HTML kartu yang sama persis dengan hasil Cetak (F4),
          dirender lewat <iframe srcDoc>. Tingginya dibatasi (max-h) dan
          bisa discroll ke bawah kalau riwayatnya panjang. */}
      {panelLihatTerbuka && (
        <div className="mt-3 border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
            <p className="text-xs font-semibold text-gray-600">
              Kartu Rekam Medis — {dataPasien?.nama_lengkap || '-'}
            </p>
            <button
              type="button"
              onClick={() => setPanelLihatTerbuka(false)}
              className="text-gray-400 hover:text-gray-600 text-sm leading-none shrink-0"
            >
              ✕
            </button>
          </div>

          <iframe
            title="Pratinjau Kartu Rekam Medis"
            srcDoc={buatHtmlKartuRekamMedis(dataPasien, instansi, riwayat, berkasList)}
            className="w-full h-96 bg-gray-100"
          />

          <div className="px-3 py-2 border-t bg-gray-50">
            <button
              type="button"
              onClick={() => cetakKartuRekamMedis(dataPasien, instansi, riwayat, berkasList)}
              className="w-full py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold"
            >
              🖨️ Cetak Kartu RM (F4)
            </button>
          </div>
        </div>
      )}
    </div>

  )
}

export default function DashboardLoket() {
  const [step, setStep] = useState('kategori')
  const [form, setForm] = useState(FORM_AWAL)
  const [polis, setPolis] = useState([])
  const [petugasPoliList, setPetugasPoliList] = useState([]) // nakes aktif (dokter/PJ ruangan), dipakai untuk dipilih sebagai penanggung jawab pasien di poli tujuan
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState(false)
  const [profile, setProfile] = useState(null)
  const [tiketAntrian, setTiketAntrian] = useState(null) // { nomor, namaPoli }

  // FITUR 2, 3, 5, 10: data dashboard
  const [stats, setStats] = useState({ total: 0, bpjs: 0, umum: 0, menunggu: 0, selesai: 0 })
  const [antrianPoli, setAntrianPoli] = useState([])
  const [riwayat, setRiwayat] = useState([])
  const [monitoringLoket, setMonitoringLoket] = useState([])

  // FITUR 1: pencarian pasien lama
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [pasienTerpilih, setPasienTerpilih] = useState(null)
  const [riwayatPasien, setRiwayatPasien] = useState([]) // riwayat pemeriksaan pasien yang sedang dipilih
  const [riwayatPasienLoading, setRiwayatPasienLoading] = useState(false)

  // No. KK: satukan No. RM untuk satu keluarga
  const [anggotaKeluarga, setAnggotaKeluarga] = useState([]) // anggota lain dg no_kk yang sama
  const [ceknKk, setCekKk] = useState(false)
  const [cekNikLoading, setCekNikLoading] = useState(false)
  const [nikDitemukan, setNikDitemukan] = useState(false) // true kalau NIK cocok dg pasien lama & form terisi otomatis
  const [kkChecked, setKkChecked] = useState(false) // sudah dicek utk no_kk saat ini

  // Rak Rekam Medis — dikelola bebas oleh petugas loket
  const [rakList, setRakList] = useState([])
  const [showKelolaRak, setShowKelolaRak] = useState(false)
  const [rakForm, setRakForm] = useState({ id: null, kode_rak: '', nama_rak: '' })
  const [rakLoading, setRakLoading] = useState(false)
  const [rakError, setRakError] = useState('')

  // Tambah Pasien langsung dari dalam rak (bukan lewat alur antrian/poli)
  const [pasienRakBaru, setPasienRakBaru] = useState(null) // isi = kalau lagi buka halaman tambah pasien untuk rak tertentu
  const [editPasienRakId, setEditPasienRakId] = useState(null) // isi = id pasien yang sedang diedit (null = mode tambah baru)
  const [formPasienRak, setFormPasienRak] = useState(FORM_PASIEN_RAK_AWAL)
  const [pasienRakLoading, setPasienRakLoading] = useState(false)
  const [pasienRakError, setPasienRakError] = useState('')
  const [anggotaKkRak, setAnggotaKkRak] = useState([]) // hasil cek No.KK di form tambah pasien rak
  const [cekKkRakLoading, setCekKkRakLoading] = useState(false)
  // Popup validasi field wajib: { pesan, fokusKe } — fokusKe dijalankan
  // setelah tombol OK di popup diklik, supaya kursor langsung ke field yang dimaksud.
  const [popupValidasiPasienRak, setPopupValidasiPasienRak] = useState(null)

  const formRef = useRef(null)
  const searchInputRef = useRef(null)

  // Ref untuk field wajib di form Tambah Pasien (rak) — dipakai untuk
  // auto-focus ke field yang belum diisi saat tombol Simpan diklik.
  const refPasienRakNama = useRef(null)
  const refPasienRakNoRm = useRef(null)
  const refPasienRakNik = useRef(null)
  const refPasienRakTanggalLahir = useRef(null)
  const refPasienRakJenisKelamin = useRef(null)

  useEffect(() => {
    fetchProfile()

    // Jika dibuka lewat tab baru dengan ?view=antrian, langsung tampilkan layar antrian
    const params = new URLSearchParams(window.location.search)
    if (params.get('view') === 'antrian') {
      setStep('antrian')
    }
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('*, instansi:instansi_id(id, nama, jenis, kota, alamat, telepon, logo_url, nama_pemerintah, nama_dinas, email)')
      .eq('id', user.id)
      .single()

    setProfile(data)
    if (data?.instansi_id) {
      fetchPolis(data.instansi_id)
      fetchPetugasPoli(data.instansi_id)
      fetchDashboardData(data.instansi_id)
      fetchRakList(data.instansi_id)
    }
  }

  // Rak Rekam Medis: daftar rak milik instansi ini
  async function fetchRakList(instansiId) {
    const { data, error } = await supabase
      .from('rak_rm')
      .select('id, kode_rak, nama_rak, nomor_urut_terakhir, pasien(count)')
      .eq('instansi_id', instansiId)
      .order('kode_rak', { ascending: true })

    if (error) {
      console.error('Error fetch rak_rm:', error.message)
      return
    }
    // Supabase mengembalikan pasien(count) sebagai array [{ count: n }] — ratakan jadi jumlah_pasien.
    const dataDenganJumlah = (data || []).map((r) => ({
      ...r,
      jumlah_pasien: Array.isArray(r.pasien) ? (r.pasien[0]?.count ?? 0) : 0,
    }))
    setRakList(dataDenganJumlah)
  }

  // Tambah / edit rak — bebas dikelola petugas loket sendiri
  async function simpanRak(e) {
    e.preventDefault()
    if (!rakForm.kode_rak.trim()) {
      setRakError('Kode rak wajib diisi.')
      return
    }
    setRakLoading(true)
    setRakError('')
    try {
      if (rakForm.id) {
        const { error } = await supabase
          .from('rak_rm')
          .update({
            kode_rak: rakForm.kode_rak.trim(),
            nama_rak: rakForm.nama_rak.trim() || null,
          })
          .eq('id', rakForm.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('rak_rm')
          .insert({
            instansi_id: profile.instansi_id,
            kode_rak: rakForm.kode_rak.trim(),
            nama_rak: rakForm.nama_rak.trim() || null,
          })
        if (error) throw new Error(error.message)
      }
      setRakForm({ id: null, kode_rak: '', nama_rak: '' })
      fetchRakList(profile.instansi_id)
    } catch (err) {
      setRakError(err.message)
    } finally {
      setRakLoading(false)
    }
  }

  function editRak(rak) {
    setRakForm({ id: rak.id, kode_rak: rak.kode_rak, nama_rak: rak.nama_rak || '' })
    setRakError('')
  }

  async function hapusRak(rakId) {
    if (!window.confirm('Hapus rak ini? Pasien yang sudah memakai rak ini tidak akan terhapus, hanya kode raknya.')) return
    const { error } = await supabase.from('rak_rm').delete().eq('id', rakId)
    if (error) {
      setRakError(error.message)
      return
    }
    fetchRakList(profile.instansi_id)
  }

  // Buka halaman "Tambah Pasien" untuk rak tertentu.
  // Kalau pasienEdit diisi, form dibuka dalam mode edit (data pasien
  // tersebut dimuat ke form, bukan form kosong).
  async function bukaTambahPasienRak(rak, pasienEdit) {
    setPasienRakBaru(rak)
    if (pasienEdit) {
      setEditPasienRakId(pasienEdit.id)
      setFormPasienRak({
        no_kk: pasienEdit.no_kk || '',
        urutan_kk: pasienEdit.urutan_kk != null ? String(pasienEdit.urutan_kk) : '',
        status_keluarga: pasienEdit.status_keluarga || '',
        status_keluarga_lainnya: pasienEdit.status_keluarga_lainnya || '',
        nama_lengkap: pasienEdit.nama_lengkap || '',
        no_rekam_medis: pasienEdit.no_rekam_medis || '',
        mode_rm: 'manual',
        no_nik: pasienEdit.no_nik || '',
        no_bpjs: pasienEdit.no_bpjs || '',
        alamat: pasienEdit.alamat || '',
        tempat_lahir: pasienEdit.tempat_lahir || '',
        tanggal_lahir: pasienEdit.tanggal_lahir || '',
        pekerjaan: pasienEdit.pekerjaan || '',
        jenis_kelamin: pasienEdit.jenis_kelamin || '',
      })
      setAnggotaKkRak([])
      setPasienRakError('')
      setPopupValidasiPasienRak(null)
      return
    }
    setEditPasienRakId(null)
    // No. RM otomatis mengikuti kode rak + nomor urut berikutnya di rak itu.
    // Sinkron dulu ke data asli di tabel pasien supaya nomornya pasti lanjut
    // dari yang tertinggi, tidak lompat ke nomor kecil kalau counter basi.
    setFormPasienRak({ ...FORM_PASIEN_RAK_AWAL, no_rekam_medis: '...' })
    setAnggotaKkRak([])
    setPasienRakError('')
    setPopupValidasiPasienRak(null)
    await sinkronkanNomorUrutRak(rak.id)
    const noRmBaru = await generateNoRmDariRak(rak.id)
    setFormPasienRak((prev) => ({ ...prev, no_rekam_medis: noRmBaru || '' }))
  }

  // Buka form dalam mode edit untuk pasien yang sudah ada.
  function bukaEditPasienRak(rak, pasien) {
    bukaTambahPasienRak(rak, pasien)
  }

  // FITUR TAMBAH ANGGOTA: buka form "Tambah Pasien" KOSONG, tapi No. Rekam
  // Medis sudah otomatis terisi dan TERKUNCI = sama dengan pasien grup yang
  // diklik, supaya anggota baru ini gabung ke grup No. RM yang sama.
  // Nomor Urut KK sengaja dikosongkan — diisi manual oleh petugas.
  function bukaTambahAnggotaGrupRak(rak, pasienGrup) {
    setPasienRakBaru(rak)
    setEditPasienRakId(null) // ini tambah pasien BARU, bukan edit pasien yang sudah ada
    setFormPasienRak({
      ...FORM_PASIEN_RAK_AWAL,
      no_rekam_medis: pasienGrup?.no_rekam_medis || '',
      mode_rm: 'manual',
      rm_terkunci: true,
    })
    setAnggotaKkRak([])
    setPasienRakError('')
    setPopupValidasiPasienRak(null)
  }

  function tutupTambahPasienRak() {
    setPasienRakBaru(null)
    setEditPasienRakId(null)
    setFormPasienRak(FORM_PASIEN_RAK_AWAL)
    setAnggotaKkRak([])
    setPopupValidasiPasienRak(null)
    setPasienRakError('')
  }

  // Hapus pasien dari rak (hapus permanen dari database).
  async function hapusPasienRak(pasienId) {
    if (!window.confirm('Hapus data pasien ini? Tindakan ini tidak bisa dibatalkan.')) return

    // Cek dulu apakah pasien ini punya riwayat kunjungan. Kalau ada, tabel
    // `kunjungan` masih menunjuk ke pasien ini lewat kolom pasien_id, jadi
    // pasien tidak bisa langsung dihapus (foreign key constraint
    // kunjungan_pasien_id_fkey). Minta konfirmasi tambahan sebelum ikut
    // menghapus riwayat kunjungannya juga.
    const { count, error: errorCek } = await supabase
      .from('kunjungan')
      .select('id', { count: 'exact', head: true })
      .eq('pasien_id', pasienId)

    if (errorCek) {
      window.alert('Gagal mengecek riwayat kunjungan: ' + errorCek.message)
      return null
    }

    if (count && count > 0) {
      const lanjut = window.confirm(
        `Pasien ini punya ${count} riwayat kunjungan. Riwayat kunjungan tersebut akan ikut ` +
          `terhapus permanen bersama data pasiennya. Lanjutkan?`
      )
      if (!lanjut) return null

      const { error: errorHapusKunjungan } = await supabase
        .from('kunjungan')
        .delete()
        .eq('pasien_id', pasienId)
      if (errorHapusKunjungan) {
        window.alert('Gagal menghapus riwayat kunjungan: ' + errorHapusKunjungan.message)
        return null
      }
    }

    const { error } = await supabase.from('pasien').delete().eq('id', pasienId)
    if (error) {
      window.alert('Gagal menghapus: ' + error.message)
      return null
    }
    return true
  }

  // Pisahkan satu pasien dari grup No. RM keluarganya ke No. RM BARU miliknya
  // sendiri (mis. anak yang sudah menikah dan harus punya rekam medis sendiri).
  // PENTING: ini hanya mengganti no_rekam_medis (dan rak_id kalau pindah rak)
  // pada BARIS PASIEN YANG SAMA (id/pasien_id tidak berubah) — sehingga seluruh
  // riwayat pemeriksaan (tabel kunjungan, yang terhubung lewat pasien_id) OTOMATIS
  // ikut pindah ke No. RM baru tanpa perlu dipindah manual satu-satu.
  async function pisahkanKeRmBaru(pasien, rakTujuanId) {
    if (!rakTujuanId) {
      window.alert('Pilih rak tujuan dulu.')
      return null
    }
    await sinkronkanNomorUrutRak(rakTujuanId)
    const noRmBaru = await generateNoRmDariRak(rakTujuanId)
    if (!noRmBaru) {
      window.alert('Gagal membuat No. RM baru. Coba lagi.')
      return null
    }
    const { error } = await supabase
      .from('pasien')
      .update({
        no_rekam_medis: noRmBaru,
        rak_id: rakTujuanId,
        // Pasien ini sekarang berdiri sendiri (KK sendiri), bukan lagi bagian
        // dari grup lama -> urutan_kk & status_keluarga dikosongkan supaya tidak
        // bingung, No. KK sengaja DIBIARKAN apa adanya (petugas bisa edit manual
        // lewat tombol EDIT kalau memang sudah punya No. KK baru).
        urutan_kk: null,
        status_keluarga: null,
        status_keluarga_lainnya: null,
      })
      .eq('id', pasien.id)
    if (error) {
      window.alert('Gagal memisahkan ke RM baru: ' + error.message)
      return null
    }
    return noRmBaru
  }

  // Cek No. KK di form tambah pasien rak — kalau KK sudah ada anggota
  // terdaftar, No. RM otomatis disamakan (konsisten dengan form pendaftaran utama).
  async function cekNoKkRak(noKk) {
    if (!noKk.trim() || !profile?.instansi_id) {
      setAnggotaKkRak([])
      return
    }
    setCekKkRakLoading(true)
    const { data, error } = await supabase
      .from('pasien')
      .select('id, nama_lengkap, no_rekam_medis, urutan_kk, status_keluarga, status_keluarga_lainnya, no_nik, no_bpjs, alamat, tempat_lahir, tanggal_lahir, pekerjaan, jenis_kelamin, rak_id')
      .eq('instansi_id', profile.instansi_id)
      .eq('no_kk', noKk.trim())
      .order('urutan_kk', { ascending: true })
    setCekKkRakLoading(false)

    if (error) {
      console.error('Error cek No. KK (rak):', error.message)
      setAnggotaKkRak([])
      return
    }

    setAnggotaKkRak(data || [])

    if (data && data.length > 0 && data[0].no_rekam_medis) {
      setFormPasienRak((prev) => ({
        ...prev,
        no_rekam_medis: data[0].no_rekam_medis,
        mode_rm: 'manual', // kunci supaya tidak ke-generate ulang otomatis
      }))
    }
  }

  function handleChangeFormPasienRak(e) {
    const { name, value } = e.target
    if (name === 'mode_rm' && value === 'otomatis') {
      // No. RM otomatis harus mengikuti kode rak yang sedang dibuka, bukan acak.
      setFormPasienRak((prev) => ({ ...prev, mode_rm: 'otomatis', no_rekam_medis: '...' }))
      if (pasienRakBaru?.id) {
        sinkronkanNomorUrutRak(pasienRakBaru.id).then(() => {
          generateNoRmDariRak(pasienRakBaru.id).then((noRmBaru) => {
            setFormPasienRak((prev) => ({ ...prev, no_rekam_medis: noRmBaru || '' }))
          })
        })
      }
      return
    }
    setFormPasienRak((prev) => {
      const updated = { ...prev, [name]: value }
      // No. KK dan NIK hanya boleh berisi angka
      if (name === 'no_kk' || name === 'no_nik') {
        updated[name] = value.replace(/\D/g, '')
      }
      return updated
    })
  }

  // Simpan pasien baru langsung ke rak yang sedang dibuka.
  // Ini murni entri data pasien (tanpa membuat kunjungan/antrian poli).
  // Kalau ada field wajib yang belum diisi, tampilkan popup konfirmasi —
  // kursor baru diarahkan (fokus) ke field yang dimaksud setelah tombol OK diklik.
  function fokusKe(ref) {
    ref.current?.focus()
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function simpanPasienRak(e) {
    e.preventDefault()
    setPasienRakError('')

    if (!formPasienRak.nama_lengkap.trim()) {
      setPopupValidasiPasienRak({
        pesan: 'Nama pasien wajib diisi.',
        fokusKe: () => fokusKe(refPasienRakNama),
      })
      return
    }
    if (!formPasienRak.no_rekam_medis.trim()) {
      setPopupValidasiPasienRak({
        pesan: 'Nomor rekam medis wajib diisi.',
        fokusKe: () => fokusKe(refPasienRakNoRm),
      })
      return
    }
    if (!formPasienRak.no_nik.trim()) {
      setPopupValidasiPasienRak({
        pesan: 'Nomor KTP (NIK) wajib diisi.',
        fokusKe: () => fokusKe(refPasienRakNik),
      })
      return
    }
    if (validasiNik(formPasienRak.no_nik).status === 'invalid') {
      setPopupValidasiPasienRak({
        pesan: validasiNik(formPasienRak.no_nik).pesan,
        fokusKe: () => fokusKe(refPasienRakNik),
      })
      return
    }
    if (!formPasienRak.tanggal_lahir) {
      setPopupValidasiPasienRak({
        pesan: 'Tanggal lahir wajib diisi.',
        fokusKe: () => fokusKe(refPasienRakTanggalLahir),
      })
      return
    }
    if (!formPasienRak.jenis_kelamin) {
      setPopupValidasiPasienRak({
        pesan: 'Jenis kelamin wajib dipilih.',
        fokusKe: () => fokusKe(refPasienRakJenisKelamin),
      })
      return
    }

    setPasienRakLoading(true)
    try {
      // Mode edit: update langsung berdasarkan id pasien yang sedang diedit,
      // tidak perlu cek No. RM duplikat karena barisnya sudah pasti ada.
      if (editPasienRakId) {
        const payloadEdit = {
          no_rekam_medis: formPasienRak.no_rekam_medis.trim(),
          nama_lengkap: formPasienRak.nama_lengkap.trim(),
          alamat: formPasienRak.alamat.trim() || null,
          no_nik: formPasienRak.no_nik.trim(),
          no_bpjs: formPasienRak.no_bpjs.trim() || null,
          no_kk: formPasienRak.no_kk.trim() || null,
          urutan_kk: formPasienRak.urutan_kk ? Number(formPasienRak.urutan_kk) : null,
          status_keluarga: formPasienRak.status_keluarga || null,
          status_keluarga_lainnya:
            formPasienRak.status_keluarga === 'lainnya'
              ? formPasienRak.status_keluarga_lainnya.trim() || null
              : null,
          tempat_lahir: formPasienRak.tempat_lahir.trim() || null,
          tanggal_lahir: formPasienRak.tanggal_lahir,
          jenis_kelamin: formPasienRak.jenis_kelamin || null,
          pekerjaan: formPasienRak.pekerjaan.trim() || null,
        }
        const { error: updateErr } = await supabase
          .from('pasien')
          .update(payloadEdit)
          .eq('id', editPasienRakId)
        if (updateErr) throw new Error(updateErr.message)

        tutupTambahPasienRak()
        return
      }

      // Cek apakah No. RM ini sudah dipakai pasien lain. No. RM BOLEH dipakai
      // ulang HANYA kalau memang satu No. KK yang sama (anggota keluarga yang
      // sama) — kalau No. KK beda (atau salah satunya kosong), ini dianggap
      // tabrakan No. RM dan harus ditolak supaya tidak menimpa data pasien lain.
      const { data: pasienSamaRm, error: cekErr } = await supabase
        .from('pasien')
        .select('id, nama_lengkap, no_kk')
        .eq('instansi_id', profile.instansi_id)
        .eq('no_rekam_medis', formPasienRak.no_rekam_medis.trim())

      if (cekErr) throw new Error(cekErr.message)

      const noKkForm = formPasienRak.no_kk.trim()
      const nikForm = formPasienRak.no_nik.trim()
      let pasienExisting = null

      if (pasienSamaRm && pasienSamaRm.length > 0) {
        const kkCocok = noKkForm && pasienSamaRm.every((p) => (p.no_kk || '').trim() === noKkForm)

        if (!kkCocok) {
          // No. RM sudah dipakai pasien dengan No. KK berbeda (atau No. KK di
          // form ini belum diisi) -> tolak, jangan sampai menimpa data orang lain.
          throw new Error(
            `Nomor rekam medis ${formPasienRak.no_rekam_medis.trim()} sudah dipakai oleh pasien lain ` +
              `(${pasienSamaRm.map((p) => p.nama_lengkap).join(', ')}) dengan No. KK yang berbeda. ` +
              `No. RM hanya boleh sama untuk anggota dalam satu Kartu Keluarga yang sama.`
          )
        }

        // No. KK cocok -> ini anggota keluarga yang sama. Kalau NIK-nya juga
        // sudah ada di grup ini berarti sedang menyimpan ulang pasien yang
        // sama (update baris tsb), bukan bikin baris/anggota baru.
        const { data: pasienNikSama, error: cekNikErr } = await supabase
          .from('pasien')
          .select('id')
          .eq('instansi_id', profile.instansi_id)
          .eq('no_rekam_medis', formPasienRak.no_rekam_medis.trim())
          .eq('no_nik', nikForm)
          .maybeSingle()
        if (cekNikErr) throw new Error(cekNikErr.message)
        pasienExisting = pasienNikSama
      }

      const payload = {
        instansi_id: profile.instansi_id,
        no_rekam_medis: formPasienRak.no_rekam_medis.trim(),
        nama_lengkap: formPasienRak.nama_lengkap.trim(),
        alamat: formPasienRak.alamat.trim() || null,
        no_nik: formPasienRak.no_nik.trim(),
        no_bpjs: formPasienRak.no_bpjs.trim() || null,
        no_kk: formPasienRak.no_kk.trim() || null,
        urutan_kk: formPasienRak.urutan_kk ? Number(formPasienRak.urutan_kk) : null,
        status_keluarga: formPasienRak.status_keluarga || null,
        status_keluarga_lainnya:
          formPasienRak.status_keluarga === 'lainnya'
            ? formPasienRak.status_keluarga_lainnya.trim() || null
            : null,
        tempat_lahir: formPasienRak.tempat_lahir.trim() || null,
        tanggal_lahir: formPasienRak.tanggal_lahir,
        jenis_kelamin: formPasienRak.jenis_kelamin || null,
        pekerjaan: formPasienRak.pekerjaan.trim() || null,
        rak_id: pasienRakBaru.id,
      }

      if (pasienExisting) {
        const { error: updateErr } = await supabase
          .from('pasien')
          .update(payload)
          .eq('id', pasienExisting.id)
        if (updateErr) throw new Error(updateErr.message)
      } else {
        const { error: insertErr } = await supabase.from('pasien').insert(payload)
        if (insertErr) throw new Error(insertErr.message)
      }

      tutupTambahPasienRak()
      // refresh isi rak akan ditangani lewat callback onSaved di ModalKelolaRak
    } catch (err) {
      setPasienRakError(err.message)
    } finally {
      setPasienRakLoading(false)
    }
  }

  async function fetchPolis(instansiId) {
    const { data, error } = await supabase
      .from('polis')
      .select('id, nama_poli')
      .eq('instansi_id', instansiId)

    if (error) {
      console.error('Error fetch polis:', error.message)
    }

    setPolis(data || [])
  }

  // Daftar nakes (dokter/PJ ruangan) aktif per poli — dipilih di loket saat pendaftaran
  // sebagai penanggung jawab pasien di poli tujuan.
  async function fetchPetugasPoli(instansiId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nama_lengkap, profesi, poli_id')
      .eq('instansi_id', instansiId)
      .eq('role', 'nakes')
      .eq('aktif', true)
      .not('poli_id', 'is', null)

    if (error) {
      console.error('Error fetch petugas poli:', error.message)
    }

    setPetugasPoliList(data || [])
  }

  // FITUR 2 + 3 + 5(riwayat) + 10: satu query gabungan untuk seluruh data dashboard hari ini
  const fetchDashboardData = useCallback(async (instansiId) => {
    const today = todayStr()
    const { data, error } = await supabase
      .from('kunjungan')
      .select(`
        id, poli_id, kategori_pasien, status, status_panggil, nomor_antrian, loket_id, created_at, status_prioritas,
        pasien:pasien_id ( nama_lengkap ),
        poli:poli_id ( nama_poli ),
        petugas:loket_id ( nama_lengkap )
      `)
      .eq('instansi_id', instansiId)
      .eq('tanggal_periksa', today)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetch dashboard:', error.message)
      return
    }

    const rows = data || []

    // Statistik hari ini
    setStats({
      total: rows.length,
      bpjs: rows.filter((r) => r.kategori_pasien === 'bpjs').length,
      umum: rows.filter((r) => r.kategori_pasien === 'umum').length,
      menunggu: rows.filter((r) => r.status === 'menunggu' || r.status_panggil === 'menunggu').length,
      selesai: rows.filter((r) => r.status === 'selesai').length,
    })

    // Ringkasan antrian per poli
    const poliMap = {}
    rows.forEach((r) => {
      const key = r.poli_id
      if (!key) return
      if (!poliMap[key]) {
        poliMap[key] = { poli_id: key, nama_poli: r.poli?.nama_poli || '-', berjalan: 0, menunggu: 0 }
      }
      if ((r.status_panggil === 'dipanggil' || r.status === 'dipanggil') && r.nomor_antrian > poliMap[key].berjalan) {
        poliMap[key].berjalan = r.nomor_antrian
      }
      if (r.status === 'menunggu' || r.status_panggil === 'menunggu') {
        poliMap[key].menunggu += 1
      }
    })
    setAntrianPoli(Object.values(poliMap))

    // Riwayat pendaftaran terakhir (20 data)
    setRiwayat(rows.slice(0, 20))

    // Monitoring loket
    const loketMap = {}
    rows.forEach((r) => {
      const key = r.loket_id
      if (!key) return
      if (!loketMap[key]) {
        loketMap[key] = { loket_id: key, nama: r.petugas?.nama_lengkap || 'Petugas', jumlah: 0 }
      }
      loketMap[key].jumlah += 1
    })
    setMonitoringLoket(Object.values(loketMap))
  }, [])

  // Auto-refresh dashboard tiap 30 detik
  useEffect(() => {
    if (!profile?.instansi_id) return
    const interval = setInterval(() => fetchDashboardData(profile.instansi_id), 30000)
    return () => clearInterval(interval)
  }, [profile?.instansi_id, fetchDashboardData])

  // FITUR 1: pencarian pasien lama (debounce)
  useEffect(() => {
    if (step !== 'cari') return
    if (!searchTerm.trim()) {
      setSearchResults([])
      return
    }
    const timeout = setTimeout(() => cariPasien(searchTerm.trim()), 400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, step])

  useEffect(() => {
    if (step === 'cari') {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [step])

  async function cariPasien(term) {
    if (!profile?.instansi_id) return
    setSearching(true)
    const { data, error } = await supabase
      .from('pasien')
      .select('*')
      .eq('instansi_id', profile.instansi_id)
      .or(`no_nik.eq.${term},no_rekam_medis.eq.${term},no_bpjs.eq.${term},nama_lengkap.ilike.%${term}%`)
      .limit(10)

    setSearching(false)
    if (error) {
      console.error('Error cari pasien:', error.message)
      return
    }
    setSearchResults(data || [])
  }

  // FITUR 1: pilih pasien lama dari hasil pencarian, lalu pilih kategori
  function pilihPasienLama(pasien) {
    setPasienTerpilih(pasien)
    fetchRiwayatPasien(pasien.id)
  }

  // Riwayat pemeriksaan pasien terpilih (dari tabel kunjungan) — SEMUA riwayat
  // ditampilkan, tidak dibatasi jumlah. Loket hanya MELIHAT (read-only); kolom
  // klinis (anamnesa, diagnosa, therapy_tindakan, icd_x, paraf) diisi oleh
  // akun perawat/dokter di masing-masing poli.
  async function fetchRiwayatPasien(pasienId) {
    setRiwayatPasienLoading(true)
    setRiwayatPasien([])
    const { data, error } = await supabase
      .from('kunjungan')
      .select(`
        id, tanggal_periksa, kategori_pasien, status, status_prioritas, created_at,
        anamnesa, diagnosa, therapy_tindakan, icd_x, paraf,
        poli:poli_id ( nama_poli )
      `)
      .eq('pasien_id', pasienId)
      .order('tanggal_periksa', { ascending: false })
      .order('created_at', { ascending: false })

    setRiwayatPasienLoading(false)
    if (error) {
      console.error('Error fetch riwayat pasien:', error.message)
      return
    }
    setRiwayatPasien(data || [])
  }

  function lanjutkanPasienLama(kategori) {
    if (!pasienTerpilih) return
    setForm({
      ...FORM_AWAL,
      kategori_pasien: kategori,
      tanggal_periksa: todayStr(),
      no_rekam_medis: pasienTerpilih.no_rekam_medis || generateNoRM(),
      mode_rm: pasienTerpilih.no_rekam_medis ? 'manual' : 'otomatis',
      nama_lengkap: pasienTerpilih.nama_lengkap || '',
      tanggal_lahir: pasienTerpilih.tanggal_lahir || '',
      jenis_kelamin: pasienTerpilih.jenis_kelamin || '',
      alamat: pasienTerpilih.alamat || '',
      no_nik: pasienTerpilih.no_nik || '',
      no_bpjs: pasienTerpilih.no_bpjs || '',
      no_kk: pasienTerpilih.no_kk || '',
      urutan_kk: pasienTerpilih.urutan_kk != null ? String(pasienTerpilih.urutan_kk) : '',
      rak_id: pasienTerpilih.rak_id || '',
      wilayah: pasienTerpilih.wilayah || '',
      poli_id: '',
      pasien_id_existing: pasienTerpilih.id,
    })
    setPasienTerpilih(null)
    setRiwayatPasien([])
    setSearchTerm('')
    setSearchResults([])
    setAnggotaKeluarga([])
    setKkChecked(false)
    setNikDitemukan(!!pasienTerpilih.no_nik)
    setStep('form')
    setError('')
    setSukses(false)
  }

  // FITUR PERIKSA DARI RAK: dipanggil dari tombol "🩺 PERIKSA" di tabel isi rak
  // (lewat ModalKelolaRak). Alurnya: pilih Poli Tujuan → pilih Dokter/PJ Ruangan →
  // pilih kategori BPJS/Umum (3 langkah, ditangani di popup wizard ModalKelolaRak).
  // Setelah lengkap, form pendaftaran dibuka dengan poli & petugas sudah terisi.
  async function periksaPasienDariRak(pasien, poliId, petugasPoliId, kategori) {
    setForm({
      ...FORM_AWAL,
      kategori_pasien: kategori,
      tanggal_periksa: todayStr(),
      no_rekam_medis: pasien.no_rekam_medis || generateNoRM(),
      mode_rm: pasien.no_rekam_medis ? 'manual' : 'otomatis',
      nama_lengkap: pasien.nama_lengkap || '',
      tanggal_lahir: pasien.tanggal_lahir || '',
      jenis_kelamin: pasien.jenis_kelamin || '',
      alamat: pasien.alamat || '',
      no_nik: pasien.no_nik || '',
      no_bpjs: pasien.no_bpjs || '',
      no_kk: pasien.no_kk || '',
      urutan_kk: pasien.urutan_kk != null ? String(pasien.urutan_kk) : '',
      rak_id: pasien.rak_id || '',
      wilayah: pasien.wilayah || '',
      poli_id: poliId || '',
      petugas_poli_id: petugasPoliId || '',
      pasien_id_existing: pasien.id,
    })
    setPasienTerpilih(null)
    setSearchTerm('')
    setSearchResults([])
    setAnggotaKeluarga([])
    setKkChecked(false)
    setNikDitemukan(!!pasien.no_nik)
    setShowKelolaRak(false)
    setStep('form')
    setError('')
    setSukses(false)
    // Tarik riwayat pemeriksaan pasien ini supaya langsung tampil di form
    if (pasien.id) {
      fetchRiwayatPasien(pasien.id)
    }
  }

  // Cek No. NIK: kalau pasien dg NIK ini sudah pernah periksa sebelumnya,
  // seluruh data form (nama, tgl lahir, alamat, BPJS, No. KK, rak, No. RM, dst)
  // otomatis diisi dari data lama, supaya petugas tidak perlu ketik ulang.
  async function cekNoNik(nik) {
    setNikDitemukan(false)
    if (!nik.trim() || nik.trim().length < 16 || !profile?.instansi_id) {
      return
    }
    setCekNikLoading(true)
    const { data, error } = await supabase
      .from('pasien')
      .select('*')
      .eq('instansi_id', profile.instansi_id)
      .eq('no_nik', nik.trim())
      .order('created_at', { ascending: false })
      .limit(1)
    setCekNikLoading(false)

    if (error) {
      console.error('Error cek No. NIK:', error.message)
      return
    }

    const pasienLama = data && data[0]
    if (!pasienLama) return // NIK baru, biarkan petugas isi manual

    setNikDitemukan(true)
    setForm((prev) => ({
      ...prev,
      nama_lengkap: pasienLama.nama_lengkap || prev.nama_lengkap,
      tanggal_lahir: pasienLama.tanggal_lahir || prev.tanggal_lahir,
      jenis_kelamin: pasienLama.jenis_kelamin || prev.jenis_kelamin,
      alamat: pasienLama.alamat || prev.alamat,
      no_bpjs: pasienLama.no_bpjs || prev.no_bpjs,
      no_kk: pasienLama.no_kk || prev.no_kk,
      urutan_kk: pasienLama.urutan_kk != null ? String(pasienLama.urutan_kk) : prev.urutan_kk,
      rak_id: pasienLama.rak_id || prev.rak_id,
      no_rekam_medis: pasienLama.no_rekam_medis || prev.no_rekam_medis,
      mode_rm: pasienLama.no_rekam_medis ? 'manual' : prev.mode_rm,
      wilayah: pasienLama.wilayah || prev.wilayah,
      pasien_id_existing: pasienLama.id,
    }))

    // Tarik riwayat pemeriksaan pasien ini supaya tampil juga di form,
    // sama seperti saat masuk lewat "lanjutkan pasien lama" atau tombol PERIKSA di rak.
    fetchRiwayatPasien(pasienLama.id)

    // Kalau pasien lama ini punya No. KK, langsung cek juga anggota keluarganya
    // supaya panel "anggota keluarga" & konsistensi rak tetap sinkron.
    if (pasienLama.no_kk) {
      cekNoKk(pasienLama.no_kk)
    }
  }

  // Cek No. KK: cari anggota keluarga lain yang sudah terdaftar dg no_kk sama,
  // supaya No. RM bisa disatukan.
  async function cekNoKk(noKk) {
    if (!noKk.trim() || !profile?.instansi_id) {
      setAnggotaKeluarga([])
      setKkChecked(false)
      return
    }
    setCekKk(true)
    const { data, error } = await supabase
      .from('pasien')
      .select('id, nama_lengkap, no_rekam_medis, tanggal_lahir, jenis_kelamin, rak_id')
      .eq('instansi_id', profile.instansi_id)
      .eq('no_kk', noKk.trim())

    setCekKk(false)
    setKkChecked(true)

    if (error) {
      console.error('Error cek No. KK:', error.message)
      setAnggotaKeluarga([])
      return
    }

    setAnggotaKeluarga(data || [])

    // Jika keluarga ini sudah punya No. RM (dan rak), otomatis pakai yang sama —
    // satu keluarga = satu map di rak yang sama.
    if (data && data.length > 0 && data[0].no_rekam_medis) {
      setForm((prev) => ({
        ...prev,
        no_rekam_medis: data[0].no_rekam_medis,
        rak_id: data[0].rak_id || prev.rak_id,
        mode_rm: 'manual', // kunci supaya tidak ke-generate ulang otomatis
      }))
    }
  }

  // Ambil bagian angka murni dari No. RM (buang semua karakter non-angka).
  // Dipakai untuk membaca angka urut tertinggi dari data lama yang formatnya
  // tidak konsisten (mis. "A.AO.0271" atau "A-A0-0033" sama-sama dibaca sebagai
  // angka 271 / 33).
  function angkaUrutDariNoRm(noRm) {
    if (!noRm) return 0
    const digitSaja = noRm.replace(/\D/g, '')
    if (!digitSaja) return 0
    return parseInt(digitSaja, 10)
  }

  // Sinkronkan nomor_urut_terakhir satu rak dengan angka urut TERTINGGI yang
  // benar-benar ada di tabel pasien untuk rak itu (bukan percaya pada counter
  // yang mungkin sudah basi/tidak pernah diupdate). Dipakai sebelum generate
  // No. RM baru, supaya nomor barunya pasti lanjut dari data asli, bukan
  // lompat balik ke nomor kecil.
  async function sinkronkanNomorUrutRak(rakId) {
    const PAGE_SIZE = 1000
    let semua = []
    let dari = 0
    while (true) {
      const { data, error } = await supabase
        .from('pasien')
        .select('no_rekam_medis')
        .eq('rak_id', rakId)
        .range(dari, dari + PAGE_SIZE - 1)
      if (error) {
        console.error('Gagal sinkron nomor urut rak:', error.message)
        return null
      }
      semua = semua.concat(data || [])
      if (!data || data.length < PAGE_SIZE) break
      dari += PAGE_SIZE
    }

    const angkaTertinggi = semua.reduce(
      (max, p) => Math.max(max, angkaUrutDariNoRm(p.no_rekam_medis)),
      0
    )

    const { data: updated, error: updateErr } = await supabase
      .from('rak_rm')
      .update({ nomor_urut_terakhir: angkaTertinggi })
      .eq('id', rakId)
      .select('nomor_urut_terakhir')
      .single()

    if (updateErr) {
      console.error('Gagal update nomor_urut_terakhir:', updateErr.message)
      return null
    }

    setRakList((prev) =>
      prev.map((r) => (r.id === rakId ? { ...r, nomor_urut_terakhir: updated.nomor_urut_terakhir } : r))
    )
    return updated.nomor_urut_terakhir
  }

  // Sinkronkan SEMUA rak milik instansi sekaligus. Dipakai lewat tombol
  // "Sinkronkan Nomor Urut" di halaman Kelola Rak.
  async function sinkronkanSemuaRak() {
    for (const rak of rakList) {
      await sinkronkanNomorUrutRak(rak.id)
    }
  }

  // Generate No. RM berbasis Rak: format seragam {kode_rak}-{4 digit urut}
  // (mis. A-A0-0001). Nomor urut naik sendiri per rak, mengikuti nomor_urut_terakhir
  // yang sudah disinkronkan dengan data asli di tabel pasien (lihat
  // sinkronkanNomorUrutRak) — sehingga nomor baru dijamin lanjut dari nomor
  // tertinggi yang benar-benar ada, bukan lompat ke nomor kecil.
  async function generateNoRmDariRak(rakId) {
    const rak = rakList.find((r) => r.id === rakId)
    if (!rak) return ''

    const { data, error } = await supabase
      .from('rak_rm')
      .update({ nomor_urut_terakhir: (rak.nomor_urut_terakhir || 0) + 1 })
      .eq('id', rakId)
      .eq('nomor_urut_terakhir', rak.nomor_urut_terakhir || 0) // guard sederhana thd race condition
      .select('nomor_urut_terakhir')
      .single()

    let nomorBaru
    if (error || !data) {
      // fallback kalau guard gagal (ada perubahan bersamaan): ambil ulang nilai terbaru
      const { data: ulang } = await supabase
        .from('rak_rm')
        .select('nomor_urut_terakhir')
        .eq('id', rakId)
        .single()
      nomorBaru = (ulang?.nomor_urut_terakhir || 0) + 1
      await supabase.from('rak_rm').update({ nomor_urut_terakhir: nomorBaru }).eq('id', rakId)
    } else {
      nomorBaru = data.nomor_urut_terakhir
    }

    setRakList((prev) => prev.map((r) => (r.id === rakId ? { ...r, nomor_urut_terakhir: nomorBaru } : r)))

    const urut = String(nomorBaru).padStart(4, '0')
    return `${rak.kode_rak}-${urut}`
  }

  // Dipanggil saat petugas memilih rak di form pendaftaran
  async function pilihRak(rakId) {
    if (!rakId) {
      setForm((prev) => ({ ...prev, rak_id: '' }))
      return
    }
    setForm((prev) => ({ ...prev, rak_id: rakId }))
    // Kalau No. RM sudah mengikuti keluarga (dari cekNoKk), jangan timpa
    if (kkChecked && anggotaKeluarga.length > 0 && anggotaKeluarga[0].no_rekam_medis) {
      return
    }
    await sinkronkanNomorUrutRak(rakId)
    const noRmBaru = await generateNoRmDariRak(rakId)
    if (noRmBaru) {
      setForm((prev) => ({ ...prev, no_rekam_medis: noRmBaru, mode_rm: 'otomatis' }))
    }
  }

  // Generate nomor antrian: reset ke 1 tiap hari, per poli
  async function generateNomorAntrian(poliId, tanggal) {
    const { data, error } = await supabase
      .from('kunjungan')
      .select('nomor_antrian')
      .eq('poli_id', poliId)
      .eq('tanggal_periksa', tanggal)
      .order('nomor_antrian', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error generate nomor antrian:', error.message)
    }

    const terakhir = data?.nomor_antrian || 0
    return terakhir + 1
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => {
      const updated = { ...prev, [name]: value }
      if (name === 'mode_rm' && value === 'otomatis') {
        updated.no_rekam_medis = generateNoRM()
      }
      // FITUR 8: saran otomatis status prioritas jika pasien masuk kategori Lansia
      if (name === 'tanggal_lahir') {
        const kat = kategoriUmur(value)
        if (kat.label === 'Lansia' && !prev.status_prioritas) {
          updated.status_prioritas = 'lansia'
        }
      }
      return updated
    })
    // No. KK diubah -> reset status pengecekan keluarga
    if (name === 'no_kk') {
      setKkChecked(false)
      setAnggotaKeluarga([])
    }
  }

  // FITUR: Rak Rekam Medis — pindah rak untuk pasien yang sudah pernah dipilih dari "Pasien Lama"
  function handleChangeRak(e) {
    pilihRak(e.target.value)
  }

  // FITUR 4: cetak tiket antrian otomatis
  function cetakTiket(tiket, namaInstansi) {
    const w = window.open('', '_blank', 'width=380,height=600')
    if (!w) return
    w.document.write(`
      <html>
        <head>
          <title>Tiket Antrian</title>
          <style>
            body { font-family: monospace; text-align: center; padding: 20px; }
            h2 { margin: 0 0 4px; font-size: 16px; }
            .poli { font-size: 13px; color: #444; margin-bottom: 10px; }
            .nomor { font-size: 64px; font-weight: bold; margin: 10px 0; letter-spacing: 2px; }
            .garis { border-top: 1px dashed #999; margin: 12px 0; }
            .kecil { font-size: 11px; color: #777; }
          </style>
        </head>
        <body>
          <h2>${namaInstansi || 'Tiket Antrian'}</h2>
          <div class="poli">${tiket.namaPoli}</div>
          <div class="garis"></div>
          <div class="nomor">${tiket.nomor}</div>
          <div class="kecil">Nomor Antrian Anda</div>
          <div class="garis"></div>
          <div class="kecil">${new Date().toLocaleString('id-ID')}</div>
          <script>window.onload = () => { window.print(); }</script>
        </body>
      </html>
    `)
    w.document.close()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!form.nama_lengkap.trim()) throw new Error('Nama lengkap wajib diisi.')
      if (!form.tanggal_lahir) throw new Error('Tanggal lahir wajib diisi.')
      if (!form.jenis_kelamin) throw new Error('Jenis kelamin wajib dipilih.')
      if (!form.wilayah) throw new Error('Wilayah wajib dipilih.')
      if (!form.poli_id) throw new Error('Poli tujuan wajib dipilih.')
      if (!form.no_rekam_medis.trim()) throw new Error('Nomor rekam medis wajib diisi.')
      if (form.kategori_pasien === 'bpjs' && !form.no_bpjs.trim()) {
        throw new Error('Nomor BPJS wajib diisi untuk pasien BPJS.')
      }
      if (form.no_nik && validasiNik(form.no_nik).status === 'invalid') {
        throw new Error(validasiNik(form.no_nik).pesan)
      }

      let pasienId = form.pasien_id_existing

      if (!pasienId) {
        // Cek dulu apakah no_rekam_medis ini sudah terdaftar untuk instansi ini
        // (misalnya diisi manual, atau kebetulan sama dengan pasien lama yang
        // tidak dipilih lewat "Cari Pasien Lama"). Kalau sudah ada, jangan insert
        // pasien baru — cukup pakai id yang sudah ada dan tambahkan kunjungannya.
        const { data: pasienExisting, error: cekErr } = await supabase
          .from('pasien')
          .select('id')
          .eq('instansi_id', profile.instansi_id)
          .eq('no_rekam_medis', form.no_rekam_medis.trim())
          .maybeSingle()

        if (cekErr) throw new Error(cekErr.message)

        if (pasienExisting) {
          pasienId = pasienExisting.id
        } else {
          const { data: pasienData, error: pasienErr } = await supabase
            .from('pasien')
            .insert({
              instansi_id: profile.instansi_id,
              no_rekam_medis: form.no_rekam_medis.trim(),
              nama_lengkap: form.nama_lengkap.trim(),
              tanggal_lahir: form.tanggal_lahir,
              jenis_kelamin: form.jenis_kelamin,
              alamat: form.alamat.trim() || null,
              no_nik: form.no_nik.trim() || null,
              no_bpjs: form.no_bpjs.trim() || null,
              no_kk: form.no_kk.trim() || null,
              rak_id: form.rak_id || null,
              kategori_pasien: form.kategori_pasien,
              wilayah: form.wilayah,
            })
            .select()
            .single()

          if (pasienErr) throw new Error(pasienErr.message)
          pasienId = pasienData.id
        }
      }

      const nomorAntrian = await generateNomorAntrian(form.poli_id, form.tanggal_periksa)

      const { error: kunjunganErr } = await supabase
        .from('kunjungan')
        .insert({
          instansi_id: profile.instansi_id,
          pasien_id: pasienId,
          poli_id: form.poli_id,
          petugas_poli_id: form.petugas_poli_id || null,
          loket_id: profile.id,
          tanggal_periksa: form.tanggal_periksa,
          kategori_pasien: form.kategori_pasien,
          wilayah: form.wilayah,
          status: 'menunggu',
          nomor_antrian: nomorAntrian,
          status_panggil: 'menunggu',
          status_prioritas: form.status_prioritas || null,
        })

      if (kunjunganErr) throw new Error(kunjunganErr.message)

      const namaPoli = polis.find((p) => p.id === form.poli_id)?.nama_poli || ''
      const tiket = { nomor: nomorAntrian, namaPoli }
      setTiketAntrian(tiket)
      setSukses(true)
      setStep('kategori')
      setForm(FORM_AWAL)

      // FITUR 4: langsung buka pilihan cetak tiket
      cetakTiket(tiket, profile?.instansi?.nama)

      // refresh dashboard setelah pendaftaran baru
      fetchDashboardData(profile.instansi_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // FITUR 7: Shortcut keyboard — Esc (Kembali), Ctrl+S (Simpan)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (step === 'form' || step === 'cari') {
          e.preventDefault()
          setStep('kategori')
        } else if (step === 'cek-antrian' || step === 'qr-mandiri') {
          e.preventDefault()
          setStep('kategori')
        }
      } else if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        if (step === 'form') {
          e.preventDefault()
          formRef.current?.requestSubmit()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const nikCheck = validasiNik(form.no_nik)
  const umurInfo = kategoriUmur(form.tanggal_lahir)

  // ─── TAMPILAN PILIH KATEGORI (+ DASHBOARD) ─────────────────

  if (step === 'kategori') {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">

          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-800">Pendaftaran Pasien</h1>
            <p className="text-gray-500 mt-1">{profile?.instansi?.nama || ''}</p>
            <p className="text-xs text-gray-400 mt-1">
              Shortcut: <b>Esc</b> Kembali · <b>Ctrl+S</b> Simpan
            </p>
          </div>

          {sukses && tiketAntrian && (
            <div className="mb-6 max-w-md mx-auto bg-white border-2 border-dashed border-teal-400 rounded-xl px-8 py-5 text-center shadow-sm">
              <p className="text-sm text-gray-500">✅ Pasien berhasil didaftarkan</p>
              <p className="text-xs text-gray-400 mt-1">{tiketAntrian.namaPoli}</p>
              <p className="text-5xl font-bold text-teal-600 mt-2 tracking-wide">{tiketAntrian.nomor}</p>
              <p className="text-xs text-gray-400 mt-1">Nomor Antrian Anda</p>
              <button
                onClick={() => cetakTiket(tiketAntrian, profile?.instansi?.nama)}
                className="mt-3 text-xs px-4 py-1.5 rounded-full bg-teal-600 text-white hover:bg-teal-700"
              >
                🖨️ Cetak Ulang Tiket
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Kolom kiri: aksi utama ── */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <p className="text-gray-600 mb-4 font-medium">Menu loket:</p>
                <div className="flex flex-wrap gap-6">
                  <button
                    onClick={() => {
                      const url = new URL(window.location.href)
                      url.searchParams.set('view', 'antrian')
                      window.open(url.toString(), '_blank')
                    }}
                    className="w-40 h-40 rounded-2xl bg-gray-700 hover:bg-gray-800 text-white flex flex-col items-center justify-center gap-2 shadow-lg transition"
                  >
                    <span className="text-4xl">📺</span>
                    <span className="text-lg font-bold">ANTRIAN</span>
                  </button>

                  <button
                    onClick={() => setStep('cek-antrian')}
                    className="w-40 h-40 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg transition"
                  >
                    <span className="text-4xl">📱</span>
                    <span className="text-lg font-bold text-center leading-tight">CEK ANTRIAN</span>
                  </button>

                  {/* Pendaftaran mandiri via QR */}
                  <button
                    onClick={() => setStep('qr-mandiri')}
                    className="w-40 h-40 rounded-2xl bg-pink-600 hover:bg-pink-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg transition"
                  >
                    <span className="text-4xl">📷</span>
                    <span className="text-lg font-bold text-center leading-tight">DAFTAR MANDIRI</span>
                  </button>

                  {/* Rak Rekam Medis — kelola kode rak sendiri */}
                  <button
                    onClick={() => setShowKelolaRak(true)}
                    className="w-40 h-40 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg transition"
                  >
                    <span className="text-4xl">🗄️</span>
                    <span className="text-lg font-bold text-center leading-tight">RAK REKAM MEDIS</span>
                  </button>
                </div>
              </div>

              {/* FITUR 3: Ringkasan Antrian per Poli */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="font-semibold text-gray-700 mb-3">Ringkasan Antrian per Poli</h2>
                {antrianPoli.length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada data antrian hari ini.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {antrianPoli.map((p) => (
                      <div key={p.poli_id} className="border rounded-xl p-3">
                        <p className="text-sm font-medium text-gray-700">{p.nama_poli}</p>
                        <p className="text-xs text-gray-400 mt-1">Berjalan</p>
                        <p className="text-2xl font-bold text-teal-600">{p.berjalan || '-'}</p>
                        <p className="text-xs text-gray-400 mt-1">Menunggu: <b>{p.menunggu}</b></p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* FITUR 5: Riwayat Pendaftaran Terakhir */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="font-semibold text-gray-700 mb-3">Riwayat Pendaftaran Terakhir</h2>
                {riwayat.length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada pendaftaran hari ini.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 text-xs border-b">
                          <th className="py-2 pr-2">Jam</th>
                          <th className="py-2 pr-2">Nama</th>
                          <th className="py-2 pr-2">Poli</th>
                          <th className="py-2 pr-2">No. Antrian</th>
                          <th className="py-2 pr-2">Kategori</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riwayat.map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2 pr-2 text-gray-500">
                              {new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-2 pr-2">{r.pasien?.nama_lengkap || '-'}</td>
                            <td className="py-2 pr-2">{r.poli?.nama_poli || '-'}</td>
                            <td className="py-2 pr-2 font-semibold">{r.nomor_antrian}</td>
                            <td className="py-2 pr-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                r.kategori_pasien === 'bpjs' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'
                              }`}>
                                {r.kategori_pasien?.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* ── Kolom kanan: statistik & monitoring ── */}
            <div className="space-y-6">
              {/* FITUR 2: Statistik Dashboard Hari Ini */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="font-semibold text-gray-700 mb-3">Statistik Hari Ini</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">Total Pasien</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-blue-400">BPJS</p>
                    <p className="text-2xl font-bold text-blue-700">{stats.bpjs}</p>
                  </div>
                  <div className="bg-teal-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-teal-500">Umum</p>
                    <p className="text-2xl font-bold text-teal-700">{stats.umum}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-yellow-500">Menunggu</p>
                    <p className="text-2xl font-bold text-yellow-700">{stats.menunggu}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center col-span-2">
                    <p className="text-xs text-green-500">Selesai</p>
                    <p className="text-2xl font-bold text-green-700">{stats.selesai}</p>
                  </div>
                </div>
              </div>

              {/* FITUR 10: Dashboard Monitoring Loket */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="font-semibold text-gray-700 mb-3">Monitoring Loket</h2>
                {monitoringLoket.length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada aktivitas loket hari ini.</p>
                ) : (
                  <div className="space-y-2">
                    {monitoringLoket.map((l) => (
                      <div key={l.loket_id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-600">{l.nama}</span>
                        <span className="text-sm font-bold text-teal-600">{l.jumlah} pasien</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <ModalKelolaRak
        show={showKelolaRak}
        onClose={() => {
          setShowKelolaRak(false)
          setRakForm({ id: null, kode_rak: '', nama_rak: '' })
          setRakError('')
        }}
        rakList={rakList}
        rakForm={rakForm}
        setRakForm={setRakForm}
        rakLoading={rakLoading}
        rakError={rakError}
        onSubmit={simpanRak}
        onEdit={editRak}
        onDelete={hapusRak}
        onPisahkanRmBaru={pisahkanKeRmBaru}
        onSinkronSemua={sinkronkanSemuaRak}
        instansiId={profile?.instansi_id}
        pasienRakBaru={pasienRakBaru}
        editPasienRakId={editPasienRakId}
        onBukaTambahPasien={bukaTambahPasienRak}
        onEditPasienRak={bukaEditPasienRak}
        onTambahAnggotaGrup={bukaTambahAnggotaGrupRak}
        onHapusPasienRak={hapusPasienRak}
        onTutupTambahPasien={tutupTambahPasienRak}
        formPasienRak={formPasienRak}
        onChangeFormPasienRak={handleChangeFormPasienRak}
        onSubmitPasienRak={simpanPasienRak}
        pasienRakLoading={pasienRakLoading}
        pasienRakError={pasienRakError}
        anggotaKkRak={anggotaKkRak}
        onCekNoKkRak={cekNoKkRak}
        cekKkRakLoading={cekKkRakLoading}
        refPasienRakNama={refPasienRakNama}
        refPasienRakNoRm={refPasienRakNoRm}
        refPasienRakNik={refPasienRakNik}
        refPasienRakTanggalLahir={refPasienRakTanggalLahir}
        refPasienRakJenisKelamin={refPasienRakJenisKelamin}
        popupValidasi={popupValidasiPasienRak}
        onTutupPopupValidasi={() => setPopupValidasiPasienRak(null)}
        onPeriksaPasienRak={periksaPasienDariRak}
        polis={polis}
        petugasPoliList={petugasPoliList}
      />
      </div>
    )
  }

  // ─── TAMPILAN QR PENDAFTARAN MANDIRI ─────────────────
  if (step === 'qr-mandiri') {
    const linkMandiri = `${window.location.origin}/pendaftaran-mandiri?instansi_id=${profile?.instansi_id || ''}`
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(linkMandiri)}`
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <button
            onClick={() => setStep('kategori')}
            className="text-gray-500 hover:text-gray-700 text-sm self-start"
          >
            ← Kembali
          </button>
          <h2 className="text-lg font-bold text-gray-800">Pendaftaran Mandiri</h2>
          <p className="text-sm text-gray-500">
            Minta pasien scan QR ini menggunakan kamera HP untuk mendaftar sendiri.
          </p>
          <img src={qrSrc} alt="QR Pendaftaran Mandiri" className="mx-auto rounded-lg border" />
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 break-all">
            {linkMandiri}
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(linkMandiri)}
            className="w-full py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
          >
            📋 Salin Tautan
          </button>
        </div>
      </div>
    )
  }

  // ─── TAMPILAN PENCARIAN PASIEN LAMA (FITUR 1) ──────────────
  if (step === 'cari') {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setStep('kategori')} className="text-gray-500 hover:text-gray-700">
              ← Kembali <span className="text-xs text-gray-400">(Esc)</span>
            </button>
            <h1 className="text-xl font-bold text-gray-800">Cari Pasien Lama</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari berdasarkan NIK, No. Rekam Medis, No. BPJS, atau Nama..."
              className="w-full border rounded-lg px-4 py-3 text-sm"
            />

            <div className="mt-4 space-y-2">
              {searching && <p className="text-sm text-gray-400">Mencari...</p>}
              {!searching && searchTerm && searchResults.length === 0 && (
                <p className="text-sm text-gray-400">Tidak ditemukan pasien yang cocok.</p>
              )}
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pilihPasienLama(p)}
                  className="w-full text-left border rounded-xl px-4 py-3 hover:bg-gray-50 transition"
                >
                  <p className="font-medium text-gray-800">{p.nama_lengkap}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    RM: {p.no_rekam_medis || '-'} · NIK: {p.no_nik || '-'} · BPJS: {p.no_bpjs || '-'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Konfirmasi kategori setelah pasien dipilih */}
          {pasienTerpilih && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-40">
              <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-3xl text-center max-h-[90vh] overflow-y-auto">
                <p className="text-sm text-gray-500 mb-1">Pasien ditemukan</p>
                <p className="font-bold text-gray-800 text-lg mb-4">{pasienTerpilih.nama_lengkap}</p>

                {/* Riwayat pemeriksaan sebelumnya — format tabel kartu rekam medis */}
                <TabelRiwayatPemeriksaan
                  riwayat={riwayatPasien}
                  loading={riwayatPasienLoading}
                  dataPasien={pasienTerpilih}
                  instansi={profile?.instansi}
                  profile={profile}
                />

                <p className="text-sm text-gray-600 mb-4">Pilih kategori kunjungan hari ini:</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => lanjutkanPasienLama('bpjs')}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                  >
                    BPJS
                  </button>
                  <button
                    onClick={() => lanjutkanPasienLama('umum')}
                    className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
                  >
                    Umum
                  </button>
                </div>
                <button
                  onClick={() => { setPasienTerpilih(null); setRiwayatPasien([]) }}
                  className="mt-3 text-xs text-gray-400 hover:text-gray-600"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── TAMPILAN LAYAR ANTRIAN ─────────────────────────────────
  if (step === 'antrian') {
    return (
      <div className="relative">
        <AntrianDisplay />
      </div>
    )
  }

  // ─── TAMPILAN CEK ANTRIAN (QR) ──────────────────────────────
  if (step === 'cek-antrian') {
    return (
      <div className="relative">
        <button
          onClick={() => setStep('kategori')}
          className="fixed top-4 left-4 z-[60] flex items-center gap-2 text-sm font-medium text-white bg-gray-800/80 hover:bg-gray-800 rounded-lg px-4 py-2 shadow-lg backdrop-blur-sm transition"
        >
          ← Kembali ke Loket
        </button>
        <CekAntrian />
      </div>
    )
  }

  // ─── TAMPILAN FORM PENDAFTARAN ─────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setStep('kategori')}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Kembali <span className="text-xs text-gray-400">(Esc)</span>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Pendaftaran Pasien</h1>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              form.kategori_pasien === 'bpjs'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-teal-100 text-teal-700'
            }`}>
              {form.kategori_pasien.toUpperCase()}
            </span>
            {form.pasien_id_existing && (
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                PASIEN LAMA
              </span>
            )}
          </div>
        </div>

        {/* Riwayat pemeriksaan pasien lama — muncul begitu pasien dikenali,
            baik lewat cek NIK manual, pencarian pasien lama, maupun tombol
            PERIKSA di tabel rak. Format tabel kartu rekam medis, loket hanya
            MELIHAT (read-only) — semua riwayat ditampilkan, tidak dibatasi. */}
        {form.pasien_id_existing && (
          <TabelRiwayatPemeriksaan
            riwayat={riwayatPasien}
            loading={riwayatPasienLoading}
            dataPasien={{
              id: form.pasien_id_existing,
              nama_lengkap: form.nama_lengkap,
              tanggal_lahir: form.tanggal_lahir,
              alamat: form.alamat,
              no_nik: form.no_nik,
              no_bpjs: form.no_bpjs,
              no_kk: form.no_kk,
              urutan_kk: form.urutan_kk,
              no_rekam_medis: form.no_rekam_medis,
            }}
            instansi={profile?.instansi}
            profile={profile}
          />
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-5">

          {/* NIK — FITUR 6: Validasi otomatis + autofill dari data pasien lama */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Nomor NIK
                <span className="text-gray-400 font-normal ml-1">(opsional)</span>
              </label>
              <div className="flex items-center gap-2">
                <a
                  href={PCARE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium text-teal-600 hover:text-teal-700 hover:underline whitespace-nowrap"
                  title="Buka PCare BPJS untuk cek keaktifan peserta (login akun Anda sendiri)"
                >
                  🔎 Cek di PCare
                </a>
                <span className="text-gray-300 text-[11px]">|</span>
                <a
                  href={EPUSKESMAS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium text-teal-600 hover:text-teal-700 hover:underline whitespace-nowrap"
                  title="Buka e-Puskesmas untuk cek data pasien (login akun instansi Anda)"
                >
                  🔎 Cek di e-Puskesmas
                </a>
              </div>
            </div>
            <input
              type="text"
              name="no_nik"
              value={form.no_nik}
              onChange={(e) => { handleChange(e); setNikDitemukan(false) }}
              onBlur={() => cekNoNik(form.no_nik)}
              placeholder="16 digit NIK"
              maxLength={16}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${
                nikCheck.status === 'invalid' ? 'border-red-400' : nikCheck.status === 'valid' ? 'border-green-400' : ''
              }`}
            />
            {cekNikLoading && (
              <p className="text-xs mt-1 text-gray-400">Mencari data pasien dengan NIK ini...</p>
            )}
            {!cekNikLoading && nikDitemukan && (
              <p className="text-xs mt-1 text-teal-600 font-medium">
                ✓ Pasien ditemukan — data pemeriksaan sebelumnya terisi otomatis
              </p>
            )}
            {!cekNikLoading && !nikDitemukan && form.no_nik && (
              <p className={`text-xs mt-1 ${nikCheck.status === 'invalid' ? 'text-red-500' : 'text-green-600'}`}>
                {nikCheck.status === 'invalid' ? `⚠️ ${nikCheck.pesan}` : `✓ ${nikCheck.pesan}`}
              </p>
            )}
          </div>

          {/* Nomor BPJS */}
          {form.kategori_pasien === 'bpjs' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Nomor BPJS <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <a
                    href={PCARE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-teal-600 hover:text-teal-700 hover:underline whitespace-nowrap"
                    title="Buka PCare BPJS untuk cek keaktifan peserta (login akun Anda sendiri)"
                  >
                    🔎 Cek di PCare
                  </a>
                  <span className="text-gray-300 text-[11px]">|</span>
                  <a
                    href={EPUSKESMAS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-teal-600 hover:text-teal-700 hover:underline whitespace-nowrap"
                    title="Buka e-Puskesmas untuk cek data pasien (login akun instansi Anda)"
                  >
                    🔎 Cek di e-Puskesmas
                  </a>
                </div>
              </div>
              <input
                type="text"
                name="no_bpjs"
                value={form.no_bpjs}
                onChange={handleChange}
                placeholder="Nomor kartu BPJS"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* No. Kartu Keluarga — untuk menyatukan No. RM satu keluarga */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nomor Kartu Keluarga (KK)
              <span className="text-gray-400 font-normal ml-1">(opsional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                name="no_kk"
                value={form.no_kk}
                onChange={handleChange}
                onBlur={() => cekNoKk(form.no_kk)}
                placeholder="16 digit No. KK"
                maxLength={16}
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => cekNoKk(form.no_kk)}
                disabled={!form.no_kk.trim() || ceknKk}
                className="text-xs px-3 py-2 rounded-lg border border-teal-600 text-teal-600 hover:bg-teal-50 disabled:opacity-40 whitespace-nowrap"
              >
                {ceknKk ? 'Mencari...' : '🔎 Cek Keluarga'}
              </button>
            </div>

            {kkChecked && anggotaKeluarga.length > 0 && (
              <div className="mt-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                <p className="text-xs text-teal-700 font-medium mb-1">
                  ✓ {anggotaKeluarga.length} anggota keluarga ditemukan — No. RM disatukan otomatis
                </p>
                <ul className="text-xs text-teal-600 space-y-0.5">
                  {anggotaKeluarga.map((a) => (
                    <li key={a.id}>• {a.nama_lengkap} ({a.jenis_kelamin === 'L' ? 'L' : 'P'})</li>
                  ))}
                </ul>
              </div>
            )}
            {kkChecked && anggotaKeluarga.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">
                Belum ada anggota keluarga terdaftar dengan No. KK ini — No. RM baru akan digunakan.
              </p>
            )}
          </div>

          {/* Rak Rekam Medis — lokasi fisik penyimpanan berkas RM */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Rak Rekam Medis
                <span className="text-gray-400 font-normal ml-1">(opsional)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowKelolaRak(true)}
                className="text-[11px] font-medium text-teal-600 hover:text-teal-700 hover:underline whitespace-nowrap"
              >
                ⚙️ Kelola Rak
              </button>
            </div>
            <select
              name="rak_id"
              value={form.rak_id}
              onChange={handleChangeRak}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">-- Tidak Pakai Rak --</option>
              {rakList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kode_rak}{r.nama_rak ? ` — ${r.nama_rak}` : ''}
                </option>
              ))}
            </select>
            {form.rak_id && (
              <p className="mt-1 text-xs text-gray-400">
                Memilih rak akan otomatis membuat No. Rekam Medis berdasarkan kode rak ini.
              </p>
            )}
          </div>

          {/* Nomor Rekam Medis */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nomor Rekam Medis
            </label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, mode_rm: 'otomatis', no_rekam_medis: generateNoRM() }))}
                className={`text-xs px-3 py-1 rounded-full border transition ${
                  form.mode_rm === 'otomatis'
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                Generate Otomatis
              </button>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, mode_rm: 'manual', no_rekam_medis: '' }))}
                className={`text-xs px-3 py-1 rounded-full border transition ${
                  form.mode_rm === 'manual'
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                Isi Manual
              </button>
            </div>
            <input
              type="text"
              name="no_rekam_medis"
              value={form.no_rekam_medis}
              onChange={handleChange}
              readOnly={form.mode_rm === 'otomatis'}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${
                form.mode_rm === 'otomatis'
                  ? 'bg-gray-100 text-gray-500'
                  : 'bg-white'
              }`}
            />
          </div>

          {/* Tanggal Periksa */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tanggal Periksa
            </label>
            <input
              type="date"
              name="tanggal_periksa"
              value={form.tanggal_periksa}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Nama Pasien */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Lengkap Pasien <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nama_lengkap"
              value={form.nama_lengkap}
              onChange={handleChange}
              placeholder="Nama lengkap sesuai KTP"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Tanggal Lahir & Jenis Kelamin */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tanggal Lahir <span className="text-red-500">*</span>
              </label>
              <DatePickerLahir
                name="tanggal_lahir"
                value={form.tanggal_lahir}
                onChange={handleChange}
              />
              {form.tanggal_lahir && (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-teal-600">{hitungUmur(form.tanggal_lahir)}</p>
                  {/* FITUR 9: Kategori umur otomatis */}
                  {umurInfo.label && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${umurInfo.warna}`}>
                      {umurInfo.label}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Jenis Kelamin <span className="text-red-500">*</span>
              </label>
              <select
                name="jenis_kelamin"
                value={form.jenis_kelamin}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">-- Pilih --</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
          </div>

          {/* Alamat */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alamat
            </label>
            <textarea
              name="alamat"
              value={form.alamat}
              onChange={handleChange}
              rows={2}
              placeholder="Alamat lengkap pasien"
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Wilayah */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wilayah Pasien <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {['dalam', 'luar'].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, wilayah: w }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                    form.wilayah === w
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {w === 'dalam' ? '📍 Dalam Wilayah' : '🗺️ Luar Wilayah'}
                </button>
              ))}
            </div>
          </div>

          {/* Poli Tujuan */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Poli Tujuan <span className="text-red-500">*</span>
            </label>
            <select
              name="poli_id"
              value={form.poli_id}
              onChange={(e) => {
                handleChange(e)
                // Ganti poli → petugas yang tersimpan sebelumnya belum tentu bertugas di poli baru, reset.
                setForm((prev) => ({ ...prev, petugas_poli_id: '' }))
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">-- Pilih Poli --</option>
              {polis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama_poli}
                </option>
              ))}
            </select>
          </div>

          {/* Dokter / PJ Ruangan — difilter sesuai poli tujuan yang dipilih */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dokter/PJ Ruangan
            </label>
            <select
              name="petugas_poli_id"
              value={form.petugas_poli_id}
              onChange={handleChange}
              disabled={!form.poli_id}
              className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">
                {form.poli_id ? '-- Pilih Dokter/PJ Ruangan --' : 'Pilih poli tujuan dahulu'}
              </option>
              {petugasPoliList
                .filter((pt) => pt.poli_id === form.poli_id)
                .map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.nama_lengkap}{pt.profesi ? ` — ${pt.profesi}` : ''}
                  </option>
                ))}
            </select>
          </div>

          {/* FITUR 8: Status Pasien Prioritas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status Prioritas
            </label>
            <div className="flex flex-wrap gap-2">
              {OPSI_PRIORITAS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, status_prioritas: o.value }))}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    form.status_prioritas === o.value
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {o.icon} {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tombol Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep('kategori')}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : 'Daftarkan Pasien (Ctrl+S)'}
            </button>
          </div>

        </form>
      </div>
      <ModalKelolaRak
        show={showKelolaRak}
        onClose={() => {
          setShowKelolaRak(false)
          setRakForm({ id: null, kode_rak: '', nama_rak: '' })
          setRakError('')
        }}
        rakList={rakList}
        rakForm={rakForm}
        setRakForm={setRakForm}
        rakLoading={rakLoading}
        rakError={rakError}
        onSubmit={simpanRak}
        onEdit={editRak}
        onDelete={hapusRak}
        onPisahkanRmBaru={pisahkanKeRmBaru}
        onSinkronSemua={sinkronkanSemuaRak}
        instansiId={profile?.instansi_id}
        pasienRakBaru={pasienRakBaru}
        editPasienRakId={editPasienRakId}
        onBukaTambahPasien={bukaTambahPasienRak}
        onEditPasienRak={bukaEditPasienRak}
        onTambahAnggotaGrup={bukaTambahAnggotaGrupRak}
        onHapusPasienRak={hapusPasienRak}
        onTutupTambahPasien={tutupTambahPasienRak}
        formPasienRak={formPasienRak}
        onChangeFormPasienRak={handleChangeFormPasienRak}
        onSubmitPasienRak={simpanPasienRak}
        pasienRakLoading={pasienRakLoading}
        pasienRakError={pasienRakError}
        anggotaKkRak={anggotaKkRak}
        onCekNoKkRak={cekNoKkRak}
        cekKkRakLoading={cekKkRakLoading}
        refPasienRakNama={refPasienRakNama}
        refPasienRakNoRm={refPasienRakNoRm}
        refPasienRakNik={refPasienRakNik}
        refPasienRakTanggalLahir={refPasienRakTanggalLahir}
        refPasienRakJenisKelamin={refPasienRakJenisKelamin}
        popupValidasi={popupValidasiPasienRak}
        onTutupPopupValidasi={() => setPopupValidasiPasienRak(null)}
        onPeriksaPasienRak={periksaPasienDariRak}
        polis={polis}
        petugasPoliList={petugasPoliList}
      />
    </div>
  )
}
// ─── KOMPONEN MANDIRI: Modal Kelola Rak Rekam Medis ──────────────
// Didefinisikan DI LUAR DashboardLoket supaya tidak dibuat ulang tiap
// render (itulah sebab bug "ketik jadi satu-satu": React sebelumnya
// mendefinisikan ulang komponen ini setiap kali state berubah, jadi
// input di dalamnya kehilangan fokus tiap ketikan).
function ModalKelolaRak({
  show,
  onClose,
  rakList,
  rakForm,
  setRakForm,
  rakLoading,
  rakError,
  onSubmit,
  onEdit,
  onDelete,
  onPisahkanRmBaru,
  onSinkronSemua,
  instansiId,
  pasienRakBaru,
  editPasienRakId,
  onBukaTambahPasien,
  onEditPasienRak,
  onTambahAnggotaGrup,
  onHapusPasienRak,
  onTutupTambahPasien,
  formPasienRak,
  onChangeFormPasienRak,
  onSubmitPasienRak,
  pasienRakLoading,
  pasienRakError,
  anggotaKkRak,
  onCekNoKkRak,
  cekKkRakLoading,
  refPasienRakNama,
  refPasienRakNoRm,
  refPasienRakNik,
  refPasienRakTanggalLahir,
  refPasienRakJenisKelamin,
  popupValidasi,
  onTutupPopupValidasi,
  onPeriksaPasienRak,
  polis,
  petugasPoliList,
}) {
  // Pasien yang sedang dipilih untuk fitur PERIKSA (wizard 3 langkah: poli → petugas → kategori)
  const [pasienPeriksaDipilih, setPasienPeriksaDipilih] = useState(null)
  const [langkahPeriksa, setLangkahPeriksa] = useState('poli') // 'poli' | 'petugas' | 'kategori'
  const [poliPeriksaDipilih, setPoliPeriksaDipilih] = useState(null)
  const [petugasPeriksaDipilih, setPetugasPeriksaDipilih] = useState(null)

  // Buka wizard PERIKSA dari awal (langkah pilih poli) untuk pasien p.
  function bukaWizardPeriksa(p) {
    setPasienPeriksaDipilih(p)
    setLangkahPeriksa('poli')
    setPoliPeriksaDipilih(null)
    setPetugasPeriksaDipilih(null)
  }

  function tutupWizardPeriksa() {
    setPasienPeriksaDipilih(null)
    setLangkahPeriksa('poli')
    setPoliPeriksaDipilih(null)
    setPetugasPeriksaDipilih(null)
  }
  const [rakDilihat, setRakDilihat] = useState(null) // rak yang sedang dibuka isinya
  const [sinkronLoading, setSinkronLoading] = useState(false) // status tombol Sinkronkan Nomor Urut
  const [pasienPisahDipilih, setPasienPisahDipilih] = useState(null) // pasien yang mau dipisah ke RM baru
  const [rakTujuanPisah, setRakTujuanPisah] = useState('') // rak tujuan untuk RM baru
  const [pisahLoading, setPisahLoading] = useState(false)
  const [isiRak, setIsiRak] = useState([])
  const [isiRakLoading, setIsiRakLoading] = useState(false)
  const [isiRakError, setIsiRakError] = useState('') // pesan error saat gagal memuat isi rak (mis. RLS, kolom salah)
  const [kataKunciPasien, setKataKunciPasien] = useState('') // kata kunci pencarian pasien di dalam rak yang dibuka
  const [grupRmDilihat, setGrupRmDilihat] = useState(null) // grup No. RM yang sedang dibuka detailnya (modal anggota keluarga)

  // Pencarian global lintas semua rak (nama / NIK / No.KK)
  const [kataKunciGlobal, setKataKunciGlobal] = useState('')
  const [hasilPencarianGlobal, setHasilPencarianGlobal] = useState([])
  const [pencarianGlobalLoading, setPencarianGlobalLoading] = useState(false)

  // CATATAN: early-return untuk !show dan pasienRakBaru dipindah ke bawah,
  // setelah semua hooks (termasuk useEffect pencarian global) dipanggil.
  // Early-return sebelum hooks selesai dipanggil melanggar Rules of Hooks
  // dan menyebabkan error "Rendered more hooks than during the previous render".

  // Fetch SEMUA baris pasien di sebuah rak, tanpa terpotong limit default
  // PostgREST (1000 baris/request). Rak dengan pasien > 1000 (mis. C-A0 luar
  // wilayah dengan 2137 pasien) akan terpotong diam-diam kalau query langsung
  // dipakai tanpa pagination — inilah sebab bug "pasien tidak ditemukan" padahal
  // datanya ada di database.
  // Ambil bagian angka dari no_rekam_medis untuk keperluan sortir numerik.
  // No. RM di database formatnya tidak konsisten (mis. "A-A0-0001" vs
  // "A-A0-00033" vs "A.AO.0254"), jadi kalau diurutkan sebagai teks biasa
  // hasilnya kacau ("0001" muncul sebelum "00033" secara alfabet padahal
  // 33 > 1 secara nilai). Solusinya: buang semua karakter non-angka, sisanya
  // dibaca sebagai angka murni untuk dibandingkan.
  function angkaUrutRM(noRm) {
    if (!noRm) return Infinity // RM kosong ditaruh paling akhir
    const digitSaja = noRm.replace(/\D/g, '')
    if (!digitSaja) return Infinity
    return parseInt(digitSaja, 10)
  }

  function urutkanNumerikRM(list) {
    return [...list].sort((a, b) => {
      const angkaA = angkaUrutRM(a.no_rekam_medis)
      const angkaB = angkaUrutRM(b.no_rekam_medis)
      if (angkaA !== angkaB) return angkaA - angkaB
      // RM sama persis (mis. data double) -> urutkan berdasarkan nama supaya stabil
      return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
    })
  }

  // Kelompokkan daftar pasien satu rak berdasarkan No. RM yang sama
  // (satu keluarga/satu No. RM ditampilkan sebagai satu baris di tabel).
  // Wakil baris = anggota dengan urutan_kk terkecil (biasanya Kepala Keluarga);
  // kalau urutan_kk tidak diisi sama sekali di grup itu, pakai anggota pertama.
  function kelompokkanPerNoRm(list) {
    const map = new Map()
    list.forEach((p) => {
      const kunci = (p.no_rekam_medis || '').trim() || `__tanpa_rm__${p.id}`
      if (!map.has(kunci)) map.set(kunci, [])
      map.get(kunci).push(p)
    })
    const grup = []
    map.forEach((anggota, kunci) => {
      const terurut = [...anggota].sort((a, b) => {
        const ua = a.urutan_kk ?? Infinity
        const ub = b.urutan_kk ?? Infinity
        if (ua !== ub) return ua - ub
        return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
      })
      grup.push({
        kunci,
        no_rekam_medis: terurut[0].no_rekam_medis,
        wakil: terurut[0],
        anggota: terurut,
      })
    })
    return urutkanNumerikRM(grup.map((g) => ({ ...g, no_rekam_medis: g.no_rekam_medis }))).map((g) => {
      // urutkanNumerikRM hanya butuh field no_rekam_medis & nama_lengkap untuk sortir;
      // kembalikan grup aslinya (lengkap dengan anggota) setelah terurut.
      const asli = grup.find((x) => x.kunci === g.kunci)
      return asli
    })
  }

  async function fetchSemuaIsiRak(rakId) {
    const PAGE_SIZE = 1000
    let semua = []
    let dari = 0
    while (true) {
      const { data, error } = await supabase
        .from('pasien')
        .select('id, nama_lengkap, no_rekam_medis, no_kk, no_nik, no_bpjs, alamat, urutan_kk, status_keluarga, status_keluarga_lainnya, tempat_lahir, tanggal_lahir, pekerjaan, jenis_kelamin')
        .eq('rak_id', rakId)
        .range(dari, dari + PAGE_SIZE - 1)
      if (error) return { data: null, error }
      semua = semua.concat(data || [])
      if (!data || data.length < PAGE_SIZE) break // halaman terakhir
      dari += PAGE_SIZE
    }
    // Sortir di sisi client secara numerik, bukan alfabet (lihat urutkanNumerikRM)
    return { data: urutkanNumerikRM(semua), error: null }
  }

  async function lihatIsiRak(rak) {
    setKataKunciPasien('')
    setIsiRakError('')

    if (!rak?.id) {
      // Guard: kalau rak yang diklik tidak punya id yang valid, jangan lanjut query
      // (query .eq('rak_id', undefined) akan selalu kosong tanpa pesan error yang jelas)
      setIsiRakError('Data rak tidak valid (id rak kosong). Coba muat ulang halaman.')
      return
    }

    if (rakDilihat?.id === rak.id) {
      // klik lagi rak yang sama -> tutup panel
      setRakDilihat(null)
      setIsiRak([])
      return
    }
    setRakDilihat(rak)
    setIsiRak([])
    setIsiRakLoading(true)
    const { data, error } = await fetchSemuaIsiRak(rak.id)
    if (error) {
      console.error('Gagal memuat isi rak:', error)
      // Pesan disesuaikan supaya mudah didiagnosa: kemungkinan besar RLS Supabase
      // memblokir SELECT, atau kolom rak_id/relasi belum sesuai skema.
      setIsiRakError(
        `Gagal memuat isi rak: ${error.message || 'terjadi kesalahan tak dikenal'}` +
          (error.code ? ` (kode: ${error.code})` : '')
      )
      setIsiRak([])
    } else {
      setIsiRak(data || [])
    }
    setIsiRakLoading(false)
  }

  async function refreshIsiRakDilihat() {
    if (!rakDilihat) return
    setIsiRakError('')
    const { data, error } = await fetchSemuaIsiRak(rakDilihat.id)
    if (error) {
      console.error('Gagal memuat ulang isi rak:', error)
      setIsiRakError(
        `Gagal memuat isi rak: ${error.message || 'terjadi kesalahan tak dikenal'}` +
          (error.code ? ` (kode: ${error.code})` : '')
      )
    } else {
      setIsiRak(data || [])
    }
  }

  async function handleHapusPasien(pasienId) {
    const ok = await onHapusPasienRak(pasienId)
    if (ok) await refreshIsiRakDilihat()
  }

  // Pencarian global: cari pasien lintas semua rak berdasarkan nama / NIK / No.KK.
  // Tidak membuka rak manapun secara otomatis — hasil tampil terpisah sebagai daftar.
  useEffect(() => {
    const kw = kataKunciGlobal.trim()
    if (!kw) {
      setHasilPencarianGlobal([])
      setPencarianGlobalLoading(false)
      return
    }
    setPencarianGlobalLoading(true)
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('pasien')
        .select('id, nama_lengkap, no_rekam_medis, no_kk, no_nik, no_bpjs, alamat, jenis_kelamin, rak_id, rak_rm(kode_rak, nama_rak)')
        .or(`nama_lengkap.ilike.%${kw}%,no_nik.ilike.%${kw}%,no_kk.ilike.%${kw}%`)
        .order('nama_lengkap', { ascending: true })
        .limit(30)
      if (!error) setHasilPencarianGlobal(data || [])
      setPencarianGlobalLoading(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [kataKunciGlobal])

  // Filter daftar pasien di rak yang sedang dibuka berdasarkan kata kunci pencarian.
  // Client-side karena isi satu rak biasanya tidak terlalu banyak.
  const isiRakTersaring = kataKunciPasien.trim()
    ? isiRak.filter((p) => {
        const kw = kataKunciPasien.trim().toLowerCase()
        return (
          (p.nama_lengkap || '').toLowerCase().includes(kw) ||
          (p.no_rekam_medis || '').toLowerCase().includes(kw) ||
          (p.no_nik || '').toLowerCase().includes(kw) ||
          (p.no_kk || '').toLowerCase().includes(kw) ||
          (p.no_bpjs || '').toLowerCase().includes(kw)
        )
      })
    : isiRak

  // Baris tabel per No. RM (bukan per pasien) — hasil filter di atas dikelompokkan lagi.
  const grupRmTersaring = kelompokkanPerNoRm(isiRakTersaring)

  // Kalau modal detail grup RM sedang terbuka, pastikan datanya ikut ter-refresh
  // (mis. setelah edit/hapus pasien) dengan mencari ulang grup yang sama dari data terbaru.
  const grupRmDilihatTerbaru = grupRmDilihat
    ? grupRmTersaring.find((g) => g.kunci === grupRmDilihat.kunci) || null
    : null

  // Early-return AMAN di sini karena semua hooks (useState, useEffect) di atas
  // sudah selesai dipanggil terlebih dahulu, jadi jumlah hooks selalu konsisten
  // antar render — tidak melanggar Rules of Hooks.
  if (!show) return null

  // Halaman "Tambah Pasien" sedang aktif untuk rak ini -> tampilkan form
  // sebagai halaman tersendiri, menggantikan tampilan daftar rak.
  if (pasienRakBaru) {
    return (
      <FormTambahPasienRak
        rak={pasienRakBaru}
        editMode={!!editPasienRakId}
        form={formPasienRak}
        onChange={onChangeFormPasienRak}
        onSubmit={async (e) => {
          await onSubmitPasienRak(e)
          // setelah simpan, refresh daftar isi rak yang sedang dilihat
          if (rakDilihat?.id === pasienRakBaru.id) {
            const { data } = await supabase
              .from('pasien')
              .select('id, nama_lengkap, no_rekam_medis, no_kk, no_nik, no_bpjs, alamat, urutan_kk, status_keluarga, status_keluarga_lainnya, tempat_lahir, tanggal_lahir, pekerjaan, jenis_kelamin')
              .eq('rak_id', pasienRakBaru.id)
              .order('no_rekam_medis', { ascending: true })
            setIsiRak(data || [])
          }
        }}
        onCancel={onTutupTambahPasien}
        loading={pasienRakLoading}
        error={pasienRakError}
        anggotaKk={anggotaKkRak}
        onCekNoKk={onCekNoKkRak}
        cekKkLoading={cekKkRakLoading}
        onEditPasienRak={onEditPasienRak}
        onHapusPasienRak={onHapusPasienRak}
        refNama={refPasienRakNama}
        refNoRm={refPasienRakNoRm}
        refNik={refPasienRakNik}
        refTanggalLahir={refPasienRakTanggalLahir}
        refJenisKelamin={refPasienRakJenisKelamin}
        popupValidasi={popupValidasi}
        onTutupPopupValidasi={onTutupPopupValidasi}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-[98vw] max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h2 className="font-bold text-gray-800">🗄️ KELOLA RAK REKAM MEDIS</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-500 flex-1 min-w-[240px]">
              Buat kode rak sesuai cara Anda sendiri (mis. berdasarkan desa/dusun: <b>A-A0</b>,
              atau format lain seperti <b>RAK-1</b>). No. Rekam Medis akan dibuat otomatis
              dengan format <b>{'{kode_rak}'}-0001</b> dan seterusnya, mengikuti nomor urut
              tertinggi yang sudah ada di rak itu. Klik salah satu rak di daftar
              untuk melihat isinya (daftar pasien yang tersimpan di rak itu).
            </p>
            {onSinkronSemua && (
              <button
                type="button"
                onClick={async () => {
                  setSinkronLoading(true)
                  await onSinkronSemua()
                  setSinkronLoading(false)
                }}
                disabled={sinkronLoading}
                title="Samakan nomor urut tiap rak dengan No. RM tertinggi yang benar-benar ada di data pasien, supaya No. RM otomatis berikutnya tidak lompat/dobel"
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 font-medium disabled:opacity-50 whitespace-nowrap"
              >
                {sinkronLoading ? 'Menyinkronkan...' : '🔄 Sinkronkan Nomor Urut'}
              </button>
            )}
          </div>

          {rakError && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs">
              {rakError}
            </div>
          )}

          {/* Form tambah / edit rak */}
          <form onSubmit={onSubmit} className="border rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Kode Rak <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={rakForm.kode_rak}
                  onChange={(e) => setRakForm((p) => ({ ...p, kode_rak: e.target.value }))}
                  placeholder="mis. A.A0"
                  className="w-full border rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nama / Keterangan
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={rakForm.nama_rak}
                  onChange={(e) => setRakForm((p) => ({ ...p, nama_rak: e.target.value }))}
                  placeholder="mis. Dusun 1"
                  className="w-full border rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={rakLoading}
                className="flex-1 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {rakLoading ? 'Menyimpan...' : rakForm.id ? 'Simpan Perubahan' : '+ Tambah Rak'}
              </button>
              {rakForm.id && (
                <button
                  type="button"
                  onClick={() => setRakForm({ id: null, kode_rak: '', nama_rak: '' })}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs"
                >
                  Batal
                </button>
              )}
            </div>
          </form>

          {/* Grid daftar rak — tiap kotak: kode, nama, jumlah pasien */}
          <div className="grid grid-cols-4 gap-2">
            {rakList.length === 0 && (
              <p className="col-span-4 text-xs text-gray-400 text-center py-4">Belum ada rak. Tambahkan di atas.</p>
            )}
            {rakList.map((r) => {
              const aktif = rakDilihat?.id === r.id
              return (
                <div
                  key={r.id}
                  onClick={() => lihatIsiRak(r)}
                  className={`relative border rounded-lg p-2 text-center cursor-pointer transition ${
                    aktif
                      ? 'border-teal-500 border-2 bg-teal-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <p className="text-xs font-semibold text-gray-700 truncate">{r.kode_rak}</p>
                  {r.nama_rak && (
                    <p className="text-[11px] text-gray-400 truncate">{r.nama_rak}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    {r.jumlah_pasien != null ? `${r.jumlah_pasien} pasien` : `Urut: ${r.nomor_urut_terakhir || 0}`}
                  </p>

                  {/* Tombol aksi per rak */}
                  <div
                    className="flex items-center justify-center gap-1 mt-1.5 flex-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onBukaTambahPasien(r)}
                      title="Tambah Pasien"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                    >
                      + Pasien
                    </button>
                    <button
                      onClick={() => onEdit(r)}
                      title="Edit rak"
                      className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(r.id)}
                      title="Hapus rak"
                      className="text-[10px] px-1.5 py-0.5 rounded border border-red-300 text-red-500 hover:bg-red-50"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Kolom pencarian global — lintas semua rak, terpisah dari grid rak */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={PCARE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-teal-600 hover:text-teal-700 hover:underline whitespace-nowrap"
                title="Buka PCare BPJS untuk cek keaktifan peserta (login akun Anda sendiri)"
              >
                🔎 Cek apakah BPJS aktif lewat PCare, login disini
              </a>
              <span className="text-gray-300 text-[11px]">|</span>
              <a
                href={EPUSKESMAS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-teal-600 hover:text-teal-700 hover:underline whitespace-nowrap"
                title="Buka e-Puskesmas untuk cek data pasien (login akun instansi Anda)"
              >
                🔎 Cek di e-Puskesmas
              </a>
            </div>
            <div className="relative w-64">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              <input
                type="text"
                value={kataKunciGlobal}
                onChange={(e) => setKataKunciGlobal(e.target.value)}
                placeholder="Cari nama, NIK, atau No. KK"
                className="w-full border rounded-lg pl-7 pr-2 py-1.5 text-xs bg-white"
              />
            </div>
          </div>

          {/* Hasil pencarian global */}
          {kataKunciGlobal.trim() && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500">
                Hasil pencarian: "{kataKunciGlobal.trim()}"
              </p>
              {pencarianGlobalLoading && (
                <p className="text-xs text-gray-400 py-2">Mencari...</p>
              )}
              {!pencarianGlobalLoading && hasilPencarianGlobal.length === 0 && (
                <p className="text-xs text-gray-400 py-2">Tidak ditemukan pasien yang cocok.</p>
              )}
              {!pencarianGlobalLoading && hasilPencarianGlobal.length > 0 && (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {hasilPencarianGlobal.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between bg-gray-50 border rounded-lg px-2.5 py-1.5 text-xs"
                    >
                      <div>
                        <p className="font-medium text-gray-700">{p.nama_lengkap}</p>
                        <p className="text-gray-400">
                          RM: {p.no_rekam_medis || '-'}
                          {p.no_nik ? ` · NIK ${p.no_nik}` : ''}
                          {p.no_kk ? ` · KK ${p.no_kk}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-gray-300 text-gray-500 shrink-0 ml-2">
                        Rak {p.rak_rm?.kode_rak || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tabel isi rak yang sedang diklik */}
          {rakDilihat && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                <p className="text-xs font-semibold text-gray-700">
                  Isi rak {rakDilihat.kode_rak}
                  {rakDilihat.nama_rak ? ` — ${rakDilihat.nama_rak}` : ''}
                </p>
                <div className="relative w-56">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                  <input
                    type="text"
                    value={kataKunciPasien}
                    onChange={(e) => setKataKunciPasien(e.target.value)}
                    placeholder="Cari di rak ini..."
                    className="w-full border rounded-lg pl-6 pr-2 py-1 text-[11px] bg-white"
                  />
                </div>
              </div>

              {isiRakError && (
                <div className="bg-red-50 border-b border-red-200 text-red-600 px-3 py-2 text-[11px]">
                  ⚠️ {isiRakError}
                </div>
              )}
              {isiRakLoading && (
                <p className="text-xs text-gray-400 py-3 text-center">Memuat isi rak...</p>
              )}
              {!isiRakLoading && !isiRakError && isiRak.length === 0 && (
                <p className="text-xs text-gray-400 py-3 text-center">Belum ada pasien tersimpan di rak ini.</p>
              )}
              {!isiRakLoading && isiRak.length > 0 && isiRakTersaring.length === 0 && (
                <p className="text-xs text-gray-400 py-3 text-center">Tidak ada pasien yang cocok dengan pencarian.</p>
              )}
              {!isiRakLoading && isiRakTersaring.length > 0 && (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full table-fixed text-[11px] border-collapse border-2 border-black">
                    <colgroup>
                      <col className="w-[8%]" />
                      <col className="w-[7%]" />
                      <col className="w-[13%]" />
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                      <col className="w-[15%]" />
                      <col className="w-[18%]" />
                      <col className="w-[4%]" />
                      <col className="w-[11%]" />
                    </colgroup>
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-center align-middle font-medium text-black px-2 py-1.5 uppercase border-2 border-black">NOMER REKAM MEDIS</th>
                        <th className="text-center align-middle font-medium text-black px-2 py-1.5 uppercase border-2 border-black">NOMER URUT DI KARTU KELUARGA</th>
                        <th className="text-center align-middle font-medium text-black px-2 py-1.5 uppercase border-2 border-black">NOMER KARTU KELUARGA</th>
                        <th className="text-center align-middle font-medium text-black px-2 py-1.5 uppercase border-2 border-black">NIK</th>
                        <th className="text-center align-middle font-medium text-black px-2 py-1.5 uppercase border-2 border-black">NO BPJS</th>
                        <th className="text-center align-middle font-medium text-black px-2 py-1.5 uppercase border-2 border-black">NAMA</th>
                        <th className="text-center align-middle font-medium text-black px-2 py-1.5 uppercase border-2 border-black">ALAMAT</th>
                        <th className="text-center align-middle font-medium text-black px-2 py-1.5 uppercase border-2 border-black">JENIS KELAMIN</th>
                        <th className="text-center align-middle font-medium text-black px-2 py-1.5 uppercase border-2 border-black">AKSI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupRmTersaring.map((g) => {
                        const p = g.wakil
                        const jumlah = g.anggota.length
                        return (
                          <tr key={g.kunci}>
                            <td className="px-2 py-1.5 truncate text-center align-middle text-black border-2 border-black" title={p.no_rekam_medis}>{p.no_rekam_medis || '-'}</td>
                            <td className="px-2 py-1.5 text-center align-middle border-2 border-black">
                              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-teal-100 text-teal-700 font-semibold text-[10px]">
                                {p.urutan_kk || '-'}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 truncate text-center align-middle text-black border-2 border-black" title={p.no_kk}>{p.no_kk || '-'}</td>
                            <td className="px-2 py-1.5 truncate text-center align-middle text-black border-2 border-black" title={p.no_nik}>{p.no_nik || '-'}</td>
                            <td className="px-2 py-1.5 truncate text-center align-middle text-black border-2 border-black" title={p.no_bpjs}>{p.no_bpjs || '-'}</td>
                            <td className="px-2 py-1.5 font-medium text-black truncate text-center align-middle border-2 border-black" title={p.nama_lengkap}>{p.nama_lengkap}</td>
                            <td className="px-2 py-1.5 truncate text-center align-middle text-black border-2 border-black" title={p.alamat}>{p.alamat || '-'}</td>
                            <td className="px-2 py-1.5 text-center align-middle text-black border-2 border-black">{p.jenis_kelamin === 'L' ? 'L' : p.jenis_kelamin === 'P' ? 'P' : '-'}</td>
                            <td className="px-2 py-1.5 text-center align-middle border-2 border-black">
                              <div className="flex flex-col gap-1 items-stretch">
                                <button
                                  type="button"
                                  onClick={() => setGrupRmDilihat(g)}
                                  title="Lihat semua pasien dengan No. RM ini"
                                  className="text-[10px] px-2 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold whitespace-nowrap"
                                >
                                  👁 Lihat Isi RM ({jumlah})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onEditPasienRak(rakDilihat, p)}
                                  className="text-[10px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                                >
                                  EDIT
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onTambahAnggotaGrup && onTambahAnggotaGrup(rakDilihat, p)}
                                  title="Tambah anggota baru ke grup No. RM ini"
                                  className="text-[10px] px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-semibold whitespace-nowrap"
                                >
                                  ➕ Tambah Anggota
                                </button>
                                {onPisahkanRmBaru && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (jumlah > 1) {
                                        window.alert(
                                          'Grup ini punya lebih dari satu anggota. Buka "👁 Lihat Isi RM" dulu, lalu pilih anggota yang mau dipisahkan.'
                                        )
                                        setGrupRmDilihat(g)
                                        return
                                      }
                                      setRakTujuanPisah(rakDilihat?.id || '')
                                      setPasienPisahDipilih(p)
                                    }}
                                    title="Pisahkan pasien ini ke No. RM baru (mis. anak yang sudah menikah). Riwayat pemeriksaan otomatis ikut ke RM baru."
                                    className="text-[10px] px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold whitespace-nowrap"
                                  >
                                    🔀 Pisah RM
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => bukaWizardPeriksa(p)}
                                  title="Periksa pasien ini (buka form pendaftaran)"
                                  className="text-[10px] px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white font-semibold whitespace-nowrap"
                                >
                                  🩺 PERIKSA
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleHapusPasien(p.id)}
                                  className="text-[10px] px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-semibold"
                                >
                                  HAPUS
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Wizard PERIKSA pasien dari tabel rak: 1) pilih Poli Tujuan, 2) pilih Dokter/PJ Ruangan
          yang bertugas di poli itu, 3) pilih kategori BPJS/Umum. Baru setelah lengkap,
          form pendaftaran dibuka lewat onPeriksaPasienRak. */}
      {pasienPeriksaDipilih && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          onClick={tutupWizardPeriksa}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-800 text-center mb-1">
              Periksa Pasien
            </p>
            <p className="text-xs text-gray-500 text-center mb-1 truncate" title={pasienPeriksaDipilih.nama_lengkap}>
              {pasienPeriksaDipilih.nama_lengkap}
            </p>
            {/* Indikator langkah */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {['poli', 'petugas', 'kategori'].map((lk, i) => (
                <span
                  key={lk}
                  className={`h-1.5 rounded-full transition-all ${
                    langkahPeriksa === lk
                      ? 'w-6 bg-teal-600'
                      : (['poli', 'petugas', 'kategori'].indexOf(langkahPeriksa) > i)
                        ? 'w-1.5 bg-teal-300'
                        : 'w-1.5 bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {/* Langkah 1: Poli Tujuan */}
            {langkahPeriksa === 'poli' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500 mb-1">Pilih poli tujuan:</p>
                {(!polis || polis.length === 0) && (
                  <p className="text-xs text-gray-400 text-center py-3">Belum ada poli yang ditambahkan admin instansi.</p>
                )}
                <div className="max-h-64 overflow-y-auto flex flex-col gap-2">
                  {(polis || []).map((poli) => (
                    <button
                      key={poli.id}
                      type="button"
                      onClick={() => {
                        setPoliPeriksaDipilih(poli)
                        setLangkahPeriksa('petugas')
                      }}
                      className="w-full py-2.5 px-3 rounded-xl border border-gray-200 text-left text-sm font-medium text-gray-700 hover:border-teal-500 hover:bg-teal-50"
                    >
                      {poli.nama_poli}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Langkah 2: Dokter / PJ Ruangan (difilter sesuai poli terpilih) */}
            {langkahPeriksa === 'petugas' && (() => {
              const daftarPetugas = (petugasPoliList || []).filter((pt) => pt.poli_id === poliPeriksaDipilih?.id)
              return (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Pilih dokter/PJ ruangan — {poliPeriksaDipilih?.nama_poli}:
                  </p>
                  {daftarPetugas.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-3">Belum ada nakes yang ditugaskan di poli ini.</p>
                  )}
                  <div className="max-h-64 overflow-y-auto flex flex-col gap-2">
                    {daftarPetugas.map((pt) => (
                      <button
                        key={pt.id}
                        type="button"
                        onClick={() => {
                          setPetugasPeriksaDipilih(pt)
                          setLangkahPeriksa('kategori')
                        }}
                        className="w-full py-2.5 px-3 rounded-xl border border-gray-200 text-left hover:border-teal-500 hover:bg-teal-50"
                      >
                        <span className="block text-sm font-medium text-gray-700">{pt.nama_lengkap}</span>
                        {pt.profesi && <span className="block text-[11px] text-gray-400">{pt.profesi}</span>}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLangkahPeriksa('poli')}
                    className="w-full mt-1 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                  >
                    ← Kembali pilih poli
                  </button>
                </div>
              )
            })()}

            {/* Langkah 3: Kategori BPJS/Umum */}
            {langkahPeriksa === 'kategori' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  {poliPeriksaDipilih?.nama_poli} — {petugasPeriksaDipilih?.nama_lengkap}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const p = pasienPeriksaDipilih
                    const poliId = poliPeriksaDipilih?.id
                    const petugasId = petugasPeriksaDipilih?.id
                    tutupWizardPeriksa()
                    onPeriksaPasienRak && onPeriksaPasienRak(p, poliId, petugasId, 'bpjs')
                  }}
                  className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700"
                >
                  BPJS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = pasienPeriksaDipilih
                    const poliId = poliPeriksaDipilih?.id
                    const petugasId = petugasPeriksaDipilih?.id
                    tutupWizardPeriksa()
                    onPeriksaPasienRak && onPeriksaPasienRak(p, poliId, petugasId, 'umum')
                  }}
                  className="w-full py-3 rounded-xl bg-gray-700 text-white font-semibold text-sm hover:bg-gray-800"
                >
                  UMUM
                </button>
                <button
                  type="button"
                  onClick={() => setLangkahPeriksa('petugas')}
                  className="w-full mt-1 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                >
                  ← Kembali pilih petugas
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={tutupWizardPeriksa}
              className="w-full mt-3 py-1.5 text-xs text-gray-400 hover:text-gray-600"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Modal detail: semua pasien dengan No. RM yang sama (satu keluarga) */}
      {grupRmDilihatTerbaru && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setGrupRmDilihat(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <div>
                <p className="font-bold text-gray-800 text-sm">
                  👨‍👩‍👧‍👦 Pasien dengan No. RM {grupRmDilihatTerbaru.no_rekam_medis || '-'}
                </p>
                <p className="text-[11px] text-gray-400">
                  {grupRmDilihatTerbaru.anggota.length} pasien tergabung dalam No. RM ini
                </p>
              </div>
              <button
                onClick={() => setGrupRmDilihat(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2">
              {grupRmDilihatTerbaru.anggota.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border rounded-lg px-3 py-2 text-xs gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                      {p.nama_lengkap}
                      {p.urutan_kk ? (
                        <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-teal-100 text-teal-700 font-semibold text-[10px] align-middle">
                          {p.urutan_kk}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-gray-400 truncate">
                      {labelStatusKeluarga(p.status_keluarga, p.status_keluarga_lainnya) || '-'}
                      {p.no_nik ? ` · NIK ${p.no_nik}` : ''}
                      {p.jenis_kelamin ? ` · ${p.jenis_kelamin}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setGrupRmDilihat(null)
                        onEditPasienRak(rakDilihat, p)
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGrupRmDilihat(null)
                        onTambahAnggotaGrup && onTambahAnggotaGrup(rakDilihat, p)
                      }}
                      title="Tambah anggota baru ke grup No. RM ini"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium whitespace-nowrap"
                    >
                      ➕ Tambah Anggota
                    </button>
                    {onPisahkanRmBaru && (
                      <button
                        type="button"
                        onClick={() => {
                          setRakTujuanPisah(rakDilihat?.id || '')
                          setPasienPisahDipilih(p)
                        }}
                        title="Pisahkan pasien ini ke No. RM baru (mis. anak yang sudah menikah). Riwayat pemeriksaan otomatis ikut ke RM baru."
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium whitespace-nowrap"
                      >
                        🔀 Pisah RM
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setGrupRmDilihat(null)
                        bukaWizardPeriksa(p)
                      }}
                      title="Periksa pasien ini (buka form pendaftaran)"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 hover:bg-green-100 font-medium whitespace-nowrap"
                    >
                      🩺 PERIKSA
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHapusPasien(p.id)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                    >
                      HAPUS
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dialog pilih rak tujuan untuk Pisah RM Baru */}
      {pasienPisahDipilih && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={() => !pisahLoading && setPasienPisahDipilih(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-800 mb-1">
              🔀 Pisahkan ke No. RM Baru
            </p>
            <p className="text-xs text-gray-500 mb-3">
              <b>{pasienPisahDipilih.nama_lengkap}</b> akan diberi No. RM baru dan tidak
              lagi tergabung dalam grup KK lama. Seluruh riwayat pemeriksaan pasien ini
              otomatis ikut pindah ke No. RM baru.
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Rak tujuan untuk No. RM baru
            </label>
            <select
              value={rakTujuanPisah}
              onChange={(e) => setRakTujuanPisah(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white mb-4"
            >
              <option value="">-- Pilih Rak --</option>
              {rakList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kode_rak}{r.nama_rak ? ` — ${r.nama_rak}` : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPasienPisahDipilih(null)}
                disabled={pisahLoading}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  setPisahLoading(true)
                  const noRmBaru = await onPisahkanRmBaru(pasienPisahDipilih, rakTujuanPisah)
                  setPisahLoading(false)
                  if (noRmBaru) {
                    window.alert(`Berhasil. No. RM baru: ${noRmBaru}`)
                    setPasienPisahDipilih(null)
                    setGrupRmDilihat(null)
                    await refreshIsiRakDilihat()
                  }
                }}
                disabled={pisahLoading || !rakTujuanPisah}
                className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {pisahLoading ? 'Memproses...' : 'Pisahkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KOMPONEN MANDIRI: Halaman Tambah Pasien di dalam Rak ────────
// Muncul menggantikan tampilan daftar rak saat petugas klik "+ Tambah
// Pasien" di panel isi rak. Berisi 7 field sesuai kebutuhan loket.
function FormTambahPasienRak({
  rak,
  editMode,
  form,
  onChange,
  onSubmit,
  onCancel,
  loading,
  error,
  anggotaKk,
  onCekNoKk,
  cekKkLoading,
  onEditPasienRak,
  onHapusPasienRak,
  refNama,
  refNoRm,
  refNik,
  refTanggalLahir,
  refJenisKelamin,
  popupValidasi,
  onTutupPopupValidasi,
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-2 p-5 border-b sticky top-0 bg-white">
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-sm shrink-0"
          >
            ← Kembali
          </button>
          <h2 className="font-bold text-gray-800 truncate">
            {editMode ? 'Edit Pasien' : 'Tambah Pasien'} — Rak {rak?.kode_rak}
          </h2>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs">
              {error}
            </div>
          )}

          {/* 3. Nomor KK */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nomor Kartu Keluarga (KK)</label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                name="no_kk"
                autoComplete="off"
                value={form.no_kk}
                onChange={onChange}
                onBlur={() => onCekNoKk(form.no_kk)}
                placeholder="16 digit No. KK (angka saja)"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => onCekNoKk(form.no_kk)}
                disabled={!form.no_kk?.trim() || cekKkLoading}
                className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40"
              >
                {cekKkLoading ? 'Mengecek...' : 'Cek KK'}
              </button>
            </div>
            {anggotaKk?.length > 0 && (
              <div className="mt-2 border border-teal-200 bg-teal-50 rounded-lg p-2.5 space-y-2">
                <p className="text-[11px] text-teal-700 font-medium">
                  Sudah ada {anggotaKk.length} anggota keluarga terdaftar dengan No. KK ini — No. Rekam Medis
                  otomatis disamakan.
                </p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {anggotaKk.map((p, idx) => (
                    <div key={p.id} className="bg-white rounded-lg border border-teal-100 overflow-hidden">
                      <div className="px-2.5 py-1.5 bg-teal-100/60 flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-700 text-xs">
                          {idx + 1}. {p.nama_lengkap}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {p.status_keluarga && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                              {labelStatusKeluarga(p.status_keluarga, p.status_keluarga_lainnya)}
                            </span>
                          )}
                          {onEditPasienRak && (
                            <button
                              type="button"
                              onClick={() => onEditPasienRak({ id: p.rak_id }, p)}
                              className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
                            >
                              Edit
                            </button>
                          )}
                          {onHapusPasienRak && (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await onHapusPasienRak(p.id)
                                if (ok) onCekNoKk(form.no_kk)
                              }}
                              className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>
                      <table className="w-full text-[11px]">
                        <tbody>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 w-28 align-top">Urut KK</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.urutan_kk || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">No. RM</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.no_rekam_medis || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">NIK</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.no_nik || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">BPJS</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.no_bpjs || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">Alamat</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.alamat || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">Jenis Kelamin</td>
                            <td className="px-2.5 py-1 text-gray-700">
                              {p.jenis_kelamin === 'L' ? 'Laki-laki' : p.jenis_kelamin === 'P' ? 'Perempuan' : '-'}
                            </td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">Lahir</td>
                            <td className="px-2.5 py-1 text-gray-700">
                              {p.tempat_lahir || p.tanggal_lahir
                                ? `${p.tempat_lahir ? p.tempat_lahir + ', ' : ''}${p.tanggal_lahir || ''}`
                                : '-'}
                            </td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">Pekerjaan</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.pekerjaan || '-'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 1. Nomor Rekam Medis */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nomor Rekam Medis <span className="text-red-500">*</span>
            </label>
            {form.rm_terkunci ? (
              <p className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5 mb-1.5">
                🔗 Digabung ke grup No. RM ini — nomor tidak bisa diubah.
              </p>
            ) : (
              <div className="flex gap-2 mb-1.5">
                <button
                  type="button"
                  onClick={() => onChange({ target: { name: 'mode_rm', value: 'otomatis' } })}
                  className={`text-[11px] px-2 py-1 rounded-lg border ${
                    form.mode_rm === 'otomatis'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  Otomatis
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ target: { name: 'mode_rm', value: 'manual' } })}
                  className={`text-[11px] px-2 py-1 rounded-lg border ${
                    form.mode_rm === 'manual'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  Manual
                </button>
              </div>
            )}
            <input
              type="text"
              name="no_rekam_medis"
              autoComplete="off"
              ref={refNoRm}
              value={form.no_rekam_medis}
              onChange={onChange}
              readOnly={form.mode_rm === 'otomatis' || form.rm_terkunci}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${
                form.mode_rm === 'otomatis' || form.rm_terkunci ? 'bg-gray-50 text-gray-500' : ''
              }`}
            />
          </div>

          {/* 2. Nomor Urut di KK */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nomor Urut di Kartu Keluarga (KK)
            </label>
            <input
              type="number"
              min="1"
              name="urutan_kk"
              autoComplete="off"
              value={form.urutan_kk}
              onChange={onChange}
              placeholder="mis. 1 = kepala keluarga"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Status dalam Keluarga */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Status dalam Keluarga
            </label>
            <select
              name="status_keluarga"
              value={form.status_keluarga}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              {OPSI_STATUS_KELUARGA.map((opsi) => (
                <option key={opsi.value} value={opsi.value}>
                  {opsi.label}
                </option>
              ))}
            </select>
            {form.status_keluarga === 'lainnya' && (
              <input
                type="text"
                name="status_keluarga_lainnya"
                autoComplete="off"
                value={form.status_keluarga_lainnya}
                onChange={onChange}
                placeholder="Ketik status dalam keluarga"
                className="w-full border rounded-lg px-3 py-2 text-sm mt-2"
              />
            )}
          </div>

          {/* 7. Nama Pasien */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nama Pasien <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nama_lengkap"
              autoComplete="off"
              ref={refNama}
              value={form.nama_lengkap}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* 4. Nomor KTP (NIK) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nomor Kartu Tanda Penduduk (KTP) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              name="no_nik"
              autoComplete="off"
              ref={refNik}
              value={form.no_nik}
              onChange={onChange}
              placeholder="16 digit NIK (angka saja)"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Tempat & Tanggal Lahir */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tempat Lahir</label>
              <input
                type="text"
                name="tempat_lahir"
                autoComplete="off"
                value={form.tempat_lahir}
                onChange={onChange}
                placeholder="mis. Makassar"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div ref={refTanggalLahir} tabIndex={-1}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tanggal Lahir <span className="text-red-500">*</span>
              </label>
              <DatePickerLahir
                name="tanggal_lahir"
                value={form.tanggal_lahir}
                onChange={onChange}
              />
              {form.tanggal_lahir && (
                <p className="text-[11px] text-teal-600 mt-1">{hitungUmur(form.tanggal_lahir)}</p>
              )}
            </div>
          </div>

          {/* Jenis Kelamin */}
          <div ref={refJenisKelamin} tabIndex={-1}>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Jenis Kelamin <span className="text-red-500">*</span>
            </label>
            <select
              name="jenis_kelamin"
              value={form.jenis_kelamin}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">-- Pilih --</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>

          {/* Pekerjaan */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pekerjaan</label>
            <input
              type="text"
              name="pekerjaan"
              autoComplete="off"
              value={form.pekerjaan}
              onChange={onChange}
              placeholder="mis. Petani, Wiraswasta, Pelajar"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* 5. Nomor BPJS */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nomor BPJS</label>
            <input
              type="text"
              name="no_bpjs"
              autoComplete="off"
              value={form.no_bpjs}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* 6. Alamat Pasien */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Alamat Pasien</label>
            <textarea
              name="alamat"
              value={form.alamat}
              onChange={onChange}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : editMode ? 'Simpan Perubahan' : 'Simpan Pasien'}
            </button>
          </div>
        </form>
      </div>

      {/* Popup validasi field wajib — muncul saat Simpan diklik tapi ada
          field wajib yang kosong/tidak valid. Fokus ke field baru dijalankan
          setelah tombol OK diklik. */}
      {popupValidasi && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">⚠️</span>
              <div>
                <p className="font-semibold text-gray-800 mb-1">Data belum lengkap</p>
                <p className="text-sm text-gray-600">{popupValidasi.pesan}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onTutupPopupValidasi()
                // beri jeda sedikit supaya popup benar-benar tertutup dulu
                // sebelum fokus dipindah, khususnya untuk field DatePickerLahir
                setTimeout(() => popupValidasi.fokusKe(), 50)
              }}
              className="mt-4 w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}