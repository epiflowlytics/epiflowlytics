import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'

/* ────────────────────────────────────────────────────────────────
   HALAMAN PUBLIK — STATUS ANTRIAN (dibuka via scan QR di CekAntrian)
   Route: /status-antrian/:id   (id = kunjungan.id, UUID)
   Tidak butuh login. Pastikan RLS Supabase mengizinkan SELECT publik
   (anon) pada tabel `kunjungan` (+ join pasien, polis) terbatas pada
   kolom yang dipakai di sini, atau gunakan VIEW/RPC khusus agar data
   sensitif pasien lain tidak ikut ter-expose.

   Sebelumnya halaman ini BELUM ADA sama sekali di project & belum
   terdaftar di App.jsx, sehingga QR yang di-generate dari
   CekAntrian.jsx mengarah ke route kosong (blank) saat di-scan.
   Daftarkan route ini di App.jsx (lihat catatan di bawah file).
   ──────────────────────────────────────────────────────────────── */

export default function StatusAntrian() {
  const { id } = useParams()

  const [kunjungan, setKunjungan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let channel

    async function init() {
      if (!id) {
        setErrorMsg('Tautan tidak valid.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMsg('')
      await fetchKunjungan()
      setLoading(false)

      channel = supabase
        .channel(`status-antrian-${id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'kunjungan',
            filter: `id=eq.${id}`,
          },
          (payload) => {
            setKunjungan((prev) => ({ ...prev, ...payload.new }))
          }
        )
        .subscribe()
    }

    async function fetchKunjungan() {
      const { data, error } = await supabase
        .from('kunjungan')
        .select(
          `
          id,
          nomor_antrian,
          status,
          status_panggil,
          kategori_pasien,
          tanggal_periksa,
          pasien:pasien_id ( nama_lengkap ),
          polis:poli_id ( nama_poli )
        `
        )
        .eq('id', id)
        .single()

      if (error || !data) {
        setErrorMsg('Data antrian tidak ditemukan. Pastikan QR masih berlaku.')
        return
      }

      setKunjungan(data)
    }

    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [id])

  function statusLabel(status) {
    const map = {
      menunggu: 'Menunggu',
      dipanggil: 'Dipanggil — Silakan menuju loket/poli',
      selesai: 'Selesai',
      batal: 'Dibatalkan',
    }
    return map[status] || status || '-'
  }

  function statusColor(status) {
    const map = {
      menunggu: '#b45309',
      dipanggil: '#15803d',
      selesai: '#334155',
      batal: '#b91c1c',
    }
    return map[status] || 'var(--muted)'
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 text-center"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 1px 2px rgba(18,24,27,0.04), 0 8px 24px rgba(18,24,27,0.08)',
        }}
      >
        <p className="text-sm font-extrabold tracking-tight leading-none mb-6">
          <span style={{ color: 'var(--accent)' }}>Epiflow</span>
          <span style={{ color: 'var(--muted)' }}>lytics</span>
        </p>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Memuat status antrian...
          </p>
        ) : errorMsg ? (
          <p className="text-sm" style={{ color: '#b91c1c' }}>
            {errorMsg}
          </p>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>
              Nomor Antrian
            </p>
            <p className="text-6xl font-bold tabular-nums mb-4">
              {kunjungan.nomor_antrian ?? '-'}
            </p>

            <p className="text-base font-semibold mb-1">
              {kunjungan.pasien?.nama_lengkap || '-'}
            </p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              {kunjungan.polis?.nama_poli || '-'}
            </p>

            <div
              className="inline-block px-4 py-2 rounded-lg text-sm font-semibold"
              style={{
                background: 'var(--bg)',
                border: `1px solid ${statusColor(kunjungan.status_panggil || kunjungan.status)}`,
                color: statusColor(kunjungan.status_panggil || kunjungan.status),
              }}
            >
              {statusLabel(kunjungan.status_panggil || kunjungan.status)}
            </div>

            <p className="text-xs mt-6" style={{ color: 'var(--muted)' }}>
              Halaman ini otomatis diperbarui — tidak perlu di-refresh.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   CARA DAFTARKAN ROUTE DI App.jsx:

   1. Import di bagian atas App.jsx (sesuaikan path sesuai lokasi
      file ini disimpan, contoh jika ditaruh di pages/nakes/loket):

        import StatusAntrian from './pages/nakes/loket/StatusAntrian'

   2. Tambahkan <Route> PUBLIK (di luar ProtectedRoute), boleh
      diletakkan dekat route publik lain seperti /puskesmas/:kode:

        <Route path="/status-antrian/:id" element={<StatusAntrian />} />

   Setelah itu, value QR di CekAntrian.jsx
   (`${window.location.origin}/status-antrian/${qrTarget.id}`)
   akan cocok dengan route ini.
   ──────────────────────────────────────────────────────────────── */
