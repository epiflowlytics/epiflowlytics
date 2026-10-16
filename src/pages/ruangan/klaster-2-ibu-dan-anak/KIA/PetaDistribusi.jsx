import { useEffect, useMemo, useRef, useState } from 'react'
import { geoPath, geoCentroid, geoContains, geoBounds, geoProjection } from 'd3-geo'
import { supabase } from '../../../../lib/supabaseClient'
import { PinSvg, useWarnaPenanda, PilihWarnaPenanda } from './penandaPasien'

const PADDING_PETA = 24 // jarak tepi peta saat "zoom pas"
const MARGIN_MM = 8 // jarak kertas ke tepi
const LABEL_MM = 8 // ruang angka grid di luar bingkai
const JUDUL_MM = 14 // tinggi kotak judul
const BINGKAI_MM = 2 // tebal bingkai berselang hitam-putih di sekeliling peta
const BINGKAI_SEG_MM = 5 // panjang satu segmen bingkai
const KANAN_MM = 72 // lebar kolom kanan (kotak utara, skala, legenda, sumber, dibuat oleh)
const GAP_MM = 3 // jarak antarkotak
const UTARA_MM = 30
const SKALA_MM = 22
const SUMBER_MM = 28
const PEMBUAT_MM = 38

// ---- UTM (elipsoid WGS84, faktor skala 0,9996) ----
const RAD = Math.PI / 180
const A_WGS = 6378137
const F_WGS = 1 / 298.257223563
const E2 = F_WGS * (2 - F_WGS)
const EP2 = E2 / (1 - E2)
const K0 = 0.9996
const E1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))

// lam & phi dalam radian. maju: lon/lat -> [E, N] meter. mundur: [E, N] -> [lam, phi] radian
function buatUtm(zona, selatan) {
  const lam0 = (zona * 6 - 183) * RAD
  const utaraSemu = selatan ? 10000000 : 0

  function maju(lam, phi) {
    const l = lam - lam0
    const sp = Math.sin(phi)
    const cp = Math.cos(phi)
    const tp = Math.tan(phi)
    const N = A_WGS / Math.sqrt(1 - E2 * sp * sp)
    const T = tp * tp
    const C = EP2 * cp * cp
    const A = cp * l
    const M = A_WGS * ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi
      - ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi)
      + ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi)
      - ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi))
    const easting = K0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * A ** 5) / 120) + 500000
    const northing = K0 * (M + N * tp * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * A ** 6) / 720)) + utaraSemu
    return [easting, northing]
  }

  function mundur(E, N) {
    const x = E - 500000
    const y = N - utaraSemu
    const M = y / K0
    const mu = M / (A_WGS * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256))
    const phi1 = mu
      + ((3 * E1) / 2 - (27 * E1 ** 3) / 32) * Math.sin(2 * mu)
      + ((21 * E1 ** 2) / 16 - (55 * E1 ** 4) / 32) * Math.sin(4 * mu)
      + ((151 * E1 ** 3) / 96) * Math.sin(6 * mu)
      + ((1097 * E1 ** 4) / 512) * Math.sin(8 * mu)
    const sp = Math.sin(phi1)
    const cp = Math.cos(phi1)
    const tp = Math.tan(phi1)
    const N1 = A_WGS / Math.sqrt(1 - E2 * sp * sp)
    const R1 = (A_WGS * (1 - E2)) / Math.pow(1 - E2 * sp * sp, 1.5)
    const T1 = tp * tp
    const C1 = EP2 * cp * cp
    const D = x / (N1 * K0)
    const phi = phi1 - ((N1 * tp) / R1) * (
      (D * D) / 2
      - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24
      + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720
    )
    const lam = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / cp
    return [lam + lam0, phi]
  }

  return { maju, mundur }
}

// Proyeksi d3 yang memakai UTM; d3 memanggil raw(lam, phi) dalam radian
function buatProyeksiUtm(zona, selatan) {
  const u = buatUtm(zona, selatan)
  const raw = (lam, phi) => u.maju(lam, phi)
  raw.invert = (x, y) => u.mundur(x, y)
  return geoProjection(raw)
}

// Skala grafis: panjang bilah dipilih dari angka bulat, lalu dihitung dari faktor skala peta
function hitungSkala(path, utm, zoom, W, H, skala) {
  if (!path) return null
  const proj = path.projection()
  const pusat = proj.invert([W / 2, H / 2])
  if (!pusat) return null
  const u = buatUtm(utm.zona, utm.selatan)
  const [lon, lat] = pusat
  const [E, N] = u.maju(lon * RAD, lat * RAD)
  const [lon2, lat2] = u.mundur(E + 1000, N).map((v) => v / RAD)
  const p1 = proj([lon, lat])
  const p2 = proj([lon2, lat2])
  if (!p1 || !p2) return null
  const pxPerM = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1000
  if (!(pxPerM > 0)) return null
  const mPerMm = skala / (pxPerM * zoom)
  const kandidat = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]
  let L = kandidat[0]
  for (const k of kandidat) if (k <= 40 * mPerMm) L = k
  return { denom: Math.round(mPerMm * 1000), panjangMm: L / mPerMm, L }
}

function BilahSkala({ k, sk, skala }) {
  if (!skala) return null
  const tengah = (k.x0 + k.x1) / 2
  const panjang = skala.panjangMm * sk
  const bx = tengah - panjang / 2
  const by = k.y0 + 11 * sk
  const tinggi = 2.2 * sk
  const seg = panjang / 4
  const angka = (v) => (skala.L >= 1000 ? (v / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 }) : `${v}`)
  const satuan = skala.L >= 1000 ? 'km' : 'm'
  // hanya 3 label (awal, tengah, akhir) agar tidak saling menimpa; satuan di label terakhir
  const label = [
    { x: bx, teks: '0' },
    { x: bx + panjang / 2, teks: angka(skala.L / 2) },
    { x: bx + panjang, teks: `${angka(skala.L)} ${satuan}` },
  ]
  return (
    <g style={{ pointerEvents: 'none' }}>
      <text x={tengah} y={k.y0 + 7 * sk} textAnchor="middle" fontSize={3.4 * sk} fontWeight={800} fill="#12181b">SKALA 1 : {skala.denom.toLocaleString('id-ID')}</text>
      {[0, 1, 2, 3].map((i) => (
        <rect key={'b' + i} x={bx + i * seg} y={by} width={seg} height={tinggi} fill={i % 2 === 0 ? '#12181b' : '#ffffff'} stroke="#12181b" strokeWidth={0.5} />
      ))}
      {label.map((l, i) => (
        <text key={'t' + i} x={l.x} y={by + tinggi + 3.8 * sk} textAnchor="middle" fontSize={2.8 * sk} fill="#12181b">{l.teks}</text>
      ))}
    </g>
  )
}

// Bingkai peta gaya QGIS/ArcGIS: garis tepi dalam (tipis) dan garis tepi luar (tebal), putih di antaranya
function BingkaiBerselang({ k, sk }) {
  const t = BINGKAI_MM * sk
  const HITAM = '#12181b'
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={k.x0} y={k.y0} width={k.x1 - k.x0} height={k.y1 - k.y0} fill="none" stroke={HITAM} strokeWidth={0.8} />
      <rect x={k.x0 - t} y={k.y0 - t} width={k.x1 - k.x0 + 2 * t} height={k.y1 - k.y0 + 2 * t} fill="none" stroke={HITAM} strokeWidth={1.8} />
    </g>
  )
}

const GRUP_JALAN = {
  motorway: 'Jalan tol', motorway_link: 'Jalan tol',
  trunk: 'Jalan nasional', trunk_link: 'Jalan nasional',
  primary: 'Jalan provinsi', primary_link: 'Jalan provinsi',
  secondary: 'Jalan kabupaten', secondary_link: 'Jalan kabupaten', tertiary: 'Jalan kabupaten', tertiary_link: 'Jalan kabupaten',
  unclassified: 'Jalan lingkungan', residential: 'Jalan lingkungan', living_street: 'Jalan lingkungan', service: 'Jalan lingkungan',
  track: 'Jalan tanah/setapak', track_grade1: 'Jalan tanah/setapak', track_grade2: 'Jalan tanah/setapak', track_grade3: 'Jalan tanah/setapak',
  track_grade4: 'Jalan tanah/setapak', track_grade5: 'Jalan tanah/setapak', path: 'Jalan tanah/setapak', bridleway: 'Jalan tanah/setapak',
  footway: 'Jalan tanah/setapak', cycleway: 'Jalan tanah/setapak', pedestrian: 'Jalan tanah/setapak', steps: 'Jalan tanah/setapak',
}
const URUT_JALAN = ['Jalan tol', 'Jalan nasional', 'Jalan provinsi', 'Jalan kabupaten', 'Jalan lingkungan', 'Jalan tanah/setapak']
const GRUP_SUNGAI = { river: 'Sungai', canal: 'Sungai', stream: 'Anak sungai/saluran', drain: 'Anak sungai/saluran' }
const URUT_SUNGAI = ['Sungai', 'Anak sungai/saluran']

// Legenda di dalam kertas: ukuran huruf mengikuti skala kertas, hanya memuat unsur yang tergambar di peta
function LegendaSvg({ k, sk, baris, warnaTeks, warnaGaris }) {
  const tinggiMm = (k.y1 - k.y0) / sk
  const tersedia = tinggiMm - 12
  const rowMm = Math.max(2.6, Math.min(4.6, tersedia / Math.max(1, baris.length)))
  const fs = Math.min(3, rowMm * 0.68) * sk
  const x0 = k.x0 + 3 * sk
  let y = k.y0 + 10 * sk
  const id = 'klip-legenda'
  const el = []
  baris.forEach((r, i) => {
    const cy = y + i * rowMm * sk
    if (r.tipe === 'judul') {
      el.push(<text key={i} x={x0} y={cy} fontSize={fs * 1.1} fontWeight={800} fill={warnaTeks}>{r.teks}</text>)
      return
    }
    const sx = x0 + 1 * sk
    const sw = 6 * sk
    const tx = x0 + 9 * sk
    const mid = cy - fs * 0.35
    if (r.tipe === 'kotak') el.push(<rect key={'s' + i} x={sx} y={mid - 1.3 * sk} width={sw} height={2.6 * sk} fill={r.warna} stroke="#12181b" strokeWidth={0.4} />)
    if (r.tipe === 'garis') el.push(<line key={'s' + i} x1={sx} x2={sx + sw} y1={mid} y2={mid} stroke={r.warna} strokeWidth={Math.max(0.8, r.lebar)} strokeLinecap="round" />)
    if (r.tipe === 'pin') el.push(<circle key={'s' + i} cx={sx + sw / 2} cy={mid} r={1.3 * sk} fill={r.warna} stroke="#ffffff" strokeWidth={0.5} />)
    el.push(<text key={'t' + i} x={tx} y={cy} fontSize={fs} fill={warnaTeks}>{r.teks}</text>)
  })
  return (
    <g style={{ pointerEvents: 'none' }}>
      <KotakSvg k={k} warna={warnaGaris} />
      <clipPath id={id}><rect x={k.x0} y={k.y0} width={k.x1 - k.x0} height={k.y1 - k.y0} /></clipPath>
      <text x={(k.x0 + k.x1) / 2} y={k.y0 + 4.5 * sk} textAnchor="middle" fontSize={3.6 * sk} fontWeight={800} fill={warnaTeks}>LEGENDA</text>
      <g clipPath={`url(#${id})`}>{el}</g>
    </g>
  )
}

// Kelas garis (jalan/sungai) yang benar-benar melewati wilayah yang digambar.
// Data dimuat per kotak 2x2 derajat, jadi banyak kelas yang hanya ada di luar wilayah dan tidak tampil di peta.
function kelasDalamArea(fitur, area, path) {
  const ada = new Set()
  if (!fitur || !path || area.length === 0) return ada
  const kotakArea = area.map((f) => ({ f, b: path.bounds(f) }))
  for (const ft of fitur) {
    const kelas = ft.properties.fclass
    if (ada.has(kelas) || !ft.geometry) continue
    const b = path.bounds(ft)
    if (!b || !Number.isFinite(b[0][0])) continue
    const kandidat = kotakArea.filter((a) => b[1][0] >= a.b[0][0] && b[0][0] <= a.b[1][0] && b[1][1] >= a.b[0][1] && b[0][1] <= a.b[1][1])
    if (kandidat.length === 0) continue
    const g = ft.geometry
    const titik = g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? g.coordinates.flat() : []
    outer: for (const c of titik) {
      for (const a of kandidat) {
        if (geoContains(a.f, c)) {
          ada.add(kelas)
          break outer
        }
      }
    }
  }
  return ada
}

