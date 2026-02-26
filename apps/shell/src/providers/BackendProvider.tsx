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


// --- Hook: Integrations ---

export function useIntegrations() {
  const { apiCall } = useBackend();
  return {
    listConnectors: () => apiCall('/api/v1/integrations/connectors'),
    getConnector: (id: string) => apiCall(`/api/v1/integrations/connectors/${id}`),
    createConnector: (data: any) => apiCall('/api/v1/integrations/connectors', { method: 'POST', body: JSON.stringify(data) }),
    updateConnector: (id: string, data: any) => apiCall(`/api/v1/integrations/connectors/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteConnector: (id: string) => apiCall(`/api/v1/integrations/connectors/${id}`, { method: 'DELETE' }),
    checkHealth: (id: string) => apiCall(`/api/v1/integrations/connectors/${id}/health`, { method: 'POST' }),
    listTemplates: () => apiCall('/api/v1/integrations/templates'),
    installTemplate: (slug: string) => apiCall(`/api/v1/integrations/connectors/from-template/${slug}`, { method: 'POST', body: '{}' }),
  };
}

// --- Hook: App Store ---

export function useAppStore() {
  const { apiCall } = useBackend();
  return {
    listListings: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiCall(`/api/v1/appstore/listings${qs}`);
    },
    getCategories: () => apiCall('/api/v1/appstore/categories'),
    submitModule: (data: any) => apiCall('/api/v1/appstore/submit', { method: 'POST', body: JSON.stringify(data) }),
    installModule: (moduleId: string) => apiCall(`/api/v1/appstore/install/${moduleId}`, { method: 'POST', body: '{}' }),
    uninstallModule: (moduleId: string) => apiCall(`/api/v1/appstore/uninstall/${moduleId}`, { method: 'DELETE' }),
    getInstalled: () => apiCall('/api/v1/appstore/installed'),
    getStats: () => apiCall('/api/v1/appstore/stats'),
  };
}

// --- Hook: Notifications ---

export function useNotifications() {
  const { apiCall } = useBackend();
  return {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiCall(`/api/v1/notifications${qs}`);
    },
    count: () => apiCall('/api/v1/notifications/count'),
    markRead: (id: string) => apiCall(`/api/v1/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => apiCall('/api/v1/notifications/read-all', { method: 'POST' }),
    create: (data: any) => apiCall('/api/v1/notifications', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => apiCall(`/api/v1/notifications/${id}`, { method: 'DELETE' }),
    clearRead: () => apiCall('/api/v1/notifications', { method: 'DELETE' }),
  };
}

// --- Hook: WebSocket ---

// ── Project & IT Management Hooks ──────────────────────────

export function useITSM() {
  const { apiCall } = useBackend();
  return {
    getIncidents: (params?: Record<string, string>) => apiCall(`/itsm/incidents?${new URLSearchParams(params || {})}`),
    getIncident: (id: string) => apiCall(`/itsm/incidents/${id}`),
    createIncident: (data: any) => apiCall('/itsm/incidents', { method: 'POST', body: JSON.stringify(data) }),
    updateIncident: (id: string, data: any) => apiCall(`/itsm/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    acknowledgeIncident: (id: string) => apiCall(`/itsm/incidents/${id}/acknowledge`, { method: 'POST' }),
    resolveIncident: (id: string, resolution: string) => apiCall(`/itsm/incidents/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) }),
    escalateIncident: (id: string) => apiCall(`/itsm/incidents/${id}/escalate`, { method: 'POST' }),
    getDashboard: () => apiCall('/itsm/incidents/dashboard'),
    getProblems: () => apiCall('/itsm/problems'),
    createProblem: (data: any) => apiCall('/itsm/problems', { method: 'POST', body: JSON.stringify(data) }),
    getChanges: (params?: Record<string, string>) => apiCall(`/itsm/changes?${new URLSearchParams(params || {})}`),
    createChange: (data: any) => apiCall('/itsm/changes', { method: 'POST', body: JSON.stringify(data) }),
    approveChange: (id: string) => apiCall(`/itsm/changes/${id}/approve`, { method: 'POST' }),
    getSLAs: () => apiCall('/itsm/slas'),
    getCMDBItems: () => apiCall('/itsm/cmdb'),
  };
}

