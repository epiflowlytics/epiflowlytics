import { tglIndo } from './FormANC'

// SkriningJiwa — skrining kesehatan jiwa ibu hamil (SRQ-20) untuk Poli KIA (Klaster 2).
// Komponen "controlled": state disimpan di DashboardKIA, komponen ini hanya menampilkan dan mengubah lewat props.
// Disimpan di tabel `skrining_jiwa_anc` (satu baris per kunjungan, lihat skrining_jiwa_anc.sql).
//
// Props:
//   value    : state skrining jiwa (lihat emptyJiwa)
//   onChange : (state baru) => void
//   riwayat  : baris skrining_jiwa_anc kunjungan sebelumnya (+ kunjungan:kunjungan_id(tanggal_periksa)), urut tanggal
//   disabled : boolean

// Ambang positif SRQ-20. Pedoman Kemenkes umumnya memakai skor >= 6; sebagian dinas memakai 8.
// Silakan sesuaikan dengan pedoman dinas kesehatan setempat.
export const BATAS_SRQ_POSITIF = 6

// Pertanyaan no. 17 (pikiran mengakhiri hidup): jawaban YA selalu dianggap perlu tindak lanjut,
// berapa pun skor totalnya.
export const NO_ITEM_BUNUH_DIRI = 17

// true = hasil positif wajib punya tindak lanjut sebelum kunjungan bisa disimpan.
export const TINDAK_LANJUT_JIWA_WAJIB = true

export const TINDAK_LANJUT_JIWA = [
  '',
  'Rujuk ke dokter Puskesmas',
  'Rujuk ke psikolog Puskesmas',
  'Rujuk ke RS / psikiater',
  'Rujuk segera (UGD)',
  'Konseling oleh petugas, pantau kunjungan berikutnya',
]

export const SRQ20_PERTANYAAN = [
  'Apakah Anda sering menderita sakit kepala?',
  'Apakah Anda kehilangan nafsu makan?',
  'Apakah Anda sulit tidur?',
  'Apakah Anda mudah takut?',
  'Apakah Anda merasa cemas, tegang, atau khawatir?',
  'Apakah tangan Anda gemetar?',
  'Apakah pencernaan Anda terganggu/buruk?',
  'Apakah Anda sulit berpikir jernih?',
  'Apakah Anda merasa tidak bahagia?',
  'Apakah Anda menangis lebih sering?',
  'Apakah Anda merasa sulit untuk menikmati kegiatan sehari-hari?',
  'Apakah Anda mengalami kesulitan untuk mengambil keputusan?',
  'Apakah pekerjaan/tugas sehari-hari Anda terbengkalai?',
  'Apakah Anda merasa tidak mampu berperan dalam kehidupan ini?',
  'Apakah Anda kehilangan minat terhadap berbagai hal?',
  'Apakah Anda merasa tidak berharga?',
  'Apakah Anda mempunyai pikiran untuk mengakhiri hidup Anda?',
  'Apakah Anda merasa lelah sepanjang waktu?',
  'Apakah Anda merasa tidak enak di perut?',
  'Apakah Anda mudah lelah?',
]

// ---- state awal ----
// jawaban: { 1: true|false, ... 20 } (true = Ya). Nomor yang belum dijawab tidak ada di objek.
export const emptyJiwa = {
  id: null,
  dilakukan: false, // petugas mencentang bila skrining dilakukan pada kunjungan ini
  jawaban: {},
  tindak_lanjut: '',
  catatan: '',
}

// baris database -> state form
export function jiwaDariRow(row) {
  return {
    id: row.id,
    dilakukan: true,
    jawaban: row.jawaban ?? {},
    tindak_lanjut: row.tindak_lanjut ?? '',
    catatan: row.catatan ?? '',
  }
}

