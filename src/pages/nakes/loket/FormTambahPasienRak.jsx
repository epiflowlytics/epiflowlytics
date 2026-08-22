import DatePickerLahir from './DatePickerLahir'
import { hitungUmur, labelStatusKeluarga, OPSI_STATUS_KELUARGA } from './utils/pasienHelpers'

// ─── KOMPONEN MANDIRI: Halaman Tambah Pasien di dalam Rak ────────
// Muncul menggantikan tampilan daftar rak saat petugas klik "+ Tambah
// Pasien" di panel isi rak. Berisi 7 field sesuai kebutuhan loket.
// ─── KOMPONEN MANDIRI: Halaman Tambah Pasien di dalam Rak ────────
// Muncul menggantikan tampilan daftar rak saat petugas klik "+ Tambah
// Pasien" di panel isi rak. Berisi 7 field sesuai kebutuhan loket.
export default function FormTambahPasienRak({
  rak,
  editMode,
  form,
  onChange,
  onSubmit,
  onCancel,
  loading,
  error,
  anggotaKk,
  onCekNoKk,
  cekKkLoading,
  onEditPasienRak,
  onHapusPasienRak,
  instansiId,
  refNama,
  refNoRm,
  refNik,
  refTanggalLahir,
  refJenisKelamin,
  popupValidasi,
  onTutupPopupValidasi,
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-2 p-5 border-b sticky top-0 bg-white">
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-sm shrink-0"
          >
            ← Kembali
          </button>
          <h2 className="font-bold text-gray-800 truncate">
            {editMode ? 'Edit Pasien' : 'Tambah Pasien'} — Rak {rak?.kode_rak}
          </h2>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs">
              {error}
            </div>
          )}

          {/* 3. Nomor KK */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nomor Kartu Keluarga (KK)</label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                name="no_kk"
                autoComplete="off"
                value={form.no_kk}
                onChange={onChange}
                onBlur={() => onCekNoKk(form.no_kk)}
                placeholder="16 digit No. KK (angka saja)"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => onCekNoKk(form.no_kk)}
                disabled={!form.no_kk?.trim() || cekKkLoading}
                className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40"
              >
                {cekKkLoading ? 'Mengecek...' : 'Cek KK'}
              </button>
            </div>
            {anggotaKk?.length > 0 && (
              <div className="mt-2 border border-teal-200 bg-teal-50 rounded-lg p-2.5 space-y-2">
                <p className="text-[11px] text-teal-700 font-medium">
                  Sudah ada {anggotaKk.length} anggota keluarga terdaftar dengan No. KK ini — No. Rekam Medis
                  otomatis disamakan.
                </p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {anggotaKk.map((p, idx) => (
                    <div key={p.id} className="bg-white rounded-lg border border-teal-100 overflow-hidden">
                      <div className="px-2.5 py-1.5 bg-teal-100/60 flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-700 text-xs">
                          {idx + 1}. {p.nama_lengkap}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {p.status_keluarga && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                              {labelStatusKeluarga(p.status_keluarga, p.status_keluarga_lainnya)}
                            </span>
                          )}
                          {onEditPasienRak && (
                            <button
                              type="button"
                              onClick={() => onEditPasienRak({ id: p.rak_id }, p)}
                              className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
                            >
                              Edit
                            </button>
                          )}
                          {onHapusPasienRak && (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await onHapusPasienRak(p.id)
                                if (ok) onCekNoKk(form.no_kk)
                              }}
                              className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>
                      <table className="w-full text-[11px]">
                        <tbody>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 w-28 align-top">Urut KK</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.urutan_kk || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">No. RM</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.no_rekam_medis || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">NIK</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.no_nik || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">BPJS</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.no_bpjs || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">Alamat</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.alamat || '-'}</td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">Jenis Kelamin</td>
                            <td className="px-2.5 py-1 text-gray-700">
                              {p.jenis_kelamin === 'L' ? 'Laki-laki' : p.jenis_kelamin === 'P' ? 'Perempuan' : '-'}
                            </td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">Lahir</td>
                            <td className="px-2.5 py-1 text-gray-700">
                              {p.tempat_lahir || p.tanggal_lahir
                                ? `${p.tempat_lahir ? p.tempat_lahir + ', ' : ''}${p.tanggal_lahir || ''}`
                                : '-'}
                            </td>
                          </tr>
                          <tr className="border-t border-teal-50">
                            <td className="px-2.5 py-1 text-gray-400 align-top">Pekerjaan</td>
                            <td className="px-2.5 py-1 text-gray-700">{p.pekerjaan || '-'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 1. Nomor Rekam Medis */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nomor Rekam Medis <span className="text-red-500">*</span>
            </label>
            {form.rm_terkunci ? (
              <p className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5 mb-1.5">
                🔗 Digabung ke grup No. RM ini — nomor tidak bisa diubah.
              </p>
            ) : (
              <div className="flex gap-2 mb-1.5">
                <button
                  type="button"
                  onClick={() => onChange({ target: { name: 'mode_rm', value: 'otomatis' } })}
                  className={`text-[11px] px-2 py-1 rounded-lg border ${
                    form.mode_rm === 'otomatis'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  Otomatis
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ target: { name: 'mode_rm', value: 'manual' } })}
                  className={`text-[11px] px-2 py-1 rounded-lg border ${
                    form.mode_rm === 'manual'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  Manual
                </button>
              </div>
            )}
            <input
              type="text"
              name="no_rekam_medis"
              autoComplete="off"
              ref={refNoRm}
              value={form.no_rekam_medis}
              onChange={onChange}
              readOnly={form.mode_rm === 'otomatis' || form.rm_terkunci}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${
                form.mode_rm === 'otomatis' || form.rm_terkunci ? 'bg-gray-50 text-gray-500' : ''
              }`}
            />
          </div>

          {/* 2. Nomor Urut di KK */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nomor Urut di Kartu Keluarga (KK)
            </label>
            <input
              type="number"
              min="1"
              name="urutan_kk"
              autoComplete="off"
              value={form.urutan_kk}
              onChange={onChange}
              placeholder="mis. 1 = kepala keluarga"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Status dalam Keluarga */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Status dalam Keluarga
            </label>
            <select
              name="status_keluarga"
              value={form.status_keluarga}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              {OPSI_STATUS_KELUARGA.map((opsi) => (
                <option key={opsi.value} value={opsi.value}>
                  {opsi.label}
                </option>
              ))}
            </select>
            {form.status_keluarga === 'lainnya' && (
              <input
                type="text"
                name="status_keluarga_lainnya"
                autoComplete="off"
                value={form.status_keluarga_lainnya}
                onChange={onChange}
                placeholder="Ketik status dalam keluarga"
                className="w-full border rounded-lg px-3 py-2 text-sm mt-2"
              />
            )}
          </div>

          {/* 7. Nama Pasien */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nama Pasien <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nama_lengkap"
              autoComplete="off"
              ref={refNama}
              value={form.nama_lengkap}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Nama Kepala Keluarga */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nama Kepala Keluarga
            </label>
            <input
              type="text"
              name="nama_kepala_keluarga"
              autoComplete="off"
              value={form.nama_kepala_keluarga}
              onChange={onChange}
              placeholder="Nama kepala keluarga sesuai KK"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* 4. Nomor KTP (NIK) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nomor Kartu Tanda Penduduk (KTP) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              name="no_nik"
              autoComplete="off"
              ref={refNik}
              value={form.no_nik}
              onChange={onChange}
              placeholder="16 digit NIK (angka saja)"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Tempat & Tanggal Lahir */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tempat Lahir
              </label>
              <input
                type="text"
                name="tempat_lahir"
                autoComplete="off"
                value={form.tempat_lahir}
                onChange={onChange}
                placeholder="mis. Makassar"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div ref={refTanggalLahir} tabIndex={-1}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tanggal Lahir <span className="text-red-500">*</span>
              </label>
              <DatePickerLahir
                name="tanggal_lahir"
                value={form.tanggal_lahir}
                onChange={onChange}
              />
              {form.tanggal_lahir && (
                <p className="text-[11px] text-teal-600 mt-1">{hitungUmur(form.tanggal_lahir)}</p>
              )}
            </div>
          </div>

          {/* Jenis Kelamin */}
          <div ref={refJenisKelamin} tabIndex={-1}>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Jenis Kelamin <span className="text-red-500">*</span>
            </label>
            <select
              name="jenis_kelamin"
              value={form.jenis_kelamin}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">-- Pilih --</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>

          {/* Pekerjaan */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Pekerjaan
            </label>
            <input
              type="text"
              name="pekerjaan"
              autoComplete="off"
              value={form.pekerjaan}
              onChange={onChange}
              placeholder="mis. Petani, Wiraswasta, Pelajar"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* 5. Nomor BPJS */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nomor BPJS
            </label>
            <input
              type="text"
              name="no_bpjs"
              autoComplete="off"
              value={form.no_bpjs}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* 6. Alamat Pasien */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Alamat Pasien
            </label>
            <textarea
              name="alamat"
              value={form.alamat}
              onChange={onChange}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : editMode ? 'Simpan Perubahan' : 'Simpan Pasien'}
            </button>
          </div>
        </form>
      </div>

      {/* Popup validasi field wajib — muncul saat Simpan diklik tapi ada
          field wajib yang kosong/tidak valid. Fokus ke field baru dijalankan
          setelah tombol OK diklik. */}
      {popupValidasi && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">⚠️</span>
              <div>
                <p className="font-semibold text-gray-800 mb-1">Data belum lengkap</p>
                <p className="text-sm text-gray-600">{popupValidasi.pesan}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onTutupPopupValidasi()
                // beri jeda sedikit supaya popup benar-benar tertutup dulu
                // sebelum fokus dipindah, khususnya untuk field DatePickerLahir
                setTimeout(() => popupValidasi.fokusKe(), 50)
              }}
              className="mt-4 w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
