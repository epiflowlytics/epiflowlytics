import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const MENU = [
  { to: '/dashboard/super-owner', label: 'Dashboard Ringkasan', end: true, icon: HomeIcon },
  { to: '/dashboard/super-owner/instansi', label: 'Manajemen Instansi', icon: BuildingIcon },
  { to: '/dashboard/super-owner/admin', label: 'Manajemen Admin Instansi', icon: UsersIcon },
  { to: '/dashboard/super-owner/billing', label: 'Langganan & Billing', icon: CardIcon },
  { to: '/dashboard/super-owner/master-data', label: 'Master Data Platform', icon: LayersIcon },
  { to: '/dashboard/super-owner/audit-log', label: 'Log Aktivitas / Audit Trail', icon: ClipboardIcon },
  { to: '/dashboard/super-owner/pengaturan', label: 'Pengaturan Platform', icon: SettingsIcon },
  { to: '/dashboard/super-owner/profil', label: 'Profil & Keamanan Akun', icon: ShieldIcon },
]

function HomeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9.5v-6h5v6H17.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
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
function CardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10.5h18" />
      <path d="M6.5 14.5h4" strokeLinecap="round" />
    </svg>
  )
}
function LayersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8Z" strokeLinejoin="round" />
      <path d="M3.5 12 12 16.5 20.5 12" strokeLinejoin="round" />
      <path d="M3.5 16 12 20.5 20.5 16" strokeLinejoin="round" />
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
function SettingsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M4.9 6.4l1.4 1.4M17.7 16.2l1.4 1.4M3.5 12h2M18.5 12h2M4.9 17.6l1.4-1.4M17.7 7.8l1.4-1.4" strokeLinecap="round" />
    </svg>
  )
}
function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3.5 19 6.5v5c0 5-3 8.2-7 9.5-4-1.3-7-4.5-7-9.5v-5Z" strokeLinejoin="round" />
      <path d="M9.2 12.2l2 2 3.6-3.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SuperOwnerLayout() {
  const { profile, signOut } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Sidebar - desktop */}
      <aside
        className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--line)' }}
      >
        <SidebarContent profile={profile} onNavigate={() => {}} />
      </aside>

      {/* Drawer - mobile/tablet */}
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

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Topbar */}
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

        {/* Page content */}
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
          Super Owner
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
        {MENU.map(({ to, label, end, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? '' : ''
              }`
            }
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
