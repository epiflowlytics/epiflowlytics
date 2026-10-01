import { useState, useEffect, useCallback, useRef } from 'react'
import {
  daftarBerkasConsent,
  generateBerkasByConsentId,
  urlUnduhBerkas,
} from '../../lib/berkasConsent'

// Daftar arsip berkas General Consent (PDF + Word).
// Dipakai di loket dan di dashboard poli. Filter per poli TIDAK dilakukan di
// sini: RPC daftar_berkas_general_consent + policy Storage sudah membatasi
// otomatis (loket & admin melihat semua di instansinya, nakes poli hanya
// consent dari kunjungan di poli-nya).
export default function ArsipGeneralConsent() {
  const [baris, setBaris] = useState([])
  const [cari, setCari] = useState('')
  const [memuat, setMemuat] = useState(false)
  const [error, setError] = useState('')
  const [sibukId, setSibukId] = useState(null) // id consent yang sedang dibuat ulang
  const [unduhKey, setUnduhKey] = useState(null) // `${id}-pdf` / `${id}-docx`

  const timerCari = useRef(null)

  const muat = useCallback(async (kataCari) => {
    setMemuat(true)
    setError('')
    try {
      const data = await daftarBerkasConsent({ cari: kataCari?.trim() || null })
      setBaris(data || [])
    } catch (err) {
      console.error('Gagal memuat arsip consent:', err)
      setError(err.message || 'Gagal memuat arsip.')
    } finally {
      setMemuat(false)
    }
  }, [])

  // Muat pertama kali + setiap pencarian berubah (debounce 350ms)
  useEffect(() => {
    clearTimeout(timerCari.current)
    timerCari.current = setTimeout(() => muat(cari), 350)
    return () => clearTimeout(timerCari.current)
  }, [cari, muat])

  async function unduh(r, jenis) {
    const path = jenis === 'pdf' ? r.path_pdf : r.path_docx
    if (!path) return
    const key = `${r.id}-${jenis}`
    setUnduhKey(key)
    setError('')
    try {
      const namaFile = `general-consent-${r.no_rekam_medis || r.id}.${jenis}`
      const url = await urlUnduhBerkas(path, namaFile)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Gagal mengunduh berkas:', err)
      setError(`Gagal mengunduh: ${err.message}`)
    } finally {
      setUnduhKey(null)
    }
  }

  async function buatUlang(r) {
    setSibukId(r.id)
    setError('')
    try {
      await generateBerkasByConsentId(r.id)
      await muat(cari)
    } catch (err) {
      console.error('Gagal membuat berkas:', err)
      setError(`Gagal membuat berkas: ${err.message}`)
    } finally {
      setSibukId(null)
    }
  }

  function formatWaktu(iso) {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function BadgeVersi({ versi }) {
    if (versi === 'final') {
      return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
          Final
        </span>
      )
    }
    if (versi === 'draft') {
      return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
          Draft
        </span>
      )
    }
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
        Belum dibuat
      </span>
    )
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={cari}
        onChange={(e) => setCari(e.target.value)}
        placeholder="Cari nama pasien atau No. RM"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {memuat && baris.length === 0 && (
        <p className="text-sm text-gray-400">Memuat arsip...</p>
      )}

      {!memuat && !error && baris.length === 0 && (
        <p className="text-sm text-gray-400">
          {cari.trim() ? 'Tidak ada berkas yang cocok.' : 'Belum ada berkas General Consent.'}
        </p>
      )}

      <div className="space-y-2">
        {baris.map((r) => {
          const sedangBuat = sibukId === r.id
          return (
            <div key={r.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {r.nama_pasien || '-'}
                  </p>
                  <p className="text-xs text-gray-500">
                    No. RM: {r.no_rekam_medis || '-'}
                  </p>
                </div>
                <BadgeVersi versi={r.berkas_versi} />
              </div>

              <div className="text-xs text-gray-400 space-y-0.5">
                <p>Pasien TTD: {formatWaktu(r.ditandatangani_pada)}</p>
                <p>
                  TTD petugas: {r.ada_ttd_petugas ? 'sudah' : 'belum'}
                  {r.berkas_dibuat_pada && <> &middot; Berkas dibuat: {formatWaktu(r.berkas_dibuat_pada)}</>}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {r.path_pdf && (
                  <button
                    type="button"
                    onClick={() => unduh(r, 'pdf')}
                    disabled={unduhKey === `${r.id}-pdf`}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 touch-manipulation"
                  >
                    {unduhKey === `${r.id}-pdf` ? 'Membuka...' : 'PDF'}
                  </button>
                )}
                {r.path_docx && (
                  <button
                    type="button"
                    onClick={() => unduh(r, 'docx')}
                    disabled={unduhKey === `${r.id}-docx`}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 touch-manipulation"
                  >
                    {unduhKey === `${r.id}-docx` ? 'Membuka...' : 'Word'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => buatUlang(r)}
                  disabled={sedangBuat}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 touch-manipulation"
                >
                  {sedangBuat ? 'Memproses...' : r.path_pdf ? 'Buat ulang' : 'Buat berkas'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
