import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

export default function ProfilInstansi() {
  const { profile } = useAuth()
  const instansiId = profile?.instansi_id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({ nama: '', jenis: '', kota: '', alamat: '', telepon: '' })

  useEffect(() => {
    if (instansiId) fetchInstansi()
  }, [instansiId])

  async function fetchInstansi() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('instansi')
      .select('nama, jenis, kota, alamat, telepon')
      .eq('id', instansiId)
      .single()

    if (error) {
      setError('Gagal memuat data instansi: ' + error.message)
    } else if (data) {
      setForm({
        nama: data.nama ?? '',
        jenis: data.jenis ?? '',
        kota: data.kota ?? '',
        alamat: data.alamat ?? '',
        telepon: data.telepon ?? '',
      })
    }
    setLoading(false)
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.nama.trim()) {
      setError('Nama instansi wajib diisi.')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('instansi')
      .update({
        nama: form.nama.trim(),
        jenis: form.jenis.trim() || 'puskesmas',
        kota: form.kota.trim() || null,
        alamat: form.alamat.trim() || null,
        telepon: form.telepon.trim() || null,
      })
      .eq('id', instansiId)

    setSaving(false)

    if (error) {
      setError('Gagal menyimpan: ' + error.message)
      return
    }
    setSuccess('Data instansi berhasil disimpan.')
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Profil Instansi</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Lihat dan perbarui data instansi Anda.
      </p>

      <div className="rounded-xl p-5 sm:p-6 max-w-xl" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg animate-pulse" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg p-3 text-sm" style={{ background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>
                {success}
              </div>
            )}

            <Field label="Nama Instansi">
              <input
                type="text"
                value={form.nama}
                onChange={(e) => updateField('nama', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              />
            </Field>

            <Field label="Jenis">
              <select
                value={form.jenis}
                onChange={(e) => updateField('jenis', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              >
                <option value="puskesmas">Puskesmas</option>
                <option value="klinik">Klinik</option>
                <option value="rs">Rumah Sakit</option>
                <option value="lainnya">Lainnya</option>
              </select>
            </Field>

            <Field label="Kota">
              <input
                type="text"
                value={form.kota}
                onChange={(e) => updateField('kota', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              />
            </Field>

            <Field label="Alamat">
              <textarea
                value={form.alamat}
                onChange={(e) => updateField('alamat', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              />
            </Field>

            <Field label="Telepon">
              <input
                type="text"
                value={form.telepon}
                onChange={(e) => updateField('telepon', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              />
            </Field>

            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={saving}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
      {children}
    </label>
  )
}
