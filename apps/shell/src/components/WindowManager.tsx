/**
 * WindowManager — Module rendering with real implementations
 * Platform Core modules: Infinity-One, Lighthouse, HIVE, The Void, Platform Observatory
 */
import React, { Suspense, lazy } from 'react';

// Lazy-load modules for code splitting
const AdminPanel = lazy(() => import('../modules/AdminPanel'));
const ComplianceDashboard = lazy(() => import('../modules/ComplianceDashboard'));
const HITLDashboard = lazy(() => import('../modules/HITLDashboard'));
const RepositoryManager = lazy(() => import('../modules/RepositoryManager'));
const BuildManager = lazy(() => import('../modules/BuildManager'));
const FederationDashboard = lazy(() => import('../modules/FederationDashboard'));
const KanbanBoard = lazy(() => import('../modules/KanbanBoard'));
const FileManager = lazy(() => import('../modules/FileManager'));
const AIStudio = lazy(() => import('../modules/AIStudio'));
const Settings = lazy(() => import('../modules/Settings'));
const Terminal = lazy(() => import('../modules/Terminal'));
const IntegrationHub = lazy(() => import('../modules/IntegrationHub'));
const AppStore = lazy(() => import('../modules/AppStore'));
const NotificationCentre = lazy(() => import('../modules/NotificationCentre'));

// Project & IT Management modules
const ITSMDashboard = lazy(() => import('../modules/ITSMDashboard'));
const ProjectGates = lazy(() => import('../modules/ProjectGates'));
const TownHallDashboard = lazy(() => import('../modules/TownHallDashboard'));
const DocumentLibrary = lazy(() => import('../modules/DocumentLibrary'));
const AssetRegistry = lazy(() => import('../modules/AssetRegistry'));
const KnowledgeHub = lazy(() => import('../modules/KnowledgeHub'));
const DependencyMap = lazy(() => import('../modules/DependencyMap'));

// Production hardening modules
const WorkflowBuilder = lazy(() => import('../modules/WorkflowBuilder'));
const SecretsVault = lazy(() => import('../modules/SecretsVault'));
const ObservabilityDashboard = lazy(() => import('../modules/ObservabilityDashboard'));

// ─── Platform Core modules ────────────────────────────────────────────────────
// Infinity-One: IAM & Zero-Trust Identity
const InfinityOneDashboard = lazy(() => import('../modules/InfinityOneDashboard'));
// Lighthouse: Cryptographic Token Hub & PQC Key Management
const LighthouseDashboard = lazy(() => import('../modules/LighthouseDashboard'));
// HIVE: Agent Swarm Intelligence & Orchestration (27 agents)
const HiveDashboard = lazy(() => import('../modules/HiveDashboard'));
// The Void: Encrypted Secrets Vault with Crypto-Shredding
const VoidDashboard = lazy(() => import('../modules/VoidDashboard'));
// Platform Observatory: Unified Monitoring (Prometheus + Grafana + all services)
const PlatformObservatory = lazy(() => import('../modules/PlatformObservatory'));
// ─────────────────────────────────────────────────────────────────────────────

interface WindowProps {
  id: string;
  moduleId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isActive: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onFocus: (id: string) => void;
  onDragStart?: (id: string, e: React.MouseEvent) => void;
}

// Loading fallback
function ModuleLoading() {
  return (
    <div className="flex items-center justify-center h-full bg-slate-900 text-white">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-white/50">Loading module...</p>
      </div>
    </div>
  );
}

// Placeholder for modules not yet implemented
function PlaceholderModule({ name, icon }: { name: string; icon: string }) {
  return (
    <div className="flex items-center justify-center h-full bg-slate-900 text-white">
      <div className="text-center">
        <div className="text-6xl mb-4">{icon}</div>
        <h3 className="text-xl font-bold mb-2">{name}</h3>
        <p className="text-sm text-white/50">Module coming soon</p>
      </div>
    </div>
  );
}

