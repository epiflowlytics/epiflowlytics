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

// Pakai sessionStorage (bukan localStorage) supaya setiap TAB browser
// punya sesi login sendiri-sendiri dan tidak saling menimpa. Dengan
// localStorage (default Supabase), login di satu tab akan otomatis
// menggantikan sesi di tab lain pada origin yang sama — ini masalah
// nyata untuk aplikasi ini karena loket, admin, dsb, sering dibuka
// bersamaan di tab berbeda dengan akun berbeda.
// Konsekuensi: menutup tab (bukan sekadar refresh) akan mengakhiri
// sesi tab itu, harus login ulang saat tab baru dibuka — trade-off
// yang wajar untuk mendukung multi-akun per browser.
// Kunci storage unik PER TAB (bukan cuma per browser). Supabase v2 pakai
// Web Locks API (navigator.locks) untuk koordinasi auth state, dan nama
// lock itu diturunkan dari storageKey — locknya di-scope ke ORIGIN, bukan
// per-tab, jadi walau tokennya sudah di sessionStorage (tidak saling
// menimpa), tab lain tetap bisa "ikut kena" lock/broadcast yang sama
// karena storageKey-nya sama persis ('sb-<project>-auth-token' default).
// Solusinya: bikin storageKey unik untuk tiap tab sekali buka (disimpan
// balik ke sessionStorage tab itu sendiri supaya konsisten kalau di-refresh).
function getTabStorageKey() {
  const K = '__epiflow_tab_id'
  let tabId = window.sessionStorage.getItem(K)
  if (!tabId) {
    tabId = crypto.randomUUID()
    window.sessionStorage.setItem(K, tabId)
  }
  return `sb-auth-token-tab-${tabId}`
}

// Lock no-op: langsung jalankan fn() tanpa menunggu/mengunci lewat
// Navigator LockManager API sama sekali. Solusi resmi dari tim Supabase
// untuk kasus di mana koordinasi lock antar-tab justru menyebabkan
// masalah (lihat github.com/supabase/supabase-js issue #1594). Karena
// tiap tab sekarang sudah punya storageKey unik sendiri-sendiri, tidak
// ada lagi kebutuhan saling mengunci sama sekali — aman dinonaktifkan.
async function noOpLock(name, acquireTimeout, fn) {
  return await fn()
}

export const supabase = createClient(
  supabaseNotConfigured ? 'https://placeholder.supabase.co' : supabaseUrl,
  supabaseNotConfigured ? 'placeholder-anon-key' : supabaseAnonKey,
  {
    auth: {
      storage: window.sessionStorage,
      storageKey: getTabStorageKey(),
      persistSession: true,
      autoRefreshToken: true,
      lock: noOpLock,
    },
  }
)