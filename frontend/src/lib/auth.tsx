/** Auth context: current user, login/logout, and a `can()` bound to their access. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, tokens } from "@/lib/api";
import { can as rawCan, type AppName, type Level } from "@/lib/permissions";
import type { Me } from "@/lib/types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (app: AppName, action: Level) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!tokens.access) {
      setLoading(false);
      return;
    }
    try {
      setMe(await api.get<Me>("/api/auth/me"));
    } catch {
      tokens.clear();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ access_token: string; refresh_token: string }>(
      "/api/auth/login",
      { email, password },
    );
    tokens.set(res.access_token, res.refresh_token);
    setMe(await api.get<Me>("/api/auth/me"));
  }, []);

  const logout = useCallback(() => {
    tokens.clear();
    setMe(null);
  }, []);

  const can = useCallback(
    (app: AppName, action: Level) =>
      me ? rawCan(me.effective_access, me.is_superuser, app, action) : false,
    [me],
  );

  const value = useMemo(
    () => ({ me, loading, login, logout, can }),
    [me, loading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
