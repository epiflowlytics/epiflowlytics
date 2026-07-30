import PageSkeleton from './PageSkeleton'

export default function MasterData() {
  return (
    <PageSkeleton
      title="Master Data Platform"
      description="Kelola daftar jenis poli/layanan standar dan kategori fasilitas kesehatan untuk seluruh instansi."
      sections={[
        { label: 'Jenis poli / layanan standar', rows: 5 },
        { label: 'Kategori fasilitas kesehatan', rows: 4 },
      ]}
    />
  )
}
