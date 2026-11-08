"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, login } from "../lib/auth";
import { Lock, User, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

const DEMO_ACCOUNTS = [
  { username: "sc.gudang", label: "Supply Chain", role: "Gudang & Mitigasi", color: "blue" },
  { username: "manajemen", label: "Manajemen", role: "Laporan Dampak & Finansial", color: "emerald" },
  { username: "data.admin", label: "Data / AI Admin", role: "Threshold & Audit", color: "purple" },
  { username: "sales.ops", label: "Sales Ops", role: "Monitoring Tren", color: "amber" },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Sudah login -> langsung ke dashboard
  useEffect(() => {
    if (getToken()) router.replace("/");
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Tidak dapat terhubung ke server. Pastikan backend (port 8000) berjalan."
          : (err as Error).message
      );
    } finally {
      setLoading(false);
    }
  }

  const fillDemo = (user: string) => {
    setUsername(user);
    setPassword("Retur#2026");
    setError("");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-emerald-50/40 p-4 font-sans">
      <div className="w-full max-w-md space-y-4">
        {/* Card Login */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 space-y-6">
          {/* Logo & Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center h-16 w-16">
              <img src="/kalbe-logo.png" alt="Kalbe Logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">ONEKalbe EWS</h1>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label htmlFor="username" className="font-semibold text-slate-700 block">
                Username Akun
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Contoh: sc.gudang atau manajemen"
                  autoComplete="username"
                  required
                  className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="font-semibold text-slate-700 block">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-700 text-white font-bold py-2.5 hover:bg-emerald-800 disabled:opacity-60 transition shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
            >
              {loading ? "Memverifikasi..." : "Masuk ke Sistem"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          PT Kalbe Farma Tbk & PT Saka Farma Laboratories • Distribusi PT Enseval
        </p>
      </div>
    </main>
  );
}
