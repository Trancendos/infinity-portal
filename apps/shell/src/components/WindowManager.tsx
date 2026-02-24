/**
 * WindowManager — Draggable, resizable window system
 * Manages z-order, focus, minimise, maximise, close
 */

import React, { useRef, useCallback } from 'react';
import type { Window as OSWindow } from '@infinity-os/types';

interface WindowManagerProps {
  windows: OSWindow[];
  onClose: (windowId: string) => void;
  onFocus: (windowId: string) => void;
  onUpdate: (windowId: string, updates: Partial<OSWindow>) => void;
}

interface DragState {
  windowId: string;
  startX: number;
  startY: number;
  startWinX: number;
  startWinY: number;
}

export function WindowManager({ windows, onClose, onFocus, onUpdate }: WindowManagerProps) {
  const dragState = useRef<DragState | null>(null);

  const handleTitlebarMouseDown = useCallback((e: React.MouseEvent, window: OSWindow) => {
    if (window.isMaximised) return;
    e.preventDefault();
    onFocus(window.id);

    dragState.current = {
      windowId: window.id,
      startX: e.clientX,
      startY: e.clientY,
      startWinX: window.x,
      startWinY: window.y,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      onUpdate(dragState.current.windowId, {
        x: Math.max(0, dragState.current.startWinX + dx),
        y: Math.max(0, dragState.current.startWinY + dy),
      });
    };

    const handleMouseUp = () => {
      dragState.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onFocus, onUpdate]);

  const handleMaximise = useCallback((window: OSWindow) => {
    onUpdate(window.id, { isMaximised: !window.isMaximised });
  }, [onUpdate]);

  const handleMinimise = useCallback((window: OSWindow) => {
    onUpdate(window.id, { isMinimised: true, isFocused: false });
  }, [onUpdate]);

  return (
    <>
      {windows.filter(w => !w.isMinimised).map(window => (
        <div
          key={window.id}
          className={`window ${window.isFocused ? 'window--focused' : ''}`}
          role="dialog"
          aria-label={window.title}
          aria-modal="false"
          onClick={() => onFocus(window.id)}
          style={{
            left: window.isMaximised ? 0 : window.x,
            top: window.isMaximised ? 0 : window.y,
            width: window.isMaximised ? '100vw' : window.width,
            height: window.isMaximised ? 'calc(100vh - 52px)' : window.height,
            zIndex: window.zIndex,
            borderRadius: window.isMaximised ? 0 : undefined,
          }}
        >
          {/* Title Bar */}
          <div
            className="window__titlebar"
            onMouseDown={(e) => handleTitlebarMouseDown(e, window)}
            onDoubleClick={() => handleMaximise(window)}
          >
            <div className="window__controls">
              <button
                className="window__control window__control--close"
                onClick={(e) => { e.stopPropagation(); onClose(window.id); }}
                aria-label={`Close ${window.title}`}
                title="Close"
              />
              <button
                className="window__control window__control--min"
                onClick={(e) => { e.stopPropagation(); handleMinimise(window); }}
                aria-label={`Minimise ${window.title}`}
                title="Minimise"
              />
              <button
                className="window__control window__control--max"
                onClick={(e) => { e.stopPropagation(); handleMaximise(window); }}
                aria-label={`${window.isMaximised ? 'Restore' : 'Maximise'} ${window.title}`}
                title={window.isMaximised ? 'Restore' : 'Maximise'}
              />
            </div>
            <span className="window__title">{window.title}</span>
          </div>

          {/* Window Content — Module renders here */}
          <div className="window__content">
            <ModuleRenderer moduleId={window.moduleId} windowId={window.id} />
          </div>
        </div>
      ))}
    </>
  );
}

/** Renders the appropriate module content inside a window */
function ModuleRenderer({ moduleId, windowId }: { moduleId: string; windowId: string }) {
  // In Phase 3: dynamically load micro-frontend via Module Federation
  // For now: render placeholder content per module
  const moduleContent: Record<string, React.ReactNode> = {
    'com.infinity-os.file-manager': <FileManagerPlaceholder />,
    'com.infinity-os.text-editor':  <TextEditorPlaceholder />,
    'com.infinity-os.terminal':     <TerminalPlaceholder />,
    'com.infinity-os.settings':     <SettingsPlaceholder />,
    'com.infinity-os.app-store':    <AppStorePlaceholder />,
  };

  return (
    <div style={{ padding: 24, height: '100%' }}>
      {moduleContent[moduleId] ?? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div>Module <code>{moduleId}</code> is loading...</div>
        </div>
      )}
    </div>
  );
}

function FileManagerPlaceholder() {
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
        📁 File Manager
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Virtual file system — Phase 1 implementation. Connect to the File System Service worker to browse files.
      </p>
    </div>
  );
}

function TextEditorPlaceholder() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>📝 Text Editor</h2>
      <textarea
        style={{
          flex: 1,
          background: 'var(--bg-input)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: 12,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          resize: 'none',
          outline: 'none',
        }}
        placeholder="Start typing..."
        aria-label="Text editor content"
      />
    </div>
  );
}

function TerminalPlaceholder() {
  return (
    <div style={{
      background: '#0a0a0a',
      height: '100%',
      borderRadius: 8,
      padding: 16,
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      color: '#00ff88',
    }}>
      <div>Infinity OS Terminal v0.1.0</div>
      <div style={{ color: '#606060' }}>Type 'help' for available commands</div>
      <div style={{ marginTop: 8 }}>
        <span style={{ color: '#6c63ff' }}>infinity@os</span>
        <span style={{ color: '#ffffff' }}>:~$ </span>
        <span style={{ animation: 'pulse 1s infinite' }}>▋</span>
      </div>
    </div>
  );
}

function SettingsPlaceholder() {
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
        ⚙️ Settings
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {['Appearance', 'Privacy & Security', 'Notifications', 'Modules', 'Account', 'About'].map(item => (
          <button
            key={item}
            style={{
              padding: '10px 14px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function AppStorePlaceholder() {
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
        🏪 Infinity Market
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Discover and install modules for Infinity OS
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {['Calendar', 'Notes', 'Calculator', 'Weather', 'Music', 'Photos'].map(app => (
          <div
            key={app}
            style={{
              padding: 16,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 12,
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{app}</div>
          </div>
        ))}
      </div>
    </div>
  );
}