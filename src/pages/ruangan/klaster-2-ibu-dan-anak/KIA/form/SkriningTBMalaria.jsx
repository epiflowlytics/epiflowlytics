import { tglIndo } from './FormANC'

// SkriningTBMalaria — skrining gejala TB (semua ibu hamil) dan malaria (hanya wilayah endemis) untuk Poli KIA.
// Komponen "controlled": state disimpan di DashboardKIA, komponen ini hanya menampilkan dan mengubah lewat props.
// Disimpan di tabel `skrining_tb_malaria_anc` (satu baris per kunjungan, lihat skrining_tb_malaria_anc.sql).
//
// Props:
//   value         : state skrining (lihat emptyTbm)
//   onChange      : (state baru) => void
//   riwayat       : baris skrining_tb_malaria_anc kunjungan sebelumnya (+ kunjungan:kunjungan_id(tanggal_periksa)), urut tanggal
//   endemisMalaria: boolean, true bila wilayah Puskesmas endemis malaria (kolom instansi.endemis_malaria).
//                   Bagian malaria SELALU tampil (pasien bisa kiriman dari daerah endemis). Flag ini hanya menentukan
//                   wajib diisi: endemis = wajib lengkap tiap kunjungan; non-endemis = opsional, tapi bila mulai diisi
//                   harus lengkap, dan suspek/positif tetap wajib tindak lanjut.
//   disabled      : boolean
//
// DASAR (TINJAU bersama dokter/pengelola program TB dan malaria Puskesmas, sesuaikan dengan pedoman dinas setempat):
//   TB     : skrining gejala pada ibu hamil memakai gejala batuk (berapa pun lamanya), demam, berat badan turun / tidak naik,
//            keringat malam, ditambah riwayat kontak erat dengan pasien TB. Ada salah satu gejala = terduga TB, perlu
//            pemeriksaan lanjutan (TCM). Kontak erat tanpa gejala hanya diberi catatan, bukan terduga TB.
//   Malaria: di wilayah endemis, ibu hamil ditanya gejala (demam atau riwayat demam 48 jam terakhir, menggigil, berkeringat,
//            sakit kepala) dan dites (RDT/mikroskopis). Pengobatan malaria pada kehamilan berbeda per trimester, jadi
//            komponen ini HANYA mencatat dan menandai tindak lanjut, tidak memberi saran obat.

// true = skrining TB wajib lengkap pada setiap kunjungan ANC sebelum kunjungan bisa disimpan.
// Ubah ke false bila Puskesmas hanya ingin skrining TB sekali pada kunjungan pertama (petugas boleh mengosongkan).
export const TB_WAJIB_DIISI = true

// true = di wilayah endemis, gejala dan hasil tes malaria wajib diisi pada setiap kunjungan ANC.
export const MALARIA_WAJIB_DIISI = true

// true = bila terduga TB / suspek atau positif malaria, tindak lanjut wajib dipilih sebelum kunjungan bisa disimpan.
export const TINDAK_LANJUT_TBM_WAJIB = true

// Kode (kiri) jangan diganti setelah ada data tersimpan.
export const GEJALA_TB = [
  { kode: 'batuk', label: 'Batuk (berapa pun lamanya)' },
  { kode: 'demam', label: 'Demam' },
  { kode: 'bb_turun', label: 'Berat badan turun atau tidak naik selama hamil' },
  { kode: 'keringat_malam', label: 'Berkeringat di malam hari tanpa kegiatan' },
]
export const KONTAK_TB = { kode: 'kontak_erat', label: 'Ada kontak erat dengan pasien TB (serumah / sering bersama)' }

export const GEJALA_MALARIA = [
  { kode: 'demam', label: 'Demam atau riwayat demam dalam 48 jam terakhir' },
  { kode: 'menggigil', label: 'Menggigil' },
  { kode: 'berkeringat', label: 'Berkeringat' },
  { kode: 'sakit_kepala', label: 'Sakit kepala' },
]

