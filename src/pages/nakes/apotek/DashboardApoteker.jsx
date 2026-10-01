import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import RiwayatPendaftaran from '../loket/RiwayatPendaftaran'
import Stok from './Stok'
import PesananBaru from './PesananBaru'
import PesananDiterima from './PesananDiterima'
import DaftarPemesanan from './DaftarPemesanan'
import ModalLembarResep, {
  TELAAH_RESEP_ITEMS,
  INFORMASI_OBAT_ITEMS,
  buatChecklistKosong,
} from './LembarResep'

const TAB = {
  PANGGIL: 'panggil',
  RESEP: 'resep',
  RIWAYAT: 'riwayat',
  STOK: 'stok',
  PESANAN: 'pesanan',
  DITERIMA: 'diterima',
}

// Skrining administrasi (Permenkes 74/2016 & 26/2020): hitung umur pasien
// pada tanggal resep dibuat, bukan umur saat ini — supaya konsisten dengan
// riwayat resep lama.
function hitungUmurSingkat(tanggalLahir, tanggalAcuan) {
  if (!tanggalLahir) return null
  const lahir = new Date(tanggalLahir)
  const acuan = tanggalAcuan ? new Date(tanggalAcuan) : new Date()
  let tahun = acuan.getFullYear() - lahir.getFullYear()
  let bulan = acuan.getMonth() - lahir.getMonth()
  if (acuan.getDate() < lahir.getDate()) bulan--
  if (bulan < 0) { tahun--; bulan += 12 }
  if (tahun < 1) return `${Math.max(bulan, 0)} bln`
  return `${tahun} thn`
}

// Umur dalam tahun (angka) pada tanggal acuan — untuk kolom Umur/BB/TB di lembar resep.
function hitungTahun(tanggalLahir, tanggalAcuan) {
  if (!tanggalLahir) return 0
  const lahir = new Date(tanggalLahir)
  const acuan = tanggalAcuan ? new Date(tanggalAcuan) : new Date()
  let tahun = acuan.getFullYear() - lahir.getFullYear()
  const belumUlangTahun =
    acuan.getMonth() < lahir.getMonth() ||
    (acuan.getMonth() === lahir.getMonth() && acuan.getDate() < lahir.getDate())
  if (belumUlangTahun) tahun--
  return Math.max(tahun, 0)
}

// Ambil baris terbaru dari relasi array (mis. skrining/pemeriksaan) berdasarkan created_at.
function ambilTerbaru(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null
  return arr.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]
}

// Tanggal lokal format YYYY-MM-DD (offset hari opsional), untuk filter riwayat.
function tanggalLokal(offsetHari = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetHari)
  return d.toLocaleDateString('en-CA')
}

// Kelompokkan baris resep per kunjungan (satu kunjungan = satu lembar resep).
// Baris sudah terurut terbaru dulu, urutan itu dipertahankan oleh Map.
function kelompokkanRiwayat(rows) {
  const map = new Map()
  for (const r of rows) {
    const k = r.kunjungan
    if (!k) continue
    if (!map.has(k.id)) map.set(k.id, { kunjungan: k, obat: [] })
    map.get(k.id).obat.push(r)
  }
  return Array.from(map.values())
}

function checklistLengkap(arr, jumlahItem) {
  return Array.isArray(arr) && arr.length === jumlahItem && arr.every((v) => v === 'ya' || v === 'tidak')
}

// Kesesuaian klinis: deteksi duplikasi pengobatan — resep dengan nama_obat
// yang sama pada kunjungan yang sama (mis. dokter/perawat input dobel,
// atau ada dua baris resep untuk obat yang identik).
function cekDuplikasiObat(resepList, resepSaatIni) {
  if (!resepSaatIni.kunjungan_id) return false
  const namaObat = (resepSaatIni.nama_obat || '').trim().toLowerCase()
  if (!namaObat) return false
  return resepList.some(
    (r) =>
      r.id !== resepSaatIni.id &&
      r.kunjungan_id === resepSaatIni.kunjungan_id &&
      (r.nama_obat || '').trim().toLowerCase() === namaObat
  )
}

