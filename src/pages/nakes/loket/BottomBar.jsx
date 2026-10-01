// ─── BOTTOM BAR — navigasi cepat, fixed di bawah layar, tampil di
// semua halaman petugas loket (dashboard, pencarian, form pendaftaran).
// Tidak ditampilkan di layar publik (Antrian TV, Cek Antrian QR).
//
// Menu yang sedang aktif ditandai dengan latar putih solid + teks/ikon
// merah, dan tetap seperti itu sampai petugas menekan menu lain.
//
// PENTING: activeKey dikontrol oleh parent (mis. berdasarkan `step` di
// DashboardLoket), BUKAN disimpan sendiri di sini. Kalau disimpan lokal,
// highlight-nya tidak sinkron dengan halaman yang benar-benar sedang
// ditampilkan (misalnya saat reload halaman, atau saat navigasi terjadi
// dari tempat lain selain BottomBar ini).
//
// "Keluar" dipindahkan ke pojok kanan atas Dashboard (step 'kategori'),
// jadi tidak lagi ada di BottomBar ini. Menu paling kiri sekarang adalah
// "Home" yang selalu membawa kembali ke Dashboard.
export default function BottomBar({
  activeKey,
  onHome,
  onCekAntrian,
  onRakRekamMedis,
  onRetribusi,
  onRiwayatPendaftaran,
}) {
  const items = [
    { key: 'home', label: 'Home', icon: 'ti-home', onClick: onHome },
    { key: 'cek-antrian', label: 'Cek Antrian', icon: 'ti-device-mobile', onClick: onCekAntrian },
    { key: 'rak-rm', label: 'Rak RM', icon: 'ti-archive', onClick: onRakRekamMedis },
    { key: 'retribusi', label: 'Retribusi', icon: 'ti-cash', onClick: onRetribusi },
    { key: 'riwayat', label: 'Riwayat', icon: 'ti-history', onClick: onRiwayatPendaftaran },
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[90] bg-[#0E7C66] rounded-t-2xl overflow-hidden shadow-[0_-2px_10px_rgba(0,0,0,0.08)]"
      style={{ paddingTop: '2.5px', paddingBottom: 'calc(env(safe-area-inset-bottom) + 2.5px)' }}
    >
      <div className="max-w-7xl mx-auto grid grid-cols-5">
        {items.map((item) => {
          const isActive = activeKey === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={`flex flex-col items-center justify-center gap-0.5 touch-manipulation ${
                isActive ? 'bg-white text-red-500' : 'text-white hover:bg-black/10 active:bg-black/10'
              }`}
              style={{ paddingTop: '10px', paddingBottom: '10px' }}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: '25px' }} aria-hidden="true"></i>
              <span className="font-medium leading-tight" style={{ fontSize: '12.5px' }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}