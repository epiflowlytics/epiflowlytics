import { tglIndo } from './FormANC'

// TandaBahaya — daftar centang tanda bahaya kehamilan + edukasi yang diberikan, untuk Poli KIA.
// Komponen "controlled": state disimpan di DashboardKIA, komponen ini hanya menampilkan dan mengubah lewat props.
// Disimpan di tabel `tanda_bahaya_anc` (satu baris per kunjungan, lihat tanda_bahaya_anc.sql).
//
// Props:
//   value    : state tanda bahaya (lihat emptyBahaya)
//   onChange : (state baru) => void
//   riwayat  : baris tanda_bahaya_anc kunjungan sebelumnya (+ kunjungan:kunjungan_id(tanggal_periksa)), urut tanggal
//   disabled : boolean
//   temuan   : (opsional) hasil pemeriksaan kunjungan ini dari FormANC, untuk peringatan otomatis:
//              { sistol, diastol, suhu, proteinuriaPositif }  (angka / boolean; boleh kosong)
//              Hanya menampilkan peringatan, tidak mengubah data yang disimpan.
//
// DASAR DAN BATAS KOMPONEN
//   Permenkes 24/2022 tentang Rekam Medis: pencatatan harus lengkap, jelas, memuat nama, waktu, dan tanda tangan
//   tenaga kesehatan pemberi layanan (Pasal 16 ayat 2); isi rekam medis memuat hasil pemeriksaan, diagnosis,
//   pengobatan, dan rencana tindak lanjut (Pasal 26 ayat 6); diagnosis dikode ICD terbaru (Pasal 18 ayat 2).
//   Komponen ini HANYA mencatat tanda bahaya yang ditanyakan, edukasi, dan tindak lanjut. Tidak di sini:
//   tekanan darah/proteinuria/suhu, diagnosis ber-ICD, skrining preeklamsia (kotak kuning/merah Buku KIA),
//   skrining HIV/sifilis/hepatitis B, dan transfer rujukan (Pasal 24). Pastikan semuanya tercatat di FormANC/modul lain.
//   Nama field RME resmi mengikuti KMK HK.01.07/MENKES/1423/2022; pemetaan field komponen ini BELUM diverifikasi.
//   Kode internal (mis. `perdarahan`) hanya untuk antarmuka dan basis data sendiri, bukan kode klasifikasi klinis.

// true = bila ada tanda bahaya, tindak lanjut wajib dipilih sebelum kunjungan bisa disimpan.
export const TINDAK_LANJUT_BAHAYA_WAJIB = true

// SUMBER DAFTAR: Buku KIA edisi 2024 (Kemenkes), halaman "Tanda Bahaya Pada Trimester 1/2/3" (hlm. 8, 17, 20)
// dan "Masalah Lain Pada Kehamilan" (TM 1). Redaksi mengikuti buku; `tm` = trimester tempat tanda itu tercantum.
//   grup 'bahaya'   : tanda bahaya di Buku KIA 2024. Buku menyebut semuanya "segera periksa ke Puskesmas/RS",
//                     jadi segera: true. `segera` hanya penanda prioritas penilaian oleh dokter/bidan, BUKAN keputusan rujukan.
//                     Kalimat Buku KIA ditujukan kepada ibu; panduan ANC terpadu untuk petugas lebih bertingkat
//                     (mis. perdarahan antepartum = emergensi; demam = ditangani dulu, dirujuk bila 2 hari belum membaik).
//                     TINJAU bersama dokter/bidan koordinator: demam_tinggi, mual_muntah_hebat, keluhan_kemih_keputihan.
//   grup 'lain'     : "Masalah Lain Pada Kehamilan" di Buku KIA 2024. segera: false adalah penilaian klinis,
//                     BUKAN dari buku; ubah bila pedoman Puskesmas menentukan lain.
//   grup 'tambahan' : tanda klinis yang TIDAK ada di halaman tanda bahaya ANC Buku KIA 2024 (kejang, bengkak;
//                     keduanya tercantum di bagian nifas). Dipertahankan atas pertimbangan klinis preeklamsia/eklamsia.
//                     Set TAMPILKAN_TAMBAHAN = false bila Puskesmas hanya memakai daftar Buku KIA.
// Kode (kiri) jangan diganti setelah ada data tersimpan.
export const TAMPILKAN_TAMBAHAN = true

