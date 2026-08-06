import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import DatePickerLahir from './DatePickerLahir'

/* ────────────────────────────────────────────────────────────────
   HALAMAN PUBLIK — PENDAFTARAN MANDIRI PASIEN (scan QR dari loket)
   Route disarankan: /pendaftaran-mandiri?instansi_id=xxxx
   Tidak butuh login. Pastikan RLS Supabase mengizinkan INSERT publik
   (anon) ke tabel `pasien` & `kunjungan` dengan kolom terbatas, atau
   gunakan Postgres Function (RPC) `daftar_mandiri` agar lebih aman.

   CATATAN SKEMA TAMBAHAN:
   - kunjungan.loket_id sebaiknya NULLABLE (self-registration tidak
     punya petugas loket).
   - Tambahkan kolom kunjungan.sumber text default 'loket'
     -> isi 'mandiri' untuk pendaftaran lewat QR, supaya bisa
     dibedakan di Monitoring Loket / laporan.
   ──────────────────────────────────────────────────────────────── */

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function generateNoRM() {
  const now = new Date()
  const thn = now.getFullYear().toString().slice(-2)
  const bln = String(now.getMonth() + 1).padStart(2, '0')
  const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0')
  return `RM${thn}${bln}${random}`
}

function validasiNik(nik) {
  if (!nik) return { status: 'kosong', pesan: '' }
  if (!/^\d+$/.test(nik)) return { status: 'invalid', pesan: 'NIK hanya boleh berisi angka' }
  if (nik.length !== 16) return { status: 'invalid', pesan: `NIK harus 16 digit (saat ini ${nik.length} digit)` }
  return { status: 'valid', pesan: 'NIK valid' }
}

const FORM_AWAL = {
  kategori_pasien: '',
  wilayah: '',
  no_nik: '',
  no_bpjs: '',
  nama_lengkap: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  alamat: '',
  tanggal_periksa: todayStr(),
  poli_id: '',
}

// Urutan langkah wizard sesuai alur yang diminta
const URUTAN_STEP = [
  'kategori',
  'wilayah',
  'identitas', // NIK + no BPJS
  'nama',
  'tanggal_lahir',
  'jenis_kelamin',
  'alamat',
  'tanggal_periksa',
  'poli',
  'review',
]