export function useGates() {
  const { apiCall } = useBackend();
  return {
    getProjects: () => apiCall('/gates/projects'),
    getProject: (id: string) => apiCall(`/gates/projects/${id}`),
    createProject: (data: any) => apiCall('/gates/projects', { method: 'POST', body: JSON.stringify(data) }),
    updateProject: (id: string, data: any) => apiCall(`/gates/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    submitGate: (projectId: string, gateNum: number) => apiCall(`/gates/projects/${projectId}/gates/${gateNum}/submit`, { method: 'POST' }),
    reviewGate: (projectId: string, gateNum: number, data: any) => apiCall(`/gates/projects/${projectId}/gates/${gateNum}/review`, { method: 'POST', body: JSON.stringify(data) }),
    verifyCriteria: (projectId: string, gateNum: number, criteriaId: string) => apiCall(`/gates/projects/${projectId}/gates/${gateNum}/criteria/${criteriaId}/verify`, { method: 'POST' }),
    getReport: (projectId: string) => apiCall(`/gates/projects/${projectId}/report`),
  };
}

export function useDocuments() {
  const { apiCall } = useBackend();
  return {
    getDocs: (params?: Record<string, string>) => apiCall(`/documents/?${new URLSearchParams(params || {})}`),
    getDoc: (id: string) => apiCall(`/documents/${id}`),
    createDoc: (data: any) => apiCall('/documents/', { method: 'POST', body: JSON.stringify(data) }),
    updateDoc: (id: string, data: any) => apiCall(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteDoc: (id: string) => apiCall(`/documents/${id}`, { method: 'DELETE' }),
    getTags: () => apiCall('/documents/tags/all'),
    getCategories: () => apiCall('/documents/categories'),
    createCategory: (data: any) => apiCall('/documents/categories', { method: 'POST', body: JSON.stringify(data) }),
    getSyncConfigs: () => apiCall('/documents/sync/configs'),
    setupSync: (data: any) => apiCall('/documents/sync/setup', { method: 'POST', body: JSON.stringify(data) }),
    triggerSync: (configId: string) => apiCall(`/documents/sync/${configId}/trigger`, { method: 'POST' }),
    getDuplicates: () => apiCall('/documents/duplicates?status=pending'),
    getStats: () => apiCall('/documents/library/stats'),
  };
}

export function useAssets() {
  const { apiCall } = useBackend();
  return {
    getAssets: (params?: Record<string, string>) => apiCall(`/assets/?${new URLSearchParams(params || {})}`),
    getAsset: (id: string) => apiCall(`/assets/${id}`),
    createAsset: (data: any) => apiCall('/assets/', { method: 'POST', body: JSON.stringify(data) }),
    updateAsset: (id: string, data: any) => apiCall(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    getRelationships: (id: string) => apiCall(`/assets/${id}/relationships`),
    createRelationship: (data: any) => apiCall('/assets/relationships', { method: 'POST', body: JSON.stringify(data) }),
    getLifecycle: (id: string) => apiCall(`/assets/${id}/lifecycle`),
    getMaintenance: (params?: Record<string, string>) => apiCall(`/assets/maintenance?${new URLSearchParams(params || {})}`),
    scheduleMaintenance: (data: any) => apiCall('/assets/maintenance', { method: 'POST', body: JSON.stringify(data) }),
    getDashboard: () => apiCall('/assets/dashboard'),
  };
}

export function useKnowledgeBase() {
  const { apiCall } = useBackend();
  return {
    getArticles: (params?: Record<string, string>) => apiCall(`/kb/articles?${new URLSearchParams(params || {})}`),
    getArticle: (slug: string) => apiCall(`/kb/articles/${slug}`),
    createArticle: (data: any) => apiCall('/kb/articles', { method: 'POST', body: JSON.stringify(data) }),
    updateArticle: (slug: string, data: any) => apiCall(`/kb/articles/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
    markHelpful: (id: string) => apiCall(`/kb/articles/${id}/helpful`, { method: 'POST' }),
    getVersions: (slug: string) => apiCall(`/kb/articles/${slug}/versions`),
    getCategories: () => apiCall('/kb/categories'),
    createCategory: (data: any) => apiCall('/kb/categories', { method: 'POST', body: JSON.stringify(data) }),
    getLearningPaths: () => apiCall('/kb/learning-paths'),
    createLearningPath: (data: any) => apiCall('/kb/learning-paths', { method: 'POST', body: JSON.stringify(data) }),
    getInsights: () => apiCall('/kb/ai/insights'),
    triggerExtraction: (data: any) => apiCall('/kb/ai/extract', { method: 'POST', body: JSON.stringify(data) }),
    getStats: () => apiCall('/kb/stats'),
  };
}

export function useDependencies() {
  const { apiCall } = useBackend();
  return {
    getMaps: () => apiCall('/deps/maps'),
    getMap: (id: string) => apiCall(`/deps/maps/${id}`),
    createMap: (data: any) => apiCall('/deps/maps', { method: 'POST', body: JSON.stringify(data) }),
    addNode: (mapId: string, data: any) => apiCall(`/deps/maps/${mapId}/nodes`, { method: 'POST', body: JSON.stringify(data) }),
    addEdge: (mapId: string, data: any) => apiCall(`/deps/maps/${mapId}/edges`, { method: 'POST', body: JSON.stringify(data) }),
    getImpact: (mapId: string, nodeId: string) => apiCall(`/deps/maps/${mapId}/impact-analysis/${nodeId}`),
    getChains: () => apiCall('/deps/chains'),
    createChain: (data: any) => apiCall('/deps/chains', { method: 'POST', body: JSON.stringify(data) }),
    executeChain: (chainId: string) => apiCall(`/deps/chains/${chainId}/execute`, { method: 'POST' }),
    getRepoHealth: () => apiCall('/deps/repos/health'),
    syncRepo: (configId: string) => apiCall(`/deps/repos/${configId}/sync`, { method: 'POST' }),
  };
}

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

// ============================================================
// BILLING & USAGE HOOKS
// ============================================================

export function useBilling() {
  const { apiCall } = useBackend();
  return {
    getUsage: (period = 'current_month') => apiCall(`/api/v1/billing/usage?period=${period}`),
    recordUsage: (data: Record<string, unknown>) => apiCall('/api/v1/billing/usage/record', { method: 'POST', body: JSON.stringify(data) }),
    getBillingAccount: () => apiCall('/api/v1/billing/account'),
    getInvoices: () => apiCall('/api/v1/billing/invoices'),
    getFeatureFlags: () => apiCall('/api/v1/billing/features'),
  };
}

// ============================================================
// WORKFLOW HOOKS
// ============================================================

export function useWorkflows() {
  const { apiCall } = useBackend();
  return {
    listWorkflows: (status?: string) => apiCall(`/api/v1/workflows${status ? `?status=${status}` : ''}`),
    getWorkflow: (id: string) => apiCall(`/api/v1/workflows/${id}`),
    createWorkflow: (data: Record<string, unknown>) => apiCall('/api/v1/workflows', { method: 'POST', body: JSON.stringify(data) }),
    updateWorkflow: (id: string, data: Record<string, unknown>) => apiCall(`/api/v1/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteWorkflow: (id: string) => apiCall(`/api/v1/workflows/${id}`, { method: 'DELETE' }),
    triggerWorkflow: (id: string, inputData: Record<string, unknown>) => apiCall(`/api/v1/workflows/${id}/trigger`, { method: 'POST', body: JSON.stringify({ input_data: inputData }) }),
    listExecutions: (workflowId: string) => apiCall(`/api/v1/workflows/${workflowId}/executions`),
    getExecution: (workflowId: string, execId: string) => apiCall(`/api/v1/workflows/${workflowId}/executions/${execId}`),
  };
}

// ============================================================
// ARTIFACT REPOSITORY HOOKS
// ============================================================

export function useArtifacts() {
  const { apiCall } = useBackend();
  return {
    listRepos: (type?: string) => apiCall(`/api/v1/artifacts/repos${type ? `?artifact_type=${type}` : ''}`),
    createRepo: (data: Record<string, unknown>) => apiCall('/api/v1/artifacts/repos', { method: 'POST', body: JSON.stringify(data) }),
    getRepo: (id: string) => apiCall(`/api/v1/artifacts/repos/${id}`),
    listArtifacts: (repoId: string, search?: string) => apiCall(`/api/v1/artifacts/repos/${repoId}/artifacts${search ? `?search=${search}` : ''}`),
    uploadArtifact: (repoId: string, data: Record<string, unknown>) => apiCall(`/api/v1/artifacts/repos/${repoId}/artifacts`, { method: 'POST', body: JSON.stringify(data) }),
    downloadArtifact: (repoId: string, artifactId: string) => apiCall(`/api/v1/artifacts/repos/${repoId}/artifacts/${artifactId}/download`, { method: 'POST' }),
    searchArtifacts: (q: string, type?: string) => apiCall(`/api/v1/artifacts/search?q=${encodeURIComponent(q)}${type ? `&artifact_type=${type}` : ''}`),
    getStats: () => apiCall('/api/v1/artifacts/stats'),
  };
}

// ============================================================
// ERROR REGISTRY HOOKS
// ============================================================

export function useErrors() {
  const { apiCall } = useBackend();
  return {
    getCatalogue: () => apiCall('/api/v1/errors/catalogue'),
    listErrors: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiCall(`/api/v1/errors${qs}`);
    },
    reportError: (data: Record<string, unknown>) => apiCall('/api/v1/errors', { method: 'POST', body: JSON.stringify(data) }),
    resolveError: (id: string, notes: string) => apiCall(`/api/v1/errors/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolution_notes: notes }) }),
    getStats: () => apiCall('/api/v1/errors/stats'),
  };
}

