/**
 * WorkflowBuilder — Visual automation workflow builder
 * Equivalent to Make/Zapier/n8n but AI-native
 * Supports: HTTP requests, AI generation, notifications, conditions, transforms, delays
 */
import React, { useState, useCallback } from 'react';
import { useWorkflows } from '../providers/BackendProvider';

interface WorkflowStep {
  id: string;
  type: 'http_request' | 'ai_generate' | 'send_notification' | 'condition' | 'transform' | 'delay';
  name: string;
  config: Record<string, unknown>;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  status: string;
  run_count: number;
  success_count: number;
  failure_count: number;
  last_run_at?: string;
  last_run_status?: string;
  steps: WorkflowStep[];
  created_at: string;
}

const STEP_TYPES = [
  { type: 'http_request', icon: '🌐', label: 'HTTP Request', color: 'bg-blue-500/20 border-blue-500/40' },
  { type: 'ai_generate', icon: '🤖', label: 'AI Generate', color: 'bg-purple-500/20 border-purple-500/40' },
  { type: 'send_notification', icon: '🔔', label: 'Send Notification', color: 'bg-yellow-500/20 border-yellow-500/40' },
  { type: 'condition', icon: '🔀', label: 'Condition', color: 'bg-orange-500/20 border-orange-500/40' },
  { type: 'transform', icon: '⚙️', label: 'Transform Data', color: 'bg-green-500/20 border-green-500/40' },
  { type: 'delay', icon: '⏱️', label: 'Delay', color: 'bg-slate-500/20 border-slate-500/40' },
];

const TRIGGER_TYPES = [
  { value: 'manual', label: '▶️ Manual', desc: 'Trigger manually from the UI or API' },
  { value: 'webhook', label: '🔗 Webhook', desc: 'Triggered by incoming HTTP webhook' },
  { value: 'schedule', label: '⏰ Schedule', desc: 'Run on a cron schedule' },
  { value: 'event', label: '⚡ Event', desc: 'Triggered by platform events' },
];

