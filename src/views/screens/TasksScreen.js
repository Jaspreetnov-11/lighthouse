'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/controllers/AuthController';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { TaskModel } from '@/models';
import { saveCsv } from '@/lib/download';
import { Avatar, Empty, Icon, LinkBtn, ReassignTaskModal, Seg, Sq, TaskChip } from '@/views/ui';
import { Assignees } from '@/views/ui/Assignees';
import { Pager, usePager } from '@/views/ui/Pager';
import { assigneeIds, fmtD, getUserTaskState, hm, isRunning, isUserRunning, overdue, parseUserTimers, sortTasksByLatest, STATUSES, STATUS_LABEL, takenMins, thisMonth, todayISO, userTakenMins } from '@/lib/format';

const COL_CLS = { pipeline: '', progress: 'ip', approval: 'pa', completed: 'cp', changes: 'oh' };

function useTaskActions() {
  const { me } = useAuth();
  const { isLeaderOf } = useData();
  return t => {
    const ids = assigneeIds(t);
    const isMulti = ids.length > 1;
    const mine = ids.includes(me?.id);
    const lead = isLeaderOf(t.project);
    const isCreator = t.assigned_by === me?.id;
    const canManage = lead || isCreator || me?.role === 'admin' || me?.access === 'admin' || me?.access === 'manager';
    const canMove = mine || canManage;
    const acts = [];

    // For multi-assignee task where current user is an assignee, check user's specific status!
    const uState = (isMulti && mine && me?.id) ? getUserTaskState(t, me.id) : null;
    const effectiveStatus = uState ? uState.status : t.status;

    // Streamlined workflow progression:
    // In Pipeline -> Start -> send for approval -> Completed -> Changes -> Start
    if (canMove) {
      if (effectiveStatus === 'pipeline') {
        acts.push(['progress', '▶ Start', 'go']);
      } else if (effectiveStatus === 'progress') {
        acts.push(['approval', 'send for approval', 'ok']);
      } else if (effectiveStatus === 'approval') {
        if (canManage) {
          acts.push(['completed', '✓ Completed', 'ok']);
          acts.push(['changes', 'Changes', 'warn']);
        }
      } else if (effectiveStatus === 'completed') {
        if (canManage) {
          acts.push(['changes', '⇄ Changes', 'warn']);
        }
      } else if (effectiveStatus === 'changes') {
        acts.push(['progress', '▶ Start', 'go']);
      }
    }

    const canReject = mine && effectiveStatus === 'pipeline' && Boolean(
      (t.reassigned_by && t.reassigned_by !== me?.id) ||
      (t.assigned_by && t.assigned_by !== me?.id)
    );
    return { acts, mine, lead, canManage, canReject, effectiveStatus };
  };
}

function Timer({ t, now, currentUserId }) {
  const est = Number(t.mins) || 0;
  const ids = assigneeIds(t);
  const isMulti = ids.length > 1;
  const mine = currentUserId && ids.includes(currentUserId);

  const uState = (isMulti && mine) ? getUserTaskState(t, currentUserId) : null;
  const effectiveStatus = uState ? uState.status : t.status;
  const taken = (isMulti && mine) ? userTakenMins(t, currentUserId, now) : takenMins(t, now);
  const live = (isMulti && mine) ? isUserRunning(t, currentUserId) : isRunning(t);
  const startedAt = uState ? uState.started_at : t.started_at;
  const over = est > 0 && taken > est;

  let activeCount = 0;
  if (isMulti && t.user_timers) {
    const timers = parseUserTimers(t.user_timers);
    for (const uid of ids) {
      if (timers[uid] && timers[uid].status === 'progress' && timers[uid].started_at) {
        activeCount++;
      }
    }
  }

  if (!startedAt && effectiveStatus === 'pipeline') {
    return (
      <div className="timer">
        <span>Est. <b>{hm(est)}</b></span>
        <span style={{ color: 'var(--muted)' }}>
          {isMulti && mine ? 'Your timer starts on accept' : 'Timer starts on accept'}
          {isMulti && activeCount > 0 && <span style={{ marginLeft: 6, color: 'var(--ok, #4ADE95)', fontWeight: 500 }}>({activeCount}/{ids.length} active)</span>}
        </span>
      </div>
    );
  }

  const isDoneOrLocked = effectiveStatus !== 'progress';
  return (
    <div className={'timer' + (live ? ' live' : '') + (over ? ' over' : '')}>
      <span>
        {live && <i className="dot"></i>}
        {effectiveStatus === 'changes' ? 'Paused' : isDoneOrLocked ? 'Took' : 'Running'} <b>{hm(taken)}</b>
        {isMulti && (
          <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 4 }}>
            {mine ? '(Yours)' : `(${activeCount}/${ids.length} active)`}
          </span>
        )}
      </span>
      <span>of est. <b>{hm(est)}</b>{over ? ' · over' : ''}</span>
    </div>
  );
}