// Peta dasar (ubin raster Web Mercator). Tiap ubin dipasang ke proyeksi UTM lewat transformasi affine dari 3 sudutnya.
const SUMBER_PETA = {
  satelit: { nama: 'Satelit', maksZ: 18, ket: 'Citra satelit: Esri, Maxar', url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}` },
  osm: { nama: 'Jalan (OpenStreetMap)', maksZ: 19, ket: 'Peta dasar: © OpenStreetMap contributors', url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png` },
  topo: { nama: 'Topografi', maksZ: 17, ket: 'Peta dasar: © OpenTopoMap, © OSM', url: (z, x, y) => `https://a.tile.opentopomap.org/${z}/${x}/${y}.png` },
  terang: { nama: 'Terang (minimalis)', maksZ: 19, ket: 'Peta dasar: © OSM, © CARTO', url: (z, x, y) => `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png` },
  gelap: { nama: 'Gelap', maksZ: 19, ket: 'Peta dasar: © OSM, © CARTO', url: (z, x, y) => `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png` },
}

function hitungUbin(path, basemap, bingkai, zoom, W, H) {
  const sp = SUMBER_PETA[basemap]
  if (!sp || !path) return []
  const proj = path.projection()
  const cx = W / 2
  const cy = H / 2
  const keRaw = (sx, sy) => [cx + (sx - cx) / zoom, cy + (sy - cy) / zoom]
  const ll = [[bingkai.x0, bingkai.y0], [bingkai.x1, bingkai.y0], [bingkai.x0, bingkai.y1], [bingkai.x1, bingkai.y1]]
    .map(([sx, sy]) => proj.invert(keRaw(sx, sy)))
  if (ll.some((v) => !v || !Number.isFinite(v[0]) || !Number.isFinite(v[1]))) return []
  const lonMin = Math.min(...ll.map((v) => v[0]))
  const lonMaks = Math.max(...ll.map((v) => v[0]))
  const latMin = Math.min(...ll.map((v) => v[1]))
  const latMaks = Math.max(...ll.map((v) => v[1]))
  const lebarPx = bingkai.x1 - bingkai.x0
  const butuh = (lebarPx * 1.5 * 360) / Math.max(1e-6, lonMaks - lonMin)
  let z = Math.min(sp.maksZ, Math.max(3, Math.ceil(Math.log2(butuh / 256))))
  const xDari = (lon, n) => Math.floor(((lon + 180) / 360) * n)
  const yDari = (lat, n) => Math.floor(((1 - Math.asinh(Math.tan(lat * RAD)) / Math.PI) / 2) * n)
  let x0, x1, y0, y1
  for (;;) {
    const n = 2 ** z
    x0 = Math.max(0, xDari(lonMin, n))
    x1 = Math.min(n - 1, xDari(lonMaks, n))
    y0 = Math.max(0, yDari(latMaks, n))
    y1 = Math.min(n - 1, yDari(latMin, n))
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 64 || z <= 3) break
    z -= 1
  }
  const n = 2 ** z
  const lonUbin = (x) => (x / n) * 360 - 180
  const latUbin = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) / RAD)
  const hasil = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tl = proj([lonUbin(x), latUbin(y)])
      const tr = proj([lonUbin(x + 1), latUbin(y)])
      const bl = proj([lonUbin(x), latUbin(y + 1)])
      if (!tl || !tr || !bl) continue
      const m = [(tr[0] - tl[0]) / 256, (tr[1] - tl[1]) / 256, (bl[0] - tl[0]) / 256, (bl[1] - tl[1]) / 256, tl[0], tl[1]]
      if (m.some((v) => !Number.isFinite(v))) continue
      hasil.push({ key: `${z}/${x}/${y}`, href: sp.url(z, x, y), m })
    }
  }
  return hasil
}

function KotakSvg({ k, warna }) {
  return <rect x={k.x0} y={k.y0} width={k.x1 - k.x0} height={k.y1 - k.y0} fill="#ffffff" stroke={warna} strokeWidth={1} style={{ pointerEvents: 'none' }} />
}

// Simbol arah utara: panah dua warna dengan huruf U (Utara) di atasnya
function PanahUtara({ cx, cy, r }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={r} fill="#ffffff" stroke="#12181b" strokeWidth={0.6} />
      <text x={cx} y={cy - r * 0.42} textAnchor="middle" fontSize={r * 0.42} fontWeight={800} fill="#12181b">U</text>
      <polygon points={`${cx},${cy - r * 0.22} ${cx - r * 0.3},${cy + r * 0.15} ${cx + r * 0.3},${cy + r * 0.15}`} fill="#12181b" />
      <polygon points={`${cx},${cy + r * 0.8} ${cx - r * 0.3},${cy + r * 0.15} ${cx + r * 0.3},${cy + r * 0.15}`} fill="#ffffff" stroke="#12181b" strokeWidth={0.6} />
    </g>
  )
}

// Titik-titik tempat sebuah garis memotong tepi bingkai.
// idx 1 = cek sy (tepi atas/bawah), idx 0 = cek sx (tepi kiri/kanan)
function cariPersilangan(titik, idx, tepi, bingkai) {
  const hasil = []
  for (let i = 0; i < titik.length - 1; i++) {
    const a = titik[i]
    const b = titik[i + 1]
    const da = a[idx] - tepi
    const db = b[idx] - tepi
    if (da !== 0 && (da < 0) === (db < 0)) continue
    const t = da === db ? 0 : da / (da - db)
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const dalam = idx === 1
      ? p[0] >= bingkai.x0 && p[0] <= bingkai.x1
      : p[1] >= bingkai.y0 && p[1] <= bingkai.y1
    if (dalam) hasil.push(p)
  }
  return hasil
}

// Grid UTM untuk kertas A4: garis dipotong di dalam bingkai, label ditaruh di margin luar bingkai
function bangunGrid(path, zona, selatan, jarakAwal, bingkai, zoom, W, H, sk) {
  const kosong = { d: '', labels: [] }
  const proj = path.projection()
  const u = buatUtm(zona, selatan)
  const cx = W / 2
  const cy = H / 2
  const keRaw = (sx, sy) => [cx + (sx - cx) / zoom, cy + (sy - cy) / zoom]
  const keLayar = (px, py) => [cx + zoom * (px - cx), cy + zoom * (py - cy)]

  const sudut = [
    [bingkai.x0, bingkai.y0],
    [bingkai.x1, bingkai.y0],
    [bingkai.x0, bingkai.y1],
    [bingkai.x1, bingkai.y1],
  ]
  const meter = sudut
    .map(([sx, sy]) => proj.invert(keRaw(sx, sy)))
    .filter(Boolean)
    .map(([lon, lat]) => u.maju(lon * RAD, lat * RAD))
  if (meter.length === 0) return kosong

  const minE = Math.min(...meter.map((m) => m[0]))
  const maksE = Math.max(...meter.map((m) => m[0]))
  const minN = Math.min(...meter.map((m) => m[1]))
  const maksN = Math.max(...meter.map((m) => m[1]))

  // jarak dinaikkan otomatis bila garis terlalu rapat
  let s = jarakAwal
  while ((maksE - minE) / s + (maksN - minN) / s > 150) s *= 2

  const garis = []
  for (let E = Math.floor(minE / s) * s; E <= maksE + s; E += s) garis.push({ tipe: 'v', nilai: E })
  for (let N = Math.floor(minN / s) * s; N <= maksN + s; N += s) garis.push({ tipe: 'h', nilai: N })

  const SAMPEL = 40
  const eMin = minE - s
  const eMaks = maksE + s
  const nMin = minN - s
  const nMaks = maksN + s
  let d = ''
  const labels = []
  for (const g of garis) {
    const titik = []
    for (let k = 0; k <= SAMPEL; k++) {
      const t = g.tipe === 'v'
        ? u.mundur(g.nilai, nMin + ((nMaks - nMin) * k) / SAMPEL)
        : u.mundur(eMin + ((eMaks - eMin) * k) / SAMPEL, g.nilai)
      titik.push([t[0] / RAD, t[1] / RAD])
    }
    d += path({ type: 'LineString', coordinates: titik }) || ''

    const layar = []
    for (const [lon, lat] of titik) {
      const px = proj([lon, lat])
      if (px && Number.isFinite(px[0]) && Number.isFinite(px[1])) layar.push(keLayar(px[0], px[1]))
    }
    const angka = Math.round(g.nilai).toLocaleString('id-ID')
    if (g.tipe === 'v') {
      const atas = cariPersilangan(layar, 1, bingkai.y0, bingkai)[0]
      const bawah = cariPersilangan(layar, 1, bingkai.y1, bingkai)[0]
      if (atas) labels.push({ x: atas[0], y: bingkai.y0 - (BINGKAI_MM + 1.5) * sk, anchor: 'middle', teks: `E ${angka}` })
      if (bawah) labels.push({ x: bawah[0], y: bingkai.y1 + (BINGKAI_MM + 4) * sk, anchor: 'middle', teks: `E ${angka}` })
    } else {
      const kiri = cariPersilangan(layar, 0, bingkai.x0, bingkai)[0]
      const kanan = cariPersilangan(layar, 0, bingkai.x1, bingkai)[0]
      if (kiri) labels.push({ x: bingkai.x0 - (BINGKAI_MM + 0.8) * sk, y: kiri[1], anchor: 'middle', rot: true, teks: `N ${angka}` })
      if (kanan) labels.push({ x: bingkai.x1 + (BINGKAI_MM + 3.4) * sk, y: kanan[1], anchor: 'middle', rot: true, teks: `N ${angka}` })
    }
  }
  return { d, labels }
}
const FILE_PETA = '/data/sulawesi/sulawesi-adminareas-simplified.geojson'
// Jalan dibagi per kotak 2x2 derajat: public/data/sulawesi/jalan/{baris}_{kolom}.geojson
// Konstanta ini harus sama dengan yang dipakai skrip split-jalan.cjs
const DIR_JALAN = '/data/sulawesi/jalan'
const JALAN_LON_AWAL = 117
const JALAN_LAT_AWAL = -8
const JALAN_UKURAN = 2

// warna dan lebar garis per kelas jalan (nilai fclass)
const GAYA_JALAN = {
  motorway:       { warna: '#e0612b', lebar: 2.2 },
  motorway_link:  { warna: '#e0612b', lebar: 1.4 },
  trunk:          { warna: '#e8891e', lebar: 2 },
  trunk_link:     { warna: '#e8891e', lebar: 1.3 },
  primary:        { warna: '#d4a017', lebar: 1.6 },
  primary_link:   { warna: '#d4a017', lebar: 1.1 },
  secondary:      { warna: '#6b7785', lebar: 1.2 },
  secondary_link: { warna: '#6b7785', lebar: 1 },
  tertiary:       { warna: '#6b7785', lebar: 1 },
  tertiary_link:  { warna: '#6b7785', lebar: 1 },
  unclassified:   { warna: '#a3a3a3', lebar: 0.7 },
  residential:    { warna: '#a3a3a3', lebar: 0.6 },
  living_street:  { warna: '#a3a3a3', lebar: 0.6 },
  service:        { warna: '#bdbdbd', lebar: 0.5 },
  track:          { warna: '#8b6f47', lebar: 0.5 },
  track_grade1:   { warna: '#8b6f47', lebar: 0.5 },
  track_grade2:   { warna: '#8b6f47', lebar: 0.5 },
  track_grade3:   { warna: '#8b6f47', lebar: 0.5 },
  track_grade4:   { warna: '#8b6f47', lebar: 0.5 },
  track_grade5:   { warna: '#8b6f47', lebar: 0.5 },
  path:           { warna: '#8b6f47', lebar: 0.4 },
  bridleway:      { warna: '#8b6f47', lebar: 0.4 },
  footway:        { warna: '#8b6f47', lebar: 0.3 },
  cycleway:       { warna: '#8b6f47', lebar: 0.3 },
  pedestrian:     { warna: '#8b6f47', lebar: 0.3 },
  steps:          { warna: '#8b6f47', lebar: 0.3 },
  unknown:        { warna: '#c0c0c0', lebar: 0.4 },
}

// Sungai dibagi per kotak dengan kisi yang sama seperti jalan
const DIR_SUNGAI = '/data/sulawesi/sungai'
const GAYA_SUNGAI = {
  river:  { warna: '#2f7fc1', lebar: 1.4 },
  canal:  { warna: '#2f7fc1', lebar: 1 },
  stream: { warna: '#5aa3d8', lebar: 0.9 },
  drain:  { warna: '#7fb8e0', lebar: 0.6 },
}

const DIR_WILAYAH = '/data/wilayah' // provinces.json, regencies.json, districts.json, villages.json

const TINGKAT = {
  kecamatan: 'admin_level6',
  desa: 'admin_level7', // batas desa/kelurahan
}

const WARNA_PKM = ['#0e7c66', '#2f6fb0', '#c0392b', '#8e44ad', '#d68910', '#16a085', '#7f8c8d', '#b03a6e']
// Warna tiap kecamatan saat satu puskesmas ditampilkan (seperti peta contoh)
const WARNA_AREA = ['#c9daf2', '#e8a5a0', '#d0d0d0', '#a8cc5c', '#4f81bd', '#ffc000', '#e36c09', '#d8e4bc', '#b7a6d9', '#f4b183']
const WARNA_KOSONG = '#e5e7eb'
// Pengaturan warna umum yang bisa diubah user (latar: null = otomatis mengikuti mode peta)
const UMUM_AWAL = {
  opasitas: 1,
  tebalGaris: 1.4,
  garis: '#ffffff',
  sorot: '#12181b',
  teksDesa: '#0b3d33',
  teksKec: '#12181b',
  halo: '#ffffff',
  latar: null,
  kosong: WARNA_KOSONG,
  judulBg: '#ffffff',
  judulTeks: '#12181b',
  judulGaris: '#12181b',
}

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const MAKS_RINCI = 60 // batas jumlah kecamatan yang diberi label + grafik, supaya tidak penuh

