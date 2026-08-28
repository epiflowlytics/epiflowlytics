import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { useAuth } from '../../../context/AuthContext'

// URL halaman profil publik, dibangun dari kode instansi yang sedang dibuka.
// Sesuai route di App.jsx: /puskesmas/:kode
const URL_PROFIL_PUBLIK = (kode) => `/puskesmas/${kode}`

const FORM_DEFAULT = {
  nama:              '',
  tagline:           'Melayani dengan Sepenuh Hati',
  logo:              '',
  alamat:            '',
  telepon:           '',
  email:             '',
  jam_operasional:   'Senin – Jumat: 08.00 – 16.00\nSabtu: 08.00 – 12.00',
  kepala_puskesmas:  '',
  nip_kepala:        '',
  foto_kepala:       '',
  staf:              '',   // raw JSON string: [{id, nama, nip, profesi, foto}]
  visi:              '',
  misi:              '',
  tata_nilai:        '',   // satu baris per nilai, mis. tata nilai MINASATA
  motto:             '',   // kalimat motto singkat, tampil di bawah tata nilai
  maklumat:          '',   // kalimat maklumat pelayanan
  layanan:           '',   // raw JSON string: [{label, jadwal}]
  standar_pelayanan: '',   // raw JSON string: [{klaster, layanan, waktu, biaya}]
  standar_pelayanan_pdf: '', // link PDF standar pelayanan (opsional)
  berita:            '',   // raw JSON string: [{judul, ringkasan, tanggal, kategori, gambar}]
  gambar_hero:       '',
  link_survei_skm:   '',   // link survei kepuasan masyarakat (misal dari skm.go.id) — QR digenerate otomatis
  instagram:         '',   // link profil instagram
  facebook:          '',   // link profil facebook
  whatsapp:          '',   // nomor WA (angka saja / dengan kode negara), mis. 6281234567890
  youtube:           '',   // link channel youtube
  warna_primer:      '#1a7a3a',
  warna_sekunder:    '#0f5a2a',
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function safeJSON(str, fallback = []) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// ─── Sub-komponen: Input tunggal ─────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
        {label}
      </label>
      {hint && <p className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>{hint}</p>}
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition ' +
  'focus:ring-2 focus:ring-green-500/40'
const inputStyle = {
  background: 'var(--bg)',
  border: '1.5px solid var(--line)',
  color: 'var(--text)',
}

// ─── Sub-komponen: uploader foto (Supabase Storage) ──────────────────────────
const BUCKET_FOTO = 'profil-puskesmas-foto'

function FotoUploader({ value, onChange, bentuk = 'potret', lebar = 90, tinggi = 120, ukuranMaksMb = 3, catatan }) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')

    if (!file.type.startsWith('image/')) {
      setErr('File harus berupa gambar.')
      return
    }
    if (file.size > ukuranMaksMb * 1024 * 1024) {
      setErr(`Ukuran gambar maksimal ${ukuranMaksMb}MB.`)
      return
    }

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from(BUCKET_FOTO)
      .upload(path, file, { cacheControl: '3600', upsert: false })

    if (upErr) {
      setErr('Gagal mengunggah: ' + upErr.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from(BUCKET_FOTO).getPublicUrl(path)
    onChange(data.publicUrl)
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const radius = bentuk === 'bulat' ? '9999px' : '0.5rem'
  const teksBantuan = catatan ?? 'JPG/PNG, maks. 3MB. Rasio foto 3:4 (potret) disarankan.'

  // ─── Mode lebar penuh (untuk gambar hero / banner) ─────────────────────
  if (bentuk === 'lebar') {
    return (
      <div className="space-y-2">
        <div
          className="w-full flex items-center justify-center overflow-hidden"
          style={{
            height: tinggi, borderRadius: '0.75rem',
            background: 'var(--bg)', border: '1.5px solid var(--line)',
          }}
        >
          {value
            ? <img src={value} alt="Gambar hero" className="w-full h-full object-cover" />
            : (
              <svg width={40} height={40} viewBox="0 0 24 24" fill="none"
                stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer"
            style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', color: 'var(--text)' }}>
            {uploading ? 'Mengunggah…' : (value ? 'Ganti Gambar' : 'Unggah Gambar')}
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              disabled={uploading} onChange={handleFile} />
          </label>
          {value && !uploading && (
            <button type="button" onClick={() => onChange('')}
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
              Hapus
            </button>
          )}
        </div>
        {err && <p className="text-xs" style={{ color: '#dc2626' }}>{err}</p>}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{teksBantuan}</p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{
          width: lebar, height: tinggi, borderRadius: radius,
          background: 'var(--bg)', border: '1.5px solid var(--line)',
        }}
      >
        {value
          ? <img src={value} alt="Foto" className="w-full h-full object-cover" />
          : (
            <svg width={lebar * 0.4} height={lebar * 0.4} viewBox="0 0 24 24" fill="none"
              stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
      </div>
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer"
            style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', color: 'var(--text)' }}>
            {uploading ? 'Mengunggah…' : (value ? 'Ganti Foto' : 'Unggah Foto')}
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              disabled={uploading} onChange={handleFile} />
          </label>
          {value && !uploading && (
            <button type="button" onClick={() => onChange('')}
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
              Hapus
            </button>
          )}
        </div>
        {err && <p className="text-xs" style={{ color: '#dc2626' }}>{err}</p>}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{teksBantuan}</p>
      </div>
    </div>
  )
}

// ─── Sub-komponen: editor daftar layanan ─────────────────────────────────────
// Setiap item: { label, jadwal }. Mendukung migrasi otomatis dari format lama (array string).
function EditorLayanan({ value, onChange }) {
  const raw = safeJSON(value, [])
  const list = raw.map(item => typeof item === 'string' ? { label: item, jadwal: '' } : item)

  function tambah() {
    onChange(JSON.stringify([...list, { label: '', jadwal: '' }]))
  }
  function ubahField(i, field, v) {
    const next = [...list]
    next[i] = { ...next[i], [field]: v }
    onChange(JSON.stringify(next))
  }
  function hapus(i) {
    onChange(JSON.stringify(list.filter((_, idx) => idx !== i)))
  }
  function pindah(i, arah) {
    const next = [...list]
    const j = i + arah
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(JSON.stringify(next))
  }

  return (
    <div className="space-y-2">
      {list.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex flex-col gap-1 pt-1">
            <button type="button" onClick={() => pindah(i, -1)}
              className="text-xs px-1.5 py-0.5 rounded" title="Naik"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>▲</button>
            <button type="button" onClick={() => pindah(i, 1)}
              className="text-xs px-1.5 py-0.5 rounded" title="Turun"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>▼</button>
          </div>
          <div className="flex-1 grid sm:grid-cols-2 gap-2">
            <input
              className={inputCls}
              style={inputStyle}
              value={item.label}
              placeholder={`Nama layanan ${i + 1} (mis. Poli Umum)`}
              onChange={e => ubahField(i, 'label', e.target.value)}
            />
            <input
              className={inputCls}
              style={inputStyle}
              value={item.jadwal}
              placeholder="Jadwal (mis. Senin-Sabtu 07.30-14.00)"
              onChange={e => ubahField(i, 'jadwal', e.target.value)}
            />
          </div>
          <button type="button" onClick={() => hapus(i)}
            className="text-xs px-2 py-1 rounded font-medium mt-1"
            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
            Hapus
          </button>
        </div>
      ))}
      <button type="button" onClick={tambah}
        className="text-sm font-medium px-3 py-1.5 rounded-lg mt-1"
        style={{ background: 'var(--surface)', border: '1.5px dashed var(--line)', color: 'var(--muted)' }}>
        + Tambah Layanan
      </button>
    </div>
  )
}

// ─── Sub-komponen: editor tabel standar pelayanan ────────────────────────────
// Setiap baris: { klaster, layanan, waktu, biaya }
function EditorStandarPelayanan({ value, onChange }) {
  const list = safeJSON(value, [])

  function tambah() {
    onChange(JSON.stringify([...list, { klaster: '', layanan: '', waktu: '', biaya: '' }]))
  }
  function ubahField(i, field, v) {
    const next = [...list]
    next[i] = { ...next[i], [field]: v }
    onChange(JSON.stringify(next))
  }
  function hapus(i) {
    onChange(JSON.stringify(list.filter((_, idx) => idx !== i)))
  }

  return (
    <div className="space-y-3">
      {list.map((item, i) => (
        <div key={i} className="rounded-xl p-3 space-y-2"
          style={{ background: 'var(--bg)', border: '1.5px solid var(--line)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Baris #{i + 1}</span>
            <button type="button" onClick={() => hapus(i)}
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
              Hapus
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <input className={inputCls} style={inputStyle}
              value={item.klaster} placeholder="Klaster (mis. Pelayanan Klinis)"
              onChange={e => ubahField(i, 'klaster', e.target.value)} />
            <input className={inputCls} style={inputStyle}
              value={item.layanan} placeholder="Layanan (mis. Poli Umum)"
              onChange={e => ubahField(i, 'layanan', e.target.value)} />
            <input className={inputCls} style={inputStyle}
              value={item.waktu} placeholder="Waktu (mis. ≤ 30 menit)"
              onChange={e => ubahField(i, 'waktu', e.target.value)} />
            <input className={inputCls} style={inputStyle}
              value={item.biaya} placeholder="Biaya (mis. Rp 5.000 - 15.000)"
              onChange={e => ubahField(i, 'biaya', e.target.value)} />
          </div>
        </div>
      ))}
      <button type="button" onClick={tambah}
        className="text-sm font-medium px-3 py-1.5 rounded-lg"
        style={{ background: 'var(--surface)', border: '1.5px dashed var(--line)', color: 'var(--muted)' }}>
        + Tambah Baris Standar Pelayanan
      </button>
    </div>
  )
}

// ─── Sub-komponen: editor berita ─────────────────────────────────────────────
// Setiap item: { judul, ringkasan, tanggal, kategori, gambar }
const KATEGORI_BERITA = ['Program', 'Kegiatan', 'Artikel Kesehatan', 'Pengumuman', 'Prestasi', 'Umum']
const BUCKET_BERITA = 'profil-puskesmas-foto'

function EditorBerita({ value, onChange }) {
  const list = safeJSON(value, [])

  function tambah() {
    onChange(JSON.stringify([...list, {
      judul: '', ringkasan: '', tanggal: new Date().toISOString().split('T')[0],
      kategori: 'Program', gambar: '',
    }]))
  }
  function ubahField(i, field, v) {
    const next = [...list]
    next[i] = { ...next[i], [field]: v }
    onChange(JSON.stringify(next))
  }
  function hapus(i) {
    onChange(JSON.stringify(list.filter((_, idx) => idx !== i)))
  }

  return (
    <div className="space-y-4">
      {list.map((item, i) => (
        <div key={i} className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--bg)', border: '1.5px solid var(--line)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Berita #{i + 1}</span>
            <button type="button" onClick={() => hapus(i)}
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
              Hapus
            </button>
          </div>

          <Field label="Kategori"
            hint="Menentukan tag warna dan filter pada halaman publik (Program / Kegiatan / Artikel Kesehatan, dst).">
            <select className={inputCls} style={inputStyle}
              value={item.kategori || 'Umum'}
              onChange={e => ubahField(i, 'kategori', e.target.value)}>
              {KATEGORI_BERITA.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>

          <Field label="Gambar (opsional)">
            <FotoUploader
              value={item.gambar}
              onChange={v => ubahField(i, 'gambar', v)}
              bentuk="lebar"
              tinggi={120}
              ukuranMaksMb={4}
              catatan="JPG/PNG, maks. 4MB. Tampil di bagian atas kartu berita."
            />
          </Field>

          <Field label="Judul">
            <input className={inputCls} style={inputStyle}
              value={item.judul}
              placeholder="Judul berita / kegiatan / artikel"
              onChange={e => ubahField(i, 'judul', e.target.value)} />
          </Field>
          <Field label="Tanggal">
            <input type="date" className={inputCls} style={inputStyle}
              value={item.tanggal}
              onChange={e => ubahField(i, 'tanggal', e.target.value)} />
          </Field>
          <Field label="Isi / Ringkasan">
            <textarea rows={3} className={inputCls} style={inputStyle}
              value={item.ringkasan}
              placeholder="Isi atau ringkasan berita…"
              onChange={e => ubahField(i, 'ringkasan', e.target.value)} />
          </Field>
        </div>
      ))}
      <button type="button" onClick={tambah}
        className="text-sm font-medium px-3 py-1.5 rounded-lg"
        style={{ background: 'var(--surface)', border: '1.5px dashed var(--line)', color: 'var(--muted)' }}>
        + Tambah Berita / Program / Kegiatan / Artikel
      </button>
    </div>
  )
}

// ─── Sub-komponen: editor daftar staf ────────────────────────────────────────
function EditorStaf({ value, onChange }) {
  const list = safeJSON(value, [])

  function tambah() {
    onChange(JSON.stringify([...list, { id: crypto.randomUUID(), nama: '', nip: '', profesi: '', foto: '' }]))
  }
  function ubahField(i, field, v) {
    const next = [...list]
    next[i] = { ...next[i], [field]: v }
    onChange(JSON.stringify(next))
  }
  function hapus(i) {
    onChange(JSON.stringify(list.filter((_, idx) => idx !== i)))
  }

  return (
    <div className="space-y-4">
      {list.map((item, i) => (
        <div key={item.id ?? i} className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--bg)', border: '1.5px solid var(--line)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Staf #{i + 1}</span>
            <button type="button" onClick={() => hapus(i)}
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
              Hapus
            </button>
          </div>

          <Field label="Foto">
            <FotoUploader
              value={item.foto}
              onChange={v => ubahField(i, 'foto', v)}
              bentuk="persegi"
              lebar={72}
              tinggi={96}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nama">
              <input className={inputCls} style={inputStyle}
                value={item.nama}
                placeholder="Nama lengkap"
                onChange={e => ubahField(i, 'nama', e.target.value)} />
            </Field>
            <Field label="NIP">
              <input className={inputCls} style={inputStyle}
                value={item.nip}
                placeholder="19XX…"
                onChange={e => ubahField(i, 'nip', e.target.value)} />
            </Field>
          </div>
          <Field label="Profesi / Jabatan">
            <input className={inputCls} style={inputStyle}
              value={item.profesi}
              placeholder="contoh: Perawat, Bidan, Dokter Umum…"
              onChange={e => ubahField(i, 'profesi', e.target.value)} />
          </Field>
        </div>
      ))}
      <button type="button" onClick={tambah}
        className="text-sm font-medium px-3 py-1.5 rounded-lg"
        style={{ background: 'var(--surface)', border: '1.5px dashed var(--line)', color: 'var(--muted)' }}>
        + Tambah Staf
      </button>
    </div>
  )
}

// ─── Komponen Utama ──────────────────────────────────────────────────────────
export default function SettingPuskesmas() {
  const { kode } = useParams()          // kode instansi diambil dari URL: /puskesmas/:kode/settings
  const { profile } = useAuth()
  const [form, setForm]         = useState(FORM_DEFAULT)
  const [instansiId, setInstansiId] = useState(null)   // instansi_id milik baris profil ini (untuk upsert)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState({ type: '', text: '' })
  const [preview, setPreview]   = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const msgRef = useRef(null)

  // Super owner boleh kelola profil instansi manapun. Admin/nakes hanya instansinya sendiri.
  const bolehAkses = profile?.role === 'super_owner'
    || (profile?.instansi_id && instansiId && profile.instansi_id === instansiId)

  // ─── Muat data dari Supabase ─────────────────────────────────────────
  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kode])

  async function fetchData() {
    setLoading(true)
    setForbidden(false)

    if (!kode) {
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('profil_puskesmas_publik')
      .select('*')
      .eq('kode', kode)
      .single()

    if (data) {
      setForm({ ...FORM_DEFAULT, ...data })
      setInstansiId(data.instansi_id ?? null)

      // Cek kepemilikan: admin/nakes yang bukan super_owner tidak boleh buka settings instansi lain
      if (profile?.role !== 'super_owner' && profile?.instansi_id !== data.instansi_id) {
        setForbidden(true)
      }
    } else {
      // Belum ada baris untuk kode ini — biarkan admin instansi sendiri membuat baru,
      // dengan instansi_id diambil dari profil user yang sedang login.
      setForm({ ...FORM_DEFAULT, nama: '' })
      setInstansiId(profile?.instansi_id ?? null)
    }
    setLoading(false)
  }

  // ─── Update field tunggal ─────────────────────────────────────────────
  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ─── Simpan ───────────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault()
    if (!bolehAkses) return   // pengaman tambahan di frontend; RLS di database tetap jadi penjamin utama
    setSaving(true)
    setMsg({ type: '', text: '' })

    const payload = {
      ...form,
      kode,
      instansi_id: instansiId,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('profil_puskesmas_publik')
      .upsert(payload, { onConflict: 'kode' })

    if (error) {
      setMsg({ type: 'error', text: 'Gagal menyimpan: ' + error.message })
    } else {
      setMsg({ type: 'ok', text: '✓ Perubahan berhasil disimpan.' })
    }
    setSaving(false)

    setTimeout(() => {
      msgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  // ─── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-4 border-t-transparent mx-auto mb-3 animate-spin"
            style={{ borderColor: form.warna_primer, borderTopColor: 'transparent' }} />
          <p style={{ color: 'var(--muted)' }}>Memuat pengaturan…</p>
        </div>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>
            Akses Ditolak
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Anda tidak memiliki akses untuk mengelola pengaturan instansi ini.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 px-5 py-4 flex items-center justify-between"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
            Pengaturan Profil Publik
          </h1>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{form.nama || kode}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={URL_PROFIL_PUBLIK(kode)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5"
            style={{ background: 'var(--bg)', border: '1.5px solid var(--line)', color: 'var(--muted)' }}>
            ↗ Kunjungi Halaman
          </a>
          <button
            type="button"
            onClick={() => setPreview(!preview)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              background: preview ? form.warna_primer + '15' : 'var(--bg)',
              border: '1.5px solid var(--line)',
              color: preview ? form.warna_primer : 'var(--muted)',
            }}>
            {preview ? '✕ Tutup Pratinjau' : '👁 Pratinjau'}
          </button>
        </div>
      </div>

      {/* ── Pesan notifikasi ────────────────────────────────────────────── */}
      {msg.text && (
        <div ref={msgRef}
          className="max-w-3xl mx-auto mt-4 mx-4 px-4 py-3 rounded-xl text-sm font-medium"
          style={{
            background: msg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
            color:      msg.type === 'ok' ? '#15803d'  : '#dc2626',
            border:     `1.5px solid ${msg.type === 'ok' ? '#86efac' : '#fca5a5'}`,
          }}>
          {msg.text}
        </div>
      )}

      <div className={`max-w-3xl mx-auto px-4 py-8 ${preview ? 'hidden' : ''}`}>
        <form onSubmit={handleSave} className="space-y-10">

          {/* ── BAGIAN 1: Identitas ──────────────────────────────────────── */}
          <section className="rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide"
              style={{ color: form.warna_primer }}>1 · Identitas Puskesmas</h2>

            <Field label="Logo"
              hint="Tampil di bundaran bagian atas halaman publik (hero). Biarkan kosong untuk memakai ikon default.">
              <FotoUploader
                value={form.logo}
                onChange={v => set('logo', v)}
                bentuk="bulat"
                lebar={80}
                tinggi={80}
              />
            </Field>

            <Field label="Nama Puskesmas"
              hint="Nama ini tampil besar di bagian atas halaman publik.">
              <input className={inputCls} style={{ ...inputStyle, fontWeight: 600 }}
                value={form.nama}
                onChange={e => set('nama', e.target.value)}
                required />
            </Field>

            <Field label="Tagline / Moto"
              hint="Kalimat pendek di bawah nama puskesmas.">
              <input className={inputCls} style={inputStyle}
                value={form.tagline}
                placeholder="contoh: Melayani dengan Sepenuh Hati"
                onChange={e => set('tagline', e.target.value)} />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Warna Utama">
                <div className="flex items-center gap-3">
                  <input type="color" className="w-10 h-10 rounded cursor-pointer border-0"
                    value={form.warna_primer}
                    onChange={e => set('warna_primer', e.target.value)} />
                  <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
                    {form.warna_primer}
                  </span>
                </div>
              </Field>
              <Field label="Warna Sekunder (gradasi)">
                <div className="flex items-center gap-3">
                  <input type="color" className="w-10 h-10 rounded cursor-pointer border-0"
                    value={form.warna_sekunder}
                    onChange={e => set('warna_sekunder', e.target.value)} />
                  <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
                    {form.warna_sekunder}
                  </span>
                </div>
              </Field>
            </div>

            <Field label="Gambar Hero (Opsional)"
              hint="Gambar latar belakang bagian atas halaman publik. Biarkan kosong untuk menggunakan gradasi warna.">
              <FotoUploader
                value={form.gambar_hero}
                onChange={v => set('gambar_hero', v)}
                bentuk="lebar"
                tinggi={140}
                ukuranMaksMb={5}
                catatan="JPG/PNG, maks. 5MB. Disarankan gambar lanskap (lebar) beresolusi tinggi."
              />
            </Field>

            <Field label="Atau tempel Link Gambar"
              hint="Alternatif selain unggah file — isi salah satu saja. Kosongkan jika sudah mengunggah gambar di atas.">
              <input className={inputCls} style={inputStyle}
                value={form.gambar_hero}
                placeholder="https://…/gambar.jpg"
                onChange={e => set('gambar_hero', e.target.value)} />
            </Field>
          </section>

          {/* ── BAGIAN 2: Kepala Puskesmas ───────────────────────────────── */}
          <section className="rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide"
              style={{ color: form.warna_primer }}>2 · Kepala Puskesmas</h2>

            <Field label="Foto Kepala Puskesmas">
              <FotoUploader
                value={form.foto_kepala}
                onChange={v => set('foto_kepala', v)}
                bentuk="persegi"
                lebar={96}
                tinggi={128}
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nama Kepala Puskesmas">
                <input className={inputCls} style={inputStyle}
                  value={form.kepala_puskesmas}
                  placeholder="dr. ..."
                  onChange={e => set('kepala_puskesmas', e.target.value)} />
              </Field>
              <Field label="NIP">
                <input className={inputCls} style={inputStyle}
                  value={form.nip_kepala}
                  placeholder="19XX…"
                  onChange={e => set('nip_kepala', e.target.value)} />
              </Field>
            </div>
          </section>

          {/* ── BAGIAN 2B: Tim / Staf ───────────────────────────────────── */}
          <section className="rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide"
              style={{ color: form.warna_primer }}>2B · Tim / Staf</h2>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Tambahkan anggota staf/tenaga kesehatan yang ingin ditampilkan di halaman publik,
              lengkap dengan foto, nama, NIP, dan profesi.
            </p>
            <EditorStaf
              value={form.staf}
              onChange={v => set('staf', v)} />
          </section>

          {/* ── BAGIAN 3: Kontak ─────────────────────────────────────────── */}
          <section className="rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide"
              style={{ color: form.warna_primer }}>3 · Informasi Kontak</h2>

            <Field label="Alamat">
              <textarea rows={2} className={inputCls} style={inputStyle}
                value={form.alamat}
                placeholder="Jl. …"
                onChange={e => set('alamat', e.target.value)} />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nomor Telepon">
                <input className={inputCls} style={inputStyle}
                  value={form.telepon}
                  placeholder="(0411) 000-0000"
                  onChange={e => set('telepon', e.target.value)} />
              </Field>
              <Field label="Email">
                <input type="email" className={inputCls} style={inputStyle}
                  value={form.email}
                  placeholder="puskesmas@example.com"
                  onChange={e => set('email', e.target.value)} />
              </Field>
            </div>

            <Field label="Jam Operasional"
              hint="Satu baris per jadwal, contoh: Senin – Jumat: 08.00 – 16.00">
              <textarea rows={3} className={inputCls} style={inputStyle}
                value={form.jam_operasional}
                placeholder={'Senin – Jumat: 08.00 – 16.00\nSabtu: 08.00 – 12.00'}
                onChange={e => set('jam_operasional', e.target.value)} />
            </Field>

            <p className="text-xs font-semibold pt-2" style={{ color: 'var(--muted)' }}>
              Media Sosial (opsional — biarkan kosong jika tidak ada)
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nomor WhatsApp">
                <input className={inputCls} style={inputStyle}
                  value={form.whatsapp}
                  placeholder="6281234567890 (kode negara, tanpa spasi/strip)"
                  onChange={e => set('whatsapp', e.target.value)} />
              </Field>
              <Field label="Link Instagram">
                <input className={inputCls} style={inputStyle}
                  value={form.instagram}
                  placeholder="https://instagram.com/…"
                  onChange={e => set('instagram', e.target.value)} />
              </Field>
              <Field label="Link Facebook">
                <input className={inputCls} style={inputStyle}
                  value={form.facebook}
                  placeholder="https://facebook.com/…"
                  onChange={e => set('facebook', e.target.value)} />
              </Field>
              <Field label="Link YouTube">
                <input className={inputCls} style={inputStyle}
                  value={form.youtube}
                  placeholder="https://youtube.com/…"
                  onChange={e => set('youtube', e.target.value)} />
              </Field>
            </div>
          </section>

          {/* ── BAGIAN 4: Visi & Misi ────────────────────────────────────── */}
          <section className="rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide"
              style={{ color: form.warna_primer }}>4 · Visi & Misi</h2>

            <Field label="Visi">
              <textarea rows={2} className={inputCls} style={inputStyle}
                value={form.visi}
                placeholder="Menjadi puskesmas pilihan masyarakat…"
                onChange={e => set('visi', e.target.value)} />
            </Field>

            <Field label="Misi"
              hint="Satu baris per poin misi.">
              <textarea rows={5} className={inputCls} style={inputStyle}
                value={form.misi}
                placeholder={'Meningkatkan kualitas pelayanan kesehatan\nMemberdayakan masyarakat…'}
                onChange={e => set('misi', e.target.value)} />
            </Field>

            <Field label="Tata Nilai"
              hint="Satu baris per nilai (contoh: tata nilai MINASATA — Melayani, Inovatif, Nyaman, dst). Tampil sebagai badge di halaman publik.">
              <textarea rows={4} className={inputCls} style={inputStyle}
                value={form.tata_nilai}
                placeholder={'Melayani\nInovatif\nNyaman\nAmanah\n…'}
                onChange={e => set('tata_nilai', e.target.value)} />
            </Field>

            <Field label="Motto (opsional)"
              hint="Kalimat singkat yang tampil di bawah tata nilai.">
              <input className={inputCls} style={inputStyle}
                value={form.motto}
                placeholder="contoh: Kesehatan Anda, Prioritas Kami"
                onChange={e => set('motto', e.target.value)} />
            </Field>
          </section>

          {/* ── BAGIAN 5: Layanan ────────────────────────────────────────── */}
          <section className="rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide"
              style={{ color: form.warna_primer }}>5 · Daftar Layanan</h2>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Tambahkan layanan unggulan yang tersedia di puskesmas ini, lengkap dengan jadwalnya.
              Layanan akan tampil sebagai kartu di halaman publik.
            </p>
            <EditorLayanan
              value={form.layanan}
              onChange={v => set('layanan', v)} />

            <Field label="Maklumat Pelayanan (opsional)"
              hint="Kalimat komitmen pelayanan, tampil sebagai pita hijau di bawah daftar layanan.">
              <textarea rows={3} className={inputCls} style={inputStyle}
                value={form.maklumat}
                placeholder="DENGAN INI KAMI BERJANJI DAN MENYATAKAN SANGGUP UNTUK MELAKSANAKAN PELAYANAN SESUAI DENGAN STANDAR PELAYANAN…"
                onChange={e => set('maklumat', e.target.value)} />
            </Field>
          </section>

          {/* ── BAGIAN 5B: Standar Pelayanan ─────────────────────────────── */}
          <section className="rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide"
              style={{ color: form.warna_primer }}>5B · Standar Pelayanan</h2>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Tabel klaster, jenis layanan, estimasi waktu, dan biaya. Tampil sebagai tabel di halaman publik.
            </p>
            <EditorStandarPelayanan
              value={form.standar_pelayanan}
              onChange={v => set('standar_pelayanan', v)} />

            <Field label="Link PDF Standar Pelayanan (opsional)"
              hint="Jika diisi, tombol 'Lihat / Download PDF' akan tampil di atas tabel pada halaman publik.">
              <input className={inputCls} style={inputStyle}
                value={form.standar_pelayanan_pdf}
                placeholder="https://…/standar-pelayanan.pdf"
                onChange={e => set('standar_pelayanan_pdf', e.target.value)} />
            </Field>
          </section>

          {/* ── BAGIAN 6: Berita & Pengumuman ────────────────────────────── */}
          <section className="rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide"
              style={{ color: form.warna_primer }}>6 · Berita & Pengumuman</h2>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Biarkan kosong jika tidak ada pengumuman. Pengumuman akan tampil di bagian bawah halaman publik.
            </p>
            <EditorBerita
              value={form.berita}
              onChange={v => set('berita', v)} />
          </section>

          {/* ── BAGIAN 7: Survei Kepuasan Masyarakat (SKM) ──────────────────── */}
          <section className="rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide"
              style={{ color: form.warna_primer }}>7 · Survei Kepuasan Masyarakat (SKM)</h2>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Tempel link survei kepuasan masyarakat resmi (misal dari skm.go.id). QR code akan otomatis
              dibuat dan ditampilkan di halaman publik — tidak perlu upload gambar QR secara manual.
              Biarkan kosong jika belum tersedia; bagian survei tidak akan tampil di halaman publik.
            </p>
            <Field label="Link Survei SKM">
              <input className={inputCls} style={inputStyle}
                value={form.link_survei_skm}
                placeholder="https://skm.go.id/share/instansi/…"
                onChange={e => set('link_survei_skm', e.target.value)} />
            </Field>

            {form.link_survei_skm?.trim() && (
              <div className="flex items-center gap-4 rounded-xl p-4"
                style={{ background: 'var(--bg)', border: '1px dashed var(--line)' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(form.link_survei_skm.trim())}`}
                  alt="Preview QR Survei SKM"
                  width={100}
                  height={100}
                  className="rounded-lg bg-white p-1.5 border"
                  style={{ borderColor: 'var(--line)' }}
                />
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text)' }}>
                    Preview QR Code
                  </p>
                  <p className="text-xs break-all" style={{ color: 'var(--muted)' }}>
                    {form.link_survei_skm}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ── Tombol Simpan ────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 pb-10">
            <button type="button"
              onClick={fetchData}
              className="px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', color: 'var(--muted)' }}>
              Reset
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-60"
              style={{ background: form.warna_primer }}>
              {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
            </button>
          </div>

        </form>
      </div>

      {/* ── Mode Pratinjau ──────────────────────────────────────────────── */}
      {preview && (
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="rounded-2xl overflow-hidden shadow-lg border"
            style={{ borderColor: 'var(--line)' }}>
            <div className="p-4 text-center text-xs font-semibold"
              style={{ background: form.warna_primer + '15', color: form.warna_primer }}>
              ── PRATINJAU HALAMAN PUBLIK (belum disimpan) ──
            </div>
            {/* Banner hero mini */}
            <div className="relative flex flex-col items-center justify-center py-12 text-white text-center"
              style={{
                background: form.gambar_hero
                  ? `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)), url(${form.gambar_hero}) center/cover`
                  : `linear-gradient(135deg, ${form.warna_sekunder} 0%, ${form.warna_primer} 100%)`,
              }}>
              {form.logo && (
                <img src={form.logo} alt="Logo" className="w-14 h-14 rounded-full object-cover mb-3 shadow" />
              )}
              <h2 className="text-2xl font-bold drop-shadow">{form.nama || 'Nama Puskesmas'}</h2>
              <p className="mt-1 text-sm opacity-90">{form.tagline}</p>
            </div>
            {/* Info ringkas */}
            <div className="p-5 space-y-2" style={{ background: 'var(--surface)' }}>
              {form.alamat && <p className="text-sm">📍 {form.alamat}</p>}
              {form.telepon && <p className="text-sm">📞 {form.telepon}</p>}
              {form.email && <p className="text-sm">✉️ {form.email}</p>}
              {form.kepala_puskesmas && (
                <div className="flex items-center gap-2">
                  {form.foto_kepala && (
                    <img src={form.foto_kepala} alt="" className="w-6 h-8 rounded object-cover" />
                  )}
                  <p className="text-sm">👤 Kepala: {form.kepala_puskesmas}
                    {form.nip_kepala ? ` (NIP: ${form.nip_kepala})` : ''}
                  </p>
                </div>
              )}
              {safeJSON(form.staf, []).length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold mb-1.5" style={{ color: form.warna_primer }}>TIM / STAF</p>
                  <div className="flex flex-wrap gap-2">
                    {safeJSON(form.staf, []).map((s, i) => (
                      <div key={s.id ?? i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                        {s.foto && <img src={s.foto} alt="" className="w-5 h-6 rounded object-cover" />}
                        <span className="text-xs font-medium">{s.nama || '(tanpa nama)'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {form.visi && (
                <blockquote className="mt-3 italic text-sm px-4 py-2 rounded-lg"
                  style={{ background: form.warna_primer + '10', borderLeft: `3px solid ${form.warna_primer}` }}>
                  "{form.visi}"
                </blockquote>
              )}
              {safeJSON(form.layanan, []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {safeJSON(form.layanan, []).map((l, i) => {
                    const label = typeof l === 'string' ? l : l.label
                    return (
                      <span key={i} className="text-xs px-3 py-1 rounded-full font-medium"
                        style={{ background: form.warna_primer + '15', color: form.warna_primer }}>
                        {label}
                      </span>
                    )
                  })}
                </div>
              )}
              {safeJSON(form.berita, []).length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold" style={{ color: form.warna_primer }}>BERITA</p>
                  {safeJSON(form.berita, []).map((b, i) => (
                    <div key={i} className="rounded-lg p-3 text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        {b.kategori && (
                          <span className="text-[0.65rem] font-bold uppercase px-2 py-0.5 rounded-full text-white"
                            style={{ background: form.warna_primer }}>
                            {b.kategori}
                          </span>
                        )}
                        <p className="font-semibold">{b.judul}</p>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{b.ringkasan}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}