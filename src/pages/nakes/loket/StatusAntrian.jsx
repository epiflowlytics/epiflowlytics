import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'

/* ────────────────────────────────────────────────────────────────
   HALAMAN PUBLIK — STATUS ANTRIAN (dibuka via scan QR di CekAntrian)
   Route: /status-antrian/:id   (id = kunjungan.id, UUID)
   Tidak butuh login.

   Data diambil dari VIEW `public.status_antrian_publik` (bukan tabel
   `kunjungan` langsung), yang hanya expose kolom non-sensitif
   (nomor antrian, status, nama pasien, nama poli) — TIDAK termasuk
   data medis (anamnesa, diagnosa, therapy, icd_x, dst). Role anon
   diberi akses SELECT ke VIEW ini saja, bukan ke tabel aslinya.

   Update status memakai polling tiap 5 detik (bukan Supabase
   Realtime), karena Realtime Postgres Changes tidak bisa dibatasi
   lewat VIEW — hanya lewat tabel asli, yang RLS-nya sengaja tidak
   dibuka untuk anon supaya data medis tetap aman.

   Halaman juga menampilkan ringkasan per poli (hari yang sama):
   nomor yang sedang dilayani (status_panggil = 'dipanggil' dengan
   waktu_panggil terbaru) dan total antrian hari ini.
   ──────────────────────────────────────────────────────────────── */

export default function StatusAntrian() {
  const { id } = useParams()

  const [kunjungan, setKunjungan] = useState(null)
  const [ringkasan, setRingkasan] = useState({ sedangDilayani: null, totalHariIni: null })
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let intervalId

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

      // Polling berkala (bukan Realtime) supaya kita hanya perlu membuka akses
      // publik lewat VIEW terbatas `status_antrian_publik`, tanpa perlu memberi
      // izin SELECT langsung ke tabel `kunjungan` (yang berisi data medis) untuk
      // role anon — Realtime Postgres Changes tidak bisa dibatasi lewat VIEW.
      intervalId = setInterval(fetchKunjungan, 5000)
    }

    async function fetchKunjungan() {
      const { data, error } = await supabase
        .from('status_antrian_publik')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        setErrorMsg('Data antrian tidak ditemukan. Pastikan QR masih berlaku.')
        return
      }

      setKunjungan({
        ...data,
        pasien: { nama_lengkap: data.nama_lengkap },
        polis: { nama_poli: data.nama_poli },
      })

      await fetchRingkasan(data.poli_id, data.tanggal_periksa)
    }

    async function fetchRingkasan(poliId, tanggal) {
      if (!poliId || !tanggal) return

      // Nomor yang sedang dilayani: baris dengan status_panggil 'dipanggil'
      // di poli & tanggal yang sama, ambil yang waktu_panggil-nya paling baru.
      const { data: dipanggilData } = await supabase
        .from('status_antrian_publik')
        .select('nomor_antrian, waktu_panggil')
        .eq('poli_id', poliId)
        .eq('tanggal_periksa', tanggal)
        .eq('status_panggil', 'dipanggil')
        .order('waktu_panggil', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Total antrian hari ini di poli yang sama.
      const { count } = await supabase
        .from('status_antrian_publik')
        .select('id', { count: 'exact', head: true })
        .eq('poli_id', poliId)
        .eq('tanggal_periksa', tanggal)

      setRingkasan({
        sedangDilayani: dipanggilData?.nomor_antrian ?? null,
        totalHariIni: count ?? null,
      })
    }

    init()

    return () => {
      if (intervalId) clearInterval(intervalId)
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
              className="inline-block px-4 py-2 rounded-lg text-sm font-semibold mb-4"
              style={{
                background: 'var(--bg)',
                border: `1px solid ${statusColor(kunjungan.status_panggil || kunjungan.status)}`,
                color: statusColor(kunjungan.status_panggil || kunjungan.status),
              }}
            >
              {statusLabel(kunjungan.status_panggil || kunjungan.status)}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg p-3" style={{ background: 'var(--bg)' }}>
                <p className="text-[11px] mb-1" style={{ color: 'var(--muted)' }}>
                  No. antrian sedang dilayani
                </p>
                <p className="text-xl font-semibold">
                  {ringkasan.sedangDilayani ?? '-'}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg)' }}>
                <p className="text-[11px] mb-1" style={{ color: 'var(--muted)' }}>
                  Total antrian hari ini
                </p>
                <p className="text-xl font-semibold">
                  {ringkasan.totalHariIni ?? '-'}
                </p>
              </div>
            </div>

            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Halaman ini otomatis diperbarui — tidak perlu di-refresh.
            </p>
          </>
        )}
      </div>
    </div>
  )
}