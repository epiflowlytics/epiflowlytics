import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabaseClient'

export default function DashboardPerawat() {
  const [profile, setProfile] = useState(null)
  const [antrian, setAntrian] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState(false)
  const [loadingPanggil, setLoadingPanggil] = useState(false)

  const [form, setForm] = useState({
    tekanan_darah: '',
    suhu: '',
    berat_badan: '',
    tinggi_badan: '',
    keluhan_utama: '',
    catatan: '',
  })

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(data)
    fetchAntrian(data.poli_id)
  }

  async function fetchAntrian(poliId) {
    const { data, error } = await supabase
      .from('kunjungan')
      .select(`
        *,
        pasien:pasien_id(
          nama_lengkap,
          tanggal_lahir,
          tempat_lahir,
          jenis_kelamin,
          no_rekam_medis,
          kategori_pasien,
          no_bpjs,
          no_nik,
          no_kk,
          urutan_kk,
          status_keluarga,
          status_keluarga_lainnya,
          pekerjaan,
          alamat
        )
      `)
      .eq('poli_id', poliId)
      .in('status', ['menunggu', 'skrining'])
      .eq('tanggal_periksa', new Date().toISOString().split('T')[0])
      .order('nomor_antrian', { ascending: true })

    if (error) console.error(error)

    // Urutkan: pasien dengan status_prioritas tampil lebih dulu,
    // di antara sesama prioritas dan sesama non-prioritas tetap urut nomor antrian.
    const urutan = (data || []).slice().sort((a, b) => {
      const prioA = a.status_prioritas ? 1 : 0
      const prioB = b.status_prioritas ? 1 : 0
      if (prioA !== prioB) return prioB - prioA
      return (a.nomor_antrian || 0) - (b.nomor_antrian || 0)
    })

    setAntrian(urutan)
  }

  function labelStatusKeluarga(value, teksLainnya) {
    const opsi = {
      kepala_keluarga: 'Kepala Keluarga',
      ayah: 'Ayah',
      ibu: 'Ibu',
      anak: 'Anak',
      cucu: 'Cucu',
      menantu: 'Menantu',
      famili_lain: 'Famili Lain',
      lainnya: teksLainnya || 'Lainnya',
    }
    return opsi[value] || ''
  }

  function labelPrioritas(value) {
    const opsi = {
      lansia: { label: 'Lansia', icon: '🧓' },
      ibu_hamil: { label: 'Ibu Hamil', icon: '🤰' },
      disabilitas: { label: 'Disabilitas', icon: '♿' },
      gawat_darurat: { label: 'Gawat Darurat', icon: '🚨' },
    }
    return opsi[value] || null
  }

  const sedangDipanggil = antrian.find((k) => k.status_panggil === 'dipanggil') || null
  const jumlahMenunggu = antrian.filter((k) => k.status_panggil !== 'dipanggil').length

  async function panggilBerikutnya() {
    setLoadingPanggil(true)
    setError('')
    try {
      if (sedangDipanggil) {
        await supabase
          .from('kunjungan')
          .update({ status_panggil: 'selesai' })
          .eq('id', sedangDipanggil.id)
      }

      const berikutnya = antrian
        .filter((k) => k.id !== sedangDipanggil?.id && k.status_panggil !== 'dipanggil')
        .sort((a, b) => {
          const prioA = a.status_prioritas ? 1 : 0
          const prioB = b.status_prioritas ? 1 : 0
          if (prioA !== prioB) return prioB - prioA
          return (a.nomor_antrian || 0) - (b.nomor_antrian || 0)
        })[0]

      if (!berikutnya) {
        setError('Tidak ada antrian menunggu di poli ini.')
        await fetchAntrian(profile.poli_id)
        return
      }

      const { error: updateErr } = await supabase
        .from('kunjungan')
        .update({ status_panggil: 'dipanggil', waktu_panggil: new Date().toISOString() })
        .eq('id', berikutnya.id)

      if (updateErr) throw new Error(updateErr.message)

      await fetchAntrian(profile.poli_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPanggil(false)
    }
  }

  async function panggilUlang() {
    if (!sedangDipanggil) return
    setLoadingPanggil(true)
    try {
      await supabase
        .from('kunjungan')
        .update({ waktu_panggil: new Date().toISOString() })
        .eq('id', sedangDipanggil.id)
      await fetchAntrian(profile.poli_id)
    } finally {
      setLoadingPanggil(false)
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

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function pilihPasien(kunjungan) {
    setSelected(kunjungan)
    setForm({
      tekanan_darah: '',
      suhu: '',
      berat_badan: '',
      tinggi_badan: '',
      keluhan_utama: '',
      catatan: '',
    })
    setError('')
    setSukses(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!form.keluhan_utama.trim()) throw new Error('Keluhan utama wajib diisi.')

      // Simpan skrining
      const { error: skriningErr } = await supabase
        .from('skrining')
        .insert({
          kunjungan_id: selected.id,
          perawat_id: profile.id,
          tekanan_darah: form.tekanan_darah.trim() || null,
          suhu: form.suhu ? parseFloat(form.suhu) : null,
          berat_badan: form.berat_badan ? parseFloat(form.berat_badan) : null,
          tinggi_badan: form.tinggi_badan ? parseFloat(form.tinggi_badan) : null,
          keluhan_utama: form.keluhan_utama.trim(),
          catatan: form.catatan.trim() || null,
        })

      if (skriningErr) throw new Error(skriningErr.message)

      // Update status kunjungan + reset status_panggil supaya dokter bisa panggil ulang
      const { error: updateErr } = await supabase
        .from('kunjungan')
        .update({ status: 'menunggu_dokter', status_panggil: 'menunggu', waktu_panggil: null })
        .eq('id', selected.id)

      if (updateErr) throw new Error(updateErr.message)

      setSukses(true)
      setSelected(null)
      fetchAntrian(profile.poli_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── TAMPILAN ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard Perawat</h1>
          <p className="text-gray-500 text-sm">Poli Umum — Skrining Pasien</p>
        </div>

        {sukses && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            ✅ Skrining berhasil disimpan, pasien diteruskan ke dokter.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Antrian */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            {/* Panel Panggil Antrian */}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4 text-center">
              <p className="text-xs text-teal-700 mb-1">Sedang Dipanggil</p>
              <p className="text-4xl font-bold text-teal-700 tabular-nums">
                {sedangDipanggil ? sedangDipanggil.nomor_antrian : '—'}
              </p>
              {sedangDipanggil?.pasien?.nama_lengkap && (
                <p className="text-xs text-teal-600 mt-1">{sedangDipanggil.pasien.nama_lengkap}</p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={panggilUlang}
                  disabled={!sedangDipanggil || loadingPanggil}
                  className="flex-1 py-1.5 rounded-lg border border-teal-300 text-teal-700 text-xs hover:bg-teal-100 disabled:opacity-40"
                >
                  🔁 Ulang
                </button>
                <button
                  onClick={panggilBerikutnya}
                  disabled={loadingPanggil || jumlahMenunggu === 0}
                  className="flex-1 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {loadingPanggil ? 'Memproses...' : '📢 Panggil Berikutnya'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Antrian Hari Ini</h2>
              <button
                onClick={() => fetchAntrian(profile?.poli_id)}
                className="text-xs text-teal-600 hover:underline"
              >
                🔄 Refresh
              </button>
            </div>

            {antrian.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                Belum ada antrian hari ini.
              </p>
            ) : (
              <div className="space-y-2">
                {antrian.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => pilihPasien(k)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      selected?.id === k.id
                        ? 'border-teal-500 bg-teal-50'
                        : k.status_panggil === 'dipanggil'
                        ? 'border-teal-300 bg-teal-50/50'
                        : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">
                        {k.nomor_antrian ?? '-'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate flex items-center gap-1">
                          {labelPrioritas(k.status_prioritas) && (
                            <span title={labelPrioritas(k.status_prioritas).label}>
                              {labelPrioritas(k.status_prioritas).icon}
                            </span>
                          )}
                          {k.pasien.nama_lengkap}
                        </p>
                        <p className="text-xs text-gray-500">
                          {k.pasien.no_rekam_medis} • {hitungUmur(k.pasien.tanggal_lahir)} • {k.pasien.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                        </p>
                        {k.pasien.status_keluarga && (
                          <p className="text-[11px] text-gray-400">
                            {labelStatusKeluarga(k.pasien.status_keluarga, k.pasien.status_keluarga_lainnya)}
                            {k.pasien.no_kk ? ` • KK: ${k.pasien.no_kk}` : ''}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        k.kategori_pasien === 'bpjs'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-teal-100 text-teal-700'
                      }`}>
                        {k.kategori_pasien.toUpperCase()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Form Skrining */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-gray-400">
                <span className="text-4xl mb-3">👈</span>
                <p className="text-sm">Pilih pasien dari antrian</p>
              </div>
            ) : (
              <>
                {/* Info Pasien */}
                <div className="bg-gray-50 rounded-xl p-4 mb-5">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800">{selected.pasien.nama_lengkap}</p>
                    {labelPrioritas(selected.status_prioritas) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        {labelPrioritas(selected.status_prioritas).icon} {labelPrioritas(selected.status_prioritas).label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {selected.pasien.no_rekam_medis} • {hitungUmur(selected.pasien.tanggal_lahir)} • {selected.pasien.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                  </p>
                  {selected.pasien.tempat_lahir && (
                    <p className="text-xs text-gray-500">Lahir di: {selected.pasien.tempat_lahir}</p>
                  )}
                  <p className="text-xs text-gray-500">{selected.pasien.alamat}</p>
                  {selected.pasien.pekerjaan && (
                    <p className="text-xs text-gray-500">Pekerjaan: {selected.pasien.pekerjaan}</p>
                  )}
                  {selected.pasien.no_nik && (
                    <p className="text-xs text-gray-500">NIK: {selected.pasien.no_nik}</p>
                  )}
                  {selected.pasien.no_kk && (
                    <p className="text-xs text-gray-500">
                      KK: {selected.pasien.no_kk}
                      {selected.pasien.status_keluarga && ` • ${labelStatusKeluarga(selected.pasien.status_keluarga, selected.pasien.status_keluarga_lainnya)}`}
                      {selected.pasien.urutan_kk ? ` (anggota ke-${selected.pasien.urutan_kk})` : ''}
                    </p>
                  )}
                  {selected.wilayah && (
                    <p className="text-xs text-gray-500">
                      Wilayah: {selected.wilayah === 'dalam' ? 'Dalam wilayah' : 'Luar wilayah'}
                    </p>
                  )}
                  {selected.kategori_pasien === 'bpjs' && (
                    <p className="text-xs text-blue-600 mt-1">BPJS: {selected.pasien.no_bpjs}</p>
                  )}
                </div>

                {error && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">

                  {/* Tekanan Darah */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tekanan Darah <span className="text-gray-400 font-normal">(mmHg)</span>
                    </label>
                    <input
                      type="text"
                      name="tekanan_darah"
                      value={form.tekanan_darah}
                      onChange={handleChange}
                      placeholder="120/80"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Suhu, BB, TB */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Suhu (°C)
                      </label>
                      <input
                        type="number"
                        name="suhu"
                        value={form.suhu}
                        onChange={handleChange}
                        placeholder="36.5"
                        step="0.1"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        BB (kg)
                      </label>
                      <input
                        type="number"
                        name="berat_badan"
                        value={form.berat_badan}
                        onChange={handleChange}
                        placeholder="60"
                        step="0.1"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        TB (cm)
                      </label>
                      <input
                        type="number"
                        name="tinggi_badan"
                        value={form.tinggi_badan}
                        onChange={handleChange}
                        placeholder="165"
                        step="0.1"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* Keluhan Utama */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Keluhan Utama <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="keluhan_utama"
                      value={form.keluhan_utama}
                      onChange={handleChange}
                      rows={3}
                      placeholder="Tuliskan keluhan utama pasien..."
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Catatan */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Catatan Tambahan
                    </label>
                    <textarea
                      name="catatan"
                      value={form.catatan}
                      onChange={handleChange}
                      rows={2}
                      placeholder="Catatan lain jika ada..."
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Tombol */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {loading ? 'Menyimpan...' : 'Selesai Skrining →'}
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
