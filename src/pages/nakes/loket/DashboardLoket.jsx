import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import AntrianDisplay from './AntrianDisplay'
import CekAntrian from './CekAntrian'
import DatePickerLahir from './DatePickerLahir'

// Hitung umur dari tanggal lahir
function hitungUmur(tanggalLahir) {
  if (!tanggalLahir) return ''
  const lahir = new Date(tanggalLahir)
  const sekarang = new Date()

  let tahun = sekarang.getFullYear() - lahir.getFullYear()
  let bulan = sekarang.getMonth() - lahir.getMonth()
  let hari = sekarang.getDate() - lahir.getDate()

  if (hari < 0) {
    bulan--
    const hariDibulanLalu = new Date(sekarang.getFullYear(), sekarang.getMonth(), 0).getDate()
    hari += hariDibulanLalu
  }
  if (bulan < 0) {
    tahun--
    bulan += 12
  }

  return `${tahun} Tahun ${bulan} Bulan ${hari} Hari`
}

// Generate nomor rekam medis otomatis
function generateNoRM() {
  const now = new Date()
  const thn = now.getFullYear().toString().slice(-2)
  const bln = String(now.getMonth() + 1).padStart(2, '0')
  const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0')
  return `RM${thn}${bln}${random}`
}

const FORM_AWAL = {
  kategori_pasien: '',
  no_rekam_medis: '',
  mode_rm: 'otomatis',
  tanggal_periksa: new Date().toISOString().split('T')[0],
  nama_lengkap: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  alamat: '',
  no_nik: '',
  no_bpjs: '',
  wilayah: '',
  poli_id: '',
}

