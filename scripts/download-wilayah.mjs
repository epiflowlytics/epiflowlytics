// download-wilayah.mjs (v2 — dengan progress live + auto-save)
// Jalankan: node download-wilayah.mjs
// Butuh Node 18+ (sudah ada fetch bawaan)

import fs from 'fs/promises'

const BASE = 'https://emsifa.github.io/api-wilayah-indonesia/api'
const OUT_DIR = './wilayah-data'
const CONCURRENCY = 8
const SAVE_EVERY = 500 // auto-save villages.json tiap N item selesai

async function fetchJSON(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise((r) => setTimeout(r, 800 * attempt))
    }
  }
}

async function runPool(items, worker, { concurrency = CONCURRENCY, onProgress } = {}) {
  const results = new Array(items.length)
  let i = 0
  let done = 0
  async function next() {
    while (i < items.length) {
      const idx = i++
      try {
        results[idx] = await worker(items[idx], idx)
      } catch (err) {
        console.error(`  ⚠️  Gagal item #${idx} (${items[idx]?.id ?? '?'}):`, err.message)
        results[idx] = []
      }
      done++
      if (onProgress) onProgress(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next))
  return results
}

function printProgress(done, total) {
  if (done % 100 === 0 || done === total) {
    process.stdout.write(`\r   progress: ${done}/${total} (${((done / total) * 100).toFixed(1)}%)   `)
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })

  console.log('1/4 Mengambil daftar provinsi...')
  const provinces = await fetchJSON(`${BASE}/provinces.json`)
  await fs.writeFile(`${OUT_DIR}/provinces.json`, JSON.stringify(provinces, null, 2))
  console.log(`   ✓ ${provinces.length} provinsi disimpan`)

  console.log('2/4 Mengambil semua kabupaten/kota per provinsi...')
  const regencyLists = await runPool(provinces, (p) => fetchJSON(`${BASE}/regencies/${p.id}.json`), {
    onProgress: printProgress,
  })
  const regencies = regencyLists.flat()
  await fs.writeFile(`${OUT_DIR}/regencies.json`, JSON.stringify(regencies, null, 2))
  console.log(`\n   ✓ ${regencies.length} kabupaten/kota disimpan`)

  console.log('3/4 Mengambil semua kecamatan per kabupaten/kota...')
  const districtLists = await runPool(regencies, (r) => fetchJSON(`${BASE}/districts/${r.id}.json`), {
    onProgress: printProgress,
  })
  const districts = districtLists.flat()
  await fs.writeFile(`${OUT_DIR}/districts.json`, JSON.stringify(districts, null, 2))
  console.log(`\n   ✓ ${districts.length} kecamatan disimpan`)

  console.log('4/4 Mengambil semua desa/kelurahan per kecamatan (paling lama, ' + districts.length + ' request)...')
  const allVillages = []
  let doneCount = 0
  await runPool(
    districts,
    async (d) => {
      const result = await fetchJSON(`${BASE}/villages/${d.id}.json`)
      allVillages.push(...result)
      doneCount++
      if (doneCount % SAVE_EVERY === 0) {
        await fs.writeFile(`${OUT_DIR}/villages.json`, JSON.stringify(allVillages, null, 2))
      }
      return result
    },
    { onProgress: printProgress }
  )
  await fs.writeFile(`${OUT_DIR}/villages.json`, JSON.stringify(allVillages, null, 2))
  console.log(`\n   ✓ ${allVillages.length} desa/kelurahan disimpan`)

  console.log('\nSelesai! Semua file ada di folder', OUT_DIR)
}

main().catch((err) => {
  console.error('Gagal total:', err)
  process.exit(1)
})