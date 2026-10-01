import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../../../lib/supabaseClient'
import { PCARE_URL, EPUSKESMAS_URL, labelStatusKeluarga } from './utils/pasienHelpers'
import FormTambahPasienRak from './FormTambahPasienRak'

// ─── KOMPONEN MANDIRI: Modal Kelola Rak Rekam Medis ──────────────
// ─── KOMPONEN MANDIRI: Modal Kelola Rak Rekam Medis ──────────────
// Didefinisikan DI LUAR DashboardLoket supaya tidak dibuat ulang tiap
// render (itulah sebab bug "ketik jadi satu-satu": React sebelumnya
// mendefinisikan ulang komponen ini setiap kali state berubah, jadi
// input di dalamnya kehilangan fokus tiap ketikan).
export default function ModalKelolaRak({
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
  onLihatRiwayatPasien,
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
  refPasienRakNikPendamping,
  refPasienRakTanggalLahir,
  refPasienRakJenisKelamin,
  onFotoPasienRakChange,
  onSimpanFotoPasienRak,
  onHapusFotoPasienRak,
  fotoPreviewUrlRak,
  fotoUploadingRak,
  fotoPendingBlobRak,
  popupValidasi,
  onTutupPopupValidasi,
  onPeriksaPasienRak,
  polis,
  petugasPoliList,
  onRefreshPetugasPoli,
  tarifLoket,
}) {
  // Pasien yang sedang dipilih untuk fitur PERIKSA (wizard 3 langkah: poli → petugas → kategori)
  const [pasienPeriksaDipilih, setPasienPeriksaDipilih] = useState(null)
  const [langkahPeriksa, setLangkahPeriksa] = useState('poli') // 'poli' | 'petugas' | 'kategori' | 'konfirmasi_bpjs' | 'konfirmasi_umum' | 'konfirmasi_asuransi'
  const [poliPeriksaDipilih, setPoliPeriksaDipilih] = useState(null)
  const [petugasPeriksaDipilih, setPetugasPeriksaDipilih] = useState(null)

  // Buka wizard PERIKSA dari awal (langkah pilih poli) untuk pasien p.
  // Refresh data petugas poli langsung dari DB supaya staf yang baru ditambahkan
  // (dari tab/sesi lain) langsung terlihat tanpa perlu reload halaman.
  function bukaWizardPeriksa(p) {
    setPasienPeriksaDipilih(p)
    setLangkahPeriksa('poli')
    setPoliPeriksaDipilih(null)
    setPetugasPeriksaDipilih(null)
    if (onRefreshPetugasPoli) onRefreshPetugasPoli()
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
  const [menuAksiTerbuka, setMenuAksiTerbuka] = useState(null) // grup RM ({kunci, g, p, jumlah}) yang aksi lainnya (mobile) sedang terbuka, ditampilkan sebagai bottom sheet

  // Buka bottom sheet "Aksi lainnya" untuk grup RM g. Sebelumnya menu ini
  // berupa dropdown kecil menempel di tombol titik-tiga (absolute/fixed di
  // posisi tombol) — di HP itu sering ketutup oleh bottom bar navigasi karena
  // tombolnya ada di bagian bawah layar. Sekarang dibuat bottom sheet penuh
  // lebar layar (mirip action sheet iOS/Android) yang selalu muncul menempel
  // di bawah layar dengan z-index di atas bottom bar, jadi tidak pernah
  // tertindis lagi.
  function bukaMenuAksi(g) {
    setMenuAksiTerbuka({ kunci: g.kunci, g, p: g.wakil, jumlah: g.anggota.length })
  }

  function tutupMenuAksi() {
    setMenuAksiTerbuka(null)
  }
  const [menuAksiRakTerbuka, setMenuAksiRakTerbuka] = useState(null) // id rak yang menu titik-tiganya (di daftar rak) sedang terbuka

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
        .select('id, nama_lengkap, nama_kepala_keluarga, no_rekam_medis, no_kk, no_nik, no_nik_pendamping, nama_ibu_kandung, kewarganegaraan, no_telepon, golongan_darah, foto_url, no_bpjs, alamat, urutan_kk, status_keluarga, status_keluarga_lainnya, tempat_lahir, tanggal_lahir, pekerjaan, jenis_kelamin, agama, status_perkawinan, pendidikan, alamat_ktp_rt, alamat_ktp_rw, alamat_ktp_provinsi, alamat_ktp_kabupaten, alamat_ktp_kecamatan, alamat_ktp_kelurahan, alamat_ktp_kode_pos, alamat_ktp_negara, domisili_sama_dengan_ktp, alamat_domisili, alamat_domisili_rt, alamat_domisili_rw, alamat_domisili_provinsi, alamat_domisili_kabupaten, alamat_domisili_kecamatan, alamat_domisili_kelurahan, alamat_domisili_kode_pos, alamat_domisili_negara, no_identitas_lain, no_telepon_rumah, suku, bahasa_dikuasai, is_bayi_baru_lahir, nama_bayi, nik_ibu_kandung, jam_lahir, no_telepon_pengantar, no_asuransi, nama_asuransi')
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
    setMenuAksiTerbuka(null)

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
        .select('id, nama_lengkap, no_rekam_medis, no_kk, no_nik, no_bpjs, alamat, jenis_kelamin, rak_id, agama, status_perkawinan, pendidikan, rak_rm(kode_rak, nama_rak)')
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
              .select('id, nama_lengkap, nama_kepala_keluarga, no_rekam_medis, no_kk, no_nik, no_nik_pendamping, nama_ibu_kandung, kewarganegaraan, no_telepon, golongan_darah, foto_url, no_bpjs, alamat, urutan_kk, status_keluarga, status_keluarga_lainnya, tempat_lahir, tanggal_lahir, pekerjaan, jenis_kelamin, agama, status_perkawinan, pendidikan, alamat_ktp_rt, alamat_ktp_rw, alamat_ktp_provinsi, alamat_ktp_kabupaten, alamat_ktp_kecamatan, alamat_ktp_kelurahan, alamat_ktp_kode_pos, alamat_ktp_negara, domisili_sama_dengan_ktp, alamat_domisili, alamat_domisili_rt, alamat_domisili_rw, alamat_domisili_provinsi, alamat_domisili_kabupaten, alamat_domisili_kecamatan, alamat_domisili_kelurahan, alamat_domisili_kode_pos, alamat_domisili_negara, no_identitas_lain, no_telepon_rumah, suku, bahasa_dikuasai, is_bayi_baru_lahir, nama_bayi, nik_ibu_kandung, jam_lahir, no_telepon_pengantar, no_asuransi, nama_asuransi')
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
        instansiId={instansiId}
        refNama={refPasienRakNama}
        refNoRm={refPasienRakNoRm}
        refNik={refPasienRakNik}
        refNikPendamping={refPasienRakNikPendamping}
        refTanggalLahir={refPasienRakTanggalLahir}
        refJenisKelamin={refPasienRakJenisKelamin}
        onFotoChange={onFotoPasienRakChange}
        onSimpanFoto={onSimpanFotoPasienRak}
        onHapusFoto={onHapusFotoPasienRak}
        fotoPreviewUrl={fotoPreviewUrlRak}
        fotoUploading={fotoUploadingRak}
        fotoPending={!!fotoPendingBlobRak}
        popupValidasi={popupValidasi}
        onTutupPopupValidasi={onTutupPopupValidasi}
      />
    )
  }

  return (
    <div
      className="min-h-screen p-3 sm:p-6 pb-24"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div className="max-w-7xl mx-auto">

        <div className="relative mb-8 text-center mt-4">
          <button
            onClick={onClose}
            aria-label="Kembali ke loket"
            className="fixed top-4 left-4 z-[60] flex items-center justify-center w-11 h-11 text-white rounded-full shadow-lg backdrop-blur-sm transition touch-manipulation"
            style={{ background: '#0E7C66' }}
          >
            <i className="ti ti-home text-xl" aria-hidden="true"></i>
          </button>
          <p className="text-sm font-extrabold tracking-tight leading-none">
            <span style={{ color: 'var(--accent)' }}>Epiflow</span>
            <span style={{ color: 'var(--muted)' }}>lytics</span>
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Rak Rekam Medis
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
            Kelola rak dan data pasien tersimpan
          </p>
        </div>

        <div className="space-y-4 sm:space-y-6">

          <div className="relative max-w-md mx-auto">
            <i
              className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-base"
              aria-hidden="true"
              style={{ color: 'var(--muted)' }}
            ></i>
            <input
              type="text"
              value={kataKunciGlobal}
              onChange={(e) => setKataKunciGlobal(e.target.value)}
              placeholder="Cari nama, NIK, atau No. KK (semua rak)"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg outline-none text-sm"
              style={{ border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)' }}
            />
          </div>

          {/* Hasil pencarian global */}
          {kataKunciGlobal.trim() && (
            <div
              className="w-full rounded-2xl overflow-hidden p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            >
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
                Hasil pencarian: "{kataKunciGlobal.trim()}"
              </p>
              {pencarianGlobalLoading && (
                <p className="text-xs py-2" style={{ color: 'var(--muted)' }}>Mencari...</p>
              )}
              {!pencarianGlobalLoading && hasilPencarianGlobal.length === 0 && (
                <p className="text-xs py-2" style={{ color: 'var(--muted)' }}>Tidak ditemukan pasien yang cocok.</p>
              )}
              {!pencarianGlobalLoading && hasilPencarianGlobal.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {hasilPencarianGlobal.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                      style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.nama_lengkap}</p>
                        <p className="truncate" style={{ color: 'var(--muted)' }}>
                          RM: {p.no_rekam_medis || '-'}
                          {p.no_nik ? ` · NIK ${p.no_nik}` : ''}
                          {p.no_kk ? ` · KK ${p.no_kk}` : ''}
                        </p>
                      </div>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full shrink-0 ml-2 whitespace-nowrap"
                        style={{ background: '#fff', border: '1px solid var(--line)', color: 'var(--muted)' }}
                      >
                        Rak {p.rak_rm?.kode_rak || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Panel: form tambah/edit rak + grid daftar rak */}
          <div
            className="w-full rounded-2xl overflow-hidden p-4 sm:p-6"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              boxShadow: '0 1px 2px rgba(18,24,27,0.04), 0 8px 24px rgba(18,24,27,0.08)',
            }}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
              <p className="text-xs flex-1 min-w-[240px]" style={{ color: 'var(--muted)' }}>
                Buat kode rak sesuai cara Anda sendiri (mis. berdasarkan desa/dusun: <b>A-A0</b>,
                atau format lain seperti <b>RAK-1</b>). No. Rekam Medis akan dibuat otomatis
                dengan format <b>{'{kode_rak}'}-0001</b>, mengikuti nomor urut tertinggi
                yang sudah ada di rak itu. Ketuk salah satu rak di daftar untuk melihat isinya.
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
                  className="shrink-0 text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-50 whitespace-nowrap touch-manipulation"
                  style={{ background: '#fef3c7', color: '#854d0e' }}
                >
                  {sinkronLoading ? 'Menyinkronkan...' : '🔄 Sinkronkan Nomor Urut'}
                </button>
              )}
            </div>

            {rakError && (
              <div
                className="rounded-lg px-3 py-2 text-xs mb-4"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
              >
                {rakError}
              </div>
            )}

            {/* Form tambah / edit rak */}
            <form
              onSubmit={onSubmit}
              className="rounded-xl p-3 space-y-2 mb-4"
              style={{ border: '1px solid var(--line)' }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
                    Kode Rak <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={rakForm.kode_rak}
                    onChange={(e) => setRakForm((p) => ({ ...p, kode_rak: e.target.value }))}
                    placeholder="mis. A.A0"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ border: '1px solid var(--line)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
                    Nama / Keterangan
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={rakForm.nama_rak}
                    onChange={(e) => setRakForm((p) => ({ ...p, nama_rak: e.target.value }))}
                    placeholder="mis. Dusun 1"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ border: '1px solid var(--line)' }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={rakLoading}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50 touch-manipulation"
                  style={{ background: 'var(--accent)' }}
                >
                  {rakLoading ? 'Menyimpan...' : rakForm.id ? 'Simpan Perubahan' : '+ Tambah Rak'}
                </button>
                {rakForm.id && (
                  <button
                    type="button"
                    onClick={() => setRakForm({ id: null, kode_rak: '', nama_rak: '' })}
                    className="px-4 py-2.5 rounded-lg text-sm touch-manipulation"
                    style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>

            {/* Daftar rak — grid, wrap ke baris baru, tanpa scroll horizontal */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {rakList.length === 0 && (
                <p className="w-full text-xs text-center py-4" style={{ color: 'var(--muted)' }}>
                  Belum ada rak. Tambahkan di atas.
                </p>
              )}
              {rakList.map((r) => {
                const aktif = rakDilihat?.id === r.id
                return (
                  <div
                    key={r.id}
                    onClick={() => lihatIsiRak(r)}
                    className="relative rounded-xl p-3 text-center cursor-pointer transition touch-manipulation"
                    style={
                      aktif
                        ? { border: '1px solid var(--accent)', background: 'var(--accent-soft)' }
                        : { border: '1px solid var(--line)', background: '#fff' }
                    }
                  >
                    <p className="text-sm font-semibold truncate">{r.kode_rak}</p>
                    {r.nama_rak && (
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{r.nama_rak}</p>
                    )}
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                      {r.jumlah_pasien != null ? `${r.jumlah_pasien} pasien` : `Urut: ${r.nomor_urut_terakhir || 0}`}
                    </p>

                    {/* Tombol aksi per rak — tetap tampil langsung, sesuai kode asli */}
                    <div
                      className="flex items-center justify-center gap-1 mt-2 flex-wrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onBukaTambahPasien(r)}
                        title="Tambah Pasien"
                        className="text-[10px] px-2 py-1 rounded font-semibold text-white touch-manipulation"
                        style={{ background: 'var(--accent)' }}
                      >
                        + Pasien
                      </button>
                      <button
                        onClick={() => onEdit(r)}
                        title="Edit rak"
                        className="text-[10px] px-2 py-1 rounded touch-manipulation"
                        style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(r.id)}
                        title="Hapus rak"
                        className="text-[10px] px-2 py-1 rounded touch-manipulation"
                        style={{ border: '1px solid var(--danger)', color: 'var(--danger)' }}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Link bantuan cek BPJS / e-Puskesmas */}
            <div className="flex items-center gap-2 flex-wrap mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
              <a
                href={PCARE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium hover:underline whitespace-nowrap"
                style={{ color: 'var(--accent)' }}
                title="Buka PCare BPJS untuk cek keaktifan peserta (login akun Anda sendiri)"
              >
                Cek keaktifan BPJS lewat PCare
              </a>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>|</span>
              <a
                href={EPUSKESMAS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium hover:underline whitespace-nowrap"
                style={{ color: 'var(--accent)' }}
                title="Buka e-Puskesmas untuk cek data pasien (login akun instansi Anda)"
              >
                Cek di e-Puskesmas
              </a>
            </div>
          </div>

          {/* Panel: isi rak yang sedang dibuka.
              Mobile: full-screen overlay (fixed inset-0) supaya konten & search
              bar-nya memenuhi layar dan tidak "terjepit" di tengah halaman
              seperti panel biasa — mirip pola "buka rak = pindah halaman".
              Desktop (sm:): tetap panel biasa menyatu di halaman, tidak berubah. */}
          {rakDilihat && (
            <div
              className="fixed inset-0 z-[85] flex flex-col sm:static sm:z-auto sm:block sm:w-full sm:rounded-2xl sm:overflow-hidden"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                boxShadow: '0 1px 2px rgba(18,24,27,0.04), 0 8px 24px rgba(18,24,27,0.08)',
              }}
            >
              <div
                className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 shrink-0"
                style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}
              >
                <button
                  type="button"
                  onClick={() => setRakDilihat(null)}
                  aria-label="Kembali"
                  className="sm:hidden shrink-0 p-1.5 -ml-1.5 rounded-lg touch-manipulation"
                  style={{ color: 'var(--muted)' }}
                >
                  <i className="ti ti-arrow-left text-lg" aria-hidden="true"></i>
                </button>
                <p className="text-sm font-semibold shrink-0 sm:shrink">
                  Isi rak {rakDilihat.kode_rak}
                  {rakDilihat.nama_rak ? ` — ${rakDilihat.nama_rak}` : ''}
                </p>
                <div className="relative flex-1 sm:flex-none sm:w-56 sm:ml-auto">
                  <i
                    className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm"
                    aria-hidden="true"
                    style={{ color: 'var(--muted)' }}
                  ></i>
                  <input
                    type="text"
                    value={kataKunciPasien}
                    onChange={(e) => setKataKunciPasien(e.target.value)}
                    placeholder="Cari di rak ini..."
                    className="w-full rounded-lg pl-8 pr-2 py-2 text-xs outline-none"
                    style={{ border: '1px solid var(--line)', background: '#fff' }}
                  />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-visible sm:flex-none">
              {isiRakError && (
                <div
                  className="px-4 sm:px-6 py-3 text-xs"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderBottom: '1px solid var(--line)' }}
                >
                  {isiRakError}
                </div>
              )}
              {isiRakLoading && (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--muted)' }}>Memuat isi rak...</p>
              )}
              {!isiRakLoading && !isiRakError && isiRak.length === 0 && (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--muted)' }}>Belum ada pasien tersimpan di rak ini.</p>
              )}
              {!isiRakLoading && isiRak.length > 0 && isiRakTersaring.length === 0 && (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--muted)' }}>Tidak ada pasien yang cocok dengan pencarian.</p>
              )}

              {!isiRakLoading && isiRakTersaring.length > 0 && (
                <>
                  {/* ── Tampilan kartu — layar kecil (HP) ── */}
                  <div
                    className="sm:hidden p-3 space-y-3"
                    onScroll={menuAksiTerbuka ? tutupMenuAksi : undefined}
                  >
                    {grupRmTersaring.map((g) => {
                      const p = g.wakil
                      const jumlah = g.anggota.length
                      return (
                        <div
                          key={g.kunci}
                          className="rounded-xl p-3"
                          style={{ border: '1px solid var(--line)', background: '#fff' }}
                        >
                          <div className="flex justify-between items-start mb-2.5 gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">
                                {p.nama_lengkap}{jumlah > 1 ? ` + ${jumlah - 1}` : ''}
                              </p>
                              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                                No. RM {p.no_rekam_medis || '-'}
                              </p>
                            </div>
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                onClick={() => bukaMenuAksi(g)}
                                aria-label="Aksi lainnya"
                                className="p-1.5 rounded-lg touch-manipulation"
                                style={{ color: 'var(--muted)' }}
                              >
                                <i className="ti ti-dots-vertical text-lg" aria-hidden="true"></i>
                              </button>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => bukaWizardPeriksa(p)}
                              className="flex-1 py-2.5 rounded-lg text-xs font-semibold touch-manipulation flex items-center justify-center gap-1.5"
                              style={{ background: 'var(--success-soft, #dcfce7)', color: 'var(--success, #15803d)' }}
                            >
                              <i className="ti ti-stethoscope text-sm" aria-hidden="true"></i>
                              Periksa
                            </button>
                            <button
                              type="button"
                              onClick={() => setGrupRmDilihat(g)}
                              className="flex-1 py-2.5 rounded-lg text-xs font-semibold touch-manipulation flex items-center justify-center gap-1.5"
                              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                            >
                              <i className="ti ti-eye text-sm" aria-hidden="true"></i>
                              Lihat isi{jumlah > 1 ? ` (${jumlah})` : ''}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* ── Tampilan tabel — layar besar (desktop/tablet) ── */}
                  <div className="hidden sm:block overflow-x-auto max-h-[65vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)' }}>
                          <th className="text-left px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>No. RM</th>
                          <th className="text-left px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>No. urut KK</th>
                          <th className="text-left px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>No. KK</th>
                          <th className="text-left px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>NIK</th>
                          <th className="text-left px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>No. BPJS</th>
                          <th className="text-left px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>Nama</th>
                          <th className="text-left px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>Alamat</th>
                          <th className="text-left px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>JK</th>
                          <th className="text-right px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupRmTersaring.map((g) => {
                          const p = g.wakil
                          const jumlah = g.anggota.length
                          return (
                            <tr key={g.kunci} style={{ borderBottom: '1px solid var(--line)' }}>
                              <td className="px-4 py-3 whitespace-nowrap" title={p.no_rekam_medis}>{p.no_rekam_medis || '-'}</td>
                              <td className="px-4 py-3">
                                <span
                                  className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full font-semibold text-[11px]"
                                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                                >
                                  {p.urutan_kk || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 truncate max-w-[120px]" title={p.no_kk}>{p.no_kk || '-'}</td>
                              <td className="px-4 py-3 truncate max-w-[120px]" title={p.no_nik}>{p.no_nik || '-'}</td>
                              <td className="px-4 py-3 truncate max-w-[120px]" title={p.no_bpjs}>{p.no_bpjs || '-'}</td>
                              <td className="px-4 py-3 font-medium truncate max-w-[160px]" title={p.nama_lengkap}>{p.nama_lengkap}</td>
                              <td className="px-4 py-3 truncate max-w-[160px]" title={p.alamat}>{p.alamat || '-'}</td>
                              <td className="px-4 py-3">{p.jenis_kelamin === 'L' ? 'L' : p.jenis_kelamin === 'P' ? 'P' : '-'}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => setGrupRmDilihat(g)}
                                    title="Lihat semua pasien dengan No. RM ini"
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1"
                                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                                  >
                                    <i className="ti ti-eye text-sm" aria-hidden="true"></i>
                                    Lihat isi ({jumlah})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onEditPasienRak(rakDilihat, p)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                                    style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
                                  >
                                    <i className="ti ti-edit text-sm" aria-hidden="true"></i>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onTambahAnggotaGrup && onTambahAnggotaGrup(rakDilihat, p)}
                                    title="Tambah anggota baru ke grup No. RM ini"
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1"
                                    style={{ background: '#f3e8ff', color: '#7e22ce' }}
                                  >
                                    <i className="ti ti-user-plus text-sm" aria-hidden="true"></i>
                                    Tambah
                                  </button>
                                  {onPisahkanRmBaru && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (jumlah > 1) {
                                          window.alert(
                                            'Grup ini punya lebih dari satu anggota. Buka "Lihat isi" dulu, lalu pilih anggota yang mau dipisahkan.'
                                          )
                                          setGrupRmDilihat(g)
                                          return
                                        }
                                        setRakTujuanPisah(rakDilihat?.id || '')
                                        setPasienPisahDipilih(p)
                                      }}
                                      title="Pisahkan pasien ini ke No. RM baru (mis. anak yang sudah menikah). Riwayat pemeriksaan otomatis ikut ke RM baru."
                                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1"
                                      style={{ background: '#fef3c7', color: '#854d0e' }}
                                    >
                                      <i className="ti ti-arrows-split text-sm" aria-hidden="true"></i>
                                      Pisah RM
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => bukaWizardPeriksa(p)}
                                    title="Periksa pasien ini (buka form pendaftaran)"
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1"
                                    style={{ background: 'var(--success-soft, #dcfce7)', color: 'var(--success, #15803d)' }}
                                  >
                                    <i className="ti ti-stethoscope text-sm" aria-hidden="true"></i>
                                    Periksa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleHapusPasien(p.id)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                                  >
                                    <i className="ti ti-trash text-sm" aria-hidden="true"></i>
                                    Hapus
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wizard PERIKSA pasien dari tabel rak: 1) pilih Poli Tujuan, 2) pilih Dokter/PJ Ruangan
          yang bertugas di poli itu, 3) pilih kategori BPJS/Umum/Asuransi Lainnya. Baru setelah lengkap,
          form pendaftaran dibuka lewat onPeriksaPasienRak. */}
      {pasienPeriksaDipilih && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[95] p-4"
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
              {['poli', 'petugas', 'kategori'].map((lk, i) => {
                const langkahEfektif = (langkahPeriksa === 'konfirmasi_bpjs' || langkahPeriksa === 'konfirmasi_umum' || langkahPeriksa === 'konfirmasi_asuransi') ? 'kategori' : langkahPeriksa
                return (
                  <span
                    key={lk}
                    className={`h-1.5 rounded-full transition-all ${
                      langkahEfektif === lk
                        ? 'w-6 bg-teal-600'
                        : (['poli', 'petugas', 'kategori'].indexOf(langkahEfektif) > i)
                          ? 'w-1.5 bg-teal-300'
                          : 'w-1.5 bg-gray-200'
                    }`}
                  />
                )
              })}
            </div>

            {/* Langkah 1: Poli Tujuan */}
            {langkahPeriksa === 'poli' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500 mb-1">Pilih poli tujuan:</p>
                {(!polis || polis.length === 0) && (
                  <p className="text-xs text-gray-400 text-center py-3">Belum ada poli yang ditambahkan admin instansi.</p>
                )}
                <div className="max-h-64 overflow-y-auto flex flex-col gap-2">
                  {(polis || [])
                    .filter((poli) => poli.nama_poli?.toUpperCase() !== 'LOKET')
                    .map((poli) => (
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
              const daftarPetugas = (petugasPoliList || []).filter(
                (pt) => pt.poli_id === poliPeriksaDipilih?.id && pt.profesi?.toUpperCase() !== 'PERAWAT'
              )
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

            {/* Langkah 3: Kategori BPJS/Umum/Asuransi Lainnya */}
            {langkahPeriksa === 'kategori' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  {poliPeriksaDipilih?.nama_poli} — {petugasPeriksaDipilih?.nama_lengkap}
                </p>
                <button
                  type="button"
                  onClick={() => setLangkahPeriksa('konfirmasi_bpjs')}
                  className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700"
                >
                  BPJS
                </button>
                <button
                  type="button"
                  onClick={() => setLangkahPeriksa('konfirmasi_umum')}
                  className="w-full py-3 rounded-xl bg-gray-700 text-white font-semibold text-sm hover:bg-gray-800"
                >
                  UMUM
                </button>
                <button
                  type="button"
                  onClick={() => setLangkahPeriksa('konfirmasi_asuransi')}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700"
                >
                  ASURANSI LAINNYA
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

            {/* Langkah 3b: Konfirmasi keaktifan BPJS — muncul setelah tombol BPJS
                dipilih, supaya petugas loket disiplin cek dulu di PCare sebelum
                melanjutkan pendaftaran (menghindari klaim BPJS yang ternyata tidak aktif). */}
            {langkahPeriksa === 'konfirmasi_bpjs' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500 text-center mb-1">
                  {poliPeriksaDipilih?.nama_poli} — {petugasPeriksaDipilih?.nama_lengkap}
                </p>
                <p className="text-sm text-gray-700 text-center px-1 mb-1">
                  Apakah Anda yakin BPJS pasien ini <span className="font-semibold">aktif</span>?
                  <br />
                  Jika belum yakin, silakan cek dulu di PCare.
                </p>
                <a
                  href={PCARE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Buka PCare BPJS untuk cek keaktifan peserta (login akun Anda sendiri)"
                  className="w-full py-2.5 rounded-xl border border-teal-600 text-teal-700 text-center font-medium text-sm hover:bg-teal-50"
                >
                  🔎 Cek PCare
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const p = pasienPeriksaDipilih
                    const poliId = poliPeriksaDipilih?.id
                    const petugasId = petugasPeriksaDipilih?.id
                    tutupWizardPeriksa()
                    onPeriksaPasienRak && onPeriksaPasienRak(p, poliId, petugasId, 'bpjs', true)
                  }}
                  className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700"
                >
                  Lanjutkan Pendaftaran
                </button>
                <button
                  type="button"
                  onClick={() => setLangkahPeriksa('kategori')}
                  className="w-full mt-1 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                >
                  ← Kembali pilih kategori
                </button>
              </div>
            )}

            {/* Langkah 3d: Konfirmasi ASURANSI LAINNYA (mis. Jasa Raharja) — biaya
                ditanggung penjamin, jadi tidak ada retribusi loket dan tidak ada
                cek PCare. Nama asuransi & nomor kartu/polis diisi di form berikutnya. */}
            {langkahPeriksa === 'konfirmasi_asuransi' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500 text-center mb-1">
                  {poliPeriksaDipilih?.nama_poli} — {petugasPeriksaDipilih?.nama_lengkap}
                </p>
                <p className="text-sm text-gray-700 text-center px-1 mb-1">
                  Pasien ditanggung <span className="font-semibold">asuransi lainnya</span>{' '}
                  (mis. Jasa Raharja).
                </p>
                <p className="text-xs text-gray-500 text-center px-1 mb-1">
                  Tidak dikenakan retribusi loket. Nama asuransi dan nomor kartu/polis
                  wajib diisi di form pendaftaran berikutnya.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const p = pasienPeriksaDipilih
                    const poliId = poliPeriksaDipilih?.id
                    const petugasId = petugasPeriksaDipilih?.id
                    tutupWizardPeriksa()
                    onPeriksaPasienRak && onPeriksaPasienRak(p, poliId, petugasId, 'asuransi_lainnya', null)
                  }}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700"
                >
                  Lanjutkan Pendaftaran
                </button>
                <button
                  type="button"
                  onClick={() => setLangkahPeriksa('kategori')}
                  className="w-full mt-1 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                >
                  ← Kembali pilih kategori
                </button>
              </div>
            )}

            {/* Langkah 3c: Konfirmasi pembayaran retribusi UMUM — muncul setelah
                tombol UMUM dipilih, supaya petugas loket menagih retribusi
                sebelum form pendaftaran dibuka. */}
            {langkahPeriksa === 'konfirmasi_umum' && (() => {
              const totalRetribusi = (tarifLoket || []).reduce(
                (sum, t) => sum + Number(t.nominal || 0),
                0
              )
              return (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-500 text-center mb-1">
                    {poliPeriksaDipilih?.nama_poli} — {petugasPeriksaDipilih?.nama_lengkap}
                  </p>
                  <p className="text-sm text-gray-700 text-center px-1 mb-1">
                    Retribusi loket untuk pasien umum:
                  </p>
                  <p className="text-xl font-bold text-gray-800 text-center mb-1">
                    Rp {totalRetribusi.toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-gray-500 text-center px-1 mb-1">
                    Pastikan pasien sudah membayar sebelum melanjutkan pendaftaran.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const p = pasienPeriksaDipilih
                      const poliId = poliPeriksaDipilih?.id
                      const petugasId = petugasPeriksaDipilih?.id
                      tutupWizardPeriksa()
                      onPeriksaPasienRak && onPeriksaPasienRak(p, poliId, petugasId, 'umum', null)
                    }}
                    className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700"
                  >
                    Sudah Bayar
                  </button>
                  <button
                    type="button"
                    onClick={tutupWizardPeriksa}
                    className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-600 text-center font-medium text-sm hover:bg-gray-50"
                  >
                    Tidak Jadi Periksa
                  </button>
                  <button
                    type="button"
                    onClick={() => setLangkahPeriksa('kategori')}
                    className="w-full mt-1 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                  >
                    ← Kembali pilih kategori
                  </button>
                </div>
              )
            })()}

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
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[95] p-4"
          onClick={() => setGrupRmDilihat(null)}
        >
          <div
            className="rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            style={{ background: '#fff' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 p-4 border-b sticky top-0" style={{ background: '#fff', borderColor: 'var(--line)' }}>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  No. RM {grupRmDilihatTerbaru.no_rekam_medis || '-'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {grupRmDilihatTerbaru.anggota.length} pasien tergabung dalam No. RM ini
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGrupRmDilihat(null)}
                aria-label="Tutup"
                className="shrink-0 p-1 touch-manipulation"
                style={{ color: 'var(--muted)' }}
              >
                <i className="ti ti-x text-lg" aria-hidden="true"></i>
              </button>
            </div>
            <div className="p-3 space-y-2.5">
              {grupRmDilihatTerbaru.anggota.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl p-3"
                  style={{ border: '1px solid var(--line)' }}
                >
                  <div className="mb-2.5">
                    <p className="font-semibold text-sm">
                      {p.nama_lengkap}
                      {p.urutan_kk ? (
                        <span
                          className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full font-semibold text-[10px] align-middle"
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                        >
                          {p.urutan_kk}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {labelStatusKeluarga(p.status_keluarga, p.status_keluarga_lainnya) || '-'}
                      {p.no_nik ? ` · NIK ${p.no_nik}` : ''}
                      {p.jenis_kelamin ? ` · ${p.jenis_kelamin}` : ''}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setGrupRmDilihat(null)
                        bukaWizardPeriksa(p)
                      }}
                      className="py-2 rounded-lg text-xs font-semibold touch-manipulation flex items-center justify-center gap-1.5"
                      style={{ background: 'var(--success-soft, #dcfce7)', color: 'var(--success, #15803d)' }}
                    >
                      <i className="ti ti-stethoscope text-sm" aria-hidden="true"></i>
                      Periksa
                    </button>
                    {onLihatRiwayatPasien && (
                      <button
                        type="button"
                        onClick={() => onLihatRiwayatPasien(p)}
                        className="py-2 rounded-lg text-xs font-semibold touch-manipulation flex items-center justify-center gap-1.5"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        <i className="ti ti-history text-sm" aria-hidden="true"></i>
                        Riwayat
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setGrupRmDilihat(null)
                        onEditPasienRak(rakDilihat, p)
                      }}
                      className="py-2 rounded-lg text-xs font-semibold touch-manipulation flex items-center justify-center gap-1.5"
                      style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}
                    >
                      <i className="ti ti-edit text-sm" aria-hidden="true"></i>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGrupRmDilihat(null)
                        onTambahAnggotaGrup && onTambahAnggotaGrup(rakDilihat, p)
                      }}
                      className="py-2 rounded-lg text-xs font-semibold touch-manipulation flex items-center justify-center gap-1.5"
                      style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}
                    >
                      <i className="ti ti-user-plus text-sm" aria-hidden="true"></i>
                      Tambah anggota
                    </button>
                    {onPisahkanRmBaru && (
                      <button
                        type="button"
                        onClick={() => {
                          setRakTujuanPisah(rakDilihat?.id || '')
                          setPasienPisahDipilih(p)
                        }}
                        className="py-2 rounded-lg text-xs font-semibold touch-manipulation flex items-center justify-center gap-1.5"
                        style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}
                      >
                        <i className="ti ti-arrows-split text-sm" aria-hidden="true"></i>
                        Pisah RM
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleHapusPasien(p.id)}
                      className="py-2 rounded-lg text-xs font-semibold touch-manipulation flex items-center justify-center gap-1.5"
                      style={{ border: '1px solid var(--danger)', color: 'var(--danger)' }}
                    >
                      <i className="ti ti-trash text-sm" aria-hidden="true"></i>
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet "Aksi lainnya" (mobile) — full lebar layar, menempel di
          bawah, z-index di atas BottomBar navigasi supaya tidak pernah
          tertindis. Di-render lewat portal ke document.body sehingga lepas
          dari batasan overflow-y-auto container daftar pasien. */}
      {menuAksiTerbuka && createPortal(
        <div className="sm:hidden">
          <div
            className="fixed inset-0 z-[90] bg-black/40"
            onClick={tutupMenuAksi}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[91] rounded-t-2xl overflow-hidden"
            style={{ background: '#fff', boxShadow: '0 -8px 24px rgba(18,24,27,0.16)' }}
          >
            <div className="px-4 pt-3 pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: 'var(--line)' }} />
              <p className="font-semibold text-sm truncate">
                {menuAksiTerbuka.p.nama_lengkap}
                {menuAksiTerbuka.jumlah > 1 ? ` + ${menuAksiTerbuka.jumlah - 1}` : ''}
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                No. RM {menuAksiTerbuka.p.no_rekam_medis || '-'}
              </p>
            </div>
            <div className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => { onEditPasienRak(rakDilihat, menuAksiTerbuka.p); tutupMenuAksi() }}
                className="w-full flex items-center gap-3 px-3 py-3 text-sm text-left touch-manipulation rounded-lg"
              >
                <i className="ti ti-edit text-lg" aria-hidden="true" style={{ color: 'var(--muted)' }}></i>
                Edit
              </button>
              <button
                type="button"
                onClick={() => { onTambahAnggotaGrup && onTambahAnggotaGrup(rakDilihat, menuAksiTerbuka.p); tutupMenuAksi() }}
                className="w-full flex items-center gap-3 px-3 py-3 text-sm text-left touch-manipulation rounded-lg"
              >
                <i className="ti ti-user-plus text-lg" aria-hidden="true" style={{ color: 'var(--muted)' }}></i>
                Tambah anggota
              </button>
              {onPisahkanRmBaru && (
                <button
                  type="button"
                  onClick={() => {
                    const { g, p, jumlah } = menuAksiTerbuka
                    tutupMenuAksi()
                    if (jumlah > 1) {
                      window.alert(
                        'Grup ini punya lebih dari satu anggota. Buka "Lihat isi" dulu, lalu pilih anggota yang mau dipisahkan.'
                      )
                      setGrupRmDilihat(g)
                      return
                    }
                    setRakTujuanPisah(rakDilihat?.id || '')
                    setPasienPisahDipilih(p)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 text-sm text-left touch-manipulation rounded-lg"
                >
                  <i className="ti ti-arrows-split text-lg" aria-hidden="true" style={{ color: 'var(--muted)' }}></i>
                  Pisah RM
                </button>
              )}
              <button
                type="button"
                onClick={() => { handleHapusPasien(menuAksiTerbuka.p.id); tutupMenuAksi() }}
                className="w-full flex items-center gap-3 px-3 py-3 text-sm text-left touch-manipulation rounded-lg"
                style={{ color: 'var(--danger)' }}
              >
                <i className="ti ti-trash text-lg" aria-hidden="true"></i>
                Hapus
              </button>
              <button
                type="button"
                onClick={tutupMenuAksi}
                className="w-full py-3 text-sm font-semibold text-center touch-manipulation rounded-lg mt-1"
                style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Dialog pilih rak tujuan untuk Pisah RM Baru */}
      {pasienPisahDipilih && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[95] p-4"
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