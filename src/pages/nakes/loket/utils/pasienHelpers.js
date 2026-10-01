// ────────────────────────────────────────────────────────────────
// Helper functions & konstanta yang dipakai bersama oleh
// DashboardLoket, ModalKelolaRak, FormTambahPasienRak, dan
// TabelRiwayatPemeriksaan. Dipisah dari DashboardLoket.jsx supaya
// tidak duplikat & lebih gampang di-maintain.
// ────────────────────────────────────────────────────────────────

// tanggalAcuan opsional: tanggal yang jadi acuan hitung umur (mis. tanggal
// kunjungan/periksa). Kalau tidak diisi, default ke hari ini — supaya
// pemanggil lama (form pendaftaran, dsb.) yang butuh umur saat ini tetap
// jalan tanpa perubahan.
export function hitungUmur(tanggalLahir, tanggalAcuan) {
  if (!tanggalLahir) return ''
  const lahir = new Date(tanggalLahir)
  const acuan = tanggalAcuan ? new Date(tanggalAcuan) : new Date()

  let tahun = acuan.getFullYear() - lahir.getFullYear()
  let bulan = acuan.getMonth() - lahir.getMonth()
  let hari = acuan.getDate() - lahir.getDate()

  if (hari < 0) {
    bulan--
    const hariDibulanLalu = new Date(acuan.getFullYear(), acuan.getMonth(), 0).getDate()
    hari += hariDibulanLalu
  }
  if (bulan < 0) {
    tahun--
    bulan += 12
  }

  return `${tahun} Tahun ${bulan} Bulan ${hari} Hari`
}

// Hitung umur dalam tahun (angka) untuk kategorisasi.
// tanggalAcuan opsional, sama seperti hitungUmur() di atas.
export function hitungUmurTahun(tanggalLahir, tanggalAcuan) {
  if (!tanggalLahir) return null
  const lahir = new Date(tanggalLahir)
  const acuan = tanggalAcuan ? new Date(tanggalAcuan) : new Date()
  let tahun = acuan.getFullYear() - lahir.getFullYear()
  const belumUlangTahun =
    acuan.getMonth() < lahir.getMonth() ||
    (acuan.getMonth() === lahir.getMonth() && acuan.getDate() < lahir.getDate())
  if (belumUlangTahun) tahun--
  return tahun
}

// FITUR 9: Kategori umur otomatis. tanggalAcuan opsional, sama seperti di atas.
export function kategoriUmur(tanggalLahir, tanggalAcuan) {
  const umur = hitungUmurTahun(tanggalLahir, tanggalAcuan)
  if (umur === null) return { label: '', warna: '' }
  if (umur < 5) return { label: 'Balita', warna: 'bg-pink-100 text-pink-700' }
  if (umur < 12) return { label: 'Anak', warna: 'bg-yellow-100 text-yellow-700' }
  if (umur < 18) return { label: 'Remaja', warna: 'bg-green-100 text-green-700' }
  if (umur < 60) return { label: 'Dewasa', warna: 'bg-blue-100 text-blue-700' }
  return { label: 'Lansia', warna: 'bg-orange-100 text-orange-700' }
}

// FITUR 6: Validasi NIK otomatis
export function validasiNik(nik) {
  if (!nik) return { status: 'kosong', pesan: '' }
  if (!/^\d+$/.test(nik)) return { status: 'invalid', pesan: 'NIK hanya boleh berisi angka' }
  if (nik.length !== 16) return { status: 'invalid', pesan: `NIK harus 16 digit (saat ini ${nik.length} digit)` }
  return { status: 'valid', pesan: 'NIK valid' }
}

// Deteksi apakah NIK yang diinput memakai format placeholder (bukan NIK asli):
// - 'belum_terbit' : angka 9 diulang 16 kali (usia 0-17 tahun, NIK belum terbit)
// - 'lupa'         : angka 9 diulang 15 kali lalu diakhiri angka 6 (usia 18+, NIK lupa/tidak diketahui)
// Dipakai untuk memunculkan & mewajibkan field NIK Pendamping di form.
export function cekNikPlaceholder(nik) {
  if (!nik) return null
  if (/^9{16}$/.test(nik)) return 'belum_terbit'
  if (/^9{15}6$/.test(nik)) return 'lupa'
  return null
}

// Generate nomor rekam medis otomatis
export function generateNoRM() {
  const now = new Date()
  const thn = now.getFullYear().toString().slice(-2)
  const bln = String(now.getMonth() + 1).padStart(2, '0')
  const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0')
  return `RM${thn}${bln}${random}`
}

export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// Link resmi PCare BPJS Kesehatan untuk cek keaktifan peserta.
// Nakes/petugas login sendiri pakai akun PCare masing-masing di sana.
export const PCARE_URL = 'https://pcarejkn.bpjs-kesehatan.go.id/eclaim/Login'

// Link e-Puskesmas (Infokes) khusus instansi Kabupaten Gowa.
// e-Puskesmas berbasis subdomain per kabupaten/kota (tidak ada portal
// login umum lintas daerah), jadi diarahkan langsung ke subdomain Gowa.
export const EPUSKESMAS_URL = 'https://gowa.epuskesmas.id/'

