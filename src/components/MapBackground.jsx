import { useEffect, useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'

const W = 1600
const H = 800

// UJI: memakai file asli (belum disederhanakan) untuk memastikan
// apakah kotak frame berasal dari proses simplify.
// Setelah diuji, kembalikan nama file ke 'sulawesi-adminareas-simplified.geojson'.
const NAMA_FILE = 'sulawesi-adminareas.geojson'

const LAYERS = [
  { file: NAMA_FILE, fill: 'none', stroke: '#0f7b64', lebar: 0.6 },
]

const ACUAN = NAMA_FILE

// Cache di tingkat modul: data hanya diunduh sekali per sesi browser,
// walaupun komponen dipasang ulang.
const cache = {}

function muatSekali(file) {
  if (!cache[file]) {
    cache[file] = fetch(`/data/sulawesi/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch((e) => {
        delete cache[file]
        throw e
      })
  }
  return cache[file]
}

export default function MapBackground({ opacity = 0.15 }) {
  const [data, setData] = useState({})

  useEffect(() => {
    let batal = false
    Promise.all(LAYERS.map(({ file }) => muatSekali(file).then((json) => [file, json])))
      .then((pasangan) => {
        if (!batal) setData(Object.fromEntries(pasangan))
      })
      .catch((e) => console.error('Gagal memuat peta latar:', e))
    return () => {
      batal = true
    }
  }, [])

  const path = useMemo(() => {
    const acuan = data[ACUAN]
    if (!acuan) return null
    return geoPath(geoMercator().fitSize([W, H], acuan))
  }, [data])

  if (!path) return null

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {LAYERS.map(({ file, fill, stroke, lebar }) =>
        data[file] ? (
          <g key={file}>
            {data[file].features.map((f, i) => (
              <path key={i} d={path(f) || ''} fill={fill} stroke={stroke} strokeWidth={lebar} />
            ))}
          </g>
        ) : null
      )}
    </svg>
  )
}