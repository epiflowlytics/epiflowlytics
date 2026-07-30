import { useEffect, useState } from 'react'
import PageSkeleton from './PageSkeleton'
import { supabase } from '../../lib/supabaseClient'

const BULAN_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const [totalInstansi, setTotalInstansi] = useState(0)
  const [instansiAktif, setInstansiAktif] = useState(0)
  const [instansiBaruBulanIni, setInstansiBaruBulanIni] = useState(0)

  const [totalAdmin, setTotalAdmin] = useState(0)
  const [adminAktif, setAdminAktif] = useState(0)

  const [growthData, setGrowthData] = useState([]) // [{ label: 'Feb', count: 3 }, ...]
  const [recentActivity, setRecentActivity] = useState([]) // [{ id, type, text, created_at }]

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    setLoading(true)
    setErrorMsg('')

    try {
      const [instansiRes, adminRes] = await Promise.all([
        supabase.from('instansis').select('id, nama, aktif, created_at'),
        supabase
          .from('profiles')
          .select('id, nama_lengkap, is_active, created_at')
          .eq('role', 'admin_instansi'),
      ])

      if (instansiRes.error) throw instansiRes.error
      if (adminRes.error) throw adminRes.error

      const instansiList = instansiRes.data ?? []
      const adminList = adminRes.data ?? []

      // --- Statistik instansi ---
      setTotalInstansi(instansiList.length)
      setInstansiAktif(instansiList.filter((i) => i.aktif).length)

      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      setInstansiBaruBulanIni(
        instansiList.filter((i) => i.created_at && new Date(i.created_at) >= startOfMonth).length
      )

      // --- Statistik admin ---
      setTotalAdmin(adminList.length)
      setAdminAktif(adminList.filter((a) => a.is_active).length)

      // --- Grafik pertumbuhan instansi (6 bulan terakhir) ---
      const months = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push({ year: d.getFullYear(), month: d.getMonth() })
      }
      const growth = months.map(({ year, month }) => {
        const count = instansiList.filter((item) => {
          if (!item.created_at) return false
          const d = new Date(item.created_at)
          return d.getFullYear() === year && d.getMonth() === month
        }).length
        return { label: BULAN_LABEL[month], count }
      })
      setGrowthData(growth)

      // --- Aktivitas terbaru (gabungan instansi baru + admin baru, urut terbaru) ---
      const instansiEvents = instansiList
        .filter((i) => i.created_at)
        .map((i) => ({
          id: `instansi-${i.id}`,
          text: `Instansi "${i.nama}" ditambahkan`,
          created_at: i.created_at,
        }))
      const adminEvents = adminList
        .filter((a) => a.created_at)
        .map((a) => ({
          id: `admin-${a.id}`,
          text: `Akun admin "${a.nama_lengkap}" dibuat`,
          created_at: a.created_at,
        }))

      const merged = [...instansiEvents, ...adminEvents]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 8)
      setRecentActivity(merged)
    } catch (err) {
      setErrorMsg('Gagal memuat data dashboard: ' + (err?.message ?? 'Terjadi kesalahan tak terduga.'))
    } finally {
      setLoading(false)
    }
  }

  function formatWaktu(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const maxGrowth = Math.max(1, ...growthData.map((g) => g.count))

  return (
    <PageSkeleton
      title="Dashboard Ringkasan"
      description="Ringkasan total instansi, admin instansi, dan pertumbuhan platform."
      sections={[
        {
          label: 'Statistik utama',
          content: loading ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
              Memuat statistik...
            </p>
          ) : errorMsg ? (
            <p className="text-sm py-6 text-center" style={{ color: '#dc2626' }}>
              {errorMsg}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Instansi" value={totalInstansi} sub={`${instansiAktif} aktif`} />
              <StatCard label="Admin Instansi" value={totalAdmin} sub={`${adminAktif} aktif`} />
              <StatCard label="Instansi Baru" value={instansiBaruBulanIni} sub="bulan ini" />
              <StatCard label="Status Langganan" value="—" sub="Belum tersedia" muted />
            </div>
          ),
        },
        {
          label: 'Grafik pertumbuhan instansi (6 bulan terakhir)',
          content: loading ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
              Memuat grafik...
            </p>
          ) : errorMsg ? (
            <p className="text-sm py-6 text-center" style={{ color: '#dc2626' }}>
              {errorMsg}
            </p>
          ) : (
            <div className="flex items-end gap-3 h-40 pt-2">
              {growthData.map((g) => (
                <div key={g.label} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    {g.count}
                  </span>
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${(g.count / maxGrowth) * 100}%`,
                      minHeight: g.count > 0 ? '4px' : '2px',
                      background: g.count > 0 ? 'var(--primary, #2563eb)' : 'var(--line)',
                    }}
                  />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {g.label}
                  </span>
                </div>
              ))}
            </div>
          ),
        },
        {
          label: 'Aktivitas terbaru',
          content: loading ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
              Memuat aktivitas...
            </p>
          ) : errorMsg ? (
            <p className="text-sm py-6 text-center" style={{ color: '#dc2626' }}>
              {errorMsg}
            </p>
          ) : recentActivity.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
              Belum ada aktivitas.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentActivity.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                >
                  <p className="text-sm truncate">{ev.text}</p>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>
                    {formatWaktu(ev.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ),
        },
      ]}
    />
  )
}

function StatCard({ label, value, sub, muted }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: muted ? 'var(--muted)' : 'inherit' }}>
        {value}
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
        {sub}
      </p>
    </div>
  )
}
