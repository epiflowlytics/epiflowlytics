import { supabase } from './supabaseClient'

// Helper berkas General Consent (PDF + Word).
// Letakkan file ini di folder yang sama dengan supabaseClient.js (lib/).
// Backend: Edge Function `generate-general-consent-berkas`,
// bucket private `berkas-general-consent`, RPC `daftar_berkas_general_consent`.

const FN = 'generate-general-consent-berkas'

// DRAFT: dipanggil halaman TTD pasien (publik, tanpa login) setelah RPC
// tandatangani_consent_by_token sukses. Tidak melempar error supaya
// alur pasien tidak terganggu.
export async function generateBerkasByToken(token) {
  try {
    const { data, error } = await supabase.functions.invoke(FN, { body: { token } })
    if (error) throw error
    return { ok: true, data }
  } catch (e) {
    console.error('generateBerkasByToken gagal:', e)
    return { ok: false, error: e }
  }
}

// FINAL / cetak ulang: dipanggil nakes (login). Melempar error agar bisa
// ditampilkan di UI.
export async function generateBerkasByConsentId(generalConsentId) {
  const { data, error } = await supabase.functions.invoke(FN, {
    body: { general_consent_id: generalConsentId },
  })
  if (error) throw error
  return data
}

// Daftar arsip; terfilter otomatis per poli oleh RPC + RLS.
export async function daftarBerkasConsent({ cari = null, limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('daftar_berkas_general_consent', {
    p_cari: cari,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data
}

// URL unduh sementara (bucket private), berlaku 5 menit.
export async function urlUnduhBerkas(path, namaFile) {
  const { data, error } = await supabase.storage
    .from('berkas-general-consent')
    .createSignedUrl(path, 300, { download: namaFile })
  if (error) throw error
  return data.signedUrl
}
