'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/controllers/AuthController';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { AttendanceModel, ReportModel } from '@/models';
import { saveBlob, saveCsv } from '@/lib/download';
import { Avatar, Chip, DeductLeaveModal, Empty, GeoLink, LinkBtn, Search, Seg, Sq } from '@/views/ui';
import { Pager, usePager } from '@/views/ui/Pager';
import { ATT, attStatus, fmtD, fmtDY, isoLocal, round2, todayISO, weekOffOf } from '@/lib/format';

const hrs = n => { const m = Math.round((Number(n) || 0) * 60); return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };

export function AttendanceScreen() {
  const { me, isAdmin } = useAuth();
  const d = useData();
  const { toast } = useUi();
  const modals = useModals();
  const [date, setDate] = useState(todayISO());
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [leaveModalTarget, setLeaveModalTarget] = useState(null);
  const [statFilter, setStatFilter] = useState('all'); // 'all' | 'present' | 'wfh' | 'absent' | 'punched_in' | 'punched_out' | 'not_punched'
  const isToday = date === todayISO();

  const load = useCallback(async () => { try { setRows(await AttendanceModel.list({ date })); } catch (err) { toast(err.message); } }, [date, toast]);
  useEffect(() => { load(); }, [load, d.today]);

  const rec = useMemo(() => Object.fromEntries(rows.map(a => [a.emp, a])), [rows]);
  // Punched-in staff float to the top: currently clocked in first, then clocked out, then not punched yet
  const rank = useCallback(e => { const a = rec[e.id]; if (!a || !a.clock_in) return 2; return a.clock_out ? 1 : 0; }, [rec]);
  const lv = useCallback(e => d.leaves.find(l => l.emp === e.id && l.from_date <= date && l.to_date >= date && l.status !== 'rejected'), [d.leaves, date]);
  const onLeave = useCallback(e => { const l = lv(e); return l && l.kind !== 'wfh'; }, [lv]);
  const holidaySet = useMemo(() => new Set((d.holidays || []).map(h => String(h.date).slice(0, 10))), [d.holidays]);
  const dow = new Date(date + 'T00:00:00').getDay();
  const isPast = date < todayISO();
  const isOff = useCallback(e => weekOffOf(e, (d.settings && d.settings.weekOff) || [0]).includes(dow) || holidaySet.has(date), [d.settings, dow, holidaySet, date]);
  // A past working day with no punch, no leave and no holiday counts as absent (same rule as the month stats)
  const autoAbsent = useCallback(e => isPast && !rec[e.id] && !lv(e) && !isOff(e) && (!e.joined || String(e.joined).slice(0, 10) <= date) && (!d.settings || !d.settings.attendanceFrom || d.settings.attendanceFrom <= date), [isPast, rec, lv, isOff, date, d.settings]);

  // Active staff or staff who have attendance records on this date
  const baseStaff = useMemo(() => {
    return d.employees.filter(e => {
      const isActive = Number(e.active === undefined || e.active === null ? 1 : e.active) === 1;
      return isActive || rec[e.id];
    });
  }, [d.employees, rec]);

  // Exactly one bucket per person, so the numbers add up to the total
  const bucketOf = useCallback(e => {
    const a = rec[e.id]; const st = attStatus(a);
    if (st === 'absent') return 'absent';
    if (st === 'leave') return 'leave';
    if (st === 'present' || st === 'half') return a.mode === 'wfh' ? 'wfh' : 'present';
    if (onLeave(e)) return 'leave';
    if (isOff(e)) return 'off';
    if (autoAbsent(e)) return 'absent';
    return 'none';
  }, [rec, onLeave, isOff, autoAbsent]);

  const buckets = useMemo(() => baseStaff.reduce((acc, e) => { const b = bucketOf(e); acc[b] = (acc[b] || 0) + 1; return acc; }, {}), [baseStaff, bucketOf]);
  const punchedIn = useMemo(() => baseStaff.filter(e => rec[e.id] && rec[e.id].clock_in).length, [baseStaff, rec]);
  const punchedOut = useMemo(() => baseStaff.filter(e => rec[e.id] && rec[e.id].clock_out).length, [baseStaff, rec]);
  const notPunched = useMemo(() => baseStaff.filter(e => !rec[e.id] || !rec[e.id].clock_in).length, [baseStaff, rec]);
  const unmarked = useMemo(() => baseStaff.filter(e => !rec[e.id] && !autoAbsent(e) && !lv(e) && !isOff(e)).length, [baseStaff, rec, autoAbsent, lv, isOff]);

  const statCards = [
    { key: 'all', label: 'Total Staff', count: baseStaff.length, color: 'inherit', tone: 'gy', activeBorder: 'var(--accent, #F5C518)', activeBg: 'rgba(245, 197, 24, 0.12)' },
    { key: 'present', label: 'Present', count: buckets.present || 0, color: 'var(--ok, #4ADE95)', tone: 'gr', activeBorder: 'var(--ok, #4ADE95)', activeBg: 'rgba(74, 222, 149, 0.12)' },
    { key: 'wfh', label: 'WFH', count: buckets.wfh || 0, color: 'var(--info, #6FA8FF)', tone: 'bl', activeBorder: 'var(--info, #6FA8FF)', activeBg: 'rgba(111, 168, 255, 0.12)' },
    { key: 'absent', label: 'Absent', count: buckets.absent || 0, color: 'var(--danger, #FF5C7A)', tone: 'pk', activeBorder: 'var(--danger, #FF5C7A)', activeBg: 'rgba(255, 92, 122, 0.12)' },
    { key: 'punched_in', label: 'Punched In', count: punchedIn, color: '#38BDF8', tone: 'bl', activeBorder: '#38BDF8', activeBg: 'rgba(56, 189, 248, 0.12)' },
    { key: 'punched_out', label: 'Punched Out', count: punchedOut, color: '#A78BFA', tone: 'pu', activeBorder: '#A78BFA', activeBg: 'rgba(167, 139, 250, 0.12)' },
    { key: 'not_punched', label: 'Not Punched', count: notPunched, color: 'var(--warn, #F59E0B)', tone: 'or', activeBorder: 'var(--warn, #F59E0B)', activeBg: 'rgba(245, 158, 11, 0.12)' }
  ];
  const currentCard = statCards.find(c => c.key === statFilter) || statCards[0];

  // Filter staff list according to tab, statFilter and search query q
  const emps = useMemo(() => {
    const list = tab === 'me' ? baseStaff.filter(e => e.id === me.id) : baseStaff;
    const s = q.toLowerCase();

    return list.filter(e => {
      const a = rec[e.id];
      const b = bucketOf(e);

      if (statFilter === 'present' && b !== 'present') return false;
      if (statFilter === 'wfh' && b !== 'wfh') return false;
      if (statFilter === 'absent' && b !== 'absent') return false;
      if (statFilter === 'punched_in' && (!a || !a.clock_in)) return false;
      if (statFilter === 'punched_out' && (!a || !a.clock_out)) return false;
      if (statFilter === 'not_punched' && (a && a.clock_in)) return false;

      if (!s) return true;
      return (
        e.name.toLowerCase().includes(s) ||
        (e.emp_id || '').toLowerCase().includes(s) ||
        (e.phone || '').includes(s) ||
        (e.dept || '').toLowerCase().includes(s) ||
        (e.role || '').toLowerCase().includes(s)
      );
    }).sort((x, y) => rank(x) - rank(y) || String((rec[x.id] || {}).clock_in || '').localeCompare(String((rec[y.id] || {}).clock_in || '')) || x.name.localeCompare(y.name));
  }, [baseStaff, tab, me.id, q, statFilter, rec, bucketOf, rank]);

  const pager = usePager(emps, 10);
  const groups = {}; pager.items.forEach(e => { (groups[e.dept || 'Other'] = groups[e.dept || 'Other'] || []).push(e); });

  const shift = n => { const dd = new Date(date + 'T00:00:00'); dd.setDate(dd.getDate() + n); const iso = isoLocal(dd); if (iso <= todayISO()) setDate(iso); };

  // Marking goes through POST /attendance/mark (admin/manager): creates or updates the day's record.
  const send = async body => {
    if (!isAdmin) { toast('Only admins can mark attendance. Staff clock in from the dashboard.'); return; }
    try { await AttendanceModel.mark({ date, ...body }); await Promise.all([load(), d.reload('today', 'employees')]); } catch (err) { toast(err.message); }
  };
  const mark = (e, status) => {
    const a = rec[e.id];
    if (status === 'leave') {
      if (!isAdmin) { toast('Only admins can mark attendance. Staff clock in from the dashboard.'); return; }
      setLeaveModalTarget({
        employee: e,
        currentLeaveType: (a && a.leave_type) || '',
        isAlreadyLeave: attStatus(a) === 'leave'
      });
      return;
    }
    send({ emp: e.id, status: attStatus(a) === status ? '' : status });
  };
  const hoursPrompt = (e, kind) => {
    const a = rec[e.id] || {};
    const v = window.prompt((kind === 'ot_hours' ? 'Overtime' : 'Fine') + ' hours for ' + e.name + ' on ' + fmtD(date) + ':', round2(a[kind] || 1));
    if (v === null) return;
    send({ emp: e.id, status: attStatus(a) || 'present', [kind]: round2(Math.max(0, parseFloat(v) || 0)) });
  };
  const notePrompt = e => {
    const a = rec[e.id] || {};
    const v = window.prompt('Note for ' + e.name + ':', a.note || ''); if (v === null) return;
    send({ emp: e.id, status: attStatus(a), note: v.trim() });
  };
  const exportDay = () => saveCsv('attendance-' + date + '.csv', [['Employee', 'Emp ID', 'Date', 'Status', 'Clock In', 'Clock Out', 'Sessions', 'OT hours', 'Fine hours', 'Note', 'In location', 'Out location']].concat(d.employees.map(e => { const a = rec[e.id] || {}; const sCount = (a.sessions && a.sessions.length ? a.sessions.length + (a.clock_in ? 1 : 0) : (a.clock_in ? 1 : 0)); return [e.name, e.emp_id || '', date, attStatus(a) || 'not marked', a.clock_in || '', a.clock_out || '', sCount || 0, round2(a.ot_hours || 0), round2(a.fine_hours || 0), a.note || '', a.in_addr || (a.in_lat ? a.in_lat + ',' + a.in_lng : ''), a.out_addr || (a.out_lat ? a.out_lat + ',' + a.out_lng : '')]; })));
  const viewSelfie = async (id, which) => {
    if (!isAdmin) return;
    try { const blob = await AttendanceModel.selfie(id, which); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (err) { toast(err.message); }
  };
  const exportRegister = async () => { try { saveBlob(await ReportModel.download('attendance-register', { month: date.slice(0, 7) }), 'attendance-register-' + date.slice(0, 7) + '.csv'); } catch (err) { toast(err.message); } };

  const stLabel = (a, l, e) => {
    const st = attStatus(a);
    if (st) {
      const sess = Array.isArray(a.sessions) ? a.sessions : [];
      const sessTooltip = sess.map((s, i) => `S${i + 1}: ${s.clock_in} - ${s.clock_out} (${Math.floor((s.mins || 0) / 60)}h ${(s.mins || 0) % 60}m)`).join('\n');
      return (
        <span className="st" style={{ color: { present: 'var(--ok)', half: 'var(--warn)', absent: 'var(--danger)', leave: 'var(--info)' }[st] }}>
          {st === 'leave' ? (a.leave_type === 'Weekly Off' ? 'Weekly Off' : (a.leave_type ? `Leave (${a.leave_type})` : 'Leave')) : ATT[st][1]}
          {a.clock_in ? <> · in {a.clock_in} <GeoLink lat={a.in_lat} lng={a.in_lng} addr={a.in_addr || 'map'} />{isAdmin && a.in_selfie ? <button type="button" className="selfie-btn" onClick={() => viewSelfie(a.id, 'in')} title="View clock-in selfie">📷</button> : null}</> : null}
          {a.clock_out ? <> · out {a.clock_out}{Number(a.out_next_day) ? <sup title="next day">+1</sup> : null} <GeoLink lat={a.out_lat} lng={a.out_lng} addr={a.out_addr || 'map'} />{isAdmin && a.out_selfie ? <button type="button" className="selfie-btn" onClick={() => viewSelfie(a.id, 'out')} title="View clock-out selfie">📷</button> : null}</> : null}
          {sess.length > 0 && !a.clock_out ? <Chip tone="or" style={{ marginLeft: 6 }} title={sessTooltip}>Re-checked in (S{sess.length + 1})</Chip> : null}
          {sess.length > 0 && a.clock_out ? <Chip tone="pu" style={{ marginLeft: 6 }} title={sessTooltip}>{sess.length + 1} sessions</Chip> : null}
          {a.mode && a.mode !== 'office' ? <Chip tone={a.mode === 'wfh' ? 'gr' : 'bl'} style={{ marginLeft: 6 }}>{a.mode === 'wfh' ? 'WFH' : 'Field'}</Chip> : null}
          {Number(a.late) && !(sess.length > 0) ? <Chip tone="or" style={{ marginLeft: 6 }}>Late</Chip> : null}
          {Number(a.ot_hours) ? ' · OT ' + round2(a.ot_hours) + 'h' : ''}
          {Number(a.fine_hours) ? ' · Fine ' + round2(a.fine_hours) + 'h' : ''}
        </span>
      );
    }
    if (l) return <span className="st" style={{ color: l.status === 'pending' ? 'var(--warn)' : l.kind === 'wfh' ? 'var(--ok)' : 'var(--info)' }}>{l.kind === 'wfh' ? 'Work from home' : 'On leave'}{l.status === 'pending' ? ' (pending approval)' : ''} ({l.reason || ''}){l.remarks ? ' · ' + l.remarks : ''}</span>;
    if (isOff(e)) return <span className="st" style={{ color: 'var(--muted)' }}>{holidaySet.has(date) ? 'Holiday' : 'Weekly off'}</span>;
    if (autoAbsent(e)) return <span className="st" style={{ color: 'var(--danger)' }}>Absent · no punch</span>;
    return <span className="st" style={{ color: isPast ? 'var(--muted)' : 'var(--warn)' }}>{isPast ? 'Not marked' : 'Not clocked in yet'}</span>;
  };

  return (
    <>
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Link href="/dashboard" className="back" aria-label="Back">‹</Link><div><h1>Attendance Summary</h1><p>Mark and review attendance by day</p></div></div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}><LinkBtn onClick={exportDay}>Daily Report ⤓</LinkBtn><LinkBtn onClick={exportRegister}>Month register ⤓</LinkBtn><LinkBtn href="/payroll">Payroll →</LinkBtn></div>
      </div>
      <div className="content">
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Sq onClick={() => shift(-1)}>‹</Sq><input type="date" value={date} max={todayISO()} onChange={e => { if (e.target.value && e.target.value <= todayISO()) setDate(e.target.value); }} style={{ height: 38, width: 160, fontSize: 13, borderRadius: 100 }} /><Sq onClick={() => shift(1)} style={{ opacity: isToday ? 0.4 : 1 }}>›</Sq>{!isToday && <LinkBtn onClick={() => setDate(todayISO())}>Today</LinkBtn>}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Seg items={[['all', 'All staff'], ['me', 'Me']]} value={tab} onChange={setTab} />
              <Chip
                tone={unmarked <= 0 ? 'gr' : 'or'}
                style={{ cursor: 'default', userSelect: 'none', pointerEvents: 'none' }}
              >
                {unmarked <= 0 ? '✓ All marked' : unmarked + ' unmarked'}
              </Chip>
            </div>
          </div>
          <div className="sum" style={{ borderTop: '1px solid var(--line)' }}>
            <div onClick={() => setStatFilter('all')} style={{ cursor: 'pointer', opacity: statFilter === 'all' ? 1 : 0.45, transition: 'opacity 0.15s' }}>
              <span>Total Staff</span><b>{baseStaff.length}</b>
            </div>
            <div onClick={() => setStatFilter(prev => prev === 'present' ? 'all' : 'present')} style={{ cursor: 'pointer', opacity: statFilter === 'all' || statFilter === 'present' ? 1 : 0.45, transition: 'opacity 0.15s' }}>
              <span>Present</span><b style={{ color: 'var(--ok)' }}>{buckets.present || 0}</b>
            </div>
            <div onClick={() => setStatFilter(prev => prev === 'wfh' ? 'all' : 'wfh')} style={{ cursor: 'pointer', opacity: statFilter === 'all' || statFilter === 'wfh' ? 1 : 0.45, transition: 'opacity 0.15s' }}>
              <span>WFH</span><b style={{ color: 'var(--info)' }}>{buckets.wfh || 0}</b>
            </div>
            <div onClick={() => setStatFilter(prev => prev === 'absent' ? 'all' : 'absent')} style={{ cursor: 'pointer', opacity: statFilter === 'all' || statFilter === 'absent' ? 1 : 0.45, transition: 'opacity 0.15s' }}>
              <span>Absent</span><b style={{ color: 'var(--danger)' }}>{buckets.absent || 0}</b>
            </div>
            <div onClick={() => setStatFilter(prev => prev === 'punched_in' ? 'all' : 'punched_in')} style={{ cursor: 'pointer', opacity: statFilter === 'all' || statFilter === 'punched_in' ? 1 : 0.45, transition: 'opacity 0.15s' }}>
              <span>Punched In</span><b>{punchedIn}</b>
            </div>
            <div onClick={() => setStatFilter(prev => prev === 'punched_out' ? 'all' : 'punched_out')} style={{ cursor: 'pointer', opacity: statFilter === 'all' || statFilter === 'punched_out' ? 1 : 0.45, transition: 'opacity 0.15s' }}>
              <span>Punched Out</span><b>{punchedOut}</b>
            </div>
            <div onClick={() => setStatFilter(prev => prev === 'not_punched' ? 'all' : 'not_punched')} style={{ cursor: 'pointer', opacity: statFilter === 'all' || statFilter === 'not_punched' ? 1 : 0.45, transition: 'opacity 0.15s' }}>
              <span>Not Punched</span><b style={{ color: 'var(--warn, #F59E0B)' }}>{notPunched}</b>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="date-btn" onClick={() => modals.open('leave')}>☂ Leave / WFH</button>
          <button className="date-btn" onClick={() => modals.open('payment', null, { type: 'Fine' })}>₹ Fine</button>
          <Search value={q} onChange={setQ} placeholder="Search staff by name, phone or ID" style={{ flex: 1, minWidth: 220, maxWidth: 380 }} />
        </div>
        {Object.keys(groups).sort((x, y) => Math.min(...groups[x].map(rank)) - Math.min(...groups[y].map(rank)) || x.localeCompare(y)).map(g => (
          <div key={g}>
            <div className="group-h">{g} <span className="n">{groups[g].length}</span></div>
            <div className="panel">
              {groups[g].map(e => { const a = rec[e.id], l = lv(e), st = attStatus(a); return (
                <div className="att-line" key={e.id}>
                  <div className="who"><Avatar e={e} cls="" /><div><b>{e.name}</b> <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>{e.emp_id || ''}</span><small>{stLabel(a, l, e)}</small><div className="links"><LinkBtn onClick={() => notePrompt(e)}>{a && a.note ? 'Note: ' + a.note : 'Add Note'}</LinkBtn><span style={{ color: 'var(--muted)' }}>–</span><LinkBtn onClick={() => modals.open('attendance', null, { row: a, after: load })}>{a ? 'Edit' : 'Logs'}</LinkBtn></div></div></div>
                  <div className="att-mark">
                    {Object.entries(ATT).map(([k, [c, l2, cls]]) => {
                      const isWeeklyOff = k === 'leave' && st === 'leave' && a && a.leave_type === 'Weekly Off';
                      return (
                        <button key={k} className={st === k ? 'on ' + cls : ''} onClick={() => mark(e, k)}>
                          <b>{isWeeklyOff ? 'WO' : c}</b>
                          {isWeeklyOff ? 'Weekly Off' : l2}
                        </button>
                      );
                    })}
                    <button className={a && Number(a.fine_hours) ? 'on pk' : ''} onClick={() => hoursPrompt(e, 'fine_hours')}><b>F</b>Fine{a && Number(a.fine_hours) ? ' ' + round2(a.fine_hours) + 'h' : ''}</button>
                    <button className={a && Number(a.ot_hours) ? 'on gr' : ''} onClick={() => hoursPrompt(e, 'ot_hours')}><b>OT</b>Overtime{a && Number(a.ot_hours) ? ' ' + round2(a.ot_hours) + 'h' : ''}</button>
                  </div>
                </div>
              ); })}
            </div>
          </div>
        ))}
        {!emps.length && (
          <div className="panel">
            <Empty>
              No staff match {statFilter !== 'all' ? `the "${currentCard.label}" filter` : ''}{q ? ` for "${q}"` : ''}.
              {statFilter !== 'all' && (
                <div style={{ marginTop: 8 }}>
                  <LinkBtn onClick={() => setStatFilter('all')}>Show all staff</LinkBtn>
                </div>
              )}
            </Empty>
          </div>
        )}
        <div className="panel"><Pager pager={pager} /></div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Showing {fmtDY(date)}. Staff clock in themselves with GPS; admins can adjust status, overtime, fines and notes here.</p>
      </div>
      <DeductLeaveModal
        isOpen={!!leaveModalTarget}
        employee={leaveModalTarget ? leaveModalTarget.employee : null}
        currentLeaveType={leaveModalTarget ? leaveModalTarget.currentLeaveType : ''}
        isAlreadyLeave={leaveModalTarget ? leaveModalTarget.isAlreadyLeave : false}
        onClose={() => setLeaveModalTarget(null)}
        onSave={async selectedType => {
          if (leaveModalTarget) {
            await send({ emp: leaveModalTarget.employee.id, status: 'leave', leave_type: selectedType });
            toast(selectedType === 'Weekly Off' ? `Marked ${leaveModalTarget.employee.name} as Weekly Off.` : `Marked ${leaveModalTarget.employee.name} as Leave (${selectedType}).`);
          }
        }}
        onClear={async () => {
          if (leaveModalTarget) {
            await send({ emp: leaveModalTarget.employee.id, status: '', leave_type: '' });
            toast(`Cleared leave for ${leaveModalTarget.employee.name}.`);
          }
        }}
      />
    </>
  );
}
