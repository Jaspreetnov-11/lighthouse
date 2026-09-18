'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/controllers/AuthController';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { TaskModel } from '@/models';
import { Avatar, Chip, Empty, Icon, LinkBtn, Panel, ReassignTaskModal, TaskChip } from '@/views/ui';
import { assigneeIds, fmtD, hm, isRunning, overdue, sortTasksByLatest, STATUS_LABEL, takenMins, TASK_TYPES, todayISO } from '@/lib/format';

export function SelfTaskScreen() {
  const { me } = useAuth();
  const d = useData();
  const { toast, confirm } = useUi();

  // Form states
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [type, setType] = useState('Feature');
  const [estHours, setEstHours] = useState(2);
  const [deadline, setDeadline] = useState(todayISO());
  const [startImmediate, setStartImmediate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('active'); // 'active' | 'all' | 'completed'

  // Modal / Timer states
  const [now, setNow] = useState(Date.now());
  const [reassignTaskTarget, setReassignTaskTarget] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Filter tasks that are self-assigned (assigned to me and created by me, or where I am an assignee)
  const mySelfTasks = useMemo(() => {
    if (!me || !me.id) return [];
    const filtered = d.tasks.filter(t => {
      const isAssignedToMe = assigneeIds(t).includes(me.id);
      const isCreatedByMe = t.assigned_by === me.id;
      return isAssignedToMe && isCreatedByMe;
    });
    return sortTasksByLatest(filtered);
  }, [d.tasks, me]);

  const activeTasks = useMemo(() => mySelfTasks.filter(t => t.status !== 'completed'), [mySelfTasks]);
  const completedTasks = useMemo(() => mySelfTasks.filter(t => t.status === 'completed'), [mySelfTasks]);
  const inProgressCount = useMemo(() => mySelfTasks.filter(t => t.status === 'progress').length, [mySelfTasks]);

  const totalTimeTakenMins = useMemo(() => {
    return mySelfTasks.reduce((acc, t) => acc + takenMins(t, now), 0);
  }, [mySelfTasks, now]);

  const displayedTasks = useMemo(() => {
    if (tab === 'active') return activeTasks;
    if (tab === 'completed') return completedTasks;
    return mySelfTasks;
  }, [tab, activeTasks, completedTasks, mySelfTasks]);

  const handleCreate = async e => {
    e.preventDefault();
    if (!title.trim()) {
      toast('Please enter a task title.');
      return;
    }
    setSaving(true);
    try {
      await TaskModel.selfAssign({
        title: title.trim(),
        project: projectId || '',
        dept: (me && me.dept) || '',
        mins: Math.round((Number(estHours) || 2) * 60),
        type,
        deadline,
        status: startImmediate ? 'progress' : 'pipeline'
      });
      toast(startImmediate ? 'Self-task created and timer started!' : 'Self-task created in pipeline.');
      setTitle('');
      setProjectId('');
      setType('Feature');
      setEstHours(2);
      setDeadline(todayISO());
      await d.reload('tasks', 'projects', 'activity', 'alerts');
    } catch (err) {
      toast(err.message || 'Failed to create self-task.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusMove = async (id, to) => {
    const t = d.tasks.find(x => x.id === id);
    if (!t || t.status === to) return;
    const nowISO = new Date().toISOString();
    const optimisticPatch = { status: to, updated_at: nowISO };
    if (to === 'progress') {
      if (!t.started_at) {
        optimisticPatch.started_at = nowISO;
      } else if (t.status === 'approval' || t.status === 'changes') {
        const prevMins = Number(t.taken_mins) || 0;
        optimisticPatch.started_at = new Date(Date.now() - (prevMins * 60000)).toISOString();
      }
    } else if (to === 'approval') {
      optimisticPatch.completed_at = nowISO;
      optimisticPatch.taken_mins = takenMins(t);
    } else if (to === 'completed') {
      optimisticPatch.completed_at = nowISO;
      optimisticPatch.completed = todayISO();
      if (t.status === 'approval' && Number(t.taken_mins) > 0) {
        optimisticPatch.taken_mins = Number(t.taken_mins);
      } else {
        optimisticPatch.taken_mins = takenMins(t);
      }
    }
    if (d.updateTaskOptimistic) {
      d.updateTaskOptimistic(id, optimisticPatch);
    }
    try {
      await TaskModel.setStatus(id, to);
      toast(to === 'progress' ? 'Task resumed. Timer running.' : to === 'completed' ? 'Task marked completed.' : 'Task moved to ' + STATUS_LABEL[to]);
      await d.reload('tasks', 'projects', 'activity', 'alerts');
    } catch (err) {
      toast(err.message);
      await d.reload('tasks');
    }
  };

  const handleDelete = async t => {
    if (!confirm(`Delete your self-task "${t.title}"?`)) return;
    try {
      await TaskModel.remove(t.id);
      toast('Self-task deleted.');
      await d.reload('tasks', 'projects');
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/tasks" className="back" aria-label="Back to Tasks">‹</Link>
          <div>
            <h1>Self Task Assign</h1>
            <p>Assign tasks directly to yourself and manage your active focus timers</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/tasks" className="tb-btn" style={{ height: 34 }}>
            All Tasks Board →
          </Link>
        </div>
      </div>

      <div className="content">
        {/* Quick Stats Banner */}
        <div className="panel" style={{ padding: '16px 20px' }}>
          <div className="sum" style={{ margin: 0, padding: 0 }}>
            <div>
              <span>My Self Tasks</span>
              <b>{mySelfTasks.length}</b>
            </div>
            <div>
              <span>In Progress</span>
              <b style={{ color: 'var(--accent)' }}>{inProgressCount}</b>
            </div>
            <div>
              <span>Completed</span>
              <b style={{ color: 'var(--ok)' }}>{completedTasks.length}</b>
            </div>
            <div>
              <span>Time Logged</span>
              <b>{hm(totalTimeTakenMins)}</b>
            </div>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: 20, alignItems: 'start' }}>
          {/* Form: Create Self Task */}
          <div className="panel" style={{ padding: '20px' }}>
            <div className="panel-h" style={{ padding: '0 0 14px', borderBottom: '1px solid var(--line-soft)', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>+ Create Self-Assigned Task</div>
            </div>

            <form onSubmit={handleCreate}>
              <div className="field" style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                  Task Title <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="What are you working on?"
                  required
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 10,
                    border: '1px solid var(--line-soft)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'var(--text)',
                    padding: '0 12px',
                    fontSize: 13
                  }}
                />
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                  Associated Project <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
                </label>
                <select
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 10,
                    border: '1px solid var(--line-soft)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'var(--text)',
                    padding: '0 10px',
                    fontSize: 13
                  }}
                >
                  <option value="">Personal / Operational</option>
                  {d.projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="field">
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Task Type
                  </label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value)}
                    style={{
                      width: '100%',
                      height: 38,
                      borderRadius: 10,
                      border: '1px solid var(--line-soft)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'var(--text)',
                      padding: '0 10px',
                      fontSize: 13
                    }}
                  >
                    {TASK_TYPES.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Est. Hours
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={estHours}
                    onChange={e => setEstHours(e.target.value)}
                    style={{
                      width: '100%',
                      height: 38,
                      borderRadius: 10,
                      border: '1px solid var(--line-soft)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'var(--text)',
                      padding: '0 12px',
                      fontSize: 13
                    }}
                  />
                </div>
              </div>

              <div className="field" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                  Target Deadline
                </label>
                <input
                  type="date"
                  value={deadline}
                  min={todayISO()}
                  onChange={e => setDeadline(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 10,
                    border: '1px solid var(--line-soft)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'var(--text)',
                    padding: '0 12px',
                    fontSize: 13
                  }}
                />
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(255, 210, 31, 0.06)',
                  border: '1px solid var(--accent-line)',
                  cursor: 'pointer',
                  marginBottom: 18
                }}
              >
                <input
                  type="checkbox"
                  checked={startImmediate}
                  onChange={e => setStartImmediate(e.target.checked)}
                />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>
                  Start focus timer immediately on creation
                </span>
              </label>

              <button
                type="submit"
                className={'tb-btn solid' + (saving ? ' loading' : '')}
                disabled={saving}
                style={{ width: '100%', height: 40, justifyContent: 'center', fontWeight: 600 }}
              >
                + Assign to Me
              </button>
            </form>
          </div>

          {/* List: My Self-Assigned Tasks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div className="tabs" style={{ margin: 0, padding: 0, border: 0 }}>
                {[
                  ['active', `Active (${activeTasks.length})`],
                  ['completed', `Completed (${completedTasks.length})`],
                  ['all', `All (${mySelfTasks.length})`]
                ].map(([k, l]) => (
                  <button
                    key={k}
                    className={tab === k ? 'on' : ''}
                    onClick={() => setTab(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayedTasks.map(t => {
                const od = overdue(t);
                const running = isRunning(t);
                const taken = takenMins(t, now);
                const est = Number(t.mins) || 0;
                const isOver = est > 0 && taken > est;

                return (
                  <div
                    key={t.id}
                    className="panel"
                    style={{
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      border: running ? '1px solid var(--accent-line)' : '1px solid var(--line-soft)',
                      background: running ? 'rgba(255, 210, 31, 0.02)' : 'var(--panel)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                            {t.project_name || d.projName(t.project)}
                          </span>
                          <span style={{ color: 'var(--line-strong)' }}>·</span>
                          <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>{t.type || 'Feature'}</span>
                          {od && <Chip tone="pk">Overdue</Chip>}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                          {t.title}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <span style={{ opacity: 0.8 }}>Assign by:</span>
                          <b style={{ color: 'var(--text)', fontWeight: 600 }}>{t.assigned_by === me?.id ? 'Self (' + (me?.name || 'You') + ')' : (t.assigned_by_name || d.empName(t.assigned_by))}</b>
                          {t.reassigned_by && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>(⇄ Reassigned by {d.empName(t.reassigned_by)})</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <TaskChip status={t.status} />
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          title="Delete task"
                          style={{
                            background: 'none',
                            border: 0,
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            borderRadius: 6
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      {/* Timer details */}
                      <div
                        className={'timer' + (running ? ' live' : '') + (isOver ? ' over' : '')}
                        style={{ margin: 0 }}
                      >
                        <span>
                          {running && <i className="dot" />}
                          {t.status === 'completed' || t.status === 'approval' ? 'Took' : 'Running'} <b>{hm(taken)}</b>
                        </span>
                        <span>
                          of est. <b>{hm(est)}</b>{isOver ? ' · over' : ''}
                        </span>
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Due: <b style={{ color: od ? 'var(--danger)' : 'var(--text)' }}>{fmtD(t.deadline)}</b>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: 10,
                        borderTop: '1px solid var(--line-soft)',
                        gap: 10,
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8 }}>
                        {t.status === 'pipeline' && (
                          <button
                            type="button"
                            className="tb-btn solid"
                            style={{ height: 32, padding: '0 14px', fontSize: 12 }}
                            onClick={() => handleStatusMove(t.id, 'progress')}
                          >
                            ▶ Start Timer
                          </button>
                        )}
                        {t.status === 'progress' && (
                          <>
                            <button
                              type="button"
                              className="pill on"
                              style={{ height: 32 }}
                              onClick={() => handleStatusMove(t.id, 'completed')}
                            >
                              ✓ Mark Complete
                            </button>
                            <button
                              type="button"
                              className="pill"
                              style={{ height: 32 }}
                              onClick={() => handleStatusMove(t.id, 'pipeline')}
                            >
                              ⏸ Pause
                            </button>
                          </>
                        )}
                        {t.status === 'completed' && (
                          <button
                            type="button"
                            className="pill"
                            style={{ height: 32 }}
                            onClick={() => handleStatusMove(t.id, 'progress')}
                          >
                            ↺ Reopen
                          </button>
                        )}
                      </div>

                      {/* Reassign option even for self-tasks! */}
                      {t.status !== 'completed' && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ height: 32, fontSize: 12, padding: '0 12px' }}
                          onClick={() => setReassignTaskTarget(t)}
                        >
                          ⇄ Reassign to Colleague
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {!displayedTasks.length && (
                <Panel>
                  <Empty
                    icon="circle-check"
                    title={tab === 'completed' ? 'No completed self-tasks' : 'No self-tasks created yet'}
                  >
                    {tab === 'active'
                      ? 'Use the form on the left to assign a task to yourself and start your timer.'
                      : 'All your self-tasks will show up here.'}
                  </Empty>
                </Panel>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reassign modal */}
      <ReassignTaskModal
        isOpen={!!reassignTaskTarget}
        task={reassignTaskTarget}
        employees={d.employees}
        currentUserId={(me && me.id) || ''}
        onClose={() => setReassignTaskTarget(null)}
        onReassign={async (assignees, note) => {
          if (reassignTaskTarget) {
            await TaskModel.reassign(reassignTaskTarget.id, assignees.join(','), note);
            toast('Self-task reassigned to colleague.');
            await d.reload('tasks', 'projects', 'activity', 'alerts');
          }
        }}
      />
    </>
  );
}
