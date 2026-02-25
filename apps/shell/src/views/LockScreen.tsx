/**
 * LockScreen View — Session lock with quick unlock
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../providers/AuthProvider';

export default function LockScreen() {
  const { user, unlock } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email, password }),
      });
      if (!res.ok) throw new Error('Invalid password');
      const data = await res.json();
      unlock?.(data);
    } catch {
      setError('Incorrect password');
      setPassword('');
    }
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatDate = (d: Date) =>
    d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 relative overflow-hidden">
      {/* Background blur circles */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

      {/* Clock */}
      <div className="text-center mb-12 z-10">
        <div className="text-8xl font-thin text-white tracking-wider mb-2">
          {formatTime(time)}
        </div>
        <div className="text-xl text-white/50 font-light">
          {formatDate(time)}
        </div>
      </div>

      {/* User avatar & unlock */}
      <div className="z-10 flex flex-col items-center">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
          <span className="text-3xl text-white font-bold">
            {user?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '∞'}
          </span>
        </div>
        <p className="text-white text-lg mb-1">
          {user?.display_name || user?.email || 'User'}
        </p>
        <p className="text-white/40 text-sm mb-6">Locked</p>

        {error && (
          <div className="mb-4 px-4 py-2 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleUnlock} className="flex gap-2">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-4 py-3 w-64 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-purple-500 backdrop-blur-sm"
            placeholder="Enter password to unlock"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            →
          </button>
        </form>
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-8 text-white/30 text-sm z-10">
        Press Enter to unlock • Infinity OS v3.0
      </div>
    </div>
  );
}