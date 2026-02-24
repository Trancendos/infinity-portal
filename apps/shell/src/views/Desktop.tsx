/**
 * Desktop — The main Infinity OS desktop environment
 * Implements: Window manager, taskbar, notification centre,
 * system tray, widget grid, universal search
 */

import React, { useState, useCallback } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { useKernel } from '../providers/KernelProvider';
import { Taskbar } from '../components/Taskbar';
import { WindowManager } from '../components/WindowManager';
import { NotificationCentre } from '../components/NotificationCentre';
import { UniversalSearch } from '../components/UniversalSearch';
import { DesktopWidgets } from '../components/DesktopWidgets';
import { ContextMenu } from '../components/ContextMenu';
import type { Window as OSWindow } from '@infinity-os/types';

interface DesktopState {
  windows: OSWindow[];
  activeWindowId: string | null;
  searchOpen: boolean;
  notificationsOpen: boolean;
  contextMenu: { x: number; y: number } | null;
}

export default function Desktop() {
  const { user } = useAuth();
  const { kernel, uptime } = useKernel();

  const [state, setState] = useState<DesktopState>({
    windows: [],
    activeWindowId: null,
    searchOpen: false,
    notificationsOpen: false,
    contextMenu: null,
  });

  const openModule = useCallback((moduleId: string, title: string) => {
    const existingWindow = state.windows.find(w => w.moduleId === moduleId);
    if (existingWindow) {
      // Focus existing window
      setState(prev => ({
        ...prev,
        activeWindowId: existingWindow.id,
        windows: prev.windows.map(w =>
          w.id === existingWindow.id
            ? { ...w, isMinimised: false, zIndex: Math.max(...prev.windows.map(w => w.zIndex)) + 1 }
            : w
        ),
      }));
      return;
    }

    const newWindow: OSWindow = {
      id: crypto.randomUUID(),
      moduleId,
      title,
      x: 80 + state.windows.length * 30,
      y: 80 + state.windows.length * 30,
      width: 800,
      height: 600,
      isMinimised: false,
      isMaximised: false,
      isFocused: true,
      zIndex: state.windows.length + 1,
    };

    // Spawn kernel process for module
    kernel.processes.spawn(moduleId);

    setState(prev => ({
      ...prev,
      windows: [...prev.windows.map(w => ({ ...w, isFocused: false })), newWindow],
      activeWindowId: newWindow.id,
    }));
  }, [state.windows, kernel]);

  const closeWindow = useCallback((windowId: string) => {
    const window = state.windows.find(w => w.id === windowId);
    if (window) {
      const process = kernel.processes.getProcessByModule(window.moduleId);
      if (process) kernel.processes.terminate(process.pid);
    }
    setState(prev => ({
      ...prev,
      windows: prev.windows.filter(w => w.id !== windowId),
      activeWindowId: prev.activeWindowId === windowId ? null : prev.activeWindowId,
    }));
  }, [state.windows, kernel]);

  const focusWindow = useCallback((windowId: string) => {
    setState(prev => ({
      ...prev,
      activeWindowId: windowId,
      windows: prev.windows.map(w => ({
        ...w,
        isFocused: w.id === windowId,
        zIndex: w.id === windowId
          ? Math.max(...prev.windows.map(w => w.zIndex)) + 1
          : w.zIndex,
      })),
    }));
  }, []);

  const handleDesktopRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setState(prev => ({ ...prev, contextMenu: { x: e.clientX, y: e.clientY } }));
  }, []);

  const handleDesktopClick = useCallback(() => {
    setState(prev => ({ ...prev, contextMenu: null }));
  }, []);

  return (
    <div
      className="desktop"
      onContextMenu={handleDesktopRightClick}
      onClick={handleDesktopClick}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--desktop-bg)',
        userSelect: 'none',
      }}
    >
      {/* Desktop Widgets Layer */}
      <DesktopWidgets user={user!} />

      {/* Window Manager Layer */}
      <WindowManager
        windows={state.windows}
        onClose={closeWindow}
        onFocus={focusWindow}
        onUpdate={(windowId, updates) => {
          setState(prev => ({
            ...prev,
            windows: prev.windows.map(w => w.id === windowId ? { ...w, ...updates } : w),
          }));
        }}
      />

      {/* Universal Search Overlay */}
      {state.searchOpen && (
        <UniversalSearch
          onClose={() => setState(prev => ({ ...prev, searchOpen: false }))}
          onOpenModule={openModule}
        />
      )}

      {/* Notification Centre Panel */}
      {state.notificationsOpen && (
        <NotificationCentre
          onClose={() => setState(prev => ({ ...prev, notificationsOpen: false }))}
        />
      )}

      {/* Context Menu */}
      {state.contextMenu && (
        <ContextMenu
          x={state.contextMenu.x}
          y={state.contextMenu.y}
          onClose={() => setState(prev => ({ ...prev, contextMenu: null }))}
          onOpenModule={openModule}
        />
      )}

      {/* Taskbar — always on top */}
      <Taskbar
        windows={state.windows}
        user={user!}
        uptime={uptime}
        onOpenModule={openModule}
        onFocusWindow={focusWindow}
        onToggleSearch={() => setState(prev => ({ ...prev, searchOpen: !prev.searchOpen }))}
        onToggleNotifications={() => setState(prev => ({ ...prev, notificationsOpen: !prev.notificationsOpen }))}
      />
    </div>
  );
}