export default function DashboardApoteker() {
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState(TAB.PANGGIL)
  const [pesananRefresh, setPesananRefresh] = useState(0) // naik setiap pesanan obat baru tersimpan
  const daftarPesananRef = useRef(null)
  const formPesananRef = useRef(null)

  // --- Panggil Antrian Apotek ---
  // Berbeda dari loket: di Apotek, antrian dikenali lewat kunjungan.status
  // = 'menunggu_obat' (bukan poli_id, karena poli_id tetap poli pendaftaran
  // awal pasien dan tidak pernah berubah menjadi Apotek).
  const [antrianApotek, setAntrianApotek] = useState([])
  const [sedangDipanggilApotek, setSedangDipanggilApotek] = useState(null)
  const [loadingPanggil, setLoadingPanggil] = useState(false)

  // --- Resep masuk ---
  const [resepMenunggu, setResepMenunggu] = useState([])
  const [obatList, setObatList] = useState([])
  const [prosesMap, setProsesMap] = useState({}) // { resepId: obat_id yang dipilih untuk dispensing }
  const [loadingResepId, setLoadingResepId] = useState(null)

  const [error, setError] = useState('')
  const [sukses, setSukses] = useState('')

  // --- Riwayat Resep (resep yang sudah diproses: selesai / obat kosong) ---
  const [riwayatResep, setRiwayatResep] = useState([])
  const [loadingRiwayatResep, setLoadingRiwayatResep] = useState(false)
  const [filterRiwayat, setFilterRiwayat] = useState({
    dari: tanggalLokal(-7),
    sampai: tanggalLokal(0),
    cari: '',
  })

  // --- Lembar Resep & Telaah (format kertas Puskesmas) ---
  // Data lembar diambil per KUNJUNGAN (bukan per baris resep), karena satu kunjungan
  // bisa punya beberapa obat. Checklist Telaah Resep & Informasi Obat diisi apoteker
  // dan disimpan di kolom pemeriksaan.telaah_resep / pemeriksaan.informasi_obat.
  const [lembar, setLembar] = useState(null)
  const [loadingLembarId, setLoadingLembarId] = useState(null)
  const [telaahResep, setTelaahResep] = useState(buatChecklistKosong(TELAAH_RESEP_ITEMS))
  const [informasiObat, setInformasiObat] = useState(buatChecklistKosong(INFORMASI_OBAT_ITEMS))
  const [menyimpanChecklist, setMenyimpanChecklist] = useState(false)

  // Tanda tangan pasien di Lembar Resep (serah obat). Disimpan terpisah dari
  // telaahResep/informasiObat karena disimpan segera saat diisi (bukan menunggu
  // tombol "Simpan Checklist"), supaya TTD tidak hilang kalau apoteker menutup
  // modal sebelum sempat menekan Simpan Checklist.
  //   ttdPasien        : { url, sumber: 'apotek'|'consent', nama, pada } | null — nilai TERSIMPAN di DB.
  //   consentTersedia  : { url, nama, pada } | null — TTD General Consent milik kunjungan ini (kalau ada),
  //                      dipakai untuk tombol "Salin dari General Consent". Read-only, tidak diubah.
  const [ttdPasien, setTtdPasien] = useState(null)
  const [consentTersedia, setConsentTersedia] = useState(null)
  const [menyimpanTtd, setMenyimpanTtd] = useState(false)

  // Riwayat Pendaftaran — modal terpisah, sama seperti di DashboardLoket,
  // supaya apoteker juga bisa lihat riwayat kunjungan pasien secara keseluruhan
  // (bukan cuma yang sedang menunggu resep) untuk keperluan skrining/pengkajian resep.
  const [showRiwayatPendaftaran, setShowRiwayatPendaftaran] = useState(false)

  // Riwayat kesehatan pasien (alergi obat & riwayat penyakit) — dilihat & bisa diedit
  // langsung dari kartu resep, karena apoteker perlu cek alergi sebelum menyerahkan obat.
  const [editRiwayatId, setEditRiwayatId] = useState(null) // resep.id yang sedang diedit riwayat kesehatannya
  const [riwayatKesehatanForm, setRiwayatKesehatanForm] = useState({ alergi_obat: '', riwayat_penyakit: '' })
  const [loadingRiwayatKesehatan, setLoadingRiwayatKesehatan] = useState(false)

  useEffect(() => {
    fetchProfile()
  }, [])

  // Dengarkan perubahan realtime pada kunjungan supaya antrian panggil
  // ter-refresh otomatis saat ada pasien baru masuk status 'menunggu_obat'
  // (mis. dokter baru saja mengirim resep) tanpa perlu refresh manual.
  useEffect(() => {
    if (!profile?.instansi_id) return
    fetchAntrianApotek(profile.instansi_id)
    const channel = supabase
      .channel('apotek-antrian-panggil')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kunjungan', filter: `instansi_id=eq.${profile.instansi_id}` },
        () => fetchAntrianApotek(profile.instansi_id)
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.instansi_id])

  // Muat riwayat resep saat tab Riwayat dibuka (dan saat profil siap)
  useEffect(() => {
    if (tab === TAB.RIWAYAT && profile?.instansi_id) fetchRiwayatResep()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profile?.instansi_id])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*, instansi:instansi_id(id, nama, jenis, kota, alamat, telepon, logo_url, nama_pemerintah, nama_dinas, email)')
      .eq('id', user.id)
      .single()
    setProfile(data)
    fetchResepMenunggu()
    fetchObatMasuk(data?.instansi_id)
  }

  async function fetchAntrianApotek(instansiId) {
    const hariIni = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('kunjungan')
      .select('id, nomor_antrian, status, status_panggil, pasien:pasien_id(nama_lengkap)')
      .eq('instansi_id', instansiId)
      .eq('tanggal_periksa', hariIni)
      .eq('status', 'menunggu_obat')
      .order('nomor_antrian', { ascending: true })

    if (error) {
      console.error(error)
      return
    }

    const daftar = (data || []).filter((k) => k.status_panggil !== 'selesai')
    setAntrianApotek(daftar)
    setSedangDipanggilApotek(daftar.find((k) => k.status_panggil === 'dipanggil') || null)
  }

  async function panggilBerikutnyaApotek() {
    setLoadingPanggil(true)
    setError('')
    try {
      // Tandai yang sedang dipanggil sebelumnya sebagai selesai (di tahap panggil ini saja,
      // bukan status kunjungan keseluruhan — pasien tetap 'menunggu_obat' sampai resepnya diproses).
      if (sedangDipanggilApotek) {
        await supabase
          .from('kunjungan')
          .update({ status_panggil: 'selesai' })
          .eq('id', sedangDipanggilApotek.id)
      }

      const berikutnya = antrianApotek.find(
        (k) => k.status_panggil === 'menunggu' && k.id !== sedangDipanggilApotek?.id
      )

      if (!berikutnya) {
        setError('Tidak ada antrian menunggu di Apotek.')
        await fetchAntrianApotek(profile.instansi_id)
        return
      }

      const { error: updateErr } = await supabase
        .from('kunjungan')
        .update({ status_panggil: 'dipanggil', waktu_panggil: new Date().toISOString() })
        .eq('id', berikutnya.id)

      if (updateErr) throw new Error(updateErr.message)

      await fetchAntrianApotek(profile.instansi_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPanggil(false)
    }
  }

  async function panggilUlangApotek() {
    if (!sedangDipanggilApotek) return
    setLoadingPanggil(true)
    try {
      await supabase
        .from('kunjungan')
        .update({ waktu_panggil: new Date().toISOString() })
        .eq('id', sedangDipanggilApotek.id)
      await fetchAntrianApotek(profile.instansi_id)
    } finally {
      setLoadingPanggil(false)
    }
  }

  async function fetchResepMenunggu() {
    const { data, error } = await supabase
      .from('resep')
      .select(`
        *,
        kunjungan:kunjungan_id(
          id,
          tanggal_periksa,
          poli:poli_id(id, nama_poli),
          pasien:pasien_id(id, nama_lengkap, no_rekam_medis, alergi_obat, riwayat_penyakit, tanggal_lahir, jenis_kelamin),
          skrining(berat_badan),
          pemeriksaan(dokter:dokter_id(nama_lengkap))
        )
      `)
      .eq('status', 'menunggu')
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      return
    }
    setResepMenunggu(data || [])
  }

  async function fetchObatMasuk(instansiId) {
    const idInstansi = instansiId || profile?.instansi_id
    let query = supabase
      .from('obat_masuk')
      .select('*')
      .eq('is_aktif', true)
      .order('nama_obat', { ascending: true })

    if (idInstansi) query = query.eq('instansi_id', idInstansi)

    const { data, error } = await query

    if (error) {
      console.error(error)
      return
    }
    setObatList(data || [])
  }

  function pilihObatUntukResep(resepId, obatId) {
    setProsesMap((prev) => ({ ...prev, [resepId]: obatId }))
  }

  function mulaiEditRiwayatKesehatan(resep) {
    setEditRiwayatId(resep.id)
    setRiwayatKesehatanForm({
      alergi_obat: resep.kunjungan?.pasien?.alergi_obat || '',
      riwayat_penyakit: resep.kunjungan?.pasien?.riwayat_penyakit || '',
    })
  }

  function handleRiwayatKesehatanChange(e) {
    const { name, value } = e.target
    setRiwayatKesehatanForm((prev) => ({ ...prev, [name]: value }))
  }

  async function simpanRiwayatKesehatan(resep) {
    const pasienId = resep.kunjungan?.pasien?.id
    if (!pasienId) return
    setLoadingRiwayatKesehatan(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('pasien')
        .update({
          alergi_obat: riwayatKesehatanForm.alergi_obat.trim() || null,
          riwayat_penyakit: riwayatKesehatanForm.riwayat_penyakit.trim() || null,
        })
        .eq('id', pasienId)

      if (err) throw new Error(err.message)

      // Sinkronkan data lokal supaya semua kartu resep pasien yang sama ikut ter-update
      setResepMenunggu((prev) => prev.map((r) => (
        r.kunjungan?.pasien?.id === pasienId
          ? {
              ...r,
              kunjungan: {
                ...r.kunjungan,
                pasien: {
                  ...r.kunjungan.pasien,
                  alergi_obat: riwayatKesehatanForm.alergi_obat.trim() || null,
                  riwayat_penyakit: riwayatKesehatanForm.riwayat_penyakit.trim() || null,
                },
              },
            }
          : r
      )))
      setEditRiwayatId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingRiwayatKesehatan(false)
    }
  }

  async function prosesResep(resep) {
    setError('')
    setSukses('')
    const obatId = prosesMap[resep.id] || resep.obat_id

    if (!obatId) {
      setError('Pilih obat dari stok terlebih dahulu untuk resep ini.')
      return
    }

    const obat = obatList.find((o) => o.id === obatId)
    if (!obat) {
      setError('Obat tidak ditemukan di stok.')
      return
    }
    if (obat.stok <= 0) {
      setError(`Stok ${obat.nama_obat} kosong. Tidak bisa diproses.`)
      return
    }

    // Peringatan (bukan blokir): telaah resep belum diisi untuk kunjungan ini.
    // Pengkajian resep adalah bagian standar pelayanan kefarmasian; apoteker tetap
    // boleh melanjutkan, tetapi harus menyadarinya.
    try {
      const kid = resep.kunjungan_id || resep.kunjungan?.id
      if (kid) {
        const { data: pem } = await supabase
          .from('pemeriksaan')
          .select('telaah_resep')
          .eq('kunjungan_id', kid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const telaah = pem?.telaah_resep
        const belumDiisi = !Array.isArray(telaah) || telaah.every((x) => !x)
        if (belumDiisi) {
          const lanjut = window.confirm(
            'Telaah Resep untuk kunjungan ini belum diisi.\n\nBuka Lembar Resep dan isi telaah dulu? \n\nOK = lanjut serahkan tanpa telaah.\nBatal = kembali.'
          )
          if (!lanjut) return
        }
      }
    } catch (e) {
      console.warn('Cek telaah dilewati:', e.message)
    }

    setLoadingResepId(resep.id)
    try {
      const waktuSekarang = new Date().toISOString()
      // 1. Catat obat keluar (trigger di DB otomatis kurangi stok saat status 'selesai')
      const { error: keluarErr } = await supabase.from('obat_keluar').insert({
        resep_id: resep.id,
        obat_id: obatId,
        apoteker_id: profile.id,
        jumlah: resep.jumlah ? parseFloat(resep.jumlah) : 1,
        status: 'selesai',
      })
      if (keluarErr) throw new Error(keluarErr.message)

      // 2. Update status resep
      const { error: resepErr } = await supabase
        .from('resep')
        .update({
          status: 'selesai',
          obat_id: obatId,
          // Kepmenkes 1423/2022 bagian E.2 Dispensing: waktu penyiapan & penyerahan + petugas.
          // Aplikasi memproses dalam satu langkah, jadi kedua waktu diisi sama; bila nanti
          // ada tahap "sedang disiapkan" terpisah, waktu_siap diisi di tahap itu.
          waktu_siap: resep.waktu_siap || waktuSekarang,
          waktu_serah: waktuSekarang,
          petugas_dispensing_id: profile.id,
        })
        .eq('id', resep.id)
      if (resepErr) throw new Error(resepErr.message)

      // 3. Kalau ini resep terakhir yang belum selesai untuk kunjungan ini,
      // tandai kunjungan sebagai selesai sepenuhnya — supaya kartu Apotek
      // otomatis hilang dari layar TV (AntrianDisplay.jsx) dan pasien tidak
      // nyangkut selamanya di status 'menunggu_obat'.
      const kunjunganId = resep.kunjungan_id || resep.kunjungan?.id
      if (kunjunganId) {
        const { data: sisaResep, error: sisaErr } = await supabase
          .from('resep')
          .select('id')
          .eq('kunjungan_id', kunjunganId)
          .eq('status', 'menunggu')

        if (sisaErr) throw new Error(sisaErr.message)

        if (!sisaResep || sisaResep.length === 0) {
          const { error: kunjunganErr } = await supabase
            .from('kunjungan')
            .update({ status: 'selesai', status_panggil: 'selesai' })
            .eq('id', kunjunganId)
          if (kunjunganErr) throw new Error(kunjunganErr.message)
        }
      }

      setSukses(`Resep untuk ${resep.kunjungan?.pasien?.nama_lengkap || 'pasien'} berhasil diproses.`)
      fetchResepMenunggu()
      fetchObatMasuk()
      if (profile?.instansi_id) fetchAntrianApotek(profile.instansi_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingResepId(null)
    }
  }

  async function fetchRiwayatResep() {
    if (!profile?.instansi_id) return
    setLoadingRiwayatResep(true)
    setError('')
    try {
      // !inner supaya filter tanggal & instansi pada kunjungan ikut menyaring baris resep
      let query = supabase
        .from('resep')
        .select(`
          id, kunjungan_id, nama_obat, dosis, jumlah, satuan_jumlah, status, created_at,
          kunjungan:kunjungan_id!inner(
            id, tanggal_periksa, instansi_id,
            poli:poli_id(nama_poli),
            pasien:pasien_id(nama_lengkap, no_rekam_medis),
            pemeriksaan(telaah_resep, informasi_obat, created_at)
          )
        `)
        .in('status', ['selesai', 'obat_kosong'])
        .eq('kunjungan.instansi_id', profile.instansi_id)
        .order('created_at', { ascending: false })
        .limit(500)

      if (filterRiwayat.dari) query = query.gte('kunjungan.tanggal_periksa', filterRiwayat.dari)
      if (filterRiwayat.sampai) query = query.lte('kunjungan.tanggal_periksa', filterRiwayat.sampai)

      const { data, error: err } = await query
      if (err) throw new Error(err.message)
      setRiwayatResep(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingRiwayatResep(false)
    }
  }

  function bukaLembarResep(resep) {
    return bukaLembarByKunjungan(resep.kunjungan_id || resep.kunjungan?.id, resep.id)
  }

  // Dipakai dari tab Resep Masuk (per resep) dan tab Riwayat Resep (per kunjungan).
  async function bukaLembarByKunjungan(kunjunganId, kunciLoading) {
    if (!kunjunganId) {
      setError('Data kunjungan untuk resep ini tidak ditemukan.')
      return
    }
    setError('')
    setSukses('')
    setLoadingLembarId(kunciLoading)
    try {
      const { data: kunj, error: kunjErr } = await supabase
        .from('kunjungan')
        .select(`
          id, pasien_id, tanggal_periksa, kategori_pasien,
          poli:poli_id(nama_poli),
          pasien:pasien_id(id, nama_lengkap, no_rekam_medis, tanggal_lahir, jenis_kelamin, alamat, alergi_obat),
          skrining(berat_badan, tinggi_badan, keluhan_utama, created_at),
          pemeriksaan(id, anamnesis, diagnosis, kode_icd, telaah_resep, informasi_obat, created_at,
            ttd_pasien_url, ttd_pasien_sumber, ttd_pasien_nama, ttd_pasien_pada,
            dokter:dokter_id(nama_lengkap))
        `)
        .eq('id', kunjunganId)
        .single()
      if (kunjErr) throw new Error(kunjErr.message)

      // Semua obat pada kunjungan ini (apa pun statusnya), supaya lembar selalu lengkap
      const { data: semuaResep, error: resepErr } = await supabase
        .from('resep')
        .select('nama_obat, dosis, aturan_pakai, catatan, jumlah, satuan_jumlah, bentuk_sediaan, jumlah_puyer, created_at, waktu_siap, waktu_serah, petugas:petugas_dispensing_id(nama_lengkap)')
        .eq('kunjungan_id', kunjunganId)
        .order('created_at', { ascending: true })
      if (resepErr) throw new Error(resepErr.message)

      const pemeriksaan = ambilTerbaru(kunj.pemeriksaan)
      const skrining = ambilTerbaru(kunj.skrining)

      const telaah = Array.isArray(pemeriksaan?.telaah_resep) && pemeriksaan.telaah_resep.length === TELAAH_RESEP_ITEMS.length
        ? pemeriksaan.telaah_resep
        : buatChecklistKosong(TELAAH_RESEP_ITEMS)
      const informasi = Array.isArray(pemeriksaan?.informasi_obat) && pemeriksaan.informasi_obat.length === INFORMASI_OBAT_ITEMS.length
        ? pemeriksaan.informasi_obat
        : buatChecklistKosong(INFORMASI_OBAT_ITEMS)

      // TTD pasien yang sudah tersimpan sebelumnya untuk lembar resep kunjungan ini (kalau ada).
      const ttdTersimpan = pemeriksaan?.ttd_pasien_url
        ? {
            url: pemeriksaan.ttd_pasien_url,
            sumber: pemeriksaan.ttd_pasien_sumber || 'apotek',
            nama: pemeriksaan.ttd_pasien_nama || '',
            pada: pemeriksaan.ttd_pasien_pada || null,
          }
        : null

      // TTD General Consent untuk tombol "Salin dari General Consent".
      // Prioritas 1: consent berstatus 'ditandatangani' yang terikat ke kunjungan ini.
      // Prioritas 2 (fallback): consent 'ditandatangani' terbaru milik pasien yang sama dari
      //   kunjungan lain — ditandai kunjunganBerbeda=true supaya UI/kertas jujur bahwa
      //   ini bukan consent hari ini. Consent kedaluwarsa/dibatalkan tidak pernah dipakai.
      // Diambil terpisah dan dibungkus try/catch: consent opsional, kegagalannya tidak
      // boleh menggagalkan pembukaan lembar resep.
      let consentUntukKunjungan = null
      try {
        // Kolom apa adanya (tanpa alias) — sesuai skema consent_signature.
        const kolom =
          'id, kunjungan_id, status, created_at, consent_signature(pihak, tanda_tangan_url, nama, ditandatangani_pada, created_at)'

        const ambilSigPasien = (row) =>
          (row?.consent_signature || []).find((sg) => sg.pihak === 'pasien' && sg.tanda_tangan_url)

        const bentuk = (sig, kunjunganBerbeda) => ({
          url: sig.tanda_tangan_url,
          nama: sig.nama || '',
          pada: sig.ditandatangani_pada || sig.created_at || null,
          kunjunganBerbeda,
        })

        // 1) Consent untuk kunjungan yang sama
        const { data: rowsSama, error: errSama } = await supabase
          .from('general_consent')
          .select(kolom)
          .eq('kunjungan_id', kunjunganId)
          .eq('status', 'ditandatangani')
          .order('created_at', { ascending: false })
          .limit(5)
        if (errSama) throw new Error('consent kunjungan ini: ' + errSama.message)

        const rowSama = (rowsSama || []).find((r) => ambilSigPasien(r))
        if (rowSama) {
          consentUntukKunjungan = bentuk(ambilSigPasien(rowSama), false)
        } else {
          // 2) Fallback: consent terbaru pasien ini (kunjungan lain)
          const pasienId = kunj.pasien?.id || kunj.pasien_id
          if (pasienId) {
            const { data: rowsPasien, error: errPasien } = await supabase
              .from('general_consent')
              .select(kolom)
              .eq('pasien_id', pasienId)
              .eq('status', 'ditandatangani')
              .order('created_at', { ascending: false })
              .limit(5)
            if (errPasien) throw new Error('consent pasien: ' + errPasien.message)

            const kandidat = (rowsPasien || []).find((r) => ambilSigPasien(r))
            if (kandidat) {
              consentUntukKunjungan = bentuk(ambilSigPasien(kandidat), true)
            }
          } else {
            console.warn('[Consent] pasien.id tidak tersedia pada kunjungan, fallback dilewati')
          }
        }
        console.info('[Consent] hasil:', consentUntukKunjungan
          ? { ada: true, kunjunganBerbeda: consentUntukKunjungan.kunjunganBerbeda, panjangUrl: consentUntukKunjungan.url.length }
          : { ada: false })
      } catch (consentErr) {
        console.error('[Consent] Gagal memuat General Consent:', consentErr.message)
      }

      setTelaahResep(telaah)
      setInformasiObat(informasi)
      setTtdPasien(ttdTersimpan)
      setConsentTersedia(consentUntukKunjungan)
      setLembar({
        kunjungan: kunj,
        pasien: kunj.pasien,
        pemeriksaan,
        skrining,
        resepList: semuaResep || [],
        umur: { tahun: hitungTahun(kunj.pasien?.tanggal_lahir, kunj.tanggal_periksa) },
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingLembarId(null)
    }
  }

  // Simpan TTD pasien ke pemeriksaan.ttd_pasien_* untuk kunjungan yang sedang dibuka.
  // Dipanggil segera saat apoteker menggambar TTD sendiri atau menyalin dari consent —
  // TIDAK menunggu tombol "Simpan Checklist", supaya tidak hilang kalau modal ditutup duluan.
  async function simpanTtdPasien({ url, sumber, nama, pada, kunjunganBerbeda = false }) {
    if (!lembar?.pemeriksaan?.id) {
      setError('Data pemeriksaan dokter untuk kunjungan ini tidak ditemukan, tanda tangan tidak bisa disimpan.')
      return
    }
    setError('')
    setMenyimpanTtd(true)
    try {
      const payload = {
        ttd_pasien_url: url,
        ttd_pasien_sumber: sumber,
        ttd_pasien_nama: nama || null,
        ttd_pasien_pada: pada || new Date().toISOString(),
      }
      const { error: err } = await supabase
        .from('pemeriksaan')
        .update(payload)
        .eq('id', lembar.pemeriksaan.id)
      if (err) throw new Error(err.message)
      setTtdPasien({ url, sumber, nama: nama || '', pada: payload.ttd_pasien_pada, kunjunganBerbeda })
      setSukses(sumber === 'consent'
        ? (kunjunganBerbeda
            ? 'Tanda tangan disalin dari General Consent kunjungan sebelumnya.'
            : 'Tanda tangan disalin dari General Consent.')
        : 'Tanda tangan pasien tersimpan.')
    } catch (err) {
      setError(err.message)
    } finally {
      setMenyimpanTtd(false)
    }
  }

  function handleSimpanTtdApotek(dataUrlPng) {
    simpanTtdPasien({ url: dataUrlPng, sumber: 'apotek', nama: lembar?.pasien?.nama_lengkap || '' })
  }

  function handleSalinTtdConsent() {
    if (!consentTersedia?.url) return
    simpanTtdPasien({
      url: consentTersedia.url,
      sumber: 'consent',
      nama: consentTersedia.nama || lembar?.pasien?.nama_lengkap || '',
      pada: consentTersedia.pada,
      kunjunganBerbeda: !!consentTersedia.kunjunganBerbeda,
    })
  }

  // Batalkan/ganti TTD tersimpan: kosongkan di DB supaya kanvas TTD baru tampil lagi.
  async function handleHapusTtd() {
    if (!lembar?.pemeriksaan?.id) return
    setError('')
    setMenyimpanTtd(true)
    try {
      const { error: err } = await supabase
        .from('pemeriksaan')
        .update({ ttd_pasien_url: null, ttd_pasien_sumber: null, ttd_pasien_nama: null, ttd_pasien_pada: null })
        .eq('id', lembar.pemeriksaan.id)
      if (err) throw new Error(err.message)
      setTtdPasien(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setMenyimpanTtd(false)
    }
  }

  async function simpanChecklistLembar() {
    if (!lembar?.pemeriksaan?.id) {
      setError('Data pemeriksaan dokter untuk kunjungan ini tidak ditemukan, checklist tidak bisa disimpan.')
      return
    }
    setError('')
    setMenyimpanChecklist(true)
    try {
      const { error: err } = await supabase
        .from('pemeriksaan')
        .update({ telaah_resep: telaahResep, informasi_obat: informasiObat })
        .eq('id', lembar.pemeriksaan.id)
      if (err) throw new Error(err.message)
      setSukses('Checklist Telaah Resep & Informasi Obat berhasil disimpan.')
    } catch (err) {
      setError(err.message)
    } finally {
      setMenyimpanChecklist(false)
    }
  }

  async function tandaiObatKosong(resep) {
    setError('')
    setLoadingResepId(resep.id)
    try {
      const { error: err } = await supabase
        .from('resep')
        .update({ status: 'obat_kosong' })
        .eq('id', resep.id)
      if (err) throw new Error(err.message)
      setSukses('Resep ditandai obat kosong.')
      fetchResepMenunggu()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingResepId(null)
    }
  }

  // --- Kelola stok obat ---
  // ─── TAMPILAN ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard Apoteker</h1>
          <p className="text-gray-500 text-sm">Resep Masuk &amp; Kelola Stok Obat</p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setTab(TAB.PANGGIL)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === TAB.PANGGIL ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            📢 Panggil Antrian {antrianApotek.filter((k) => k.status_panggil === 'menunggu').length > 0 &&
              `(${antrianApotek.filter((k) => k.status_panggil === 'menunggu').length})`}
          </button>
          <button
            onClick={() => setTab(TAB.RESEP)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === TAB.RESEP ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            📋 Resep Masuk {resepMenunggu.length > 0 && `(${resepMenunggu.length})`}
          </button>
          <button
            onClick={() => setTab(TAB.RIWAYAT)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === TAB.RIWAYAT ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            🗂️ Riwayat Resep
          </button>
          <button
            onClick={() => setTab(TAB.STOK)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === TAB.STOK ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            💊 Stok
          </button>
          <button
            onClick={() => setTab(TAB.PESANAN)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === TAB.PESANAN ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            🛒 Pesanan Baru
          </button>
          <button
            onClick={() => setTab(TAB.DITERIMA)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === TAB.DITERIMA ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            📦 Pesanan Diterima
          </button>
          <button
            onClick={() => setShowRiwayatPendaftaran(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200"
          >
            🕘 Riwayat Pendaftaran
          </button>
        </div>

        {sukses && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            ✅ {sukses}
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* TAB: PANGGIL ANTRIAN */}
        {tab === TAB.PANGGIL && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Panggil Antrian Apotek</h2>
              <button
                onClick={() => profile?.instansi_id && fetchAntrianApotek(profile.instansi_id)}
                className="text-xs text-purple-600 hover:underline"
              >
                🔄 Refresh
              </button>
            </div>

            {/* Nomor sedang dipanggil */}
            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-8 text-center mb-4">
              <p className="text-sm text-gray-500 mb-2">Sedang Dipanggil</p>
              <p className="text-6xl font-bold text-purple-600 tabular-nums">
                {sedangDipanggilApotek ? sedangDipanggilApotek.nomor_antrian : '—'}
              </p>
              {sedangDipanggilApotek?.pasien?.nama_lengkap && (
                <p className="text-sm text-gray-400 mt-2">
                  {sedangDipanggilApotek.pasien.nama_lengkap}
                </p>
              )}
            </div>

            <div className="flex gap-3 mb-6">
              <button
                onClick={panggilUlangApotek}
                disabled={!sedangDipanggilApotek || loadingPanggil}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-40"
              >
                🔁 Panggil Ulang
              </button>
              <button
                onClick={panggilBerikutnyaApotek}
                disabled={loadingPanggil || antrianApotek.filter((k) => k.status_panggil === 'menunggu').length === 0}
                className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {loadingPanggil ? 'Memproses...' : '📢 Panggil Berikutnya'}
              </button>
            </div>

            {/* Daftar menunggu */}
            <div className="border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Menunggu ({antrianApotek.filter((k) => k.status_panggil === 'menunggu').length})
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {antrianApotek
                  .filter((k) => k.status_panggil === 'menunggu')
                  .map((k) => (
                    <div
                      key={k.id}
                      className="flex items-center justify-between text-sm border-b border-gray-100 pb-2"
                    >
                      <span className="font-semibold text-gray-700">{k.nomor_antrian}</span>
                      <span className="text-gray-500 truncate ml-3">
                        {k.pasien?.nama_lengkap}
                      </span>
                    </div>
                  ))}
                {antrianApotek.filter((k) => k.status_panggil === 'menunggu').length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">
                    Tidak ada pasien menunggu di Apotek.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: RESEP MASUK */}
        {tab === TAB.RESEP && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Resep Menunggu Diproses</h2>
              <button onClick={fetchResepMenunggu} className="text-xs text-purple-600 hover:underline">
                🔄 Refresh
              </button>
            </div>

            {resepMenunggu.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Tidak ada resep menunggu.</p>
            ) : (
              <div className="space-y-3">
                {resepMenunggu.map((r) => (
                  <div key={r.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">
                          {r.kunjungan?.pasien?.nama_lengkap || 'Pasien tidak diketahui'}
                        </p>
                        <p className="text-xs text-gray-500">{r.kunjungan?.pasien?.no_rekam_medis}</p>
                      </div>
                    </div>

                    {/* Skrining Administrasi (Permenkes 74/2016 & 26/2020 poin 1a):
                        umur, JK, BB pasien; nama dokter; tanggal resep; unit/poli asal */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 bg-blue-50/50 border border-blue-100 rounded-lg p-3 mb-3">
                      <p>
                        <span className="text-gray-400">Umur/JK:</span>{' '}
                        {hitungUmurSingkat(r.kunjungan?.pasien?.tanggal_lahir, r.kunjungan?.tanggal_periksa) || '-'}
                        {r.kunjungan?.pasien?.jenis_kelamin ? ` / ${r.kunjungan.pasien.jenis_kelamin}` : ''}
                      </p>
                      <p>
                        <span className="text-gray-400">BB:</span>{' '}
                        {r.kunjungan?.skrining?.[0]?.berat_badan
                          ? `${r.kunjungan.skrining[0].berat_badan} kg`
                          : <span className="text-gray-400">-</span>}
                      </p>
                      <p>
                        <span className="text-gray-400">Dokter:</span>{' '}
                        {r.kunjungan?.pemeriksaan?.[0]?.dokter?.nama_lengkap || <span className="text-gray-400">-</span>}
                      </p>
                      <p>
                        <span className="text-gray-400">Tgl resep:</span>{' '}
                        {r.kunjungan?.tanggal_periksa
                          ? new Date(r.kunjungan.tanggal_periksa).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '-'}
                      </p>
                      <p className="col-span-2">
                        <span className="text-gray-400">Unit/Poli asal:</span>{' '}
                        {r.kunjungan?.poli?.nama_poli || <span className="text-gray-400">-</span>}
                      </p>
                    </div>

                    {/* Kesesuaian klinis: peringatan duplikasi pengobatan */}
                    {cekDuplikasiObat(resepMenunggu, r) && (
                      <div className="border border-orange-300 bg-orange-50 rounded-lg p-2 mb-3">
                        <p className="text-xs font-bold text-orange-700">
                          ⚠️ Duplikasi Pengobatan — obat "{r.nama_obat}" muncul lebih dari sekali pada kunjungan ini
                        </p>
                      </div>
                    )}

                    {/* Alergi Obat & Riwayat Penyakit */}
                    <div className="border border-red-200 bg-red-50/50 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-red-700">⚠️ Alergi Obat & Riwayat Penyakit</p>
                        {editRiwayatId !== r.id && (
                          <button
                            type="button"
                            onClick={() => mulaiEditRiwayatKesehatan(r)}
                            className="text-xs text-red-600 font-medium hover:underline"
                          >
                            ✏️ Edit
                          </button>
                        )}
                      </div>

                      {editRiwayatId === r.id ? (
                        <div className="space-y-2">
                          <textarea
                            name="alergi_obat"
                            value={riwayatKesehatanForm.alergi_obat}
                            onChange={handleRiwayatKesehatanChange}
                            rows={2}
                            placeholder="Alergi obat pasien..."
                            className="w-full border rounded-lg px-2 py-1.5 text-sm resize-none bg-white"
                          />
                          <textarea
                            name="riwayat_penyakit"
                            value={riwayatKesehatanForm.riwayat_penyakit}
                            onChange={handleRiwayatKesehatanChange}
                            rows={2}
                            placeholder="Riwayat penyakit pasien..."
                            className="w-full border rounded-lg px-2 py-1.5 text-sm resize-none bg-white"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setEditRiwayatId(null)}
                              className="flex-1 py-1 rounded-lg border border-gray-300 text-gray-600 text-xs hover:bg-gray-50"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={() => simpanRiwayatKesehatan(r)}
                              disabled={loadingRiwayatKesehatan}
                              className="flex-1 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                            >
                              {loadingRiwayatKesehatan ? 'Menyimpan...' : 'Simpan'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm text-gray-800">
                            <span className="font-medium">Alergi:</span>{' '}
                            {r.kunjungan?.pasien?.alergi_obat
                              ? <span className="text-red-700 font-semibold">{r.kunjungan.pasien.alergi_obat}</span>
                              : <span className="text-gray-400">Tidak ada data</span>}
                          </p>
                          <p className="text-sm text-gray-800">
                            <span className="font-medium">Riwayat Penyakit:</span>{' '}
                            {r.kunjungan?.pasien?.riwayat_penyakit || <span className="text-gray-400">Tidak ada data</span>}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 text-sm mb-3">
                      <p><span className="text-gray-400">Obat:</span> {r.nama_obat}</p>
                      <p><span className="text-gray-400">Dosis:</span> {r.dosis}</p>
                      <p><span className="text-gray-400">Aturan pakai:</span> {r.aturan_pakai}</p>
                      <p>
                        <span className="text-gray-400">Jumlah:</span>{' '}
                        {r.jumlah ? `${r.jumlah} ${r.satuan_jumlah || ''}` : '-'}
                      </p>
                      <p>
                        <span className="text-gray-400">Bentuk sediaan:</span>{' '}
                        {r.bentuk_sediaan === 'puyer' ? (
                          <span className="font-semibold text-orange-600">
                            ⚠️ Diracik / Puyer ({r.jumlah_puyer || '-'} bungkus)
                          </span>
                        ) : (
                          'Utuh (tanpa racik)'
                        )}
                      </p>
                      {r.catatan && <p><span className="text-gray-400">Catatan:</span> {r.catatan}</p>}
                    </div>

                    <button
                      type="button"
                      onClick={() => bukaLembarResep(r)}
                      disabled={loadingLembarId === r.id}
                      className="w-full mb-3 py-1.5 rounded-lg border border-purple-300 text-purple-700 text-xs font-medium hover:bg-purple-50 disabled:opacity-50"
                    >
                      {loadingLembarId === r.id ? 'Memuat lembar...' : '📄 Lembar Resep & Telaah'}
                    </button>

                    <div className="flex items-center gap-2">
                      <select
                        value={prosesMap[r.id] || r.obat_id || ''}
                        onChange={(e) => pilihObatUntukResep(r.id, e.target.value)}
                        className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="">-- Pilih obat dari stok --</option>
                        {obatList.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nama_obat} (stok: {o.stok} {o.satuan})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => prosesResep(r)}
                        disabled={loadingResepId === r.id}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {loadingResepId === r.id ? '...' : 'Proses'}
                      </button>
                      <button
                        onClick={() => tandaiObatKosong(r)}
                        disabled={loadingResepId === r.id}
                        className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold disabled:opacity-50"
                      >
                        Obat Kosong
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: RIWAYAT RESEP — daftar resep yang sudah diproses, dibuka sebagai lembar resep */}
        {tab === TAB.RIWAYAT && (() => {
          const cari = filterRiwayat.cari.trim().toLowerCase()
          const grup = kelompokkanRiwayat(riwayatResep).filter((g) => {
            if (!cari) return true
            const p = g.kunjungan.pasien
            return (
              (p?.nama_lengkap || '').toLowerCase().includes(cari) ||
              (p?.no_rekam_medis || '').toLowerCase().includes(cari)
            )
          })

          return (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-700">Riwayat Resep</h2>
                <button onClick={fetchRiwayatResep} className="text-xs text-purple-600 hover:underline">
                  🔄 Refresh
                </button>
              </div>

              {/* Filter */}
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.5fr_auto] gap-2 mb-4 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dari tanggal</label>
                  <input
                    type="date"
                    value={filterRiwayat.dari}
                    onChange={(e) => setFilterRiwayat((f) => ({ ...f, dari: e.target.value }))}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Sampai tanggal</label>
                  <input
                    type="date"
                    value={filterRiwayat.sampai}
                    onChange={(e) => setFilterRiwayat((f) => ({ ...f, sampai: e.target.value }))}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-500 mb-1">Cari nama / No. RM</label>
                  <input
                    type="text"
                    value={filterRiwayat.cari}
                    onChange={(e) => setFilterRiwayat((f) => ({ ...f, cari: e.target.value }))}
                    placeholder="Ketik nama atau No. RM..."
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={fetchRiwayatResep}
                  disabled={loadingRiwayatResep}
                  className="col-span-2 sm:col-span-1 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {loadingRiwayatResep ? 'Memuat...' : 'Tampilkan'}
                </button>
              </div>

              {loadingRiwayatResep && riwayatResep.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Memuat riwayat resep...</p>
              ) : grup.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  Tidak ada riwayat resep pada periode ini.
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-3">{grup.length} lembar resep</p>
                  <div className="space-y-3">
                    {grup.map((g) => {
                      const k = g.kunjungan
                      const pem = ambilTerbaru(k.pemeriksaan)
                      const telaahOk =
                        checklistLengkap(pem?.telaah_resep, TELAAH_RESEP_ITEMS.length) &&
                        checklistLengkap(pem?.informasi_obat, INFORMASI_OBAT_ITEMS.length)
                      const adaKosong = g.obat.some((o) => o.status === 'obat_kosong')

                      return (
                        <div key={k.id} className="border border-gray-200 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 text-sm truncate">
                                {k.pasien?.nama_lengkap || 'Pasien tidak diketahui'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {k.pasien?.no_rekam_medis || '-'}
                                {k.poli?.nama_poli ? ` • ${k.poli.nama_poli}` : ''}
                                {k.tanggal_periksa
                                  ? ` • ${new Date(k.tanggal_periksa).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`
                                  : ''}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                adaKosong ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {adaKosong ? 'Ada obat kosong' : 'Selesai'}
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                telaahOk ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {telaahOk ? 'Telaah lengkap' : 'Telaah belum diisi'}
                              </span>
                            </div>
                          </div>

                          <ul className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1 mb-3">
                            {g.obat.map((o) => (
                              <li key={o.id} className="flex items-center justify-between gap-2">
                                <span className="truncate">
                                  {o.nama_obat}{o.dosis ? ` ${o.dosis}` : ''}
                                  {o.jumlah ? ` — ${o.jumlah} ${o.satuan_jumlah || ''}` : ''}
                                </span>
                                {o.status === 'obat_kosong' && (
                                  <span className="shrink-0 text-[10px] font-semibold text-orange-600">obat kosong</span>
                                )}
                              </li>
                            ))}
                          </ul>

                          <button
                            type="button"
                            onClick={() => bukaLembarByKunjungan(k.id, `riwayat-${k.id}`)}
                            disabled={loadingLembarId === `riwayat-${k.id}`}
                            className="w-full py-1.5 rounded-lg border border-purple-300 text-purple-700 text-xs font-medium hover:bg-purple-50 disabled:opacity-50"
                          >
                            {loadingLembarId === `riwayat-${k.id}` ? 'Memuat lembar...' : '📄 Lihat Lembar Resep'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  {riwayatResep.length >= 500 && (
                    <p className="text-xs text-gray-400 mt-3">
                      Menampilkan 500 resep terbaru. Persempit rentang tanggal untuk melihat yang lebih lama.
                    </p>
                  )}
                </>
              )}
            </div>
          )
        })()}

        {/* TAB: STOK */}
        {tab === TAB.STOK && (
          <Stok
            instansiId={profile?.instansi_id}
            onSukses={(msg) => { setSukses(msg); fetchObatMasuk(profile?.instansi_id) }}
            onError={setError}
          />
        )}

        {/* TAB: PESANAN BARU (pemesanan obat ke GFK/PBF/BPJS/Puskesmas lain)
            Satu halaman: form pesanan baru di atas, Daftar Pesanan langsung di bawahnya. */}
        {tab === TAB.PESANAN && (
          <div className="space-y-8">
            <div ref={formPesananRef}>
              <PesananBaru
                profile={profile}
                onSukses={(msg) => { setError(''); setSukses(msg) }}
                onError={(msg) => { setSukses(''); setError(msg) }}
                onSelesai={() => {
                  setPesananRefresh((k) => k + 1)
                  setTimeout(() => daftarPesananRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
                }}
              />
            </div>

            <div ref={daftarPesananRef} className="border-t border-gray-200 pt-6">
              <DaftarPemesanan
                profile={profile}
                refreshKey={pesananRefresh}
                onPesananBaru={() => formPesananRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
            </div>
          </div>
        )}

        {/* TAB: PESANAN DITERIMA (verifikasi kesesuaian pesanan yang sudah datang) */}
        {tab === TAB.DITERIMA && (
          <PesananDiterima
            profile={profile}
            refreshKey={pesananRefresh}
            onSukses={(msg) => { setError(''); setSukses(msg) }}
            onError={(msg) => { setSukses(''); setError(msg) }}
          />
        )}

      </div>

      {/* Modal Lembar Resep & Telaah — tampilan sama dengan kertas resep Puskesmas.
          Apoteker mengisi checklist Telaah Resep & Informasi Obat di sini. */}
      {lembar && (
        <ModalLembarResep
          terbuka={!!lembar}
          onTutup={() => { setLembar(null); setTtdPasien(null); setConsentTersedia(null) }}
          editableChecklist
          onChangeTelaah={setTelaahResep}
          onChangeInformasi={setInformasiObat}
          onSimpanChecklist={simpanChecklistLembar}
          menyimpanChecklist={menyimpanChecklist}
          instansi={profile?.instansi}
          pasien={lembar.pasien}
          kunjungan={lembar.kunjungan}
          umur={lembar.umur}
          skrining={lembar.skrining}
          form={{
            anamnesis: lembar.pemeriksaan?.anamnesis,
            diagnosis: lembar.pemeriksaan?.diagnosis,
            kode_icd: lembar.pemeriksaan?.kode_icd,
            dokter: lembar.pemeriksaan?.dokter?.nama_lengkap,
          }}
          resepList={lembar.resepList}
          telaahResep={telaahResep}
          informasiObat={informasiObat}
          namaPoli={lembar.kunjungan?.poli?.nama_poli || ''}
          editableTtd
          ttdPasien={ttdPasien}
          consentTersedia={consentTersedia}
          onSimpanTtdApotek={handleSimpanTtdApotek}
          onSalinTtdConsent={handleSalinTtdConsent}
          onHapusTtd={handleHapusTtd}
        />
      )}

      {/* Modal Riwayat Pendaftaran — pola sama seperti DashboardLoket, supaya
          apoteker bisa cek riwayat kunjungan pasien (termasuk diagnosa) untuk
          keperluan pengkajian resep sesuai Permenkes 74/2016 & 26/2020. */}
      {showRiwayatPendaftaran && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center sm:p-4"
          onClick={() => setShowRiwayatPendaftaran(false)}
        >
          <div
            className="bg-white sm:rounded-2xl shadow-xl w-full h-full sm:h-[85vh] sm:max-w-5xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 shrink-0 border-b border-gray-200">
              <button
                type="button"
                onClick={() => setShowRiwayatPendaftaran(false)}
                aria-label="Kembali"
                className="sm:hidden shrink-0 p-1.5 -ml-1.5 rounded-lg text-gray-500 touch-manipulation"
              >
                <i className="ti ti-arrow-left text-lg" aria-hidden="true"></i>
              </button>
              <p className="font-semibold text-gray-800 text-sm sm:text-base flex-1 text-center sm:text-left">
                Riwayat Pendaftaran
              </p>
              <button
                type="button"
                onClick={() => setShowRiwayatPendaftaran(false)}
                className="hidden sm:block text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
              >
                Tutup
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
              <RiwayatPendaftaran instansiId={profile?.instansi_id} instansi={profile?.instansi} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}