import { useAuth } from '../../context/AuthContext'
import PageSkeleton from './PageSkeleton'

export default function ProfilKeamanan() {
  const { profile } = useAuth()

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Profil & Keamanan Akun</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Ganti kata sandi dan aktifkan 2FA — akses Super Owner bersifat paling sensitif.
      </p>

      <div className="flex flex-col gap-5">
        <div
          className="rounded-xl p-5 sm:p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
        >
          <p className="text-sm font-semibold mb-3">Data akun</p>
          <p className="text-sm mb-1">
            <span className="font-semibold">Nama:</span> {profile?.nama_lengkap ?? '—'}
          </p>
          <p className="text-sm">
            <span className="font-semibold">Email:</span> {profile?.email ?? '—'}
          </p>
        </div>

        <div
          className="rounded-xl p-5 sm:p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
        >
          <p className="text-sm font-semibold mb-3">Ganti kata sandi</p>
          <div className="flex flex-col gap-2">
            <div className="h-9 rounded-lg animate-pulse" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
            <div className="h-9 rounded-lg animate-pulse" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
          </div>
        </div>

        <div
          className="rounded-xl p-5 sm:p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
        >
          <p className="text-sm font-semibold mb-3">Autentikasi dua faktor (2FA)</p>
          <div className="h-9 rounded-lg animate-pulse" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
        </div>
      </div>
    </div>
  )
}
