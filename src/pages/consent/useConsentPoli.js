import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { generateBerkasByConsentId } from '../../lib/berkasConsent'
import { STATUS_CONSENT, STATUS_CONSENT_AKTIF } from '../nakes/loket/utils/consentHelpers'

// Hook logic consent di sisi poli (dipakai bersama DashboardDokter & DashboardPerawat).
//
// Alur:
// 1. Saat petugas memilih pasien (pilihPasien), hook mengambil consent AKTIF
//    (status IN STATUS_CONSENT_AKTIF) milik pasien tsb, kalau ada -> dipakai
//    untuk kunjungan ini.
// 2. Kartu status consent ditampilkan di area Info Pasien:
//    - Tidak ada consent aktif & belum tuntas -> tidak tampil apa-apa (tidak wajib untuk semua kunjungan)
//    - status menunggu_ttd    -> badge "Menunggu TTD Pasien" (loket belum selesai)
//    - status ditandatangani & belum ada TTD petugas -> tombol "TTD Petugas" muncul, buka modal TTD
//    - sudah ada TTD petugas (consent_signature pihak='petugas') -> badge hijau "Consent Selesai"
// 3. Saat petugas TTD di modal (signature-canvas), simpan ke consent_signature
//    (pihak='petugas'). Skema DB TIDAK punya status 'selesai', jadi kolom
//    `status` general_consent TIDAK diubah lagi di sini — tetap 'ditandatangani'.
//    Penanda tuntas murni dari ada/tidaknya baris consent_signature pihak='petugas'.
//
// PENTING: fitur ini tidak memblokir alur pemeriksaan. Kartu hanya informatif;
// petugas tetap bisa lanjut periksa/isi form tanpa menunggu consent tuntas.
export function useConsentPoli(profile) {
  const [consentAktif, setConsentAktif] = useState(null)
  const [signatureAktif, setSignatureAktif] = useState([]) // baris consent_signature milik consentAktif
  const [loadingConsent, setLoadingConsent] = useState(false)
  const [showTtdPetugas, setShowTtdPetugas] = useState(false)
  const [menyimpanTtd, setMenyimpanTtd] = useState(false)
  const [errorConsent, setErrorConsent] = useState('')

  const channelRef = useRef(null)

  // Consent dianggap tuntas kalau sudah ada baris consent_signature pihak='petugas'
  const consentTuntas = signatureAktif.some((s) => s.pihak === 'petugas')

  // ── Dipanggil dari pilihPasien(kunjungan) ───────────────────────────────────
  const muatConsentPasien = useCallback(async (pasienId) => {
    setErrorConsent('')
    setConsentAktif(null)
    setSignatureAktif([])
    setShowTtdPetugas(false)
    if (!pasienId) return

    setLoadingConsent(true)
    try {
      const { data, error } = await supabase
        .from('general_consent')
        .select('*')
        .eq('pasien_id', pasienId)
        .in('status', STATUS_CONSENT_AKTIF)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw new Error(error.message)
      setConsentAktif(data || null)

      if (data) {
        const { data: sigs, error: sigErr } = await supabase
          .from('consent_signature')
          .select('*')
          .eq('general_consent_id', data.id)
        if (sigErr) throw new Error(sigErr.message)
        setSignatureAktif(sigs || [])
      }
    } catch (err) {
      console.error('Gagal memuat consent pasien:', err.message)
      setErrorConsent(err.message)
    } finally {
      setLoadingConsent(false)
    }
  }, [])

  // ── Realtime: pantau perubahan status consent aktif (mis. pasien baru TTD) ─
  useEffect(() => {
    if (!consentAktif?.id) return

    const channel = supabase
      .channel(`consent-poli-${consentAktif.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'general_consent',
          filter: `id=eq.${consentAktif.id}`,
        },
        (payload) => setConsentAktif(payload.new)
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'consent_signature',
          filter: `general_consent_id=eq.${consentAktif.id}`,
        },
        (payload) => setSignatureAktif((prev) => [...prev, payload.new])
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [consentAktif?.id])

  const bukaTtdPetugas = useCallback(() => {
    setErrorConsent('')
    setShowTtdPetugas(true)
  }, [])

  const tutupTtdPetugas = useCallback(() => {
    setShowTtdPetugas(false)
  }, [])

  // ── Simpan TTD petugas: insert consent_signature (pihak='petugas') ─────────
  // Status general_consent TIDAK diubah (tidak ada status 'selesai' di DB).
  const simpanTtdPetugas = useCallback(
    async (dataUrlTtd, namaPetugas) => {
      if (!consentAktif?.id) return
      setMenyimpanTtd(true)
      setErrorConsent('')
      try {
        const { data: sigBaru, error: sigErr } = await supabase
          .from('consent_signature')
          .insert({
            general_consent_id: consentAktif.id,
            pihak: 'petugas',
            nama: namaPetugas || profile?.nama_lengkap || '',
            tanda_tangan_url: dataUrlTtd,
            ditandatangani_pada: new Date().toISOString(),
            petugas_id: profile?.id || null,
          })
          .select()
          .single()
        if (sigErr) throw new Error(sigErr.message)

        setSignatureAktif((prev) => [...prev, sigBaru])

        // Buat berkas FINAL (PDF + Word, kedua TTD lengkap) di server, menggantikan
        // draft. Tanpa await; kegagalan hanya dicatat dan tidak mengganggu alur poli.
        generateBerkasByConsentId(consentAktif.id).catch((e) =>
          console.error('Gagal membuat berkas final:', e)
        )

        setShowTtdPetugas(false)
      } catch (err) {
        console.error('Gagal menyimpan TTD petugas:', err.message)
        setErrorConsent(err.message)
      } finally {
        setMenyimpanTtd(false)
      }
    },
    [consentAktif?.id, profile]
  )

  return {
    consentAktif,
    consentTuntas,
    loadingConsent,
    showTtdPetugas,
    menyimpanTtd,
    errorConsent,
    muatConsentPasien,
    bukaTtdPetugas,
    tutupTtdPetugas,
    simpanTtdPetugas,
  }
}