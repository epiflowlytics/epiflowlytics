import { useEffect, useRef, useState } from 'react'
import { createWorker } from 'tesseract.js'
import { supabase } from '../../../lib/supabaseClient'

/* ────────────────────────────────────────────────────────────────
   KOMPONEN: Scan Identitas (KTP / KIA / KK) via kamera live
   ────────────────────────────────────────────────────────────────
   Dipakai lewat kamera live (getUserMedia), BUKAN <input type="file"
   capture>, supaya konsisten jalan di semua perangkat: HP Android,
   iPhone, tablet, DAN laptop/PC (webcam). Atribut `capture` pada
   input file hanya bekerja di browser mobile — di desktop browser
   selalu fallback ke file picker biasa, makanya diganti ke sini.

   OCR dilakukan 100% LOKAL di browser petugas via Tesseract.js —
   foto KTP/KK TIDAK PERNAH dikirim ke server/API pihak ketiga mana
   pun. Ini sengaja dipilih demi privasi data pasien (NIK, alamat,
   dll adalah data sensitif). Konsekuensinya: akurasi lebih rendah
   dari OCR berbasis AI vision, jadi parsing di bawah dibuat cukup
   toleran + petugas WAJIB mengecek ulang hasilnya sebelum simpan.

   Cara pakai di form pendaftaran:

     import ScanIdentitas from './ScanIdentitas'

     <ScanIdentitas
       instansiId={profile.instansi_id}
       onHasilBaru={(data) => {
         // data.pasienLama -> baris pasien dari tabel `pasien` kalau NIK cocok
         // data.hasilScan  -> hasil OCR lokal {nik, nama_lengkap, ...}
         //   - data.hasilScan._peringatan   -> ada isinya kalau NIK/no_kk
         //     tidak terbaca lengkap 16 digit. Tampilkan supaya petugas
         //     tahu harus mengecek/mengetik manual field itu.
         //   - data.hasilScan._teks_mentah_ocr -> teks mentah hasil OCR,
         //     berguna untuk debug kalau parsing regex meleset.
         // isi form kamu di sini, atau tampilkan popup konfirmasi.
         // KARENA OCR LOKAL AKURASINYA LEBIH RENDAH DARI AI VISION,
         // SELALU MINTA PETUGAS MENGECEK ULANG HASILNYA SEBELUM SIMPAN.
       }}
     />

   Tidak mengubah skema database. Hanya butuh kolom yang sudah ada
   di tabel `pasien` (no_nik, nama_lengkap, tanggal_lahir, dst).
   ──────────────────────────────────────────────────────────────── */

// Baris label yang sering muncul di KTP/KK, dipakai buat membersihkan
// noise umum hasil OCR (mis. "NIK :" ikut terbaca sebelum nomornya)
const BULAN_ID = {
  jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', jun: '06',
  jul: '07', agu: '08', sep: '09', okt: '10', nov: '11', des: '12',
}

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

// ─── Worker Tesseract dibuat sekali & dipakai ulang (hemat waktu init) ──
let workerPromise = null
function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker('ind', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round((m.progress || 0) * 100))
        }
      },
    })
  }
  return workerPromise
}

function bersihkanBaris(teks) {
  return teks
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
}

function cariNilaiSetelahLabel(baris, labelRegex) {
  for (const b of baris) {
    const m = b.match(labelRegex)
    if (m && m[1]) return m[1].trim().replace(/^[:.\s]+/, '')
  }
  return null
}

// Ambil urutan 16 digit angka (mentolerir spasi di antara digit, umum
// terjadi pada hasil OCR NIK)
function cariAngka16Digit(teksGabung) {
  const bersih = teksGabung.replace(/[^0-9\n]/g, (c) => (c === '\n' ? '\n' : ' '))
  const m = bersih.match(/\d(?:\s?\d){15}/)
  return m ? m[0].replace(/\s/g, '') : null
}

