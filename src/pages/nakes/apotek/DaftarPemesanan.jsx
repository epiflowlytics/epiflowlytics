import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../../lib/supabaseClient'

/**
 * DaftarPemesanan
 * Menampilkan riwayat pesanan yang sudah disimpan dari form PesananBaru.
 *
 * Props:
 *  - profile      : objek profil user yang login ({ id, instansi_id, nama_lengkap })
 *  - refreshKey   : angka/nilai yang berubah setiap kali ada pesanan baru disimpan (opsional)
 *  - onPesananBaru: fungsi untuk pindah ke tab "Pesanan Baru" (opsional)
 */

const TUJUAN_LABEL = {
  GFK: "GFK / Gudang Farmasi",
  SWASTA: "Swasta / PBF",
  BPJS: "BPJS",
  PKM: "Puskesmas Lain",
  LLN: "Lain-lain",
};

const STATUS_META = {
  diajukan: { label: "Diajukan", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  diproses: { label: "Diproses", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  diterima: { label: "Diterima", cls: "bg-green-100 text-green-800 border-green-200" },
  dibatalkan: { label: "Dibatalkan", cls: "bg-red-100 text-red-800 border-red-200" },
};

// Alur status yang diizinkan dari status saat ini
const NEXT_STATUS = {
  diajukan: ["diproses", "dibatalkan"],
  diproses: ["diterima", "dibatalkan"],
  diterima: [],
  dibatalkan: [],
};

const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const tgl = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

// teks tujuan yang tampil: PKM -> nama puskesmas, SWASTA -> nama PBF, LLN -> tujuan yang diketik manual
const tujuanTeksDari = (r) => {
  if (r.tujuan === "PKM" && r.puskesmas_tujuan_nama) return r.puskesmas_tujuan_nama;
  if (r.tujuan === "SWASTA" && r.pbf_nama) return r.pbf_nama;
  if (r.tujuan === "LLN" && r.tujuan_lain) return r.tujuan_lain;
  return TUJUAN_LABEL[r.tujuan] || r.tujuan;
};

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const angka = (n) => new Intl.NumberFormat("id-ID").format(Number(n) || 0);

// total selalu dihitung dari item (untuk semua tujuan). Ada harga -> tampil total rupiah.
const hitungTotal = (items) => {
  const adaHarga = items.some((d) => d.harga_beli != null && Number(d.harga_beli) > 0);
  const totalHarga = items.reduce((s, d) => s + (Number(d.total_harga) || 0), 0);
  const totalBanyak = items.reduce((s, d) => s + (Number(d.jumlah) || 0), 0);
  return { adaHarga, totalHarga, totalBanyak };
};

// Isi lembar (HTML) — dipakai untuk preview, cetak PDF, dan Excel supaya tampilannya sama
function bangunLembarHtml(row, items, petugas, embed = false) {
  const { adaHarga, totalHarga, totalBanyak } = hitungTotal(items);
  const kolom = adaHarga ? 5 : 3;
  const baris = items
    .map(
      (d, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(d.nama_obat)}</td>
        <td class="r">${angka(d.jumlah)}</td>
        ${adaHarga ? `<td class="r">${esc(rupiah(d.harga_beli))}</td><td class="r">${esc(rupiah(d.total_harga))}</td>` : ""}
      </tr>`
    )
    .join("");
  const total = adaHarga
    ? `<tr class="t"><td colspan="2" class="r">Total</td><td class="r">${angka(totalBanyak)}</td><td></td><td class="r">${esc(rupiah(totalHarga))}</td></tr>`
    : `<tr class="t"><td colspan="2" class="r">Total Banyaknya</td><td class="r">${angka(totalBanyak)}</td></tr>`;

  return `
  <div class="kop">
    <div class="jdl">LEMBAR PESANAN</div>
    <div class="no">${esc(row.pemesanan_no || "-")}</div>
  </div>
  <table class="info">
    <tr><td class="k">Tanggal</td><td>: ${esc(tgl(row.tanggal))}</td><td class="k">Jenis Pesanan</td><td>: ${esc(row.jenis_obat || "-")}</td></tr>
    <tr><td class="k">Tujuan</td><td>: ${esc(tujuanTeksDari(row))}</td><td class="k">Petugas</td><td>: ${esc(petugas || "-")}</td></tr>
    <tr><td class="k">Status</td><td colspan="3">: ${esc((STATUS_META[row.status] || {}).label || row.status)}</td></tr>
  </table>
  <table class="dat">
    <thead><tr><th style="width:36px">No</th><th>Nama Pesanan</th><th style="width:90px">Banyaknya</th>${adaHarga ? '<th style="width:110px">Harga</th><th style="width:120px">Jumlah Harga</th>' : ""}</tr></thead>
    <tbody>${baris || `<tr><td colspan="${kolom}" class="c">Tidak ada item.</td></tr>`}</tbody>
    <tfoot>${items.length ? total : ""}</tfoot>
  </table>
  ${row.catatan ? `<div class="cat"><b>Catatan:</b> ${esc(row.catatan)}</div>` : ""}
  <table class="ttd"><tr>
    <td>Mengetahui,<br/>Kepala / Penanggung Jawab<div class="gar">(................................)</div></td>
    <td>Petugas Pemesan<div class="gar">${esc(petugas ? "(" + petugas + ")" : "(................................)")}</div></td>
  </tr></table>`;
}

const LEMBAR_CSS = `
  .lb{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12px}
  .lb .kop{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
  .lb .jdl{font-size:18px;font-weight:bold;letter-spacing:1px}
  .lb .no{font-family:monospace;font-size:13px;margin-top:2px}
  .lb table{width:100%;border-collapse:collapse}
  .lb .info td{padding:3px 4px;vertical-align:top}
  .lb .info td.k{width:15%;color:#444}
  .lb .dat{margin-top:12px}
  .lb .dat th,.lb .dat td{border:1px solid #111;padding:5px 6px}
  .lb .dat th{background:#eee;text-align:center}
  .lb .dat td.c{text-align:center}
  .lb .dat td.r{text-align:right}
  .lb .dat tr.t td{font-weight:bold;background:#f5f5f5}
  .lb .cat{margin-top:10px;padding:6px 8px;border:1px solid #bbb}
  .lb .ttd{margin-top:28px}
  .lb .ttd td{width:50%;text-align:center;vertical-align:top;padding:0 10px}
  .lb .gar{margin-top:56px}
`;

const namaFile = (row) => `Pesanan_${(row.pemesanan_no || "tanpa-nomor").replace(/[^\w-]+/g, "_")}`;

function unduhPdf(row, items, petugas) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(namaFile(row))}</title>
    <style>@page{size:A4;margin:14mm}body{margin:0}${LEMBAR_CSS}</style></head>
    <body><div class="lb">${bangunLembarHtml(row, items, petugas)}</div>
    <script>window.onload=function(){setTimeout(function(){window.focus();window.print()},250)}<\/script></body></html>`);
  w.document.close();
  return true;
}

function unduhExcel(row, items, petugas) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><style>${LEMBAR_CSS}
      table{border-collapse:collapse} td,th{mso-number-format:"\\@"}
    </style></head><body><div class="lb">${bangunLembarHtml(row, items, petugas)}</div></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${namaFile(row)}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, cls: "bg-gray-100 text-gray-700 border-gray-200" };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export default function DaftarPemesanan({ profile, refreshKey, onPesananBaru }) {
  const [rows, setRows] = useState([]);
  const [petugasMap, setPetugasMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notif, setNotif] = useState(null); // { type: 'ok'|'err', text }

  // filter
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("semua");
  const [fTujuan, setFTujuan] = useState("semua");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");

  // detail modal
  const [detailOpen, setDetailOpen] = useState(null); // header row
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // konfirmasi hapus / ubah status
  const [konfirmasi, setKonfirmasi] = useState(null); // { jenis:'hapus'|'status', row, statusBaru? }
  const [proses, setProses] = useState(false);

  const flash = (type, text) => {
    setNotif({ type, text });
    setTimeout(() => setNotif(null), 4000);
  };

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("pemesanan_obat")
        .select("*, pemesanan_obat_detail(jumlah, harga_beli, total_harga)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (err) throw err;

      const list = data || [];
      setRows(list);

      // ambil nama petugas
      const ids = [...new Set(list.map((r) => r.petugas_id).filter(Boolean))];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nama_lengkap")
          .in("id", ids);
        const m = {};
        (profs || []).forEach((p) => (m[p.id] = p.nama_lengkap));
        setPetugasMap(m);
      }
    } catch (e) {
      setError(e.message || "Gagal memuat daftar pesanan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat, refreshKey]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fStatus !== "semua" && r.status !== fStatus) return false;
      if (fTujuan !== "semua" && r.tujuan !== fTujuan) return false;
      if (dari && r.tanggal < dari) return false;
      if (sampai && r.tanggal > sampai) return false;
      if (kw) {
        const hay = [
          r.pemesanan_no,
          r.pbf_nama,
          r.puskesmas_tujuan_nama,
          r.tujuan_lain,
          r.petugas_nama,
          r.catatan,
          TUJUAN_LABEL[r.tujuan],
          petugasMap[r.petugas_id],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [rows, q, fStatus, fTujuan, dari, sampai, petugasMap]);

  const bukaDetail = async (row) => {
    setDetailOpen(row);
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("pemesanan_obat_detail")
        .select("*")
        .eq("pemesanan_id", row.id)
        .order("created_at", { ascending: true });
      if (err) throw err;
      setDetailItems(data || []);
    } catch (e) {
      flash("err", "Gagal memuat detail: " + (e.message || e));
    } finally {
      setDetailLoading(false);
    }
  };

  const jalankanKonfirmasi = async () => {
    if (!konfirmasi) return;
    setProses(true);
    try {
      if (konfirmasi.jenis === "status") {
        const { error: err } = await supabase
          .from("pemesanan_obat")
          .update({ status: konfirmasi.statusBaru, updated_at: new Date().toISOString() })
          .eq("id", konfirmasi.row.id);
        if (err) throw err;
        flash("ok", `Status ${konfirmasi.row.pemesanan_no} diubah menjadi "${STATUS_META[konfirmasi.statusBaru].label}"`);
        if (detailOpen && detailOpen.id === konfirmasi.row.id) {
          setDetailOpen({ ...detailOpen, status: konfirmasi.statusBaru });
        }
      } else if (konfirmasi.jenis === "hapus") {
        // hapus detail dulu (FK), baru header
        const { error: e1 } = await supabase
          .from("pemesanan_obat_detail")
          .delete()
          .eq("pemesanan_id", konfirmasi.row.id);
        if (e1) throw e1;
        const { error: e2 } = await supabase
          .from("pemesanan_obat")
          .delete()
          .eq("id", konfirmasi.row.id);
        if (e2) throw e2;
        flash("ok", `Pesanan ${konfirmasi.row.pemesanan_no} dihapus`);
        if (detailOpen && detailOpen.id === konfirmasi.row.id) setDetailOpen(null);
      }
      setKonfirmasi(null);
      await muat();
    } catch (e) {
      flash("err", "Gagal: " + (e.message || e));
    } finally {
      setProses(false);
    }
  };

  const resetFilter = () => {
    setQ("");
    setFStatus("semua");
    setFTujuan("semua");
    setDari("");
    setSampai("");
  };

  const adaFilter = q || fStatus !== "semua" || fTujuan !== "semua" || dari || sampai;
  const petugasDetail = detailOpen ? detailOpen.petugas_nama || petugasMap[detailOpen.petugas_id] || "" : "";
  const lembarHtml = useMemo(
    () => (detailOpen ? bangunLembarHtml(detailOpen, detailItems, petugasDetail) : ""),
    [detailOpen, detailItems, petugasDetail]
  );

  return (
    <div className="space-y-4">
      {/* Notifikasi */}
      {notif && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium border ${
            notif.type === "ok"
              ? "bg-green-50 text-green-800 border-green-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {notif.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Daftar Pesanan</h2>
          <p className="text-sm text-gray-500">Riwayat pesanan yang sudah disimpan</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={muat}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
          >
            ↻ Muat Ulang
          </button>
          {onPesananBaru && (
            <button
              onClick={onPesananBaru}
              className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
            >
              + Pesanan Baru
            </button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white border rounded-xl p-3 grid grid-cols-1 md:grid-cols-6 gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari no. pesanan, PBF, tujuan, petugas…"
          className="md:col-span-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="semua">Semua Status</option>
          {Object.entries(STATUS_META).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={fTujuan}
          onChange={(e) => setFTujuan(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="semua">Semua Tujuan</option>
          {Object.entries(TUJUAN_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dari}
          onChange={(e) => setDari(e.target.value)}
          title="Dari tanggal"
          className="border rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={sampai}
          onChange={(e) => setSampai(e.target.value)}
          title="Sampai tanggal"
          className="border rounded-lg px-3 py-2 text-sm"
        />
        {adaFilter && (
          <button
            onClick={resetFilter}
            className="md:col-span-6 text-xs text-purple-700 hover:underline text-left"
          >
            Reset semua filter
          </button>
        )}
      </div>

      {/* Tabel */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500 text-sm">Memuat data…</div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">
            {rows.length === 0 ? "Belum ada pesanan yang tersimpan." : "Tidak ada pesanan yang cocok dengan filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-purple-50 text-purple-900">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">No. Pemesanan</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Tanggal</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Tujuan</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Jenis</th>
                  <th className="text-center px-3 py-2.5 font-semibold">Item</th>
                  <th className="text-right px-3 py-2.5 font-semibold" title="Rupiah bila ada harga, selain itu total banyaknya">Total</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Petugas</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => {
                  const det = r.pemesanan_obat_detail || [];
                  const jml = det.length;
                  const tt = hitungTotal(det);
                  const tujuanTeks = tujuanTeksDari(r);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-800">
                        {r.pemesanan_no || "-"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{tgl(r.tanggal)}</td>
                      <td className="px-3 py-2.5">{tujuanTeks}</td>
                      <td className="px-3 py-2.5">{r.jenis_obat || "-"}</td>
                      <td className="px-3 py-2.5 text-center">{jml}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {tt.adaHarga ? (
                          rupiah(tt.totalHarga)
                        ) : tt.totalBanyak > 0 ? (
                          <span title="Total banyaknya pesanan (tanpa harga)">{angka(tt.totalBanyak)}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2.5">{r.petugas_nama || petugasMap[r.petugas_id] || "-"}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => bukaDetail(r)}
                          className="px-2.5 py-1 text-xs rounded-md bg-purple-100 text-purple-800 hover:bg-purple-200 font-semibold"
                        >
                          Detail
                        </button>
                        <button
                          onClick={() => setKonfirmasi({ jenis: "hapus", row: r })}
                          className="ml-1.5 px-2.5 py-1 text-xs rounded-md bg-red-100 text-red-700 hover:bg-red-200 font-semibold"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="px-3 py-2 text-xs text-gray-500 border-t bg-gray-50">
            Menampilkan {filtered.length} dari {rows.length} pesanan
          </div>
        )}
      </div>

      {/* Modal detail */}
      {detailOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setDetailOpen(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b">
              <div>
                <div className="font-mono text-sm text-gray-500">{detailOpen.pemesanan_no}</div>
                <h3 className="text-lg font-bold text-gray-800">Detail Pesanan</h3>
              </div>
              <button
                onClick={() => setDetailOpen(null)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4 bg-gray-100">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-500">Status:</span>
                <StatusBadge status={detailOpen.status} />
              </div>

              {/* Preview satu lembar kertas (A4) */}
              {detailLoading ? (
                <div className="text-sm text-gray-500 py-10 text-center">Memuat item…</div>
              ) : (
                <div className="overflow-x-auto">
                  <div
                    className="mx-auto bg-white shadow-md border border-gray-300"
                    style={{ width: "210mm", maxWidth: "100%", minHeight: "120mm", padding: "14mm 12mm" }}
                  >
                    <style>{LEMBAR_CSS}</style>
                    <div className="lb" dangerouslySetInnerHTML={{ __html: lembarHtml }} />
                  </div>
                </div>
              )}

              {/* Tombol unduh di bawah kertas */}
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => {
                    if (!unduhPdf(detailOpen, detailItems, petugasDetail))
                      flash("err", "Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.");
                  }}
                  disabled={detailLoading}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
                >
                  ⬇ Download PDF
                </button>
                <button
                  onClick={() => unduhExcel(detailOpen, detailItems, petugasDetail)}
                  disabled={detailLoading}
                  className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-50"
                >
                  ⬇ Download Excel
                </button>
              </div>
              <p className="text-center text-xs text-gray-500">
                PDF: di jendela cetak pilih tujuan "Simpan sebagai PDF". Ukuran A4, satu lembar.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 p-5 border-t bg-gray-50 rounded-b-2xl">
              <div className="flex flex-wrap gap-2">
                {(NEXT_STATUS[detailOpen.status] || []).map((s) => (
                  <button
                    key={s}
                    onClick={() => setKonfirmasi({ jenis: "status", row: detailOpen, statusBaru: s })}
                    className={`px-3 py-2 text-sm rounded-lg font-semibold ${
                      s === "dibatalkan"
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-purple-600 text-white hover:bg-purple-700"
                    }`}
                  >
                    {s === "diproses" && "Tandai Diproses"}
                    {s === "diterima" && "Tandai Diterima"}
                    {s === "dibatalkan" && "Batalkan Pesanan"}
                  </button>
                ))}
              </div>
              {["diajukan", "dibatalkan"].includes(detailOpen.status) && (
                <button
                  onClick={() => setKonfirmasi({ jenis: "hapus", row: detailOpen })}
                  className="px-3 py-2 text-sm rounded-lg border border-red-300 text-red-700 hover:bg-red-50"
                >
                  Hapus
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog konfirmasi */}
      {konfirmasi && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <h4 className="text-lg font-bold text-gray-800 mb-2">
              {konfirmasi.jenis === "hapus" ? "Hapus pesanan?" : "Ubah status pesanan?"}
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              {konfirmasi.jenis === "hapus" ? (
                <>
                  Pesanan <b>{konfirmasi.row.pemesanan_no}</b> beserta semua itemnya akan dihapus permanen.
                </>
              ) : (
                <>
                  Status <b>{konfirmasi.row.pemesanan_no}</b> akan diubah menjadi{" "}
                  <b>{STATUS_META[konfirmasi.statusBaru].label}</b>.
                  {konfirmasi.statusBaru === "diterima" && (
                    <span className="block mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      Catatan: menandai "Diterima" belum menambah stok obat. Penambahan stok dilakukan lewat
                      menu penerimaan/Stok Obat.
                    </span>
                  )}
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setKonfirmasi(null)}
                disabled={proses}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={jalankanKonfirmasi}
                disabled={proses}
                className={`px-4 py-2 text-sm rounded-lg font-semibold text-white disabled:opacity-60 ${
                  konfirmasi.jenis === "hapus" || konfirmasi.statusBaru === "dibatalkan"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-purple-600 hover:bg-purple-700"
                }`}
              >
                {proses ? "Memproses…" : "Ya, Lanjutkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}