// ============================================================
// SECURITY HOOKS (Crypto-shredding, Merkle audit)
// ============================================================

export function useSecurity() {
  const { apiCall } = useBackend();
  return {
    cryptoShred: (data: Record<string, unknown>) => apiCall('/api/v1/security/crypto-shred', { method: 'POST', body: JSON.stringify(data) }),
    listCryptoShredEvents: () => apiCall('/api/v1/security/crypto-shred'),
    createMerkleBatch: () => apiCall('/api/v1/security/audit/merkle-batch', { method: 'POST' }),
    listMerkleBatches: () => apiCall('/api/v1/security/audit/merkle-batches'),
    verifyAuditEvent: (eventId: string) => apiCall(`/api/v1/security/audit/verify/${eventId}`),
  };
}

// ============================================================
// OBSERVABILITY HOOKS
// ============================================================

export function useObservability() {
  const { apiCall } = useBackend();
  return {
    getLogs: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiCall(`/api/v1/observability/logs${qs}`);
    },
    getLogStats: () => apiCall('/api/v1/observability/logs/stats'),
    getDashboard: () => apiCall('/api/v1/observability/metrics/dashboard'),
    getAllMetrics: () => apiCall('/api/v1/observability/metrics'),
    getAnomalies: (resolved = false) => apiCall(`/api/v1/observability/anomalies?resolved=${resolved}`),
    detectAnomalies: () => apiCall('/api/v1/observability/anomalies/detect', { method: 'POST' }),
    resolveAnomaly: (id: string) => apiCall(`/api/v1/observability/anomalies/${id}/resolve`, { method: 'PATCH' }),
    getUsagePatterns: () => apiCall('/api/v1/observability/metrics/usage-patterns'),
    recordMetric: (name: string, value: number, labels?: Record<string, string>) =>
      apiCall('/api/v1/observability/metrics/record', { method: 'POST', body: JSON.stringify({ metric_name: name, value, labels }) }),
  };
}

