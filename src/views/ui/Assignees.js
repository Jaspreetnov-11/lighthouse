'use client';
// Stacked avatars + names for a task's assignees (a task can be assigned to several people).
import { useData } from '@/controllers/DataController';
import { parseUserTimers } from '@/lib/format';
import { Avatar } from './index';

export function Assignees({ task, names = true, max = 4 }) {
  const { taskAssignees } = useData();
  const list = taskAssignees(task);
  if (!list.length) return <span className="who"><span className="avatar sm gy">?</span>Unassigned</span>;

  const timers = task && task.user_timers ? parseUserTimers(task.user_timers) : {};
  const isMulti = list.length > 1;

  return (
    <span className="who">
      <span className="stack">
        {list.slice(0, max).map(e => {
          const uState = timers[e.id];
          const isRunning = isMulti && uState && uState.status === 'progress' && uState.started_at;
          return (
            <span key={e.id} style={{ position: 'relative', display: 'inline-flex' }} title={isRunning ? `${e.name} (Working now 🟢)` : e.name}>
              <Avatar e={e} />
              {isRunning && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--ok, #4ADE95)',
                    border: '1.5px solid var(--bg, #111)',
                    boxShadow: '0 0 4px rgba(74,222,149,0.8)'
                  }}
                />
              )}
            </span>
          );
        })}
        {list.length > max && <span className="avatar sm gy">+{list.length - max}</span>}
      </span>
      {names && <span className="names">{list.length === 1 ? list[0].name : list.map(e => e.name.split(' ')[0]).join(', ')}</span>}
    </span>
  );
}
