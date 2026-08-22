import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'

/* ────────────────────────────────────────────────────────────────
   DASHBOARD DOKTER IGD
   Adaptasi dari DashboardDokter.jsx (poli umum):
   - Sumber pasien: kunjungan status 'menunggu_dokter' pada poli IGD
     (diteruskan dari DashboardPerawatIGD.jsx setelah triase).
   - TIDAK ADA sistem panggil antrian (tombol "Panggil Berikutnya" dihapus) —
     dokter langsung memilih pasien dari daftar, diurutkan berdasar triase
     (merah dulu, lalu kuning, lalu hijau), bukan nomor antrian.
   - Field tambahan: Disposisi Akhir (Pulang / Rawat Inap / Rujuk RS Lain),
     disimpan di kolom pemeriksaan.disposisi_igd.
   - Alur lab (permintaan_lab) & resep tetap sama seperti poli umum.
   ──────────────────────────────────────────────────────────────── */

const URUTAN_TRIASE = { merah: 0, kuning: 1, hijau: 2 }

const FORM_AWAL = {
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
  disposisi_igd: '', // 'pulang' | 'rawat_inap' | 'rujuk'
}

export default function DashboardDokterIGD() {
  const [profile, setProfile] = useState(null)
  const [poliIgd, setPoliIgd] = useState(null)
  const [antrian, setAntrian] = useState([])
  const [selected, setSelected] = useState(null)
  const [skrining, setSkrining] = useState(null)
  const [obatList, setObatList] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState(false)

  const [form, setForm] = useState(FORM_AWAL)

  const [resepList, setResepList] = useState([
    {
      nama_obat: '', dosis: '', aturan_pakai: '', catatan: '', obat_id: '',
      jumlah: '', satuan_jumlah: 'tablet',
      bentuk_sediaan: 'utuh', jumlah_puyer: '',
    },
  ])

  // Alur Lab — identik dengan dokter poli umum
  const [tujuan, setTujuan] = useState('apotek') // 'apotek' atau 'lab'
  const [permintaanLabList, setPermintaanLabList] = useState([
    { jenis_pemeriksaan: '', catatan_dokter: '' },
  ])
  const [riwayatHasilLab, setRiwayatHasilLab] = useState([])

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

    if (data?.instansi_id) {
      const { data: poli, error: poliErr } = await supabase
        .from('polis')
        .select('id, nama_poli')
        .eq('instansi_id', data.instansi_id)
        .eq('nama_poli', 'IGD')
        .maybeSingle()

      if (poliErr) {
        console.error('Error fetch poli IGD:', poliErr.message)
      } else if (poli) {
        setPoliIgd(poli)
        fetchAntrian(poli.id)
      }
    }
  }

  async function fetchObat() {
    const { data, error } = await supabase
      .from('obat_masuk')
      .select('id, nama_obat, satuan, stok')
      .eq('is_aktif', true)
      .order('nama_obat', { ascending: true })
    if (error) {
      console.error('Error fetch obat:', error.message)
      return
    }
    setObatList(data || [])
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
        ),
        skrining(triase, keluhan_utama, tekanan_darah, suhu, berat_badan, tinggi_badan, catatan)
      `)
      .in('status', ['menunggu_dokter', 'hasil_lab_selesai'])
      .eq('poli_id', poliId)
      .eq('tanggal_periksa', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: true })

    if (error) console.error(error)

    // Urutkan berdasarkan triase (merah > kuning > hijau), bukan nomor antrian —
    // IGD tidak memakai sistem antrian.
    const urutan = (data || []).slice().sort((a, b) => {
      const triaseA = URUTAN_TRIASE[a.skrining?.[0]?.triase] ?? 99
      const triaseB = URUTAN_TRIASE[b.skrining?.[0]?.triase] ?? 99
      if (triaseA !== triaseB) return triaseA - triaseB
      return new Date(a.created_at) - new Date(b.created_at)
    })

    setAntrian(urutan)
  }

  function labelTriase(value) {
    const opsi = {
      merah: { label: 'Merah — Gawat', kelas: 'bg-red-100 text-red-700 border-red-300' },
      kuning: { label: 'Kuning — Darurat', kelas: 'bg-amber-100 text-amber-700 border-amber-300' },
      hijau: { label: 'Hijau — Tidak Darurat', kelas: 'bg-green-100 text-green-700 border-green-300' },
    }
    return opsi[value] || null
  }

  function hitungUmur(tanggalLahir) {
    if (!tanggalLahir) return ''
    const lahir = new Date(tanggalLahir)
    const sekarang = new Date()
    let tahun = sekarang.getFullYear() - lahir.getFullYear()
    let bulan = sekarang.getMonth() - lahir.getMonth()
    let hari = sekarang.getDate() - lahir.getDate()
    if (hari < 0) { bulan--; hari += new Date(sekarang.getFullYear(), sekarang.getMonth(), 0).getDate() }
    if (bulan < 0) { tahun--; bulan += 12 }
    return `${tahun} Thn ${bulan} Bln ${hari} Hr`
  }

  async function pilihPasien(kunjungan) {
    setSelected(kunjungan)
    setError('')
    setSukses(false)
    setForm(FORM_AWAL)
    setResepList([{ nama_obat: '', dosis: '', aturan_pakai: '', catatan: '', obat_id: '' }])
    setTujuan('apotek')
    setPermintaanLabList([{ jenis_pemeriksaan: '', catatan_dokter: '' }])
    setRiwayatHasilLab([])

    // skrining (triase) sudah ikut terbawa di select kunjungan, tapi ambil ulang
    // versi lengkap kalau perlu detail lain di masa depan
    setSkrining(kunjungan.skrining?.[0] || null)

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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!form.diagnosis.trim()) throw new Error('Diagnosis wajib diisi.')
      if (!form.disposisi_igd) throw new Error('Disposisi akhir (Pulang/Rawat Inap/Rujuk) wajib dipilih.')
      if (form.disposisi_igd === 'rujuk' && !form.tujuan_rujukan.trim()) {
        throw new Error('Tujuan rujukan wajib diisi untuk disposisi Rujuk.')
      }

      const resepValid = resepList.filter((r) => r.nama_obat.trim() && r.dosis.trim() && r.aturan_pakai.trim())

      if (tujuan === 'apotek') {
        if (resepValid.length === 0 && form.disposisi_igd !== 'rujuk') {
          throw new Error('Minimal satu resep obat wajib diisi (nama obat, dosis, aturan pakai), kecuali disposisi Rujuk.')
        }
        const tanpaJumlah = resepValid.some((r) => !r.jumlah || parseFloat(r.jumlah) <= 0)
        if (resepValid.length > 0 && tanpaJumlah) throw new Error('Jumlah obat yang diberikan wajib diisi untuk setiap resep.')

        const puyerTanpaJumlah = resepValid.some((r) => r.bentuk_sediaan === 'puyer' && (!r.jumlah_puyer || parseInt(r.jumlah_puyer, 10) <= 0))
        if (puyerTanpaJumlah) throw new Error('Jumlah bungkus puyer wajib diisi untuk resep yang diracik/dipuyer.')
      }

      let permintaanLabValid = []
      if (tujuan === 'lab') {
        permintaanLabValid = permintaanLabList.filter((p) => p.jenis_pemeriksaan.trim())
        if (permintaanLabValid.length === 0) throw new Error('Minimal satu jenis pemeriksaan lab wajib diisi.')
      }

      // 1. Simpan pemeriksaan (+ disposisi_igd)
      const { data: pemeriksaanData, error: pemeriksaanErr } = await supabase
        .from('pemeriksaan')
        .insert({
          kunjungan_id: selected.id,
          dokter_id: profile.id,
          anamnesis: form.anamnesis.trim() || null,
          diagnosis: form.diagnosis.trim(),
          kode_icd: form.kode_icd.trim() || null,
          tindakan: form.tindakan.trim() || null,
          rujukan: form.disposisi_igd === 'rujuk',
          tujuan_rujukan: form.disposisi_igd === 'rujuk' ? form.tujuan_rujukan.trim() || null : null,
          surat_sakit: form.surat_sakit,
          lama_sakit: form.surat_sakit && form.lama_sakit ? parseInt(form.lama_sakit, 10) : null,
          skbs: form.skbs,
          keperluan_skbs: form.skbs ? form.keperluan_skbs.trim() || null : null,
          catatan: form.catatan.trim() || null,
          disposisi_igd: form.disposisi_igd,
        })
        .select()
        .single()

      if (pemeriksaanErr) throw new Error(pemeriksaanErr.message)

      // 2. Simpan resep (kalau ada)
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

        const { error: updateErr } = await supabase
          .from('kunjungan')
          .update({ status: 'menunggu_lab', status_panggil: 'menunggu', waktu_panggil: null })
          .eq('id', selected.id)

        if (updateErr) throw new Error(updateErr.message)
        setSukses('lab')
      } else if (resepValid.length > 0) {
        const { error: updateErr } = await supabase
          .from('kunjungan')
          .update({ status: 'menunggu_obat', status_panggil: 'menunggu', waktu_panggil: null })
          .eq('id', selected.id)

        if (updateErr) throw new Error(updateErr.message)
        setSukses('apotek')
      } else {
        // Disposisi Rujuk tanpa resep -> kunjungan langsung selesai di IGD
        const { error: updateErr } = await supabase
          .from('kunjungan')
          .update({ status: 'selesai', status_panggil: 'selesai' })
          .eq('id', selected.id)

        if (updateErr) throw new Error(updateErr.message)
        setSukses('selesai')
      }

      setSelected(null)
      setSkrining(null)
      setRiwayatHasilLab([])
      fetchAntrian(poliIgd.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const umur = selected ? hitungUmur(selected.pasien.tanggal_lahir) : null
  const triaseSelected = selected?.skrining?.[0]?.triase

  // ─── TAMPILAN ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard Dokter IGD</h1>
          <p className="text-gray-500 text-sm">Diurutkan berdasarkan triase — tanpa sistem antrian</p>
        </div>

        {sukses && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            {sukses === 'lab' && '✅ Permintaan lab dikirim, pasien menunggu hasil.'}
            {sukses === 'apotek' && '✅ Pemeriksaan disimpan, resep diteruskan ke apotek.'}
            {sukses === 'selesai' && '✅ Pemeriksaan disimpan, kunjungan IGD selesai.'}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Daftar pasien menunggu, diurutkan triase */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Pasien Menunggu ({antrian.length})</h2>
              <button
                onClick={() => poliIgd && fetchAntrian(poliIgd.id)}
                className="text-xs text-red-600 hover:underline"
              >
                🔄 Refresh
              </button>
            </div>

            {antrian.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Tidak ada pasien menunggu di IGD.</p>
            ) : (
              <div className="space-y-2">
                {antrian.map((k) => {
                  const triase = k.skrining?.[0]?.triase
                  const info = triase ? labelTriase(triase) : null
                  return (
                    <button
                      key={k.id}
                      onClick={() => pilihPasien(k)}
                      className={`w-full text-left p-3 rounded-xl border transition ${
                        selected?.id === k.id
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-red-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {info && (
                          <span className={`text-[11px] px-2 py-1 rounded-full border font-semibold whitespace-nowrap ${info.kelas}`}>
                            {info.label}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm truncate">{k.pasien.nama_lengkap}</p>
                          <p className="text-xs text-gray-500">
                            {k.pasien.no_rekam_medis} • {hitungUmur(k.pasien.tanggal_lahir)} • {k.pasien.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                          </p>
                          {k.skrining?.[0]?.keluhan_utama && (
                            <p className="text-[11px] text-gray-400 truncate">{k.skrining[0].keluhan_utama}</p>
                          )}
                        </div>
                        {k.status === 'hasil_lab_selesai' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium whitespace-nowrap">
                            Hasil Lab
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Form pemeriksaan */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-gray-400">
                <span className="text-4xl mb-3">👈</span>
                <p className="text-sm">Pilih pasien dari daftar</p>
              </div>
            ) : (
              <>
                <div className="bg-gray-50 rounded-xl p-4 mb-5">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800">{selected.pasien.nama_lengkap}</p>
                    {triaseSelected && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${labelTriase(triaseSelected).kelas}`}>
                        {labelTriase(triaseSelected).label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {selected.pasien.no_rekam_medis} • {umur} • {selected.pasien.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                  </p>
                  {selected.skrining?.[0]?.keluhan_utama && (
                    <p className="text-xs text-gray-600 mt-2">
                      <span className="font-medium">Keluhan:</span> {selected.skrining[0].keluhan_utama}
                    </p>
                  )}
                  {selected.skrining?.[0]?.tekanan_darah && (
                    <p className="text-xs text-gray-500">
                      TD: {selected.skrining[0].tekanan_darah} • Suhu: {selected.skrining[0].suhu ?? '-'}°C
                    </p>
                  )}
                </div>

                {/* Hasil lab (jika pasien balik dari lab) */}
                {riwayatHasilLab.length > 0 && (
                  <div className="mb-5 bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-purple-800 mb-2">Hasil Laboratorium</p>
                    {riwayatHasilLab.map((p) => (
                      <div key={p.id} className="mb-2 last:mb-0">
                        <p className="text-xs font-medium text-gray-700">{p.jenis_pemeriksaan}</p>
                        {(p.hasil_lab || []).map((h) => (
                          <p key={h.id} className="text-xs text-gray-600 ml-2">
                            {h.nama_parameter}: {h.nilai_hasil} {h.satuan} {h.nilai_rujukan ? `(rujukan: ${h.nilai_rujukan})` : ''}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {error && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Anamnesis</label>
                    <textarea
                      name="anamnesis"
                      value={form.anamnesis}
                      onChange={handleFormChange}
                      rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

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
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tindakan</label>
                    <textarea
                      name="tindakan"
                      value={form.tindakan}
                      onChange={handleFormChange}
                      rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Disposisi Akhir — khusus IGD */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Disposisi Akhir <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      {[
                        { v: 'pulang', l: '🏠 Pulang' },
                        { v: 'rawat_inap', l: '🛏️ Rawat Inap' },
                        { v: 'rujuk', l: '🚑 Rujuk RS Lain' },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, disposisi_igd: o.v }))}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                            form.disposisi_igd === o.v
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-white text-gray-600 border-gray-300'
                          }`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.disposisi_igd === 'rujuk' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tujuan Rujukan <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="tujuan_rujukan"
                        value={form.tujuan_rujukan}
                        onChange={handleFormChange}
                        placeholder="Nama RS tujuan"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  {/* Tujuan lanjutan: apotek atau lab (disembunyikan untuk disposisi Rujuk) */}
                  {form.disposisi_igd !== 'rujuk' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tindak Lanjut</label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setTujuan('apotek')}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                            tujuan === 'apotek' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'
                          }`}
                        >
                          💊 Selesai, ke Apotek
                        </button>
                        <button
                          type="button"
                          onClick={() => setTujuan('lab')}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                            tujuan === 'lab' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'
                          }`}
                        >
                          🧪 Perlu Lab
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Resep */}
                  {tujuan === 'apotek' && form.disposisi_igd !== 'rujuk' && (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700">Resep Obat</label>
                      {resepList.map((r, i) => (
                        <div key={i} className="border rounded-lg p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={r.obat_id}
                              onChange={(e) => handlePilihObat(i, e.target.value)}
                              className="border rounded-lg px-2 py-1.5 text-xs col-span-2"
                            >
                              <option value="">-- Pilih obat dari stok (opsional) --</option>
                              {obatList.map((o) => (
                                <option key={o.id} value={o.id}>{o.nama_obat} (stok: {o.stok})</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Nama obat"
                              value={r.nama_obat}
                              onChange={(e) => handleResepChange(i, 'nama_obat', e.target.value)}
                              className="border rounded-lg px-2 py-1.5 text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Dosis"
                              value={r.dosis}
                              onChange={(e) => handleResepChange(i, 'dosis', e.target.value)}
                              className="border rounded-lg px-2 py-1.5 text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Aturan pakai"
                              value={r.aturan_pakai}
                              onChange={(e) => handleResepChange(i, 'aturan_pakai', e.target.value)}
                              className="border rounded-lg px-2 py-1.5 text-xs col-span-2"
                            />
                            <input
                              type="number"
                              placeholder="Jumlah"
                              value={r.jumlah}
                              onChange={(e) => handleResepChange(i, 'jumlah', e.target.value)}
                              className="border rounded-lg px-2 py-1.5 text-xs"
                            />
                            <select
                              value={r.satuan_jumlah}
                              onChange={(e) => handleResepChange(i, 'satuan_jumlah', e.target.value)}
                              className="border rounded-lg px-2 py-1.5 text-xs"
                            >
                              <option value="tablet">Tablet</option>
                              <option value="kapsul">Kapsul</option>
                              <option value="botol">Botol</option>
                              <option value="strip">Strip</option>
                              <option value="pcs">Pcs</option>
                            </select>
                          </div>
                          {resepList.length > 1 && (
                            <button type="button" onClick={() => hapusResep(i)} className="text-[11px] text-red-500 hover:underline">
                              Hapus resep ini
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={tambahResep} className="text-xs text-red-600 hover:underline">
                        + Tambah obat
                      </button>
                    </div>
                  )}

                  {/* Permintaan Lab */}
                  {tujuan === 'lab' && form.disposisi_igd !== 'rujuk' && (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700">Permintaan Pemeriksaan Lab</label>
                      {permintaanLabList.map((p, i) => (
                        <div key={i} className="border rounded-lg p-3 space-y-2">
                          <input
                            type="text"
                            placeholder="Jenis pemeriksaan (mis. Darah Lengkap)"
                            value={p.jenis_pemeriksaan}
                            onChange={(e) => handlePermintaanLabChange(i, 'jenis_pemeriksaan', e.target.value)}
                            className="w-full border rounded-lg px-2 py-1.5 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="Catatan untuk petugas lab (opsional)"
                            value={p.catatan_dokter}
                            onChange={(e) => handlePermintaanLabChange(i, 'catatan_dokter', e.target.value)}
                            className="w-full border rounded-lg px-2 py-1.5 text-xs"
                          />
                          {permintaanLabList.length > 1 && (
                            <button type="button" onClick={() => hapusPermintaanLab(i)} className="text-[11px] text-red-500 hover:underline">
                              Hapus permintaan ini
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={tambahPermintaanLab} className="text-xs text-red-600 hover:underline">
                        + Tambah pemeriksaan
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Tambahan</label>
                    <textarea
                      name="catatan"
                      value={form.catatan}
                      onChange={handleFormChange}
                      rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Menyimpan...' : 'Simpan Pemeriksaan'}
                  </button>
                </form>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}