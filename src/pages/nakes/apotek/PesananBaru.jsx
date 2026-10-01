import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabaseClient'

/**
 * PesananBaru — form "Pesanan Baru" (order obat / alkes / reagen / lainnya ke GFK / PBF / BPJS / Puskesmas lain / tujuan lain).
 *
 * Props (sama pola dengan StokObat di dashboard):
 *  - profile   : profil user login (id, instansi_id, nama_lengkap)
 *  - onSukses  : (pesan) => void, dipanggil setelah pesanan tersimpan
 *
 * Nomor pemesanan (PO-YYYYMMDD-001, berurutan per hari & per puskesmas):
 *  - Form langsung menampilkan nomor berikutnya (nomor terakhir + 1) lewat RPC
 *    nomor_pemesanan_berikutnya, dan ikut berubah saat tanggal diganti.
 *  - Kolom boleh diedit manual. Kalau tidak diedit, form tidak mengirim pemesanan_no dan
 *    trigger database yang menetapkan nomor final (aman jika dua petugas menyimpan bersamaan).
 *  - Nomor ganda ditolak unique index (uq_pemesanan_obat_no_per_instansi).
 *
 *  - onError   : (pesan) => void
 *  - onSelesai : () => void (opsional) — dipanggil setelah simpan, mis. pindah ke tab Daftar Pesanan
 */

const TUJUAN_OPSI = [
  { v: 'GFK', label: 'GFK / Gudang Farmasi' },
  { v: 'SWASTA', label: 'Swasta / PBF' },
  { v: 'BPJS', label: 'BPJS' },
  { v: 'PKM', label: 'Puskesmas Lain' },
  { v: 'LLN', label: 'Lain-lain' },
]

const JENIS_OPSI = ['OBAT', 'ALKES', 'REAGEN', 'LAINNYA']
const JENIS_LAINNYA = 'LAINNYA' // jika dipilih, petugas mengetik jenis pesanannya sendiri

const rupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    Number(n) || 0
  )

