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
   dll adalah data sensitif).

   KARENA akurasi Tesseract.js jauh di bawah OCR berbasis AI vision
   (terutama utk deretan angka NIK 16 digit), komponen ini TIDAK
   langsung memanggil onHasilBaru setelah OCR selesai. Alurnya:

     1. Kamera ambil foto -> OCR jalan -> hasil di-parse
     2. Muncul MODAL KONFIRMASI wajib: NIK & field lain ditampilkan
        dalam input yang BISA DIEDIT petugas
     3. Petugas WAJIB menekan "Konfirmasi & Gunakan" (atau "Scan
        Ulang" kalau hasilnya terlalu kacau) sebelum data diteruskan
     4. Baru setelah konfirmasi, onHasilBaru dipanggil dengan data
        yang SUDAH divalidasi mata petugas

   Ini FLOW WAJIB, bukan opsional — cek NIK ke database pasien lama
   (cekPasienByNik) juga baru dijalankan SETELAH konfirmasi, supaya
   tidak mencari NIK yang salah baca dari OCR.

   Cara pakai di form pendaftaran:

     import ScanIdentitas from './ScanIdentitas'

     <ScanIdentitas
       instansiId={profile.instansi_id}
       onHasilBaru={(data) => {
         // data.pasienLama -> baris pasien dari tabel `pasien` kalau NIK
         //   (yang SUDAH dikonfirmasi petugas) cocok dengan data lama
         // data.hasilScan  -> hasil OCR yang SUDAH dikonfirmasi/diedit
         //   petugas lewat modal konfirmasi, bukan hasil OCR mentah
         // isi form kamu di sini, atau tampilkan popup konfirmasi lanjutan.
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
  const [flashTersedia, setFlashTersedia] = useState(false)
  const [flashNyala, setFlashNyala] = useState(false)

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

        // Cek apakah track kamera mendukung flash/torch (umumnya Chrome Android)
        const track = stream.getVideoTracks()[0]
        const kapabilitas = track?.getCapabilities?.()
        if (kapabilitas?.torch) {
          setFlashTersedia(true)
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
      const track = streamRef.current?.getVideoTracks()[0]
      track?.applyConstraints?.({ advanced: [{ torch: false }] }).catch(() => {})
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function toggleFlash() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const nyalaBaru = !flashNyala
      await track.applyConstraints({ advanced: [{ torch: nyalaBaru }] })
      setFlashNyala(nyalaBaru)
    } catch {
      setErrorKamera('Gagal mengaktifkan flash pada kamera ini.')
    }
  }

  function tutupDanHentikan() {
    const track = streamRef.current?.getVideoTracks()[0]
    track?.applyConstraints?.({ advanced: [{ torch: false }] }).catch(() => {})
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
            {flashTersedia && siap && (
              <button
                type="button"
                onClick={toggleFlash}
                className={`absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-base ${
                  flashNyala ? 'bg-yellow-400 text-gray-900' : 'bg-black/50 text-white'
                }`}
                title={flashNyala ? 'Matikan flash' : 'Nyalakan flash'}
              >
                {flashNyala ? '⚡' : '🔦'}
              </button>
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

// ─── Modal konfirmasi hasil scan: WAJIB dilewati sebelum data dipakai ──
// Menampilkan field hasil OCR dalam bentuk input yang bisa diedit,
// supaya petugas mengoreksi kesalahan baca OCR (terutama NIK) sebelum
// data dipakai untuk cari/simpan pasien.
function ModalKonfirmasiHasil({ hasilAwal, onKonfirmasi, onScanUlang }) {
  const [form, setForm] = useState(() => ({
    jenis_kartu: hasilAwal.jenis_kartu,
    nik: hasilAwal.nik || '',
    no_kk: hasilAwal.no_kk || '',
    nama_lengkap: hasilAwal.nama_lengkap || '',
    tempat_lahir: hasilAwal.tempat_lahir || '',
    tanggal_lahir: hasilAwal.tanggal_lahir || '',
    jenis_kelamin: hasilAwal.jenis_kelamin || '',
    alamat: hasilAwal.alamat || '',
    pekerjaan: hasilAwal.pekerjaan || '',
  }))

  const nomorUtamaKey = form.jenis_kartu === 'kk' ? 'no_kk' : 'nik'
  const nomorUtamaLabel = form.jenis_kartu === 'kk' ? 'Nomor KK' : 'NIK'
  const nomorUtamaValue = form[nomorUtamaKey]
  const nomorUtamaValid = /^\d{16}$/.test(nomorUtamaValue)

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleKonfirmasi() {
    if (!nomorUtamaValid) return // tombol seharusnya sudah disabled, ini jaga-jaga
    onKonfirmasi({ ...hasilAwal, ...form })
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[90] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 max-h-[90vh] overflow-y-auto">
        <p className="font-semibold text-gray-800 mb-1">✅ Konfirmasi Hasil Scan</p>
        <p className="text-xs text-gray-500 mb-3">
          Hasil pembacaan otomatis (OCR lokal) BISA SALAH, terutama pada angka. Cek dan koreksi field di bawah
          sebelum melanjutkan.
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-600">{nomorUtamaLabel} *</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={16}
              value={nomorUtamaValue}
              onChange={(e) => updateField(nomorUtamaKey, e.target.value.replace(/\D/g, ''))}
              className={`w-full mt-1 px-3 py-2 rounded-lg border text-base font-mono tracking-wider ${
                nomorUtamaValid ? 'border-gray-300' : 'border-red-400 bg-red-50'
              }`}
              placeholder="16 digit angka"
            />
            {!nomorUtamaValid && (
              <p className="text-xs text-red-600 mt-1">
                ⚠️ Harus persis 16 digit angka. Cocokkan langsung dengan kartu fisik ({nomorUtamaValue.length}/16
                digit terisi).
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Nama Lengkap</label>
            <input
              type="text"
              value={form.nama_lengkap}
              onChange={(e) => updateField('nama_lengkap', e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-600">Tempat Lahir</label>
              <input
                type="text"
                value={form.tempat_lahir}
                onChange={(e) => updateField('tempat_lahir', e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Tanggal Lahir</label>
              <input
                type="date"
                value={form.tanggal_lahir}
                onChange={(e) => updateField('tanggal_lahir', e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Jenis Kelamin</label>
            <select
              value={form.jenis_kelamin}
              onChange={(e) => updateField('jenis_kelamin', e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
            >
              <option value="">— Pilih —</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Alamat</label>
            <textarea
              value={form.alamat}
              onChange={(e) => updateField('alamat', e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Pekerjaan</label>
            <input
              type="text"
              value={form.pekerjaan}
              onChange={(e) => updateField('pekerjaan', e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onScanUlang}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold"
          >
            🔄 Scan Ulang
          </button>
          <button
            type="button"
            onClick={handleKonfirmasi}
            disabled={!nomorUtamaValid}
            className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Konfirmasi & Gunakan
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
  const [hasilMenungguKonfirmasi, setHasilMenungguKonfirmasi] = useState(null)

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

      // JANGAN langsung panggil onHasilBaru atau cek NIK ke database di
      // sini — hasil OCR mentah TIDAK BOLEH dipercaya begitu saja (lihat
      // catatan akurasi Tesseract.js di atas). Tutup kamera, buka modal
      // konfirmasi dulu; cek NIK & onHasilBaru baru jalan setelah
      // petugas mengonfirmasi/mengoreksi field-nya.
      setShowKamera(false)
      setHasilMenungguKonfirmasi(hasilScan)
    } catch (err) {
      setErrorScan(err.message || 'Gagal memproses foto kartu')
    } finally {
      setLoading(false)
      setProgresOcr(0)
    }
  }

  async function handleKonfirmasiHasil(hasilTerkonfirmasi) {
    setHasilMenungguKonfirmasi(null)

    // Cek pasien lama baru dijalankan SEKARANG, pakai NIK yang sudah
    // dikoreksi/dikonfirmasi petugas — bukan NIK mentah hasil OCR.
    let pasienLama = null
    if (hasilTerkonfirmasi.jenis_kartu === 'ktp' || hasilTerkonfirmasi.jenis_kartu === 'kia') {
      pasienLama = await cekPasienByNik(instansiId, hasilTerkonfirmasi.nik)
    }

    onHasilBaru?.({ hasilScan: hasilTerkonfirmasi, pasienLama })
  }

  function handleScanUlang() {
    setHasilMenungguKonfirmasi(null)
    setShowKamera(true)
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

      {hasilMenungguKonfirmasi && (
        <ModalKonfirmasiHasil
          hasilAwal={hasilMenungguKonfirmasi}
          onKonfirmasi={handleKonfirmasiHasil}
          onScanUlang={handleScanUlang}
        />
      )}
    </div>
  )
}
