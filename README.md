# Epiflowlytics (starter)

Starter aplikasi web multi-tenant untuk puskesmas/instansi kesehatan, dimulai dari
halaman login dengan 3 tingkat peran. Stack: **React + Vite + Tailwind CSS v4**,
**Supabase** (Auth + Postgres + Row Level Security), deploy ke **Cloudflare Pages**.

## Arsitektur peran

```
super_owner        → pemilik platform, lintas-instansi
  └── admin_instansi → admin 1 puskesmas/instansi (kelola poli & staf instansinya)
        └── nakes     → tenaga kesehatan dalam 1 poli (dokter, perawat, bidan, analis, dst)
```

Akun **tidak** dibuat lewat pendaftaran mandiri (self sign-up). Alurnya top-down:
- `super_owner` membuat akun & data untuk setiap `instansi` baru, termasuk akun
  `admin_instansi` pertamanya.
- `admin_instansi` membuat `poli` di instansinya, lalu membuat akun `nakes`
  (dokter/perawat/bidan/analis/dll) dan menempatkannya ke poli tertentu.
- `nakes` login dan hanya melihat data instansi & poli tempat ia ditugaskan.

Ini diimplementasikan dengan tabel `profiles` (1:1 dengan `auth.users` bawaan
Supabase) yang punya kolom `role`, `instansi_id`, `poli_id`, `profesi`. Batasan akses
antar peran ditegakkan lewat **Row Level Security (RLS)** di database — bukan hanya
di frontend — lihat `supabase/schema.sql`.

## Struktur project

```
src/
  pages/Login.jsx          halaman login (pemilihan "loket" peran + form)
  pages/DashboardShell.jsx placeholder dasbor, 1 komponen dipakai utk 3 role
  context/AuthContext.jsx  session Supabase + data profil (role) global
  components/ProtectedRoute.jsx  guard route berdasar role
  lib/supabaseClient.js    inisialisasi client Supabase
supabase/schema.sql        skema tabel, enum role, RLS policy, trigger
```

## 1. Setup Supabase

1. Buat project baru di https://supabase.com.
2. Buka **SQL Editor** → jalankan seluruh isi `supabase/schema.sql`.
   Ini akan membuat tabel `instansis`, `polis`, `profiles`, enum `user_role`,
   RLS policy, dan trigger otomatis yang membuat baris `profiles` setiap ada user
   auth baru (default role `nakes` — ubah manual jadi `admin_instansi` /
   `super_owner` sesuai kebutuhan lewat SQL editor atau dasbor admin yang nanti
   Anda bangun).
3. Buat user pertama (super owner) lewat **Authentication → Users → Add user**,
   lalu di SQL editor jalankan:
   ```sql
   update profiles set role = 'super_owner' where email = 'owner@anda.com';
   ```
4. Salin **Project URL** dan **anon public key** dari **Settings → API**.

## 2. Setup environment lokal

```bash
cp .env.example .env
# isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env

npm install
npm run dev
```

## 3. Deploy ke Cloudflare Pages

1. Push project ini ke sebuah repo GitHub.
2. Di Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
4. Tambahkan environment variables di Cloudflare Pages (**Settings → Environment
   variables**): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. File `public/_redirects` sudah disiapkan agar routing React Router (SPA)
   tidak 404 saat refresh di halaman selain `/`.

## Langkah lanjutan yang disarankan

- Bangun dasbor **Super Owner**: CRUD instansi, buat admin_instansi pertama.
- Bangun dasbor **Admin Instansi**: CRUD poli, CRUD akun nakes (buat lewat
  Supabase Admin API / Edge Function karena butuh service role key, jangan
  dipanggil dari client).
- Modul per-poli sesuai kebutuhan puskesmas: rekam medis, antrian, jadwal,
  laporan, dsb.
- Pertimbangkan menambah kolom `nik` / `no_pegawai` di `profiles` bila login
  nakes ingin memakai nomor pegawai selain email.
