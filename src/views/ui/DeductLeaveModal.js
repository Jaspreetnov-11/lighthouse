'use client';

import { useEffect, useState } from 'react';

const LEAVE_OPTIONS = [
  { id: 'Casual Leave', label: 'Casual Leave', badge: '0.00 Left' },
  { id: 'Sick Leave', label: 'Sick Leave', badge: '0.00 Left' },
  { id: 'Comp Off (System)', label: 'Comp Off (System)', badge: '0.00 Left' },
  { id: 'Weekly Off', label: 'Weekly Off', badge: '0.00 Left' },
  { id: 'Other', label: 'Other', badge: '0 days availed' }
];

export function DeductLeaveModal({ isOpen, employee, currentLeaveType, isAlreadyLeave, onClose, onSave, onClear }) {
  const [selected, setSelected] = useState(currentLeaveType || 'Casual Leave');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelected(currentLeaveType || 'Casual Leave');
      setBusy(false);
    }
  }, [isOpen, currentLeaveType]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !employee) return null;

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(selected);
      onClose();
    } catch (err) {
      // handled by caller
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!onClear) return;
    setBusy(true);
    try {
      await onClear();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="scrim open"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      role="presentation"
      style={{ zIndex: 60 }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        style={{
          maxWidth: 440,
          background: 'var(--panel-solid)',
          borderRadius: 22,
          border: '1px solid var(--line)',
          boxShadow: '0 40px 90px -20px rgba(0,0,0,.9)',
          padding: '24px 26px 22px'
        }}
      >
        <div className="dialog-handle" onClick={onClose} title="Minimise sheet" role="button" tabIndex={0} />
        <div className="dialog-h">
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Deduct Leave</h2>
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
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--muted)' }}>
          Select leave category for <b>{employee.name}</b>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {LEAVE_OPTIONS.map(opt => {
            const isChecked = selected === opt.id;
            return (
              <label
                key={opt.id}
                onClick={() => setSelected(opt.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: isChecked ? '1.5px solid var(--accent)' : '1px solid var(--line-soft)',
                  background: isChecked ? 'rgba(255, 210, 31, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  userSelect: 'none'
                }}
              >
                <input
                  type="radio"
                  name="leave_type"
                  checked={isChecked}
                  onChange={() => setSelected(opt.id)}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: isChecked ? '5px solid var(--accent)' : '1.5px solid var(--muted)',
                      background: isChecked ? '#fff' : 'transparent',
                      transition: 'border-color 0.15s ease',
                      flexShrink: 0
                    }}
                  />
                  <span style={{ fontSize: 13.5, fontWeight: isChecked ? 600 : 500, color: isChecked ? 'var(--text)' : 'var(--t2)' }}>
                    {opt.label}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'var(--muted)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--line-soft)',
                    borderRadius: 100,
                    padding: '3px 10px',
                    fontWeight: 500
                  }}
                >
                  {opt.badge}
                </span>
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          {isAlreadyLeave && onClear ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleClear}
              disabled={busy}
              style={{ color: 'var(--danger)', fontSize: 13, padding: '0 12px' }}
            >
              Clear Leave
            </button>
          ) : <span />}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={'tb-btn solid' + (busy ? ' loading' : '')}
              onClick={handleSave}
              disabled={busy}
              style={{ minHeight: 42, padding: '0 22px', fontSize: 13.5, fontWeight: 600 }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
