// ─── LOADING OVERLAY — ditampilkan sesaat saat berpindah menu lewat
// BottomBar, sebelum halaman/modal tujuan siap. Menampilkan logo
// Epiflowlytics + garis pulse teal (identik dengan halaman Login) supaya
// jeda transisi terasa sebagai proses, bukan macet.
export default function LoadingOverlay({ label = 'Memuat…' }) {
  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 bg-[#F6F7F9]">
      <h1 className="text-2xl font-bold tracking-tight">
        <span style={{ color: '#0E7C66' }}>Epiflow</span>
        <span style={{ color: '#64707A', fontWeight: 600 }}>lytics</span>
      </h1>

      <svg
        className="pulse-line-loading"
        width="140"
        height="32"
        viewBox="0 0 120 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M0 14 H30 L38 4 L46 24 L54 14 H70 L76 8 L82 20 L88 14 H120"
          stroke="#0E7C66"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <p className="text-sm" style={{ color: '#64707A' }}>{label}</p>
    </div>
  )
}