// Module registry — maps module IDs to components
function ModuleRenderer({ moduleId }: { moduleId: string }) {
  const moduleMap: Record<string, React.ReactNode> = {
    // Core modules with full implementations
    'com.infinity-os.admin-panel': <AdminPanel />,
    'com.infinity-os.compliance': <ComplianceDashboard />,
    'com.infinity-os.hitl-dashboard': <HITLDashboard />,
    'com.infinity-os.repositories': <RepositoryManager />,
    'com.infinity-os.build-manager': <BuildManager />,
    'com.infinity-os.federation': <FederationDashboard />,
    'com.infinity-os.kanban': <KanbanBoard />,

    // Implemented modules
    'com.infinity-os.file-manager': <FileManager />,
    'com.infinity-os.terminal': <Terminal />,
    'com.infinity-os.settings': <Settings />,
    'com.infinity-os.ai-studio': <AIStudio />,
    'com.infinity-os.integrations': <IntegrationHub />,
    'com.infinity-os.appstore': <AppStore />,
    'com.infinity-os.notifications': <NotificationCentre />,

    // Project & IT Management modules
    'com.infinity-os.itsm': <ITSMDashboard />,
    'com.infinity-os.gates': <ProjectGates />,
    'com.infinity-os.townhall': <TownHallDashboard />,
    'com.infinity-os.documents': <DocumentLibrary />,
    'com.infinity-os.assets': <AssetRegistry />,
    'com.infinity-os.knowledge': <KnowledgeHub />,
    'com.infinity-os.dependencies': <DependencyMap />,
    'com.infinity-os.workflows': <WorkflowBuilder />,
    'com.infinity-os.secrets': <SecretsVault />,
    'com.infinity-os.observability': <ObservabilityDashboard />,

    // ─── Platform Core ────────────────────────────────────────────────────────
    // Infinity-One IAM — Zero-Trust Identity & Access Management
    'com.infinity-os.infinity-one': <InfinityOneDashboard />,
    // Lighthouse — Cryptographic Token Hub, UETs, PQC Key Management
    'com.infinity-os.lighthouse': <LighthouseDashboard />,
    // HIVE — Agent Swarm Intelligence, 27 AI Agents, Canon Governance
    'com.infinity-os.hive': <HiveDashboard />,
    // The Void — Encrypted Secrets Vault, Crypto-Shredding, Lighthouse-backed
    'com.infinity-os.void': <VoidDashboard />,
    // Platform Observatory — Unified Monitoring (Prometheus + Grafana + all services)
    'com.infinity-os.observatory': <PlatformObservatory />,
    // ─────────────────────────────────────────────────────────────────────────

    // Placeholder modules (to be implemented)
    'com.infinity-os.text-editor': <PlaceholderModule name="Text Editor" icon="📝" />,
    'com.infinity-os.browser': <PlaceholderModule name="Browser" icon="🌐" />,
    'com.infinity-os.media-player': <PlaceholderModule name="Media Player" icon="🎵" />,
    'com.infinity-os.calendar': <PlaceholderModule name="Calendar" icon="📅" />,
    'com.infinity-os.mail': <PlaceholderModule name="Mail" icon="✉️" />,
    'com.infinity-os.notes': <PlaceholderModule name="Notes" icon="📒" />,
  };

  return (
    <Suspense fallback={<ModuleLoading />}>
      {moduleMap[moduleId] || <PlaceholderModule name={moduleId} icon="📦" />}
    </Suspense>
  );
}

export default function Window({
  id,
  moduleId,
  title,
  x,
  y,
  width,
  height,
  isActive,
  isMinimized,
  isMaximized,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  onDragStart,
}: WindowProps) {
  if (isMinimized) return null;

  const style: React.CSSProperties = isMaximized
    ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 48, zIndex: isActive ? 50 : 10 }
    : { position: 'absolute', top: y, left: x, width, height, zIndex: isActive ? 50 : 10 };

  return (
    <div
      style={style}
      className={`flex flex-col rounded-lg overflow-hidden shadow-2xl border transition-shadow ${
        isActive
          ? 'border-purple-500/50 shadow-purple-500/10'
          : 'border-white/10 shadow-black/20'
      }`}
      onMouseDown={() => onFocus(id)}
    >
      {/* Title Bar */}
      <div
        className={`flex items-center justify-between px-4 py-2 select-none cursor-move ${
          isActive
            ? 'bg-gradient-to-r from-slate-800 to-slate-700'
            : 'bg-slate-800/80'
        }`}
        onMouseDown={(e) => onDragStart?.(id, e)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/80 truncate max-w-xs">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onMinimize(id); }}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-white text-xs"
          >
            ─
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMaximize(id); }}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-white text-xs"
          >
            □
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(id); }}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/80 text-white/50 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-slate-900">
        <ModuleRenderer moduleId={moduleId} />
      </div>
    </div>
  );
}