// Menentukan apakah pasien dikenakan tarif retribusi (Perda) di loket:
// - kategori 'umum' -> selalu kena retribusi
// - kategori 'bpjs' & status_bpjs_aktif === false -> kena retribusi (BPJS tidak aktif)
// - kategori 'bpjs' & status_bpjs_aktif === true  -> tidak kena (ditanggung BPJS)
// - kategori 'bpjs' & status_bpjs_aktif belum dicek (null) -> anggap belum bisa
//   ditentukan, form akan minta petugas mengecek dulu sebelum submit.
// - kategori 'asuransi_lainnya' (mis. Jasa Raharja) -> tidak kena retribusi
//   loket, karena biaya ditanggung penjamin (sama seperti BPJS aktif).
export function perluRetribusi(form) {
  if (form.kategori_pasien === 'umum') return true
  if (form.kategori_pasien === 'bpjs') return form.status_bpjs_aktif === false
  if (form.kategori_pasien === 'asuransi_lainnya') return false
  return false
}

// Kategori pasien (cara pembayaran). Satu sumber kebenaran supaya badge,
// tombol pilihan, dan label statistik tidak hardcode sendiri-sendiri.
// Sesuai pedoman: JKN, Mandiri (umum), Asuransi lainnya.
export const OPSI_KATEGORI_PASIEN = [
  { value: 'bpjs', label: 'BPJS', labelPanjang: '🏥 BPJS / JKN', badge: 'bg-blue-100 text-blue-700', tombol: 'bg-blue-600 hover:bg-blue-700' },
  { value: 'umum', label: 'Umum', labelPanjang: '💵 Umum / Mandiri', badge: 'bg-teal-100 text-teal-700', tombol: 'bg-teal-600 hover:bg-teal-700' },
  { value: 'asuransi_lainnya', label: 'Asuransi Lainnya', labelPanjang: '🛡️ Asuransi Lainnya', badge: 'bg-purple-100 text-purple-700', tombol: 'bg-purple-600 hover:bg-purple-700' },
]

export function labelKategoriPasien(value) {
  return OPSI_KATEGORI_PASIEN.find((o) => o.value === value)?.label || (value ? value.toUpperCase() : '')
}

export function badgeKategoriPasien(value) {
  return OPSI_KATEGORI_PASIEN.find((o) => o.value === value)?.badge || 'bg-gray-100 text-gray-400'
}

// Kategori Pekerjaan (KBJI). Value disimpan ke kolom pasien.pekerjaan
// (teks) memakai label-nya, supaya data lama teks bebas tetap terbaca
// dan laporan/Kartu RM tidak menampilkan kode internal.
export const OPSI_PEKERJAAN = [
  { value: '', label: 'Pilih Pekerjaan' },
  { value: 'Tidak/Belum Bekerja', label: 'Tidak/Belum Bekerja' },
  { value: 'Pelajar/Mahasiswa', label: 'Pelajar/Mahasiswa' },
  { value: 'Mengurus Rumah Tangga', label: 'Mengurus Rumah Tangga' },
  { value: 'Pensiunan', label: 'Pensiunan' },
  { value: 'PNS/ASN', label: 'PNS/ASN' },
  { value: 'TNI/Polri', label: 'TNI/Polri' },
  { value: 'Karyawan Swasta', label: 'Karyawan Swasta' },
  { value: 'Karyawan BUMN/BUMD', label: 'Karyawan BUMN/BUMD' },
  { value: 'Wiraswasta', label: 'Wiraswasta' },
  { value: 'Petani/Pekebun', label: 'Petani/Pekebun' },
  { value: 'Nelayan/Perikanan', label: 'Nelayan/Perikanan' },
  { value: 'Buruh', label: 'Buruh' },
  { value: 'Guru/Dosen', label: 'Guru/Dosen' },
  { value: 'Tenaga Kesehatan', label: 'Tenaga Kesehatan' },
  { value: 'Pedagang', label: 'Pedagang' },
  { value: 'Sopir/Transportasi', label: 'Sopir/Transportasi' },
  { value: 'Lainnya', label: 'Lainnya' },
]

// Data lama disimpan sebagai teks bebas (mis. "PETANI", "Asn"). Cocokkan tanpa
// peduli huruf besar/kecil supaya nilai lama tetap terpilih di dropdown. Kalau
// tidak ada yang cocok, kembalikan teks aslinya agar tidak hilang diam-diam
// (form menampilkannya sebagai opsi tambahan).
export function normalisasiPekerjaan(nilai) {
  if (!nilai) return ''
  const t = String(nilai).trim().toLowerCase()
  const cocok = OPSI_PEKERJAAN.find((o) => o.value && o.value.toLowerCase() === t)
  return cocok ? cocok.value : String(nilai).trim()
}

