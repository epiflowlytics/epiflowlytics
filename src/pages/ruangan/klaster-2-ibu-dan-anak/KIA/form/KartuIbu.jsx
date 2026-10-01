import { analisisBB, hitungHPL, hpEfektif, kkEfektif, pertama, ringkasLab, ringkasTindakan, tglIndo, tglPendek, toNum } from './FormANC'

// KartuIbu — tampilan Kartu Ibu yang meniru kartu kertas Puskesmas (A4 portrait, bisa dicetak).
// Komponen tampilan saja; data dimuat di DashboardKIA.
//
// Props:
//   kehamilan : state kehamilan (hasil kehamilanDariRow)
//   pasien    : objek pasien (nama_lengkap, tanggal_lahir, no_rekam_medis, no_nik, no_kk, no_telepon, alamat,
//               pekerjaan, pendidikan, no_bpjs, kategori_pasien, golongan_darah, kelurahan)
//   instansi  : { nama, nama_pemerintah, nama_dinas, alamat, email, logo_url } (boleh null)
//   kunjungan : baris pemeriksaan_anc + kunjungan:kunjungan_id(tanggal_periksa, paraf, skrining(...))
//   onTutup   : fungsi tutup

const MIN_BARIS = 8

const CSS = `
.kartu-ibu-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); overflow: auto; padding: 24px; z-index: 1000; }
.kartu-ibu-area { background: #fff; color: #000; max-width: 820px; margin: 0 auto; padding: 24px; border-radius: 8px; font-size: 10px; line-height: 1.35; }
.kartu-ibu-area .kotak { border: 1px solid #000; padding: 3px 6px; }
.kartu-ibu-area .f { display: flex; gap: 3px; margin: 1px 0; }
.kartu-ibu-area .f .l { flex: 0 0 auto; width: 118px; }
.kartu-ibu-area .f .c { flex: 0 0 6px; }
.kartu-ibu-area .f .v { flex: 1; min-width: 0; word-break: break-word; font-weight: 600; }
.kartu-ibu-area table.tabel { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 10px; }
.kartu-ibu-area table.tabel th, .kartu-ibu-area table.tabel td { border: 1px solid #000; padding: 2px 3px; vertical-align: top; text-align: left; word-break: break-word; }
.kartu-ibu-area table.tabel th { text-align: center; font-weight: 600; font-size: 8.5px; vertical-align: middle; }
.kartu-ibu-area table.tabel tbody tr { height: 46px; page-break-inside: avoid; }
.kartu-ibu-area table.tabel thead { display: table-header-group; }
.kartu-ibu-area .kecil { font-size: 8px; }
.kartu-ibu-area .peringatan { color: #b42318; font-weight: 700; }
.kartu-ibu-area .tengah { text-align: center !important; }
@media print {
  body * { visibility: hidden !important; }
  .kartu-ibu-area, .kartu-ibu-area * { visibility: visible !important; }
  .kartu-ibu-overlay { position: static !important; background: none !important; padding: 0 !important; overflow: visible !important; }
  .kartu-ibu-area { position: absolute; left: 0; top: 0; width: 100%; max-width: none; padding: 0; border-radius: 0; }
  .kartu-ibu-area .peringatan { color: #000; }
  .no-print { display: none !important; }
  @page { size: A4 portrait; margin: 8mm; }
}
`

const kosong = (v) => v === '' || v === null || v === undefined

function F({ l, v, w }) {
  return (
    <div className="f">
      <span className="l" style={w ? { width: w } : undefined}>
        {l}
      </span>
      <span className="c">:</span>
      <span className="v">{kosong(v) ? '' : v}</span>
    </div>
  )
}

const gabung = (a, b, pemisah = ' / ') => [a, b].filter((x) => !kosong(x)).join(pemisah)

