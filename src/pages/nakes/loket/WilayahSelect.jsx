import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// ─── KOMPONEN REUSABLE: Dropdown Wilayah 4 Tingkat ───────────────
// Provinsi → Kabupaten/Kota → Kecamatan → Kelurahan/Desa.
// Data diambil dari tabel Supabase kita sendiri (wilayah_provinces,
// wilayah_regencies, wilayah_districts, wilayah_villages), hasil import
// dari dataset emsifa/api-wilayah-indonesia. Sebelumnya komponen ini
// fetch langsung ke API publik emsifa.github.io; sekarang sudah tidak
// bergantung pada layanan luar itu lagi.
//
// Dipakai 2x di form pasien: alamat sesuai KTP dan alamat domisili.
// Setiap instance independen (state provinsi/kab/kec/kel-nya sendiri),
// tapi melapor ke form induk lewat onChange dengan pola { target: { name, value } }
// yang sama seperti field lain di form, supaya kompatibel dengan
// handler onChange yang sudah ada di FormTambahPasienRak.
//
// Props:
//   prefix        : awalan nama field, mis. "alamat_ktp" atau "alamat_domisili"
//                   -> menghasilkan name: alamat_ktp_provinsi, alamat_ktp_provinsi_nama, dst.
//   value         : { provinsi, provinsi_nama, kabupaten, kabupaten_nama,
//                     kecamatan, kecamatan_nama, kelurahan, kelurahan_nama }
//   onChange      : (event) => void — dipanggil per field, format sama seperti input biasa
//   disabled      : boolean — kunci semua dropdown (dipakai saat "domisili sama dengan KTP")
//
// Catatan: kode pos otomatis terisi saat kelurahan dipilih, dicari dari
// tabel referensi terpisah `wilayah_kodepos` (lihat cariKodePos di bawah).
// Kalau tidak ketemu, field kode pos dibiarkan kosong dan petugas bisa
// mengisinya manual di field kode pos pada form induk.

// Catatan: kode pos TIDAK ada di dataset wilayah_villages (emsifa) yang
// diimpor sebelumnya. Untuk mengisi otomatis, komponen ini mencari kode pos
// dari tabel referensi terpisah `wilayah_kodepos` (diimpor dari dataset lain
// yang berbasis nama, bukan id) berdasarkan kecocokan nama kelurahan +
// kecamatan. Kalau tidak ketemu / ambigu, field kode pos dibiarkan kosong
// dan petugas bisa mengisinya manual seperti biasa.

async function cariKodePos(namaKelurahan, idKecamatan) {
  console.log('[WilayahSelect] cariKodePos dipanggil:', { namaKelurahan, idKecamatan, tipeId: typeof idKecamatan })
  if (!namaKelurahan || !idKecamatan) {
    console.warn('[WilayahSelect] cariKodePos dibatalkan: namaKelurahan atau idKecamatan kosong')
    return ''
  }
  // Nama kecamatan diambil langsung dari tabel wilayah_districts memakai id,
  // bukan mengandalkan field "_nama" di state form — field itu tidak
  // tersimpan ke database, jadi kalau form dibuka lagi dalam mode edit,
  // field "_nama" selalu kosong walau id kecamatan sudah terisi.
  const { data: kecData, error: kecErr } = await supabase
    .from('wilayah_districts')
    .select('name')
    .eq('id', idKecamatan)
    .maybeSingle()
  if (kecErr || !kecData) {
    console.error('[WilayahSelect] Gagal ambil nama kecamatan:', kecErr?.message || '(tidak ada baris cocok untuk id ini)')
    return ''
  }
  console.log('[WilayahSelect] Nama kecamatan ditemukan:', kecData.name)

  const { data, error } = await supabase
    .from('wilayah_kodepos')
    .select('kode_pos')
    .ilike('kelurahan', namaKelurahan.trim())
    .ilike('kecamatan', kecData.name.trim())
    .limit(5)
  if (error) {
    console.error('[WilayahSelect] Gagal mencari kode pos:', error.message)
    return ''
  }
  console.log('[WilayahSelect] Hasil pencarian kode pos:', data)

  if (!data || data.length === 0) {
    console.warn('[WilayahSelect] Tidak ada kode pos ditemukan untuk kombinasi ini')
    return ''
  }
  // Kalau semua hasil punya kode pos yang sama, aman dipakai walau baris
  // duplikat (mis. data referensi diimpor dua kali). Hanya dibiarkan kosong
  // kalau memang ada kode pos yang BERBEDA untuk kombinasi nama yang sama.
  const kodeUnik = [...new Set(data.map((d) => d.kode_pos))]
  if (kodeUnik.length !== 1) {
    console.warn('[WilayahSelect] Kode pos ambigu (lebih dari satu nilai berbeda):', kodeUnik)
    return ''
  }
  return kodeUnik[0] || ''
}

