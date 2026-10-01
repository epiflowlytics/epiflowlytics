import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../../context/AuthContext'
import { supabase } from '../../../../lib/supabaseClient'
import FormANC, {
  ancDariRow,
  emptyANC,
  emptyKehamilan,
  hitungUsia,
  kehamilanDariRow,
  siapkanDataANC,
  siapkanDataKehamilan,
} from './form/FormANC'
import KartuIbu from './form/KartuIbu'
import PilihICD, { KODE_LAINNYA } from './form/PilihICD'

// Dashboard KIA — Poli KIA
// Alur: antrian poli KIA hari ini -> pilih pasien -> skrining (TTV) + pemeriksaan KIA
//       (anamnesa, diagnosa, tindakan, resep) -> status kunjungan pindah ke 'menunggu_obat'
//       (atau 'selesai' jika tidak ada resep), sama seperti alur dokter poli umum.

const STATUS_ANTRIAN = ['menunggu', 'menunggu_dokter']

const JENIS_LAYANAN = [
  'ANC (Pemeriksaan Kehamilan)',
  'Nifas / PNC',
  'KB',
  'Imunisasi',
  'Pemeriksaan Bayi/Balita',
  'Lainnya',
]

const emptySkrining = { sistolik: '', diastolik: '', suhu: '', berat_badan: '', tinggi_badan: '', keluhan_utama: '' }
const emptyPeriksa = {
  jenis_layanan: JENIS_LAYANAN[0],
  anamnesis: '',
  diagnosis: '',
  kode_icd: '',
  diagnosis_lainnya: '',
  tindakan: '',
  catatan: '',
  rujukan: false,
  tujuan_rujukan: '',
}
const emptyResep = { nama_obat: '', dosis: '', aturan_pakai: '', jumlah: '' }

// '' -> null supaya kolom numeric tidak error
function angkaAtauNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ---- Tekanan darah: disimpan sebagai dua angka, "120/80" hanya untuk tampilan ----
const TD_SISTOLIK = { min: 60, max: 260 }
const TD_DIASTOLIK = { min: 30, max: 160 }

function tampilTD(sis, dia) {
  return sis != null && sis !== '' && dia != null && dia !== '' ? `${sis}/${dia}` : ''
}

// kembalikan teks error, atau null kalau valid. Boleh kosong dua-duanya; tidak boleh terisi sebelah.
function validasiTD(sisStr, diaStr) {
  const sis = angkaAtauNull(sisStr)
  const dia = angkaAtauNull(diaStr)
  if (sis === null && dia === null) return null
  if (sis === null || dia === null) return 'Tekanan darah: sistolik dan diastolik harus diisi keduanya'
  if (!Number.isInteger(sis) || !Number.isInteger(dia)) return 'Tekanan darah harus berupa bilangan bulat'
  if (sis < TD_SISTOLIK.min || sis > TD_SISTOLIK.max)
    return `Sistolik harus ${TD_SISTOLIK.min}-${TD_SISTOLIK.max} mmHg`
  if (dia < TD_DIASTOLIK.min || dia > TD_DIASTOLIK.max)
    return `Diastolik harus ${TD_DIASTOLIK.min}-${TD_DIASTOLIK.max} mmHg`
  if (sis <= dia) return 'Sistolik harus lebih besar dari diastolik'
  return null
}

function hitungUmur(tglLahir) {
  if (!tglLahir) return '-'
  const lahir = new Date(tglLahir)
  const now = new Date()
  let umur = now.getFullYear() - lahir.getFullYear()
  const m = now.getMonth() - lahir.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < lahir.getDate())) umur--
  return `${umur} th`
}

