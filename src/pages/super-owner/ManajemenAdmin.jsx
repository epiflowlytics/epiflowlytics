import { useEffect, useState } from 'react'
import PageSkeleton from './PageSkeleton'
import { supabase } from '../../lib/supabaseClient'

export default function ManajemenAdmin() {
  const [adminList, setAdminList] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState('')

  const [instansiOptions, setInstansiOptions] = useState([])
  const [loadingInstansi, setLoadingInstansi] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [form, setForm] = useState({
    nama_lengkap: '',
    email: '',
    password: '',
    instansi_id: '',
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    fetchAdminList()
    fetchInstansiOptions()
  }, [])

  async function fetchAdminList() {
    setLoadingList(true)
    setListError('')

    // Join ke tabel instansi supaya bisa tampilkan nama instansi, bukan cuma id.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nama_lengkap, email, is_active, instansi:instansi_id (nama)')
      .eq('role', 'admin_instansi')
      .order('created_at', { ascending: false })

    if (error) {
      setListError('Gagal memuat daftar admin: ' + error.message)
      setAdminList([])
    } else {
      setAdminList(data ?? [])
    }
    setLoadingList(false)
  }

  async function fetchInstansiOptions() {
    setLoadingInstansi(true)
    const { data, error } = await supabase
      .from('instansis')
      .select('id, nama')
      .order('nama', { ascending: true })

    if (!error) {
      setInstansiOptions(data ?? [])
    }
    setLoadingInstansi(false)
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function validate() {
    const next = {}
    if (!form.nama_lengkap.trim()) next.nama_lengkap = 'Nama wajib diisi'
    if (!form.email.trim()) next.email = 'Email wajib diisi'
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Format email tidak valid'
    if (!form.password || form.password.length < 8) next.password = 'Password minimal 8 karakter'
    if (!form.instansi_id) next.instansi_id = 'Instansi wajib dipilih'
    return next
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')

    const validationErrors = validate()
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-admin-instansi', {
        body: {
          nama_lengkap: form.nama_lengkap,
          email: form.email,
          password: form.password,
          instansi_id: form.instansi_id,
        },
      })

      // supabase.functions.invoke tidak selalu melempar error untuk status non-2xx,
      // jadi kita cek juga error message yang dikirim balik dari function-nya.
      if (error || data?.error) {
        setSubmitError(data?.error || error?.message || 'Gagal membuat akun admin.')
        setSubmitting(false)
        return
      }

      // Sukses: refresh daftar dari database supaya konsisten dengan data asli.
      await fetchAdminList()

      setForm({ nama_lengkap: '', email: '', password: '', instansi_id: '' })
      setErrors({})
      setShowPassword(false)
      setModalOpen(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Terjadi kesalahan tak terduga.')
    } finally {
      setSubmitting(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setShowPassword(false)
    setErrors({})
    setSubmitError('')
  }

  return (
    <>
      <PageSkeleton
        title="Manajemen Admin Instansi"
        description="Buat, reset, atau nonaktifkan akun Admin Instansi, dan assign ke instansi tertentu."
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="text-sm font-semibold rounded-lg px-4 py-2 transition-opacity hover:opacity-90"
            style={{ background: 'var(--primary, #2563eb)', color: '#fff' }}
          >
            + Buat Akun Admin
          </button>
        }
        sections={[
          {
            label: 'Daftar admin instansi',
            content: loadingList ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
                Memuat daftar admin...
              </p>
            ) : listError ? (
              <p className="text-sm py-6 text-center" style={{ color: '#dc2626' }}>
                {listError}
              </p>
            ) : adminList.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
                Belum ada admin instansi. Klik "+ Buat Akun Admin" untuk menambahkan.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {adminList.map((admin) => (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{admin.nama_lengkap}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                        {admin.email} · {admin.instansi?.nama ?? 'Belum ada instansi'}
                      </p>
                    </div>
                    <span
                      className="text-xs font-medium rounded-full px-2 py-1 flex-shrink-0"
                      style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--muted)' }}
                    >
                      {admin.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                ))}
              </div>
            ),
          },
        ]}
      />

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-xl p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4">Buat Akun Admin Instansi</h2>

            <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Nama</label>
                <input
                  type="text"
                  value={form.nama_lengkap}
                  onChange={(e) => updateField('nama_lengkap', e.target.value)}
                  autoComplete="off"
                  className="w-full h-9 rounded-lg px-3 text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  placeholder="Nama lengkap admin"
                  disabled={submitting}
                />
                {errors.nama_lengkap && (
                  <p className="text-xs mt-1" style={{ color: '#dc2626' }}>{errors.nama_lengkap}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  autoComplete="off"
                  className="w-full h-9 rounded-lg px-3 text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  disabled={submitting}
                />
                {errors.email && (
                  <p className="text-xs mt-1" style={{ color: '#dc2626' }}>{errors.email}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    autoComplete="new-password"
                    className="w-full h-9 rounded-lg pl-3 pr-9 text-sm"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center"
                    style={{ color: 'var(--muted)' }}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs mt-1" style={{ color: '#dc2626' }}>{errors.password}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Instansi</label>
                <select
                  value={form.instansi_id}
                  onChange={(e) => updateField('instansi_id', e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  disabled={submitting || loadingInstansi}
                >
                  <option value="">
                    {loadingInstansi ? 'Memuat instansi...' : 'Pilih instansi'}
                  </option>
                  {instansiOptions.map((instansi) => (
                    <option key={instansi.id} value={instansi.id}>
                      {instansi.nama}
                    </option>
                  ))}
                </select>
                {!loadingInstansi && instansiOptions.length === 0 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    Belum ada instansi terdaftar. Tambahkan dulu di halaman Kelola Instansi.
                  </p>
                )}
                {errors.instansi_id && (
                  <p className="text-xs mt-1" style={{ color: '#dc2626' }}>{errors.instansi_id}</p>
                )}
              </div>

              {submitError && (
                <p className="text-sm rounded-lg px-3 py-2" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                  {submitError}
                </p>
              )}

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-sm font-medium rounded-lg px-4 py-2"
                  style={{ border: '1px solid var(--line)' }}
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-60"
                  style={{ background: 'var(--primary, #2563eb)', color: '#fff' }}
                  disabled={submitting}
                >
                  {submitting ? 'Membuat...' : 'Buat Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
