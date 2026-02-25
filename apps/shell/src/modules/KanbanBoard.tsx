/**
 * KanbanBoard — Jira-style task management with drag-and-drop swim lanes
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

// --- Types ---
interface Column {
  id: string;
  name: string;
  column_type: string;
  position: number;
  wip_limit: number | null;
  color: string | null;
  is_done_column: boolean;
  task_count: number;
}

interface Label {
  id: string;
  name: string;
  color: string;
}

interface Board {
  id: string;
  name: string;
  description: string | null;
  columns: Column[];
  labels: Label[];
  task_count: number;
  settings: any;
}

interface TaskCard {
  id: string;
  key: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  column_id: string | null;
  column_name: string | null;
  board_id: string;
  parent_id: string | null;
  creator_id: string;
  creator_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  labels: string[];
  story_points: number | null;
  due_date: string | null;
  tags: string[];
  position: number;
  subtask_count: number;
  comment_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
  edited_at: string | null;
}

interface HistoryEntry {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

interface TaskDetail extends TaskCard {
  comments: Comment[];
  history: HistoryEntry[];
}

// --- API Helper ---
function useApi() {
  const token = localStorage.getItem('infinity_access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const call = async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `Request failed`);
    }
    return res.json();
  };

  return { call };
}

// --- Priority & Type Config ---
const PRIORITY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  critical: { icon: '🔴', color: '#ef4444', label: 'Critical' },
  high: { icon: '🟠', color: '#f97316', label: 'High' },
  medium: { icon: '🟡', color: '#eab308', label: 'Medium' },
  low: { icon: '🟢', color: '#22c55e', label: 'Low' },
};

const TYPE_CONFIG: Record<string, { icon: string; label: string }> = {
  epic: { icon: '⚡', label: 'Epic' },
  story: { icon: '📖', label: 'Story' },
  task: { icon: '✅', label: 'Task' },
  bug: { icon: '🐛', label: 'Bug' },
  subtask: { icon: '📎', label: 'Subtask' },
  spike: { icon: '🔬', label: 'Spike' },
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function KanbanBoard() {
  const { call } = useApi();
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createColumnId, setCreateColumnId] = useState<string | null>(null);
  const [boardName, setBoardName] = useState('AI Development');
  const [stats, setStats] = useState<any>(null);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');

  // New task form
  const [newTask, setNewTask] = useState({
    title: '', description: '', priority: 'medium', task_type: 'task',
    assignee_id: '', story_points: '', due_date: '', tags: '',
  });

  // Comment form
  const [newComment, setNewComment] = useState('');

  useEffect(() => { loadBoards(); }, []);

  const loadBoards = async () => {
    setLoading(true);
    try {
      const data = await call('/api/v1/kanban/boards');
      setBoards(data);
      if (data.length > 0) {
        setActiveBoard(data[0]);
        await loadTasks(data[0].id);
        await loadStats(data[0].id);
      }
    } catch (e: any) {
      setMessage(e.message);
    }
    setLoading(false);
  };

  const loadTasks = async (boardId: string) => {
    try {
      let url = `/api/v1/kanban/boards/${boardId}/tasks?limit=500`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (filterPriority) url += `&priority=${filterPriority}`;
      if (filterAssignee) url += `&assignee_id=${filterAssignee}`;
      const data = await call(url);
      setTasks(data);
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const loadStats = async (boardId: string) => {
    try {
      const data = await call(`/api/v1/kanban/boards/${boardId}/stats`);
      setStats(data);
    } catch { /* stats are optional */ }
  };

  const handleCreateBoard = async () => {
    try {
      const board = await call('/api/v1/kanban/boards', {
        method: 'POST',
        body: JSON.stringify({ name: boardName, use_default_columns: true }),
      });
      setShowCreateBoard(false);
      setBoardName('AI Development');
      await loadBoards();
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const handleCreateTask = async () => {
    if (!activeBoard || !newTask.title.trim()) return;
    try {
      await call(`/api/v1/kanban/boards/${activeBoard.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description || null,
          priority: newTask.priority,
          task_type: newTask.task_type,
          column_id: createColumnId || undefined,
          assignee_id: newTask.assignee_id || null,
          story_points: newTask.story_points ? parseInt(newTask.story_points) : null,
          due_date: newTask.due_date || null,
          tags: newTask.tags ? newTask.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      setShowCreateTask(false);
      setNewTask({ title: '', description: '', priority: 'medium', task_type: 'task', assignee_id: '', story_points: '', due_date: '', tags: '' });
      setCreateColumnId(null);
      await loadTasks(activeBoard.id);
      await loadStats(activeBoard.id);
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const handleMoveTask = async (taskId: string, targetColumnId: string) => {
    if (!activeBoard) return;
    try {
      await call(`/api/v1/kanban/boards/${activeBoard.id}/tasks/${taskId}/move`, {
        method: 'POST',
        body: JSON.stringify({ column_id: targetColumnId }),
      });
      await loadTasks(activeBoard.id);
      await loadStats(activeBoard.id);
      if (selectedTask?.id === taskId) {
        await openTaskDetail(taskId);
      }
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const openTaskDetail = async (taskId: string) => {
    if (!activeBoard) return;
    try {
      const detail = await call(`/api/v1/kanban/boards/${activeBoard.id}/tasks/${taskId}`);
      setSelectedTask(detail);
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const handleAddComment = async () => {
    if (!activeBoard || !selectedTask || !newComment.trim()) return;
    try {
      await call(`/api/v1/kanban/boards/${activeBoard.id}/tasks/${selectedTask.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: newComment }),
      });
      setNewComment('');
      await openTaskDetail(selectedTask.id);
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const handleUpdateTask = async (field: string, value: any) => {
    if (!activeBoard || !selectedTask) return;
    try {
      await call(`/api/v1/kanban/boards/${activeBoard.id}/tasks/${selectedTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      });
      await openTaskDetail(selectedTask.id);
      await loadTasks(activeBoard.id);
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!activeBoard || !confirm('Delete this task?')) return;
    try {
      await call(`/api/v1/kanban/boards/${activeBoard.id}/tasks/${taskId}`, { method: 'DELETE' });
      setSelectedTask(null);
      await loadTasks(activeBoard.id);
      await loadStats(activeBoard.id);
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (taskId: string) => setDraggedTask(taskId);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (columnId: string) => {
    if (draggedTask) {
      handleMoveTask(draggedTask, columnId);
      setDraggedTask(null);
    }
  };

  // Group tasks by column
  const tasksByColumn = (columnId: string) =>
    tasks.filter(t => t.column_id === columnId);

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900 text-white">
        <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // No boards yet — show create prompt
  if (boards.length === 0 && !showCreateBoard) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900 text-white">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-2xl font-bold mb-2">Task Management</h2>
          <p className="text-white/50 mb-6">
            Create your first Kanban board to start tracking AI development tasks
            with swim lanes, priorities, and full audit trails.
          </p>
          <button
            onClick={() => setShowCreateBoard(true)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium"
          >
            + Create Board
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* Header Bar */}
      <div className="shrink-0 px-4 py-3 border-b border-white/10 bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Board selector */}
            <select
              value={activeBoard?.id || ''}
              onChange={async (e) => {
                const b = boards.find(x => x.id === e.target.value);
                if (b) {
                  setActiveBoard(b);
                  await loadTasks(b.id);
                  await loadStats(b.id);
                }
              }}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              {boards.map(b => (
                <option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>
              ))}
            </select>

            {/* Stats badges */}
            {stats && (
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded">
                  {stats.total_tasks} tasks
                </span>
                <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded">
                  {stats.completion_rate}% done
                </span>
                {stats.overdue_tasks > 0 && (
                  <span className="px-2 py-1 bg-red-500/20 text-red-300 rounded">
                    {stats.overdue_tasks} overdue
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && activeBoard) loadTasks(activeBoard.id); }}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm w-48"
              placeholder="🔍 Search tasks..."
            />

            {/* Priority filter */}
            <select
              value={filterPriority}
              onChange={(e) => { setFilterPriority(e.target.value); if (activeBoard) loadTasks(activeBoard.id); }}
              className="bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-xs"
            >
              <option value="" className="bg-slate-800">All priorities</option>
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                <option key={k} value={k} className="bg-slate-800">{v.icon} {v.label}</option>
              ))}
            </select>

            <button
              onClick={() => { setShowCreateTask(true); setCreateColumnId(null); }}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium"
            >
              + New Task
            </button>

            <button
              onClick={() => setShowCreateBoard(true)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
            >
              + Board
            </button>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="mx-4 mt-2 p-2 bg-red-500/20 border border-red-500/50 rounded text-sm">
          {message}
          <button onClick={() => setMessage('')} className="ml-2 text-white/50">✕</button>
        </div>
      )}

      {/* Board Content — Swim Lanes */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-4 h-full min-w-max">
          {activeBoard?.columns.map(col => {
            const colTasks = tasksByColumn(col.id);
            const isOverWip = col.wip_limit ? colTasks.length >= col.wip_limit : false;

            return (
              <div
                key={col.id}
                className="w-80 shrink-0 flex flex-col bg-white/5 rounded-xl border border-white/10 overflow-hidden"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(col.id)}
              >
                {/* Column Header */}
                <div
                  className="px-4 py-3 border-b border-white/10 shrink-0"
                  style={{ borderTopColor: col.color || '#6366f1', borderTopWidth: '3px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{col.name}</span>
                      <span className="text-xs text-white/40 bg-white/10 px-1.5 py-0.5 rounded-full">
                        {colTasks.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {col.wip_limit && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          isOverWip ? 'bg-red-500/20 text-red-300' : 'text-white/30'
                        }`}>
                          WIP: {col.wip_limit}
                        </span>
                      )}
                      <button
                        onClick={() => { setShowCreateTask(true); setCreateColumnId(col.id); }}
                        className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded text-white/40 hover:text-white text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Task Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {colTasks.map(task => (
                    <TaskCardComponent
                      key={task.id}
                      task={task}
                      labels={activeBoard?.labels || []}
                      onClick={() => openTaskDetail(task.id)}
                      onDragStart={() => handleDragStart(task.id)}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center py-8 text-white/20 text-sm">
                      Drop tasks here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Board Modal */}
      {showCreateBoard && (
        <Modal onClose={() => setShowCreateBoard(false)} title="Create Board">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1">Board Name</label>
              <input
                value={boardName}
                onChange={e => setBoardName(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                placeholder="e.g. AI Development"
                autoFocus
              />
            </div>
            <p className="text-xs text-white/40">
              Creates a board with default swim lanes: Backlog → To Do → In Progress → In Review → Testing → Done
            </p>
            <button onClick={handleCreateBoard} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium">
              Create Board
            </button>
          </div>
        </Modal>
      )}

      {/* Create Task Modal */}
      {showCreateTask && (
        <Modal onClose={() => { setShowCreateTask(false); setCreateColumnId(null); }} title="Create Task">
          <div className="space-y-3">
            <input
              value={newTask.title}
              onChange={e => setNewTask({...newTask, title: e.target.value})}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
              placeholder="Task title"
              autoFocus
            />
            <textarea
              value={newTask.description}
              onChange={e => setNewTask({...newTask, description: e.target.value})}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white h-24 resize-none"
              placeholder="Description (optional)"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Type</label>
                <select
                  value={newTask.task_type}
                  onChange={e => setNewTask({...newTask, task_type: e.target.value})}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                >
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k} className="bg-slate-800">{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Priority</label>
                <select
                  value={newTask.priority}
                  onChange={e => setNewTask({...newTask, priority: e.target.value})}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                >
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                    <option key={k} value={k} className="bg-slate-800">{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Story Points</label>
                <input
                  type="number"
                  value={newTask.story_points}
                  onChange={e => setNewTask({...newTask, story_points: e.target.value})}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                  placeholder="e.g. 5"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Due Date</label>
                <input
                  type="date"
                  value={newTask.due_date}
                  onChange={e => setNewTask({...newTask, due_date: e.target.value})}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Tags (comma-separated)</label>
              <input
                value={newTask.tags}
                onChange={e => setNewTask({...newTask, tags: e.target.value})}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                placeholder="e.g. llm, compliance, frontend"
              />
            </div>
            <button onClick={handleCreateTask} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium">
              Create Task
            </button>
          </div>
        </Modal>
      )}

      {/* Task Detail Slide-Over */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          board={activeBoard!}
          onClose={() => setSelectedTask(null)}
          onMove={(colId) => handleMoveTask(selectedTask.id, colId)}
          onUpdate={handleUpdateTask}
          onDelete={() => handleDeleteTask(selectedTask.id)}
          onAddComment={handleAddComment}
          newComment={newComment}
          setNewComment={setNewComment}
        />
      )}
    </div>
  );
}


// ============================================================
// SUB-COMPONENTS
// ============================================================

function TaskCardComponent({
  task, labels, onClick, onDragStart,
}: {
  task: TaskCard;
  labels: Label[];
  onClick: () => void;
  onDragStart: () => void;
}) {
  const pri = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const typ = TYPE_CONFIG[task.task_type] || TYPE_CONFIG.task;
  const isOverdue = task.due_date && !task.completed_at && new Date(task.due_date) < new Date();

  const taskLabels = labels.filter(l => (task.labels || []).includes(l.id));

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="p-3 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg border border-white/10 hover:border-purple-500/30 cursor-pointer transition-all group"
    >
      {/* Labels */}
      {taskLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {taskLabels.map(l => (
            <span key={l.id} className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: l.color + '30', color: l.color }}>
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* Key + Type */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono text-white/30">{task.key}</span>
        <span className="text-xs">{typ.icon}</span>
        <span className="text-xs ml-auto">{pri.icon}</span>
      </div>

      {/* Title */}
      <p className="text-sm font-medium leading-snug mb-2 line-clamp-2">{task.title}</p>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-white/40">
        <div className="flex items-center gap-2">
          {task.story_points && (
            <span className="px-1.5 py-0.5 bg-white/10 rounded">{task.story_points}sp</span>
          )}
          {task.comment_count > 0 && (
            <span>💬 {task.comment_count}</span>
          )}
          {task.subtask_count > 0 && (
            <span>📎 {task.subtask_count}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOverdue && <span className="text-red-400">⏰</span>}
          {task.assignee_name && (
            <span className="w-5 h-5 rounded-full bg-purple-500/30 flex items-center justify-center text-[9px] text-purple-300 font-bold">
              {task.assignee_name[0]?.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-white/5 rounded text-[10px] text-white/30">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}


function TaskDetailPanel({
  task, board, onClose, onMove, onUpdate, onDelete, onAddComment, newComment, setNewComment,
}: {
  task: TaskDetail;
  board: Board;
  onClose: () => void;
  onMove: (colId: string) => void;
  onUpdate: (field: string, value: any) => void;
  onDelete: () => void;
  onAddComment: () => void;
  newComment: string;
  setNewComment: (v: string) => void;
}) {
  const [tab, setTab] = useState<'details' | 'comments' | 'history'>('details');
  const pri = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const typ = TYPE_CONFIG[task.task_type] || TYPE_CONFIG.task;

  const historyIcons: Record<string, string> = {
    created: '🆕', moved: '➡️', assigned: '👤', updated: '✏️',
    commented: '💬', deleted: '🗑️', priority_changed: '🔄',
  };

  return (
    <div className="fixed inset-0 z-[100] flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="w-[600px] bg-slate-900 border-l border-white/10 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-white/40 bg-white/10 px-2 py-1 rounded">{task.key}</span>
              <span>{typ.icon}</span>
              <span>{pri.icon}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onDelete} className="px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 rounded">
                🗑️ Delete
              </button>
              <button onClick={onClose} className="text-white/50 hover:text-white text-lg">✕</button>
            </div>
          </div>

          {/* Title (editable) */}
          <h2 className="text-xl font-bold mb-2">{task.title}</h2>

          {/* Move to column */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-white/40">Move to:</span>
            {board.columns.map(col => (
              <button
                key={col.id}
                onClick={() => onMove(col.id)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  task.column_id === col.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                {col.name}
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-white/5 rounded-lg p-1">
            {(['details', 'comments', 'history'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === t ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                {t === 'details' ? '📋 Details' :
                 t === 'comments' ? `💬 Comments (${task.comments?.length || 0})` :
                 `📜 History (${task.history?.length || 0})`}
              </button>
            ))}
          </div>

          {/* Details Tab */}
          {tab === 'details' && (
            <div className="space-y-4">
              {/* Description */}
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-xs text-white/40 mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap">{task.description || 'No description'}</p>
              </div>

              {/* Fields grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-1">Priority</p>
                  <select
                    value={task.priority}
                    onChange={e => onUpdate('priority', e.target.value)}
                    className="bg-transparent text-sm font-medium w-full"
                  >
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                      <option key={k} value={k} className="bg-slate-800">{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-1">Type</p>
                  <select
                    value={task.task_type}
                    onChange={e => onUpdate('task_type', e.target.value)}
                    className="bg-transparent text-sm font-medium w-full"
                  >
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k} className="bg-slate-800">{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-1">Story Points</p>
                  <p className="text-sm font-medium">{task.story_points || '—'}</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-1">Due Date</p>
                  <p className="text-sm font-medium">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-1">Creator</p>
                  <p className="text-sm font-medium">{task.creator_name}</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-1">Assignee</p>
                  <p className="text-sm font-medium">{task.assignee_name || 'Unassigned'}</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-1">Created</p>
                  <p className="text-sm">{new Date(task.created_at).toLocaleString()}</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-1">Updated</p>
                  <p className="text-sm">{new Date(task.updated_at).toLocaleString()}</p>
                </div>
              </div>

              {/* Tags */}
              {task.tags && task.tags.length > 0 && (
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {task.tags.map(tag => (
                      <span key={tag} className="px-2 py-1 bg-white/10 rounded text-xs">#{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              {(task.started_at || task.completed_at) && (
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-white/40 mb-2">Timeline</p>
                  {task.started_at && (
                    <p className="text-xs text-white/60">▶️ Started: {new Date(task.started_at).toLocaleString()}</p>
                  )}
                  {task.completed_at && (
                    <p className="text-xs text-green-400">✅ Completed: {new Date(task.completed_at).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Comments Tab */}
          {tab === 'comments' && (
            <div className="space-y-4">
              {/* Add comment */}
              <div className="flex gap-2">
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white resize-none h-20"
                  placeholder="Add a comment..."
                />
              </div>
              <button
                onClick={onAddComment}
                disabled={!newComment.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 rounded-lg text-sm"
              >
                Add Comment
              </button>

              {/* Comments list */}
              <div className="space-y-3">
                {(task.comments || []).length === 0 ? (
                  <p className="text-center py-4 text-white/30 text-sm">No comments yet</p>
                ) : (
                  task.comments.map(c => (
                    <div key={c.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-purple-500/30 flex items-center justify-center text-xs text-purple-300 font-bold">
                            {c.author_name[0]?.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium">{c.author_name}</span>
                          {c.is_internal && (
                            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-[10px]">internal</span>
                          )}
                        </div>
                        <span className="text-xs text-white/30">
                          {new Date(c.created_at).toLocaleString()}
                          {c.edited_at && ' (edited)'}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-white/80">{c.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* History Tab */}
          {tab === 'history' && (
            <div className="space-y-2">
              {(task.history || []).length === 0 ? (
                <p className="text-center py-4 text-white/30 text-sm">No history yet</p>
              ) : (
                task.history.map(h => (
                  <div key={h.id} className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                    <span className="text-sm shrink-0">{historyIcons[h.action] || '📝'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{h.user_name}</span>
                        {' '}
                        <span className="text-white/60">
                          {h.action === 'created' && 'created this task'}
                          {h.action === 'moved' && `moved from ${h.old_value} → ${h.new_value}`}
                          {h.action === 'assigned' && `assigned to ${h.new_value || 'unassigned'}`}
                          {h.action === 'updated' && h.field_name && `changed ${h.field_name}`}
                          {h.action === 'commented' && 'added a comment'}
                          {h.action === 'deleted' && 'deleted this task'}
                          {!['created', 'moved', 'assigned', 'updated', 'commented', 'deleted'].includes(h.action) && h.action}
                        </span>
                      </p>
                      {h.field_name && h.action === 'updated' && h.old_value && h.new_value && (
                        <p className="text-xs text-white/40 mt-1">
                          <span className="line-through">{h.old_value}</span> → <span className="text-white/60">{h.new_value}</span>
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-white/30 shrink-0">
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg bg-slate-900 rounded-xl border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}