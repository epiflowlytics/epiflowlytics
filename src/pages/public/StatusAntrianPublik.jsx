import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

// ─────────────────────────────────────────────────────────────
// Status Antrian Publik
// Halaman TANPA login, diakses pasien lewat scan QR dari loket.
// Menampilkan status antrian kunjungan tertentu secara realtime.
// Route: /status-antrian/:id  (id = kunjungan.id)
// ─────────────────────────────────────────────────────────────
export default function StatusAntrianPublik() {
  const { id } = useParams()
  const [kunjungan, setKunjungan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let channel

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
          pasien:pasien_id ( nama_lengkap, no_rekam_medis ),
          polis:poli_id ( nama_poli )
        `
        )
        .eq('id', id)
        .single()

      if (error) {
        setErrorMsg('Data antrian tidak ditemukan.')
      } else {
        setKunjungan(data)
        setErrorMsg('')
      }
      setLoading(false)
    }

    fetchKunjungan()

    channel = supabase
      .channel(`status-antrian-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kunjungan',
          filter: `id=eq.${id}`,
        },
        () => {
          fetchKunjungan()
        }
      )
      .subscribe()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [id])

  function statusLabel(status) {
    const map = {
      menunggu: 'Menunggu',
      dipanggil: 'Sedang Dipanggil',
      selesai: 'Selesai',
      batal: 'Dibatalkan',
    }
    return map[status] || status || '-'
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
        <p className="text-sm font-extrabold tracking-tight leading-none mb-4">
          <span style={{ color: 'var(--accent)' }}>Epiflow</span>
          <span style={{ color: 'var(--muted)' }}>lytics</span>
        </p>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Memuat status...</p>
        ) : errorMsg ? (
          <p className="text-sm" style={{ color: '#b91c1c' }}>{errorMsg}</p>
        ) : (
          <>
            <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
              {kunjungan.pasien?.nama_lengkap} · No. RM {kunjungan.pasien?.no_rekam_medis}
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Poli {kunjungan.polis?.nama_poli}
            </p>

            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>
              Nomor Antrian
            </p>
            <p className="text-5xl font-bold mb-4" style={{ color: 'var(--accent)' }}>
              {kunjungan.nomor_antrian ?? '-'}
            </p>

            <p
              className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
            >
              {statusLabel(kunjungan.status_panggil || kunjungan.status)}
            </p>

            <p className="text-xs mt-4" style={{ color: 'var(--muted)' }}>
              Halaman ini akan otomatis update
            </p>
          </>
        )}
      </div>
    </div>
  )
}
