// =========================================================
// Supabase Edge Function: create-staf-instansi
// Lokasi di project: supabase/functions/create-staf-instansi/index.ts
//
// Cara deploy:
//   supabase functions deploy create-staf-instansi
//
// Dipanggil oleh admin_instansi untuk membuat akun staf (nakes) baru
// di dalam instansinya sendiri. instansi_id TIDAK diambil dari body,
// melainkan dari profil admin yang memanggil (mencegah admin membuat
// akun untuk instansi lain).
//
// VERSI MANY-TO-MANY: staf bisa punya lebih dari satu poli (poli_ids).
// Relasi disimpan di tabel staf_poli(staf_id, poli_id).
// =========================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Konfigurasi server belum lengkap (service role key).' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Verifikasi token pemanggil
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Tidak ada token otorisasi.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAsCaller = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: caller },
      error: callerErr,
    } = await supabaseAsCaller.auth.getUser()

    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'Token tidak valid.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Pastikan pemanggil adalah admin_instansi, dan ambil instansi_id miliknya
    const { data: callerProfile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('role, instansi_id')
      .eq('id', caller.id)
      .single()

    if (profErr || callerProfile?.role !== 'admin_instansi') {
      return new Response(
        JSON.stringify({ error: 'Hanya Admin Instansi yang boleh membuat akun staf.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!callerProfile.instansi_id) {
      return new Response(
        JSON.stringify({ error: 'Akun Anda belum terhubung ke instansi manapun.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { nama_lengkap, email, password, poli_ids, profesi } = await req.json()

    if (!nama_lengkap?.trim()) {
      return new Response(JSON.stringify({ error: 'Nama lengkap wajib diisi.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!email?.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Format email tidak valid.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!password || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password minimal 8 karakter.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Normalisasi poli_ids: array unik, boleh kosong
    const poliIds: string[] = Array.isArray(poli_ids) ? [...new Set(poli_ids.filter(Boolean))] : []

    // Jika ada poli_ids, pastikan semuanya milik instansi si admin
    if (poliIds.length > 0) {
      const { data: polisRows, error: poliErr } = await supabaseAdmin
        .from('polis')
        .select('id, instansi_id')
        .in('id', poliIds)

      if (poliErr) {
        return new Response(
          JSON.stringify({ error: 'Gagal memeriksa poli: ' + poliErr.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const validIds = (polisRows ?? [])
        .filter((p) => p.instansi_id === callerProfile.instansi_id)
        .map((p) => p.id)

      if (validIds.length !== poliIds.length) {
        return new Response(
          JSON.stringify({ error: 'Salah satu poli tidak ditemukan atau bukan milik instansi Anda.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Validasi profesi: valid jika minimal satu poli terpilih mengizinkan profesi tsb
    // (union). Jika tidak ada poli terpilih yang punya daftar profesi sama sekali,
    // profesi tidak dibatasi.
    const profesiNorm = profesi?.trim().toLowerCase() || null

    if (poliIds.length > 0 && profesiNorm) {
      const { data: allowed, error: allowedErr } = await supabaseAdmin
        .from('poli_profesi')
        .select('poli_id, profesi_nakes ( nama )')
        .in('poli_id', poliIds)

      if (allowedErr) {
        return new Response(
          JSON.stringify({ error: 'Gagal memeriksa profesi poli: ' + allowedErr.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const rows = allowed ?? []
      // poli yang memang punya daftar profesi (poli baru / sudah dikonfigurasi)
      const poliDenganDaftar = new Set(rows.map((r) => r.poli_id))
      const adaPoliDenganDaftar = poliDenganDaftar.size > 0

      if (adaPoliDenganDaftar) {
        const daftarUnion = new Set(
          rows.map((r) => r.profesi_nakes?.nama?.toLowerCase()).filter(Boolean)
        )
        // Jika ada poli terpilih yang TIDAK punya daftar profesi sama sekali,
        // poli tsb otomatis tidak membatasi — jadi hanya diblok kalau SEMUA poli
        // terpilih yang punya daftar tidak mengizinkan profesi ini DAN semua poli
        // terpilih memang punya daftar.
        const semuaPoliPunyaDaftar = poliDenganDaftar.size === poliIds.length
        if (semuaPoliPunyaDaftar && !daftarUnion.has(profesiNorm)) {
          return new Response(
            JSON.stringify({
              error: `Profesi "${profesiNorm}" tidak diizinkan di poli yang dipilih. Pilihan: ${[...daftarUnion].join(', ')}.`,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Buat user di auth.users
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { nama_lengkap: nama_lengkap.trim() },
    })

    if (createErr || !created?.user) {
      return new Response(
        JSON.stringify({ error: createErr?.message ?? 'Gagal membuat akun pengguna.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Trigger on_auth_user_created sudah membuat baris profiles (role default 'nakes'),
    // di sini kita update supaya instansi_id, profesi terisi benar.
    const { data: updatedProfile, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        nama_lengkap: nama_lengkap.trim(),
        role: 'nakes',
        instansi_id: callerProfile.instansi_id,
        profesi: profesiNorm,
      })
      .eq('id', created.user.id)
      .select()
      .single()

    if (updateErr) {
      // Rollback: hapus user auth supaya tidak ada akun "yatim" tanpa profil lengkap
      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Simpan relasi staf_poli
    if (poliIds.length > 0) {
      const { error: relErr } = await supabaseAdmin
        .from('staf_poli')
        .insert(poliIds.map((poli_id) => ({ staf_id: created.user.id, poli_id })))

      if (relErr) {
        // Rollback penuh: hapus profile (via delete user, trigger/ON DELETE CASCADE
        // biasanya membersihkan profiles) supaya tidak ada staf tanpa relasi poli yang gagal
        await supabaseAdmin.auth.admin.deleteUser(created.user.id)
        return new Response(
          JSON.stringify({ error: 'Gagal menyimpan relasi poli: ' + relErr.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ success: true, profile: { ...updatedProfile, poli_ids: poliIds } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? 'Terjadi kesalahan server.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})