export const HASIL_TES_MALARIA = [
  '',
  'Belum dites',
  'RDT negatif',
  'RDT positif',
  'Mikroskopis negatif',
  'Mikroskopis positif',
]

export const TINDAK_LANJUT_TB = [
  '',
  'Ambil dahak untuk TCM di Puskesmas',
  'Rujuk ke dokter Puskesmas',
  'Rujuk ke RS untuk pemeriksaan TB',
  'Sudah dalam pengobatan TB, pantau kepatuhan',
  'Edukasi etika batuk, pantau kunjungan berikutnya',
]

export const TINDAK_LANJUT_MALARIA = [
  '',
  'Periksa RDT / mikroskopis hari ini',
  'Rujuk ke dokter Puskesmas',
  'Rujuk ke RS',
  'Sudah dalam pengobatan malaria, pantau',
  'Edukasi kelambu berinsektisida, pantau kunjungan berikutnya',
]

// ---- state awal ----
// tb / malaria: { kode: true|false }. Kode yang belum dijawab tidak ada di objek.
export const emptyTbm = {
  id: null,
  tb: {},
  tb_tindak_lanjut: '',
  malaria: {},
  malaria_hasil_tes: '',
  malaria_kelambu: null, // true | false | null
  malaria_tindak_lanjut: '',
  catatan: '',
}

// baris database -> state form
export function tbmDariRow(row) {
  return {
    id: row.id,
    tb: row.tb_gejala ?? {},
    tb_tindak_lanjut: row.tb_tindak_lanjut ?? '',
    malaria: row.malaria_gejala ?? {},
    malaria_hasil_tes: row.malaria_hasil_tes ?? '',
    malaria_kelambu: typeof row.malaria_kelambu === 'boolean' ? row.malaria_kelambu : null,
    malaria_tindak_lanjut: row.malaria_tindak_lanjut ?? '',
    catatan: row.catatan ?? '',
  }
}

// ---- penilaian ----
export function nilaiTB(tb = {}) {
  const semua = [...GEJALA_TB, KONTAK_TB]
  const terjawab = semua.filter((g) => tb?.[g.kode] === true || tb?.[g.kode] === false).length
  const adaGejala = GEJALA_TB.some((g) => tb?.[g.kode] === true)
  const kontakErat = tb?.[KONTAK_TB.kode] === true
  return {
    terjawab,
    total: semua.length,
    lengkap: terjawab === semua.length,
    terduga: adaGejala,
    kontakErat,
    kontakSaja: kontakErat && !adaGejala,
  }
}

export function nilaiMalaria(t) {
  const g = t?.malaria ?? {}
  const terjawab = GEJALA_MALARIA.filter((x) => g[x.kode] === true || g[x.kode] === false).length
  const hasil = t?.malaria_hasil_tes ?? ''
  const positif = hasil.includes('positif')
  const sudahTes = hasil !== '' && hasil !== 'Belum dites'
  const suspek = g.demam === true
  // perlu tindak lanjut: positif, atau suspek yang belum dites
  const perluTindak = positif || (suspek && !sudahTes)
  return {
    terjawab,
    total: GEJALA_MALARIA.length,
    gejalaLengkap: terjawab === GEJALA_MALARIA.length,
    hasil,
    positif,
    sudahTes,
    suspek,
    perluTindak,
  }
}

function malariaTerisi(t) {
  return nilaiMalaria(t).terjawab > 0 || !!t?.malaria_hasil_tes || typeof t?.malaria_kelambu === 'boolean'
}

// Ada isian yang perlu disimpan? (dipakai DashboardKIA untuk menentukan simpan / hapus baris)
export function tbmTerisi(t, endemisMalaria = false) {
  if (!t) return false
  if (nilaiTB(t.tb).terjawab > 0) return true
  if (malariaTerisi(t)) return true
  return false
}

