"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  TrendingDown,
  ShieldCheck,
  DollarSign,
  PackageCheck,
  Search,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { authFetch, can, getToken, getUser, API_URL, type AuthUser } from "@/app/lib/auth";

interface DampakItem {
  id: number;
  sku_code: string;
  product_name: string;
  category: string;
  action_type: string;
  notes: string;
  user_pic: string;
  tanggal_mitigasi: string;
  skor_sebelum: number;
  skor_sesudah: number;
  efektivitas_persen: number;
  nilai_risiko_sebelum: number;
  nilai_risiko_sesudah: number;
  penghematan: number;
}

interface DampakSummary {
  total_sku_mitigasi: number;
  total_nilai_sebelum: number;
  total_nilai_sesudah: number;
  total_penghematan: number;
  rasio_efektivitas_persen: number;
  breakdown_tindakan: Record<
    string,
    { count: number; penghematan: number; sebelum: number; sesudah: number }
  >;
  generated_at: string;
}

export default function LaporanDampakPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [summary, setSummary] = useState<DampakSummary | null>(null);
  const [items, setItems] = useState<DampakItem[]>([]);

  // Filter
  const [fSumber, setFSumber] = useState("");
  const [fKategori, setFKategori] = useState("");
  const [fSearch, setFSearch] = useState("");
  const [fQuery, setFQuery] = useState("");
  const [filterOpts, setFilterOpts] = useState<{ sumber: string[]; kategori: string[] }>({
    sumber: [],
    kategori: [],
  });

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const filterQS = () => {
    const p = new URLSearchParams();
    if (fSumber) p.set("sumber", fSumber);
    if (fKategori) p.set("kategori", fKategori);
    if (fQuery.trim()) p.set("q", fQuery.trim());
    return p.toString();
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterQS();
      const res = await authFetch(`/api/laporan-dampak?${qs}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setItems(data.items);
      }
    } catch (err) {
      console.error("Gagal memuat laporan dampak:", err);
    } finally {
      setLoading(false);
    }
  }, [fSumber, fKategori, fQuery]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const cur = getUser();
    setUser(cur);

    // Ambil opsi filter
    authFetch("/api/dashboard/filter-options")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFilterOpts({ sumber: d.sumber || [], kategori: d.kategori || [] }))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    if (user && can(user, "laporan_export")) {
      loadData();
    }
  }, [user, loadData]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setFQuery(fSearch), 400);
    return () => clearTimeout(t);
  }, [fSearch]);

  const handleExport = async (format: "excel" | "pdf") => {
    const setExporting = format === "excel" ? setExportingExcel : setExportingPdf;
    setExporting(true);
    try {
      const qs = filterQS();
      const token = getToken();
      const res = await fetch(`${API_URL}/api/laporan-dampak/export/${format}?${qs}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        alert(`Gagal mengekspor laporan ${format.toUpperCase()}: ${errJson.detail || res.statusText || "Status " + res.status}`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.download = `Laporan_Dampak_Mitigasi_${dateStr}.${format === "excel" ? "xlsx" : "pdf"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert(`Terjadi kesalahan saat mengunduh file ${format}: ${err?.message || "Koneksi gagal"}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await authFetch("/api/mitigasi/seed-demo", { method: "POST" });
      if (res.ok) {
        await loadData();
      } else {
        alert("Gagal menambahkan contoh data mitigasi.");
      }
    } catch {
      alert("Gagal terhubung ke server backend.");
    } finally {
      setSeeding(false);
    }
  };

  // Cek Hak Akses (URS: Hanya Manajemen dan Data / AI Admin)
  if (user && !can(user, "laporan_export")) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg border border-slate-200">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">Akses Dibatasi</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Sesuai matriks otorisasi URS (User Requirements Specification), halaman{" "}
            <strong>Laporan Dampak Finansial</strong> hanya dapat diakses oleh role{" "}
            <strong>Manajemen</strong> dan <strong>Data / AI Admin</strong>.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4" /> Kembali ke Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-20 font-sans">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-8 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="Kembali ke Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="h-10 w-10 flex items-center justify-center">
            <img src="/kalbe-logo.png" alt="Kalbe Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 tracking-tight text-base">ONEKalbe EWS</span>
            </div>
            <span className="text-[11px] text-slate-400 block -mt-0.5">
              Monitoring efektivitas & estimasi kerugian obsolete yang terselamatkan
            </span>
          </div>
        </div>

        {/* Action Buttons: Sesuai URS hanya Export Excel & PDF */}
        <div className="flex items-center gap-2.5">
          {items.length === 0 && (
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition shadow-sm"
              title="Isi contoh tindakan mitigasi pada SKU High Risk untuk simulasi"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {seeding ? "Memuat..." : "Isi Contoh Mitigasi"}
            </button>
          )}

          <button
            onClick={() => handleExport("excel")}
            disabled={exportingExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {exportingExcel ? "Mengunduh..." : "Export Excel (.xlsx)"}
          </button>

          <button
            onClick={() => handleExport("pdf")}
            disabled={exportingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 shadow-sm transition"
          >
            <FileText className="w-4 h-4" />
            {exportingPdf ? "Membuat PDF..." : "Export PDF (.pdf)"}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-8 pt-6 space-y-6">
        {/* Filter Bar */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3.5 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Sumber / Area</label>
            <select
              value={fSumber}
              onChange={(e) => setFSumber(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 min-w-[8rem]"
            >
              <option value="">Semua Sumber</option>
              {filterOpts.sumber.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Kategori</label>
            <select
              value={fKategori}
              onChange={(e) => setFKategori(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 min-w-[8rem]"
            >
              <option value="">Semua Kategori</option>
              {filterOpts.kategori.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Cari SKU / Produk</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={fSearch}
                onChange={(e) => setFSearch(e.target.value)}
                placeholder="Nama produk atau kode SKU"
                className="text-xs border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 w-60 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {(fSumber || fKategori || fSearch) && (
            <button
              onClick={() => {
                setFSumber("");
                setFKategori("");
                setFSearch("");
              }}
              className="text-xs font-semibold text-slate-600 hover:text-red-600 border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
            >
              Reset Filter
            </button>
          )}

          <div className="ml-auto text-right">
            <span className="text-xs text-slate-400">
              Terakhir diperbarui: <span className="font-medium text-slate-600">{summary?.generated_at || "-"}</span>
            </span>
          </div>
        </div>

        {/* Executive Summary (KPI Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">SKU Dimitigasi</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{summary?.total_sku_mitigasi ?? 0}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Tindakan operasional aktif</p>
            </div>
            <PackageCheck className="w-9 h-9 text-blue-500 bg-blue-50 p-2 rounded-xl" />
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Risiko Sebelum Mitigasi</p>
              <p className="text-lg font-bold text-red-600 mt-1">{formatRupiah(summary?.total_nilai_sebelum ?? 0)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Total potensi kerugian awal</p>
            </div>
            <TrendingDown className="w-9 h-9 text-red-500 bg-red-50 p-2 rounded-xl" />
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Risiko Residual (Sesudah)</p>
              <p className="text-lg font-bold text-slate-700 mt-1">{formatRupiah(summary?.total_nilai_sesudah ?? 0)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Eksposur setelah intervensi</p>
            </div>
            <DollarSign className="w-9 h-9 text-slate-500 bg-slate-50 p-2 rounded-xl" />
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-xl text-white shadow-md flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Kerugian Yang Dicegah</p>
              <p className="text-xl font-extrabold mt-1">{formatRupiah(summary?.total_penghematan ?? 0)}</p>
              <p className="text-[11px] text-emerald-100 mt-0.5">
                Efektivitas: <span className="font-bold">{summary?.rasio_efektivitas_persen ?? 0}%</span> terselamatkan
              </p>
            </div>
            <ShieldCheck className="w-10 h-10 text-emerald-200 bg-white/20 p-2 rounded-xl backdrop-blur-sm" />
          </div>
        </div>

        {/* Breakdown per Jenis Tindakan Mitigasi */}
        {summary?.breakdown_tindakan && summary.total_sku_mitigasi > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Dampak Finansial per Jenis Tindakan Mitigasi
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(summary.breakdown_tindakan).map(([action, stats]) => (
                <div key={action} className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{action}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                      {stats.count} SKU
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 flex justify-between pt-1">
                    <span>Risiko Awal:</span>
                    <span className="font-mono text-slate-700">{formatRupiah(stats.sebelum)}</span>
                  </div>
                  <div className="text-xs text-slate-600 flex justify-between">
                    <span>Potensi Terselamatkan:</span>
                    <span className="font-mono font-bold text-emerald-600">{formatRupiah(stats.penghematan)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabel Detail Laporan Dampak */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Rincian Dampak Finansial per SKU</h2>
              <p className="text-xs text-slate-400">
                Perbandingan nilai risiko sebelum dan sesudah tindakan mitigasi
              </p>
            </div>
            <span className="text-xs text-slate-500 font-medium">Total: {items.length} SKU</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">Kode SKU</th>
                  <th className="px-4 py-3">Nama Produk</th>
                  <th className="px-4 py-3">Tindakan Mitigasi</th>
                  <th className="px-4 py-3">PIC & Waktu</th>
                  <th className="px-4 py-3 text-center">Skor (Awal → Akhir)</th>
                  <th className="px-4 py-3 text-right">Risiko Sebelum</th>
                  <th className="px-4 py-3 text-right">Risiko Sesudah</th>
                  <th className="px-4 py-3 text-right font-bold text-emerald-700">Kerugian Dicegah</th>
                  <th className="px-4 py-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-xs text-slate-500">
                      <div className="max-w-md mx-auto space-y-3">
                        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                        <p className="text-slate-600 font-medium">
                          Belum ada tindakan mitigasi yang tercatat di database (atau untuk kriteria filter ini).
                        </p>
                        <p className="text-slate-400 text-[11px] leading-relaxed">
                          Sesuai alur BPMN URS, tindakan mitigasi dicatat terlebih dahulu oleh role <strong>Supply Chain</strong> pada antrean SKU berisiko tinggi.
                        </p>
                        <div className="flex items-center justify-center gap-2 pt-1">
                          <button
                            onClick={handleSeedDemo}
                            disabled={seeding}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {seeding ? "Menambahkan data..." : "Isi Contoh Data Mitigasi"}
                          </button>
                          {(fSumber || fKategori || fSearch) && (
                            <button
                              onClick={() => {
                                setFSumber("");
                                setFKategori("");
                                setFSearch("");
                              }}
                              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-600 hover:bg-slate-50 transition"
                            >
                              Reset Filter
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-800">{item.sku_code}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900 block">{item.product_name}</span>
                        <span className="text-[10px] text-slate-400">{item.category}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {item.action_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800 block text-[11px]">{item.user_pic}</span>
                        <span className="text-[10px] text-slate-400">{item.tanggal_mitigasi}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono text-red-600 font-semibold">
                          {(item.skor_sebelum * 100).toFixed(0)}%
                        </span>
                        <span className="text-slate-400 mx-1">→</span>
                        <span className="font-mono text-emerald-600 font-semibold">
                          {(item.skor_sesudah * 100).toFixed(0)}%
                        </span>
                        <span className="block text-[10px] text-emerald-600 font-medium">
                          (-{item.efektivitas_persen}%)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-800">
                        {formatRupiah(item.nilai_risiko_sebelum)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {formatRupiah(item.nilai_risiko_sesudah)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                        {formatRupiah(item.penghematan)}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-[11px] text-slate-500" title={item.notes}>
                        {item.notes}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-xs">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right uppercase tracking-wider text-slate-600">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-red-600">
                      {formatRupiah(summary?.total_nilai_sebelum ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {formatRupiah(summary?.total_nilai_sesudah ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600 text-sm">
                      {formatRupiah(summary?.total_penghematan ?? 0)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Legal ALCOA Statement */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-[11px] text-slate-500 flex items-center justify-between">
          <p>
            <strong>Pernyataan Kepatuhan ALCOA (Original & Attributable):</strong> Dokumen laporan dampak finansial ini
            dihasilkan secara elektronik oleh ONEKalbe EWS.
          </p>
          <span className="shrink-0 font-mono text-[10px] text-slate-400 ml-4">
            Generated: {summary?.generated_at}
          </span>
        </div>
      </main>
    </div>
  );
}