export default function WorkflowBuilder() {
  const { listWorkflows, createWorkflow, triggerWorkflow, listExecutions } = useWorkflows();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [executions, setExecutions] = useState<unknown[]>([]);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTrigger, setNewTrigger] = useState('manual');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listWorkflows();
      setWorkflows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [listWorkflows]);

  React.useEffect(() => { load(); }, [load]);

  const addStep = (type: WorkflowStep['type']) => {
    const step: WorkflowStep = {
      id: `step_${Date.now()}`,
      type,
      name: STEP_TYPES.find(s => s.type === type)?.label || type,
      config: {},
    };
    setSteps(prev => [...prev, step]);
  };

  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createWorkflow({
        name: newName,
        description: newDesc,
        trigger_type: newTrigger,
        steps,
      });
      setNewName(''); setNewDesc(''); setSteps([]); setNewTrigger('manual');
      setView('list');
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTrigger = async (wf: Workflow) => {
    try {
      await triggerWorkflow(wf.id, {});
      const execs = await listExecutions(wf.id);
      setExecutions(Array.isArray(execs) ? execs : []);
    } catch (e) {
      console.error(e);
    }
  };

  const openDetail = async (wf: Workflow) => {
    setSelected(wf);
    setView('detail');
    try {
      const execs = await listExecutions(wf.id);
      setExecutions(Array.isArray(execs) ? execs : []);
    } catch (e) { console.error(e); }
  };

  const statusColor = (status: string) => {
    if (status === 'active') return 'text-green-400';
    if (status === 'draft') return 'text-yellow-400';
    if (status === 'paused') return 'text-orange-400';
    return 'text-slate-400';
  };

  const execStatusColor = (status: string) => {
    if (status === 'completed') return 'text-green-400';
    if (status === 'failed') return 'text-red-400';
    if (status === 'running') return 'text-blue-400';
    return 'text-slate-400';
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-800/50">
        <div className="flex items-center gap-2">
          {view !== 'list' && (
            <button onClick={() => setView('list')} className="text-white/50 hover:text-white mr-1">←</button>
          )}
          <span className="text-lg">⚡</span>
          <h2 className="font-semibold text-sm">
            {view === 'list' ? 'Workflow Builder' : view === 'create' ? 'New Workflow' : selected?.name}
          </h2>
        </div>
        {view === 'list' && (
          <button
            onClick={() => setView('create')}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs font-medium"
          >
            + New Workflow
          </button>
        )}
        {view === 'create' && (
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-xs font-medium"
          >
            Save Workflow
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* LIST VIEW */}
        {view === 'list' && (
          <div className="space-y-3">
            {loading && <div className="text-center text-white/40 py-8">Loading workflows...</div>}
            {!loading && workflows.length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">⚡</div>
                <p className="text-white/50 text-sm">No workflows yet</p>
                <p className="text-white/30 text-xs mt-1">Create your first automation workflow</p>
                <button
                  onClick={() => setView('create')}
                  className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm"
                >
                  Create Workflow
                </button>
              </div>
            )}
            {workflows.map(wf => (
              <div
                key={wf.id}
                className="bg-slate-800 rounded-lg p-4 border border-white/10 hover:border-purple-500/40 cursor-pointer"
                onClick={() => openDetail(wf)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{wf.name}</span>
                      <span className={`text-xs ${statusColor(wf.status)}`}>● {wf.status}</span>
                    </div>
                    {wf.description && (
                      <p className="text-xs text-white/40 mt-1 truncate">{wf.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                      <span>🔄 {wf.run_count} runs</span>
                      <span className="text-green-400">✓ {wf.success_count}</span>
                      <span className="text-red-400">✗ {wf.failure_count}</span>
                      <span>Trigger: {wf.trigger_type}</span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleTrigger(wf); }}
                    className="ml-3 px-3 py-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/30 rounded text-xs text-green-400"
                  >
                    ▶ Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CREATE VIEW */}
        {view === 'create' && (
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-xs text-white/60 mb-1">Workflow Name *</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Daily Compliance Report"
                className="w-full bg-slate-800 border border-white/20 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Description</label>
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="What does this workflow do?"
                rows={2}
                className="w-full bg-slate-800 border border-white/20 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            {/* Trigger */}
            <div>
              <label className="block text-xs text-white/60 mb-2">Trigger</label>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGER_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setNewTrigger(t.value)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      newTrigger === t.value
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-white/10 bg-slate-800 hover:border-white/30'
                    }`}
                  >
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-white/40 mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Steps */}
            <div>
              <label className="block text-xs text-white/60 mb-2">Steps ({steps.length})</label>
              {steps.length === 0 && (
                <div className="text-center py-6 border border-dashed border-white/20 rounded-lg text-white/30 text-sm">
                  Add steps below to build your workflow
                </div>
              )}
              {steps.map((step, idx) => {
                const stepType = STEP_TYPES.find(s => s.type === step.type);
                return (
                  <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg border mb-2 ${stepType?.color || 'bg-slate-800 border-white/10'}`}>
                    <span className="text-lg">{stepType?.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{idx + 1}. {step.name}</div>
                      <div className="text-xs text-white/40">{step.type}</div>
                    </div>
                    <button onClick={() => removeStep(step.id)} className="text-white/30 hover:text-red-400 text-xs">✕</button>
                  </div>
                );
              })}

              <div className="mt-3">
                <p className="text-xs text-white/40 mb-2">Add a step:</p>
                <div className="flex flex-wrap gap-2">
                  {STEP_TYPES.map(st => (
                    <button
                      key={st.type}
                      onClick={() => addStep(st.type as WorkflowStep['type'])}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs border border-white/10"
                    >
                      <span>{st.icon}</span>
                      <span>{st.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DETAIL VIEW */}
        {view === 'detail' && selected && (
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{selected.name}</h3>
                  {selected.description && <p className="text-xs text-white/40 mt-1">{selected.description}</p>}
                </div>
                <button
                  onClick={() => handleTrigger(selected)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
                >
                  ▶ Run Now
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-700/50 rounded p-2">
                  <div className="text-lg font-bold">{selected.run_count}</div>
                  <div className="text-xs text-white/40">Total Runs</div>
                </div>
                <div className="bg-green-500/10 rounded p-2">
                  <div className="text-lg font-bold text-green-400">{selected.success_count}</div>
                  <div className="text-xs text-white/40">Successful</div>
                </div>
                <div className="bg-red-500/10 rounded p-2">
                  <div className="text-lg font-bold text-red-400">{selected.failure_count}</div>
                  <div className="text-xs text-white/40">Failed</div>
                </div>
              </div>
            </div>

            {/* Steps */}
            <div>
              <h4 className="text-xs text-white/60 mb-2 font-medium uppercase tracking-wider">Steps ({selected.steps?.length || 0})</h4>
              {(selected.steps || []).map((step, idx) => {
                const stepType = STEP_TYPES.find(s => s.type === step.type);
                return (
                  <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg border mb-2 ${stepType?.color || 'bg-slate-800 border-white/10'}`}>
                    <span className="text-lg">{stepType?.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{idx + 1}. {step.name}</div>
                      <div className="text-xs text-white/40">{step.type}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Execution History */}
            <div>
              <h4 className="text-xs text-white/60 mb-2 font-medium uppercase tracking-wider">Recent Executions</h4>
              {executions.length === 0 && (
                <div className="text-center py-4 text-white/30 text-sm">No executions yet</div>
              )}
              {(executions as Array<{id: string; status: string; duration_ms?: number; created_at: string; error_message?: string}>).map(exec => (
                <div key={exec.id} className="bg-slate-800 rounded p-3 border border-white/10 mb-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${execStatusColor(exec.status)}`}>
                      {exec.status === 'completed' ? '✓' : exec.status === 'failed' ? '✗' : '⟳'} {exec.status}
                    </span>
                    <span className="text-xs text-white/40">
                      {exec.duration_ms ? `${exec.duration_ms}ms` : '—'}
                    </span>
                  </div>
                  {exec.error_message && (
                    <p className="text-xs text-red-400 mt-1 truncate">{exec.error_message}</p>
                  )}
                  <p className="text-xs text-white/30 mt-1">{new Date(exec.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}