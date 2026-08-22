import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'

/* ────────────────────────────────────────────────────────────────
   DASHBOARD PERAWAT IGD
   Beda dari DashboardPerawat.jsx (poli umum):
   - Pasien TIDAK didaftarkan loket dulu. Perawat IGD input pendaftaran
     sendiri langsung ke tabel `kunjungan` (mirip logika DashboardLoket.jsx),
     lalu langsung isi triase (disimpan di tabel `skrining`, kolom triase).
   - Tidak ada sistem antrian nomor urut yang ditampilkan/dipanggil.
     nomor_antrian tetap digenerate (konsisten dgn skema kunjungan),
     tapi tidak dipakai untuk memanggil pasien.
   - Setelah triase disimpan, status kunjungan -> 'menunggu_dokter'
     supaya otomatis muncul di DashboardDokterIGD.jsx (reuse status yang sama
     dengan alur poli umum).
   ──────────────────────────────────────────────────────────────── */

const FORM_PASIEN_AWAL = {
  // pencarian pasien lama
  pasien_id_existing: '',
  no_rekam_medis: '',
  nama_lengkap: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  pekerjaan: '',
  alamat: '',
  no_nik: '',
  no_bpjs: '',
  no_kk: '',
  nama_kepala_keluarga: '',
  kategori_pasien: 'umum',
  status_bpjs_aktif: null,
  wilayah: 'dalam',
}

const FORM_TRIASE_AWAL = {
  triase: '',
  tekanan_darah: '',
  suhu: '',
  berat_badan: '',
  tinggi_badan: '',
  keluhan_utama: '',
  catatan: '',
}

