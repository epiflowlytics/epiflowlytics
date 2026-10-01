import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// ─────────────────────────────────────────────────────────────
// Layar TV Pemanggil Antrian
// Menampilkan nomor yang sedang dipanggil di setiap poli/ruangan,
// update otomatis via Supabase Realtime + suara panggilan.
//
// PENTING soal alur data:
// Satu baris `kunjungan` dipakai terus sepanjang perjalanan pasien
// (loket -> dokter -> lab/apotek -> selesai). Kolom `poli_id` TIDAK
// pernah berubah (tetap poli pendaftaran awal), yang berubah hanya
// kolom `status`:
//   'menunggu' / 'menunggu_dokter'  -> pasien masih di poli asal
//   'menunggu_lab'                  -> pasien sekarang di ruangan LAB
//   'menunggu_obat'                 -> pasien sekarang di ruangan APOTEK
//   'selesai' / 'batal'             -> tidak tampil di layar manapun
// Ruangan yang ditampilkan di grid dihitung dari status ini, BUKAN
// murni dari poli_id, supaya pasien "berpindah kartu" saat dia
// diteruskan dokter ke lab/apotek.
//
// Poli/ruangan hanya tampil di layar kalau punya minimal 1 pasien
// yang relevan di tahap tersebut.
// ─────────────────────────────────────────────────────────────

// Status kunjungan yang berarti "masih dalam antrian panggil" (belum selesai/batal)
const STATUS_PANGGIL_AKTIF = ['menunggu', 'dipanggil']

