import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// true kalau .env belum diisi kredensial asli (masih kosong / masih placeholder)
export const supabaseNotConfigured =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes('xxxxxxxxxxxx') ||
  supabaseAnonKey === 'your-anon-public-key'

if (supabaseNotConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi kredensial asli. ' +
      'Salin .env.example ke .env, isi dengan Project URL & anon key dari Supabase, lalu restart "npm run dev".'
  )
}

// Pakai URL dummy yang valid saat belum dikonfigurasi supaya createClient tidak
// throw dan bikin seluruh aplikasi crash jadi layar putih. Semua panggilan Supabase
// tetap akan gagal (network error) sampai .env diisi kredensial asli — itu wajar.
export const supabase = createClient(
  supabaseNotConfigured ? 'https://placeholder.supabase.co' : supabaseUrl,
  supabaseNotConfigured ? 'placeholder-anon-key' : supabaseAnonKey
)
