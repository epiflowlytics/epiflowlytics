import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { OPSI_PERIODE, hitungRentangPeriode, labelPeriode } from './utils/periodeHelpers'
import { buatPdfLaporanRetribusi, downloadPdfRetribusi } from './utils/exportPdfRetribusi'
import { downloadExcelRetribusi } from './utils/exportExcelRetribusi'

// ─── KOMPONEN MANDIRI: Modal Retribusi Loket ──────────────────────
// File terpisah dari DashboardLoket.jsx supaya gampang di-maintain.
// Menampilkan rekap tagihan retribusi loket (pasien umum / BPJS tidak
// aktif) per periode, dan tombol "Stor" untuk menandai semua tagihan
// yang belum disetor dalam periode yang sedang ditampilkan sebagai
// sudah disetor ke bendahara.
//
// Sumber data: tabel tagihan_kunjungan (join kunjungan -> pasien, poli).
// Kolom status setor: disetor (boolean), disetor_pada, disetor_oleh.
export default function ModalRetribusi({ show, onClose, instansiId, instansi, petugasId }) {
  const [periode, setPeriode] = useState('hari')
  const [customMulai, setCustomMulai] = useState('')
  const [customAkhir, setCustomAkhir] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [storLoading, setStorLoading] = useState(false)
  const [storSukses, setStorSukses] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')

  const { mulai, akhir } = hitungRentangPeriode(periode, customMulai, customAkhir)
  const labelPeriodeStr = labelPeriode(periode, mulai, akhir)

  const fetchData = useCallback(async () => {
    if (!instansiId || !show) return
    setLoading(true)
    setError('')
    setStorSukses('')

    const { data, error: errFetch } = await supabase
      .from('tagihan_kunjungan')
      .select(`
        id, nominal, nama_layanan, disetor, disetor_pada, created_at,
        kunjungan:kunjungan_id (
          id, tanggal_periksa, poli_id, kategori_pasien, instansi_id,
          pasien:pasien_id ( nama_lengkap, no_rekam_medis ),
          poli:poli_id ( nama_poli )
        )
      `)
      .eq('kunjungan.instansi_id', instansiId)
      .gte('kunjungan.tanggal_periksa', mulai)
      .lte('kunjungan.tanggal_periksa', akhir)
      .order('created_at', { ascending: false })

    if (errFetch) {
      console.error('Error fetch retribusi loket:', errFetch.message)
      setError('Gagal memuat data retribusi.')
      setRows([])
      setLoading(false)
      return
    }

    // Supabase tetap mengembalikan baris walau relasi kunjungan null
    // (kalau filter .eq/.gte pada relasi tidak match) — buang baris begitu.
    const bersih = (data || []).filter((r) => r.kunjungan)
    setRows(bersih)
    setLoading(false)
  }, [instansiId, show, mulai, akhir])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Rekap per poli — hanya yang BELUM disetor, karena itu representasi
  // uang yang "sedang dipegang" petugas loket.
  const rekapPerPoli = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (r.disetor) continue
      const namaPoli = r.kunjungan?.poli?.nama_poli || 'Tanpa Poli'
      const existing = map.get(namaPoli) || { namaPoli, jumlahPasien: 0, total: 0 }
      existing.jumlahPasien += 1
      existing.total += Number(r.nominal || 0)
      map.set(namaPoli, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [rows])

  // Rekap per poli — SEMUA transaksi (disetor + belum), untuk melihat
  // total retribusi riil per loket/poli di periode yang dipilih,
  // terlepas dari status setor.
  const rekapPerPoliSemua = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const namaPoli = r.kunjungan?.poli?.nama_poli || 'Tanpa Poli'
      const existing = map.get(namaPoli) || { namaPoli, jumlahPasien: 0, total: 0 }
      existing.jumlahPasien += 1
      existing.total += Number(r.nominal || 0)
      map.set(namaPoli, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [rows])

  const totalSemua = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.nominal || 0), 0),
    [rows]
  )
  const jumlahSemua = rows.length

  const totalBelumDisetor = useMemo(
    () => rows.filter((r) => !r.disetor).reduce((sum, r) => sum + Number(r.nominal || 0), 0),
    [rows]
  )
  const jumlahBelumDisetor = useMemo(() => rows.filter((r) => !r.disetor).length, [rows])

  async function storSemua() {
    if (jumlahBelumDisetor === 0) return
    const konfirmasi = window.confirm(
      `Tandai ${jumlahBelumDisetor} transaksi (Rp ${totalBelumDisetor.toLocaleString('id-ID')}) sebagai sudah disetor?`
    )
    if (!konfirmasi) return

    setStorLoading(true)
    setError('')
    setStorSukses('')

    const idBelumDisetor = rows.filter((r) => !r.disetor).map((r) => r.id)

    const { error: errUpdate } = await supabase
      .from('tagihan_kunjungan')
      .update({
        disetor: true,
        disetor_pada: new Date().toISOString(),
        disetor_oleh: petugasId || null,
      })
      .in('id', idBelumDisetor)

    if (errUpdate) {
      console.error('Error stor retribusi:', errUpdate.message)
      setError('Gagal menyetor retribusi. Coba lagi.')
      setStorLoading(false)
      return
    }

    setStorSukses(`Berhasil menyetor ${idBelumDisetor.length} transaksi.`)
    setStorLoading(false)
    fetchData()
  }

  function bukaPreviewPdf() {
    const doc = buatPdfLaporanRetribusi(rows, rekapPerPoli, totalBelumDisetor, jumlahBelumDisetor, instansi, periode, mulai, akhir, rekapPerPoliSemua, totalSemua, jumlahSemua)
    const url = doc.output('bloburl')
    setPreviewUrl(url)
    setShowPreview(true)
  }

  function unduhPdf() {
    downloadPdfRetribusi(rows, rekapPerPoli, totalBelumDisetor, jumlahBelumDisetor, instansi, periode, mulai, akhir, `retribusi-loket-${mulai}_${akhir}.pdf`, rekapPerPoliSemua, totalSemua, jumlahSemua)
  }

  function unduhExcel() {
    downloadExcelRetribusi(rows, rekapPerPoli, totalBelumDisetor, jumlahBelumDisetor, instansi, periode, mulai, akhir, `retribusi-loket-${mulai}_${akhir}.xlsx`, rekapPerPoliSemua, totalSemua, jumlahSemua)
  }

  function tutupPreview() {
    setShowPreview(false)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
  }

  if (!show) return null

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 bg-black/50 flex items-center justify-center sm:inset-0 sm:p-4 sm:!bottom-0"
      style={{ bottom: 'calc(60px + env(safe-area-inset-bottom))' }}
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-2xl shadow-xl w-full h-full sm:h-auto sm:max-w-3xl sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 shrink-0 border-b border-gray-200">
          <button
            type="button"
            onClick={onClose}
            aria-label="Kembali"
            className="sm:hidden shrink-0 p-1.5 -ml-1.5 rounded-lg text-gray-500 touch-manipulation"
          >
            <i className="ti ti-arrow-left text-lg" aria-hidden="true"></i>
          </button>
          <h2 className="text-base sm:text-lg font-bold text-gray-800 flex-1 sm:flex-none">💵 Retribusi Loket</h2>
          <div className="hidden sm:flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={bukaPreviewPdf}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              👁️ Preview
            </button>
            <button
              type="button"
              onClick={unduhPdf}
              disabled={loading || rows.length === 0}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              📄 PDF
            </button>
            <button
              type="button"
              onClick={unduhExcel}
              disabled={loading || rows.length === 0}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50"
            >
              📊 Excel
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">

        {/* Tombol aksi (Preview/PDF/Excel) — khusus mobile, ditumpuk penuh
            lebar di bawah header supaya tidak padat berjejer seperti di
            desktop. Fungsinya sama persis dengan tombol header desktop. */}
        <div className="sm:hidden grid grid-cols-3 gap-2 mb-4">
          <button
            type="button"
            onClick={bukaPreviewPdf}
            disabled={loading}
            className="text-xs px-2 py-2 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50 touch-manipulation"
          >
            👁️ Preview
          </button>
          <button
            type="button"
            onClick={unduhPdf}
            disabled={loading || rows.length === 0}
            className="text-xs px-2 py-2 rounded-lg bg-red-50 text-red-600 disabled:opacity-50 touch-manipulation"
          >
            📄 PDF
          </button>
          <button
            type="button"
            onClick={unduhExcel}
            disabled={loading || rows.length === 0}
            className="text-xs px-2 py-2 rounded-lg bg-green-50 text-green-600 disabled:opacity-50 touch-manipulation"
          >
            📊 Excel
          </button>
        </div>


        {/* Filter periode */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {OPSI_PERIODE.map((opsi) => (
            <button
              key={opsi.value}
              type="button"
              onClick={() => setPeriode(opsi.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                periode === opsi.value
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-gray-200 text-gray-600 hover:border-emerald-400'
              }`}
            >
              {opsi.label}
            </button>
          ))}
        </div>

        {periode === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="date"
              value={customMulai}
              onChange={(e) => setCustomMulai(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm"
            />
            <span className="text-gray-400 text-sm">s/d</span>
            <input
              type="date"
              value={customAkhir}
              onChange={(e) => setCustomAkhir(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
        )}

        <p className="text-xs text-gray-400 mb-4">Periode: {labelPeriodeStr}</p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">
            {error}
          </div>
        )}
        {storSukses && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-2.5 text-sm">
            ✅ {storSukses}
          </div>
        )}

        {/* Rekap total (semua transaksi) */}
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-4">
          <p className="text-xs text-sky-600 font-medium">Total retribusi periode ini (semua transaksi)</p>
          <p className="text-2xl font-bold text-sky-800">
            Rp {totalSemua.toLocaleString('id-ID')}
          </p>
          <p className="text-xs text-sky-600 mt-0.5">{jumlahSemua} transaksi — termasuk yang sudah disetor</p>
        </div>

        {/* Rekap total & tombol Stor */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-emerald-600 font-medium">Total belum disetor</p>
            <p className="text-2xl font-bold text-emerald-800">
              Rp {totalBelumDisetor.toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">{jumlahBelumDisetor} transaksi</p>
          </div>
          <button
            type="button"
            onClick={storSemua}
            disabled={storLoading || jumlahBelumDisetor === 0}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {storLoading ? 'Memproses...' : '📥 Stor Sekarang'}
          </button>
        </div>

        {/* Rekap per poli — semua transaksi */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Rekap per Poli (semua transaksi)</p>
          {rekapPerPoliSemua.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Tidak ada transaksi retribusi pada periode ini.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {rekapPerPoliSemua.map((r) => (
                <div key={r.namaPoli} className="border border-sky-200 bg-sky-50/40 rounded-xl p-3">
                  <p className="text-sm font-medium text-gray-700 truncate" title={r.namaPoli}>
                    {r.namaPoli}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{r.jumlahPasien} pasien</p>
                  <p className="text-lg font-bold text-sky-700">
                    Rp {r.total.toLocaleString('id-ID')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rekap per poli — hanya belum disetor */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Rekap per Poli (belum disetor)</p>
          {rekapPerPoli.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Tidak ada tagihan yang belum disetor pada periode ini.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {rekapPerPoli.map((r) => (
                <div key={r.namaPoli} className="border rounded-xl p-3">
                  <p className="text-sm font-medium text-gray-700 truncate" title={r.namaPoli}>
                    {r.namaPoli}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{r.jumlahPasien} pasien</p>
                  <p className="text-lg font-bold text-emerald-700">
                    Rp {r.total.toLocaleString('id-ID')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Daftar transaksi */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Daftar Transaksi</p>
          {loading ? (
            <p className="text-xs text-gray-400 py-4 text-center">Memuat data...</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Belum ada transaksi retribusi pada periode ini.</p>
          ) : (
            <>
              {/* ── Tampilan kartu — layar kecil (HP) ── */}
              <div className="sm:hidden space-y-2">
                {rows.map((r) => (
                  <div key={r.id} className="border rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {r.kunjungan?.pasien?.nama_lengkap || '-'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          No. RM {r.kunjungan?.pasien?.no_rekam_medis || '-'}
                        </p>
                      </div>
                      {r.disetor ? (
                        <span className="shrink-0 inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium whitespace-nowrap">
                          Sudah disetor
                        </span>
                      ) : (
                        <span className="shrink-0 inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium whitespace-nowrap">
                          Belum
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>{r.kunjungan?.poli?.nama_poli || '-'}</span>
                      <span>
                        {r.kunjungan?.tanggal_periksa
                          ? new Date(r.kunjungan.tanggal_periksa).toLocaleDateString('id-ID')
                          : '-'}
                      </span>
                    </div>
                    <p className="text-right text-sm font-semibold text-gray-800">
                      Rp {Number(r.nominal || 0).toLocaleString('id-ID')}
                    </p>
                  </div>
                ))}
              </div>

              {/* ── Tampilan tabel — layar besar (desktop/tablet) ── */}
              <div className="hidden sm:block overflow-x-auto border rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Tanggal</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Nama</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">No. RM</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Poli</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Nominal</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {r.kunjungan?.tanggal_periksa
                            ? new Date(r.kunjungan.tanggal_periksa).toLocaleDateString('id-ID')
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{r.kunjungan?.pasien?.nama_lengkap || '-'}</td>
                        <td className="px-3 py-2 text-gray-500">{r.kunjungan?.pasien?.no_rekam_medis || '-'}</td>
                        <td className="px-3 py-2 text-gray-500">{r.kunjungan?.poli?.nama_poli || '-'}</td>
                        <td className="px-3 py-2 text-right text-gray-700 font-medium whitespace-nowrap">
                          Rp {Number(r.nominal || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.disetor ? (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium">
                              Sudah Distor
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium">
                              Belum
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {/* Modal Preview — isi PDF identik dengan hasil download,
          karena keduanya berasal dari buatPdfLaporanRetribusi(). */}
      {showPreview && (
        <div
          className="fixed inset-x-0 top-0 z-50 bg-black/50 flex items-center justify-center sm:inset-0 sm:p-4 sm:!bottom-0"
          style={{ bottom: 'calc(60px + env(safe-area-inset-bottom))' }}
        >
          <div className="bg-white sm:rounded-2xl shadow-xl w-full h-full sm:h-[85vh] sm:max-w-5xl flex flex-col">
            <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b shrink-0">
              <button
                type="button"
                onClick={tutupPreview}
                aria-label="Kembali"
                className="sm:hidden shrink-0 p-1.5 -ml-1.5 rounded-lg text-gray-500 touch-manipulation"
              >
                <i className="ti ti-arrow-left text-lg" aria-hidden="true"></i>
              </button>
              <p className="font-semibold text-gray-700 text-sm flex-1 truncate">Preview Laporan — {labelPeriodeStr}</p>
              <button
                type="button"
                onClick={unduhPdf}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 shrink-0"
              >
                📄 <span className="hidden sm:inline">Download PDF</span>
              </button>
              <button
                type="button"
                onClick={tutupPreview}
                className="hidden sm:block text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
              >
                Tutup
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {previewUrl && (
                <iframe src={previewUrl} title="Preview Laporan Retribusi Loket" className="w-full h-full border-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}