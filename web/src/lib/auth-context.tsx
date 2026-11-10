import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CurrentUser, PublicConfig } from "@shared/types";
import { APP_NAME } from "@shared/brand";
import { get, post, setCsrfToken } from "@/lib/api";

interface SignupResponse {
  ok: boolean;
  email: string;
  message: string;
  devVerifyUrl?: string;
  emailSent: boolean;
}

interface AuthContextValue {
  user: CurrentUser | null;
  config: PublicConfig | null;
  loading: boolean;
  setupRequired: boolean;
  login: (email: string, password: string, turnstileToken?: string) => Promise<CurrentUser>;
  signup: (input: {
    name: string;
    email: string;
    password: string;
    turnstileToken?: string;
    next?: string;
  }) => Promise<SignupResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: CurrentUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const defaultConfig: PublicConfig = {
  appName: APP_NAME,
  turnstileSiteKey: "",
  signupOpen: true,
  setupRequired: false,
  devEmailLinks: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((next: CurrentUser | null) => {
    setUserState(next);
    setCsrfToken(next?.csrfToken ?? null);
    if (next) {
      setConfig((current) => (current ? { ...current, setupRequired: false } : current));
    }
  }, []);

  const load = useCallback(async () => {
    const [configResult, meResult] = await Promise.allSettled([
      get<PublicConfig>("/api/auth/config"),
      get<{ user: CurrentUser }>("/api/auth/me"),
    ]);
    if (configResult.status === "fulfilled") setConfig(configResult.value);
    else setConfig(defaultConfig);
    if (meResult.status === "fulfilled") setUser(meResult.value.user);
    else setUser(null);
    setLoading(false);
  }, [setUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const login = useCallback(
    async (email: string, password: string, turnstileToken?: string) => {
      const result = await post<{ user: CurrentUser }>("/api/auth/login", {
        email,
        password,
        turnstileToken,
      });
      setUser(result.user);
      return result.user;
    },
    [setUser],
  );

  const signup = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
      turnstileToken?: string;
      next?: string;
    }) => post<SignupResponse>("/api/auth/signup", input),
    [],
  );

  const logout = useCallback(async () => {
    try {
      await post("/api/auth/logout");
    } finally {
      setUser(null);
    }
  }, [setUser]);

  const refresh = useCallback(async () => {
    try {
      const result = await get<{ user: CurrentUser }>("/api/auth/me");
      setUser(result.user);
    } catch {
      setUser(null);
    }
  }, [setUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      config,
      loading,
      setupRequired: config?.setupRequired ?? false,
      login,
      signup,
      logout,
      refresh,
      setUser,
    }),
    [user, config, loading, login, signup, logout, refresh, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
