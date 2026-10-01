import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import DashboardShell from './pages/DashboardShell'
import SuperOwnerLayout from './layouts/SuperOwnerLayout'
import SuperOwnerDashboard from './pages/super-owner/Dashboard'
import ManajemenInstansi from './pages/super-owner/ManajemenInstansi'
import ManajemenAdmin from './pages/super-owner/ManajemenAdmin'
import Billing from './pages/super-owner/Billing'
import MasterData from './pages/super-owner/MasterData'
import AuditLog from './pages/super-owner/AuditLog'
import Pengaturan from './pages/super-owner/Pengaturan'
import ProfilKeamanan from './pages/super-owner/ProfilKeamanan'
import AdminInstansiLayout from './layouts/AdminInstansiLayout'
import AdminInstansiDashboard from './pages/admin-instansi/Dashboard'
import KelolaStaf from './pages/admin-instansi/KelolaStaf'
import KelolaPasien from './pages/admin-instansi/KelolaPasien'
import KelolaTarifRetribusi from './pages/admin-instansi/KelolaTarifRetribusi'
import ProfilInstansi from './pages/admin-instansi/ProfilInstansi'
import DashboardSistemInformasi from './pages/ruangan/klaster-1-manajemen/sistem-informasi/dashboard-sistem-informasi'
import DashboardPerawat from './pages/nakes/poli-umum/perawat/DashboardPerawat'
import DashboardDokter from './pages/nakes/poli-umum/dokter/DashboardDokter'
import DashboardKIA from './pages/ruangan/klaster-2-ibu-dan-anak/KIA/DashboardKIA'
import DashboardApoteker from './pages/nakes/apotek/DashboardApoteker'
import DashboardLab from './pages/nakes/lab/DashboardLab'
import DashboardEpid from './pages/nakes/epid/DashboardEpid'
import AntrianDisplay from './pages/nakes/loket/AntrianDisplay'
import DashboardPerawatIGD from './pages/nakes/igd/DashboardPerawatIGD'
import DashboardDokterIGD from './pages/nakes/igd/DashboardDokterIGD'
import KelolaRakIGD from './pages/nakes/igd/KelolaRakIGD'
import ProfilPuskesmas from './pages/nakes/skm/ProfilPuskesmas'
import SettingPuskesmas from './pages/nakes/skm/SettingPuskesmas'
import StatusAntrian from './pages/nakes/loket/StatusAntrian'
import HalamanConsentPublik from './pages/consent/HalamanConsentPublik'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />

          <Route
            path="/dashboard/super-owner"
            element={
              <ProtectedRoute allowedRoles={['super_owner']}>
                <SuperOwnerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<SuperOwnerDashboard />} />
            <Route path="instansi" element={<ManajemenInstansi />} />
            <Route path="admin" element={<ManajemenAdmin />} />
            <Route path="billing" element={<Billing />} />
            <Route path="master-data" element={<MasterData />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="pengaturan" element={<Pengaturan />} />
            <Route path="profil" element={<ProfilKeamanan />} />
          </Route>

          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute allowedRoles={['admin_instansi']}>
                <AdminInstansiLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminInstansiDashboard />} />
            <Route path="staf" element={<KelolaStaf />} />
            <Route path="pasien" element={<KelolaPasien />} />
            <Route path="tarif-retribusi" element={<KelolaTarifRetribusi />} />
            <Route path="profil" element={<ProfilInstansi />} />
          </Route>

          {/* Sistem Informasi — membaca dari folder sistem-informasi */}
          <Route
            path="/dashboard/ruangan/klaster-1-manajemen/sistem-informasi"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardSistemInformasi />
              </ProtectedRoute>
            }
          />

          {/* Perawat */}
          <Route
            path="/dashboard/nakes/perawat"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardPerawat />
              </ProtectedRoute>
            }
          />

          {/* Dokter */}
          <Route
            path="/dashboard/nakes/dokter"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardDokter />
              </ProtectedRoute>
            }
          />

          {/* KIA (Poli KIA / Bidan) — URL mengikuti struktur folder */}
          <Route
            path="/dashboard/ruangan/klaster-2-ibu-dan-anak/kia"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardKIA />
              </ProtectedRoute>
            }
          />

          {/* URL lama KIA — diarahkan ke URL baru agar link lama tidak rusak */}
          <Route
            path="/dashboard/nakes/bidan"
            element={<Navigate to="/dashboard/ruangan/klaster-2-ibu-dan-anak/kia" replace />}
          />

          {/* Perawat IGD */}
          <Route
            path="/dashboard/nakes/igd/perawat"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardPerawatIGD />
              </ProtectedRoute>
            }
          />

          {/* Dokter IGD */}
          <Route
            path="/dashboard/nakes/igd/dokter"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardDokterIGD />
              </ProtectedRoute>
            }
          />

          {/* Rak Rekam Medis - Perawat IGD */}
          <Route
            path="/dashboard/nakes/igd/rak"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <KelolaRakIGD />
              </ProtectedRoute>
            }
          />

          {/* Apoteker */}
          <Route
            path="/dashboard/nakes/apotek"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardApoteker />
              </ProtectedRoute>
            }
          />

          {/* Laboratorium */}
          <Route
            path="/dashboard/nakes/lab"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardLab />
              </ProtectedRoute>
            }
          />

          {/* Surveilans (Epid) */}
          <Route
            path="/dashboard/nakes/epid"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardEpid />
              </ProtectedRoute>
            }
          />

          {/* Layar TV Antrian */}
          <Route
            path="/dashboard/nakes/layar-antrian"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <AntrianDisplay />
              </ProtectedRoute>
            }
          />

          {/* ── Loket: Status Antrian Pasien (halaman publik dari scan QR) ── */}
          {/* Tidak butuh login. id = kunjungan.id (UUID), dicek via RLS Supabase. */}
          <Route
            path="/status-antrian/:id"
            element={<StatusAntrian />}
          />

          {/* ── General Consent: halaman publik pasien scan QR & TTD ── */}
          {/* Tidak butuh login. Diakses via token unik, dicek via RLS Supabase. */}
          <Route
            path="/consent/:token"
            element={<HalamanConsentPublik />}
          />

          {/* ── SKM: Profil Publik Puskesmas (generik, semua instansi) ── */}
          {/* Halaman publik — bisa diakses siapa saja tanpa login. Kode instansi via URL. */}
          <Route
            path="/puskesmas/:kode"
            element={<ProfilPuskesmas />}
          />

          {/* Halaman settings — hanya nakes / admin yang login. Akses per-instansi dicek di dalam komponen + RLS database. */}
          <Route
            path="/puskesmas/:kode/settings"
            element={
              <ProtectedRoute allowedRoles={['nakes', 'admin_instansi', 'super_owner']}>
                <SettingPuskesmas />
              </ProtectedRoute>
            }
          />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}