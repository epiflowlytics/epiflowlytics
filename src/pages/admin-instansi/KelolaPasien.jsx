import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

export default function KelolaPasien() {
  const { profile } = useAuth()
  const instansiId = profile?.instansi_id

  const [pasienList, setPasienList] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [search, setSearch] = useState('')

  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedPasien, setSelectedPasien] = useState(null)
  const [riwayat, setRiwayat] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    if (instansiId) fetchPasien()
  }, [instansiId])

  async function fetchPasien() {
    setLoading(true)
    setListError('')
    const { data, error } = await supabase
      .from('pasien')
      .select('id, no_rekam_medis, nama_lengkap, tanggal_lahir, jenis_kelamin, alamat, no_nik, no_bpjs, kategori_pasien, wilayah, created_at')
      .eq('instansi_id', instansiId)
      .order('created_at', { ascending: false })

    if (error) {
      setListError('Gagal memuat data pasien: ' + error.message)
      setPasienList([])
    } else {
      setPasienList(data ?? [])
    }
    setLoading(false)
  }

  async function bukaDetail(pasien) {
    setSelectedPasien(pasien)
    setDetailOpen(true)
    setDetailError('')
    setLoadingDetail(true)
    setRiwayat([])

    const { data, error } = await supabase
      .from('kunjungan')
      .select(`
        id,
        tanggal_periksa,
        status,
        kategori_pasien,
        wilayah,
        poli:poli_id ( nama_poli ),
        pemeriksaan (
          id,
          anamnesis,
          diagnosis,
          kode_icd,
          tindakan,
          catatan,
          rujukan,
          tujuan_rujukan,
          dokter:dokter_id ( nama_lengkap )
        ),
        resep (
          id,
          nama_obat,
          dosis,
          aturan_pakai,
          jumlah,
          satuan_jumlah,
          bentuk_sediaan,
          status
        )
      `)
      .eq('pasien_id', pasien.id)
      .order('tanggal_periksa', { ascending: false })

    if (error) {
      setDetailError('Gagal memuat riwayat kunjungan: ' + error.message)
    } else {
      setRiwayat(data ?? [])
    }
    setLoadingDetail(false)
  }

  function tutupDetail() {
    setDetailOpen(false)
    setSelectedPasien(null)
    setRiwayat([])
  }

  function hitungUmur(tanggalLahir) {
    if (!tanggalLahir) return '—'
    const lahir = new Date(tanggalLahir)
    const sekarang = new Date()
    let umur = sekarang.getFullYear() - lahir.getFullYear()
    const belumUlangTahun =
      sekarang.getMonth() < lahir.getMonth() ||
      (sekarang.getMonth() === lahir.getMonth() && sekarang.getDate() < lahir.getDate())
    if (belumUlangTahun) umur--
    return `${umur} th`
  }

  function formatTanggal(tanggal) {
    if (!tanggal) return '—'
    return new Date(tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // =========================================================
  // EXPORT: ambil semua pasien + riwayat kunjungan lengkap
  // =========================================================
  async function fetchExportData() {
    const { data, error } = await supabase
      .from('pasien')
      .select(`
        id, no_rekam_medis, nama_lengkap, tanggal_lahir, jenis_kelamin, alamat, no_nik, no_bpjs, kategori_pasien, wilayah,
        kunjungan (
          id,
          tanggal_periksa,
          status,
          poli:poli_id ( nama_poli ),
          pemeriksaan (
            id,
            diagnosis,
            kode_icd,
            tindakan,
            rujukan,
            tujuan_rujukan,
            dokter:dokter_id ( nama_lengkap )
          ),
          resep (
            id,
            nama_obat,
            jumlah,
            satuan_jumlah
          )
        )
      `)
      .eq('instansi_id', instansiId)
      .order('nama_lengkap', { ascending: true })

    if (error) throw new Error(error.message)
    return buildExportRows(data ?? [])
  }

  function buildExportRows(pasienData) {
    const rows = []

    pasienData.forEach((p) => {
      const kunjunganList = [...(p.kunjungan ?? [])].sort(
        (a, b) => new Date(b.tanggal_periksa) - new Date(a.tanggal_periksa)
      )

      const dataDasar = {
        no_rekam_medis: p.no_rekam_medis || '',
        nama_lengkap: p.nama_lengkap || '',
        umur: hitungUmur(p.tanggal_lahir),
        jenis_kelamin: p.jenis_kelamin || '',
        kategori_pasien: p.kategori_pasien || '',
        wilayah: p.wilayah || '',
      }

      if (kunjunganList.length === 0) {
        rows.push({
          ...dataDasar,
          tanggal_periksa: '',
          poli: '',
          status: '',
          diagnosis: '',
          kode_icd: '',
          dokter: '',
          tindakan: '',
          rujukan: '',
          obat: '',
        })
        return
      }

      kunjunganList.forEach((k) => {
        const pemeriksaanList = k.pemeriksaan ?? []
        const resepList = k.resep ?? []

        rows.push({
          ...dataDasar,
          tanggal_periksa: formatTanggal(k.tanggal_periksa),
          poli: k.poli?.nama_poli ?? '',
          status: k.status ?? '',
          diagnosis: pemeriksaanList.map((pm) => pm.diagnosis).filter(Boolean).join('; '),
          kode_icd: pemeriksaanList.map((pm) => pm.kode_icd).filter(Boolean).join('; '),
          dokter: pemeriksaanList.map((pm) => pm.dokter?.nama_lengkap).filter(Boolean).join('; '),
          tindakan: pemeriksaanList.map((pm) => pm.tindakan).filter(Boolean).join('; '),
          rujukan: pemeriksaanList
            .filter((pm) => pm.rujukan)
            .map((pm) => pm.tujuan_rujukan || 'Ya')
            .join('; '),
          obat: resepList
            .map((r) => `${r.nama_obat}${r.jumlah ? ` (${r.jumlah}${r.satuan_jumlah || ''})` : ''}`)
            .join('; '),
        })
      })
    })

    return rows
  }

  async function downloadExcel() {
    setExporting(true)
    setExportError('')
    try {
      const rows = await fetchExportData()
      const XLSX = await import('xlsx')

      const worksheetData = rows.map((r) => ({
        'No. RM': r.no_rekam_medis,
        'Nama': r.nama_lengkap,
        'Umur': r.umur,
        'JK': r.jenis_kelamin,
        'Kategori': r.kategori_pasien,
        'Wilayah': r.wilayah,
        'Tgl Periksa': r.tanggal_periksa,
        'Poli': r.poli,
        'Status': r.status,
        'Diagnosis': r.diagnosis,
        'Kode ICD': r.kode_icd,
        'Dokter': r.dokter,
        'Tindakan': r.tindakan,
        'Rujukan': r.rujukan,
        'Obat Diberikan': r.obat,
      }))

      const ws = XLSX.utils.json_to_sheet(worksheetData)
      ws['!cols'] = [
        { wch: 12 }, { wch: 22 }, { wch: 7 }, { wch: 6 }, { wch: 12 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 10 }, { wch: 18 },
        { wch: 20 }, { wch: 16 }, { wch: 30 },
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data Pasien')
      XLSX.writeFile(wb, `data-pasien-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      setExportError('Gagal membuat file Excel: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  async function downloadPDF() {
    setExporting(true)
    setExportError('')
    try {
      const rows = await fetchExportData()
      const { jsPDF } = await import('jspdf')
      const autoTableModule = await import('jspdf-autotable')
      const autoTable = autoTableModule.default

      const doc = new jsPDF({ orientation: 'landscape' })
      doc.setFontSize(14)
      doc.text('Data Pasien & Riwayat Kunjungan', 14, 15)
      doc.setFontSize(9)
      doc.text(`Diunduh: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 14, 21)

      autoTable(doc, {
        startY: 26,
        head: [['No. RM', 'Nama', 'Umur/JK', 'Kategori', 'Wilayah', 'Tgl Periksa', 'Poli', 'Status', 'Diagnosis', 'Dokter', 'Obat Diberikan']],
        body: rows.map((r) => [
          r.no_rekam_medis,
          r.nama_lengkap,
          `${r.umur} / ${r.jenis_kelamin}`,
          r.kategori_pasien,
          r.wilayah,
          r.tanggal_periksa,
          r.poli,
          r.status,
          r.diagnosis,
          r.dokter,
          r.obat,
        ]),
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [124, 58, 237] },
        columnStyles: {
          8: { cellWidth: 40 },
          10: { cellWidth: 45 },
        },
      })

      doc.save(`data-pasien-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      setExportError('Gagal membuat file PDF: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const filteredList = pasienList.filter((p) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      p.nama_lengkap?.toLowerCase().includes(q) ||
      p.no_rekam_medis?.toLowerCase().includes(q) ||
      p.no_nik?.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Data Pasien</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Rekap data pasien beserta riwayat kunjungan, diagnosis, dan obat yang diberikan.
      </p>

      <div className="rounded-xl p-5 sm:p-6" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <p className="text-sm font-semibold">Daftar Pasien</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, no. RM, atau NIK..."
              className="w-full sm:w-64 px-3 py-2 rounded-lg text-sm"
              style={{ border: '1px solid var(--line)' }}
            />
            <div className="flex gap-2">
              <button
                onClick={downloadExcel}
                disabled={exporting}
                className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
                style={{ border: '1px solid var(--line)', opacity: exporting ? 0.6 : 1 }}
              >
                {exporting ? 'Memproses…' : '⬇ Excel'}
              </button>
              <button
                onClick={downloadPDF}
                disabled={exporting}
                className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
                style={{ border: '1px solid var(--line)', opacity: exporting ? 0.6 : 1 }}
              >
                {exporting ? 'Memproses…' : '⬇ PDF'}
              </button>
            </div>
          </div>
        </div>

        {exportError && (
          <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
            {exportError}
          </div>
        )}

        {listError && (
          <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
            {listError}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
            ))}
          </div>
        ) : filteredList.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {pasienList.length === 0 ? 'Belum ada data pasien terdaftar.' : 'Tidak ada pasien yang cocok dengan pencarian.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>No. RM</th>
                  <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>Nama</th>
                  <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>Umur / JK</th>
                  <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>Kategori</th>
                  <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--muted)' }}>Wilayah</th>
                  <th className="text-left py-2 font-semibold" style={{ color: 'var(--muted)' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="py-2.5 pr-4" style={{ color: 'var(--muted)' }}>{p.no_rekam_medis || '—'}</td>
                    <td className="py-2.5 pr-4 font-medium">{p.nama_lengkap}</td>
                    <td className="py-2.5 pr-4">{hitungUmur(p.tanggal_lahir)} / {p.jenis_kelamin || '—'}</td>
                    <td className="py-2.5 pr-4">{p.kategori_pasien || '—'}</td>
                    <td className="py-2.5 pr-4">{p.wilayah || '—'}</td>
                    <td className="py-2.5">
                      <button
                        onClick={() => bukaDetail(p)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ border: '1px solid var(--line)', color: 'var(--accent)' }}
                      >
                        Lihat Riwayat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(18,24,27,0.4)' }} onClick={tutupDetail} />
          <div
            className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{selectedPasien?.nama_lengkap}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  No. RM: {selectedPasien?.no_rekam_medis || '—'} &middot; {hitungUmur(selectedPasien?.tanggal_lahir)} &middot; {selectedPasien?.jenis_kelamin || '—'}
                </p>
                {selectedPasien?.no_nik && (
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>NIK: {selectedPasien.no_nik}</p>
                )}
                {selectedPasien?.no_bpjs && (
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>BPJS: {selectedPasien.no_bpjs}</p>
                )}
                {selectedPasien?.alamat && (
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Alamat: {selectedPasien.alamat}</p>
                )}
              </div>
              <button
                onClick={tutupDetail}
                className="text-xs font-medium px-3 py-1.5 rounded-lg shrink-0"
                style={{ border: '1px solid var(--line)' }}
              >
                Tutup
              </button>
            </div>

            <div className="h-px" style={{ background: 'var(--line)' }} />

            <p className="text-sm font-semibold">Riwayat Kunjungan</p>

            {detailError && (
              <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
                {detailError}
              </div>
            )}

            {loadingDetail ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
                ))}
              </div>
            ) : riwayat.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Belum ada riwayat kunjungan untuk pasien ini.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {riwayat.map((k) => (
                  <KunjunganCard key={k.id} kunjungan={k} formatTanggal={formatTanggal} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function KunjunganCard({ kunjungan, formatTanggal }) {
  const pemeriksaanList = kunjungan.pemeriksaan ?? []
  const resepList = kunjungan.resep ?? []

  return (
    <div className="rounded-lg p-4" style={{ border: '1px solid var(--line)', background: 'var(--bg)' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <p className="text-sm font-semibold">{formatTanggal(kunjungan.tanggal_periksa)}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Poli: {kunjungan.poli?.nama_poli ?? '—'}
          </p>
        </div>
        <StatusBadge status={kunjungan.status} />
      </div>

      {pemeriksaanList.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Belum ada catatan pemeriksaan.</p>
      ) : (
        pemeriksaanList.map((p) => (
          <div key={p.id} className="mb-3 last:mb-0 rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <p className="text-xs font-semibold mb-1">
              Diagnosis <span style={{ color: 'var(--muted)', fontWeight: 400 }}>&middot; {p.dokter?.nama_lengkap ?? 'Nakes tidak diketahui'}</span>
            </p>
            <p className="text-sm mb-1">{p.diagnosis || '—'} {p.kode_icd && <span style={{ color: 'var(--muted)' }}>({p.kode_icd})</span>}</p>
            {p.anamnesis && <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Anamnesis: {p.anamnesis}</p>}
            {p.tindakan && <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Tindakan: {p.tindakan}</p>}
            {p.rujukan && (
              <p className="text-xs mb-1" style={{ color: '#B45309' }}>
                Dirujuk ke: {p.tujuan_rujukan || '—'}
              </p>
            )}
            {p.catatan && <p className="text-xs" style={{ color: 'var(--muted)' }}>Catatan: {p.catatan}</p>}
          </div>
        ))
      )}

      {resepList.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold mb-1.5">Obat Diberikan</p>
          <div className="flex flex-col gap-1">
            {resepList.map((r) => (
              <div key={r.id} className="text-xs flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span className="font-medium">{r.nama_obat}</span>
                <span style={{ color: 'var(--muted)' }}>
                  {r.dosis && `${r.dosis} · `}
                  {r.jumlah ? `${r.jumlah} ${r.satuan_jumlah || ''}` : ''}
                  {r.bentuk_sediaan === 'puyer' ? ' · Diracik' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    menunggu: { bg: '#FEF3C7', color: '#92400E', label: 'Menunggu' },
    selesai: { bg: '#ECFDF5', color: '#059669', label: 'Selesai' },
    obat_kosong: { bg: '#FEF2F2', color: '#B91C1C', label: 'Obat Kosong' },
  }
  const s = map[status] || { bg: '#F1F5F9', color: '#475569', label: status || '—' }
  return (
    <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}
