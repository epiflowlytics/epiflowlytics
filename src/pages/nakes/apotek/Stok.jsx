import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

const BENTUK_SEDIAAN = [
  'tablet', 'kapsul', 'sirup', 'suspensi', 'injeksi',
  'salep', 'krim', 'tetes', 'supositoria', 'serbuk', 'lainnya',
]

const SATUAN_KEKUATAN = ['mg', 'mcg', 'g', 'ml', 'IU', '%']

const JENIS_MUTASI = [
  { value: 'penerimaan', label: 'Penerimaan (stok masuk)', butuhAlasan: false },
  { value: 'opname', label: 'Stok opname (hasil hitung fisik)', butuhAlasan: true },
  { value: 'rusak', label: 'Rusak', butuhAlasan: true },
  { value: 'kedaluwarsa', label: 'Kedaluwarsa', butuhAlasan: true },
  { value: 'koreksi', label: 'Koreksi (hasil hitung fisik)', butuhAlasan: true },
]

const FORM_OBAT_KOSONG = {
  nama_obat: '',
  nama_generik: '',
  nama_dagang: '',
  kode_obat: '',
  kategori: '',
  bentuk_sediaan: '',
  kekuatan: '',
  satuan_kekuatan: '',
  satuan: 'tablet',
  satuan_kemasan: '',
  lokasi_rak: '',
  stok: '',
  stok_minimum: '10',
  harga_satuan: '',
  keterangan: '',
}

/**
 * Tab Stok Obat — Dashboard Apoteker.
 *
 * Perubahan dari versi lama:
 * - Master obat memakai kolom lengkap sesuai Kepmenkes 1423/2022 (nama generik/dagang,
 *   kode obat, bentuk sediaan, kekuatan, lokasi rak) selain kolom lama yang tetap dipakai
 *   resep/etiket (nama_obat, satuan).
 * - Perubahan stok TIDAK lagi lewat UPDATE langsung ke obat_masuk.stok (itu "jalan pintas"
 *   yang melewati jejak audit). Semua perubahan manual lewat RPC catat_mutasi_stok, yang
 *   memvalidasi peran apoteker, mencegah stok negatif, dan menulis baris ke mutasi_stok.
 *   Pengeluaran resep tetap otomatis lewat trigger kurangi_stok_obat (tidak berubah).
 */
