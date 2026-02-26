/**
 * AuthProvider — React context for authentication state
 * Unified: talks directly to FastAPI backend (/api/v1/auth/*)
 * Eliminates dependency on Cloudflare Identity Worker
 * Stores tokens in localStorage with auto-refresh
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '@infinity-os/types';
import { useKernel } from './KernelProvider';

// ============================================================
// TYPES
// ============================================================

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  refreshToken: () => Promise<boolean>;
  getAccessToken: () => string | null;
}

interface BackendUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  organisation_id: string;
  is_active: boolean;
  permissions: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: BackendUser;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

// Storage keys
const ACCESS_TOKEN_KEY = 'infinity_access_token';
const REFRESH_TOKEN_KEY = 'infinity_refresh_token';
const USER_KEY = 'infinity_user';

// ============================================================
// HELPERS
// ============================================================

function backendUserToUser(bu: BackendUser): User {
  return {
    id: bu.id,
    email: bu.email,
    displayName: bu.display_name,
    role: bu.role as User['role'],
    organisationId: bu.organisation_id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mfaEnabled: false,
    preferences: {
      theme: 'dark',
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      aiEnabled: true,
      analyticsEnabled: true,
    },
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

// ============================================================
// PROVIDER
// ============================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { kernel } = useKernel();
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  // ---- Token helpers ----

  const getAccessToken = useCallback((): string | null => {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }, []);

  const storeTokens = useCallback((tokens: TokenResponse) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    const mappedUser = backendUserToUser(tokens.user);
    localStorage.setItem(USER_KEY, JSON.stringify(mappedUser));
    setUser(mappedUser);
    kernel.setUser(mappedUser);
  }, [kernel]);

  const clearTokens = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    kernel.setUser(null);
  }, [kernel]);

  // ---- Auto-refresh ----

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!rt) return false;

    try {
      const data = await apiFetch<TokenResponse>('/api/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: rt }),
      });
      storeTokens(data);
      return true;
    } catch {
      clearTokens();
      return false;
    }
  }, [storeTokens, clearTokens]);

  // ---- Session restore on mount ----

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        // Verify token is still valid by calling /me
        const backendUser = await apiFetch<BackendUser>('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const mappedUser = backendUserToUser(backendUser);
        setUser(mappedUser);
        kernel.setUser(mappedUser);
        localStorage.setItem(USER_KEY, JSON.stringify(mappedUser));
      } catch {
        // Token invalid — try refresh
        const refreshed = await refreshToken();
        if (!refreshed) {
          clearTokens();
        }
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-refresh timer (every 25 minutes) ----

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshToken();
    }, 25 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, refreshToken]);

  // ---- Auth actions ----

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const data = await apiFetch<TokenResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    storeTokens(data);
  }, [storeTokens]);

  const logout = useCallback(async (): Promise<void> => {
    const token = getAccessToken();
    if (token) {
      try {
        await apiFetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Ignore logout errors — clear locally regardless
      }
    }
    clearTokens();
  }, [getAccessToken, clearTokens]);

  const register = useCallback(async (
    email: string,
    password: string,
    displayName: string,
  ): Promise<void> => {
    const data = await apiFetch<TokenResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    storeTokens(data);
  }, [storeTokens]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      register,
      refreshToken,
      getAccessToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}