// Export module registry for desktop icons
export const MODULE_REGISTRY = [
  { id: 'com.infinity-os.kanban', name: 'Task Board', icon: '📋', category: 'productivity' },
  { id: 'com.infinity-os.admin-panel', name: 'Admin Panel', icon: '👥', category: 'system' },
  { id: 'com.infinity-os.townhall', name: 'The TownHall', icon: '🏛️', category: 'governance' },
  { id: 'com.infinity-os.compliance', name: 'Compliance', icon: '🛡️', category: 'governance' },
  { id: 'com.infinity-os.hitl-dashboard', name: 'HITL Oversight', icon: '🔍', category: 'governance' },
  { id: 'com.infinity-os.repositories', name: 'Repositories', icon: '📦', category: 'development' },
  { id: 'com.infinity-os.build-manager', name: 'Build & Package', icon: '🔨', category: 'development' },
  { id: 'com.infinity-os.federation', name: 'Federation Hub', icon: '🌐', category: 'system' },
  { id: 'com.infinity-os.file-manager', name: 'Files', icon: '📁', category: 'productivity' },
  { id: 'com.infinity-os.text-editor', name: 'Editor', icon: '📝', category: 'productivity' },
  { id: 'com.infinity-os.terminal', name: 'Terminal', icon: '💻', category: 'development' },
  { id: 'com.infinity-os.ai-studio', name: 'AI Studio', icon: '🤖', category: 'ai' },
  { id: 'com.infinity-os.integrations', name: 'Integrations', icon: '🔗', category: 'system' },
  { id: 'com.infinity-os.appstore', name: 'App Store', icon: '🏪', category: 'system' },
  { id: 'com.infinity-os.notifications', name: 'Notifications', icon: '🔔', category: 'system' },
  { id: 'com.infinity-os.settings', name: 'Settings', icon: '⚙️', category: 'system' },
  { id: 'com.infinity-os.browser', name: 'Browser', icon: '🌐', category: 'productivity' },

  // Project & IT Management
  { id: 'com.infinity-os.itsm', name: 'ITSM', icon: '🎫', category: 'management' },
  { id: 'com.infinity-os.gates', name: 'Project Gates', icon: '🚦', category: 'management' },
  { id: 'com.infinity-os.documents', name: 'Documents', icon: '📚', category: 'management' },
  { id: 'com.infinity-os.assets', name: 'Asset Registry', icon: '🏷', category: 'management' },
  { id: 'com.infinity-os.knowledge', name: 'Knowledge Hub', icon: '🧠', category: 'management' },
  { id: 'com.infinity-os.dependencies', name: 'Dependencies', icon: '🗺', category: 'management' },

  // Production hardening
  { id: 'com.infinity-os.workflows', name: 'Workflow Builder', icon: '⚡', category: 'automation' },

  // Security & Secrets
  { id: 'com.infinity-os.secrets', name: 'Secrets Vault', icon: '🔑', category: 'security' },
  { id: 'com.infinity-os.observability', name: 'Observability', icon: '📊', category: 'operations' },

  // ─── Platform Core ─────────────────────────────────────────────────────────
  { id: 'com.infinity-os.infinity-one', name: 'Infinity-One IAM', icon: '∞', category: 'platform-core' },
  { id: 'com.infinity-os.lighthouse', name: 'Lighthouse', icon: '🔦', category: 'platform-core' },
  { id: 'com.infinity-os.hive', name: 'HIVE', icon: '🐝', category: 'platform-core' },
  { id: 'com.infinity-os.void', name: 'The Void', icon: '🌌', category: 'platform-core' },
  { id: 'com.infinity-os.observatory', name: 'Observatory', icon: '🔭', category: 'platform-core' },
  // ───────────────────────────────────────────────────────────────────────────
];
// ============================================================
// WINDOW MANAGER — Renders all open windows
// ============================================================
interface WindowManagerProps {
  windows: Array<{
    id: string;
    moduleId: string;
    title: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    isMinimized?: boolean;
    isMaximized?: boolean;
  }>;
  onClose: (windowId: string) => void;
  onFocus: (windowId: string) => void;
  onUpdate?: (windowId: string, updates: Record<string, unknown>) => void;
}

export function WindowManager({ windows, onClose, onFocus, onUpdate }: WindowManagerProps) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {windows.map((win, index) => (
        <div key={win.id} className="pointer-events-auto">
          <Window
            id={win.id}
            moduleId={win.moduleId}
            title={win.title}
            x={win.x ?? 100 + index * 30}
            y={win.y ?? 100 + index * 30}
            width={win.width ?? 800}
            height={win.height ?? 600}
            isActive={index === windows.length - 1}
            isMinimized={win.isMinimized ?? false}
            isMaximized={win.isMaximized ?? false}
            onClose={() => onClose(win.id)}
            onMinimize={() => onUpdate?.(win.id, { isMinimized: true })}
            onMaximize={() => onUpdate?.(win.id, { isMaximized: !(win.isMaximized ?? false) })}
            onFocus={() => onFocus(win.id)}
            onDragStart={() => {}}
          />
        </div>
      ))}
    </div>
  );
}