function generateNoRM() {
  // Fallback sederhana kalau perawat IGD input pasien benar-benar baru
  // tanpa lewat rak RM. Sesuaikan dengan generateNoRM() di pasienHelpers.js
  // milikmu bila format No. RM harus konsisten dengan loket.
  const now = new Date()
  const y = now.getFullYear().toString().slice(-2)
  const rand = Math.floor(100000 + Math.random() * 900000)
  return `IGD${y}${rand}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function DashboardPerawatIGD() {
  const [profile, setProfile] = useState(null)
  const [poliIgd, setPoliIgd] = useState(null)

  const [step, setStep] = useState('daftar') // 'daftar' -> 'triase'
  const [formPasien, setFormPasien] = useState(FORM_PASIEN_AWAL)
  const [formTriase, setFormTriase] = useState(FORM_TRIASE_AWAL)
  const [kunjunganAktif, setKunjunganAktif] = useState(null) // kunjungan yang baru saja didaftarkan, menunggu triase

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState(false)

  // Pencarian pasien lama (opsional, supaya tidak duplikat No. RM)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  // Daftar pasien IGD yang sedang aktif hari ini (belum ditangani dokter)
  const [daftarAktifIgd, setDaftarAktifIgd] = useState([])

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

    if (data?.instansi_id) {
      // Poli IGD ditentukan lewat nama_poli = 'IGD' pada instansi yang sama,
      // BUKAN dari profile.poli_id — supaya konsisten walau perawat IGD
      // ditugaskan lewat poli_id yang berbeda-beda penamaannya.
      const { data: poli, error: poliErr } = await supabase
        .from('polis')
        .select('id, nama_poli')
        .eq('instansi_id', data.instansi_id)
        .eq('nama_poli', 'IGD')
        .maybeSingle()

      if (poliErr) {
        console.error('Error fetch poli IGD:', poliErr.message)
      } else if (poli) {
        setPoliIgd(poli)
        fetchDaftarAktifIgd(poli.id)
      }
    }
  }

  async function fetchDaftarAktifIgd(poliId) {
    const { data, error } = await supabase
      .from('kunjungan')
      .select(`
        id, status, created_at,
        pasien:pasien_id(nama_lengkap, no_rekam_medis, tanggal_lahir, jenis_kelamin),
        skrining(triase)
      `)
      .eq('poli_id', poliId)
      .eq('tanggal_periksa', todayStr())
      .in('status', ['menunggu', 'menunggu_dokter'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetch daftar aktif IGD:', error.message)
      return
    }
    setDaftarAktifIgd(data || [])
  }

  async function cariPasien(term) {
    setSearchTerm(term)
    if (!term.trim() || !profile?.instansi_id) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const { data, error } = await supabase
      .from('pasien')
      .select('*')
      .eq('instansi_id', profile.instansi_id)
      .or(`nama_lengkap.ilike.%${term}%,no_rekam_medis.ilike.%${term}%,no_nik.ilike.%${term}%`)
      .limit(10)
    setSearching(false)
    if (error) {
      console.error('Error cari pasien:', error.message)
      return
    }
    setSearchResults(data || [])
  }

  function pilihPasienLama(p) {
    setFormPasien({
      pasien_id_existing: p.id,
      no_rekam_medis: p.no_rekam_medis || '',
      nama_lengkap: p.nama_lengkap || '',
      tempat_lahir: p.tempat_lahir || '',
      tanggal_lahir: p.tanggal_lahir || '',
      jenis_kelamin: p.jenis_kelamin || '',
      pekerjaan: p.pekerjaan || '',
      alamat: p.alamat || '',
      no_nik: p.no_nik || '',
      no_bpjs: p.no_bpjs || '',
      no_kk: p.no_kk || '',
      nama_kepala_keluarga: p.nama_kepala_keluarga || '',
      kategori_pasien: p.kategori_pasien || 'umum',
      status_bpjs_aktif: null,
      wilayah: p.wilayah || 'dalam',
    })
    setSearchResults([])
    setSearchTerm('')
  }

  function handleChangePasien(e) {
    const { name, value } = e.target
    setFormPasien((prev) => ({ ...prev, [name]: value }))
  }

  function handleChangeTriase(e) {
    const { name, value } = e.target
    setFormTriase((prev) => ({ ...prev, [name]: value }))
  }

  async function generateNomorAntrian(poliId, tanggal) {
    // Tetap generate nomor urut harian untuk konsistensi skema kunjungan,
    // walau di IGD nomor ini tidak ditampilkan/dipanggil ke layar antrian.
    const { data, error } = await supabase
      .from('kunjungan')
      .select('nomor_antrian')
      .eq('poli_id', poliId)
      .eq('tanggal_periksa', tanggal)
      .order('nomor_antrian', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) console.error('Error generate nomor antrian IGD:', error.message)
    const terakhir = data?.nomor_antrian || 0
    return terakhir + 1
  }

  // Langkah 1: Perawat IGD daftarkan pasien langsung (reuse pola DashboardLoket.jsx,
  // disederhanakan: tanpa pilihan poli tujuan/dokter PJ karena sudah pasti IGD)
  async function handleSubmitPendaftaran(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!poliIgd) throw new Error('Poli IGD belum ditemukan untuk instansi ini. Hubungi admin.')
      if (!formPasien.nama_lengkap.trim()) throw new Error('Nama lengkap wajib diisi.')
      if (!formPasien.tanggal_lahir) throw new Error('Tanggal lahir wajib diisi.')
      if (!formPasien.jenis_kelamin) throw new Error('Jenis kelamin wajib dipilih.')
      if (formPasien.kategori_pasien === 'bpjs' && !formPasien.no_bpjs.trim()) {
        throw new Error('Nomor BPJS wajib diisi untuk pasien BPJS.')
      }

      let pasienId = formPasien.pasien_id_existing

      const biodataPasien = {
        nama_lengkap: formPasien.nama_lengkap.trim(),
        tempat_lahir: formPasien.tempat_lahir.trim() || null,
        tanggal_lahir: formPasien.tanggal_lahir,
        jenis_kelamin: formPasien.jenis_kelamin,
        pekerjaan: formPasien.pekerjaan.trim() || null,
        alamat: formPasien.alamat.trim() || null,
        no_nik: formPasien.no_nik.trim() || null,
        no_bpjs: formPasien.no_bpjs.trim() || null,
        no_kk: formPasien.no_kk.trim() || null,
        nama_kepala_keluarga: formPasien.nama_kepala_keluarga.trim() || null,
      }

      if (!pasienId) {
        const noRm = formPasien.no_rekam_medis.trim() || generateNoRM()

        const { data: pasienExisting, error: cekErr } = await supabase
          .from('pasien')
          .select('id')
          .eq('instansi_id', profile.instansi_id)
          .eq('no_rekam_medis', noRm)
          .maybeSingle()

        if (cekErr) throw new Error(cekErr.message)

        if (pasienExisting) {
          pasienId = pasienExisting.id
        } else {
          const { data: pasienData, error: pasienErr } = await supabase
            .from('pasien')
            .insert({
              instansi_id: profile.instansi_id,
              no_rekam_medis: noRm,
              kategori_pasien: formPasien.kategori_pasien,
              wilayah: formPasien.wilayah,
              ...biodataPasien,
            })
            .select()
            .single()

          if (pasienErr) throw new Error(pasienErr.message)
          pasienId = pasienData.id
        }
      } else {
        // Pasien lama -> koreksi biodata sekaligus, sama seperti alur loket
        const { error: updateErr } = await supabase
          .from('pasien')
          .update(biodataPasien)
          .eq('id', pasienId)
        if (updateErr) throw new Error(updateErr.message)
      }

      const nomorAntrian = await generateNomorAntrian(poliIgd.id, todayStr())

      const { data: kunjunganData, error: kunjunganErr } = await supabase
        .from('kunjungan')
        .insert({
          instansi_id: profile.instansi_id,
          pasien_id: pasienId,
          poli_id: poliIgd.id,
          loket_id: profile.id, // perawat IGD berperan sebagai pencatat pendaftaran
          tanggal_periksa: todayStr(),
          kategori_pasien: formPasien.kategori_pasien,
          status_bpjs_aktif: formPasien.kategori_pasien === 'bpjs' ? formPasien.status_bpjs_aktif : null,
          wilayah: formPasien.wilayah,
          status: 'menunggu', // langsung ditriase, belum ke dokter
          nomor_antrian: nomorAntrian,
          status_panggil: 'menunggu',
          status_prioritas: 'gawat_darurat',
        })
        .select()
        .single()

      if (kunjunganErr) throw new Error(kunjunganErr.message)

      // Lanjut langsung ke form triase untuk pasien yang baru didaftarkan
      setKunjunganAktif({ ...kunjunganData, pasien: { nama_lengkap: formPasien.nama_lengkap, ...biodataPasien } })
      setFormTriase(FORM_TRIASE_AWAL)
      setFormPasien(FORM_PASIEN_AWAL)
      setStep('triase')
      fetchDaftarAktifIgd(poliIgd.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Langkah 2: Simpan triase -> kunjungan diteruskan ke dokter IGD
  async function handleSubmitTriase(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!formTriase.triase) throw new Error('Kategori triase wajib dipilih.')
      if (!formTriase.keluhan_utama.trim()) throw new Error('Keluhan utama wajib diisi.')

      const { error: skriningErr } = await supabase
        .from('skrining')
        .insert({
          kunjungan_id: kunjunganAktif.id,
          perawat_id: profile.id,
          triase: formTriase.triase,
          tekanan_darah: formTriase.tekanan_darah.trim() || null,
          suhu: formTriase.suhu ? parseFloat(formTriase.suhu) : null,
          berat_badan: formTriase.berat_badan ? parseFloat(formTriase.berat_badan) : null,
          tinggi_badan: formTriase.tinggi_badan ? parseFloat(formTriase.tinggi_badan) : null,
          keluhan_utama: formTriase.keluhan_utama.trim(),
          catatan: formTriase.catatan.trim() || null,
        })

      if (skriningErr) throw new Error(skriningErr.message)

      // Sama seperti alur poli umum: status -> menunggu_dokter, reset status_panggil
      const { error: updateErr } = await supabase
        .from('kunjungan')
        .update({ status: 'menunggu_dokter', status_panggil: 'menunggu', waktu_panggil: null })
        .eq('id', kunjunganAktif.id)

      if (updateErr) throw new Error(updateErr.message)

      setSukses(true)
      setKunjunganAktif(null)
      setStep('daftar')
      fetchDaftarAktifIgd(poliIgd.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function labelTriase(value) {
    const opsi = {
      merah: { label: 'Merah — Gawat', kelas: 'bg-red-100 text-red-700 border-red-300' },
      kuning: { label: 'Kuning — Darurat', kelas: 'bg-amber-100 text-amber-700 border-amber-300' },
      hijau: { label: 'Hijau — Tidak Darurat', kelas: 'bg-green-100 text-green-700 border-green-300' },
    }
    return opsi[value] || null
  }

  // ─── TAMPILAN ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Dashboard Perawat IGD</h1>
            <p className="text-gray-500 text-sm">Pendaftaran langsung + Triase — tanpa antrian</p>
          </div>
          <div className="flex items-center gap-3">
            {step !== 'triase' && (
              <a
                href="/dashboard/nakes/loket"
                title="Buka Dashboard Loket untuk cari & kelola rak rekam medis pasien"
                className="text-sm px-3 py-1.5 rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 font-medium whitespace-nowrap"
              >
                🗄️ Kelola Rak RM
              </a>
            )}
            {step === 'triase' && (
              <button
                onClick={() => { setStep('daftar'); setKunjunganAktif(null); setError('') }}
                className="text-sm text-gray-500 hover:underline"
              >
                ← Batal, kembali ke pendaftaran
              </button>
            )}
          </div>
        </div>

        {sukses && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            ✅ Triase berhasil disimpan, pasien diteruskan ke dokter IGD.
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Kolom kiri: form pendaftaran / triase */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-5">
            {step === 'daftar' && (
              <>
                <h2 className="font-semibold text-gray-700 mb-4">Daftarkan Pasien IGD</h2>

                {/* Cari pasien lama */}
                <div className="mb-4 relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cari Pasien Lama (opsional)
                  </label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => cariPasien(e.target.value)}
                    placeholder="Nama / No. RM / NIK..."
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                  {searching && <p className="text-xs text-gray-400 mt-1">Mencari...</p>}
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {searchResults.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => pilihPasienLama(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0"
                        >
                          <p className="font-medium text-gray-800">{p.nama_lengkap}</p>
                          <p className="text-xs text-gray-500">{p.no_rekam_medis} • {p.no_nik || '-'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <form onSubmit={handleSubmitPendaftaran} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Lengkap <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="nama_lengkap"
                        value={formPasien.nama_lengkap}
                        onChange={handleChangePasien}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tanggal Lahir <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        name="tanggal_lahir"
                        value={formPasien.tanggal_lahir}
                        onChange={handleChangePasien}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Jenis Kelamin <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="jenis_kelamin"
                        value={formPasien.jenis_kelamin}
                        onChange={handleChangePasien}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">-- Pilih --</option>
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                      <input
                        type="text"
                        name="alamat"
                        value={formPasien.alamat}
                        onChange={handleChangePasien}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">NIK</label>
                      <input
                        type="text"
                        name="no_nik"
                        value={formPasien.no_nik}
                        onChange={handleChangePasien}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">No. RM</label>
                      <input
                        type="text"
                        name="no_rekam_medis"
                        value={formPasien.no_rekam_medis}
                        onChange={handleChangePasien}
                        placeholder="Kosongkan = otomatis"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* Kategori pasien */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Pasien</label>
                    <div className="flex gap-3">
                      {['umum', 'bpjs'].map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setFormPasien((p) => ({ ...p, kategori_pasien: k }))}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                            formPasien.kategori_pasien === k
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-white text-gray-600 border-gray-300'
                          }`}
                        >
                          {k === 'umum' ? 'Umum' : 'BPJS'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {formPasien.kategori_pasien === 'bpjs' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nomor BPJS <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="no_bpjs"
                        value={formPasien.no_bpjs}
                        onChange={handleChangePasien}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Menyimpan...' : 'Daftarkan & Lanjut Triase →'}
                  </button>
                </form>
              </>
            )}

            {step === 'triase' && kunjunganAktif && (
              <>
                <div className="bg-red-50 rounded-xl p-4 mb-5 border border-red-200">
                  <p className="font-semibold text-gray-800">{kunjunganAktif.pasien.nama_lengkap}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {kunjunganAktif.pasien.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} • {kunjunganAktif.pasien.tanggal_lahir}
                  </p>
                </div>

                <form onSubmit={handleSubmitTriase} className="space-y-4">
                  {/* Triase */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kategori Triase <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      {['merah', 'kuning', 'hijau'].map((t) => {
                        const info = labelTriase(t)
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setFormTriase((p) => ({ ...p, triase: t }))}
                            className={`flex-1 py-2.5 rounded-lg border text-sm font-semibold transition ${
                              formTriase.triase === t ? info.kelas + ' ring-2 ring-offset-1' : 'bg-white text-gray-500 border-gray-300'
                            }`}
                          >
                            {info.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">TD (mmHg)</label>
                      <input
                        type="text"
                        name="tekanan_darah"
                        value={formTriase.tekanan_darah}
                        onChange={handleChangeTriase}
                        placeholder="120/80"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Suhu (°C)</label>
                      <input
                        type="number"
                        step="0.1"
                        name="suhu"
                        value={formTriase.suhu}
                        onChange={handleChangeTriase}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">BB (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        name="berat_badan"
                        value={formTriase.berat_badan}
                        onChange={handleChangeTriase}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Keluhan Utama <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="keluhan_utama"
                      value={formTriase.keluhan_utama}
                      onChange={handleChangeTriase}
                      rows={3}
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Tambahan</label>
                    <textarea
                      name="catatan"
                      value={formTriase.catatan}
                      onChange={handleChangeTriase}
                      rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Menyimpan...' : 'Simpan Triase → Teruskan ke Dokter'}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Kolom kanan: daftar pasien IGD aktif hari ini */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Pasien IGD Aktif</h2>
              <button
                onClick={() => poliIgd && fetchDaftarAktifIgd(poliIgd.id)}
                className="text-xs text-red-600 hover:underline"
              >
                🔄 Refresh
              </button>
            </div>
            {daftarAktifIgd.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Belum ada pasien IGD hari ini.</p>
            ) : (
              <div className="space-y-2">
                {daftarAktifIgd.map((k) => {
                  const triase = k.skrining?.[0]?.triase
                  const info = triase ? labelTriase(triase) : null
                  return (
                    <div key={k.id} className="p-3 rounded-xl border border-gray-200">
                      <p className="font-medium text-gray-800 text-sm">{k.pasien?.nama_lengkap}</p>
                      <p className="text-xs text-gray-500">{k.pasien?.no_rekam_medis}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {info && (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${info.kelas}`}>
                            {info.label}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400">
                          {k.status === 'menunggu' ? 'Menunggu triase' : 'Menunggu dokter'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}