import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import {
  STATUS_CONSENT,
  STATUS_CONSENT_AKTIF,
  checklistPersetujuanKosong,
  validasiChecklistPersetujuan,
} from '../nakes/loket/utils/consentHelpers'

// Hook logic consent di sisi loket.
//
// Alur:
// 1. Setelah kunjungan berhasil dibuat, loket memanggil `mulaiConsent(pasienId, kunjunganId)`.
// 2. Hook cek apakah pasien ini sudah punya consent AKTIF (status IN
//    STATUS_CONSENT_AKTIF, yaitu menunggu_ttd / ditandatangani) untuk
//    kunjungan hari ini. Kalau ada -> langsung buka modal QR pakai consent itu
//    (tidak generate baru / tidak duplikat).
// 3. Kalau belum ada -> buka modal FORM consent dulu. Petugas mengisi field
//    induk "Persetujuan Pasien" (butir 4, Ya/Tidak, diisi manual terpisah),
//    lalu menjelaskan tiap butir a-f (Permenkes: ketentuan pembayaran, hak &
//    kewajiban pasien, tata tertib, kebutuhan penterjemah, kebutuhan
//    rohaniawan, pelepasan informasi) dan memilihkan jawaban pasien untuk
//    tiap butir.
// 4. Setelah form disimpan -> insert general_consent (checklist_persetujuan +
//    daftar_tindakan sebagai jsonb, nama_petugas_penjelasan sebagai snapshot
//    nama petugas yang login) + 1 baris consent_signature (pihak='pasien',
//    kosong dulu) -> token digenerate otomatis oleh DB -> tampilkan modal QR.
//    Pasien tinggal memeriksa ulang ringkasannya, mengisi nama/hubungan
//    (general_consent.nama_pemberi_persetujuan &
//    hubungan_pemberi_persetujuan, poin 5a pedoman), dan menandatangani di
//    halaman publik.
// 5. Modal QR mendengarkan realtime perubahan status general_consent. Begitu
//    status berubah jadi 'ditandatangani' (pasien sudah TTD di halaman
//    publik), modal otomatis menandai selesai tahap pasien & bisa ditutup.
//
// CATATAN: skema DB tidak punya status 'selesai'. Consent baru benar-benar
// tuntas setelah petugas TTD di poli (baris consent_signature pihak='petugas'),
// itu ditangani di useConsentPoli.js, bukan di sini.
//
// PENTING: seluruh alur ini TIDAK memblokir alur pendaftaran loket. Loket tetap
// bisa cetak tiket dan lanjut ke pasien berikutnya kapan saja; modal consent
// berjalan independen di atasnya.
export function useConsentLoket() {
  const [showFormConsent, setShowFormConsent] = useState(false)
  const [showQrConsent, setShowQrConsent] = useState(false)
  const [consentAktif, setConsentAktif] = useState(null) // baris general_consent yang sedang diproses
  const [pasienAktif, setPasienAktif] = useState(null) // { id, nama_lengkap } untuk ditampilkan di modal
  const [loadingConsent, setLoadingConsent] = useState(false)
  const [errorConsent, setErrorConsent] = useState('')

  const channelRef = useRef(null)
  const formContextRef = useRef(null)

  // ── Langkah 1: dipanggil dari handleSubmit setelah kunjungan dibuat ────────
  const mulaiConsent = useCallback(async (pasien, kunjunganId, instansiId) => {
    setErrorConsent('')
    setPasienAktif(pasien)
    setLoadingConsent(true)
    try {
      // Cek consent aktif (belum tuntas tahap pasien/petugas) milik pasien
      // ini yang paling baru. "Aktif" = status masih di STATUS_CONSENT_AKTIF.
      const { data: existing, error: cekErr } = await supabase
        .from('general_consent')
        .select('*')
        .eq('pasien_id', pasien.id)
        .in('status', STATUS_CONSENT_AKTIF)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cekErr) throw new Error(cekErr.message)

      if (existing) {
        // Sudah ada consent aktif (mis. dari kunjungan sebelumnya yang belum
        // tuntas) -> pakai itu, langsung tampilkan QR-nya kalau masih
        // menunggu TTD pasien.
        setConsentAktif(existing)
        if (existing.status === STATUS_CONSENT.MENUNGGU_TTD) {
          setShowQrConsent(true)
        }
        // Kalau status sudah 'ditandatangani', tidak perlu modal apa pun di
        // loket -> TTD petugas akan ditangani nanti di poli.
      } else {
        // Belum ada -> tampilkan form consent baru
        setShowFormConsent(true)
      }
    } catch (err) {
      console.error('Gagal memeriksa consent:', err.message)
      setErrorConsent(err.message)
    } finally {
      setLoadingConsent(false)
    }

    // simpan kunjunganId & instansiId untuk dipakai saat simpanFormConsent
    formContextRef.current = { pasien, kunjunganId, instansiId }
  }, [])

  // ── Langkah 2: simpan hasil isi form consent -> insert baris baru ──────────
  // `checklist` = objek sesuai struktur butir 4 + a-f Permenkes (lihat
  // checklistPersetujuanKosong di consentHelpers).
  // `petugasId` = profiles.id petugas loket yang sedang login (untuk
  //   dibuat_oleh, kolom audit "siapa yang membuat baris ini").
  // `namaPetugas` = profiles.nama_lengkap petugas yang sama, dipakai untuk
  //   mengisi general_consent.nama_petugas_penjelasan (poin 5b pedoman:
  //   "Petugas yang Memberi Penjelasan"). Snapshot nama saat itu, bukan FK,
  //   supaya tercetak di PDF/Word tetap sama walau nama petugas berubah
  //   di masa depan.
  // `daftarTindakan` = array tindakan yang wajib consent untuk instansi ini
  //   (diambil dari tabel general_consent_tindakan, opsional untuk saat ini).
  const simpanFormConsent = useCallback(async (checklist, petugasId, namaPetugas, daftarTindakan = []) => {
    const ctx = formContextRef.current
    if (!ctx) return

    const pesanValidasi = validasiChecklistPersetujuan(checklist)
    if (pesanValidasi) {
      setErrorConsent(pesanValidasi)
      return
    }

    setLoadingConsent(true)
    setErrorConsent('')
    try {
      const { data: consentBaru, error: insertErr } = await supabase
        .from('general_consent')
        .insert({
          instansi_id: ctx.instansiId,
          pasien_id: ctx.pasien.id,
          kunjungan_id: ctx.kunjunganId,
          checklist_persetujuan: checklist,
          daftar_tindakan: daftarTindakan,
          status: STATUS_CONSENT.MENUNGGU_TTD,
          dibuat_oleh: petugasId,
          nama_petugas_penjelasan: namaPetugas || null,
        })
        .select()
        .single()

      if (insertErr) throw new Error(insertErr.message)

      // Baris consent_signature pihak pasien dibuat sekarang (kosong,
      // menunggu diisi di halaman publik). Baris pihak petugas BELUM dibuat
      // di sini — baru dibuat nanti di poli saat benar-benar dibutuhkan.
      const { error: sigErr } = await supabase.from('consent_signature').insert({
        general_consent_id: consentBaru.id,
        pihak: 'pasien',
        nama: ctx.pasien.nama_lengkap || '',
      })
      if (sigErr) throw new Error(sigErr.message)

      setConsentAktif(consentBaru)
      setShowFormConsent(false)
      setShowQrConsent(true)
    } catch (err) {
      console.error('Gagal menyimpan consent:', err.message)
      setErrorConsent(err.message)
    } finally {
      setLoadingConsent(false)
    }
  }, [])

  // ── Langkah 3: realtime listener status consent aktif ──────────────────────
  useEffect(() => {
    if (!consentAktif?.id || !showQrConsent) return

    const channel = supabase
      .channel(`consent-loket-${consentAktif.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'general_consent',
          filter: `id=eq.${consentAktif.id}`,
        },
        (payload) => {
          setConsentAktif(payload.new)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [consentAktif?.id, showQrConsent])

  // ── Tutup modal QR (dipanggil manual oleh petugas loket, atau otomatis) ────
  const tutupQrConsent = useCallback(() => {
    setShowQrConsent(false)
    setConsentAktif(null)
    setPasienAktif(null)
    formContextRef.current = null
  }, [])

  const batalkanFormConsent = useCallback(() => {
    setShowFormConsent(false)
    setPasienAktif(null)
    formContextRef.current = null
  }, [])

  return {
    // state
    showFormConsent,
    showQrConsent,
    consentAktif,
    pasienAktif,
    loadingConsent,
    errorConsent,
    checklistDefault: checklistPersetujuanKosong(),
    // actions
    mulaiConsent,
    simpanFormConsent,
    tutupQrConsent,
    batalkanFormConsent,
  }
}