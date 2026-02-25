/**
 * BackendProvider — Unified API client for Infinity OS backend
 * Provides React hooks for all backend services:
 * - useAuth, useAI, useCompliance, useHITL
 * - useFiles, useRepos, useBuilds, useFederation
 * - useUsers, useOrganisation, useWebSocket
 */
import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

// --- Types ---

interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  organisation_id: string;
  permissions: string[];
}

interface BackendContextType {
  apiCall: <T = any>(path: string, options?: RequestInit) => Promise<T>;
  getToken: () => string | null;
  setToken: (token: string) => void;
  user: User | null;
  setUser: (user: User | null) => void;
}

const BackendContext = createContext<BackendContextType | null>(null);

// --- Provider ---

export function BackendProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem('infinity_access_token')
  );
  const [user, setUser] = useState<User | null>(
    () => {
      const stored = localStorage.getItem('infinity_user');
      return stored ? JSON.parse(stored) : null;
    }
  );

  const setToken = useCallback((t: string) => {
    setTokenState(t);
    localStorage.setItem('infinity_access_token', t);
  }, []);

  const getToken = useCallback(() => token, [token]);

  const apiCall = useCallback(async <T = any>(path: string, options: RequestInit = {}): Promise<T> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // Token expired — try refresh
      const refreshToken = localStorage.getItem('infinity_refresh_token');
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            setToken(data.access_token);
            localStorage.setItem('infinity_refresh_token', data.refresh_token);
            // Retry original request
            headers['Authorization'] = `Bearer ${data.access_token}`;
            const retryRes = await fetch(`${API_URL}${path}`, { ...options, headers });
            if (!retryRes.ok) throw new Error('Request failed after token refresh');
            return retryRes.json();
          }
        } catch {
          // Refresh failed — force logout
          localStorage.removeItem('infinity_access_token');
          localStorage.removeItem('infinity_refresh_token');
          localStorage.removeItem('infinity_user');
          window.location.href = '/login';
        }
      }
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    return res.json();
  }, [token, setToken]);

  useEffect(() => {
    if (user) localStorage.setItem('infinity_user', JSON.stringify(user));
    else localStorage.removeItem('infinity_user');
  }, [user]);

  return (
    <BackendContext.Provider value={{ apiCall, getToken, setToken, user, setUser }}>
      {children}
    </BackendContext.Provider>
  );
}

function useBackend() {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be used within BackendProvider');
  return ctx;
}

// --- Hook: AI Generation ---

export function useAI() {
  const { apiCall } = useBackend();

  return {
    generate: (systemId: string, prompt: string, taskType = 'general', model?: string) =>
      apiCall('/api/v1/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          system_id: systemId,
          prompt,
          task_type: taskType,
          model,
          require_provenance: true,
        }),
      }),
    getPendingReviews: () => apiCall('/api/v1/ai/hitl/pending'),
    reviewTask: (taskId: string, approved: boolean, comments = '') =>
      apiCall(`/api/v1/ai/hitl/${taskId}/review`, {
        method: 'POST',
        body: JSON.stringify({ approved, comments }),
      }),
  };
}

// --- Hook: Compliance ---

export function useCompliance() {
  const { apiCall } = useBackend();

  return {
    assessRisk: (systemId: string) =>
      apiCall(`/api/v1/compliance/risk-assessment/${systemId}`),
    registerSystem: (data: any) =>
      apiCall('/api/v1/compliance/ai-systems', { method: 'POST', body: JSON.stringify(data) }),
    getAuditLogs: (limit = 50) =>
      apiCall(`/api/v1/compliance/audit-log?limit=${limit}`),
    getDPIAs: () => apiCall('/api/v1/compliance/dpia'),
    createDPIA: (data: any) =>
      apiCall('/api/v1/compliance/dpia', { method: 'POST', body: JSON.stringify(data) }),
    getDashboard: () => apiCall('/api/v1/compliance/dashboard'),
  };
}

// --- Hook: Files ---

