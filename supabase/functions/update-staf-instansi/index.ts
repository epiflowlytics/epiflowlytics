import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // --- 1. Pastikan pemanggil sudah login ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Tidak terautentikasi.' }, 401)
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: callerUser }, error: callerAuthError } = await supabaseClient.auth.getUser()
    if (callerAuthError || !callerUser) {
      return jsonResponse({ error: 'Sesi tidak valid, silakan login ulang.' }, 401)
    }

    // --- 2. Pastikan pemanggil adalah admin instansi ---
    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, instansi_id')
      .eq('id', callerUser.id)
      .single()

    if (callerProfileError || !callerProfile) {
      return jsonResponse({ error: 'Profil pemanggil tidak ditemukan.' }, 403)
    }
    if (callerProfile.role !== 'admin_instansi') {
      return jsonResponse({ error: 'Anda tidak memiliki izin untuk mengubah akun staf.' }, 403)
    }

    // --- 3. Ambil & validasi payload ---
    const body = await req.json()
    const { staf_id, nama_lengkap, email, password, poli_id, profesi } = body

    if (!staf_id) {
      return jsonResponse({ error: 'ID staf wajib diisi.' }, 400)
    }
    if (!nama_lengkap || !nama_lengkap.trim()) {
      return jsonResponse({ error: 'Nama lengkap wajib diisi.' }, 400)
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return jsonResponse({ error: 'Format email tidak valid.' }, 400)
    }
    if (password && password.length < 8) {
      return jsonResponse({ error: 'Password minimal 8 karakter.' }, 400)
    }

    // --- 4. Pastikan staf yang diedit memang milik instansi yang sama ---
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, instansi_id, role')
      .eq('id', staf_id)
      .single()

    if (targetError || !targetProfile) {
      return jsonResponse({ error: 'Data staf tidak ditemukan.' }, 404)
    }
    if (targetProfile.instansi_id !== callerProfile.instansi_id) {
      return jsonResponse({ error: 'Anda tidak memiliki izin untuk mengubah staf ini.' }, 403)
    }

    // --- 5. Update akun Auth (email, dan password jika diisi) ---
    const authUpdatePayload = { email: email.trim() }
    if (password) {
      authUpdatePayload.password = password
    }

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      staf_id,
      authUpdatePayload
    )

    if (authUpdateError) {
      // Email sudah dipakai user lain, dsb.
      return jsonResponse({ error: 'Gagal memperbarui akun: ' + authUpdateError.message }, 400)
    }

    // --- 6. Update data di tabel profiles ---
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        nama_lengkap: nama_lengkap.trim(),
        email: email.trim(),
        poli_id: poli_id || null,
        profesi: profesi || null,
      })
      .eq('id', staf_id)

    if (profileUpdateError) {
      return jsonResponse({ error: 'Gagal memperbarui profil: ' + profileUpdateError.message }, 400)
    }

    return jsonResponse({ success: true })
  } catch (err) {
    return jsonResponse({ error: err?.message ?? 'Terjadi kesalahan pada server.' }, 500)
  }
})