export const TANDA_BAHAYA = [
  // --- Tanda bahaya (Buku KIA 2024) ---
  { grup: 'bahaya', kode: 'perdarahan', label: 'Perdarahan (TM 3: perdarahan hebat)', tm: '1, 2, 3', segera: true },
  { grup: 'bahaya', kode: 'demam_tinggi', label: 'Demam tinggi', tm: '1, 2', segera: true },
  { grup: 'bahaya', kode: 'nyeri_perut_hebat', label: 'Nyeri perut hebat (TM 3: di antara kontraksi)', tm: '1, 2, 3', segera: true },
  { grup: 'bahaya', kode: 'mual_muntah_hebat', label: 'Mual dan muntah hebat', tm: '1', segera: true },
  { grup: 'bahaya', kode: 'sakit_kepala_berat', label: 'Pusing atau sakit kepala berat', tm: '2, 3', segera: true },
  { grup: 'bahaya', kode: 'pandangan_kabur', label: 'Pandangan kabur', tm: '2', segera: true },
  { grup: 'bahaya', kode: 'napas_pendek_berdebar', label: 'Napas pendek dan jantung berdebar kencang', tm: '2', segera: true },
  { grup: 'bahaya', kode: 'muntah_darah', label: 'Muntah darah', tm: '2', segera: true },
  { grup: 'bahaya', kode: 'cairan_jalan_lahir', label: 'Keluar cairan dari jalan lahir yang sangat banyak atau berbau', tm: '2', segera: true },
  { grup: 'bahaya', kode: 'gerak_janin_berkurang', label: 'Gerakan bayi tidak ada atau kurang dari 10 kali dalam 12 jam (setelah minggu ke-24)', tm: '3', segera: true },
  { grup: 'bahaya', kode: 'ketuban_pecah_tanpa_kontraksi', label: 'Ketuban pecah namun tidak ada kontraksi', tm: '3', segera: true },
  { grup: 'bahaya', kode: 'keluhan_kemih_keputihan', label: 'Sakit saat kencing, atau keputihan, atau gatal di daerah kemaluan', tm: '1, 2', segera: true },

  // --- Masalah lain pada kehamilan (Buku KIA 2024, TM 1) ---
  { grup: 'lain', kode: 'demam_menggigil_malaria', label: 'Demam, menggigil, dan berkeringat (daerah endemis: curiga malaria)', tm: '1', segera: false },
  { grup: 'lain', kode: 'batuk_lama', label: 'Batuk lama (lebih dari 2 minggu) atau kontak serumah dengan penderita TB', tm: '1', segera: false },
  { grup: 'lain', kode: 'sulit_tidur_cemas', label: 'Sulit tidur dan cemas berlebihan', tm: '1', segera: false },
  { grup: 'lain', kode: 'jantung_berdebar_nyeri_dada', label: 'Jantung berdebar-debar atau nyeri di dada', tm: '1', segera: false },
  { grup: 'lain', kode: 'diare_berulang', label: 'Diare berulang', tm: '1', segera: false },

  // --- Tambahan klinis (bukan dari halaman tanda bahaya ANC Buku KIA 2024) ---
  { grup: 'tambahan', kode: 'kejang', label: 'Kejang', segera: true },
  { grup: 'tambahan', kode: 'bengkak', label: 'Bengkak pada wajah, tangan, atau kaki', segera: false },
]

const GRUP_TANDA = [
  { grup: 'bahaya', judul: 'Tanda bahaya kehamilan (Buku KIA 2024)' },
  { grup: 'lain', judul: 'Masalah lain pada kehamilan (Buku KIA 2024)' },
  { grup: 'tambahan', judul: 'Tambahan klinis (di luar daftar Buku KIA 2024)' },
]

