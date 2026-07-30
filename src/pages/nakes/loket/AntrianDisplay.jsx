import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// ─────────────────────────────────────────────────────────────
// Layar TV Pemanggil Antrian
// Menampilkan nomor yang sedang dipanggil di setiap poli,
// update otomatis via Supabase Realtime + suara panggilan.
// Palet warna mengikuti halaman Login (CSS variables tema).
// ─────────────────────────────────────────────────────────────

function BlinkStyle() {
  return (
    <style>{`
      @keyframes antrianBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
      .antrian-nomor-aktif {
        animation: antrianBlink 1.4s ease-in-out infinite;
        color: #ff1a1a;
        -webkit-text-stroke: 3px #ffffff;
        paint-order: stroke fill;
        text-shadow:
          -2px -2px 0 #fff,
          2px -2px 0 #fff,
          -2px 2px 0 #fff,
          2px 2px 0 #fff,
          0 -2px 0 #fff,
          0 2px 0 #fff,
          -2px 0 0 #fff,
          2px 0 0 #fff;
      }
    `}</style>
  )
}

function PulseLine() {
  return (
    <svg
      width="72"
      height="18"
      viewBox="0 0 120 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M0 14 H30 L38 4 L46 24 L54 14 H70 L76 8 L82 20 L88 14 H120"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function AntrianDisplay() {
  const [instansiId, setInstansiId] = useState(null)
  const [polis, setPolis] = useState([])
  const [dipanggil, setDipanggil] = useState({}) // { poli_id: { nomor_antrian, nama_pasien, waktu_panggil } }
  const [riwayat, setRiwayat] = useState([]) // beberapa panggilan terakhir (semua poli)
  const jamRef = useRef(null)
  const [jam, setJam] = useState('')
  const [suaraAktif, setSuaraAktif] = useState(false)

  function aktifkanSuara() {
    // Trik: ucapkan sesuatu sekali di dalam klik user untuk "unlock" speechSynthesis
    const test = new SpeechSynthesisUtterance('Suara antrian aktif')
    test.lang = 'id-ID'
    window.speechSynthesis.speak(test)
    setSuaraAktif(true)
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('instansi_id')
      .eq('id', user.id)
      .single()
    if (data?.instansi_id) setInstansiId(data.instansi_id)
  }

  useEffect(() => {
    if (!instansiId) return
    fetchPolis()
    fetchDipanggilAwal()

    const channel = supabase
      .channel('antrian-display')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'kunjungan',
          filter: `instansi_id=eq.${instansiId}`,
        },
        (payload) => {
          if (payload.new.status_panggil === 'dipanggil') {
            handlePanggilanBaru(payload.new)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instansiId])

  useEffect(() => {
    jamRef.current = setInterval(() => {
      setJam(new Date().toLocaleTimeString('id-ID'))
    }, 1000)
    return () => clearInterval(jamRef.current)
  }, [])

  async function fetchPolis() {
    const { data } = await supabase
      .from('polis')
      .select('id, nama_poli')
      .eq('instansi_id', instansiId)
      .order('nama_poli')
    setPolis(data || [])
  }

  async function fetchDipanggilAwal() {
    const hariIni = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('kunjungan')
      .select('poli_id, nomor_antrian, waktu_panggil, pasien:pasien_id(nama_lengkap)')
      .eq('instansi_id', instansiId)
      .eq('tanggal_periksa', hariIni)
      .eq('status_panggil', 'dipanggil')
      .order('waktu_panggil', { ascending: false })

    const peta = {}
    const list = []
    ;(data || []).forEach((row) => {
      if (!peta[row.poli_id]) {
        peta[row.poli_id] = {
          nomor_antrian: row.nomor_antrian,
          nama_pasien: row.pasien?.nama_lengkap || '',
          waktu_panggil: row.waktu_panggil,
        }
      }
      list.push(row)
    })
    setDipanggil(peta)
    setRiwayat(list.slice(0, 6))
  }

  async function handlePanggilanBaru(row) {
    // Ambil nama pasien & nama poli terkait
    const { data: pasienData, error: pasienErr } = await supabase
      .from('pasien')
      .select('nama_lengkap')
      .eq('id', row.pasien_id)
      .single()

    if (pasienErr) console.error('Gagal ambil data pasien:', pasienErr.message)

    const { data: poliData, error: poliErr } = await supabase
      .from('polis')
      .select('nama_poli')
      .eq('id', row.poli_id)
      .single()

    if (poliErr) console.error('Gagal ambil data poli:', poliErr.message)

    const entri = {
      poli_id: row.poli_id,
      nomor_antrian: row.nomor_antrian,
      nama_pasien: pasienData?.nama_lengkap || '',
      waktu_panggil: row.waktu_panggil,
    }

    setDipanggil((prev) => ({ ...prev, [row.poli_id]: entri }))
    setRiwayat((prev) => [entri, ...prev].slice(0, 6))

    // Suara panggilan (opsional, browser TTS)
    try {
      const namaPoli = poliData?.nama_poli || 'poli'
      const teks = `Nomor antrian ${row.nomor_antrian}, silakan menuju ${namaPoli}`
      const ucapan = new SpeechSynthesisUtterance(teks)
      ucapan.lang = 'id-ID'
      window.speechSynthesis.speak(ucapan)
    } catch (e) {
      console.error('Gagal memutar suara panggilan:', e)
    }
  }

  return (
    <div
      className="min-h-screen p-8 flex flex-col relative"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <BlinkStyle />

      {/* Overlay aktivasi suara */}
      {!suaraAktif && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(18,24,27,0.85)' }}
        >
          <div className="flex flex-col items-center gap-5 text-center px-4">
            <PulseLine />
            <button
              onClick={aktifkanSuara}
              className="px-10 py-5 rounded-2xl text-xl sm:text-2xl font-bold text-white shadow-lg transition-opacity active:opacity-80"
              style={{ background: 'var(--accent)' }}
            >
              🔊 Klik untuk Mengaktifkan Suara
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between mb-8 pb-6"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <div className="flex items-center gap-3">
          <PulseLine />
          <div>
            <p className="text-sm font-extrabold tracking-tight leading-none">
              <span style={{ color: 'var(--accent)' }}>Epiflow</span>
              <span style={{ color: 'var(--muted)' }}>lytics</span>
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
              Layar Antrian
            </h1>
          </div>
        </div>
        <span
          className="text-xl sm:text-2xl font-mono tabular-nums px-4 py-2 rounded-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--muted)' }}
        >
          {jam}
        </span>
      </div>

      {/* Grid nomor yang sedang dipanggil per poli */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-10">
        {polis.map((poli) => {
          const info = dipanggil[poli.id]
          return (
            <div
              key={poli.id}
              className="rounded-2xl p-6 flex flex-col items-center justify-center"
              style={{
                background: 'var(--accent)',
                border: '1px solid var(--accent)',
                boxShadow: '0 1px 2px rgba(18,24,27,0.04), 0 8px 24px rgba(18,24,27,0.08)',
              }}
            >
              <p
                className="text-sm uppercase tracking-wide mb-2 font-semibold"
                style={{ color: '#ffffff' }}
              >
                {poli.nama_poli}
              </p>
              <p
                className={`text-6xl font-bold tabular-nums ${info ? 'antrian-nomor-aktif' : ''}`}
                style={{ color: info ? undefined : 'rgba(255,255,255,0.5)' }}
              >
                {info ? info.nomor_antrian : '—'}
              </p>
              {info?.nama_pasien && (
                <p
                  className="text-xs mt-2 truncate max-w-full"
                  style={{ color: '#ffffff' }}
                >
                  {info.nama_pasien}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Riwayat panggilan terakhir */}
      <div className="mt-auto">
        <p
          className="text-xs uppercase tracking-wide mb-2 font-semibold"
          style={{ color: 'var(--muted)' }}
        >
          Panggilan Terakhir
        </p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {riwayat.map((r, i) => (
            <div
              key={`${r.poli_id}-${r.nomor_antrian}-${i}`}
              className="flex-shrink-0 rounded-lg px-4 py-2 text-sm"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                color: 'var(--muted)',
              }}
            >
              <span className="font-bold" style={{ color: 'var(--ink)' }}>
                {r.nomor_antrian}
              </span>{' '}
              — {polis.find((p) => p.id === r.poli_id)?.nama_poli || ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}