-- ============================================================
-- SKEMA DATABASE — Aplikasi Puskesmas (multi-tenant)
-- Jalankan di Supabase SQL Editor (project baru)
-- ============================================================

-- 1. ENUM PERAN
-- super_owner    : pemilik platform, akses ke seluruh instansi
-- admin_instansi : admin satu puskesmas/instansi (mengelola poli & staf)
-- nakes          : tenaga kesehatan di dalam satu poli (dokter, perawat, bidan, analis, dll)
create type user_role as enum ('super_owner', 'admin_instansi', 'nakes');

-- 2. TABEL INSTANSI (puskesmas / klinik / rumah sakit, dll — dibuat generik)
create table instansis (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  jenis text not null default 'puskesmas', -- puskesmas, klinik, rs, dll
  kota text,
  alamat text,
  telepon text,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. TABEL POLI (unit layanan di dalam satu instansi: Poli Umum, KIA, Gigi, Lab, dst)
create table polis (
  id uuid primary key default gen_random_uuid(),
  instansi_id uuid not null references instansis(id) on delete cascade,
  nama_poli text not null,
  created_at timestamptz not null default now()
);

-- 4. TABEL PROFIL (1:1 dengan auth.users bawaan Supabase)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'nakes',
  nama_lengkap text not null,
  email text not null,
  instansi_id uuid references instansis(id) on delete set null, -- null untuk super_owner
  poli_id uuid references polis(id) on delete set null,          -- hanya diisi untuk role nakes
  profesi text, -- 'dokter', 'perawat', 'bidan', 'analis', 'apoteker', dll (bebas isi untuk role nakes)
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Index bantu query per-instansi (dipakai terus oleh admin_instansi)
create index idx_profiles_instansi on profiles(instansi_id);
create index idx_polis_instansi on polis(instansi_id);

-- ============================================================
-- 5. HELPER FUNCTIONS (dipakai di RLS policy, hindari duplikasi query)
-- ============================================================
create or replace function my_role() returns user_role
language sql stable security definer as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function my_instansi_id() returns uuid
language sql stable security definer as $$
  select instansi_id from profiles where id = auth.uid();
$$;

-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================
alter table instansis enable row level security;
alter table polis enable row level security;
alter table profiles enable row level security;

-- --- INSTANSIS ---
create policy "super_owner full access instansis"
  on instansis for all
  using (my_role() = 'super_owner')
  with check (my_role() = 'super_owner');

create policy "admin & nakes read instansi sendiri"
  on instansis for select
  using (id = my_instansi_id());

-- --- POLIS ---
create policy "super_owner full access polis"
  on polis for all
  using (my_role() = 'super_owner')
  with check (my_role() = 'super_owner');

create policy "admin_instansi kelola poli miliknya"
  on polis for all
  using (my_role() = 'admin_instansi' and instansi_id = my_instansi_id())
  with check (my_role() = 'admin_instansi' and instansi_id = my_instansi_id());

create policy "nakes baca poli di instansinya"
  on polis for select
  using (instansi_id = my_instansi_id());

-- --- PROFILES ---
create policy "super_owner full access profiles"
  on profiles for all
  using (my_role() = 'super_owner')
  with check (my_role() = 'super_owner');

create policy "admin_instansi kelola staf di instansinya"
  on profiles for all
  using (my_role() = 'admin_instansi' and instansi_id = my_instansi_id())
  with check (my_role() = 'admin_instansi' and instansi_id = my_instansi_id());

create policy "user baca & ubah profil sendiri"
  on profiles for select
  using (id = auth.uid());

create policy "user update profil sendiri (terbatas)"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- 7. TRIGGER: auto-buat baris profiles saat ada user baru di auth.users
--    (role default 'nakes' -- admin/super_owner mengubahnya manual setelahnya,
--     atau lewat dashboard admin yang membuat akun langsung dengan role terkait)
-- ============================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, nama_lengkap, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nama_lengkap', new.email), 'nakes');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 8. SEED CONTOH (opsional — hapus/ubah sesuai kebutuhan)
-- ============================================================
-- insert into instansis (nama, jenis, kota) values ('Puskesmas Contoh', 'puskesmas', 'Makassar');
