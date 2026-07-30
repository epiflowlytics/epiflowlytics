import { useEffect, useState } from 'react'
import PageSkeleton from './PageSkeleton'
import { supabase } from '../../lib/supabaseClient'

export default function KelolaInstansi() {
  const [instansiList, setInstansiList] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [nama, setNama] = useState('')
  const [namaError, setNamaError] = useState('')

  useEffect(() => {
    fetchInstansiList()
  }, [])

  async function fetchInstansiList() {
    setLoadingList(true)
    setListError('')

    const { data, error } = await supabase
      .from('instansis')
      .select('id, nama, created_at')
      .order('nama', { ascending: true })

    if (error) {
      setListError('Gagal memuat daftar instansi: ' + error.message)
      setInstansiList([])
    } else {
      setInstansiList(data ?? [])
    }
    setLoadingList(false)
  }

  function validate() {
    if (!nama.trim()) return 'Nama instansi wajib diisi'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')

    const err = validate()
    setNamaError(err)
    if (err) return

    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-instansi', {
        body: { nama },
      })

      if (error || data?.error) {
        setSubmitError(data?.error || error?.message || 'Gagal membuat instansi.')
        setSubmitting(false)
        return
      }

      await fetchInstansiList()

      setNama('')
      setNamaError('')
      setModalOpen(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Terjadi kesalahan tak terduga.')
    } finally {
      setSubmitting(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setNama('')
    setNamaError('')
    setSubmitError('')
  }

  return (
    <>
      <PageSkeleton
        title="Kelola Instansi"
        description="Tambahkan instansi (puskesmas) baru yang bisa dipilih saat membuat akun Admin Instansi."
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="text-sm font-semibold rounded-lg px-4 py-2 transition-opacity hover:opacity-90"
            style={{ background: 'var(--primary, #2563eb)', color: '#fff' }}
          >
            + Tambah Instansi
          </button>
        }
        sections={[
          {
            label: 'Daftar instansi',
            content: loadingList ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
                Memuat daftar instansi...
              </p>
            ) : listError ? (
              <p className="text-sm py-6 text-center" style={{ color: '#dc2626' }}>
                {listError}
              </p>
            ) : instansiList.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
                Belum ada instansi. Klik "+ Tambah Instansi" untuk menambahkan.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {instansiList.map((instansi) => (
                  <div
                    key={instansi.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  >
                    <p className="text-sm font-medium truncate">{instansi.nama}</p>
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
            <h2 className="text-lg font-bold mb-4">Tambah Instansi</h2>

            <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Nama Instansi</label>
                <input
                  type="text"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  autoComplete="off"
                  className="w-full h-9 rounded-lg px-3 text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  placeholder="Nama puskesmas/instansi"
                  disabled={submitting}
                />
                {namaError && (
                  <p className="text-xs mt-1" style={{ color: '#dc2626' }}>{namaError}</p>
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
                  {submitting ? 'Menyimpan...' : 'Tambah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