// Nama ruangan LAB & APOTEK di tabel `polis` — dipakai untuk mencocokkan
// baris kunjungan yang status-nya menunggu_lab / menunggu_obat ke kartu
// ruangan yang benar, walau poli_id baris itu masih poli asal pasien.
const NAMA_POLI_LAB = 'LAB'
const NAMA_POLI_APOTEK = 'APOTEK'

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
  const polisRef = useRef([]) // selalu sinkron dengan state `polis` terkini, dipakai di closure listener realtime
  const [poliAktif, setPoliAktif] = useState([]) // poli_id ruangan yang harus tampil di grid
  const [dipanggil, setDipanggil] = useState({}) // { poli_id: { nomor_antrian, nama_pasien, waktu_panggil } }
  const [riwayat, setRiwayat] = useState([]) // beberapa panggilan terakhir (semua ruangan)
  const jamRef = useRef(null)
  const [jam, setJam] = useState('')
  const [suaraAktif, setSuaraAktif] = useState(false)
  const chimePembukaRef = useRef(null)
  const chimePenutupRef = useRef(null)

  function getChimePembuka() {
    if (!chimePembukaRef.current) {
      chimePembukaRef.current = new Audio('/sounds/chime-pembuka.mp3')
    }
    return chimePembukaRef.current
  }

  function getChimePenutup() {
    if (!chimePenutupRef.current) {
      chimePenutupRef.current = new Audio('/sounds/chime-penutup.mp3')
    }
    return chimePenutupRef.current
  }

  function putarAudio(audioEl) {
    return new Promise((resolve) => {
      try {
        audioEl.currentTime = 0
        const selesai = () => {
          audioEl.removeEventListener('ended', selesai)
          resolve()
        }
        audioEl.addEventListener('ended', selesai)
        audioEl.play().catch((e) => {
          console.error('Gagal memutar audio:', e)
          resolve()
        })
      } catch (e) {
        console.error('Gagal memutar audio:', e)
        resolve()
      }
    })
  }

  function mainkanChimePembuka() {
    return putarAudio(getChimePembuka())
  }

  function mainkanChimePenutup() {
    return putarAudio(getChimePenutup())
  }

  function aktifkanSuara() {
    const test = new SpeechSynthesisUtterance('Suara antrian aktif')
    test.lang = 'id-ID'
    window.speechSynthesis.speak(test)
    const pembuka = getChimePembuka()
    const penutup = getChimePenutup()
    pembuka.play().then(() => pembuka.pause()).catch(() => {})
    penutup.play().then(() => penutup.pause()).catch(() => {})
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

    let batal = false

    async function muatAwal() {
      // PENTING: fetchPoliAktif() dan fetchDipanggilAwal() butuh daftar `polis`
      // (khususnya id LAB & APOTEK) untuk memetakan status -> kartu ruangan
      // yang benar. Kalau dipanggil bersamaan tanpa menunggu fetchPolis()
      // selesai, `polis` masih [] (state awal) sehingga poliLab/poliApotek
      // tidak ketemu dan baris pasien yang harusnya masuk kartu LAB/APOTEK
      // malah salah jatuh ke kartu poli asal (poli_id pendaftaran).
      // Karena itu HARUS di-await berurutan, bukan dipanggil sebaris.
      const daftarPolis = await fetchPolis()
      if (batal) return
      await Promise.all([
        fetchPoliAktif(daftarPolis),
        fetchDipanggilAwal(daftarPolis),
      ])
    }

    muatAwal()

    const channel = supabase
      .channel('antrian-display')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kunjungan',
          filter: `instansi_id=eq.${instansiId}`,
        },
        async (payload) => {
          const baris = payload.new
          const sebelum = payload.old
          if (!baris) return

          // Status/tahap pasien berubah (pindah ke lab/apotek, selesai, batal,
          // atau pasien baru daftar) -> hitung ulang ruangan mana yang harus
          // tampil di grid, karena pemetaan status->ruangan cukup rumit untuk
          // dihitung secara optimis di client. Ini adalah SATU-SATUNYA fungsi
          // yang mengubah poliAktif, jadi jalankan (dan tunggu) lebih dulu
          // sebelum memainkan suara panggilan, supaya tidak ada race antara
          // dua sumber kebenaran yang berbeda.
          await fetchPoliAktif()

          // PENTING: jangan mainkan suara hanya karena status_panggil KEBETULAN
          // masih 'dipanggil' saat baris ini di-UPDATE (mis. field lain berubah
          // seperti status_prioritas) -- itu menyebabkan suara terulang tanpa
          // ada panggilan baru sungguhan (Bug: "dipanggil 2x" untuk pasien yang
          // sama). Suara hanya boleh berbunyi kalau:
          //   (a) baris ini baru SAJA bertransisi ke 'dipanggil' (bukan sudah
          //       'dipanggil' sebelumnya), ATAU
          //   (b) baris ini sudah 'dipanggil' dan tetap 'dipanggil', TAPI
          //       waktu_panggil berubah -- ini kasus "Panggil Ulang" yang
          //       memang sengaja mengulang suara untuk nomor yang sama.
          // REPLICA IDENTITY FULL sudah diset di tabel `kunjungan` supaya
          // payload.old berisi nilai kolom lama secara lengkap, bukan cuma PK.
          const baruJadiDipanggil =
            baris.status_panggil === 'dipanggil' && sebelum?.status_panggil !== 'dipanggil'
          const panggilUlang =
            baris.status_panggil === 'dipanggil' &&
            sebelum?.status_panggil === 'dipanggil' &&
            sebelum?.waktu_panggil !== baris.waktu_panggil

          if (baruJadiDipanggil || panggilUlang) {
            handlePanggilanBaru(baris)
          }
        }
      )
      .subscribe()

    return () => {
      batal = true
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
    const list = data || []
    setPolis(list)
    polisRef.current = list
    return list
  }

  // Hitung ruangan mana saja yang harus tampil di grid hari ini, berdasarkan
  // tahap (`status`) setiap pasien yang masih dalam proses -- bukan poli_id
  // mentahnya, karena poli_id tidak berubah walau pasien sudah pindah ke
  // lab/apotek.
  async function fetchPoliAktif(daftarPolis) {
    const hariIni = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('kunjungan')
      .select('poli_id, status, status_panggil')
      .eq('instansi_id', instansiId)
      .eq('tanggal_periksa', hariIni)
      .in('status_panggil', STATUS_PANGGIL_AKTIF)

    if (error) {
      console.error('Gagal ambil poli aktif:', error.message)
      return
    }

    // Pakai daftarPolis yang di-passing kalau ada (dari muatAwal, sudah pasti
    // segar), kalau tidak pakai polisRef.current (BUKAN state `polis` biasa).
    // Fungsi ini dipanggil dari closure listener realtime yang didaftarkan
    // sekali di awal, jadi state `polis` di closure itu bisa basi/stale kalau
    // listener sempat jalan sebelum re-render terbaru ter-commit. polisRef
    // selalu sinkron dengan nilai `polis` TERKINI (lihat fetchPolis()), sama
    // seperti yang sudah dipakai di handlePanggilanBaru() untuk masalah yang
    // sama persis -- kalau tidak, poliLab/poliApotek bisa undefined dan baris
    // pasien yang harusnya masuk kartu LAB/APOTEK malah salah jatuh ke kartu
    // poli asal (Bug: kartu poli asal ikut muncul kosong saat panggil ulang
    // Lab/Apotek).
    const sumberPolis = daftarPolis || polisRef.current
    const poliLab = sumberPolis.find((p) => p.nama_poli?.toUpperCase() === NAMA_POLI_LAB)
    const poliApotek = sumberPolis.find((p) => p.nama_poli?.toUpperCase() === NAMA_POLI_APOTEK)

    const aktif = new Set()
    ;(data || []).forEach((row) => {
      if (row.status === 'menunggu_lab' && poliLab) {
        aktif.add(poliLab.id)
      } else if (row.status === 'menunggu_obat' && poliApotek) {
        aktif.add(poliApotek.id)
      } else if (row.status === 'selesai' || row.status === 'batal') {
        // sudah selesai total, tidak tampil di ruangan manapun
      } else {
        // 'menunggu', 'menunggu_dokter', atau status lain yang belum
        // dipetakan -> anggap masih di poli asal pendaftaran
        aktif.add(row.poli_id)
      }
    })

    setPoliAktif([...aktif])
  }

  async function fetchDipanggilAwal(daftarPolis) {
    const hariIni = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('kunjungan')
      .select('poli_id, status, nomor_antrian, waktu_panggil, pasien:pasien_id(nama_lengkap)')
      .eq('instansi_id', instansiId)
      .eq('tanggal_periksa', hariIni)
      .eq('status_panggil', 'dipanggil')
      .order('waktu_panggil', { ascending: false })

    const sumberPolis = daftarPolis || polisRef.current
    const poliLab = sumberPolis.find((p) => p.nama_poli?.toUpperCase() === NAMA_POLI_LAB)
    const poliApotek = sumberPolis.find((p) => p.nama_poli?.toUpperCase() === NAMA_POLI_APOTEK)

    const peta = {}
    const list = []
    ;(data || []).forEach((row) => {
      const poliTujuanId = poliRuanganUntukStatus(row, poliLab, poliApotek)
      if (!poliTujuanId) return

      if (!peta[poliTujuanId]) {
        peta[poliTujuanId] = {
          poli_id: poliTujuanId,
          nomor_antrian: row.nomor_antrian,
          nama_pasien: row.pasien?.nama_lengkap || '',
          waktu_panggil: row.waktu_panggil,
        }
      }
      list.push({ ...row, poli_id: poliTujuanId })
    })
    setDipanggil(peta)
    setRiwayat(list.slice(0, 6))
  }

  // Poli/ruangan mana yang relevan untuk baris kunjungan ini, berdasarkan
  // tahap (`status`) pasien sekarang -- bukan poli_id pendaftaran awal.
  function poliRuanganUntukStatus(row, poliLab, poliApotek) {
    if (row.status === 'menunggu_lab') return poliLab?.id || null
    if (row.status === 'menunggu_obat') return poliApotek?.id || null
    if (row.status === 'selesai' || row.status === 'batal') return null
    return row.poli_id
  }

  async function handlePanggilanBaru(row) {
    const { data: pasienData, error: pasienErr } = await supabase
      .from('pasien')
      .select('nama_lengkap')
      .eq('id', row.pasien_id)
      .single()

    if (pasienErr) console.error('Gagal ambil data pasien:', pasienErr.message)

    // Pakai polisRef.current (bukan closure `polis` state) supaya listener
    // realtime yang didaftarkan sekali di awal tetap membaca daftar poli
    // TERBARU, bukan snapshot lama yang bisa membuat poliApotek/poliLab
    // tidak ketemu -> salah jatuh ke poli_id asal (Bug: suara & kartu salah).
    const daftarPolisTerkini = polisRef.current
    const poliLab = daftarPolisTerkini.find((p) => p.nama_poli?.toUpperCase() === NAMA_POLI_LAB)
    const poliApotek = daftarPolisTerkini.find((p) => p.nama_poli?.toUpperCase() === NAMA_POLI_APOTEK)
    const poliTujuanId = poliRuanganUntukStatus(row, poliLab, poliApotek)

    if (!poliTujuanId) return // status sudah selesai/batal, tidak perlu dipanggil di layar

    const { data: poliData, error: poliErr } = await supabase
      .from('polis')
      .select('nama_poli')
      .eq('id', poliTujuanId)
      .single()

    if (poliErr) console.error('Gagal ambil data poli:', poliErr.message)

    const entri = {
      poli_id: poliTujuanId,
      nomor_antrian: row.nomor_antrian,
      nama_pasien: pasienData?.nama_lengkap || '',
      waktu_panggil: row.waktu_panggil,
    }

    setDipanggil((prev) => ({ ...prev, [poliTujuanId]: entri }))
    setRiwayat((prev) => [entri, ...prev].slice(0, 6))
    // CATATAN: poliAktif SENGAJA tidak diubah di sini. fetchPoliAktif() yang
    // dipanggil bersamaan di listener realtime adalah satu-satunya sumber
    // kebenaran untuk grid (query fresh + hitung ulang total dari DB).
    // Kalau di sini juga menambah poliAktif, dua fungsi ini race tanpa
    // urutan terjamin (Bug: kartu poli lama nyangkut / poli salah muncul).

    try {
      const namaPoli = poliData?.nama_poli || 'poli'
      const teks = `Nomor antrian ${row.nomor_antrian}, silakan menuju ${namaPoli}`
      const ucapan = new SpeechSynthesisUtterance(teks)
      ucapan.lang = 'id-ID'

      window.speechSynthesis.cancel()

      await mainkanChimePembuka()

      await new Promise((resolve) => {
        ucapan.onend = resolve
        ucapan.onerror = resolve
        window.speechSynthesis.speak(ucapan)
      })

      await mainkanChimePenutup()
    } catch (e) {
      console.error('Gagal memutar suara panggilan:', e)
    }
  }

  // Ruangan yang ditampilkan: punya antrian aktif hari ini di tahap ini,
  // ATAU sedang menampilkan nomor yang dipanggil.
  const polisTampil = polis.filter(
    (poli) => poliAktif.includes(poli.id) || dipanggil[poli.id]
  )

  return (
    <div
      className="min-h-screen p-8 flex flex-col relative"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <BlinkStyle />

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

      {polisTampil.length === 0 ? (
        <div
          className="rounded-2xl py-16 text-center mb-10"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            color: 'var(--muted)',
          }}
        >
          <p className="text-2xl font-semibold">Belum ada antrian hari ini</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-10">
          {polisTampil.map((poli) => {
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
      )}

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