import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'

export default function DashboardEpid() {
  const [profile, setProfile] = useState(null)
  const [notifikasi, setNotifikasi] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState(false)

  const [selected, setSelected] = useState(null)
  const [catatanPetugas, setCatatanPetugas] = useState('')
  const [loadingTindak, setLoadingTindak] = useState(false)

  // ─── Filter ───────────────────────────────────────────────
  const [filterTanggalDari, setFilterTanggalDari] = useState('')
  const [filterTanggalSampai, setFilterTanggalSampai] = useState('')
  const [filterWilayah, setFilterWilayah] = useState('semua')
  const [filterStatus, setFilterStatus] = useState('semua')

  useEffect(() => {
    fetchProfile()
  }, [])

  useEffect(() => {
    if (profile) fetchNotifikasi(profile.instansi_id)
  }, [profile, filterTanggalDari, filterTanggalSampai, filterWilayah, filterStatus])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(data)
  }

  async function fetchNotifikasi(instansiId) {
    if (!instansiId) return
    setLoading(true)
    setError('')
    try {
      let query = supabase
        .from('notifikasi_surveilans')
        .select(`
          *,
          kunjungan:kunjungan_id(
            wilayah,
            tanggal_periksa,
            pasien:pasien_id(
              nama_lengkap,
              tanggal_lahir,
              jenis_kelamin,
              no_rekam_medis,
              alamat
            )
          ),
          dokter:dokter_id(nama_lengkap),
          ditinjau_oleh_profil:ditinjau_oleh(nama_lengkap)
        `)
        .eq('instansi_id', instansiId)
        .order('created_at', { ascending: false })

      if (filterStatus !== 'semua') {
        query = query.eq('status', filterStatus)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)

      // Filter tanggal & wilayah dilakukan di sisi klien karena kolomnya ada di tabel relasi (kunjungan)
      let hasil = data || []

      if (filterTanggalDari) {
        hasil = hasil.filter((n) => n.kunjungan?.tanggal_periksa >= filterTanggalDari)
      }
      if (filterTanggalSampai) {
        hasil = hasil.filter((n) => n.kunjungan?.tanggal_periksa <= filterTanggalSampai)
      }
      if (filterWilayah !== 'semua') {
        hasil = hasil.filter((n) => n.kunjungan?.wilayah === filterWilayah)
      }

      setNotifikasi(hasil)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function hitungUmur(tanggalLahir) {
    if (!tanggalLahir) return ''
    const lahir = new Date(tanggalLahir)
    const sekarang = new Date()
    let tahun = sekarang.getFullYear() - lahir.getFullYear()
    let bulan = sekarang.getMonth() - lahir.getMonth()
    let hari = sekarang.getDate() - lahir.getDate()
    if (hari < 0) { bulan--; hari += new Date(sekarang.getFullYear(), sekarang.getMonth(), 0).getDate() }
    if (bulan < 0) { tahun--; bulan += 12 }
    return `${tahun} Thn ${bulan} Bln ${hari} Hr`
  }

  function formatTanggal(tanggal) {
    if (!tanggal) return '-'
    return new Date(tanggal).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  function formatWaktu(waktu) {
    if (!waktu) return '-'
    return new Date(waktu).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  function labelStatus(status) {
    const opsi = {
      baru: { label: 'Baru', kelas: 'bg-amber-100 text-amber-700' },
      ditinjau: { label: 'Ditinjau', kelas: 'bg-blue-100 text-blue-700' },
      selesai: { label: 'Selesai Ditindaklanjuti', kelas: 'bg-green-100 text-green-700' },
    }
    return opsi[status] || { label: status || 'Baru', kelas: 'bg-gray-100 text-gray-600' }
  }

  function pilihNotifikasi(n) {
    setSelected(n)
    setCatatanPetugas(n.catatan_petugas || '')
    setError('')
    setSukses(false)
  }

  async function simpanTindakLanjut(statusBaru) {
    if (!selected) return
    setLoadingTindak(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: updateErr } = await supabase
        .from('notifikasi_surveilans')
        .update({
          status: statusBaru,
          catatan_petugas: catatanPetugas.trim() || null,
          ditinjau_oleh: user.id,
          ditinjau_pada: new Date().toISOString(),
        })
        .eq('id', selected.id)

      if (updateErr) throw new Error(updateErr.message)

      setSukses(true)
      setSelected(null)
      fetchNotifikasi(profile.instansi_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingTindak(false)
    }
  }

  // ─── Statistik ────────────────────────────────────────────
  const totalNotifikasi = notifikasi.length
  const totalBaru = notifikasi.filter((n) => (n.status || 'baru') === 'baru').length
  const totalDitinjau = notifikasi.filter((n) => n.status === 'ditinjau').length
  const totalSelesai = notifikasi.filter((n) => n.status === 'selesai').length

  const rekapPenyakit = notifikasi.reduce((acc, n) => {
    acc[n.nama_penyakit] = (acc[n.nama_penyakit] || 0) + 1
    return acc
  }, {})
  const rekapPenyakitArr = Object.entries(rekapPenyakit).sort((a, b) => b[1] - a[1])

  // ─── TAMPILAN ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard Surveilans (SKDR)</h1>
          <p className="text-gray-500 text-sm">Notifikasi Penyakit Berpotensi KLB</p>
        </div>

        {sukses && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            ✅ Tindak lanjut berhasil disimpan.
          </div>
        )}

        {/* Statistik */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs text-gray-500 mb-1">Total Notifikasi</p>
            <p className="text-2xl font-bold text-gray-800">{totalNotifikasi}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs text-amber-600 mb-1">Baru</p>
            <p className="text-2xl font-bold text-amber-600">{totalBaru}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs text-blue-600 mb-1">Ditinjau</p>
            <p className="text-2xl font-bold text-blue-600">{totalDitinjau}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs text-green-600 mb-1">Selesai</p>
            <p className="text-2xl font-bold text-green-600">{totalSelesai}</p>
          </div>
        </div>

        {/* Rekap per Penyakit */}
        {rekapPenyakitArr.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
            <h2 className="font-semibold text-gray-700 mb-3 text-sm">Rekap per Penyakit</h2>
            <div className="flex flex-wrap gap-2">
              {rekapPenyakitArr.map(([nama, jumlah]) => (
                <span
                  key={nama}
                  className="text-xs px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium"
                >
                  {nama} · {jumlah}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">Filter</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={filterTanggalDari}
                onChange={(e) => setFilterTanggalDari(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={filterTanggalSampai}
                onChange={(e) => setFilterTanggalSampai(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Wilayah</label>
              <select
                value={filterWilayah}
                onChange={(e) => setFilterWilayah(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="semua">Semua Wilayah</option>
                <option value="dalam">Dalam Wilayah</option>
                <option value="luar">Luar Wilayah</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="semua">Semua Status</option>
                <option value="baru">Baru</option>
                <option value="ditinjau">Ditinjau</option>
                <option value="selesai">Selesai Ditindaklanjuti</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Daftar Notifikasi */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Daftar Notifikasi</h2>
              <button
                onClick={() => fetchNotifikasi(profile?.instansi_id)}
                className="text-xs text-rose-600 hover:underline"
              >
                🔄 Refresh
              </button>
            </div>

            {loading ? (
              <p className="text-gray-400 text-sm text-center py-8">Memuat data...</p>
            ) : notifikasi.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                Belum ada notifikasi surveilans.
              </p>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {notifikasi.map((n) => {
                  const status = labelStatus(n.status)
                  return (
                    <button
                      key={n.id}
                      onClick={() => pilihNotifikasi(n)}
                      className={`w-full text-left p-3 rounded-xl border transition ${
                        selected?.id === n.id
                          ? 'border-rose-500 bg-rose-50'
                          : 'border-gray-200 hover:border-rose-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm truncate">
                            {n.kunjungan?.pasien?.nama_lengkap || 'Pasien tidak diketahui'}
                          </p>
                          <p className="text-xs text-rose-600 font-medium mt-0.5">
                            {n.nama_penyakit}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {n.kunjungan?.pasien?.no_rekam_medis} • {formatTanggal(n.kunjungan?.tanggal_periksa)}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Dokter: {n.dokter?.nama_lengkap || '-'}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${status.kelas}`}>
                          {status.label}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Detail & Tindak Lanjut */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-gray-400">
                <span className="text-4xl mb-3">👈</span>
                <p className="text-sm">Pilih notifikasi dari daftar</p>
              </div>
            ) : (
              <>
                {/* Info Pasien & Kasus */}
                <div className="bg-gray-50 rounded-xl p-4 mb-5">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800">
                      {selected.kunjungan?.pasien?.nama_lengkap || 'Pasien tidak diketahui'}
                    </p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium">
                      {selected.nama_penyakit}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {selected.kunjungan?.pasien?.no_rekam_medis} • {hitungUmur(selected.kunjungan?.pasien?.tanggal_lahir)} •{' '}
                    {selected.kunjungan?.pasien?.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                  </p>
                  {selected.kunjungan?.pasien?.alamat && (
                    <p className="text-xs text-gray-500">{selected.kunjungan.pasien.alamat}</p>
                  )}
                  {selected.kunjungan?.wilayah && (
                    <p className="text-xs text-gray-500">
                      Wilayah: {selected.kunjungan.wilayah === 'dalam' ? 'Dalam wilayah' : 'Luar wilayah'}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    Tanggal periksa: {formatTanggal(selected.kunjungan?.tanggal_periksa)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Dokter pemeriksa: {selected.dokter?.nama_lengkap || '-'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Dilaporkan: {formatWaktu(selected.created_at)}
                  </p>
                  {selected.ditinjau_oleh_profil?.nama_lengkap && (
                    <p className="text-xs text-gray-400">
                      Ditinjau oleh: {selected.ditinjau_oleh_profil.nama_lengkap} • {formatWaktu(selected.ditinjau_pada)}
                    </p>
                  )}
                </div>

                {error && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Catatan Tindak Lanjut
                    </label>
                    <textarea
                      value={catatanPetugas}
                      onChange={(e) => setCatatanPetugas(e.target.value)}
                      rows={4}
                      placeholder="Tuliskan hasil investigasi, tindakan yang diambil, atau catatan lain..."
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={loadingTindak}
                      onClick={() => simpanTindakLanjut('ditinjau')}
                      className="flex-1 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50"
                    >
                      Tandai Ditinjau
                    </button>
                    <button
                      type="button"
                      disabled={loadingTindak}
                      onClick={() => simpanTindakLanjut('selesai')}
                      className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {loadingTindak ? 'Menyimpan...' : 'Selesai Ditindaklanjuti'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}