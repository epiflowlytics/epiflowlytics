const fs = require('fs')
const path = require('path')

const SUMBER = 'D:/appweb/epiflowlytics/FILE SHP/SULAWESI/geojson/sulawesi-roads-simplified.geojson'
const KELUARAN = path.join('public', 'data', 'sulawesi', 'jalan')
const UKURAN = 0.5      // lebar satu kotak dalam derajat
const MIN_LON = 117
const MIN_LAT = -8

function bbox(c, b = [Infinity, Infinity, -Infinity, -Infinity]) {
  if (typeof c[0] === 'number') {
    b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1])
    b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1])
  } else {
    for (const x of c) bbox(x, b)
  }
  return b
}

const json = JSON.parse(fs.readFileSync(SUMBER, 'utf8'))
const kotak = new Map()

for (const f of json.features) {
  if (!f.geometry) continue; const [x0, y0, x1, y1] = bbox(f.geometry.coordinates)
  const c0 = Math.floor((x0 - MIN_LON) / UKURAN), c1 = Math.floor((x1 - MIN_LON) / UKURAN)
  const r0 = Math.floor((y0 - MIN_LAT) / UKURAN), r1 = Math.floor((y1 - MIN_LAT) / UKURAN)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const k = `${r}_${c}`
      if (!kotak.has(k)) kotak.set(k, [])
      kotak.get(k).push(f)
    }
  }
}

fs.rmSync(KELUARAN, { recursive: true, force: true })
fs.mkdirSync(KELUARAN, { recursive: true })
let total = 0
for (const [k, fitur] of kotak) {
  // Bulatkan koordinat ke 5 desimal (sekitar 1 meter) supaya file lebih kecil
  const isi = JSON.stringify({ type: 'FeatureCollection', features: fitur }, (key, val) =>
    typeof val === 'number' && !Number.isInteger(val) ? Math.round(val * 1e5) / 1e5 : val
  )
  fs.writeFileSync(path.join(KELUARAN, `${k}.geojson`), isi)
  total += isi.length
}
console.log(`${kotak.size} file dibuat di ${KELUARAN}`)
console.log(`Total ukuran: ${(total / 1024 / 1024).toFixed(1)} MB`)
