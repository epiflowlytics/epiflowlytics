import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { kategoriUmur, hitungUmur } from './utils/pasienHelpers'
import { OPSI_PERIODE, hitungRentangPeriode, labelPeriode } from './utils/periodeHelpers'
import { hitungRekap } from './utils/rekapRiwayatPendaftaran'
import { formatDiagnosa, cekPD3I, cekSKDR } from './utils/diagnosaHelpers'
import { buatPdfLaporanRiwayatPendaftaran, downloadPdfRiwayatPendaftaran } from './utils/exportPdfRiwayatPendaftaran'
import { downloadExcelRiwayatPendaftaran } from './utils/exportExcelRiwayatPendaftaran'

// ─── KOMPONEN MANDIRI: Riwayat Pendaftaran (dengan filter periode,
// rekap L/P + klaster umur, preview, dan download PDF/Excel) ──────
// Menggantikan panel "Riwayat Pendaftaran Terakhir" yang sebelumnya
// ada di DashboardLoket.jsx (dulu dibatasi 20 data & tanpa filter).
// Query data dilakukan mandiri di sini (tidak bergantung state
// dashboard) supaya bisa difilter per hari/minggu/bulan/tahun/custom
// tanpa mengganggu data live dashboard utama.
export default function RiwayatPendaftaran({ instansiId, instansi }) {
  const [periode, setPeriode] = useState('hari')
  const [customMulai, setCustomMulai] = useState('')
  const [customAkhir, setCustomAkhir] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewTipe, setPreviewTipe] = useState('pdf') // 'pdf' | 'excel'

  const { mulai, akhir } = hitungRentangPeriode(periode, customMulai, customAkhir)

  const fetchData = useCallback(async () => {
    if (!instansiId) return
    setLoading(true)
    setError('')
    const { data, error: errFetch } = await supabase
      .from('kunjungan')
      .select(`
        id, poli_id, kategori_pasien, status, status_panggil, nomor_antrian, created_at, tanggal_periksa,
        pasien:pasien_id ( nama_lengkap, jenis_kelamin, tanggal_lahir, no_rekam_medis, alamat, no_nik, no_bpjs, wilayah ),
        poli:poli_id ( nama_poli ),
        pemeriksaan ( diagnosis, kode_icd, adalah_pd3i, nama_pd3i, adalah_skdr )
      `)
      .eq('instansi_id', instansiId)
      .gte('tanggal_periksa', mulai)
      .lte('tanggal_periksa', akhir)
      .neq('status', 'batal')
      .order('tanggal_periksa', { ascending: false })
      .order('created_at', { ascending: false })

    if (errFetch) {
      console.error('Error fetch riwayat pendaftaran:', errFetch.message)
      setError('Gagal memuat data riwayat pendaftaran.')
      setRows([])
      setLoading(false)
      return
    }

    setRows(data || [])
    setLoading(false)
  }, [instansiId, mulai, akhir])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const rekap = hitungRekap(rows)
  const labelPeriodeStr = labelPeriode(periode, mulai, akhir)
  const totalPD3I = rows.filter((r) => cekPD3I(r.pemeriksaan)).length
  const totalSKDR = rows.filter((r) => cekSKDR(r.pemeriksaan)).length

  function bukaPreviewPdf() {
    const doc = buatPdfLaporanRiwayatPendaftaran(rows, instansi, periode, mulai, akhir)
    const url = doc.output('bloburl')
    setPreviewUrl(url)
    setPreviewTipe('pdf')
    setShowPreview(true)
  }

  function unduhPdf() {
    downloadPdfRiwayatPendaftaran(rows, instansi, periode, mulai, akhir, `riwayat-pendaftaran-${mulai}_${akhir}.pdf`)
  }

  function unduhExcel() {
    downloadExcelRiwayatPendaftaran(rows, instansi, periode, mulai, akhir, `riwayat-pendaftaran-${mulai}_${akhir}.xlsx`)
  }

  function tutupPreview() {
    setShowPreview(false)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
  }

  return (
    <div className="flex flex-col">
      <div className="mb-2 shrink-0">
        <h2 className="flex items-center gap-1.5 font-bold text-gray-800 text-sm sm:text-base mb-2">
          <i className="ti ti-history text-teal-600" style={{ fontSize: '16px' }} aria-hidden="true"></i>
          Riwayat Pendaftaran
        </h2>

        {/* Filter periode — full width di mobile supaya mudah disentuh */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5">
          <select
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            className="w-full sm:w-auto border border-gray-200 rounded-lg px-2 py-2 sm:py-1 text-xs bg-white text-gray-700"
          >
            {OPSI_PERIODE.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {periode === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customMulai}
                onChange={(e) => setCustomMulai(e.target.value)}
                className="flex-1 sm:flex-none border border-gray-200 rounded-lg px-2 py-2 sm:py-1 text-xs"
              />
              <span className="text-xs text-gray-400">s/d</span>
              <input
                type="date"
                value={customAkhir}
                onChange={(e) => setCustomAkhir(e.target.value)}
                className="flex-1 sm:flex-none border border-gray-200 rounded-lg px-2 py-2 sm:py-1 text-xs"
              />
            </div>
          )}

          {/* Tombol aksi — grid 2 kolom di mobile agar mudah disentuh, sebaris di desktop */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5">
            <button
              type="button"
              onClick={bukaPreviewPdf}
              disabled={loading}
              className="flex items-center justify-center gap-1 text-xs px-2 py-2 sm:py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-transform active:scale-95 touch-manipulation"
            >
              <i className="ti ti-eye" style={{ fontSize: '13px' }} aria-hidden="true"></i>
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={unduhPdf}
              disabled={loading || rows.length === 0}
              className="flex items-center justify-center gap-1 text-xs px-2 py-2 sm:py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-transform active:scale-95 touch-manipulation"
            >
              <i className="ti ti-file-type-pdf text-red-500" style={{ fontSize: '13px' }} aria-hidden="true"></i>
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={unduhExcel}
              disabled={loading || rows.length === 0}
              className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 text-xs px-2 py-2 sm:py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-transform active:scale-95 touch-manipulation"
            >
              <i className="ti ti-file-spreadsheet text-green-600" style={{ fontSize: '13px' }} aria-hidden="true"></i>
              <span>Download Excel</span>
            </button>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-1.5 shrink-0">Periode: {labelPeriodeStr}</p>

      {/* Rekap ringkas — 4 kolom di mobile (Total, L, P, PD3I saja supaya ringkas),
          8 kolom lengkap mulai md ke atas */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5 mb-2 shrink-0">
        <div className="bg-gray-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-gray-400">Total</p>
          <p className="text-sm font-bold text-gray-800">{rekap.total}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-blue-400">Laki-laki</p>
          <p className="text-sm font-bold text-blue-700">{rekap.lakiLaki}</p>
        </div>
        <div className="bg-pink-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-pink-400">Perempuan</p>
          <p className="text-sm font-bold text-pink-700">{rekap.perempuan}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-red-400">PD3I</p>
          <p className="text-sm font-bold text-red-700">{totalPD3I}</p>
        </div>
        <div className="hidden md:block bg-yellow-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-yellow-500">Tak Diketahui</p>
          <p className="text-sm font-bold text-yellow-700">{rekap.tidakDiketahui}</p>
        </div>
        <div className="hidden md:block bg-teal-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-teal-500">Umum</p>
          <p className="text-sm font-bold text-teal-700">{rekap.umum}</p>
        </div>
        <div className="hidden md:block bg-indigo-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-indigo-400">BPJS</p>
          <p className="text-sm font-bold text-indigo-700">{rekap.bpjs}</p>
        </div>
        <div className="hidden md:block bg-orange-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-orange-400">SKDR Alert</p>
          <p className="text-sm font-bold text-orange-700">{totalSKDR}</p>
        </div>
      </div>

      {/* Rekap tambahan (Tak Diketahui, Umum, BPJS, SKDR) khusus mobile,
          supaya tetap terlihat tanpa scroll horizontal */}
      <div className="grid grid-cols-4 md:hidden gap-1.5 mb-2 shrink-0">
        <div className="bg-yellow-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-yellow-500">Tdk Diketahui</p>
          <p className="text-sm font-bold text-yellow-700">{rekap.tidakDiketahui}</p>
        </div>
        <div className="bg-teal-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-teal-500">Umum</p>
          <p className="text-sm font-bold text-teal-700">{rekap.umum}</p>
        </div>
        <div className="bg-indigo-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-indigo-400">BPJS</p>
          <p className="text-sm font-bold text-indigo-700">{rekap.bpjs}</p>
        </div>
        <div className="bg-orange-50 rounded-lg p-1.5 text-center">
          <p className="text-[9px] text-orange-400">SKDR</p>
          <p className="text-sm font-bold text-orange-700">{totalSKDR}</p>
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mb-2 shrink-0">{error}</p>}

      {/* Daftar pasien */}
      {loading ? (
        <p className="text-xs text-gray-400">Memuat data...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400">Tidak ada pendaftaran pada periode ini.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── Tampilan KARTU — mobile & tablet (< sm), lebih mudah dibaca
              daripada tabel 15 kolom yang harus discroll ke samping ── */}
          <div className="sm:hidden flex flex-col gap-2">
            {rows.map((r, i) => {
              const kategori = kategoriUmur(r.pasien?.tanggal_lahir, r.tanggal_periksa)
              const umurStr = hitungUmur(r.pasien?.tanggal_lahir, r.tanggal_periksa)
              const jk = r.pasien?.jenis_kelamin
              const wilayah = r.pasien?.wilayah === 'dalam' ? 'Dalam Wilayah' : r.pasien?.wilayah === 'luar' ? 'Luar Wilayah' : null
              const isPD3I = cekPD3I(r.pemeriksaan)
              const isSKDR = cekSKDR(r.pemeriksaan)
              const isAlert = isPD3I || isSKDR
              const diagnosaStr = formatDiagnosa(r.pemeriksaan)
              return (
                <div
                  key={r.id}
                  className={`rounded-xl border p-3 ${isAlert ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 text-sm truncate">
                        {i + 1}. {r.pasien?.nama_lengkap || '-'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        RM {r.pasien?.no_rekam_medis || '-'}
                        {umurStr ? ` · ${umurStr}` : ''}
                        {jk ? ` · ${jk}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${
                      r.kategori_pasien === 'bpjs' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'
                    }`}>
                      {r.kategori_pasien?.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <span>{r.poli?.nama_poli || '-'} · {new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={isAlert ? 'font-semibold text-red-600' : ''}>
                      {isAlert ? (isPD3I && isSKDR ? 'Alert PD3I & SKDR' : isPD3I ? 'Alert PD3I' : 'Alert SKDR') : (r.status || '-')}
                    </span>
                  </div>

                  {(kategori.label || wilayah || diagnosaStr || r.pasien?.no_nik || r.pasien?.no_bpjs || r.pasien?.alamat) && (
                    <div className="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                      {kategori.label && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${kategori.warna}`}>{kategori.label}</span>
                      )}
                      {wilayah && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{wilayah}</span>}
                      {diagnosaStr && <span className="text-[10px] text-gray-400">Dx: {diagnosaStr}</span>}
                    </div>
                  )}
                  {(r.pasien?.no_nik || r.pasien?.no_bpjs || r.pasien?.alamat) && (
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      {r.pasien?.no_nik ? `NIK ${r.pasien.no_nik}` : ''}
                      {r.pasien?.no_bpjs ? ` · BPJS ${r.pasien.no_bpjs}` : ''}
                      {r.pasien?.alamat ? ` · ${r.pasien.alamat}` : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Tampilan TABEL — layar sm ke atas, sesuai desain asli ── */}
          <div className="hidden sm:block overflow-x-auto overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                {/* Baris header 1 — "Umur" merentang 2 kolom (L & P) */}
                <tr className="text-left text-gray-400 text-xs border-b">
                  <th className="py-1 pr-2" rowSpan={2}>No</th>

                  <th className="py-1.5 pr-2" rowSpan={2}>Tanggal</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>Jam</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>No. RM</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>No. NIK</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>No. BPJS</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>Nama</th>
                  <th className="py-1.5 pr-2 text-center" colSpan={2}>Umur</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>Klaster Umur</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>Alamat</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>Poli</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>Kategori</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>Asal</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>Diagnosa</th>
                  <th className="py-1.5 pr-2" rowSpan={2}>Status</th>
                </tr>
                {/* Baris header 2 — sub-kolom L dan P */}
                <tr className="text-left text-gray-400 text-xs border-b">
                  <th className="py-1.5 pr-2 text-center text-blue-400">L</th>
                  <th className="py-1.5 pr-2 text-center text-pink-400">P</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const kategori = kategoriUmur(r.pasien?.tanggal_lahir, r.tanggal_periksa)
                  const umurStr = hitungUmur(r.pasien?.tanggal_lahir, r.tanggal_periksa)
                  const jk = r.pasien?.jenis_kelamin
                  const wilayah = r.pasien?.wilayah === 'dalam' ? 'DW' : r.pasien?.wilayah === 'luar' ? 'LW' : '-'
                  const isPD3I = cekPD3I(r.pemeriksaan)
                  const isSKDR = cekSKDR(r.pemeriksaan)
                  const isAlert = isPD3I || isSKDR
                  const diagnosaStr = formatDiagnosa(r.pemeriksaan)
                  return (
                    <tr key={r.id} className={`border-b last:border-0 ${isAlert ? 'bg-red-50' : ''}`}>
                      <td className="py-2 pr-2 text-gray-500 text-center">{i + 1}</td>
                      <td className="py-2 pr-2 text-gray-500 whitespace-nowrap">
                        {new Date(r.tanggal_periksa).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-2 pr-2 text-gray-500">
                        {new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2 pr-2 text-gray-500">{r.pasien?.no_rekam_medis || '-'}</td>
                      <td className="py-2 pr-2 text-gray-500">{r.pasien?.no_nik || '-'}</td>
                      <td className="py-2 pr-2 text-gray-500">{r.pasien?.no_bpjs || '-'}</td>
                      <td className="py-2 pr-2">{r.pasien?.nama_lengkap || '-'}</td>
                      {/* Kolom Umur L — diisi hanya jika laki-laki */}
                      <td className="py-2 pr-2 text-center text-blue-600 whitespace-nowrap">
                        {jk === 'L' ? umurStr : ''}
                      </td>
                      {/* Kolom Umur P — diisi hanya jika perempuan */}
                      <td className="py-2 pr-2 text-center text-pink-600 whitespace-nowrap">
                        {jk === 'P' ? umurStr : ''}
                      </td>
                      <td className="py-2 pr-2">
                        {kategori.label ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${kategori.warna}`}>{kategori.label}</span>
                        ) : '-'}
                      </td>
                      <td className="py-2 pr-2 text-gray-500">{r.pasien?.alamat || '-'}</td>
                      <td className="py-2 pr-2">{r.poli?.nama_poli || '-'}</td>
                      <td className="py-2 pr-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          r.kategori_pasien === 'bpjs' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'
                        }`}>
                          {r.kategori_pasien?.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-gray-500 text-center">{wilayah}</td>
                      <td className="py-2 pr-2 text-gray-500">{diagnosaStr}</td>
                      <td className="py-2 pr-2 text-gray-500">{r.status || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Preview — isi PDF identik dengan hasil download,
          karena keduanya berasal dari buatPdfLaporanRiwayatPendaftaran(). */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-0 sm:p-4">
          <div className="bg-white sm:rounded-2xl shadow-xl w-full sm:max-w-5xl h-full sm:h-[85vh] flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-3 border-b">
              <p className="font-semibold text-gray-700 text-sm">Preview Laporan — {labelPeriodeStr}</p>
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                <button
                  type="button"
                  onClick={unduhPdf}
                  className="text-xs px-3 py-2 sm:py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 touch-manipulation"
                >
                  📄 Download PDF
                </button>
                <button
                  type="button"
                  onClick={tutupPreview}
                  className="text-xs px-3 py-2 sm:py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 touch-manipulation"
                >
                  Tutup
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {previewUrl && (
                <iframe src={previewUrl} title="Preview Laporan Riwayat Pendaftaran" className="w-full h-full border-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}