// ---- penilaian ----
export function hitungSRQ(jawaban = {}) {
  let skor = 0
  let terjawab = 0
  SRQ20_PERTANYAAN.forEach((_, i) => {
    const v = jawaban?.[i + 1]
    if (v === true || v === false) {
      terjawab += 1
      if (v) skor += 1
    }
  })
  const lengkap = terjawab === SRQ20_PERTANYAAN.length
  const skorPositif = skor >= BATAS_SRQ_POSITIF
  const ideBunuhDiri = jawaban?.[NO_ITEM_BUNUH_DIRI] === true
  return { skor, terjawab, lengkap, skorPositif, ideBunuhDiri, perluRujuk: skorPositif || ideBunuhDiri }
}

// Teks galat, atau null kalau valid / skrining tidak dilakukan.
export function validasiJiwa(j) {
  if (!j?.dilakukan) return null
  const h = hitungSRQ(j.jawaban)
  if (!h.lengkap) return `Skrining jiwa: jawab semua ${SRQ20_PERTANYAAN.length} pertanyaan (baru ${h.terjawab} terjawab)`
  if (h.perluRujuk && TINDAK_LANJUT_JIWA_WAJIB && !j.tindak_lanjut)
    return 'Skrining jiwa positif: pilih tindak lanjut / rujukan terlebih dahulu'
  return null
}

