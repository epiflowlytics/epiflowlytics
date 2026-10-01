import { useRef, useState } from 'react'
import SignatureCanvas from './SignatureCanvas'
import { STATUS_CONSENT, LABEL_STATUS_CONSENT } from '../nakes/loket/utils/consentHelpers'

// Kartu status consent + modal TTD petugas, dipasang di area Info Pasien
// pada DashboardDokter & DashboardPerawat. Tidak tampil kalau pasien tidak
// punya consent aktif (fitur ini opsional per kunjungan, tidak wajib).
//
// CATATAN PERBAIKAN: versi sebelumnya memakai status
// MENUNGGU_TTD_PASIEN / MENUNGGU_TINDAKAN / SELESAI yang TIDAK PERNAH ADA
// di STATUS_CONSENT (consentHelpers.js) maupun di CHECK constraint kolom
// `status` pada tabel general_consent. Nilai yang benar hanya:
// menunggu_ttd | ditandatangani | kedaluwarsa | dibatalkan. Akibatnya kartu
// ini sebelumnya TIDAK PERNAH menampilkan badge yang cocok dan tombol
// "Tanda Tangan Petugas" TIDAK PERNAH muncul, karena kondisinya tidak
// pernah match. Skema DB juga tidak punya status "selesai" eksplisit —
// consent dianggap tuntas dari ada/tidaknya baris consent_signature
// pihak='petugas' (lihat consentTuntas di useConsentPoli.js), bukan dari
// kolom status. Diperbaiki di bawah dengan menerima prop consentTuntas.
export default function KartuConsentPoli({
  consent,
  consentTuntas,
  loading,
  showTtdPetugas,
  menyimpanTtd,
  errorConsent,
  namaPetugasDefault,
  onBukaTtd,
  onTutupTtd,
  onSimpanTtd,
}) {
  const sigRef = useRef(null)
  const [namaPetugas, setNamaPetugas] = useState(namaPetugasDefault || '')

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-xl p-3 mb-4">
        <p className="text-xs text-gray-400">Memeriksa status consent...</p>
      </div>
    )
  }

  if (!consent) return null

  const warnaBadge = consentTuntas
    ? 'bg-green-100 text-green-700'
    : {
        [STATUS_CONSENT.MENUNGGU_TTD]: 'bg-amber-100 text-amber-700',
        [STATUS_CONSENT.DITANDATANGANI]: 'bg-blue-100 text-blue-700',
        [STATUS_CONSENT.KEDALUWARSA]: 'bg-red-100 text-red-700',
        [STATUS_CONSENT.DIBATALKAN]: 'bg-gray-100 text-gray-500',
      }[consent.status]

  const labelBadge = consentTuntas ? 'Consent Selesai' : LABEL_STATUS_CONSENT[consent.status]

  function hapusTtd() {
    sigRef.current?.clear()
  }

  function handleSimpan() {
    if (sigRef.current?.isEmpty()) return
    const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png')
    onSimpanTtd(dataUrl, namaPetugas.trim())
  }

  return (
    <>
      <div className="border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-700">📝 Persetujuan Tindakan (Consent)</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${warnaBadge}`}>
            {labelBadge}
          </span>
        </div>

        {consent.status === STATUS_CONSENT.MENUNGGU_TTD && (
          <p className="text-xs text-gray-500 mt-2">
            Pasien belum menandatangani formulir persetujuan di loket.
          </p>
        )}

        {consent.status === STATUS_CONSENT.DITANDATANGANI && !consentTuntas && (
          <button
            type="button"
            onClick={onBukaTtd}
            className="mt-2 w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Tanda Tangan Petugas
          </button>
        )}

        {consentTuntas && (
          <p className="text-xs text-gray-500 mt-2">
            Persetujuan tindakan sudah lengkap ditandatangani kedua pihak.
          </p>
        )}

        {consent.status === STATUS_CONSENT.KEDALUWARSA && (
          <p className="text-xs text-red-600 mt-2">
            Tautan consent sudah kedaluwarsa sebelum pasien sempat menandatangani.
          </p>
        )}

        {errorConsent && (
          <p className="text-xs text-red-600 mt-2">{errorConsent}</p>
        )}
      </div>

      {showTtdPetugas && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">
              Tanda Tangan Petugas
            </h2>

            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nama Petugas
            </label>
            <input
              type="text"
              value={namaPetugas}
              onChange={(e) => setNamaPetugas(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3"
            />

            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tanda Tangan
            </label>
            <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
              <SignatureCanvas
                ref={sigRef}
                penColor="black"
                canvasProps={{ className: 'w-full h-40' }}
              />
            </div>
            <button
              type="button"
              onClick={hapusTtd}
              className="mt-1 text-sm text-blue-600 hover:underline"
            >
              Ulangi tanda tangan
            </button>

            {errorConsent && (
              <p className="text-xs text-red-600 mt-2">{errorConsent}</p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={onTutupTtd}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSimpan}
                disabled={menyimpanTtd || !namaPetugas.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {menyimpanTtd ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}