import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../../../lib/supabaseClient'

// ─────────────────────────────────────────────────────────────
// Cek Antrian
// Menampilkan tabel kunjungan hari ini (realtime), dengan tombol
// "Generate QR" di setiap baris untuk memunculkan modal QR code
// yang mengarah ke halaman status publik pasien.
// Palet warna mengikuti tema Login (CSS variables).
// ─────────────────────────────────────────────────────────────
export default function CekAntrian() {
  const [kunjungan, setKunjungan] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [qrTarget, setQrTarget] = useState(null) // baris kunjungan yg lagi ditampilkan QR-nya

  useEffect(() => {
    let channel

    async function init() {
      setLoading(true)
      setErrorMsg('')

      // Ambil instansi_id user yang sedang login (pola sama seperti DashboardLoket.jsx)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setErrorMsg('Sesi tidak ditemukan, silakan login ulang.')
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('instansi_id')
        .eq('id', user.id)
        .single()

      if (profileError || !profile) {
        setErrorMsg('Gagal memuat data instansi.')
        setLoading(false)
        return
      }

      const instansiId = profile.instansi_id
      const todayStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

      await fetchKunjungan(instansiId, todayStr)
      setLoading(false)

      // Subscribe realtime ke tabel kunjungan untuk instansi ini
      channel = supabase
        .channel('cek-antrian-kunjungan')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'kunjungan',
            filter: `instansi_id=eq.${instansiId}`,
          },
          () => {
            fetchKunjungan(instansiId, todayStr)
          }
        )
        .subscribe()
    }

    async function fetchKunjungan(instansiId, todayStr) {
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
          pasien:pasien_id ( no_rekam_medis, nama_lengkap ),
          polis:poli_id ( nama_poli )
        `
        )
        .eq('instansi_id', instansiId)
        .eq('tanggal_periksa', todayStr)
        .order('nomor_antrian', { ascending: true })

      if (error) {
        setErrorMsg('Gagal memuat data kunjungan.')
        return
      }

      setKunjungan(data || [])
    }

    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  function statusLabel(status) {
    const map = {
      menunggu: 'Menunggu',
      dipanggil: 'Dipanggil',
      selesai: 'Selesai',
      batal: 'Batal',
    }
    return map[status] || status || '-'
  }

  return (
    <div
      className="min-h-screen p-8"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div className="mb-8 text-center mt-4">
        <p className="text-sm font-extrabold tracking-tight leading-none">
          <span style={{ color: 'var(--accent)' }}>Epiflow</span>
          <span style={{ color: 'var(--muted)' }}>lytics</span>
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
          Cek Antrian
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
          Daftar kunjungan hari ini — update otomatis secara realtime
        </p>
      </div>

      <div
        className="w-full max-w-5xl mx-auto rounded-2xl overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 1px 2px rgba(18,24,27,0.04), 0 8px 24px rgba(18,24,27,0.08)',
        }}
      >
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Memuat data...
          </div>
        ) : errorMsg ? (
          <div className="p-8 text-center text-sm" style={{ color: '#b91c1c' }}>
            {errorMsg}
          </div>
        ) : kunjungan.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Belum ada kunjungan hari ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--muted)' }}>No. RM</th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--muted)' }}>Nama</th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--muted)' }}>Poli</th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--muted)' }}>Kategori</th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--muted)' }}>Nomor Antrian</th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--muted)' }}>Status</th>
                  <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--muted)' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {kunjungan.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="px-4 py-3">{row.pasien?.no_rekam_medis || '-'}</td>
                    <td className="px-4 py-3">{row.pasien?.nama_lengkap || '-'}</td>
                    <td className="px-4 py-3">{row.polis?.nama_poli || '-'}</td>
                    <td className="px-4 py-3">{row.kategori_pasien || '-'}</td>
                    <td className="px-4 py-3 font-semibold">{row.nomor_antrian ?? '-'}</td>
                    <td className="px-4 py-3">{statusLabel(row.status_panggil || row.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setQrTarget(row)}
                        className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition"
                        style={{ background: 'var(--accent)' }}
                      >
                        Generate QR
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {qrTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: 'rgba(18,24,27,0.5)' }}
          onClick={() => setQrTarget(null)}
        >
          <div
            className="rounded-2xl p-6 max-w-xs w-full text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-1">{qrTarget.pasien?.nama_lengkap || '-'}</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              No. Antrian: <strong>{qrTarget.nomor_antrian ?? '-'}</strong>
            </p>

            <div className="flex justify-center mb-4">
              <QRCodeSVG
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/status-antrian/${qrTarget.id}`}
                size={200}
              />
            </div>

            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Scan QR ini untuk memantau status antrian dari HP Anda
            </p>

            <button
              onClick={() => setQrTarget(null)}
              className="w-full py-2 rounded-lg text-sm font-semibold border transition"
              style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}