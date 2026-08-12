import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

/* ────────────────────────────────────────────────────────────────
   KOMPONEN: Scan Identitas (KTP / KIA / KK) via kamera live
   ────────────────────────────────────────────────────────────────
   Dipakai lewat kamera live (getUserMedia), BUKAN <input type="file"
   capture>, supaya konsisten jalan di semua perangkat: HP Android,
   iPhone, tablet, DAN laptop/PC (webcam). Atribut `capture` pada
   input file hanya bekerja di browser mobile — di desktop browser
   selalu fallback ke file picker biasa, makanya diganti ke sini.

   Cara pakai di form pendaftaran:

     import ScanIdentitas from './ScanIdentitas'

     <ScanIdentitas
       instansiId={profile.instansi_id}
       onHasilBaru={(data) => {
         // data.pasienLama -> baris pasien dari tabel `pasien` kalau NIK cocok
         // data.hasilScan  -> hasil OCR mentah {nik, nama_lengkap, ...}
         // isi form kamu di sini, atau tampilkan popup konfirmasi
       }}
     />

   Tidak mengubah skema database. Hanya butuh kolom yang sudah ada
   di tabel `pasien` (no_nik, nama_lengkap, tanggal_lahir, dst).
   ──────────────────────────────────────────────────────────────── */

const PROMPT_OCR_KARTU = `Anda membaca foto kartu identitas Indonesia (KTP, KIA/Kartu Identitas Anak, atau Kartu Keluarga).
Tentukan sendiri jenis kartunya dari judul/layout, lalu ekstrak field yang tercetak di kartu tersebut.

Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown, format persis seperti ini:
{
  "jenis_kartu": "ktp" | "kia" | "kk" | "tidak_dikenali",
  "nik": string atau null (16 digit, khusus untuk KTP/KIA; untuk KK pakai field no_kk),
  "no_kk": string atau null (16 digit, hanya ada di kartu KK atau di bawah NIK pada KTP),
  "nama_lengkap": string atau null (untuk KK: nama Kepala Keluarga),
  "tempat_lahir": string atau null,
  "tanggal_lahir": string atau null (format YYYY-MM-DD),
  "jenis_kelamin": "L" | "P" | null,
  "alamat": string atau null,
  "pekerjaan": string atau null,
  "anggota_kk": array of {"nama_lengkap": string, "nik": string, "status_keluarga": string} atau null (isi hanya jika jenis_kartu = "kk")
}

Jika tulisan buram/tidak terbaca untuk suatu field, isi null untuk field itu saja, jangan mengarang data.
Jika gambar bukan kartu identitas, balas {"jenis_kartu": "tidak_dikenali"} dan field lain null.`

function mapStatusKeluargaKeValue(teks) {
  if (!teks) return ''
  const t = teks.toLowerCase()
  if (t.includes('kepala')) return 'kepala_keluarga'
  if (t.includes('ayah')) return 'ayah'
  if (t.includes('ibu')) return 'ibu'
  if (t.includes('anak')) return 'anak'
  if (t.includes('cucu')) return 'cucu'
  if (t.includes('menantu')) return 'menantu'
  return 'famili_lain'
}

// Ambil 1 frame dari elemen <video> yang sedang live, lalu jadikan base64 JPEG
function ambilFrameKeBase64(videoEl) {
  const canvas = document.createElement('canvas')
  canvas.width = videoEl.videoWidth
  canvas.height = videoEl.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
  return dataUrl.split(',')[1]
}

async function bacaKartuDenganAI(base64Data, mediaType) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: PROMPT_OCR_KARTU },
          ],
        },
      ],
    }),
  })

  if (!response.ok) throw new Error(`Gagal menghubungi layanan pembaca kartu (status ${response.status})`)

  const data = await response.json()
  const teks = (data.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  let hasil
  try {
    hasil = JSON.parse(teks)
  } catch {
    throw new Error('Hasil pembacaan kartu tidak valid, coba foto ulang dengan pencahayaan lebih terang')
  }
  return hasil
}

