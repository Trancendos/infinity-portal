'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Zap, 
  Brain, 
  Shield, 
  TrendingUp, 
  Activity,
  Server,
  Database,
  Cpu,
  Cloud,
  Send,
  Settings,
  BarChart3,
  Users,
  Lock,
  CheckCircle2
} from 'lucide-react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function DashboardPage() {
  const [prompt, setPrompt] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetchHealthStats();
    const interval = setInterval(fetchHealthStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchHealthStats = async () => {
    try {
      const [healthRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/health`),
        axios.get(`${API_URL}/v4/stats`).catch(() => null)
      ]);
      setHealth(healthRes.data);
      if (statsRes) setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const res = await axios.post(`${API_URL}/v4/dispatch`, {
        prompt: prompt,
        role: role,
        use_scout: true,
        cognitive_enhancement: true,
        cache_strategy: 'normal',
        parameters: {
          temperature: 0.7,
          max_tokens: 4096
        }
      });

      setResponse(res.data);
      toast.success('Request completed successfully!', {
        icon: '✨',
        style: {
          background: '#313338',
          color: '#fff',
          border: '1px solid rgba(124, 58, 237, 0.3)',
        }
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Request failed', {
        style: {
          background: '#313338',
          color: '#fff',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { id: null, name: 'Auto (Scout)', icon: Sparkles, color: 'from-purple-500 to-purple-700' },
    { id: 'designer', name: 'Designer', icon: Brain, color: 'from-pink-500 to-purple-500' },
    { id: 'architect', name: 'Architect', icon: Cpu, color: 'from-blue-500 to-purple-500' },
    { id: 'developer', name: 'Developer', icon: Zap, color: 'from-green-500 to-blue-500' },
    { id: 'tester', name: 'Tester', icon: Shield, color: 'from-yellow-500 to-orange-500' },
    { id: 'critic', name: 'Critic', icon: Activity, color: 'from-red-500 to-pink-500' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-purple-950 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-[100%] opacity-30">
          <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-float" />
          <div className="absolute top-0 -right-1/4 w-1/2 h-1/2 bg-gold-500 rounded-full mix-blend-multiply filter blur-3xl animate-float" style={{ animationDelay: '2s' }} />
          <div className="absolute -bottom-1/4 left-1/3 w-1/2 h-1/2 bg-purple-700 rounded-full mix-blend-multiply filter blur-3xl animate-float" style={{ animationDelay: '4s' }} />
        </div>
      </div>

      <div className="relative z-10">
        <Toaster position="top-right" />
        
        {/* Header */}
        <header className="border-b border-white/10 backdrop-blur-xl bg-discord-darker/50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-gold-500 rounded-xl flex items-center justify-center shadow-neon-purple">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-discord-darker" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-gold-400 bg-clip-text text-transparent">
                    Infinity Admin Runner
                  </h1>
                  <p className="text-sm text-gray-400">Enterprise AI Orchestration v4.0</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                {health?.status === 'healthy' && (
                  <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400 font-medium">Online</span>
                  </div>
                )}
                <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                  <Settings className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content - Left Side */}
            <div className="lg:col-span-2 space-y-6">
              {/* Role Selection */}
              <div className="p-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-glass">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <Brain className="w-5 h-5 mr-2 text-purple-400" />
                  Select AI Agent Role
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {roles.map((r) => {
                    const Icon = r.icon;
                    return (
                      <motion.button
                        key={r.id || 'auto'}
                        onClick={() => setRole(r.id)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          role === r.id
                            ? 'border-purple-500 bg-purple-500/20 shadow-neon-purple'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <Icon className={`w-6 h-6 mx-auto mb-2 ${
                          role === r.id ? 'text-purple-400' : 'text-gray-400'
                        }`} />
                        <p className={`text-sm font-medium ${
                          role === r.id ? 'text-white' : 'text-gray-300'
                        }`}>
                          {r.name}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Prompt Input */}
              <div className="p-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-glass">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Your Prompt
                    </label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe your task... (e.g., 'Design a modern landing page for a SaaS product')"
                      className="w-full h-32 px-4 py-3 rounded-xl bg-discord-darker/50 border border-white/10 text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all resize-none"
                      disabled={loading}
                    />
                  </div>
                  
                  <motion.button
                    type="submit"
                    disabled={loading || !prompt.trim()}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed text-white font-medium shadow-neon-purple transition-all flex items-center justify-center space-x-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Execute Task</span>
                      </>
                    )}
                  </motion.button>
                </form>
              </div>

              {/* Response */}
              <AnimatePresence>
                {response && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="p-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-glass"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center">
                        <Sparkles className="w-5 h-5 mr-2 text-gold-400" />
                        Response
                      </h3>
                      <div className="flex items-center space-x-2 text-sm text-gray-400">
                        <span>{response.primary_agent.role}</span>
                        <span>•</span>
                        <span>{response.total_time?.toFixed(2)}s</span>
                        <span>•</span>
                        <span>{response.total_tokens} tokens</span>
                      </div>
                    </div>
                    
                    <div className="prose prose-invert max-w-none">
                      <div className="p-4 rounded-lg bg-discord-darker/50 border border-white/5 text-gray-200 leading-relaxed whitespace-pre-wrap">
                        <ReactMarkdown>{response.primary_agent.response}</ReactMarkdown>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center space-x-4">
                        <span>Model: {response.primary_agent.model_used}</span>
                        <span>Provider: {response.primary_agent.provider}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span>Cost: ${response.estimated_cost_usd?.toFixed(6) || '0.000000'}</span>
                        <span>Carbon: {response.carbon_footprint_kg?.toFixed(6) || '0.000000'}kg</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Stats Sidebar - Right Side */}
            <div className="space-y-6">
              {/* System Status */}
              <div className="p-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-glass">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <Server className="w-5 h-5 mr-2 text-green-400" />
                  System Status
                </h3>
                <div className="space-y-3">
                  <StatusItem
                    label="API"
                    value={health?.components?.redis}
                    type="status"
                  />
                  <StatusItem
                    label="Redis"
                    value={health?.components?.redis}
                    type="status"
                  />
                  <StatusItem
                    label="Scout"
                    value={health?.features?.scout ? 'enabled' : 'disabled'}
                    type="status"
                  />
                  <StatusItem
                    label="Caching"
                    value={health?.features?.caching ? 'enabled' : 'disabled'}
                    type="status"
                  />
                </div>
              </div>

              {/* Statistics */}
              {stats && (
                <div className="p-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-glass">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                    <BarChart3 className="w-5 h-5 mr-2 text-purple-400" />
                    Statistics
                  </h3>
                  <div className="space-y-3">
                    <StatItem
                      label="Total Requests"
                      value={stats.total_requests?.toLocaleString() || '0'}
                      icon={Activity}
                    />
                    <StatItem
                      label="Total Tokens"
                      value={stats.total_tokens?.toLocaleString() || '0'}
                      icon={Zap}
                    />
                    <StatItem
                      label="Total Cost"
                      value={`$${stats.total_cost_usd?.toFixed(4) || '0.0000'}`}
                      icon={TrendingUp}
                    />
                    <StatItem
                      label="Uptime"
                      value={`${Math.floor((stats.uptime_seconds || 0) / 3600)}h ${Math.floor(((stats.uptime_seconds || 0) % 3600) / 60)}m`}
                      icon={Clock}
                    />
                  </div>
                </div>
              )}

              {/* Features */}
              <div className="p-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-glass">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <Lock className="w-5 h-5 mr-2 text-gold-400" />
                  Security & Compliance
                </h3>
                <div className="space-y-2">
                  <FeatureBadge label="GDPR" enabled />
                  <FeatureBadge label="ISO 27001" enabled />
                  <FeatureBadge label="SOC 2" enabled />
                  <FeatureBadge label="Zero-Cost" enabled />
                  <FeatureBadge label="Quantum-Ready" enabled={false} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusItem({ label, value, type }: { label: string; value: string; type: string }) {
  const isOnline = value === 'connected' || value === 'initialized' || value === 'enabled' || value === 'active';
  
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
        <span className={`text-sm font-medium ${isOnline ? 'text-green-400' : 'text-gray-400'}`}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>
    </div>
  );
}

function StatItem({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Icon className="w-4 h-4 text-purple-400" />
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function FeatureBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className={`px-3 py-2 rounded-lg flex items-center justify-between ${
      enabled ? 'bg-green-500/10 border border-green-500/20' : 'bg-gray-500/10 border border-gray-500/20'
    }`}>
      <span className={`text-sm font-medium ${enabled ? 'text-green-400' : 'text-gray-400'}`}>
        {label}
      </span>
      <CheckCircle2 className={`w-4 h-4 ${enabled ? 'text-green-400' : 'text-gray-600'}`} />
    </div>
  );
}

// Missing Clock import
function Clock({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
