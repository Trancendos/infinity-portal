/**
 * AuthProvider — React context for authentication state
 * Integrates with the Identity Service (Cloudflare Worker)
 * Zero Trust: tokens are short-lived, continuously validated
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@infinity-os/types';
import { useKernel } from './KernelProvider';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const IDENTITY_URL = import.meta.env.VITE_IDENTITY_WORKER_URL ?? 'http://localhost:8787';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { kernel } = useKernel();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const savedSession = await kernel.storage.get<Session>('auth:session');
        if (savedSession && savedSession.expiresAt > Date.now()) {
          setSession(savedSession);
          setUser(savedSession.user);
          kernel.setUser(savedSession.user);
        } else if (savedSession?.refreshToken) {
          // Try to refresh
          await refreshSession(savedSession.refreshToken);
        }
      } catch (error) {
        console.error('[Auth] Failed to restore session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, [kernel]);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!session) return;
    const timeUntilExpiry = session.expiresAt - Date.now() - 60_000; // 1 min before expiry
    if (timeUntilExpiry <= 0) return;

    const timer = setTimeout(() => {
      refreshSession(session.refreshToken);
    }, timeUntilExpiry);

    return () => clearTimeout(timer);
  }, [session]);

  const refreshSession = async (refreshToken: string) => {
    try {
      const response = await fetch(`${IDENTITY_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        await logout();
        return;
      }

      const { data } = await response.json() as { data: Session };
      setSession(data);
      setUser(data.user);
      kernel.setUser(data.user);
      await kernel.storage.set('auth:session', data);
    } catch (error) {
      console.error('[Auth] Token refresh failed:', error);
      await logout();
    }
  };

  const login = useCallback(async (email: string, password: string, mfaCode?: string) => {
    const response = await fetch(`${IDENTITY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, mfaCode }),
    });

    const result = await response.json() as { success: boolean; data?: Session; error?: { message: string } };

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Login failed');
    }

    setSession(result.data);
    setUser(result.data.user);
    kernel.setUser(result.data.user);
    await kernel.storage.set('auth:session', result.data);
  }, [kernel]);

  const logout = useCallback(async () => {
    try {
      if (session?.accessToken) {
        await fetch(`${IDENTITY_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
      }
    } catch (error) {
      console.error('[Auth] Logout request failed:', error);
    } finally {
      setSession(null);
      setUser(null);
      kernel.setUser(null);
      await kernel.storage.delete('auth:session');
    }
  }, [session, kernel]);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const response = await fetch(`${IDENTITY_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });

    const result = await response.json() as { success: boolean; error?: { message: string } };

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Registration failed');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, isLoading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}