export default function DashboardLoket() {
  const [step, setStep] = useState('kategori')
  const [form, setForm] = useState(FORM_AWAL)
  const [polis, setPolis] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState(false)
  const [profile, setProfile] = useState(null)
  const [tiketAntrian, setTiketAntrian] = useState(null) // { nomor, namaPoli }

  useEffect(() => {
    fetchProfile()

    // Jika dibuka lewat tab baru dengan ?view=antrian, langsung tampilkan layar antrian
    const params = new URLSearchParams(window.location.search)
    if (params.get('view') === 'antrian') {
      setStep('antrian')
    }
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('*, instansi:instansi_id(nama)')
      .eq('id', user.id)
      .single()

    setProfile(data)
    if (data?.instansi_id) {
      fetchPolis(data.instansi_id)
    }
  }

  async function fetchPolis(instansiId) {
    const { data, error } = await supabase
      .from('polis')
      .select('id, nama_poli')
      .eq('instansi_id', instansiId)

    if (error) {
      console.error('Error fetch polis:', error.message)
    }

    setPolis(data || [])
  }

  // Generate nomor antrian: reset ke 1 tiap hari, per poli
  async function generateNomorAntrian(poliId, tanggal) {
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

  function pilihKategori(kategori) {
    const noRm = generateNoRM()
    setForm({
      ...FORM_AWAL,
      kategori_pasien: kategori,
      no_rekam_medis: noRm,
      tanggal_periksa: new Date().toISOString().split('T')[0],
    })
    setStep('form')
    setError('')
    setSukses(false)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => {
      const updated = { ...prev, [name]: value }
      if (name === 'mode_rm' && value === 'otomatis') {
        updated.no_rekam_medis = generateNoRM()
      }
      return updated
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!form.nama_lengkap.trim()) throw new Error('Nama lengkap wajib diisi.')
      if (!form.tanggal_lahir) throw new Error('Tanggal lahir wajib diisi.')
      if (!form.jenis_kelamin) throw new Error('Jenis kelamin wajib dipilih.')
      if (!form.wilayah) throw new Error('Wilayah wajib dipilih.')
      if (!form.poli_id) throw new Error('Poli tujuan wajib dipilih.')
      if (!form.no_rekam_medis.trim()) throw new Error('Nomor rekam medis wajib diisi.')
      if (form.kategori_pasien === 'bpjs' && !form.no_bpjs.trim()) {
        throw new Error('Nomor BPJS wajib diisi untuk pasien BPJS.')
      }

      const { data: pasienData, error: pasienErr } = await supabase
        .from('pasien')
        .insert({
          instansi_id: profile.instansi_id,
          no_rekam_medis: form.no_rekam_medis.trim(),
          nama_lengkap: form.nama_lengkap.trim(),
          tanggal_lahir: form.tanggal_lahir,
          jenis_kelamin: form.jenis_kelamin,
          alamat: form.alamat.trim() || null,
          no_nik: form.no_nik.trim() || null,
          no_bpjs: form.no_bpjs.trim() || null,
          kategori_pasien: form.kategori_pasien,
          wilayah: form.wilayah,
        })
        .select()
        .single()

      if (pasienErr) throw new Error(pasienErr.message)

      const nomorAntrian = await generateNomorAntrian(form.poli_id, form.tanggal_periksa)

      const { error: kunjunganErr } = await supabase
        .from('kunjungan')
        .insert({
          instansi_id: profile.instansi_id,
          pasien_id: pasienData.id,
          poli_id: form.poli_id,
          loket_id: profile.id,
          tanggal_periksa: form.tanggal_periksa,
          kategori_pasien: form.kategori_pasien,
          wilayah: form.wilayah,
          status: 'menunggu',
          nomor_antrian: nomorAntrian,
          status_panggil: 'menunggu',
        })

      if (kunjunganErr) throw new Error(kunjunganErr.message)

      const namaPoli = polis.find((p) => p.id === form.poli_id)?.nama_poli || ''
      setTiketAntrian({ nomor: nomorAntrian, namaPoli })
      setSukses(true)
      setStep('kategori')
      setForm(FORM_AWAL)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── TAMPILAN PILIH KATEGORI ───────────────────────────────
  if (step === 'kategori') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-800">Pendaftaran Pasien</h1>
          <p className="text-gray-500 mt-1">
            {profile?.instansi?.nama || ''}
          </p>
        </div>

        {sukses && tiketAntrian && (
          <div className="mb-6 bg-white border-2 border-dashed border-teal-400 rounded-xl px-8 py-5 text-center shadow-sm">
            <p className="text-sm text-gray-500">✅ Pasien berhasil didaftarkan</p>
            <p className="text-xs text-gray-400 mt-1">{tiketAntrian.namaPoli}</p>
            <p className="text-5xl font-bold text-teal-600 mt-2 tracking-wide">
              {tiketAntrian.nomor}
            </p>
            <p className="text-xs text-gray-400 mt-1">Nomor Antrian Anda</p>
          </div>
        )}

        <p className="text-gray-600 mb-6 font-medium">Pilih kategori pasien:</p>

        <div className="flex flex-wrap justify-center gap-6">
          <button
            onClick={() => pilihKategori('bpjs')}
            className="w-48 h-48 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white flex flex-col items-center justify-center gap-3 shadow-lg transition"
          >
            <span className="text-5xl">🏥</span>
            <span className="text-xl font-bold">BPJS</span>
            <span className="text-xs opacity-80">BPJS Aktif</span>
          </button>

          <button
            onClick={() => pilihKategori('umum')}
            className="w-48 h-48 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white flex flex-col items-center justify-center gap-3 shadow-lg transition"
          >
            <span className="text-5xl">👤</span>
            <span className="text-xl font-bold">UMUM</span>
            <span className="text-xs opacity-80">Bayar Mandiri</span>
          </button>

          <button
            onClick={() => {
              const url = new URL(window.location.href)
              url.searchParams.set('view', 'antrian')
              window.open(url.toString(), '_blank')
            }}
            className="w-48 h-48 rounded-2xl bg-gray-700 hover:bg-gray-800 text-white flex flex-col items-center justify-center gap-3 shadow-lg transition"
          >
            <span className="text-5xl">📺</span>
            <span className="text-xl font-bold">ANTRIAN</span>
            <span className="text-xs opacity-80">Layar Panggilan</span>
          </button>

          <button
            onClick={() => setStep('cek-antrian')}
            className="w-48 h-48 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white flex flex-col items-center justify-center gap-3 shadow-lg transition"
          >
            <span className="text-5xl">📱</span>
            <span className="text-xl font-bold">CEK ANTRIAN</span>
            <span className="text-xs opacity-80">Scan QR Pasien</span>
          </button>
        </div>
      </div>
    )
  }

  // ─── TAMPILAN LAYAR ANTRIAN ─────────────────────────────────
  if (step === 'antrian') {
    return (
      <div className="relative">
        <AntrianDisplay />
      </div>
    )
  }

  // ─── TAMPILAN CEK ANTRIAN (QR) ──────────────────────────────
  if (step === 'cek-antrian') {
    return (
      <div className="relative">
        <button
          onClick={() => setStep('kategori')}
          className="fixed top-4 left-4 z-[60] flex items-center gap-2 text-sm font-medium text-white bg-gray-800/80 hover:bg-gray-800 rounded-lg px-4 py-2 shadow-lg backdrop-blur-sm transition"
        >
          ← Kembali ke Loket
        </button>
        <CekAntrian />
      </div>
    )
  }

  // ─── TAMPILAN FORM PENDAFTARAN ─────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setStep('kategori')}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Kembali
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Pendaftaran Pasien</h1>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              form.kategori_pasien === 'bpjs'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-teal-100 text-teal-700'
            }`}>
              {form.kategori_pasien.toUpperCase()}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-5">

          {/* Nomor Rekam Medis */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nomor Rekam Medis
            </label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, mode_rm: 'otomatis', no_rekam_medis: generateNoRM() }))}
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
                onClick={() => setForm(p => ({ ...p, mode_rm: 'manual', no_rekam_medis: '' }))}
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
          <div>
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

          {/* Tanggal Lahir & Jenis Kelamin */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tanggal Lahir <span className="text-red-500">*</span>
              </label>
              <DatePickerLahir
                name="tanggal_lahir"
                value={form.tanggal_lahir}
                onChange={handleChange}
              />
              {form.tanggal_lahir && (
                <p className="text-xs text-teal-600 mt-1">
                  {hitungUmur(form.tanggal_lahir)}
                </p>
              )}
            </div>

            <div>
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

          {/* NIK */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nomor NIK
              <span className="text-gray-400 font-normal ml-1">(opsional)</span>
            </label>
            <input
              type="text"
              name="no_nik"
              value={form.no_nik}
              onChange={handleChange}
              placeholder="16 digit NIK"
              maxLength={16}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Nomor BPJS */}
          {form.kategori_pasien === 'bpjs' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nomor BPJS <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="no_bpjs"
                value={form.no_bpjs}
                onChange={handleChange}
                placeholder="Nomor kartu BPJS"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* Wilayah */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wilayah Pasien <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {['dalam', 'luar'].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, wilayah: w }))}
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

          {/* Poli Tujuan */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Poli Tujuan <span className="text-red-500">*</span>
            </label>
            <select
              name="poli_id"
              value={form.poli_id}
              onChange={handleChange}
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

          {/* Tombol Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep('kategori')}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : 'Daftarkan Pasien'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}