// Cek apakah NIK hasil scan sudah terdaftar sebagai pasien di instansi ini
async function cekPasienByNik(instansiId, nik) {
  if (!nik) return null
  const { data, error } = await supabase
    .from('pasien')
    .select('*')
    .eq('instansi_id', instansiId)
    .eq('no_nik', nik)
    .maybeSingle()
  if (error) {
    console.error('Error cek pasien by NIK:', error.message)
    return null
  }
  return data
}

// ─── Modal kamera live: tampil setelah tombol utama diklik ─────────
function ModalKameraScan({ onAmbilFoto, onTutup, memproses, errorScan }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [siap, setSiap] = useState(false)
  const [errorKamera, setErrorKamera] = useState('')

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
        }
      } catch (err) {
        setErrorKamera(
          err.name === 'NotAllowedError'
            ? 'Izin kamera ditolak. Aktifkan izin kamera di browser untuk memindai kartu.'
            : 'Gagal mengakses kamera: ' + err.message
        )
      }
    }

    mulaiKamera()

    return () => {
      batal = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function tutupDanHentikan() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    onTutup()
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5">
        <p className="font-semibold text-gray-800 mb-1">📷 Scan Identitas</p>
        <p className="text-xs text-gray-500 mb-3">
          Posisikan KTP / KIA / KK rata di depan kamera, pastikan tulisan terbaca jelas, lalu tekan "Ambil Foto".
        </p>

        {errorKamera ? (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs mb-3">
            ⚠️ {errorKamera}
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden bg-black mb-3 aspect-[4/3]">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            {!siap && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-xs bg-black/40">
                Membuka kamera...
              </div>
            )}
            {siap && (
              <div className="absolute inset-6 border-2 border-teal-400 rounded-lg pointer-events-none" />
            )}
          </div>
        )}

        {errorScan && (
          <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
            ⚠️ {errorScan}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={tutupDanHentikan}
            disabled={memproses}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onAmbilFoto(videoRef.current)}
            disabled={!siap || memproses || !!errorKamera}
            className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {memproses ? '⏳ Membaca...' : 'Ambil Foto'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ScanIdentitas({ instansiId, onHasilBaru, disabled }) {
  const [showKamera, setShowKamera] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorScan, setErrorScan] = useState('')

  async function handleAmbilFoto(videoEl) {
    if (!videoEl) return
    setErrorScan('')
    setLoading(true)
    try {
      const base64 = ambilFrameKeBase64(videoEl)
      const hasilScan = await bacaKartuDenganAI(base64, 'image/jpeg')

      if (!hasilScan || hasilScan.jenis_kartu === 'tidak_dikenali') {
        setErrorScan('Kartu tidak terbaca. Pastikan foto jelas, tidak buram, dan pencahayaan cukup, lalu coba lagi.')
        setLoading(false)
        return
      }

      // Normalisasi status keluarga tiap anggota KK (kalau kartu KK)
      if (hasilScan.anggota_kk?.length) {
        hasilScan.anggota_kk = hasilScan.anggota_kk.map((a) => ({
          ...a,
          status_keluarga_value: mapStatusKeluargaKeValue(a.status_keluarga),
        }))
      }

      // Cek pasien lama berdasarkan NIK hasil scan (khusus KTP/KIA)
      let pasienLama = null
      if (hasilScan.jenis_kartu === 'ktp' || hasilScan.jenis_kartu === 'kia') {
        pasienLama = await cekPasienByNik(instansiId, hasilScan.nik)
      }

      setShowKamera(false)
      onHasilBaru?.({ hasilScan, pasienLama })
    } catch (err) {
      setErrorScan(err.message || 'Gagal memproses foto kartu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setShowKamera(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
      >
        📷 Scan Identitas (KTP / KIA / KK)
      </button>

      {showKamera && (
        <ModalKameraScan
          onAmbilFoto={handleAmbilFoto}
          onTutup={() => {
            setShowKamera(false)
            setErrorScan('')
          }}
          memproses={loading}
          errorScan={errorScan}
        />
      )}
    </div>
  )
}
