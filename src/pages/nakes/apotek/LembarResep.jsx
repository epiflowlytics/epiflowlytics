import { useMemo, useRef, useState } from 'react'
import SignatureCanvas from '../../consent/SignatureCanvas'

// ─── Daftar poin checklist digital (sesuai kertas resep Puskesmas) ─────────
export const TELAAH_RESEP_ITEMS = [
  'Benar nama pasien',
  'Benar nama obat',
  'Benar dosis obat',
  'Benar waktu pemberian',
  'Benar cara pemberian',
  'Benar indikasi',
  'Benar adanya polifarmasi',
]

export const INFORMASI_OBAT_ITEMS = [
  'Sediaan dan nama obat',
  'Dosis dan cara pakai',
  'Indikasi',
  'Kontra indikasi',
  'Efek samping obat',
  'Penyimpanan',
  'Tidak ada alergi obat',
]

// Nilai checklist: 'ya' | 'tidak' | '' (belum diisi)
export function buatChecklistKosong(items) {
  return items.map(() => '')
}

// ─── Ukuran kertas yang didukung ────────────────────────────────────────────
// Lebar dalam mm. Kertas thermal tidak punya tinggi tetap (roll continuous),
// jadi tinggi dibiarkan mengikuti konten (auto). Kertas lembar (A5/A4/Letter)
// punya tinggi tetap, dan kontennya di-scale otomatis supaya selalu muat 1 halaman.
export const UKURAN_KERTAS = {
  thermal58: { label: 'Thermal 58mm', lebarMm: 58, tinggiMm: null, margin: 3, tipe: 'thermal' },
  thermal80: { label: 'Thermal 80mm', lebarMm: 80, tinggiMm: null, margin: 4, tipe: 'thermal' },
  A5: { label: 'A5 (148 × 210 mm)', lebarMm: 148, tinggiMm: 210, margin: 8, tipe: 'lembar' },
  A4: { label: 'A4 (210 × 297 mm)', lebarMm: 210, tinggiMm: 297, margin: 12, tipe: 'lembar' },
  Letter: { label: 'Letter (216 × 279 mm)', lebarMm: 216, tinggiMm: 279, margin: 12, tipe: 'lembar' },
}

const MM_PER_PX = 96 / 25.4 // 96dpi

function mmToPx(mm) {
  return Math.round(mm * MM_PER_PX)
}

// ─── Style ──────────────────────────────────────────────────────────────────
// Style dibuat sebagai fungsi dari kunci ukuran kertas, supaya font-size,
// padding, dan lebar kolom menyesuaikan (thermal = sangat sempit, satu kolom).
function buatGaya(kunciUkuran) {
  const cfg = UKURAN_KERTAS[kunciUkuran] || UKURAN_KERTAS.A5
  const thermal = cfg.tipe === 'thermal'
  const lebarPx = mmToPx(cfg.lebarMm)
  const sempit = cfg.lebarMm <= 58

  const fontDasar = thermal ? (sempit ? 9 : 10) : 12
  const fontTabel = thermal ? (sempit ? 8 : 9) : 11
  const fontKop = thermal ? (sempit ? 9 : 10) : 13
  const padding = cfg.margin

  return {
    cfg,
    thermal,
    sempit,
    lebarPx,
    S: {
      page: {
        width: lebarPx,
        maxWidth: lebarPx,
        margin: '0 auto',
        background: '#fff',
        color: '#000',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: fontDasar,
        padding,
        border: '1px solid #ccc',
        boxSizing: 'border-box',
      },
      kop: {
        display: 'flex',
        alignItems: 'center',
        gap: thermal ? 4 : 10,
        paddingBottom: 6,
        flexDirection: sempit ? 'column' : 'row',
        textAlign: sempit ? 'center' : 'left',
      },
      kopTeks: { flex: 1, textAlign: 'center', lineHeight: 1.25 },
      garis: { borderTop: `${thermal ? 1 : 2}px solid #222`, margin: '6px 0 10px' },
      baris: {
        display: 'flex',
        alignItems: 'baseline',
        marginBottom: 5,
        flexWrap: sempit ? 'wrap' : 'nowrap',
      },
      label: { width: sempit ? '100%' : 78, fontWeight: 'bold', fontSize: fontDasar },
      titik2: { width: sempit ? 0 : 12, display: sempit ? 'none' : 'inline-block' },
      isi: { flex: 1, borderBottom: '1px dotted #444', minHeight: 14, paddingLeft: sempit ? 0 : 2, wordBreak: 'break-word' },
      kotak: {
        display: 'inline-block', width: 18, height: 14, border: '1px solid #222',
        textAlign: 'center', lineHeight: '14px', fontWeight: 'bold', fontSize: fontDasar,
      },
      tabel: { width: '100%', borderCollapse: 'collapse', fontSize: fontTabel, marginBottom: 6, tableLayout: 'fixed' },
      th: { border: '1px solid #222', padding: sempit ? '1px 2px' : '2px 4px', textAlign: 'center', fontWeight: 'bold' },
      td: { border: '1px solid #222', padding: sempit ? '1px 2px' : '2px 4px', wordBreak: 'break-word' },
      tdC: { border: '1px solid #222', padding: sempit ? '1px 2px' : '2px 4px', textAlign: 'center', fontWeight: 'bold' },
      judulTabel: { textAlign: 'center', fontWeight: 'bold', margin: '8px 0 3px', fontSize: fontDasar },
      fontKop,
      fontDasar,
      fontTabel,
    },
  }
}