export default function PendaftaranMandiri() {
  const [instansiId, setInstansiId] = useState(null)
  const [instansi, setInstansi] = useState(null)
  const [polis, setPolis] = useState([])
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState(FORM_AWAL)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tiket, setTiket] = useState(null) // hasil pendaftaran sukses

  const step = URUTAN_STEP[stepIndex]

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('instansi_id')
    if (!id) {
      setError('Tautan/QR tidak valid: instansi_id tidak ditemukan.')
      return
    }
    setInstansiId(id)
    fetchInstansi(id)
    fetchPolis(id)
  }, [])

  async function fetchInstansi(id) {
    const { data } = await supabase.from('instansi').select('nama').eq('id', id).single()
    setInstansi(data)
  }

  async function fetchPolis(id) {
    const { data, error } = await supabase
      .from('polis')
      .select('id, nama_poli')
      .eq('instansi_id', id)
    if (error) console.error('Error fetch polis:', error.message)
    setPolis(data || [])
  }

  function next() {
    setError('')
    setStepIndex((i) => Math.min(i + 1, URUTAN_STEP.length - 1))
  }
  function back() {
    setError('')
    setStepIndex((i) => Math.max(i - 1, 0))
  }
  function update(patch) {
    setForm((p) => ({ ...p, ...patch }))
  }

  function pilihKategori(kategori) {
    update({ kategori_pasien: kategori })
    next()
  }
  function pilihWilayah(w) {
    update({ wilayah: w })
    next()
  }

  const nikCheck = validasiNik(form.no_nik)

  function validasiIdentitas() {
    if (form.no_nik && nikCheck.status === 'invalid') return nikCheck.pesan
    if (form.kategori_pasien === 'bpjs' && !form.no_bpjs.trim()) return 'Nomor BPJS wajib diisi untuk pasien BPJS.'
    return ''
  }

  async function generateNomorAntrian(poliId, tanggal) {
    const { data, error } = await supabase
      .from('kunjungan')
      .select('nomor_antrian')
      .eq('poli_id', poliId)
      .eq('tanggal_periksa', tanggal)
      .order('nomor_antrian', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) console.error('Error generate nomor antrian:', error.message)
    return (data?.nomor_antrian || 0) + 1
  }

  async function handleSubmit() {
    setError('')
    setLoading(true)
    try {
      if (!form.nama_lengkap.trim()) throw new Error('Nama lengkap wajib diisi.')
      if (!form.tanggal_lahir) throw new Error('Tanggal lahir wajib diisi.')
      if (!form.jenis_kelamin) throw new Error('Jenis kelamin wajib dipilih.')
      if (!form.poli_id) throw new Error('Poli tujuan wajib dipilih.')

      const noRm = generateNoRM()

      const { data: pasienData, error: pasienErr } = await supabase
        .from('pasien')
        .insert({
          instansi_id: instansiId,
          no_rekam_medis: noRm,
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
          instansi_id: instansiId,
          pasien_id: pasienData.id,
          poli_id: form.poli_id,
          loket_id: null,
          sumber: 'mandiri',
          tanggal_periksa: form.tanggal_periksa,
          kategori_pasien: form.kategori_pasien,
          wilayah: form.wilayah,
          status: 'menunggu',
          nomor_antrian: nomorAntrian,
          status_panggil: 'menunggu',
        })
      if (kunjunganErr) throw new Error(kunjunganErr.message)

      const namaPoli = polis.find((p) => p.id === form.poli_id)?.nama_poli || ''
      setTiket({ nomor: nomorAntrian, namaPoli, noRm })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Tampilan sukses ───────────────────────────────
  if (tiket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center space-y-3">
          <div className="text-5xl">✅</div>
          <h2 className="text-lg font-bold text-gray-800">Pendaftaran Berhasil</h2>
          <p className="text-sm text-gray-500">{tiket.namaPoli}</p>
          <div className="text-6xl font-bold text-teal-600 py-4">{tiket.nomor}</div>
          <p className="text-xs text-gray-400">Nomor Rekam Medis: {tiket.noRm}</p>
          <p className="text-sm text-gray-600 pt-2">
            Silakan tunjukkan nomor ini di loket / tunggu nomor Anda dipanggil di layar antrian.
          </p>
        </div>
      </div>
    )
  }

  if (!instansiId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <p className="text-red-500 text-sm">{error || 'Memuat...'}</p>
      </div>
    )
  }

  const progres = Math.round(((stepIndex + 1) / URUTAN_STEP.length) * 100)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm w-full max-w-sm p-6 space-y-5">
        <div>
          <p className="text-xs text-gray-400 mb-1">{instansi?.nama || ''}</p>
          <h1 className="text-base font-bold text-gray-800">Pendaftaran Mandiri</h1>
          <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3">
            <div className="h-1.5 bg-teal-600 rounded-full transition-all" style={{ width: `${progres}%` }} />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-xs rounded-lg px-3 py-2">{error}</div>
        )}

        {/* 1. Kategori pasien */}
        {step === 'kategori' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Pilih jenis kunjungan Anda:</p>
            <button
              onClick={() => pilihKategori('bpjs')}
              className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2"
            >
              🏥 BPJS
            </button>
            <button
              onClick={() => pilihKategori('umum')}
              className="w-full py-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center justify-center gap-2"
            >
              👤 UMUM
            </button>
          </div>
        )}

        {/* 2. Wilayah */}
        {step === 'wilayah' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Apakah Anda dalam wilayah kerja puskesmas ini?</p>
            <button
              onClick={() => pilihWilayah('dalam')}
              className="w-full py-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold"
            >
              📍 Dalam Wilayah Kerja
            </button>
            <button
              onClick={() => pilihWilayah('luar')}
              className="w-full py-4 rounded-xl bg-gray-600 hover:bg-gray-700 text-white font-bold"
            >
              🗺️ Luar Wilayah Kerja
            </button>
            <button onClick={back} className="text-xs text-gray-400 pt-1">← Kembali</button>
          </div>
        )}

        {/* 3. NIK & No BPJS */}
        {step === 'identitas' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nomor NIK <span className="text-gray-400 font-normal">(opsional)</span>
              </label>
              <input
                type="text"
                value={form.no_nik}
                onChange={(e) => update({ no_nik: e.target.value })}
                maxLength={16}
                placeholder="16 digit NIK"
                className={`w-full border rounded-lg px-3 py-2 text-sm ${
                  nikCheck.status === 'invalid' ? 'border-red-400' : nikCheck.status === 'valid' ? 'border-green-400' : ''
                }`}
              />
              {form.no_nik && (
                <p className={`text-xs mt-1 ${nikCheck.status === 'invalid' ? 'text-red-500' : 'text-green-600'}`}>
                  {nikCheck.status === 'invalid' ? `⚠️ ${nikCheck.pesan}` : `✓ ${nikCheck.pesan}`}
                </p>
              )}
            </div>
            {form.kategori_pasien === 'bpjs' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nomor BPJS <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.no_bpjs}
                  onChange={(e) => update({ no_bpjs: e.target.value })}
                  placeholder="Nomor kartu BPJS"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={back} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm">Kembali</button>
              <button
                onClick={() => { const e = validasiIdentitas(); if (e) return setError(e); next() }}
                className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold"
              >
                Lanjut
              </button>
            </div>
          </div>
        )}

        {/* 4. Nama */}
        {step === 'nama' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nama Lengkap Pasien <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.nama_lengkap}
                onChange={(e) => update({ nama_lengkap: e.target.value })}
                placeholder="Nama lengkap sesuai KTP"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={back} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm">Kembali</button>
              <button
                onClick={() => { if (!form.nama_lengkap.trim()) return setError('Nama lengkap wajib diisi.'); next() }}
                className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold"
              >
                Lanjut
              </button>
            </div>
          </div>
        )}

        {/* 5. Tanggal lahir */}
        {step === 'tanggal_lahir' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tanggal Lahir <span className="text-red-500">*</span>
              </label>
              <DatePickerLahir
                name="tanggal_lahir"
                value={form.tanggal_lahir}
                onChange={(e) => update({ tanggal_lahir: e.target.value })}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={back} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm">Kembali</button>
              <button
                onClick={() => { if (!form.tanggal_lahir) return setError('Tanggal lahir wajib diisi.'); next() }}
                className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold"
              >
                Lanjut
              </button>
            </div>
          </div>
        )}

        {/* 6. Jenis kelamin */}
        {step === 'jenis_kelamin' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Jenis Kelamin</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { update({ jenis_kelamin: 'L' }); next() }}
                className={`py-4 rounded-xl border font-bold ${form.jenis_kelamin === 'L' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300'}`}
              >
                Laki-laki
              </button>
              <button
                onClick={() => { update({ jenis_kelamin: 'P' }); next() }}
                className={`py-4 rounded-xl border font-bold ${form.jenis_kelamin === 'P' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300'}`}
              >
                Perempuan
              </button>
            </div>
            <button onClick={back} className="text-xs text-gray-400 pt-1">← Kembali</button>
          </div>
        )}

        {/* 7. Alamat */}
        {step === 'alamat' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
              <textarea
                value={form.alamat}
                onChange={(e) => update({ alamat: e.target.value })}
                rows={3}
                placeholder="Alamat lengkap pasien"
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={back} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm">Kembali</button>
              <button onClick={next} className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold">Lanjut</button>
            </div>
          </div>
        )}

        {/* 8. Tanggal periksa */}
        {step === 'tanggal_periksa' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Periksa</label>
              <input
                type="date"
                value={form.tanggal_periksa}
                onChange={(e) => update({ tanggal_periksa: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={back} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm">Kembali</button>
              <button onClick={next} className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold">Lanjut</button>
            </div>
          </div>
        )}

        {/* 9. Poli tujuan */}
        {step === 'poli' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Poli Tujuan <span className="text-red-500">*</span>
              </label>
              <select
                value={form.poli_id}
                onChange={(e) => update({ poli_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">-- Pilih Poli --</option>
                {polis.map((p) => (
                  <option key={p.id} value={p.id}>{p.nama_poli}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={back} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm">Kembali</button>
              <button
                onClick={() => { if (!form.poli_id) return setError('Poli tujuan wajib dipilih.'); next() }}
                className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold"
              >
                Lanjut
              </button>
            </div>
          </div>
        )}

        {/* 10. Review & submit */}
        {step === 'review' && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-700">Periksa kembali data Anda:</p>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
              <p><b>Kategori:</b> {form.kategori_pasien === 'bpjs' ? 'BPJS' : 'Umum'}</p>
              <p><b>Wilayah:</b> {form.wilayah === 'dalam' ? 'Dalam Wilayah' : 'Luar Wilayah'}</p>
              {form.no_nik && <p><b>NIK:</b> {form.no_nik}</p>}
              {form.no_bpjs && <p><b>No. BPJS:</b> {form.no_bpjs}</p>}
              <p><b>Nama:</b> {form.nama_lengkap}</p>
              <p><b>Tanggal Lahir:</b> {form.tanggal_lahir}</p>
              <p><b>Jenis Kelamin:</b> {form.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
              {form.alamat && <p><b>Alamat:</b> {form.alamat}</p>}
              <p><b>Tanggal Periksa:</b> {form.tanggal_periksa}</p>
              <p><b>Poli Tujuan:</b> {polis.find((p) => p.id === form.poli_id)?.nama_poli}</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={back} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm">Kembali</button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {loading ? 'Menyimpan...' : 'Daftar Sekarang'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
