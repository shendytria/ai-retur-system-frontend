"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Package, TrendingDown, DollarSign, ShieldAlert,
  CheckCircle2, Filter, LogOut, Check, X, BarChart3, PieChart as PieIcon,
  ScrollText, Bell, Search, FileSpreadsheet, LineChart as LineChartIcon,
  Building2, Layers, Calendar, RefreshCw, ShieldCheck, Sparkles
} from "lucide-react";
// [AUTH] helper login: token, fetch ber-token, cek hak akses
import { authFetch, can, getToken, getUser, logout, type AuthUser } from "@/app/lib/auth";
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area
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
  const [trendData, setTrendData] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<"ALL" | "HIGH_RISK">("HIGH_RISK");
  const [loading, setLoading] = useState(true);

  // State Modal Mitigasi
  const [mitigasiModal, setMitigasiModal] = useState<SKUItem | null>(null);
  const [actionType, setActionType] = useState("Transfer Stok");
  const [mitigasiNotes, setMitigasiNotes] = useState("");

  // [NOTIF] notifikasi SKU melewati threshold (khusus Supply Chain)
  interface NotifItem {
    id: number; sku_code: string; product_name: string; sumber: string; risk_score: number;
    estimasi_nilai_risiko: number; status: string; created_at: string;
    accepted_by: string | null; accepted_at: string | null; is_mitigated: boolean;
  }
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [notifBaru, setNotifBaru] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<"BARU" | "DITERIMA">("BARU");

  const fetchNotifs = async (tab: "BARU" | "DITERIMA" = notifTab) => {
    const res = await authFetch(`/api/notifikasi?status=${tab}`);
    if (!res.ok) return; // role tanpa hak notifikasi mendapat 403: abaikan
    const data = await res.json();
    setNotifs(data.items);
    setNotifBaru(data.baru_count);
  };

  const terimaNotif = async (id: number) => {
    const res = await authFetch(`/api/notifikasi/${id}/terima`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(typeof err.detail === "string" ? err.detail : "Gagal menerima notifikasi.");
    }
    fetchNotifs();
  };

  const terimaSemuaNotif = async () => {
    if (!confirm("Terima semua notifikasi baru?")) return;
    await authFetch("/api/notifikasi/terima-semua", { method: "POST" });
    fetchNotifs();
  };

  // Dari notifikasi langsung ke form mitigasi
  const mitigasiDariNotif = (n: NotifItem) => {
    const fromTable = skus.find((x) => x.sku_code === n.sku_code);
    openMitigasi(
      fromTable ?? {
        sku_code: n.sku_code, product_name: n.product_name, category: "-",
        risk_score: n.risk_score, status: "HIGH RISK", is_mitigated: false,
      }
    );
    setNotifOpen(false);
  };

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

  // [FILTER] filter dashboard: sumber (pengganti area), kategori, produk, periode
  const [fSumber, setFSumber] = useState("");
  const [fKategori, setFKategori] = useState("");
  const [fSearch, setFSearch] = useState("");   // yang diketik
  const [fQuery, setFQuery] = useState("");     // yang dikirim ke server (sudah di-debounce)
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [filterOpts, setFilterOpts] = useState<{ sumber: string[]; kategori: string[]; tanggal_min: string | null; tanggal_max: string | null }>(
    { sumber: [], kategori: [], tanggal_min: null, tanggal_max: null }
  );
  const reqId = useRef(0); // abaikan respons lama bila filter berubah cepat
  const filterActive = !!(fSumber || fKategori || fQuery || fFrom || fTo);
  const dateInvalid = !!(fFrom && fTo && fFrom > fTo);

  const filterQS = () => {
    const p = new URLSearchParams();
    if (fSumber) p.set("sumber", fSumber);
    if (fKategori) p.set("kategori", fKategori);
    if (fQuery.trim()) p.set("q", fQuery.trim());
    if (fFrom) p.set("date_from", fFrom);
    if (fTo) p.set("date_to", fTo);
    return p.toString();
  };

  const resetFilter = () => {
    setFSumber(""); setFKategori(""); setFSearch(""); setFQuery(""); setFFrom(""); setFTo("");
  };

  const refreshData = async () => {
    if (dateInvalid) return; // jangan kirim rentang tanggal terbalik
    const myReq = ++reqId.current;
    try {
      // [AUTH] authFetch otomatis menambah token & redirect ke /login jika sesi habis
      const qs = filterQS();
      const [sumRes, skusRes, pieRes, barRes, trendRes] = await Promise.all([
        authFetch(`/api/dashboard/summary?${qs}`),
        authFetch(`/api/dashboard/high-risk-skus?status_filter=${filterType}&${qs}`),
        authFetch(`/api/dashboard/chart-alasan-retur?${qs}`),
        authFetch(`/api/dashboard/chart-top-risk?${qs}`),
        authFetch(`/api/dashboard/chart-tren-bulanan?${qs}`),
      ]);
      if (!sumRes.ok || !skusRes.ok || !pieRes.ok || !barRes.ok) return;
      const [sumJ, skusJ, pieJ, barJ, trendJ] = await Promise.all([
        sumRes.json(),
        skusRes.json(),
        pieRes.json(),
        barRes.json(),
        trendRes.ok ? trendRes.json() : Promise.resolve([]),
      ]);
      if (myReq !== reqId.current) return; // sudah ada permintaan yang lebih baru
      setSummary(sumJ);
      setSkus(skusJ);
      setPieData(pieJ);
      setBarData(barJ);
      setTrendData(trendJ);
      fetchThreshold();
      if (can(getUser(), "notifikasi_accept")) fetchNotifs();
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
  }, [filterType, fSumber, fKategori, fQuery, fFrom, fTo]);

  // [FILTER] ambil pilihan dropdown sekali setelah login
  useEffect(() => {
    if (!getToken()) return;
    authFetch("/api/dashboard/filter-options")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFilterOpts(d))
      .catch(() => {});
  }, []);

  // [FILTER] debounce kotak cari produk
  useEffect(() => {
    const t = setTimeout(() => setFQuery(fSearch), 400);
    return () => clearTimeout(t);
  }, [fSearch]);

  // [NOTIF] segarkan notifikasi tiap 60 detik & saat berganti tab
  useEffect(() => {
    if (!can(user, "notifikasi_accept")) return;
    fetchNotifs(notifTab);
    const t = setInterval(() => fetchNotifs(notifTab), 60000);
    return () => clearInterval(t);
  }, [user, notifTab]);

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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-8 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 flex items-center justify-center">
            <img src="/kalbe-logo.png" alt="Kalbe Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 tracking-tight text-lg">ONEKalbe EWS</span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium -mt-0.5">
              Dashboard Prediksi Retur & Obsolete
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* [NOTIF] lonceng notifikasi: hanya Supply Chain / Gudang */}
          {can(user, "notifikasi_accept") && (
            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                aria-label={`Notifikasi, ${notifBaru} baru`}
              >
                <Bell className="w-4 h-4" />
                {notifBaru > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {notifBaru > 99 ? "99+" : notifBaru}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-[26rem] max-w-[92vw] bg-white rounded-xl border border-slate-200 shadow-xl z-40">
                  <div className="px-4 pt-3 pb-2 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900">Notifikasi SKU Berisiko Tinggi</h4>
                      <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Tutup">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 mt-2 bg-slate-100 p-0.5 rounded-lg w-fit">
                      {(["BARU", "DITERIMA"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setNotifTab(t)}
                          className={`px-3 py-1 text-[11px] font-semibold rounded-md ${notifTab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                        >
                          {t === "BARU" ? `Baru (${notifBaru})` : "Diterima"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                    {notifs.length === 0 && (
                      <p className="px-4 py-8 text-center text-xs text-slate-400 italic">
                        {notifTab === "BARU" ? "Tidak ada notifikasi baru." : "Belum ada notifikasi yang diterima."}
                      </p>
                    )}
                    {notifs.map((n) => (
                      <div key={n.id} className="px-4 py-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">{n.product_name}</p>
                            <p className="text-[11px] font-mono text-slate-500">{n.sku_code} • {n.sumber}</p>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-red-600 shrink-0">{(n.risk_score * 100).toFixed(1)}%</span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Estimasi nilai risiko: <span className="font-semibold text-amber-700">{formatRupiah(n.estimasi_nilai_risiko)}</span>
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {n.status === "DITERIMA" && n.accepted_by ? `Diterima oleh ${n.accepted_by} • ${n.accepted_at}` : `Masuk ${n.created_at}`}
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          {n.status === "BARU" && (
                            <button onClick={() => terimaNotif(n.id)} className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                              Terima
                            </button>
                          )}
                          {n.is_mitigated ? (
                            <span className="text-[11px] font-semibold text-emerald-600">Sudah ada mitigasi</span>
                          ) : (
                            <button onClick={() => mitigasiDariNotif(n)} className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                              Catat Mitigasi
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {notifTab === "BARU" && notifs.length > 1 && (
                    <div className="px-4 py-2 border-t border-slate-100 text-right">
                      <button onClick={terimaSemuaNotif} className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">
                        Terima semua
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* [AUDIT] tautan audit trail: hanya Supply Chain & Data/AI Admin */}
          {can(user, "audit_view") && (
            <Link
              href="/audit-trail"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
            >
              <ScrollText className="w-3.5 h-3.5" /> Audit Trail
            </Link>
          )}

          {/* [LAPORAN] tautan laporan dampak finansial: hanya Manajemen & Data/AI Admin (URS) */}
          {can(user, "laporan_export") && (
            <Link
              href="/laporan-dampak"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 rounded-lg px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100/70 transition shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Laporan Dampak
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
        {/* [FILTER] Bar filter dashboard modern & mudah dimengerti */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Filter Analisis Portofolio</h3>
            </div>
            {/* Quick Presets Sumber */}
            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setFSumber("")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  fSumber === "" ? "bg-slate-800 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setFSumber("KALBE")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  fSumber === "KALBE" ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Kalbe Farma
              </button>
              <button
                onClick={() => setFSumber("SAKA")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  fSumber === "SAKA" ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Saka Farma
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div>
          </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <Layers className="w-3 h-3 text-slate-400" /> Kategori Produk
              </label>
              <select
                value={fKategori}
                onChange={(e) => setFKategori(e.target.value)}
                className="text-xs border border-slate-300 rounded-xl px-3 py-2 bg-slate-50/50 hover:bg-white text-slate-800 min-w-[9rem] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Semua Kategori</option>
                {filterOpts.kategori.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <Search className="w-3 h-3 text-slate-400" /> Cari SKU / Produk
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={fSearch}
                  onChange={(e) => setFSearch(e.target.value)}
                  placeholder="Ketik nama produk atau kode..."
                  className="text-xs border border-slate-300 rounded-xl pl-8 pr-3 py-2 w-60 text-slate-800 bg-slate-50/50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <Calendar className="w-3 h-3 text-slate-400" /> Rentang Tanggal Transaksi
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={fFrom}
                  min={filterOpts.tanggal_min ?? undefined}
                  max={fTo || filterOpts.tanggal_max || undefined}
                  onChange={(e) => setFFrom(e.target.value)}
                  className="text-xs border border-slate-300 rounded-xl px-2.5 py-2 text-slate-800 bg-slate-50/50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="Tanggal awal"
                />
                <span className="text-xs text-slate-400 font-medium">s/d</span>
                <input
                  type="date"
                  value={fTo}
                  min={fFrom || filterOpts.tanggal_min || undefined}
                  max={filterOpts.tanggal_max ?? undefined}
                  onChange={(e) => setFTo(e.target.value)}
                  className="text-xs border border-slate-300 rounded-xl px-2.5 py-2 text-slate-800 bg-slate-50/50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="Tanggal akhir"
                />
              </div>
            </div>

            {filterActive && (
              <button
                onClick={resetFilter}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-xl px-3.5 py-2 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset Filter
              </button>
            )}
          </div>

          {dateInvalid && (
            <p role="alert" className="text-[11px] text-red-600 font-medium">Tanggal awal tidak boleh setelah tanggal akhir.</p>
          )}
        </div>

        {/* KPI Cards Row (5 Metrik Kunci Portofolio) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total SKU</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{summary?.total_sku ?? "..."}</p>
              </div>
              <Package className="w-8 h-8 text-blue-600 bg-blue-50 p-1.5 rounded-xl" />
            </div>
            <p className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-100">
              Portofolio aktif dalam sistem
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-red-200 shadow-sm flex flex-col justify-between bg-gradient-to-br from-white to-red-50/40 hover:border-red-300 transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">High Risk Obsolete</p>
                <p className="text-2xl font-extrabold text-red-600 mt-1">{summary?.high_risk_sku_count ?? "..."}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600 bg-red-100 p-1.5 rounded-xl" />
            </div>
            <p className="text-[11px] text-red-600/80 font-medium mt-3 pt-2 border-t border-red-100">
              Skor AI ≥ {thresholdInfo ? (thresholdInfo.threshold * 100).toFixed(0) : "60"}% (perlu mitigasi)
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-between bg-gradient-to-br from-white to-emerald-50/40 hover:border-emerald-300 transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Mitigasi Aktif</p>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">{summary?.mitigasi_count ?? 0}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-600 bg-emerald-100 p-1.5 rounded-xl" />
            </div>
            <p className="text-[11px] text-emerald-700/80 font-medium mt-3 pt-2 border-t border-emerald-100">
              SKU telah diintervensi tim
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nilai Penjualan</p>
                <p className="text-lg font-bold text-slate-900 mt-1">{formatRupiah(summary?.total_sales_rupiah || 0)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-emerald-600 bg-emerald-50 p-1.5 rounded-xl" />
            </div>
            <p className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-100">
              Total sales bruto pada periode
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm flex flex-col justify-between bg-gradient-to-br from-white to-amber-50/30 hover:border-amber-300 transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Kerugian Retur</p>
                <p className="text-lg font-bold text-amber-700 mt-1">{formatRupiah(summary?.total_return_rupiah || 0)}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-amber-600 bg-amber-100 p-1.5 rounded-xl" />
            </div>
            <p className="text-[11px] text-amber-700/80 font-medium mt-3 pt-2 border-t border-amber-100">
              Potensi eksposur finansial
            </p>
          </div>
        </div>

        {/* Tableau / Looker Style Visual Analytics Section */}
        <div className="space-y-6">
          {/* Chart Tren Bulanan: Nilai Penjualan vs Kerugian Retur (URS: Tren Bulanan) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <LineChartIcon className="w-4 h-4 text-slate-500" />
                <div>
                  <h3 className="font-semibold text-sm text-slate-800">Tren Bulanan: Nilai Penjualan vs Kerugian Retur</h3>
                  <p className="text-xs text-slate-400">Histori transaksi sales murni vs retur obsolete per bulan</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span className="text-slate-600 font-medium">Penjualan</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <span className="text-slate-600 font-medium">Kerugian Retur</span>
                </div>
              </div>
            </div>

            <div className="h-64">
              {trendData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                  Data tren transaksi tidak tersedia untuk filter yang dipilih.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 25, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorRetur" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748B" }}
                      tickFormatter={(v) => {
                        if (v >= 1e9) return `${(v / 1e9).toFixed(1)} M`;
                        if (v >= 1e6) return `${(v / 1e6).toFixed(0)} Jt`;
                        return String(v);
                      }}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        formatRupiah(Number(val)),
                        name === "sales" ? "Penjualan" : "Kerugian Retur",
                      ]}
                      labelFormatter={(lbl) => `Periode: ${lbl}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      name="sales"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorSales)"
                    />
                    <Area
                      type="monotone"
                      dataKey="retur"
                      name="retur"
                      stroke="#EF4444"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorRetur)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-100/80 text-red-600">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Tindakan Mitigasi Dini SKU (Operational Queue)</h2>
                <p className="text-xs text-slate-500">
                  Antrean prioritas tindakan pencegahan obsolete hasil prediksi Machine Learning (Gradient Boosting)
                </p>
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl">
              <button
                onClick={() => setFilterType("HIGH_RISK")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  filterType === "HIGH_RISK" ? "bg-white text-red-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Hanya High Risk
              </button>
              <button
                onClick={() => setFilterType("ALL")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  filterType === "ALL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Semua Status
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-[11px] uppercase text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Kode SKU</th>
                  <th className="px-5 py-3.5">Nama Produk</th>
                  <th className="px-5 py-3.5">Kategori</th>
                  <th className="px-5 py-3.5 text-center">Skor Risiko (AI)</th>
                  <th className="px-5 py-3.5 text-center">Status Urgensi</th>
                  <th className="px-5 py-3.5 text-center">Status Mitigasi</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {skus.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                      Tidak ada data SKU yang sesuai dengan kriteria filter saat ini.
                    </td>
                  </tr>
                ) : (
                  skus.map((item, idx) => {
                    const isHighRisk = item.risk_score >= (thresholdInfo?.threshold ?? 0.6);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5 font-mono font-bold text-slate-800 text-xs">
                          {item.sku_code}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-slate-900 text-xs">
                          {item.product_name}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-block bg-slate-100 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-600 border border-slate-200/60">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-16 bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                              <div
                                className={`h-full rounded-full transition-all ${isHighRisk ? "bg-red-500" : "bg-emerald-500"}`}
                                style={{ width: `${Math.min(100, Math.round(item.risk_score * 100))}%` }}
                              />
                            </div>
                            <span className={`font-mono font-bold text-xs ${isHighRisk ? "text-red-600" : "text-emerald-700"}`}>
                              {(item.risk_score * 100).toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                            isHighRisk
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isHighRisk ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`}></span>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {item.is_mitigated ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shadow-xs">
                              <Check className="w-3 h-3 text-emerald-600" /> {item.mitigation_info?.action_type}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200">
                              Menunggu Tindakan
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {/* [AUTH] tombol mitigasi hanya untuk role dengan hak input mitigasi (Supply Chain) */}
                          {can(user, "mitigasi_edit") ? (
                            <button
                              onClick={() => openMitigasi(item)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition shadow-xs ${
                                item.is_mitigated
                                  ? "bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100"
                                  : "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
                              }`}
                            >
                              {item.is_mitigated ? "Edit Tindakan" : "Catat Mitigasi"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Hanya lihat</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL: Catat Tindakan Mitigasi */}
      {mitigasiModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Catat Tindakan Mitigasi Dini</h3>
                  <p className="text-xs font-mono text-slate-500">{mitigasiModal.sku_code} • {mitigasiModal.product_name}</p>
                </div>
              </div>
              <button onClick={() => setMitigasiModal(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMitigasi} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">Rekomendasi Tindakan Operasional</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 focus:outline-emerald-500 bg-white text-slate-800 font-medium"
                >
                  <option value="Transfer Stok">Transfer Stok (Pindah ke DC/Cabang Cepat Laku) — Reduksi ~75%</option>
                  <option value="Program Diskon Khusus">Program Diskon Khusus (Flash Sale/Bundling) — Reduksi ~60%</option>
                  <option value="Retur Terjadwal">Retur Terjadwal ke Principal Lebih Awal — Reduksi ~85%</option>
                </select>
                <p className="text-[11px] text-slate-400">Pilih strategi terbaik berdasarkan analisis laju serapan dan kedaluwarsa produk.</p>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">PIC Pelaksana (Otomatis)</label>
                <input
                  type="text"
                  readOnly
                  value={user ? `${user.full_name} (${user.role_label})` : ""}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl p-2.5 text-slate-600 font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">Catatan Mitigasi / Detail Instruksi Tindakan</label>
                <textarea
                  rows={3}
                  value={mitigasiNotes}
                  onChange={(e) => setMitigasiNotes(e.target.value)}
                  placeholder="Contoh: Realokasi 500 unit ke DC Bandung karena laju permintaan tinggi..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 focus:outline-emerald-500 text-slate-800"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMitigasiModal(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 shadow-sm transition"
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