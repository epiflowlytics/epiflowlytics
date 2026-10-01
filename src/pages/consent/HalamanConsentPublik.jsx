import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import SignatureCanvas from './SignatureCanvas'
import { supabase } from '../../lib/supabaseClient'
import { generateBerkasByToken } from '../../lib/berkasConsent'
import { STATUS_CONSENT, PERSETUJUAN_PASIEN, BUTIR_PERSETUJUAN, SUB_BUTIR_F } from '../nakes/loket/utils/consentHelpers'

// Halaman publik (tanpa login) diakses lewat scan QR: /consent/:token
//
// Berbeda dari versi sebelumnya: butir a-f (checklist_persetujuan) SUDAH
// diisi oleh petugas loket di ModalFormConsent sebelum QR dibuat. Halaman
// ini hanya menampilkan RINGKASAN untuk diperiksa ulang oleh pasien, lalu
// meminta nama penanggung jawab + tanda tangan. Pasien TIDAK mengubah
// pilihan Setuju/Tidak di sini — kalau ada yang keliru, pasien diminta
// kembali ke loket untuk dikoreksi petugas.
//
// Header (tanggal, jam, nama, no RM, tanggal lahir, jenis kelamin) diambil
// otomatis dari data pasien lewat RPC ambil_consent_by_token, bukan
// diketik ulang.
//
// Akses data memakai RPC (SECURITY DEFINER) alih-alih SELECT/UPDATE
// langsung ke tabel, supaya publik tanpa login hanya bisa menyentuh baris
// consent miliknya sendiri (lihat migration
// fix_general_consent_rls_and_public_access).
export default function HalamanConsentPublik() {
  const { token } = useParams()

  const [consent, setConsent] = useState(null) // hasil RPC ambil_consent_by_token
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  const [namaPenandatangan, setNamaPenandatangan] = useState('')
  const [hubungan, setHubungan] = useState('')
  const [selesai, setSelesai] = useState(false)

  const sigRef = useRef(null)

  useEffect(() => {
    async function muatConsent() {
      setLoading(true)
      setError('')
      try {
        const { data, error: fetchErr } = await supabase
          .rpc('ambil_consent_by_token', { p_token: token })
          .maybeSingle()

        if (fetchErr) throw new Error(fetchErr.message)
        if (!data) throw new Error('Tautan tidak valid, sudah dipakai, atau sudah kedaluwarsa.')

        setConsent(data)
        setNamaPenandatangan(data.nama_pasien || '')

        if (data.status !== STATUS_CONSENT.MENUNGGU_TTD) {
          setSelesai(true)
        } else if (data.token_kedaluwarsa_pada && new Date(data.token_kedaluwarsa_pada) < new Date()) {
          setError('Tautan sudah kedaluwarsa. Silakan minta petugas loket membuatkan QR baru.')
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    if (token) muatConsent()
  }, [token])

  function hapusTtd() {
    sigRef.current?.clear()
  }

  async function simpanTtd() {
    if (!consent) return
    if (sigRef.current?.isEmpty()) {
      setError('Tanda tangan belum diisi.')
      return
    }
    if (!namaPenandatangan.trim()) {
      setError('Nama wajib diisi.')
      return
    }

    setMenyimpan(true)
    setError('')
    try {
      const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png')

      // Simpan tanda tangan sebagai data URL langsung ke kolom (tidak upload
      // ke storage supaya alur tetap sederhana; bisa dipindah ke Supabase
      // Storage nanti kalau ukuran jadi masalah).
      const { error: rpcErr } = await supabase.rpc('tandatangani_consent_by_token', {
        p_token: token,
        p_checklist: consent.checklist_persetujuan,
        p_nama: namaPenandatangan.trim(),
        p_hubungan: hubungan.trim(),
        p_tanda_tangan_url: dataUrl,
      })

      if (rpcErr) throw new Error(rpcErr.message)

      // Buat berkas DRAFT (PDF + Word) di server. Tanpa await agar pasien tidak
      // menunggu; kegagalan hanya dicatat di console dan tidak mengganggu alur.
      generateBerkasByToken(token)

      setSelesai(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setMenyimpan(false)
    }
  }

  function formatTanggal(iso) {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  function formatJam(iso) {
    if (!iso) return '-'
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }

  function labelJenisKelamin(jk) {
    if (jk === 'L') return 'Laki-laki'
    if (jk === 'P') return 'Perempuan'
    return '-'
  }

  function labelPilihan(value) {
    if (value === 'setuju') return 'Setuju'
    if (value === 'tidak_setuju') return 'Tidak setuju'
    if (value === 'ya') return 'Ya'
    if (value === 'tidak') return 'Tidak'
    return '-'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Memuat formulir persetujuan...</p>
      </div>
    )
  }

  if (error && !consent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow p-6 max-w-md w-full text-center">
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    )
  }

  if (selesai) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow p-6 max-w-md w-full text-center">
          <div className="text-green-600 text-5xl mb-3">&#10003;</div>
          <h1 className="text-lg font-semibold text-gray-800 mb-1">Terima kasih</h1>
          <p className="text-sm text-gray-600">
            Persetujuan tindakan sudah tersimpan. Silakan tunjukkan halaman ini
            kepada petugas jika diminta, lalu kembali ke loket/ruang tunggu.
          </p>
        </div>
      </div>
    )
  }

  const checklist = consent?.checklist_persetujuan || {}
  const f = checklist.f_pelepasan_informasi || {}
  const daftarKeluarga = f.keluarga_boleh_diberi_informasi || []

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow p-5 space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Formulir Persetujuan Umum (General Consent)</h1>
        </div>

        {/* Header otomatis dari data pasien */}
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <div className="col-span-2">
            <span className="text-gray-500">Nama:</span>{' '}
            <span className="font-medium text-gray-800">{consent?.nama_pasien || '-'}</span>
          </div>
          <div>
            <span className="text-gray-500">No. RM:</span>{' '}
            <span className="text-gray-800">{consent?.no_rekam_medis || '-'}</span>
          </div>
          <div>
            <span className="text-gray-500">Jenis kelamin:</span>{' '}
            <span className="text-gray-800">{labelJenisKelamin(consent?.jenis_kelamin)}</span>
          </div>
          <div>
            <span className="text-gray-500">Tanggal lahir:</span>{' '}
            <span className="text-gray-800">{formatTanggal(consent?.tanggal_lahir)}</span>
          </div>
          <div>
            <span className="text-gray-500">Tanggal/jam formulir:</span>{' '}
            <span className="text-gray-800">
              {formatTanggal(consent?.created_at)}, {formatJam(consent?.created_at)}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Ringkasan persetujuan yang sudah diisi petugas loket */}
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          <p className="text-sm text-gray-500 mb-1">
            Periksa kembali persetujuan yang sudah dijelaskan oleh petugas loket. Jika ada yang keliru,
            silakan kembali ke loket sebelum menandatangani.
          </p>

          <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-blue-200 bg-blue-50 px-3 py-2">
            <span className="text-sm font-medium text-gray-700">{PERSETUJUAN_PASIEN.label}</span>
            <span className="text-sm font-semibold text-gray-800 shrink-0">
              {labelPilihan(checklist[PERSETUJUAN_PASIEN.key])}
            </span>
          </div>

          {BUTIR_PERSETUJUAN.map((butir) => (
            <div
              key={butir.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2"
            >
              <span className="text-sm text-gray-700">{butir.label}</span>
              <span className="text-sm font-medium text-gray-800 shrink-0">
                {labelPilihan(checklist[butir.key])}
              </span>
            </div>
          ))}

          <div className="rounded-lg border border-gray-200 px-3 py-2 space-y-2">
            <p className="text-sm font-medium text-gray-700">f. Pelepasan informasi</p>
            {SUB_BUTIR_F.map((sub) => (
              <div key={sub.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-600">{sub.label}</span>
                <span className="text-sm font-medium text-gray-800 shrink-0">{labelPilihan(f[sub.key])}</span>
              </div>
            ))}
            {daftarKeluarga.length > 0 && (
              <div className="pt-1 border-t border-gray-100">
                <p className="text-sm text-gray-600 mb-1">Anggota keluarga yang boleh diberi informasi:</p>
                <ul className="text-sm text-gray-700 list-disc list-inside">
                  {daftarKeluarga.map((k, i) => (
                    <li key={i}>
                      {k.nama || '-'} {k.hubungan ? `(${k.hubungan})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama penanggung jawab yang menandatangani
            </label>
            <input
              type="text"
              value={namaPenandatangan}
              onChange={(e) => setNamaPenandatangan(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hubungan dengan pasien (kosongkan jika pasien sendiri)
            </label>
            <input
              type="text"
              value={hubungan}
              onChange={(e) => setHubungan(e.target.value)}
              placeholder="mis. Suami, Istri, Orang tua, Wali"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tanda Tangan</label>
            <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
              <SignatureCanvas
                ref={sigRef}
                penColor="black"
                canvasProps={{ className: 'w-full h-48' }}
              />
            </div>
            <button
              type="button"
              onClick={hapusTtd}
              className="mt-1 text-sm text-blue-600 hover:underline"
            >
              Ulangi tanda tangan
            </button>
          </div>

          <button
            type="button"
            onClick={simpanTtd}
            disabled={menyimpan}
            className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {menyimpan ? 'Menyimpan...' : 'Simpan Persetujuan'}
          </button>
        </div>
      </div>
    </div>
  )
}