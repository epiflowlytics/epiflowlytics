import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

/* ────────────────────────────────────────────────────────────────
   HALAMAN ADMIN — KELOLA TARIF RETRIBUSI
   Untuk pasien Umum / BPJS tidak aktif. Tarif dikelompokkan per
   "titik biaya": Loket (karcis pendaftaran) + tiap Poli yang ada.
   Setiap titik bisa punya banyak layanan dengan nominal berbeda,
   mis. Poli KB -> "Suntik KB" 20.000, "Konsultasi KB" 10.000, dst.

   CATATAN SKEMA (Supabase):
   create table tarif_retribusi (
     id uuid primary key default gen_random_uuid(),
     instansi_id uuid references instansi(id),
     jenis_titik text not null,               -- 'loket' | 'poli'
     poli_id uuid references polis(id),       -- null jika jenis_titik = 'loket'
     nama_layanan text not null,
     nominal numeric not null default 0,
     is_active boolean not null default true,
     updated_by uuid references auth.users(id),
     updated_at timestamptz not null default now(),
     created_at timestamptz not null default now()
   );

   Saat transaksi berjalan (loket/poli/lab menambah tagihan), SALIN
   nama_layanan & nominal ke tabel tagihan_kunjungan pada saat itu
   juga (snapshot) — supaya histori tidak berubah kalau tarif ini
   diedit di kemudian hari.
   ──────────────────────────────────────────────────────────────── */

const TITIK_LOKET = '__loket__' // pseudo id untuk grup "Loket"

export default function KelolaTarifRetribusi() {
  const { profile } = useAuth()
  const instansiId = profile?.instansi_id

  const [polis, setPolis] = useState([])
  const [tarifList, setTarifList] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [activeTitik, setActiveTitik] = useState(TITIK_LOKET)

  useEffect(() => {
    if (instansiId) {
      fetchPolis()
      fetchTarif()
    }
  }, [instansiId])

  async function fetchPolis() {
    const { data, error } = await supabase
      .from('polis')
      .select('id, nama_poli')
      .eq('instansi_id', instansiId)
      .order('nama_poli', { ascending: true })
    if (!error) setPolis(data ?? [])
  }

  async function fetchTarif() {
    setLoading(true)
    setListError('')
    const { data, error } = await supabase
      .from('tarif_retribusi')
      .select('id, jenis_titik, poli_id, nama_layanan, nominal, is_active, updated_at')
      .eq('instansi_id', instansiId)
      .order('nama_layanan', { ascending: true })

    if (error) {
      setListError('Gagal memuat data tarif: ' + error.message)
      setTarifList([])
    } else {
      setTarifList(data ?? [])
    }
    setLoading(false)
  }

  const daftarTitik = [
    { id: TITIK_LOKET, label: '🎫 Loket (Karcis Umum)' },
    ...polis.map((p) => ({ id: p.id, label: p.nama_poli })),
  ]

  const tarifTitikAktif =
    activeTitik === TITIK_LOKET
      ? tarifList.filter((t) => t.jenis_titik === 'loket')
      : tarifList.filter((t) => t.jenis_titik === 'poli' && t.poli_id === activeTitik)

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Kelola Tarif Retribusi</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Atur nominal retribusi untuk pasien Umum / BPJS tidak aktif. Nominal bisa berbeda tiap poli
        dan akan otomatis terakumulasi sesuai layanan yang diambil pasien (mis. Loket 15.000 + Poli
        KB 20.000 + Lab 25.000).
      </p>

      {listError && (
        <div
          className="rounded-lg p-3 mb-4 text-sm"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}
        >
          {listError}
        </div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {daftarTitik.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTitik(t.id)}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{
              background: activeTitik === t.id ? 'var(--accent-soft)' : 'transparent',
              color: activeTitik === t.id ? 'var(--accent)' : 'var(--ink)',
              border: '1px solid var(--line)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {polis.length === 0 && (
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          Belum ada poli terdaftar. Tambahkan poli terlebih dahulu di menu "Kelola Poli & Staf" agar
          bisa mengatur tarif per poli.
        </p>
      )}

      <TarifSection
        key={activeTitik}
        instansiId={instansiId}
        jenisTitik={activeTitik === TITIK_LOKET ? 'loket' : 'poli'}
        poliId={activeTitik === TITIK_LOKET ? null : activeTitik}
        judul={daftarTitik.find((t) => t.id === activeTitik)?.label ?? ''}
        tarifList={tarifTitikAktif}
        loading={loading}
        onRefresh={fetchTarif}
      />
    </div>
  )
}

function formatRupiah(angka) {
  const n = Number(angka) || 0
  return 'Rp ' + n.toLocaleString('id-ID')
}