function hariIni() {
  const d = new Date()
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

export default function DashboardKIA() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [poliId, setPoliId] = useState(null)
  const [namaPoli, setNamaPoli] = useState('')
  const [antrian, setAntrian] = useState([])
  const [loading, setLoading] = useState(true)
  const [pesan, setPesan] = useState(null) // { tipe: 'ok'|'err', teks }
  const [terpilih, setTerpilih] = useState(null)
  const [skrining, setSkrining] = useState(emptySkrining)
  const [periksa, setPeriksa] = useState(emptyPeriksa)
  const [anc, setAnc] = useState(emptyANC)
  const [resep, setResep] = useState([])
  const [obatBaru, setObatBaru] = useState(emptyResep)
  const [menyimpan, setMenyimpan] = useState(false)
  const [riwayat, setRiwayat] = useState([])
  const [petugas, setPetugas] = useState(null) // { id, nama_lengkap, instansi_id }
  const [kehamilan, setKehamilan] = useState(emptyKehamilan)
  const [riwayatANC, setRiwayatANC] = useState([]) // pemeriksaan_anc kehamilan aktif (+ kunjungan & skrining)
  const [kartuTerbuka, setKartuTerbuka] = useState(false)
  const [suamiRM, setSuamiRM] = useState(null) // suami pasien di rekam medis (satu No. KK), kalau ada
  const [instansiKop, setInstansiKop] = useState(null)
  const disentuhRef = useRef({}) // kolom kartu ibu yang sudah diubah petugas (bertahan walau form dirender ulang)
  const pilihanRef = useRef(null) // id kunjungan terpilih, untuk membuang hasil muat yang sudah usang
  const resepTersimpanRef = useRef(null) // id kunjungan yang resepnya sudah masuk (cegah resep ganda saat simpan ulang)

  // kunjungan ANC sebelumnya (tanpa kunjungan yang sedang diperiksa), urut tanggal
  const kunjunganLalu = useMemo(
    () =>
      riwayatANC
        .filter((r) => r.kunjungan_id !== terpilih?.id)
        .sort((a, b) => (a.kunjungan?.tanggal_periksa ?? '').localeCompare(b.kunjungan?.tanggal_periksa ?? '')),
    [riwayatANC, terpilih]
  )

  // FormANC/KartuIbu masih membaca skrining.tekanan_darah (teks) hanya untuk tampilan -> turunkan dari 2 angka
  const skrininguntukForm = useMemo(
    () => ({ ...skrining, tekanan_darah: tampilTD(skrining.sistolik, skrining.diastolik) }),
    [skrining]
  )

  // ---- ambil poli milik bidan ----
  useEffect(() => {
    let batal = false
    async function muatPoli() {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData?.user?.id
      if (!uid) return
      const { data, error } = await supabase
        .from('profiles')
        .select('poli_id, nama_lengkap, instansi_id, polis:poli_id(nama_poli)')
        .eq('id', uid)
        .single()
      if (batal) return
      if (error || !data?.poli_id) {
        setPesan({ tipe: 'err', teks: 'Akun Anda belum ditempatkan di poli. Hubungi admin.' })
        setLoading(false)
        return
      }
      setPetugas({ id: uid, nama_lengkap: data.nama_lengkap ?? null, instansi_id: data.instansi_id ?? null })
      setPoliId(data.poli_id)
      setNamaPoli(data.polis?.nama_poli ?? '')
      if (data.instansi_id) {
        const { data: ins } = await supabase
          .from('instansi')
          .select('nama, nama_pemerintah, nama_dinas, alamat, email, logo_url')
          .eq('id', data.instansi_id)
          .maybeSingle()
        if (!batal) setInstansiKop(ins ?? null)
      }
    }
    muatPoli()
    return () => {
      batal = true
    }
  }, [])

  // ---- muat antrian hari ini untuk poli bidan ----
  // `diam` = true untuk refresh otomatis / setelah simpan: tidak menampilkan "Memuat antrian..." supaya
  // halaman (form, kartu ibu, fokus ketik, scroll) tidak dibongkar dan dibangun ulang.
  const muatAntrian = useCallback(async (diam = false) => {
    if (!poliId) return
    if (!diam) setLoading(true)
    const { data, error } = await supabase
      .from('kunjungan')
      .select(
        'id, instansi_id, nomor_antrian, status, status_panggil, status_prioritas, tanggal_periksa, kategori_pasien, pasien:pasien_id(id, nama_lengkap, no_rekam_medis, tanggal_lahir, jenis_kelamin, alergi_obat, no_nik, no_kk, no_telepon, alamat, pekerjaan, pendidikan, no_bpjs, kategori_pasien, golongan_darah, alamat_domisili_kelurahan_nama, alamat_ktp_kelurahan_nama), skrining(id, sistolik, diastolik, suhu, berat_badan, tinggi_badan, keluhan_utama, triase)'
      )
      .eq('poli_id', poliId)
      .eq('tanggal_periksa', hariIni())
      .in('status', STATUS_ANTRIAN)
      .order('nomor_antrian', { ascending: true })
    setLoading(false)
    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal memuat antrian: ' + error.message })
      return
    }
    // ganti isi antrian hanya kalau memang berbeda, supaya tidak render ulang tanpa perlu
    const baru = data ?? []
    setAntrian((lama) => (JSON.stringify(lama) === JSON.stringify(baru) ? lama : baru))
  }, [poliId])

  useEffect(() => {
    muatAntrian(false)
  }, [muatAntrian])

  // refresh otomatis tiap 30 detik
  useEffect(() => {
    if (!poliId) return
    const t = setInterval(() => muatAntrian(true), 30000)
    return () => clearInterval(t)
  }, [poliId, muatAntrian])

  // Suami dicari dari rekam medis: pasien laki-laki berstatus ayah dengan No. KK yang sama.
  // Hanya dipakai kalau ketemu tepat satu orang (kalau ragu, dibiarkan kosong supaya petugas mengisi sendiri).
  async function cariSuami(k) {
    const p = k.pasien
    if (!p?.no_kk || p.jenis_kelamin === 'L') return
    const { data, error } = await supabase
      .from('pasien')
      .select('id, nama_lengkap, no_nik, tanggal_lahir, pekerjaan, pendidikan, status_keluarga, jenis_kelamin')
      .eq('no_kk', p.no_kk)
      .eq('jenis_kelamin', 'L')
      .eq('status_keluarga', 'ayah')
      .neq('id', p.id)
    if (pilihanRef.current !== k.id || error) return
    if ((data ?? []).length === 1) setSuamiRM(data[0])
  }

  // ---- pilih pasien ----
  async function pilihPasien(k) {
    setPesan(null)
    setTerpilih(k)
    const sk = Array.isArray(k.skrining) ? k.skrining[0] : k.skrining
    setSkrining(
      sk
        ? {
            sistolik: sk.sistolik ?? '',
            diastolik: sk.diastolik ?? '',
            suhu: sk.suhu ?? '',
            berat_badan: sk.berat_badan ?? '',
            tinggi_badan: sk.tinggi_badan ?? '',
            keluhan_utama: sk.keluhan_utama ?? '',
          }
        : emptySkrining
    )
    setPeriksa(emptyPeriksa)
    setAnc(emptyANC)
    setKehamilan(emptyKehamilan)
    setRiwayatANC([])
    setKartuTerbuka(false)
    setSuamiRM(null)
    disentuhRef.current = {}
    pilihanRef.current = k.id
    cariSuami(k)
    setResep([])
    setObatBaru(emptyResep)

    // tandai dipanggil
    await supabase
      .from('kunjungan')
      .update({ status_panggil: 'dipanggil', waktu_panggil: new Date().toISOString() })
      .eq('id', k.id)

    // riwayat kunjungan sebelumnya
    const { data } = await supabase
      .from('kunjungan')
      .select('id, tanggal_periksa, diagnosa, anamnesa, therapy_tindakan')
      .eq('pasien_id', k.pasien?.id)
      .neq('id', k.id)
      .order('tanggal_periksa', { ascending: false })
      .limit(5)
    setRiwayat(data ?? [])

    await muatKehamilan(k, sk)
  }

  // Muat kehamilan aktif pasien + kunjungan ANC sebelumnya.
  // Kalau belum ada kehamilan aktif, form "Data kehamilan" dibiarkan kosong (diisi di kunjungan pertama).
  async function muatKehamilan(k, sk) {
    const pasienId = k.pasien?.id
    if (!pasienId) return
    const { data: kh, error } = await supabase
      .from('kehamilan')
      .select('*')
      .eq('pasien_id', pasienId)
      .eq('status', 'aktif')
      .maybeSingle()
    if (pilihanRef.current !== k.id) return
    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal memuat data kehamilan: ' + error.message })
      return
    }
    if (!kh) {
      setKehamilan({ ...emptyKehamilan, tinggi_badan_cm: sk?.tinggi_badan ?? '' })
      setRiwayatANC([])
      setAnc({ ...emptyANC, keluhan: sk?.keluhan_utama ?? '' })
      return
    }
    const { data: rows, error: errRows } = await supabase
      .from('pemeriksaan_anc')
      .select('*, kunjungan:kunjungan_id(id, tanggal_periksa, paraf, skrining(sistolik, diastolik, tekanan_darah, berat_badan))')
      .eq('kehamilan_id', kh.id)
    if (pilihanRef.current !== k.id) return
    if (errRows) {
      setPesan({ tipe: 'err', teks: 'Gagal memuat riwayat ANC: ' + errRows.message })
    }
    const semua = (rows ?? []).sort((a, b) =>
      (a.kunjungan?.tanggal_periksa ?? '').localeCompare(b.kunjungan?.tanggal_periksa ?? '')
    )
    setKehamilan(kehamilanDariRow(kh))
    setRiwayatANC(semua)
    const ini = semua.find((r) => r.kunjungan_id === k.id) // kunjungan ini pernah tersimpan sebagian
    if (ini) {
      setAnc(ancDariRow(ini))
    } else {
      // kunjungan_ke dan jenis_kontak (K1-K6) dihitung database saat disimpan
      setAnc({ ...emptyANC, keluhan: sk?.keluhan_utama ?? '' })
    }
  }

  function bukaKartu() {
    setKartuTerbuka(true)
  }

  function tambahObat() {
    if (!obatBaru.nama_obat.trim()) return
    setResep((r) => [...r, { ...obatBaru, nama_obat: obatBaru.nama_obat.trim() }])
    setObatBaru(emptyResep)
  }

  function hapusObat(i) {
    setResep((r) => r.filter((_, idx) => idx !== i))
  }

  function batalPilih() {
    setTerpilih(null)
    setPesan(null)
    setKartuTerbuka(false)
    pilihanRef.current = null
  }

  async function simpan() {
    if (!terpilih) return
    if (!periksa.kode_icd || !periksa.diagnosis) {
      setPesan({ tipe: 'err', teks: 'Pilih diagnosis dan kode ICD-10 dari daftar' })
      return
    }
    if (periksa.kode_icd === KODE_LAINNYA && !periksa.diagnosis_lainnya.trim()) {
      setPesan({ tipe: 'err', teks: 'Tulis diagnosis pada kolom "Lainnya" karena tidak ada di daftar ICD' })
      return
    }
    if (periksa.rujukan && !periksa.tujuan_rujukan.trim()) {
      setPesan({ tipe: 'err', teks: 'Tujuan rujukan harus diisi' })
      return
    }
    if (!petugas?.id) {
      setPesan({ tipe: 'err', teks: 'Data petugas belum termuat. Muat ulang halaman lalu coba lagi.' })
      return
    }
    if (isANC && !kehamilan.hpht) {
      setPesan({ tipe: 'err', teks: 'HPHT harus diisi untuk pemeriksaan ANC' })
      return
    }
    if (isANC) {
      const u = hitungUsia(kehamilan.hpht)
      if (u && !u.valid) {
        setPesan({ tipe: 'err', teks: 'HPHT tidak wajar (di masa depan atau lebih dari 44 minggu)' })
        return
      }
    }
    const errTD = validasiTD(skrining.sistolik, skrining.diastolik)
    if (errTD) {
      setPesan({ tipe: 'err', teks: errTD })
      return
    }
    setMenyimpan(true)

    try {
      // ---- 1. skrining (TTV) ----
      const dataSkrining = {
        sistolik: angkaAtauNull(skrining.sistolik),
        diastolik: angkaAtauNull(skrining.diastolik),
        suhu: angkaAtauNull(skrining.suhu),
        berat_badan: angkaAtauNull(skrining.berat_badan),
        tinggi_badan: angkaAtauNull(skrining.tinggi_badan),
        keluhan_utama: skrining.keluhan_utama || null,
      }
      const skrId = Array.isArray(terpilih.skrining) ? terpilih.skrining[0]?.id : terpilih.skrining?.id
      if (skrId) {
        const { error } = await supabase.from('skrining').update(dataSkrining).eq('id', skrId)
        if (error) throw new Error('Tanda vital: ' + error.message)
      } else {
        const { error } = await supabase
          .from('skrining')
          .insert({ kunjungan_id: terpilih.id, perawat_id: petugas.id, ...dataSkrining })
        if (error) throw new Error('Tanda vital: ' + error.message)
      }

      // ---- 2. kehamilan + ANC (bila jenis layanan ANC) ----
      // Dilakukan sebelum resep dan sebelum status kunjungan diubah, supaya kalau gagal
      // tidak ada resep ganda dan kunjungan tidak terlanjur dianggap selesai.
      if (isANC) {
        let kehamilanId = kehamilan.id
        const dataKehamilan = siapkanDataKehamilan(kehamilan, terpilih.pasien)
        if (kehamilanId) {
          const { error: errKh } = await supabase.from('kehamilan').update(dataKehamilan).eq('id', kehamilanId)
          if (errKh) throw new Error('Data kehamilan: ' + errKh.message)
        } else {
          const instansiId = petugas?.instansi_id ?? terpilih.instansi_id
          if (!instansiId) throw new Error('Data kehamilan: instansi petugas tidak ditemukan')
          const { data: baru, error: errKh } = await supabase
            .from('kehamilan')
            .insert({ ...dataKehamilan, pasien_id: terpilih.pasien.id, instansi_id: instansiId })
            .select('id')
            .single()
          if (errKh) throw new Error('Data kehamilan: ' + errKh.message)
          kehamilanId = baru.id
          // simpan id agar percobaan simpan ulang tidak membuat kehamilan ganda
          setKehamilan((prev) => ({ ...prev, id: baru.id }))
        }

        const { error: errAnc } = await supabase
          .from('pemeriksaan_anc')
          .upsert(
            { kunjungan_id: terpilih.id, kehamilan_id: kehamilanId, ...siapkanDataANC(anc, kehamilan.hpht) },
            { onConflict: 'kunjungan_id' }
          )
        if (errAnc) throw new Error('Data ANC: ' + errAnc.message)
      }

      // ---- 3. pemeriksaan (sama seperti poli umum) ----
      // Trigger di database menyalin anamnesis, diagnosis, tindakan, kode ICD (-> kunjungan.icd_x)
      // dan paraf ke tabel kunjungan, jadi tidak perlu ditulis dua kali dari sini.
      // Tidak ada unique constraint di pemeriksaan.kunjungan_id, jadi cek dulu apakah sudah ada
      // (mis. simpan sebelumnya gagal di tengah jalan) agar tidak terbentuk baris ganda.
      const dataPemeriksaan = {
        dokter_id: petugas.id,
        anamnesis: periksa.anamnesis || null,
        diagnosis: periksa.kode_icd === KODE_LAINNYA ? periksa.diagnosis_lainnya.trim() : periksa.diagnosis,
        kode_icd: periksa.kode_icd || null,
        tindakan: periksa.tindakan || null,
        catatan: periksa.catatan || null,
        rujukan: periksa.rujukan,
        tujuan_rujukan: periksa.rujukan ? periksa.tujuan_rujukan.trim() : null,
      }
      const { data: ada, error: errCek } = await supabase
        .from('pemeriksaan')
        .select('id')
        .eq('kunjungan_id', terpilih.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (errCek) throw new Error('Pemeriksaan: ' + errCek.message)

      let pemeriksaanId = ada?.id
      if (pemeriksaanId) {
        const { error } = await supabase.from('pemeriksaan').update(dataPemeriksaan).eq('id', pemeriksaanId)
        if (error) throw new Error('Pemeriksaan: ' + error.message)
      } else {
        const { data: baru, error } = await supabase
          .from('pemeriksaan')
          .insert({ kunjungan_id: terpilih.id, ...dataPemeriksaan })
          .select('id')
          .single()
        if (error) throw new Error('Pemeriksaan: ' + error.message)
        pemeriksaanId = baru.id
      }

      // ---- 4. resep ----
      if (resep.length > 0 && resepTersimpanRef.current !== terpilih.id) {
        const { error } = await supabase.from('resep').insert(
          resep.map((r) => ({
            kunjungan_id: terpilih.id,
            pemeriksaan_id: pemeriksaanId,
            nama_obat: r.nama_obat,
            dosis: r.dosis || '',
            aturan_pakai: r.aturan_pakai || '',
            jumlah: angkaAtauNull(r.jumlah),
          }))
        )
        if (error) throw new Error('Resep: ' + error.message)
        resepTersimpanRef.current = terpilih.id // simpan ulang tidak menambah resep lagi
      }

      // ---- 5. status kunjungan (terakhir, setelah semua langkah di atas berhasil) ----
      const statusBaru = resep.length > 0 ? 'menunggu_obat' : 'selesai'
      const { error: errStatus } = await supabase
        .from('kunjungan')
        .update({ status: statusBaru })
        .eq('id', terpilih.id)
      if (errStatus) throw new Error('Status kunjungan: ' + errStatus.message)

      setPesan({ tipe: 'ok', teks: 'Data berhasil disimpan' })
      setTimeout(() => {
        setTerpilih(null)
        muatAntrian(true)
      }, 1000)
    } catch (err) {
      setPesan({ tipe: 'err', teks: 'Gagal menyimpan: ' + err.message })
    } finally {
      setMenyimpan(false)
    }
  }

  const isANC = periksa.jenis_layanan.startsWith('ANC')

  // data pasien untuk bagian atas Kartu Ibu (kelurahan: domisili, kalau kosong KTP)
  const pasienLengkap = {
    ...(terpilih?.pasien ?? {}),
    suami_rm: suamiRM,
    kelurahan: terpilih?.pasien?.alamat_domisili_kelurahan_nama || terpilih?.pasien?.alamat_ktp_kelurahan_nama || '',
  }

  const kartu = {
    flex: 1,
    border: '1px solid var(--line, #e5e7eb)',
    borderRadius: 10,
    padding: 16,
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
  }
  const label = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    fontWeight: 600,
  }
  const input = {
    fontSize: 13,
    padding: '8px 10px',
    border: '1px solid var(--line, #e5e7eb)',
    borderRadius: 8,
    fontFamily: 'inherit',
  }
  const tombol = (aktif = true, bg = 'var(--accent, #0f7b64)') => ({
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    background: aktif ? bg : 'var(--disabled, #e5e7eb)',
    color: aktif ? '#fff' : 'var(--muted, #6b7280)',
    cursor: aktif ? 'pointer' : 'not-allowed',
  })

  return (
    <div style={{ background: 'var(--bg, #f9fafb)', minHeight: '100vh', padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Dashboard Poli KIA</h1>
            <p style={{ fontSize: 13, margin: '4px 0 0', color: 'var(--muted, #6b7280)' }}>
              POLI KIA — Pemeriksaan Ibu & Anak
            </p>
          </div>
          <button
            onClick={signOut}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              border: '1px solid var(--line, #e5e7eb)',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Keluar
          </button>
        </div>

        {/* pesan */}
        {pesan && (
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              borderRadius: 8,
              background: pesan.tipe === 'err' ? 'var(--danger-light, #fee2e2)' : 'var(--success-light, #dcfce7)',
              color: pesan.tipe === 'err' ? 'var(--danger, #b42318)' : 'var(--success, #15803d)',
              fontSize: 13,
            }}
          >
            {pesan.teks}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--muted, #6b7280)' }}>
            Memuat antrian...
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16 }}>
            {/* antrian */}
            <div style={{ ...kartu, minWidth: 280, flex: 0 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Antrian Hari Ini</h2>
              {antrian.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted, #6b7280)', textAlign: 'center', padding: '24px 0' }}>
                  Tidak ada pasien
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', maxHeight: 600 }}>
                  {antrian.map((k) => {
                    const aktif = terpilih?.id === k.id
                    return (
                      <button
                        key={k.id}
                        onClick={() => pilihPasien(k)}
                        style={{
                          padding: 10,
                          fontSize: 12,
                          border: 'none',
                          borderRadius: 8,
                          background: aktif ? 'var(--accent-light, #dcf5f0)' : '#f3f4f6',
                          color: '#000',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>No. {k.nomor_antrian}</div>
                        <div style={{ fontSize: 11, margin: '2px 0 0', color: 'var(--muted, #6b7280)' }}>
                          {k.pasien?.nama_lengkap ?? '-'}
                        </div>
                        <div style={{ fontSize: 11, margin: '2px 0 0', color: 'var(--muted, #6b7280)' }}>
                          {k.pasien?.jenis_kelamin ?? '-'} · {k.kategori_pasien ?? '-'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ---- form pemeriksaan ---- */}
            <div style={kartu}>
              {!terpilih ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted, #6b7280)', fontSize: 13 }}>
                  Pilih pasien dari antrian
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{terpilih.pasien?.nama_lengkap}</h2>
                    <p style={{ fontSize: 12, margin: '2px 0 0', color: 'var(--muted, #6b7280)' }}>
                      RM {terpilih.pasien?.no_rekam_medis ?? '-'} · {hitungUmur(terpilih.pasien?.tanggal_lahir)} ·{' '}
                      {terpilih.pasien?.jenis_kelamin ?? '-'}
                    </p>
                    {terpilih.pasien?.alergi_obat && (
                      <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--danger, #b42318)', fontWeight: 600 }}>
                        Alergi obat: {terpilih.pasien.alergi_obat}
                      </p>
                    )}
                  </div>

                  {/* TTV */}
                  <fieldset style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: 12 }}>
                    <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>Tanda Vital</legend>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      <label style={label}>
                        Tekanan darah (mmHg)
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            style={input}
                            type="number"
                            inputMode="numeric"
                            step="1"
                            min={TD_SISTOLIK.min}
                            max={TD_SISTOLIK.max}
                            placeholder="Sistolik"
                            value={skrining.sistolik}
                            onChange={(e) => setSkrining({ ...skrining, sistolik: e.target.value })}
                          />
                          <span>/</span>
                          <input
                            style={input}
                            type="number"
                            inputMode="numeric"
                            step="1"
                            min={TD_DIASTOLIK.min}
                            max={TD_DIASTOLIK.max}
                            placeholder="Diastolik"
                            value={skrining.diastolik}
                            onChange={(e) => setSkrining({ ...skrining, diastolik: e.target.value })}
                          />
                        </div>
                      </label>
                      <label style={label}>
                        Suhu (°C)
                        <input style={input} type="number" step="0.1" value={skrining.suhu} onChange={(e) => setSkrining({ ...skrining, suhu: e.target.value })} />
                      </label>
                      <label style={label}>
                        Berat badan (kg)
                        <input style={input} type="number" step="0.1" value={skrining.berat_badan} onChange={(e) => setSkrining({ ...skrining, berat_badan: e.target.value })} />
                      </label>
                      <label style={label}>
                        Tinggi badan (cm)
                        <input style={input} type="number" step="0.1" value={skrining.tinggi_badan} onChange={(e) => setSkrining({ ...skrining, tinggi_badan: e.target.value })} />
                      </label>
                    </div>
                    <label style={{ ...label, marginTop: 10 }}>
                      Keluhan utama
                      <input style={input} value={skrining.keluhan_utama} onChange={(e) => setSkrining({ ...skrining, keluhan_utama: e.target.value })} />
                    </label>
                  </fieldset>

                  {/* pemeriksaan KIA */}
                  <fieldset style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: 12 }}>
                    <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>Pemeriksaan KIA</legend>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      <label style={{ ...label, gridColumn: '1 / -1' }}>
                        Jenis layanan
                        <select style={input} value={periksa.jenis_layanan} onChange={(e) => setPeriksa({ ...periksa, jenis_layanan: e.target.value })}>
                          {JENIS_LAYANAN.map((j) => (
                            <option key={j} value={j}>
                              {j}
                            </option>
                          ))}
                        </select>
                      </label>
                      {isANC && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <FormANC
                            kehamilan={kehamilan}
                            onKehamilan={setKehamilan}
                            disentuhRef={disentuhRef}
                            value={anc}
                            onChange={setAnc}
                            kunjunganLalu={kunjunganLalu}
                            skrining={skrininguntukForm}
                            pasien={pasienLengkap}
                            instansi={instansiKop}
                            paraf={petugas?.nama_lengkap ?? ''}
                          />
                          {kehamilan.id && (
                            <button
                              type="button"
                              onClick={bukaKartu}
                              style={{ ...tombol(true, '#fff'), color: 'var(--accent, #0f7b64)', border: '1px solid var(--accent, #0f7b64)', marginTop: 10 }}
                            >
                              Lihat / cetak Kartu Ibu
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <label style={{ ...label, marginTop: 10 }}>
                      Anamnesis
                      <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} value={periksa.anamnesis} onChange={(e) => setPeriksa({ ...periksa, anamnesis: e.target.value })} />
                    </label>
                    <div style={{ ...label, marginTop: 10 }}>
                      Diagnosis / Kode ICD-10 *
                      <PilihICD
                        value={periksa.kode_icd ? { kode: periksa.kode_icd, nama: periksa.diagnosis } : null}
                        disabled={menyimpan}
                        onChange={(item) =>
                          setPeriksa({
                            ...periksa,
                            kode_icd: item?.kode ?? '',
                            diagnosis: item?.nama ?? '',
                            // ganti pilihan -> kosongkan tulisan "Lainnya"
                            diagnosis_lainnya: item?.kode === KODE_LAINNYA ? periksa.diagnosis_lainnya : '',
                          })
                        }
                      />
                      <input
                        style={{
                          ...input,
                          marginTop: 8,
                          background: periksa.kode_icd === KODE_LAINNYA ? '#fff' : '#f3f4f6',
                          cursor: periksa.kode_icd === KODE_LAINNYA ? 'text' : 'not-allowed',
                        }}
                        placeholder="Jika diagnosis tidak ada di daftar di atas, tulis di sini (aktif setelah memilih “Lainnya”)"
                        value={periksa.diagnosis_lainnya}
                        disabled={menyimpan || periksa.kode_icd !== KODE_LAINNYA}
                        onChange={(e) => setPeriksa({ ...periksa, diagnosis_lainnya: e.target.value })}
                      />
                    </div>
                    <label style={{ ...label, marginTop: 10 }}>
                      Tindakan / terapi
                      <textarea style={{ ...input, minHeight: 50, resize: 'vertical' }} value={periksa.tindakan} onChange={(e) => setPeriksa({ ...periksa, tindakan: e.target.value })} />
                    </label>
                    <label style={{ ...label, marginTop: 10 }}>
                      Catatan
                      <input style={input} value={periksa.catatan} onChange={(e) => setPeriksa({ ...periksa, catatan: e.target.value })} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10 }}>
                      <input type="checkbox" checked={periksa.rujukan} onChange={(e) => setPeriksa({ ...periksa, rujukan: e.target.checked })} />
                      Rujuk pasien
                    </label>
                    {periksa.rujukan && (
                      <label style={{ ...label, marginTop: 8 }}>
                        Tujuan rujukan *
                        <input style={input} value={periksa.tujuan_rujukan} onChange={(e) => setPeriksa({ ...periksa, tujuan_rujukan: e.target.value })} />
                      </label>
                    )}
                  </fieldset>

                  {/* resep */}
                  <fieldset style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: 12 }}>
                    <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>Resep</legend>
                    {resep.length > 0 && (
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {resep.map((r, i) => (
                          <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 10px', background: '#f8fafb', borderRadius: 8 }}>
                            <span>
                              <b>{r.nama_obat}</b> {r.dosis && `· ${r.dosis}`} {r.aturan_pakai && `· ${r.aturan_pakai}`} {r.jumlah && `· jml ${r.jumlah}`}
                            </span>
                            <button type="button" onClick={() => hapusObat(i)} style={{ border: 'none', background: 'none', color: 'var(--danger, #b42318)', cursor: 'pointer', fontSize: 12 }}>
                              Hapus
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8 }}>
                      <input style={input} placeholder="Nama obat" value={obatBaru.nama_obat} onChange={(e) => setObatBaru({ ...obatBaru, nama_obat: e.target.value })} />
                      <input style={input} placeholder="Dosis" value={obatBaru.dosis} onChange={(e) => setObatBaru({ ...obatBaru, dosis: e.target.value })} />
                      <input style={input} placeholder="Aturan" value={obatBaru.aturan_pakai} onChange={(e) => setObatBaru({ ...obatBaru, aturan_pakai: e.target.value })} />
                      <input style={input} type="number" min="0" placeholder="Jumlah" value={obatBaru.jumlah} onChange={(e) => setObatBaru({ ...obatBaru, jumlah: e.target.value })} />
                    </div>
                    <button type="button" onClick={tambahObat} style={{ ...tombol(true, '#fff'), color: 'var(--accent, #0f7b64)', border: '1px solid var(--accent, #0f7b64)', marginTop: 8 }}>
                      + Tambah obat
                    </button>
                  </fieldset>

                  {/* riwayat */}
                  {riwayat.length > 0 && (
                    <details style={{ fontSize: 13 }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Riwayat kunjungan ({riwayat.length})</summary>
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                        {riwayat.map((r) => (
                          <li key={r.id} style={{ marginBottom: 4 }}>
                            {r.tanggal_periksa}: {r.diagnosa || '-'}
                            {r.therapy_tindakan ? ` — ${r.therapy_tindakan}` : ''}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={simpan} disabled={menyimpan} style={tombol(!menyimpan)}>
                      {menyimpan ? 'Menyimpan…' : 'Simpan & Selesai'}
                    </button>
                    <button onClick={batalPilih} disabled={menyimpan} style={{ ...tombol(!menyimpan, '#fff'), color: 'var(--ink, #12181b)', border: '1px solid var(--line, #e5e7eb)' }}>
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {kartuTerbuka && terpilih && (
          <KartuIbu
            kehamilan={kehamilan}
            pasien={pasienLengkap}
            instansi={instansiKop}
            kunjungan={riwayatANC}
            onTutup={() => setKartuTerbuka(false)}
          />
        )}
      </div>
    </div>
  )
}