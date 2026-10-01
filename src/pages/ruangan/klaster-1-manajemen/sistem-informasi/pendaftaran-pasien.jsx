import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import DatePickerLahir from './DatePickerLahir'
import TabelRiwayatPemeriksaan from './TabelRiwayatPemeriksaan'
import {
  hitungUmur,
  kategoriUmur,
  validasiNik,
  generateNoRM,
  todayStr,
  FORM_AWAL,
  OPSI_PRIORITAS,
  PCARE_URL,
  EPUSKESMAS_URL,
  perluRetribusi,
  OPSI_KATEGORI_PASIEN,
  badgeKategoriPasien,
  labelKategoriPasien,
  normalisasiPekerjaan,
  OPSI_PEKERJAAN,
} from './utils/pasienHelpers'

/* ────────────────────────────────────────────────────────────────
   PENDAFTARAN PASIEN
   Dipecah dari DashboardLoket.jsx. Berisi dua tahap:
     - 'cari' : cari pasien lama (NIK / No. RM / No. BPJS / nama)
     - 'form' : form pendaftaran kunjungan + cetak tiket antrian

   LOKASI FILE (per revisi ini):
   D:\appweb\epiflowlytics\src\pages\ruangan\klaster-1-manajemen\
     tata-usaha-keuangan-si\sistem-informasi\pendaftaran-pasien.jsx

   Import di file ini mengasumsikan DatePickerLahir.jsx,
   TabelRiwayatPemeriksaan.jsx, dan folder utils/pasienHelpers.js
   IKUT DIPINDAH ke folder sistem-informasi yang sama (sefolder,
   pakai './'). Kalau ternyata file-file itu TIDAK dipindah,
   import-nya harus disesuaikan lagi.
   Path ../../../../../lib/supabaseClient sudah dihitung ulang untuk
   kedalaman folder sistem-informasi (naik 5 tingkat ke src/lib).

   CARA PAKAI DI DashboardLoket.jsx
   ----------------------------------------------------------------
   const [pendaftaranAwal, setPendaftaranAwal] = useState(null)
   // null = tidak sedang mendaftar; selain itu = objek `awal` (lihat bawah)

   // Dari wizard "Periksa" di Rak RM (menggantikan periksaPasienDariRak):
   setShowKelolaRak(false)
   setPendaftaranAwal({
     tahap: 'form',
     pasien, poliId, petugasPoliId, kategori, statusBpjsAktif,
     dariPeriksaRak: true,
   })

   // Render (gantikan blok step 'cari' & form):
   if (pendaftaranAwal) {
     return (
       <PendaftaranPasien
         awal={pendaftaranAwal}
         profile={profile}
         polis={polis}
         petugasPoliList={petugasPoliList}
         rakList={rakList}
         setRakList={setRakList}
         tarifLoket={tarifLoket}
         consentLoket={consentLoket}
         onRefreshPetugasPoli={() => profile?.instansi_id && fetchPetugasPoli(profile.instansi_id)}
         onBukaKelolaRak={() => setShowKelolaRak(true)}
         onKembali={() => setPendaftaranAwal(null)}
         onSelesai={(tiket) => {
           setTiketAntrian(tiket); setSukses(true); setPendaftaranAwal(null)
           fetchDashboardData(profile.instansi_id)
         }}
       >
         {globalLoketModals}
       </PendaftaranPasien>
     )
   }

   `awal` untuk mulai dari pencarian pasien lama: { tahap: 'cari' }
   ──────────────────────────────────────────────────────────────── */

/* ─── Helper level modul (diekspor supaya bisa dipakai ulang oleh
       DashboardLoket / ModalKelolaRak tanpa menyalin kode) ─────── */

