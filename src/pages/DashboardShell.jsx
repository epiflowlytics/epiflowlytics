import { useAuth } from '../context/AuthContext'

export default function DashboardShell({ title, description }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header
        className="flex items-center justify-between px-8 py-4"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}
      >
        <p className="text-sm font-extrabold tracking-tight">
          <span style={{ color: 'var(--accent)' }}>Epiflow</span>
          <span style={{ color: 'var(--muted)' }}>lytics</span>
        </p>
        <button
          onClick={signOut}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
        >
          Keluar
        </button>
      </header>

      <main className="px-8 py-10 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">{title}</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>
          {description}
        </p>

        <div
          className="rounded-lg p-6"
          style={{ background: '#fff', border: '1px solid var(--line)' }}
        >
          <p className="text-sm mb-2">
            <span className="font-semibold">Nama:</span> {profile?.nama_lengkap ?? '—'}
          </p>
          <p className="text-sm mb-2">
            <span className="font-semibold">Email:</span> {profile?.email ?? '—'}
          </p>
          <p className="text-sm mb-2">
            <span className="font-semibold">Peran:</span> {profile?.role ?? '—'}
          </p>
          {profile?.profesi && (
            <p className="text-sm">
              <span className="font-semibold">Profesi:</span> {profile.profesi}
            </p>
          )}
          <p className="text-xs mt-6" style={{ color: 'var(--muted)' }}>
            Halaman ini placeholder — bangun modul (manajemen instansi, manajemen poli, rekam
            medis, dsb.) di sini sesuai peran yang login.
          </p>
        </div>
      </main>
    </div>
  )
}