// ============================================================
// COMPLIANCE FRAMEWORKS HOOKS
// ============================================================

export function useComplianceFrameworks() {
  const { apiCall } = useBackend();
  return {
    listFrameworks: () => apiCall('/api/v1/compliance-frameworks/frameworks'),
    listControls: (framework?: string, category?: string) => {
      const params = new URLSearchParams();
      if (framework) params.set('framework', framework);
      if (category) params.set('category', category);
      return apiCall(`/api/v1/compliance-frameworks/controls?${params}`);
    },
    runTests: (state: Record<string, unknown>) =>
      apiCall('/api/v1/compliance-frameworks/test', { method: 'POST', body: JSON.stringify(state) }),
    getReport: (framework: string) => apiCall(`/api/v1/compliance-frameworks/report/${framework}`),
    generateReport: (framework: string, state: Record<string, unknown>) =>
      apiCall(`/api/v1/compliance-frameworks/report/${framework}`, { method: 'POST', body: JSON.stringify(state) }),
    getSummary: () => apiCall('/api/v1/compliance-frameworks/summary'),
    check2060: (data: Record<string, unknown>) =>
      apiCall('/api/v1/compliance-frameworks/2060/check', { method: 'POST', body: JSON.stringify(data) }),
    grantConsent: (data: Record<string, unknown>) =>
      apiCall('/api/v1/compliance-frameworks/2060/consent', { method: 'POST', body: JSON.stringify(data) }),
    revokeConsent: (token: string) =>
      apiCall(`/api/v1/compliance-frameworks/2060/consent/${token}`, { method: 'DELETE' }),
    getResidencyZones: () => apiCall('/api/v1/compliance-frameworks/2060/residency-zones'),
    getConsentTypes: () => apiCall('/api/v1/compliance-frameworks/2060/consent-types'),
  };
}

