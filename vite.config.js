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

// Mode tunnel HTTPS (Cloudflare Tunnel / ngrok) untuk menguji lokasi GPS di HP.
// Jalankan dengan: PowerShell  -> $env:TUNNEL=1; npm run dev
//                  CMD         -> set TUNNEL=1&& npm run dev
const pakaiTunnel = process.env.TUNNEL === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // dengarkan di semua alamat jaringan, bukan cuma localhost
    // Izinkan alamat tunnel; tanpa ini Vite menolak dengan "Blocked request. This host is not allowed".
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'],
    // Tanpa tunnel: HMR ke IP lokal supaya tidak layar putih saat dibuka dari HP lewat Wi-Fi.
    // Lewat tunnel (HTTPS): HMR lewat port 443 dari alamat tunnel itu sendiri.
    hmr: pakaiTunnel ? { clientPort: 443 } : { host: getLocalIP() },
  },
})