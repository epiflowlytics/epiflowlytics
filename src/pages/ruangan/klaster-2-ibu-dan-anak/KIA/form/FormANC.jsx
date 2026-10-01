import { useEffect, useRef } from 'react'

// FormANC — form pemeriksaan kehamilan (Antenatal Care) untuk Poli KIA.
// Komponen "controlled": data disimpan di DashboardKIA, form ini hanya menampilkan
// dan mengubah lewat props.
//
// Dua bagian data:
//   1. `kehamilan`  -> tabel `kehamilan` (bagian atas Kartu Ibu, diisi sekali, satu baris per kehamilan)
//   2. `value`      -> tabel `pemeriksaan_anc` (pemeriksaan tiap kunjungan)
//
// Yang dihitung otomatis: HPL (HPHT + 280 hari, rumus Naegele), usia kehamilan, kenaikan BB.

const LETAK = ['', 'KEP', 'SU', 'LI']
const LETAK_LABEL = { '': 'Belum ditentukan', KEP: 'KEP (kepala)', SU: 'SU (sungsang)', LI: 'LI (lintang)' }
const HASIL_LAB = ['Belum diperiksa', 'Non-reaktif', 'Reaktif']
const PROTEIN_URIN = ['Belum diperiksa', 'Negatif', '+1', '+2', '+3', '+4']
const GOL_DARAH = ['', 'A', 'B', 'AB', 'O']
const STATUS_TT = ['', 'T0', 'T1', 'T2', 'T3', 'T4', 'T5']
const RISIKO = ['Kehamilan risiko rendah', 'Kehamilan risiko tinggi', 'Kehamilan risiko sangat tinggi']
const STATUS_KEHAMILAN = ['aktif', 'selesai', 'keguguran']

// Ambang penanda BB (silakan sesuaikan dengan pedoman Puskesmas):
//  - "naik terlalu cepat": kenaikan > 1 kg per minggu di antara dua kunjungan
//  - "tidak naik": BB sama/turun, hanya dinilai mulai usia kehamilan 14 minggu
//    (di trimester 1 BB memang sering belum naik)
export const BATAS_NAIK_CEPAT_KG_PER_MINGGU = 1
export const MINGGU_MULAI_PANTAU_BB = 14

// Saran isian (datalist) — tetap bisa diketik bebas
const SARAN = {
  pendidikan: ['Tidak sekolah', 'SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2'],
  penolong: ['Dokter', 'Bidan', 'Dukun terlatih', 'Lainnya'],
  cara: ['Normal / spontan', 'Sectio caesarea', 'Vakum', 'Forceps'],
  kb: ['Tidak ada', 'Pil', 'Suntik', 'Implan', 'IUD', 'Kondom', 'MOW', 'MOP'],
  tempat: ['Puskesmas', 'Poskesdes / Polindes', 'Klinik', 'Rumah sakit', 'Rumah'],
}

// ---- state awal ----
export const emptyKehamilan = {
  id: null,
  status: 'aktif',
  no_register: '',
  kohor: '',
  posyandu: '',
  suami_nama: '',
  suami_tanggal_lahir: '',
  suami_nik: '',
  no_hp: '',
  no_kk: '',
  suami_pekerjaan: '',
  suami_pendidikan: '',
  tinggi_badan_cm: '',
  bb_sebelum_hamil: '',
  hpht: '',
  gravida: '',
  para: '',
  abortus: '',
  jumlah_anak_hidup: '',
  jumlah_anak_mati: '',
  jarak_persalinan_terakhir: '',
  penolong_persalinan_terakhir: '',
  cara_persalinan_terakhir: '',
  kb_sebelum_hamil: '',
  rencana_tanggal: '',
  rencana_penolong: '',
  rencana_tempat: '',
  rencana_pendamping: '',
  rencana_transportasi: '',
  rencana_pendonor: '',
}

export const emptyANC = {
  kunjungan_ke: '', // hanya untuk tampilan; dihitung otomatis oleh database
  jenis_kontak: '', // K1-K6, dihitung otomatis oleh database
  kontak_dokter: false, // diisi petugas; syarat K6
  keluhan: '',
  tfu_cm: '',
  djj: '',
  presentasi: '',
  lila_cm: '',
  edema: false,
  pemeriksaan_khusus: '',
  hb: '',
  golongan_darah: '',
  protein_urin: PROTEIN_URIN[0],
  gula_darah: '',
  hiv: HASIL_LAB[0],
  sifilis: HASIL_LAB[0],
  hepatitis_b: HASIL_LAB[0],
  jumlah_ttd: '',
  status_tt: '',
  konseling: '',
  klasifikasi_risiko: RISIKO[0],
  faktor_risiko: '',
}

