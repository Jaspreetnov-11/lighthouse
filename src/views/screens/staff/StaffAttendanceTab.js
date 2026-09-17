'use client';

import { useState, useEffect, useCallback } from 'react';
import { AttendanceModel } from '@/models';
import { useUi } from '@/controllers/UiController';
import { Chip, Empty } from '@/views/ui';
import { Icon } from '@/views/ui/Icons';
import { fmtD, round2, thisMonth } from '@/lib/format';

export function StaffAttendanceTab({ employee }) {
  const { toast } = useUi();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        AttendanceModel.list({ empId: employee.id, month }),
        AttendanceModel.stats(employee.id, month)
      ]);
      setRows(Array.isArray(list) ? list : []);
      setStats(st);
    } catch (err) {
      toast(err.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [employee?.id, month, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedRows = [...rows].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Controls Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        padding: '12px 18px',
        background: 'var(--panel)',
        borderRadius: 'var(--radius-field, 14px)',
        border: '1px solid var(--line-soft)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>Month:</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 13.5,
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer'
            }}
          />
        </div>

        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Total logged records: <b>{sortedRows.length}</b>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12
        }}>
          <div className="panel" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Present</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ok, #4ADE95)', marginTop: 2 }}>{stats.present || 0}</div>
          </div>
          <div className="panel" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Half Days</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--warn, #FFB84D)', marginTop: 2 }}>{stats.half || 0}</div>
          </div>
          <div className="panel" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Leaves</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--info, #6FA8FF)', marginTop: 2 }}>{stats.leave || 0}</div>
          </div>
          <div className="panel" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Absent</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger, #FF5C7A)', marginTop: 2 }}>{stats.absent || 0}</div>
          </div>
          <div className="panel" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Workdays</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{stats.workdaysSoFar || 0}</div>
          </div>
        </div>
      )}

      {/* Attendance Records Table */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="panel-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Attendance Logs ({month})</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              Loading attendance records...
            </div>
          ) : sortedRows.length === 0 ? (
            <Empty icon="cal" title="No Attendance Logs">
              No punch records found for {month}.
            </Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Status</th>
                  <th>Mode</th>
                  <th>OT / Fine</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => {
                  const statusTone = r.status === 'present' ? 'gr' : r.status === 'half' ? 'or' : r.status === 'leave' ? 'bl' : 'pk';
                  return (
                    <tr key={r.id || r.date}>
                      <td><b>{fmtD(r.date)}</b></td>
                      <td>{r.clock_in || '—'}</td>
                      <td>{r.clock_out || '—'}</td>
                      <td>
                        <Chip tone={statusTone}>
                          {(r.status || 'Present').toUpperCase()}
                        </Chip>
                      </td>
                      <td>
                        <span style={{ textTransform: 'capitalize', fontSize: 12.5 }}>
                          {r.mode || 'Office'}
                        </span>
                      </td>
                      <td>
                        {r.ot_hours > 0 && <span style={{ color: 'var(--ok, #4ADE95)' }}>+{round2(r.ot_hours)}h OT </span>}
                        {r.fine_hours > 0 && <span style={{ color: 'var(--danger, #FF5C7A)' }}>-{round2(r.fine_hours)}h Fine</span>}
                        {!r.ot_hours && !r.fine_hours && <span style={{ color: 'var(--dim)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                        {r.note || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