// TODO: ganti dengan daftar puskesmas dari Supabase (tabel instansi, jenis puskesmas)
const PUSKESMAS_CONTOH = [
  { id: 'pkm-1', nama: 'Puskesmas A' },
  { id: 'pkm-2', nama: 'Puskesmas B' },
  { id: 'pkm-3', nama: 'Puskesmas C' },
]

// d3-geo membaca cincin luar poligon searah jarum jam. File GeoJSON ini (standar RFC 7946)
// memakai arah sebaliknya, sehingga tiap wilayah dianggap "seluruh bumi kecuali wilayah itu"
// dan peta tampil sebagai kotak. Fungsi ini menyamakan arah putaran saat file dimuat.
function luasCincin(r) {
  let s = 0
  for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
  return s / 2
}
function putarPoligon(poligon) {
  return poligon.map((cincin, i) => {
    const luar = i === 0
    const cw = luasCincin(cincin) < 0
    return luar === cw ? cincin : [...cincin].reverse()
  })
}
function perbaikiArah(json) {
  for (const f of json.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') g.coordinates = putarPoligon(g.coordinates)
    else if (g.type === 'MultiPolygon') g.coordinates = g.coordinates.map(putarPoligon)
  }
  return json
}

let cachePeta = null
let janjiPeta = null
function muatPeta() {
  if (cachePeta) return Promise.resolve(cachePeta)
  if (!janjiPeta) {
    janjiPeta = fetch(FILE_PETA)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json) => {
        cachePeta = perbaikiArah(json)
        return cachePeta
      })
      .catch((e) => {
        janjiPeta = null
        throw e
      })
  }
  return janjiPeta
}

const cacheKotakJalan = new Map() // "baris_kolom" -> daftar fitur
const janjiKotakJalan = new Map()

// Ambil satu kotak jalan. Kotak tanpa file (tidak ada jalan) dianggap kosong.
function muatKotakJalan(kunci) {
  if (cacheKotakJalan.has(kunci)) return Promise.resolve(cacheKotakJalan.get(kunci))
  if (!janjiKotakJalan.has(kunci)) {
    const janji = (async () => {
      const r = await fetch(`${kunci}.geojson`)
      if (r.status === 404) return []
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const teks = await r.text()
      // server pengembangan mengembalikan halaman HTML untuk file yang tidak ada
      if (teks.trimStart().startsWith('<')) return []
      return JSON.parse(teks).features
    })()
      .then((fitur) => {
        cacheKotakJalan.set(kunci, fitur)
        janjiKotakJalan.delete(kunci)
        return fitur
      })
      .catch((e) => {
        janjiKotakJalan.delete(kunci)
        throw e
      })
    janjiKotakJalan.set(kunci, janji)
  }
  return janjiKotakJalan.get(kunci)
}

// Daftar kunci kotak yang bersinggungan dengan kotak pembatas [[x0, y0], [x1, y1]]
function kunciKotakUntuk([[x0, y0], [x1, y1]]) {
  const kunci = []
  const c0 = Math.max(0, Math.floor((x0 - JALAN_LON_AWAL) / JALAN_UKURAN))
  const c1 = Math.max(0, Math.floor((x1 - JALAN_LON_AWAL) / JALAN_UKURAN))
  const r0 = Math.max(0, Math.floor((y0 - JALAN_LAT_AWAL) / JALAN_UKURAN))
  const r1 = Math.max(0, Math.floor((y1 - JALAN_LAT_AWAL) / JALAN_UKURAN))
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) kunci.push(`${r}_${c}`)
  return kunci
}

const urut = (a, b) => a.name.localeCompare(b.name, 'id')
function kelompok(arr, kunci) {
  const m = new Map()
  for (const x of arr) {
    const k = x[kunci]
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(x)
  }
  for (const l of m.values()) l.sort(urut)
  return m
}

let cacheWilayah = null
let janjiWilayah = null
function muatWilayah() {
  if (cacheWilayah) return Promise.resolve(cacheWilayah)
  if (!janjiWilayah) {
    const ambil = (nama) =>
      fetch(`${DIR_WILAYAH}/${nama}.json`).then((r) => {
        if (!r.ok) throw new Error(`${nama}.json: HTTP ${r.status}`)
        return r.json()
      })
    janjiWilayah = Promise.all([ambil('provinces'), ambil('regencies'), ambil('districts'), ambil('villages')])
      .then(([prov, kab, kec, desa]) => {
        cacheWilayah = {
          provinsi: [...prov].sort(urut),
          kabByProv: kelompok(kab, 'province_id'),
          kecByKab: kelompok(kec, 'regency_id'),
          desaByKec: kelompok(desa, 'district_id'),
          desaById: new Map(desa.map((d) => [d.id, d])),
          kecById: new Map(kec.map((d) => [d.id, d])),
          kabById: new Map(kab.map((d) => [d.id, d])),
        }
        return cacheWilayah
      })
      .catch((e) => {
        janjiWilayah = null
        throw e
      })
  }
  return janjiWilayah
}

const fmt = (n) => n.toLocaleString('id-ID')