export default function KartuIbu({ kehamilan: k, pasien, instansi, kunjungan = [], onTutup }) {
  const p = pasien ?? {}

  // kunjungan urut tanggal + data skrining (TD, BB)
  const dengan = [...kunjungan]
    .sort((a, b) => (a.kunjungan?.tanggal_periksa ?? '').localeCompare(b.kunjungan?.tanggal_periksa ?? ''))
    .map((r) => {
      const sk = pertama(r.kunjungan?.skrining)
      return { r, sk, tanggal: r.kunjungan?.tanggal_periksa ?? '', bb: toNum(sk?.berat_badan) }
    })

  const titikBB = dengan.filter((d) => d.tanggal && d.bb !== null).map((d) => ({ tanggal: d.tanggal, bb: d.bb }))
  const analisis = analisisBB(toNum(k.bb_sebelum_hamil), titikBB, k.hpht)
  const analisisPerTanggal = Object.fromEntries(analisis.map((a) => [a.tanggal, a]))

  // dari kunjungan pertama: keluhan awal dan LiLA; golongan darah: data pasien, atau hasil lab terakhir
  const keluhanAwal = dengan.find((d) => d.r.keluhan)?.r.keluhan ?? ''
  const lilaAwal = dengan.find((d) => !kosong(d.r.lila_cm))?.r.lila_cm ?? ''
  const golDarah = p.golongan_darah || [...dengan].reverse().find((d) => d.r.golongan_darah)?.r.golongan_darah || ''

  const hpl = hitungHPL(k.hpht)
  const kosongan = Math.max(0, MIN_BARIS - dengan.length)
  const S = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }

  return (
    <div className="kartu-ibu-overlay">
      <style>{CSS}</style>
      <div className="kartu-ibu-area">
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: 'var(--accent, #0f7b64)', color: '#fff', cursor: 'pointer' }}
          >
            Cetak
          </button>
          <button
            type="button"
            onClick={onTutup}
            style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
          >
            Tutup
          </button>
        </div>

        {/* kop */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '2px solid #000', paddingBottom: 6 }}>
          <div style={{ width: 72, flex: '0 0 72px' }}>
            {instansi?.logo_url && <img src={instansi.logo_url} alt="" style={{ height: 60, width: 'auto', maxWidth: 72 }} />}
          </div>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, lineHeight: 1.4, textTransform: 'uppercase' }}>
            {instansi?.nama_pemerintah && <div style={{ fontSize: 11 }}>{instansi.nama_pemerintah}</div>}
            {instansi?.nama_dinas && <div style={{ fontSize: 11 }}>{instansi.nama_dinas}</div>}
            <div style={{ fontSize: 11 }}>{instansi?.nama ?? 'PUSKESMAS'}</div>
            {instansi?.alamat && <div style={{ fontSize: 9.5, textTransform: 'none' }}>{instansi.alamat}</div>}
            {instansi?.email && <div style={{ fontSize: 9.5, textTransform: 'none' }}>Email : {instansi.email}</div>}
          </div>
          <div style={{ width: 72, flex: '0 0 72px' }} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, margin: '10px 0' }}>KARTU IBU</div>

        {/* identitas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 12, marginBottom: 4 }}>
          <div>
            <F l="Nomor RM" v={p.no_rekam_medis} w={70} />
            <F l="No Register" v={k.no_register} w={70} />
            <div style={{ display: 'flex', gap: 6 }}>
              <b style={{ width: 70, flex: '0 0 70px' }}>Identitas</b>
              <div style={{ flex: 1 }}>
                <F l="NIK Istri" v={p.no_nik} w={52} />
                <F l="NIK Suami" v={k.suami_nik || p.suami_rm?.no_nik} w={52} />
              </div>
            </div>
          </div>
          <div>
            <F l="No. Hp" v={hpEfektif(k, p)} w={70} />
            <F l="Kohor" v={k.kohor} w={70} />
            <F l="No. KK" v={kkEfektif(k, p)} w={70} />
          </div>
        </div>

        <div className="kotak" style={{ ...S, columnGap: 16 }}>
          <div>
            <F l="Nama Ibu/ Tgl Lahir" v={gabung(p.nama_lengkap, tglIndo(p.tanggal_lahir))} />
            <F l="Nama Suami/ Tgl Lahir" v={gabung(k.suami_nama, tglIndo(k.suami_tanggal_lahir))} />
            <F l="Alamat / HP" v={gabung(p.alamat, hpEfektif(k, p))} />
            <F l="Kelurahan" v={p.kelurahan} />
            <F l="Puskesmas" v={instansi?.nama} />
          </div>
          <div>
            <F l="Pekerjaan / Pendidikan" v={gabung(p.pekerjaan, p.pendidikan)} w={112} />
            <F l="Pekerjaan / Pendidikan" v={gabung(k.suami_pekerjaan, k.suami_pendidikan)} w={112} />
            <F l="Posyandu" v={k.posyandu} w={112} />
            <F l="Jaminan/ BPJS" v={gabung(p.kategori_pasien, p.no_bpjs)} w={112} />
            <F l="GOL. Darah" v={golDarah} w={112} />
          </div>
        </div>

        <div className="kotak" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr', marginTop: 6 }}>
          <F l="Tinggi Badan" v={kosong(k.tinggi_badan_cm) ? '' : `${k.tinggi_badan_cm} cm`} w={70} />
          <F l="Lila" v={kosong(lilaAwal) ? '' : `${lilaAwal} cm`} w={30} />
          <F l="BB Sebelum Hamil" v={kosong(k.bb_sebelum_hamil) ? '' : `${k.bb_sebelum_hamil} kg`} w={90} />
        </div>

        {/* pengamatan kehamilan / anamnesa */}
        <div style={{ fontWeight: 700, margin: '10px 0 3px' }}>PENGAMATAN KEHAMILAN/ ANAMNESA</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
          <div>
            <div className="kotak">
              <div>1. Fungsi Reproduksi</div>
              <div style={{ paddingLeft: 14 }}>
                <F l="HPHT" v={tglIndo(k.hpht)} w={40} />
                <F l="HTP" v={tglIndo(hpl)} w={40} />
              </div>
              <div>2. Kehamilan Sekarang</div>
              <div style={{ paddingLeft: 14 }}>
                <F l="Keluhan" v={keluhanAwal} w={40} />
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <tbody>
                <tr>
                  <td colSpan={2} style={{ border: '1px solid #000', padding: '2px 4px' }}>
                    Rencana Persalinan
                  </td>
                </tr>
                {[
                  [['Tanggal', tglIndo(k.rencana_tanggal)], ['Penolong', k.rencana_penolong]],
                  [['Tempat', k.rencana_tempat], ['Pendamping', k.rencana_pendamping]],
                  [['Transportasi', k.rencana_transportasi], ['Pendonor', k.rencana_pendonor]],
                ].map((baris, i) => (
                  <tr key={i}>
                    {baris.map(([l, v]) => (
                      <td key={l} style={{ border: '1px solid #000', padding: '2px 4px', height: 16 }}>
                        <F l={l} v={v} w={l === 'Transportasi' ? 62 : 54} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="kotak">
            <div>3. Riwayat Observasi</div>
            <div style={{ display: 'flex', gap: 24, paddingLeft: 30, margin: '2px 0' }}>
              <span>G <b>{k.gravida}</b></span>
              <span>P <b>{k.para}</b></span>
              <span>A <b>{k.abortus}</b></span>
            </div>
            <F l="Jumlah Anak Hidup" v={k.jumlah_anak_hidup} w={122} />
            <F l="Jumlah Anak Mati" v={k.jumlah_anak_mati} w={122} />
            <F l="Jarak Persalinan Terakhir" v={k.jarak_persalinan_terakhir} w={122} />
            <F l="Penolong Persalinan Terakhir" v={k.penolong_persalinan_terakhir} w={122} />
            <F l="Cara Persalinan Terakhir" v={k.cara_persalinan_terakhir || 'Normal/SC/Vacum/.........'} w={122} />
            <F l="Penggunaan KB sebelum kehamilan" v={k.kb_sebelum_hamil} w={122} />
          </div>
        </div>

        {/* tabel kunjungan */}
        <table className="tabel">
          <colgroup>
            {[7, 15, 7, 6, 7, 6, 6, 6, 9, 8, 15, 8].map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ height: 40 }}>
              <th>TGL</th>
              <th>KELUHAN SEKARANG</th>
              <th>Tekanan Darah (mmHg)</th>
              <th>BB (KG)</th>
              <th>UMUR KEHAMILAN (MINGGU)</th>
              <th>TINGGI FUNDUS (CM)</th>
              <th>LETAK KEPALA KEP/SU/LI</th>
              <th>DENYUT JANTUNG JANIN</th>
              <th>LAB</th>
              <th>PEMERIKSAAN KHUSUS</th>
              <th>TINDAKAN DAN TERAPI (TT,FE,RUJUKAN)</th>
              <th>PARAF</th>
            </tr>
          </thead>
          <tbody>
            {dengan.map(({ r, sk, tanggal }) => {
              const a = analisisPerTanggal[tanggal]
              const lab = ringkasLab(r)
              const tindakan = ringkasTindakan(r)
              return (
                <tr key={r.id}>
                  <td>{tglPendek(tanggal)}</td>
                  <td>{r.keluhan}</td>
                  <td className="tengah">{sk?.tekanan_darah}</td>
                  <td className="tengah">
                    {a ? a.bb : ''}
                    {a && a.delta !== null && (
                      <div className="kecil">
                        ({a.delta > 0 ? '+' : ''}
                        {a.delta})
                      </div>
                    )}
                    {a && a.penanda.length > 0 && <div className="kecil peringatan">{a.penanda.join(', ')}</div>}
                  </td>
                  <td className="tengah">{r.usia_kehamilan_minggu}</td>
                  <td className="tengah">{r.tfu_cm}</td>
                  <td className="tengah">{r.presentasi}</td>
                  <td className="tengah">{r.djj}</td>
                  <td>{lab}</td>
                  <td>{r.pemeriksaan_khusus}</td>
                  <td>{tindakan}</td>
                  <td>{r.kunjungan?.paraf}</td>
                </tr>
              )
            })}
            {Array.from({ length: kosongan }).map((_, i) => (
              <tr key={`k${i}`}>
                {Array.from({ length: 12 }).map((__, j) => (
                  <td key={j} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="no-print" style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
          Kartu menampilkan kunjungan ANC yang sudah tersimpan. Keluhan awal dan LiLA di bagian atas diambil dari kunjungan pertama.
        </div>
      </div>
    </div>
  )
}