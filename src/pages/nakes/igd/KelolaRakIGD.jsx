import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import ModalKelolaRak from '../loket/ModalKelolaRak'
import {
  validasiNik,
  FORM_PASIEN_RAK_AWAL,
} from '../loket/utils/pasienHelpers'

/* ────────────────────────────────────────────────────────────────
   KELOLA RAK REKAM MEDIS — KHUSUS PERAWAT IGD
   Halaman mandiri (bukan modal di dalam DashboardLoket), diakses lewat
   menu/route sendiri oleh perawat IGD. Reuse komponen ModalKelolaRak
   apa adanya (styling & fitur rak/pasien tetap identik dengan loket),
   tapi:
   - Ditampilkan sebagai halaman penuh, bukan overlay modal (show selalu true,
     tidak ada tombol ✕ Tutup karena tidak ada "dashboard belakang" untuk
     kembali — perawat IGD tetap di halaman ini, gunakan menu untuk pindah).
   - Semua logic backend (fetch rak, CRUD pasien, sinkron nomor urut,
     pisah RM, dsb) di-porting persis dari DashboardLoket.jsx supaya
     perilakunya identik & konsisten dengan yang loket pakai.
   - Fitur wizard "PERIKSA" (bikin kunjungan poli umum) SENGAJA tidak
     diaktifkan (polis & petugasPoliList dikirim sebagai array kosong,
     onPeriksaPasienRak tidak diberikan) karena perawat IGD sudah punya
     alur pendaftaran + triase sendiri di DashboardPerawatIGD.jsx.
   ──────────────────────────────────────────────────────────────── */

