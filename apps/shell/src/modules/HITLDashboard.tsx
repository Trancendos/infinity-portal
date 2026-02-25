/**
 * HITLDashboard — Human-in-the-Loop oversight queue
 */
import React, { useState, useEffect } from 'react';
import { useAI } from '../providers/BackendProvider';

interface HITLTask {
  id: string;
  system_name: string;
  task_type: string;
  prompt: string;
  proposed_output: string | null;
  risk_level: string;
  status: string;
  created_at: string;
}

export default function HITLDashboard() {
  const { getPendingReviews, reviewTask } = useAI();
  const [tasks, setTasks] = useState<HITLTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<HITLTask | null>(null);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await getPendingReviews();
      setTasks(Array.isArray(data) ? data : data.tasks || []);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const handleReview = async (approved: boolean) => {
    if (!selectedTask) return;
    try {
      await reviewTask(selectedTask.id, approved, comments);
      setMessage(`Task ${approved ? 'approved' : 'rejected'} successfully`);
      setSelectedTask(null);
      setComments('');
      loadTasks();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const riskBadge = (level: string) => {
    const colors: Record<string, string> = {
      HIGH_RISK: 'bg-red-500/20 text-red-300 border-red-500/50',
      PROHIBITED: 'bg-red-700/20 text-red-200 border-red-700/50',
      LIMITED_RISK: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
      MINIMAL_RISK: 'bg-green-500/20 text-green-300 border-green-500/50',
    };
    return colors[level] || 'bg-gray-500/20 text-gray-300 border-gray-500/50';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900 text-white">
        <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 text-white overflow-hidden flex">
      {/* Task List */}
      <div className={`${selectedTask ? 'w-1/2' : 'w-full'} border-r border-white/10 overflow-auto`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">🔍 Human Oversight Queue</h2>
            <button
              onClick={loadTasks}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm"
            >
              ↻ Refresh
            </button>
          </div>

          {message && (
            <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-sm">
              {message}
              <button onClick={() => setMessage('')} className="ml-2 text-white/50">✕</button>
            </div>
          )}

          {tasks.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-xl text-white/70">All clear</p>
              <p className="text-sm text-white/40 mt-2">No tasks pending human review</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-white/50 mb-3">{tasks.length} task(s) awaiting review</p>
              {tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => { setSelectedTask(task); setComments(''); }}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    selectedTask?.id === task.id
                      ? 'bg-purple-500/20 border-purple-500/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{task.system_name || 'Unknown System'}</span>
                    <span className={`px-2 py-0.5 rounded text-xs border ${riskBadge(task.risk_level)}`}>
                      {task.risk_level.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-white/50 truncate">{task.prompt}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                    <span>Type: {task.task_type}</span>
                    <span>•</span>
                    <span>{new Date(task.created_at).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedTask && (
        <div className="w-1/2 overflow-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Review Task</h3>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Task Details */}
            <div className="space-y-4 mb-6">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50 mb-1">System</p>
                <p className="font-medium">{selectedTask.system_name}</p>
              </div>

              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50 mb-1">Task Type</p>
                <p className="font-medium">{selectedTask.task_type}</p>
              </div>

              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50 mb-1">Risk Level</p>
                <span className={`px-2 py-1 rounded text-sm border ${riskBadge(selectedTask.risk_level)}`}>
                  {selectedTask.risk_level.replace('_', ' ')}
                </span>
              </div>

              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/50 mb-1">Prompt</p>
                <p className="text-sm whitespace-pre-wrap">{selectedTask.prompt}</p>
              </div>

              {selectedTask.proposed_output && (
                <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                  <p className="text-sm text-yellow-300 mb-1">⚠️ Proposed Output (not yet released)</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedTask.proposed_output}</p>
                </div>
              )}
            </div>

            {/* Review Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Review Comments</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white h-24"
                  placeholder="Add your review notes..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleReview(true)}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  ✓ Approve & Release
                </button>
                <button
                  onClick={() => handleReview(false)}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                >
                  ✕ Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}