// ────────────────────────────────────────────────────────────────
// Helper untuk mengolah data diagnosa dari tabel `pemeriksaan`
// (relasi ke `kunjungan` via kunjungan_id). Dipakai bersama oleh
// tampilan layar (RiwayatPendaftaran.jsx), export PDF, dan export
// Excel supaya format diagnosa & penanda PD3I selalu konsisten
// di ketiga tempat.
// ────────────────────────────────────────────────────────────────

// Gabungkan diagnosis + kode ICD jadi satu teks,
// mis. "Demam Berdarah (A90)". Jika satu kunjungan punya lebih
// dari satu baris pemeriksaan, digabung dengan "; " — tapi teks
// yang identik (diagnosis + kode ICD sama persis) hanya ditampilkan
// sekali, supaya duplikasi baris pemeriksaan di database tidak
// muncul dobel di laporan (mis. "demam; demam").
export function formatDiagnosa(pemeriksaan) {
  const list = Array.isArray(pemeriksaan) ? pemeriksaan : (pemeriksaan ? [pemeriksaan] : [])
  const teks = list
    .filter((p) => p?.diagnosis || p?.kode_icd)
    .map((p) => {
      const nama = p.diagnosis || '-'
      return p.kode_icd ? `${nama} (${p.kode_icd})` : nama
    })
  const teksUnik = [...new Set(teks)]
  return teksUnik.length > 0 ? teksUnik.join('; ') : '-'
}

// True jika salah satu baris pemeriksaan pada kunjungan ini
// ditandai sebagai PD3I (pemeriksaan.adalah_pd3i = true).
// Baris tabel akan ditandai merah jika ini true.
export function cekPD3I(pemeriksaan) {
  const list = Array.isArray(pemeriksaan) ? pemeriksaan : (pemeriksaan ? [pemeriksaan] : [])
  return list.some((p) => p?.adalah_pd3i === true)
}

// True jika salah satu baris pemeriksaan pada kunjungan ini
// ditandai sebagai kasus SKDR (pemeriksaan.adalah_skdr = true).
// Baris tabel akan ditandai merah jika ini true, sama seperti PD3I.
export function cekSKDR(pemeriksaan) {
  const list = Array.isArray(pemeriksaan) ? pemeriksaan : (pemeriksaan ? [pemeriksaan] : [])
  return list.some((p) => p?.adalah_skdr === true)
}
