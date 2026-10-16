import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { ikonPin, tinggiPin, useWarnaPenanda, PilihWarnaPenanda } from './penandaPasien'

// Input Pasien Peta — menaruh titik rumah ibu hamil di peta.
// Dua cara mengisi: pilih dari data kehamilan (terdaftar) atau ketik manual.
// Peta memakai Leaflet yang dimuat dari CDN saat komponen dibuka (tidak perlu npm install).
// Tabel: ibu_hamil_peta. Data tidak dihapus permanen, hanya dibatalkan (dibatalkan_pada).

const TABEL = 'ibu_hamil_peta'
const DIR_WILAYAH = '/data/wilayah'
const PUSAT_AWAL = [-3.6, 120.0]
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
// Kotak Sulawesi (kiri,atas,kanan,bawah) — hanya untuk memprioritaskan hasil, bukan membatasi
const VIEWBOX_SULAWESI = '118.7,2.0,125.5,-7.0'

// Ambang akurasi "Gunakan lokasi saya" (meter).
// Pencarian berhenti lebih awal bila sudah <= TARGET; bila sampai batas waktu, hasil terbaik dipakai
// hanya kalau <= MAKS. Di atas itu titik DITOLAK (tidak ada lokasi perkiraan dari Wi-Fi/IP).
const AKURASI_TARGET = 10
const AKURASI_MAKS = 30
const AKURASI_WAKTU = 25000 // ms
// Laptop/PC tidak punya GPS: Chrome menebak dari Wi-Fi/IP dan tetap melaporkan "akurasi" kecil yang menipu.
// Pembacaan GPS asli membawa data ketinggian (altitude); tebakan Wi-Fi/IP tidak. Bila true, pembacaan tanpa
// altitude ditolak. Default false karena laptop (tanpa GPS) tetap boleh dipakai; ubah ke true bila hanya ingin GPS HP.
const WAJIB_GPS = false

const FORM_KOSONG = { nama: '', umur: '', hpl: '', no_hp: '', desa_id: '', catatan: '' }

// ---------- pemuat Leaflet ----------
let janjiLeaflet = null
function muatLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  if (!janjiLeaflet) {
    janjiLeaflet = new Promise((ok, gagal) => {
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        const css = document.createElement('link')
        css.rel = 'stylesheet'
        css.href = LEAFLET_CSS
        document.head.appendChild(css)
      }
      const js = document.createElement('script')
      js.src = LEAFLET_JS
      js.onload = () => ok(window.L)
      js.onerror = () => {
        janjiLeaflet = null
        gagal(new Error('Pustaka peta gagal dimuat. Periksa koneksi internet.'))
      }
      document.head.appendChild(js)
    })
  }
  return janjiLeaflet
}

// ---------- data wilayah (desa/kelurahan) ----------
let cacheWil = null
async function muatWilayahDesa() {
  if (cacheWil) return cacheWil
  const ambil = (n) =>
    fetch(`${DIR_WILAYAH}/${n}.json`).then((r) => {
      if (!r.ok) throw new Error(`${n}.json: HTTP ${r.status}`)
      return r.json()
    })
  const [kec, desa] = await Promise.all([ambil('districts'), ambil('villages')])
  cacheWil = {
    desaById: new Map(desa.map((d) => [d.id, d])),
    kecById: new Map(kec.map((k) => [k.id, k])),
  }
  return cacheWil
}

// ---------- util ----------
function hitungUmurTahun(tglLahir) {
  if (!tglLahir) return ''
  const lahir = new Date(tglLahir)
  if (Number.isNaN(lahir.getTime())) return ''
  const n = new Date()
  let u = n.getFullYear() - lahir.getFullYear()
  const m = n.getMonth() - lahir.getMonth()
  if (m < 0 || (m === 0 && n.getDate() < lahir.getDate())) u--
  return u >= 0 ? String(u) : ''
}

