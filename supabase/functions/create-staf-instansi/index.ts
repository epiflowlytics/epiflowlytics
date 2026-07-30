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

    const { nama_lengkap, email, password, poli_id, profesi } = await req.json()

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

    // Jika poli_id diisi, pastikan poli tersebut memang milik instansi si admin
    if (poli_id) {
      const { data: poli, error: poliErr } = await supabaseAdmin
        .from('polis')
        .select('id, instansi_id')
        .eq('id', poli_id)
        .single()

      if (poliErr || !poli || poli.instansi_id !== callerProfile.instansi_id) {
        return new Response(
          JSON.stringify({ error: 'Poli tidak ditemukan atau bukan milik instansi Anda.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
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
    // di sini kita update supaya instansi_id, poli_id, profesi terisi benar.
    const { data: updatedProfile, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        nama_lengkap: nama_lengkap.trim(),
        role: 'nakes',
        instansi_id: callerProfile.instansi_id,
        poli_id: poli_id || null,
        profesi: profesi?.trim() || null,
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

    return new Response(JSON.stringify({ success: true, profile: updatedProfile }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? 'Terjadi kesalahan server.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
