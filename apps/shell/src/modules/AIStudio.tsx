/**
 * AIStudio — AI generation interface with governance
 * Connects to /api/v1/ai backend router
 */
import React, { useState, useEffect } from 'react';

interface GenerationResult {
  request_id: string;
  content: string | null;
  model_used: string;
  status: string;
  governance_decision: {
    allowed: boolean;
    risk_level: string;
    reason: string;
    hitl_task_id?: string;
  };
  provenance_manifest_url: string | null;
  message: string | null;
  timestamp: string;
}

interface ProvenanceManifest {
  request_id: string;
  content_hash: string;
  signing_status: string;
  signed_at: string;
  manifest_data: Record<string, any>;
}

export default function AIStudio() {
  const [prompt, setPrompt] = useState('');
  const [systemId, setSystemId] = useState('infinity-os-default');
  const [taskType, setTaskType] = useState('general');
  const [model, setModel] = useState('');
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [provenance, setProvenance] = useState<ProvenanceManifest | null>(null);
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'generate' | 'history' | 'provenance'>('generate');

  const token = localStorage.getItem('infinity_access_token');
  const apiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const taskTypes = [
    { value: 'general', label: '💬 General', risk: 'minimal' },
    { value: 'code_generation', label: '⚡ Code Generation', risk: 'minimal' },
    { value: 'content_creation', label: '📝 Content Creation', risk: 'limited' },
    { value: 'data_analysis', label: '📊 Data Analysis', risk: 'limited' },
    { value: 'biometric', label: '🔒 Biometric Analysis', risk: 'high' },
    { value: 'recruitment', label: '👥 Recruitment', risk: 'high' },
    { value: 'medical_diagnosis', label: '🏥 Medical Diagnosis', risk: 'high' },
    { value: 'credit_scoring', label: '💳 Credit Scoring', risk: 'high' },
  ];

  const getRiskBadge = (risk: string) => {
    const colors: Record<string, string> = {
      minimal: 'bg-green-500/20 text-green-400',
      limited: 'bg-yellow-500/20 text-yellow-400',
      high: 'bg-red-500/20 text-red-400',
      MINIMAL_RISK: 'bg-green-500/20 text-green-400',
      LIMITED_RISK: 'bg-yellow-500/20 text-yellow-400',
      HIGH_RISK: 'bg-red-500/20 text-red-400',
    };
    return colors[risk] || 'bg-white/10 text-white/50';
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setProvenance(null);

    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          system_id: systemId,
          prompt,
          model: model || undefined,
          task_type: taskType,
          require_provenance: true,
        }),
      });

      if (res.ok) {
        const data: GenerationResult = await res.json();
        setResult(data);
        setHistory(prev => [data, ...prev].slice(0, 50));

        // Fetch provenance if available
        if (data.provenance_manifest_url) {
          const pRes = await fetch(`${apiUrl}${data.provenance_manifest_url}`, { headers });
          if (pRes.ok) {
            setProvenance(await pRes.json());
          }
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || `Error ${res.status}`);
      }
    } catch (e) {
      setError('Network error — is the backend running?');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      {/* Tab Bar */}
      <div className="flex border-b border-white/10 bg-slate-800/50">
        {(['generate', 'history', 'provenance'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition ${
              activeTab === tab ? 'text-purple-400 border-b-2 border-purple-400' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {tab === 'generate' ? '🤖 Generate' : tab === 'history' ? '📜 History' : '🔏 Provenance'}
          </button>
        ))}
      </div>

      {/* Generate Tab */}
      {activeTab === 'generate' && (
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
          {/* Config Row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-white/40 mb-1 block">System ID</label>
              <input
                value={systemId}
                onChange={e => setSystemId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/40 mb-1 block">Task Type</label>
              <select
                value={taskType}
                onChange={e => setTaskType(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-purple-500"
              >
                {taskTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="text-xs text-white/40 mb-1 block">Risk Level</label>
              <div className={`px-3 py-2 rounded text-sm text-center ${getRiskBadge(taskTypes.find(t => t.value === taskType)?.risk || 'minimal')}`}>
                {taskTypes.find(t => t.value === taskType)?.risk?.toUpperCase() || 'MINIMAL'}
              </div>
            </div>
          </div>

          {/* Prompt */}
          <div className="flex-1 min-h-[120px]">
            <label className="text-xs text-white/40 mb-1 block">Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              className="w-full h-full min-h-[100px] px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-sm font-mono resize-none focus:outline-none focus:border-purple-500"
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) generate(); }}
            />
          </div>

          {/* Generate Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={generate}
              disabled={loading || !prompt.trim()}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 text-sm font-medium transition"
            >
              {loading ? '⏳ Generating...' : '🚀 Generate (⌘↵)'}
            </button>
            {result && (
              <span className={`text-xs px-2 py-1 rounded ${getRiskBadge(result.governance_decision.risk_level)}`}>
                {result.status === 'pending_human_oversight' ? '⏸️ Awaiting HITL Review' : '✅ ' + result.status}
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span>Model: {result.model_used}</span>
                  <span>•</span>
                  <span className={`px-1.5 py-0.5 rounded ${getRiskBadge(result.governance_decision.risk_level)}`}>
                    {result.governance_decision.risk_level}
                  </span>
                </div>
                <span className="text-xs text-white/30">{result.request_id.slice(0, 8)}</span>
              </div>
              <div className="p-4">
                {result.content ? (
                  <pre className="text-sm font-mono whitespace-pre-wrap text-white/80">{result.content}</pre>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-3xl mb-2">⏸️</div>
                    <p className="text-white/50 text-sm">{result.message || 'Output withheld — awaiting human oversight'}</p>
                    <p className="text-xs text-white/30 mt-1">EU AI Act Art. 14 — Human oversight required for high-risk tasks</p>
                  </div>
                )}
              </div>
              {result.governance_decision && (
                <div className="px-4 py-2 border-t border-white/10 text-xs text-white/40">
                  Governance: {result.governance_decision.reason}
                  {result.provenance_manifest_url && ' • 🔏 Provenance signed'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="flex-1 overflow-auto p-4">
          {history.length === 0 ? (
            <div className="text-center text-white/30 py-12">
              <div className="text-4xl mb-2">📜</div>
              <p>No generation history yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-white/30">{new Date(item.timestamp).toLocaleString()}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getRiskBadge(item.governance_decision.risk_level)}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm text-white/70 truncate">{item.content || item.message || '(awaiting review)'}</p>
                  <div className="text-xs text-white/30 mt-1">Model: {item.model_used} • ID: {item.request_id.slice(0, 8)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Provenance Tab */}
      {activeTab === 'provenance' && (
        <div className="flex-1 overflow-auto p-4">
          {provenance ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <h3 className="text-sm font-bold mb-3">🔏 C2PA Provenance Manifest</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-white/40">Request ID:</span> <span className="font-mono">{provenance.request_id}</span></div>
                  <div><span className="text-white/40">Status:</span> <span className="text-green-400">{provenance.signing_status}</span></div>
                  <div><span className="text-white/40">Content Hash:</span> <span className="font-mono text-xs">{provenance.content_hash}</span></div>
                  <div><span className="text-white/40">Signed At:</span> {new Date(provenance.signed_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <h3 className="text-sm font-bold mb-2">Manifest Data</h3>
                <pre className="text-xs font-mono text-white/60 whitespace-pre-wrap">{JSON.stringify(provenance.manifest_data, null, 2)}</pre>
              </div>
            </div>
          ) : (
            <div className="text-center text-white/30 py-12">
              <div className="text-4xl mb-2">🔏</div>
              <p>Generate content to view provenance data</p>
              <p className="text-xs mt-1">C2PA manifests are created for every generation</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}