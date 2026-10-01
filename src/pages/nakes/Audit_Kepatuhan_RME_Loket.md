# Audit Kepatuhan Aplikasi Loket terhadap Permenkes No. 24 Tahun 2022 (RME)

**Ruang lingkup audit:** 21 file modul loket (`DashboardLoket.jsx`, `ModalKelolaRak.jsx`, `FormTambahPasienRak.jsx`, `TabelRiwayatPemeriksaan.jsx`, `RiwayatPendaftaran.jsx`, `ModalRetribusi.jsx`, `StatusAntrian.jsx`, `CekAntrian.jsx`, `AntrianDisplay.jsx`, `PanggilAntrian.jsx`, `DatePickerLahir.jsx`, dan 10 file `utils/`).

**Catatan penting:** Audit ini hanya mencakup kode frontend (React) yang diupload. Konfigurasi Row Level Security (RLS) di Supabase, kebijakan backup database, dan `AuthContext.jsx` (sistem login) tidak termasuk dalam file yang diperiksa — beberapa temuan di bawah perlu dikonfirmasi juga dari sisi backend/database.

---

## Ringkasan Cepat

| Area (Permenkes 24/2022) | Status | Prioritas |
|---|---|---|
| Kerahasiaan (akses data medis) | 🟡 Sebagian baik | Sedang |
| Integritas (audit trail, histori perubahan) | 🔴 Tidak ada | **Tinggi** |
| Ketersediaan (retensi, soft delete) | 🔴 Berisiko | **Tinggi** |
| Integrasi SATU SEHAT | 🔴 Tidak ditemukan | **Tinggi** |
| Standarisasi data (ICD-10, dst) | 🟡 Sebagian | Sedang |

---

## 1. Integritas Data — 🔴 Prioritas Tertinggi

### 1.1 Hard delete pada data rekam medis pasien
Di `DashboardLoket.jsx` (baris ~355–390), penghapusan pasien memakai `.delete()` langsung ke tabel `pasien`, dan sebelumnya juga menghapus seluruh riwayat `kunjungan` (pemeriksaan) miliknya secara **permanen**:

```js
await supabase.from('kunjungan').delete().eq('pasien_id', pasienId)
await supabase.from('pasien').delete().eq('id', pasienId)
```

Konfirmasi hanya lewat `window.confirm()` — tidak ada catatan siapa yang menghapus, kapan, atau alasannya.

**Kenapa ini masalah:** Permenkes 24/2022 mewajibkan penyelenggaraan RME yang menjamin *keutuhan* (integritas) data. Rekam medis, termasuk riwayat pemeriksaan, punya kewajiban masa simpan (retensi) dan tidak boleh hilang tanpa jejak. Hard delete berarti begitu data terhapus, tidak ada cara mengembalikan atau membuktikan bahwa data itu pernah ada — ini juga berisiko dari sisi hukum jika suatu saat dibutuhkan sebagai bukti (audit BPJS, sengketa medis, dll).

**Rekomendasi:**
- Ganti seluruh alur hapus pasien/kunjungan/berkas menjadi **soft delete**: tambah kolom `deleted_at` (timestamp, nullable) dan `deleted_by` (user id), lalu semua query `SELECT` difilter `WHERE deleted_at IS NULL`.
- Simpan log siapa & kapan penghapusan terjadi (lihat 1.2).

### 1.2 Tidak ada audit trail / log perubahan sama sekali
Pencarian menyeluruh terhadap kata kunci `log`, `audit`, `riwayat_perubahan`, `created_by`, `updated_by` di seluruh 21 file **tidak menemukan satupun hasil**. Tabel `pasien` dan `kunjungan` hanya punya `created_at`, tidak ada `updated_at`, `updated_by`, atau tabel log terpisah yang mencatat histori perubahan (siapa mengubah field apa, kapan, nilai sebelum/sesudah).

