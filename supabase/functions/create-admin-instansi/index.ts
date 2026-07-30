// =========================================================
// Supabase Edge Function: create-instansi
// Lokasi di project: supabase/functions/create-instansi/index.ts
//
// Cara deploy:
//   supabase functions deploy create-instansi
//
// Menerima { nama } dari frontend, insert ke tabel `instansi`.
// Hanya boleh dipanggil oleh user dengan role super_owner (dicek dari tabel profiles).
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

    // Verifikasi pemanggil harus super_owner, sama seperti create-admin-instansi
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

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'super_owner') {
      return new Response(
        JSON.stringify({ error: 'Hanya Super Owner yang boleh membuat instansi.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Ambil payload
    const { nama } = await req.json()

    if (!nama || !nama.trim()) {
      return new Response(
        JSON.stringify({ error: 'Nama instansi wajib diisi.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cek duplikat nama (case-insensitive) supaya tidak ada instansi kembar
    const { data: existing } = await supabaseAdmin
      .from('instansis')
      .select('id')
      .ilike('nama', nama.trim())
      .maybeSingle()

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Instansi dengan nama tersebut sudah ada.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('instansis')
      .insert({ nama: nama.trim() })
      .select()
      .single()

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, instansi: inserted }), {
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
