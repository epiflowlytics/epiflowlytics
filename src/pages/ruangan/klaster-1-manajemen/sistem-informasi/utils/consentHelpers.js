// Helper & konstanta untuk fitur General Consent digital (loket + poli).
//
// PENTING: nilai-nilai di file ini HARUS sinkron dengan skema tabel
// `general_consent` di Supabase (lihat migration `create_general_consent_tables`
// dan `fix_general_consent_rls_and_public_access`). Tabel itu memakai kolom
// jsonb `daftar_tindakan` & `checklist_persetujuan`, BUKAN kolom teks
// per-bagian — jangan kembalikan ke bentuk lama itu.
//
// Struktur `checklist_persetujuan` mengikuti spesifikasi General Consent
// Permenkes (RME), BUKAN lagi 6 pernyataan tindakan medis generik. Bentuknya:
//
// {
//   persetujuan_pasien: 'ya' | 'tidak' | null, // Butir 4 pedoman: pernyataan
//     // keseluruhan pasien setuju/tidak atas pelayanan, DIISI MANUAL oleh
//     // petugas, TERPISAH dari & TIDAK dihitung otomatis dari jawaban a-f.
//   a_ketentuan_pembayaran: 'setuju' | 'tidak_setuju' | null,
//   b_hak_kewajiban_pasien: 'setuju' | 'tidak_setuju' | null,
//   c_tata_tertib: 'setuju' | 'tidak_setuju' | null,
//   d_penterjemah_bahasa: 'ya' | 'tidak' | null,
//   e_rohaniawan: 'ya' | 'tidak' | null,
//   f_pelepasan_informasi: {
//     hasil_penunjang_ke_penjamin: 'setuju' | 'tidak_setuju' | null,
//     hasil_penunjang_diakses_peserta_didik: 'setuju' | 'tidak_setuju' | null,
//     keluarga_boleh_diberi_informasi: [{ nama: '', hubungan: '' }],
//     fasyankes_rujukan: 'setuju' | 'tidak_setuju' | null,
//   },
// }
//
// CATATAN AUDIT (bulan ini): butir g_persetujuan_umum dan h_alasan_perwakilan
// yang sempat ada di versi sebelumnya file ini SUDAH DIHAPUS. Keduanya tidak
// berdasar Pedoman Kepmenkes HK.01.07/MENKES/1423/2022 (General Consent Bab
// III hanya punya butir 4 + a-f di atas). "Penanggung jawab" & "hubungan
// dengan pasien" (poin 5a pedoman) SUDAH ditangani lewat kolom tabel
// general_consent.nama_pemberi_persetujuan &
// general_consent.hubungan_pemberi_persetujuan, diisi PASIEN SENDIRI saat
// tanda tangan di HalamanConsentPublik.jsx — bukan lewat checklist_persetujuan
// ini, jadi tidak perlu field duplikat di sini.
//
// Semua butir a/b/c/d/e/f1/f2/f4 BOLEH bernilai "tidak setuju" / "tidak" —
// itu hak pasien yang sah, bukan galat. Validasi (lihat
// validasiChecklistPersetujuan) hanya memastikan setiap butir WAJIB SUDAH
// DIPILIH (tidak null), bukan bahwa semuanya "setuju".

// ── Status consent — HARUS sama persis dengan CHECK constraint kolom `status`
// di tabel general_consent: ARRAY['menunggu_ttd','ditandatangani','kedaluwarsa','dibatalkan']
export const STATUS_CONSENT = {
  MENUNGGU_TTD: 'menunggu_ttd', // loket sudah buat consent, menunggu pasien scan QR & TTD
  DITANDATANGANI: 'ditandatangani', // pasien sudah TTD di halaman publik, menunggu TTD petugas di poli
  KEDALUWARSA: 'kedaluwarsa', // token_kedaluwarsa_pada terlewati sebelum pasien sempat TTD
  DIBATALKAN: 'dibatalkan', // dibatalkan manual oleh petugas
}

export const LABEL_STATUS_CONSENT = {
  [STATUS_CONSENT.MENUNGGU_TTD]: 'Menunggu TTD Pasien',
  [STATUS_CONSENT.DITANDATANGANI]: 'Menunggu TTD Petugas',
  [STATUS_CONSENT.KEDALUWARSA]: 'Kedaluwarsa',
  [STATUS_CONSENT.DIBATALKAN]: 'Dibatalkan',
}

// Status yang masih dianggap "aktif" (belum tuntas) untuk satu pasien.
// Consent dianggap SELESAI (tidak aktif lagi) hanya kalau petugas sudah TTD
// di poli (baris consent_signature pihak='petugas'). Sampai tahap itu,
// anggap consent aktif = status IN (menunggu_ttd, ditandatangani).
export const STATUS_CONSENT_AKTIF = [STATUS_CONSENT.MENUNGGU_TTD, STATUS_CONSENT.DITANDATANGANI]

// Pilihan Setuju / Tidak setuju — dipakai untuk butir a, b, c, f1, f2, f4
export const OPSI_SETUJU = [
  { value: 'setuju', label: 'Setuju' },
  { value: 'tidak_setuju', label: 'Tidak setuju' },
]

// Pilihan Ya / Tidak — dipakai untuk butir d, e
export const OPSI_YA_TIDAK = [
  { value: 'ya', label: 'Ya' },
  { value: 'tidak', label: 'Tidak' },
]