function TarifSection({ instansiId, jenisTitik, poliId, judul, tarifList, loading, onRefresh }) {
  const [namaBaru, setNamaBaru] = useState('')
  const [nominalBaru, setNominalBaru] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editNama, setEditNama] = useState('')
  const [editNominal, setEditNominal] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  async function handleAdd(e) {
    e.preventDefault()
    setAddError('')

    if (!namaBaru.trim()) {
      setAddError('Nama layanan wajib diisi.')
      return
    }
    const nominalNum = Number(nominalBaru)
    if (nominalBaru === '' || isNaN(nominalNum) || nominalNum < 0) {
      setAddError('Nominal harus berupa angka dan tidak boleh negatif.')
      return
    }

    setAdding(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from('tarif_retribusi').insert({
      instansi_id: instansiId,
      jenis_titik: jenisTitik,
      poli_id: poliId,
      nama_layanan: namaBaru.trim(),
      nominal: nominalNum,
      is_active: true,
      updated_by: user?.id ?? null,
    })
    setAdding(false)

    if (error) {
      setAddError(error.message)
      return
    }
    setNamaBaru('')
    setNominalBaru('')
    onRefresh()
  }

  function startEdit(t) {
    setEditingId(t.id)
    setEditNama(t.nama_layanan)
    setEditNominal(String(t.nominal))
    setEditError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditNama('')
    setEditNominal('')
    setEditError('')
  }

  async function handleSaveEdit(id) {
    setEditError('')
    if (!editNama.trim()) {
      setEditError('Nama layanan wajib diisi.')
      return
    }
    const nominalNum = Number(editNominal)
    if (editNominal === '' || isNaN(nominalNum) || nominalNum < 0) {
      setEditError('Nominal harus berupa angka dan tidak boleh negatif.')
      return
    }

    setSavingEdit(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('tarif_retribusi')
      .update({
        nama_layanan: editNama.trim(),
        nominal: nominalNum,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    setSavingEdit(false)

    if (error) {
      setEditError(error.message)
      return
    }
    cancelEdit()
    onRefresh()
  }

  async function handleToggleActive(t) {
    const { error } = await supabase
      .from('tarif_retribusi')
      .update({ is_active: !t.is_active })
      .eq('id', t.id)
    if (error) {
      alert('Gagal mengubah status: ' + error.message)
      return
    }
    onRefresh()
  }

  async function handleDelete(id) {
    if (!confirm('Hapus layanan tarif ini? Riwayat transaksi lama tidak akan terpengaruh.')) return
    const { error } = await supabase.from('tarif_retribusi').delete().eq('id', id)
    if (error) {
      alert('Gagal menghapus: ' + error.message)
      return
    }
    onRefresh()
  }

  return (
    <div className="rounded-xl p-5 sm:p-6" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <p className="text-sm font-semibold mb-4">{judul}</p>

      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2 mb-5">
        <input
          type="text"
          placeholder="Nama layanan (mis. Suntik KB)"
          value={namaBaru}
          onChange={(e) => setNamaBaru(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{ border: '1px solid var(--line)' }}
        />
        <input
          type="number"
          min="0"
          step="500"
          placeholder="Nominal (Rp)"
          value={nominalBaru}
          onChange={(e) => setNominalBaru(e.target.value)}
          className="w-full sm:w-40 px-3 py-2 rounded-lg text-sm"
          style={{ border: '1px solid var(--line)' }}
        />
        <button
          type="submit"
          disabled={adding}
          className="text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap"
          style={{ background: 'var(--accent)', color: '#fff', opacity: adding ? 0.6 : 1 }}
        >
          {adding ? 'Menyimpan…' : 'Tambah Layanan'}
        </button>
      </form>

      {addError && (
        <div
          className="rounded-lg p-3 mb-4 text-sm"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}
        >
          {addError}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
          ))}
        </div>
      ) : tarifList.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Belum ada layanan tarif untuk titik ini. Tambahkan layanan pertama di atas.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {tarifList.map((t) => (
            <div
              key={t.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 rounded-lg"
              style={{
                border: '1px solid var(--line)',
                opacity: t.is_active ? 1 : 0.5,
              }}
            >
              {editingId === t.id ? (
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={editNama}
                      onChange={(e) => setEditNama(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg text-sm"
                      style={{ border: '1px solid var(--line)' }}
                    />
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={editNominal}
                      onChange={(e) => setEditNominal(e.target.value)}
                      className="w-full sm:w-36 px-3 py-1.5 rounded-lg text-sm"
                      style={{ border: '1px solid var(--line)' }}
                    />
                  </div>
                  {editError && <p className="text-xs" style={{ color: '#B91C1C' }}>{editError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(t.id)}
                      disabled={savingEdit}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                      style={{ background: 'var(--accent)', color: '#fff', opacity: savingEdit ? 0.6 : 1 }}
                    >
                      {savingEdit ? 'Menyimpan…' : 'Simpan'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg"
                      style={{ border: '1px solid var(--line)' }}
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium">{t.nama_layanan}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {formatRupiah(t.nominal)}
                      {!t.is_active && ' · nonaktif'}
                    </p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button
                      onClick={() => startEdit(t)}
                      className="text-xs font-medium"
                      style={{ color: 'var(--accent)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(t)}
                      className="text-xs font-medium"
                      style={{ color: 'var(--muted)' }}
                    >
                      {t.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-xs font-medium"
                      style={{ color: '#B91C1C' }}
                    >
                      Hapus
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
