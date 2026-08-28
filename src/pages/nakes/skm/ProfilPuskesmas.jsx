import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'

// ═══════════════════════════════════════════════════════════════════════════
// Halaman Profil Publik Puskesmas
// Gaya visual mengikuti template "Puskesmas Bontolempangan" (HTML rujukan):
// header hijau, hero dengan overlay foto, section-title berbentuk pil,
// kartu berita bertag kategori + filter, grid layanan, tabel standar
// pelayanan, blok visi/misi 2 kolom, blok survei dengan QR code, dan
// kontak cepat (WA/IG/FB/Email).
// Halaman ini generik: dipakai semua instansi, ditentukan dari :kode di URL.
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PROFIL = {
  nama: 'Memuat…',
  tagline: 'Melayani dengan Sepenuh Hati',
  logo: '',
  alamat: '-',
  telepon: '-',
  email: '-',
  jam_operasional: 'Senin – Jumat: 08.00 – 16.00\nSabtu: 08.00 – 12.00',
  kepala_puskesmas: '-',
  nip_kepala: '-',
  foto_kepala: '',
  staf: '',                 // JSON: [{id, nama, nip, profesi, foto}]
  visi: '-',
  misi: '',                 // baris per poin
  tata_nilai: '',           // baris per nilai (mis. tata nilai MINASATA)
  motto: '',
  maklumat: '',             // maklumat pelayanan (kalimat panjang)
  layanan: '',              // JSON: [{label, ikon, jadwal}] atau string lama
  standar_pelayanan: '',    // JSON: [{klaster, layanan, waktu, biaya}]
  standar_pelayanan_pdf: '',// URL PDF standar pelayanan (opsional)
  berita: '',                // JSON: [{judul, ringkasan, tanggal, kategori, gambar}]
  gambar_hero: '',
  link_survei_skm: '',
  instagram: '',
  facebook: '',
  whatsapp: '',
  youtube: '',
  warna_primer: '#1a7a3a',
  warna_sekunder: '#0f5a2a',
}

// ─── Helper ───────────────────────────────────────────────────────────────
function safeJSON(str, fallback = []) {
  if (!str) return fallback
  try {
    const parsed = JSON.parse(str)
    return Array.isArray(parsed) ? parsed : fallback
  } catch { return fallback }
}

