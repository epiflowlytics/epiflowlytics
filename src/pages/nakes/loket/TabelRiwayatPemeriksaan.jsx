import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { buatHtmlKartuRekamMedis, cetakKartuRekamMedis } from './utils/cetakKartuRekamMedis'

// Bungkus HTML kartu RM (yang aslinya berukuran fisik kertas F4, jauh lebih
// lebar dari layar HP) dengan sedikit CSS+JS TAMBAHAN khusus mode pratinjau
// di dalam <iframe>. HTML aslinya dari buatHtmlKartuRekamMedis() TIDAK
// diubah/disalin ulang di sini — hanya dibungkus dari luar — supaya:
// 1) isi & susunan kartu tetap PERSIS sama seperti sebelumnya (identitas,
//    tabel riwayat, dst — tidak ada yang dirombak),
// 2) hasil Cetak (F4) via cetakKartuRekamMedis() sama sekali tidak
//    terpengaruh, karena fungsi itu memakai HTML asli tanpa bungkus ini.
// Triknya: setelah halaman iframe selesai dimuat, ukur lebar asli kontennya
// (scrollWidth), lalu terapkan `transform: scale()` supaya lebarnya pas
// dengan lebar iframe yang tersedia (tanpa perlu geser kiri/kanan lagi).
// Tinggi iframe ikut disesuaikan (via postMessage) supaya tidak ada scroll
// vertikal ganda (scroll di iframe DAN scroll di luar iframe).
function buatHtmlPratinjauFit(htmlAsli) {
  const skripPenyesuai = `
    <script>
      function sesuaikanSkala() {
        var body = document.body
        body.style.transformOrigin = 'top left'
        body.style.transform = 'scale(1)'
        var lebarAsli = body.scrollWidth
        var lebarTersedia = window.innerWidth
        var skala = lebarAsli > lebarTersedia ? (lebarTersedia / lebarAsli) : 1
        body.style.transform = 'scale(' + skala + ')'
        var tinggiAsli = body.scrollHeight
        window.parent.postMessage(
          { jenis: 'tinggiKartuRm', tinggi: Math.ceil(tinggiAsli * skala) },
          '*'
        )
      }
      window.addEventListener('load', sesuaikanSkala)
      window.addEventListener('resize', sesuaikanSkala)
    </script>
  `
  // Sisipkan tepat sebelum penutup </body> supaya semua elemen kartu sudah
  // ada di DOM saat skrip ini jalan.
  return htmlAsli.replace('</body>', skripPenyesuai + '</body>')
}

// Kompresi foto sebelum upload — resize sisi terpanjang ke maks 1600px +
// kualitas JPEG 70%. Diperkuat dari versi awal (2000px/85%) karena
// beberapa HP menghasilkan foto kamera 4000-5000px+ sisi terpanjang yang
// masih jadi 10MB+ meski sudah "dikompres" di kualitas 85%. 1600px sudah
// lebih dari cukup tajam untuk dibaca (termasuk tulisan tangan) dan
// dicetak di ukuran F4 — riset umum untuk dokumen teks menyebut kisaran
// 1200-1600px sudah tajam di ukuran kertas seperti ini. Hasil tipikal:
// foto 11MB turun ke kira-kira 200-400KB. PDF tidak disentuh sama sekali.
const MAKS_SISI_FOTO = 1600
const KUALITAS_FOTO = 0.7

function kompresGambar(file) {
  return new Promise((resolve) => {
    // Bukan gambar (mis. HEIC yang tidak didukung <img>, atau file aneh) ->
    // biarkan lolos apa adanya, jangan sampai upload gagal karena kompresi.
    if (!file.type.startsWith('image/')) {
      resolve(file)
      return
    }

    const img = new Image()
    const urlSementara = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(urlSementara)

      let { width, height } = img
      if (width > MAKS_SISI_FOTO || height > MAKS_SISI_FOTO) {
        if (width >= height) {
          height = Math.round((height * MAKS_SISI_FOTO) / width)
          width = MAKS_SISI_FOTO
        } else {
          width = Math.round((width * MAKS_SISI_FOTO) / height)
          height = MAKS_SISI_FOTO
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            // Gagal compress -> pakai file asli daripada gagal total.
            resolve(file)
            return
          }
          // Kalau hasil kompresi malah lebih besar dari asli (jarang terjadi,
          // biasanya file kecil), pakai yang asli saja.
          if (blob.size >= file.size) {
            resolve(file)
            return
          }
          const namaBaru = file.name.replace(/\.[^.]+$/, '') + '.jpg'
          resolve(new File([blob], namaBaru, { type: 'image/jpeg', lastModified: Date.now() }))
        },
        'image/jpeg',
        KUALITAS_FOTO
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(urlSementara)
      // Gagal load sebagai gambar -> upload apa adanya.
      resolve(file)
    }

    img.src = urlSementara
  })
}