// Definisi field induk "4. Persetujuan Pasien" (Ya/Tidak) — pernyataan
// keseluruhan pasien setuju/tidak atas pelayanan RS/Puskesmas, sesuai poin 4
// pedoman. Diisi MANUAL oleh petugas, terpisah dari & tidak dihitung
// otomatis dari jawaban butir a-f.
export const PERSETUJUAN_PASIEN = {
  key: 'persetujuan_pasien',
  labelSingkat: 'Persetujuan pasien',
  label: 'Pernyataan pasien: apakah pasien menyetujui pelayanan yang akan diberikan?',
  opsi: OPSI_YA_TIDAK,
}

// Definisi butir a-e untuk dirender sebagai list (label + kelompok opsi).
// key harus sama persis dengan properti di checklist_persetujuan.
// `label` = teks lengkap yang dibaca petugas/pasien di form & PDF.
// `labelSingkat` = nama pendek butir, dipakai HANYA untuk pesan validasi
// ("Butir X belum dipilih") supaya pesan error tidak menampilkan seluruh
// kalimat penjelasan.
export const BUTIR_PERSETUJUAN = [
  {
    key: 'a_ketentuan_pembayaran',
    labelSingkat: 'Ketentuan pembayaran',
    label:
      'Biaya pelayanan mengikuti jenis jaminan yang digunakan (BPJS/umum). Biaya di luar tanggungan jaminan menjadi tanggung jawab pasien. Pasien memahami dan bersedia mengikuti ketentuan pembayaran ini.',
    opsi: OPSI_SETUJU,
  },
  {
    key: 'b_hak_kewajiban_pasien',
    labelSingkat: 'Hak dan kewajiban pasien',
    label:
      'Pasien berhak bertanya, menolak tindakan, dan dijaga kerahasiaan datanya. Pasien wajib memberikan informasi yang benar dan mengikuti aturan pelayanan.',
    opsi: OPSI_SETUJU,
  },
  {
    key: 'c_tata_tertib',
    labelSingkat: 'Tata tertib',
    label:
      'Pasien telah dijelaskan dan bersedia mematuhi tata tertib yang berlaku di Puskesmas.',
    opsi: OPSI_SETUJU,
  },
  {
    key: 'd_penterjemah_bahasa',
    labelSingkat: 'Kebutuhan penterjemah bahasa',
    label: 'Pasien berhak meminta penterjemah bahasa. Apakah pasien membutuhkannya?',
    opsi: OPSI_YA_TIDAK,
  },
  {
    key: 'e_rohaniawan',
    labelSingkat: 'Kebutuhan rohaniawan',
    label: 'Pasien berhak meminta pendampingan rohaniawan. Apakah pasien membutuhkannya?',
    opsi: OPSI_YA_TIDAK,
  },
]

// Definisi sub-butir f (Pelepasan informasi)
export const SUB_BUTIR_F = [
  {
    key: 'hasil_penunjang_ke_penjamin',
    label: 'Pelepasan hasil pemeriksaan penunjang kepada pihak penjamin',
    opsi: OPSI_SETUJU,
  },
  {
    key: 'hasil_penunjang_diakses_peserta_didik',
    label: 'Hasil pemeriksaan penunjang dapat diakses oleh peserta didik',
    opsi: OPSI_SETUJU,
  },
  {
    key: 'fasyankes_rujukan',
    label: 'Pelepasan informasi kepada fasilitas pelayanan kesehatan rujukan',
    opsi: OPSI_SETUJU,
  },
]

// Nilai default kosong untuk checklist_persetujuan (dipakai saat form baru
// dibuka di loket, sebelum petugas menjelaskan & memilihkan tiap butir).
export function checklistPersetujuanKosong() {
  return {
    persetujuan_pasien: null,
    a_ketentuan_pembayaran: null,
    b_hak_kewajiban_pasien: null,
    c_tata_tertib: null,
    d_penterjemah_bahasa: null,
    e_rohaniawan: null,
    f_pelepasan_informasi: {
      hasil_penunjang_ke_penjamin: null,
      hasil_penunjang_diakses_peserta_didik: null,
      keluarga_boleh_diberi_informasi: [],
      fasyankes_rujukan: null,
    },
  }
}

// Cek apakah checklist sudah lengkap (semua butir SUDAH DIPILIH, bukan
// berarti semua "setuju" — pasien boleh memilih tidak setuju/tidak pada
// butir apa pun, itu sah). Dipakai untuk validasi sebelum submit di loket
// maupun di halaman publik.
// Mengembalikan '' kalau lengkap, atau pesan error kalau ada yang kosong.
export function validasiChecklistPersetujuan(checklist) {
  if (!checklist) return 'Checklist persetujuan belum diisi.'

  if (checklist[PERSETUJUAN_PASIEN.key] == null) {
    return `Butir "${PERSETUJUAN_PASIEN.labelSingkat}" belum dipilih.`
  }

  for (const butir of BUTIR_PERSETUJUAN) {
    if (checklist[butir.key] == null) {
      return `Butir "${butir.labelSingkat}" belum dipilih.`
    }
  }
  const f = checklist.f_pelepasan_informasi
  if (!f) return 'Butir pelepasan informasi belum diisi.'

  for (const sub of SUB_BUTIR_F) {
    if (f[sub.key] == null) {
      return `Butir "${sub.label}" belum dipilih.`
    }
  }

  return ''
}

// Bangun URL publik halaman consent dari token
export function urlConsentPublik(token) {
  return `${window.location.origin}/consent/${token}`
}