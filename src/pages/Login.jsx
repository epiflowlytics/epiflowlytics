import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseNotConfigured } from '../lib/supabaseClient'

import epuskesmasLogo from '../assets/logos/epuskesmas.png'
import pcareBpjsLogo from '../assets/logos/pcare-bpjs.png'
import allrecordTc19Logo from '../assets/logos/allrecord-tc19.png'
import asikLogo from '../assets/logos/asik.png'
import smileLogo from '../assets/logos/smile.png'
import skmLogo from '../assets/logos/skm.png'

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

// Daftar aplikasi lain yang ditautkan di bawah form login Epiflowlytics.
// APPS[0] adalah aplikasi utama halaman ini (Epiflowlytics, diproses via Supabase).
// Aplikasi setelahnya hanya berupa link keluar: klik logo -> buka halaman login
// asli aplikasi tsb di tab baru, tanpa membawa data apa pun dari form ini.
const APPS = [
  {
    id: 'epiflowlytics',
    name: 'Epiflowlytics',
  },
  {
    id: 'epuskesmas',
    name: 'e-Puskesmas',
    logo: epuskesmasLogo,
    externalUrl: 'https://gowa.epuskesmas.id',
  },
  {
    id: 'pcare-bpjs',
    name: 'PCare BPJS',
    logo: pcareBpjsLogo,
    externalUrl: 'https://pcarejkn.bpjs-kesehatan.go.id/eclaim/Login',
  },
  {
    id: 'sehat-indonesiaku',
    name: 'ASIK',
    logo: asikLogo,
    externalUrl: 'https://sehatindonesiaku.kemkes.go.id/auth/login',
  },
  {
    id: 'smile',
    name: 'SMILE',
    logo: smileLogo,
    externalUrl: 'https://smile.kemkes.go.id/',
  },
  {
    id: 'skm',
    name: 'SKM',
    logo: skmLogo,
    externalUrl: 'https://skm.go.id/sign-in',
  },
  // --- aplikasi Kemenkes lain (logo Kemenkes bersama, diurutkan A-Z) ---
  {
    id: 'allrecord-tc19',
    name: 'AllRecord',
    logo: allrecordTc19Logo,
    externalUrl: 'https://allrecord-tc19.kemkes.go.id',
  },
  {
    id: 'aspak',
    name: 'ASPAK',
    logo: allrecordTc19Logo,
    externalUrl: 'https://aspak.kemkes.go.id/',
  },
  {
    id: 'siha',
    name: 'SIHA',
    logo: allrecordTc19Logo,
    externalUrl: 'https://siha.kemkes.go.id',
  },
  {
    id: 'sigizi-kesga',
    name: 'SIGIZI',
    logo: allrecordTc19Logo,
    externalUrl: 'https://sigizikesga.kemkes.go.id/',
  },
  {
    id: 'sihepi',
    name: 'SIHEPI',
    logo: allrecordTc19Logo,
    externalUrl: 'https://sihepi.kemkes.go.id',
  },
  {
    id: 'akun-yankes',
    name: 'SIRS',
    logo: allrecordTc19Logo,
    externalUrl: 'https://akun-yankes.kemkes.go.id',
  },
  {
    id: 'sismal',
    name: 'SISMAL',
    logo: allrecordTc19Logo,
    externalUrl: 'https://sismal.kemkes.go.id',
  },
  {
    id: 'sisrute',
    name: 'SISRUTE',
    logo: allrecordTc19Logo,
    externalUrl: 'https://sisrute.kemkes.go.id',
  },
  {
    id: 'sitb',
    name: 'SITB',
    logo: allrecordTc19Logo,
    externalUrl: 'https://www.sitb.id',
  },
  {
    id: 'skdr',
    name: 'SKDR',
    logo: allrecordTc19Logo,
    externalUrl: 'https://skdr.surveilans.org/auth',
  },
  // Tambahkan aplikasi lain di sini dengan pola yang sama:
  // 1. Taruh file logo di src/assets/logos/nama-app.png
  // 2. import namaAppLogo from '../assets/logos/nama-app.png' di atas
  // 3. Tambahkan entri berikut:
  // {
  //   id: 'app-lain',
  //   name: 'Nama Aplikasi',
  //   logo: namaAppLogo,
  //   externalUrl: 'https://domain-aplikasi-lain.tld',
  // },
]

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

// Ikon kaca pembesar (pencarian)
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [appSearch, setAppSearch] = useState('')
  const appSearchInputRef = useRef(null)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  // Halaman ini hanya menampilkan form login Epiflowlytics.
  // Aplikasi lain (mis. e-Puskesmas) langsung membuka domain aslinya saat logonya diklik.
  const mainApp = APPS[0]

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

  // Aplikasi lain (selain aplikasi utama), difilter berdasarkan pencarian nama
  const otherApps = APPS.filter((app) => app.id !== mainApp.id)
  const filteredApps = otherApps.filter((app) =>
    app.name.toLowerCase().includes(appSearch.trim().toLowerCase())
  )

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
        {/* wordmark Epiflowlytics — selalu tampil, ini adalah login utama halaman ini */}
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

        {/* daftar aplikasi lain — klik logo langsung membuka halaman login asli aplikasi tsb */}
        {otherApps.length > 0 && (
          <div className="flex flex-col items-center mt-6 sm:mt-8">
            <span className="text-xs font-medium mb-3" style={{ color: 'var(--muted)' }}>
              Aplikasi lain
            </span>

            <div style={{ width: '100%', maxWidth: '280px', marginBottom: '1rem', position: 'relative' }}>
              <input
                ref={appSearchInputRef}
                type="text"
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                placeholder="Cari aplikasi…"
                className="px-3.5 py-2.5 rounded-lg outline-none transition-shadow w-full"
                style={{
                  border: '1px solid var(--line)',
                  background: '#fff',
                  color: 'var(--ink)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  paddingRight: '2.5rem',
                }}
                onFocus={(e) => (e.target.style.boxShadow = '0 0 0 3px var(--accent-soft)')}
                onBlur={(e) => (e.target.style.boxShadow = 'none')}
              />
              <button
                type="button"
                onClick={() => appSearchInputRef.current?.focus()}
                aria-label="Cari aplikasi"
                className="touch-manipulation"
                style={{
                  position: 'absolute',
                  right: '0.65rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  padding: '0.15rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                <SearchIcon />
              </button>
            </div>

            {filteredApps.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))',
                  gap: '1rem 0.5rem',
                  width: '100%',
                  maxWidth: '360px',
                }}
              >
                {filteredApps.map((app) => (
                  <a
                    key={app.id}
                    href={app.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 touch-manipulation"
                    style={{ textDecoration: 'none', padding: '0.25rem' }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '40px',
                        padding: '0 0.5rem',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: '#fff',
                        boxSizing: 'border-box',
                      }}
                    >
                      <img
                        src={app.logo}
                        alt={app.name}
                        style={{ maxHeight: '22px', maxWidth: '100%', width: 'auto', objectFit: 'contain' }}
                      />
                    </span>
                    <span
                      className="text-xs text-center"
                      style={{
                        color: 'var(--muted)',
                        fontWeight: 500,
                        lineHeight: 1.2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {app.name}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Tidak ada aplikasi yang cocok.
              </p>
            )}
          </div>
        )}

        {/* footer copyright */}
        <div className="flex items-center justify-center mt-8 sm:mt-10">
          <span
            className="text-xs tracking-wide"
            style={{ color: 'var(--muted)' }}
          >
            &copy; 2026 Matandre Indonesia. All rights reserved.
          </span>
        </div>
      </div>
    </div>
  )
}