// Edukasi mengikuti isi Buku KIA 2024: kehamilan (hlm. 4-20), persiapan melahirkan/P4K (hlm. 18-19),
// kesehatan jiwa (hlm. 14), KB pasca salin (hlm. 32-33), IMD dan ASI. Sesuaikan dengan materi KIE Puskesmas.
export const EDUKASI_ANC = [
  { kode: 'kenali_tanda_bahaya', label: 'Mengenali tanda bahaya kehamilan (Buku KIA, lembar pemantauan mingguan)' },
  { kode: 'segera_ke_faskes', label: 'Segera ke fasilitas pelayanan kesehatan bila muncul tanda bahaya' },
  { kode: 'p4k', label: 'Persiapan melahirkan / P4K: tempat dan penolong, pendamping, dana, kendaraan, donor darah, KTP/KK, JKN, stiker P4K' },
  { kode: 'gerak_janin', label: 'Memantau gerakan bayi' },
  { kode: 'gizi_ttd', label: 'Gizi seimbang (porsi makan ibu hamil) dan minum TTD/MMS setiap hari' },
  { kode: 'istirahat_kebersihan', label: 'Istirahat cukup, cuci tangan pakai sabun, kebersihan diri' },
  { kode: 'hindari_risiko', label: 'Hal yang tidak boleh dilakukan: rokok/asap rokok, alkohol, obat tanpa resep, aktivitas berat, tidur telentang lama' },
  { kode: 'kesehatan_jiwa', label: 'Menjaga kesehatan jiwa selama hamil, dukungan suami dan keluarga' },
  { kode: 'kelas_ibu_hamil', label: 'Mengikuti kelas ibu hamil' },
  { kode: 'tanda_persalinan', label: 'Tanda awal persalinan dan tanda bahaya saat melahirkan' },
  { kode: 'imd_asi', label: 'IMD dan pemberian ASI' },
  { kode: 'kb_pascasalin', label: 'KB pasca salin' },
  { kode: 'kontrol_rutin', label: 'Jadwal kontrol ANC berikutnya (paling sedikit 6 kali, 2 kali USG oleh dokter)' },
]

export const TINDAK_LANJUT_BAHAYA = [
  '',
  'Rujuk segera ke PONED / UGD',
  'Rujuk ke dokter Puskesmas',
  'Rujuk ke RS / dokter spesialis',
  'Observasi, kontrol ulang lebih cepat',
  'Edukasi, pantau kunjungan berikutnya',
]

const labelTanda = Object.fromEntries(TANDA_BAHAYA.map((t) => [t.kode, t.label]))
const kodeSegera = new Set(TANDA_BAHAYA.filter((t) => t.segera).map((t) => t.kode))

// ---- state awal ----
export const emptyBahaya = {
  id: null,
  tidak_ada: false, // petugas menegaskan: tidak ada tanda bahaya
  tanda: [], // kode tanda bahaya yang dicentang
  tanda_lain: '',
  edukasi: [], // kode edukasi yang diberikan
  edukasi_lain: '',
  tindak_lanjut: '',
  catatan: '',
}

// baris database -> state form
export function bahayaDariRow(row) {
  return {
    id: row.id,
    tidak_ada: !!row.tidak_ada,
    tanda: row.tanda ?? [],
    tanda_lain: row.tanda_lain ?? '',
    edukasi: row.edukasi ?? [],
    edukasi_lain: row.edukasi_lain ?? '',
    tindak_lanjut: row.tindak_lanjut ?? '',
    catatan: row.catatan ?? '',
  }
}

// ---- penilaian ----
export function nilaiBahaya(b = emptyBahaya) {
  const tanda = b.tanda ?? []
  const adaTandaLain = !!b.tanda_lain?.trim()
  const adaTanda = tanda.length > 0 || adaTandaLain
  const adaSegera = tanda.some((k) => kodeSegera.has(k))
  const adaEdukasi = (b.edukasi ?? []).length > 0 || !!b.edukasi_lain?.trim()
  // terisi = ada sesuatu yang perlu disimpan; kalau kosong semua, baris tidak dibuat (atau dihapus bila sudah ada)
  const terisi = adaTanda || b.tidak_ada || adaEdukasi
  return { adaTanda, adaSegera, adaEdukasi, terisi }
}

// Teks galat, atau null kalau valid / belum diisi.
export function validasiBahaya(b) {
  const n = nilaiBahaya(b)
  if (n.adaTanda && TINDAK_LANJUT_BAHAYA_WAJIB && !b.tindak_lanjut)
    return 'Tanda bahaya kehamilan: pilih tindak lanjut / rujukan terlebih dahulu'
  return null
}