export default function StokObat({ instansiId, onSukses, onError }) {
  const [obatMasuk, setObatMasuk] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [dimuat, setDimuat] = useState(false)

  const [showFormObat, setShowFormObat] = useState(false)
  const [formObat, setFormObat] = useState(FORM_OBAT_KOSONG)
  const [loadingObat, setLoadingObat] = useState(false)

  // Modal mutasi stok (pengganti prompt() lama)
  const [obatMutasi, setObatMutasi] = useState(null) // baris obat_masuk yang sedang diubah stoknya
  const [formMutasi, setFormMutasi] = useState({ jenis: 'penerimaan', jumlah: '', alasan: '' })
  const [loadingMutasi, setLoadingMutasi] = useState(false)

  // Modal konfirmasi hapus stok (soft delete: is_aktif = false, agar jejak mutasi_stok tetap utuh)
  const [obatHapus, setObatHapus] = useState(null)
  const [loadingHapus, setLoadingHapus] = useState(false)

  const [cari, setCari] = useState('')

  // kategori mana saja yang sedang dibuka (accordion) di daftar Stok
  const [kategoriTerbuka, setKategoriTerbuka] = useState({}) // { namaKategori: true }

  // daftar kategori unik yang sudah ada, untuk dropdown Kategori di form Tambah
  const [kategoriList, setKategoriList] = useState([])
  const [kategoriPilihan, setKategoriPilihan] = useState('') // '' = belum pilih, '__baru__' = ketik manual
  const KATEGORI_BARU = '__baru__'

  async function fetchObatMasuk(idInstansi) {
    const id = idInstansi || instansiId
    setLoadingList(true)
    let query = supabase
      .from('obat_masuk')
      .select('*')
      .eq('is_aktif', true)
      .order('nama_obat', { ascending: true })

    if (id) query = query.eq('instansi_id', id)

    const { data, error } = await query
    setLoadingList(false)
    setDimuat(true)

    if (error) {
      onError?.(error.message)
      return
    }
    setObatMasuk(data || [])
    const unik = Array.from(
      new Set((data || []).map((o) => (o.kategori || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))
    setKategoriList(unik)
  }

  // Muat data begitu tab ini pertama kali dibuka.
  if (!dimuat && !loadingList && instansiId) {
    fetchObatMasuk(instansiId)
  }

  function handleFormObatChange(e) {
    const { name, value } = e.target
    setFormObat((f) => ({ ...f, [name]: value }))
  }

  async function tambahObat(e) {
    e.preventDefault()
    onError?.('')
    setLoadingObat(true)
    try {
      if (!formObat.nama_obat.trim()) throw new Error('Nama obat wajib diisi.')
      if (formObat.kekuatan && isNaN(parseFloat(formObat.kekuatan))) {
        throw new Error('Kekuatan harus berupa angka.')
      }

      const { error: err } = await supabase.from('obat_masuk').insert({
        instansi_id: instansiId || null,
        nama_obat: formObat.nama_obat.trim(),
        nama_generik: formObat.nama_generik.trim() || null,
        nama_dagang: formObat.nama_dagang.trim() || null,
        kode_obat: formObat.kode_obat.trim() || null,
        kategori: formObat.kategori.trim() || null,
        bentuk_sediaan: formObat.bentuk_sediaan || null,
        kekuatan: formObat.kekuatan ? parseFloat(formObat.kekuatan) : null,
        satuan_kekuatan: formObat.kekuatan ? (formObat.satuan_kekuatan || null) : null,
        satuan: formObat.satuan.trim() || 'tablet',
        satuan_kemasan: formObat.satuan_kemasan.trim() || null,
        lokasi_rak: formObat.lokasi_rak.trim() || null,
        stok: formObat.stok ? parseInt(formObat.stok, 10) : 0,
        stok_minimum: formObat.stok_minimum ? parseInt(formObat.stok_minimum, 10) : 10,
        harga_satuan: formObat.harga_satuan ? parseFloat(formObat.harga_satuan) : null,
        keterangan: formObat.keterangan.trim() || null,
        is_aktif: true,
      })
      if (err) throw new Error(err.message)

      onSukses?.('Obat berhasil ditambahkan ke stok.')
      setFormObat(FORM_OBAT_KOSONG)
      setKategoriPilihan('')
      setShowFormObat(false)
      fetchObatMasuk(instansiId)
    } catch (err) {
      onError?.(err.message)
    } finally {
      setLoadingObat(false)
    }
  }

  function bukaMutasi(obat) {
    onError?.('')
    setObatMutasi(obat)
    setFormMutasi({ jenis: 'penerimaan', jumlah: '', alasan: '' })
  }

  function tutupMutasi() {
    setObatMutasi(null)
  }

  const jenisMutasiAktif = JENIS_MUTASI.find((j) => j.value === formMutasi.jenis)
  const isOpnameKoreksi = formMutasi.jenis === 'opname' || formMutasi.jenis === 'koreksi'

  async function simpanMutasi(e) {
    e.preventDefault()
    if (!obatMutasi) return
    onError?.('')
    setLoadingMutasi(true)
    try {
      const jumlahNum = parseInt(formMutasi.jumlah, 10)
      if (isNaN(jumlahNum) || jumlahNum < 0) {
        throw new Error(
          isOpnameKoreksi
            ? 'Masukkan hasil hitung fisik stok (angka 0 atau lebih).'
            : 'Masukkan jumlah yang valid (angka 0 atau lebih).'
        )
      }
      if (jenisMutasiAktif?.butuhAlasan && !formMutasi.alasan.trim()) {
        throw new Error('Alasan wajib diisi untuk jenis mutasi ini.')
      }

      const { error: err } = await supabase.rpc('catat_mutasi_stok', {
        p_obat_id: obatMutasi.id,
        p_jenis: formMutasi.jenis,
        p_jumlah: jumlahNum,
        p_alasan: formMutasi.alasan.trim() || null,
      })
      if (err) throw new Error(err.message)

      onSukses?.(`Stok ${obatMutasi.nama_obat} berhasil diperbarui.`)
      setObatMutasi(null)
      fetchObatMasuk(instansiId)
    } catch (err) {
      onError?.(err.message)
    } finally {
      setLoadingMutasi(false)
    }
  }

  function bukaHapus(obat) {
    onError?.('')
    setObatHapus(obat)
  }

  function tutupHapus() {
    setObatHapus(null)
  }

  // Soft delete: set is_aktif = false lewat UPDATE (RLS hanya izinkan UPDATE, bukan DELETE,
  // dan mutasi_stok.obat_id mereferensikan baris ini tanpa cascade, jadi hard delete akan
  // merusak jejak audit atau gagal kalau obat ini pernah punya riwayat mutasi).
  async function hapusObat() {
    if (!obatHapus) return
    onError?.('')
    setLoadingHapus(true)
    try {
      const { error: err } = await supabase
        .from('obat_masuk')
        .update({ is_aktif: false })
        .eq('id', obatHapus.id)
      if (err) throw new Error(err.message)

      onSukses?.(`${obatHapus.nama_obat} berhasil dihapus dari daftar Stok.`)
      setObatHapus(null)
      fetchObatMasuk(instansiId)
    } catch (err) {
      onError?.(err.message)
    } finally {
      setLoadingHapus(false)
    }
  }

  const obatTersaring = cari.trim()
    ? obatMasuk.filter((o) => {
        const q = cari.trim().toLowerCase()
        return (
          (o.nama_obat || '').toLowerCase().includes(q) ||
          (o.nama_generik || '').toLowerCase().includes(q) ||
          (o.nama_dagang || '').toLowerCase().includes(q) ||
          (o.kode_obat || '').toLowerCase().includes(q) ||
          (o.lokasi_rak || '').toLowerCase().includes(q)
        )
      })
    : obatMasuk

  const TANPA_KATEGORI = 'Tanpa kategori'

  // kelompokkan hasil pencarian per kategori, urut nama kategori (Tanpa kategori selalu di akhir)
  const kelompokKategori = (() => {
    const map = new Map()
    for (const o of obatTersaring) {
      const k = (o.kategori || '').trim() || TANPA_KATEGORI
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(o)
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === TANPA_KATEGORI) return 1
      if (b === TANPA_KATEGORI) return -1
      return a.localeCompare(b)
    })
  })()

  function toggleKategori(nama) {
    setKategoriTerbuka((prev) => ({ ...prev, [nama]: !prev[nama] }))
  }

  // saat sedang mencari, buka otomatis semua kategori yang punya hasil supaya langsung terlihat
  const sedangCari = cari.trim().length > 0
  const kategoriDibuka = (nama) => (sedangCari ? true : !!kategoriTerbuka[nama])

  function deskripsiSediaan(o) {
    const bagian = []
    if (o.bentuk_sediaan) bagian.push(o.bentuk_sediaan)
    if (o.kekuatan) bagian.push(`${o.kekuatan}${o.satuan_kekuatan || ''}`)
    return bagian.join(' · ') || '-'
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-semibold text-gray-700">Stok</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama, kode, atau rak..."
            className="border rounded-lg px-3 py-1.5 text-sm w-56"
          />
          <button
            onClick={() => fetchObatMasuk(instansiId)}
            className="text-xs text-purple-600 hover:underline"
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => setShowFormObat((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium"
          >
            {showFormObat ? 'Tutup' : '+ Tambah'}
          </button>
        </div>
      </div>

      {showFormObat && (
        <form onSubmit={tambahObat} className="border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text" name="nama_obat" value={formObat.nama_obat} onChange={handleFormObatChange}
              placeholder="Nama obat (tampil di resep/etiket) *" className="border rounded-lg px-3 py-2 text-sm"
            />
            <div>
              <select
                value={kategoriPilihan}
                onChange={(e) => {
                  const v = e.target.value
                  setKategoriPilihan(v)
                  setFormObat((f) => ({ ...f, kategori: v === KATEGORI_BARU ? '' : v }))
                }}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">-- Kategori (opsional) --</option>
                {kategoriList.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
                <option value={KATEGORI_BARU}>+ Kategori baru</option>
              </select>
              {kategoriPilihan === KATEGORI_BARU && (
                <input
                  type="text"
                  name="kategori"
                  value={formObat.kategori}
                  onChange={handleFormObatChange}
                  maxLength={60}
                  placeholder="Ketik nama kategori baru"
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-2"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <input
              type="text" name="nama_generik" value={formObat.nama_generik} onChange={handleFormObatChange}
              placeholder="Nama generik" className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text" name="nama_dagang" value={formObat.nama_dagang} onChange={handleFormObatChange}
              placeholder="Nama dagang / merek" className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text" name="kode_obat" value={formObat.kode_obat} onChange={handleFormObatChange}
              placeholder="Kode obat (KFA/formularium, opsional)" className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <select
              name="bentuk_sediaan" value={formObat.bentuk_sediaan} onChange={handleFormObatChange}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Bentuk sediaan</option>
              {BENTUK_SEDIAAN.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <input
              type="number" step="any" name="kekuatan" value={formObat.kekuatan} onChange={handleFormObatChange}
              placeholder="Kekuatan (mis. 500)" className="border rounded-lg px-3 py-2 text-sm"
            />
            <select
              name="satuan_kekuatan" value={formObat.satuan_kekuatan} onChange={handleFormObatChange}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Satuan kekuatan</option>
              {SATUAN_KEKUATAN.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              type="text" name="satuan_kemasan" value={formObat.satuan_kemasan} onChange={handleFormObatChange}
              placeholder="Kemasan (strip/botol/dus)" className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <input
              type="text" name="satuan" value={formObat.satuan} onChange={handleFormObatChange}
              placeholder="Satuan resep (tablet/ml/dst)" className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="number" name="stok" value={formObat.stok} onChange={handleFormObatChange}
              placeholder="Stok awal" className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="number" name="stok_minimum" value={formObat.stok_minimum} onChange={handleFormObatChange}
              placeholder="Stok minimum" className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="number" name="harga_satuan" value={formObat.harga_satuan} onChange={handleFormObatChange}
              placeholder="Harga satuan" className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="text" name="lokasi_rak" value={formObat.lokasi_rak} onChange={handleFormObatChange}
              placeholder="Lokasi rak (mis. Rak A2 / Lemari Dingin)" className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text" name="keterangan" value={formObat.keterangan} onChange={handleFormObatChange}
              placeholder="Keterangan (opsional)" className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit" disabled={loadingObat}
            className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loadingObat ? 'Menyimpan...' : 'Simpan Obat'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {kelompokKategori.map(([namaKategori, daftarObat]) => {
          const terbuka = kategoriDibuka(namaKategori)
          const jumlahMenipis = daftarObat.filter((o) => o.stok <= o.stok_minimum).length
          return (
            <div key={namaKategori} className="border rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => toggleKategori(namaKategori)}
                className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs transition-transform ${terbuka ? 'rotate-90' : ''}`}>▶</span>
                  <span className="font-semibold text-purple-900">{namaKategori}</span>
                  <span className="text-xs text-gray-500">({daftarObat.length} obat)</span>
                </div>
                {jumlahMenipis > 0 && (
                  <span className="text-xs text-red-600 font-semibold">⚠️ {jumlahMenipis} menipis</span>
                )}
              </button>

              {terbuka && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-4 pl-4">Nama Obat</th>
                        <th className="py-2 pr-4">Sediaan</th>
                        <th className="py-2 pr-4">Kode</th>
                        <th className="py-2 pr-4">Rak</th>
                        <th className="py-2 pr-4">Satuan</th>
                        <th className="py-2 pr-4">Stok</th>
                        <th className="py-2 pr-4">Min</th>
                        <th className="py-2 pr-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {daftarObat.map((o) => (
                        <tr key={o.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 pl-4">
                            <div className="font-medium text-gray-800">{o.nama_obat}</div>
                            {(o.nama_generik || o.nama_dagang) && (
                              <div className="text-xs text-gray-400">
                                {[o.nama_generik, o.nama_dagang].filter(Boolean).join(' / ')}
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-gray-500">{deskripsiSediaan(o)}</td>
                          <td className="py-2 pr-4 text-gray-500">{o.kode_obat || '-'}</td>
                          <td className="py-2 pr-4 text-gray-500">{o.lokasi_rak || '-'}</td>
                          <td className="py-2 pr-4 text-gray-500">{o.satuan}</td>
                          <td className="py-2 pr-4">
                            <span className={o.stok <= o.stok_minimum ? 'text-red-600 font-semibold' : 'text-gray-800'}>
                              {o.stok}
                            </span>
                            {o.stok <= o.stok_minimum && (
                              <span className="ml-2 text-xs text-red-500">⚠️ Menipis</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-gray-500">{o.stok_minimum}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            <button
                              onClick={() => bukaMutasi(o)}
                              className="text-xs text-purple-600 hover:underline"
                            >
                              Ubah stok
                            </button>
                            <span className="text-gray-300 mx-1.5">|</span>
                            <button
                              onClick={() => bukaHapus(o)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
        {kelompokKategori.length === 0 && (
          <div className="py-6 text-center text-gray-400 border rounded-xl">
            {loadingList ? 'Memuat...' : 'Belum ada data obat.'}
          </div>
        )}
      </div>

      {/* Modal Mutasi Stok — menggantikan prompt() lama. Semua perubahan lewat
          RPC catat_mutasi_stok supaya tercatat di mutasi_stok (jejak audit). */}
      {obatMutasi && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
          onClick={tutupMutasi}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-800">Ubah Stok</h3>
              <button onClick={tutupMutasi} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{obatMutasi.nama_obat}</p>

            <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600 mb-4">
              Stok saat ini: <span className="font-semibold text-gray-800">{obatMutasi.stok}</span> {obatMutasi.satuan}
            </div>

            <form onSubmit={simpanMutasi} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Jenis mutasi</label>
                <select
                  value={formMutasi.jenis}
                  onChange={(e) => setFormMutasi((f) => ({ ...f, jenis: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {JENIS_MUTASI.map((j) => (
                    <option key={j.value} value={j.value}>{j.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {isOpnameKoreksi ? 'Hasil hitung fisik (stok akhir)' : 'Jumlah'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={formMutasi.jumlah}
                  onChange={(e) => setFormMutasi((f) => ({ ...f, jumlah: e.target.value }))}
                  placeholder={isOpnameKoreksi ? 'Angka stok setelah dihitung fisik' : 'Jumlah'}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Alasan {jenisMutasiAktif?.butuhAlasan ? '(wajib)' : '(opsional)'}
                </label>
                <input
                  type="text"
                  value={formMutasi.alasan}
                  onChange={(e) => setFormMutasi((f) => ({ ...f, alasan: e.target.value }))}
                  placeholder="Mis. hasil stok opname bulan ini, rusak kena air, dst."
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loadingMutasi}
                className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {loadingMutasi ? 'Menyimpan...' : 'Simpan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Stok — soft delete (is_aktif = false), obat tidak muncul lagi
          di daftar Stok tapi riwayat mutasi_stok tetap utuh untuk audit. */}
      {obatHapus && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
          onClick={tutupHapus}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-800">Hapus dari Stok?</h3>
              <button onClick={tutupHapus} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{obatHapus.nama_obat}</span> akan dihapus dari daftar Stok.
              Riwayat mutasi stok obat ini tetap tersimpan untuk audit, dan bisa ditambahkan kembali kapan saja
              lewat form Tambah.
            </p>

            {obatHapus.stok > 0 && (
              <div className="bg-orange-50 border border-orange-200 text-orange-700 text-sm rounded-lg px-3 py-2 mb-4">
                ⚠️ Stok saat ini masih <span className="font-semibold">{obatHapus.stok} {obatHapus.satuan}</span>.
                Pastikan ini memang sudah tidak dipakai lagi sebelum dihapus.
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={tutupHapus}
                className="flex-1 py-2 rounded-lg border text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={hapusObat}
                disabled={loadingHapus}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {loadingHapus ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}