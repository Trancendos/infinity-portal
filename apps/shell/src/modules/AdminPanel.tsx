/**
 * AdminPanel — User & Organisation management module
 */
import React, { useState, useEffect } from 'react';
import { useUsers, useOrganisation } from '../providers/BackendProvider';

interface UserItem {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminPanel() {
  const { list: listUsers, changeRole, deactivate, invite, count } = useUsers();
  const { getCurrent } = useOrganisation();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [org, setOrg] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [tab, setTab] = useState<'users' | 'org' | 'invite'>('users');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, orgData, countData] = await Promise.all([
        listUsers(100),
        getCurrent(),
        count(),
      ]);
      setUsers(usersData);
      setOrg(orgData);
      setStats(countData);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await changeRole(userId, newRole);
      setMessage('Role updated');
      loadData();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const handleDeactivate = async (userId: string) => {
    if (!confirm('Deactivate this user?')) return;
    try {
      await deactivate(userId);
      setMessage('User deactivated');
      loadData();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    try {
      await invite(inviteEmail, inviteRole);
      setMessage(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      loadData();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const roles = ['super_admin', 'org_admin', 'auditor', 'power_user', 'user'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900 text-white">
        <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 text-white overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Admin Panel</h2>
          {stats && (
            <span className="text-sm text-white/50">
              {stats.total} active users
            </span>
          )}
        </div>

        {/* Message */}
        {message && (
          <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-sm">
            {message}
            <button onClick={() => setMessage('')} className="ml-2 text-white/50">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1">
          {(['users', 'org', 'invite'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              {t === 'users' ? '👥 Users' : t === 'org' ? '🏢 Organisation' : '✉️ Invite'}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                <div>
                  <p className="font-medium">{u.display_name || u.email}</p>
                  <p className="text-sm text-white/50">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm"
                  >
                    {roles.map(r => (
                      <option key={r} value={r} className="bg-slate-800">{r}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDeactivate(u.id)}
                    className="px-3 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded text-sm"
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Organisation Tab */}
        {tab === 'org' && org && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50">Name</p>
                <p className="text-lg font-medium">{org.name}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50">Plan</p>
                <p className="text-lg font-medium capitalize">{org.plan}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50">Region</p>
                <p className="text-lg font-medium">{org.region_iso_code}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50">Compliance Tier</p>
                <p className="text-lg font-medium capitalize">{org.compliance_tier}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50">Members</p>
                <p className="text-lg font-medium">{org.member_count}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50">Created</p>
                <p className="text-lg font-medium">{new Date(org.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}

        {/* Invite Tab */}
        {tab === 'invite' && (
          <div className="max-w-md space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1">Email Address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
              >
                {roles.map(r => (
                  <option key={r} value={r} className="bg-slate-800">{r}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleInvite}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
            >
              Send Invitation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}