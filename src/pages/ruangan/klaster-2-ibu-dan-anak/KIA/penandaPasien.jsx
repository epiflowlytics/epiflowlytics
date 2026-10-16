import { useCallback, useState } from 'react'

// Penanda pin ibu hamil + pilihan warna (disimpan di peramban, dipakai di Peta Distribusi dan Input Pasien).
const KUNCI = 'penanda_pasien_warna'
export const WARNA_AWAL = { terdaftar: '#e11d1d', manual: '#d68910' }

const RASIO = 52 / 40 // tinggi / lebar
const D_BADAN = 'M20 2C10 2 3 9.5 3 18.5C3 30 20 46 20 46C20 46 37 30 37 18.5C37 9.5 30 2 20 2Z'
const D_BAYANG = 'M20 2C30 2 37 9.5 37 18.5C37 30 20 46 20 46Z'

function bacaWarna() {
  try {
    const t = JSON.parse(localStorage.getItem(KUNCI) || 'null')
    const ok = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)
    return { terdaftar: ok(t?.terdaftar) ? t.terdaftar : WARNA_AWAL.terdaftar, manual: ok(t?.manual) ? t.manual : WARNA_AWAL.manual }
  } catch {
    return WARNA_AWAL
  }
}

export function useWarnaPenanda() {
  const [warna, setWarnaState] = useState(bacaWarna)
  const setWarna = useCallback((kunci, nilai) => {
    setWarnaState((w) => {
      const baru = { ...w, [kunci]: nilai }
      try { localStorage.setItem(KUNCI, JSON.stringify(baru)) } catch { /* abaikan */ }
      return baru
    })
  }, [])
  return [warna, setWarna]
}

// Pin sebagai teks SVG (untuk ikon Leaflet). Ujung pin berada di titik koordinat.
export function ikonPin(L, warna, lebar = 30) {
  const tinggi = Math.round(lebar * RASIO)
  const html =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lebar}" height="${tinggi}" viewBox="0 0 40 52" style="display:block;overflow:visible">` +
    `<ellipse cx="20" cy="46" rx="16" ry="3.6" fill="none" stroke="${warna}" stroke-width="1.4"/>` +
    `<path d="${D_BADAN}" fill="${warna}" stroke="#fff" stroke-width="1.2"/>` +
    `<path d="${D_BAYANG}" fill="#000" fill-opacity=".16"/>` +
    `<circle cx="20" cy="18" r="6.5" fill="#fff"/></svg>`
  return L.divIcon({ className: '', iconSize: [lebar, tinggi], iconAnchor: [lebar / 2, (tinggi * 46) / 52], html })
}
export const tinggiPin = (lebar = 30) => Math.round(lebar * RASIO)

// Pin untuk SVG React (peta d3). Ujung pin berada di (0,0).
export function PinSvg({ warna, skala = 0.7 }) {
  return (
    <g transform={`scale(${skala}) translate(-20,-46)`}>
      <ellipse cx="20" cy="46" rx="16" ry="3.6" fill="none" stroke={warna} strokeWidth="1.4" />
      <path d={D_BADAN} fill={warna} stroke="#fff" strokeWidth="1.2" />
      <path d={D_BAYANG} fill="#000" fillOpacity=".16" />
      <circle cx="20" cy="18" r="6.5" fill="#fff" />
    </g>
  )
}

export function PilihWarnaPenanda({ label, nilai, onChange }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
      <input
        type="color"
        value={nilai}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Warna penanda ${label}`}
        style={{ width: 26, height: 22, padding: 0, border: '1px solid var(--line, #d1d5db)', borderRadius: 4, background: 'none', cursor: 'pointer' }}
      />
      {label}
    </label>
  )
}
