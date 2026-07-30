import PageSkeleton from './PageSkeleton'

export default function Pengaturan() {
  return (
    <PageSkeleton
      title="Pengaturan Platform"
      description="Kelola template notifikasi/email dan kebijakan retensi data platform."
      sections={[
        { label: 'Template notifikasi & email', rows: 3 },
        { label: 'Kebijakan retensi data', rows: 2 },
      ]}
    />
  )
}