function escapeHtml(teks) {
  return String(teks ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Cetak tiket antrian (jendela cetak baru).
export function cetakTiket(tiket, namaInstansi) {
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
        <h2>${escapeHtml(namaInstansi || 'Tiket Antrian')}</h2>
        <div class="poli">${escapeHtml(tiket.namaPoli)}</div>
        <div class="garis"></div>
        <div class="nomor">${escapeHtml(tiket.nomor)}</div>
        <div class="kecil">Nomor Antrian Anda</div>
        <div class="garis"></div>
        <div class="kecil">${escapeHtml(new Date().toLocaleString('id-ID'))}</div>
        <script>window.onload = () => { window.print(); }</script>
      </body>
    </html>
  `)
  w.document.close()
}

// Ambil bagian angka murni dari No. RM (mis. "A.AO.0271" -> 271).
export function angkaUrutDariNoRm(noRm) {
  if (!noRm) return 0
  const digitSaja = noRm.replace(/\D/g, '')
  if (!digitSaja) return 0
  return parseInt(digitSaja, 10)
}

// Sinkronkan nomor_urut_terakhir satu rak dengan angka urut TERTINGGI yang
// benar-benar ada di tabel pasien untuk rak itu (bukan percaya counter basi).
// setRakList opsional: kalau diberikan, state rakList milik pemanggil ikut diperbarui.
export async function sinkronkanNomorUrutRak(rakId, setRakList) {
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

  const nilaiBaru = updated?.nomor_urut_terakhir ?? angkaTertinggi
  setRakList?.((prev) =>
    prev.map((r) => (r.id === rakId ? { ...r, nomor_urut_terakhir: nilaiBaru } : r))
  )
  return nilaiBaru
}

// Generate No. RM berbasis Rak: {kode_rak}-{4 digit urut}, mis. A-A0-0001.
// kode_rak & nomor_urut_terakhir SELALU dibaca langsung dari database
// (bukan dari state React) supaya tidak kena race condition state basi.
export async function generateNoRmDariRak(rakId, setRakList) {
  const { data: rakTerbaru, error: rakErr } = await supabase
    .from('rak_rm')
    .select('kode_rak, nomor_urut_terakhir')
    .eq('id', rakId)
    .maybeSingle()

  if (rakErr || !rakTerbaru) {
    console.error('Gagal membaca data rak terbaru:', rakErr?.message)
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
    // Guard gagal (ada perubahan bersamaan): ambil ulang nilai terbaru
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

  setRakList?.((prev) => prev.map((r) => (r.id === rakId ? { ...r, nomor_urut_terakhir: nomorBaru } : r)))

  const urut = String(nomorBaru).padStart(4, '0')
  return `${rakTerbaru.kode_rak}-${urut}`
}

// Nomor antrian: reset ke 1 tiap hari, per poli.
export async function generateNomorAntrian(poliId, tanggal) {
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

// Susun state form dari data pasien lama. Dipakai oleh "lanjutkan pasien
// lama" (tahap cari) dan wizard "Periksa" dari rak (satu sumber, tidak
// lagi duplikat dua blok yang hampir sama).
function bangunFormDariPasien(pasien, override = {}) {
  return {
    ...FORM_AWAL,
    tanggal_periksa: todayStr(),
    no_rekam_medis: pasien.no_rekam_medis || generateNoRM(),
    mode_rm: pasien.no_rekam_medis ? 'manual' : 'otomatis',
    nama_lengkap: pasien.nama_lengkap || '',
    tempat_lahir: pasien.tempat_lahir || '',
    tanggal_lahir: pasien.tanggal_lahir || '',
    jenis_kelamin: pasien.jenis_kelamin || '',
    pekerjaan: normalisasiPekerjaan(pasien.pekerjaan),
    alamat: pasien.alamat || '',
    no_nik: pasien.no_nik || '',
    no_bpjs: pasien.no_bpjs || '',
    no_asuransi: pasien.no_asuransi || '',
    nama_asuransi: pasien.nama_asuransi || '',
    no_kk: pasien.no_kk || '',
    nama_kepala_keluarga: pasien.nama_kepala_keluarga || '',
    urutan_kk: pasien.urutan_kk != null ? String(pasien.urutan_kk) : '',
    rak_id: pasien.rak_id || '',
    wilayah: pasien.wilayah || '',
    poli_id: '',
    pasien_id_existing: pasien.id,
    ...override,
  }
}

function formAwalDariProps(awal) {
  if (awal?.pasien) {
    return bangunFormDariPasien(awal.pasien, {
      kategori_pasien: awal.kategori || '',
      status_bpjs_aktif: awal.kategori === 'bpjs' ? (awal.statusBpjsAktif ?? null) : null,
      dari_periksa_rak: !!awal.dariPeriksaRak,
      poli_id: awal.poliId || '',
      petugas_poli_id: awal.petugasPoliId || '',
    })
  }
  return { ...FORM_AWAL, tanggal_periksa: todayStr() }
}

/* ─── Komponen ─────────────────────────────────────────────────── */

export default function PendaftaranPasien({
  awal,
  profile,
  polis = [],
  petugasPoliList = [],
  rakList = [],
  setRakList,
  tarifLoket = [],
  consentLoket,
  onRefreshPetugasPoli,
  onBukaKelolaRak,
  onKembali,
  onSelesai,
  children,
}) {
  const [step, setStep] = useState(awal?.tahap === 'cari' ? 'cari' : 'form')
  const [form, setForm] = useState(() => formAwalDariProps(awal))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorFieldId, setErrorFieldId] = useState(null)

  // Pencarian pasien lama
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [pasienTerpilih, setPasienTerpilih] = useState(null)
  const [riwayatPasien, setRiwayatPasien] = useState([])
  const [riwayatPasienLoading, setRiwayatPasienLoading] = useState(false)

  // No. KK & NIK
  const [anggotaKeluarga, setAnggotaKeluarga] = useState([])
  const [ceknKk, setCekKk] = useState(false)
  const [cekNikLoading, setCekNikLoading] = useState(false)
  const [nikDitemukan, setNikDitemukan] = useState(!!awal?.pasien?.no_nik)
  const [kkChecked, setKkChecked] = useState(false)

  const formRef = useRef(null)
  const searchInputRef = useRef(null)
  const searchReqRef = useRef(0) // penanda permintaan terbaru, supaya hasil basi diabaikan

  const instansiId = profile?.instansi_id

  // Kalau dibuka dengan pasien dari rak, tarik riwayatnya supaya langsung tampil.
  useEffect(() => {
    if (awal?.pasien?.id) fetchRiwayatPasien(awal.pasien.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pencarian pasien lama (debounce 400ms)
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

  // Shortcut keyboard: Esc (kembali), Ctrl+S (simpan, hanya di form)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onKembali?.()
      } else if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        if (step === 'form') {
          e.preventDefault()
          formRef.current?.requestSubmit()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [step, onKembali])

  // ── Helper UI ──────────────────────────────────────────────

  // Scroll ke field bermasalah + highlight sebentar (dipanggil saat popup validasi ditutup).
  function scrollToErrorField(fieldId) {
    if (!fieldId) return
    const el = document.getElementById(fieldId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-red-400', 'rounded-lg')
    setTimeout(() => {
      el.classList.remove('ring-2', 'ring-red-400', 'rounded-lg')
    }, 2000)
  }

  function tutupPopupError() {
    setError('')
    scrollToErrorField(errorFieldId)
  }

  // ── Pencarian pasien lama ──────────────────────────────────

  async function cariPasien(term) {
    if (!instansiId) return
    // Koma / kurung / wildcard merusak sintaks filter .or() PostgREST -> ganti spasi.
    const aman = term.replace(/[,()%*]/g, ' ').trim()
    if (!aman) {
      setSearchResults([])
      return
    }
    const reqId = ++searchReqRef.current
    setSearching(true)
    const { data, error } = await supabase
      .from('pasien')
      .select('*')
      .eq('instansi_id', instansiId)
      .or(`no_nik.eq.${aman},no_rekam_medis.eq.${aman},no_bpjs.eq.${aman},nama_lengkap.ilike.%${aman}%`)
      .limit(10)

    if (reqId !== searchReqRef.current) return // ada pencarian yang lebih baru
    setSearching(false)
    if (error) {
      console.error('Error cari pasien:', error.message)
      return
    }
    setSearchResults(data || [])
  }

  function pilihPasienLama(pasien) {
    setPasienTerpilih(pasien)
    fetchRiwayatPasien(pasien.id)
  }

  // Riwayat pemeriksaan pasien (read-only di loket). Kolom klinis diisi
  // perawat/dokter di masing-masing poli.
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
      .neq('status', 'batal')
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
    setForm(bangunFormDariPasien(pasienTerpilih, { kategori_pasien: kategori }))
    setNikDitemukan(!!pasienTerpilih.no_nik)
    setPasienTerpilih(null)
    setRiwayatPasien([])
    setSearchTerm('')
    setSearchResults([])
    setAnggotaKeluarga([])
    setKkChecked(false)
    setStep('form')
    setError('')
  }

  // ── Cek NIK & No. KK ───────────────────────────────────────

  // Kalau NIK sudah terdaftar, isi otomatis seluruh data form dari data lama.
  async function cekNoNik(nik) {
    setNikDitemukan(false)
    if (!nik.trim() || nik.trim().length < 16 || !instansiId) return

    setCekNikLoading(true)
    const { data, error } = await supabase
      .from('pasien')
      .select('*')
      .eq('instansi_id', instansiId)
      .eq('no_nik', nik.trim())
      .order('created_at', { ascending: false })
      .limit(1)
    setCekNikLoading(false)

    if (error) {
      console.error('Error cek No. NIK:', error.message)
      return
    }

    const pasienLama = data && data[0]
    if (!pasienLama) return // NIK baru, petugas isi manual

    setNikDitemukan(true)
    setForm((prev) => ({
      ...prev,
      nama_lengkap: pasienLama.nama_lengkap || prev.nama_lengkap,
      tempat_lahir: pasienLama.tempat_lahir || prev.tempat_lahir,
      tanggal_lahir: pasienLama.tanggal_lahir || prev.tanggal_lahir,
      jenis_kelamin: pasienLama.jenis_kelamin || prev.jenis_kelamin,
      pekerjaan: normalisasiPekerjaan(pasienLama.pekerjaan) || prev.pekerjaan,
      alamat: pasienLama.alamat || prev.alamat,
      no_bpjs: pasienLama.no_bpjs || prev.no_bpjs,
      no_asuransi: pasienLama.no_asuransi || prev.no_asuransi,
      nama_asuransi: pasienLama.nama_asuransi || prev.nama_asuransi,
      no_kk: pasienLama.no_kk || prev.no_kk,
      nama_kepala_keluarga: pasienLama.nama_kepala_keluarga || prev.nama_kepala_keluarga,
      urutan_kk: pasienLama.urutan_kk != null ? String(pasienLama.urutan_kk) : prev.urutan_kk,
      rak_id: pasienLama.rak_id || prev.rak_id,
      no_rekam_medis: pasienLama.no_rekam_medis || prev.no_rekam_medis,
      mode_rm: pasienLama.no_rekam_medis ? 'manual' : prev.mode_rm,
      wilayah: pasienLama.wilayah || prev.wilayah,
      pasien_id_existing: pasienLama.id,
    }))

    fetchRiwayatPasien(pasienLama.id)

    if (pasienLama.no_kk) {
      cekNoKk(pasienLama.no_kk)
    }
  }

  // Cari anggota keluarga lain dengan no_kk sama supaya No. RM bisa disatukan.
  async function cekNoKk(noKk) {
    if (!noKk.trim() || !instansiId) {
      setAnggotaKeluarga([])
      setKkChecked(false)
      return
    }
    setCekKk(true)
    const { data, error } = await supabase
      .from('pasien')
      .select('id, nama_lengkap, no_rekam_medis, tanggal_lahir, jenis_kelamin, rak_id')
      .eq('instansi_id', instansiId)
      .eq('no_kk', noKk.trim())

    setCekKk(false)
    setKkChecked(true)

    if (error) {
      console.error('Error cek No. KK:', error.message)
      setAnggotaKeluarga([])
      return
    }

    setAnggotaKeluarga(data || [])

    // Keluarga sudah punya No. RM (dan rak) -> pakai yang sama; satu keluarga = satu map.
    if (data && data.length > 0 && data[0].no_rekam_medis) {
      setForm((prev) => ({
        ...prev,
        no_rekam_medis: data[0].no_rekam_medis,
        rak_id: data[0].rak_id || prev.rak_id,
        mode_rm: 'manual', // kunci supaya tidak ke-generate ulang
      }))
    }
  }

  // ── Rak & No. RM ───────────────────────────────────────────

  async function pilihRak(rakId) {
    if (!rakId) {
      setForm((prev) => ({ ...prev, rak_id: '' }))
      return
    }
    setForm((prev) => ({ ...prev, rak_id: rakId }))
    // No. RM sudah mengikuti keluarga (dari cekNoKk) -> jangan timpa
    if (kkChecked && anggotaKeluarga.length > 0 && anggotaKeluarga[0].no_rekam_medis) {
      return
    }
    await sinkronkanNomorUrutRak(rakId, setRakList)
    const noRmBaru = await generateNoRmDariRak(rakId, setRakList)
    if (noRmBaru) {
      setForm((prev) => ({ ...prev, no_rekam_medis: noRmBaru, mode_rm: 'otomatis' }))
    }
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => {
      const updated = { ...prev, [name]: value }
      if (name === 'mode_rm' && value === 'otomatis') {
        updated.no_rekam_medis = generateNoRM()
      }
      // Saran otomatis status prioritas untuk Lansia
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

  function handleChangeRak(e) {
    pilihRak(e.target.value)
  }

  // ── Simpan pendaftaran ─────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setErrorFieldId(null)
    setLoading(true)

    try {
      if (!form.nama_lengkap.trim()) {
        setErrorFieldId('field-nama_lengkap')
        throw new Error('Nama lengkap wajib diisi.')
      }
      if (!form.tanggal_lahir) {
        setErrorFieldId('field-tanggal_lahir')
        throw new Error('Tanggal lahir wajib diisi.')
      }
      if (!form.jenis_kelamin) {
        setErrorFieldId('field-jenis_kelamin')
        throw new Error('Jenis kelamin wajib dipilih.')
      }
      if (!form.kategori_pasien) {
        setErrorFieldId('field-kategori_pasien')
        throw new Error('Kategori pasien (BPJS/Umum/Asuransi Lainnya) wajib dipilih.')
      }
      if (form.kategori_pasien === 'bpjs' && form.status_bpjs_aktif === null) {
        setErrorFieldId('field-status_bpjs_aktif')
        throw new Error('Status keaktifan BPJS wajib dicek dan dipilih (Aktif / Tidak Aktif) terlebih dahulu.')
      }
      if (!form.wilayah) {
        setErrorFieldId('field-wilayah')
        throw new Error('Wilayah wajib dipilih.')
      }
      if (!form.poli_id) {
        setErrorFieldId('field-poli_id')
        throw new Error('Poli tujuan wajib dipilih.')
      }
      if (!form.no_rekam_medis.trim()) {
        setErrorFieldId('field-no_rekam_medis')
        throw new Error('Nomor rekam medis wajib diisi.')
      }
      if (form.kategori_pasien === 'bpjs' && !form.no_bpjs.trim()) {
        setErrorFieldId('field-no_bpjs')
        throw new Error('Nomor BPJS wajib diisi untuk pasien BPJS.')
      }
      if (form.kategori_pasien === 'asuransi_lainnya') {
        if (!form.nama_asuransi.trim()) {
          setErrorFieldId('field-nama_asuransi')
          throw new Error('Nama asuransi wajib diisi (mis. Jasa Raharja).')
        }
        if (!form.no_asuransi.trim()) {
          setErrorFieldId('field-no_asuransi')
          throw new Error('Nomor kartu/polis asuransi wajib diisi.')
        }
      }
      if (form.no_nik && validasiNik(form.no_nik).status === 'invalid') {
        setErrorFieldId('field-no_nik')
        throw new Error(validasiNik(form.no_nik).pesan)
      }

      let pasienId = form.pasien_id_existing

      // Payload biodata — dipakai untuk INSERT (pasien baru) maupun UPDATE
      // (pasien lama yang datanya dilengkapi/dikoreksi di loket).
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
        // Data polis hanya ditulis untuk kategori Asuransi Lainnya. Kategori
        // lain: kolom TIDAK disertakan (bukan null) supaya polis yang sudah
        // tersimpan tidak terhapus saat pasien berobat sebagai BPJS/Umum.
        ...(form.kategori_pasien === 'asuransi_lainnya'
          ? {
              no_asuransi: form.no_asuransi.trim() || null,
              nama_asuransi: form.nama_asuransi.trim() || null,
            }
          : {}),
      }

      if (!pasienId) {
        // Cek dulu apakah No. RM ini sudah terdaftar di instansi ini; kalau ya,
        // pakai id yang ada dan cukup tambahkan kunjungannya.
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

      // Pasien sudah ada -> update biodata dengan nilai form sekarang, supaya
      // koreksi/pelengkapan data langsung muncul di Kartu Rekam Medis.
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

      // General Consent: dipicu tanpa menunggu (non-blocking). Modal form/QR
      // consent muncul independen lewat modal global di komponen induk.
      consentLoket?.mulaiConsent(
        { id: pasienId, nama_lengkap: form.nama_lengkap.trim() },
        kunjunganData.id,
        profile.instansi_id
      )

      // Retribusi: pasien Umum / BPJS tidak aktif -> catat tagihan loket otomatis.
      // Kegagalan di sini tidak membatalkan pendaftaran (hanya dicatat).
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

      cetakTiket(tiket, profile?.instansi?.nama)
      onSelesai?.(tiket)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const nikCheck = validasiNik(form.no_nik)
  const umurInfo = kategoriUmur(form.tanggal_lahir)

  // ─── TAMPILAN: CARI PASIEN LAMA ────────────────────────────
  if (step === 'cari') {
    return (
      <div className="min-h-screen bg-gray-50 p-6 pb-44">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => onKembali?.()} className="text-gray-500 hover:text-gray-700">
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

                <TabelRiwayatPemeriksaan
                  riwayat={riwayatPasien}
                  loading={riwayatPasienLoading}
                  dataPasien={pasienTerpilih}
                  instansi={profile?.instansi}
                  profile={profile}
                />

                <p className="text-sm text-gray-600 mb-4">Pilih kategori kunjungan hari ini:</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  {OPSI_KATEGORI_PASIEN.map((k) => (
                    <button
                      key={k.value}
                      onClick={() => lanjutkanPasienLama(k.value)}
                      className={`flex-1 py-2 rounded-lg ${k.tombol} text-white text-sm font-semibold`}
                    >
                      {k.label}
                    </button>
                  ))}
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

        {children}
      </div>
    )
  }

  // ─── TAMPILAN: FORM PENDAFTARAN ────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6 pb-44">
      <div className="max-w-2xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => onKembali?.()}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Kembali <span className="text-xs text-gray-400">(Esc)</span>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Pendaftaran Pasien</h1>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeKategoriPasien(form.kategori_pasien)}`}>
              {form.kategori_pasien ? labelKategoriPasien(form.kategori_pasien).toUpperCase() : 'BELUM DIPILIH'}
            </span>
            {form.pasien_id_existing && (
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                PASIEN LAMA
              </span>
            )}
          </div>
        </div>

        {/* Riwayat pemeriksaan — muncul begitu pasien dikenali (cek NIK, cari
            pasien lama, atau tombol PERIKSA di rak). Read-only. */}
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={tutupPopupError}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-700 mb-5">{error}</p>
              <button
                type="button"
                onClick={tutupPopupError}
                className="w-full rounded-lg bg-red-600 text-white text-sm font-medium py-2.5 hover:bg-red-700 transition"
              >
                Oke, mengerti
              </button>
            </div>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-5">

          {/* NIK — validasi otomatis + autofill dari data pasien lama */}
          <div id="field-no_nik">
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

          {/* Asuransi Lainnya (mis. Jasa Raharja) */}
          {form.kategori_pasien === 'asuransi_lainnya' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div id="field-nama_asuransi">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Asuransi <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="nama_asuransi"
                  value={form.nama_asuransi}
                  onChange={handleChange}
                  placeholder="mis. Jasa Raharja"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div id="field-no_asuransi">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nomor Kartu / Polis <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="no_asuransi"
                  value={form.no_asuransi}
                  onChange={handleChange}
                  placeholder="Nomor kartu atau polis"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {/* Nomor BPJS */}
          {form.kategori_pasien === 'bpjs' && (
            <div id="field-no_bpjs">
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

              {/* Status keaktifan BPJS — dicek manual via PCare/e-Puskesmas; menentukan
                  retribusi. Dihilangkan bila sudah dikonfirmasi di wizard Periksa Rak. */}
              {!form.dari_periksa_rak && (
                <div id="field-status_bpjs_aktif" className="mt-2">
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

          {/* Rak Rekam Medis — dihilangkan bila dari wizard Periksa Rak */}
          {!form.dari_periksa_rak && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Rak Rekam Medis
                  <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => onBukaKelolaRak?.()}
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

          {/* Nomor Rekam Medis — dihilangkan bila dari wizard Periksa Rak */}
          {!form.dari_periksa_rak && (
            <div id="field-no_rekam_medis">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nomor Rekam Medis
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, mode_rm: 'otomatis', no_rekam_medis: generateNoRM() }))}
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
                  onClick={() => setForm((p) => ({ ...p, mode_rm: 'manual', no_rekam_medis: '' }))}
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
          <div id="field-nama_lengkap">
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

            <div id="field-tanggal_lahir">
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
            <div id="field-jenis_kelamin">
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
              <select
                name="pekerjaan"
                value={form.pekerjaan}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {OPSI_PEKERJAAN.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
                {form.pekerjaan && !OPSI_PEKERJAAN.some((o) => o.value === form.pekerjaan) && (
                  <option value={form.pekerjaan}>{form.pekerjaan} (data lama)</option>
                )}
              </select>
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

          {/* Kategori Pasien — dihilangkan bila sudah dipilih di wizard Periksa Rak */}
          {!form.dari_periksa_rak && (
            <div id="field-kategori_pasien">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kategori Pasien <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                {OPSI_KATEGORI_PASIEN.map((opsi) => (
                  <button
                    key={opsi.value}
                    type="button"
                    onClick={() => setForm((p) => ({
                      ...p,
                      kategori_pasien: opsi.value,
                      status_bpjs_aktif: opsi.value === 'bpjs' ? p.status_bpjs_aktif : null,
                    }))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                      form.kategori_pasien === opsi.value
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                  >
                    {opsi.labelPanjang}
                  </button>
                ))}
              </div>
              {form.kategori_pasien === 'asuransi_lainnya' && (
                <p className="text-xs mt-1.5 text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5">
                  🛡️ Ditanggung penjamin (mis. Jasa Raharja) — tidak dikenakan retribusi loket.
                </p>
              )}
              {form.kategori_pasien === 'umum' && tarifLoket.length > 0 && (
                <p className="text-xs mt-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  💵 Retribusi Loket: Rp{' '}
                  {tarifLoket.reduce((sum, t) => sum + Number(t.nominal || 0), 0).toLocaleString('id-ID')}
                </p>
              )}
            </div>
          )}

          {/* Wilayah */}
          <div id="field-wilayah">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wilayah Pasien <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {['dalam', 'luar'].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, wilayah: w }))}
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

          {/* Poli Tujuan — dihilangkan bila sudah dipilih di wizard Periksa Rak */}
          {!form.dari_periksa_rak && (
            <div id="field-poli_id">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Poli Tujuan <span className="text-red-500">*</span>
              </label>
              <select
                name="poli_id"
                value={form.poli_id}
                onChange={(e) => {
                  handleChange(e)
                  // Ganti poli -> petugas sebelumnya belum tentu bertugas di poli baru, reset.
                  setForm((prev) => ({ ...prev, petugas_poli_id: '' }))
                  // Refresh daftar petugas supaya staf baru dari sesi lain langsung terlihat.
                  onRefreshPetugasPoli?.()
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

          {/* Dokter / PJ Ruangan — dihilangkan bila sudah dipilih di wizard Periksa Rak */}
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

          {/* Status Pasien Prioritas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status Prioritas
            </label>
            <div className="flex flex-wrap gap-2">
              {OPSI_PRIORITAS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, status_prioritas: o.value }))}
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
              onClick={() => onKembali?.()}
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

      {children}
    </div>
  )
}