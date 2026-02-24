/**
 * Infinity OS Shell — Entry Point
 * The browser-native Virtual Operating System
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { KernelProvider } from './providers/KernelProvider';
import { AuthProvider } from './providers/AuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import './styles/globals.css';

// Register Service Worker (Kernel)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('[Infinity OS] Service Worker registered:', registration.scope);
    } catch (error) {
      console.error('[Infinity OS] Service Worker registration failed:', error);
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <KernelProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </KernelProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);