// Teks galat, atau null kalau valid.
export function validasiTbm(t, endemisMalaria = false) {
  const tb = nilaiTB(t?.tb)
  if (tb.terjawab > 0 || TB_WAJIB_DIISI) {
    if (!tb.lengkap) return `Skrining TB: jawab semua ${tb.total} pertanyaan (baru ${tb.terjawab} terjawab)`
    if (tb.terduga && TINDAK_LANJUT_TBM_WAJIB && !t.tb_tindak_lanjut)
      return 'Skrining TB: ada gejala (terduga TB), pilih tindak lanjut terlebih dahulu'
  }
  {
    const m = nilaiMalaria(t)
    const mulai = malariaTerisi(t)
    if (mulai || (endemisMalaria && MALARIA_WAJIB_DIISI)) {
      if (!m.gejalaLengkap) return `Skrining malaria: jawab semua ${m.total} pertanyaan gejala (baru ${m.terjawab} terjawab)`
      if (!t.malaria_hasil_tes) return 'Skrining malaria: pilih hasil tes (atau "Belum dites")'
      if (m.perluTindak && TINDAK_LANJUT_TBM_WAJIB && !t.malaria_tindak_lanjut)
        return 'Skrining malaria: ada suspek/positif, pilih tindak lanjut terlebih dahulu'
    }
  }
  return null
}

// state form -> baris siap simpan (kunjungan_id, kehamilan_id, petugas_id ditambahkan di DashboardKIA)
export function siapkanDataTbm(t) {
  const tb = nilaiTB(t.tb)
  const tbGejala = Object.fromEntries(
    [...GEJALA_TB, KONTAK_TB].filter((g) => t.tb?.[g.kode] === true || t.tb?.[g.kode] === false).map((g) => [g.kode, t.tb[g.kode]])
  )
  const dasar = {
    tb_gejala: tbGejala,
    tb_terduga: tb.terduga,
    tb_kontak_erat: tb.kontakErat,
    tb_tindak_lanjut: t.tb_tindak_lanjut || null,
    catatan: t.catatan?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  if (!malariaTerisi(t)) {
    return { ...dasar, malaria_diskrining: false, malaria_gejala: null, malaria_hasil_tes: null, malaria_positif: false, malaria_suspek: false, malaria_kelambu: null, malaria_tindak_lanjut: null }
  }
  const m = nilaiMalaria(t)
  const malGejala = Object.fromEntries(
    GEJALA_MALARIA.filter((g) => t.malaria?.[g.kode] === true || t.malaria?.[g.kode] === false).map((g) => [g.kode, t.malaria[g.kode]])
  )
  return {
    ...dasar,
    malaria_diskrining: true,
    malaria_gejala: malGejala,
    malaria_hasil_tes: t.malaria_hasil_tes || null,
    malaria_positif: m.positif,
    malaria_suspek: m.suspek,
    malaria_kelambu: typeof t.malaria_kelambu === 'boolean' ? t.malaria_kelambu : null,
    malaria_tindak_lanjut: t.malaria_tindak_lanjut || null,
  }
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
const redup = 'var(--muted, #6b7280)'

function YaTidak({ nama, nilai, onPilih, disabled }) {
  const gaya = { display: 'flex', alignItems: 'center', gap: 4, cursor: disabled ? 'default' : 'pointer' }
  return (
    <span style={{ display: 'flex', gap: 12, fontSize: 13 }}>
      <label style={gaya}>
        <input type="radio" name={nama} disabled={disabled} checked={nilai === true} onChange={() => onPilih(true)} />
        Ya
      </label>
      <label style={gaya}>
        <input type="radio" name={nama} disabled={disabled} checked={nilai === false} onChange={() => onPilih(false)} />
        Tidak
      </label>
    </span>
  )
}

function Daftar({ prefix, butir, nilai, onJawab, disabled }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '2px 12px' }}>
      {butir.map((g) => (
        <Pasangan key={g.kode}>
          <span style={{ fontSize: 13, padding: '4px 0' }}>{g.label}</span>
          <YaTidak nama={`${prefix}-${g.kode}`} nilai={nilai?.[g.kode]} onPilih={(ya) => onJawab(g.kode, ya)} disabled={disabled} />
        </Pasangan>
      ))}
    </div>
  )
}

