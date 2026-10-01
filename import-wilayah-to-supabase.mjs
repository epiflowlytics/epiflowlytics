// import-wilayah-to-supabase.mjs
// Import data wilayah (provinces, regencies, districts, villages) dari folder
// wilayah-data/ ke tabel Supabase: wilayah_provinces, wilayah_regencies,
// wilayah_districts, wilayah_villages.
//
// CARA PAKAI:
// 1. Install dependency (sekali saja):
//      npm install @supabase/supabase-js
// 2. Set environment variable (Supabase URL + SERVICE ROLE KEY, bukan anon key!)
//    Ambil di: Supabase Dashboard > Project Settings > API > service_role key
//
//    PowerShell:
//      $env:SUPABASE_URL="https://xxxxx.supabase.co"
//      $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
//
// 3. Jalankan dari root project (folder yang punya wilayah-data/):
//      node import-wilayah-to-supabase.mjs
//
// Aman dijalankan berkali-kali (pakai upsert, jadi tidak akan duplikat).

import fs from 'fs/promises'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DATA_DIR = './wilayah-data'
const BATCH_SIZE = 1000

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum di-set.')
  console.error('   Lihat komentar di atas file ini untuk cara set env var.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function printProgress(done, total, label) {
  if (done % BATCH_SIZE === 0 || done === total) {
    process.stdout.write(`\r   ${label}: ${done}/${total} (${((done / total) * 100).toFixed(1)}%)   `)
  }
}

function dedupeById(rows) {
  const seen = new Map()
  for (const row of rows) seen.set(row.id, row) // baris terakhir dengan id sama akan menang
  return Array.from(seen.values())
}

async function upsertInBatches(table, rows, mapFn, label) {
  const deduped = dedupeById(rows.map(mapFn))
  if (deduped.length < rows.length) {
    console.log(`\n   ⚠️  Ditemukan ${rows.length - deduped.length} baris duplikat (id sama), sudah di-skip.`)
  }
  rows = deduped
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' })
    if (error) {
      console.error(`\n❌ Gagal insert batch ke ${table} (index ${i}):`, error.message)
      process.exit(1)
    }
    done += chunk.length
    printProgress(done, rows.length, label)
  }
  console.log('')
}

async function main() {
  console.log('1/4 Import provinces...')
  const provinces = JSON.parse(await fs.readFile(`${DATA_DIR}/provinces.json`, 'utf-8'))
  await upsertInBatches(
    'wilayah_provinces',
    provinces,
    (p) => ({ id: p.id, name: p.name }),
    'provinces'
  )
  console.log(`   ✓ ${provinces.length} provinsi diimport`)

  console.log('2/4 Import regencies...')
  const regencies = JSON.parse(await fs.readFile(`${DATA_DIR}/regencies.json`, 'utf-8'))
  await upsertInBatches(
    'wilayah_regencies',
    regencies,
    (r) => ({ id: r.id, province_id: r.province_id, name: r.name }),
    'regencies'
  )
  console.log(`   ✓ ${regencies.length} kabupaten/kota diimport`)

  console.log('3/4 Import districts...')
  const districts = JSON.parse(await fs.readFile(`${DATA_DIR}/districts.json`, 'utf-8'))
  await upsertInBatches(
    'wilayah_districts',
    districts,
    (d) => ({ id: d.id, regency_id: d.regency_id, name: d.name }),
    'districts'
  )
  console.log(`   ✓ ${districts.length} kecamatan diimport`)

  console.log('4/4 Import villages (paling lama, 80.534 baris)...')
  const villages = JSON.parse(await fs.readFile(`${DATA_DIR}/villages.json`, 'utf-8'))
  await upsertInBatches(
    'wilayah_villages',
    villages,
    (v) => ({ id: v.id, district_id: v.district_id, name: v.name }),
    'villages'
  )
  console.log(`   ✓ ${villages.length} desa/kelurahan diimport`)

  console.log('\n✅ Selesai! Semua data wilayah sudah masuk ke Supabase.')
}

main().catch((err) => {
  console.error('\n❌ Gagal total:', err)
  process.exit(1)
})