// Samakan tulisan nama (huruf besar, tanpa spasi/tanda baca) supaya pencocokan tidak gagal karena beda penulisan
const normNama = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// puskesmas   : daftar semua puskesmas (untuk warna & penanda kecamatan milik puskesmas lain)
// puskesmasId : id puskesmas yang sedang login. Bila diisi, tidak ada pilihan puskesmas lagi.
export default function PetaDistribusi({ puskesmas: puskesmasProp = PUSKESMAS_CONTOH, puskesmasId = null, penugasanAwal = {} }) {
  const [peta, setPeta] = useState(null)
  const [galat, setGalat] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [sorot, setSorot] = useState(null)
  const [sorotDesa, setSorotDesa] = useState(null)

  // Wilayah kerja: id desa/kelurahan (10 digit) -> id puskesmas
  const [penugasan, setPenugasan] = useState(penugasanAwal)
  // Salinan yang terakhir tersimpan di database (untuk mendeteksi perubahan)
  const [tersimpan, setTersimpan] = useState(penugasanAwal)
  const [memuatDb, setMemuatDb] = useState(!!puskesmasId)
  const [daftarDb, setDaftarDb] = useState(null)
  const puskesmas = puskesmasId && daftarDb ? daftarDb : puskesmasProp
  const [pkmAktif, setPkmAktif] = useState(puskesmasId ?? puskesmas[0]?.id ?? null)
  useEffect(() => { if (puskesmasId) setPkmAktif(puskesmasId) }, [puskesmasId])
  const [cari, setCari] = useState('')
  const [wil, setWil] = useState(null)
  const [galatWil, setGalatWil] = useState(null)
  const [provId, setProvId] = useState('')
  const [kabId, setKabId] = useState('')
  const [kecId, setKecId] = useState('')
  const [status, setStatus] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  // Mode edit: daftar desa hanya bisa diubah setelah tombol Edit ditekan (untuk puskesmas yang login)
  const [mengedit, setMengedit] = useState(false)
  const bisaEdit = !puskesmasId || mengedit

  // Opsi tampilan peta wilayah kerja
  const [fokusPkm, setFokusPkm] = useState(true)
  const [tampilNama, setTampilNama] = useState(true)
  const [tampilNamaDesa, setTampilNamaDesa] = useState(true)
  const [tampilPasien, setTampilPasien] = useState(true)
  const [warnaPin, setWarnaPin] = useWarnaPenanda()
  const [pasien, setPasien] = useState([]) // titik rumah ibu hamil (tabel ibu_hamil_peta)
  const [jalan, setJalan] = useState(null) // fitur jalan utama (sulawesi-jalan.geojson)
  const [tampilJalan, setTampilJalan] = useState(true)
  const [sungai, setSungai] = useState(null) // fitur sungai (kotak yang menutupi wilayah)
  const [tampilSungai, setTampilSungai] = useState(true)
  const [basemap, setBasemap] = useState('none') // 'none' | kunci SUMBER_PETA
  const [tampilGrid, setTampilGrid] = useState(true)
  const [jarakGrid, setJarakGrid] = useState(1000) // meter
  const [warnaGrid, setWarnaGrid] = useState('#5b6670')
  const [lebarGrid, setLebarGrid] = useState(0.6)
  const [tampilLabelGrid, setTampilLabelGrid] = useState(true)
  const [orientasi, setOrientasi] = useState('landscape') // 'landscape' | 'portrait'
  const [judulInput, setJudulInput] = useState('') // kosong = pakai judul otomatis
  const [subInput, setSubInput] = useState('')
  const [logoPeta, setLogoPeta] = useState(null) // data URL gambar logo (kotak Dibuat oleh)
  const [logoKiri, setLogoKiri] = useState(null) // logo kiri di kotak judul
  const [logoKanan, setLogoKanan] = useState(null) // logo kanan di kotak judul
  const [tampilUtara, setTampilUtara] = useState(true)
  const [sumberTeks, setSumberTeks] = useState('Peta administrasi wilayah\nData pasien puskesmas')
  const [pembuatNama, setPembuatNama] = useState('')
  const [pembuatInstansi, setPembuatInstansi] = useState('')

  // Pengaturan warna (diubah user, berlaku selama halaman terbuka)
  const [umum, setUmum] = useState(UMUM_AWAL)
  const [isiKustom, setIsiKustom] = useState({}) // kunci item -> warna isi
  const [garisKustom, setGarisKustom] = useState({}) // kunci item -> warna garis tepi
  const [pkmKustom, setPkmKustom] = useState({}) // id puskesmas -> warna
  const [itemPilih, setItemPilih] = useState(null) // kunci item yang sedang diedit warnanya
  const [warnaSemua, setWarnaSemua] = useState('#0e7c66')

  // Ukuran nyata area peta, supaya gambar bisa dipas ke seluruh area yang tersedia
  const wadahRef = useRef(null)
  const svgRef = useRef(null)
  const [membuatPdf, setMembuatPdf] = useState(false)
  const [ukuran, setUkuran] = useState({ w: 900, h: 700 })
  const siap = !!peta && !galat
  useEffect(() => {
    const el = wadahRef.current
    if (!el) return
    const ukur = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setUkuran({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    ukur()
    const ro = new ResizeObserver(ukur)
    ro.observe(el)
    return () => ro.disconnect()
  }, [siap])
  const W = ukuran.w
  const H = ukuran.h

  useEffect(() => {
    muatPeta().then(setPeta).catch(setGalat)
    muatWilayah().then(setWil).catch(setGalatWil)
  }, [])


  // Muat wilayah kerja & daftar puskesmas dari Supabase
  useEffect(() => {
    if (!puskesmasId) return
    let batal = false
    ;(async () => {
      setMemuatDb(true)
      try {
        const [wk, ins] = await Promise.all([
          supabase.from('wilayah_kerja_desa').select('desa_id, instansi_id'),
          supabase.from('instansi').select('id, nama').order('nama'),
        ])
        if (batal) return
        if (wk.error) {
          setStatus('Gagal memuat: ' + wk.error.message)
        } else {
          const petaDb = Object.fromEntries(wk.data.map((r) => [r.desa_id, r.instansi_id]))
          setPenugasan(petaDb)
          setTersimpan(petaDb)
        }
        if (!ins.error && ins.data?.length) setDaftarDb(ins.data)
      } catch (e) {
        if (!batal) setStatus('Gagal memuat: ' + (e?.message ?? e))
      } finally {
        // selalu lepas status "memuat" agar daftar desa tetap bisa diedit
        if (!batal) setMemuatDb(false)
      }
    })()
    return () => { batal = true }
  }, [puskesmasId])

  // Pilihan wilayah awal: buka provinsi/kabupaten/kecamatan dari desa yang sudah tersimpan,
  // supaya daftar desa langsung tampil dan bisa diedit atau ditambah. Hanya dilakukan sekali.
  const sudahIsiAwal = useRef(false)
  useEffect(() => {
    if (sudahIsiAwal.current || !wil || memuatDb) return
    sudahIsiAwal.current = true
    const idPertama = Object.keys(penugasan).find((id) => penugasan[id] === pkmAktif)
    const desa = idPertama ? wil.desaById.get(idPertama) : null
    const kec = desa ? wil.kecById.get(desa.district_id) : null
    const kab = kec ? wil.kabById.get(kec.regency_id) : null
    if (!kab) return
    setProvId(kab.province_id)
    setKabId(kec.regency_id)
    setKecId(kec.id)
  }, [wil, memuatDb, penugasan, pkmAktif])

  // Titik rumah ibu hamil milik puskesmas ini (diinput lewat menu Input Pasien)
  useEffect(() => {
    if (!puskesmasId) return
    let batal = false
    supabase
      .from('ibu_hamil_peta')
      .select('id, nama, desa_id, latitude, longitude, kehamilan_id')
      .eq('instansi_id', puskesmasId)
      .is('dibatalkan_pada', null)
      .then(({ data, error }) => {
        if (batal) return
        if (error) setStatus('Gagal memuat titik ibu hamil: ' + error.message)
        else setPasien(data ?? [])
      })
    return () => { batal = true }
  }, [puskesmasId])

  const warnaPkmDasar = useMemo(() => Object.fromEntries(puskesmas.map((p, i) => [p.id, WARNA_PKM[i % WARNA_PKM.length]])), [puskesmas])
  const warnaPkm = useMemo(() => ({ ...warnaPkmDasar, ...pkmKustom }), [warnaPkmDasar, pkmKustom])
  const namaPkm = useMemo(() => Object.fromEntries(puskesmas.map((p) => [p.id, p.nama])), [puskesmas])

  // Peta menggambar batas kecamatan. Sebuah kecamatan diwarnai bila ada desa di dalamnya yang sudah ditetapkan.
  const pkmKecamatan = useMemo(() => {
    const o = {}
    if (!wil) return o
    for (const [id, pkm] of Object.entries(penugasan)) {
      const d = wil.desaById.get(id)
      const nama = d && wil.kecById.get(d.district_id)?.name
      if (nama && (!(nama in o) || pkm === pkmAktif)) o[nama] = pkm
    }
    return o
  }, [wil, penugasan, pkmAktif])

  const wilayah = useMemo(() => {
    if (!peta) return []
    return peta.features
      .filter((f) => f.properties.fclass === TINGKAT.kecamatan)
      .map((f) => {
        const nama = f.properties.name || '(tanpa nama)'
        return { nama, geo: f, pkm: pkmKecamatan[nama.trim().toUpperCase()] ?? null }
      })
  }, [peta, pkmKecamatan])

  // Pilihan bertingkat: provinsi -> kabupaten/kota -> kecamatan -> desa/kelurahan
  const daftarKab = wil && provId ? wil.kabByProv.get(provId) ?? [] : []
  const daftarKec = wil && kabId ? wil.kecByKab.get(kabId) ?? [] : []
  const desaKec = wil && kecId ? wil.desaByKec.get(kecId) ?? [] : []
  const desaTampil = desaKec.filter((d) => d.name.toLowerCase().includes(cari.toLowerCase()))

  const desaSaya = useMemo(() => {
    if (!wil) return []
    return Object.keys(penugasan)
      .filter((id) => penugasan[id] === pkmAktif)
      .map((id) => {
        const d = wil.desaById.get(id)
        return { id, nama: d?.name ?? id, kec: d ? wil.kecById.get(d.district_id)?.name ?? '' : '' }
      })
      .sort((x, y) => x.kec.localeCompare(y.kec, 'id') || x.nama.localeCompare(y.nama, 'id'))
  }, [wil, penugasan, pkmAktif])

  const jumlahTerisi = Object.keys(penugasan).length
  const adaPerubahan = useMemo(() => {
    const a = Object.keys(penugasan).filter((k) => penugasan[k] === pkmAktif).sort().join('|')
    const b = Object.keys(tersimpan).filter((k) => tersimpan[k] === pkmAktif).sort().join('|')
    return a !== b
  }, [penugasan, tersimpan, pkmAktif])
  const jumlahTersimpanSaya = Object.values(tersimpan).filter((id) => id === pkmAktif).length
  const jumlahPkmPilih = Object.values(penugasan).filter((id) => id === pkmAktif).length

  // Mode fokus: hanya kecamatan yang memuat desa milik puskesmas terpilih, tiap kecamatan beda warna
  const modeFokus = fokusPkm && jumlahPkmPilih > 0 && wilayah.some((w) => w.pkm === pkmAktif)

  // Wilayah yang digambar. Di mode wilayah kerja: hanya yang sudah ditetapkan (atau semua bila belum ada)
  const wilayahTampil = useMemo(() => {
    if (modeFokus) return wilayah.filter((w) => w.pkm === pkmAktif)
    if (jumlahTerisi > 0) return wilayah.filter((w) => w.pkm)
    return wilayah
  }, [wilayah, modeFokus, pkmAktif, jumlahTerisi])

  // Batas desa/kelurahan: dikelompokkan menurut nama
  const desaGeoPerNama = useMemo(() => {
    const m = new Map()
    if (!peta) return m
    for (const f of peta.features) {
      if (f.properties.fclass !== TINGKAT.desa) continue
      const k = normNama(f.properties.name)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(f)
    }
    return m
  }, [peta])

  // Desa yang dipilih -> poligon desanya di file peta. Nama desa banyak yang kembar di seluruh Sulawesi,
  // jadi poligon dipilih yang titik tengahnya berada di dalam kecamatan desa tersebut.
  const { desaGambar, desaTanpaBatas } = useMemo(() => {
    const gambar = []
    const tanpa = []
    if (!wil) return { desaGambar: gambar, desaTanpaBatas: tanpa }
    for (const [id, pkm] of Object.entries(penugasan)) {
      if (modeFokus && pkm !== pkmAktif) continue
      const d = wil.desaById.get(id)
      if (!d) continue
      const namaKec = normNama(wil.kecById.get(d.district_id)?.name)
      const geoKec = wilayah.filter((w) => normNama(w.nama) === namaKec).map((w) => w.geo)
      const cocok = (desaGeoPerNama.get(normNama(d.name)) ?? []).find((f) => {
        const c = geoCentroid(f)
        return geoKec.some((k) => geoContains(k, c))
      })
      if (cocok) gambar.push({ id, nama: d.name, kec: wil.kecById.get(d.district_id)?.name ?? '', geo: cocok, pkm })
      else tanpa.push(d.name)
    }
    return { desaGambar: gambar, desaTanpaBatas: tanpa }
  }, [wil, penugasan, modeFokus, pkmAktif, wilayah, desaGeoPerNama])

  // Kertas kerja A4 (landscape atau potrait), dipas ke area peta dan ditengahkan.
  // Bingkai peta berada MARGIN_MM di dalam tepi kertas; label grid ditaruh di margin itu.
  const kertasPx = useMemo(() => {
    const dw = orientasi === 'landscape' ? 297 : 210
    const dh = orientasi === 'landscape' ? 210 : 297
    const skala = Math.min((W - 2 * PADDING_PETA) / dw, (H - 2 * PADDING_PETA) / dh)
    const x0 = (W - dw * skala) / 2
    const y0 = (H - dh * skala) / 2
    // kotak dalam mm (relatif ke tepi kertas) -> piksel layar
    const kotak = (a, b, c, d) => ({ x0: x0 + a * skala, y0: y0 + b * skala, x1: x0 + c * skala, y1: y0 + d * skala })
    const M = MARGIN_MM
    const kx0 = dw - M - KANAN_MM
    const kx1 = dw - M
    const utaraMm = [kx0, M, kx1, M + UTARA_MM]
    const skalaMm = [kx0, utaraMm[3] + GAP_MM, kx1, utaraMm[3] + GAP_MM + SKALA_MM]
    // sisi bawah kotak "Dibuat oleh" sejajar dengan garis luar bingkai peta (simetris)
    const bawahSejajar = dh - M - LABEL_MM + BINGKAI_MM
    const pembuatMm = [kx0, bawahSejajar - PEMBUAT_MM, kx1, bawahSejajar]
    const sumberMm = [kx0, pembuatMm[1] - GAP_MM - SUMBER_MM, kx1, pembuatMm[1] - GAP_MM]
    const legendaMm = [kx0, skalaMm[3] + GAP_MM, kx1, sumberMm[1] - GAP_MM]
    // sisi kiri dan kanan kotak judul sejajar dengan garis luar bingkai peta (simetris)
    const judulMm = [M + LABEL_MM - BINGKAI_MM, M, kx0 - LABEL_MM + BINGKAI_MM, M + JUDUL_MM]
    const bingkaiMm = [M + LABEL_MM, judulMm[3] + LABEL_MM, kx0 - LABEL_MM, dh - M - LABEL_MM]
    const lg = kotak(...legendaMm)
    return {
      skala,
      x0,
      y0,
      x1: x0 + dw * skala,
      y1: y0 + dh * skala,
      judul: kotak(...judulMm),
      bingkai: kotak(...bingkaiMm),
      utara: kotak(...utaraMm),
      skalaBox: kotak(...skalaMm),
      sumber: kotak(...sumberMm),
      pembuat: kotak(...pembuatMm),
      legendaX0: lg.x0,
      legendaX1: lg.x1,
      legendaY0: lg.y0,
      legendaY1: lg.y1,
    }
  }, [W, H, orientasi])

  // Zona UTM otomatis dari titik tengah wilayah yang digambar
  const utm = useMemo(() => {
    const area = desaGambar.length > 0 ? desaGambar.map((d) => d.geo) : wilayahTampil.map((w) => w.geo)
    const pusat = area.length > 0 ? geoCentroid({ type: 'FeatureCollection', features: area }) : [120, -4]
    const zona = Math.min(60, Math.max(1, Math.floor((pusat[0] + 180) / 6) + 1))
    const selatan = pusat[1] < 0
    return { zona, selatan, label: `${zona}${selatan ? 'S' : 'N'}` }
  }, [desaGambar, wilayahTampil])

  const path = useMemo(() => {
    // Bila batas desa tersedia, hanya desa terpilih yang digambar dan peta difokuskan ke desa-desa itu
    const fitur = desaGambar.length > 0 ? desaGambar.map((d) => d.geo) : wilayahTampil.map((w) => w.geo)
    if (!fitur.length) return null
    const koleksi = { type: 'FeatureCollection', features: fitur }
    const proyeksi = buatProyeksiUtm(utm.zona, utm.selatan)
    const bk = kertasPx.bingkai
    proyeksi.fitExtent([[bk.x0, bk.y0], [bk.x1, bk.y1]], koleksi)
    return geoPath(proyeksi)
  }, [wilayahTampil, desaGambar, jumlahTerisi, W, H, utm, kertasPx])

  // Kotak jalan yang menutupi wilayah yang digambar; hanya kotak ini yang diunduh
  const kunciKotak = useMemo(() => {
    const area = desaGambar.length > 0 ? desaGambar.map((d) => d.geo) : wilayahTampil.map((w) => w.geo)
    if ((!tampilJalan && !tampilSungai) || area.length === 0) return []
    return kunciKotakUntuk(geoBounds({ type: 'FeatureCollection', features: area }))
  }, [desaGambar, wilayahTampil, tampilJalan, tampilSungai])
  const kunciKotakTeks = kunciKotak.join(',')

  useEffect(() => {
    if (!tampilJalan) return
    if (kunciKotak.length === 0) {
      setJalan([])
      return
    }
    let batal = false
    Promise.all(kunciKotak.map((k) => muatKotakJalan(`${DIR_JALAN}/${k}`)))
      .then((daftar) => {
        if (!batal) setJalan(daftar.flat())
      })
      .catch((e) => console.warn('Data jalan gagal dimuat:', e))
    return () => { batal = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciKotakTeks, tampilJalan])

  useEffect(() => {
    if (!tampilSungai) return
    if (kunciKotak.length === 0) {
      setSungai([])
      return
    }
    let batal = false
    Promise.all(kunciKotak.map((k) => muatKotakJalan(`${DIR_SUNGAI}/${k}`)))
      .then((daftar) => {
        if (!batal) setSungai(daftar.flat())
      })
      .catch((e) => console.warn('Data sungai gagal dimuat:', e))
    return () => { batal = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciKotakTeks, tampilSungai])

  // Jalan digabung per kelas menjadi satu string path, supaya SVG tidak memuat ribuan elemen
  const jalanSvg = useMemo(() => {
    if (!path || !tampilJalan || !jalan) return []
    const grup = new Map()
    for (const f of jalan) {
      const kelas = f.properties.fclass
      if (!GAYA_JALAN[kelas]) continue
      const d = path(f)
      if (!d) continue
      grup.set(kelas, (grup.get(kelas) ?? '') + d)
    }
    return [...grup].map(([kelas, d]) => ({ kelas, d, ...GAYA_JALAN[kelas] }))
  }, [path, jalan, tampilJalan])

  const sungaiSvg = useMemo(() => {
    if (!path || !tampilSungai || !sungai) return []
    const grup = new Map()
    for (const f of sungai) {
      const kelas = f.properties.fclass
      if (!GAYA_SUNGAI[kelas]) continue
      const d = path(f)
      if (!d) continue
      grup.set(kelas, (grup.get(kelas) ?? '') + d)
    }
    return [...grup].map(([kelas, d]) => ({ kelas, d, ...GAYA_SUNGAI[kelas] }))
  }, [path, sungai, tampilSungai])

  const kelasJalanAda = useMemo(
    () => kelasDalamArea(jalan, desaGambar.length > 0 ? desaGambar.map((d) => d.geo) : wilayahTampil.map((w) => w.geo), path),
    [jalan, desaGambar, wilayahTampil, path]
  )
  const kelasSungaiAda = useMemo(
    () => kelasDalamArea(sungai, desaGambar.length > 0 ? desaGambar.map((d) => d.geo) : wilayahTampil.map((w) => w.geo), path),
    [sungai, desaGambar, wilayahTampil, path]
  )

  const ubinPeta = useMemo(() => hitungUbin(path, basemap, kertasPx.bingkai, zoom, W, H), [path, basemap, kertasPx, zoom, W, H])

  const gridHasil = useMemo(() => {
    if (!path || !tampilGrid) return { d: '', labels: [] }
    return bangunGrid(path, utm.zona, utm.selatan, jarakGrid, kertasPx.bingkai, zoom, W, H, kertasPx.skala)
  }, [path, tampilGrid, utm, jarakGrid, kertasPx, zoom, W, H])

  const skalaPeta = useMemo(() => hitungSkala(path, utm, zoom, W, H, kertasPx.skala), [path, utm, zoom, W, H, kertasPx])

  const hanyaDesa = desaGambar.length > 0
  const tampilRinci = jumlahTerisi > 0 && wilayahTampil.length > 0 && wilayahTampil.length <= MAKS_RINCI && tampilNama

  // Daftar item yang digambar beserta warnanya (desa; atau kecamatan bila batas desa tidak ada)
  const isiDasar = (idx, pkm) => (modeFokus ? WARNA_AREA[idx % WARNA_AREA.length] : pkm ? warnaPkm[pkm] ?? '#0e7c66' : umum.kosong)
  const daftarItem = (hanyaDesa
    ? desaGambar.map((d, idx) => ({ kunci: d.id, nama: d.nama, sub: `Kecamatan ${d.kec}`, pkm: d.pkm, idx }))
    : wilayahTampil.map((w, idx) => ({ kunci: 'kec:' + w.nama, nama: w.nama, sub: 'Kecamatan', pkm: w.pkm, idx }))
  ).map((it) => ({ ...it, isi: isiKustom[it.kunci] ?? isiDasar(it.idx, it.pkm), garis: garisKustom[it.kunci] ?? umum.garis }))

  const ubah = (kunci) => (nilai) => setUmum((u) => ({ ...u, [kunci]: nilai }))
  const setIsi = (kunci, nilai) => setIsiKustom((m) => ({ ...m, [kunci]: nilai }))
  const setGaris = (kunci, nilai) => setGarisKustom((m) => ({ ...m, [kunci]: nilai }))
  const hapusKunci = (m, kunci) => {
    const { [kunci]: _buang, ...sisa } = m
    return sisa
  }
  function pilihBasemap(v) {
    setBasemap(v)
    setUmum((u) => (v !== 'none' && u.opasitas === 1 ? { ...u, opasitas: 0.5 } : v === 'none' && u.opasitas === 0.5 ? { ...u, opasitas: 1 } : u))
  }

  function resetWarna() {
    setUmum(UMUM_AWAL)
    setIsiKustom({})
    setGarisKustom({})
    setPkmKustom({})
    setItemPilih(null)
  }

  function aturDesa(daftarId, centang) {
    setPenugasan((lama) => {
      const baru = { ...lama }
      for (const id of daftarId) {
        if (lama[id] && lama[id] !== pkmAktif) continue // milik puskesmas lain
        if (centang) baru[id] = pkmAktif
        else delete baru[id]
      }
      return baru
    })
    setStatus('')
  }

  async function simpanPenugasan() {
    setMenyimpan(true)
    setStatus('')
    try {
      if (!puskesmasId) {
        await new Promise((r) => setTimeout(r, 400))
        setStatus('Wilayah kerja tersimpan (contoh, belum ke database).')
        return
      }
      const milikku = Object.keys(penugasan).filter((k) => penugasan[k] === pkmAktif)
      // 1) hapus yang tidak dicentang lagi
      const dihapus = Object.keys(tersimpan).filter((k) => tersimpan[k] === pkmAktif && !milikku.includes(k))
      if (dihapus.length) {
        const { error } = await supabase.from('wilayah_kerja_desa').delete().eq('instansi_id', pkmAktif).in('desa_id', dihapus)
        if (error) throw error
      }
      // 2) tambah yang baru (desa milik puskesmas lain ditolak oleh primary key)
      const baru = milikku.filter((k) => tersimpan[k] !== pkmAktif)
      if (baru.length) {
        const { error } = await supabase.from('wilayah_kerja_desa').insert(baru.map((k) => ({ desa_id: k, instansi_id: pkmAktif })))
        if (error) throw error
      }
      setTersimpan({ ...penugasan })
      setMengedit(false)
      setStatus('Wilayah kerja tersimpan.')
    } catch (e) {
      setStatus('Gagal menyimpan: ' + e.message)
    } finally {
      setMenyimpan(false)
    }
  }

  const bacaLogoKe = (setter) => (e) => {
    const berkas = e.target.files?.[0]
    if (!berkas) return
    const reader = new FileReader()
    reader.onload = () => setter(reader.result)
    reader.readAsDataURL(berkas)
  }

  // Simpan PDF: salinan SVG kertas (persis seperti preview, termasuk zoom, legenda, dan peta dasar) dicetak
  // pada kertas A4 tanpa margin. Hasilnya vektor dan berukuran asli, jadi skala pada bilah skala tetap benar.
  async function simpanPdf() {
    const svg = svgRef.current
    if (!svg) return
    setMembuatPdf(true)
    let iframe = null
    const judulLama = document.title
    try {
      const dw = orientasi === 'landscape' ? 297 : 210
      const dh = orientasi === 'landscape' ? 210 : 297
      const salin = svg.cloneNode(true)
      salin.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      salin.setAttribute('viewBox', `${kertasPx.x0} ${kertasPx.y0} ${kertasPx.x1 - kertasPx.x0} ${kertasPx.y1 - kertasPx.y0}`)
      salin.setAttribute('width', `${dw}mm`)
      salin.setAttribute('height', `${dh}mm`)
      salin.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      salin.removeAttribute('style')
      salin.querySelectorAll('[style*="filter"]').forEach((e) => { e.style.filter = 'none' })
      salin.querySelectorAll('image').forEach((im) => {
        const h = im.getAttribute('href')
        if (h && h.startsWith('/')) im.setAttribute('href', window.location.origin + h)
      })
      // tunggu semua gambar (ubin peta dasar, logo, arah utara) selesai dimuat
      const daftarGambar = [...salin.querySelectorAll('image')].map((im) => im.getAttribute('href')).filter(Boolean)
      await Promise.all(daftarGambar.map((h) => new Promise((selesai) => {
        const im = new Image()
        im.onload = selesai
        im.onerror = selesai
        im.src = h
        setTimeout(selesai, 15000)
      })))

      const nama = `Peta - ${judulTeks}`.replace(/[\\/:*?"<>|]+/g, ' ').trim()
      const font = window.getComputedStyle(svg).fontFamily
      const kepala = [...document.head.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('')
      iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
      document.body.appendChild(iframe)
      const d = iframe.contentWindow.document
      d.open()
      d.write(
        `<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>${nama.replace(/</g, '&lt;')}</title>${kepala}` +
        `<style>@page{size:A4 ${orientasi};margin:0}html,body{margin:0;padding:0;background:#fff}` +
        `body{font-family:${font};-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
        `svg{display:block;width:${dw}mm;height:${dh}mm}</style></head><body>${salin.outerHTML}</body></html>`
      )
      d.close()
      try { await iframe.contentWindow.document.fonts.ready } catch { /* abaikan */ }
      await new Promise((r) => setTimeout(r, 300))
      document.title = nama
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } catch (e) {
      setStatus('Gagal menyiapkan PDF: ' + e.message)
    } finally {
      setTimeout(() => {
        document.title = judulLama
        if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe)
      }, 1500)
      setMembuatPdf(false)
    }
  }

  function bacaLogo(e) {
    const berkas = e.target.files?.[0]
    if (!berkas) return
    const reader = new FileReader()
    reader.onload = () => setLogoPeta(reader.result)
    reader.readAsDataURL(berkas)
  }

  if (galat) return <div style={{ padding: 24 }}>Gagal memuat peta: {String(galat)}</div>
  if (!peta) return <div style={{ padding: 24 }}>Memuat peta…</div>

  const terpilih = hanyaDesa
    ? (() => {
        const d = desaGambar.find((x) => x.id === sorotDesa)
        return d ? { nama: d.nama, sub: `Kecamatan ${d.kec}`, pkm: d.pkm } : null
      })()
    : sorot
      ? wilayahTampil.find((w) => w.nama === sorot)
      : null

  const sekarang = new Date()
  const bulanJudul = NAMA_BULAN[sekarang.getMonth()].toUpperCase()
  const tahunJudul = sekarang.getFullYear()
  const judulDefault = `PETA IBU HAMIL ${modeFokus ? (namaPkm[pkmAktif] ?? '').toUpperCase() : 'WILAYAH KERJA PUSKESMAS'}`
  const subDefault = `BULAN : ${bulanJudul} TAHUN ${tahunJudul}`
  const judulTeks = judulInput.trim() || judulDefault
  const subTeks = subInput.trim() || subDefault
  const sk = kertasPx.skala
  // logo di kotak judul: persegi, simetris kiri-kanan; teks judul mengecil otomatis agar tidak menabrak logo
  const logoJudulMm = JUDUL_MM - 4
  const sisiLogoMm = logoKiri || logoKanan ? logoJudulMm + 5 : 0
  const lebarJudulPx = kertasPx.judul.x1 - kertasPx.judul.x0 - (2 * sisiLogoMm + 4) * sk
  const fsJudul = Math.min(4.6 * sk, lebarJudulPx / (Math.max(1, judulTeks.length) * 0.68))
  const fsSub = Math.min(3.2 * sk, lebarJudulPx / (Math.max(1, subTeks.length) * 0.62))
  const barisLegenda = (() => {
    const r = []
    const item = daftarItem.slice(0, 12)
    if (item.length > 0) {
      r.push({ tipe: 'judul', teks: 'Wilayah kerja' })
      if (modeFokus || daftarItem.length <= 12) {
        for (const it of item) r.push({ tipe: 'kotak', warna: it.isi, teks: it.nama })
        if (daftarItem.length > 12) r.push({ tipe: 'judul', teks: `+ ${daftarItem.length - 12} lainnya` })
      } else {
        for (const p of puskesmas) if (daftarItem.some((it) => it.pkm === p.id)) r.push({ tipe: 'kotak', warna: warnaPkm[p.id], teks: p.nama })
      }
    }
    const tambah = (judul, kelasAda, grup, urutan, gaya) => {
      const m = new Map()
      for (const kls of kelasAda) {
        const nama = grup[kls]
        if (!nama) continue
        const g = gaya[kls]
        if (!m.has(nama) || g.lebar > m.get(nama).lebar) m.set(nama, { warna: g.warna, lebar: g.lebar })
      }
      if (m.size === 0) return
      r.push({ tipe: 'judul', teks: judul })
      for (const nama of urutan) if (m.has(nama)) r.push({ tipe: 'garis', warna: m.get(nama).warna, lebar: m.get(nama).lebar, teks: nama })
    }
    if (tampilSungai) tambah('Sungai', sungaiSvg.map((x) => x.kelas).filter((x) => kelasSungaiAda.has(x)), GRUP_SUNGAI, URUT_SUNGAI, GAYA_SUNGAI)
    if (tampilJalan) tambah('Jalan', jalanSvg.map((x) => x.kelas).filter((x) => kelasJalanAda.has(x)), GRUP_JALAN, URUT_JALAN, GAYA_JALAN)
    if (tampilPasien && pasien.length > 0) {
      r.push({ tipe: 'judul', teks: 'Ibu hamil' })
      if (pasien.some((p) => p.kehamilan_id)) r.push({ tipe: 'pin', warna: warnaPin.terdaftar, teks: 'Titik rumah (terdaftar)' })
      if (pasien.some((p) => !p.kehamilan_id)) r.push({ tipe: 'pin', warna: warnaPin.manual, teks: 'Titik rumah (manual)' })
    }
    return r
  })()

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)', background: 'var(--bg, #f6f7f9)', color: 'var(--ink, #12181b)' }}>
      {/* PANEL KIRI */}
      <aside style={{ width: 290, background: 'var(--surface, #fff)', borderRight: '1px solid var(--line, #e5e7eb)', padding: 18, overflowY: 'auto', flexShrink: 0 }}>
        {/* PENGATURAN WILAYAH KERJA */}
        <div style={{ ...judulBagian, marginTop: 0 }}>Wilayah kerja puskesmas</div>
        <p style={{ fontSize: 12, color: 'var(--muted, #64707a)', lineHeight: 1.5, marginBottom: 8 }}>
          {puskesmasId ? 'Pilih wilayah, lalu centang desa/kelurahan yang menjadi wilayah kerja puskesmas Anda. ' : 'Pilih puskesmas, lalu centang desa/kelurahan yang menjadi wilayah kerjanya. '}Satu desa hanya boleh dimiliki satu puskesmas.
        </p>
        {puskesmasId ? (
          <div style={{ ...pilihan, background: 'var(--surface-2, #f4f6f8)', fontWeight: 600 }}>{namaPkm[pkmAktif] ?? 'Puskesmas Anda'}</div>
        ) : (
          <select value={pkmAktif ?? ''} onChange={(e) => setPkmAktif(e.target.value)} style={pilihan}>
            {puskesmas.map((p) => (
              <option key={p.id} value={p.id}>{p.nama}</option>
            ))}
          </select>
        )}
        <div style={{ fontSize: 12, color: 'var(--muted, #64707a)', margin: '8px 0' }}>
          {jumlahPkmPilih} desa untuk {namaPkm[pkmAktif]} · total {jumlahTerisi} desa terisi
        </div>

        {galatWil ? (
          <p style={{ fontSize: 12, color: '#b91c1c' }}>Gagal memuat data wilayah: {String(galatWil.message ?? galatWil)}. Pastikan file JSON ada di {DIR_WILAYAH}/.</p>
        ) : !wil ? (
          <p style={{ fontSize: 12, color: 'var(--muted, #64707a)' }}>Memuat data wilayah…</p>
        ) : (
          <>
            <label style={labelForm}>Provinsi</label>
            <select value={provId} onChange={(e) => { setProvId(e.target.value); setKabId(''); setKecId(''); setCari('') }} style={pilihan}>
              <option value="">Pilih provinsi</option>
              {wil.provinsi.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>

            <label style={labelForm}>Kabupaten/Kota</label>
            <select value={kabId} disabled={!provId} onChange={(e) => { setKabId(e.target.value); setKecId(''); setCari('') }} style={pilihan}>
              <option value="">Pilih kabupaten/kota</option>
              {daftarKab.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>

            <label style={labelForm}>Kecamatan</label>
            <select value={kecId} disabled={!kabId} onChange={(e) => { setKecId(e.target.value); setCari('') }} style={pilihan}>
              <option value="">Pilih kecamatan</option>
              {daftarKec.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>

            {kecId && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 4px' }}>
                  <span style={{ ...labelForm, margin: 0 }}>Kelurahan/Desa ({desaKec.length})</span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => aturDesa(desaTampil.map((d) => d.id), true)} disabled={memuatDb || !bisaEdit} style={tautan}>Pilih semua</button>
                    <button type="button" onClick={() => aturDesa(desaTampil.map((d) => d.id), false)} disabled={memuatDb || !bisaEdit} style={tautan}>Kosongkan</button>
                  </span>
                </div>
                <input
                  type="text"
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari kelurahan/desa…"
                  style={{ ...pilihan, marginBottom: 6 }}
                />
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: 4 }}>
                  {desaTampil.map((d) => {
                    const milik = penugasan[d.id]
                    const dipilih = milik === pkmAktif
                    const dimiliki = milik && !dipilih
                    return (
                      <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', fontSize: 12, cursor: dimiliki ? 'not-allowed' : 'pointer', opacity: dimiliki ? 0.6 : 1, borderRadius: 4, background: dipilih ? 'var(--accent-soft, #e4f3ef)' : 'transparent' }}>
                        <input type="checkbox" checked={dipilih} disabled={!!dimiliki || memuatDb || !bisaEdit} onChange={(e) => aturDesa([d.id], e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
                        <span style={{ flex: 1 }}>{d.name}</span>
                        {dimiliki && (
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: warnaPkm[milik] ?? umum.kosong, flexShrink: 0 }} title={namaPkm[milik] ?? 'Puskesmas lain'} />
                        )}
                      </label>
                    )
                  })}
                  {desaTampil.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--muted, #64707a)', padding: 6 }}>Tidak ada desa/kelurahan yang cocok.</div>
                  )}
                </div>
              </>
            )}

            {desaSaya.length > 0 && (
              <>
                <div style={judulBagian}>Desa terpilih ({desaSaya.length})</div>
                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: 4 }}>
                  {desaSaya.map((d) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 12 }}>
                      <span style={{ flex: 1 }}>{d.nama} <span style={{ color: 'var(--muted, #64707a)', fontSize: 11 }}>· {d.kec}</span></span>
                      <button type="button" onClick={() => aturDesa([d.id], false)} disabled={memuatDb || !bisaEdit} style={{ ...tautan, color: '#b91c1c' }} title="Hapus">×</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {puskesmasId && !mengedit ? (
          <button
            type="button"
            onClick={() => { setMengedit(true); setStatus('') }}
            disabled={memuatDb}
            style={{ ...tombolSekunder, marginTop: 12, fontWeight: 600, opacity: memuatDb ? 0.6 : 1 }}
          >
            Edit wilayah kerja
          </button>
        ) : (
          <>
            {puskesmasId && (
              <button
                type="button"
                onClick={() => { setPenugasan(tersimpan); setMengedit(false); setCari(''); setStatus('') }}
                disabled={menyimpan}
                style={{ ...tombolSekunder, marginTop: 12, fontWeight: 600 }}
              >
                Batal edit
              </button>
            )}
            <button onClick={simpanPenugasan} disabled={menyimpan || memuatDb || (!!puskesmasId && !adaPerubahan)} style={{ ...tombolUtama, opacity: menyimpan || memuatDb || (!!puskesmasId && !adaPerubahan) ? 0.6 : 1 }}>
              {menyimpan ? 'Menyimpan…' : memuatDb ? 'Memuat…' : puskesmasId && jumlahTersimpanSaya > 0 ? 'Simpan perubahan' : 'Simpan wilayah kerja'}
            </button>
          </>
        )}
        {puskesmasId && adaPerubahan && !menyimpan && <p style={{ fontSize: 12, marginTop: 6, color: '#b45309' }}>Ada perubahan yang belum disimpan</p>}
        {status && <p style={{ fontSize: 12, marginTop: 6, color: 'var(--accent, #0e7c66)' }}>{status}</p>}

        <>
            <div style={judulBagian}>Kertas kerja</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['landscape', 'Landscape'], ['portrait', 'Potrait']].map(([nilai, teks]) => (
                <button
                  key={nilai}
                  type="button"
                  onClick={() => setOrientasi(nilai)}
                  style={{ ...tombolSekunder, marginTop: 0, flex: 1, fontWeight: orientasi === nilai ? 700 : 400, background: orientasi === nilai ? 'var(--accent-soft, #e4f3ef)' : 'var(--surface, #fff)' }}
                >
                  {teks}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted, #64707a)', marginTop: 4 }}>
              A4 {orientasi === 'landscape' ? '297 × 210' : '210 × 297'} mm
            </div>
            <label style={labelForm}>Judul peta</label>
            <input style={pilihan} value={judulInput} placeholder={judulDefault} onChange={(e) => setJudulInput(e.target.value)} />
            <label style={labelForm}>Sub judul</label>
            <input style={pilihan} value={subInput} placeholder={subDefault} onChange={(e) => setSubInput(e.target.value)} />
            <label style={labelForm}>Logo kiri (kotak judul)</label>
            <KotakLogo logo={logoKiri} onBaca={bacaLogoKe(setLogoKiri)} onHapus={() => setLogoKiri(null)} />
            <label style={labelForm}>Logo kanan (kotak judul)</label>
            <KotakLogo logo={logoKanan} onBaca={bacaLogoKe(setLogoKanan)} onHapus={() => setLogoKanan(null)} />
            <label style={labelForm}>Logo (kotak Dibuat oleh)</label>
            <KotakLogo logo={logoPeta} onBaca={bacaLogo} onHapus={() => setLogoPeta(null)} />
            <label style={{ ...opsi, marginTop: 6 }}>
              <input type="checkbox" checked={tampilUtara} onChange={(e) => setTampilUtara(e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
              Tampilkan arah utara
            </label>
            <label style={labelForm}>Sumber (satu baris per kalimat)</label>
            <textarea style={{ ...pilihan, minHeight: 60 }} value={sumberTeks} onChange={(e) => setSumberTeks(e.target.value)} />
            <label style={labelForm}>Nama pembuat</label>
            <input style={pilihan} value={pembuatNama} onChange={(e) => setPembuatNama(e.target.value)} />
            <label style={labelForm}>Instansi</label>
            <input style={pilihan} value={pembuatInstansi} onChange={(e) => setPembuatInstansi(e.target.value)} />
            <div style={judulBagian}>Opsi tampilan peta</div>
            <label style={labelForm}>Gaya peta dasar</label>
            <select value={basemap} onChange={(e) => pilihBasemap(e.target.value)} style={pilihan}>
              <option value="none">Tanpa peta dasar (putih)</option>
              {Object.entries(SUMBER_PETA).map(([kunci, v]) => <option key={kunci} value={kunci}>{v.nama}</option>)}
            </select>
            {basemap !== 'none' && (
              <div style={{ fontSize: 11, color: 'var(--muted, #64707a)', margin: '4px 0 6px' }}>Butuh internet. Atur "Transparansi isi" di bawah supaya peta dasar terlihat.</div>
            )}
            <label style={opsi}>
              <input type="checkbox" checked={fokusPkm} onChange={(e) => setFokusPkm(e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
              Hanya puskesmas terpilih
            </label>
            <label style={opsi}>
              <input type="checkbox" checked={tampilNama} onChange={(e) => setTampilNama(e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
              Tampilkan nama kecamatan
            </label>
            <label style={opsi}>
              <input type="checkbox" checked={tampilNamaDesa} onChange={(e) => setTampilNamaDesa(e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
              Tampilkan nama desa
            </label>
            <label style={opsi}>
              <input type="checkbox" checked={tampilPasien} onChange={(e) => setTampilPasien(e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
              Tampilkan titik ibu hamil ({pasien.length})
            </label>
            <label style={opsi}>
              <input type="checkbox" checked={tampilJalan} onChange={(e) => setTampilJalan(e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
              Tampilkan jalan
            </label>
            <label style={opsi}>
              <input type="checkbox" checked={tampilSungai} onChange={(e) => setTampilSungai(e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
              Tampilkan sungai
            </label>
            <label style={opsi}>
              <input type="checkbox" checked={tampilGrid} onChange={(e) => setTampilGrid(e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
              Tampilkan grid UTM
            </label>
            {tampilGrid && (
              <div style={{ padding: '4px 2px 8px 26px', fontSize: 12 }}>
                <div style={{ color: 'var(--muted, #64707a)', marginBottom: 4 }}>Zona UTM {utm.label} (otomatis)</div>
                <select value={jarakGrid} onChange={(e) => setJarakGrid(Number(e.target.value))} style={pilihan}>
                  <option value={500}>Jarak 500 m</option>
                  <option value={1000}>Jarak 1 km</option>
                  <option value={2000}>Jarak 2 km</option>
                  <option value={5000}>Jarak 5 km</option>
                  <option value={10000}>Jarak 10 km</option>
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <KotakWarna nilai={warnaGrid} onChange={setWarnaGrid} judul="Warna grid" />
                  <span>Warna grid</span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <Geser label="Ketebalan grid" nilai={lebarGrid} min={0.2} max={2} langkah={0.1} tampil={lebarGrid.toFixed(1)} onChange={setLebarGrid} />
                </div>
                <label style={{ ...opsi, padding: '4px 0' }}>
                  <input type="checkbox" checked={tampilLabelGrid} onChange={(e) => setTampilLabelGrid(e.target.checked)} style={{ accentColor: 'var(--accent, #0e7c66)' }} />
                  Tampilkan label koordinat
                </label>
              </div>
            )}
        </>

        {/* PENGATURAN WARNA */}
        <div style={judulBagian}>Warna peta</div>
        <p style={{ fontSize: 12, color: 'var(--muted, #64707a)', lineHeight: 1.5, marginBottom: 8 }}>
          Klik sebuah {hanyaDesa ? 'desa' : 'wilayah'} di peta untuk mengubah warnanya, atau atur semuanya di bawah ini.
        </p>

        {jumlahTerisi > 0 && (
          <details open style={grupWarna}>
            <summary style={ringkasan}>Warna tiap {hanyaDesa ? 'desa' : 'kecamatan'} ({daftarItem.length})</summary>
            <PilihWarna
              label="Samakan warna isi semua"
              nilai={warnaSemua}
              onChange={(v) => { setWarnaSemua(v); setIsiKustom(Object.fromEntries(daftarItem.map((x) => [x.kunci, v]))) }}
            />
            <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--muted, #64707a)', padding: '4px 4px 2px' }}>
              <span style={{ width: 30 }}>Isi</span>
              <span style={{ width: 30 }}>Garis</span>
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: 4 }}>
              {daftarItem.slice(0, MAKS_RINCI).map((it) => (
                <div key={it.kunci} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 4, background: itemPilih === it.kunci ? 'var(--accent-soft, #e4f3ef)' : 'transparent' }}>
                  <KotakWarna nilai={it.isi} judul="Warna isi" onChange={(v) => setIsi(it.kunci, v)} />
                  <KotakWarna nilai={it.garis} judul="Warna garis tepi" onChange={(v) => setGaris(it.kunci, v)} />
                  <button type="button" onClick={() => setItemPilih(it.kunci)} style={{ ...tautan, flex: 1, textAlign: 'left', color: 'inherit' }} title="Pilih di peta">{it.nama}</button>
                </div>
              ))}
              {daftarItem.length > MAKS_RINCI && (
                <div style={{ fontSize: 11, color: 'var(--muted, #64707a)', padding: 6 }}>Menampilkan {MAKS_RINCI} pertama. Sisanya bisa diubah dengan mengeklik peta.</div>
              )}
            </div>
          </details>
        )}

        <details open style={grupWarna}>
          <summary style={ringkasan}>Pengaturan umum</summary>
          <Geser label="Transparansi isi" nilai={umum.opasitas} min={0.1} max={1} langkah={0.05} tampil={`${Math.round(umum.opasitas * 100)}%`} onChange={ubah('opasitas')} />
          <Geser label="Ketebalan garis tepi" nilai={umum.tebalGaris} min={0} max={4} langkah={0.1} tampil={umum.tebalGaris.toFixed(1)} onChange={ubah('tebalGaris')} />
          <PilihWarna label="Garis tepi bawaan" nilai={umum.garis} onChange={ubah('garis')} />
          <PilihWarna label="Garis tepi saat disorot" nilai={umum.sorot} onChange={ubah('sorot')} />
          <PilihWarna label="Teks nama desa" nilai={umum.teksDesa} onChange={ubah('teksDesa')} />
          <PilihWarna label="Teks nama kecamatan" nilai={umum.teksKec} onChange={ubah('teksKec')} />
          <PilihWarna label="Garis pinggir teks" nilai={umum.halo} onChange={ubah('halo')} />
          <PilihWarna label="Latar peta" nilai={umum.latar ?? (modeFokus ? '#ffffff' : '#eef3f6')} onChange={ubah('latar')} />
          <PilihWarna label="Wilayah belum ditetapkan" nilai={umum.kosong} onChange={ubah('kosong')} />
          <PilihWarna label="Kotak judul: latar" nilai={umum.judulBg} onChange={ubah('judulBg')} />
          <PilihWarna label="Kotak judul: teks" nilai={umum.judulTeks} onChange={ubah('judulTeks')} />
          <PilihWarna label="Kotak judul: garis" nilai={umum.judulGaris} onChange={ubah('judulGaris')} />
        </details>

        <details style={grupWarna}>
          <summary style={ringkasan}>Warna tiap puskesmas</summary>
          <p style={{ fontSize: 11, color: 'var(--muted, #64707a)', margin: '4px 0' }}>Dipakai bila opsi "Hanya puskesmas terpilih" dimatikan, juga pada legenda.</p>
          {puskesmas.map((p) => (
            <PilihWarna key={p.id} label={p.nama} nilai={warnaPkm[p.id]} onChange={(v) => setPkmKustom((m) => ({ ...m, [p.id]: v }))} />
          ))}
        </details>

        <button type="button" onClick={resetWarna} style={tombolSekunder}>Reset semua warna</button>
      </aside>

      {/* AREA PETA */}
      <main ref={wadahRef} style={{ flex: 1, position: 'relative', background: umum.latar ?? (modeFokus ? '#ffffff' : '#eef3f6'), overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 10, flexWrap: 'wrap', pointerEvents: 'none', zIndex: 2 }}>
          <Kartu label="Desa terisi" nilai={`${jumlahTerisi}`} sub={`di ${Object.keys(pkmKecamatan).length} kecamatan`} />
          <Kartu label="Puskesmas" nilai={`${puskesmas.length}`} sub="wilayah kerja" />
        </div>

        <button
          type="button"
          onClick={simpanPdf}
          disabled={membuatPdf || !path}
          title="Simpan peta sebagai PDF A4, sama dengan preview"
          style={{ ...tombolUtama, position: 'absolute', right: 14, top: 14, zIndex: 5, width: 'auto', marginTop: 0, padding: '9px 16px', opacity: membuatPdf || !path ? 0.6 : 1 }}
        >
          {membuatPdf ? 'Menyiapkan…' : 'Simpan PDF'}
        </button>

        {jumlahTerisi === 0 && (
          <div style={{ position: 'absolute', top: 100, left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--muted, #64707a)', pointerEvents: 'none', zIndex: 2, textAlign: 'center' }}>
            Belum ada desa yang dipilih.<br />Pilih wilayah dan centang desa di panel kiri untuk menampilkan wilayah kerja.
          </div>
        )}

        {jumlahTerisi > 0 && wilayah.length > 0 && wilayahTampil.length === 0 && (
          <div style={{ position: 'absolute', top: 180, left: '50%', transform: 'translateX(-50%)', background: '#fff7ed', border: '1px solid #f0803c', borderRadius: 10, padding: '10px 16px', fontSize: 13, textAlign: 'center', zIndex: 3, maxWidth: 420 }}>
            Desa sudah dipilih, tetapi nama kecamatannya tidak ditemukan di file peta. Batas wilayah belum bisa digambar.
          </div>
        )}

        {desaTanpaBatas.length > 0 && (
          <div style={{ position: 'absolute', top: 180, right: 70, background: '#fff7ed', border: '1px solid #f0803c', borderRadius: 10, padding: '8px 12px', fontSize: 12, zIndex: 3, maxWidth: 240 }}>
            Batas desa belum ada di file peta untuk: {desaTanpaBatas.join(', ')}.
          </div>
        )}

        {wilayah.length === 0 && (
          <div style={{ position: 'absolute', top: 180, left: '50%', transform: 'translateX(-50%)', background: '#fff7ed', border: '1px solid #f0803c', borderRadius: 10, padding: '10px 16px', fontSize: 13, textAlign: 'center', zIndex: 3, maxWidth: 420 }}>
            Data peta termuat, tetapi tidak ada wilayah dengan fclass &quot;{TINGKAT.kecamatan}&quot; di file {FILE_PETA}. Periksa nilai fclass pada file GeoJSON.
          </div>
        )}

        <svg ref={svgRef} onClick={() => setItemPilih(null)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
          <defs>
            <clipPath id="bingkai-kertas">
              <rect x={kertasPx.bingkai.x0} y={kertasPx.bingkai.y0} width={kertasPx.bingkai.x1 - kertasPx.bingkai.x0} height={kertasPx.bingkai.y1 - kertasPx.bingkai.y0} />
            </clipPath>
          </defs>
          <rect x={kertasPx.x0} y={kertasPx.y0} width={kertasPx.x1 - kertasPx.x0} height={kertasPx.y1 - kertasPx.y0} fill="#ffffff" style={{ filter: 'drop-shadow(0 1px 4px #0002)' }} />
          <g clipPath="url(#bingkai-kertas)">
          <g transform={`translate(${(W / 2) * (1 - zoom)},${(H / 2) * (1 - zoom)}) scale(${zoom})`}>
            {ubinPeta.map((t) => (
              <image key={t.key} href={t.href} width={256.8} height={256.8} transform={`matrix(${t.m.join(',')})`} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />
            ))}

            {path && !hanyaDesa &&
              wilayahTampil.map((w, idx) => {
                const it = daftarItem[idx]
                const kosongDiWilayah = !w.pkm
                const aktif = sorot === w.nama || itemPilih === it.kunci
                return (
                  <path
                    key={idx}
                    d={path(w.geo) || ''}
                    fill={it.isi}
                    fillOpacity={umum.opasitas}
                    stroke={aktif ? umum.sorot : garisKustom[it.kunci] ?? (kosongDiWilayah ? '#9aa4ad' : umum.garis)}
                    strokeWidth={aktif ? 1.6 : kosongDiWilayah ? 0.4 : umum.tebalGaris}
                    onMouseEnter={() => setSorot(w.nama)}
                    onMouseLeave={() => setSorot(null)}
                    onClick={(e) => { e.stopPropagation(); if (jumlahTerisi > 0) setItemPilih(it.kunci) }}
                    style={{ cursor: 'pointer' }}
                  />
                )
              })}

            {/* Nama kecamatan (di atas desa-desa terpilih miliknya) */}
            {path && hanyaDesa && tampilNama &&
              Object.entries(
                desaGambar.reduce((m, d) => {
                  const [[x0, y0], [x1]] = path.bounds(d.geo)
                  const b = m[d.kec] ?? { x0: Infinity, x1: -Infinity, y0: Infinity }
                  m[d.kec] = { x0: Math.min(b.x0, x0), x1: Math.max(b.x1, x1), y0: Math.min(b.y0, y0) }
                  return m
                }, {})
              ).map(([nama, b]) => (
                <g key={'k' + nama} transform={`translate(${(b.x0 + b.x1) / 2},${b.y0 - 10}) scale(${1 / zoom})`} style={{ pointerEvents: 'none' }}>
                  <text x={0} y={3} textAnchor="middle" fontSize={11} fontWeight={800} fill={umum.teksKec} style={{ paintOrder: 'stroke', stroke: umum.halo, strokeWidth: 2.5, strokeLinejoin: 'round' }}>
                    {nama.toUpperCase()}
                  </text>
                </g>
              ))}

            {/* Nama kecamatan (bila batas desa tidak tersedia) */}
            {path && !hanyaDesa && tampilRinci &&
              wilayahTampil.map((w, idx) => {
                const [cx, cy] = path.centroid(w.geo)
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
                return (
                  <g key={'r' + idx} transform={`translate(${cx},${cy}) scale(${1 / zoom})`} style={{ pointerEvents: 'none' }}>
                    <text x={0} y={3} textAnchor="middle" fontSize={9} fontWeight={700} fill={umum.teksKec} style={{ paintOrder: 'stroke', stroke: umum.halo, strokeWidth: 2.5, strokeLinejoin: 'round' }}>
                      {w.nama.toUpperCase()}
                    </text>
                  </g>
                )
              })}

            {/* Batas desa/kelurahan yang dipilih */}
            {path &&
              desaGambar.map((d, idx) => {
                const it = daftarItem[idx]
                const aktif = sorotDesa === d.id || itemPilih === d.id
                return (
                  <path
                    key={'d' + d.id}
                    d={path(d.geo) || ''}
                    fill={it.isi}
                    fillOpacity={umum.opasitas}
                    stroke={aktif ? umum.sorot : it.garis}
                    strokeWidth={aktif ? 2 : umum.tebalGaris}
                    strokeLinejoin="round"
                    onMouseEnter={() => setSorotDesa(d.id)}
                    onMouseLeave={() => setSorotDesa(null)}
                    onClick={(e) => { e.stopPropagation(); setItemPilih(d.id) }}
                    style={{ cursor: 'pointer' }}
                  />
                )
              })}

            {/* Grid UTM */}
            {path && tampilGrid && gridHasil.d && (
              <path d={gridHasil.d} fill="none" stroke={warnaGrid} strokeWidth={lebarGrid / zoom} style={{ pointerEvents: 'none' }} />
            )}

            {/* Jalan: hanya tampil di dalam wilayah kerja (dipotong dengan clipPath menurut batas desa/kecamatan yang digambar) */}
            {path && (jalanSvg.length > 0 || sungaiSvg.length > 0) && (
              <>
                <defs>
                  <clipPath id="batas-wilayah-jalan">
                    {(desaGambar.length > 0 ? desaGambar : wilayahTampil).map((w, i) => (
                      <path key={i} d={path(w.geo) || ''} />
                    ))}
                  </clipPath>
                </defs>
                <g clipPath="url(#batas-wilayah-jalan)" style={{ pointerEvents: 'none' }}>
                  {sungaiSvg.map((s) => (
                    <path
                      key={'s' + s.kelas}
                      d={s.d}
                      fill="none"
                      stroke={s.warna}
                      strokeWidth={s.lebar / zoom}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {jalanSvg.map((j) => (
                    <path
                      key={'j' + j.kelas}
                      d={j.d}
                      fill="none"
                      stroke={j.warna}
                      strokeWidth={j.lebar / zoom}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </g>
              </>
            )}

            {/* Nama desa/kelurahan */}
            {path && tampilNamaDesa && desaGambar.length <= 150 &&
              desaGambar.map((d) => {
                const [cx, cy] = path.centroid(d.geo)
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
                return (
                  <g key={'n' + d.id} transform={`translate(${cx},${cy}) scale(${1 / zoom})`} style={{ pointerEvents: 'none' }}>
                    <text x={0} y={3} textAnchor="middle" fontSize={9} fontWeight={700} fill={umum.teksDesa} style={{ paintOrder: 'stroke', stroke: umum.halo, strokeWidth: 2.5, strokeLinejoin: 'round' }}>
                      {d.nama}
                    </text>
                  </g>
                )
              })}

            {/* Titik rumah ibu hamil */}
            {path && tampilPasien &&
              pasien.map((p) => {
                const xy = path.projection()([Number(p.longitude), Number(p.latitude)])
                if (!xy || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return null
                if (xy[0] < 0 || xy[0] > W || xy[1] < 0 || xy[1] > H) return null
                const warna = p.kehamilan_id ? warnaPin.terdaftar : warnaPin.manual
                return (
                  <g key={'p' + p.id} transform={`translate(${xy[0]},${xy[1]}) scale(${1 / zoom})`}>
                    <PinSvg warna={warna} />
                    <title>{p.nama}</title>
                  </g>
                )
              })}
          </g>
          </g>
          <BingkaiBerselang k={kertasPx.bingkai} sk={sk} />
          {/* Judul peta: kotak sendiri di atas bingkai */}
          <KotakSvg k={kertasPx.judul} warna={umum.judulGaris} />
          {logoKanan && (
            <image href={logoKanan} x={kertasPx.judul.x1 - (2.5 + logoJudulMm) * sk} y={kertasPx.judul.y0 + 2 * sk} width={logoJudulMm * sk} height={logoJudulMm * sk} preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />
          )}
          {logoKiri && (
            <image href={logoKiri} x={kertasPx.judul.x0 + 2.5 * sk} y={kertasPx.judul.y0 + 2 * sk} width={logoJudulMm * sk} height={logoJudulMm * sk} preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />
          )}
          <text x={(kertasPx.judul.x0 + kertasPx.judul.x1) / 2} y={kertasPx.judul.y0 + 6 * sk} textAnchor="middle" fontSize={fsJudul} fontWeight={800} fill={umum.judulTeks} style={{ pointerEvents: 'none' }}>
            {judulTeks}
          </text>
          <text x={(kertasPx.judul.x0 + kertasPx.judul.x1) / 2} y={kertasPx.judul.y0 + 11 * sk} textAnchor="middle" fontSize={fsSub} fontWeight={700} fill={umum.judulTeks} style={{ pointerEvents: 'none' }}>
            {subTeks}
          </text>

          {/* Kolom kanan: arah utara */}
          {tampilUtara && (
            <>
              <KotakSvg k={kertasPx.utara} warna={umum.judulGaris} />
              <image
                href="/data/arah-utara.svg"
                x={kertasPx.utara.x0 + 3 * sk}
                y={kertasPx.utara.y0 + 3 * sk}
                width={kertasPx.utara.x1 - kertasPx.utara.x0 - 6 * sk}
                height={kertasPx.utara.y1 - kertasPx.utara.y0 - 6 * sk}
                preserveAspectRatio="xMidYMid meet"
                style={{ pointerEvents: 'none' }}
              />
            </>
          )}

          {/* Skala */}
          <KotakSvg k={kertasPx.skalaBox} warna={umum.judulGaris} />
          <BilahSkala k={kertasPx.skalaBox} sk={sk} skala={skalaPeta} />

          {/* Sumber */}
          <KotakSvg k={kertasPx.sumber} warna={umum.judulGaris} />
          <text x={(kertasPx.sumber.x0 + kertasPx.sumber.x1) / 2} y={kertasPx.sumber.y0 + 5 * sk} textAnchor="middle" fontSize={3.6 * sk} fontWeight={800} fill={umum.judulTeks} style={{ pointerEvents: 'none' }}>SUMBER</text>
          {[...sumberTeks.split('\n'), ...(basemap !== 'none' ? [SUMBER_PETA[basemap].ket] : [])].map((baris, i) => (
            <text key={'su' + i} x={(kertasPx.sumber.x0 + kertasPx.sumber.x1) / 2} y={kertasPx.sumber.y0 + (11 + i * 4.5) * sk} textAnchor="middle" fontSize={3.2 * sk} fill={umum.judulTeks} style={{ pointerEvents: 'none' }}>
              {baris}
            </text>
          ))}

          {/* Dibuat oleh: logo dan nama */}
          <KotakSvg k={kertasPx.pembuat} warna={umum.judulGaris} />
          {/* Watermark nama aplikasi di dalam kotak "Dibuat oleh" */}
          <clipPath id="klip-pembuat">
            <rect x={kertasPx.pembuat.x0} y={kertasPx.pembuat.y0} width={kertasPx.pembuat.x1 - kertasPx.pembuat.x0} height={kertasPx.pembuat.y1 - kertasPx.pembuat.y0} />
          </clipPath>
          <g clipPath="url(#klip-pembuat)" style={{ pointerEvents: 'none' }}>
            <text
              x={(kertasPx.pembuat.x0 + kertasPx.pembuat.x1) / 2}
              y={(kertasPx.pembuat.y0 + kertasPx.pembuat.y1) / 2 + 3 * sk}
              textAnchor="middle"
              fontSize={9 * sk}
              fontWeight={800}
              fill="#12181b"
              fillOpacity={0.1}
              transform={`rotate(-20 ${(kertasPx.pembuat.x0 + kertasPx.pembuat.x1) / 2} ${(kertasPx.pembuat.y0 + kertasPx.pembuat.y1) / 2})`}
            >
              Epiflowlytics
            </text>
          </g>
          <text x={(kertasPx.pembuat.x0 + kertasPx.pembuat.x1) / 2} y={kertasPx.pembuat.y0 + 5 * sk} textAnchor="middle" fontSize={3.6 * sk} fontWeight={800} fill={umum.judulTeks} style={{ pointerEvents: 'none' }}>DIBUAT OLEH</text>
          {logoPeta && (
            <image
              href={logoPeta}
              x={(kertasPx.pembuat.x0 + kertasPx.pembuat.x1) / 2 - 7 * sk}
              y={kertasPx.pembuat.y0 + 7 * sk}
              width={14 * sk}
              height={14 * sk}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
          {[pembuatNama, pembuatInstansi].filter(Boolean).map((baris, i) => (
            <text
              key={'pb' + i}
              x={(kertasPx.pembuat.x0 + kertasPx.pembuat.x1) / 2}
              y={kertasPx.pembuat.y0 + ((logoPeta ? 27 : 12) + i * 4.5) * sk}
              textAnchor="middle"
              fontSize={(i === 0 ? 3.6 : 3.2) * sk}
              fontWeight={i === 0 ? 800 : 400}
              fill={umum.judulTeks}
              style={{ pointerEvents: 'none' }}
            >
              {baris}
            </text>
          ))}

          <LegendaSvg
            k={{ x0: kertasPx.legendaX0, x1: kertasPx.legendaX1, y0: kertasPx.legendaY0, y1: kertasPx.legendaY1 }}
            sk={sk}
            baris={barisLegenda}
            warnaTeks={umum.judulTeks}
            warnaGaris={umum.judulGaris}
          />

          {tampilGrid && tampilLabelGrid && gridHasil.labels.map((l, i) => (
            <text
              key={'gl' + i}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              fontSize={3.6 * sk}
              fill={warnaGrid}
              transform={l.rot ? `rotate(-90 ${l.x} ${l.y})` : undefined}
              style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: umum.halo, strokeWidth: 2, strokeLinejoin: 'round' }}
            >
              {l.teks}
            </text>
          ))}
        </svg>

        {terpilih && !itemPilih && (
          <div style={{ position: 'absolute', right: 70, top: 120, background: 'var(--surface, #fff)', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.7, width: 230, boxShadow: '0 2px 10px #0001', zIndex: 3 }}>
            <strong style={{ fontSize: 13 }}>{terpilih.nama}</strong>
            <br />
            {terpilih.sub && <>{terpilih.sub}<br /></>}
            Wilayah kerja: {terpilih.pkm ? namaPkm[terpilih.pkm] : 'belum ditetapkan'}
          </div>
        )}

        {/* Editor warna untuk desa yang diklik */}
        {itemPilih && (() => {
          const it = daftarItem.find((x) => x.kunci === itemPilih)
          if (!it) return null
          return (
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 70, top: 120, width: 250, background: 'var(--surface, #fff)', border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: '12px 14px', fontSize: 12, boxShadow: '0 4px 16px #0002', zIndex: 4 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 13 }}>{it.nama}</strong>
                  <div style={{ color: 'var(--muted, #64707a)' }}>{it.sub}</div>
                  <div style={{ color: 'var(--muted, #64707a)' }}>Wilayah kerja: {it.pkm ? namaPkm[it.pkm] : 'belum ditetapkan'}</div>
                </div>
                <button type="button" onClick={() => setItemPilih(null)} style={{ ...tautan, fontSize: 18, lineHeight: 1, color: 'var(--muted, #64707a)' }} title="Tutup">×</button>
              </div>
              <div style={{ marginTop: 8 }}>
                <PilihWarna label="Warna isi" nilai={it.isi} onChange={(v) => setIsi(it.kunci, v)} />
                <PilihWarna label="Warna garis tepi" nilai={it.garis} onChange={(v) => setGaris(it.kunci, v)} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" style={tautan} onClick={() => { setIsiKustom((m) => hapusKunci(m, it.kunci)); setGarisKustom((m) => hapusKunci(m, it.kunci)) }}>Kembalikan warna awal</button>
                <button type="button" style={tautan} onClick={() => setIsiKustom(Object.fromEntries(daftarItem.map((x) => [x.kunci, it.isi])))}>Terapkan isi ke semua</button>
              </div>
            </div>
          )
        })()}

        {/* Keterangan titik ibu hamil */}
        {tampilPasien && pasien.length > 0 && (
          <div style={{ position: 'absolute', left: 14, top: 14, background: 'var(--surface, #fff)', border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: '8px 12px', fontSize: 12, zIndex: 2 }}>
            <strong style={{ display: 'block', marginBottom: 2 }}>Ibu hamil ({pasien.length})</strong>
            <div style={{ lineHeight: 1.9 }}><PilihWarnaPenanda label="Terdaftar" nilai={warnaPin.terdaftar} onChange={(v) => setWarnaPin('terdaftar', v)} /></div>
            <div style={{ lineHeight: 1.9 }}><PilihWarnaPenanda label="Manual" nilai={warnaPin.manual} onChange={(v) => setWarnaPin('manual', v)} /></div>
          </div>
        )}

        {/* Zoom */}
        <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', background: 'var(--surface, #fff)', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, overflow: 'hidden', zIndex: 2 }}>
          <button onClick={() => setZoom((z) => Math.min(z * 1.25, 6))} style={tombolZoom} title="Perbesar">+</button>
          <button onClick={() => setZoom((z) => Math.max(z / 1.25, 1))} style={tombolZoom} title="Perkecil">−</button>
          <button onClick={() => setZoom(1)} style={{ ...tombolZoom, borderBottom: 'none' }} title="Zoom pas">⌂</button>
        </div>
      </main>
    </div>
  )
}

const hex6 = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#cccccc')

function KotakWarna({ nilai, onChange, judul }) {
  return (
    <input
      type="color"
      value={hex6(nilai)}
      title={judul}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 30, height: 24, padding: 0, border: '1px solid var(--line, #e5e7eb)', borderRadius: 4, background: 'none', cursor: 'pointer', flexShrink: 0 }}
    />
  )
}

function KotakLogo({ logo, onBaca, onHapus }) {
  const [namaFile, setNamaFile] = useState('')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ ...pilihan, flex: 1, margin: 0, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ padding: '4px 10px', background: 'var(--accent-soft, #e4f3ef)', borderRadius: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
            Choose File
          </span>
          <span style={{ fontSize: 13, color: 'var(--muted, #64707a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {namaFile || 'No file chosen'}
          </span>
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const berkas = e.target.files?.[0]
              if (!berkas) return
              setNamaFile(berkas.name)
              onBaca(e)
            }}
          />
        </label>
        <div
          style={{
            width: 56, height: 56, flexShrink: 0, overflow: 'hidden',
            border: '1px dashed var(--line, #e5e7eb)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: 'var(--muted, #64707a)',
          }}
        >
          {logo
            ? <img src={logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : 'Preview'}
        </div>
      </div>
      {logo && (
        <button type="button" onClick={() => { setNamaFile(''); onHapus() }} style={{ ...tautan, marginTop: 4 }}>
          Hapus logo
        </button>
      )}
    </>
  )
}

function PilihWarna({ label, nilai, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 12, cursor: 'pointer' }}>
      <KotakWarna nilai={nilai} onChange={onChange} judul={label} />
      <span style={{ flex: 1 }}>{label}</span>
    </label>
  )
}

function Geser({ label, nilai, min, max, langkah, tampil, onChange }) {
  return (
    <label style={{ display: 'block', padding: '4px 2px', fontSize: 12 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: 'var(--muted, #64707a)' }}>{tampil}</span>
      </span>
      <input type="range" min={min} max={max} step={langkah} value={nilai} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent, #0e7c66)' }} />
    </label>
  )
}

function Kartu({ label, nilai, sub }) {
  return (
    <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: '10px 14px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--muted, #64707a)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{nilai}</div>
      <div style={{ fontSize: 11, color: 'var(--muted, #64707a)' }}>{sub}</div>
    </div>
  )
}

const judulBagian = { fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted, #64707a)', margin: '18px 0 8px' }
const opsi = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', fontSize: 13, cursor: 'pointer' }
const pilihan = { width: '100%', padding: '9px 10px', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: 'var(--surface, #fff)', boxSizing: 'border-box' }
const labelForm = { display: 'block', fontSize: 12, color: 'var(--muted, #64707a)', margin: '10px 0 4px' }
const tautan = { border: 'none', background: 'none', padding: 0, fontSize: 12, color: 'var(--accent, #0e7c66)', cursor: 'pointer', fontFamily: 'inherit' }
const tombolZoom = { width: 36, height: 36, border: 'none', background: 'none', fontSize: 18, borderBottom: '1px solid var(--line, #e5e7eb)', cursor: 'pointer' }
const grupWarna = { marginBottom: 8, border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, padding: '6px 10px' }
const ringkasan = { fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }
const tombolSekunder = { marginTop: 4, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line, #e5e7eb)', background: 'var(--surface, #fff)', color: 'inherit', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }
const tombolUtama = { marginTop: 12, width: '100%', padding: '9px 10px', borderRadius: 8, border: 'none', background: 'var(--accent, #0e7c66)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }