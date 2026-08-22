import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// ─────────────────────────────────────────────────────────────
// Dashboard Petugas Laboratorium
// Menerima permintaan pemeriksaan lab dari dokter, input hasil
// per parameter, lalu mengembalikan pasien ke antrian dokter.
// ─────────────────────────────────────────────────────────────

export default function DashboardLab() {
  const [profile, setProfile] = useState(null)

  const [permintaanMenunggu, setPermintaanMenunggu] = useState([])
  const [dibuka, setDibuka] = useState(null) // permintaan_lab yang sedang diisi hasilnya
  const [parameterList, setParameterList] = useState([
    { nama_parameter: '', nilai_hasil: '', satuan: '', nilai_rujukan: '', keterangan: '' },
  ])
  const [loadingId, setLoadingId] = useState(null)

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
    fetchPermintaanMenunggu()
  }

  async function fetchPermintaanMenunggu() {
    const { data, error } = await supabase
      .from('permintaan_lab')
      .select(`
        *,
        kunjungan:kunjungan_id(
          id,
          nomor_antrian,
          pasien:pasien_id(nama_lengkap, no_rekam_medis, tanggal_lahir, jenis_kelamin)
        )
      `)
      .in('status', ['menunggu', 'diproses'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      return
    }
    setPermintaanMenunggu(data || [])
  }

  function bukaForm(permintaan) {
    setDibuka(permintaan)
    setParameterList([{ nama_parameter: '', nilai_hasil: '', satuan: '', nilai_rujukan: '', keterangan: '' }])
    setError('')
    setSukses('')
  }

  function tutupForm() {
    setDibuka(null)
    setParameterList([{ nama_parameter: '', nilai_hasil: '', satuan: '', nilai_rujukan: '', keterangan: '' }])
  }

  function tambahParameter() {
    setParameterList((prev) => [...prev, { nama_parameter: '', nilai_hasil: '', satuan: '', nilai_rujukan: '', keterangan: '' }])
  }

  function hapusParameter(index) {
    setParameterList((prev) => prev.filter((_, i) => i !== index))
  }

  function handleParameterChange(index, field, value) {
    setParameterList((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  async function tandaiDiproses(permintaan) {
    if (permintaan.status !== 'menunggu') return
    const { error: err } = await supabase
      .from('permintaan_lab')
      .update({ status: 'diproses' })
      .eq('id', permintaan.id)
    if (err) {
      console.error(err)
      return
    }
    fetchPermintaanMenunggu()
  }

  async function simpanHasil(e) {
    e.preventDefault()
    setError('')
    setSukses('')

    const parameterValid = parameterList.filter((p) => p.nama_parameter.trim() && p.nilai_hasil.trim())
    if (parameterValid.length === 0) {
      setError('Minimal satu parameter hasil (nama & nilai) wajib diisi.')
      return
    }

    setLoadingId(dibuka.id)
    try {
      // 1. Simpan baris hasil per parameter
      const hasilRows = parameterValid.map((p) => ({
        permintaan_lab_id: dibuka.id,
        petugas_lab_id: profile.id,
        nama_parameter: p.nama_parameter.trim(),
        nilai_hasil: p.nilai_hasil.trim(),
        satuan: p.satuan.trim() || null,
        nilai_rujukan: p.nilai_rujukan.trim() || null,
        keterangan: p.keterangan.trim() || null,
      }))

      const { error: hasilErr } = await supabase.from('hasil_lab').insert(hasilRows)
      if (hasilErr) throw new Error(hasilErr.message)

      // 2. Tandai permintaan ini selesai
      const { error: permintaanErr } = await supabase
        .from('permintaan_lab')
        .update({ status: 'selesai' })
        .eq('id', dibuka.id)
      if (permintaanErr) throw new Error(permintaanErr.message)

      // 3. Cek apakah semua permintaan lab untuk kunjungan ini sudah selesai.
      //    Kalau semua selesai, kembalikan pasien ke antrian dokter dengan status hasil_lab_selesai.
      const { data: sisaPermintaan, error: sisaErr } = await supabase
        .from('permintaan_lab')
        .select('id, status')
        .eq('kunjungan_id', dibuka.kunjungan_id)

      if (sisaErr) throw new Error(sisaErr.message)

      const semuaSelesai = (sisaPermintaan || []).every((p) => p.status === 'selesai')

      if (semuaSelesai) {
        const { error: kunjunganErr } = await supabase
          .from('kunjungan')
          .update({ status: 'hasil_lab_selesai', status_panggil: 'menunggu', waktu_panggil: null })
          .eq('id', dibuka.kunjungan_id)
        if (kunjunganErr) throw new Error(kunjunganErr.message)

        setSukses(`Hasil disimpan. Semua pemeriksaan selesai, pasien ${dibuka.kunjungan?.pasien?.nama_lengkap || ''} dikembalikan ke dokter.`)
      } else {
        setSukses(`Hasil untuk "${dibuka.jenis_pemeriksaan}" disimpan. Masih ada pemeriksaan lain yang menunggu untuk pasien ini.`)
      }

      tutupForm()
      fetchPermintaanMenunggu()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingId(null)
    }
  }

  function hitungUmur(tanggalLahir) {
    if (!tanggalLahir) return ''
    const lahir = new Date(tanggalLahir)
    const sekarang = new Date()
    let tahun = sekarang.getFullYear() - lahir.getFullYear()
    const bulanBeda = sekarang.getMonth() - lahir.getMonth()
    if (bulanBeda < 0 || (bulanBeda === 0 && sekarang.getDate() < lahir.getDate())) tahun--
    return `${tahun} Thn`
  }

  // ─── TAMPILAN ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard Laboratorium</h1>
          <p className="text-gray-500 text-sm">Permintaan Pemeriksaan &amp; Input Hasil Lab</p>
        </div>

        {sukses && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            ✅ {sukses}
          </div>
        )}
        {error && !dibuka && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

          {/* Daftar permintaan menunggu */}
          <div className="bg-white rounded-2xl shadow-sm p-5 h-fit">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">
                Permintaan Menunggu {permintaanMenunggu.length > 0 && `(${permintaanMenunggu.length})`}
              </h2>
              <button onClick={fetchPermintaanMenunggu} className="text-xs text-teal-600 hover:underline">
                🔄 Refresh
              </button>
            </div>

            {permintaanMenunggu.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Tidak ada permintaan menunggu.</p>
            ) : (
              <div className="space-y-2">
                {permintaanMenunggu.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      bukaForm(p)
                      tandaiDiproses(p)
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      dibuka?.id === p.id
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">
                          {p.kunjungan?.pasien?.nama_lengkap || 'Pasien tidak diketahui'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {p.kunjungan?.pasien?.no_rekam_medis} • {hitungUmur(p.kunjungan?.pasien?.tanggal_lahir)}
                        </p>
                        <p className="text-xs font-semibold text-teal-700 mt-1">{p.jenis_pemeriksaan}</p>
                        {p.catatan_dokter && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">Catatan: {p.catatan_dokter}</p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          p.status === 'diproses' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {p.status === 'diproses' ? 'Diproses' : 'Menunggu'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Form input hasil */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            {!dibuka ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
                <span className="text-4xl mb-3">🧪</span>
                <p className="text-sm">Pilih permintaan dari daftar untuk input hasil</p>
              </div>
            ) : (
              <>
                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <p className="font-semibold text-gray-800">{dibuka.kunjungan?.pasien?.nama_lengkap}</p>
                  <p className="text-xs text-gray-500">
                    {dibuka.kunjungan?.pasien?.no_rekam_medis} • {hitungUmur(dibuka.kunjungan?.pasien?.tanggal_lahir)} •{' '}
                    {dibuka.kunjungan?.pasien?.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                  </p>
                  <p className="text-sm font-semibold text-teal-700 mt-2">🧪 {dibuka.jenis_pemeriksaan}</p>
                  {dibuka.catatan_dokter && (
                    <p className="text-xs text-gray-500 mt-1">Catatan dokter: {dibuka.catatan_dokter}</p>
                  )}
                </div>

                {error && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={simpanHasil} className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-gray-800">
                      Hasil Pemeriksaan <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={tambahParameter}
                      className="text-xs text-teal-600 hover:underline"
                    >
                      + Tambah parameter
                    </button>
                  </div>

                  <div className="space-y-3">
                    {parameterList.map((p, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-3">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <input
                            type="text"
                            value={p.nama_parameter}
                            onChange={(e) => handleParameterChange(i, 'nama_parameter', e.target.value)}
                            placeholder="Parameter (mis. Hemoglobin)"
                            className="w-full border rounded-lg px-2 py-1.5 text-sm"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={p.nilai_hasil}
                              onChange={(e) => handleParameterChange(i, 'nilai_hasil', e.target.value)}
                              placeholder="Nilai hasil"
                              className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                            />
                            <input
                              type="text"
                              value={p.satuan}
                              onChange={(e) => handleParameterChange(i, 'satuan', e.target.value)}
                              placeholder="Satuan"
                              className="w-20 border rounded-lg px-2 py-1.5 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={p.nilai_rujukan}
                            onChange={(e) => handleParameterChange(i, 'nilai_rujukan', e.target.value)}
                            placeholder="Nilai rujukan normal (mis. 12-16 g/dL)"
                            className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                          />
                          {parameterList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => hapusParameter(i)}
                              className="text-xs text-red-500 px-2"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={p.keterangan}
                          onChange={(e) => handleParameterChange(i, 'keterangan', e.target.value)}
                          placeholder="Keterangan (opsional, mis. Tinggi/Normal/Rendah)"
                          className="w-full border rounded-lg px-2 py-1.5 text-sm mt-2"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={tutupForm}
                      className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={loadingId === dibuka.id}
                      className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {loadingId === dibuka.id ? 'Menyimpan...' : 'Simpan Hasil →'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