function Kotak({ warna, latar, children, alert }) {
  return (
    <div role={alert ? 'alert' : undefined} style={{ border: `1px solid ${warna}`, background: latar, borderRadius: 6, padding: '8px 10px', fontSize: 12, marginTop: 8 }}>
      {children}
    </div>
  )
}

function Pilihan({ label, wajib, opsi, value, onChange, disabled }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, marginTop: 8, fontSize: 12 }}>
      {label}
      {wajib ? ' *' : ''}
      <select style={input} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
        {opsi.map((o) => (
          <option key={o} value={o}>
            {o || '— pilih —'}
          </option>
        ))}
      </select>
    </label>
  )
}

function ringkasanRiwayat(r, endemisMalaria) {
  const bagian = [`TB: ${r.tb_terduga ? 'terduga' : 'tidak ada gejala'}`]
  if (r.malaria_diskrining) {
    bagian.push(`malaria: ${r.malaria_hasil_tes ?? 'belum dites'}`)
  }
  return `${tglIndo(r.kunjungan?.tanggal_periksa)} (${bagian.join('; ')})`
}

export default function SkriningTBMalaria({ value, onChange, riwayat = [], endemisMalaria = false, disabled = false }) {
  const tb = nilaiTB(value.tb)
  const mal = nilaiMalaria(value)
  const terakhir = riwayat.length ? riwayat[riwayat.length - 1] : null
  const set = (k) => (v) => onChange({ ...value, [k]: v })
  const jawabTB = (kode, ya) => onChange({ ...value, tb: { ...value.tb, [kode]: ya } })
  const jawabMal = (kode, ya) => onChange({ ...value, malaria: { ...value.malaria, [kode]: ya } })

  return (
    <fieldset style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: 12, marginTop: 10, minWidth: 0 }}>
      <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>
        Skrining TB dan Malaria
      </legend>

      <div style={{ fontSize: 12, color: redup, marginBottom: 6 }}>
        {terakhir ? `Skrining terakhir: ${ringkasanRiwayat(terakhir, endemisMalaria)}.` : 'Belum ada skrining TB tercatat pada kehamilan ini.'}
      </div>

      {/* ---------- TB ---------- */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0 2px' }}>Gejala TB (semua ibu hamil)</div>
      <div style={{ fontSize: 12, color: redup, marginBottom: 4 }}>Tanyakan gejala yang dialami ibu saat ini.</div>
      <Daftar prefix="tb" butir={[...GEJALA_TB, KONTAK_TB]} nilai={value.tb} onJawab={jawabTB} disabled={disabled} />

      <div style={{ fontSize: 12, color: redup, margin: '6px 0 0' }}>
        Terjawab {tb.terjawab}/{tb.total}
      </div>

      {tb.terduga && (
        <Kotak warna={merah} latar="#fef3f2" alert>
          <div style={{ color: merah, fontWeight: 700, fontSize: 13 }}>⚠ Terduga TB (ada gejala)</div>
          <div style={{ marginTop: 4 }}>
            Ibu hamil dengan gejala TB perlu pemeriksaan lanjutan (TCM) dan penilaian dokter. Pilih tindak lanjut di bawah.
          </div>
          <Pilihan label="Tindak lanjut TB" wajib={TINDAK_LANJUT_TBM_WAJIB} opsi={TINDAK_LANJUT_TB} value={value.tb_tindak_lanjut} onChange={set('tb_tindak_lanjut')} disabled={disabled} />
        </Kotak>
      )}
      {tb.kontakSaja && (
        <Kotak warna="#d97706" latar="#fffbeb">
          Kontak erat dengan pasien TB tanpa gejala saat ini. Beri edukasi dan tanyakan gejala lagi pada kunjungan berikutnya.
        </Kotak>
      )}
      {tb.lengkap && !tb.terduga && !tb.kontakSaja && (
        <Kotak warna="#16a34a" latar="#f0fdf4">
          <span style={{ color: '#166534' }}>✓ Tidak ada gejala TB. Ulangi skrining pada kunjungan berikutnya.</span>
        </Kotak>
      )}

      {/* ---------- Malaria (hanya wilayah endemis) ---------- */}
      {(
        <>
          <div style={{ borderTop: '1px dashed var(--line, #e5e7eb)', margin: '14px 0 6px' }} />
          <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0 2px' }}>Malaria{endemisMalaria ? ' (wilayah endemis)' : ''}</div>
          <div style={{ fontSize: 12, color: redup, marginBottom: 4 }}>
            {endemisMalaria
              ? 'Wilayah Puskesmas ini endemis malaria: wajib diisi. Tanyakan gejala, lalu catat hasil tes.'
              : 'Wilayah ini bukan endemis, tetapi pasien bisa berasal dari daerah endemis. Isi bila ada gejala atau riwayat tinggal/bepergian ke daerah endemis; boleh dikosongkan bila tidak relevan.'}
          </div>
          <Daftar prefix="mal" butir={GEJALA_MALARIA} nilai={value.malaria} onJawab={jawabMal} disabled={disabled} />

          <Pilihan label="Hasil tes malaria" wajib={endemisMalaria && MALARIA_WAJIB_DIISI} opsi={HASIL_TES_MALARIA} value={value.malaria_hasil_tes} onChange={set('malaria_hasil_tes')} disabled={disabled} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '2px 12px', marginTop: 8 }}>
            <span style={{ fontSize: 13 }}>Ibu sudah memakai kelambu berinsektisida</span>
            <YaTidak nama="mal-kelambu" nilai={value.malaria_kelambu} onPilih={set('malaria_kelambu')} disabled={disabled} />
          </div>

          {mal.positif && (
            <Kotak warna={merah} latar="#fef3f2" alert>
              <div style={{ color: merah, fontWeight: 700, fontSize: 13 }}>⚠ Malaria positif ({value.malaria_hasil_tes})</div>
              <div style={{ marginTop: 4 }}>Pengobatan malaria pada kehamilan bergantung trimester dan ditentukan dokter. Pilih tindak lanjut.</div>
            </Kotak>
          )}
          {!mal.positif && mal.suspek && !mal.sudahTes && (
            <Kotak warna="#d97706" latar="#fffbeb" alert>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Suspek malaria (demam), tes belum dilakukan</div>
              <div style={{ marginTop: 4 }}>Lakukan RDT atau mikroskopis, atau rujuk untuk pemeriksaan. Pilih tindak lanjut.</div>
            </Kotak>
          )}
          {!mal.positif && mal.suspek && mal.sudahTes && (
            <Kotak warna="#16a34a" latar="#f0fdf4">
              <span style={{ color: '#166534' }}>Demam dengan hasil tes negatif. Pertimbangkan penyebab lain dan pantau.</span>
            </Kotak>
          )}
          {mal.perluTindak && (
            <Pilihan label="Tindak lanjut malaria" wajib={TINDAK_LANJUT_TBM_WAJIB} opsi={TINDAK_LANJUT_MALARIA} value={value.malaria_tindak_lanjut} onChange={set('malaria_tindak_lanjut')} disabled={disabled} />
          )}
        </>
      )}

      {(tb.terduga || mal.perluTindak) && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, marginTop: 10, fontSize: 12 }}>
          Catatan (hasil TCM, tujuan rujukan, dll.)
          <input style={input} disabled={disabled} value={value.catatan} onChange={(e) => onChange({ ...value, catatan: e.target.value })} />
        </label>
      )}
    </fieldset>
  )
}

// satu baris grid (2 kolom): dipakai supaya tiap butir punya key sendiri
function Pasangan({ children }) {
  return <>{children}</>
}