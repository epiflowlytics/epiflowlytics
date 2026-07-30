import PageSkeleton from './PageSkeleton'

export default function Billing() {
  return (
    <PageSkeleton
      title="Langganan & Billing"
      description="Kelola paket harga, status langganan per instansi, riwayat pembayaran, dan override manual."
      sections={[
        { label: 'Paket harga', rows: 3 },
        { label: 'Status langganan instansi', rows: 6 },
        { label: 'Riwayat pembayaran / invoice', rows: 5 },
      ]}
    />
  )
}