**Kenapa ini masalah:** Pasal soal keamanan RME menuntut sistem yang bisa "mencatat setiap perubahan dan menjaga akurasi data" — ini standar minimum untuk sistem rekam medis apapun, elektronik atau kertas (kertas punya paraf & tanggal setiap koreksi; sistem elektronik harus setara atau lebih baik).

**Rekomendasi:**
- Tambah kolom `updated_at`, `updated_by` di tabel `pasien` dan `kunjungan`.
- Idealnya, buat tabel `audit_log` (atau pakai trigger Postgres `AFTER UPDATE/DELETE` di Supabase) yang mencatat: tabel, id record, user yang melakukan, waktu, dan perubahan (before/after dalam JSON). Ini bisa dikerjakan di level database (trigger), tidak perlu ubah banyak kode frontend.

### 1.3 Berkas RM fisik (hasil scan) juga hard delete
`TabelRiwayatPemeriksaan.jsx` baris 223–231: hapus file dari Supabase Storage **dan** baris database sekaligus, permanen, hanya dengan konfirmasi browser.

**Rekomendasi:** sama seperti 1.1 — soft delete dulu di tabel `berkas_rm`, baru dijadwalkan hapus fisik dari storage setelah periode retensi tertentu (misalnya via cron job terpisah), bukan seketika saat user klik hapus.

---

## 2. Integrasi SATU SEHAT — 🔴 Tidak Ditemukan

Pencarian kata kunci `satusehat`, `satu sehat`, `FHIR`, `fhir` di seluruh kode: **nihil**.

**Kenapa ini masalah:** Permenkes 24/2022 Pasal 24 secara eksplisit mewajibkan RME yang disimpan fasyankes terhubung dengan platform SATU SEHAT, termasuk pengiriman data untuk rujukan melalui platform tersebut. Ini bukan sekadar "bagus untuk dimiliki" — ini kewajiban regulasi, dan sudah lewat batas waktu wajib RME (31 Desember 2023).

**Rekomendasi:**
- Ini pekerjaan besar (perlu integrasi API SATUSEHAT resmi, mapping data ke standar FHIR), bukan sekadar tambal kode. Perlu direncanakan sebagai proyek terpisah, kemungkinan melibatkan tim/vendor yang familiar dengan SATUSEHAT.
- Langkah awal yang realistis: cek apakah instansi kamu (puskesmas/klinik) sudah punya akses SATUSEHAT Platform dan credential-nya. Modul loket ini baru mencakup pendaftaran & antrian — integrasi SATUSEHAT biasanya dimulai dari modul kunjungan/pemeriksaan (data yang benar-benar dikirim: kunjungan, diagnosis, prosedur).
- Kalau instansi kamu sudah pakai aplikasi lain untuk SATUSEHAT (mis. SIMPUS/e-Puskesmas yang disebut di kode kamu sebagai link eksternal), kemungkinan integrasi SATUSEHAT sudah ditangani di sana, dan loket ini hanya front-end pendaftaran. Ini perlu dikonfirmasi — kalau memang begitu, catat secara resmi supaya jelas tanggung jawab modul mana yang menangani kewajiban ini.

---

## 3. Standarisasi Data — 🟡 Sebagian

### 3.1 Kode ICD-10 disimpan sebagai teks bebas, tanpa validasi
`icd_x` dan `kode_icd` di `DashboardLoket.jsx` dan `diagnosaHelpers.js` disimpan dan ditampilkan sebagai string biasa, tanpa validasi terhadap master data ICD-10 resmi. Artinya petugas bisa mengetik kode apapun (termasuk salah ketik) dan tersimpan begitu saja.

**Rekomendasi:** Tambahkan dropdown/autocomplete dari tabel master ICD-10 (bisa diimpor dari daftar resmi WHO/Kemenkes) alih-alih input teks bebas. Ini juga akan sangat membantu ketika nanti terintegrasi SATUSEHAT, karena SATUSEHAT mensyaratkan kode diagnosis yang valid dan terstandar.