// baris database -> state form (null jadi string kosong)
export function kehamilanDariRow(row) {
  return Object.fromEntries(Object.keys(emptyKehamilan).map((k) => [k, row[k] ?? emptyKehamilan[k]]))
}
export function ancDariRow(row) {
  return Object.fromEntries(Object.keys(emptyANC).map((k) => [k, row[k] ?? emptyANC[k]]))
}

// ---- helper tanggal (pakai tanggal lokal supaya tidak geser sehari karena zona waktu) ----
function parseTanggal(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatTanggal(d) {
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

// 'YYYY-MM-DD' -> 'DD-MM-YYYY'
export function tglIndo(s) {
  if (!s) return ''
  const [y, m, d] = String(s).slice(0, 10).split('-')
  return `${d}-${m}-${y}`
}

function selisihHari(a, b) {
  const da = parseTanggal(a)
  const db = parseTanggal(b)
  if (!da || !db) return null
  return Math.round((db - da) / 86400000)
}

export function hitungHPL(hpht) {
  const d = parseTanggal(hpht)
  if (!d) return ''
  d.setDate(d.getDate() + 280)
  return formatTanggal(d)
}

export function hitungUsia(hpht) {
  const d = parseTanggal(hpht)
  if (!d) return null
  const now = new Date()
  const hariIni = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hari = Math.round((hariIni - d) / 86400000)
  if (hari < 0) return { minggu: 0, hari: 0, valid: false }
  return { minggu: Math.floor(hari / 7), hari: hari % 7, valid: hari <= 44 * 7 }
}

function mingguPada(hpht, tanggal) {
  const hari = selisihHari(hpht, tanggal)
  return hari === null || hari < 0 ? null : Math.floor(hari / 7)
}

// ---- helper angka/teks ----
export function toNum(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const round1 = (n) => Math.round(n * 10) / 10
const txt = (v) => {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim()
  return v
}

// ---- BB berjenjang ----
// titik: [{ tanggal: 'YYYY-MM-DD', bb: number }] urut dari yang terlama.
// Hasil: tiap titik + delta (dari titik sebelumnya), naikTotal (dari BB sebelum hamil), penanda[].
export function analisisBB(bbSebelum, titik, hpht) {
  return titik.map((t, i) => {
    const prev = i > 0 ? titik[i - 1] : null
    const delta = prev ? round1(t.bb - prev.bb) : null
    const naikTotal = bbSebelum !== null && bbSebelum !== undefined ? round1(t.bb - bbSebelum) : null
    const penanda = []
    if (prev) {
      const hari = selisihHari(prev.tanggal, t.tanggal)
      if (hari !== null && hari >= 7) {
        const uk = mingguPada(hpht, t.tanggal)
        if (delta <= 0 && uk !== null && uk >= MINGGU_MULAI_PANTAU_BB) penanda.push('BB tidak naik')
        if (delta / (hari / 7) > BATAS_NAIK_CEPAT_KG_PER_MINGGU) penanda.push('Naik terlalu cepat')
      }
    }
    return { ...t, delta, naikTotal, penanda }
  })
}

// ---- state form -> baris siap simpan ----
const KOLOM_ANGKA_KEHAMILAN = [
  'tinggi_badan_cm',
  'bb_sebelum_hamil',
  'gravida',
  'para',
  'abortus',
  'jumlah_anak_hidup',
  'jumlah_anak_mati',
]
const KOLOM_TEKS_KEHAMILAN = [
  'no_register',
  'kohor',
  'posyandu',
  'suami_nama',
  'suami_tanggal_lahir',
  'suami_nik',
  'no_hp',
  'no_kk',
  'suami_pekerjaan',
  'suami_pendidikan',
  'hpht',
  'jarak_persalinan_terakhir',
  'penolong_persalinan_terakhir',
  'cara_persalinan_terakhir',
  'kb_sebelum_hamil',
  'rencana_tanggal',
  'rencana_penolong',
  'rencana_tempat',
  'rencana_pendamping',
  'rencana_transportasi',
  'rencana_pendonor',
]

// Untuk tabel `kehamilan` (pasien_id dan instansi_id ditambahkan di DashboardKIA saat insert).
// `pasien` (opsional): kalau No. Hp / No. KK sama persis dengan data rekam medis, tidak disimpan di kehamilan
// (null) supaya tetap mengikuti rekam medis. Kalau petugas mengubahnya, nilai baru disimpan di kehamilan.
export function siapkanDataKehamilan(k, pasien = null) {
  const data = { status: k.status || 'aktif', hpl: txt(hitungHPL(k.hpht)) }
  KOLOM_ANGKA_KEHAMILAN.forEach((c) => (data[c] = toNum(k[c])))
  KOLOM_TEKS_KEHAMILAN.forEach((c) => (data[c] = txt(k[c])))
  if (pasien) {
    const sama = (a, b) => String(a ?? '').trim() === String(b ?? '').trim()
    if (sama(data.no_hp, pasien.no_telepon)) data.no_hp = null
    if (sama(data.no_kk, pasien.no_kk)) data.no_kk = null
  }
  return data
}

// Nilai yang tampil: isian petugas (kehamilan) diutamakan, kalau kosong pakai data rekam medis.
export const hpEfektif = (k, p) => (kosongAwal(k?.no_hp) ? p?.no_telepon ?? '' : k.no_hp)
export const kkEfektif = (k, p) => (kosongAwal(k?.no_kk) ? p?.no_kk ?? '' : k.no_kk)
function kosongAwal(v) {
  return v === '' || v === null || v === undefined
}

// Untuk tabel `pemeriksaan_anc`. HPHT diambil dari kehamilan (dipakai menghitung usia kehamilan).
export function siapkanDataANC(a, hpht) {
  const usia = hitungUsia(hpht)
  return {
    usia_kehamilan_minggu: usia ? usia.minggu : null,
    // kunjungan_ke, jenis_kontak, trimester, k1_murni sengaja tidak dikirim: dihitung otomatis oleh database
    kontak_dokter: !!a.kontak_dokter,
    keluhan: txt(a.keluhan),
    tfu_cm: toNum(a.tfu_cm),
    djj: toNum(a.djj),
    presentasi: txt(a.presentasi),
    lila_cm: toNum(a.lila_cm),
    edema: !!a.edema,
    pemeriksaan_khusus: txt(a.pemeriksaan_khusus),
    hb: toNum(a.hb),
    golongan_darah: txt(a.golongan_darah),
    protein_urin: txt(a.protein_urin),
    gula_darah: toNum(a.gula_darah),
    hiv: txt(a.hiv),
    sifilis: txt(a.sifilis),
    hepatitis_b: txt(a.hepatitis_b),
    jumlah_ttd: toNum(a.jumlah_ttd),
    status_tt: txt(a.status_tt),
    konseling: txt(a.konseling),
    klasifikasi_risiko: txt(a.klasifikasi_risiko),
    faktor_risiko: txt(a.faktor_risiko),
  }
}

// ---- ringkasan baris kunjungan (dipakai form ini dan Kartu Ibu) ----
export const pertama = (x) => (Array.isArray(x) ? x[0] : x)
const kosong = (v) => v === '' || v === null || v === undefined
const sudahDiperiksa = (v) => !!v && v !== 'Belum diperiksa'

// 'YYYY-MM-DD' -> 'DD/MM/YY'
export function tglPendek(s) {
  if (!s) return ''
  const [y, m, d] = String(s).slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function ringkasLab(r) {
  return [
    !kosong(r.hb) && `Hb ${r.hb}`,
    sudahDiperiksa(r.protein_urin) && `Prot.urin ${r.protein_urin}`,
    !kosong(r.gula_darah) && `GDS ${r.gula_darah}`,
    sudahDiperiksa(r.hiv) && `HIV ${r.hiv}`,
    sudahDiperiksa(r.sifilis) && `Sifilis ${r.sifilis}`,
    sudahDiperiksa(r.hepatitis_b) && `HBsAg ${r.hepatitis_b}`,
  ]
    .filter(Boolean)
    .join('; ')
}

export function ringkasTindakan(r) {
  return [r.status_tt && `TT: ${r.status_tt}`, !kosong(r.jumlah_ttd) && `FE: ${r.jumlah_ttd} btr`, r.konseling]
    .filter(Boolean)
    .join('; ')
}

// ---- tampilan (meniru Kartu Ibu kertas) ----
const GARIS = '1px solid #000'
const kertas = { background: '#fff', color: '#000', padding: 0, fontSize: 12, lineHeight: 1.4 }
const kotak = { border: GARIS, padding: '4px 8px' }
const fIn = {
  fontSize: 12,
  padding: '3px 5px',
  border: '1px solid #cbd5e1',
  borderRadius: 4,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  background: '#fff',
}
const mini = { ...fIn, fontSize: 11, padding: '1px 3px' }
const nilaiRO = { display: 'block', fontWeight: 600, background: '#f8fafb', padding: '3px 5px', borderRadius: 4, minHeight: 22, boxSizing: 'border-box' }
const th = { border: GARIS, padding: '3px 4px', fontSize: 10, fontWeight: 600, textAlign: 'center', verticalAlign: 'middle' }
const td = { border: GARIS, padding: '3px 4px', verticalAlign: 'top', fontSize: 11, wordBreak: 'break-word' }
const tdTengah = { ...td, textAlign: 'center' }
const kecil = { fontSize: 9 }
const merah = { color: 'var(--danger, #b42318)', fontWeight: 700 }

function Baris({ l, w = 120, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '2px 0' }}>
      <span style={{ flex: `0 0 ${w}px` }}>{l}</span>
      <span>:</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function Nilai({ v }) {
  return <span style={nilaiRO}>{kosong(v) ? '' : v}</span>
}

function In({ nilai, onUbah, tipe = 'text', saran, id, ...sisa }) {
  return (
    <>
      <input style={fIn} type={tipe} value={nilai} onChange={onUbah} list={saran ? id : undefined} {...sisa} />
      {saran && (
        <datalist id={id}>
          {saran.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      )}
    </>
  )
}

function SelBB({ a }) {
  if (!a) return null
  return (
    <>
      {a.bb}
      {a.delta !== null && (
        <div style={kecil}>
          ({a.delta > 0 ? '+' : ''}
          {a.delta})
        </div>
      )}
      {a.penanda.length > 0 && <div style={{ ...kecil, ...merah }}>{a.penanda.join(', ')}</div>}
    </>
  )
}

export default function FormANC({
  kehamilan,
  onKehamilan,
  value,
  onChange,
  kunjunganLalu = [], // baris pemeriksaan_anc kunjungan sebelumnya (+ kunjungan & skrining), urut tanggal
  skrining = {}, // Tanda Vital kunjungan ini (TD, BB) dari DashboardKIA
  pasien = {},
  instansi = null,
  paraf = '',
  disentuhRef = null, // dari DashboardKIA; kalau tidak ada, dicatat di dalam komponen ini saja
}) {
  const disentuhLokal = useRef({})
  const disentuh = disentuhRef ?? disentuhLokal // kolom yang sudah diubah petugas (tidak diisi ulang otomatis)
  const setK = (k) => (e) => {
    disentuh.current[k] = true
    onKehamilan({ ...kehamilan, [k]: e.target.value })
  }
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  const setCek = (k) => (e) => onChange({ ...value, [k]: e.target.checked })

  // Ganti pasien -> semua kolom boleh diisi otomatis lagi (kalau dicatat di DashboardKIA, direset di sana).
  useEffect(() => {
    if (!disentuhRef) disentuhLokal.current = {}
  }, [pasien?.id])

  // Isi awal dari rekam medis: No. Hp, No. KK, dan data suami (pasien satu No. KK yang berstatus ayah).
  // Berjalan setiap render supaya tidak hilang kalau data kehamilan dimuat belakangan; hanya mengisi kolom
  // yang masih kosong dan belum pernah disentuh petugas, jadi kolom yang sengaja dikosongkan tidak diisi ulang.
  useEffect(() => {
    if (!pasien?.id) return
    const s = pasien.suami_rm
    const sumber = {
      no_hp: pasien.no_telepon,
      no_kk: pasien.no_kk,
      suami_nik: s?.no_nik,
      suami_nama: s?.nama_lengkap,
      suami_tanggal_lahir: s?.tanggal_lahir,
      suami_pekerjaan: s?.pekerjaan,
      suami_pendidikan: s?.pendidikan,
    }
    const isian = {}
    Object.entries(sumber).forEach(([c, v]) => {
      if (!kosong(v) && kosong(kehamilan[c]) && !disentuh.current[c]) isian[c] = v
    })
    if (Object.keys(isian).length) onKehamilan({ ...kehamilan, ...isian })
  })

  const hpl = hitungHPL(kehamilan.hpht)
  const usia = hitungUsia(kehamilan.hpht)
  const tersimpan = !!kehamilan.id
  const hariIniStr = formatTanggal(new Date())

  // ---- riwayat kunjungan + BB berjenjang ----
  const lalu = kunjunganLalu.map((r) => {
    const sk = pertama(r.kunjungan?.skrining)
    return { r, sk, tanggal: r.kunjungan?.tanggal_periksa ?? '', bb: toNum(sk?.berat_badan) }
  })
  const bbSebelum = toNum(kehamilan.bb_sebelum_hamil)
  const tb = toNum(kehamilan.tinggi_badan_cm)
  const bbNow = toNum(skrining.berat_badan)
  const titik = lalu.filter((d) => d.tanggal && d.bb !== null).map((d) => ({ tanggal: d.tanggal, bb: d.bb }))
  if (bbNow !== null) titik.push({ tanggal: hariIniStr, bb: bbNow })
  const analisis = analisisBB(bbSebelum, titik, kehamilan.hpht)
  const analisisPer = Object.fromEntries(analisis.map((a) => [a.tanggal, a]))
  const akhir = analisis.length ? analisis[analisis.length - 1] : null
  const imt = bbSebelum && tb ? bbSebelum / Math.pow(tb / 100, 2) : null

  // Nomor kunjungan & jenis kontak (K1-K6) dihitung database. Sebelum tersimpan, tampilkan perkiraan.
  const sudahTerhitung = !kosong(value.kunjungan_ke)
  const urutanKe = sudahTerhitung ? Number(value.kunjungan_ke) : lalu.length + 1
  const labelK = sudahTerhitung ? value.jenis_kontak || '' : urutanKe >= 1 && urutanKe <= 6 ? `K${urutanKe}` : ''

  const keluhanAwal = lalu.find((d) => d.r.keluhan)?.r.keluhan || value.keluhan
  const golDarah =
    pasien.golongan_darah || value.golongan_darah || [...lalu].reverse().find((d) => d.r.golongan_darah)?.r.golongan_darah || ''

  const ringkas = tersimpan && kehamilan.hpht ? ` — HPHT ${tglIndo(kehamilan.hpht)}, HPL ${tglIndo(hpl)}` : ''
  const gabung = (a, b, pemisah = ' / ') => [a, b].filter((x) => !kosong(x)).join(pemisah)

  const pilih = (sumber, setter, k, daftar, labels = {}, gaya = fIn) => (
    <select style={gaya} value={sumber[k]} onChange={setter(k)}>
      {daftar.map((o) => (
        <option key={o} value={o}>
          {labels[o] ?? (o || '—')}
        </option>
      ))}
    </select>
  )

  return (
    <div style={{ ...kertas, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ===== bagian atas Kartu Ibu ===== */}
      <details key={kehamilan.id || 'baru'} open={!tersimpan} style={{ border: GARIS, padding: 10 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          {tersimpan ? `KARTU IBU — sudah terisi${ringkas}` : 'KARTU IBU — kehamilan baru, isi sekali di kunjungan pertama'}
        </summary>

        {/* kop */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '2px solid #000', paddingBottom: 6, marginTop: 10 }}>
          <div style={{ width: 64, flex: '0 0 64px' }}>
            {instansi?.logo_url && <img src={instansi.logo_url} alt="" style={{ height: 54, width: 'auto', maxWidth: 64 }} />}
          </div>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, lineHeight: 1.4, textTransform: 'uppercase', fontSize: 11 }}>
            {instansi?.nama_pemerintah && <div>{instansi.nama_pemerintah}</div>}
            {instansi?.nama_dinas && <div>{instansi.nama_dinas}</div>}
            <div>{instansi?.nama ?? 'PUSKESMAS'}</div>
            {instansi?.alamat && <div style={{ fontSize: 10, textTransform: 'none' }}>{instansi.alamat}</div>}
            {instansi?.email && <div style={{ fontSize: 10, textTransform: 'none' }}>Email : {instansi.email}</div>}
          </div>
          <div style={{ width: 64, flex: '0 0 64px' }} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, margin: '10px 0' }}>KARTU IBU</div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
          Kotak abu-abu hanya dibaca dari data pasien. Kotak putih diisi petugas; No. Hp, No. KK, dan data suami terisi otomatis dari rekam medis bila ada, tetapi tetap bisa diubah.
        </div>

        {/* identitas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, marginBottom: 6 }}>
          <div>
            <Baris l="Nomor RM" w={80}>
              <Nilai v={pasien.no_rekam_medis} />
            </Baris>
            <Baris l="No Register" w={80}>
              <In id="dl-reg" nilai={kehamilan.no_register} onUbah={setK('no_register')} />
            </Baris>
            <div style={{ display: 'flex', gap: 6 }}>
              <b style={{ width: 80, flex: '0 0 80px', paddingTop: 4 }}>Identitas</b>
              <div style={{ flex: 1 }}>
                <Baris l="NIK Istri" w={62}>
                  <Nilai v={pasien.no_nik} />
                </Baris>
                <Baris l="NIK Suami" w={62}>
                  <In id="dl-nik" inputMode="numeric" maxLength={16} nilai={kehamilan.suami_nik} onUbah={setK('suami_nik')} />
                </Baris>
              </div>
            </div>
          </div>
          <div>
            <Baris l="No. Hp" w={70}>
              <In id="dl-hp" inputMode="tel" nilai={kehamilan.no_hp} onUbah={setK('no_hp')} />
            </Baris>
            <Baris l="Kohor" w={70}>
              <In id="dl-kohor" nilai={kehamilan.kohor} onUbah={setK('kohor')} />
            </Baris>
            <Baris l="No. KK" w={70}>
              <In id="dl-kk" inputMode="numeric" maxLength={16} nilai={kehamilan.no_kk} onUbah={setK('no_kk')} />
            </Baris>
          </div>
        </div>

        <div style={{ ...kotak, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16 }}>
          <div>
            <Baris l="Nama Ibu/ Tgl Lahir" w={128}>
              <Nilai v={gabung(pasien.nama_lengkap, tglIndo(pasien.tanggal_lahir))} />
            </Baris>
            <Baris l="Nama Suami/ Tgl Lahir" w={128}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 4 }}>
                <In id="dl-sn" placeholder="Nama suami" nilai={kehamilan.suami_nama} onUbah={setK('suami_nama')} />
                <In id="dl-st" tipe="date" nilai={kehamilan.suami_tanggal_lahir} onUbah={setK('suami_tanggal_lahir')} />
              </div>
            </Baris>
            <Baris l="Alamat / HP" w={128}>
              <Nilai v={gabung(pasien.alamat, kehamilan.no_hp || pasien.no_telepon)} />
            </Baris>
            <Baris l="Kelurahan" w={128}>
              <Nilai v={pasien.kelurahan} />
            </Baris>
            <Baris l="Puskesmas" w={128}>
              <Nilai v={instansi?.nama} />
            </Baris>
          </div>
          <div>
            <Baris l="Pekerjaan / Pendidikan" w={122}>
              <Nilai v={gabung(pasien.pekerjaan, pasien.pendidikan)} />
            </Baris>
            <Baris l="Pekerjaan / Pendidikan" w={122}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <In id="dl-sp" placeholder="Pekerjaan suami" nilai={kehamilan.suami_pekerjaan} onUbah={setK('suami_pekerjaan')} />
                <In id="dl-spd" placeholder="Pendidikan suami" saran={SARAN.pendidikan} nilai={kehamilan.suami_pendidikan} onUbah={setK('suami_pendidikan')} />
              </div>
            </Baris>
            <Baris l="Posyandu" w={122}>
              <In id="dl-pos" nilai={kehamilan.posyandu} onUbah={setK('posyandu')} />
            </Baris>
            <Baris l="Jaminan/ BPJS" w={122}>
              <Nilai v={gabung(pasien.kategori_pasien, pasien.no_bpjs)} />
            </Baris>
            <Baris l="GOL. Darah" w={122}>
              <Nilai v={golDarah} />
            </Baris>
          </div>
        </div>

        <div style={{ ...kotak, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: 16, marginTop: 6 }}>
          <Baris l="Tinggi Badan" w={80}>
            <In id="dl-tb" tipe="number" step="0.1" min="0" placeholder="cm" nilai={kehamilan.tinggi_badan_cm} onUbah={setK('tinggi_badan_cm')} />
          </Baris>
          <Baris l="Lila" w={30}>
            <In id="dl-lila" tipe="number" step="0.1" min="0" placeholder="cm (kunjungan ini)" nilai={value.lila_cm} onUbah={set('lila_cm')} />
          </Baris>
          <Baris l="BB Sebelum Hamil" w={100}>
            <In id="dl-bbs" tipe="number" step="0.1" min="0" placeholder="kg" nilai={kehamilan.bb_sebelum_hamil} onUbah={setK('bb_sebelum_hamil')} />
          </Baris>
        </div>

        {/* pengamatan kehamilan / anamnesa */}
        <div style={{ fontWeight: 700, margin: '12px 0 4px' }}>PENGAMATAN KEHAMILAN/ ANAMNESA</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <div>
            <div style={kotak}>
              <div>1. Fungsi Reproduksi</div>
              <div style={{ paddingLeft: 14 }}>
                <Baris l="HPHT *" w={44}>
                  <In id="dl-hpht" tipe="date" nilai={kehamilan.hpht} onUbah={setK('hpht')} />
                </Baris>
                <Baris l="HTP" w={44}>
                  <Nilai v={tglIndo(hpl)} />
                </Baris>
                {usia && (
                  <div style={{ fontSize: 11, color: usia.valid ? '#6b7280' : 'var(--danger, #b42318)', marginLeft: 52 }}>
                    {usia.valid
                      ? `Usia kehamilan ${usia.minggu} minggu ${usia.hari} hari`
                      : 'HPHT tidak wajar (di masa depan atau lebih dari 44 minggu). Periksa kembali tanggalnya.'}
                  </div>
                )}
              </div>
              <div>2. Kehamilan Sekarang</div>
              <div style={{ paddingLeft: 14 }}>
                <Baris l="Keluhan" w={44}>
                  <Nilai v={keluhanAwal} />
                </Baris>
              </div>
            </div>
            <div style={{ border: GARIS, borderTop: 'none', padding: '4px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>Rencana Persalinan</div>
              <Baris l="Tanggal" w={62}>
                <In id="dl-rt" tipe="date" nilai={kehamilan.rencana_tanggal} onUbah={setK('rencana_tanggal')} />
              </Baris>
              <Baris l="Penolong" w={62}>
                <In id="dl-rp" saran={SARAN.penolong} nilai={kehamilan.rencana_penolong} onUbah={setK('rencana_penolong')} />
              </Baris>
              <Baris l="Tempat" w={62}>
                <In id="dl-rtp" saran={SARAN.tempat} nilai={kehamilan.rencana_tempat} onUbah={setK('rencana_tempat')} />
              </Baris>
              <Baris l="Pendamping" w={62}>
                <In id="dl-rpd" nilai={kehamilan.rencana_pendamping} onUbah={setK('rencana_pendamping')} />
              </Baris>
              <Baris l="Transportasi" w={62}>
                <In id="dl-rtr" nilai={kehamilan.rencana_transportasi} onUbah={setK('rencana_transportasi')} />
              </Baris>
              <Baris l="Pendonor" w={62}>
                <In id="dl-rpn" nilai={kehamilan.rencana_pendonor} onUbah={setK('rencana_pendonor')} />
              </Baris>
            </div>
          </div>

          <div style={kotak}>
            <div>3. Riwayat Observasi</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 2px 24px' }}>
              <span>G</span>
              <div style={{ width: 56 }}>
                <In id="dl-g" tipe="number" min="0" nilai={kehamilan.gravida} onUbah={setK('gravida')} />
              </div>
              <span style={{ marginLeft: 8 }}>P</span>
              <div style={{ width: 56 }}>
                <In id="dl-p" tipe="number" min="0" nilai={kehamilan.para} onUbah={setK('para')} />
              </div>
              <span style={{ marginLeft: 8 }}>A</span>
              <div style={{ width: 56 }}>
                <In id="dl-a" tipe="number" min="0" nilai={kehamilan.abortus} onUbah={setK('abortus')} />
              </div>
            </div>
            <Baris l="Jumlah Anak Hidup" w={150}>
              <In id="dl-ah" tipe="number" min="0" nilai={kehamilan.jumlah_anak_hidup} onUbah={setK('jumlah_anak_hidup')} />
            </Baris>
            <Baris l="Jumlah Anak Mati" w={150}>
              <In id="dl-am" tipe="number" min="0" nilai={kehamilan.jumlah_anak_mati} onUbah={setK('jumlah_anak_mati')} />
            </Baris>
            <Baris l="Jarak Persalinan Terakhir" w={150}>
              <In id="dl-jp" placeholder="mis. 2 tahun" nilai={kehamilan.jarak_persalinan_terakhir} onUbah={setK('jarak_persalinan_terakhir')} />
            </Baris>
            <Baris l="Penolong Persalinan Terakhir" w={150}>
              <In id="dl-pt" saran={SARAN.penolong} nilai={kehamilan.penolong_persalinan_terakhir} onUbah={setK('penolong_persalinan_terakhir')} />
            </Baris>
            <Baris l="Cara Persalinan Terakhir" w={150}>
              <In id="dl-ct" saran={SARAN.cara} placeholder="Normal/SC/Vacum/..." nilai={kehamilan.cara_persalinan_terakhir} onUbah={setK('cara_persalinan_terakhir')} />
            </Baris>
            <Baris l="Penggunaan KB sebelum kehamilan" w={150}>
              <In id="dl-kb" saran={SARAN.kb} nilai={kehamilan.kb_sebelum_hamil} onUbah={setK('kb_sebelum_hamil')} />
            </Baris>
            {tersimpan && (
              <Baris l="Status kehamilan" w={150}>
                {pilih(kehamilan, setK, 'status', STATUS_KEHAMILAN)}
              </Baris>
            )}
          </div>
        </div>
      </details>

      {/* ===== tabel kunjungan ===== */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1080, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            {[64, 130, 58, 66, 62, 60, 76, 62, 150, 110, 170, 84].map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ height: 42 }}>
              <th style={th}>TGL</th>
              <th style={th}>KELUHAN SEKARANG</th>
              <th style={th}>Tekanan Darah (mmHg)</th>
              <th style={th}>BB (KG)</th>
              <th style={th}>UMUR KEHAMILAN (MINGGU)</th>
              <th style={th}>TINGGI FUNDUS (CM)</th>
              <th style={th}>LETAK KEPALA KEP/SU/LI</th>
              <th style={th}>DENYUT JANTUNG JANIN</th>
              <th style={th}>LAB</th>
              <th style={th}>PEMERIKSAAN KHUSUS</th>
              <th style={th}>TINDAKAN DAN TERAPI (TT,FE,RUJUKAN)</th>
              <th style={th}>PARAF</th>
            </tr>
          </thead>
          <tbody>
            {/* kunjungan sebelumnya (hanya baca) */}
            {lalu.map(({ r, sk, tanggal }) => (
              <tr key={r.id}>
                <td style={td}>{tglPendek(tanggal)}</td>
                <td style={td}>{r.keluhan}</td>
                <td style={tdTengah}>{sk?.tekanan_darah}</td>
                <td style={tdTengah}>
                  <SelBB a={analisisPer[tanggal]} />
                </td>
                <td style={tdTengah}>{r.usia_kehamilan_minggu}</td>
                <td style={tdTengah}>{r.tfu_cm}</td>
                <td style={tdTengah}>{r.presentasi}</td>
                <td style={tdTengah}>{r.djj}</td>
                <td style={td}>{ringkasLab(r)}</td>
                <td style={td}>{r.pemeriksaan_khusus}</td>
                <td style={td}>{ringkasTindakan(r)}</td>
                <td style={td}>{r.kunjungan?.paraf}</td>
              </tr>
            ))}

            {/* kunjungan ini (diisi) */}
            <tr style={{ background: '#f0fdf9' }}>
              <td style={td}>{tglPendek(hariIniStr)}</td>
              <td style={td}>
                <textarea style={{ ...mini, minHeight: 78, resize: 'vertical' }} value={value.keluhan} onChange={set('keluhan')} />
              </td>
              <td style={tdTengah}>{skrining.tekanan_darah || <span style={{ color: '#9ca3af' }}>—</span>}</td>
              <td style={tdTengah}>
                {bbNow !== null ? <SelBB a={analisisPer[hariIniStr]} /> : <span style={{ color: '#9ca3af' }}>—</span>}
              </td>
              <td style={tdTengah}>{usia ? usia.minggu : ''}</td>
              <td style={td}>
                <input style={mini} type="number" step="0.1" min="0" value={value.tfu_cm} onChange={set('tfu_cm')} />
              </td>
              <td style={td}>{pilih(value, set, 'presentasi', LETAK, LETAK_LABEL, mini)}</td>
              <td style={td}>
                <input style={mini} type="number" min="0" value={value.djj} onChange={set('djj')} />
              </td>
              <td style={td}>
                <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: '3px 4px', alignItems: 'center', fontSize: 10 }}>
                  <span>Hb</span>
                  <input style={mini} type="number" step="0.1" min="0" value={value.hb} onChange={set('hb')} />
                  <span>Prot.urin</span>
                  {pilih(value, set, 'protein_urin', PROTEIN_URIN, {}, mini)}
                  <span>GDS</span>
                  <input style={mini} type="number" min="0" value={value.gula_darah} onChange={set('gula_darah')} />
                  <span>HIV</span>
                  {pilih(value, set, 'hiv', HASIL_LAB, {}, mini)}
                  <span>Sifilis</span>
                  {pilih(value, set, 'sifilis', HASIL_LAB, {}, mini)}
                  <span>HBsAg</span>
                  {pilih(value, set, 'hepatitis_b', HASIL_LAB, {}, mini)}
                </div>
              </td>
              <td style={td}>
                <textarea style={{ ...mini, minHeight: 78, resize: 'vertical' }} value={value.pemeriksaan_khusus} onChange={set('pemeriksaan_khusus')} />
              </td>
              <td style={td}>
                <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: '3px 4px', alignItems: 'center', fontSize: 10 }}>
                  <span>TT</span>
                  {pilih(value, set, 'status_tt', STATUS_TT, {}, mini)}
                  <span>FE</span>
                  <input style={mini} type="number" min="0" placeholder="butir" value={value.jumlah_ttd} onChange={set('jumlah_ttd')} />
                </div>
                <textarea
                  style={{ ...mini, minHeight: 44, resize: 'vertical', marginTop: 4 }}
                  placeholder="Konseling / tindakan / rujukan"
                  value={value.konseling}
                  onChange={set('konseling')}
                />
              </td>
              <td style={td}>{paraf}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: -4 }}>
        Tekanan darah dan BB kunjungan ini diambil dari Tanda Vital di atas. Paraf terisi otomatis dengan nama petugas yang login.
        {akhir && akhir.naikTotal !== null && (
          <>
            {' '}
            · BB naik {akhir.naikTotal > 0 ? '+' : ''}
            {akhir.naikTotal} kg dari sebelum hamil{imt !== null ? ` (IMT sebelum hamil ${round1(imt)})` : ''}.
          </>
        )}
      </div>

      {/* ===== tambahan di luar kartu kertas ===== */}
      <div style={{ border: '1px dashed #9ca3af', padding: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: '#6b7280' }}>Tambahan (tidak ada di kartu kertas)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 20px', marginBottom: 12, fontSize: 14 }}>
          <div>
            Kunjungan ANC ke-<b>{urutanKe}</b>
            {labelK ? (
              <>
                {' '}
                (<b>{labelK}</b>)
              </>
            ) : (
              ' (di atas K6, tanpa label K)'
            )}
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {sudahTerhitung ? 'Dihitung otomatis dari urutan tanggal periksa.' : 'Perkiraan. Nomor pastinya ditetapkan otomatis saat disimpan.'}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, minHeight: 44, cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 22, height: 22, flex: '0 0 22px' }}
              checked={!!value.kontak_dokter}
              onChange={setCek('kontak_dokter')}
            />
            Kontak dokter (syarat K6)
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1.4fr 1.4fr', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, paddingBottom: 6 }}>
            <input type="checkbox" checked={value.edema} onChange={setCek('edema')} />
            Ada edema
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
            Golongan darah
            {pilih(value, set, 'golongan_darah', GOL_DARAH)}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
            Klasifikasi risiko
            {pilih(value, set, 'klasifikasi_risiko', RISIKO)}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
            Faktor risiko / keterangan
            <input style={fIn} value={value.faktor_risiko} onChange={set('faktor_risiko')} />
          </label>
        </div>
      </div>
    </div>
  )
}