// state form -> baris siap simpan (kunjungan_id, kehamilan_id, petugas_id ditambahkan di DashboardKIA)
export function siapkanDataBahaya(b) {
  const n = nilaiBahaya(b)
  const urut = (daftar, pilih) => daftar.filter((x) => pilih.includes(x.kode)).map((x) => x.kode)
  return {
    tidak_ada: n.adaTanda ? false : !!b.tidak_ada,
    tanda: urut(TANDA_BAHAYA, b.tanda ?? []),
    tanda_lain: b.tanda_lain?.trim() || null,
    ada_tanda_bahaya: n.adaTanda,
    ada_tanda_segera: n.adaSegera,
    edukasi: urut(EDUKASI_ANC, b.edukasi ?? []),
    edukasi_lain: b.edukasi_lain?.trim() || null,
    tindak_lanjut: n.adaTanda ? b.tindak_lanjut || null : null,
    catatan: n.adaTanda ? b.catatan?.trim() || null : null, // kolom catatan hanya tampil bila ada tanda bahaya
    updated_at: new Date().toISOString(),
  }
}

// Peringatan dari hasil pemeriksaan (opsional). Ambang umum untuk hipertensi dalam kehamilan dan demam;
// sesuaikan dengan pedoman Puskesmas. Hanya saran untuk petugas, bukan diagnosis.
export function peringatanTemuan(t) {
  if (!t) return []
  const sis = Number(t.sistol)
  const dia = Number(t.diastol)
  const suhu = Number(t.suhu)
  const out = []
  const hipertensi = (Number.isFinite(sis) && sis >= 140) || (Number.isFinite(dia) && dia >= 90)
  if (hipertensi && t.proteinuriaPositif) out.push('Tekanan darah ≥ 140/90 disertai proteinuria positif: curiga preeklamsia, nilai bersama dokter.')
  else if (hipertensi) out.push('Tekanan darah ≥ 140/90: periksa ulang, cek proteinuria, dan nilai bersama dokter.')
  else if (t.proteinuriaPositif) out.push('Proteinuria positif: cek tekanan darah dan nilai bersama dokter.')
  if (Number.isFinite(suhu) && suhu >= 38) out.push('Suhu ≥ 38 °C: cari penyebab demam dan tentukan tindak lanjut.')
  return out
}

// ---- tampilan ----
const input = {
  fontSize: 13,
  padding: '8px 10px',
  border: '1px solid var(--line, #e5e7eb)',
  borderRadius: 8,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}
const merah = 'var(--danger, #b42318)'
const muted = 'var(--muted, #6b7280)'
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2px 12px' }

function Centang({ checked, onChange, disabled, children, gaya }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, minHeight: 28, padding: '3px 0', cursor: disabled ? 'default' : 'pointer', ...gaya }}>
      <input type="checkbox" style={{ marginTop: 3 }} disabled={disabled} checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  )
}

const ubahDaftar = (daftar, kode, on) => (on ? [...new Set([...daftar, kode])] : daftar.filter((k) => k !== kode))

