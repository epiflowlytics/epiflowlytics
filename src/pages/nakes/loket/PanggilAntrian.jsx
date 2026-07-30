import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// ─────────────────────────────────────────────────────────────
// Menu Pemanggil Antrian
// Dipakai petugas poli untuk memanggil nomor antrian berikutnya.
// ─────────────────────────────────────────────────────────────

export default function PanggilAntrian({ profile }) {
  const [polis, setPolis] = useState([])
  const [poliAktif, setPoliAktif] = useState(null)
  const [antrian, setAntrian] = useState([]) // daftar menunggu di poli aktif, hari ini
  const [sedangDipanggil, setSedangDipanggil] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const hariIni = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (profile?.instansi_id) fetchPolis()
  }, [profile])

  useEffect(() => {
    if (poliAktif) fetchAntrian()
  }, [poliAktif])

  async function fetchPolis() {
    const { data } = await supabase
      .from('polis')
      .select('id, nama_poli')
      .eq('instansi_id', profile.instansi_id)
      .order('nama_poli')
    setPolis(data || [])
    if (data && data.length > 0) setPoliAktif(data[0].id)
  }

  async function fetchAntrian() {
    setError('')
    const { data, error } = await supabase
      .from('kunjungan')
      .select('id, nomor_antrian, status_panggil, pasien:pasien_id(nama_lengkap)')
      .eq('poli_id', poliAktif)
      .eq('tanggal_periksa', hariIni)
      .order('nomor_antrian', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setAntrian((data || []).filter((k) => k.status_panggil !== 'selesai'))
    setSedangDipanggil((data || []).find((k) => k.status_panggil === 'dipanggil') || null)
  }

  async function panggilBerikutnya() {
    setLoading(true)
    setError('')
    try {
      // Tandai yang sedang dipanggil sebelumnya sebagai selesai
      if (sedangDipanggil) {
        await supabase
          .from('kunjungan')
          .update({ status_panggil: 'selesai' })
          .eq('id', sedangDipanggil.id)
      }

      const berikutnya = antrian.find(
        (k) => k.status_panggil === 'menunggu' && k.id !== sedangDipanggil?.id
      )

      if (!berikutnya) {
        setError('Tidak ada antrian menunggu di poli ini.')
        await fetchAntrian()
        return
      }

      const { error: updateErr } = await supabase
        .from('kunjungan')
        .update({ status_panggil: 'dipanggil', waktu_panggil: new Date().toISOString() })
        .eq('id', berikutnya.id)

      if (updateErr) throw new Error(updateErr.message)

      await fetchAntrian()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function panggilUlang() {
    if (!sedangDipanggil) return
    setLoading(true)
    try {
      await supabase
        .from('kunjungan')
        .update({ waktu_panggil: new Date().toISOString() })
        .eq('id', sedangDipanggil.id)
      await fetchAntrian()
    } finally {
      setLoading(false)
    }
  }

  const jumlahMenunggu = antrian.filter((k) => k.status_panggil === 'menunggu').length

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-gray-800 mb-4">Pemanggil Antrian</h1>

        {/* Pilih Poli */}
        <div className="flex gap-2 flex-wrap mb-6">
          {polis.map((p) => (
            <button
              key={p.id}
              onClick={() => setPoliAktif(p.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                poliAktif === p.id
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {p.nama_poli}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Nomor sedang dipanggil */}
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center mb-4">
          <p className="text-sm text-gray-500 mb-2">Sedang Dipanggil</p>
          <p className="text-6xl font-bold text-teal-600 tabular-nums">
            {sedangDipanggil ? sedangDipanggil.nomor_antrian : '—'}
          </p>
          {sedangDipanggil?.pasien?.nama_lengkap && (
            <p className="text-sm text-gray-400 mt-2">
              {sedangDipanggil.pasien.nama_lengkap}
            </p>
          )}
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={panggilUlang}
            disabled={!sedangDipanggil || loading}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            🔁 Panggil Ulang
          </button>
          <button
            onClick={panggilBerikutnya}
            disabled={loading || jumlahMenunggu === 0}
            className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Memproses...' : '📢 Panggil Berikutnya'}
          </button>
        </div>

        {/* Daftar menunggu */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Menunggu ({jumlahMenunggu})
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {antrian
              .filter((k) => k.status_panggil === 'menunggu')
              .map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between text-sm border-b border-gray-100 pb-2"
                >
                  <span className="font-semibold text-gray-700">{k.nomor_antrian}</span>
                  <span className="text-gray-500 truncate ml-3">
                    {k.pasien?.nama_lengkap}
                  </span>
                </div>
              ))}
            {jumlahMenunggu === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">
                Tidak ada pasien menunggu.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
