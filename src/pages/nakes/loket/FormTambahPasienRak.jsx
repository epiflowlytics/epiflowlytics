import DatePickerLahir from './DatePickerLahir'
import WilayahSelect from './WilayahSelect'
import {
  hitungUmur,
  labelStatusKeluarga,
  OPSI_STATUS_KELUARGA,
  OPSI_AGAMA,
  OPSI_PENDIDIKAN,
  OPSI_STATUS_PERKAWINAN,
  OPSI_KEWARGANEGARAAN,
  OPSI_GOLONGAN_DARAH,
  OPSI_PEKERJAAN,
} from './utils/pasienHelpers'

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
  refNikPendamping,
  refTanggalLahir,
  refJenisKelamin,
  popupValidasi,
  onTutupPopupValidasi,
  onFotoChange,
  onSimpanFoto,
  onHapusFoto,
  fotoPreviewUrl,
  fotoUploading,
  fotoPending,
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

          {/* Toggle: Pasien Bayi Baru Lahir — mengaktifkan field khusus
              identitas bayi baru lahir (Permenkes data rawat jalan).
              Field yang overlap dengan pasien umum (No. RM, tanggal lahir,
              jenis kelamin) tidak diduplikasi, cukup pakai field yang sudah
              ada di form ini. */}
          <div className="border border-teal-200 bg-teal-50/50 rounded-lg p-3">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                name="is_bayi_baru_lahir"
                checked={!!form.is_bayi_baru_lahir}
                onChange={(e) =>
                  onChange({ target: { name: 'is_bayi_baru_lahir', value: e.target.checked } })
                }
              />
              Pasien ini bayi baru lahir
            </label>

            {form.is_bayi_baru_lahir && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Nama Bayi
                  </label>
                  {form.nama_ibu_kandung && !form.nama_bayi && (
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          target: {
                            name: 'nama_bayi',
                            value: `Bayi Ny. ${form.nama_ibu_kandung}`,
                          },
                        })
                      }
                      className="text-[11px] px-2 py-1 mb-1.5 rounded-lg border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100"
                    >
                      Isi otomatis: Bayi Ny. {form.nama_ibu_kandung}
                    </button>
                  )}
                  <input
                    type="text"
                    name="nama_bayi"
                    autoComplete="off"
                    value={form.nama_bayi || ''}
                    onChange={onChange}
                    placeholder="mis. Bayi Ny. Siti Aminah"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    NIK Ibu Kandung
                  </label>
                  {form.no_nik && form.status_keluarga === 'ibu' && !form.nik_ibu_kandung && (
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ target: { name: 'nik_ibu_kandung', value: form.no_nik } })
                      }
                      className="text-[11px] px-2 py-1 mb-1.5 rounded-lg border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100"
                    >
                      Isi dari NIK Ibu di atas
                    </button>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    name="nik_ibu_kandung"
                    autoComplete="off"
                    value={form.nik_ibu_kandung || ''}
                    onChange={onChange}
                    placeholder="16 digit NIK ibu yang melahirkan"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Jam Lahir
                  </label>
                  <input
                    type="time"
                    step="1"
                    name="jam_lahir"
                    value={form.jam_lahir || ''}
                    onChange={onChange}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Tanggal lahir, No. Rekam Medis, dan Jenis Kelamin memakai field yang sama
                    dengan data pasien di bawah.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Nomor Telepon Pengantar Pasien
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="no_telepon_pengantar"
                    autoComplete="off"
                    value={form.no_telepon_pengantar || ''}
                    onChange={onChange}
                    placeholder="No. telepon/HP orang yang mengantar bayi"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

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
            <p className="text-[11px] text-red-500 mb-1.5 leading-snug">
              Setiap pasien wajib memiliki NIK. Jika NIK belum terbit (usia 0–17 tahun), isi dengan
              angka 9 sebanyak 16 kali. Jika NIK lupa/tidak diketahui dengan usia 18 tahun ke atas,
              isi dengan angka 9 15 kali yang diakhiri angka 6.
            </p>
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

          {/* NIK Pendamping — selalu tampil di bawah NIK. Diisi jika pasien
              belum memiliki NIK sendiri. Disarankan NIK ayah/ibu/wali yang cakap. */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              NIK Pendamping (Ayah/Ibu/Wali)
            </label>
            <p className="text-[11px] text-red-500 mb-1.5 leading-snug">
              Form ini diisi jika pasien belum memiliki NIK sendiri. Disarankan mengisi NIK
              ibu/bapak/dst yang dianggap cakap.
            </p>
            {(() => {
              const ibu = anggotaKk?.find((p) => p.status_keluarga === 'ibu' && p.no_nik)
              const ayah = anggotaKk?.find((p) => p.status_keluarga === 'ayah' && p.no_nik)
              const ortu = ibu || ayah
              return ortu ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange({ target: { name: 'no_nik_pendamping', value: ortu.no_nik } })
                  }
                  className="text-[11px] px-2 py-1 mb-1.5 rounded-lg border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100"
                >
                  Isi dari data {labelStatusKeluarga(ortu.status_keluarga)} ({ortu.nama_lengkap})
                </button>
              ) : null
            })()}
            <input
              type="text"
              inputMode="numeric"
              name="no_nik_pendamping"
              autoComplete="off"
              ref={refNikPendamping}
              value={form.no_nik_pendamping}
              onChange={onChange}
              placeholder="16 digit NIK Ayah/Ibu/Wali"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Nama Ibu Kandung — identifier tambahan pasien. Bisa diisi manual,
              atau otomatis dari anggota KK berstatus "Ibu" (hasil Cek KK). */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nama Ibu Kandung
            </label>
            {(() => {
              const ibu = anggotaKk?.find((p) => p.status_keluarga === 'ibu' && p.nama_lengkap)
              return ibu ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange({ target: { name: 'nama_ibu_kandung', value: ibu.nama_lengkap } })
                  }
                  className="text-[11px] px-2 py-1 mb-1.5 rounded-lg border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100"
                >
                  Sama dengan Ibu di KK ({ibu.nama_lengkap})
                </button>
              ) : null
            })()}
            <input
              type="text"
              name="nama_ibu_kandung"
              autoComplete="off"
              value={form.nama_ibu_kandung}
              onChange={onChange}
              placeholder="Nama lengkap ibu kandung"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Kewarganegaraan & Nomor Telepon */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Kewarganegaraan
              </label>
              <select
                name="kewarganegaraan"
                value={form.kewarganegaraan}
                onChange={onChange}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                {OPSI_KEWARGANEGARAAN.map((opsi) => (
                  <option key={opsi.value} value={opsi.value}>
                    {opsi.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nomor Telepon Seluler
              </label>
              <input
                type="text"
                inputMode="numeric"
                name="no_telepon"
                autoComplete="off"
                value={form.no_telepon}
                onChange={onChange}
                placeholder="mis. 081234567890"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Nomor Identitas Lain — khusus WNA (Paspor/KITAS), muncul hanya
              jika Kewarganegaraan bukan WNI */}
          {form.kewarganegaraan && form.kewarganegaraan !== 'WNI' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nomor Identitas Lain (Paspor / KITAS)
              </label>
              <input
                type="text"
                name="no_identitas_lain"
                autoComplete="off"
                value={form.no_identitas_lain || ''}
                onChange={onChange}
                placeholder="Nomor Paspor atau KITAS"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* Nomor Telepon Rumah & Suku */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nomor Telepon Rumah
              </label>
              <input
                type="text"
                inputMode="numeric"
                name="no_telepon_rumah"
                autoComplete="off"
                value={form.no_telepon_rumah || ''}
                onChange={onChange}
                placeholder="mis. 04115123456"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Suku</label>
              <input
                type="text"
                name="suku"
                autoComplete="off"
                value={form.suku || ''}
                onChange={onChange}
                placeholder="mis. Bugis, Makassar, Jawa"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Bahasa yang Dikuasai */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Bahasa yang Dikuasai
            </label>
            <input
              type="text"
              name="bahasa_dikuasai"
              autoComplete="off"
              value={form.bahasa_dikuasai || ''}
              onChange={onChange}
              placeholder="mis. Indonesia, Bugis, Inggris"
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
            <select
              name="pekerjaan"
              value={form.pekerjaan || ''}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {OPSI_PEKERJAAN.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              {/* Data lama (teks bebas) yang tidak ada di daftar baku tetap
                  ditampilkan supaya tidak hilang diam-diam saat form dibuka. */}
              {form.pekerjaan && !OPSI_PEKERJAAN.some((o) => o.value === form.pekerjaan) && (
                <option value={form.pekerjaan}>{form.pekerjaan} (data lama)</option>
              )}
            </select>
          </div>

          {/* Agama, Pendidikan, Status Perkawinan (data sosial — Permenkes 24/2022) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Agama</label>
              <select
                name="agama"
                value={form.agama}
                onChange={onChange}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                {OPSI_AGAMA.map((opsi) => (
                  <option key={opsi.value} value={opsi.value}>
                    {opsi.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status Perkawinan</label>
              <select
                name="status_perkawinan"
                value={form.status_perkawinan}
                onChange={onChange}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                {OPSI_STATUS_PERKAWINAN.map((opsi) => (
                  <option key={opsi.value} value={opsi.value}>
                    {opsi.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pendidikan Terakhir</label>
            <select
              name="pendidikan"
              value={form.pendidikan}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              {OPSI_PENDIDIKAN.map((opsi) => (
                <option key={opsi.value} value={opsi.value}>
                  {opsi.label}
                </option>
              ))}
            </select>
          </div>

          {/* Golongan Darah — opsional, relevan untuk kondisi darurat */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Golongan Darah</label>
            <select
              name="golongan_darah"
              value={form.golongan_darah}
              onChange={onChange}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              {OPSI_GOLONGAN_DARAH.map((opsi) => (
                <option key={opsi.value} value={opsi.value}>
                  {opsi.label}
                </option>
              ))}
            </select>
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

          {/* 6. Alamat Sesuai KTP */}
          <div className="border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-700 mb-2">Alamat Sesuai KTP</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Alamat (Nama Jalan, Nomor Rumah)
                </label>
                <textarea
                  name="alamat"
                  value={form.alamat}
                  onChange={onChange}
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">RT</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="alamat_ktp_rt"
                    autoComplete="off"
                    value={form.alamat_ktp_rt || ''}
                    onChange={onChange}
                    placeholder="mis. 003"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">RW</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="alamat_ktp_rw"
                    autoComplete="off"
                    value={form.alamat_ktp_rw || ''}
                    onChange={onChange}
                    placeholder="mis. 002"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <WilayahSelect
                prefix="alamat_ktp"
                value={{
                  provinsi: form.alamat_ktp_provinsi,
                  provinsi_nama: form.alamat_ktp_provinsi_nama,
                  kabupaten: form.alamat_ktp_kabupaten,
                  kabupaten_nama: form.alamat_ktp_kabupaten_nama,
                  kecamatan: form.alamat_ktp_kecamatan,
                  kecamatan_nama: form.alamat_ktp_kecamatan_nama,
                  kelurahan: form.alamat_ktp_kelurahan,
                  kelurahan_nama: form.alamat_ktp_kelurahan_nama,
                }}
                onChange={onChange}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Kode Pos
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="alamat_ktp_kode_pos"
                    autoComplete="off"
                    value={form.alamat_ktp_kode_pos || ''}
                    onChange={onChange}
                    placeholder="mis. 90111"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Negara</label>
                  <input
                    type="text"
                    name="alamat_ktp_negara"
                    autoComplete="off"
                    value={form.alamat_ktp_negara || 'Indonesia'}
                    onChange={onChange}
                    placeholder="mis. Indonesia"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Alamat Domisili */}
          <div className="border-t pt-3 mt-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700">Alamat Domisili</p>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.domisili_sama_dengan_ktp}
                  onChange={(e) =>
                    onChange({
                      target: { name: 'domisili_sama_dengan_ktp', value: e.target.checked },
                    })
                  }
                />
                Sama dengan alamat KTP
              </label>
            </div>

            {!form.domisili_sama_dengan_ktp && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Alamat (Nama Jalan, Nomor Rumah)
                  </label>
                  <textarea
                    name="alamat_domisili"
                    value={form.alamat_domisili || ''}
                    onChange={onChange}
                    rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">RT</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      name="alamat_domisili_rt"
                      autoComplete="off"
                      value={form.alamat_domisili_rt || ''}
                      onChange={onChange}
                      placeholder="mis. 003"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">RW</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      name="alamat_domisili_rw"
                      autoComplete="off"
                      value={form.alamat_domisili_rw || ''}
                      onChange={onChange}
                      placeholder="mis. 002"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <WilayahSelect
                  prefix="alamat_domisili"
                  value={{
                    provinsi: form.alamat_domisili_provinsi,
                    provinsi_nama: form.alamat_domisili_provinsi_nama,
                    kabupaten: form.alamat_domisili_kabupaten,
                    kabupaten_nama: form.alamat_domisili_kabupaten_nama,
                    kecamatan: form.alamat_domisili_kecamatan,
                    kecamatan_nama: form.alamat_domisili_kecamatan_nama,
                    kelurahan: form.alamat_domisili_kelurahan,
                    kelurahan_nama: form.alamat_domisili_kelurahan_nama,
                  }}
                  onChange={onChange}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Kode Pos
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      name="alamat_domisili_kode_pos"
                      autoComplete="off"
                      value={form.alamat_domisili_kode_pos || ''}
                      onChange={onChange}
                      placeholder="mis. 90111"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Negara
                    </label>
                    <input
                      type="text"
                      name="alamat_domisili_negara"
                      autoComplete="off"
                      value={form.alamat_domisili_negara || 'Indonesia'}
                      onChange={onChange}
                      placeholder="mis. Indonesia"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Foto Pasien — opsional, boleh dilewati. Dua cara: ambil foto
              langsung dari kamera, atau upload file dari galeri/penyimpanan.
              Foto dikompres begitu dipilih, tapi BARU diupload ke server saat
              tombol "Simpan Foto" diklik — jadi kalau form dibatalkan sebelum
              itu, tidak ada file yang sempat terkirim ke storage.
              Setelah foto tersimpan, tombol berganti jadi Hapus / Ganti Foto. */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Foto Pasien <span className="text-gray-400 font-normal">(opsional)</span>
            </label>

            {/* Baris tombol Kamera/Upload — hanya tampil kalau belum ada foto
                sama sekali (belum tersimpan & tidak sedang pending). Kalau
                sudah ada foto, ganti foto lewat tombol "Ganti Foto" di bawah. */}
            {!fotoPreviewUrl && (
              <div className="flex gap-2">
                <label
                  className={`flex-1 text-center text-xs px-3 py-2 rounded-lg border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 cursor-pointer ${
                    fotoUploading ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  📷 Kamera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={onFotoChange}
                    disabled={fotoUploading}
                    className="hidden"
                  />
                </label>
                <label
                  className={`flex-1 text-center text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer ${
                    fotoUploading ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  🖼️ Upload File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onFotoChange}
                    disabled={fotoUploading}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Preview besar + aksi — tampil begitu ada foto (pending maupun
                yang sudah tersimpan). */}
            {fotoPreviewUrl && (
              <div className="mt-2">
                <img
                  src={fotoPreviewUrl}
                  alt="Pratinjau foto pasien"
                  className="w-full max-h-72 rounded-lg object-contain bg-gray-50 border"
                />
                <div className="flex gap-2 mt-2">
                  {fotoPending ? (
                    // Foto baru dipilih, belum diupload -> tombol Simpan Foto
                    <button
                      type="button"
                      onClick={onSimpanFoto}
                      disabled={fotoUploading}
                      className="flex-1 text-center text-xs px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50"
                    >
                      {fotoUploading ? 'Menyimpan...' : '✓ Simpan Foto'}
                    </button>
                  ) : (
                    // Foto sudah tersimpan -> tombol Hapus & Ganti Foto
                    <>
                      <button
                        type="button"
                        onClick={onHapusFoto}
                        disabled={fotoUploading}
                        className="flex-1 text-center text-xs px-3 py-2 rounded-lg border border-red-300 text-red-600 bg-red-50 hover:bg-red-100 font-medium disabled:opacity-50"
                      >
                        🗑️ Hapus
                      </button>
                      <label
                        className={`flex-1 text-center text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer font-medium ${
                          fotoUploading ? 'opacity-50 pointer-events-none' : ''
                        }`}
                      >
                        🔄 Ganti Foto
                        <input
                          type="file"
                          accept="image/*"
                          onChange={onFotoChange}
                          disabled={fotoUploading}
                          className="hidden"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}
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