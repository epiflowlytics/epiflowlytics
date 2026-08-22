import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { buatHtmlKartuRekamMedis, cetakKartuRekamMedis } from './utils/cetakKartuRekamMedis'

// ─── KOMPONEN MANDIRI: Tabel Riwayat Pemeriksaan ala Kartu Rekam Medis ──
// Dipakai di form pendaftaran & popup konfirmasi pasien lama. Loket hanya
// MELIHAT (read-only) — kolom klinis (Anamnesa, Diagnosa, Therapy/Tindakan,
// ICD X, Paraf) diisi oleh akun perawat/dokter di masing-masing poli, bukan
// oleh loket. Sel yang belum diisi ditampilkan strip (-). Semua riwayat
// ditampilkan, tidak dibatasi jumlah (tidak ada limit 10).
export default function TabelRiwayatPemeriksaan({ riwayat, loading, dataPasien, instansi, profile }) {
  // Panel "Lihat riwayat pemeriksaan" terbuka/tertutup DI DALAM kolom/card
  // ini juga (bukan modal/popup terpisah), supaya petugas tetap bisa lihat
  // riwayat sambil mengisi form pemeriksaan di sebelahnya. Isinya kartu
  // rekam medis PENUH, sama persis dengan hasil Cetak (F4).
  const [panelLihatTerbuka, setPanelLihatTerbuka] = useState(false)

  // Berkas RM fisik (foto/scan/PDF) yang diupload untuk pasien ini.
  const [berkasList, setBerkasList] = useState([])
  const [berkasLoading, setBerkasLoading] = useState(false)
  const [uploadingBerkas, setUploadingBerkas] = useState(false)
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
    // Buat signed URL (bucket privat) untuk tiap berkas supaya bisa ditampilkan/diunduh.
    const denganUrl = await Promise.all(
      (data || []).map(async (b) => {
        const { data: signed } = await supabase
          .storage
          .from('berkas-rm')
          .createSignedUrl(b.path_storage, 60 * 60) // berlaku 1 jam
        return { ...b, url: signed?.signedUrl || null }
      })
    )
    setBerkasList(denganUrl)
    setBerkasLoading(false)
  }

  useEffect(() => {
    muatBerkasRm(pasienId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasienId])

  async function handleUploadBerkas(fileList, tipe) {
    if (!fileList || fileList.length === 0 || !pasienId || !instansi?.id) return
    setErrorBerkas('')
    setUploadingBerkas(true)
    try {
      for (const file of Array.from(fileList)) {
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
            nama_file: file.name,
            tipe_file: tipe,
            path_storage: path,
            ukuran_bytes: file.size,
            diupload_oleh: profile?.id || null,
          })
        if (insertError) throw insertError
      }
      await muatBerkasRm(pasienId)
      setPanelLihatTerbuka(true)
    } catch (err) {
      setErrorBerkas(err?.message || 'Gagal upload berkas. Coba lagi.')
    } finally {
      setUploadingBerkas(false)
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
          <p className="text-[11px] text-blue-600 w-full">Mengunggah berkas...</p>
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
          Kontennya HTML kartu yang sama persis dengan hasil Cetak (F4),
          dirender lewat <iframe srcDoc>. Tingginya dibatasi (max-h) dan
          bisa discroll ke bawah kalau riwayatnya panjang. */}
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

          <iframe
            title="Pratinjau Kartu Rekam Medis"
            srcDoc={buatHtmlKartuRekamMedis(dataPasien, instansi, riwayat, berkasList)}
            className="w-full h-96 bg-gray-100"
          />

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