### 3.2 Hal yang sudah baik
- Validasi NIK 16 digit numerik sudah ada (`pasienHelpers.js`).
- Field agama/pendidikan/status perkawinan sekarang tersimpan dan tampil konsisten (setelah perbaikan sebelumnya).

---

## 4. Kerahasiaan & Kontrol Akses — 🟡 Sebagian Baik

### 4.1 Hal yang sudah baik
- **Halaman publik `StatusAntrian.jsx` sudah dipisah dengan benar** dari data medis: menggunakan VIEW `status_antrian_publik` yang hanya expose kolom non-sensitif (nomor antrian, status, nama), bukan tabel `kunjungan` asli yang berisi anamnesa/diagnosa/therapy. Ini praktik yang tepat dan patut dipertahankan.
- Data di-scope per `instansi_id` di hampir semua query (multi-tenant terisolasi antar instansi/puskesmas).

### 4.2 Yang perlu dicek lebih lanjut (di luar kode yang diupload)
- `AuthContext.jsx` tidak termasuk dalam file yang diupload, jadi saya tidak bisa memastikan apakah ada pembatasan **hak akses berjenjang** (role-based access) di level aplikasi — misalnya, apakah petugas loket biasa punya akses yang sama dengan admin untuk menghapus data pasien atau melihat semua data medis, atau ada pemisahan peran yang jelas.
- Kebijakan **Row Level Security (RLS)** di Supabase untuk tabel `pasien` dan `kunjungan` tidak bisa diverifikasi dari kode frontend saja — ini perlu dicek langsung di dashboard Supabase.
- Tidak ditemukan mekanisme *session timeout* otomatis di kode yang diupload — perlu dicek di `AuthContext.jsx`.

**Rekomendasi:** Upload `AuthContext.jsx` dan konfigurasi RLS Supabase (bisa export policy dari dashboard) kalau ingin audit bagian ini lebih detail.

---

## 5. Ketersediaan Data — 🟡 Tidak Bisa Diverifikasi dari Kode

Backup dan disaster recovery biasanya jadi tanggung jawab infrastruktur (Supabase), bukan kode aplikasi, jadi tidak ditemukan (dan memang tidak diharapkan ditemukan) di kode frontend.

**Rekomendasi:** Konfirmasi manual di dashboard Supabase project kamu:
- Apakah Point-in-Time Recovery (PITR) aktif?
- Apakah ada backup terjadwal otomatis, dan berapa lama retensinya?
- Plan Supabase yang dipakai (Free tier punya backup lebih terbatas dibanding Pro).

---

## Prioritas Perbaikan (Ringkasan Tindakan)

1. **Segera:** Ganti hard delete → soft delete untuk `pasien`, `kunjungan`, `berkas_rm` (dampak besar, perubahan kode relatif kecil).
2. **Segera:** Tambah `updated_at`/`updated_by`, idealnya tabel/trigger audit log (bisa dikerjakan di level database Supabase tanpa mengubah banyak kode React).
3. **Rencanakan sebagai proyek terpisah:** Integrasi SATUSEHAT — ini kewajiban regulasi yang sudah lewat tenggat, perlu prioritas tinggi meski butuh waktu lebih lama untuk dikerjakan.
4. **Menengah:** Validasi kode ICD-10 lewat master data, bukan teks bebas.
5. **Perlu file tambahan untuk verifikasi:** `AuthContext.jsx` dan kebijakan RLS Supabase, untuk memastikan kontrol akses berjenjang.

---

*Catatan: Ini adalah audit teknis berdasarkan kode yang tersedia, bukan opini hukum. Untuk kepastian hukum penuh terhadap kewajiban Permenkes 24/2022 (termasuk sanksi administratif), sebaiknya dikonsultasikan juga dengan bagian legal/kepatuhan dinas kesehatan setempat.*
