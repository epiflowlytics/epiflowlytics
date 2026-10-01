import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabaseClient'

/**
 * PesananDiterima — tab "Pesanan Diterima", sejajar dengan "Pesanan Baru".
 *
 * Alur:
 *  - Semua pesanan yang tersimpan dari PesananBaru (status = 'diproses') otomatis
 *    muncul di sini sebagai "Perlu Verifikasi" (verifikasi_hasil masih kosong).
 *  - Petugas klik satu pesanan → buka detail, isi "Jumlah Diterima" PER ITEM.
 *  - Simpan Verifikasi menghitung otomatis:
 *      semua item diterima == dipesan  -> verifikasi_hasil = 'lengkap'
 *      ada yang kurang / tidak diisi   -> verifikasi_hasil = 'tidak_lengkap'
 *    lalu mengisi kolom `keterangan` (dipakai Daftar Pesanan) secara otomatis,
 *    juga `tgl_diterima`, `penerima_nama` (diketik manual), `catatan_terima`,
 *    dan mengubah `status` pesanan menjadi 'selesai'.
 *
 * Props:
 *  - profile      : profil user login (id, instansi_id, nama_lengkap)
 *  - refreshKey   : angka, naikkan dari luar untuk memaksa refresh daftar
 *  - onSukses     : (pesan) => void
 *  - onError      : (pesan) => void
 */

