import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../../lib/supabaseClient'

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
      className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-10"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div
        className="w-full flex-1 md:flex-none rounded-3xl p-8 sm:p-16 text-center"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 1px 2px rgba(18,24,27,0.04), 0 8px 24px rgba(18,24,27,0.08)',
        }}
      >
        <p className="text-lg font-extrabold tracking-tight leading-none mb-8">
          <span style={{ color: 'var(--accent)' }}>Epiflow</span>
          <span style={{ color: 'var(--muted)' }}>lytics</span>
        </p>

        {loading ? (
          <p className="text-base" style={{ color: 'var(--muted)' }}>
            Memuat status antrian...
          </p>
        ) : errorMsg ? (
          <p className="text-base" style={{ color: '#b91c1c' }}>
            {errorMsg}
          </p>
        ) : (
          <>
            <p className="text-sm uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>
              Nomor Antrian
            </p>
            <p
              className="leading-none font-bold tabular-nums mb-6"
              style={{ fontSize: 'clamp(6rem, 20vw, 16rem)' }}
            >
              {kunjungan.nomor_antrian ?? '-'}
            </p>

            <p className="text-2xl font-semibold mb-1">
              {kunjungan.pasien?.nama_lengkap || '-'}
            </p>
            <p className="text-lg mb-6" style={{ color: 'var(--muted)' }}>
              {kunjungan.polis?.nama_poli || '-'}
            </p>

            <div
              className="inline-block px-6 py-3 rounded-xl text-lg font-semibold mb-6"
              style={{
                background: 'var(--bg)',
                border: `2px solid ${statusColor(kunjungan.status_panggil || kunjungan.status)}`,
                color: statusColor(kunjungan.status_panggil || kunjungan.status),
              }}
            >
              {statusLabel(kunjungan.status_panggil || kunjungan.status)}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-6 max-w-2xl mx-auto">
              <div className="rounded-xl p-5 sm:p-8" style={{ background: 'var(--bg)' }}>
                <p className="text-sm sm:text-base mb-2" style={{ color: 'var(--muted)' }}>
                  No. antrian sedang dilayani
                </p>
                <p className="text-4xl sm:text-5xl font-semibold">
                  {ringkasan.sedangDilayani ?? '-'}
                </p>
              </div>
              <div className="rounded-xl p-5 sm:p-8" style={{ background: 'var(--bg)' }}>
                <p className="text-sm sm:text-base mb-2" style={{ color: 'var(--muted)' }}>
                  Total antrian hari ini
                </p>
                <p className="text-4xl sm:text-5xl font-semibold">
                  {ringkasan.totalHariIni ?? '-'}
                </p>
              </div>
            </div>

            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Halaman ini otomatis diperbarui — tidak perlu di-refresh.
            </p>
          </>
        )}
      </div>
    </div>
  )
}