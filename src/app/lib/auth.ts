// Helper auth untuk frontend: simpan token, fetch dengan Authorization, cek permission.
export const API_URL = "http://localhost:8000";

const TOKEN_KEY = "retur_token";
const USER_KEY = "retur_user";

export type AuthUser = {
  id: number;
  username: string;
  full_name: string;
  email?: string;
  department?: string;
  role: "supply_chain" | "sales_ops" | "data_admin" | "manajemen";
  role_label: string;
  permissions: string[];
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function can(user: AuthUser | null, permission: string): boolean {
  return !!user && user.permissions.includes(permission);
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Login gagal");
  saveSession(data.access_token, data.user);
  return data.user as AuthUser;
}

export async function logout() {
  try {
    await authFetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* abaikan, token tetap dibuang */
  }
  clearSession();
  window.location.href = "/login";
}

// Pengganti fetch(): otomatis menambah token, dan redirect ke /login bila 401.
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    clearSession();
    window.location.href = "/login";
  }
  return res;
}