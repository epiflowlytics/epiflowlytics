import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import AntrianDisplay from './AntrianDisplay'
import CekAntrian from './CekAntrian'
import DatePickerLahir from './DatePickerLahir'
import TabelRiwayatPemeriksaan from './TabelRiwayatPemeriksaan'
import ModalKelolaRak from './ModalKelolaRak'
import ModalRetribusi from './ModalRetribusi'
import RiwayatPendaftaran from './RiwayatPendaftaran'
import {
  hitungUmur,
  kategoriUmur,
  validasiNik,
  generateNoRM,
  todayStr,
  FORM_AWAL,
  FORM_PASIEN_RAK_AWAL,
  OPSI_PRIORITAS,
  PCARE_URL,
  EPUSKESMAS_URL,
  perluRetribusi,
} from './utils/pasienHelpers'

/* ────────────────────────────────────────────────────────────────
   CATATAN SKEMA DATABASE YANG DIBUTUHKAN (silakan sesuaikan)
   - Tabel `kunjungan` sebaiknya punya kolom baru:
       status_prioritas  text  (nullable) -> '', 'lansia', 'ibu_hamil', 'disabilitas', 'gawat_darurat'
   - Tabel `profiles` diasumsikan punya kolom `nama_lengkap` untuk
     ditampilkan di "Monitoring Loket". Sesuaikan nama kolom bila beda.
   - Disarankan menambah index di tabel `pasien` pada kolom:
       no_nik, no_rekam_medis, no_bpjs, nama_lengkap (untuk pencarian cepat)
   ──────────────────────────────────────────────────────────────── */

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
  const [showModalRetribusi, setShowModalRetribusi] = useState(false)
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
      fetchTarifLoket(data.instansi_id)
    }
  }

  // Tarif retribusi loket (karcis umum) — dipakai untuk membuat tagihan
  // otomatis saat pasien umum / BPJS tidak aktif. Nominal diatur admin
  // instansi di menu "Kelola Tarif Retribusi", bisa berubah kapan saja.
  const [tarifLoket, setTarifLoket] = useState([])
  async function fetchTarifLoket(instansiId) {
    const { data, error } = await supabase
      .from('tarif_retribusi')
      .select('id, nama_layanan, nominal')
      .eq('instansi_id', instansiId)
      .eq('jenis_titik', 'loket')
      .eq('is_active', true)
    if (error) {
      console.error('Error fetch tarif loket:', error.message)
      return
    }
    setTarifLoket(data || [])
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
        nama_kepala_keluarga: pasienEdit.nama_kepala_keluarga || '',
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
      .select('id, nama_lengkap, nama_kepala_keluarga, no_rekam_medis, urutan_kk, status_keluarga, status_keluarga_lainnya, no_nik, no_bpjs, alamat, tempat_lahir, tanggal_lahir, pekerjaan, jenis_kelamin, rak_id')
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
          nama_kepala_keluarga: formPasienRak.nama_kepala_keluarga.trim() || null,
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
        nama_kepala_keluarga: formPasienRak.nama_kepala_keluarga.trim() || null,
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
        // Kategori pasien (BPJS/Umum) belum relevan di tahap catat biodata ini —
        // baru benar-benar ditentukan saat pasien mendaftar kunjungan di loket.
        // Kolom ini NOT NULL di database, jadi diisi default 'umum' supaya tidak gagal;
        // nanti akan ditimpa/dipilih ulang saat pendaftaran kunjungan sesungguhnya.
        kategori_pasien: 'umum',
        wilayah: 'dalam',
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
      tempat_lahir: pasienTerpilih.tempat_lahir || '',
      tanggal_lahir: pasienTerpilih.tanggal_lahir || '',
      jenis_kelamin: pasienTerpilih.jenis_kelamin || '',
      pekerjaan: pasienTerpilih.pekerjaan || '',
      alamat: pasienTerpilih.alamat || '',
      no_nik: pasienTerpilih.no_nik || '',
      no_bpjs: pasienTerpilih.no_bpjs || '',
      no_kk: pasienTerpilih.no_kk || '',
      nama_kepala_keluarga: pasienTerpilih.nama_kepala_keluarga || '',
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
  async function periksaPasienDariRak(pasien, poliId, petugasPoliId, kategori, statusBpjsAktif = null) {
    setForm({
      ...FORM_AWAL,
      kategori_pasien: kategori,
      status_bpjs_aktif: kategori === 'bpjs' ? statusBpjsAktif : null,
      dari_periksa_rak: true,
      tanggal_periksa: todayStr(),
      no_rekam_medis: pasien.no_rekam_medis || generateNoRM(),
      mode_rm: pasien.no_rekam_medis ? 'manual' : 'otomatis',
      nama_lengkap: pasien.nama_lengkap || '',
      tempat_lahir: pasien.tempat_lahir || '',
      tanggal_lahir: pasien.tanggal_lahir || '',
      jenis_kelamin: pasien.jenis_kelamin || '',
      pekerjaan: pasien.pekerjaan || '',
      alamat: pasien.alamat || '',
      no_nik: pasien.no_nik || '',
      no_bpjs: pasien.no_bpjs || '',
      no_kk: pasien.no_kk || '',
      nama_kepala_keluarga: pasien.nama_kepala_keluarga || '',
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
      tempat_lahir: pasienLama.tempat_lahir || prev.tempat_lahir,
      tanggal_lahir: pasienLama.tanggal_lahir || prev.tanggal_lahir,
      jenis_kelamin: pasienLama.jenis_kelamin || prev.jenis_kelamin,
      pekerjaan: pasienLama.pekerjaan || prev.pekerjaan,
      alamat: pasienLama.alamat || prev.alamat,
      no_bpjs: pasienLama.no_bpjs || prev.no_bpjs,
      no_kk: pasienLama.no_kk || prev.no_kk,
      nama_kepala_keluarga: pasienLama.nama_kepala_keluarga || prev.nama_kepala_keluarga,
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
      .maybeSingle()

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
  //
  // CATATAN: nilai nomor_urut_terakhir SELALU dibaca ulang langsung dari
  // database di sini (bukan dari state React `rakList`), karena state bisa
  // basi/telat ter-update setelah sinkronkanNomorUrutRak() dipanggil tepat
  // sebelumnya — kalau dibaca dari state yang basi, guard .eq() di bawah
  // tidak akan cocok dan update gagal (0 baris berubah -> error 406 dari
  // .single() karena PostgREST mengharapkan tepat 1 baris hasil).
  async function generateNoRmDariRak(rakId) {
    const rak = rakList.find((r) => r.id === rakId)
    if (!rak) return ''

    // Ambil nilai TERBARU langsung dari DB, bukan dari state lokal yang bisa basi.
    const { data: rakTerbaru, error: rakErr } = await supabase
      .from('rak_rm')
      .select('nomor_urut_terakhir')
      .eq('id', rakId)
      .maybeSingle()

    if (rakErr || !rakTerbaru) {
      console.error('Gagal membaca nomor_urut_terakhir terbaru:', rakErr?.message)
      return ''
    }

    const nilaiSaatIni = rakTerbaru.nomor_urut_terakhir || 0

    const { data, error } = await supabase
      .from('rak_rm')
      .update({ nomor_urut_terakhir: nilaiSaatIni + 1 })
      .eq('id', rakId)
      .eq('nomor_urut_terakhir', nilaiSaatIni) // guard sederhana thd race condition
      .select('nomor_urut_terakhir')
      .maybeSingle()

    let nomorBaru
    if (error || !data) {
      // fallback kalau guard gagal (ada perubahan bersamaan): ambil ulang nilai terbaru
      const { data: ulang } = await supabase
        .from('rak_rm')
        .select('nomor_urut_terakhir')
        .eq('id', rakId)
        .maybeSingle()
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
      if (!form.kategori_pasien) throw new Error('Kategori pasien (Umum/BPJS) wajib dipilih.')
      if (form.kategori_pasien === 'bpjs' && form.status_bpjs_aktif === null) {
        throw new Error('Status keaktifan BPJS wajib dicek dan dipilih (Aktif / Tidak Aktif) terlebih dahulu.')
      }
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

      // Payload biodata pasien — dipakai baik untuk INSERT (pasien benar-benar
      // baru) maupun UPDATE (pasien sudah ada, tapi loket melengkapi/mengoreksi
      // data seperti Tempat Lahir, Pekerjaan, Nama Kepala Keluarga saat
      // pendaftaran ulang). Tanpa UPDATE ini, apa pun yang diketik di form untuk
      // pasien lama tidak pernah tersimpan ke tabel `pasien` dan tetap tampil
      // strip (-) di Kartu Rekam Medis.
      const biodataPasien = {
        nama_lengkap: form.nama_lengkap.trim(),
        tempat_lahir: form.tempat_lahir.trim() || null,
        tanggal_lahir: form.tanggal_lahir,
        jenis_kelamin: form.jenis_kelamin,
        pekerjaan: form.pekerjaan.trim() || null,
        alamat: form.alamat.trim() || null,
        no_nik: form.no_nik.trim() || null,
        no_bpjs: form.no_bpjs.trim() || null,
        no_kk: form.no_kk.trim() || null,
        nama_kepala_keluarga: form.nama_kepala_keluarga.trim() || null,
      }

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
              rak_id: form.rak_id || null,
              kategori_pasien: form.kategori_pasien,
              wilayah: form.wilayah,
              ...biodataPasien,
            })
            .select()
            .single()

          if (pasienErr) throw new Error(pasienErr.message)
          pasienId = pasienData.id
        }
      }

      // Pasien sudah ada (ditemukan lewat No. RM, Pasien Lama, atau NIK) ->
      // update biodatanya dengan nilai yang ada di form sekarang, supaya
      // koreksi/pelengkapan data (mis. Tempat Lahir, Pekerjaan, Nama Kepala
      // Keluarga yang tadinya kosong) benar-benar tersimpan dan langsung
      // muncul di Kartu Rekam Medis.
      if (pasienId && (form.pasien_id_existing || form.no_rekam_medis.trim())) {
        const { error: updateBiodataErr } = await supabase
          .from('pasien')
          .update(biodataPasien)
          .eq('id', pasienId)
        if (updateBiodataErr) throw new Error(updateBiodataErr.message)
      }

      const nomorAntrian = await generateNomorAntrian(form.poli_id, form.tanggal_periksa)

      const { error: kunjunganErr, data: kunjunganData } = await supabase
        .from('kunjungan')
        .insert({
          instansi_id: profile.instansi_id,
          pasien_id: pasienId,
          poli_id: form.poli_id,
          petugas_poli_id: form.petugas_poli_id || null,
          loket_id: profile.id,
          tanggal_periksa: form.tanggal_periksa,
          kategori_pasien: form.kategori_pasien,
          status_bpjs_aktif: form.kategori_pasien === 'bpjs' ? form.status_bpjs_aktif : null,
          wilayah: form.wilayah,
          status: 'menunggu',
          nomor_antrian: nomorAntrian,
          status_panggil: 'menunggu',
          status_prioritas: form.status_prioritas || null,
        })
        .select()
        .single()

      if (kunjunganErr) throw new Error(kunjunganErr.message)

      // Retribusi: kalau pasien Umum atau BPJS-tidak-aktif, catat tagihan
      // loket otomatis (snapshot nominal saat ini, akumulatif dengan
      // tagihan poli/lab yang akan ditambahkan nanti untuk kunjungan yang
      // sama). Kegagalan di sini tidak membatalkan pendaftaran — hanya
      // dicatat sebagai peringatan, supaya antrian pasien tidak tersendat.
      let totalTagihanLoket = 0
      if (perluRetribusi(form) && tarifLoket.length > 0) {
        const baris = tarifLoket.map((t) => ({
          kunjungan_id: kunjunganData.id,
          tarif_retribusi_id: t.id,
          nama_layanan: t.nama_layanan,
          nominal: t.nominal,
          ditambahkan_oleh: profile.id,
        }))
        const { error: tagihanErr } = await supabase.from('tagihan_kunjungan').insert(baris)
        if (tagihanErr) {
          console.error('Gagal mencatat tagihan retribusi loket:', tagihanErr.message)
        } else {
          totalTagihanLoket = tarifLoket.reduce((sum, t) => sum + Number(t.nominal || 0), 0)
        }
      }

      const namaPoli = polis.find((p) => p.id === form.poli_id)?.nama_poli || ''
      const tiket = { nomor: nomorAntrian, namaPoli, totalTagihanLoket }
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
        } else if (step === 'cek-antrian') {
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
              {tiketAntrian.totalTagihanLoket > 0 && (
                <p className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                  💵 Retribusi Loket: Rp {tiketAntrian.totalTagihanLoket.toLocaleString('id-ID')}
                </p>
              )}
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

                  {/* Rak Rekam Medis — kelola kode rak sendiri */}
                  <button
                    onClick={() => setShowKelolaRak(true)}
                    className="w-40 h-40 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg transition"
                  >
                    <span className="text-4xl">🗄️</span>
                    <span className="text-lg font-bold text-center leading-tight">RAK REKAM MEDIS</span>
                  </button>

                  {/* Retribusi — rekap & setor retribusi pasien umum */}
                  <button
                    onClick={() => setShowModalRetribusi(true)}
                    className="w-40 h-40 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg transition"
                  >
                    <span className="text-4xl">💵</span>
                    <span className="text-lg font-bold text-center leading-tight">RETRIBUSI</span>
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

              {/* FITUR 5: Riwayat Pendaftaran (filter periode + rekap + download) */}
              <RiwayatPendaftaran instansiId={profile?.instansi_id} instansi={profile?.instansi} />
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
        onRefreshPetugasPoli={() => profile?.instansi_id && fetchPetugasPoli(profile.instansi_id)}
        tarifLoket={tarifLoket}
      />
      <ModalRetribusi
        show={showModalRetribusi}
        onClose={() => setShowModalRetribusi(false)}
        instansiId={profile?.instansi_id}
        petugasId={profile?.id}
      />
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
                : form.kategori_pasien === 'umum'
                ? 'bg-teal-100 text-teal-700'
                : 'bg-gray-100 text-gray-400'
            }`}>
              {form.kategori_pasien ? form.kategori_pasien.toUpperCase() : 'BELUM DIPILIH'}
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
              tempat_lahir: form.tempat_lahir,
              tanggal_lahir: form.tanggal_lahir,
              pekerjaan: form.pekerjaan,
              nama_kepala_keluarga: form.nama_kepala_keluarga,
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

              {/* Status keaktifan BPJS — dicek manual petugas via PCare/e-Puskesmas.
                  Menentukan apakah pasien dikenakan retribusi loket & poli.
                  Kalau form dibuka lewat wizard "Periksa Pasien" dari rak, ini sudah
                  dikonfirmasi di wizard sebelumnya, jadi field ini dihilangkan di sini. */}
              {!form.dari_periksa_rak && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    Status Keaktifan BPJS <span className="text-red-500">*</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, status_bpjs_aktif: true }))}
                      className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border ${
                        form.status_bpjs_aktif === true
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-600 border-gray-300'
                      }`}
                    >
                      ✓ Aktif
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, status_bpjs_aktif: false }))}
                      className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border ${
                        form.status_bpjs_aktif === false
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-600 border-gray-300'
                      }`}
                    >
                      ✕ Tidak Aktif
                    </button>
                  </div>
                  {form.status_bpjs_aktif === false && (
                    <p className="text-xs mt-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      ⚠️ BPJS tidak aktif — pasien akan dikenakan retribusi sesuai Perda (sama seperti pasien Umum).
                    </p>
                  )}
                </div>
              )}
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

          {/* Rak Rekam Medis — lokasi fisik penyimpanan berkas RM.
              Kalau form dibuka lewat wizard "Periksa Pasien" dari rak, rak & no. RM
              pasien sudah ada (pasien lama), jadi field ini dihilangkan di sini. */}
          {!form.dari_periksa_rak && (
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
          )}

          {/* Nomor Rekam Medis — sama, kalau dari wizard Periksa Rak, no. RM pasien
              sudah ada, jadi field ini dihilangkan di sini. */}
          {!form.dari_periksa_rak && (
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
          )}

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

          {/* Tempat Lahir & Tanggal Lahir */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tempat Lahir
              </label>
              <input
                type="text"
                name="tempat_lahir"
                value={form.tempat_lahir}
                onChange={handleChange}
                placeholder="mis. Makassar"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

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
          </div>

          {/* Jenis Kelamin & Pekerjaan */}
          <div className="grid grid-cols-2 gap-4">
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pekerjaan
              </label>
              <input
                type="text"
                name="pekerjaan"
                value={form.pekerjaan}
                onChange={handleChange}
                placeholder="mis. Petani, Wiraswasta, Pelajar"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Nama Kepala Keluarga */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Kepala Keluarga
            </label>
            <input
              type="text"
              name="nama_kepala_keluarga"
              value={form.nama_kepala_keluarga}
              onChange={handleChange}
              placeholder="Nama kepala keluarga sesuai KK"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
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

          {/* Kategori Pasien — kalau form dibuka lewat wizard "Periksa Pasien" dari rak,
              kategori ini sudah dipilih di wizard sebelumnya, jadi field ini dihilangkan di sini. */}
          {!form.dari_periksa_rak && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kategori Pasien <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                {[
                  { value: 'umum', label: '💵 Umum' },
                  { value: 'bpjs', label: '🏥 BPJS' },
                ].map((opsi) => (
                  <button
                    key={opsi.value}
                    type="button"
                    onClick={() => setForm(p => ({
                      ...p,
                      kategori_pasien: opsi.value,
                      status_bpjs_aktif: opsi.value === 'umum' ? null : p.status_bpjs_aktif,
                    }))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                      form.kategori_pasien === opsi.value
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                  >
                    {opsi.label}
                  </button>
                ))}
              </div>
              {form.kategori_pasien === 'umum' && tarifLoket.length > 0 && (
                <p className="text-xs mt-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  💵 Retribusi Loket: Rp{' '}
                  {tarifLoket.reduce((sum, t) => sum + Number(t.nominal || 0), 0).toLocaleString('id-ID')}
                </p>
              )}
            </div>
          )}

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

          {/* Poli Tujuan — kalau form dibuka lewat wizard "Periksa Pasien" dari rak,
              poli sudah dipilih di wizard sebelumnya, jadi field ini dihilangkan di sini. */}
          {!form.dari_periksa_rak && (
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
                  // Refresh daftar petugas dari DB supaya staf baru yang ditambahkan
                  // dari tab/sesi lain langsung terlihat tanpa reload halaman.
                  if (profile?.instansi_id) fetchPetugasPoli(profile.instansi_id)
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
          )}

          {/* Dokter / PJ Ruangan — sama, sudah dipilih di wizard Periksa Rak, dihilangkan di sini. */}
          {!form.dari_periksa_rak && (
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
          )}

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
        onRefreshPetugasPoli={() => profile?.instansi_id && fetchPetugasPoli(profile.instansi_id)}
        tarifLoket={tarifLoket}
      />
    </div>
  )
}