import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'

const TAB = {
  RESEP: 'resep',
  STOK: 'stok',
}

export default function DashboardApoteker() {
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState(TAB.RESEP)

  // --- Resep masuk ---
  const [resepMenunggu, setResepMenunggu] = useState([])
  const [obatList, setObatList] = useState([])
  const [prosesMap, setProsesMap] = useState({}) // { resepId: obat_id yang dipilih untuk dispensing }
  const [loadingResepId, setLoadingResepId] = useState(null)

  // --- Stok obat ---
  const [obatMasuk, setObatMasuk] = useState([])
  const [showFormObat, setShowFormObat] = useState(false)
  const [formObat, setFormObat] = useState({
    nama_obat: '',
    kategori: '',
    satuan: 'tablet',
    stok: '',
    stok_minimum: '10',
    harga_satuan: '',
    keterangan: '',
  })
  const [loadingObat, setLoadingObat] = useState(false)

  const [error, setError] = useState('')
  const [sukses, setSukses] = useState('')

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
    fetchResepMenunggu()
    fetchObatMasuk()
  }

  async function fetchResepMenunggu() {
    const { data, error } = await supabase
      .from('resep')
      .select(`
        *,
        kunjungan:kunjungan_id(
          id,
          pasien:pasien_id(nama_lengkap, no_rekam_medis)
        )
      `)
      .eq('status', 'menunggu')
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      return
    }
    setResepMenunggu(data || [])
  }

  async function fetchObatMasuk() {
    const { data, error } = await supabase
      .from('obat_masuk')
      .select('*')
      .eq('is_aktif', true)
      .order('nama_obat', { ascending: true })

    if (error) {
      console.error(error)
      return
    }
    setObatMasuk(data || [])
    setObatList(data || [])
  }

  function pilihObatUntukResep(resepId, obatId) {
    setProsesMap((prev) => ({ ...prev, [resepId]: obatId }))
  }

  async function prosesResep(resep) {
    setError('')
    setSukses('')
    const obatId = prosesMap[resep.id] || resep.obat_id

    if (!obatId) {
      setError('Pilih obat dari stok terlebih dahulu untuk resep ini.')
      return
    }

    const obat = obatList.find((o) => o.id === obatId)
    if (!obat) {
      setError('Obat tidak ditemukan di stok.')
      return
    }
    if (obat.stok <= 0) {
      setError(`Stok ${obat.nama_obat} kosong. Tidak bisa diproses.`)
      return
    }

    setLoadingResepId(resep.id)
    try {
      // 1. Catat obat keluar (trigger di DB otomatis kurangi stok saat status 'selesai')
      const { error: keluarErr } = await supabase.from('obat_keluar').insert({
        resep_id: resep.id,
        obat_id: obatId,
        apoteker_id: profile.id,
        jumlah: resep.jumlah ? parseFloat(resep.jumlah) : 1,
        status: 'selesai',
      })
      if (keluarErr) throw new Error(keluarErr.message)

      // 2. Update status resep
      const { error: resepErr } = await supabase
        .from('resep')
        .update({ status: 'selesai', obat_id: obatId })
        .eq('id', resep.id)
      if (resepErr) throw new Error(resepErr.message)

      setSukses(`Resep untuk ${resep.kunjungan?.pasien?.nama_lengkap || 'pasien'} berhasil diproses.`)
      fetchResepMenunggu()
      fetchObatMasuk()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingResepId(null)
    }
  }

  async function tandaiObatKosong(resep) {
    setError('')
    setLoadingResepId(resep.id)
    try {
      const { error: err } = await supabase
        .from('resep')
        .update({ status: 'obat_kosong' })
        .eq('id', resep.id)
      if (err) throw new Error(err.message)
      setSukses('Resep ditandai obat kosong.')
      fetchResepMenunggu()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingResepId(null)
    }
  }

  // --- Kelola stok obat ---
  function handleFormObatChange(e) {
    const { name, value } = e.target
    setFormObat((prev) => ({ ...prev, [name]: value }))
  }

  async function tambahObat(e) {
    e.preventDefault()
    setError('')
    setLoadingObat(true)
    try {
      if (!formObat.nama_obat.trim()) throw new Error('Nama obat wajib diisi.')

      const { error: err } = await supabase.from('obat_masuk').insert({
        instansi_id: profile.instansi_id || null,
        nama_obat: formObat.nama_obat.trim(),
        kategori: formObat.kategori.trim() || null,
        satuan: formObat.satuan.trim() || 'tablet',
        stok: formObat.stok ? parseInt(formObat.stok, 10) : 0,
        stok_minimum: formObat.stok_minimum ? parseInt(formObat.stok_minimum, 10) : 10,
        harga_satuan: formObat.harga_satuan ? parseFloat(formObat.harga_satuan) : null,
        keterangan: formObat.keterangan.trim() || null,
      })
      if (err) throw new Error(err.message)

      setSukses('Obat berhasil ditambahkan ke stok.')
      setFormObat({
        nama_obat: '', kategori: '', satuan: 'tablet', stok: '', stok_minimum: '10', harga_satuan: '', keterangan: '',
      })
      setShowFormObat(false)
      fetchObatMasuk()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingObat(false)
    }
  }

  async function updateStokCepat(obatId, stokBaru) {
    const { error: err } = await supabase
      .from('obat_masuk')
      .update({ stok: stokBaru, updated_at: new Date().toISOString() })
      .eq('id', obatId)
    if (err) {
      setError(err.message)
      return
    }
    fetchObatMasuk()
  }

  // ─── TAMPILAN ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard Apoteker</h1>
          <p className="text-gray-500 text-sm">Resep Masuk &amp; Kelola Stok Obat</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab(TAB.RESEP)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === TAB.RESEP ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            📋 Resep Masuk {resepMenunggu.length > 0 && `(${resepMenunggu.length})`}
          </button>
          <button
            onClick={() => setTab(TAB.STOK)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === TAB.STOK ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            💊 Stok Obat
          </button>
        </div>

        {sukses && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            ✅ {sukses}
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* TAB: RESEP MASUK */}
        {tab === TAB.RESEP && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Resep Menunggu Diproses</h2>
              <button onClick={fetchResepMenunggu} className="text-xs text-purple-600 hover:underline">
                🔄 Refresh
              </button>
            </div>

            {resepMenunggu.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Tidak ada resep menunggu.</p>
            ) : (
              <div className="space-y-3">
                {resepMenunggu.map((r) => (
                  <div key={r.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">
                          {r.kunjungan?.pasien?.nama_lengkap || 'Pasien tidak diketahui'}
                        </p>
                        <p className="text-xs text-gray-500">{r.kunjungan?.pasien?.no_rekam_medis}</p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 text-sm mb-3">
                      <p><span className="text-gray-400">Obat:</span> {r.nama_obat}</p>
                      <p><span className="text-gray-400">Dosis:</span> {r.dosis}</p>
                      <p><span className="text-gray-400">Aturan pakai:</span> {r.aturan_pakai}</p>
                      <p>
                        <span className="text-gray-400">Jumlah:</span>{' '}
                        {r.jumlah ? `${r.jumlah} ${r.satuan_jumlah || ''}` : '-'}
                      </p>
                      <p>
                        <span className="text-gray-400">Bentuk sediaan:</span>{' '}
                        {r.bentuk_sediaan === 'puyer' ? (
                          <span className="font-semibold text-orange-600">
                            ⚠️ Diracik / Puyer ({r.jumlah_puyer || '-'} bungkus)
                          </span>
                        ) : (
                          'Utuh (tanpa racik)'
                        )}
                      </p>
                      {r.catatan && <p><span className="text-gray-400">Catatan:</span> {r.catatan}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={prosesMap[r.id] || r.obat_id || ''}
                        onChange={(e) => pilihObatUntukResep(r.id, e.target.value)}
                        className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="">-- Pilih obat dari stok --</option>
                        {obatList.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nama_obat} (stok: {o.stok} {o.satuan})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => prosesResep(r)}
                        disabled={loadingResepId === r.id}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {loadingResepId === r.id ? '...' : 'Proses'}
                      </button>
                      <button
                        onClick={() => tandaiObatKosong(r)}
                        disabled={loadingResepId === r.id}
                        className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold disabled:opacity-50"
                      >
                        Obat Kosong
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: STOK OBAT */}
        {tab === TAB.STOK && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Stok Obat</h2>
              <button
                onClick={() => setShowFormObat((v) => !v)}
                className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700"
              >
                {showFormObat ? 'Tutup' : '+ Tambah Obat'}
              </button>
            </div>

            {showFormObat && (
              <form onSubmit={tambahObat} className="border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text" name="nama_obat" value={formObat.nama_obat} onChange={handleFormObatChange}
                    placeholder="Nama obat *" className="border rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text" name="kategori" value={formObat.kategori} onChange={handleFormObatChange}
                    placeholder="Kategori (opsional)" className="border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <input
                    type="text" name="satuan" value={formObat.satuan} onChange={handleFormObatChange}
                    placeholder="Satuan" className="border rounded-lg px-3 py-2 text-sm"
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
                <input
                  type="text" name="keterangan" value={formObat.keterangan} onChange={handleFormObatChange}
                  placeholder="Keterangan (opsional)" className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="submit" disabled={loadingObat}
                  className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {loadingObat ? 'Menyimpan...' : 'Simpan Obat'}
                </button>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Nama Obat</th>
                    <th className="py-2 pr-4">Kategori</th>
                    <th className="py-2 pr-4">Satuan</th>
                    <th className="py-2 pr-4">Stok</th>
                    <th className="py-2 pr-4">Min</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {obatMasuk.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium text-gray-800">{o.nama_obat}</td>
                      <td className="py-2 pr-4 text-gray-500">{o.kategori || '-'}</td>
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
                      <td className="py-2 pr-4">
                        <button
                          onClick={() => {
                            const nilai = prompt(`Update stok ${o.nama_obat}:`, o.stok)
                            if (nilai !== null && !isNaN(parseInt(nilai, 10))) {
                              updateStokCepat(o.id, parseInt(nilai, 10))
                            }
                          }}
                          className="text-xs text-purple-600 hover:underline"
                        >
                          Update stok
                        </button>
                      </td>
                    </tr>
                  ))}
                  {obatMasuk.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-400">Belum ada data obat.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
