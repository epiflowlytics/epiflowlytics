import { useState, useEffect } from 'react'
import {
  PERSETUJUAN_PASIEN,
  BUTIR_PERSETUJUAN,
  SUB_BUTIR_F,
  checklistPersetujuanKosong,
  validasiChecklistPersetujuan,
} from '../nakes/loket/utils/consentHelpers'

// Modal form consent sesuai spesifikasi General Consent Permenkes (RME).
// Petugas loket menjelaskan tiap butir ke pasien, lalu memilihkan jawaban
// pasien (Setuju/Tidak setuju atau Ya/Tidak) untuk tiap butir sebelum
// Simpan. Pasien nanti hanya memeriksa ulang ringkasan ini dan tanda tangan
// di halaman publik (lihat HalamanConsentPublik.jsx).
//
// PENTING: tidak semua butir wajib "Setuju" — pasien berhak memilih "Tidak
// setuju" pada butir apa pun (mis. ketentuan pembayaran, tata tertib).
// Validasi hanya memastikan semua butir SUDAH DIPILIH, lihat
// validasiChecklistPersetujuan di consentHelpers.
export default function ModalFormConsent({
  show,
  pasien,
  checklistDefault,
  loading,
  error,
  onSimpan,
  onBatal,
}) {
  const [checklist, setChecklist] = useState(() => checklistDefault || checklistPersetujuanKosong())
  const [pesanValidasiLokal, setPesanValidasiLokal] = useState('')

  // Reset checklist ke kosong setiap kali modal dibuka untuk pasien baru,
  // supaya tidak membawa isian pasien sebelumnya.
  useEffect(() => {
    if (show) {
      setChecklist(checklistDefault || checklistPersetujuanKosong())
      setPesanValidasiLokal('')
    }
  }, [show, pasien?.id])

  if (!show) return null

  function pilihButir(key, value) {
    setChecklist((prev) => ({ ...prev, [key]: value }))
  }

  function pilihSubButirF(key, value) {
    setChecklist((prev) => ({
      ...prev,
      f_pelepasan_informasi: { ...prev.f_pelepasan_informasi, [key]: value },
    }))
  }

  function tambahKeluarga() {
    setChecklist((prev) => ({
      ...prev,
      f_pelepasan_informasi: {
        ...prev.f_pelepasan_informasi,
        keluarga_boleh_diberi_informasi: [
          ...prev.f_pelepasan_informasi.keluarga_boleh_diberi_informasi,
          { nama: '', hubungan: '' },
        ],
      },
    }))
  }

  function ubahKeluarga(index, field, value) {
    setChecklist((prev) => {
      const daftar = [...prev.f_pelepasan_informasi.keluarga_boleh_diberi_informasi]
      daftar[index] = { ...daftar[index], [field]: value }
      return {
        ...prev,
        f_pelepasan_informasi: { ...prev.f_pelepasan_informasi, keluarga_boleh_diberi_informasi: daftar },
      }
    })
  }

  function hapusKeluarga(index) {
    setChecklist((prev) => {
      const daftar = prev.f_pelepasan_informasi.keluarga_boleh_diberi_informasi.filter((_, i) => i !== index)
      return {
        ...prev,
        f_pelepasan_informasi: { ...prev.f_pelepasan_informasi, keluarga_boleh_diberi_informasi: daftar },
      }
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    const pesan = validasiChecklistPersetujuan(checklist)
    if (pesan) {
      setPesanValidasiLokal(pesan)
      return
    }
    setPesanValidasiLokal('')
    onSimpan(checklist)
  }

  function PilihanRadio({ namaGrup, opsi, nilaiTerpilih, onPilih }) {
    return (
      <div className="flex gap-2 shrink-0">
        {opsi.map((o) => (
          <label
            key={o.value}
            className={`px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
              nilaiTerpilih === o.value
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name={namaGrup}
              value={o.value}
              checked={nilaiTerpilih === o.value}
              onChange={() => onPilih(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    )
  }

  const f = checklist.f_pelepasan_informasi

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Formulir General Consent</h2>
            <p className="text-sm text-gray-500">
              Pasien: <span className="font-medium">{pasien?.nama_lengkap || '-'}</span>
              {pasien?.no_rekam_medis ? (
                <span className="text-gray-400"> &middot; RM {pasien.no_rekam_medis}</span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onBatal}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {(error || pesanValidasiLokal) && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error || pesanValidasiLokal}
            </div>
          )}

          <p className="text-sm text-gray-500">
            Jelaskan tiap butir berikut kepada pasien, lalu pilih jawabannya. Pasien akan memeriksa
            ulang ringkasan ini dan menandatangani di HP setelah scan QR.
          </p>

          <div className="rounded-lg border-2 border-blue-200 bg-blue-50 px-3 py-3 space-y-2">
            <p className="text-sm text-gray-700 leading-relaxed">{PERSETUJUAN_PASIEN.label}</p>
            <PilihanRadio
              namaGrup={PERSETUJUAN_PASIEN.key}
              opsi={PERSETUJUAN_PASIEN.opsi}
              nilaiTerpilih={checklist[PERSETUJUAN_PASIEN.key]}
              onPilih={(v) => pilihButir(PERSETUJUAN_PASIEN.key, v)}
            />
          </div>

          <div className="space-y-2">
            {BUTIR_PERSETUJUAN.map((butir) => (
              <div
                key={butir.key}
                className="rounded-lg border border-gray-200 px-3 py-2 space-y-2"
              >
                <p className="text-sm text-gray-700 leading-relaxed">{butir.label}</p>
                <PilihanRadio
                  namaGrup={butir.key}
                  opsi={butir.opsi}
                  nilaiTerpilih={checklist[butir.key]}
                  onPilih={(v) => pilihButir(butir.key, v)}
                />
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-gray-200 px-3 py-3 space-y-3">
            <p className="text-sm font-medium text-gray-700">Pelepasan informasi</p>

            {SUB_BUTIR_F.map((sub) => (
              <div key={sub.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-600">{sub.label}</span>
                <PilihanRadio
                  namaGrup={`f_${sub.key}`}
                  opsi={sub.opsi}
                  nilaiTerpilih={f[sub.key]}
                  onPilih={(v) => pilihSubButirF(sub.key, v)}
                />
              </div>
            ))}

            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm text-gray-600 mb-2">
                Anggota keluarga yang boleh diberi informasi (opsional, bisa lebih dari satu):
              </p>
              <div className="space-y-2">
                {f.keluarga_boleh_diberi_informasi.map((k, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={k.nama}
                      onChange={(e) => ubahKeluarga(i, 'nama', e.target.value)}
                      placeholder="Nama"
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      value={k.hubungan}
                      onChange={(e) => ubahKeluarga(i, 'hubungan', e.target.value)}
                      placeholder="Hubungan (mis. Anak)"
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => hapusKeluarga(i)}
                      className="text-red-500 hover:text-red-700 text-sm px-2"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={tambahKeluarga}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                + Tambah anggota keluarga
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={onBatal}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : 'Simpan & Buat QR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}