export function useFiles() {
  const { apiCall } = useBackend();

  return {
    list: (path = '/', limit = 100) =>
      apiCall(`/api/v1/files?path=${encodeURIComponent(path)}&limit=${limit}`),
    create: (data: { name: string; path: string; type?: string; content?: string }) =>
      apiCall('/api/v1/files', { method: 'POST', body: JSON.stringify(data) }),
    createDirectory: (name: string, path: string) =>
      apiCall('/api/v1/files/directory', { method: 'POST', body: JSON.stringify({ name, path }) }),
    get: (fileId: string) => apiCall(`/api/v1/files/${fileId}`),
    getContent: (fileId: string) => apiCall(`/api/v1/files/${fileId}/content`),
    updateContent: (fileId: string, content: string) =>
      apiCall(`/api/v1/files/${fileId}/content`, { method: 'PUT', body: JSON.stringify({ content }) }),
    delete: (fileId: string) =>
      apiCall(`/api/v1/files/${fileId}`, { method: 'DELETE' }),
    share: (fileId: string, userId: string, permissions = ['read']) =>
      apiCall(`/api/v1/files/${fileId}/share`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, permissions }),
      }),
    search: (query: string) =>
      apiCall(`/api/v1/files/search?q=${encodeURIComponent(query)}`),
    getVersions: (fileId: string) =>
      apiCall(`/api/v1/files/${fileId}/versions`),
  };
}

// --- Hook: Repositories ---

