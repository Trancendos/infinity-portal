/**
 * Settings — System preferences and profile management
 */
import React, { useState, useEffect } from 'react';

type SettingsTab = 'profile' | 'appearance' | 'security' | 'notifications' | 'about';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState(localStorage.getItem('infinity_theme') || 'dark');
  const [accentColor, setAccentColor] = useState(localStorage.getItem('infinity_accent') || 'purple');
  const [fontSize, setFontSize] = useState(localStorage.getItem('infinity_font_size') || 'medium');
  const [notifications, setNotifications] = useState({
    desktop: true,
    sound: false,
    email: true,
    hitlAlerts: true,
    complianceAlerts: true,
    buildAlerts: false,
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const token = localStorage.getItem('infinity_access_token');
  const apiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    const stored = localStorage.getItem('infinity_user');
    if (stored) setUser(JSON.parse(stored));
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/me`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        localStorage.setItem('infinity_user', JSON.stringify(data));
      }
    } catch (e) { /* ignore */ }
  };

  const changePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm) {
      setMessage('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/change-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          current_password: passwordForm.current,
          new_password: passwordForm.new_password,
        }),
      });
      if (res.ok) {
        setMessage('Password changed successfully');
        setPasswordForm({ current: '', new_password: '', confirm: '' });
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.detail || 'Failed to change password');
      }
    } catch (e) {
      setMessage('Network error');
    }
    setSaving(false);
  };

  const saveAppearance = () => {
    localStorage.setItem('infinity_theme', theme);
    localStorage.setItem('infinity_accent', accentColor);
    localStorage.setItem('infinity_font_size', fontSize);
    setMessage('Appearance settings saved');
  };

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'about', label: 'About', icon: 'ℹ️' },
  ];

  const accentColors = [
    { id: 'purple', label: 'Purple', class: 'bg-purple-500' },
    { id: 'blue', label: 'Blue', class: 'bg-blue-500' },
    { id: 'green', label: 'Green', class: 'bg-green-500' },
    { id: 'orange', label: 'Orange', class: 'bg-orange-500' },
    { id: 'pink', label: 'Pink', class: 'bg-pink-500' },
    { id: 'cyan', label: 'Cyan', class: 'bg-cyan-500' },
  ];

  return (
    <div className="flex h-full bg-slate-900 text-white">
      {/* Sidebar */}
      <div className="w-56 border-r border-white/10 bg-slate-800/30 p-3">
        <h2 className="text-sm font-bold text-white/50 uppercase tracking-wider px-3 py-2">Settings</h2>
        <nav className="space-y-0.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                activeTab === tab.id ? 'bg-purple-500/20 text-purple-400' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {message && (
          <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-sm flex justify-between">
            {message}
            <button onClick={() => setMessage('')} className="text-white/50 hover:text-white">✕</button>
          </div>
        )}

        {/* Profile */}
        {activeTab === 'profile' && user && (
          <div className="max-w-lg space-y-6">
            <h3 className="text-xl font-bold">Profile</h3>
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-2xl font-bold">
                {(user.display_name || user.email)?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div className="font-bold">{user.display_name || 'User'}</div>
                <div className="text-sm text-white/50">{user.email}</div>
                <div className="text-xs text-purple-400 mt-0.5">{user.role?.replace('_', ' ')?.toUpperCase()}</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/40 block mb-1">Display Name</label>
                <input value={user.display_name || ''} readOnly className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Email</label>
                <input value={user.email || ''} readOnly className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Organisation</label>
                <input value={user.organisation_id || ''} readOnly className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm font-mono text-xs" />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">MFA Status</label>
                <span className={`text-sm ${user.mfa_enabled ? 'text-green-400' : 'text-yellow-400'}`}>
                  {user.mfa_enabled ? '✅ Enabled' : '⚠️ Not enabled'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Appearance */}
        {activeTab === 'appearance' && (
          <div className="max-w-lg space-y-6">
            <h3 className="text-xl font-bold">Appearance</h3>
            <div>
              <label className="text-sm text-white/60 block mb-2">Theme</label>
              <div className="flex gap-2">
                {['dark', 'light', 'auto'].map(t => (
                  <button key={t} onClick={() => setTheme(t)} className={`px-4 py-2 rounded-lg text-sm capitalize ${theme === t ? 'bg-purple-600' : 'bg-white/5 hover:bg-white/10'}`}>
                    {t === 'dark' ? '🌙' : t === 'light' ? '☀️' : '🔄'} {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-white/60 block mb-2">Accent Colour</label>
              <div className="flex gap-2">
                {accentColors.map(c => (
                  <button key={c.id} onClick={() => setAccentColor(c.id)} className={`w-10 h-10 rounded-full ${c.class} ${accentColor === c.id ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`} title={c.label} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-white/60 block mb-2">Font Size</label>
              <div className="flex gap-2">
                {['small', 'medium', 'large'].map(s => (
                  <button key={s} onClick={() => setFontSize(s)} className={`px-4 py-2 rounded-lg text-sm capitalize ${fontSize === s ? 'bg-purple-600' : 'bg-white/5 hover:bg-white/10'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={saveAppearance} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm">Save Appearance</button>
          </div>
        )}

        {/* Security */}
        {activeTab === 'security' && (
          <div className="max-w-lg space-y-6">
            <h3 className="text-xl font-bold">Security</h3>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
              <h4 className="font-medium">Change Password</h4>
              <input type="password" placeholder="Current password" value={passwordForm.current} onChange={e => setPasswordForm(p => ({ ...p, current: e.target.value }))} className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" />
              <input type="password" placeholder="New password (min 12 chars)" value={passwordForm.new_password} onChange={e => setPasswordForm(p => ({ ...p, new_password: e.target.value }))} className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" />
              <input type="password" placeholder="Confirm new password" value={passwordForm.confirm} onChange={e => setPasswordForm(p => ({ ...p, confirm: e.target.value }))} className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" />
              <button onClick={changePassword} disabled={saving} className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-sm disabled:opacity-50">
                {saving ? 'Changing...' : 'Change Password'}
              </button>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h4 className="font-medium mb-2">Active Sessions</h4>
              <p className="text-sm text-white/50">Session management coming soon</p>
            </div>
          </div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div className="max-w-lg space-y-6">
            <h3 className="text-xl font-bold">Notifications</h3>
            <div className="space-y-3">
              {Object.entries(notifications).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <button onClick={() => setNotifications(n => ({ ...n, [key]: !value }))} className={`w-10 h-6 rounded-full transition ${value ? 'bg-purple-600' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* About */}
        {activeTab === 'about' && (
          <div className="max-w-lg space-y-6">
            <h3 className="text-xl font-bold">About Infinity OS</h3>
            <div className="p-6 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20">
              <div className="text-3xl mb-2">♾️</div>
              <h4 className="text-lg font-bold">Infinity OS v3.0.0</h4>
              <p className="text-sm text-white/50 mt-1">Browser-native AI-augmented Virtual Operating System</p>
              <div className="mt-4 space-y-1 text-sm text-white/40">
                <div>Platform: Trancendos</div>
                <div>Compliance: EU AI Act Ready</div>
                <div>Architecture: FastAPI + React + Cloudflare</div>
                <div>License: MIT</div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-sm text-white/50 space-y-1">
              <div>Backend: FastAPI 0.115 / Python 3.11</div>
              <div>Frontend: React 18 / TypeScript 5.3</div>
              <div>Database: PostgreSQL 16 + SQLAlchemy 2.0</div>
              <div>Auth: JWT + bcrypt + RBAC (5-tier)</div>
              <div>Observability: OpenTelemetry + structlog</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}