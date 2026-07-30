import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

export default function KelolaStaf() {
  const { profile } = useAuth()
  const instansiId = profile?.instansi_id

  const [tab, setTab] = useState('staf') // 'staf' | 'poli'

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Kelola Poli & Staf</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Atur daftar poli dan akun tenaga kesehatan di instansi Anda.
      </p>

      <div className="flex gap-2 mb-5">
        <TabButton active={tab === 'staf'} onClick={() => setTab('staf')}>
          Daftar Staf
        </TabButton>
        <TabButton active={tab === 'poli'} onClick={() => setTab('poli')}>
          Daftar Poli
        </TabButton>
      </div>

      {tab === 'staf' ? <StafSection instansiId={instansiId} /> : <PoliSection instansiId={instansiId} />}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--ink)',
        border: '1px solid var(--line)',
      }}
    >
      {children}
    </button>
  )
}

// =========================================================
// STAF SECTION
// =========================================================
function StafSection({ instansiId }) {
  const [stafList, setStafList] = useState([])
  const [poliOptions, setPoliOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [editingId, setEditingId] = useState(null) // null = mode tambah, isi = mode edit
  const [form, setForm] = useState({ nama_lengkap: '', email: '', password: '', poli_id: '', profesi: '' })
  const [errors, setErrors] = useState({})

  const isEditMode = editingId !== null

  useEffect(() => {
    if (instansiId) {
      fetchStaf()
      fetchPoliOptions()
    }
  }, [instansiId])

  async function fetchStaf() {
    setLoading(true)
    setListError('')
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nama_lengkap, email, role, profesi, aktif, poli_id, poli:poli_id (nama_poli)')
      .eq('instansi_id', instansiId)
      .order('created_at', { ascending: false })

    if (error) {
      setListError('Gagal memuat daftar staf: ' + error.message)
      setStafList([])
    } else {
      setStafList(data ?? [])
    }
    setLoading(false)
  }

  async function fetchPoliOptions() {
    const { data, error } = await supabase
      .from('polis')
      .select('id, nama_poli')
      .eq('instansi_id', instansiId)
      .order('nama_poli', { ascending: true })

    if (!error) setPoliOptions(data ?? [])
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function bukaTambah() {
    setEditingId(null)
    setForm({ nama_lengkap: '', email: '', password: '', poli_id: '', profesi: '' })
    setErrors({})
    setSubmitError('')
    setShowPassword(false)
    setModalOpen(true)
  }

  function bukaEdit(staf) {
    setEditingId(staf.id)
    setForm({
      nama_lengkap: staf.nama_lengkap ?? '',
      email: staf.email ?? '',
      password: '',
      poli_id: staf.poli_id ?? '',
      profesi: staf.profesi ?? '',
    })
    setErrors({})
    setSubmitError('')
    setShowPassword(false)
    setModalOpen(true)
  }

  function validate() {
    const next = {}
    if (!form.nama_lengkap.trim()) next.nama_lengkap = 'Nama wajib diisi'
    if (!form.email.trim()) next.email = 'Email wajib diisi'
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Format email tidak valid'

    // Saat tambah, password wajib. Saat edit, password opsional (kosongkan jika tidak diganti).
    if (!isEditMode) {
      if (!form.password || form.password.length < 8) next.password = 'Password minimal 8 karakter'
    } else if (form.password && form.password.length < 8) {
      next.password = 'Password minimal 8 karakter'
    }
    return next
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    const validation = validate()
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setSubmitting(true)

    if (!isEditMode) {
      // MODE TAMBAH
      const { data, error } = await supabase.functions.invoke('create-staf-instansi', {
        body: {
          nama_lengkap: form.nama_lengkap.trim(),
          email: form.email.trim(),
          password: form.password,
          poli_id: form.poli_id || null,
          profesi: form.profesi.trim() || null,
        },
      })

      setSubmitting(false)

      if (error) {
        setSubmitError(error.message || 'Gagal membuat akun staf.')
        return
      }
      if (data?.error) {
        setSubmitError(data.error)
        return
      }
    } else {
      // MODE EDIT
      const { data, error } = await supabase.functions.invoke('update-staf-instansi', {
        body: {
          staf_id: editingId,
          nama_lengkap: form.nama_lengkap.trim(),
          email: form.email.trim(),
          password: form.password ? form.password : null,
          poli_id: form.poli_id || null,
          profesi: form.profesi.trim() || null,
        },
      })

      setSubmitting(false)

      if (error) {
        setSubmitError(error.message || 'Gagal memperbarui akun staf.')
        return
      }
      if (data?.error) {
        setSubmitError(data.error)
        return
      }
    }

    setModalOpen(false)
    setEditingId(null)
    setForm({ nama_lengkap: '', email: '', password: '', poli_id: '', profesi: '' })
    setErrors({})
    fetchStaf()
  }

  return (
    <div className="rounded-xl p-5 sm:p-6" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold">Daftar Staf / Tenaga Kesehatan</p>
        <button
          onClick={bukaTambah}
          className="text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + Tambah Staf
        </button>
      </div>

      {listError && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
          {listError}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
          ))}
        </div>
      ) : stafList.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Belum ada staf yang terdaftar. Klik "Tambah Staf" untuk membuat akun baru.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>Nama</th>
                <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>Email</th>
                <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>Poli</th>
                <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>Profesi</th>
                <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>Status</th>
                <th className="text-left py-2 font-semibold" style={{ color: 'var(--muted)' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {stafList.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td className="py-2.5 pr-4">{s.nama_lengkap}</td>
                  <td className="py-2.5 pr-4" style={{ color: 'var(--muted)' }}>{s.email}</td>
                  <td className="py-2.5 pr-4">{s.poli?.nama_poli ?? '—'}</td>
                  <td className="py-2.5 pr-4">{s.profesi ?? '—'}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{
                        background: s.aktif ? '#ECFDF5' : '#FEF2F2',
                        color: s.aktif ? '#059669' : '#B91C1C',
                      }}
                    >
                      {s.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <button
                      onClick={() => bukaEdit(s)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                      style={{ border: '1px solid var(--line)', color: 'var(--accent)' }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(18,24,27,0.4)' }} onClick={() => setModalOpen(false)} />
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-md rounded-xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
          >
            <p className="text-sm font-semibold">{isEditMode ? 'Edit Akun Staf' : 'Tambah Staf Baru'}</p>

            {submitError && (
              <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
                {submitError}
              </div>
            )}

            <Field label="Nama Lengkap" error={errors.nama_lengkap}>
              <input
                type="text"
                value={form.nama_lengkap}
                onChange={(e) => updateField('nama_lengkap', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              />
            </Field>

            <Field label="Email" error={errors.email}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              />
            </Field>

            <Field label={isEditMode ? 'Password (kosongkan jika tidak diganti)' : 'Password'} error={errors.password}>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder={isEditMode ? 'Biarkan kosong untuk tetap pakai password lama' : ''}
                  className="w-full px-3 py-2 rounded-lg text-sm pr-16"
                  style={{ border: '1px solid var(--line)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
            </Field>

            <Field label="Poli (opsional)">
              <select
                value={form.poli_id}
                onChange={(e) => updateField('poli_id', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              >
                <option value="">— Belum ditentukan —</option>
                {poliOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.nama_poli}</option>
                ))}
              </select>
            </Field>

            <Field label="Profesi (opsional)">
              <input
                type="text"
                placeholder="dokter, perawat, bidan, analis, dll"
                value={form.profesi}
                onChange={(e) => updateField('profesi', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              />
            </Field>

            <div className="flex gap-2 justify-end mt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-sm font-medium px-4 py-2 rounded-lg"
                style={{ border: '1px solid var(--line)' }}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: 'var(--accent)', color: '#fff', opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// =========================================================
// POLI SECTION
// =========================================================
function PoliSection({ instansiId }) {
  const [poliList, setPoliList] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [newNama, setNewNama] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    if (instansiId) fetchPoli()
  }, [instansiId])

  async function fetchPoli() {
    setLoading(true)
    setListError('')
    const { data, error } = await supabase
      .from('polis')
      .select('id, nama_poli, created_at')
      .eq('instansi_id', instansiId)
      .order('created_at', { ascending: false })

    if (error) {
      setListError('Gagal memuat daftar poli: ' + error.message)
      setPoliList([])
    } else {
      setPoliList(data ?? [])
    }
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setAddError('')
    if (!newNama.trim()) {
      setAddError('Nama poli wajib diisi.')
      return
    }
    setAdding(true)
    const { error } = await supabase.from('polis').insert({ instansi_id: instansiId, nama_poli: newNama.trim() })
    setAdding(false)
    if (error) {
      setAddError(error.message)
      return
    }
    setNewNama('')
    fetchPoli()
  }

  async function handleDelete(id) {
    if (!confirm('Hapus poli ini? Staf yang terhubung ke poli ini akan kehilangan penempatan polinya.')) return
    const { error } = await supabase.from('polis').delete().eq('id', id)
    if (error) {
      alert('Gagal menghapus: ' + error.message)
      return
    }
    fetchPoli()
  }

  return (
    <div className="rounded-xl p-5 sm:p-6" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <p className="text-sm font-semibold mb-4">Daftar Poli</p>

      <form onSubmit={handleAdd} className="flex gap-2 mb-5">
        <input
          type="text"
          placeholder="Nama poli baru (mis. Poli Gigi)"
          value={newNama}
          onChange={(e) => setNewNama(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{ border: '1px solid var(--line)' }}
        />
        <button
          type="submit"
          disabled={adding}
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ background: 'var(--accent)', color: '#fff', opacity: adding ? 0.6 : 1 }}
        >
          {adding ? 'Menyimpan…' : 'Tambah'}
        </button>
      </form>

      {addError && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
          {addError}
        </div>
      )}
      {listError && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
          {listError}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
          ))}
        </div>
      ) : poliList.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Belum ada poli. Tambahkan poli pertama di atas.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {poliList.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg"
              style={{ border: '1px solid var(--line)' }}
            >
              <span className="text-sm font-medium">{p.nama_poli}</span>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-xs font-medium"
                style={{ color: '#B91C1C' }}
              >
                Hapus
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
      {children}
      {error && <span className="text-xs" style={{ color: '#B91C1C' }}>{error}</span>}
    </label>
  )
}
