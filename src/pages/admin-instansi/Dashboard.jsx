import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

export default function Dashboard() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({ jumlahPoli: 0, jumlahStaf: 0, jumlahNakes: 0, instansiNama: '' })

  useEffect(() => {
    if (profile?.instansi_id) {
      fetchStats(profile.instansi_id)
    }
  }, [profile?.instansi_id])

  async function fetchStats(instansiId) {
    setLoading(true)
    setError('')

    const [instansiRes, poliRes, stafRes] = await Promise.all([
      supabase.from('instansis').select('nama').eq('id', instansiId).single(),
      supabase.from('polis').select('id', { count: 'exact', head: true }).eq('instansi_id', instansiId),
      supabase
        .from('profiles')
        .select('id, role', { count: 'exact' })
        .eq('instansi_id', instansiId),
    ])

    if (instansiRes.error || poliRes.error || stafRes.error) {
      setError(
        'Gagal memuat data ringkasan: ' +
          (instansiRes.error?.message || poliRes.error?.message || stafRes.error?.message)
      )
      setLoading(false)
      return
    }

    const nakesCount = (stafRes.data ?? []).filter((p) => p.role === 'nakes').length

    setStats({
      jumlahPoli: poliRes.count ?? 0,
      jumlahStaf: stafRes.count ?? 0,
      jumlahNakes: nakesCount,
      instansiNama: instansiRes.data?.nama ?? '',
    })
    setLoading(false)
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Dashboard Ringkasan</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        {stats.instansiNama ? `Ringkasan untuk ${stats.instansiNama}` : 'Ringkasan instansi Anda'}
      </p>

      {error && (
        <div
          className="rounded-lg p-3 mb-5 text-sm"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Jumlah Poli" value={stats.jumlahPoli} loading={loading} />
        <StatCard label="Total Staf" value={stats.jumlahStaf} loading={loading} />
        <StatCard label="Tenaga Kesehatan (Nakes)" value={stats.jumlahNakes} loading={loading} />
      </div>
    </div>
  )
}

function StatCard({ label, value, loading }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      {loading ? (
        <div className="h-8 w-16 rounded-lg animate-pulse" style={{ background: 'var(--bg)' }} />
      ) : (
        <p className="text-2xl font-bold">{value}</p>
      )}
    </div>
  )
}
