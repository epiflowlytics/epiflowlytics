import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseNotConfigured } from '../lib/supabaseClient'

const ROLE_REDIRECT = {
  super_owner: '/dashboard/super-owner',
  admin_instansi: '/dashboard/admin',
}

// Redirect berdasarkan profesi untuk role nakes
const PROFESI_REDIRECT = {
  ADMINKES: '/dashboard/nakes/loket',
  PERAWAT: '/dashboard/nakes/perawat',
  DOKTER: '/dashboard/nakes/dokter',
  APOTEKER: '/dashboard/nakes/apotek',
}

function PulseLine() {
  return (
    <svg
      className="pulse-line"
      width="120"
      height="28"
      viewBox="0 0 120 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M0 14 H30 L38 4 L46 24 L54 14 H70 L76 8 L82 20 L88 14 H120"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Ikon mata terbuka (password terlihat)
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

// Ikon mata dicoret (password disembunyikan)
function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.6 20.6 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 7 11 7a20.6 20.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await signIn(email, password)

    if (error) {
      setLoading(false)
      setError('Email atau kata sandi salah. Coba lagi.')
      return
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('role, profesi')
      .eq('id', data.user.id)
      .single()

    setLoading(false)

    if (profileError || !profileRow?.role) {
      setError('Akun Anda belum memiliki peran yang valid. Hubungi admin.')
      return
    }

    // Jika role nakes, redirect berdasarkan profesi
    if (profileRow.role === 'nakes') {
      const tujuan = PROFESI_REDIRECT[profileRow.profesi?.toUpperCase()]
      if (!tujuan) {
        setError('Profesi akun Anda belum dikenali. Hubungi admin.')
        return
      }
      navigate(tujuan)
      return
    }

    // Role lain (super_owner, admin_instansi)
    const tujuan = ROLE_REDIRECT[profileRow.role] ?? '/'
    navigate(tujuan)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflowY: 'auto',
        background: 'var(--bg)',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        paddingTop: 'max(2rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      {supabaseNotConfigured && (
        <div
          className="fixed top-0 left-0 right-0 text-center text-xs py-2 px-4 z-10"
          style={{
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
          }}
        >
          Supabase belum dikonfigurasi. Isi <code>VITE_SUPABASE_URL</code> dan{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> di file <code>.env</code>, lalu restart{' '}
          <code>npm run dev</code>.
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '400px', boxSizing: 'border-box' }}>
        {/* wordmark */}
        <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
          <PulseLine />
          <h1 className="text-[1.5rem] sm:text-[1.7rem] font-extrabold tracking-tight mt-3 leading-none">
            <span style={{ color: 'var(--accent)' }}>Epiflow</span>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>lytics</span>
          </h1>
        </div>

        {/* kartu form */}
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: '0 1px 2px rgba(18,24,27,0.04), 0 8px 24px rgba(18,24,27,0.04)',
          }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@instansi.go.id"
                className="px-3.5 py-3 sm:py-2.5 rounded-lg outline-none transition-shadow w-full"
                style={{
                  border: '1px solid var(--line)',
                  background: '#fff',
                  color: 'var(--ink)',
                  fontSize: '16px',
                }}
                onFocus={(e) => (e.target.style.boxShadow = '0 0 0 3px var(--accent-soft)')}
                onBlur={(e) => (e.target.style.boxShadow = 'none')}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Kata sandi</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="px-3.5 py-3 sm:py-2.5 rounded-lg outline-none transition-shadow w-full"
                  style={{
                    border: '1px solid var(--line)',
                    background: '#fff',
                    color: 'var(--ink)',
                    fontSize: '16px',
                    paddingRight: '2.75rem',
                  }}
                  onFocus={(e) => (e.target.style.boxShadow = '0 0 0 3px var(--accent-soft)')}
                  onBlur={(e) => (e.target.style.boxShadow = 'none')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  tabIndex={-1}
                  className="touch-manipulation"
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>

            {error && (
              <p
                className="text-sm px-3 py-2 rounded-lg"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 py-3 sm:py-2.5 rounded-lg font-semibold text-sm text-white transition-opacity disabled:opacity-60 active:opacity-80 touch-manipulation"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? 'Memproses…' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}