export default function TandaBahaya({ value, onChange, riwayat = [], disabled = false, temuan }) {
  const n = nilaiBahaya(value)
  const peringatan = peringatanTemuan(temuan)
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })

  // tanda bahaya terakhir yang pernah tercatat pada kehamilan ini
  const terakhir = [...riwayat].reverse().find((r) => r.ada_tanda_bahaya) ?? null
  const ringkasTerakhir = terakhir
    ? [...(terakhir.tanda ?? []).map((k) => labelTanda[k] ?? k), terakhir.tanda_lain].filter(Boolean).join(', ')
    : ''

  function ubahTanda(kode, on) {
    onChange({ ...value, tanda: ubahDaftar(value.tanda, kode, on), tidak_ada: on ? false : value.tidak_ada })
  }
  function ubahTidakAda(on) {
    // "tidak ada" saling lepas dengan tanda yang dicentang
    if (on && n.adaTanda && !window.confirm('Centang "Tidak ada tanda bahaya" akan menghapus tanda bahaya yang sudah dicentang. Lanjutkan?')) return
    onChange(on ? { ...value, tidak_ada: true, tanda: [], tanda_lain: '', tindak_lanjut: '', catatan: '' } : { ...value, tidak_ada: false })
  }

  return (
    <fieldset style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: 12, marginTop: 10, minWidth: 0 }}>
      <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>Tanda Bahaya Kehamilan dan Edukasi</legend>

      <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>
        {terakhir
          ? `Tanda bahaya terakhir tercatat: ${tglIndo(terakhir.kunjungan?.tanggal_periksa)}, ${ringkasTerakhir}${terakhir.tindak_lanjut ? ` (${terakhir.tindak_lanjut})` : ''}.`
          : riwayat.length
            ? 'Tidak ada tanda bahaya tercatat pada kunjungan sebelumnya.'
            : 'Belum ada catatan tanda bahaya pada kehamilan ini.'}
      </div>

      {peringatan.length > 0 && (
        <div role="status" style={{ border: '1px solid #b54708', background: '#fffaeb', borderRadius: 6, padding: '8px 10px', fontSize: 12, margin: '4px 0 8px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#b54708' }}>Perhatikan hasil pemeriksaan hari ini</div>
          {peringatan.map((p) => (
            <div key={p} style={{ marginTop: 3 }}>{p}</div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, margin: '4px 0 2px' }}>Apakah ibu mengalami tanda berikut?</div>
      {GRUP_TANDA.filter((g) => g.grup !== 'tambahan' || TAMPILKAN_TAMBAHAN).map((g) => (
        <div key={g.grup}>
          <div style={{ fontSize: 12, fontWeight: 600, color: muted, margin: '8px 0 2px' }}>{g.judul}</div>
          <div style={grid}>
            {TANDA_BAHAYA.filter((t) => t.grup === g.grup).map((t) => (
              <Centang
                key={t.kode}
                disabled={disabled}
                checked={value.tanda.includes(t.kode)}
                onChange={(e) => ubahTanda(t.kode, e.target.checked)}
                gaya={value.tanda.includes(t.kode) ? { color: merah, fontWeight: 700 } : undefined}
              >
                {t.label}
                {t.tm && <span style={{ color: muted, fontWeight: 400, fontSize: 11 }}> · TM {t.tm}</span>}
              </Centang>
            ))}
          </div>
        </div>
      ))}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, margin: '6px 0' }}>
        Tanda bahaya lainnya
        <input style={input} disabled={disabled} value={value.tanda_lain} onChange={set('tanda_lain')} placeholder="Tulis bila ada keluhan lain yang mengkhawatirkan" />
      </label>

      <Centang disabled={disabled} checked={value.tidak_ada} onChange={(e) => ubahTidakAda(e.target.checked)}>
        Tidak ada tanda bahaya (sudah ditanyakan kepada ibu)
      </Centang>

      {n.adaTanda && (
        <div role="alert" style={{ border: `1px solid ${merah}`, background: '#fef3f2', borderRadius: 6, padding: '8px 10px', fontSize: 12, marginTop: 8 }}>
          <div style={{ color: merah, fontWeight: 700, fontSize: 13 }}>⚠ Ada tanda bahaya kehamilan</div>
          <div style={{ marginTop: 4 }}>
            {n.adaSegera
              ? 'Ada tanda bahaya yang perlu dinilai lebih dulu. Nilai bersama dokter dan putuskan tindak lanjut.'
              : 'Ada tanda bahaya, nilai bersama dokter dan putuskan tindak lanjut.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600 }}>
              Tindak lanjut{TINDAK_LANJUT_BAHAYA_WAJIB ? ' *' : ''}
              <select style={input} disabled={disabled} value={value.tindak_lanjut} onChange={set('tindak_lanjut')}>
                {TINDAK_LANJUT_BAHAYA.map((o) => (
                  <option key={o} value={o}>
                    {o || '— pilih —'}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600 }}>
              Catatan (tujuan rujukan, dll.)
              <input style={input} disabled={disabled} value={value.catatan} onChange={set('catatan')} />
            </label>
          </div>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 2px' }}>Edukasi yang diberikan</div>
      <div style={grid}>
        {EDUKASI_ANC.map((e) => (
          <Centang
            key={e.kode}
            disabled={disabled}
            checked={value.edukasi.includes(e.kode)}
            onChange={(ev) => onChange({ ...value, edukasi: ubahDaftar(value.edukasi, e.kode, ev.target.checked) })}
          >
            {e.label}
          </Centang>
        ))}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginTop: 6 }}>
        Edukasi lainnya
        <input style={input} disabled={disabled} value={value.edukasi_lain} onChange={set('edukasi_lain')} />
      </label>
      {n.adaTanda && !n.adaEdukasi && (
        <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>
          Ada tanda bahaya: sebaiknya edukasi “Segera ke fasilitas kesehatan bila muncul tanda bahaya” juga dicatat.
        </div>
      )}
    </fieldset>
  )
}