// state form -> baris siap simpan (kunjungan_id, kehamilan_id, petugas_id ditambahkan di DashboardKIA)
export function siapkanDataJiwa(j) {
  const h = hitungSRQ(j.jawaban)
  const jawaban = Object.fromEntries(SRQ20_PERTANYAAN.map((_, i) => [String(i + 1), j.jawaban?.[i + 1] === true]))
  return {
    instrumen: 'SRQ-20',
    jawaban,
    skor: h.skor,
    hasil_positif: h.perluRujuk,
    ada_ide_bunuh_diri: h.ideBunuhDiri,
    tindak_lanjut: j.tindak_lanjut || null,
    catatan: j.catatan?.trim() || null,
    updated_at: new Date().toISOString(),
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

export default function SkriningJiwa({ value, onChange, riwayat = [], disabled = false }) {
  const h = hitungSRQ(value.jawaban)
  const terakhir = riwayat.length ? riwayat[riwayat.length - 1] : null
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  const jawab = (no, ya) => onChange({ ...value, jawaban: { ...value.jawaban, [no]: ya } })

  return (
    <fieldset style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: 12, marginTop: 10, minWidth: 0 }}>
      <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>Skrining Kesehatan Jiwa (SRQ-20)</legend>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minHeight: 32, cursor: disabled ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          disabled={disabled}
          checked={!!value.dilakukan}
          onChange={(e) => onChange({ ...value, dilakukan: e.target.checked })}
        />
        Lakukan skrining jiwa pada kunjungan ini
      </label>

      <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', margin: '2px 0 6px' }}>
        {terakhir
          ? `Skrining jiwa terakhir: ${tglIndo(terakhir.kunjungan?.tanggal_periksa)}, skor ${terakhir.skor}/20 (${terakhir.hasil_positif ? 'positif' : 'negatif'})${
              terakhir.tindak_lanjut ? `, ${terakhir.tindak_lanjut}` : ''
            }.`
          : 'Belum ada skrining jiwa tercatat pada kehamilan ini.'}
      </div>

      {value.dilakukan && (
        <>
          <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 6 }}>
            Tanyakan gejala dalam 30 hari terakhir. Jawab Ya atau Tidak untuk setiap pertanyaan.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', alignItems: 'center', gap: '2px 8px' }}>
            {SRQ20_PERTANYAAN.map((q, i) => {
              const no = i + 1
              const v = value.jawaban?.[no]
              const kritis = no === NO_ITEM_BUNUH_DIRI
              const gaya = kritis ? { color: merah, fontWeight: 700 } : undefined
              return (
                <Baris key={no}>
                  <span style={{ fontSize: 12, textAlign: 'right', ...gaya }}>{no}.</span>
                  <span style={{ fontSize: 13, padding: '4px 0', ...gaya }}>{q}</span>
                  <span style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: disabled ? 'default' : 'pointer' }}>
                      <input type="radio" name={`srq-${no}`} disabled={disabled} checked={v === true} onChange={() => jawab(no, true)} />
                      Ya
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: disabled ? 'default' : 'pointer' }}>
                      <input type="radio" name={`srq-${no}`} disabled={disabled} checked={v === false} onChange={() => jawab(no, false)} />
                      Tidak
                    </label>
                  </span>
                </Baris>
              )
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 16px', margin: '10px 0 6px', fontSize: 13 }}>
            <span>
              Skor: <b>{h.skor}</b> / {SRQ20_PERTANYAAN.length}
            </span>
            <span style={{ color: 'var(--muted, #6b7280)' }}>
              Terjawab {h.terjawab}/{SRQ20_PERTANYAAN.length} · batas positif ≥ {BATAS_SRQ_POSITIF}
            </span>
          </div>

          {!h.lengkap && !h.perluRujuk && (
            <div style={{ border: '1px solid var(--line, #e5e7eb)', background: '#f9fafb', color: 'var(--muted, #6b7280)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
              Skor sementara {h.skor}. Lanjutkan sampai ke-{SRQ20_PERTANYAAN.length} pertanyaan terjawab ({SRQ20_PERTANYAAN.length - h.terjawab} lagi).
            </div>
          )}

          {h.lengkap && !h.perluRujuk && (
            <div style={{ border: '1px solid #16a34a', background: '#f0fdf4', color: '#166534', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
              ✓ Skrining negatif (skor {h.skor}). Pantau pada kunjungan berikutnya.
            </div>
          )}

          {/* Positif ditampilkan segera, tidak perlu menunggu semua pertanyaan terjawab */}
          {h.perluRujuk && (
            <div role="alert" style={{ border: `1px solid ${merah}`, background: '#fef3f2', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}>
              <div style={{ color: merah, fontWeight: 700, fontSize: 13 }}>
                ⚠ Skrining jiwa positif ({h.lengkap ? 'skor' : 'skor sementara'} {h.skor}/{SRQ20_PERTANYAAN.length})
              </div>
              {!h.lengkap && (
                <div style={{ marginTop: 4 }}>Sudah memenuhi kriteria rujukan. Selesaikan sisa {SRQ20_PERTANYAAN.length - h.terjawab} pertanyaan, lalu pilih tindak lanjut.</div>
              )}
              {h.skorPositif && (
                <div style={{ marginTop: 4 }}>
                  Skor mencapai batas ({BATAS_SRQ_POSITIF}): kemungkinan gangguan mental emosional. Rujuk ibu untuk pemeriksaan lanjutan sesuai alur Klaster 2.
                </div>
              )}
              {h.ideBunuhDiri && (
                <div style={{ marginTop: 4, color: merah, fontWeight: 700 }}>
                  Ibu menjawab YA pada pertanyaan no. {NO_ITEM_BUNUH_DIRI} (pikiran mengakhiri hidup){h.skorPositif ? '' : ', walau skor di bawah batas'}.
                  Jangan tinggalkan ibu sendirian, segera nilai risiko bersama dokter, dan rujuk segera sesuai alur.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 8 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600 }}>
                  Tindak lanjut{TINDAK_LANJUT_JIWA_WAJIB ? ' *' : ''}
                  <select style={input} disabled={disabled} value={value.tindak_lanjut} onChange={set('tindak_lanjut')}>
                    {TINDAK_LANJUT_JIWA.map((o) => (
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
        </>
      )}
    </fieldset>
  )
}

// satu baris grid (3 kolom): dipakai supaya tiap pertanyaan punya key sendiri
function Baris({ children }) {
  return <>{children}</>
}