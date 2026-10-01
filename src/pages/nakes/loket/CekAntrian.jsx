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
  const [batalTarget, setBatalTarget] = useState(null) // baris kunjungan yg mau dibatalkan
  const [batalLoading, setBatalLoading] = useState(false)
  const [poliList, setPoliList] = useState([]) // daftar poli utk dropdown ganti poli
  const [gantiPoliTarget, setGantiPoliTarget] = useState(null) // baris kunjungan yg mau diganti poli
  const [selectedPoliId, setSelectedPoliId] = useState('')
  const [gantiPoliLoading, setGantiPoliLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    let channel
    let cancelled = false

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

      if (cancelled) return

      const instansiId = profile.instansi_id
      const todayStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

      await fetchKunjungan(instansiId, todayStr)
      await fetchPoliList(instansiId)
      if (cancelled) return
      setLoading(false)

      // Subscribe realtime ke tabel kunjungan untuk instansi ini.
      // Nama channel disertai timestamp supaya tidak bentrok kalau efek ini
      // sempat dijalankan lebih dari sekali (mis. React StrictMode di dev).
      channel = supabase
        .channel(`cek-antrian-kunjungan-${Date.now()}`)
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
          poli_id,
          pasien:pasien_id ( no_rekam_medis, nama_lengkap, no_bpjs ),
          polis:poli_id ( nama_poli )
        `
        )
        .eq('instansi_id', instansiId)
        .eq('tanggal_periksa', todayStr)
        .neq('status', 'batal')
        .order('nomor_antrian', { ascending: true })

      if (error) {
        setErrorMsg('Gagal memuat data kunjungan.')
        return
      }

      setKunjungan(data || [])
    }

    async function fetchPoliList(instansiId) {
      const { data, error } = await supabase
        .from('polis')
        .select('id, nama_poli')
        .eq('instansi_id', instansiId)
        .order('nama_poli', { ascending: true })

      if (error) return
      setPoliList(data || [])
    }

    init()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  async function handleBatalBerobat() {
    if (!batalTarget) return
    setBatalLoading(true)

    const { error } = await supabase
      .from('kunjungan')
      .update({ status: 'batal', status_panggil: 'batal' })
      .eq('id', batalTarget.id)

    setBatalLoading(false)

    if (error) {
      console.error('Gagal membatalkan kunjungan:', error.message, error)
      setErrorMsg(`Gagal membatalkan kunjungan: ${error.message}`)
      setBatalTarget(null)
      return
    }

    setBatalTarget(null)
  }

  async function handleGantiPoli() {
    if (!gantiPoliTarget || !selectedPoliId) return
    setGantiPoliLoading(true)

    const todayStr = new Date().toISOString().slice(0, 10)

    // Hitung nomor antrian baru di poli tujuan: jumlah kunjungan hari ini
    // di poli tujuan (instansi yg sama) + 1
    const { count, error: countError } = await supabase
      .from('kunjungan')
      .select('id', { count: 'exact', head: true })
      .eq('poli_id', selectedPoliId)
      .eq('tanggal_periksa', todayStr)

    if (countError) {
      setGantiPoliLoading(false)
      setErrorMsg('Gagal menghitung nomor antrian poli tujuan.')
      setGantiPoliTarget(null)
      setSelectedPoliId('')
      return
    }

    const nomorAntrianBaru = (count || 0) + 1

    const { error } = await supabase
      .from('kunjungan')
      .update({
        poli_id: selectedPoliId,
        nomor_antrian: nomorAntrianBaru,
        status: 'menunggu',
        status_panggil: 'menunggu',
      })
      .eq('id', gantiPoliTarget.id)

    setGantiPoliLoading(false)

    if (error) {
      setErrorMsg('Gagal mengganti poli tujuan.')
      setGantiPoliTarget(null)
      setSelectedPoliId('')
      return
    }

    setGantiPoliTarget(null)
    setSelectedPoliId('')
  }

  function statusLabel(status) {
    const map = {
      menunggu: 'Menunggu',
      dipanggil: 'Dipanggil',
      selesai: 'Selesai',
      batal: 'Batal',
    }
    return map[status] || status || '-'
  }

  // Filter kunjungan berdasarkan nama pasien, No. RM, atau No. BPJS —
  // dicocokkan case-insensitive terhadap searchTerm. Kalau searchTerm
  // kosong, tampilkan semua kunjungan hari ini seperti biasa.
  const keyword = searchTerm.trim().toLowerCase()
  const filteredKunjungan = keyword
    ? kunjungan.filter((row) => {
        const nama = (row.pasien?.nama_lengkap || '').toLowerCase()
        const noRm = (row.pasien?.no_rekam_medis || '').toLowerCase()
        const noBpjs = (row.pasien?.no_bpjs || '').toLowerCase()
        return nama.includes(keyword) || noRm.includes(keyword) || noBpjs.includes(keyword)
      })
    : kunjungan

  return (
    <div
      className="min-h-screen p-3 sm:p-6 pb-24"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div className="max-w-7xl mx-auto">
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

      <div className="relative mb-4 max-w-md mx-auto">
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--muted)' }}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Cari nama, No. RM, atau No. BPJS"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg outline-none text-sm"
          style={{ border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)' }}
        />
      </div>

      <div
        className="w-full rounded-2xl overflow-hidden"
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
        ) : filteredKunjungan.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Tidak ada kunjungan yang cocok dengan pencarian.
          </div>
        ) : (
          <>
            {/* ── Tampilan kartu — layar kecil (HP) ── */}
            <div className="sm:hidden p-3 space-y-3">
              {filteredKunjungan.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl p-3.5"
                  style={{ border: '1px solid var(--line)', background: '#fff' }}
                >
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{row.pasien?.nama_lengkap || '-'}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        No. RM {row.pasien?.no_rekam_medis || '-'}
                      </p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      {statusLabel(row.status_panggil || row.status)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>
                      {row.polis?.nama_poli || '-'}
                    </span>
                    <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>
                      {row.kategori_pasien || '-'}
                    </span>
                    <span className="text-xs font-semibold px-2 py-1 rounded" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>
                      No. antrian {row.nomor_antrian ?? '-'}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setQrTarget(row)}
                      className="flex-1 py-2.5 rounded-lg text-white text-xs font-semibold touch-manipulation"
                      style={{ background: 'var(--accent)' }}
                    >
                      QR
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPoliId(row.poli_id || '')
                        setGantiPoliTarget(row)
                      }}
                      className="flex-1 py-2.5 rounded-lg text-xs font-semibold touch-manipulation"
                      style={{ background: '#fef3c7', color: '#854d0e' }}
                    >
                      Ganti poli
                    </button>
                    <button
                      onClick={() => setBatalTarget(row)}
                      className="flex-1 py-2.5 rounded-lg text-xs font-semibold touch-manipulation"
                      style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-center pt-1" style={{ color: 'var(--muted)' }}>
                Menampilkan {filteredKunjungan.length} dari {kunjungan.length} kunjungan
              </p>
            </div>

            {/* ── Tampilan tabel — layar besar (desktop/tablet) ── */}
            <div className="hidden sm:block overflow-x-auto">
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
                {filteredKunjungan.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="px-4 py-3">{row.pasien?.no_rekam_medis || '-'}</td>
                    <td className="px-4 py-3">{row.pasien?.nama_lengkap || '-'}</td>
                    <td className="px-4 py-3">{row.polis?.nama_poli || '-'}</td>
                    <td className="px-4 py-3">{row.kategori_pasien || '-'}</td>
                    <td className="px-4 py-3 font-semibold">{row.nomor_antrian ?? '-'}</td>
                    <td className="px-4 py-3">{statusLabel(row.status_panggil || row.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setQrTarget(row)}
                          className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition"
                          style={{ background: 'var(--accent)' }}
                        >
                          Generate QR
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPoliId(row.poli_id || '')
                            setGantiPoliTarget(row)
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                          style={{ background: '#eab308', color: '#1a1a1a' }}
                        >
                          Ganti Poli
                        </button>
                        <button
                          onClick={() => setBatalTarget(row)}
                          className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition"
                          style={{ background: '#dc2626' }}
                        >
                          Batal Berobat
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
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
      {batalTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: 'rgba(18,24,27,0.5)' }}
          onClick={() => !batalLoading && setBatalTarget(null)}
        >
          <div
            className="rounded-2xl p-6 max-w-xs w-full text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-1">Batalkan Berobat?</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              {batalTarget.pasien?.nama_lengkap || '-'} · No. Antrian{' '}
              <strong>{batalTarget.nomor_antrian ?? '-'}</strong> akan ditandai batal.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setBatalTarget(null)}
                disabled={batalLoading}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border transition disabled:opacity-50"
                style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
              >
                Kembali
              </button>
              <button
                onClick={handleBatalBerobat}
                disabled={batalLoading}
                className="flex-1 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-50"
                style={{ background: '#dc2626' }}
              >
                {batalLoading ? 'Memproses...' : 'Ya, Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}
      {gantiPoliTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: 'rgba(18,24,27,0.5)' }}
          onClick={() => !gantiPoliLoading && setGantiPoliTarget(null)}
        >
          <div
            className="rounded-2xl p-6 max-w-xs w-full text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-1">Ganti Poli Tujuan</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              {gantiPoliTarget.pasien?.nama_lengkap || '-'} · No. Antrian saat ini{' '}
              <strong>{gantiPoliTarget.nomor_antrian ?? '-'}</strong>
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Pasien akan mendapat nomor antrian baru di poli tujuan dan statusnya direset menjadi menunggu.
            </p>

            <select
              value={selectedPoliId}
              onChange={(e) => setSelectedPoliId(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                color: 'var(--ink)',
              }}
            >
              <option value="" disabled>
                Pilih poli tujuan
              </option>
              {poliList.map((poli) => (
                <option key={poli.id} value={poli.id}>
                  {poli.nama_poli}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={() => setGantiPoliTarget(null)}
                disabled={gantiPoliLoading}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border transition disabled:opacity-50"
                style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
              >
                Batal
              </button>
              <button
                onClick={handleGantiPoli}
                disabled={
                  gantiPoliLoading ||
                  !selectedPoliId ||
                  selectedPoliId === gantiPoliTarget.poli_id
                }
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                style={{ background: '#eab308', color: '#1a1a1a' }}
              >
                {gantiPoliLoading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}