const hariIniLabel = () => {
  const d = new Date()
  const z = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

const fmtTgl = (s) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

const TUJUAN_LABEL = {
  GFK: 'GFK / Gudang Farmasi',
  SWASTA: 'Swasta / PBF',
  BPJS: 'BPJS',
  PKM: 'Puskesmas Lain',
  LLN: 'Lain-lain',
}

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const angka = (n) => new Intl.NumberFormat('id-ID').format(Number(n) || 0)

// Isi Lembar Penerimaan (HTML) — dipakai untuk preview, cetak PDF, dan Excel supaya tampilannya sama.
// Beda dengan Lembar Pesanan (di DaftarPemesananObat): ini menampilkan HASIL VERIFIKASI,
// bukan data pesanan awal — ada Tanggal Diterima, Nama Penerima, kolom "Diterima" per item,
// Keterangan hasil verifikasi otomatis, dan tanda tangan Yang Menyerahkan / Yang Menerima.
function bangunLembarPenerimaanHtml(row, items, labelTujuanFn) {
  const totalDipesan = items.reduce((s, d) => s + (Number(d.jumlah) || 0), 0)
  const totalDiterima = items.reduce((s, d) => s + (Number(d.jumlah_diterima) || 0), 0)
  const baris = items
    .map((d, i) => {
      const kurang = Number(d.jumlah_diterima) < Number(d.jumlah)
      const lebih = Number(d.jumlah_diterima) > Number(d.jumlah)
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(d.nama_obat)}</td>
        <td class="r">${angka(d.jumlah)}</td>
        <td class="r"${
          kurang ? ' style="color:#b45309;font-weight:bold"' : lebih ? ' style="color:#1d4ed8;font-weight:bold"' : ''
        }>${angka(d.jumlah_diterima)}</td>
        <td>${esc(d.satuan || '-')}</td>
      </tr>`
    })
    .join('')

  const statusLabel =
    row.verifikasi_hasil === 'lengkap'
      ? 'Diterima Lengkap'
      : row.verifikasi_hasil === 'lebih'
      ? 'Diterima Lebih dari Pesanan'
      : 'Diterima Tidak Lengkap'

  return `
  <div class="kop">
    <div class="jdl">LEMBAR PENERIMAAN</div>
    <div class="no">${esc(row.pemesanan_no || '-')}</div>
  </div>
  <table class="info">
    <tr><td class="k">Tanggal Pesan</td><td>: ${esc(fmtTgl(row.tanggal))}</td><td class="k">Jenis Pesanan</td><td>: ${esc(row.jenis_obat || '-')}</td></tr>
    <tr><td class="k">Tujuan</td><td>: ${esc(labelTujuanFn(row))}</td><td class="k">Petugas Pemesan</td><td>: ${esc(row.petugas_nama || '-')}</td></tr>
    <tr><td class="k">Tanggal Diterima</td><td>: ${esc(fmtTgl(row.tgl_diterima))}</td><td class="k">Nama Penerima</td><td>: ${esc(row.penerima_nama || '-')}</td></tr>
    <tr><td class="k">Status Verifikasi</td><td colspan="3">: <b>${statusLabel}</b></td></tr>
  </table>
  <table class="dat">
    <thead><tr><th style="width:32px">No</th><th>Nama Pesanan</th><th style="width:70px">Dipesan</th><th style="width:70px">Diterima</th><th style="width:60px">Satuan</th></tr></thead>
    <tbody>${baris || `<tr><td colspan="5" class="c">Tidak ada item.</td></tr>`}</tbody>
    <tfoot><tr class="t"><td colspan="2" class="r">Total</td><td class="r">${angka(totalDipesan)}</td><td class="r"${
      totalDiterima < totalDipesan
        ? ' style="color:#b45309"'
        : totalDiterima > totalDipesan
        ? ' style="color:#1d4ed8"'
        : ''
    }>${angka(totalDiterima)}</td><td></td></tr></tfoot>
  </table>
  ${row.keterangan ? `<div class="cat"><b>Keterangan:</b> ${esc(row.keterangan)}</div>` : ''}
  ${row.catatan_terima ? `<div class="cat"><b>Catatan penerimaan:</b> ${esc(row.catatan_terima)}</div>` : ''}
  <table class="ttd"><tr>
    <td>Yang Menyerahkan<div class="gar">(................................)</div></td>
    <td>Yang Menerima<div class="gar">${esc(row.penerima_nama ? '(' + row.penerima_nama + ')' : '(................................)')}</div></td>
  </tr></table>`
}

const LEMBAR_CSS = `
  .lb{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12px}
  .lb .kop{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
  .lb .jdl{font-size:18px;font-weight:bold;letter-spacing:1px}
  .lb .no{font-family:monospace;font-size:13px;margin-top:2px}
  .lb table{width:100%;border-collapse:collapse}
  .lb .info td{padding:3px 4px;vertical-align:top}
  .lb .info td.k{width:15%;color:#444}
  .lb .dat{margin-top:12px}
  .lb .dat th,.lb .dat td{border:1px solid #111;padding:5px 6px}
  .lb .dat th{background:#eee;text-align:center}
  .lb .dat td.c{text-align:center}
  .lb .dat td.r{text-align:right}
  .lb .dat tr.t td{font-weight:bold;background:#f5f5f5}
  .lb .cat{margin-top:10px;padding:6px 8px;border:1px solid #bbb}
  .lb .ttd{margin-top:28px}
  .lb .ttd td{width:50%;text-align:center;vertical-align:top;padding:0 10px}
  .lb .gar{margin-top:56px}
`

const namaFilePenerimaan = (row) => `Penerimaan_${(row.pemesanan_no || 'tanpa-nomor').replace(/[^\w-]+/g, '_')}`

function unduhPdfPenerimaan(row, items, labelTujuanFn) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return false
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(namaFilePenerimaan(row))}</title>
    <style>@page{size:A4;margin:14mm}body{margin:0}${LEMBAR_CSS}</style></head>
    <body><div class="lb">${bangunLembarPenerimaanHtml(row, items, labelTujuanFn)}</div>
    <script>window.onload=function(){setTimeout(function(){window.focus();window.print()},250)}<\/script></body></html>`)
  w.document.close()
  return true
}

function unduhExcelPenerimaan(row, items, labelTujuanFn) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><style>${LEMBAR_CSS}
      table{border-collapse:collapse} td,th{mso-number-format:"\\@"}
    </style></head><body><div class="lb">${bangunLembarPenerimaanHtml(row, items, labelTujuanFn)}</div></body></html>`
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${namaFilePenerimaan(row)}.xls`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export default function PesananDiterima({ profile, refreshKey, onSukses, onError }) {
  const [daftar, setDaftar] = useState([])
  const [loading, setLoading] = useState(true)
  const [tampilkanSelesai, setTampilkanSelesai] = useState(false)

  // --- detail / verifikasi pesanan terpilih ---
  const [dipilih, setDipilih] = useState(null) // header pesanan yang sedang dibuka
  const [itemDetail, setItemDetail] = useState([]) // detail item + input jumlah_diterima lokal
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [penerimaNama, setPenerimaNama] = useState('')
  const [tglDiterima, setTglDiterima] = useState(hariIniLabel())
  const [catatanTerima, setCatatanTerima] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  const [pesanLokal, setPesanLokal] = useState('')

  // --- hapus pesanan ---
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(null) // row yang mau dihapus
  const [menghapus, setMenghapus] = useState(false)

  useEffect(() => {
    if (!profile?.instansi_id) return
    muatDaftar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.instansi_id, refreshKey, tampilkanSelesai])

  async function muatDaftar() {
    setLoading(true)
    let q = supabase
      .from('pemesanan_obat')
      .select(
        'id, pemesanan_no, tanggal, tujuan, puskesmas_tujuan_nama, pbf_nama, tujuan_lain, jenis_obat, petugas_nama, status, verifikasi_hasil, keterangan, tgl_diterima, penerima_nama, catatan_terima'
      )
      .eq('instansi_id', profile.instansi_id)
      .order('tanggal', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300)

    q = tampilkanSelesai ? q.not('verifikasi_hasil', 'is', null) : q.is('verifikasi_hasil', null)

    const { data, error } = await q
    if (error) onError?.('Gagal memuat daftar pesanan diterima: ' + error.message)
    setDaftar(data || [])
    setLoading(false)
  }

  const labelTujuan = (p) => {
    if (p.tujuan === 'PKM') return p.puskesmas_tujuan_nama || TUJUAN_LABEL.PKM
    if (p.tujuan === 'SWASTA') return p.pbf_nama || TUJUAN_LABEL.SWASTA
    if (p.tujuan === 'LLN') return p.tujuan_lain || TUJUAN_LABEL.LLN
    return TUJUAN_LABEL[p.tujuan] || p.tujuan
  }

  async function bukaDetail(pesanan) {
    setPesanLokal('')
    onError?.('')
    setDipilih(pesanan)
    setPenerimaNama(pesanan.penerima_nama || '')
    setTglDiterima(pesanan.tgl_diterima || hariIniLabel())
    setCatatanTerima(pesanan.catatan_terima || '')
    setLoadingDetail(true)
    const { data, error } = await supabase
      .from('pemesanan_obat_detail')
      .select('id, nama_obat, jumlah, satuan, jumlah_diterima, kategori')
      .eq('pemesanan_id', pesanan.id)
      .order('urutan', { ascending: true })
    if (error) {
      onError?.('Gagal memuat detail pesanan: ' + error.message)
      setLoadingDetail(false)
      return
    }
    setItemDetail(
      (data || []).map((it) => ({
        ...it,
        // kalau sudah pernah diverifikasi, tampilkan nilai lama; kalau belum, default = jumlah dipesan
        input_diterima:
          it.jumlah_diterima !== null && it.jumlah_diterima !== undefined ? String(it.jumlah_diterima) : String(it.jumlah),
      }))
    )
    setLoadingDetail(false)
  }

  const tutupDetail = () => {
    setDipilih(null)
    setItemDetail([])
    setPesanLokal('')
  }

  const ubahInputDiterima = (idx, val) => {
    setItemDetail((prev) => prev.map((it, i) => (i === idx ? { ...it, input_diterima: val } : it)))
  }

  // Bandingkan tiap item: kurang (diterima < dipesan), lebih (diterima > dipesan), atau pas.
  const ringkasanKekurangan = useMemo(() => {
    return itemDetail
      .map((it) => {
        const diterima = Number(it.input_diterima)
        const dipesan = Number(it.jumlah)
        if (!Number.isFinite(diterima) || diterima < dipesan) {
          const jml = Number.isFinite(diterima) ? diterima : 0
          return `${it.nama_obat}: dipesan ${dipesan}${it.satuan ? ' ' + it.satuan : ''}, diterima ${jml}${it.satuan ? ' ' + it.satuan : ''}`
        }
        return null
      })
      .filter(Boolean)
  }, [itemDetail])

  const ringkasanKelebihan = useMemo(() => {
    return itemDetail
      .map((it) => {
        const diterima = Number(it.input_diterima)
        const dipesan = Number(it.jumlah)
        if (Number.isFinite(diterima) && diterima > dipesan) {
          const selisih = diterima - dipesan
          return `${it.nama_obat}: dipesan ${dipesan}${it.satuan ? ' ' + it.satuan : ''}, diterima ${diterima}${it.satuan ? ' ' + it.satuan : ''} (lebih ${selisih}${it.satuan ? ' ' + it.satuan : ''})`
        }
        return null
      })
      .filter(Boolean)
  }, [itemDetail])

  const semuaLengkap = itemDetail.length > 0 && ringkasanKekurangan.length === 0 && ringkasanKelebihan.length === 0
  const adaLebih = ringkasanKekurangan.length === 0 && ringkasanKelebihan.length > 0

  // Menambahkan stok di tabel Stok (obat_masuk) untuk setiap item yang diterima > 0.
  // - Kalau nama item sudah ada di Stok (per instansi) -> tambah stok via RPC catat_mutasi_stok('penerimaan').
  // - Kalau belum ada -> insert baris baru ke obat_masuk (kategori dari item, satuan dari item,
  //   stok awal 0) lalu catat mutasi 'penerimaan' juga, supaya tetap ada jejak audit di mutasi_stok.
  // Kegagalan pada satu item tidak menggagalkan verifikasi keseluruhan; dikumpulkan lalu dilaporkan.
  async function transferKeStok(items) {
    const gagal = []
    const diterimaSaja = items.filter((it) => Number(it.input_diterima) > 0)
    if (diterimaSaja.length === 0) return gagal

    // ambil semua obat aktif di instansi ini sekali saja, supaya pencocokan nama efisien
    const { data: stokAda, error: eStok } = await supabase
      .from('obat_masuk')
      .select('id, nama_obat')
      .eq('instansi_id', profile.instansi_id)
      .eq('is_aktif', true)
    if (eStok) {
      gagal.push(`Gagal memeriksa Stok: ${eStok.message}`)
      return gagal
    }

    const cocokkan = (nama) =>
      (stokAda || []).find((o) => o.nama_obat.trim().toLowerCase() === nama.trim().toLowerCase())

    for (const it of diterimaSaja) {
      const jml = Number(it.input_diterima)
      try {
        let obatId = cocokkan(it.nama_obat)?.id

        if (!obatId) {
          // belum ada di Stok -> buat entri baru dengan stok awal 0, lalu catat mutasi 'penerimaan'
          const { data: baru, error: eInsert } = await supabase
            .from('obat_masuk')
            .insert({
              instansi_id: profile.instansi_id,
              nama_obat: it.nama_obat,
              kategori: it.kategori || null,
              satuan: it.satuan || 'tablet',
              stok: 0,
              is_aktif: true,
            })
            .select('id')
            .single()
          if (eInsert) throw eInsert
          obatId = baru.id
          // tambahkan ke cache lokal supaya item lain dengan nama sama tidak insert dobel
          stokAda.push({ id: obatId, nama_obat: it.nama_obat })
        }

        const { error: eRpc } = await supabase.rpc('catat_mutasi_stok', {
          p_obat_id: obatId,
          p_jenis: 'penerimaan',
          p_jumlah: jml,
          p_alasan: dipilih?.pemesanan_no ? `Penerimaan pesanan ${dipilih.pemesanan_no}` : 'Penerimaan pesanan',
        })
        if (eRpc) throw eRpc
      } catch (e) {
        gagal.push(`${it.nama_obat}: ${e.message || e}`)
      }
    }
    return gagal
  }

  async function simpanVerifikasi() {
    setPesanLokal('')
    onError?.('')
    if (!dipilih) return
    if (!penerimaNama.trim()) return setPesanLokal('Isi nama penerima.')
    if (itemDetail.some((it) => it.input_diterima.trim() === '' || Number(it.input_diterima) < 0))
      return setPesanLokal('Isi jumlah diterima untuk setiap item (boleh 0).')

    setMenyimpan(true)
    try {
      // 1) simpan jumlah_diterima per item
      for (const it of itemDetail) {
        const { error: eDetail } = await supabase
          .from('pemesanan_obat_detail')
          .update({ jumlah_diterima: Number(it.input_diterima) })
          .eq('id', it.id)
        if (eDetail) throw eDetail
      }

      // 2) hitung hasil & keterangan otomatis
      const hasil = semuaLengkap ? 'lengkap' : adaLebih ? 'lebih' : 'tidak_lengkap'
      const keterangan = semuaLengkap
        ? 'Diterima lengkap'
        : adaLebih
        ? `Diterima lebih dari pesanan (${ringkasanKelebihan.join('; ')})`
        : `Diterima tidak lengkap (${ringkasanKekurangan.join('; ')})`

      const { error: eHeader } = await supabase
        .from('pemesanan_obat')
        .update({
          status: 'selesai',
          verifikasi_hasil: hasil,
          keterangan,
          tgl_diterima: tglDiterima || hariIniLabel(),
          penerima_nama: penerimaNama.trim().slice(0, 100),
          catatan_terima: catatanTerima.trim() || null,
        })
        .eq('id', dipilih.id)
      if (eHeader) throw eHeader

      // 3) tambahkan stok di Stok (obat_masuk) untuk item yang diterima > 0
      const gagalStok = await transferKeStok(itemDetail)

      if (gagalStok.length > 0) {
        onSukses?.(
          `Verifikasi pesanan ${dipilih.pemesanan_no || ''} tersimpan: ${keterangan}. ` +
            `Namun sebagian gagal ditambahkan ke Stok: ${gagalStok.join('; ')}`
        )
      } else {
        onSukses?.(`Verifikasi pesanan ${dipilih.pemesanan_no || ''} tersimpan: ${keterangan}. Stok telah diperbarui.`)
      }
      tutupDetail()
      muatDaftar()
    } catch (e) {
      const msg = 'Gagal menyimpan verifikasi: ' + (e.message || e)
      setPesanLokal(msg)
      onError?.(msg)
    } finally {
      setMenyimpan(false)
    }
  }

  async function hapusPesanan() {
    if (!konfirmasiHapus) return
    setMenghapus(true)
    try {
      // hapus detail dulu (FK), baru header — sama seperti di Daftar Pesanan
      const { error: e1 } = await supabase
        .from('pemesanan_obat_detail')
        .delete()
        .eq('pemesanan_id', konfirmasiHapus.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('pemesanan_obat').delete().eq('id', konfirmasiHapus.id)
      if (e2) throw e2

      onSukses?.(`Pesanan ${konfirmasiHapus.pemesanan_no} dihapus`)
      setKonfirmasiHapus(null)
      if (dipilih?.id === konfirmasiHapus.id) tutupDetail()
      muatDaftar()
    } catch (e) {
      onError?.('Gagal menghapus pesanan: ' + (e.message || e))
    } finally {
      setMenghapus(false)
    }
  }

  const inputCls =
    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-100 disabled:text-gray-500'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Pesanan Diterima</h2>
        <p className="text-sm text-gray-500">Verifikasi kesesuaian pesanan yang sudah datang, per item</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTampilkanSelesai(false)}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            !tampilkanSelesai ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Perlu Verifikasi
        </button>
        <button
          onClick={() => setTampilkanSelesai(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tampilkanSelesai ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Sudah Diverifikasi
        </button>
      </div>

      {/* Daftar pesanan */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Memuat...</div>
        ) : daftar.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {tampilkanSelesai ? 'Belum ada pesanan yang diverifikasi.' : 'Tidak ada pesanan yang perlu diverifikasi.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-purple-50 text-purple-900">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">No. Pemesanan</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Tanggal</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Tujuan</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Jenis</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Petugas</th>
                  {tampilkanSelesai && <th className="text-left px-3 py-2.5 font-semibold">Keterangan</th>}
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {daftar.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-mono text-xs">{p.pemesanan_no}</td>
                    <td className="px-3 py-2.5">{fmtTgl(p.tanggal)}</td>
                    <td className="px-3 py-2.5">{labelTujuan(p)}</td>
                    <td className="px-3 py-2.5">{p.jenis_obat}</td>
                    <td className="px-3 py-2.5">{p.petugas_nama || '-'}</td>
                    {tampilkanSelesai && (
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            p.verifikasi_hasil === 'lengkap'
                              ? 'bg-green-100 text-green-700'
                              : p.verifikasi_hasil === 'lebih'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {p.keterangan || '-'}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => bukaDetail(p)}
                        className="px-3 py-1.5 text-xs rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                      >
                        {tampilkanSelesai ? 'Lihat' : 'Verifikasi'}
                      </button>
                      <button
                        onClick={() => setKonfirmasiHapus(p)}
                        className="ml-1.5 px-3 py-1.5 text-xs rounded-md bg-red-100 text-red-700 hover:bg-red-200 font-semibold"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal detail verifikasi */}
      {dipilih && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center sm:p-4"
          onClick={tutupDetail}
        >
          <div
            className="bg-white sm:rounded-2xl shadow-xl w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 shrink-0 border-b border-gray-200">
              <div className="flex-1">
                <p className="font-semibold text-gray-800 text-sm sm:text-base">
                  {tampilkanSelesai ? 'Lembar Penerimaan' : 'Verifikasi Pesanan'} {dipilih.pemesanan_no}
                </p>
                <p className="text-xs text-gray-500">
                  {labelTujuan(dipilih)} • {fmtTgl(dipilih.tanggal)}
                </p>
              </div>
              <button
                type="button"
                onClick={tutupDetail}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
              >
                Tutup
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
              {pesanLokal && (
                <div className="px-4 py-3 rounded-lg text-sm font-medium border bg-red-50 text-red-800 border-red-200">
                  {pesanLokal}
                </div>
              )}

              {loadingDetail ? (
                <div className="p-6 text-center text-sm text-gray-500">Memuat detail...</div>
              ) : tampilkanSelesai ? (
                <>
                  {/* Lembar Penerimaan — pratinjau satu lembar, sama persis dengan yang diunduh */}
                  <div
                    className="border rounded-xl p-4 sm:p-5 bg-white"
                    dangerouslySetInnerHTML={{
                      __html: `<style>${LEMBAR_CSS}</style><div class="lb">${bangunLembarPenerimaanHtml(
                        dipilih,
                        itemDetail,
                        labelTujuan
                      )}</div>`,
                    }}
                  />
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button
                      onClick={() => {
                        if (!unduhPdfPenerimaan(dipilih, itemDetail, labelTujuan))
                          setPesanLokal('Popup diblokir browser. Izinkan popup untuk mengunduh PDF.')
                      }}
                      className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
                    >
                      ⬇ Download PDF
                    </button>
                    <button
                      onClick={() => unduhExcelPenerimaan(dipilih, itemDetail, labelTujuan)}
                      className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
                    >
                      ⬇ Download Excel
                    </button>
                  </div>
                  <p className="text-xs text-center text-gray-400">
                    PDF: di jendela cetak pilih tujuan "Simpan sebagai PDF". Ukuran A4, satu lembar.
                  </p>
                </>
              ) : (
                <>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-purple-50 text-purple-900">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Nama Pesanan</th>
                          <th className="text-right px-3 py-2 font-semibold">Dipesan</th>
                          <th className="text-left px-3 py-2 font-semibold">Satuan</th>
                          <th className="text-right px-3 py-2 font-semibold w-32">Diterima</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {itemDetail.map((it, i) => {
                          const kurang = Number(it.input_diterima) < Number(it.jumlah)
                          const lebih = Number(it.input_diterima) > Number(it.jumlah)
                          return (
                            <tr key={it.id}>
                              <td className="px-3 py-2">{it.nama_obat}</td>
                              <td className="px-3 py-2 text-right">{it.jumlah}</td>
                              <td className="px-3 py-2 text-gray-500">{it.satuan || '-'}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={it.input_diterima}
                                  onChange={(e) => ubahInputDiterima(i, e.target.value)}
                                  className={`${inputCls} text-right ${
                                    kurang ? 'border-orange-400 bg-orange-50' : lebih ? 'border-blue-400 bg-blue-50' : ''
                                  }`}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div
                    className={`px-4 py-3 rounded-lg text-sm font-medium border ${
                      semuaLengkap
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : adaLebih
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-orange-50 text-orange-700 border-orange-200'
                    }`}
                  >
                    {semuaLengkap
                      ? 'Semua item sesuai — akan disimpan sebagai "Diterima lengkap".'
                      : adaLebih
                      ? `Diterima lebih dari pesanan — akan disimpan sebagai "Diterima lebih dari pesanan": ${ringkasanKelebihan.join('; ')}`
                      : `Belum lengkap — akan disimpan sebagai "Diterima tidak lengkap": ${ringkasanKekurangan.join('; ')}`}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tanggal Diterima</label>
                      <input
                        type="date"
                        value={tglDiterima}
                        onChange={(e) => setTglDiterima(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nama Penerima</label>
                      <input
                        value={penerimaNama}
                        onChange={(e) => setPenerimaNama(e.target.value)}
                        maxLength={100}
                        placeholder="Ketik nama penerima"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Catatan Penerimaan</label>
                    <textarea
                      value={catatanTerima}
                      onChange={(e) => setCatatanTerima(e.target.value)}
                      rows={2}
                      placeholder="Opsional"
                      className={inputCls}
                    />
                  </div>
                </>
              )}
            </div>

            {!tampilkanSelesai && (
              <div className="flex justify-end gap-2 px-4 sm:px-5 py-3 sm:py-4 border-t border-gray-200 shrink-0">
                <button
                  onClick={tutupDetail}
                  disabled={menyimpan}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
                >
                  Batal
                </button>
                <button
                  onClick={simpanVerifikasi}
                  disabled={menyimpan || loadingDetail}
                  className="px-5 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50"
                >
                  {menyimpan ? 'Menyimpan...' : 'Simpan Verifikasi'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog konfirmasi hapus */}
      {konfirmasiHapus && (
        <div
          className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4"
          onClick={() => !menghapus && setKonfirmasiHapus(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-800">Hapus pesanan?</h3>
            <p className="text-sm text-gray-600 mt-2">
              Pesanan <b>{konfirmasiHapus.pemesanan_no}</b> beserta semua itemnya akan dihapus permanen. Tindakan ini
              tidak bisa dibatalkan.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setKonfirmasiHapus(null)}
                disabled={menghapus}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
              >
                Batal
              </button>
              <button
                onClick={hapusPesanan}
                disabled={menghapus}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
              >
                {menghapus ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}