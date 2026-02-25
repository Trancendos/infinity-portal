/**
 * WindowManager — Module rendering with real implementations
 */
import React, { Suspense, lazy } from 'react';

// Lazy-load modules for code splitting
const AdminPanel = lazy(() => import('../modules/AdminPanel'));
const ComplianceDashboard = lazy(() => import('../modules/ComplianceDashboard'));
const HITLDashboard = lazy(() => import('../modules/HITLDashboard'));
const RepositoryManager = lazy(() => import('../modules/RepositoryManager'));
const BuildManager = lazy(() => import('../modules/BuildManager'));
const FederationDashboard = lazy(() => import('../modules/FederationDashboard'));

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

    // Placeholder modules (to be implemented)
    'com.infinity-os.file-manager': <PlaceholderModule name="File Manager" icon="📁" />,
    'com.infinity-os.text-editor': <PlaceholderModule name="Text Editor" icon="📝" />,
    'com.infinity-os.terminal': <PlaceholderModule name="Terminal" icon="💻" />,
    'com.infinity-os.settings': <PlaceholderModule name="Settings" icon="⚙️" />,
    'com.infinity-os.ai-studio': <PlaceholderModule name="AI Studio" icon="🤖" />,
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
  { id: 'com.infinity-os.admin-panel', name: 'Admin Panel', icon: '👥', category: 'system' },
  { id: 'com.infinity-os.compliance', name: 'Compliance', icon: '🛡️', category: 'governance' },
  { id: 'com.infinity-os.hitl-dashboard', name: 'HITL Oversight', icon: '🔍', category: 'governance' },
  { id: 'com.infinity-os.repositories', name: 'Repositories', icon: '📦', category: 'development' },
  { id: 'com.infinity-os.build-manager', name: 'Build & Package', icon: '🔨', category: 'development' },
  { id: 'com.infinity-os.federation', name: 'Federation Hub', icon: '🌐', category: 'system' },
  { id: 'com.infinity-os.file-manager', name: 'Files', icon: '📁', category: 'productivity' },
  { id: 'com.infinity-os.text-editor', name: 'Editor', icon: '📝', category: 'productivity' },
  { id: 'com.infinity-os.terminal', name: 'Terminal', icon: '💻', category: 'development' },
  { id: 'com.infinity-os.ai-studio', name: 'AI Studio', icon: '🤖', category: 'ai' },
  { id: 'com.infinity-os.settings', name: 'Settings', icon: '⚙️', category: 'system' },
  { id: 'com.infinity-os.browser', name: 'Browser', icon: '🌐', category: 'productivity' },
];