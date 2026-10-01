// import-kodepos-to-supabase.mjs
// Import data kode pos dari data_kode_pos.json ke tabel Supabase
// wilayah_kodepos. Dipakai untuk mengisi otomatis field Kode Pos saat
// kelurahan/desa dipilih di form pasien (dicocokkan berdasarkan nama,
// karena dataset ini tidak memakai id yang sama dengan wilayah_villages).
//
// CARA PAKAI:
// 1. Jalankan dulu migration_tabel_kode_pos.sql di Supabase SQL Editor
//    untuk membuat tabelnya.
// 2. Install dependency (sekali saja):
//      npm install @supabase/supabase-js
// 3. Set environment variable (Supabase URL + SERVICE ROLE KEY):
//      PowerShell:
//        $env:SUPABASE_URL="https://xxxxx.supabase.co"
//        $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
// 4. Jalankan dari folder yang punya data_kode_pos.json:
//      node import-kodepos-to-supabase.mjs
//
// Aman dijalankan berkali-kali — tabel dikosongkan dulu sebelum insert ulang.

import fs from 'fs/promises'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DATA_FILE = './data_kode_pos.json'
const BATCH_SIZE = 1000

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum di-set.')
  console.error('   Lihat komentar di atas file ini untuk cara set env var.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function printProgress(done, total) {
  if (done % BATCH_SIZE === 0 || done === total) {
    process.stdout.write(`\r   kode pos: ${done}/${total} (${((done / total) * 100).toFixed(1)}%)   `)
  }
}

async function main() {
  console.log('1/3 Membaca data_kode_pos.json...')
  const raw = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'))
  const rows = raw.kodepos
  console.log(`   ✓ ${rows.length} baris dibaca`)

  const mapped = rows.map((r) => ({
    kelurahan: r.kel.trim(),
    kecamatan: r.kec.trim(),
    kabupaten: r.kota.trim(),
    tipe_kabupaten: r.dt2.trim(),
    provinsi: r.prov.trim(),
    kode_pos: String(r.kodepos).trim(),
  }))

  console.log('2/3 Mengosongkan tabel wilayah_kodepos (supaya tidak duplikat)...')
  const { error: delErr } = await supabase.from('wilayah_kodepos').delete().gte('id', 0)
  if (delErr) {
    console.error('❌ Gagal mengosongkan tabel:', delErr.message)
    process.exit(1)
  }
  console.log('   ✓ Tabel dikosongkan')

  console.log('3/3 Import kode pos...')
  let done = 0
  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const chunk = mapped.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('wilayah_kodepos').insert(chunk)
    if (error) {
      console.error(`\n❌ Gagal insert batch (index ${i}):`, error.message)
      process.exit(1)
    }
    done += chunk.length
    printProgress(done, mapped.length)
  }
  console.log('')
  console.log(`   ✓ ${mapped.length} baris kode pos diimport`)

  console.log('\n✅ Selesai! Data kode pos sudah masuk ke Supabase.')
}

main().catch((err) => {
  console.error('\n❌ Gagal total:', err)
  process.exit(1)
})
