import { QRCodeSVG } from 'qrcode.react'
import { STATUS_CONSENT, LABEL_STATUS_CONSENT, urlConsentPublik } from '../nakes/loket/utils/consentHelpers'

// Modal menampilkan QR code untuk di-scan pasien, dengan status realtime.
// Ditutup otomatis oleh loket (tidak memblokir alur) — status lanjutannya
// (ditandatangani -> tuntas setelah TTD petugas) akan ditangani di poli.
export default function ModalQrConsent({ show, pasien, consent, onTutup }) {
  if (!show || !consent) return null

  const sudahTtdPasien = consent.status !== STATUS_CONSENT.MENUNGGU_TTD
  const url = urlConsentPublik(consent.token)

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Persetujuan Tindakan (Consent)</h2>
        <p className="text-sm text-gray-500 mb-4">
          Pasien: <span className="font-medium">{pasien?.nama_lengkap || '-'}</span>
        </p>

        {!sudahTtdPasien ? (
          <>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-white border rounded-lg">
                <QRCodeSVG value={url} size={200} />
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              Minta pasien scan QR ini dengan HP untuk membaca dan menandatangani
              formulir persetujuan.
            </p>
            <div className="flex items-center justify-center gap-2 mt-3 text-amber-600 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Menunggu tanda tangan pasien...
            </div>
          </>
        ) : (
          <div className="py-6">
            <div className="text-green-600 text-4xl mb-2">&#10003;</div>
            <p className="text-gray-700 font-medium">
              {LABEL_STATUS_CONSENT[consent.status] || 'Sudah ditandatangani pasien'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Tanda tangan petugas akan diminta nanti saat tindakan di poli.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onTutup}
          className="mt-5 w-full px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
        >
          Tutup
        </button>
      </div>
    </div>
  )
}