function parseTanggalLahir(teks) {
  // Format umum di KTP: 17-08-1998 atau 17 08 1998
  const m = teks.match(/(\d{1,2})[\s\-/](\d{1,2})[\s\-/](\d{4})/)
  if (m) {
    const [, dd, mm, yyyy] = m
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  // Format alternatif: 17 Agustus 1998
  const m2 = teks.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (m2) {
    const [, dd, bulanTeks, yyyy] = m2
    const kunci = bulanTeks.toLowerCase().slice(0, 3)
    const mm = BULAN_ID[kunci]
    if (mm) return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
  }
  return null
}

function tentukanJenisKartu(teksGabung) {
  const t = teksGabung.toUpperCase()
  if (t.includes('KARTU KELUARGA')) return 'kk'
  if (t.includes('IDENTITAS ANAK') || t.includes('KARTU IDENTITAS ANAK')) return 'kia'
  if (t.includes('NIK') || t.includes('PROVINSI') || t.includes('KEWARGANEGARAAN')) return 'ktp'
  return 'tidak_dikenali'
}

function parseHasilOcr(teksMentah) {
  const baris = bersihkanBaris(teksMentah)
  const teksGabung = baris.join('\n')
  const jenisKartu = tentukanJenisKartu(teksGabung)

  if (jenisKartu === 'tidak_dikenali') {
    return { jenis_kartu: 'tidak_dikenali' }
  }

  const nikAtauKk = cariAngka16Digit(teksGabung)

  const namaMentah =
    cariNilaiSetelahLabel(baris, /nama\s*(?:lengkap)?\s*[:\.]?\s*(.+)/i) ||
    cariNilaiSetelahLabel(baris, /kepala\s*keluarga\s*[:\.]?\s*(.+)/i)

  const tempatTanggalLahir = cariNilaiSetelahLabel(
    baris,
    /tempat\s*(?:\/?\s*tgl)?\s*lahir\s*[:\.]?\s*(.+)/i
  )

  let tempatLahir = null
  let tanggalLahir = null
  if (tempatTanggalLahir) {
    tanggalLahir = parseTanggalLahir(tempatTanggalLahir)
    // Bagian sebelum koma/tanggal biasanya nama tempat lahir
    const bagianTempat = tempatTanggalLahir.split(/[,]|\d{1,2}[\s\-/]/)[0]
    tempatLahir = bagianTempat ? bagianTempat.trim().replace(/[:.\-]+$/, '') || null : null
  }
  if (!tanggalLahir) {
    tanggalLahir = parseTanggalLahir(teksGabung)
  }

  let jenisKelamin = null
  if (/\bLAKI[\s-]?LAKI\b/i.test(teksGabung)) jenisKelamin = 'L'
  else if (/\bPEREMPUAN\b/i.test(teksGabung)) jenisKelamin = 'P'

  const alamat = cariNilaiSetelahLabel(baris, /alamat\s*[:\.]?\s*(.+)/i)
  const pekerjaan = cariNilaiSetelahLabel(baris, /pekerjaan\s*[:\.]?\s*(.+)/i)

  const hasil = {
    jenis_kartu: jenisKartu,
    nik: jenisKartu !== 'kk' ? nikAtauKk : null,
    no_kk: jenisKartu === 'kk' ? nikAtauKk : null,
    nama_lengkap: namaMentah || null,
    tempat_lahir: tempatLahir,
    tanggal_lahir: tanggalLahir,
    jenis_kelamin: jenisKelamin,
    alamat: alamat || null,
    pekerjaan: pekerjaan || null,
    anggota_kk: null,
    // teks mentah disertakan supaya petugas bisa cek manual kalau parsing meleset
    _teks_mentah_ocr: teksGabung,
  }

  return hasil
}

async function bacaKartuDenganOcrLokal(base64Data, onProgress) {
  const worker = await getWorker(onProgress)
  const {
    data: { text },
  } = await worker.recognize(`data:image/jpeg;base64,${base64Data}`)

  if (!text || !text.trim()) {
    throw new Error('Tidak ada tulisan yang terbaca. Pastikan kartu rata, tidak buram, dan cahaya cukup.')
  }

  const hasil = parseHasilOcr(text)

  // NIK/no_kk wajib 16 digit — kalau parsing gagal dapatkan itu, anggap
  // hasil terlalu lemah untuk dipakai otomatis
  const nomorUtama = hasil.jenis_kartu === 'kk' ? hasil.no_kk : hasil.nik
  if (!nomorUtama || nomorUtama.length !== 16) {
    hasil._peringatan = 'Nomor NIK/KK tidak terbaca penuh (16 digit). Mohon cek dan lengkapi manual.'
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
function ModalKameraScan({ onAmbilFoto, onTutup, memproses, errorScan, progresOcr }) {
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
            {memproses
              ? progresOcr > 0
                ? `⏳ Membaca... ${progresOcr}%`
                : '⏳ Membaca...'
              : 'Ambil Foto'}
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
  const [progresOcr, setProgresOcr] = useState(0)

  async function handleAmbilFoto(videoEl) {
    if (!videoEl) return
    setErrorScan('')
    setProgresOcr(0)
    setLoading(true)
    try {
      const base64 = ambilFrameKeBase64(videoEl)
      const hasilScan = await bacaKartuDenganOcrLokal(base64, setProgresOcr)

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
      setProgresOcr(0)
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
          progresOcr={progresOcr}
        />
      )}
    </div>
  )
}