function Baris({ label, children, labelWidth, S }) {
  return (
    <div style={S.baris}>
      <span style={{ ...S.label, ...(labelWidth && S.label.width !== '100%' ? { width: labelWidth } : {}) }}>{label}</span>
      <span style={S.titik2}>:</span>
      <span style={S.isi}>{children}</span>
    </div>
  )
}

const WARNA_YA = '#15803d'
const WARNA_TIDAK = '#b91c1c'

const gayaTombolPilih = {
  fontSize: 11, lineHeight: 1, padding: '4px 8px', borderRadius: 4,
  border: '1px solid #9ca3af', background: '#fff', color: '#374151', cursor: 'pointer',
}
const gayaTautan = {
  border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer',
  fontSize: 11, padding: '2px 4px',
}

// Sel Ya / Tidak.
// Mode baca (dokter, cetak): centang statis atau kosong.
// Mode editable (apoteker): belum dipilih = tombol; sudah dipilih = centang yang bisa diklik untuk batal.
// Elemen interaktif diberi class "layar-saja" (disembunyikan saat cetak) dan
// centang khusus cetak diberi class "cetak-saja", supaya hasil cetak tetap seperti kertas asli.
function SelPilihan({ editable, nilai, kolom, onPilih, onBatal, S, sempit }) {
  const dipilih = nilai === kolom
  const kosong = nilai === ''
  const warna = kolom === 'ya' ? WARNA_YA : WARNA_TIDAK
  const label = kolom === 'ya' ? 'Ya' : 'Tidak'

  if (!editable) {
    return <td style={S.tdC}>{dipilih ? '✓' : ''}</td>
  }

  return (
    <td style={S.tdC}>
      {dipilih && (
        <>
          <span className="layar-saja">
            <button
              type="button"
              onClick={onBatal}
              aria-label={`Batalkan pilihan ${label}`}
              title="Klik untuk membatalkan"
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: warna, fontSize: sempit ? 13 : 16, fontWeight: 'bold', lineHeight: 1, padding: '0 4px',
              }}
            >
              ✓
            </button>
          </span>
          <span className="cetak-saja" style={{ display: 'none' }}>✓</span>
        </>
      )}
      {kosong && (
        <span className="layar-saja">
          <button
            type="button"
            onClick={onPilih}
            style={{ ...gayaTombolPilih, ...(sempit ? { fontSize: 9, padding: '2px 4px' } : {}) }}
          >
            {sempit ? label[0] : label}
          </button>
        </span>
      )}
    </td>
  )
}

