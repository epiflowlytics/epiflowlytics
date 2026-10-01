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
// STAF SECTION (poli_ids: many-to-many via tabel staf_poli)
// =========================================================
function StafSection({ instansiId }) {
  const [stafList, setStafList] = useState([])
  const [poliOptions, setPoliOptions] = useState([])
  const [poliProfesiMap, setPoliProfesiMap] = useState({}) // { poli_id: [nama profesi, ...] }
  const [profesiSemua, setProfesiSemua] = useState([]) // fallback jika poli belum punya daftar
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [editingId, setEditingId] = useState(null) // null = mode tambah, isi = mode edit
  const [form, setForm] = useState({ nama_lengkap: '', email: '', password: '', poli_ids: [], profesi: '' })
  const [errors, setErrors] = useState({})

  const isEditMode = editingId !== null

  useEffect(() => {
    if (instansiId) {
      fetchStaf()
      fetchPoliOptions()
      fetchPoliProfesi()
    }
  }, [instansiId])

  async function fetchStaf() {
    setLoading(true)
    setListError('')
    // Join lewat staf_poli -> polis, lalu diratakan jadi s.polis untuk tabel & mode edit
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nama_lengkap, email, role, profesi, aktif, staf_poli ( poli_id, polis ( id, nama_poli ) )')
      .eq('instansi_id', instansiId)
      .order('created_at', { ascending: false })

    if (error) {
      setListError('Gagal memuat daftar staf: ' + error.message)
      setStafList([])
    } else {
      const flattened = (data ?? []).map((s) => ({
        ...s,
        polis: (s.staf_poli ?? [])
          .map((rel) => rel.polis)
          .filter(Boolean),
      }))
      setStafList(flattened)
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

  async function fetchPoliProfesi() {
    const [mapRes, semuaRes] = await Promise.all([
      supabase.from('poli_profesi').select('poli_id, profesi_nakes ( nama )'),
      supabase.from('profesi_nakes').select('nama').order('nama', { ascending: true }),
    ])

    if (!mapRes.error) {
      const map = {}
      for (const row of mapRes.data ?? []) {
        const nama = row.profesi_nakes?.nama
        if (!nama) continue
        if (!map[row.poli_id]) map[row.poli_id] = []
        map[row.poli_id].push(nama)
      }
      setPoliProfesiMap(map)
    }
    if (!semuaRes.error) setProfesiSemua((semuaRes.data ?? []).map((r) => r.nama))
  }

  // Pilihan profesi untuk form: union dari semua poli terpilih.
  // Valid jika minimal satu poli yang dipilih mengizinkan profesi tsb.
  // Jika belum pilih poli, atau tidak ada satupun poli terpilih yang punya
  // daftar profesi -> tampilkan semua profesi (tidak dibatasi).
  const poliTerpilihDenganDaftar = form.poli_ids.filter(
    (id) => (poliProfesiMap[id] ?? []).length > 0
  )
  const profesiUnion =
    poliTerpilihDenganDaftar.length > 0
      ? [...new Set(poliTerpilihDenganDaftar.flatMap((id) => poliProfesiMap[id] ?? []))]
      : null
  const pilihanProfesi = profesiUnion && profesiUnion.length > 0 ? profesiUnion : profesiSemua
  const profesiDibatasi = Boolean(profesiUnion && profesiUnion.length > 0)

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // Ganti poli terpilih -> kosongkan profesi jika profesi lama tidak diizinkan lagi
  function handlePoliToggle(poliId) {
    setForm((prev) => {
      const sudahTerpilih = prev.poli_ids.includes(poliId)
      const poliIdsBaru = sudahTerpilih
        ? prev.poli_ids.filter((id) => id !== poliId)
        : [...prev.poli_ids, poliId]

      const poliDenganDaftar = poliIdsBaru.filter((id) => (poliProfesiMap[id] ?? []).length > 0)
      const unionBaru =
        poliDenganDaftar.length > 0
          ? new Set(poliDenganDaftar.flatMap((id) => poliProfesiMap[id] ?? []).map((n) => n.toLowerCase()))
          : null

      const masihValid =
        !prev.profesi || !unionBaru || unionBaru.size === 0 || unionBaru.has(prev.profesi.toLowerCase())

      return { ...prev, poli_ids: poliIdsBaru, profesi: masihValid ? prev.profesi : '' }
    })
  }

  function bukaTambah() {
    setEditingId(null)
    setForm({ nama_lengkap: '', email: '', password: '', poli_ids: [], profesi: '' })
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
      poli_ids: (staf.polis ?? []).map((p) => p.id),
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
    if (form.profesi && profesiDibatasi && !pilihanProfesi.some((n) => n.toLowerCase() === form.profesi.toLowerCase())) {
      next.profesi = 'Profesi tidak diizinkan di poli yang dipilih'
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
          poli_ids: form.poli_ids,
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
          poli_ids: form.poli_ids,
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
    setForm({ nama_lengkap: '', email: '', password: '', poli_ids: [], profesi: '' })
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
                  <td className="py-2.5 pr-4">
                    {s.polis && s.polis.length > 0 ? s.polis.map((p) => p.nama_poli).join(', ') : '—'}
                  </td>
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
            className="relative w-full max-w-md rounded-xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
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

            <Field label="Poli (bisa lebih dari satu, opsional)">
              <div
                className="flex flex-col gap-1 max-h-40 overflow-y-auto rounded-lg p-2"
                style={{ border: '1px solid var(--line)' }}
              >
                {poliOptions.length === 0 && (
                  <p className="text-xs px-1 py-1" style={{ color: 'var(--muted)' }}>Belum ada poli terdaftar.</p>
                )}
                {poliOptions.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-1 py-1.5 rounded-md text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.poli_ids.includes(p.id)}
                      onChange={() => handlePoliToggle(p.id)}
                    />
                    <span>{p.nama_poli}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field
              label={profesiDibatasi ? 'Profesi (sesuai ketentuan poli terpilih)' : 'Profesi (opsional)'}
              error={errors.profesi}
            >
              <select
                value={form.profesi}
                onChange={(e) => updateField('profesi', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--line)' }}
              >
                <option value="">— Belum ditentukan —</option>
                {/* Pertahankan profesi lama staf agar tidak hilang saat edit */}
                {form.profesi && !pilihanProfesi.some((n) => n.toLowerCase() === form.profesi.toLowerCase()) && (
                  <option value={form.profesi}>{form.profesi} (di luar daftar poli)</option>
                )}
                {pilihanProfesi.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {form.poli_ids.length > 0 && !profesiDibatasi && (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  Poli yang dipilih belum punya daftar profesi, jadi semua profesi bisa dipilih. Atur di tab Daftar Poli.
                </span>
              )}
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
// POLI SECTION (tidak berubah dari versi sebelumnya)
// =========================================================
function PoliSection({ instansiId }) {
  const { profesiList, tambahProfesiBaru } = useProfesiList()

  const [poliList, setPoliList] = useState([])
  const [poliProfesiMap, setPoliProfesiMap] = useState({}) // { poli_id: [{id, nama}] }
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [newNama, setNewNama] = useState('')
  const [newProfesiIds, setNewProfesiIds] = useState([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit profesi poli yang sudah ada
  const [editingPoliId, setEditingPoliId] = useState(null)
  const [editProfesiIds, setEditProfesiIds] = useState([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

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
      setLoading(false)
      return
    }
    const list = data ?? []
    setPoliList(list)

    if (list.length > 0) {
      const { data: rel, error: relErr } = await supabase
        .from('poli_profesi')
        .select('poli_id, profesi_id, profesi_nakes ( id, nama )')
        .in('poli_id', list.map((p) => p.id))

      if (relErr) {
        setListError('Gagal memuat profesi poli: ' + relErr.message)
      } else {
        const map = {}
        for (const r of rel ?? []) {
          if (!r.profesi_nakes) continue
          if (!map[r.poli_id]) map[r.poli_id] = []
          map[r.poli_id].push({ id: r.profesi_nakes.id, nama: r.profesi_nakes.nama })
        }
        setPoliProfesiMap(map)
      }
    } else {
      setPoliProfesiMap({})
    }
    setLoading(false)
  }

  // Dipanggil dari opsi "Lainnya": simpan profesi baru lalu otomatis ikut terpilih
  async function handleProfesiBaru(nama, setIds) {
    const result = await tambahProfesiBaru(nama)
    if (result.error) return result
    setIds((prev) => (prev.includes(result.data.id) ? prev : [...prev, result.data.id]))
    return {}
  }

  async function handleAdd(e) {
    e.preventDefault()
    setAddError('')
    if (!newNama.trim()) {
      setAddError('Nama poli wajib diisi.')
      return
    }
    if (newProfesiIds.length === 0) {
      setAddError('Pilih minimal satu profesi yang boleh bekerja di poli ini.')
      return
    }

    setAdding(true)
    const { data: poliBaru, error } = await supabase
      .from('polis')
      .insert({ instansi_id: instansiId, nama_poli: newNama.trim() })
      .select('id')
      .single()

    if (error || !poliBaru) {
      setAdding(false)
      setAddError(error?.message ?? 'Gagal menyimpan poli.')
      return
    }

    const { error: relError } = await supabase
      .from('poli_profesi')
      .insert(newProfesiIds.map((profesi_id) => ({ poli_id: poliBaru.id, profesi_id })))

    if (relError) {
      // Rollback: hapus poli agar tidak ada poli tanpa profesi karena gagal simpan
      await supabase.from('polis').delete().eq('id', poliBaru.id)
      setAdding(false)
      setAddError('Gagal menyimpan profesi poli: ' + relError.message)
      return
    }

    setAdding(false)
    setNewNama('')
    setNewProfesiIds([])
    fetchPoli()
  }

  function mulaiEditProfesi(poli) {
    setEditingPoliId(poli.id)
    setEditProfesiIds((poliProfesiMap[poli.id] ?? []).map((p) => p.id))
    setEditError('')
  }

  function batalEdit() {
    setEditingPoliId(null)
    setEditProfesiIds([])
    setEditError('')
  }

  async function simpanEditProfesi(poliId) {
    setEditError('')
    if (editProfesiIds.length === 0) {
      setEditError('Pilih minimal satu profesi.')
      return
    }
    setSavingEdit(true)

    const lama = (poliProfesiMap[poliId] ?? []).map((p) => p.id)
    const hapus = lama.filter((id) => !editProfesiIds.includes(id))
    const tambah = editProfesiIds.filter((id) => !lama.includes(id))

    if (tambah.length > 0) {
      const { error } = await supabase
        .from('poli_profesi')
        .insert(tambah.map((profesi_id) => ({ poli_id: poliId, profesi_id })))
      if (error) {
        setSavingEdit(false)
        setEditError('Gagal menambah profesi: ' + error.message)
        return
      }
    }
    if (hapus.length > 0) {
      const { error } = await supabase
        .from('poli_profesi')
        .delete()
        .eq('poli_id', poliId)
        .in('profesi_id', hapus)
      if (error) {
        setSavingEdit(false)
        setEditError('Gagal menghapus profesi: ' + error.message)
        return
      }
    }

    setSavingEdit(false)
    batalEdit()
    fetchPoli()
  }

  async function handleDelete(id) {
    if (!confirm('Hapus poli ini? Staf yang terhubung ke poli ini akan kehilangan penempatan polinya.')) return
    // Hapus relasi profesi dulu supaya tidak terhalang foreign key
    await supabase.from('poli_profesi').delete().eq('poli_id', id)
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

      <form onSubmit={handleAdd} className="flex flex-col gap-3 mb-5">
        <input
          type="text"
          placeholder="Nama poli baru (mis. Poli KIA)"
          value={newNama}
          onChange={(e) => setNewNama(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ border: '1px solid var(--line)' }}
        />

        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
            Profesi yang boleh bekerja di poli ini (bisa lebih dari satu)
          </p>
          <ProfesiMultiSelect
            options={profesiList}
            selectedIds={newProfesiIds}
            onChange={setNewProfesiIds}
            onProfesiBaru={(nama) => handleProfesiBaru(nama, setNewProfesiIds)}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={adding}
            className="text-sm font-semibold px-4 py-2 rounded-lg"
            style={{ background: 'var(--accent)', color: '#fff', opacity: adding ? 0.6 : 1 }}
          >
            {adding ? 'Menyimpan…' : 'Tambah Poli'}
          </button>
        </div>
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
          {poliList.map((p) => {
            const profesiPoli = poliProfesiMap[p.id] ?? []
            const sedangEdit = editingPoliId === p.id
            return (
              <div
                key={p.id}
                className="flex flex-col gap-2 px-3 py-2.5 rounded-lg"
                style={{ border: '1px solid var(--line)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{p.nama_poli}</span>
                    {!sedangEdit && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        {profesiPoli.length > 0
                          ? 'Profesi: ' + profesiPoli.map((x) => x.nama).join(', ')
                          : 'Belum ada profesi terpasang (semua profesi bisa dipilih untuk staf)'}
                      </p>
                    )}
                  </div>
                  {!sedangEdit && (
                    <div className="flex gap-3 shrink-0">
                      <button
                        onClick={() => mulaiEditProfesi(p)}
                        className="text-xs font-medium"
                        style={{ color: 'var(--accent)' }}
                      >
                        Atur Profesi
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-xs font-medium"
                        style={{ color: '#B91C1C' }}
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </div>

                {sedangEdit && (
                  <div className="flex flex-col gap-2">
                    <ProfesiMultiSelect
                      options={profesiList}
                      selectedIds={editProfesiIds}
                      onChange={setEditProfesiIds}
                      onProfesiBaru={(nama) => handleProfesiBaru(nama, setEditProfesiIds)}
                    />
                    {editError && <p className="text-xs" style={{ color: '#B91C1C' }}>{editError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => simpanEditProfesi(p.id)}
                        disabled={savingEdit}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--accent)', color: '#fff', opacity: savingEdit ? 0.6 : 1 }}
                      >
                        {savingEdit ? 'Menyimpan…' : 'Simpan'}
                      </button>
                      <button
                        onClick={batalEdit}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg"
                        style={{ border: '1px solid var(--line)' }}
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// =========================================================
// PROFESI MULTI SELECT (dropdown multi-pilih + opsi "Lainnya")
// =========================================================
function ProfesiMultiSelect({ options, selectedIds, onChange, onProfesiBaru, disabled }) {
  const [open, setOpen] = useState(false)
  const [lainnyaOpen, setLainnyaOpen] = useState(false)
  const [namaBaru, setNamaBaru] = useState('')
  const [savingBaru, setSavingBaru] = useState(false)
  const [errBaru, setErrBaru] = useState('')

  function toggle(id) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id))
    else onChange([...selectedIds, id])
  }

  async function simpanProfesiBaru() {
    setErrBaru('')
    const nama = namaBaru.trim().toLowerCase()
    if (!nama) {
      setErrBaru('Nama profesi wajib diisi.')
      return
    }
    setSavingBaru(true)
    const result = await onProfesiBaru(nama)
    setSavingBaru(false)
    if (result?.error) {
      setErrBaru(result.error)
      return
    }
    setNamaBaru('')
    setLainnyaOpen(false)
  }

  const terpilih = options.filter((o) => selectedIds.includes(o.id))

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 rounded-lg text-sm text-left flex items-center justify-between gap-2"
        style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
      >
        <span className="truncate" style={{ color: terpilih.length ? 'var(--ink)' : 'var(--muted)' }}>
          {terpilih.length ? terpilih.map((o) => o.nama).join(', ') : 'Pilih profesi yang boleh bekerja di poli ini'}
        </span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="mt-1 rounded-lg p-2 flex flex-col gap-1 max-h-64 overflow-y-auto"
          style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
        >
          {options.length === 0 && (
            <p className="text-xs px-2 py-1" style={{ color: 'var(--muted)' }}>Belum ada profesi.</p>
          )}
          {options.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(o.id)}
                onChange={() => toggle(o.id)}
              />
              <span>{o.nama}</span>
            </label>
          ))}

          <div className="mt-1 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            {!lainnyaOpen ? (
              <button
                type="button"
                onClick={() => setLainnyaOpen(true)}
                className="text-xs font-semibold px-2 py-1"
                style={{ color: 'var(--accent)' }}
              >
                + Lainnya (tambah profesi baru)
              </button>
            ) : (
              <div className="flex flex-col gap-2 px-1">
                <input
                  type="text"
                  autoFocus
                  placeholder="Nama profesi baru (mis. fisioterapis)"
                  value={namaBaru}
                  onChange={(e) => setNamaBaru(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      simpanProfesiBaru()
                    }
                  }}
                  className="w-full px-3 py-1.5 rounded-lg text-sm"
                  style={{ border: '1px solid var(--line)' }}
                />
                {errBaru && <p className="text-xs" style={{ color: '#B91C1C' }}>{errBaru}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={simpanProfesiBaru}
                    disabled={savingBaru}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--accent)', color: '#fff', opacity: savingBaru ? 0.6 : 1 }}
                  >
                    {savingBaru ? 'Menyimpan…' : 'Simpan & pilih'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLainnyaOpen(false)
                      setNamaBaru('')
                      setErrBaru('')
                    }}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// =========================================================
// HOOK: daftar profesi (dipakai PoliSection)
// =========================================================
function useProfesiList() {
  const [profesiList, setProfesiList] = useState([])

  async function fetchProfesi() {
    const { data, error } = await supabase
      .from('profesi_nakes')
      .select('id, nama')
      .order('nama', { ascending: true })
    if (!error) setProfesiList(data ?? [])
  }

  useEffect(() => {
    fetchProfesi()
  }, [])

  // Tambah profesi baru dari opsi "Lainnya". Jika sudah ada (nama sama), pakai yang ada.
  async function tambahProfesiBaru(namaLower) {
    const sudahAda = profesiList.find((p) => p.nama.toLowerCase() === namaLower)
    if (sudahAda) return { data: sudahAda }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('profesi_nakes')
      .insert({ nama: namaLower, created_by: user?.id ?? null })
      .select('id, nama')
      .single()

    if (error) {
      // Bentrok unik (baru dibuat orang lain) -> ambil yang sudah ada
      const { data: existing } = await supabase
        .from('profesi_nakes')
        .select('id, nama')
        .ilike('nama', namaLower)
        .maybeSingle()
      if (existing) {
        await fetchProfesi()
        return { data: existing }
      }
      return { error: 'Gagal menyimpan profesi: ' + error.message }
    }
    await fetchProfesi()
    return { data }
  }

  return { profesiList, tambahProfesiBaru }
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