export const FORM_AWAL = {
  kategori_pasien: '',
  status_bpjs_aktif: null, // true/false, dicek manual petugas (PCare) saat kategori_pasien='bpjs'. null jika belum dicek / kategori umum.
  no_rekam_medis: '',
  mode_rm: 'otomatis',
  tanggal_periksa: todayStr(),
  nama_lengkap: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  pekerjaan: '',
  alamat: '',
  no_nik: '',
  no_bpjs: '',
  no_asuransi: '', // Nomor kartu/polis, wajib jika kategori_pasien='asuransi_lainnya'
  nama_asuransi: '', // Nama asuransi (mis. Jasa Raharja), wajib jika kategori_pasien='asuransi_lainnya'
  no_kk: '', // Nomor Kartu Keluarga — dipakai untuk menyatukan No. RM satu keluarga
  nama_kepala_keluarga: '', // Nama kepala keluarga (KK) — untuk dicetak di Kartu Rekam Medis
  urutan_kk: '', // Urutan anggota keluarga (1,2,3,...) — beda dari no_kk
  rak_id: '', // Rak Rekam Medis — lokasi fisik penyimpanan berkas RM
  wilayah: '',
  poli_id: '',
  petugas_poli_id: '', // dokter/PJ ruangan yang bertugas di poli tujuan, dipilih saat pendaftaran
  status_prioritas: '', // FITUR 8
  pasien_id_existing: null, // dipakai saat memilih pasien lama
  dari_periksa_rak: false, // true = form dibuka lewat wizard "Periksa Pasien" (poli/petugas/kategori/status BPJS sudah ditentukan di wizard, field-nya disembunyikan di form)
}

export const FORM_PASIEN_RAK_AWAL = {
  no_rekam_medis: '',
  mode_rm: 'otomatis',
  rm_terkunci: false, // true = No. RM dikunci karena "Tambah Anggota" ke grup RM yang sudah ada
  urutan_kk: '',
  no_kk: '',
  status_keluarga: '',
  status_keluarga_lainnya: '',
  no_nik: '',
  no_nik_pendamping: '', // NIK ayah/ibu/wali yang cakap — diisi jika pasien belum punya NIK sendiri
  nama_ibu_kandung: '', // identifier tambahan pasien — bisa diisi manual atau otomatis dari anggota KK berstatus Ibu
  kewarganegaraan: 'WNI',
  no_telepon: '',
  no_telepon_pengantar: '', // Hanya diisi saat is_bayi_baru_lahir = true
  golongan_darah: '',
  foto_url: '', // URL foto pasien di Supabase Storage (opsional)
  no_bpjs: '',
  alamat: '',
  nama_lengkap: '',
  nama_kepala_keluarga: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  pekerjaan: '',
  agama: '',
  pendidikan: '',
  status_perkawinan: '',
}

export const OPSI_KEWARGANEGARAAN = [
  { value: 'WNI', label: 'WNI' },
  { value: 'WNA', label: 'WNA' },
]

export const OPSI_GOLONGAN_DARAH = [
  { value: '', label: 'Tidak Tahu / Belum Diperiksa' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'AB', label: 'AB' },
  { value: 'O', label: 'O' },
]

export const OPSI_AGAMA = [
  { value: '', label: 'Pilih Agama' },
  { value: 'islam', label: 'Islam' },
  { value: 'kristen', label: 'Kristen/Protestan' },
  { value: 'katolik', label: 'Katolik' },
  { value: 'hindu', label: 'Hindu' },
  { value: 'buddha', label: 'Buddha' },
  { value: 'konghucu', label: 'Konghucu' },
  { value: 'lainnya', label: 'Lainnya' },
]

export const OPSI_PENDIDIKAN = [
  { value: '', label: 'Pilih Pendidikan' },
  { value: 'tidak_sekolah', label: 'Tidak/Belum Sekolah' },
  { value: 'sd', label: 'SD/Sederajat' },
  { value: 'smp', label: 'SMP/Sederajat' },
  { value: 'sma', label: 'SMA/Sederajat' },
  { value: 'diploma', label: 'Diploma (D1-D3)' },
  { value: 's1', label: 'S1/Sederajat' },
  { value: 's2', label: 'S2' },
  { value: 's3', label: 'S3' },
]

export const OPSI_STATUS_PERKAWINAN = [
  { value: '', label: 'Pilih Status Perkawinan' },
  { value: 'belum_kawin', label: 'Belum Kawin' },
  { value: 'kawin', label: 'Kawin' },
  { value: 'cerai_hidup', label: 'Cerai Hidup' },
  { value: 'cerai_mati', label: 'Cerai Mati' },
]

export const OPSI_STATUS_KELUARGA = [
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
export function labelStatusKeluarga(value, teksLainnya) {
  if (value === 'lainnya') return teksLainnya || 'Lainnya'
  return OPSI_STATUS_KELUARGA.find((o) => o.value === value)?.label || ''
}

export const OPSI_PRIORITAS = [
  { value: '', label: 'Tidak Ada', icon: '⬜' },
  { value: 'lansia', label: 'Lansia', icon: '🧓' },
  { value: 'ibu_hamil', label: 'Ibu Hamil', icon: '🤰' },
  { value: 'disabilitas', label: 'Disabilitas', icon: '♿' },
  { value: 'gawat_darurat', label: 'Gawat Darurat', icon: '🚨' },
]