function TabelChecklist({ judul, items, nilai, editable = false, onChange, S, sempit }) {
  function set(index, v) {
    const next = [...nilai]
    next[index] = v
    onChange?.(next)
  }
  const terisi = nilai.filter((v) => v !== '').length

  return (
    <>
      <div style={S.judulTabel}>{judul}</div>
      {editable && (
        <div
          className="layar-saja"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, margin: '0 0 3px', fontSize: 11, color: '#6b7280', flexWrap: 'wrap' }}
        >
          <span style={{ marginRight: 'auto' }}>{terisi} dari {items.length} terisi</span>
          <button type="button" style={gayaTautan} onClick={() => onChange?.(items.map(() => 'ya'))}>Ya semua</button>
          <button type="button" style={gayaTautan} onClick={() => onChange?.(items.map(() => ''))}>Reset</button>
        </div>
      )}
      <table style={S.tabel}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: sempit ? 18 : 28 }}>NO</th>
            <th style={S.th}>{sempit ? 'JENIS' : (judul.toLowerCase().includes('telaah') ? 'JENIS PENGECEKAN' : 'JENIS INFORMASI')}</th>
            <th style={{ ...S.th, width: sempit ? 26 : 52 }}>YA</th>
            <th style={{ ...S.th, width: sempit ? 32 : 62 }}>{sempit ? 'TDK' : 'TIDAK'}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((label, i) => (
            <tr key={label}>
              <td style={S.tdC}>{i + 1}</td>
              <td style={S.td}>{label}</td>
              <SelPilihan
                editable={editable}
                nilai={nilai[i]}
                kolom="ya"
                onPilih={() => set(i, 'ya')}
                onBatal={() => set(i, '')}
                S={S}
                sempit={sempit}
              />
              <SelPilihan
                editable={editable}
                nilai={nilai[i]}
                kolom="tidak"
                onPilih={() => set(i, 'tidak')}
                onBatal={() => set(i, '')}
                S={S}
                sempit={sempit}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function formatJam(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatTanggalJam(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Area tanda tangan pasien.
// Mode baca (dokter/cetak): tampilkan gambar TTD kalau ada (+ keterangan kecil
// kalau sumbernya disalin dari consent), atau ruang kosong seperti sebelumnya.
// Mode editable (apoteker, editableTtd=true): kalau belum ada TTD tersimpan,
// tampilkan kanvas untuk digambar langsung DAN/ATAU tombol untuk menyalin dari
// General Consent (kalau consentTersedia ada). Kedua opsi sengaja ditampilkan
// berdampingan, bukan saling menggantikan — apoteker yang memilih sesuai situasi.
function AreaTtdPasien({ S, thermal, editableTtd, ttdPasien, consentTersedia, onSimpanTtdApotek, onSalinTtdConsent, onHapusTtd }) {
  const sigRef = useRef(null)
  const [menggambar, setMenggambar] = useState(false)

  const tinggiGambar = thermal ? 24 : 40

  // Mode baca murni (dokter / hasil cetak), atau editable tapi sudah ada TTD tersimpan.
  if (!editableTtd || ttdPasien?.url) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div>Tanda tangan</div>
        {ttdPasien?.url ? (
          <>
            <img
              src={ttdPasien.url}
              alt="Tanda tangan pasien"
              style={{ height: tinggiGambar, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }}
            />
            {ttdPasien.sumber === 'consent' && (
              <div className="cetak-selalu" style={{ fontSize: thermal ? 6 : 8, color: '#666', marginTop: 2 }}>
                *TTD disalin dari General Consent{ttdPasien.pada ? ` tanggal ${formatTanggalJam(ttdPasien.pada)}` : ''}{ttdPasien.kunjunganBerbeda ? ' (kunjungan sebelumnya)' : ''}, bukan TTD saat serah obat.
              </div>
            )}
            {editableTtd && (
              <button
                type="button"
                onClick={onHapusTtd}
                className="layar-saja"
                style={{ ...gayaTautan, display: 'block', margin: '2px auto 0' }}
              >
                Ganti tanda tangan
              </button>
            )}
          </>
        ) : (
          <div style={{ height: tinggiGambar }} />
        )}
        <div>Pasien</div>
      </div>
    )
  }

  // Mode editable, belum ada TTD tersimpan: tawarkan kanvas + (opsional) salin dari consent.
  return (
    <div style={{ textAlign: 'center', flex: 1, maxWidth: thermal ? '100%' : 220 }} className="layar-saja">
      <div>Tanda tangan</div>
      <div>Pasien</div>
      {!menggambar ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setMenggambar(true)}
            style={{ ...gayaTombolPilih, width: '100%' }}
          >
            ✍️ Tanda tangan di sini
          </button>
          {consentTersedia?.url && consentTersedia.kunjunganBerbeda && (
            <div style={{ fontSize: 10, color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 4, padding: '3px 5px', textAlign: 'left' }}>
              ⚠️ Consent ini dari kunjungan sebelumnya{consentTersedia.pada ? ` (${formatTanggalJam(consentTersedia.pada)})` : ''}, bukan kunjungan hari ini.
            </div>
          )}
          {consentTersedia?.url && (
            <button
              type="button"
              onClick={onSalinTtdConsent}
              style={{ ...gayaTombolPilih, width: '100%', borderColor: '#2563eb', color: '#2563eb' }}
              title={`Menyalin TTD dari General Consent${consentTersedia.pada ? ` tgl ${formatTanggalJam(consentTersedia.pada)}` : ''}`}
            >
              📋 Salin dari General Consent
            </button>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 4 }}>
          <div style={{ border: '1px solid #9ca3af', borderRadius: 4, background: '#fafafa' }}>
            <SignatureCanvas ref={sigRef} penColor="black" canvasProps={{ className: 'w-full h-24' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => { sigRef.current?.clear() }}
              style={{ ...gayaTautan, flex: 1 }}
            >
              Ulangi
            </button>
            <button
              type="button"
              onClick={() => {
                if (sigRef.current?.isEmpty()) return
                const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png')
                onSimpanTtdApotek?.(dataUrl)
                setMenggambar(false)
              }}
              style={{ ...gayaTombolPilih, flex: 1, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }}
            >
              Simpan TTD
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMenggambar(false)}
            style={{ ...gayaTautan, display: 'block', margin: '2px auto 0' }}
          >
            Batal
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Props:
 *  - instansi         : profile.instansi (nama_pemerintah, nama_dinas, nama, alamat, email, logo_url)
 *  - pasien           : selected.pasien
 *  - kunjungan        : selected (untuk kategori_pasien, tanggal_periksa, poli)
 *  - umur             : hasil hitungUmur() -> { tahun }
 *  - skrining         : data skrining perawat (berat/tinggi badan, keluhan)
 *  - form             : form pemeriksaan (diagnosis, anamnesis, tindakan)
 *  - resepList        : daftar obat
 *  - telaahResep      : array 'ya'|'tidak'|'' (7 item)
 *  - informasiObat    : array 'ya'|'tidak'|'' (7 item)
 *  - namaPoli         : nama poli
 *  - statusKunjunganLain : teks setelah "BPJS/Umum/" (opsional)
 *  - ukuranKertas     : salah satu kunci UKURAN_KERTAS (default 'A5')
 *  - ttdPasien        : { url, sumber: 'apotek'|'consent', nama, pada } | null
 *                       Tanda tangan pasien saat serah obat. Kalau sumber='consent',
 *                       tanda tangan ini DISALIN dari General Consent (bukan digambar
 *                       ulang saat serah obat) — lembar SELALU menampilkan keterangan
 *                       kecil untuk itu, supaya tidak terkesan pasien TTD langsung di
 *                       apotek pada saat itu.
 *  - editableTtd      : true di modal apoteker -> tampilkan kanvas TTD + tombol salin
 *                       dari consent (kalau tersedia) alih-alih hanya area kosong.
 *  - form.dokter      : nama dokter penulis resep (opsional)
 *  - consentTersedia  : { url, nama, pada, kunjunganBerbeda } | null — dari general_consent pasien pada
 *                       kunjungan ini, dipakai untuk tombol "Salin dari General Consent".
 *  - onSimpanTtdApotek(dataUrlPng) : dipanggil saat apoteker selesai menggambar TTD sendiri.
 *  - onSalinTtdConsent()           : dipanggil saat apoteker klik "Salin dari General Consent".
 *  - onHapusTtd()                  : dipanggil untuk membatalkan/menggambar ulang TTD.
 */
export function LembarResepKertas({
  instansi, pasien, kunjungan, umur, skrining, form, resepList,
  telaahResep: telaahResepProp, informasiObat: informasiObatProp, namaPoli,
  editableChecklist = false, onChangeTelaah, onChangeInformasi,
  ukuranKertas = 'A5',
  ttdPasien = null,
  editableTtd = false,
  consentTersedia = null,
  onSimpanTtdApotek,
  onSalinTtdConsent,
  onHapusTtd,
}) {
  const { S, thermal, sempit } = useMemo(() => buatGaya(ukuranKertas), [ukuranKertas])

  // Di dashboard dokter checklist belum diisi (diisi apoteker), jadi tabel tercetak kosong.
  const telaahResep = Array.isArray(telaahResepProp) ? telaahResepProp : buatChecklistKosong(TELAAH_RESEP_ITEMS)
  const informasiObat = Array.isArray(informasiObatProp) ? informasiObatProp : buatChecklistKosong(INFORMASI_OBAT_ITEMS)

  const tanggal = kunjungan?.tanggal_periksa
    ? new Date(kunjungan.tanggal_periksa).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  // Kepmenkes 1423/2022 E.1 (tanggal & jam penulisan resep) dan E.2 (dispensing).
  // Diambil dari baris resep; waktu tulis = resep paling awal, dispensing = yang terisi.
  const semuaResep = Array.isArray(resepList) ? resepList : []
  const waktuTulisResep = semuaResep
    .map((r) => r.created_at).filter(Boolean).sort()[0] || null
  const barisDispensing = semuaResep.filter((r) => r.waktu_serah || r.petugas?.nama_lengkap)
  const petugasDispensing = barisDispensing.find((r) => r.petugas?.nama_lengkap)?.petugas?.nama_lengkap || ''
  const waktuSiap = barisDispensing.map((r) => r.waktu_siap).filter(Boolean).sort()[0] || null
  const waktuSerah = barisDispensing.map((r) => r.waktu_serah).filter(Boolean).sort().slice(-1)[0] || null

  const punyaAlergi = !!pasien?.alergi_obat
  const kategori = (kunjungan?.kategori_pasien || '').toLowerCase()
  const statusKunjungan = kategori === 'bpjs' ? 'BPJS' : kategori ? 'Umum' : ''
  const obatTerisi = resepList.filter((r) => r.nama_obat?.trim())

  return (
    <div style={S.page} className="lembar-resep-kertas" data-ukuran-kertas={ukuranKertas}>
      {/* Kop */}
      <div style={S.kop}>
        {instansi?.logo_url && (
          <img
            src={instansi.logo_url}
            alt="Logo"
            style={{ width: thermal ? 32 : 52, height: thermal ? 32 : 52, objectFit: 'contain' }}
          />
        )}
        <div style={S.kopTeks}>
          <div style={{ fontWeight: 'bold', fontSize: S.fontKop }}>
            {(instansi?.nama_pemerintah || '').toUpperCase()}
          </div>
          <div style={{ fontWeight: 'bold', fontSize: S.fontKop }}>
            {(instansi?.nama_dinas || '').toUpperCase()}
          </div>
          <div style={{ fontWeight: 'bold', fontSize: S.fontKop }}>
            {(instansi?.nama || '').toUpperCase()}
          </div>
          {instansi?.alamat && <div style={{ fontSize: thermal ? 8 : 9 }}>{instansi.alamat}</div>}
          {instansi?.email && <div style={{ fontSize: thermal ? 8 : 9 }}>Email : {instansi.email}</div>}
        </div>
      </div>
      <div style={S.garis} />

      {/* Identitas kunjungan + alergi */}
      <div style={{ display: 'flex', gap: 10, flexDirection: sempit ? 'column' : 'row' }}>
        <div style={{ flex: 1.2 }}>
          <Baris S={S} label="No RM">{pasien?.no_rekam_medis}</Baris>
          <Baris S={S} label="Tanggal">{tanggal}{waktuTulisResep ? ` · ${formatJam(waktuTulisResep)}` : ''}</Baris>
          {form?.dokter && <Baris S={S} label="Dokter">{form.dokter}</Baris>}
          <Baris S={S} label="Poli">{namaPoli}</Baris>
          <Baris S={S} label="Pemeriksaan">{form?.anamnesis}</Baris>
          <Baris S={S} label="Keluhan">{skrining?.keluhan_utama}</Baris>
        </div>
        <div style={{ flex: 1, fontSize: S.fontDasar }}>
          <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Alergi Obat :</div>
          <div style={{ display: 'flex', gap: thermal ? 8 : 14, marginBottom: 4 }}>
            <div style={{ textAlign: 'center' }}>
              <span style={S.kotak}>{punyaAlergi ? '✓' : ''}</span>
              <div style={{ fontWeight: 'bold' }}>Ya</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={S.kotak}>{!punyaAlergi ? '✓' : ''}</span>
              <div style={{ fontWeight: 'bold' }}>Tidak</div>
            </div>
          </div>
          <div>
            <b>Nama obat :</b> {punyaAlergi ? pasien.alergi_obat : ''}
          </div>
        </div>
      </div>

      {/* Daftar obat (R/) */}
      <div style={{ minHeight: thermal ? 40 : 90, margin: '10px 0' }}>
        {obatTerisi.length === 0 ? (
          <div style={{ color: '#999', fontStyle: 'italic', fontSize: S.fontDasar }}>Belum ada obat.</div>
        ) : (
          obatTerisi.map((r, i) => (
            <div key={i} style={{ marginBottom: 6, fontSize: S.fontDasar }}>
              <div>
                <b>R/</b> {r.nama_obat}
                {r.dosis ? ` ${r.dosis}` : ''}
                {r.jumlah ? ` — No. ${r.jumlah} ${r.satuan_jumlah || ''}` : ''}
                {r.bentuk_sediaan === 'puyer'
                  ? ` (Puyer${r.jumlah_puyer ? `, ${r.jumlah_puyer} bungkus` : ''})`
                  : ''}
              </div>
              <div style={{ paddingLeft: sempit ? 12 : 22 }}>S {r.aturan_pakai}</div>
              {r.catatan && (
                <div style={{ paddingLeft: sempit ? 12 : 22, fontSize: thermal ? 8 : 10, color: '#444' }}>Ket: {r.catatan}</div>
              )}
            </div>
          ))
        )}
      </div>

      <TabelChecklist
        judul="TELAAH RESEP"
        items={TELAAH_RESEP_ITEMS}
        nilai={telaahResep}
        editable={editableChecklist}
        onChange={onChangeTelaah}
        S={S}
        sempit={sempit}
      />
      <TabelChecklist
        judul="INFORMASI OBAT"
        items={INFORMASI_OBAT_ITEMS}
        nilai={informasiObat}
        editable={editableChecklist}
        onChange={onChangeInformasi}
        S={S}
        sempit={sempit}
      />

      {/* Tanda tangan */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', gap: 8, margin: '10px 0 4px', fontSize: S.fontDasar, flexWrap: sempit ? 'wrap' : 'nowrap' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div>Tanda tangan</div>
          <div style={{ height: thermal ? 24 : 40 }} />
          <div>Petugas</div>
          {petugasDispensing && (
            <div style={{ fontSize: thermal ? 7 : 9, fontWeight: 'bold' }}>{petugasDispensing}</div>
          )}
        </div>
        <AreaTtdPasien
          S={S}
          thermal={thermal}
          editableTtd={editableTtd}
          ttdPasien={ttdPasien}
          consentTersedia={consentTersedia}
          onSimpanTtdApotek={onSimpanTtdApotek}
          onSalinTtdConsent={onSalinTtdConsent}
          onHapusTtd={onHapusTtd}
        />
      </div>

      {(waktuSiap || waktuSerah) && (
        <div style={{ fontSize: thermal ? 7 : 9, color: '#333', margin: '2px 0 4px' }}>
          {waktuSiap && <>Disiapkan: {formatTanggalJam(waktuSiap)}</>}
          {waktuSiap && waktuSerah && ' · '}
          {waktuSerah && <>Diserahkan: {formatTanggalJam(waktuSerah)}</>}
        </div>
      )}

      <div style={S.garis} />

      {/* Footer identitas pasien */}
      <Baris S={S} label="Status Kunjungan" labelWidth={100}>
        {statusKunjungan ? `${statusKunjungan}` : 'BPJS/Umum/......'}
      </Baris>
      <Baris S={S} label="Nama" labelWidth={100}>{pasien?.nama_lengkap}</Baris>
      <Baris S={S} label="Umur/BB/TB" labelWidth={100}>
        {umur ? `${umur.tahun} Tahun` : '.... Tahun'} / {skrining?.berat_badan ? `${skrining.berat_badan} Kg` : '.... Kg'} / {skrining?.tinggi_badan ? `${skrining.tinggi_badan} Cm` : '.... Cm'}
      </Baris>
      <Baris S={S} label="Jenis Kelamin" labelWidth={100}>
        {pasien?.jenis_kelamin === 'L' ? 'Laki-Laki' : pasien?.jenis_kelamin === 'P' ? 'Perempuan' : ''}
      </Baris>
      <Baris S={S} label="Alamat" labelWidth={100}>{pasien?.alamat}</Baris>
      <Baris S={S} label="Diagnosa" labelWidth={100}>
        {form?.diagnosis}{form?.kode_icd ? ` (${form.kode_icd})` : ''}
      </Baris>
    </div>
  )
}

// ─── Modal pratinjau + tombol cetak ────────────────────────────────────────
export default function ModalLembarResep({
  terbuka,
  onTutup,
  // Mode apoteker: checklist Telaah Resep & Informasi Obat bisa diisi dan disimpan
  editableChecklist = false,
  onChangeTelaah,
  onChangeInformasi,
  onSimpanChecklist,
  menyimpanChecklist = false,
  ukuranKertasAwal = 'A5',
  ...props
}) {
  const areaRef = useRef(null)
  const [ukuranKertas, setUkuranKertas] = useState(ukuranKertasAwal)
  const [ukuranEtiket, setUkuranEtiket] = useState('thermal58')
  const [pratinjauEtiket, setPratinjauEtiket] = useState(false)

  if (!terbuka) return null

  const cfg = UKURAN_KERTAS[ukuranKertas] || UKURAN_KERTAS.A5

  function cetak() {
    const html = areaRef.current?.innerHTML
    if (!html) return
    const w = window.open('', '_blank', 'width=520,height=800')
    if (!w) {
      alert('Pop-up diblokir browser. Izinkan pop-up untuk mencetak.')
      return
    }

    // Aturan halaman disesuaikan tipe kertas:
    // - thermal: lebar tetap sesuai ukuran, tinggi auto (mengikuti konten, seperti struk).
    // - lembar (A5/A4/Letter): ukuran baku, dan konten di-scale agar selalu muat 1 halaman
    //   (tidak pernah terpotong ke halaman ke-2).
    const pageCss = cfg.tipe === 'thermal'
      ? `@page { size: ${cfg.lebarMm}mm auto; margin: 0; }`
      : `@page { size: ${cfg.lebarMm}mm ${cfg.tinggiMm}mm; margin: 0; }`

    w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>Lembar Resep</title>
      <style>
        ${pageCss}
        html, body { margin: 0; padding: 0; }
        body {
          display: flex;
          justify-content: center;
          align-items: ${cfg.tipe === 'thermal' ? 'flex-start' : 'center'};
          width: ${cfg.lebarMm}mm;
          ${cfg.tipe === 'lembar' ? `height: ${cfg.tinggiMm}mm;` : ''}
          overflow: hidden;
        }
        .cetak-bungkus {
          transform-origin: ${cfg.tipe === 'thermal' ? 'top center' : 'center center'};
        }
        .lembar-resep-kertas { border: none !important; box-sizing: border-box; }
        .layar-saja { display: none !important; }
        .cetak-saja { display: inline !important; }
      </style></head><body>
        <div class="cetak-bungkus" id="cetak-bungkus">${html}</div>
        <script>
          (function () {
            var tipe = ${JSON.stringify(cfg.tipe)};
            if (tipe !== 'lembar') return; // thermal: tidak perlu scaling, tinggi auto
            var pageWmm = ${cfg.lebarMm};
            var pageHmm = ${cfg.tinggiMm};
            var mmToPx = 96 / 25.4;
            var pageWpx = pageWmm * mmToPx;
            var pageHpx = pageHmm * mmToPx;
            var el = document.getElementById('cetak-bungkus');
            function skalakan() {
              var rect = el.getBoundingClientRect();
              var skalaW = pageWpx / rect.width;
              var skalaH = pageHpx / rect.height;
              // Pakai skala terkecil supaya konten selalu utuh dalam 1 halaman,
              // tanpa memotong maupun melebihi tinggi/lebar kertas.
              var skala = Math.min(skalaW, skalaH, 1);
              el.style.transform = 'scale(' + skala + ')';
            }
            skalakan();
            window.addEventListener('resize', skalakan);
          })();
        </script>
      </body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 500)
  }

  // Etiket per obat (Kepmenkes 1423/2022 E.2.e): satu etiket thermal per obat, ukuran 58 atau 80 mm.
  // Memuat nama pasien, tanggal lahir, nama obat, bentuk, jumlah, aturan pakai,
  // catatan resep, dan tanggal obat diserahkan.
  // buatHtmlEtiket() dipakai BERSAMA oleh pratinjau di layar dan oleh cetak, sehingga
  // yang terlihat di pratinjau sama persis dengan yang tercetak.
  function buatHtmlEtiket() {
    const lebarEtiket = ukuranEtiket === 'thermal80' ? 80 : 58
    const skala = lebarEtiket === 80 ? 1.25 : 1
    const daftar = (props.resepList || []).filter((r) => r.nama_obat?.trim())
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ))
    const tglLahir = props.pasien?.tanggal_lahir
      ? new Date(props.pasien.tanggal_lahir).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-'
    const tglSerah = (daftar.map((r) => r.waktu_serah).filter(Boolean).sort().slice(-1)[0])
      || new Date().toISOString()
    const tglSerahTeks = new Date(tglSerah).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const etiket = daftar.map((r) => `
      <div class="etiket">
        <div class="kop">${esc((props.instansi?.nama || '').toUpperCase())}</div>
        <div class="garis"></div>
        <div><b>${esc(props.pasien?.nama_lengkap)}</b></div>
        <div>Tgl lahir: ${esc(tglLahir)} &nbsp; RM: ${esc(props.pasien?.no_rekam_medis)}</div>
        <div class="garis"></div>
        <div class="obat">${esc(r.nama_obat)}${r.dosis ? ' ' + esc(r.dosis) : ''}</div>
        <div>${r.bentuk_sediaan ? esc(r.bentuk_sediaan) + ' · ' : ''}Jml: ${esc(r.jumlah)} ${esc(r.satuan_jumlah || '')}</div>
        <div class="aturan">${esc(r.aturan_pakai)}</div>
        ${r.catatan ? `<div class="cat">${esc(r.catatan)}</div>` : ''}
        <div class="garis"></div>
        <div class="kaki">Diserahkan: ${esc(tglSerahTeks)}</div>
      </div>`).join('')

    const css = `
        .etiket-area { font-family: Arial, Helvetica, sans-serif; font-size: ${9 * skala}px; color: #000; }
        .etiket-area .etiket { box-sizing: border-box; width: ${lebarEtiket}mm; padding: 3mm; background: #fff; }
        .etiket-area .kop { font-weight: bold; text-align: center; font-size: ${9 * skala}px; }
        .etiket-area .garis { border-top: 1px solid #000; margin: 2mm 0; }
        .etiket-area .obat { font-weight: bold; font-size: ${11 * skala}px; }
        .etiket-area .aturan { font-weight: bold; font-size: ${12 * skala}px; margin-top: 1mm; }
        .etiket-area .cat { font-size: ${8 * skala}px; margin-top: 1mm; }
        .etiket-area .kaki { font-size: ${8 * skala}px; }`
    return { etiket, css, lebarEtiket, jumlah: daftar.length }
  }

  function bukaPratinjauEtiket() {
    if ((props.resepList || []).filter((r) => r.nama_obat?.trim()).length === 0) {
      alert('Belum ada obat untuk dicetak etiketnya.')
      return
    }
    setPratinjauEtiket(true)
  }

  function cetakEtiket() {
    const { etiket, css, lebarEtiket } = buatHtmlEtiket()
    const w = window.open('', '_blank', 'width=360,height=600')
    if (!w) {
      alert('Pop-up diblokir browser. Izinkan pop-up untuk mencetak.')
      return
    }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>Etiket Obat</title>
      <style>
        @page { size: ${lebarEtiket}mm auto; margin: 0; }
        html, body { margin: 0; padding: 0; }
        body { width: ${lebarEtiket}mm; }
        ${css}
        .etiket-area .etiket { page-break-after: always; }
        .etiket-area .etiket:last-child { page-break-after: auto; }
      </style></head><body><div class="etiket-area">${etiket}</div></body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 500)
  }

  // Pratinjau di layar memakai lebar-px yang identik dengan hasil cetak (mm -> px 96dpi),
  // lalu di-scale agar muat di modal. Ini menjamin proporsi teks/tabel/kolom yang tampak
  // di preview SAMA dengan yang akan tercetak/terunduh — bukan sekadar mirip.
  const lebarPxAsli = mmToPx(cfg.lebarMm)
  const lebarPreviewMaks = 380 // lebar area preview di modal (px)
  const skalaPreview = Math.min(1, lebarPreviewMaks / lebarPxAsli)

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto p-4"
      onClick={onTutup}
    >
      <div
        className="bg-gray-100 rounded-2xl shadow-xl w-full max-w-lg my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b bg-white rounded-t-2xl">
          <h3 className="text-sm font-semibold text-gray-800">Pratinjau Lembar Resep</h3>
          <button type="button" onClick={onTutup} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* Pemilih ukuran kertas */}
        <div className="flex items-center gap-2 px-5 pt-4 flex-wrap">
          <span className="text-[11px] text-gray-500">Ukuran kertas:</span>
          <select
            value={ukuranKertas}
            onChange={(e) => setUkuranKertas(e.target.value)}
            className="text-[11px] border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
          >
            {Object.entries(UKURAN_KERTAS).map(([key, u]) => (
              <option key={key} value={key}>{u.label}</option>
            ))}
          </select>
        </div>

        {editableChecklist && (
          <p className="px-5 pt-2 text-[11px] text-gray-500">
            Isi Telaah Resep &amp; Informasi Obat langsung pada tabel di lembar: klik Ya atau Tidak.
            Klik centang untuk membatalkan. Tekan &quot;Simpan Checklist&quot; agar tersimpan.
          </p>
        )}

        {/* Area preview: dibungkus supaya ukuran & proporsi identik dengan hasil cetak,
            hanya diskalakan (transform: scale) agar muat di modal — bukan diubah layoutnya. */}
        <div className="p-4 flex justify-center overflow-x-auto" ref={areaRef}>
          <div
            style={{
              width: lebarPxAsli * skalaPreview,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: lebarPxAsli,
                transform: `scale(${skalaPreview})`,
                transformOrigin: 'top center',
              }}
            >
              <LembarResepKertas
                {...props}
                editableChecklist={editableChecklist}
                onChangeTelaah={onChangeTelaah}
                onChangeInformasi={onChangeInformasi}
                ukuranKertas={ukuranKertas}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-3 border-t bg-white rounded-b-2xl">
          <button
            type="button"
            onClick={onTutup}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
          >
            Tutup
          </button>
          {editableChecklist && (
            <button
              type="button"
              onClick={onSimpanChecklist}
              disabled={menyimpanChecklist}
              className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {menyimpanChecklist ? 'Menyimpan...' : '💾 Simpan Checklist'}
            </button>
          )}
          <button
            type="button"
            onClick={bukaPratinjauEtiket}
            className="flex-1 py-2 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 text-sm font-semibold"
          >
            🏷️ Etiket
          </button>
          <button
            type="button"
            onClick={cetak}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
          >
            🖨️ Cetak
          </button>
        </div>
      </div>

      {pratinjauEtiket && (() => {
        const { etiket, css, lebarEtiket, jumlah } = buatHtmlEtiket()
        const lebarPx = mmToPx(lebarEtiket)
        const skalaEt = Math.min(1, 300 / lebarPx)
        return (
          <div
            className="fixed inset-0 bg-black/60 z-[60] flex items-start justify-center overflow-y-auto p-4"
            onClick={(e) => { e.stopPropagation(); setPratinjauEtiket(false) }}
          >
            <div
              className="bg-gray-100 rounded-2xl shadow-xl w-full max-w-sm my-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b bg-white rounded-t-2xl">
                <h3 className="text-sm font-semibold text-gray-800">Pratinjau Etiket ({jumlah} obat)</h3>
                <button type="button" onClick={() => setPratinjauEtiket(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>

              <div className="flex items-center gap-2 px-5 pt-4">
                <span className="text-[11px] text-gray-500">Ukuran kertas:</span>
                <select
                  value={ukuranEtiket}
                  onChange={(e) => setUkuranEtiket(e.target.value)}
                  className="text-[11px] border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
                  aria-label="Ukuran kertas etiket"
                >
                  <option value="thermal58">Thermal 58 mm</option>
                  <option value="thermal80">Thermal 80 mm</option>
                </select>
              </div>

              <div className="p-4 flex justify-center overflow-x-auto">
                <div style={{ width: lebarPx * skalaEt }}>
                  <div style={{ width: lebarPx, transform: `scale(${skalaEt})`, transformOrigin: 'top left' }}>
                    <style>{css}</style>
                    <div
                      className="etiket-area"
                      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                      dangerouslySetInnerHTML={{ __html: etiket }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 px-5 py-3 border-t bg-white rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setPratinjauEtiket(false)}
                  className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  onClick={cetakEtiket}
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                >
                  🖨️ Cetak Etiket
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}