// Jalankan sekumpulan tugas async dengan batas concurrency, supaya tidak
// membanjiri koneksi (terutama di HP dg sinyal lemah) tapi tetap jauh lebih
// cepat daripada satu-satu berurutan.
async function jalankanDenganBatas(items, batas, tugas) {
  const hasil = []
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      hasil[i] = await tugas(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(batas, items.length) }, worker)
  await Promise.all(workers)
  return hasil
}

// ─── KOMPONEN MANDIRI: Tabel Riwayat Pemeriksaan ala Kartu Rekam Medis ──
// Dipakai di form pendaftaran & popup konfirmasi pasien lama. Loket hanya
// MELIHAT (read-only) — kolom klinis (Anamnesa, Diagnosa, Therapy/Tindakan,
// ICD X, Paraf) diisi oleh akun perawat/dokter di masing-masing poli, bukan
// oleh loket. Sel yang belum diisi ditampilkan strip (-). Semua riwayat
// ditampilkan, tidak dibatasi jumlah (tidak ada limit 10).
export default function TabelRiwayatPemeriksaan({ riwayat, loading, dataPasien, instansi, profile, bukaOtomatis = false }) {
  // Panel "Lihat riwayat pemeriksaan" — TETAP DI DALAM kolom/card ini
  // ... (lihat komentar di bawah pada elemen <iframe>).
  const [panelLihatTerbuka, setPanelLihatTerbuka] = useState(bukaOtomatis)
  // Tinggi iframe pratinjau kartu RM, dihitung otomatis dari konten asli
  // (dikirim lewat postMessage oleh skrip sesuaikanSkala di dalam iframe).
  // Dibatasi max supaya panel tidak jadi sangat panjang kalau riwayatnya
  // banyak — tetap bisa discroll VERTIKAL (bukan horizontal lagi) di luar iframe.
  const [tinggiIframeKartuRm, setTinggiIframeKartuRm] = useState(384) // fallback h-96

  // Berkas RM fisik (foto/scan/PDF) yang diupload untuk pasien ini.
  const [berkasList, setBerkasList] = useState([])
  const [berkasLoading, setBerkasLoading] = useState(false)
  const [uploadingBerkas, setUploadingBerkas] = useState(false)
  const [progresUpload, setProgresUpload] = useState(null) // { selesai, total }
  const [errorBerkas, setErrorBerkas] = useState('')
  const inputFotoRef = useRef(null)
  const inputPdfRef = useRef(null)

  const pasienId = dataPasien?.id

  async function muatBerkasRm(idPasien) {
    if (!idPasien) { setBerkasList([]); return }
    setBerkasLoading(true)
    const { data, error } = await supabase
      .from('berkas_rm')
      .select('id, nama_file, tipe_file, path_storage, dibuat_pada')
      .eq('pasien_id', idPasien)
      .order('dibuat_pada', { ascending: false })
    if (error) {
      setBerkasLoading(false)
      return
    }
    // Buat signed URL (bucket privat) untuk SEMUA berkas dalam 1 request
    // batch (bukan N request satu-satu) — createSignedUrls (plural) dari
    // Supabase Storage menerima array path sekaligus.
    const daftarPath = (data || []).map((b) => b.path_storage)
    let petaUrl = {}
    if (daftarPath.length > 0) {
      const { data: signedList, error: signedError } = await supabase
        .storage
        .from('berkas-rm')
        .createSignedUrls(daftarPath, 60 * 60) // berlaku 1 jam
      if (!signedError && signedList) {
        signedList.forEach((s) => {
          if (s.path) petaUrl[s.path] = s.signedUrl || null
        })
      }
    }
    const denganUrl = (data || []).map((b) => ({ ...b, url: petaUrl[b.path_storage] || null }))
    setBerkasList(denganUrl)
    setBerkasLoading(false)
  }

  useEffect(() => {
    muatBerkasRm(pasienId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasienId])

  useEffect(() => {
    if (bukaOtomatis) setPanelLihatTerbuka(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bukaOtomatis, pasienId])

  // Terima tinggi konten asli kartu RM dari skrip sesuaikanSkala di dalam
  // iframe (lihat buatHtmlPratinjauFit di atas), supaya iframe tidak perlu
  // scroll vertikal sendiri lagi (panel luar yang scroll, sekali saja).
  useEffect(() => {
    function onPesan(e) {
      if (e?.data?.jenis === 'tinggiKartuRm' && typeof e.data.tinggi === 'number') {
        const TINGGI_MIN = 200
        const TINGGI_MAKS = 900 // batas atas supaya panel tidak jadi sangat panjang
        setTinggiIframeKartuRm(Math.min(TINGGI_MAKS, Math.max(TINGGI_MIN, e.data.tinggi)))
      }
    }
    window.addEventListener('message', onPesan)
    return () => window.removeEventListener('message', onPesan)
  }, [])

  async function handleUploadBerkas(fileList, tipe) {
    if (!fileList || fileList.length === 0 || !pasienId || !instansi?.id) return
    setErrorBerkas('')
    setUploadingBerkas(true)
    const semuaFile = Array.from(fileList)
    setProgresUpload({ selesai: 0, total: semuaFile.length })

    const gagal = []
    try {
      // Maks 3 file diupload bersamaan — jauh lebih cepat dari satu-satu,
      // tapi tidak membanjiri koneksi (penting utk HP dg sinyal lemah).
      await jalankanDenganBatas(semuaFile, 3, async (fileAsli) => {
        try {
          // Titik #1: foto dikompres dulu sebelum upload (PDF lolos apa adanya).
          const file = tipe === 'foto' ? await kompresGambar(fileAsli) : fileAsli

          const ekstensi = file.name.split('.').pop()
          const namaAcak = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ekstensi}`
          const path = `${instansi.id}/${pasienId}/${namaAcak}`

          const { error: uploadError } = await supabase
            .storage
            .from('berkas-rm')
            .upload(path, file, { contentType: file.type, upsert: false })
          if (uploadError) throw uploadError

          const { error: insertError } = await supabase
            .from('berkas_rm')
            .insert({
              pasien_id: pasienId,
              instansi_id: instansi.id,
              nama_file: fileAsli.name, // nama asli tetap ditampilkan ke user
              tipe_file: tipe,
              path_storage: path,
              ukuran_bytes: file.size,
              diupload_oleh: profile?.id || null,
            })
          if (insertError) throw insertError
        } catch (err) {
          gagal.push(fileAsli.name)
        } finally {
          setProgresUpload((prev) => ({ selesai: (prev?.selesai || 0) + 1, total: semuaFile.length }))
        }
      })

      await muatBerkasRm(pasienId)
      setPanelLihatTerbuka(true)
      if (gagal.length > 0) {
        setErrorBerkas(`Gagal upload: ${gagal.join(', ')}. Berkas lain berhasil.`)
      }
    } catch (err) {
      setErrorBerkas(err?.message || 'Gagal upload berkas. Coba lagi.')
    } finally {
      setUploadingBerkas(false)
      setProgresUpload(null)
      if (inputFotoRef.current) inputFotoRef.current.value = ''
      if (inputPdfRef.current) inputPdfRef.current.value = ''
    }
  }

  async function handleHapusBerkas(berkas) {
    if (!window.confirm(`Hapus berkas "${berkas.nama_file}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setErrorBerkas('')
    const { error: storageError } = await supabase.storage.from('berkas-rm').remove([berkas.path_storage])
    if (storageError) { setErrorBerkas(storageError.message); return }
    const { error: dbError } = await supabase.from('berkas_rm').delete().eq('id', berkas.id)
    if (dbError) { setErrorBerkas(dbError.message); return }
    setBerkasList((prev) => prev.filter((b) => b.id !== berkas.id))
  }

  return (
    <div className="mb-4 bg-white border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500">Riwayat Pemeriksaan Sebelumnya</p>
      </div>

      {/* Tombol upload berkas RM fisik — hasil foto/scan kertas RM asli.
          Galerinya SENGAJA tidak ditampilkan di sini; berkas akan tampil
          menyatu di dalam Kartu Rekam Medis (area merge di bawah identitas),
          sama persis baik di pratinjau "Lihat" maupun hasil Cetak (F4). */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap border rounded-xl p-3 bg-gray-50">
        <p className="text-[11px] font-semibold text-gray-500">📁 Berkas RM Fisik (Foto/Scan)</p>
        <div className="flex gap-1.5 items-center">
          <input
            ref={inputFotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleUploadBerkas(e.target.files, 'foto')}
          />
          <input
            ref={inputPdfRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleUploadBerkas(e.target.files, 'pdf')}
          />
          <button
            type="button"
            disabled={!pasienId || uploadingBerkas}
            onClick={() => inputFotoRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            📷 Foto
          </button>
          <button
            type="button"
            disabled={!pasienId || uploadingBerkas}
            onClick={() => inputPdfRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            📄 PDF
          </button>
        </div>
        {uploadingBerkas && (
          <p className="text-[11px] text-blue-600 w-full">
            Mengunggah berkas{progresUpload ? ` (${progresUpload.selesai}/${progresUpload.total})` : '...'}
          </p>
        )}
        {errorBerkas && (
          <p className="text-[11px] text-red-600 w-full">{errorBerkas}</p>
        )}
        {!pasienId && (
          <p className="text-[11px] text-gray-400 w-full">Simpan/pilih data pasien dulu sebelum upload berkas.</p>
        )}
        {pasienId && berkasList.length > 0 && (
          <div className="w-full flex flex-wrap gap-1.5">
            {berkasList.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1 text-[10px] bg-white border rounded-full pl-2 pr-1 py-0.5">
                {b.tipe_file === 'foto' ? '📷' : '📄'} {b.nama_file.length > 16 ? b.nama_file.slice(0, 16) + '…' : b.nama_file}
                <button
                  type="button"
                  onClick={() => handleHapusBerkas(b)}
                  title="Hapus berkas"
                  className="w-3.5 h-3.5 rounded-full text-red-500 hover:bg-red-50 leading-none"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <p className="text-xs text-gray-400 text-center py-3">Memuat riwayat...</p>
      )}

      {!loading && riwayat.length === 0 && (
        <div className="text-center py-3">
          <p className="text-xs text-gray-400 mb-2">Belum ada riwayat pemeriksaan.</p>
          <button
            type="button"
            onClick={() => setPanelLihatTerbuka((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-[11px] font-semibold"
          >
            {panelLihatTerbuka ? '🔽 Tutup riwayat pemeriksaan' : '👁️ Lihat riwayat pemeriksaan'}
          </button>
        </div>
      )}

      {!loading && riwayat.length > 0 && (
        <div className="overflow-x-auto overflow-y-auto max-h-80 border rounded-xl">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 whitespace-nowrap">
                  Poli/Tanggal
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 min-w-[160px]">
                  Anamnesa dan Pemeriksaan Fisik
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 min-w-[120px]">
                  Diagnosa
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 min-w-[130px]">
                  Therapy/Tindakan
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 whitespace-nowrap">
                  ICD X
                </th>
                <th className="text-left align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 whitespace-nowrap">
                  Paraf
                </th>
                <th className="text-center align-middle font-medium text-gray-600 px-2 py-2 border border-gray-200 whitespace-nowrap">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-2 border border-gray-200 align-top whitespace-nowrap">
                    <span className="font-medium text-gray-700">{r.poli?.nama_poli || 'Poli tidak diketahui'}</span>
                    <span className="text-gray-400"> · {r.tanggal_periksa}</span>
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700">
                    {r.anamnesa || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700">
                    {r.diagnosa || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700">
                    {r.therapy_tindakan || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700 whitespace-nowrap">
                    {r.icd_x || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-gray-700 whitespace-nowrap">
                    {r.paraf || '-'}
                  </td>
                  <td className="px-2 py-2 border border-gray-200 align-top text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setPanelLihatTerbuka(true)}
                      className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-[11px] font-semibold"
                    >
                      👁️ Lihat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Panel "Lihat riwayat pemeriksaan" — TETAP DI DALAM kolom/card ini
          (bukan modal/popup yang menutupi layar), supaya petugas bisa cek
          riwayat sambil tetap mengisi form pemeriksaan di sebelahnya.
          Kontennya HTML kartu yang SAMA PERSIS dengan hasil Cetak (F4) —
          tidak dirombak sama sekali — hanya di-scale otomatis (lihat
          buatHtmlPratinjauFit) supaya pas dengan lebar layar HP, tidak
          perlu geser kiri-kanan lagi. Tinggi iframe menyesuaikan konten
          (postMessage), dan panel luar yang menangani scroll VERTIKAL kalau
          riwayatnya panjang, bukan iframe-nya sendiri. */}
      {panelLihatTerbuka && (
        <div className="mt-3 border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
            <p className="text-xs font-semibold text-gray-600">
              Kartu Rekam Medis — {dataPasien?.nama_lengkap || '-'}
            </p>
            <button
              type="button"
              onClick={() => setPanelLihatTerbuka(false)}
              className="text-gray-400 hover:text-gray-600 text-sm leading-none shrink-0"
            >
              ✕
            </button>
          </div>

          <div className="overflow-y-auto overflow-x-hidden bg-gray-100" style={{ maxHeight: 480 }}>
            <iframe
              title="Pratinjau Kartu Rekam Medis"
              srcDoc={buatHtmlPratinjauFit(buatHtmlKartuRekamMedis(dataPasien, instansi, riwayat, berkasList))}
              className="w-full border-0 block"
              style={{ height: tinggiIframeKartuRm }}
              scrolling="no"
            />
          </div>

          <div className="px-3 py-2 border-t bg-gray-50">
            <button
              type="button"
              onClick={() => cetakKartuRekamMedis(dataPasien, instansi, riwayat, berkasList)}
              className="w-full py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold"
            >
              🖨️ Cetak Kartu RM (F4)
            </button>
          </div>
        </div>
      )}
    </div>

  )
}