const z = (n) => String(n).padStart(2, '0')
const tglIso = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`

// HPL: pakai kolom hpl bila ada; kalau tidak, HPHT + 280 hari (aturan Naegele)
function hplDariKehamilan(kh) {
  if (kh.hpl) return String(kh.hpl).slice(0, 10)
  if (!kh.hpht) return ''
  const d = new Date(kh.hpht)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + 280)
  return tglIso(d)
}

function tampilTanggal(s) {
  if (!s) return '-'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const koordOk = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

// ---------- peta dasar (satelit / jalan) ----------
function PetaDasar({ tinggi, onSiap }) {
  const el = useRef(null)
  const siapRef = useRef(onSiap)
  siapRef.current = onSiap
  const [galat, setGalat] = useState(null)
  const [satelit, setSatelit] = useState(true)
  const lapisRef = useRef(null)

  useEffect(() => {
    let batal = false
    let peta = null
    let ro = null
    muatLeaflet()
      .then((L) => {
        if (batal || !el.current) return
        peta = L.map(el.current, {
          center: PUSAT_AWAL,
          zoom: 7,
          zoomControl: true,
          maxZoom: 21,            // boleh diperbesar melebihi zoom asli tile (tile diregangkan, tidak kosong)
          zoomSnap: 0.5,          // langkah zoom lebih halus
          zoomDelta: 1,
          wheelPxPerZoomLevel: 90, // roda mouse lebih responsif
          wheelDebounceTime: 30,
          bounceAtZoomLimits: false,
        })
        // Citra Esri sering tidak punya tile di zoom tinggi untuk daerah pedesaan -> batasi zoom asli ke 18,
        // lalu Leaflet memperbesar tile zoom 18 sehingga tidak muncul kotak "Map data not yet available".
        const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 21,
          maxNativeZoom: 18,
          keepBuffer: 4,
          updateWhenZooming: false,
          attribution: 'Citra © Esri, Maxar, Earthstar Geographics',
        })
        const jalan = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 21,
          maxNativeZoom: 19,
          keepBuffer: 4,
          updateWhenZooming: false,
          attribution: '© OpenStreetMap',
        })
        lapisRef.current = { peta, sat, jalan }
        sat.addTo(peta)
        if (typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(() => peta && peta.invalidateSize())
          ro.observe(el.current)
        }
        siapRef.current(peta, L)
      })
      .catch((e) => !batal && setGalat(e.message))
    return () => {
      batal = true
      if (ro) ro.disconnect()
      if (peta) peta.remove()
      lapisRef.current = null
    }
  }, [])

  useEffect(() => {
    const l = lapisRef.current
    if (!l) return
    if (satelit) {
      l.peta.removeLayer(l.jalan)
      l.sat.addTo(l.peta)
    } else {
      l.peta.removeLayer(l.sat)
      l.jalan.addTo(l.peta)
    }
  }, [satelit])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={el} style={{ height: tinggi, borderRadius: 8, border: '1px solid var(--line, #e5e7eb)', background: '#e5e7eb', zIndex: 0 }} />
      {galat && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16, color: '#b91c1c', fontSize: 13 }}>{galat}</div>}
      <button
        type="button"
        onClick={() => setSatelit((s) => !s)}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 500, padding: '6px 10px', fontSize: 12, fontWeight: 600,
          background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 6, cursor: 'pointer',
        }}
      >
        {satelit ? 'Tampilkan peta jalan' : 'Tampilkan citra satelit'}
      </button>
    </div>
  )
}

// ---------- geocoding (Nominatim / OpenStreetMap) ----------
// Kebijakan Nominatim: maks. 1 permintaan/detik dan tanpa autocomplete,
// jadi pencarian hanya dijalankan saat tombol Cari / Enter ditekan, dan hasilnya di-cache.
const cacheGeo = new Map()
let antrianGeo = Promise.resolve()
let terakhirGeo = 0
function antriGeo(fn) {
  const jalan = antrianGeo.then(async () => {
    const tunggu = terakhirGeo + 1100 - Date.now()
    if (tunggu > 0) await new Promise((r) => setTimeout(r, tunggu))
    terakhirGeo = Date.now()
    return fn()
  })
  antrianGeo = jalan.catch(() => {})
  return jalan
}
async function cariLokasi(teks, limit = 5) {
  const kunci = `${limit}|${teks.toLowerCase().replace(/\s+/g, ' ').trim()}`
  if (cacheGeo.has(kunci)) return cacheGeo.get(kunci)
  const qs = new URLSearchParams({
    format: 'jsonv2',
    q: teks,
    countrycodes: 'id',
    limit: String(limit),
    'accept-language': 'id',
    viewbox: VIEWBOX_SULAWESI,
    bounded: '0',
  })
  const r = await antriGeo(() => fetch(`${NOMINATIM}?${qs}`))
  if (!r.ok) throw new Error(`Pencarian gagal (HTTP ${r.status})`)
  const hasil = (await r.json())
    .map((h) => {
      const b = h.boundingbox?.map(Number) // [selatan, utara, barat, timur]
      return {
        nama: h.display_name,
        lat: Number(h.lat),
        lng: Number(h.lon),
        bbox: b && b.every(Number.isFinite) ? [[b[0], b[2]], [b[1], b[3]]] : null,
      }
    })
    .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng))
  cacheGeo.set(kunci, hasil)
  return hasil
}

// Cadangan: Photon (berbasis data OSM juga, tetapi lebih toleran terhadap salah ketik / nama parsial)
async function cariPhoton(teks, limit = 5) {
  const kunci = `photon|${limit}|${teks.toLowerCase().replace(/\s+/g, ' ').trim()}`
  if (cacheGeo.has(kunci)) return cacheGeo.get(kunci)
  const qs = new URLSearchParams({ q: teks, limit: String(limit), lat: '-4.0', lon: '120.0', lang: 'en' })
  const r = await fetch(`https://photon.komoot.io/api/?${qs}`)
  if (!r.ok) throw new Error(`Pencarian cadangan gagal (HTTP ${r.status})`)
  const j = await r.json()
  const hasil = (j.features ?? [])
    .filter((f) => f.properties?.countrycode === 'ID' && f.geometry?.coordinates)
    .map((f) => {
      const pr = f.properties
      const [lng, lat] = f.geometry.coordinates
      const e = pr.extent // [barat, utara, timur, selatan]
      return {
        nama: [pr.name, pr.district, pr.city || pr.county, pr.state].filter(Boolean).join(', '),
        lat,
        lng,
        bbox: Array.isArray(e) && e.length === 4 ? [[e[3], e[0]], [e[1], e[2]]] : null,
      }
    })
    .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng))
  cacheGeo.set(kunci, hasil)
  return hasil
}

// Urutan: Nominatim apa adanya → Nominatim + konteks wilayah → Photon
async function cariBertingkat(teks, konteks) {
  let galat = null
  const kandidat = konteks ? [teks, `${teks}, ${konteks}`] : [teks]
  for (const q of kandidat) {
    try {
      const h = await cariLokasi(q)
      if (h.length) return h
    } catch (e) {
      galat = e // mis. 429 (terlalu sering) -> lanjut ke cadangan
    }
  }
  try {
    let h = await cariPhoton(konteks ? `${teks} ${konteks}` : teks)
    if (!h.length) h = await cariPhoton(teks)
    if (h.length) return h
  } catch (e) {
    galat = galat || e
  }
  if (galat) throw galat
  return []
}

function pindahPeta(peta, h, animasi = true) {
  if (!peta) return
  peta.invalidateSize()
  if (h.bbox) peta.fitBounds(h.bbox, { maxZoom: 18, padding: [20, 20], animate: animasi })
  else peta.setView([h.lat, h.lng], 16, { animate: animasi })
}