export function TasksScreen() {
  const { me } = useAuth();
  const d = useData();
  const { toast, confirm } = useUi();
  const modals = useModals();
  const actionsFor = useTaskActions();
  const [tab, setTab] = useState('me');
  const [member, setMember] = useState('');
  const [dept, setDept] = useState('');
  const [view, setView] = useState('board');
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [mStatus, setMStatus] = useState('open');
  const [now, setNow] = useState(Date.now());
  const [hl, setHl] = useState('');
  const [sheet, setSheet] = useState(''); // task id shown in the detail sheet
  const [range, setRange] = useState('all'); // all | today | day | month
  const [day, setDay] = useState(() => todayISO());
  const [month, setMonth] = useState(() => thisMonth());
  const [reassignTaskTarget, setReassignTaskTarget] = useState(null);
  const boardRef = useRef(null);
  const dragCoordRef = useRef({ x: 0, y: 0, active: false, hasMoved: false });

  // Smooth auto-scroll while dragging cards near viewport edges (top, bottom, left, right)
  useEffect(() => {
    if (!dragId) {
      dragCoordRef.current.active = false;
      dragCoordRef.current.hasMoved = false;
      return;
    }

    dragCoordRef.current.active = true;
    let animId = null;

    const onDragOverDoc = ev => {
      if (typeof ev.clientY === 'number' && typeof ev.clientX === 'number') {
        dragCoordRef.current.hasMoved = true;
        dragCoordRef.current.x = ev.clientX;
        dragCoordRef.current.y = ev.clientY;
      }
    };

    const stopDrag = () => {
      dragCoordRef.current.active = false;
      dragCoordRef.current.hasMoved = false;
      if (animId) cancelAnimationFrame(animId);
      setDragId(null);
      setOverCol('');
    };

    window.addEventListener('dragover', onDragOverDoc, { passive: true });
    window.addEventListener('dragend', stopDrag);
    window.addEventListener('drop', stopDrag);

    const step = () => {
      if (!dragCoordRef.current.active) return;

      if (dragCoordRef.current.hasMoved) {
        const { x, y } = dragCoordRef.current;
        const vh = window.innerHeight || document.documentElement.clientHeight || 800;
        const topEdge = 140; // trigger distance from top of viewport
        const bottomEdge = 140; // trigger distance from bottom of viewport

        // Vertical window / page scroll
        if (y < topEdge) {
          const factor = Math.min(2.5, Math.max(0.2, (topEdge - y) / topEdge));
          const speed = Math.round(factor * 22);
          window.scrollBy(0, -speed);
        } else if (vh - y < bottomEdge) {
          const factor = Math.min(2.5, Math.max(0.2, (bottomEdge - (vh - y)) / bottomEdge));
          const speed = Math.round(factor * 22);
          window.scrollBy(0, speed);
        }

        // Horizontal board scroll (if columns overflow horizontally)
        if (boardRef.current) {
          const bRect = boardRef.current.getBoundingClientRect();
          const hEdge = 90;
          if (x > bRect.left && x < bRect.left + hEdge) {
            const factor = Math.min(2, Math.max(0.2, (bRect.left + hEdge - x) / hEdge));
            boardRef.current.scrollLeft -= Math.round(factor * 20);
          } else if (x < bRect.right && bRect.right - x < hEdge) {
            const factor = Math.min(2, Math.max(0.2, (hEdge - (bRect.right - x)) / hEdge));
            boardRef.current.scrollLeft += Math.round(factor * 20);
          }
        }
      }

      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);

    return () => {
      dragCoordRef.current.active = false;
      dragCoordRef.current.hasMoved = false;
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('dragover', onDragOverDoc);
      window.removeEventListener('dragend', stopDrag);
      window.removeEventListener('drop', stopDrag);
    };
  }, [dragId]);

  // Opened from a notification (/tasks?task=ID): show everyone's tasks and highlight that card
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('task');
    if (id) { setHl(id); setSheet(id); setTab('org'); setRange('all'); setTimeout(() => { const el = document.querySelector('[data-task="' + id + '"]'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 600); }
  }, []);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setIsMobile(mq.matches);
    apply(); mq.addEventListener('change', apply);
    const tick = setInterval(() => setNow(Date.now()), 10000); // live timers
    return () => { mq.removeEventListener('change', apply); clearInterval(tick); };
  }, []);

  const tasks = useMemo(() => {
    let list = d.tasks.slice();
    if (tab === 'me') list = list.filter(t => assigneeIds(t).includes(me.id));
    else if (tab === 'byme') list = list.filter(t => t.assigned_by === me.id);
    else if (tab === 'lead') list = list.filter(t => d.isLeaderOf(t.project) && t.project);
    else if (tab === 'team') list = list.filter(t => (t.dept || '') === me.dept);
    if (member) list = list.filter(t => assigneeIds(t).includes(member));
    if (dept) list = list.filter(t => (t.dept || '') === dept || assigneeIds(t).some(id => (d.empById[id] || {}).dept === dept));
    // Date range: a task belongs to the day it was assigned (completed tasks also to their completion day)
    const onDay = (t, iso) => String(t.assigned || '').slice(0, 10) === iso || String(t.completed || '').slice(0, 10) === iso || (t.status !== 'completed' && String(t.deadline || '').slice(0, 10) === iso);
    if (range === 'today') list = list.filter(t => onDay(t, todayISO()));
    else if (range === 'day') list = list.filter(t => onDay(t, day));
    else if (range === 'month') list = list.filter(t => String(t.assigned || '').slice(0, 7) === month || String(t.completed || '').slice(0, 7) === month || (t.status !== 'completed' && String(t.deadline || '').slice(0, 7) === month));
    // Always sort by latest updated or created first so newest/updated tasks are at the top
    return sortTasksByLatest(list);
  }, [d, tab, member, dept, me, range, day, month]);

  const rangeBar = (
    <div className="task-range">
      {[['all', 'Overall'], ['today', 'Today'], ['day', 'Day'], ['month', 'Month']].map(([k, l]) => <button key={k} type="button" className={'pill' + (range === k ? ' on' : '')} onClick={() => setRange(k)}>{l}</button>)}
      {range === 'day' && <input type="date" value={day} max={todayISO()} onChange={e => setDay(e.target.value)} />}
      {range === 'month' && <input type="month" value={month} onChange={e => setMonth(e.target.value)} />}
    </div>
  );
  const emps = d.employees.filter(e => !dept || e.dept === dept);
  const listPager = usePager(tasks, 20);

  const move = async (id, to) => {
    const t = d.tasks.find(x => x.id === id);
    if (!t) return;
    const isMulti = assigneeIds(t).length > 1;
    const isMine = me?.id && assigneeIds(t).includes(me.id);
    const uState = (isMulti && isMine) ? getUserTaskState(t, me.id) : null;
    const prevUserStatus = uState ? uState.status : t.status;
    if (prevUserStatus === to) return;

    const nowISO = new Date().toISOString();
    const optimisticPatch = { status: to, updated_at: nowISO };

    if (isMulti && isMine && t.user_timers) {
      const timers = parseUserTimers(t.user_timers);
      const u = timers[me.id] || {};
      timers[me.id] = {
        ...u,
        status: to,
        started_at: to === 'progress' ? (u.started_at || nowISO) : u.started_at,
        completed_at: (to === 'approval' || to === 'completed') ? nowISO : null
      };
      optimisticPatch.user_timers = JSON.stringify(timers);
    }

    if (to === 'progress') {
      if (!t.started_at) {
        optimisticPatch.started_at = nowISO;
      } else if (t.status === 'approval' || t.status === 'changes') {
        const prevMins = Number(t.taken_mins) || 0;
        optimisticPatch.started_at = new Date(Date.now() - (prevMins * 60000)).toISOString();
      }
    } else if (to === 'approval') {
      optimisticPatch.completed_at = nowISO;
      optimisticPatch.taken_mins = takenMins(t, Date.now(), me?.id);
    } else if (to === 'completed') {
      optimisticPatch.completed_at = nowISO;
      optimisticPatch.completed = todayISO();
      if (t.status === 'approval' && Number(t.taken_mins) > 0) {
        optimisticPatch.taken_mins = Number(t.taken_mins);
      } else {
        optimisticPatch.taken_mins = takenMins(t, Date.now(), me?.id);
      }
    }
    if (d.updateTaskOptimistic) {
      d.updateTaskOptimistic(id, optimisticPatch);
    }
    try {
      await TaskModel.setStatus(id, to);
      toast(to === 'progress' && (prevUserStatus === 'pipeline' || t.status === 'pipeline') ? 'Accepted. Timer started.' : 'Moved to ' + STATUS_LABEL[to]);
      await d.reload('tasks', 'projects', 'activity', 'alerts');
    } catch (err) {
      toast(err.message);
      await d.reload('tasks');
    }
  };

  const del = async t => {
    const ok = await confirm({
      title: 'Delete Task',
      message: `Delete "${t.title}"?`,
      sub: 'This action cannot be undone.',
      okText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    try {
      await TaskModel.remove(t.id);
      toast('Task deleted.');
      await d.reload('tasks', 'projects');
    } catch (err) {
      toast(err.message);
    }
  };
  const reject = async t => {
    const reason = window.prompt(`Reject task "${t.title}" and return to previous assigner?\nOptional reason:`, '');
    if (reason === null) return;
    try {
      await TaskModel.reject(t.id, reason.trim());
      toast('Task rejected. Returned to previous assigner.');
      await d.reload('tasks', 'projects', 'activity', 'alerts');
    } catch (err) {
      toast(err.message || 'Failed to reject task.');
    }
  };
  const exportCsv = () => saveCsv('tasks.csv', [['Title', 'Project', 'Department', 'Assignee', 'Assigned by', 'Assigned', 'Deadline', 'Est. hours', 'Taken hours', 'Status']].concat(tasks.map(t => [t.title, t.project_name || d.projName(t.project), t.dept || '', d.taskAssigneeNames(t), t.assigned_by_name || (t.assigned_by ? d.empName(t.assigned_by) : ''), t.assigned, t.deadline, Math.round((Number(t.mins) || 0) / 6) / 10, Math.round(takenMins(t, now) / 6) / 10, STATUS_LABEL[t.status]])));

  const tabs = [['me', 'file', 'My tasks'], ['byme', 'check', 'Assigned by me'], ...(d.canAssign ? [['lead', 'brief', 'My projects']] : []), ['team', 'users', 'My department'], ['org', 'circle-check', 'Everyone']];

  const card = t => {
    const od = overdue(t);
    const { acts, lead, mine, canManage, canReject } = actionsFor(t);
    const canReassign = (mine || lead || canManage) && t.status !== 'completed';
    const assignerName = t.assigned_by_name || (t.assigned_by ? d.empName(t.assigned_by) : '');
    return (
      <div
        className={'tcard' + (dragId === t.id ? ' dragging' : '') + (hl === t.id ? ' hl' : '')}
        data-task={t.id}
        key={t.id}
        draggable={true}
        onDragStart={ev => {
          setDragId(t.id);
          dragCoordRef.current.active = true;
          dragCoordRef.current.hasMoved = true;
          dragCoordRef.current.x = ev.clientX;
          dragCoordRef.current.y = ev.clientY;
          ev.dataTransfer.effectAllowed = 'move';
          try { ev.dataTransfer.setData('text/plain', t.id); } catch (x) { /* ignore */ }
        }}
        onDragEnd={() => {
          dragCoordRef.current.active = false;
          dragCoordRef.current.hasMoved = false;
          setDragId(null);
          setOverCol('');
        }}
      >
        <div className="p">
          <span>{t.project_name || d.projName(t.project)}</span>
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <i className={od ? 'r' : ''} title={od ? 'Overdue' : ''}><Icon name="flag" size={14} /></i>
            {canReassign && <button type="button" onClick={() => setReassignTaskTarget(t)} title="Reassign task" style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}>⇄</button>}
            {lead && <><button onClick={() => modals.open('task', t.id)} aria-label="Edit"><Icon name="edit" /></button><button onClick={() => del(t)} aria-label="Delete">✕</button></>}
          </span>
        </div>
        <small>{t.type || 'Other'}{t.dept ? ' · ' + t.dept : ''}</small>
        <div role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setSheet(t.id)} title="Open task">{t.title}</div>
        {assignerName && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <span style={{ opacity: 0.8 }}>Assign by:</span>
            <b style={{ color: 'var(--text)', fontWeight: 600 }}>{assignerName}</b>
          </div>
        )}
        {t.reassigned_by && (
          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>⇄ Reassigned by <b>{d.empName(t.reassigned_by)}</b></span>
            {t.reassign_note && <span title={t.reassign_note} style={{ color: 'var(--muted)', cursor: 'help' }}>💬</span>}
          </div>
        )}
        <div className="dates"><div><small>Assigned</small>{fmtD(t.assigned)}</div><div className={t.status === 'completed' ? 'ok' : ''} style={od ? { borderColor: 'rgba(255,92,122,.5)' } : undefined}><small>{t.status === 'completed' ? 'Completed' : 'Deadline'}</small>{fmtD(t.status === 'completed' ? (t.completed || t.deadline) : t.deadline)}</div></div>
        <Timer t={t} now={now} currentUserId={me?.id} />
        <Assignees task={t} />
        {(acts.length > 0 || canReassign || canReject) && (
          <div className="move">
            {acts.map(([k, l, cls]) => <button key={k} className={cls} onClick={() => move(t.id, k)}>{l}</button>)}
            {canReject && <button type="button" className="pill" onClick={() => reject(t)} style={{ color: 'var(--danger)', borderColor: 'rgba(255,100,100,0.3)', fontSize: 11, padding: '3px 8px' }}>✕ Reject</button>}
            {canReassign && <button type="button" className="pill" onClick={() => setReassignTaskTarget(t)} style={{ fontSize: 11, padding: '3px 8px' }}>⇄ Reassign</button>}
          </div>
        )}
      </div>
    );
  };

  const sheetTask = sheet ? d.tasks.find(t => t.id === sheet) : null;
  const taskSheet = sheetTask ? (
    <div className="tsheet-bg" onClick={e => { if (e.target === e.currentTarget) setSheet(''); }}>
      <div className="tsheet" role="dialog" aria-label="Task">
        <div className="dialog-handle" onClick={() => setSheet('')} title="Minimise sheet" role="button" tabIndex={0} />
        <div className="tsheet-h"><b>Task</b><span style={{ display: 'inline-flex', gap: 6 }}>{actionsFor(sheetTask).lead && <button className="mini-btn" onClick={() => { setSheet(''); modals.open('task', sheetTask.id); }} title="Edit"><Icon name="edit" /></button>}<button className="mini-btn" onClick={() => setSheet('')} aria-label="Close" title="Close">✕</button></span></div>
        {card(sheetTask)}
      </div>
    </div>
  ) : null;

  const reassignModal = (
    <ReassignTaskModal
      isOpen={!!reassignTaskTarget}
      task={reassignTaskTarget}
      employees={d.employees}
      currentUserId={me?.id || ''}
      onClose={() => setReassignTaskTarget(null)}
      onReassign={async (assignees, note) => {
        if (reassignTaskTarget) {
          await TaskModel.reassign(reassignTaskTarget.id, assignees.join(','), note);
          toast('Task reassigned successfully.');
          setSheet('');
          await d.reload('tasks', 'projects', 'activity', 'alerts');
        }
      }}
    />
  );

  // ---- Mobile: a simple list with workflow buttons (the kanban board is desktop-only) ----
  if (isMobile) {
    const getTaskStatusForFilter = t => (tab === 'me' && me?.id && assigneeIds(t).length > 1)
      ? (getUserTaskState(t, me.id)?.status || t.status)
      : t.status;
    const mList = sortTasksByLatest(tasks.filter(t => {
      const s = getTaskStatusForFilter(t);
      return mStatus === 'all' ? true : mStatus === 'open' ? s !== 'completed' : s === mStatus;
    }));
    const mCounts = { open: tasks.filter(t => getTaskStatusForFilter(t) !== 'completed').length, all: tasks.length };
    STATUSES.forEach(k => { mCounts[k] = tasks.filter(t => getTaskStatusForFilter(t) === k).length; });
    return (
      <div className="content mtasks">
        <div className="mtasks-head">
          <div className="tabs" style={{ overflowX: 'auto', border: 0, padding: 0 }}>{[['me', 'Mine'], ['byme', 'By me'], ['team', 'Dept'], ['org', 'All']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Link href="/self-task" className="tb-btn" style={{ height: 36, padding: '0 10px', fontSize: 12 }}>+ Self Task</Link>
            {d.canAssign && <button className="tb-btn solid" style={{ height: 36 }} onClick={() => modals.open('task')}>+ Task</button>}
          </div>
        </div>
        <div className="pill-tabs" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          {[['open', 'Open'], ...STATUSES.map(k => [k, STATUS_LABEL[k]]), ['all', 'All']].map(([k, l]) => <button key={k} className={'pill' + (mStatus === k ? ' on' : '')} style={{ flex: '0 0 auto' }} onClick={() => setMStatus(k)}>{l} <span className="n">{mCounts[k]}</span></button>)}
        </div>
        {rangeBar}
        <div className="mtask-list">
          {mList.map(t => {
            const od = overdue(t); const { acts, lead, mine, canManage, canReject, effectiveStatus } = actionsFor(t);
            const canReassign = (mine || lead || canManage) && t.status !== 'completed';
            const assignerName = t.assigned_by_name || (t.assigned_by ? d.empName(t.assigned_by) : '');
            const effStatus = (tab === 'me' && me?.id && assigneeIds(t).length > 1) ? effectiveStatus : t.status;
            return (
              <div className={'mtask' + (effStatus === 'completed' ? ' done' : od ? ' late' : '') + (hl === t.id ? ' hl' : '')} data-task={t.id} key={t.id}>
                <div className="mtask-top"><span className="mtask-proj">{t.project_name || d.projName(t.project)}</span><span className={'chip ' + (od ? 'pk' : effStatus === 'completed' ? 'gr' : 'gy')}>{effStatus === 'completed' ? 'Done ' + fmtD(t.completed || t.deadline) : 'Due ' + fmtD(t.deadline)}</span></div>
                <div className="mtask-title" role="button" onClick={() => setSheet(t.id)}>{t.title}</div>
                {assignerName && (
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, margin: '2px 0 4px' }}>
                    <span style={{ opacity: 0.8 }}>Assign by:</span>
                    <b style={{ color: 'var(--text)', fontWeight: 600 }}>{assignerName}</b>
                    {t.reassigned_by && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>(⇄ Reassigned by {d.empName(t.reassigned_by)})</span>}
                  </div>
                )}
                <div className="mtask-row"><Assignees task={t} /><TaskChip status={effStatus} /></div>
                <div className="tcard" style={{ padding: 0, border: 0, background: 'none' }}><Timer t={t} now={now} currentUserId={me?.id} /></div>
                <div className="mtask-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {acts.slice(0, 2).map(([k, l, cls]) => <button key={k} className={cls === 'go' || cls === 'ok' ? 'mtask-done' : 'pill'} onClick={() => move(t.id, k)}>{l}</button>)}
                  {canReject && <button className="pill" onClick={() => reject(t)} style={{ color: 'var(--danger)', borderColor: 'rgba(255,100,100,0.3)' }}>✕ Reject</button>}
                  {canReassign && <button type="button" className="pill" onClick={() => setReassignTaskTarget(t)}>⇄ Reassign</button>}
                  {lead && <button className="mini-btn" onClick={() => modals.open('task', t.id)} aria-label="Edit"><Icon name="edit" /></button>}
                  {lead && <button className="mini-btn" onClick={() => del(t)} aria-label="Delete">✕</button>}
                </div>
              </div>);
          })}
          {!mList.length && <Empty>No tasks here</Empty>}
        </div>
        {taskSheet}
        {reassignModal}
      </div>
    );
  }

  return (
    <>
      <div className="task-top">
        <div className="tabs">{tabs.map(([k, ic, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon name={ic} size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{l}</button>)}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Seg items={[['board', '▦ Board'], ['list', '☰ List']]} value={view} onChange={setView} />
          <Sq icon="down" label="Export CSV" onClick={exportCsv} style={{ border: 0 }} />
          <Link href="/self-task" className="tb-btn" style={{ height: 34, padding: '0 12px', fontSize: 12.5 }} title="Create a self-assigned task">+ Self Task</Link>
          {d.canAssign && <button className="tb-btn solid" style={{ height: 34 }} onClick={() => modals.open('task')}>+ Assign task</button>}
        </div>
      </div>
      {rangeBar}
      <div className="board-wrap">
        <div className="members">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>People</div>
          <select value={dept} onChange={e => { setDept(e.target.value); setMember(''); }} style={{ height: 36, fontSize: 12.5, marginBottom: 8 }}><option value="">All departments</option>{d.departments.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}</select>
          <div className={'mem' + (!member ? ' on' : '')} onClick={() => setMember('')}><span className="avatar sm" style={{ background: '#FFD21F' }}><Icon name="users" size={12} style={{ color: '#0A0A0B' }} /></span>Everyone</div>
          {emps.map(e => <div className={'mem' + (member === e.id ? ' on' : '')} key={e.id} onClick={() => setMember(e.id)}><Avatar e={e} /><div>{e.name}<small>{e.role || ''}</small></div></div>)}
        </div>
        {view === 'board' ? (
          <div className="board" ref={boardRef}>
            {STATUSES.map(k => {
              const ts = sortTasksByLatest(tasks.filter(t => {
                const effectiveStatus = (tab === 'me' && me?.id && assigneeIds(t).length > 1)
                  ? (getUserTaskState(t, me.id)?.status || t.status)
                  : t.status;
                return effectiveStatus === k;
              })); return (
                <div className={'col ' + COL_CLS[k] + (overCol === k ? ' over' : '')} key={k} onDragOver={ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; setOverCol(k); }} onDragLeave={ev => { if (ev.currentTarget.contains(ev.relatedTarget)) return; setOverCol(''); }} onDrop={ev => { ev.preventDefault(); const id = dragId || ev.dataTransfer.getData('text/plain'); setOverCol(''); setDragId(null); if (id) move(id, k); }}>
                  <div className="col-h">{STATUS_LABEL[k]}<span>{ts.length}</span></div>
                  {ts.map(card)}
                  {!ts.length && <div className="col-empty">No tasks</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="panel" style={{ minWidth: 0 }}><div style={{ overflowX: 'auto' }}>
            <div className="task-row head"><span>Task</span><span>Assignee</span><span>Assigned by</span><span>Dates</span><span>Time</span><span>Status</span><span>Action</span></div>
            {listPager.items.map(t => {
              const od = overdue(t);
              const { acts, lead, mine, canManage, canReject, effectiveStatus } = actionsFor(t);
              const canReassign = (mine || lead || canManage) && t.status !== 'completed';
              const assignerName = t.assigned_by_name || (t.assigned_by ? d.empName(t.assigned_by) : '');
              const effStatus = (tab === 'me' && me?.id && assigneeIds(t).length > 1) ? effectiveStatus : t.status;
              return (
                <div className={'task-row' + (effStatus === 'completed' ? '' : od ? ' late' : '') + (hl === t.id ? ' hl' : '')} data-task={t.id} key={t.id}>
                  <div><LinkBtn onClick={() => setSheet(t.id)} style={{ textAlign: 'left', fontWeight: 600 }}>{t.title}</LinkBtn><small>{t.project_name || d.projName(t.project)}{t.dept ? ' · ' + t.dept : ''}</small></div>
                  <div><Assignees task={t} /></div>
                  <div>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{assignerName || '—'}</span>
                    {t.reassigned_by && <div style={{ fontSize: 11, color: 'var(--accent)' }}>⇄ Reassigned by {d.empName(t.reassigned_by)}</div>}
                  </div>
                  <div><small>Due {fmtD(t.deadline)}</small></div>
                  <div><small>{hm((tab === 'me' && me?.id && assigneeIds(t).length > 1) ? userTakenMins(t, me.id, now) : (t.mins || takenMins(t, now)))}</small></div>
                  <div><TaskChip status={effStatus} /></div>
                  <div className="move">
                    {acts.map(([k, l, cls]) => <button key={k} className={cls} onClick={() => move(t.id, k)}>{l}</button>)}
                    {canReject && <button type="button" className="pill" onClick={() => reject(t)} style={{ color: 'var(--danger)', borderColor: 'rgba(255,100,100,0.3)', fontSize: 11, padding: '2px 8px' }}>✕ Reject</button>}
                    {canReassign && <button type="button" className="pill" onClick={() => setReassignTaskTarget(t)} style={{ fontSize: 11, padding: '2px 8px' }}>⇄ Reassign</button>}
                    {lead && <button className="mini-btn" onClick={() => modals.open('task', t.id)} aria-label="Edit"><Icon name="edit" /></button>}
                    {lead && <button className="mini-btn" onClick={() => del(t)} aria-label="Delete">✕</button>}
                  </div>
                </div>
              );
            })}
            {!tasks.length && <Empty>No tasks</Empty>}
            <Pager pager={listPager} />
          </div></div>
        )}
      </div>
      {reassignModal}
      {taskSheet}
    </>
  );
}
