import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import os from 'os'

// Otomatis deteksi IP lokal mesin ini (WiFi/Ethernet aktif),
// supaya tidak perlu update manual tiap kali ganti jaringan/IP berubah.
function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // dengarkan di semua alamat jaringan, bukan cuma localhost
    // Supaya koneksi hot-reload (HMR) tidak mencoba connect balik ke
    // IP yang sudah kadaluarsa saat dibuka dari HP — inilah penyebab
    // paling umum layar putih kosong / HMR gagal connect.
    hmr: {
      host: getLocalIP(),
    },
  },
})