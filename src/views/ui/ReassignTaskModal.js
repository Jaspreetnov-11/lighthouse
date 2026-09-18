'use client';

import { useEffect, useMemo, useState } from 'react';
import { Avatar } from './index';

export function ReassignTaskModal({ isOpen, task, employees = [], currentUserId, onClose, onReassign }) {
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const currentIds = useMemo(() => {
    if (!task || !task.assignee) return [];
    return String(task.assignee).split(',').map(s => s.trim()).filter(Boolean);
  }, [task]);

  useEffect(() => {
    if (isOpen && task) {
      setSelected([]);
      setNote('');
      setQ('');
      setBusy(false);
      setErr('');
    }
  }, [isOpen, task]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !task) return null;

  const currentAssignees = employees.filter(e => currentIds.includes(e.id));
  const candidateList = employees.filter(e => {
    if (currentUserId && e.id === currentUserId) return false;
    if (currentIds.includes(e.id)) return false;
    const s = q.toLowerCase().trim();
    if (!s) return true;
    return (e.name || '').toLowerCase().includes(s) || (e.role || '').toLowerCase().includes(s) || (e.dept || '').toLowerCase().includes(s);
  });

  const selectColleague = id => {
    setSelected([id]);
    setErr('');
  };

  const handleReassign = async e => {
    e.preventDefault();
    if (!selected.length) {
      setErr('Please select a colleague to reassign this task to.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await onReassign(selected, note.trim());
      onClose();
    } catch (error) {
      setErr(error.message || 'Failed to reassign task.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="scrim open"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      role="presentation"
      style={{ zIndex: 80 }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 480 }}
      >
        <div className="dialog-handle" onClick={onClose} title="Minimise sheet" role="button" tabIndex={0} />
        <div className="dialog-h">
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Reassign Task</h2>
          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>
          Directly hand over this task to a colleague. It will be moved to their pipeline and removed from yours.
        </p>

        <form onSubmit={handleReassign} className="dialog-form">
          <div className="dialog-body">
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-soft)', borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 4 }}>
                Task
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>
                {task.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)' }}>
                <span style={{ color: 'var(--muted)' }}>Current Assignee:</span>
                {currentAssignees.length ? currentAssignees.map(e => (
                  <span key={e.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Avatar e={e} cls="sm" /> {e.name}
                  </span>
                )) : <span>Unassigned</span>}
              </div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                Select New Assignee <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search colleagues by name, role or dept..."
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid var(--line-soft)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text)',
                  fontSize: 13,
                  marginBottom: 8
                }}
              />
              <div
                className="ms-box"
                style={{
                  maxHeight: 180,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  background: 'rgba(20,20,23,0.5)',
                  padding: '4px'
                }}
              >
                {candidateList.map(emp => {
                  const isChecked = selected.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      onClick={() => selectColleague(emp.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: isChecked ? 'rgba(255,210,31,0.08)' : 'transparent',
                        border: isChecked ? '1px solid var(--accent-line)' : '1px solid transparent',
                        marginBottom: 2,
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    >
                      <input
                        type="radio"
                        name="reassign_colleague"
                        checked={isChecked}
                        onChange={() => selectColleague(emp.id)}
                        style={{
                          width: 16,
                          height: 16,
                          minWidth: 16,
                          maxWidth: 16,
                          margin: 0,
                          padding: 0,
                          flexShrink: 0,
                          accentColor: 'var(--accent)',
                          cursor: 'pointer',
                          boxShadow: 'none',
                          border: 0
                        }}
                      />
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                        <Avatar e={emp} cls="sm" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: isChecked ? 600 : 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {emp.name}
                        </div>
                        <div style={{ color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                          {emp.role || ''}{emp.dept ? ' · ' + emp.dept : ''}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {!candidateList.length && (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
                    No colleagues available for reassignment
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {selected.length ? `${selected.length} colleague selected` : 'Select one colleague'}
              </div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                Reason / Handover Note <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Overloaded with tasks, reassigning to you."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--line-soft)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text)',
                  fontSize: 13,
                  resize: 'none'
                }}
              />
            </div>

            {err && (
              <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>
                {err}
              </div>
            )}
          </div>

          <div className="row dialog-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={'btn btn-primary' + (busy ? ' loading' : '')}
              disabled={busy || !selected.length}
            >
              <span className="spinner"></span>
              Reassign Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
