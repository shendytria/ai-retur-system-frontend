"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Package, TrendingDown, DollarSign, ShieldAlert,
  CheckCircle2, Filter, LogOut, Check, X, BarChart3, PieChart as PieIcon, ScrollText
} from "lucide-react";
// [AUTH] helper login: token, fetch ber-token, cek hak akses
import { authFetch, can, getToken, getUser, logout, type AuthUser } from "@/app/lib/auth";
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from "recharts";

interface Summary {
  total_sku: number;
  high_risk_sku_count: number;
  total_sales_rupiah: number;
  total_return_rupiah: number;
  mitigasi_count: number;
}

interface SKUItem {
  sku_code: string;
  product_name: string;
  category: string;
  risk_score: number;
  status: string;
  is_mitigated: boolean;
  mitigation_info?: { action_type: string; notes: string; created_at: string; user_pic: string };
}

export default function App() {
  // [AUTH] User yang sedang login (diisi dari sesi setelah login di /login)
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  // State Data & Filter
  const [summary, setSummary] = useState<Summary | null>(null);
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [barData, setBarData] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<"ALL" | "HIGH_RISK">("HIGH_RISK");
  const [loading, setLoading] = useState(true);

  // State Modal Mitigasi
  const [mitigasiModal, setMitigasiModal] = useState<SKUItem | null>(null);
  const [actionType, setActionType] = useState("Transfer Stok");
  const [mitigasiNotes, setMitigasiNotes] = useState("");

  // [THRESHOLD] threshold saat ini + form ubah (hanya Data/AI Admin yang melihat form)
  const [thresholdInfo, setThresholdInfo] = useState<{
    threshold: number; updated_by: string | null; updated_at: string | null; high_risk_count: number; total_scored: number;
  } | null>(null);
  const [thresholdInput, setThresholdInput] = useState("");       // dalam persen, mis. "60"
  const [thresholdPreview, setThresholdPreview] = useState<number | null>(null);
  const [savingThreshold, setSavingThreshold] = useState(false);

  const fetchThreshold = async () => {
    const res = await authFetch("/api/threshold");
    if (!res.ok) return;
    const data = await res.json();
    setThresholdInfo(data);
    setThresholdInput(String(Math.round(data.threshold * 10000) / 100));
  };

  // Persen (input) -> skala 0-1; null jika tidak valid
  const parseThreshold = (v: string): number | null => {
    const n = Number(v.replace(",", "."));
    if (!v.trim() || Number.isNaN(n) || n <= 0 || n >= 100) return null;
    return n / 100;
  };

  const handleSaveThreshold = async () => {
    const value = parseThreshold(thresholdInput);
    if (value === null) {
      alert("Threshold harus di antara 0 dan 100 (persen).");
      return;
    }
    if (!confirm(`Ubah threshold menjadi ${thresholdInput}%? Status HIGH RISK semua SKU akan dihitung ulang.`)) return;
    setSavingThreshold(true);
    try {
      const res = await authFetch("/api/threshold", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.detail === "string" ? data.detail : "Gagal mengubah threshold.");
        return;
      }
      await fetchThreshold();
      refreshData();
    } catch {
      alert("Tidak dapat terhubung ke server. Pastikan backend (port 8000) berjalan.");
    } finally {
      setSavingThreshold(false);
    }
  };

  const refreshData = async () => {
    try {
      // [AUTH] authFetch otomatis menambah token & redirect ke /login jika sesi habis
      const [sumRes, skusRes, pieRes, barRes] = await Promise.all([
        authFetch("/api/dashboard/summary"),
        authFetch(`/api/dashboard/high-risk-skus?status_filter=${filterType}`),
        authFetch("/api/dashboard/chart-alasan-retur"),
        authFetch("/api/dashboard/chart-top-risk"),
      ]);
      if (!sumRes.ok || !skusRes.ok || !pieRes.ok || !barRes.ok) return;
      setSummary(await sumRes.json());
      setSkus(await skusRes.json());
      setPieData(await pieRes.json());
      setBarData(await barRes.json());
      fetchThreshold();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // [AUTH] belum login -> ke halaman /login
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    refreshData();
  }, [filterType]);

  // [THRESHOLD] pratinjau jumlah SKU HIGH RISK saat nilai diketik (khusus yang berhak mengubah)
  useEffect(() => {
    if (!can(user, "threshold_edit")) return;
    const value = parseThreshold(thresholdInput);
    if (value === null) { setThresholdPreview(null); return; }
    const t = setTimeout(async () => {
      const res = await authFetch(`/api/threshold/preview?value=${value}`);
      if (res.ok) setThresholdPreview((await res.json()).high_risk_count);
    }, 400);
    return () => clearTimeout(t);
  }, [thresholdInput, user]);

  // [MITIGASI] Buka modal; kalau SKU sudah punya mitigasi (Edit Tindakan), isi form dengan data lama
  const openMitigasi = (item: SKUItem) => {
    setActionType(item.mitigation_info?.action_type ?? "Transfer Stok");
    setMitigasiNotes(item.mitigation_info?.notes === "-" ? "" : item.mitigation_info?.notes ?? "");
    setMitigasiModal(item);
  };

  const handleSaveMitigasi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mitigasiModal) return;

    try {
      // [AUTH] PIC diambil backend dari user yang login, bukan dari input frontend
      const res = await authFetch("/api/mitigasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_code: mitigasiModal.sku_code,
          action_type: actionType,
          notes: mitigasiNotes,
        }),
      });
      if (!res.ok) {
        // Modal tetap terbuka supaya isian tidak hilang
        const err = await res.json().catch(() => ({}));
        alert(typeof err.detail === "string" ? err.detail : "Gagal menyimpan mitigasi.");
        return;
      }
    } catch {
      alert("Tidak dapat terhubung ke server. Pastikan backend (port 8000) berjalan.");
      return;
    }

    setMitigasiModal(null);
    setMitigasiNotes("");
    refreshData();
  };

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-16 font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-8 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-bold text-white text-base shadow-sm">
            K
          </div>
          <div>
            <span className="font-bold text-slate-900 tracking-tight text-lg">ONEKalbe EWS</span>
            <span className="text-xs text-slate-400 block -mt-0.5">Sistem AI Prediksi Obsolete • PT Kalbe Farma & PT Saka Farma</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* [AUDIT] tautan audit trail: hanya Supply Chain & Data/AI Admin */}
          {can(user, "audit_view") && (
            <Link
              href="/audit-trail"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
            >
              <ScrollText className="w-3.5 h-3.5" /> Audit Trail
            </Link>
          )}
          {user && (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-full">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-medium text-slate-700">{user.full_name} ({user.role_label})</span>
              <button onClick={logout} title="Keluar" className="text-slate-400 hover:text-red-600">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-8 pt-8 space-y-6">
        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total SKU</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{summary?.total_sku ?? "..."}</p>
            </div>
            <Package className="w-8 h-8 text-blue-500 bg-blue-50 p-1.5 rounded-lg" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm flex items-center justify-between bg-gradient-to-br from-white to-red-50/30">
            <div>
              <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">High Risk SKU</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{summary?.high_risk_sku_count ?? "..."}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500 bg-red-50 p-1.5 rounded-lg" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between bg-gradient-to-br from-white to-emerald-50/30">
            <div>
              <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Mitigasi Selesai</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{summary?.mitigasi_count ?? 0}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-emerald-600 bg-emerald-50 p-1.5 rounded-lg" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nilai Penjualan</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatRupiah(summary?.total_sales_rupiah || 0)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-emerald-500 bg-emerald-50 p-1.5 rounded-lg" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kerugian Retur</p>
              <p className="text-lg font-bold text-amber-600 mt-1">{formatRupiah(summary?.total_return_rupiah || 0)}</p>
            </div>
            <TrendingDown className="w-8 h-8 text-amber-500 bg-amber-50 p-1.5 rounded-lg" />
          </div>
        </div>

        {/* Tableau / Looker Style Visual Analytics Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chart 1: Donut Breakdown Alasan Retur */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <PieIcon className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-sm text-slate-800">Komposisi Alasan Retur (Finansial)</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatRupiah(Number(value))} />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Top SKU dengan Risiko AI Tertinggi */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <BarChart3 className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-sm text-slate-800">Top 6 SKU Probabilitas Risiko Obsolete</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: any) => `${val}%`} />
                  <Bar dataKey="score" fill="#EF4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* [THRESHOLD] Ambang batas risiko: semua role melihat nilainya, hanya Data/AI Admin yang bisa mengubah */}
        {thresholdInfo && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Ambang Batas Risiko (Threshold)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                SKU dengan skor ≥ <span className="font-bold text-slate-800">{(thresholdInfo.threshold * 100).toFixed(0)}%</span> ditandai HIGH RISK
                {" "}({thresholdInfo.high_risk_count} dari {thresholdInfo.total_scored} skor).
                {thresholdInfo.updated_by && (
                  <span className="text-slate-400"> Terakhir diubah oleh {thresholdInfo.updated_by}{thresholdInfo.updated_at ? `, ${thresholdInfo.updated_at}` : ""}.</span>
                )}
              </p>
            </div>

            {can(user, "threshold_edit") && (
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    className="w-20 px-3 py-1.5 text-xs text-slate-900 focus:outline-none"
                    aria-label="Threshold dalam persen"
                  />
                  <span className="px-2 text-xs text-slate-500 bg-slate-50 border-l border-slate-300 py-1.5">%</span>
                </div>
                <span className="text-[11px] text-slate-500 min-w-[9rem]">
                  {thresholdPreview !== null ? `→ ${thresholdPreview} skor HIGH RISK` : ""}
                </span>
                <button
                  onClick={handleSaveThreshold}
                  disabled={savingThreshold || parseThreshold(thresholdInput) === null || parseThreshold(thresholdInput) === thresholdInfo.threshold}
                  className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                >
                  {savingThreshold ? "Menyimpan..." : "Simpan & Hitung Ulang"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Operational Table Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">Tindakan Mitigasi Dini SKU (Operational Queue)</h2>
                <p className="text-xs text-slate-400">Monitoring level SKU terotomasi model Gradient Boosting</p>
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-2 bg-slate-200/70 p-1 rounded-lg">
              <button
                onClick={() => setFilterType("HIGH_RISK")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                  filterType === "HIGH_RISK" ? "bg-white text-red-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Hanya High Risk
              </button>
              <button
                onClick={() => setFilterType("ALL")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                  filterType === "ALL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Semua Status
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Kode SKU</th>
                  <th className="px-6 py-3.5">Nama Produk</th>
                  <th className="px-6 py-3.5">Kategori</th>
                  <th className="px-6 py-3.5 text-center">Skor Risiko (AI)</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-center">Mitigasi</th>
                  <th className="px-6 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {skus.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-3 font-mono font-semibold text-slate-800 text-xs">{item.sku_code}</td>
                    <td className="px-6 py-3 font-medium text-slate-900 text-xs">{item.product_name}</td>
                    <td className="px-6 py-3">
                      <span className="inline-block bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium text-slate-600">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`font-mono font-bold text-xs ${item.risk_score >= 0.5 ? "text-red-600" : "text-emerald-600"}`}>
                        {(item.risk_score * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === "HIGH RISK" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      {item.is_mitigated ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <Check className="w-3 h-3" /> {item.mitigation_info?.action_type}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Belum Ada</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {/* [AUTH] tombol mitigasi hanya untuk role dengan hak input mitigasi (Supply Chain) */}
                      {can(user, "mitigasi_edit") ? (
                        <button
                          onClick={() => openMitigasi(item)}
                          className={`text-xs font-semibold px-3 py-1 rounded-lg border transition ${
                            item.is_mitigated
                              ? "bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100"
                              : "bg-blue-600 border-blue-600 text-white hover:bg-blue-700 shadow-sm"
                          }`}
                        >
                          {item.is_mitigated ? "Edit Tindakan" : "Catat Mitigasi"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Hanya lihat</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* [AUTH] Modal simulasi login dihapus: login kini di halaman /login */}

      {/* MODAL: Catat Tindakan Mitigasi */}
      {mitigasiModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Catat Tindakan Mitigasi</h3>
                <p className="text-xs font-mono text-slate-500">{mitigasiModal.sku_code} - {mitigasiModal.product_name}</p>
              </div>
              <button onClick={() => setMitigasiModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMitigasi} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Rekomendasi Tindakan</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 focus:outline-blue-500 bg-white"
                >
                  <option value="Transfer Stok">Transfer Stok (Pindah ke DC/Cabang Cepat Laku)</option>
                  <option value="Program Diskon Khusus">Program Diskon Khusus (Flash Sale/Bundling)</option>
                  <option value="Retur Terjadwal">Retur Terjadwal ke Principal Lebih Awal</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">PIC Pelaksana</label>
                <input
                  type="text"
                  readOnly
                  value={user ? `${user.full_name} (${user.role_label})` : ""}
                  className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2 text-slate-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Catatan Mitigasi / Detail Instruksi</label>
                <textarea
                  rows={3}
                  value={mitigasiNotes}
                  onChange={(e) => setMitigasiNotes(e.target.value)}
                  placeholder="Contoh: Realokasi 500 unit ke DC Bandung karena laju permintaan tinggi..."
                  className="w-full border border-slate-300 rounded-lg p-2 focus:outline-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMitigasiModal(null)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 shadow-sm"
                >
                  Simpan Tindakan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}