export default function KelolaRakIGD() {
  const [profile, setProfile] = useState(null)

  // Rak Rekam Medis
  const [rakList, setRakList] = useState([])
  const [rakForm, setRakForm] = useState({ id: null, kode_rak: '', nama_rak: '' })
  const [rakLoading, setRakLoading] = useState(false)
  const [rakError, setRakError] = useState('')

  // Tambah/edit pasien langsung dari dalam rak
  const [pasienRakBaru, setPasienRakBaru] = useState(null)
  const [editPasienRakId, setEditPasienRakId] = useState(null)
  const [formPasienRak, setFormPasienRak] = useState(FORM_PASIEN_RAK_AWAL)
  const [pasienRakLoading, setPasienRakLoading] = useState(false)
  const [pasienRakError, setPasienRakError] = useState('')
  const [anggotaKkRak, setAnggotaKkRak] = useState([])
  const [cekKkRakLoading, setCekKkRakLoading] = useState(false)
  const [popupValidasiPasienRak, setPopupValidasiPasienRak] = useState(null)

  useEffect(() => {
    fetchProfile()
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
      fetchRakList(data.instansi_id)
    }
  }

  // ─── RAK: fetch / simpan / edit / hapus ─────────────────────────
  async function fetchRakList(instansiId) {
    const { data, error } = await supabase
      .from('rak_rm')
      .select('id, kode_rak, nama_rak, nomor_urut_terakhir, pasien(count)')
      .eq('instansi_id', instansiId)
      .order('kode_rak', { ascending: true })

    if (error) {
      console.error('Error fetch rak_rm:', error.message)
      return
    }
    const dataDenganJumlah = (data || []).map((r) => ({
      ...r,
      jumlah_pasien: Array.isArray(r.pasien) ? (r.pasien[0]?.count ?? 0) : 0,
    }))
    setRakList(dataDenganJumlah)
  }

  async function simpanRak(e) {
    e.preventDefault()
    if (!rakForm.kode_rak.trim()) {
      setRakError('Kode rak wajib diisi.')
      return
    }
    setRakLoading(true)
    setRakError('')
    try {
      if (rakForm.id) {
        const { error } = await supabase
          .from('rak_rm')
          .update({
            kode_rak: rakForm.kode_rak.trim(),
            nama_rak: rakForm.nama_rak.trim() || null,
          })
          .eq('id', rakForm.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('rak_rm')
          .insert({
            instansi_id: profile.instansi_id,
            kode_rak: rakForm.kode_rak.trim(),
            nama_rak: rakForm.nama_rak.trim() || null,
          })
        if (error) throw new Error(error.message)
      }
      setRakForm({ id: null, kode_rak: '', nama_rak: '' })
      fetchRakList(profile.instansi_id)
    } catch (err) {
      setRakError(err.message)
    } finally {
      setRakLoading(false)
    }
  }

  function editRak(rak) {
    setRakForm({ id: rak.id, kode_rak: rak.kode_rak, nama_rak: rak.nama_rak || '' })
    setRakError('')
  }

  async function hapusRak(rakId) {
    if (!window.confirm('Hapus rak ini? Pasien yang sudah memakai rak ini tidak akan terhapus, hanya kode raknya.')) return
    const { error } = await supabase.from('rak_rm').delete().eq('id', rakId)
    if (error) {
      setRakError(error.message)
      return
    }
    fetchRakList(profile.instansi_id)
  }

  // ─── NOMOR URUT / GENERATE NO. RM ───────────────────────────────
  function angkaUrutDariNoRm(noRm) {
    if (!noRm) return 0
    const digitSaja = noRm.replace(/\D/g, '')
    if (!digitSaja) return 0
    return parseInt(digitSaja, 10)
  }

  async function sinkronkanNomorUrutRak(rakId) {
    const PAGE_SIZE = 1000
    let semua = []
    let dari = 0
    while (true) {
      const { data, error } = await supabase
        .from('pasien')
        .select('no_rekam_medis')
        .eq('rak_id', rakId)
        .range(dari, dari + PAGE_SIZE - 1)
      if (error) {
        console.error('Gagal sinkron nomor urut rak:', error.message)
        return null
      }
      semua = semua.concat(data || [])
      if (!data || data.length < PAGE_SIZE) break
      dari += PAGE_SIZE
    }

    const angkaTertinggi = semua.reduce(
      (max, p) => Math.max(max, angkaUrutDariNoRm(p.no_rekam_medis)),
      0
    )

    const { data: updated, error: updateErr } = await supabase
      .from('rak_rm')
      .update({ nomor_urut_terakhir: angkaTertinggi })
      .eq('id', rakId)
      .select('nomor_urut_terakhir')
      .maybeSingle()

    if (updateErr) {
      console.error('Gagal update nomor_urut_terakhir:', updateErr.message)
      return null
    }

    setRakList((prev) =>
      prev.map((r) => (r.id === rakId ? { ...r, nomor_urut_terakhir: updated.nomor_urut_terakhir } : r))
    )
    return updated.nomor_urut_terakhir
  }

  async function sinkronkanSemuaRak() {
    for (const rak of rakList) {
      await sinkronkanNomorUrutRak(rak.id)
    }
  }

  async function generateNoRmDariRak(rakId) {
    const rak = rakList.find((r) => r.id === rakId)
    if (!rak) return ''

    const { data: rakTerbaru, error: rakErr } = await supabase
      .from('rak_rm')
      .select('nomor_urut_terakhir')
      .eq('id', rakId)
      .maybeSingle()

    if (rakErr || !rakTerbaru) {
      console.error('Gagal membaca nomor_urut_terakhir terbaru:', rakErr?.message)
      return ''
    }

    const nilaiSaatIni = rakTerbaru.nomor_urut_terakhir || 0

    const { data, error } = await supabase
      .from('rak_rm')
      .update({ nomor_urut_terakhir: nilaiSaatIni + 1 })
      .eq('id', rakId)
      .eq('nomor_urut_terakhir', nilaiSaatIni)
      .select('nomor_urut_terakhir')
      .maybeSingle()

    let nomorBaru
    if (error || !data) {
      const { data: ulang } = await supabase
        .from('rak_rm')
        .select('nomor_urut_terakhir')
        .eq('id', rakId)
        .maybeSingle()
      nomorBaru = (ulang?.nomor_urut_terakhir || 0) + 1
      await supabase.from('rak_rm').update({ nomor_urut_terakhir: nomorBaru }).eq('id', rakId)
    } else {
      nomorBaru = data.nomor_urut_terakhir
    }

    setRakList((prev) => prev.map((r) => (r.id === rakId ? { ...r, nomor_urut_terakhir: nomorBaru } : r)))

    const urut = String(nomorBaru).padStart(4, '0')
    return `${rak.kode_rak}-${urut}`
  }

  // ─── TAMBAH / EDIT PASIEN DI DALAM RAK ──────────────────────────
  async function bukaTambahPasienRak(rak, pasienEdit) {
    setPasienRakBaru(rak)
    if (pasienEdit) {
      setEditPasienRakId(pasienEdit.id)
      setFormPasienRak({
        no_kk: pasienEdit.no_kk || '',
        urutan_kk: pasienEdit.urutan_kk != null ? String(pasienEdit.urutan_kk) : '',
        status_keluarga: pasienEdit.status_keluarga || '',
        status_keluarga_lainnya: pasienEdit.status_keluarga_lainnya || '',
        nama_lengkap: pasienEdit.nama_lengkap || '',
        nama_kepala_keluarga: pasienEdit.nama_kepala_keluarga || '',
        no_rekam_medis: pasienEdit.no_rekam_medis || '',
        mode_rm: 'manual',
        no_nik: pasienEdit.no_nik || '',
        no_bpjs: pasienEdit.no_bpjs || '',
        alamat: pasienEdit.alamat || '',
        tempat_lahir: pasienEdit.tempat_lahir || '',
        tanggal_lahir: pasienEdit.tanggal_lahir || '',
        pekerjaan: pasienEdit.pekerjaan || '',
        jenis_kelamin: pasienEdit.jenis_kelamin || '',
      })
      setAnggotaKkRak([])
      setPasienRakError('')
      setPopupValidasiPasienRak(null)
      return
    }
    setEditPasienRakId(null)
    setFormPasienRak({ ...FORM_PASIEN_RAK_AWAL, no_rekam_medis: '...' })
    setAnggotaKkRak([])
    setPasienRakError('')
    setPopupValidasiPasienRak(null)
    await sinkronkanNomorUrutRak(rak.id)
    const noRmBaru = await generateNoRmDariRak(rak.id)
    setFormPasienRak((prev) => ({ ...prev, no_rekam_medis: noRmBaru || '' }))
  }

  function bukaEditPasienRak(rak, pasien) {
    bukaTambahPasienRak(rak, pasien)
  }

  function bukaTambahAnggotaGrupRak(rak, pasienGrup) {
    setPasienRakBaru(rak)
    setEditPasienRakId(null)
    setFormPasienRak({
      ...FORM_PASIEN_RAK_AWAL,
      no_rekam_medis: pasienGrup?.no_rekam_medis || '',
      mode_rm: 'manual',
      rm_terkunci: true,
    })
    setAnggotaKkRak([])
    setPasienRakError('')
    setPopupValidasiPasienRak(null)
  }

  function tutupTambahPasienRak() {
    setPasienRakBaru(null)
    setEditPasienRakId(null)
    setFormPasienRak(FORM_PASIEN_RAK_AWAL)
    setAnggotaKkRak([])
    setPopupValidasiPasienRak(null)
    setPasienRakError('')
  }

  async function hapusPasienRak(pasienId) {
    if (!window.confirm('Hapus data pasien ini? Tindakan ini tidak bisa dibatalkan.')) return

    const { count, error: errorCek } = await supabase
      .from('kunjungan')
      .select('id', { count: 'exact', head: true })
      .eq('pasien_id', pasienId)

    if (errorCek) {
      window.alert('Gagal mengecek riwayat kunjungan: ' + errorCek.message)
      return null
    }

    if (count && count > 0) {
      const lanjut = window.confirm(
        `Pasien ini punya ${count} riwayat kunjungan. Riwayat kunjungan tersebut akan ikut ` +
          `terhapus permanen bersama data pasiennya. Lanjutkan?`
      )
      if (!lanjut) return null

      const { error: errorHapusKunjungan } = await supabase
        .from('kunjungan')
        .delete()
        .eq('pasien_id', pasienId)
      if (errorHapusKunjungan) {
        window.alert('Gagal menghapus riwayat kunjungan: ' + errorHapusKunjungan.message)
        return null
      }
    }

    const { error } = await supabase.from('pasien').delete().eq('id', pasienId)
    if (error) {
      window.alert('Gagal menghapus: ' + error.message)
      return null
    }
    return true
  }

  async function pisahkanKeRmBaru(pasien, rakTujuanId) {
    if (!rakTujuanId) {
      window.alert('Pilih rak tujuan dulu.')
      return null
    }
    await sinkronkanNomorUrutRak(rakTujuanId)
    const noRmBaru = await generateNoRmDariRak(rakTujuanId)
    if (!noRmBaru) {
      window.alert('Gagal membuat No. RM baru. Coba lagi.')
      return null
    }
    const { error } = await supabase
      .from('pasien')
      .update({
        no_rekam_medis: noRmBaru,
        rak_id: rakTujuanId,
        urutan_kk: null,
        status_keluarga: null,
        status_keluarga_lainnya: null,
      })
      .eq('id', pasien.id)
    if (error) {
      window.alert('Gagal memisahkan ke RM baru: ' + error.message)
      return null
    }
    return noRmBaru
  }

  async function cekNoKkRak(noKk) {
    if (!noKk.trim() || !profile?.instansi_id) {
      setAnggotaKkRak([])
      return
    }
    setCekKkRakLoading(true)
    const { data, error } = await supabase
      .from('pasien')
      .select('id, nama_lengkap, nama_kepala_keluarga, no_rekam_medis, urutan_kk, status_keluarga, status_keluarga_lainnya, no_nik, no_bpjs, alamat, tempat_lahir, tanggal_lahir, pekerjaan, jenis_kelamin, rak_id')
      .eq('instansi_id', profile.instansi_id)
      .eq('no_kk', noKk.trim())
      .order('urutan_kk', { ascending: true })
    setCekKkRakLoading(false)

    if (error) {
      console.error('Error cek No. KK (rak):', error.message)
      setAnggotaKkRak([])
      return
    }

    setAnggotaKkRak(data || [])

    if (data && data.length > 0 && data[0].no_rekam_medis) {
      setFormPasienRak((prev) => ({
        ...prev,
        no_rekam_medis: data[0].no_rekam_medis,
        mode_rm: 'manual',
      }))
    }
  }

  function handleChangeFormPasienRak(e) {
    const { name, value } = e.target
    if (name === 'mode_rm' && value === 'otomatis') {
      setFormPasienRak((prev) => ({ ...prev, mode_rm: 'otomatis', no_rekam_medis: '...' }))
      if (pasienRakBaru?.id) {
        sinkronkanNomorUrutRak(pasienRakBaru.id).then(() => {
          generateNoRmDariRak(pasienRakBaru.id).then((noRmBaru) => {
            setFormPasienRak((prev) => ({ ...prev, no_rekam_medis: noRmBaru || '' }))
          })
        })
      }
      return
    }
    setFormPasienRak((prev) => {
      const updated = { ...prev, [name]: value }
      if (name === 'no_kk' || name === 'no_nik') {
        updated[name] = value.replace(/\D/g, '')
      }
      return updated
    })
  }

  function fokusKe(ref) {
    ref.current?.focus()
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function simpanPasienRak(e) {
    e.preventDefault()
    setPasienRakError('')

    if (!formPasienRak.nama_lengkap.trim()) {
      setPopupValidasiPasienRak({ pesan: 'Nama pasien wajib diisi.', fokusKe: null })
      return
    }
    if (!formPasienRak.no_rekam_medis.trim()) {
      setPopupValidasiPasienRak({ pesan: 'Nomor rekam medis wajib diisi.', fokusKe: null })
      return
    }
    if (!formPasienRak.no_nik.trim()) {
      setPopupValidasiPasienRak({ pesan: 'Nomor KTP (NIK) wajib diisi.', fokusKe: null })
      return
    }
    if (validasiNik(formPasienRak.no_nik).status === 'invalid') {
      setPopupValidasiPasienRak({ pesan: validasiNik(formPasienRak.no_nik).pesan, fokusKe: null })
      return
    }
    if (!formPasienRak.tanggal_lahir) {
      setPopupValidasiPasienRak({ pesan: 'Tanggal lahir wajib diisi.', fokusKe: null })
      return
    }
    if (!formPasienRak.jenis_kelamin) {
      setPopupValidasiPasienRak({ pesan: 'Jenis kelamin wajib dipilih.', fokusKe: null })
      return
    }

    setPasienRakLoading(true)
    try {
      if (editPasienRakId) {
        const payloadEdit = {
          no_rekam_medis: formPasienRak.no_rekam_medis.trim(),
          nama_lengkap: formPasienRak.nama_lengkap.trim(),
          nama_kepala_keluarga: formPasienRak.nama_kepala_keluarga.trim() || null,
          alamat: formPasienRak.alamat.trim() || null,
          no_nik: formPasienRak.no_nik.trim(),
          no_bpjs: formPasienRak.no_bpjs.trim() || null,
          no_kk: formPasienRak.no_kk.trim() || null,
          urutan_kk: formPasienRak.urutan_kk ? Number(formPasienRak.urutan_kk) : null,
          status_keluarga: formPasienRak.status_keluarga || null,
          status_keluarga_lainnya:
            formPasienRak.status_keluarga === 'lainnya'
              ? formPasienRak.status_keluarga_lainnya.trim() || null
              : null,
          tempat_lahir: formPasienRak.tempat_lahir.trim() || null,
          tanggal_lahir: formPasienRak.tanggal_lahir,
          jenis_kelamin: formPasienRak.jenis_kelamin || null,
          pekerjaan: formPasienRak.pekerjaan.trim() || null,
        }
        const { error: updateErr } = await supabase
          .from('pasien')
          .update(payloadEdit)
          .eq('id', editPasienRakId)
        if (updateErr) throw new Error(updateErr.message)

        tutupTambahPasienRak()
        return
      }

      const { data: pasienSamaRm, error: cekErr } = await supabase
        .from('pasien')
        .select('id, nama_lengkap, no_kk')
        .eq('instansi_id', profile.instansi_id)
        .eq('no_rekam_medis', formPasienRak.no_rekam_medis.trim())

      if (cekErr) throw new Error(cekErr.message)

      const noKkForm = formPasienRak.no_kk.trim()
      const nikForm = formPasienRak.no_nik.trim()
      let pasienExisting = null

      if (pasienSamaRm && pasienSamaRm.length > 0) {
        const kkCocok = noKkForm && pasienSamaRm.every((p) => (p.no_kk || '').trim() === noKkForm)

        if (!kkCocok) {
          throw new Error(
            `Nomor rekam medis ${formPasienRak.no_rekam_medis.trim()} sudah dipakai oleh pasien lain ` +
              `(${pasienSamaRm.map((p) => p.nama_lengkap).join(', ')}) dengan No. KK yang berbeda. ` +
              `No. RM hanya boleh sama untuk anggota dalam satu Kartu Keluarga yang sama.`
          )
        }

        const { data: pasienNikSama, error: cekNikErr } = await supabase
          .from('pasien')
          .select('id')
          .eq('instansi_id', profile.instansi_id)
          .eq('no_rekam_medis', formPasienRak.no_rekam_medis.trim())
          .eq('no_nik', nikForm)
          .maybeSingle()
        if (cekNikErr) throw new Error(cekNikErr.message)
        pasienExisting = pasienNikSama
      }

      const payload = {
        instansi_id: profile.instansi_id,
        no_rekam_medis: formPasienRak.no_rekam_medis.trim(),
        nama_lengkap: formPasienRak.nama_lengkap.trim(),
        nama_kepala_keluarga: formPasienRak.nama_kepala_keluarga.trim() || null,
        alamat: formPasienRak.alamat.trim() || null,
        no_nik: formPasienRak.no_nik.trim(),
        no_bpjs: formPasienRak.no_bpjs.trim() || null,
        no_kk: formPasienRak.no_kk.trim() || null,
        urutan_kk: formPasienRak.urutan_kk ? Number(formPasienRak.urutan_kk) : null,
        status_keluarga: formPasienRak.status_keluarga || null,
        status_keluarga_lainnya:
          formPasienRak.status_keluarga === 'lainnya'
            ? formPasienRak.status_keluarga_lainnya.trim() || null
            : null,
        tempat_lahir: formPasienRak.tempat_lahir.trim() || null,
        tanggal_lahir: formPasienRak.tanggal_lahir,
        jenis_kelamin: formPasienRak.jenis_kelamin || null,
        pekerjaan: formPasienRak.pekerjaan.trim() || null,
        rak_id: pasienRakBaru.id,
        kategori_pasien: 'umum',
        wilayah: 'dalam',
      }

      if (pasienExisting) {
        const { error: updateErr } = await supabase
          .from('pasien')
          .update(payload)
          .eq('id', pasienExisting.id)
        if (updateErr) throw new Error(updateErr.message)
      } else {
        const { error: insertErr } = await supabase.from('pasien').insert(payload)
        if (insertErr) throw new Error(insertErr.message)
      }

      tutupTambahPasienRak()
    } catch (err) {
      setPasienRakError(err.message)
    } finally {
      setPasienRakLoading(false)
    }
  }

  // ─── TAMPILAN ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-800">🗄️ Rak Rekam Medis — IGD</h1>
          <p className="text-gray-500 text-sm">
            Kelola rak, cari pasien lama, dan tambah/edit pasien langsung dari sini.
          </p>
        </div>

        {/* Sembunyikan tombol "🩺 PERIKSA" dari ModalKelolaRak — fitur ini
            membuka wizard pendaftaran poli umum yang tidak relevan untuk
            perawat IGD (mereka punya alur pendaftaran+triase sendiri di
            DashboardPerawatIGD.jsx). Disembunyikan lewat CSS supaya tidak
            perlu mengubah ModalKelolaRak.jsx yang juga dipakai loket. */}
        <style>{`
          .rak-igd-wrapper button[title="Periksa pasien ini (buka form pendaftaran)"] {
            display: none !important;
          }
        `}</style>

        {/* ModalKelolaRak dipakai sebagai panel penuh (bukan overlay tertutup),
            karena halaman ini memang khusus untuk kelola rak — tidak ada
            "dashboard belakang" untuk kembali via tombol ✕. onClose tetap
            diberikan fungsi kosong supaya tombol ✕ tidak menyebabkan error,
            meski di halaman ini praktis tidak akan pernah menyembunyikan apa pun
            karena show selalu true. */}
        <div className="rak-igd-wrapper">
        <ModalKelolaRak
          show={true}
          onClose={() => {}}
          rakList={rakList}
          rakForm={rakForm}
          setRakForm={setRakForm}
          rakLoading={rakLoading}
          rakError={rakError}
          onSubmit={simpanRak}
          onEdit={editRak}
          onDelete={hapusRak}
          onPisahkanRmBaru={pisahkanKeRmBaru}
          onSinkronSemua={sinkronkanSemuaRak}
          instansiId={profile?.instansi_id}
          pasienRakBaru={pasienRakBaru}
          editPasienRakId={editPasienRakId}
          onBukaTambahPasien={bukaTambahPasienRak}
          onEditPasienRak={bukaEditPasienRak}
          onTambahAnggotaGrup={bukaTambahAnggotaGrupRak}
          onHapusPasienRak={hapusPasienRak}
          onTutupTambahPasien={tutupTambahPasienRak}
          formPasienRak={formPasienRak}
          onChangeFormPasienRak={handleChangeFormPasienRak}
          onSubmitPasienRak={simpanPasienRak}
          pasienRakLoading={pasienRakLoading}
          pasienRakError={pasienRakError}
          anggotaKkRak={anggotaKkRak}
          onCekNoKkRak={cekNoKkRak}
          cekKkRakLoading={cekKkRakLoading}
          popupValidasi={popupValidasiPasienRak}
          onTutupPopupValidasi={() => setPopupValidasiPasienRak(null)}
          // Fitur PERIKSA sengaja dimatikan untuk perawat IGD:
          // - polis & petugasPoliList kosong -> tombol "🩺 PERIKSA" tetap
          //   muncul di UI ModalKelolaRak, tapi wizardnya tidak akan
          //   menemukan poli/petugas apa pun untuk dipilih.
          // - onPeriksaPasienRak tidak diberikan (undefined) -> tombol
          //   "Lanjutkan Pendaftaran" di wizard tidak melakukan apa-apa.
          polis={[]}
          petugasPoliList={[]}
          onPeriksaPasienRak={undefined}
          tarifLoket={[]}
        />
        </div>
      </div>
    </div>
  )
}