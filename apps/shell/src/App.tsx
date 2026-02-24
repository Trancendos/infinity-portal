/**
 * Infinity OS Shell — Root Application Component
 * Routes between the login screen and the desktop environment
 */

import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './providers/AuthProvider';
import { LoadingScreen } from './components/LoadingScreen';

// Lazy-load major views for performance
const Desktop = lazy(() => import('./views/Desktop'));
const Login = lazy(() => import('./views/Login'));
const Register = lazy(() => import('./views/Register'));
const LockScreen = lazy(() => import('./views/LockScreen'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (user) return <Navigate to="/desktop" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

        {/* Protected routes */}
        <Route path="/desktop" element={<ProtectedRoute><Desktop /></ProtectedRoute>} />
        <Route path="/lock" element={<ProtectedRoute><LockScreen /></ProtectedRoute>} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/desktop" replace />} />
        <Route path="*" element={<Navigate to="/desktop" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;