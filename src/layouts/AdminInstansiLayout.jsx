import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const MENU = [
  { to: '/dashboard/admin', label: 'Dashboard Ringkasan', end: true, icon: HomeIcon },
  { to: '/dashboard/admin/staf', label: 'Kelola Poli & Staf', icon: UsersIcon },
  { to: '/dashboard/admin/pasien', label: 'Data Pasien', icon: ClipboardIcon },
  { to: '/dashboard/admin/profil', label: 'Profil Instansi', icon: BuildingIcon },
]

function HomeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9.5v-6h5v6H17.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function UsersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" strokeLinecap="round" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M15.2 12.6c2.5.3 4.3 2.7 4.3 5.7" strokeLinecap="round" />
    </svg>
  )
}
function ClipboardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h3" strokeLinecap="round" />
    </svg>
  )
}
function BuildingIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="4" y="3" width="11" height="18" rx="1" />
      <rect x="15" y="9" width="5" height="12" rx="1" />
      <path d="M7.5 7h1M7.5 11h1M7.5 15h1M11 7h1M11 11h1M11 15h1" strokeLinecap="round" />
    </svg>
  )
}

export default function AdminInstansiLayout() {
  const { profile, signOut } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <aside
        className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--line)' }}
      >
        <SidebarContent profile={profile} onNavigate={() => {}} />
      </aside>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(18,24,27,0.4)' }}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] flex flex-col"
            style={{ background: 'var(--surface)', borderRight: '1px solid var(--line)' }}
          >
            <SidebarContent profile={profile} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header
          className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-30"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 rounded-lg"
              style={{ color: 'var(--ink)' }}
              onClick={() => setDrawerOpen(true)}
              aria-label="Buka menu"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
            <p className="text-sm font-extrabold tracking-tight lg:hidden">
              <span style={{ color: 'var(--accent)' }}>Epiflow</span>
              <span style={{ color: 'var(--muted)' }}>lytics</span>
            </p>
          </div>

          <button
            onClick={signOut}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
          >
            Keluar
          </button>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ profile, onNavigate }) {
  return (
    <>
      <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--line)' }}>
        <p className="text-sm font-extrabold tracking-tight">
          <span style={{ color: 'var(--accent)' }}>Epiflow</span>
          <span style={{ color: 'var(--muted)' }}>lytics</span>
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          Admin Instansi
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
        {MENU.map(({ to, label, end, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--ink)',
            })}
          >
            <Icon width={18} height={18} style={{ flexShrink: 0 }} />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4" style={{ borderTop: '1px solid var(--line)' }}>
        <p className="text-xs font-semibold truncate">{profile?.nama_lengkap ?? '—'}</p>
        <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
          {profile?.email ?? '—'}
        </p>
      </div>
    </>
  )
}
