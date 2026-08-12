import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/* ────────────────────────────────────────────────────────────────
   KOMPONEN: Scan Barcode/QR Kartu BPJS/KIS via kamera live
   ────────────────────────────────────────────────────────────────
   Beda dengan ScanIdentitas.jsx (foto statis + OCR AI), komponen ini
   membuka stream kamera langsung dan membaca QR/barcode di setiap
   frame secara real-time pakai jsQR — lebih cepat & akurat untuk kode
   batang/QR dibanding OCR, karena bukan "menebak" teks dari gambar.

   Catatan: kartu BPJS/KIS fisik terbaru umumnya punya QR code (bukan
   1D barcode) berisi nomor kartu. jsQR menangani format QR. Kalau
   kartu yang dipakai memakai 1D barcode (Code128/EAN), perlu library
   tambahan (mis. @zxing/browser) — beri tahu saya kalau ternyata itu
   yang dipakai di instansi kamu, supaya saya sesuaikan.

   Cara pakai di form pendaftaran:

     import ScanBpjs from './ScanBpjs'

     <ScanBpjs
       onTerbaca={(kodeBpjs) => {
         // kodeBpjs = string hasil decode QR, isi ke field no_bpjs
       }}
       onTutup={() => setShowScanBpjs(false)}
     />

   Hanya tampil sebagai modal kamera saat state `showScanBpjs` true.
   ──────────────────────────────────────────────────────────────── */

export default function ScanBpjs({ onTerbaca, onTutup }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const [error, setError] = useState('')
  const [siap, setSiap] = useState(false)

  useEffect(() => {
    let batal = false

    async function mulaiKamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (batal) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setSiap(true)
          tickScan()
        }
      } catch (err) {
        setError(
          err.name === 'NotAllowedError'
            ? 'Izin kamera ditolak. Aktifkan izin kamera di browser untuk memindai kartu.'
            : 'Gagal mengakses kamera: ' + err.message
        )
      }
    }

    function tickScan() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tickScan)
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      const hasil = jsQR(imageData.data, imageData.width, imageData.height)
      if (hasil?.data) {
        hentikanKamera()
        onTerbaca(hasil.data.trim())
        return
      }

      rafRef.current = requestAnimationFrame(tickScan)
    }

    mulaiKamera()

    return () => {
      batal = true
      hentikanKamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function hentikanKamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5">
        <p className="font-semibold text-gray-800 mb-1">📷 Scan QR Kartu BPJS/KIS</p>
        <p className="text-xs text-gray-500 mb-3">Arahkan kamera ke QR code pada kartu BPJS/KIS pasien.</p>

        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs mb-3">
            ⚠️ {error}
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden bg-black mb-3 aspect-square">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            {!siap && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-xs bg-black/40">
                Membuka kamera...
              </div>
            )}
            {siap && (
              <div className="absolute inset-8 border-2 border-teal-400 rounded-lg pointer-events-none" />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            hentikanKamera()
            onTutup()
          }}
          className="w-full py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold"
        >
          Batal
        </button>
      </div>
    </div>
  )
}
