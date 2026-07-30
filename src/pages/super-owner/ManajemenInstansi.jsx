import { useEffect, useState } from 'react'
import PageSkeleton from './PageSkeleton'
import { supabase } from '../../lib/supabaseClient'

export default function ManajemenInstansi() {
  const [instansiList, setInstansiList] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [search, setSearch] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nama: '', jenis: '', kota: '', alamat: '', telepon: '' })
  const [formError, setFormError] = useState('')

  async function fetchInstansi() {
    setLoading(true)
    setErrorMsg('')
    const { data, error } = await supabase
      .from('instansis')
      .select('*')
      .order('nama', { ascending: true })

    if (error) {
      setErrorMsg('Gagal memuat data instansi: ' + error.message)
      setInstansiList([])
    } else {
      setInstansiList(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchInstansi()
  }, [])

  const filteredList = instansiList.filter((item) =>
    item.nama?.toLowerCase().includes(search.toLowerCase())
  )

  function openModal() {
    setForm({ nama: '', jenis: '', kota: '', alamat: '', telepon: '' })
    setFormError('')
    setShowModal(true)
  }

  function closeModal() {
    if (saving) return
    setShowModal(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (!form.nama.trim()) {
      setFormError('Nama instansi wajib diisi.')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('instansis').insert([
      {
        nama: form.nama.trim(),
        jenis: form.jenis.trim(),
        kota: form.kota.trim(),
        alamat: form.alamat.trim(),
        telepon: form.telepon.trim(),
        aktif: true,
      },
    ])
    setSaving(false)

    if (error) {
      setFormError('Gagal menyimpan instansi: ' + error.message)
      return
    }

    setShowModal(false)
    fetchInstansi()
  }

  return (
    <>
      <PageSkeleton
        title="Manajemen Instansi"
        description="Daftar seluruh fasilitas kesehatan terdaftar — tambah, edit, atau nonaktifkan instansi."
        actions={
          <button
            onClick={openModal}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--primary, #2563eb)', color: '#fff' }}
          >
            + Tambah Instansi
          </button>
        }
        sections={[
          {
            label: 'Filter & pencarian',
            content: (
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari instansi berdasarkan nama..."
                className="w-full h-9 px-3 rounded-lg text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
              />
            ),
          },
          {
            label: 'Daftar instansi',
            content: (
              <div className="flex flex-col gap-2">
                {loading && (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    Memuat data...
                  </p>
                )}

                {!loading && errorMsg && (
                  <p className="text-sm" style={{ color: '#dc2626' }}>
                    {errorMsg}
                  </p>
                )}

                {!loading && !errorMsg && filteredList.length === 0 && (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    {instansiList.length === 0
                      ? 'Belum ada instansi terdaftar. Klik "+ Tambah Instansi" untuk menambahkan.'
                      : 'Tidak ada instansi yang cocok dengan pencarian.'}
                  </p>
                )}

                {!loading &&
                  !errorMsg &&
                  filteredList.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg"
                      style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.nama}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                          {item.jenis} · {item.kota} · {item.telepon}
                        </p>
                      </div>
                      <span
                        className="text-xs flex-shrink-0 px-2 py-1 rounded-md"
                        style={{
                          background: item.aktif ? '#dcfce7' : '#fee2e2',
                          color: item.aktif ? '#166534' : '#991b1b',
                        }}
                      >
                        {item.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                  ))}
              </div>
            ),
          },
        ]}
      />

      {showModal && (
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
            <h2 className="text-lg font-bold mb-4">Tambah Instansi</h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1">Nama Instansi</label>
                <input
                  type="text"
                  value={form.nama}
                  onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  placeholder="cth. Puskesmas Panakkukang"
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">Jenis Fasilitas</label>
                <input
                  type="text"
                  value={form.jenis}
                  onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  placeholder="cth. Puskesmas"
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">Kota</label>
                <input
                  type="text"
                  value={form.kota}
                  onChange={(e) => setForm((f) => ({ ...f, kota: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  placeholder="cth. Gowa"
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">Alamat</label>
                <input
                  type="text"
                  value={form.alamat}
                  onChange={(e) => setForm((f) => ({ ...f, alamat: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  placeholder="cth. Desa Batumalonro, Kec. Biringbulu"
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">Telepon</label>
                <input
                  type="text"
                  value={form.telepon}
                  onChange={(e) => setForm((f) => ({ ...f, telepon: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  placeholder="cth. 0852xxxxxxx"
                />
              </div>

              {formError && (
                <p className="text-sm" style={{ color: '#dc2626' }}>
                  {formError}
                </p>
              )}

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="flex-1 h-9 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-9 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--primary, #2563eb)', color: '#fff' }}
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}