export function useRepos() {
  const { apiCall } = useBackend();

  return {
    list: () => apiCall('/api/v1/repos'),
    create: (data: { name: string; description?: string; visibility?: string }) =>
      apiCall('/api/v1/repos', { method: 'POST', body: JSON.stringify(data) }),
    get: (repoId: string) => apiCall(`/api/v1/repos/${repoId}`),
    update: (repoId: string, data: any) =>
      apiCall(`/api/v1/repos/${repoId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (repoId: string) =>
      apiCall(`/api/v1/repos/${repoId}`, { method: 'DELETE' }),
    getCommits: (repoId: string, branch = 'main') =>
      apiCall(`/api/v1/repos/${repoId}/commits?branch=${branch}`),
    getBranches: (repoId: string) =>
      apiCall(`/api/v1/repos/${repoId}/branches`),
    getTree: (repoId: string, path = '', branch = 'main') =>
      apiCall(`/api/v1/repos/${repoId}/tree?path=${encodeURIComponent(path)}&branch=${branch}`),
    getBlob: (repoId: string, path: string, branch = 'main') =>
      apiCall(`/api/v1/repos/${repoId}/blob?path=${encodeURIComponent(path)}&branch=${branch}`),
    configureGitHub: (repoId: string, remoteUrl: string) =>
      apiCall(`/api/v1/repos/${repoId}/github/configure`, {
        method: 'POST',
        body: JSON.stringify({ remote_url: remoteUrl, enabled: true }),
      }),
    pushToGitHub: (repoId: string, branch = 'main') =>
      apiCall(`/api/v1/repos/${repoId}/github/push`, {
        method: 'POST',
        body: JSON.stringify({ branch }),
      }),
    pullFromGitHub: (repoId: string, branch = 'main') =>
      apiCall(`/api/v1/repos/${repoId}/github/pull`, {
        method: 'POST',
        body: JSON.stringify({ branch }),
      }),
  };
}

// --- Hook: Builds ---

export function useBuilds() {
  const { apiCall } = useBackend();

  return {
    trigger: (data: { repository_id?: string; target: string; config?: any }) =>
      apiCall('/api/v1/builds', { method: 'POST', body: JSON.stringify(data) }),
    list: (limit = 20) => apiCall(`/api/v1/builds?limit=${limit}`),
    get: (buildId: string) => apiCall(`/api/v1/builds/${buildId}`),
    cancel: (buildId: string) =>
      apiCall(`/api/v1/builds/${buildId}/cancel`, { method: 'POST' }),
  };
}

// --- Hook: Users ---

export function useUsers() {
  const { apiCall } = useBackend();

  return {
    list: (limit = 50) => apiCall(`/api/v1/users?limit=${limit}`),
    get: (userId: string) => apiCall(`/api/v1/users/${userId}`),
    update: (userId: string, data: any) =>
      apiCall(`/api/v1/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    changeRole: (userId: string, role: string) =>
      apiCall(`/api/v1/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    deactivate: (userId: string) =>
      apiCall(`/api/v1/users/${userId}/deactivate`, { method: 'POST' }),
    invite: (email: string, role = 'user') =>
      apiCall('/api/v1/users/invite', { method: 'POST', body: JSON.stringify({ email, role }) }),
    count: () => apiCall('/api/v1/users/count'),
  };
}

// --- Hook: Organisation ---

export function useOrganisation() {
  const { apiCall } = useBackend();

  return {
    getCurrent: () => apiCall('/api/v1/organisations/current'),
    update: (data: any) =>
      apiCall('/api/v1/organisations/current', { method: 'PATCH', body: JSON.stringify(data) }),
    getMembers: () => apiCall('/api/v1/organisations/current/members'),
  };
}

// --- Hook: Federation ---

export function useFederation() {
  const { apiCall } = useBackend();

  return {
    getEcosystem: () => apiCall('/api/v1/federation/ecosystem'),
    listServices: () => apiCall('/api/v1/federation/services'),
    registerService: (data: any) =>
      apiCall('/api/v1/federation/services', { method: 'POST', body: JSON.stringify(data) }),
    invokeCapability: (serviceId: string, capability: string, payload: any) =>
      apiCall(`/api/v1/federation/services/${serviceId}/invoke`, {
        method: 'POST',
        body: JSON.stringify({ capability, payload }),
      }),
    healthCheck: (serviceId: string) =>
      apiCall(`/api/v1/federation/services/${serviceId}/health`),
  };
}

// --- Hook: Kanban Board ---

export function useKanban() {
  const { apiCall } = useBackend();

  return {
    // Boards
    listBoards: () => apiCall('/api/v1/kanban/boards'),
    createBoard: (data: { name: string; use_default_columns?: boolean }) =>
      apiCall('/api/v1/kanban/boards', { method: 'POST', body: JSON.stringify(data) }),
    updateBoard: (boardId: string, data: any) =>
      apiCall(`/api/v1/kanban/boards/${boardId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteBoard: (boardId: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}`, { method: 'DELETE' }),

    // Columns
    createColumn: (boardId: string, data: any) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/columns`, { method: 'POST', body: JSON.stringify(data) }),
    updateColumn: (boardId: string, columnId: string, data: any) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/columns/${columnId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteColumn: (boardId: string, columnId: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/columns/${columnId}`, { method: 'DELETE' }),

    // Tasks
    listTasks: (boardId: string, params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiCall(`/api/v1/kanban/boards/${boardId}/tasks${qs}`);
    },
    createTask: (boardId: string, data: any) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    getTask: (boardId: string, taskId: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks/${taskId}`),
    updateTask: (boardId: string, taskId: string, data: any) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    moveTask: (boardId: string, taskId: string, columnId: string, position?: number) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks/${taskId}/move`, {
        method: 'POST', body: JSON.stringify({ column_id: columnId, position }),
      }),
    deleteTask: (boardId: string, taskId: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks/${taskId}`, { method: 'DELETE' }),

    // Comments
    listComments: (boardId: string, taskId: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks/${taskId}/comments`),
    addComment: (boardId: string, taskId: string, content: string, isInternal = false) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks/${taskId}/comments`, {
        method: 'POST', body: JSON.stringify({ content, is_internal: isInternal }),
      }),
    updateComment: (boardId: string, taskId: string, commentId: string, content: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks/${taskId}/comments/${commentId}`, {
        method: 'PATCH', body: JSON.stringify({ content }),
      }),
    deleteComment: (boardId: string, taskId: string, commentId: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),

    // History
    getHistory: (boardId: string, taskId: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/tasks/${taskId}/history`),

    // Labels
    createLabel: (boardId: string, name: string, color: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/labels`, {
        method: 'POST', body: JSON.stringify({ name, color }),
      }),
    deleteLabel: (boardId: string, labelId: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/labels/${labelId}`, { method: 'DELETE' }),

    // Stats
    getBoardStats: (boardId: string) =>
      apiCall(`/api/v1/kanban/boards/${boardId}/stats`),
  };
}

// --- Hook: WebSocket ---

export function useWebSocket() {
  const { getToken } = useBackend();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Map<string, ((data: any) => void)[]>>(new Map());

  const connect = useCallback(() => {
    const token = getToken();
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);

    ws.onopen = () => {
      setConnected(true);
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type || msg.event;
        const handlers = handlersRef.current.get(type) || [];
        handlers.forEach(h => h(msg));
        // Also fire wildcard handlers
        const wildcardHandlers = handlersRef.current.get('*') || [];
        wildcardHandlers.forEach(h => h(msg));
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[WS] Disconnected, reconnecting in 3s...');
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [getToken]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const send = useCallback((type: string, data: any = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  const subscribe = useCallback((channel: string) => {
    send('subscribe', { channel });
  }, [send]);

  const on = useCallback((event: string, handler: (data: any) => void) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, []);
    }
    handlersRef.current.get(event)!.push(handler);
    return () => {
      const handlers = handlersRef.current.get(event) || [];
      handlersRef.current.set(event, handlers.filter(h => h !== handler));
    };
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return { connect, disconnect, send, subscribe, on, connected };
}

export default BackendProvider;