function formatTanggal(str) {
  if (!str) return ''
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function hexToRgba(hex, alpha) {
  const h = (hex || '#1a7a3a').replace('#', '')
  const bigint = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16)
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ─── Kategori berita: warna & label ─────────────────────────────────────
const KATEGORI_WARNA = {
  'Program':           '#FF9800',
  'Kegiatan':          '#4CAF50',
  'Artikel Kesehatan': '#2196F3',
  'Pengumuman':        '#F44336',
  'Prestasi':          '#9C27B0',
  'Umum':              '#6c757d',
}
const DAFTAR_KATEGORI = ['Semua', 'Program', 'Kegiatan', 'Artikel Kesehatan']

function warnaKategori(kat) {
  return KATEGORI_WARNA[kat] || KATEGORI_WARNA['Umum']
}

// ─── Ikon SVG ringan (dipakai di luar konteks emoji) ────────────────────
function Icon({ d, size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" className={className} style={style}>
      <path d={d} />
    </svg>
  )
}
const ICONS = {
  map:     'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z',
  phone:   'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  mail:    'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  clock:   'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v5l4 2',
  user:    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  check:   'M20 6L9 17l-5-5',
  qrcode:  'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14h1v1h-1z M14 20h1v1h-1z M20 20h1v1h-1z M17 17h1v1h-1z',
}

// ─── Komponen: Section Title (pil hijau seperti referensi) ──────────────
function SectionTitle({ emoji, children, warna, id }) {
  return (
    <h2 id={id} className="text-[1.9rem] font-bold my-11 mt-8 relative"
      style={{ color: 'var(--sek)', scrollMarginTop: 100 }}>
      <span className="inline-block rounded-full px-3 py-0.5"
        style={{ background: 'var(--bgpil)' }}>
        {emoji} {children}
      </span>
    </h2>
  )
}
function Divider() {
  return <div className="w-[70px] h-1 rounded-full mb-5" style={{ background: 'var(--warna)', marginTop: 8 }} />
}

// ─── Komponen: Kartu Berita bertag kategori ─────────────────────────────
function KartuBerita({ judul, ringkasan, tanggal, kategori, gambar, warna }) {
  const [buka, setBuka] = useState(false)
  const katWarna = warnaKategori(kategori)
  return (
    <article
      className="bg-white rounded-[24px] overflow-hidden border transition-all cursor-pointer group"
      style={{ borderColor: '#e8f0eb', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
      onClick={() => setBuka(!buka)}
    >
      <div className="w-full h-[190px] relative flex items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)' }}>
        {gambar
          ? <img src={gambar} alt={judul} className="w-full h-full object-cover" />
          : <span className="text-5xl opacity-40">📰</span>}
        <span className="absolute top-3 left-3 px-4 py-1.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wide text-white"
          style={{ background: katWarna, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
          {kategori || 'Umum'}
        </span>
      </div>
      <div className="px-[22px] pt-5 pb-6">
        <div className="text-[0.8rem] mb-1.5 flex items-center gap-1.5" style={{ color: '#6d8fa5' }}>
          <Icon d={ICONS.clock} size={13} /> {formatTanggal(tanggal)}
        </div>
        <h3 className="text-[1.12rem] font-bold mb-2 leading-snug" style={{ color: warna || '#0f5a2a' }}>
          {judul}
        </h3>
        <p className="text-[0.92rem] leading-relaxed mb-3.5" style={{ color: '#3b5e74' }}>
          {buka || (ringkasan?.length ?? 0) <= 130
            ? ringkasan
            : ringkasan.substring(0, 130) + '…'}
        </p>
        <div className="flex items-center justify-between border-t pt-3.5" style={{ borderColor: '#edf3ef' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setBuka(!buka) }}
            className="font-semibold text-[0.9rem] inline-flex items-center gap-1.5 transition-all"
            style={{ color: warna }}>
            {buka ? 'Sembunyikan' : 'Baca selengkapnya'} <span>→</span>
          </button>
        </div>
      </div>
    </article>
  )
}

// ─── Komponen: Kartu Layanan (grid ikon) ────────────────────────────────
function KartuLayanan({ label, jadwal, warna }) {
  return (
    <div className="bg-white rounded-[20px] px-3 py-[22px] text-center border transition-transform hover:-translate-y-1"
      style={{ borderColor: '#e7f0e8', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div className="inline-flex items-center justify-center rounded-full mb-2.5"
        style={{ width: 52, height: 52, background: warna + '18', color: warna }}>
        <Icon d={ICONS.check} size={22} />
      </div>
      <h5 className="font-semibold text-sm" style={{ color: '#153e54' }}>{label}</h5>
      {jadwal && <small className="block text-xs mt-0.5" style={{ color: '#456d84' }}>{jadwal}</small>}
    </div>
  )
}

// ─── Komponen: Kartu Staf ────────────────────────────────────────────────
function KartuStaf({ nama, nip, profesi, foto, warna }) {
  return (
    <div className="flex flex-col items-center text-center rounded-2xl p-5 bg-white border"
      style={{ borderColor: '#e7f0e8' }}>
      <div className="w-20 h-[6.67rem] rounded-lg overflow-hidden flex items-center justify-center mb-3 flex-shrink-0"
        style={{ background: warna + '20' }}>
        {foto
          ? <img src={foto} alt={nama} className="w-full h-full object-cover" />
          : <Icon d={ICONS.user} size={30} style={{ color: warna }} />}
      </div>
      <p className="font-bold text-sm">{nama || '-'}</p>
      {profesi && <p className="text-xs mt-0.5" style={{ color: warna }}>{profesi}</p>}
      {nip && <p className="text-xs mt-1" style={{ color: '#6b7f8a' }}>NIP: {nip}</p>}
    </div>
  )
}

// ─── Komponen Utama ──────────────────────────────────────────────────────
export default function ProfilPuskesmas() {
  const { kode } = useParams()
  const [profil, setProfil] = useState(DEFAULT_PROFIL)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [filterBerita, setFilterBerita] = useState('Semua')

  useEffect(() => {
    fetchProfil()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kode])

  async function fetchProfil() {
    setLoading(true)
    setNotFound(false)
    setProfil(DEFAULT_PROFIL)

    if (!kode) { setNotFound(true); setLoading(false); return }

    const { data } = await supabase
      .from('profil_puskesmas_publik')
      .select('*')
      .eq('kode', kode)
      .single()

    if (data) setProfil({ ...DEFAULT_PROFIL, ...data })
    else setNotFound(true)
    setLoading(false)
  }

  const layananRaw = safeJSON(profil.layanan, [])
  // dukung format lama (array string) & format baru (array objek {label, jadwal})
  const layanan = layananRaw.map(l => typeof l === 'string' ? { label: l, jadwal: '' } : l)

  const berita = safeJSON(profil.berita, [])
  const beritaTampil = filterBerita === 'Semua'
    ? berita
    : berita.filter(b => (b.kategori || 'Umum') === filterBerita)

  const standar = safeJSON(profil.standar_pelayanan, [])
  const staf = safeJSON(profil.staf, [])
  const misiList = profil.misi ? profil.misi.split('\n').filter(Boolean) : []
  const nilaiList = profil.tata_nilai ? profil.tata_nilai.split('\n').filter(Boolean) : []
  const jamList = profil.jam_operasional ? profil.jam_operasional.split('\n').filter(Boolean) : []

  const warna = profil.warna_primer || '#1a7a3a'
  const warnaSek = profil.warna_sekunder || '#0f5a2a'

  const cssVars = useMemo(() => ({
    '--warna': warna,
    '--sek': warnaSek,
    '--bgpil': hexToRgba(warna, 0.1),
  }), [warna, warnaSek])

  const sosmed = [
    profil.whatsapp && { key: 'wa', href: `https://wa.me/${profil.whatsapp.replace(/\D/g, '')}`, label: 'WhatsApp', icon: '💬', color: '#25D366' },
    profil.instagram && { key: 'ig', href: profil.instagram, label: 'Instagram', icon: '📷', color: '#E4405F' },
    profil.facebook && { key: 'fb', href: profil.facebook, label: 'Facebook', icon: '📘', color: '#1877f2' },
    profil.youtube && { key: 'yt', href: profil.youtube, label: 'YouTube', icon: '▶️', color: '#FF0000' },
    profil.email && profil.email !== '-' && { key: 'email', href: `mailto:${profil.email}`, label: 'Email', icon: '✉️', color: warna },
  ].filter(Boolean)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-t-transparent mx-auto mb-3 animate-spin"
            style={{ borderColor: warna, borderTopColor: 'transparent' }} />
          <p style={{ color: '#6b7f8a' }}>Memuat profil puskesmas…</p>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold mb-2">Halaman Tidak Ditemukan</h1>
          <p className="text-sm" style={{ color: '#6b7f8a' }}>
            Profil untuk instansi "{kode}" belum tersedia atau tidak ditemukan.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ ...cssVars, background: '#f0f7f2', color: '#1e2b3b' }}>

      {/* ── Header Top (kontak cepat) ─────────────────────────────────── */}
      <div className="text-white text-[0.9rem] py-3.5" style={{ background: warna }}>
        <div className="max-w-[1300px] mx-auto px-5 flex flex-wrap justify-between items-center gap-2.5">
          {profil.alamat && profil.alamat !== '-' && (
            <div className="flex items-center gap-1.5">
              <Icon d={ICONS.map} size={14} /> <span className="truncate max-w-[70vw] sm:max-w-none">{profil.alamat}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {sosmed.map(s => (
              <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
                title={s.label}
                className="inline-flex items-center justify-center rounded-full text-sm w-8 h-8"
                style={{ background: s.color }}>
                {s.icon}
              </a>
            ))}
            {profil.telepon && profil.telepon !== '-' && (
              <span className="ml-1 inline-flex items-center gap-1.5">
                <Icon d={ICONS.phone} size={13} /> {profil.telepon}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Header Utama (logo + nav) ─────────────────────────────────── */}
      <header className="bg-white py-4 sticky top-0 z-30" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div className="max-w-[1300px] mx-auto px-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            {profil.logo && (
              <img src={profil.logo} alt="Logo" className="w-10 h-10 rounded-full object-cover" />
            )}
            <div>
              <h1 className="text-[1.5rem] sm:text-[1.7rem] font-bold tracking-wide leading-tight" style={{ color: warna }}>
                {profil.nama}
              </h1>
              {profil.tagline && (
                <span className="inline-block text-[0.8rem] sm:text-[0.85rem] font-medium px-3 py-0.5 rounded-full mt-0.5"
                  style={{ color: '#1e5a78', background: hexToRgba(warna, 0.1) }}>
                  ♥ {profil.tagline}
                </span>
              )}
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 items-center text-sm font-medium">
            {[
              ['#berita', 'Berita'], ['#layanan', 'Layanan'], ['#standar', 'Standar'],
              ['#visi', 'Visi & Misi'], ['#survei', 'Survei'], ['#kontak', 'Kontak'],
            ].map(([href, label]) => (
              <a key={href} href={href}
                className="pb-1 border-b-2 border-transparent hover:border-current transition-colors"
                style={{ color: '#1e3d4f' }}
                onMouseEnter={e => { e.currentTarget.style.color = warna }}
                onMouseLeave={e => { e.currentTarget.style.color = '#1e3d4f' }}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-[1300px] mx-auto px-5">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-b-[40px] mb-8 text-white"
          style={{ minHeight: 380 }}>
          <div className="absolute inset-0"
            style={{
              backgroundImage: profil.gambar_hero ? `url(${profil.gambar_hero})` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.7,
            }} />
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
          <div className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${hexToRgba(warna, 0.6)} 0%, ${hexToRgba(warnaSek, 0.4)} 100%)` }} />
          <div className="relative z-10 px-6 sm:px-10 py-12 sm:py-16 flex flex-col items-start max-w-2xl">
            <h2 className="text-3xl sm:text-[2.4rem] font-bold mb-3 leading-tight" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.3)' }}>
              {profil.tagline ? `Sehat Bersama ${profil.nama}` : profil.nama}
            </h2>
            <p className="text-base sm:text-[1.1rem] opacity-95 mb-5" style={{ textShadow: '0 1px 15px rgba(0,0,0,0.3)' }}>
              Pelayanan kesehatan yang profesional, terjangkau, dan ramah untuk seluruh masyarakat.
            </p>
          </div>
        </section>

        {/* ── BERITA / PROGRAM / KEGIATAN / ARTIKEL KESEHATAN ───────────── */}
        <div id="berita" style={{ scrollMarginTop: 100 }}>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-0">
            <SectionTitle emoji="📰" warna={warna}>Berita & Aktivitas</SectionTitle>
            <div className="flex flex-wrap gap-2.5 mb-8">
              {DAFTAR_KATEGORI.map(k => {
                const aktif = filterBerita === k
                const c = k === 'Semua' ? warna : warnaKategori(k)
                return (
                  <button key={k} onClick={() => setFilterBerita(k)}
                    className="px-5 py-1.5 rounded-full text-[0.85rem] font-semibold border-2 transition-all"
                    style={{
                      borderColor: c,
                      background: aktif ? c : 'white',
                      color: aktif ? 'white' : c,
                      boxShadow: aktif ? '0 4px 15px rgba(0,0,0,0.15)' : 'none',
                    }}>
                    {k}
                  </button>
                )
              })}
            </div>
          </div>

          {beritaTampil.length > 0 ? (
            <div className="grid gap-6 mb-9"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              {beritaTampil.map((b, i) => (
                <KartuBerita key={i} {...b} warna={warna} />
              ))}
            </div>
          ) : (
            <div className="text-center py-10 rounded-2xl bg-white border mb-9" style={{ borderColor: '#e7f0e8', color: '#6b7f8a' }}>
              <p className="text-sm">Belum ada berita untuk kategori ini.</p>
            </div>
          )}
        </div>

        {/* ── Quick Info Grid ─────────────────────────────────────────── */}
        {jamList.length > 0 && (
          <div className="grid gap-5 mb-10" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="bg-white rounded-[20px] px-[18px] py-5 border-l-[5px]" style={{ borderColor: warna, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <div className="text-[2rem] mb-1.5" style={{ color: warna }}><Icon d={ICONS.clock} size={30} /></div>
              <h4 className="font-semibold mb-1">Jam Operasional</h4>
              {jamList.map((j, i) => <p key={i} className="text-sm" style={{ color: '#3b5e74' }}>{j}</p>)}
            </div>
          </div>
        )}

        {/* ── LAYANAN UNGGULAN ───────────────────────────────────────── */}
        {layanan.length > 0 && (
          <div id="layanan" style={{ scrollMarginTop: 100 }}>
            <SectionTitle emoji="⚕️" warna={warna}>Layanan Unggulan</SectionTitle>
            <Divider />
            <div className="grid gap-[18px] mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {layanan.map((l, i) => (
                <KartuLayanan key={i} label={l.label} jadwal={l.jadwal} warna={warna} />
              ))}
            </div>
            {profil.maklumat && (
              <div className="rounded-full px-5 py-4 text-center text-white font-medium text-[0.95rem] mb-8"
                style={{ background: warna }}>
                🤝 {profil.maklumat}
              </div>
            )}
          </div>
        )}

        {/* ── STANDAR PELAYANAN ─────────────────────────────────────── */}
        {standar.length > 0 && (
          <div id="standar" style={{ scrollMarginTop: 100 }}>
            <SectionTitle emoji="📋" warna={warna}>Standar Pelayanan</SectionTitle>
            <Divider />
            {profil.standar_pelayanan_pdf && (
              <div className="flex justify-end mb-3">
                <a href={profil.standar_pelayanan_pdf} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-white font-semibold text-[0.95rem] px-6 py-2.5 rounded-full"
                  style={{ background: '#dc3545', boxShadow: '0 4px 15px rgba(220,53,69,0.3)' }}>
                  📄 Lihat / Download PDF
                </a>
              </div>
            )}
            <div className="bg-white rounded-[24px] p-1 overflow-x-auto mb-8" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
              <table className="w-full text-sm" style={{ minWidth: 640, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Klaster', 'Layanan', 'Waktu', 'Biaya'].map(h => (
                      <th key={h} className="text-left font-semibold px-3.5 py-3.5"
                        style={{ background: hexToRgba(warna, 0.1), color: warnaSek }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {standar.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-3 border-b align-top" style={{ borderColor: '#e6eef3' }}>{s.klaster}</td>
                      <td className="px-3 py-3 border-b align-top" style={{ borderColor: '#e6eef3' }}>{s.layanan}</td>
                      <td className="px-3 py-3 border-b align-top" style={{ borderColor: '#e6eef3' }}>{s.waktu}</td>
                      <td className="px-3 py-3 border-b align-top" style={{ borderColor: '#e6eef3' }}>{s.biaya}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── VISI & MISI ────────────────────────────────────────────── */}
        {(profil.visi !== '-' || misiList.length > 0) && (
          <div id="visi" style={{ scrollMarginTop: 100 }}>
            <SectionTitle emoji="🎯" warna={warna}>Visi & Misi</SectionTitle>
            <Divider />
            <div className="grid md:grid-cols-2 gap-8 bg-white rounded-[30px] px-6 py-8 mb-8" style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
              <div>
                {profil.visi && profil.visi !== '-' && (
                  <>
                    <h4 className="text-[1.3rem] font-bold mb-2.5 flex items-center gap-2" style={{ color: warna }}>
                      <Icon d={ICONS.check} size={20} /> Visi
                    </h4>
                    <p className="text-[1.02rem] mb-4">{profil.visi}</p>
                  </>
                )}
                {misiList.length > 0 && (
                  <>
                    <h4 className="text-[1.1rem] font-bold mt-5 mb-2.5" style={{ color: warna }}>Misi</h4>
                    <ul className="space-y-1.5">
                      {misiList.map((m, i) => (
                        <li key={i} className="pl-7 relative text-sm">
                          <span className="absolute left-0 font-bold" style={{ color: warna }}>✓</span>
                          {m}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div>
                {nilaiList.length > 0 && (
                  <>
                    <h4 className="text-[1.1rem] font-bold mb-2.5" style={{ color: warna }}>Tata Nilai</h4>
                    <div className="flex flex-wrap gap-2.5">
                      {nilaiList.map((n, i) => (
                        <span key={i} className="text-sm font-medium px-4 py-1 rounded-full"
                          style={{ background: hexToRgba(warna, 0.1), color: warna }}>{n}</span>
                      ))}
                    </div>
                  </>
                )}
                {profil.motto && (
                  <p className="mt-4 italic text-sm" style={{ color: warnaSek }}>{profil.motto}</p>
                )}
                {profil.kepala_puskesmas && profil.kepala_puskesmas !== '-' && (
                  <div className="mt-4 rounded-full px-4 py-3 flex items-center gap-3"
                    style={{ background: hexToRgba(warna, 0.08) }}>
                    {profil.foto_kepala && (
                      <img src={profil.foto_kepala} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="text-sm">
                      <strong>Kepala Puskesmas:</strong> {profil.kepala_puskesmas}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TIM / STAF (opsional, tambahan) ───────────────────────── */}
        {staf.length > 0 && (
          <div className="mb-10">
            <SectionTitle emoji="👥" warna={warna}>Tim / Staf</SectionTitle>
            <Divider />
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {staf.map((s, i) => <KartuStaf key={s.id ?? i} {...s} warna={warna} />)}
            </div>
          </div>
        )}

        {/* ── SURVEI KEPUASAN MASYARAKAT ─────────────────────────────── */}
        {profil.link_survei_skm?.trim() && (
          <div id="survei" style={{ scrollMarginTop: 100 }}>
            <SectionTitle emoji="📋" warna={warna}>Survei Kepuasan Masyarakat</SectionTitle>
            <Divider />
            <div className="bg-white rounded-[30px] p-7 sm:p-9 mb-8 flex flex-col sm:flex-row items-center gap-8 justify-center"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
              <div className="text-5xl" style={{ color: warna }}>📋</div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(profil.link_survei_skm.trim())}`}
                alt="QR Survei Kepuasan Masyarakat"
                width={180} height={180}
                className="rounded-xl bg-white p-2 border flex-shrink-0"
                style={{ borderColor: '#e6eef3' }} />
              <div className="text-center sm:text-left">
                <p className="mb-2 text-sm"><strong>Scan QR Code</strong> atau klik tombol di bawah</p>
                <a href={profil.link_survei_skm.trim()} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 text-white font-bold text-[1.1rem] px-7 py-3.5 rounded-full"
                  style={{ background: warna }}>
                  ✍️ Isi Survei Sekarang
                </a>
                <p className="mt-3 text-xs" style={{ color: '#5e7e92' }}>⏱ Waktu pengerjaan ±3 menit</p>
              </div>
            </div>
          </div>
        )}

        {/* ── KONTAK ─────────────────────────────────────────────────── */}
        <div id="kontak" style={{ scrollMarginTop: 100 }}>
          <SectionTitle emoji="📞" warna={warna}>Hubungi Kami</SectionTitle>
          <Divider />
          <div className="bg-white rounded-[30px] px-7 py-8 mb-8" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            <div className="grid gap-6 text-center" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {profil.telepon && profil.telepon !== '-' && (
                <div>
                  <div className="text-[2.5rem] mb-1" style={{ color: warna }}><Icon d={ICONS.phone} size={40} /></div>
                  <h4 className="font-semibold mb-1" style={{ color: warnaSek }}>Telepon</h4>
                  <a href={`tel:${profil.telepon.replace(/\D/g, '')}`} className="text-[1.05rem]" style={{ color: '#1e3d4f' }}>
                    {profil.telepon}
                  </a>
                </div>
              )}
              {profil.email && profil.email !== '-' && (
                <div>
                  <div className="text-[2.5rem] mb-1" style={{ color: warna }}><Icon d={ICONS.mail} size={40} /></div>
                  <h4 className="font-semibold mb-1" style={{ color: warnaSek }}>Email</h4>
                  <a href={`mailto:${profil.email}`} className="text-[1.05rem] break-all" style={{ color: '#1e3d4f' }}>
                    {profil.email}
                  </a>
                </div>
              )}
              {profil.alamat && profil.alamat !== '-' && (
                <div>
                  <div className="text-[2.5rem] mb-1" style={{ color: warna }}><Icon d={ICONS.map} size={40} /></div>
                  <h4 className="font-semibold mb-1" style={{ color: warnaSek }}>Alamat</h4>
                  <p className="text-sm" style={{ color: '#1e3d4f' }}>{profil.alamat}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Kontak Cepat (tombol sosial media bulat) ─────────────────── */}
        {sosmed.length > 0 && (
          <div className="flex flex-wrap gap-4 justify-center rounded-full px-5 py-5 mb-8"
            style={{ background: hexToRgba(warna, 0.1) }}>
            {sosmed.map(s => (
              <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-white font-medium text-sm px-5 py-2 rounded-full transition-transform hover:scale-105"
                style={{ background: s.color }}>
                {s.icon} {s.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="text-[#d4e3ed] mt-10 py-9 rounded-t-[40px]" style={{ background: warnaSek }}>
        <div className="max-w-[1300px] mx-auto px-5 grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <div>
            <h5 className="text-white font-semibold mb-2.5">📍 Alamat</h5>
            <p className="text-sm">{profil.alamat}</p>
          </div>
          <div>
            <h5 className="text-white font-semibold mb-2.5">🕐 Jam Layanan</h5>
            {jamList.length > 0
              ? jamList.map((j, i) => <p key={i} className="text-sm">{j}</p>)
              : <p className="text-sm">-</p>}
          </div>
          <div>
            <h5 className="text-white font-semibold mb-2.5">📞 Kontak</h5>
            {profil.telepon && profil.telepon !== '-' && <p className="text-sm">📱 {profil.telepon}</p>}
            {profil.email && profil.email !== '-' && <p className="text-sm break-all">✉️ {profil.email}</p>}
          </div>
          {sosmed.length > 0 && (
            <div>
              <h5 className="text-white font-semibold mb-2.5">🔗 Ikuti Kami</h5>
              <div className="flex gap-2.5 flex-wrap">
                {sosmed.map(s => (
                  <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform"
                    style={{ background: s.color }}>
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
          )}
          {profil.link_survei_skm?.trim() && (
            <div>
              <h5 className="text-white font-semibold mb-2.5">🔲 Survei</h5>
              <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(profil.link_survei_skm.trim())}`}
                  alt="QR Survei" width={56} height={56}
                  className="rounded-lg bg-white p-1 flex-shrink-0" />
                <span className="text-xs opacity-90">Scan untuk isi survei kepuasan</span>
              </div>
            </div>
          )}
          <div className="col-span-full text-center border-t pt-5 mt-2.5 text-xs opacity-80"
            style={{ borderColor: '#2e8b57' }}>
            © {new Date().getFullYear()} {profil.nama} · Diberdayakan oleh EpiFlowLytics
          </div>
        </div>
      </footer>

      {/* ── Floating tombol survei ────────────────────────────────────── */}
      {profil.link_survei_skm?.trim() && (
        <a href={profil.link_survei_skm.trim()} target="_blank" rel="noopener noreferrer"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 text-white font-semibold text-sm px-5 py-3 rounded-full"
          style={{ background: warna, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          <Icon d={ICONS.qrcode} size={18} /> Survei
        </a>
      )}
    </div>
  )
}