import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'
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
  onRefreshPetugasPoli,
  tarifLoket,
}) {
  // Pasien yang sedang dipilih untuk fitur PERIKSA (wizard 3 langkah: poli → petugas → kategori)
  const [pasienPeriksaDipilih, setPasienPeriksaDipilih] = useState(null)
  const [langkahPeriksa, setLangkahPeriksa] = useState('poli') // 'poli' | 'petugas' | 'kategori' | 'konfirmasi_bpjs' | 'konfirmasi_umum'
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
        .select('id, nama_lengkap, nama_kepala_keluarga, no_rekam_medis, no_kk, no_nik, no_bpjs, alamat, urutan_kk, status_keluarga, status_keluarga_lainnya, tempat_lahir, tanggal_lahir, pekerjaan, jenis_kelamin')
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
              .select('id, nama_lengkap, nama_kepala_keluarga, no_rekam_medis, no_kk, no_nik, no_bpjs, alamat, urutan_kk, status_keluarga, status_keluarga_lainnya, tempat_lahir, tanggal_lahir, pekerjaan, jenis_kelamin')
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
              {['poli', 'petugas', 'kategori'].map((lk, i) => {
                const langkahEfektif = (langkahPeriksa === 'konfirmasi_bpjs' || langkahPeriksa === 'konfirmasi_umum') ? 'kategori' : langkahPeriksa
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

            {/* Langkah 3: Kategori BPJS/Umum */}
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