async function fetchWilayah(table, filterColumn, filterValue) {
  let query = supabase.from(table).select('id, name').order('name', { ascending: true })
  if (filterColumn) {
    query = query.eq(filterColumn, filterValue)
  }
  const { data, error } = await query
  if (error) {
    console.error(`[WilayahSelect] Gagal memuat ${table}:`, error.message)
    return []
  }
  return data || []
}

// ─── Dropdown dengan kotak pencarian ─────────────────────────────
// Menggantikan <select> biasa: klik untuk buka daftar, ketik untuk
// memfilter opsi (berguna terutama untuk kecamatan/kelurahan yang bisa
// berjumlah ratusan per kabupaten). Tetap berperilaku seperti field
// form biasa lewat prop onSelect(id).
function ComboboxWilayah({ label, placeholder, options, value, onSelect, disabled, loading }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  const namaTerpilih = options.find((o) => o.id === value)?.name || ''

  // Saat dropdown ditutup, kotak teks menampilkan nama opsi yang sedang
  // dipilih. Saat dibuka untuk mengetik, mulai dari kosong supaya user
  // bisa langsung ketik kata kunci baru tanpa menghapus teks lama dulu.
  const teksTampil = open ? query : namaTerpilih

  const hasilFilter = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [options, query])

  // Klik di luar komponen -> tutup dropdown tanpa mengubah pilihan
  useEffect(() => {
    if (!open) return
    function handleClickLuar(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickLuar)
    return () => document.removeEventListener('mousedown', handleClickLuar)
  }, [open])

  const boxClass =
    'w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400'

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        value={teksTampil}
        placeholder={loading ? 'Memuat...' : placeholder}
        disabled={disabled}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!open) setOpen(true)
        }}
        className={boxClass}
        autoComplete="off"
      />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-400">Memuat...</div>
          ) : hasilFilter.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">Tidak ditemukan</div>
          ) : (
            hasilFilter.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onSelect(o.id, o.name)
                  setOpen(false)
                  setQuery('')
                }}
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-teal-50 ${
                  o.id === value ? 'bg-teal-50 font-medium text-teal-700' : 'text-gray-700'
                }`}
              >
                {o.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function WilayahSelect({ prefix, value, onChange, disabled }) {
  const [provinsiList, setProvinsiList] = useState([])
  const [kabupatenList, setKabupatenList] = useState([])
  const [kecamatanList, setKecamatanList] = useState([])
  const [kelurahanList, setKelurahanList] = useState([])

  const [loadingKab, setLoadingKab] = useState(false)
  const [loadingKec, setLoadingKec] = useState(false)
  const [loadingKel, setLoadingKel] = useState(false)

  const v = value || {}

  // Muat daftar provinsi sekali saat komponen pertama kali tampil
  useEffect(() => {
    fetchWilayah('wilayah_provinces').then(setProvinsiList)
  }, [])

  // Muat kabupaten/kota setiap kali provinsi berubah (termasuk saat form
  // dibuka ulang dalam mode edit dan sudah ada provinsi tersimpan)
  useEffect(() => {
    if (!v.provinsi) {
      setKabupatenList([])
      return
    }
    setLoadingKab(true)
    fetchWilayah('wilayah_regencies', 'province_id', v.provinsi).then((data) => {
      setKabupatenList(data)
      setLoadingKab(false)
    })
  }, [v.provinsi])

  // Muat kecamatan setiap kali kabupaten/kota berubah
  useEffect(() => {
    if (!v.kabupaten) {
      setKecamatanList([])
      return
    }
    setLoadingKec(true)
    fetchWilayah('wilayah_districts', 'regency_id', v.kabupaten).then((data) => {
      setKecamatanList(data)
      setLoadingKec(false)
    })
  }, [v.kabupaten])

  // Muat kelurahan/desa setiap kali kecamatan berubah
  useEffect(() => {
    if (!v.kecamatan) {
      setKelurahanList([])
      return
    }
    setLoadingKel(true)
    fetchWilayah('wilayah_villages', 'district_id', v.kecamatan).then((data) => {
      setKelurahanList(data)
      setLoadingKel(false)
    })
  }, [v.kecamatan])

  // Helper: saat satu tingkat wilayah dipilih, field-field di bawahnya
  // (yang lebih spesifik) ikut dikosongkan supaya tidak terjadi kombinasi
  // yang tidak konsisten (mis. kecamatan lama nyangkut padahal kab sudah ganti)
  function pilihProvinsi(id, nama) {
    onChange({ target: { name: `${prefix}_provinsi`, value: id } })
    onChange({ target: { name: `${prefix}_provinsi_nama`, value: nama } })
    onChange({ target: { name: `${prefix}_kabupaten`, value: '' } })
    onChange({ target: { name: `${prefix}_kabupaten_nama`, value: '' } })
    onChange({ target: { name: `${prefix}_kecamatan`, value: '' } })
    onChange({ target: { name: `${prefix}_kecamatan_nama`, value: '' } })
    onChange({ target: { name: `${prefix}_kelurahan`, value: '' } })
    onChange({ target: { name: `${prefix}_kelurahan_nama`, value: '' } })
  }

  function pilihKabupaten(id, nama) {
    onChange({ target: { name: `${prefix}_kabupaten`, value: id } })
    onChange({ target: { name: `${prefix}_kabupaten_nama`, value: nama } })
    onChange({ target: { name: `${prefix}_kecamatan`, value: '' } })
    onChange({ target: { name: `${prefix}_kecamatan_nama`, value: '' } })
    onChange({ target: { name: `${prefix}_kelurahan`, value: '' } })
    onChange({ target: { name: `${prefix}_kelurahan_nama`, value: '' } })
  }

  function pilihKecamatan(id, nama) {
    onChange({ target: { name: `${prefix}_kecamatan`, value: id } })
    onChange({ target: { name: `${prefix}_kecamatan_nama`, value: nama } })
    onChange({ target: { name: `${prefix}_kelurahan`, value: '' } })
    onChange({ target: { name: `${prefix}_kelurahan_nama`, value: '' } })
  }

  function pilihKelurahan(id, nama) {
    onChange({ target: { name: `${prefix}_kelurahan`, value: id } })
    onChange({ target: { name: `${prefix}_kelurahan_nama`, value: nama } })
    // Cari kode pos berdasarkan nama kelurahan yang baru dipilih + id
    // kecamatan yang sedang aktif, lalu isi otomatis ke field kode pos.
    console.log('[WilayahSelect] pilihKelurahan dipanggil:', { id, nama, kecamatanAktif: v.kecamatan })
    cariKodePos(nama, v.kecamatan).then((kodePos) => {
      console.log('[WilayahSelect] kodePos hasil pencarian:', kodePos)
      if (kodePos) {
        onChange({ target: { name: `${prefix}_kode_pos`, value: kodePos } })
      }
    })
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <ComboboxWilayah
        label="Provinsi"
        placeholder="-- Pilih Provinsi --"
        options={provinsiList}
        value={v.provinsi || ''}
        onSelect={pilihProvinsi}
        disabled={disabled}
      />

      <ComboboxWilayah
        label="Kabupaten/Kota"
        placeholder="-- Pilih Kabupaten/Kota --"
        options={kabupatenList}
        value={v.kabupaten || ''}
        onSelect={pilihKabupaten}
        disabled={disabled || !v.provinsi}
        loading={loadingKab}
      />

      <ComboboxWilayah
        label="Kecamatan"
        placeholder="-- Pilih Kecamatan --"
        options={kecamatanList}
        value={v.kecamatan || ''}
        onSelect={pilihKecamatan}
        disabled={disabled || !v.kabupaten}
        loading={loadingKec}
      />

      <ComboboxWilayah
        label="Kelurahan/Desa"
        placeholder="-- Pilih Kelurahan/Desa --"
        options={kelurahanList}
        value={v.kelurahan || ''}
        onSelect={pilihKelurahan}
        disabled={disabled || !v.kecamatan}
        loading={loadingKel}
      />
    </div>
  )
}