const hariIni = () => {
  const d = new Date()
  const z = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

export default function PesananBaru({ profile, onSukses, onError, onSelesai }) {
  // --- header ---
  const [noPemesanan, setNoPemesanan] = useState('')
  const [noManual, setNoManual] = useState(false) // true jika petugas mengetik nomor sendiri
  const [noRefresh, setNoRefresh] = useState(0) // naik untuk memaksa hitung ulang nomor berikutnya
  const [memuatNo, setMemuatNo] = useState(false)
  const [tanggal, setTanggal] = useState(hariIni())
  const [tujuan, setTujuan] = useState('GFK')
  const [jenisObat, setJenisObat] = useState('OBAT')
  const [jenisLain, setJenisLain] = useState('') // isian manual saat jenis = LAINNYA
  const [puskesmasTujuanId, setPuskesmasTujuanId] = useState('')
  const [pbfNama, setPbfNama] = useState('')
  const [tujuanLain, setTujuanLain] = useState('') // isian manual saat tujuan = LLN (Lain-lain)
  const [petugasNama, setPetugasNama] = useState('') // petugas diketik manual
  const [catatan, setCatatan] = useState('')

  // --- data referensi ---
  const [puskesmasList, setPuskesmasList] = useState([])
  const [loadingRef, setLoadingRef] = useState(true)

  // --- input detail ---
  const [namaPesanan, setNamaPesanan] = useState('') // nama pesanan diketik manual
  const [jumlah, setJumlah] = useState('') // banyaknya pesanan
  const [satuan, setSatuan] = useState('') // satuan diketik manual (mis. box, botol, strip)
  const [harga, setHarga] = useState('')
  const [items, setItems] = useState([])
  const [terpilih, setTerpilih] = useState({}) // { idx: true }

  // --- kategori (dipakai saat Pesanan Diterima mengoper ke Stok) ---
  const [kategoriList, setKategoriList] = useState([]) // daftar kategori unik dari obat_masuk
  const [kategori, setKategori] = useState('') // kategori terpilih untuk item yang sedang diketik
  const [kategoriBaru, setKategoriBaru] = useState('') // isian manual saat kategori = "__baru__"
  const KATEGORI_BARU = '__baru__'

  const [menyimpan, setMenyimpan] = useState(false)
  const [pesanLokal, setPesanLokal] = useState('')

  const isSwasta = tujuan === 'SWASTA'
  const isPkm = tujuan === 'PKM'
  const isLln = tujuan === 'LLN'

  useEffect(() => {
    let batal = false
    async function muat() {
      if (!profile?.instansi_id) return
      setLoadingRef(true)
      const p = await supabase
        .from('instansi')
        .select('id, nama')
        .eq('aktif', true)
        .neq('id', profile.instansi_id)
        .order('nama', { ascending: true })
      if (batal) return
      if (p.error) onError?.('Gagal memuat daftar puskesmas: ' + p.error.message)
      setPuskesmasList(p.data || [])
      setLoadingRef(false)
    }
    muat()
    return () => {
      batal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.instansi_id])

  // daftar kategori unik yang sudah ada di Stok (obat_masuk), untuk dropdown Kategori
  useEffect(() => {
    let batal = false
    async function muatKategori() {
      if (!profile?.instansi_id) return
      const { data, error } = await supabase
        .from('obat_masuk')
        .select('kategori')
        .eq('instansi_id', profile.instansi_id)
        .not('kategori', 'is', null)
      if (batal || error) return
      const unik = Array.from(new Set((data || []).map((r) => (r.kategori || '').trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      )
      setKategoriList(unik)
    }
    muatKategori()
    return () => {
      batal = true
    }
  }, [profile?.instansi_id])

  // nomor pesanan berikutnya = nomor terakhir hari itu + 1 (dihitung database)
  useEffect(() => {
    if (noManual || !profile?.instansi_id || !tanggal) return
    let batal = false
    setMemuatNo(true)
    supabase
      .rpc('nomor_pemesanan_berikutnya', { p_instansi_id: profile.instansi_id, p_tanggal: tanggal })
      .then(({ data, error }) => {
        if (batal) return
        if (!error && data) setNoPemesanan(data)
        setMemuatNo(false)
      })
    return () => {
      batal = true
    }
  }, [profile?.instansi_id, tanggal, noManual, noRefresh])

  const totalSemua = useMemo(() => items.reduce((s, it) => s + (Number(it.total_harga) || 0), 0), [items])

  const tambahItem = () => {
    setPesanLokal('')
    const nama = namaPesanan.trim().replace(/\s+/g, ' ')
    if (!nama) return setPesanLokal('Ketik nama pesanan terlebih dahulu.')
    const jml = Number(jumlah)
    if (!jml || jml <= 0) return setPesanLokal('Banyaknya pesanan harus lebih dari 0.')
    if (items.some((it) => it.nama_obat.toLowerCase() === nama.toLowerCase()))
      return setPesanLokal('Pesanan ini sudah ada di daftar. Hapus dulu jika ingin mengubah banyaknya.')

    const kategoriFinal =
      kategori === KATEGORI_BARU ? kategoriBaru.trim().replace(/\s+/g, ' ') : kategori.trim()
    if (!kategoriFinal) return setPesanLokal('Pilih atau ketik kategori terlebih dahulu.')

    const hrg = isSwasta ? Number(harga) || 0 : 0
    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}`,
        nama_obat: nama,
        jumlah: jml,
        satuan: satuan.trim().replace(/\s+/g, ' ').slice(0, 30) || null,
        kategori: kategoriFinal.slice(0, 60),
        harga_beli: isSwasta ? hrg : null,
        total_harga: isSwasta ? hrg * jml : null,
      },
    ])
    // simpan kategori baru ke daftar dropdown supaya bisa langsung dipakai lagi di baris berikutnya
    if (kategori === KATEGORI_BARU && kategoriFinal) {
      setKategoriList((prev) => (prev.includes(kategoriFinal) ? prev : [...prev, kategoriFinal].sort((a, b) => a.localeCompare(b))))
      setKategori(kategoriFinal)
      setKategoriBaru('')
    }
    setNamaPesanan('')
    setJumlah('')
    setSatuan('')
    setHarga('')
    setPesanLokal('')
  }

  const bersihkanInput = () => {
    setNamaPesanan('')
    setJumlah('')
    setSatuan('')
    setHarga('')
    setPesanLokal('')
  }

  const hapusTerpilih = () => {
    const idx = Object.keys(terpilih).filter((k) => terpilih[k]).map(Number)
    if (idx.length === 0) return setPesanLokal('Centang item yang ingin dihapus.')
    setItems((prev) => prev.filter((_, i) => !idx.includes(i)))
    setTerpilih({})
    setPesanLokal('')
  }

  const hapusSatu = (i) => {
    setItems((prev) => prev.filter((_, x) => x !== i))
    setTerpilih({})
  }

  const semuaTercentang = items.length > 0 && items.every((_, i) => terpilih[i])
  const toggleSemua = () => {
    if (semuaTercentang) return setTerpilih({})
    const m = {}
    items.forEach((_, i) => (m[i] = true))
    setTerpilih(m)
  }

  const resetForm = () => {
    setNoManual(false)
    setNoRefresh((k) => k + 1)
    setTanggal(hariIni())
    setTujuan('GFK')
    setJenisObat('OBAT')
    setJenisLain('')
    setPuskesmasTujuanId('')
    setPbfNama('')
    setTujuanLain('')
    setPetugasNama('')
    setCatatan('')
    setSatuan('')
    setKategori('')
    setKategoriBaru('')
    setItems([])
    setTerpilih({})
    bersihkanInput()
  }

  const simpan = async () => {
    setPesanLokal('')
    onError?.('')
    if (!profile?.id || !profile?.instansi_id) return setPesanLokal('Profil petugas belum termuat.')
    if (items.length === 0) return setPesanLokal('Tambahkan minimal satu pesanan ke daftar.')
    if (isPkm && !puskesmasTujuanId) return setPesanLokal('Pilih Puskesmas tujuan.')
    if (isSwasta && !pbfNama.trim()) return setPesanLokal('Isi nama PBF.')
    if (isLln && !tujuanLain.trim()) return setPesanLokal('Ketik tujuan pemesanan (Lain-lain).')
    if (!petugasNama.trim()) return setPesanLokal('Isi nama petugas.')
    if (jenisObat === JENIS_LAINNYA && !jenisLain.trim()) return setPesanLokal('Ketik jenis pesanan (Lainnya).')
    if (noManual && !noPemesanan.trim())
      return setPesanLokal('No. Pemesanan kosong. Isi nomornya atau klik ↻ untuk nomor otomatis.')

    setMenyimpan(true)
    let headerId = null
    try {
      const pkm = puskesmasList.find((p) => p.id === puskesmasTujuanId)
      const { data: hdr, error: e1 } = await supabase
        .from('pemesanan_obat')
        .insert({
          instansi_id: profile.instansi_id,
          // hanya dikirim jika diketik manual; kalau tidak, trigger database memberi nomor berikutnya
          ...(noManual ? { pemesanan_no: noPemesanan.trim() } : {}),
          tanggal,
          tujuan,
          puskesmas_tujuan_id: isPkm ? puskesmasTujuanId : null,
          puskesmas_tujuan_nama: isPkm ? pkm?.nama || null : null,
          jenis_obat: jenisObat === JENIS_LAINNYA ? jenisLain.trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 60) : jenisObat,
          pbf_nama: isSwasta ? pbfNama.trim() : null,
          tujuan_lain: isLln ? tujuanLain.trim().replace(/\s+/g, ' ').slice(0, 100) : null,
          petugas_nama: petugasNama.trim().replace(/\s+/g, ' ').slice(0, 100),
          petugas_id: profile.id,
          status: 'diproses',
          total_harga: isSwasta ? totalSemua : 0,
          catatan: catatan.trim() || null,
        })
        .select('id, pemesanan_no')
        .single()
      if (e1) throw e1
      headerId = hdr.id
      const noPesanan = hdr.pemesanan_no

      const detail = items.map((it, i) => ({
        pemesanan_id: headerId,
        obat_id: null,
        nama_obat: it.nama_obat,
        stok_akhir: null,
        jumlah: it.jumlah,
        satuan: it.satuan,
        kategori: it.kategori,
        harga_beli: it.harga_beli,
        total_harga: it.total_harga,
        urutan: i + 1,
      }))
      const { error: e2 } = await supabase.from('pemesanan_obat_detail').insert(detail)
      if (e2) throw e2

      onSukses?.(`Pesanan ${noPesanan} berhasil disimpan (${items.length} pesanan).`)
      resetForm()
      onSelesai?.()
    } catch (e) {
      // batalkan header supaya tidak ada pesanan kosong
      if (headerId) await supabase.from('pemesanan_obat').delete().eq('id', headerId)
      const msg =
        e?.code === '23505'
          ? `No. Pemesanan ${noPemesanan.trim()} sudah dipakai. Ganti nomornya, atau klik ↻ untuk nomor berikutnya.`
          : 'Gagal menyimpan pesanan: ' + (e.message || e)
      if (e?.code === '23505') setNoRefresh((k) => k + 1)
      setPesanLokal(msg)
      onError?.(msg)
    } finally {
      setMenyimpan(false)
    }
  }

  const inputCls =
    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-100 disabled:text-gray-500'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-800">Pesanan Baru</h2>
        <p className="text-sm text-gray-500">Buat pesanan ke GFK, PBF, BPJS, puskesmas lain, atau tujuan lainnya</p>
      </div>

      {pesanLokal && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium border bg-red-50 text-red-800 border-red-200">
          {pesanLokal}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* KIRI: header pesanan */}
        <div className="lg:col-span-2 bg-white border rounded-xl p-4 space-y-3 h-fit">
          <div className="text-sm font-semibold text-purple-900">Data Pemesanan</div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Pemesanan</label>
            <div className="flex gap-2">
              <input
                value={noPemesanan}
                onChange={(e) => {
                  setNoPemesanan(e.target.value)
                  setNoManual(true)
                }}
                placeholder={memuatNo ? 'Menghitung nomor…' : 'PO-YYYYMMDD-001'}
                className={`${inputCls} font-mono`}
              />
              <button
                type="button"
                onClick={() => {
                  setNoManual(false)
                  setNoRefresh((k) => k + 1)
                }}
                title="Pakai nomor otomatis (nomor terakhir + 1)"
                className="px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm"
              >
                ↻
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {noManual
                ? 'Nomor diisi manual. Klik ↻ untuk kembali ke nomor otomatis.'
                : 'Otomatis: nomor terakhir + 1. Boleh diubah.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tanggal</label>
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Pesanan</label>
              <select value={jenisObat} onChange={(e) => setJenisObat(e.target.value)} className={`${inputCls} bg-white`}>
                {JENIS_OPSI.map((j) => (
                  <option key={j} value={j}>
                    {j === JENIS_LAINNYA ? 'Lainnya…' : j}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {jenisObat === JENIS_LAINNYA && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ketik Jenis Pesanan</label>
              <input
                value={jenisLain}
                onChange={(e) => setJenisLain(e.target.value)}
                maxLength={60}
                placeholder="Mis. Vaksin, Bahan Habis Pakai, BMHP"
                autoFocus
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Tujuan Pemesanan</label>
            <select
              value={tujuan}
              onChange={(e) => {
                setTujuan(e.target.value)
                // harga hanya relevan untuk Swasta; kosongkan item agar tidak salah hitung
                if (items.length > 0 && (e.target.value === 'SWASTA') !== isSwasta) {
                  setItems([])
                  setTerpilih({})
                  setPesanLokal('Tujuan diubah, daftar pesanan dikosongkan agar harga dihitung ulang.')
                }
              }}
              className={`${inputCls} bg-white`}
            >
              {TUJUAN_OPSI.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {isLln && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ketik Tujuan Pemesanan</label>
              <input
                value={tujuanLain}
                onChange={(e) => setTujuanLain(e.target.value)}
                maxLength={100}
                placeholder="Mis. Dinas Kesehatan, Rumah Sakit, Apotek"
                autoFocus
                className={inputCls}
              />
            </div>
          )}

          {isPkm && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Puskesmas Tujuan</label>
              <select
                value={puskesmasTujuanId}
                onChange={(e) => setPuskesmasTujuanId(e.target.value)}
                className={`${inputCls} bg-white`}
              >
                <option value="">— Pilih puskesmas —</option>
                {puskesmasList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </select>
              {puskesmasList.length === 0 && !loadingRef && (
                <p className="text-xs text-amber-700 mt-1">Belum ada puskesmas lain yang terdaftar.</p>
              )}
            </div>
          )}

          {isSwasta && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama PBF</label>
              <input
                value={pbfNama}
                onChange={(e) => setPbfNama(e.target.value)}
                placeholder="Ketik nama PBF"
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Petugas</label>
            <input
              value={petugasNama}
              onChange={(e) => setPetugasNama(e.target.value)}
              maxLength={100}
              placeholder="Ketik nama petugas"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Catatan</label>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={3}
              placeholder="Opsional"
              className={inputCls}
            />
          </div>
        </div>

        {/* KANAN: detail obat */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <div className="text-sm font-semibold text-purple-900">Tambah Pesanan</div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama Pesanan</label>
              <input
                value={namaPesanan}
                onChange={(e) => setNamaPesanan(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && tambahItem()}
                maxLength={150}
                placeholder="Ketik nama obat / alkes / reagen / lainnya"
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Kategori</label>
              <select
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
                className={inputCls}
              >
                <option value="">-- Pilih kategori --</option>
                {kategoriList.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
                <option value={KATEGORI_BARU}>+ Kategori baru</option>
              </select>
              {kategori === KATEGORI_BARU && (
                <input
                  value={kategoriBaru}
                  onChange={(e) => setKategoriBaru(e.target.value)}
                  maxLength={60}
                  placeholder="Ketik nama kategori baru"
                  className={`${inputCls} mt-2`}
                />
              )}
              <p className="text-xs text-gray-400 mt-1">
                Menentukan kategori barang ini di Stok saat pesanan diterima & diverifikasi.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Banyaknya Pesanan</label>
                <input
                  type="number"
                  min="1"
                  value={jumlah}
                  onChange={(e) => setJumlah(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && tambahItem()}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Satuan</label>
                <input
                  value={satuan}
                  onChange={(e) => setSatuan(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && tambahItem()}
                  maxLength={30}
                  placeholder="Mis. box, botol, strip"
                  className={inputCls}
                />
              </div>
            </div>

            {isSwasta && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Harga Beli</label>
                <input
                  type="number"
                  min="0"
                  value={harga}
                  onChange={(e) => setHarga(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && tambahItem()}
                  className={inputCls}
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={tambahItem}
                className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              >
                + Tambah
              </button>
              <button
                onClick={bersihkanInput}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Tabel item */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-sm font-semibold text-purple-900">Daftar Pesanan ({items.length})</div>
              <button
                onClick={hapusTerpilih}
                disabled={items.length === 0}
                className="px-3 py-1.5 text-xs rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40"
              >
                Hapus Terpilih
              </button>
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">Belum ada pesanan. Ketik nama pesanan lalu klik Tambah.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-purple-50 text-purple-900">
                    <tr>
                      <th className="px-3 py-2.5 w-8">
                        <input type="checkbox" checked={semuaTercentang} onChange={toggleSemua} />
                      </th>
                      <th className="text-left px-3 py-2.5 font-semibold">#</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Nama Pesanan</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Kategori</th>
                      <th className="text-right px-3 py-2.5 font-semibold">Banyaknya</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Satuan</th>
                      {isSwasta && (
                        <>
                          <th className="text-right px-3 py-2.5 font-semibold">Harga</th>
                          <th className="text-right px-3 py-2.5 font-semibold">Total</th>
                        </>
                      )}
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((it, i) => (
                      <tr key={it.key} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={!!terpilih[i]}
                            onChange={() => setTerpilih((t) => ({ ...t, [i]: !t[i] }))}
                          />
                        </td>
                        <td className="px-3 py-2.5">{i + 1}</td>
                        <td className="px-3 py-2.5">{it.nama_obat}</td>
                        <td className="px-3 py-2.5 text-gray-500">{it.kategori || '-'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">{it.jumlah}</td>
                        <td className="px-3 py-2.5 text-gray-500">{it.satuan || '-'}</td>
                        {isSwasta && (
                          <>
                            <td className="px-3 py-2.5 text-right">{rupiah(it.harga_beli)}</td>
                            <td className="px-3 py-2.5 text-right">{rupiah(it.total_harga)}</td>
                          </>
                        )}
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => hapusSatu(i)}
                            className="px-2.5 py-1 text-xs rounded-md bg-red-100 text-red-700 hover:bg-red-200 font-semibold"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {isSwasta && (
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-right">
                          Total Harga
                        </td>
                        <td className="px-3 py-2 text-right">{rupiah(totalSemua)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Aksi */}
          <div className="flex justify-end gap-2">
            <button
              onClick={resetForm}
              disabled={menyimpan}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
            >
              Reset Form
            </button>
            <button
              onClick={simpan}
              disabled={menyimpan || items.length === 0}
              className="px-5 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50"
            >
              {menyimpan ? 'Menyimpan…' : 'Simpan Pesanan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}