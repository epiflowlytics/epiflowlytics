import PageSkeleton from './PageSkeleton'

export default function AuditLog() {
  return (
    <PageSkeleton
      title="Log Aktivitas / Audit Trail"
      description="Histori aksi penting pada platform — pembuatan/penghapusan akun, perubahan data instansi, dan lainnya."
      sections={[
        { label: 'Filter log', rows: 1 },
        { label: 'Riwayat aktivitas', rows: 8 },
      ]}
    />
  )
}
