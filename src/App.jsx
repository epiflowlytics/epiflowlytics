import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
import ProfilInstansi from './pages/admin-instansi/ProfilInstansi'
import DashboardLoket from './pages/nakes/loket/DashboardLoket'
import DashboardPerawat from './pages/nakes/poli-umum/perawat/DashboardPerawat'
import DashboardDokter from './pages/nakes/poli-umum/dokter/DashboardDokter'
import DashboardApoteker from './pages/nakes/apotek/DashboardApoteker'
import AntrianDisplay from './pages/nakes/loket/AntrianDisplay'

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
            <Route path="profil" element={<ProfilInstansi />} />
          </Route>

          {/* Loket */}
          <Route
            path="/dashboard/nakes/loket"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardLoket />
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

          {/* Apoteker */}
          <Route
            path="/dashboard/nakes/apotek"
            element={
              <ProtectedRoute allowedRoles={['nakes']}>
                <DashboardApoteker />
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

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
