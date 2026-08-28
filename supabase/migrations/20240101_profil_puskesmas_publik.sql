-- ============================================================
-- Tabel: profil_puskesmas_publik
-- Menyimpan konten halaman profil publik setiap puskesmas.
-- Satu baris per puskesmas, diidentifikasi oleh kolom `kode`.
-- ============================================================

create table if not exists public.profil_puskesmas_publik (
  id               uuid primary key default gen_random_uuid(),
  kode             text unique not null,           -- slug unik, misal: 'batumalonro'

  -- ── Identitas ────────────────────────────────────────────
  nama             text not null default '',
  tagline          text not null default '',
  warna_primer     text not null default '#16a34a',
  warna_sekunder   text not null default '#064e3b',
  gambar_hero      text          default '',        -- URL gambar latar hero

  -- ── Kontak ───────────────────────────────────────────────
  alamat           text          default '',
  telepon          text          default '',
  email            text          default '',
  jam_operasional  text          default '',        -- multiline, satu baris = satu jadwal

  -- ── Kepala ───────────────────────────────────────────────
  kepala_puskesmas text          default '',
  nip_kepala       text          default '',

  -- ── Visi & Misi ──────────────────────────────────────────
  visi             text          default '',
  misi             text          default '',        -- multiline, satu baris = satu poin misi

  -- ── Konten JSON ──────────────────────────────────────────
  layanan          text          default '[]',      -- JSON array string: ["Poli Umum", ...]
  berita           text          default '[]',      -- JSON array: [{judul,ringkasan,tanggal}]

  -- ── Audit ────────────────────────────────────────────────
  updated_at       timestamptz   default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table public.profil_puskesmas_publik enable row level security;

-- Siapa saja (termasuk pengunjung tanpa login) bisa membaca.
create policy "Publik bisa membaca profil puskesmas"
  on public.profil_puskesmas_publik
  for select
  using (true);

-- Hanya user yang login (nakes / admin instansi / super_owner) bisa mengubah.
-- Sesuaikan kondisi ini jika ingin lebih ketat (misal: cek role dari tabel profiles).
create policy "User login bisa upsert profil puskesmas"
  on public.profil_puskesmas_publik
  for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ── Seed baris awal untuk Batumalonro ────────────────────────────────────────
-- Jalankan sekali; jika kode sudah ada, tidak melakukan apa-apa.
insert into public.profil_puskesmas_publik (kode, nama, tagline)
values (
  'batumalonro',
  'PUSKESMAS BATUMALONRO',
  'Melayani dengan Sepenuh Hati'
)
on conflict (kode) do nothing;
