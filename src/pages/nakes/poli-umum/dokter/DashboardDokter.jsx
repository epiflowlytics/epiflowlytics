import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { deteksiPD3I } from './pd3iDetector'

export default function DashboardDokter() {
  const [profile, setProfile] = useState(null)
  const [antrian, setAntrian] = useState([])
  const [selected, setSelected] = useState(null)
  const [skrining, setSkrining] = useState(null)
  const [obatList, setObatList] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState(false)
  const [loadingPanggil, setLoadingPanggil] = useState(false)

  const [form, setForm] = useState({
    anamnesis: '',
    diagnosis: '',
    kode_icd: '',
    tindakan: '',
    rujukan: false,
    tujuan_rujukan: '',
    surat_sakit: false,
    lama_sakit: '',
    skbs: false,
    keperluan_skbs: '',
    catatan: '',
  })

  const [resepList, setResepList] = useState([
    {
      nama_obat: '', dosis: '', aturan_pakai: '', catatan: '', obat_id: '',
      jumlah: '', satuan_jumlah: 'tablet',
      bentuk_sediaan: 'utuh', jumlah_puyer: '',
    },
  ])

  const [pd3iTerdeteksi, setPd3iTerdeteksi] = useState([])
  const [penyakitDipilih, setPenyakitDipilih] = useState([])
  const adalahPD3I = penyakitDipilih.length > 0

  // ─── Alur Lab ─────────────────────────────────────────────
  // tujuan: 'apotek' (selesai periksa, seperti alur biasa) atau 'lab' (perlu pemeriksaan penunjang)
  const [tujuan, setTujuan] = useState('apotek')
  const [permintaanLabList, setPermintaanLabList] = useState([
    { jenis_pemeriksaan: '', catatan_dokter: '' },
  ])
  const [riwayatHasilLab, setRiwayatHasilLab] = useState([]) // hasil lab kunjungan ini (kalau pasien balik dari lab)

  function tambahPermintaanLab() {
    setPermintaanLabList((prev) => [...prev, { jenis_pemeriksaan: '', catatan_dokter: '' }])
  }

  function hapusPermintaanLab(index) {
    setPermintaanLabList((prev) => prev.filter((_, i) => i !== index))
  }

  function handlePermintaanLabChange(index, field, value) {
    setPermintaanLabList((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function toggleDeteksiPenyakit(nama) {
    setPenyakitDipilih((prev) =>
      prev.includes(nama) ? prev.filter((n) => n !== nama) : [...prev, nama]
    )
  }

  useEffect(() => {
    fetchProfile()
    fetchObat()
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(data)
    fetchAntrian(data.poli_id)
  }

  async function fetchAntrian(poliId) {
    const { data, error } = await supabase
      .from('kunjungan')
      .select(`
        *,
        pasien:pasien_id(
          nama_lengkap,
          tanggal_lahir,
          tempat_lahir,
          jenis_kelamin,
          no_rekam_medis,
          kategori_pasien,
          no_bpjs,
          no_nik,
          no_kk,
          urutan_kk,
          status_keluarga,
          status_keluarga_lainnya,
          pekerjaan,
          alamat
        )
      `)
      // 'menunggu_dokter' = pasien baru dari perawat, 'hasil_lab_selesai' = pasien balik dari lab
      .in('status', ['menunggu_dokter', 'hasil_lab_selesai'])
      .eq('poli_id', poliId)
      .eq('tanggal_periksa', new Date().toISOString().split('T')[0])
      .order('nomor_antrian', { ascending: true })

    if (error) console.error(error)

    // Urutkan: pasien dengan status_prioritas tampil lebih dulu.
    const urutan = (data || []).slice().sort((a, b) => {
      const prioA = a.status_prioritas ? 1 : 0
      const prioB = b.status_prioritas ? 1 : 0
      if (prioA !== prioB) return prioB - prioA
      return (a.nomor_antrian || 0) - (b.nomor_antrian || 0)
    })

    setAntrian(urutan)
  }

  function labelStatusKeluarga(value, teksLainnya) {
    const opsi = {
      kepala_keluarga: 'Kepala Keluarga',
      ayah: 'Ayah',
      ibu: 'Ibu',
      anak: 'Anak',
      cucu: 'Cucu',
      menantu: 'Menantu',
      famili_lain: 'Famili Lain',
      lainnya: teksLainnya || 'Lainnya',
    }
    return opsi[value] || ''
  }

  function labelPrioritas(value) {
    const opsi = {
      lansia: { label: 'Lansia', icon: '🧓' },
      ibu_hamil: { label: 'Ibu Hamil', icon: '🤰' },
      disabilitas: { label: 'Disabilitas', icon: '♿' },
      gawat_darurat: { label: 'Gawat Darurat', icon: '🚨' },
    }
    return opsi[value] || null
  }

  const sedangDipanggil = antrian.find((k) => k.status_panggil === 'dipanggil') || null
  const jumlahMenunggu = antrian.filter((k) => k.status_panggil !== 'dipanggil').length

  async function panggilBerikutnya() {
    setLoadingPanggil(true)
    setError('')
    try {
      if (sedangDipanggil) {
        await supabase
          .from('kunjungan')
          .update({ status_panggil: 'selesai' })
          .eq('id', sedangDipanggil.id)
      }

      const berikutnya = antrian
        .filter((k) => k.id !== sedangDipanggil?.id && k.status_panggil !== 'dipanggil')
        .sort((a, b) => {
          const prioA = a.status_prioritas ? 1 : 0
          const prioB = b.status_prioritas ? 1 : 0
          if (prioA !== prioB) return prioB - prioA
          return (a.nomor_antrian || 0) - (b.nomor_antrian || 0)
        })[0]

      if (!berikutnya) {
        setError('Tidak ada antrian menunggu di poli ini.')
        await fetchAntrian(profile.poli_id)
        return
      }

      const { error: updateErr } = await supabase
        .from('kunjungan')
        .update({ status_panggil: 'dipanggil', waktu_panggil: new Date().toISOString() })
        .eq('id', berikutnya.id)

      if (updateErr) throw new Error(updateErr.message)

      await fetchAntrian(profile.poli_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPanggil(false)
    }
  }

  async function panggilUlang() {
    if (!sedangDipanggil) return
    setLoadingPanggil(true)
    try {
      await supabase
        .from('kunjungan')
        .update({ waktu_panggil: new Date().toISOString() })
        .eq('id', sedangDipanggil.id)
      await fetchAntrian(profile.poli_id)
    } finally {
      setLoadingPanggil(false)
    }
  }

  async function fetchObat() {
    const { data, error } = await supabase
      .from('obat_masuk')
      .select('id, nama_obat, satuan, stok')
      .eq('is_aktif', true)
      .order('nama_obat', { ascending: true })

    if (error) {
      console.error(error)
      return
    }
    setObatList(data || [])
  }

  function hitungUmur(tanggalLahir) {
    if (!tanggalLahir) return { teks: '', tahun: 0 }
    const lahir = new Date(tanggalLahir)
    const sekarang = new Date()
    let tahun = sekarang.getFullYear() - lahir.getFullYear()
    let bulan = sekarang.getMonth() - lahir.getMonth()
    let hari = sekarang.getDate() - lahir.getDate()
    if (hari < 0) { bulan--; hari += new Date(sekarang.getFullYear(), sekarang.getMonth(), 0).getDate() }
    if (bulan < 0) { tahun--; bulan += 12 }
    return { teks: `${tahun} Thn ${bulan} Bln ${hari} Hr`, tahun }
  }

  async function pilihPasien(kunjungan) {
    setSelected(kunjungan)
    setError('')
    setSukses(false)
    setForm({
      anamnesis: '',
      diagnosis: '',
      kode_icd: '',
      tindakan: '',
      rujukan: false,
      tujuan_rujukan: '',
      surat_sakit: false,
      lama_sakit: '',
      skbs: false,
      keperluan_skbs: '',
      catatan: '',
    })
    setResepList([{ nama_obat: '', dosis: '', aturan_pakai: '', catatan: '', obat_id: '' }])
    setTujuan('apotek')
    setPermintaanLabList([{ jenis_pemeriksaan: '', catatan_dokter: '' }])
    setRiwayatHasilLab([])

    // Ambil data skrining perawat untuk kunjungan ini
    const { data, error } = await supabase
      .from('skrining')
      .select('*')
      .eq('kunjungan_id', kunjungan.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(error)
      setSkrining(null)
      setPd3iTerdeteksi([])
      setPenyakitDipilih([])
    } else {
      setSkrining(data)

      // Deteksi PD3I otomatis dari keluhan_utama + catatan
      const teksGabungan = `${data?.keluhan_utama || ''} ${data?.catatan || ''}`
      const hasilDeteksi = deteksiPD3I(teksGabungan)
      setPd3iTerdeteksi(hasilDeteksi)
      // Default: semua hasil deteksi otomatis tercentang, dokter bisa batalkan yang tidak relevan
      setPenyakitDipilih(hasilDeteksi.map((h) => h.nama))
    }

    // Kalau pasien ini balik dari lab, ambil hasil pemeriksaan labnya untuk ditampilkan
    if (kunjungan.status === 'hasil_lab_selesai') {
      await fetchHasilLab(kunjungan.id)
    }
  }

  async function fetchHasilLab(kunjunganId) {
    const { data, error } = await supabase
      .from('permintaan_lab')
      .select(`
        id, jenis_pemeriksaan, catatan_dokter, status,
        hasil_lab(id, nama_parameter, nilai_hasil, satuan, nilai_rujukan, keterangan)
      `)
      .eq('kunjungan_id', kunjunganId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      setRiwayatHasilLab([])
      return
    }
    setRiwayatHasilLab(data || [])
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  function handleResepChange(index, field, value) {
    setResepList((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function handlePilihObat(index, obatId) {
    const obat = obatList.find((o) => o.id === obatId)
    setResepList((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        obat_id: obatId,
        nama_obat: obat ? obat.nama_obat : next[index].nama_obat,
      }
      return next
    })
  }

  function tambahResep() {
    setResepList((prev) => [...prev, {
      nama_obat: '', dosis: '', aturan_pakai: '', catatan: '', obat_id: '',
      jumlah: '', satuan_jumlah: 'tablet',
      bentuk_sediaan: 'utuh', jumlah_puyer: '',
    }])
  }

  function hapusResep(index) {
    setResepList((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!form.diagnosis.trim()) throw new Error('Diagnosis wajib diisi.')

      // Resep wajib hanya untuk alur "selesai -> apotek".
      // Untuk alur "perlu lab", resep opsional karena obat baru ditentukan setelah hasil lab keluar.
      const resepValid = resepList.filter((r) => r.nama_obat.trim() && r.dosis.trim() && r.aturan_pakai.trim())

      if (tujuan === 'apotek') {
        if (resepValid.length === 0) throw new Error('Minimal satu resep obat wajib diisi (nama obat, dosis, aturan pakai).')

        const tanpaJumlah = resepValid.some((r) => !r.jumlah || parseFloat(r.jumlah) <= 0)
        if (tanpaJumlah) throw new Error('Jumlah obat yang diberikan wajib diisi untuk setiap resep.')

        const puyerTanpaJumlah = resepValid.some((r) => r.bentuk_sediaan === 'puyer' && (!r.jumlah_puyer || parseInt(r.jumlah_puyer, 10) <= 0))
        if (puyerTanpaJumlah) throw new Error('Jumlah bungkus puyer wajib diisi untuk resep yang diracik/dipuyer.')
      }

      let permintaanLabValid = []
      if (tujuan === 'lab') {
        permintaanLabValid = permintaanLabList.filter((p) => p.jenis_pemeriksaan.trim())
        if (permintaanLabValid.length === 0) throw new Error('Minimal satu jenis pemeriksaan lab wajib diisi.')
      }

      // 1. Simpan pemeriksaan
      const { data: pemeriksaanData, error: pemeriksaanErr } = await supabase
        .from('pemeriksaan')
        .insert({
          kunjungan_id: selected.id,
          dokter_id: profile.id,
          anamnesis: form.anamnesis.trim() || null,
          diagnosis: form.diagnosis.trim(),
          kode_icd: form.kode_icd.trim() || null,
          adalah_pd3i: adalahPD3I,
          nama_pd3i: penyakitDipilih.length > 0 ? penyakitDipilih : null,
          tindakan: form.tindakan.trim() || null,
          rujukan: form.rujukan,
          tujuan_rujukan: form.rujukan ? form.tujuan_rujukan.trim() || null : null,
          surat_sakit: form.surat_sakit,
          lama_sakit: form.surat_sakit && form.lama_sakit ? parseInt(form.lama_sakit, 10) : null,
          skbs: form.skbs,
          keperluan_skbs: form.skbs ? form.keperluan_skbs.trim() || null : null,
          catatan: form.catatan.trim() || null,
        })
        .select()
        .single()

      if (pemeriksaanErr) throw new Error(pemeriksaanErr.message)

      // 2. Simpan resep (bisa banyak baris, bisa kosong kalau tujuan = lab)
      if (resepValid.length > 0) {
        const resepRows = resepValid.map((r) => ({
          pemeriksaan_id: pemeriksaanData.id,
          kunjungan_id: selected.id,
          nama_obat: r.nama_obat.trim(),
          dosis: r.dosis.trim(),
          aturan_pakai: r.aturan_pakai.trim(),
          catatan: r.catatan.trim() || null,
          obat_id: r.obat_id || null,
          jumlah: r.jumlah ? parseFloat(r.jumlah) : null,
          satuan_jumlah: r.satuan_jumlah || null,
          bentuk_sediaan: r.bentuk_sediaan || 'utuh',
          jumlah_puyer: r.bentuk_sediaan === 'puyer' && r.jumlah_puyer ? parseInt(r.jumlah_puyer, 10) : null,
          status: 'menunggu',
        }))

        const { error: resepErr } = await supabase.from('resep').insert(resepRows)
        if (resepErr) throw new Error(resepErr.message)
      }

      if (tujuan === 'lab') {
        // 3a. Simpan permintaan pemeriksaan lab (bisa lebih dari satu jenis tes)
        const permintaanRows = permintaanLabValid.map((p) => ({
          kunjungan_id: selected.id,
          pemeriksaan_id: pemeriksaanData.id,
          diminta_oleh: profile.id,
          jenis_pemeriksaan: p.jenis_pemeriksaan.trim(),
          catatan_dokter: p.catatan_dokter.trim() || null,
          status: 'menunggu',
        }))

        const { error: labErr } = await supabase.from('permintaan_lab').insert(permintaanRows)
        if (labErr) throw new Error(labErr.message)

        // 3b. Update status kunjungan -> menunggu_lab, reset status_panggil untuk antrian di lab
        const { error: updateErr } = await supabase
          .from('kunjungan')
          .update({ status: 'menunggu_lab', status_panggil: 'menunggu', waktu_panggil: null })
          .eq('id', selected.id)

        if (updateErr) throw new Error(updateErr.message)

        setSukses('lab')
      } else {
        // 3c. Update status kunjungan -> menunggu_obat (diproses apotek), reset status_panggil
        const { error: updateErr } = await supabase
          .from('kunjungan')
          .update({ status: 'menunggu_obat', status_panggil: 'menunggu', waktu_panggil: null })
          .eq('id', selected.id)

        if (updateErr) throw new Error(updateErr.message)

        setSukses('apotek')
      }

      setSelected(null)
      setSkrining(null)
      setPd3iTerdeteksi([])
      setPenyakitDipilih([])
      setRiwayatHasilLab([])
      fetchAntrian(profile.poli_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const umur = selected ? hitungUmur(selected.pasien.tanggal_lahir) : null

  // ─── TAMPILAN ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard Dokter</h1>
          <p className="text-gray-500 text-sm">Diagnosa &amp; Resep Pasien</p>
        </div>

        {sukses === 'apotek' && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            ✅ Pemeriksaan dan resep berhasil disimpan, pasien diteruskan ke apotek.
          </div>
        )}
        {sukses === 'lab' && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            ✅ Pemeriksaan disimpan, pasien diteruskan ke laboratorium.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

          {/* Antrian */}
          <div className="bg-white rounded-2xl shadow-sm p-5 h-fit">
            {/* Panel Panggil Antrian */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-center">
              <p className="text-xs text-blue-700 mb-1">Sedang Dipanggil</p>
              <p className="text-4xl font-bold text-blue-700 tabular-nums">
                {sedangDipanggil ? sedangDipanggil.nomor_antrian : '—'}
              </p>
              {sedangDipanggil?.pasien?.nama_lengkap && (
                <p className="text-xs text-blue-600 mt-1">{sedangDipanggil.pasien.nama_lengkap}</p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={panggilUlang}
                  disabled={!sedangDipanggil || loadingPanggil}
                  className="flex-1 py-1.5 rounded-lg border border-blue-300 text-blue-700 text-xs hover:bg-blue-100 disabled:opacity-40"
                >
                  🔁 Ulang
                </button>
                <button
                  onClick={panggilBerikutnya}
                  disabled={loadingPanggil || jumlahMenunggu === 0}
                  className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {loadingPanggil ? 'Memproses...' : '📢 Panggil Berikutnya'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Menunggu Dokter</h2>
              <button
                onClick={() => fetchAntrian(profile?.poli_id)}
                className="text-xs text-blue-600 hover:underline"
              >
                🔄 Refresh
              </button>
            </div>

            {antrian.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                Belum ada pasien menunggu.
              </p>
            ) : (
              <div className="space-y-2">
                {antrian.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => pilihPasien(k)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      selected?.id === k.id
                        ? 'border-blue-500 bg-blue-50'
                        : k.status_panggil === 'dipanggil'
                        ? 'border-blue-300 bg-blue-50/50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                        {k.nomor_antrian ?? '-'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate flex items-center gap-1">
                          {labelPrioritas(k.status_prioritas) && (
                            <span title={labelPrioritas(k.status_prioritas).label}>
                              {labelPrioritas(k.status_prioritas).icon}
                            </span>
                          )}
                          {k.pasien.nama_lengkap}
                        </p>
                        <p className="text-xs text-gray-500">
                          {k.pasien.no_rekam_medis} • {hitungUmur(k.pasien.tanggal_lahir).teks}
                        </p>
                        {k.status === 'hasil_lab_selesai' && (
                          <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">
                            🧪 Hasil Lab Sudah Ada
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail & Form */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
                <span className="text-4xl mb-3">👈</span>
                <p className="text-sm">Pilih pasien dari daftar menunggu</p>
              </div>
            ) : (
              <>
                {/* Info Pasien */}
                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800">{selected.pasien.nama_lengkap}</p>
                    {labelPrioritas(selected.status_prioritas) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        {labelPrioritas(selected.status_prioritas).icon} {labelPrioritas(selected.status_prioritas).label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {selected.pasien.no_rekam_medis} • {umur.teks} • {selected.pasien.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                  </p>
                  {selected.pasien.tempat_lahir && (
                    <p className="text-xs text-gray-500">Lahir di: {selected.pasien.tempat_lahir}</p>
                  )}
                  <p className="text-xs text-gray-500">{selected.pasien.alamat}</p>
                  {selected.pasien.pekerjaan && (
                    <p className="text-xs text-gray-500">Pekerjaan: {selected.pasien.pekerjaan}</p>
                  )}
                  {selected.pasien.no_nik && (
                    <p className="text-xs text-gray-500">NIK: {selected.pasien.no_nik}</p>
                  )}
                  {selected.pasien.no_kk && (
                    <p className="text-xs text-gray-500">
                      KK: {selected.pasien.no_kk}
                      {selected.pasien.status_keluarga && ` • ${labelStatusKeluarga(selected.pasien.status_keluarga, selected.pasien.status_keluarga_lainnya)}`}
                      {selected.pasien.urutan_kk ? ` (anggota ke-${selected.pasien.urutan_kk})` : ''}
                    </p>
                  )}
                  {selected.wilayah && (
                    <p className="text-xs text-gray-500">
                      Wilayah: {selected.wilayah === 'dalam' ? 'Dalam wilayah' : 'Luar wilayah'}
                    </p>
                  )}
                  {selected.kategori_pasien === 'bpjs' && (
                    <p className="text-xs text-blue-600">BPJS: {selected.pasien.no_bpjs}</p>
                  )}
                </div>

                {/* Hasil Laboratorium (kalau pasien ini balik dari lab) */}
                {riwayatHasilLab.length > 0 && (
                  <div className="border-2 border-teal-300 bg-teal-50 rounded-xl p-4 mb-4">
                    <p className="text-sm font-bold text-teal-700 mb-3">🧪 Hasil Pemeriksaan Laboratorium</p>
                    <div className="space-y-3">
                      {riwayatHasilLab.map((p) => (
                        <div key={p.id} className="bg-white rounded-lg p-3 border border-teal-200">
                          <p className="text-sm font-semibold text-gray-800">{p.jenis_pemeriksaan}</p>
                          {p.catatan_dokter && (
                            <p className="text-xs text-gray-500 mb-2">Permintaan: {p.catatan_dokter}</p>
                          )}
                          {p.hasil_lab && p.hasil_lab.length > 0 ? (
                            <table className="w-full text-xs mt-2">
                              <thead>
                                <tr className="text-left text-gray-400 border-b">
                                  <th className="py-1 pr-2">Parameter</th>
                                  <th className="py-1 pr-2">Hasil</th>
                                  <th className="py-1 pr-2">Rujukan</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.hasil_lab.map((h) => (
                                  <tr key={h.id} className="border-b last:border-0">
                                    <td className="py-1 pr-2 text-gray-700">{h.nama_parameter}</td>
                                    <td className="py-1 pr-2 font-medium text-gray-800">
                                      {h.nilai_hasil} {h.satuan || ''}
                                    </td>
                                    <td className="py-1 pr-2 text-gray-400">{h.nilai_rujukan || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-gray-400 italic">Belum ada hasil untuk pemeriksaan ini.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hasil Skrining Perawat */}
                {skrining ? (
                  <div className="border border-gray-200 rounded-xl p-4 mb-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Hasil Skrining Perawat</p>
                    <div className="grid grid-cols-3 gap-3 text-sm mb-2">
                      <div><span className="text-gray-400">TD:</span> {skrining.tekanan_darah || '-'}</div>
                      <div><span className="text-gray-400">Suhu:</span> {skrining.suhu ? `${skrining.suhu}°C` : '-'}</div>
                      <div><span className="text-gray-400">BB/TB:</span> {skrining.berat_badan || '-'}kg / {skrining.tinggi_badan || '-'}cm</div>
                    </div>
                    <p className="text-sm"><span className="text-gray-400">Keluhan:</span> {skrining.keluhan_utama}</p>
                    {skrining.catatan && (
                      <p className="text-sm mt-1"><span className="text-gray-400">Catatan:</span> {skrining.catatan}</p>
                    )}
                  </div>
                ) : (
                  <div className="border border-yellow-200 bg-yellow-50 text-yellow-700 rounded-xl p-4 mb-4 text-sm">
                    ⚠️ Belum ada data skrining dari perawat untuk pasien ini.
                  </div>
                )}

                {/* ALERT PD3I */}
                {pd3iTerdeteksi.length > 0 && (
                  <div className="border-2 border-red-300 bg-red-50 rounded-xl p-4 mb-4">
                    <p className="text-sm font-bold text-red-700 mb-2">
                      🚨 Peringatan: Terindikasi Penyakit Surveilans (PD3I)
                    </p>
                    <p className="text-xs text-red-600 mb-2">
                      Centang penyakit yang menurut Anda relevan. Yang dicentang akan tersimpan di data pemeriksaan.
                    </p>
                    <ul className="space-y-2">
                      {pd3iTerdeteksi.map((item) => (
                        <li key={item.nama} className="text-sm">
                          <label className="flex items-start gap-2 text-red-700 cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={penyakitDipilih.includes(item.nama)}
                              onChange={() => toggleDeteksiPenyakit(item.nama)}
                            />
                            <span>
                              <span className="font-semibold">{item.nama}</span>
                              <span className="text-red-500 text-xs">
                                {' '}— kata kunci: {item.cocok.join(', ')}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {error && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">

                  {/* Anamnesis */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Anamnesis</label>
                    <textarea
                      name="anamnesis"
                      value={form.anamnesis}
                      onChange={handleFormChange}
                      rows={2}
                      placeholder="Hasil wawancara/pemeriksaan tambahan..."
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Diagnosis + ICD */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Diagnosis <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="diagnosis"
                        value={form.diagnosis}
                        onChange={handleFormChange}
                        placeholder="Diagnosis kerja"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Kode ICD</label>
                      <input
                        type="text"
                        name="kode_icd"
                        value={form.kode_icd}
                        onChange={handleFormChange}
                        placeholder="A00.0"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* Tindakan */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tindakan</label>
                    <textarea
                      name="tindakan"
                      value={form.tindakan}
                      onChange={handleFormChange}
                      rows={2}
                      placeholder="Tindakan yang diberikan..."
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Rujukan */}
                  <div className="flex items-start gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" name="rujukan" checked={form.rujukan} onChange={handleFormChange} />
                      Rujuk pasien
                    </label>
                    {form.rujukan && (
                      <input
                        type="text"
                        name="tujuan_rujukan"
                        value={form.tujuan_rujukan}
                        onChange={handleFormChange}
                        placeholder="Tujuan rujukan (RS/fasyankes)"
                        className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                      />
                    )}
                  </div>

                  {/* Surat Sakit */}
                  <div className="flex items-start gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" name="surat_sakit" checked={form.surat_sakit} onChange={handleFormChange} />
                      Surat sakit
                    </label>
                    {form.surat_sakit && (
                      <input
                        type="number"
                        name="lama_sakit"
                        value={form.lama_sakit}
                        onChange={handleFormChange}
                        placeholder="Lama (hari)"
                        className="w-32 border rounded-lg px-3 py-1.5 text-sm"
                      />
                    )}
                  </div>

                  {/* SKBS (Surat Keterangan Berbadan Sehat) */}
                  <div className="flex items-start gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" name="skbs" checked={form.skbs} onChange={handleFormChange} />
                      Surat keterangan berbadan sehat (SKBS)
                    </label>
                    {form.skbs && (
                      <input
                        type="text"
                        name="keperluan_skbs"
                        value={form.keperluan_skbs}
                        onChange={handleFormChange}
                        placeholder="Keperluan (mis. melamar kerja)"
                        className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                      />
                    )}
                  </div>

                  {/* Catatan */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                    <textarea
                      name="catatan"
                      value={form.catatan}
                      onChange={handleFormChange}
                      rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* TUJUAN SETELAH PEMERIKSAAN */}
                  <div className="border-t pt-4">
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      Tujuan Setelah Pemeriksaan <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTujuan('apotek')}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                          tujuan === 'apotek'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-300'
                        }`}
                      >
                        💊 Selesai → Apotek
                      </button>
                      <button
                        type="button"
                        onClick={() => setTujuan('lab')}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                          tujuan === 'lab'
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-gray-600 border-gray-300'
                        }`}
                      >
                        🧪 Perlu Lab → Laboratorium
                      </button>
                    </div>
                  </div>

                  {/* PERMINTAAN LAB (muncul kalau tujuan = lab) */}
                  {tujuan === 'lab' && (
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-semibold text-gray-800">
                          Jenis Pemeriksaan Lab <span className="text-red-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={tambahPermintaanLab}
                          className="text-xs text-teal-600 hover:underline"
                        >
                          + Tambah pemeriksaan
                        </button>
                      </div>
                      <div className="space-y-3">
                        {permintaanLabList.map((p, i) => (
                          <div key={i} className="border border-gray-200 rounded-xl p-3">
                            <div className="flex gap-2 mb-2">
                              <input
                                type="text"
                                value={p.jenis_pemeriksaan}
                                onChange={(e) => handlePermintaanLabChange(i, 'jenis_pemeriksaan', e.target.value)}
                                placeholder="Mis. Darah Lengkap, Gula Darah, Urine Lengkap"
                                className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                              />
                              {permintaanLabList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => hapusPermintaanLab(i)}
                                  className="text-xs text-red-500 px-2"
                                >
                                  Hapus
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              value={p.catatan_dokter}
                              onChange={(e) => handlePermintaanLabChange(i, 'catatan_dokter', e.target.value)}
                              placeholder="Catatan untuk petugas lab (opsional)"
                              className="w-full border rounded-lg px-2 py-1.5 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Pasien akan diarahkan ke Laboratorium. Setelah hasil selesai, pasien otomatis kembali ke antrian dokter untuk pemeriksaan lanjutan.
                      </p>
                    </div>
                  )}

                  {/* RESEP OBAT */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-gray-800">
                        Resep Obat {tujuan === 'apotek' && <span className="text-red-500">*</span>}
                        {tujuan === 'lab' && <span className="text-xs font-normal text-gray-400 ml-1">(opsional)</span>}
                      </label>
                      <button
                        type="button"
                        onClick={tambahResep}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        + Tambah obat
                      </button>
                    </div>

                    <div className="space-y-3">
                      {resepList.map((r, i) => {
                        const obatDipilih = obatList.find((o) => o.id === r.obat_id)
                        return (
                          <div key={i} className="border border-gray-200 rounded-xl p-3">
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Pilih dari stok apotek</label>
                                <select
                                  value={r.obat_id}
                                  onChange={(e) => handlePilihObat(i, e.target.value)}
                                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                                >
                                  <option value="">-- Ketik manual / pilih --</option>
                                  {obatList.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.nama_obat} (stok: {o.stok} {o.satuan})
                                    </option>
                                  ))}
                                </select>
                                {obatDipilih && obatDipilih.stok <= 0 && (
                                  <p className="text-xs text-red-500 mt-1">⚠️ Stok obat ini kosong di apotek</p>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Nama obat</label>
                                <input
                                  type="text"
                                  value={r.nama_obat}
                                  onChange={(e) => handleResepChange(i, 'nama_obat', e.target.value)}
                                  placeholder="Nama obat"
                                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <input
                                type="text"
                                value={r.dosis}
                                onChange={(e) => handleResepChange(i, 'dosis', e.target.value)}
                                placeholder="Dosis (mis. 500mg)"
                                className="w-full border rounded-lg px-2 py-1.5 text-sm"
                              />
                              <input
                                type="text"
                                value={r.aturan_pakai}
                                onChange={(e) => handleResepChange(i, 'aturan_pakai', e.target.value)}
                                placeholder="Aturan pakai (mis. 3x1 setelah makan)"
                                className="w-full border rounded-lg px-2 py-1.5 text-sm"
                              />
                            </div>

                            {/* Jumlah diberikan */}
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Jumlah diberikan</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={r.jumlah}
                                  onChange={(e) => handleResepChange(i, 'jumlah', e.target.value)}
                                  placeholder="Mis. 10"
                                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Satuan</label>
                                <select
                                  value={r.satuan_jumlah}
                                  onChange={(e) => handleResepChange(i, 'satuan_jumlah', e.target.value)}
                                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                                >
                                  <option value="tablet">Tablet</option>
                                  <option value="kapsul">Kapsul</option>
                                  <option value="strip">Strip</option>
                                  <option value="papan">Papan</option>
                                  <option value="botol">Botol</option>
                                  <option value="sachet">Sachet</option>
                                  <option value="ml">ml</option>
                                  <option value="tube">Tube</option>
                                  <option value="ampul">Ampul</option>
                                </select>
                              </div>
                            </div>

                            {/* Bentuk sediaan: utuh atau puyer/racikan */}
                            <div className="mb-2">
                              <label className="block text-xs text-gray-500 mb-1">Bentuk sediaan</label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleResepChange(i, 'bentuk_sediaan', 'utuh')}
                                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition ${
                                    r.bentuk_sediaan === 'utuh'
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white text-gray-600 border-gray-300'
                                  }`}
                                >
                                  Utuh (tanpa racik)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResepChange(i, 'bentuk_sediaan', 'puyer')}
                                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition ${
                                    r.bentuk_sediaan === 'puyer'
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white text-gray-600 border-gray-300'
                                  }`}
                                >
                                  Puyer / Racikan
                                </button>
                              </div>
                              {r.bentuk_sediaan === 'puyer' && (
                                <input
                                  type="number"
                                  min="1"
                                  value={r.jumlah_puyer}
                                  onChange={(e) => handleResepChange(i, 'jumlah_puyer', e.target.value)}
                                  placeholder="Jumlah bungkus puyer"
                                  className="w-full border rounded-lg px-2 py-1.5 text-sm mt-2"
                                />
                              )}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={r.catatan}
                                onChange={(e) => handleResepChange(i, 'catatan', e.target.value)}
                                placeholder="Catatan (opsional)"
                                className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                              />
                              {resepList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => hapusResep(i)}
                                  className="text-xs text-red-500 px-2"
                                >
                                  Hapus
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Tombol */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className={`flex-1 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${
                        tujuan === 'lab' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {loading
                        ? 'Menyimpan...'
                        : tujuan === 'lab'
                        ? 'Simpan & Teruskan ke Laboratorium →'
                        : 'Simpan & Teruskan ke Apotek →'}
                    </button>
                  </div>

                </form>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}