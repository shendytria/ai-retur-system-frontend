"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, ScrollText } from "lucide-react";
import { authFetch, can, getToken, getUser, type AuthUser } from "@/app/lib/auth";

interface AuditRow {
  id: number;
  username: string | null;
  role: string | null;
  action: string;
  entity: string | null;
  detail: string | null;
  ip_address: string | null;
  created_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  supply_chain: "Supply Chain / Gudang",
  sales_ops: "Sales Ops",
  data_admin: "Data / AI Admin",
  manajemen: "Manajemen",
};

const ACTION_OPTIONS = ["LOGIN", "LOGIN_FAILED", "LOGOUT", "CREATE", "UPDATE", "ACCEPT"];
const ENTITY_OPTIONS = [
  { value: "auth", label: "Autentikasi" },
  { value: "mitigasi", label: "Mitigasi" },
  { value: "threshold", label: "Threshold" },
  { value: "notifikasi", label: "Notifikasi" },
];

const ACTION_STYLE: Record<string, string> = {
  LOGIN: "bg-emerald-100 text-emerald-700",
  LOGOUT: "bg-slate-100 text-slate-600",
  LOGIN_FAILED: "bg-red-100 text-red-700",
  CREATE: "bg-blue-100 text-blue-700",
  UPDATE: "bg-amber-100 text-amber-700",
  ACCEPT: "bg-violet-100 text-violet-700",
  DELETE: "bg-red-100 text-red-700",
};

// Waktu dari server ditampilkan dalam WIB. Jika tanpa zona waktu, anggap UTC.
function formatWaktu(iso: string | null): string {
  if (!iso) return "-";
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(hasZone ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function AuditTrailPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // nilai pencarian yang sudah di-debounce
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Guard: wajib login
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    setReady(true);
  }, [router]);

  // Debounce kotak pencarian
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const allowed = can(user, "audit_view");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (action) params.set("action", action);
      if (entity) params.set("entity", entity);
      if (query.trim()) params.set("q", query.trim());
      const res = await authFetch(`/api/audit-trail?${params.toString()}`);
      if (res.status === 403) {
        setError("Role Anda tidak memiliki akses ke audit trail.");
        setRows([]);
        return;
      }
      if (!res.ok) {
        setError("Gagal memuat audit trail.");
        return;
      }
      setRows(await res.json());
    } catch {
      setError("Tidak dapat terhubung ke server. Pastikan backend (port 8000) berjalan.");
    } finally {
      setLoading(false);
    }
  }, [action, entity, query, limit]);

  useEffect(() => {
    if (ready && allowed) load();
  }, [ready, allowed, load]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-16 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-8 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-bold text-white text-base shadow-sm">
            K
          </div>
          <div>
            <span className="font-bold text-slate-900 tracking-tight text-lg">ONEKalbe EWS</span>
            <span className="text-xs text-slate-400 block -mt-0.5">Audit Trail • Catatan aktivitas sistem</span>
          </div>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Dashboard
        </Link>
      </header>

      <main className="max-w-7xl mx-auto px-8 pt-8 space-y-6">
        {!allowed ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">Akses ditolak</p>
            <p className="text-xs text-slate-500 mt-1">
              Audit trail hanya dapat dilihat oleh Supply Chain / Gudang dan Data / AI Admin.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-slate-500" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Riwayat Aktivitas</h2>
                  <p className="text-xs text-slate-400">
                    Hanya-baca. Mencatat siapa, kapan, dan apa. Waktu dalam WIB.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800"
                  aria-label="Filter aksi"
                >
                  <option value="">Semua aksi</option>
                  {ACTION_OPTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>

                <select
                  value={entity}
                  onChange={(e) => setEntity(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800"
                  aria-label="Filter objek"
                >
                  <option value="">Semua objek</option>
                  {ENTITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari pengguna atau detail (mis. kode SKU)"
                  className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 w-64 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Cari"
                />

                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800"
                  aria-label="Jumlah baris"
                >
                  <option value={100}>100 terbaru</option>
                  <option value={250}>250 terbaru</option>
                  <option value={500}>500 terbaru</option>
                </select>

                <button
                  onClick={load}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Muat ulang
                </button>

                <span className="text-[11px] text-slate-400 ml-auto">{rows.length} catatan ditampilkan</span>
              </div>
            </div>

            {error && (
              <p role="alert" className="mx-6 mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5">Waktu (WIB)</th>
                    <th className="px-6 py-3.5">Pengguna</th>
                    <th className="px-6 py-3.5">Role</th>
                    <th className="px-6 py-3.5 text-center">Aksi</th>
                    <th className="px-6 py-3.5">Objek</th>
                    <th className="px-6 py-3.5">Detail</th>
                    <th className="px-6 py-3.5">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors align-top">
                      <td className="px-6 py-3 text-xs font-mono text-slate-700 whitespace-nowrap">{formatWaktu(r.created_at)}</td>
                      <td className="px-6 py-3 text-xs font-medium text-slate-900">{r.username ?? "-"}</td>
                      <td className="px-6 py-3 text-xs">{r.role ? ROLE_LABELS[r.role] ?? r.role : "-"}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${ACTION_STYLE[r.action] ?? "bg-slate-100 text-slate-600"}`}>
                          {r.action}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs">{r.entity ?? "-"}</td>
                      <td className="px-6 py-3 text-xs text-slate-700 max-w-md break-words">{r.detail ?? "-"}</td>
                      <td className="px-6 py-3 text-xs font-mono text-slate-500">{r.ip_address ?? "-"}</td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && !error && (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-xs text-slate-400 italic">
                        Tidak ada catatan yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}