// ============================================================
// VULNERABILITY SCANNER HOOKS
// ============================================================

export function useVulnerabilities() {
  const { apiCall } = useBackend();
  return {
    scan: (manifestContent: string, ecosystem: string, maxPackages = 50) =>
      apiCall('/api/v1/vulnerabilities/scan', {
        method: 'POST',
        body: JSON.stringify({ manifest_content: manifestContent, ecosystem, max_packages: maxPackages }),
      }),
    listScans: (limit = 20) => apiCall(`/api/v1/vulnerabilities/scans?limit=${limit}`),
    getScan: (id: string) => apiCall(`/api/v1/vulnerabilities/scans/${id}`),
    getRemediationPlan: (scanId: string) => apiCall(`/api/v1/vulnerabilities/scans/${scanId}/remediation`),
    getSlaPolicy: () => apiCall('/api/v1/vulnerabilities/sla-policy'),
    getSummary: () => apiCall('/api/v1/vulnerabilities/summary'),
    getEcosystems: () => apiCall('/api/v1/vulnerabilities/ecosystems'),
  };
}

// ============================================================
// CODE GENERATION HOOKS
// ============================================================

export function useCodeGen() {
  const { apiCall } = useBackend();
  return {
    listLanguages: () => apiCall('/api/v1/codegen/languages'),
    listProjectTypes: () => apiCall('/api/v1/codegen/project-types'),
    listTemplates: () => apiCall('/api/v1/codegen/templates'),
    generateProject: (data: Record<string, unknown>) =>
      apiCall('/api/v1/codegen/generate', { method: 'POST', body: JSON.stringify(data) }),
    getProject: (id: string) => apiCall(`/api/v1/codegen/projects/${id}`),
    getProjectFile: (id: string, filePath: string) =>
      apiCall(`/api/v1/codegen/projects/${id}/files/${filePath}`),
    listProjects: () => apiCall('/api/v1/codegen/projects'),
    getCompletion: (data: Record<string, unknown>) =>
      apiCall('/api/v1/codegen/complete', { method: 'POST', body: JSON.stringify(data) }),
    refactorCode: (data: Record<string, unknown>) =>
      apiCall('/api/v1/codegen/refactor', { method: 'POST', body: JSON.stringify(data) }),
  };
}

// ============================================================
// VERSION HISTORY HOOKS
// ============================================================

export function useVersionHistory() {
  const { apiCall } = useBackend();
  return {
    listEntityTypes: () => apiCall('/api/v1/versions/entity-types'),
    listChangeTypes: () => apiCall('/api/v1/versions/change-types'),
    saveVersion: (data: Record<string, unknown>) =>
      apiCall('/api/v1/versions/save', { method: 'POST', body: JSON.stringify(data) }),
    listVersions: (entityType: string, entityId: string, limit = 20) =>
      apiCall(`/api/v1/versions/${entityType}/${entityId}?limit=${limit}`),
    getLatestVersion: (entityType: string, entityId: string) =>
      apiCall(`/api/v1/versions/${entityType}/${entityId}/latest`),
    getVersion: (entityType: string, entityId: string, versionNumber: number) =>
      apiCall(`/api/v1/versions/${entityType}/${entityId}/${versionNumber}`),
    rollback: (data: Record<string, unknown>) =>
      apiCall('/api/v1/versions/rollback', { method: 'POST', body: JSON.stringify(data) }),
    getSummary: (entityType: string, entityId: string) =>
      apiCall(`/api/v1/versions/${entityType}/${entityId}/summary-stats`),
  };
}

export default BackendProvider;