function KotakCari({ onPilih, konteks }) {
  const [q, setQ] = useState('')
  const [hasil, setHasil] = useState(null) // null = belum cari
  const [memuat, setMemuat] = useState(false)
  const [galat, setGalat] = useState(null)

  const cari = async () => {
    const teks = q.trim()
    if (teks.length < 3 || memuat) return
    setMemuat(true)
    setGalat(null)
    try {
      const h = await cariBertingkat(teks, konteks)
      if (h.length === 1) {
        onPilih(h[0])
        setHasil(null)
      } else {
        setHasil(h)
      }
    } catch (e) {
      setGalat((e.message || 'Pencarian gagal.') + ' Periksa koneksi internet lalu coba lagi.')
      setHasil(null)
    }
    setMemuat(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, minWidth: 0, padding: '8px 10px', fontSize: 13, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); cari() } }}
          placeholder="Cari dusun / jalan / tempat, lalu tekan Enter"
          aria-label="Cari lokasi di peta"
        />
        <button
          type="button"
          onClick={cari}
          disabled={memuat || q.trim().length < 3}
          style={{
            padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--line, #e5e7eb)',
            background: '#fff', cursor: memuat || q.trim().length < 3 ? 'not-allowed' : 'pointer', opacity: q.trim().length < 3 ? 0.6 : 1,
          }}
        >
          {memuat ? 'Mencari…' : 'Cari'}
        </button>
      </div>
      {galat && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{galat}</div>}
      {hasil && hasil.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted, #64707a)', marginTop: 4 }}>
          Nama ini belum ada di peta OpenStreetMap. Coba ejaan lain atau cari nama desa/kecamatan terdekat, lalu klik titik rumah secara manual di peta.
        </div>
      )}
      {hasil && hasil.length > 1 && (
        <ul
          style={{
            position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 1100, margin: '4px 0 0', padding: 0, listStyle: 'none',
            background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,.12)', maxHeight: 220, overflowY: 'auto',
          }}
        >
          {hasil.map((h, i) => (
            <li key={`${h.lat},${h.lng},${i}`}>
              <button
                type="button"
                onClick={() => { onPilih(h); setHasil(null) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 12.5, background: 'transparent', border: 0, borderTop: i ? '1px solid var(--line, #e5e7eb)' : 0, cursor: 'pointer' }}
              >
                {h.nama}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- peta pemilih titik ----------
function PemilihTitik({ titik, onPilih, warna, teksAwal, fokus, akurasi }) {
  const ref = useRef({ peta: null, L: null, marker: null, lingkar: null })
  const titikRef = useRef(titik)
  titikRef.current = titik
  const sudahCariRef = useRef(false)
  const onPilihRef = useRef(onPilih)
  onPilihRef.current = onPilih
  const [siap, setSiap] = useState(false)

  const siapkan = useCallback((peta, L) => {
    ref.current.peta = peta
    ref.current.L = L
    peta.on('click', (e) => onPilihRef.current(e.latlng.lat, e.latlng.lng))
    setSiap(true)
  }, [])

  useEffect(() => {
    const { peta, L } = ref.current
    if (!siap || !peta) return
    if (!titik) {
      if (ref.current.marker) {
        peta.removeLayer(ref.current.marker)
        ref.current.marker = null
      }
      return
    }
    const pos = [titik.lat, titik.lng]
    if (!ref.current.marker) {
      const m = L.marker(pos, { draggable: true, icon: ikonPin(L, warna, 34) }).addTo(peta)
      m.on('dragend', () => {
        const p = m.getLatLng()
        onPilihRef.current(p.lat, p.lng)
      })
      ref.current.marker = m
      peta.setView(pos, Math.max(peta.getZoom(), 18))
    } else {
      ref.current.marker.setLatLng(pos)
      if (!peta.getBounds().contains(pos)) peta.setView(pos, Math.max(peta.getZoom(), 17))
    }
  }, [titik, siap])

  // Lingkaran akurasi GPS di sekitar titik (hanya ada bila titik berasal dari "Gunakan lokasi saya")
  useEffect(() => {
    const { peta, L } = ref.current
    if (!siap || !peta) return
    if (ref.current.lingkar) {
      peta.removeLayer(ref.current.lingkar)
      ref.current.lingkar = null
    }
    if (titik && akurasi) {
      ref.current.lingkar = L.circle([titik.lat, titik.lng], {
        radius: akurasi, color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.12, interactive: false,
      }).addTo(peta)
    }
  }, [titik, akurasi, siap])

  // "Gunakan lokasi saya": terbang ke titik dan perbesar sampai rumah terlihat
  useEffect(() => {
    const { peta } = ref.current
    const t = titikRef.current
    if (!fokus || !peta || !t) return
    peta.invalidateSize()
    peta.flyTo([t.lat, t.lng], Math.max(peta.getZoom(), 18), { duration: 0.8 })
  }, [fokus])

  useEffect(() => {
    const { marker, L } = ref.current
    if (marker && L) marker.setIcon(ikonPin(L, warna, 34))
  }, [warna])

  // Peta langsung pindah ke desa yang dipilih (atau kecamatan wilayah kerja), tanpa zoom manual dari Sulawesi.
  // Tidak dijalankan bila titik sudah ada (mis. saat mengubah data).
  useEffect(() => {
    if (!siap || !teksAwal) return
    sudahCariRef.current = false
    let batal = false
    cariLokasi(`${teksAwal}, Sulawesi`, 1)
      .then((h) => {
        if (batal || !h[0] || titikRef.current || sudahCariRef.current) return
        pindahPeta(ref.current.peta, h[0])
      })
      .catch(() => {}) // gagal diam-diam; petugas tetap bisa memakai kotak cari
    return () => { batal = true }
  }, [teksAwal, siap])

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <KotakCari konteks={teksAwal} onPilih={(h) => { sudahCariRef.current = true; pindahPeta(ref.current.peta, h) }} />
      <PetaDasar tinggi={340} onSiap={siapkan} />
    </div>
  )
}

// ---------- peta semua pasien ----------
function PetaSemua({ daftar, dipilihId, onKlik, warna }) {
  const ref = useRef({ peta: null, L: null, lapis: null, marker: new Map(), daftarFit: null })
  const onKlikRef = useRef(onKlik)
  onKlikRef.current = onKlik
  const [siap, setSiap] = useState(false)

  const siapkan = useCallback((peta, L) => {
    ref.current.peta = peta
    ref.current.L = L
    ref.current.lapis = L.layerGroup().addTo(peta)
    setSiap(true)
  }, [])

  useEffect(() => {
    const { peta, L, lapis } = ref.current
    if (!siap || !peta) return
    lapis.clearLayers()
    ref.current.marker = new Map()
    const titik = []
    for (const p of daftar) {
      const lat = Number(p.latitude)
      const lng = Number(p.longitude)
      if (!koordOk(lat, lng)) continue
      const m = L.marker([lat, lng], { icon: ikonPin(L, p.kehamilan_id ? warna.terdaftar : warna.manual, 30) })
      m.bindTooltip(p.nama, { direction: 'top', offset: [0, -tinggiPin(30) + 6] })
      m.on('click', () => onKlikRef.current(p.id))
      m.addTo(lapis)
      ref.current.marker.set(p.id, m)
      titik.push([lat, lng])
    }
    if (titik.length && ref.current.daftarFit !== daftar) peta.fitBounds(titik, { padding: [40, 40], maxZoom: 16 })
    ref.current.daftarFit = daftar
  }, [daftar, siap, warna])

  useEffect(() => {
    const { peta, marker } = ref.current
    if (!siap || !dipilihId) return
    const m = marker.get(dipilihId)
    if (m) peta.flyTo(m.getLatLng(), Math.max(peta.getZoom(), 16), { duration: 0.6 })
  }, [dipilihId, siap])

  return <PetaDasar tinggi={380} onSiap={siapkan} />
}

// ---------- komponen utama ----------
export default function InputPasienPeta({ instansiId }) {
  const [mode, setMode] = useState('terdaftar') // 'terdaftar' | 'manual'
  const [warna, setWarna] = useWarnaPenanda()
  const [form, setForm] = useState(FORM_KOSONG)
  const [kehamilanId, setKehamilanId] = useState(null)
  const [titik, setTitik] = useState(null) // { lat, lng }
  const [editId, setEditId] = useState(null)
  const [pesan, setPesan] = useState(null)
  const [menyimpan, setMenyimpan] = useState(false)
  const [lokasiStatus, setLokasiStatus] = useState(null) // { tipe: 'memuat'|'ok'|'err', teks }
  const [akurasi, setAkurasi] = useState(null) // meter; terisi hanya bila titik dari GPS perangkat
  const gpsRef = useRef({ id: null, timer: null, timer2: null })
  const [fokus, setFokus] = useState(0) // naik setiap "lokasi saya" berhasil -> peta zoom ke titik

  const [desaKerja, setDesaKerja] = useState([]) // [{ id, nama, kec }]
  const [daftar, setDaftar] = useState([])
  const [memuat, setMemuat] = useState(true)
  const [cariTabel, setCariTabel] = useState('')

  const [kandidat, setKandidat] = useState([])
  const [cariKh, setCariKh] = useState('')
  const [memuatKh, setMemuatKh] = useState(false)
  const [dipilihId, setDipilihId] = useState(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Lokasi awal peta: desa yang dipilih; bila belum ada, kecamatan pertama di wilayah kerja
  const teksAwalPeta = useMemo(() => {
    const d = desaKerja.find((x) => x.id === form.desa_id)
    if (d) return `${d.nama}${d.kec ? `, Kecamatan ${d.kec}` : ''}`
    const k = desaKerja[0]?.kec
    return k ? `Kecamatan ${k}` : ''
  }, [desaKerja, form.desa_id])

  // Desa dalam wilayah kerja puskesmas (dari tabel wilayah_kerja_desa)
  useEffect(() => {
    if (!instansiId) return
    let batal = false
    ;(async () => {
      try {
        const [wil, wk] = await Promise.all([
          muatWilayahDesa(),
          supabase.from('wilayah_kerja_desa').select('desa_id').eq('instansi_id', instansiId),
        ])
        if (batal) return
        if (wk.error) throw new Error(wk.error.message)
        const l = wk.data
          .map((r) => {
            const d = wil.desaById.get(r.desa_id)
            return { id: r.desa_id, nama: d?.name ?? r.desa_id, kec: d ? wil.kecById.get(d.district_id)?.name ?? '' : '' }
          })
          .sort((a, b) => a.kec.localeCompare(b.kec, 'id') || a.nama.localeCompare(b.nama, 'id'))
        setDesaKerja(l)
      } catch (e) {
        if (!batal) setPesan({ tipe: 'err', teks: 'Gagal memuat daftar desa: ' + e.message })
      }
    })()
    return () => { batal = true }
  }, [instansiId])

  const muatDaftar = useCallback(async () => {
    if (!instansiId) return
    setMemuat(true)
    const { data, error } = await supabase
      .from(TABEL)
      .select('*')
      .eq('instansi_id', instansiId)
      .is('dibatalkan_pada', null)
      .order('created_at', { ascending: false })
    if (error) setPesan({ tipe: 'err', teks: 'Gagal memuat daftar pasien: ' + error.message })
    else setDaftar(data ?? [])
    setMemuat(false)
  }, [instansiId])

  useEffect(() => { muatDaftar() }, [muatDaftar])

  // Kehamilan aktif milik puskesmas ini (untuk mode "terdaftar")
  useEffect(() => {
    if (mode !== 'terdaftar' || !instansiId) return
    let batal = false
    setMemuatKh(true)
    supabase
      .from('kehamilan')
      .select('*, pasien:pasien_id(id, nama_lengkap, tanggal_lahir, no_kk, no_telepon)')
      .eq('instansi_id', instansiId)
      .eq('status', 'aktif')
      .limit(500)
      .then(({ data, error }) => {
        if (batal) return
        if (error) setPesan({ tipe: 'err', teks: 'Gagal memuat data kehamilan: ' + error.message })
        else setKandidat(data ?? [])
        setMemuatKh(false)
      })
    return () => { batal = true }
  }, [mode, instansiId])

  const sudahAdaTitik = useMemo(() => new Set(daftar.filter((p) => p.kehamilan_id && p.id !== editId).map((p) => p.kehamilan_id)), [daftar, editId])

  const hasilKh = useMemo(() => {
    const q = norm(cariKh)
    if (!q) return []
    return kandidat
      .filter((k) => norm(k.pasien?.nama_lengkap).includes(q) || (k.pasien?.no_kk ?? '').includes(q.replace(/\s/g, '')))
      .slice(0, 8)
  }, [kandidat, cariKh])

  function pilihKehamilan(k) {
    setKehamilanId(k.id)
    setForm((f) => ({
      ...f,
      nama: k.pasien?.nama_lengkap ?? '',
      umur: hitungUmurTahun(k.pasien?.tanggal_lahir),
      hpl: hplDariKehamilan(k),
      no_hp: k.pasien?.no_telepon ?? '',
    }))
    setCariKh('')
  }

  function gantiMode(m) {
    setMode(m)
    if (m === 'manual') setKehamilanId(null)
  }

  function setKoordinat(lat, lng) {
    setTitik({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })
  }

  function hentikanGps() {
    const g = gpsRef.current
    if (g.id != null && navigator.geolocation) navigator.geolocation.clearWatch(g.id)
    clearTimeout(g.timer)
    clearTimeout(g.timer2)
    gpsRef.current = { id: null, timer: null, timer2: null }
  }

  // Bersihkan pemantauan GPS bila komponen ditutup
  useEffect(() => () => hentikanGps(), [])

  // Klik / geser penanda di peta = pilihan manual: batalkan pencarian GPS yang masih berjalan agar tidak menimpa
  function pilihDiPeta(lat, lng) {
    hentikanGps()
    setAkurasi(null)
    setLokasiStatus(null)
    setKoordinat(lat, lng)
  }

  function ubahKoordinatManual(sumbu, v) {
    hentikanGps()
    setAkurasi(null)
    const n = v === '' ? NaN : Number(v.replace(',', '.'))
    setTitik((t) => {
      const lain = t ?? { lat: NaN, lng: NaN }
      return { ...lain, [sumbu]: n }
    })
  }

  // "Gunakan lokasi saya": posisi GPS perangkat yang sedang dipakai, akurasi tinggi.
  // - Memantau terus-menerus (watchPosition) dan memakai pembacaan paling akurat, bukan pembacaan pertama.
  // - Tidak memakai cache dan tidak jatuh ke lokasi perkiraan Wi-Fi/IP (bisa meleset ratusan meter sampai kilometer).
  // - Bila akurasi terbaik > AKURASI_MAKS, titik tidak dipasang; petugas klik langsung di peta atau coba lagi.
  function lokasiSaya() {
    if (!navigator.geolocation) {
      setLokasiStatus({ tipe: 'err', teks: 'Peramban ini tidak mendukung lokasi. Klik langsung di peta.' })
      return
    }
    if (window.isSecureContext === false) {
      setLokasiStatus({ tipe: 'err', teks: 'Lokasi hanya bisa dipakai bila aplikasi dibuka lewat HTTPS. Klik langsung di peta.' })
      return
    }
    hentikanGps()
    const mulai = Date.now()
    let terbaik = null
    let galatKode = null
    let usai = false
    let bukanGps = 0
    setLokasiStatus({ tipe: 'memuat', teks: 'Mengunci GPS… tetap di lokasi rumah dan tunggu beberapa detik.' })

    const selesai = () => {
      if (usai) return
      usai = true
      hentikanGps()
      if (!terbaik) {
        const teks =
          bukanGps > 0
            ? 'Perangkat ini tidak memberi data GPS asli (kemungkinan laptop/PC, lokasinya hanya tebakan Wi-Fi/IP dan bisa salah jauh). Titik tidak dipasang. Buka aplikasi ini dari HP dengan GPS menyala, atau tentukan titik dengan klik langsung di peta satelit.'
            : galatKode === 1
            ? 'Izin lokasi ditolak. Izinkan lokasi untuk situs ini (ikon gembok di samping alamat), lalu coba lagi.'
            : 'Posisi GPS tidak diperoleh. Nyalakan lokasi perangkat dengan mode akurasi tinggi, berdiri di tempat terbuka, lalu coba lagi. Atau klik langsung di peta.'
        setLokasiStatus({ tipe: 'err', teks })
        return
      }
      const ak = Math.max(1, Math.round(terbaik.accuracy))
      if (!terbaik.gps) {
        // Tebakan Wi-Fi/IP (laptop/PC): angka akurasinya tidak bisa dipercaya, bisa meleset puluhan km.
        setKoordinat(terbaik.lat, terbaik.lng)
        setAkurasi(null) // tanpa lingkaran akurasi supaya tidak terlihat meyakinkan
        setLokasiStatus({
          tipe: 'err',
          teks: 'PERHATIAN: perangkat ini tidak memberi data GPS asli (kemungkinan laptop/PC). Posisi di atas hanya tebakan Wi-Fi/IP dan bisa meleset sampai puluhan kilometer. Jangan disimpan dulu: klik di peta ke rumah yang benar, atau buka dari HP dengan GPS.',
        })
        return
      }
      if (ak > AKURASI_MAKS) {
        setLokasiStatus({
          tipe: 'err',
          teks: `Akurasi terbaik hanya ± ${ak} m (dibutuhkan ≤ ${AKURASI_MAKS} m), jadi titik tidak dipasang agar tidak meleset. Pindah ke tempat terbuka lalu coba lagi, atau klik langsung di peta.`,
        })
        return
      }
      setKoordinat(terbaik.lat, terbaik.lng)
      setAkurasi(ak)
      setFokus((n) => n + 1) // peta terbang ke titik dan diperbesar
      setLokasiStatus({ tipe: 'ok', teks: `Lokasi perangkat terkunci (akurasi ± ${ak} m). Geser penanda hanya bila perlu menyesuaikan ke rumah.` })
    }

    const onPos = (p) => {
      if (usai) return
      if (p.timestamp && p.timestamp < mulai - 2000) return // abaikan pembacaan lama dari cache
      const c = p.coords
      if (!koordOk(c.latitude, c.longitude)) return
      if (WAJIB_GPS && (c.altitude === null || c.altitude === undefined)) { bukanGps++; return }
      const gps = c.altitude !== null && c.altitude !== undefined // ciri GPS asli
      const lebihBaik = !terbaik || (gps && !terbaik.gps) || (gps === terbaik.gps && c.accuracy < terbaik.accuracy)
      if (lebihBaik) terbaik = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, gps }
      if (!terbaik.gps) return // bukan GPS: tunggu pembacaan GPS; bila tidak datang, diputuskan oleh timer cepat
      if (terbaik.accuracy <= AKURASI_TARGET) return selesai()
      setLokasiStatus({ tipe: 'memuat', teks: `Mengunci GPS… akurasi saat ini ± ${Math.round(terbaik.accuracy)} m (target ≤ ${AKURASI_TARGET} m).` })
    }

    const onGalat = (e) => {
      galatKode = e.code
      if (e.code === 1) selesai() // izin ditolak: berhenti sekarang
      // kode 2/3 bisa sementara; pemantauan terus berjalan sampai batas waktu
    }

    gpsRef.current.id = navigator.geolocation.watchPosition(onPos, onGalat, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 })
    gpsRef.current.timer = setTimeout(selesai, AKURASI_WAKTU)
    // Laptop/PC tidak akan pernah mengirim pembacaan GPS: jangan membuat petugas menunggu 25 detik
    gpsRef.current.timer2 = setTimeout(() => {
      if (gpsRef.current.id != null && terbaik && !terbaik.gps) selesai()
    }, 8000)
  }

  function reset() {
    setForm(FORM_KOSONG)
    setKehamilanId(null)
    hentikanGps()
    setTitik(null)
    setAkurasi(null)
    setLokasiStatus(null)
    setEditId(null)
    setCariKh('')
  }

  const kembar = useMemo(() => {
    if (!form.nama.trim() || !form.desa_id) return null
    return daftar.find((p) => p.id !== editId && p.desa_id === form.desa_id && norm(p.nama) === norm(form.nama)) ?? null
  }, [daftar, form.nama, form.desa_id, editId])

  async function simpan() {
    setPesan(null)
    const lat = titik?.lat
    const lng = titik?.lng
    const umur = form.umur === '' ? null : Number(form.umur)
    if (!instansiId) return setPesan({ tipe: 'err', teks: 'Instansi petugas tidak ditemukan.' })
    if (!form.nama.trim()) return setPesan({ tipe: 'err', teks: 'Nama ibu hamil harus diisi.' })
    if (!form.desa_id) return setPesan({ tipe: 'err', teks: 'Pilih desa/kelurahan.' })
    if (umur !== null && (!Number.isInteger(umur) || umur < 10 || umur > 60)) return setPesan({ tipe: 'err', teks: 'Umur harus bilangan bulat 10-60 tahun.' })
    if (!koordOk(lat, lng)) return setPesan({ tipe: 'err', teks: 'Tentukan titik rumah: klik di peta atau isi lintang dan bujur.' })

    const payload = {
      instansi_id: instansiId,
      kehamilan_id: mode === 'terdaftar' ? kehamilanId : null,
      nama: form.nama.trim(),
      umur,
      hpl: form.hpl || null,
      no_hp: form.no_hp.trim() || null,
      desa_id: form.desa_id,
      latitude: lat,
      longitude: lng,
      catatan: form.catatan.trim() || null,
    }
    if (mode === 'terdaftar' && !kehamilanId) return setPesan({ tipe: 'err', teks: 'Cari dan pilih ibu hamil dari data kehamilan, atau ganti ke isi manual.' })

    setMenyimpan(true)
    const q = editId ? supabase.from(TABEL).update(payload).eq('id', editId) : supabase.from(TABEL).insert(payload)
    const { error } = await q
    setMenyimpan(false)
    if (error) {
      setPesan({
        tipe: 'err',
        teks: error.code === '23505' ? 'Ibu hamil ini sudah punya titik aktif. Ubah titik yang ada di tabel.' : 'Gagal menyimpan: ' + error.message,
      })
      return
    }
    setPesan({ tipe: 'ok', teks: editId ? 'Perubahan tersimpan.' : 'Titik ibu hamil tersimpan.' })
    reset()
    muatDaftar()
  }

  function mulaiUbah(p) {
    setEditId(p.id)
    setMode(p.kehamilan_id ? 'terdaftar' : 'manual')
    setKehamilanId(p.kehamilan_id ?? null)
    setForm({
      nama: p.nama ?? '',
      umur: p.umur ?? '',
      hpl: p.hpl ? String(p.hpl).slice(0, 10) : '',
      no_hp: p.no_hp ?? '',
      desa_id: p.desa_id ?? '',
      catatan: p.catatan ?? '',
    })
    hentikanGps()
    setAkurasi(null)
    setLokasiStatus(null)
    setTitik({ lat: Number(p.latitude), lng: Number(p.longitude) })
    setDipilihId(p.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function batalkan(p) {
    if (!window.confirm(`Batalkan titik ${p.nama}? Data tidak dihapus permanen, tetapi hilang dari peta dan daftar.`)) return
    const { error } = await supabase.from(TABEL).update({ dibatalkan_pada: new Date().toISOString() }).eq('id', p.id)
    if (error) return setPesan({ tipe: 'err', teks: 'Gagal membatalkan: ' + error.message })
    if (editId === p.id) reset()
    setPesan({ tipe: 'ok', teks: `Titik ${p.nama} dibatalkan.` })
    muatDaftar()
  }

  const namaDesa = useMemo(() => Object.fromEntries(desaKerja.map((d) => [d.id, `${d.nama} (${d.kec})`])), [desaKerja])

  const daftarTampil = useMemo(() => {
    const q = norm(cariTabel)
    if (!q) return daftar
    return daftar.filter((p) => norm(p.nama).includes(q) || norm(namaDesa[p.desa_id]).includes(q))
  }, [daftar, cariTabel, namaDesa])

  // ---- gaya ----
  const kartu = { background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: 16 }
  const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted, #64707a)', marginBottom: 4 }
  const input = {
    width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 13, border: '1px solid var(--line, #d1d5db)',
    borderRadius: 8, fontFamily: 'inherit', background: '#fff', color: 'var(--ink, #12181b)',
  }
  const tombol = (aktif = true, bg = 'var(--accent, #0f7b64)') => ({
    padding: '9px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8,
    background: aktif ? bg : 'var(--disabled, #e5e7eb)', color: aktif ? '#fff' : 'var(--muted, #6b7280)',
    cursor: aktif ? 'pointer' : 'not-allowed',
  })
  const tombolTepi = { padding: '6px 10px', fontSize: 12, fontWeight: 600, border: '1px solid var(--line, #d1d5db)', borderRadius: 6, background: '#fff', cursor: 'pointer' }
  const chip = (aktif) => ({
    padding: '7px 12px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
    border: '1px solid var(--line, #d1d5db)',
    background: aktif ? 'var(--accent, #0f7b64)' : '#fff', color: aktif ? '#fff' : 'var(--ink, #12181b)',
  })

  if (!instansiId) return <div style={{ padding: 24, color: 'var(--muted, #64707a)' }}>Memuat data puskesmas…</div>

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Input Pasien Peta</h1>
        <p style={{ fontSize: 13, margin: '4px 0 0', color: 'var(--muted, #6b7280)' }}>
          Tandai lokasi rumah ibu hamil di wilayah kerja puskesmas.
        </p>
      </div>

      {pesan && (
        <div
          role="status"
          onClick={() => setPesan(null)}
          style={{
            padding: '10px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            background: pesan.tipe === 'ok' ? '#e6f4ef' : '#fdecea', color: pesan.tipe === 'ok' ? '#0b5d4b' : '#9b1c1c',
            border: `1px solid ${pesan.tipe === 'ok' ? '#b6dfd2' : '#f5c2c0'}`,
          }}
        >
          {pesan.teks}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        {/* ---------- form ---------- */}
        <div style={{ ...kartu, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={chip(mode === 'terdaftar')} onClick={() => gantiMode('terdaftar')}>Pilih dari data kehamilan</button>
            <button type="button" style={chip(mode === 'manual')} onClick={() => gantiMode('manual')}>Isi manual</button>
          </div>

          {mode === 'terdaftar' && (
            <div>
              <label style={label} htmlFor="cari-kh">Cari ibu hamil terdaftar (nama atau No. KK)</label>
              <input id="cari-kh" style={input} value={cariKh} onChange={(e) => setCariKh(e.target.value)} placeholder="Ketik minimal 2 huruf" />
              {memuatKh && <div style={{ fontSize: 12, color: 'var(--muted, #64707a)', marginTop: 4 }}>Memuat data kehamilan…</div>}
              {hasilKh.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, overflow: 'hidden' }}>
                  {hasilKh.map((k) => {
                    const dipakai = sudahAdaTitik.has(k.id)
                    return (
                      <li key={k.id}>
                        <button
                          type="button"
                          disabled={dipakai}
                          onClick={() => pilihKehamilan(k)}
                          style={{
                            width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 13, border: 'none', borderBottom: '1px solid var(--line, #e5e7eb)',
                            background: '#fff', cursor: dipakai ? 'not-allowed' : 'pointer', opacity: dipakai ? 0.5 : 1,
                          }}
                        >
                          <strong>{k.pasien?.nama_lengkap ?? '(tanpa nama)'}</strong>
                          <span style={{ color: 'var(--muted, #64707a)' }}>
                            {' '}— KK {k.pasien?.no_kk ?? '-'}, HPL {tampilTanggal(hplDariKehamilan(k))}
                            {dipakai ? ' (sudah punya titik)' : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {cariKh.trim().length >= 2 && !memuatKh && hasilKh.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted, #64707a)', marginTop: 4 }}>
                  Tidak ditemukan. Ganti ke “Isi manual” bila ibu hamil belum terdaftar.
                </div>
              )}
              {kehamilanId && (
                <div style={{ fontSize: 12, color: '#0b5d4b', marginTop: 6 }}>Terhubung ke data kehamilan. Nama, umur, HPL, dan No. HP terisi otomatis.</div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10 }}>
            <div>
              <label style={label} htmlFor="f-nama">Nama ibu hamil</label>
              <input id="f-nama" style={input} value={form.nama} onChange={(e) => set('nama', e.target.value)} readOnly={mode === 'terdaftar' && !!kehamilanId} />
            </div>
            <div>
              <label style={label} htmlFor="f-umur">Umur (th)</label>
              <input id="f-umur" style={input} inputMode="numeric" value={form.umur} onChange={(e) => set('umur', e.target.value.replace(/\D/g, ''))} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label} htmlFor="f-hpl">Perkiraan lahir (HPL)</label>
              <input id="f-hpl" type="date" style={input} value={form.hpl} onChange={(e) => set('hpl', e.target.value)} />
            </div>
            <div>
              <label style={label} htmlFor="f-hp">No. HP</label>
              <input id="f-hp" style={input} inputMode="tel" value={form.no_hp} onChange={(e) => set('no_hp', e.target.value)} />
            </div>
          </div>

          <div>
            <label style={label} htmlFor="f-desa">Desa / kelurahan</label>
            <select id="f-desa" style={input} value={form.desa_id} onChange={(e) => set('desa_id', e.target.value)}>
              <option value="">Pilih desa/kelurahan</option>
              {desaKerja.map((d) => (
                <option key={d.id} value={d.id}>{d.nama} — Kec. {d.kec}</option>
              ))}
            </select>
            {desaKerja.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted, #64707a)', marginTop: 4 }}>
                Belum ada desa. Tetapkan wilayah kerja di menu Peta Distribusi.
              </div>
            )}
          </div>

          <div>
            <label style={label} htmlFor="f-cat">Catatan</label>
            <textarea id="f-cat" rows={2} style={{ ...input, resize: 'vertical' }} value={form.catatan} onChange={(e) => set('catatan', e.target.value)} placeholder="Ciri rumah, akses jalan, dan sebagainya" />
          </div>

          {kembar && (
            <div style={{ padding: '8px 10px', fontSize: 12, borderRadius: 8, background: '#fff6e0', border: '1px solid #f1d48a', color: '#7a5600' }}>
              Sudah ada titik atas nama “{kembar.nama}” di desa yang sama. Periksa dulu supaya tidak ada titik ganda.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={tombol(!menyimpan)} disabled={menyimpan} onClick={simpan}>
              {menyimpan ? 'Menyimpan…' : editId ? 'Simpan perubahan' : 'Simpan titik'}
            </button>
            {(editId || form.nama || titik) && (
              <button type="button" style={tombolTepi} onClick={reset}>{editId ? 'Batal ubah' : 'Kosongkan form'}</button>
            )}
          </div>
        </div>

        {/* ---------- pemilih titik ---------- */}
        <div style={{ ...kartu, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Titik rumah</div>
          <div style={{ fontSize: 12, color: 'var(--muted, #64707a)' }}>
            Klik di peta untuk menaruh penanda, lalu geser untuk menyesuaikan. Perbesar sampai atap rumah terlihat.
          </div>
          <PemilihTitik fokus={fokus} teksAwal={teksAwalPeta} titik={titik && koordOk(titik.lat, titik.lng) ? titik : null} onPilih={pilihDiPeta} akurasi={akurasi} warna={mode === 'terdaftar' ? warna.terdaftar : warna.manual} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={label} htmlFor="f-lat">Lintang</label>
              <input id="f-lat" style={input} inputMode="decimal" value={titik && Number.isFinite(titik.lat) ? titik.lat : ''} onChange={(e) => ubahKoordinatManual('lat', e.target.value)} placeholder="-5.147665" />
            </div>
            <div>
              <label style={label} htmlFor="f-lng">Bujur</label>
              <input id="f-lng" style={input} inputMode="decimal" value={titik && Number.isFinite(titik.lng) ? titik.lng : ''} onChange={(e) => ubahKoordinatManual('lng', e.target.value)} placeholder="119.432732" />
            </div>
            <button type="button" style={{ ...tombolTepi, opacity: lokasiStatus?.tipe === 'memuat' ? 0.6 : 1 }} disabled={lokasiStatus?.tipe === 'memuat'} onClick={lokasiSaya}>
              {lokasiStatus?.tipe === 'memuat' ? 'Mengunci GPS…' : 'Gunakan lokasi saya'}
            </button>
          </div>
          {lokasiStatus && (
            <div style={{ fontSize: 12, color: lokasiStatus.tipe === 'err' ? '#9b1c1c' : lokasiStatus.tipe === 'ok' ? '#0b5d4b' : 'var(--muted, #64707a)' }}>
              {lokasiStatus.teks}
            </div>
          )}
        </div>
      </div>

      {/* ---------- peta semua pasien + tabel ---------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ ...kartu, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Sebaran ibu hamil ({daftar.length})</div>
            <div style={{ color: 'var(--muted, #64707a)', display: 'flex', gap: 14 }}>
              <PilihWarnaPenanda label="Terdaftar" nilai={warna.terdaftar} onChange={(v) => setWarna('terdaftar', v)} />
              <PilihWarnaPenanda label="Manual" nilai={warna.manual} onChange={(v) => setWarna('manual', v)} />
            </div>
          </div>
          <PetaSemua daftar={daftar} dipilihId={dipilihId} onKlik={setDipilihId} warna={warna} />
        </div>

        <div style={{ ...kartu, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Daftar ibu hamil</div>
            <input style={{ ...input, width: 200 }} value={cariTabel} onChange={(e) => setCariTabel(e.target.value)} placeholder="Cari nama atau desa" aria-label="Cari di daftar" />
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted, #64707a)', position: 'sticky', top: 0, background: '#fff' }}>
                  <th style={{ padding: '6px 8px' }}>Nama</th>
                  <th style={{ padding: '6px 8px' }}>Desa</th>
                  <th style={{ padding: '6px 8px' }}>HPL</th>
                  <th style={{ padding: '6px 8px' }}>Sumber</th>
                  <th style={{ padding: '6px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {memuat && (
                  <tr><td colSpan={5} style={{ padding: 12, color: 'var(--muted, #64707a)' }}>Memuat…</td></tr>
                )}
                {!memuat && daftarTampil.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 12, color: 'var(--muted, #64707a)' }}>
                    {daftar.length === 0 ? 'Belum ada titik. Isi form di atas untuk menambah ibu hamil pertama.' : 'Tidak ada yang cocok dengan pencarian.'}
                  </td></tr>
                )}
                {daftarTampil.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setDipilihId(p.id)}
                    style={{ borderTop: '1px solid var(--line, #e5e7eb)', cursor: 'pointer', background: dipilihId === p.id ? '#eef7f4' : 'transparent' }}
                  >
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontWeight: 600 }}>{p.nama}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted, #64707a)' }}>{p.umur ? `${p.umur} th` : ''}{p.no_hp ? ` · ${p.no_hp}` : ''}</div>
                    </td>
                    <td style={{ padding: '8px' }}>{namaDesa[p.desa_id] ?? p.desa_id}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{tampilTanggal(p.hpl)}</td>
                    <td style={{ padding: '8px' }}>{p.kehamilan_id ? 'Terdaftar' : 'Manual'}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button type="button" style={tombolTepi} onClick={(e) => { e.stopPropagation(); mulaiUbah(p) }}>Ubah</button>{' '}
                      <button type="button" style={{ ...tombolTepi, color: '#9b1c1c' }} onClick={(e) => { e.stopPropagation(); batalkan(p) }}>Batalkan</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}