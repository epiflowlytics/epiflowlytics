/* ────────────────────────────────────────────────────────────────
   KOMPONEN: Popup Hasil Scan Identitas
   ────────────────────────────────────────────────────────────────
   Ditampilkan setelah ScanIdentitas selesai membaca kartu.
   - Kalau pasienLama ada -> tampilkan ringkasan data lama + tombol
     "Gunakan Data Ini" (lanjut daftar kunjungan tanpa isi ulang form)
     dan "Update dari Hasil Scan" (kalau ada data yang berubah).
   - Kalau pasienLama tidak ada -> tampilkan hasil OCR mentah untuk
     dikonfirmasi, lalu tombol "Isi ke Form" mengisi form pasien baru.

   Cara pakai:
     <PopupHasilScan
       data={hasilScanState}         // {hasilScan, pasienLama}
       onGunakanDataLama={(p) => ...}
       onIsiFormBaru={(hasilScan) => ...}
       onUpdateDariScan={(p, hasilScan) => ...}
       onTutup={() => setHasilScanState(null)}
     />
   ──────────────────────────────────────────────────────────────── */

function baris(label, value) {
  return (
    <tr className="border-t border-gray-100">
      <td className="px-2.5 py-1 text-gray-400 w-28 align-top text-xs">{label}</td>
      <td className="px-2.5 py-1 text-gray-700 text-xs">{value || '-'}</td>
    </tr>
  )
}

function adaPerbedaan(pasienLama, hasilScan) {
  if (!pasienLama || !hasilScan) return false
  const bandingkan = ['nama_lengkap', 'alamat', 'tempat_lahir', 'tanggal_lahir', 'jenis_kelamin']
  return bandingkan.some((k) => {
    const a = (pasienLama[k] || '').toString().trim()
    const b = (hasilScan[k] || '').toString().trim()
    return b && a !== b
  })
}

export default function PopupHasilScan({ data, onGunakanDataLama, onIsiFormBaru, onUpdateDariScan, onTutup }) {
  if (!data) return null
  const { hasilScan, pasienLama } = data

  // Kasus: kartu KK di-scan -> tampilkan daftar anggota keluarga
  if (hasilScan.jenis_kartu === 'kk') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4" onClick={onTutup}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
          <p className="font-semibold text-gray-800 mb-1">📋 Kartu Keluarga Terbaca</p>
          <p className="text-xs text-gray-500 mb-3">
            No. KK: <b>{hasilScan.no_kk || '-'}</b> — {hasilScan.anggota_kk?.length || 0} anggota terdeteksi.
            Pilih anggota yang akan didaftarkan, atau isi manual di form.
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto mb-4">
            {(hasilScan.anggota_kk || []).map((a, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onIsiFormBaru({ ...hasilScan, ...a, jenis_kartu: 'ktp' })}
                className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-teal-400 hover:bg-teal-50 text-sm"
              >
                <span className="font-medium text-gray-700">{a.nama_lengkap}</span>
                <span className="text-xs text-gray-400 block">{a.status_keluarga || '-'}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onTutup}
            className="w-full py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    )
  }

  // Kasus: pasien lama ditemukan berdasarkan NIK
  if (pasienLama) {
    const beda = adaPerbedaan(pasienLama, hasilScan)
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4" onClick={onTutup}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
          <p className="font-semibold text-gray-800 mb-1">✅ Pasien Sudah Terdaftar</p>
          <p className="text-xs text-gray-500 mb-3">
            NIK hasil scan cocok dengan data pasien lama. Tidak perlu isi ulang form.
          </p>
          <table className="w-full mb-3 border border-gray-100 rounded-lg overflow-hidden">
            <tbody>
              {baris('No. RM', pasienLama.no_rekam_medis)}
              {baris('Nama', pasienLama.nama_lengkap)}
              {baris('NIK', pasienLama.no_nik)}
              {baris('Alamat', pasienLama.alamat)}
              {baris('Lahir', [pasienLama.tempat_lahir, pasienLama.tanggal_lahir].filter(Boolean).join(', '))}
            </tbody>
          </table>

          {beda && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-700">
              ⚠️ Ada perbedaan antara data lama dan hasil scan barusan (misal alamat berubah). Gunakan tombol
              "Update dari Scan" kalau memang datanya perlu diperbarui.
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onGunakanDataLama(pasienLama)}
              className="w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
            >
              Gunakan Data Ini — Lanjut Daftar
            </button>
            {beda && (
              <button
                type="button"
                onClick={() => onUpdateDariScan(pasienLama, hasilScan)}
                className="w-full py-2 rounded-lg border border-amber-400 text-amber-700 text-sm font-semibold"
              >
                Update dari Hasil Scan
              </button>
            )}
            <button
              type="button"
              onClick={onTutup}
              className="w-full py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Kasus: pasien baru, tampilkan hasil OCR untuk dikonfirmasi
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4" onClick={onTutup}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold text-gray-800 mb-1">🆕 Pasien Baru Terdeteksi</p>
        <p className="text-xs text-gray-500 mb-3">
          NIK belum terdaftar. Hasil pembacaan kartu di bawah — cek dulu sebelum diisi ke form.
        </p>
        <table className="w-full mb-4 border border-gray-100 rounded-lg overflow-hidden">
          <tbody>
            {baris('Nama', hasilScan.nama_lengkap)}
            {baris('NIK', hasilScan.nik)}
            {baris('Alamat', hasilScan.alamat)}
            {baris('Lahir', [hasilScan.tempat_lahir, hasilScan.tanggal_lahir].filter(Boolean).join(', '))}
            {baris('Jenis Kelamin', hasilScan.jenis_kelamin === 'L' ? 'Laki-laki' : hasilScan.jenis_kelamin === 'P' ? 'Perempuan' : '-')}
          </tbody>
        </table>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onTutup}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onIsiFormBaru(hasilScan)}
            className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
          >
            Isi ke Form
          </button>
        </div>
      </div>
    </div>
  )
}
