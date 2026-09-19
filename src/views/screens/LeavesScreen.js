'use client';
// Leaves & WFH: admins approve / reject every request here; everyone else sees their own.
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/controllers/AuthController';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { LeaveModel } from '@/models';
import { Avatar, Chip, Empty, Pills, SectionTitle } from '@/views/ui';
import { fmtD, fmtDY, leaveBalance, weekOffOf } from '@/lib/format';

const daysBetween = (a, b) => { const s = new Date(a + 'T00:00:00'), e = new Date(b + 'T00:00:00'); let n = 0; for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n++; return n; };
const TONE = { pending: 'or', approved: 'gr', rejected: 'pk' };

export function LeavesScreen() {
  const d = useData();
  const { me, isAdmin } = useAuth();
  const { toast, confirm } = useUi();
  const modals = useModals();
  const [tab, setTab] = useState('pending');
  const [busy, setBusy] = useState('');
  const [hl, setHl] = useState('');
  // Opened from a notification (/leaves?leave=ID): jump to that request
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('leave');
    if (!id) return;
    setHl(id);
    const l = d.leaves.find(x => x.id === id);
    if (l) setTab(l.status && l.status !== 'approved' ? (l.status === 'rejected' ? 'rejected' : 'pending') : 'approved');
    setTimeout(() => { const el = document.querySelector('[data-leave="' + id + '"]'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 400);
  }, [d.leaves]);

  const mine = useMemo(() => (isAdmin ? d.leaves : d.leaves.filter(l => l.emp === me.id)), [d.leaves, isAdmin, me.id]);
  const withStatus = l => ({ ...l, status: l.status || 'approved' });
  const all = useMemo(() => mine.map(withStatus).sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || String(b.from_date).localeCompare(String(a.from_date))), [mine]);
  const counts = { pending: all.filter(l => l.status === 'pending').length, approved: all.filter(l => l.status === 'approved').length, rejected: all.filter(l => l.status === 'rejected').length, all: all.length };
  const list = tab === 'all' ? all : all.filter(l => l.status === tab);
  const quota = d.settings && d.settings.leavesPerYear !== undefined ? Number(d.settings.leavesPerYear) : 12;
  const weekOff = (d.settings && d.settings.weekOff) || [0];
  const myBal = leaveBalance(d.leaves, me.id, quota, weekOffOf(d.empById[me.id], weekOff));
  const balances = useMemo(() => (isAdmin ? d.employees.map(e => ({ e, b: leaveBalance(d.leaves, e.id, quota, weekOffOf(e, weekOff)) })).sort((x, y) => y.b.used - x.b.used || x.e.name.localeCompare(y.e.name)) : []), [isAdmin, d.employees, d.leaves, quota, weekOff]);

  const act = async (l, fn, msg) => { setBusy(l.id); try { await fn(); toast(msg); await d.reload('leaves', 'activity', 'employees', 'myStats', 'teamSummary'); } catch (err) { toast(err.message); } finally { setBusy(''); } };
  const approve = l => act(l, () => LeaveModel.decide(l.id, 'approved'), 'Approved.');
  const reject = l => { const note = window.prompt('Reason for rejecting (optional):', ''); if (note === null) return; act(l, () => LeaveModel.decide(l.id, 'rejected', note), 'Rejected.'); };
  const remove = async l => {
    const isWithdraw = l.status === 'pending' && l.emp === me.id;
    const ok = await confirm({
      title: isWithdraw ? 'Withdraw Request' : 'Delete Request',
      message: (isWithdraw ? 'Withdraw' : 'Delete') + ' this request?',
      sub: 'This action cannot be undone.',
      okText: isWithdraw ? 'Withdraw' : 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    act(l, () => LeaveModel.remove(l.id), 'Removed.');
  };

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SectionTitle>Leaves &amp; work from home {counts.pending > 0 && <Chip tone="or">{counts.pending} pending</Chip>}</SectionTitle>
        <button className="tb-btn solid" style={{ height: 34 }} onClick={() => modals.open('leave')}>+ Apply</button>
      </div>
      <div className="panel lv-bal"><div><b>Your leave balance {myBal.year}</b><small>Paid leave quota {quota} days a year · WFH does not count</small></div><div className="lv-nums"><span><b>{myBal.left}</b>left</span><span><b>{myBal.used}</b>used</span><span><b>{myBal.pending}</b>pending</span></div></div>
      <Pills items={[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].concat(isAdmin ? [['balances', 'Balances']] : [])} value={tab} onChange={setTab} counts={counts} />
      {tab === 'balances' && isAdmin && (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table><thead><tr><th>Staff</th><th>Department</th><th>Used</th><th>Pending</th><th>Left</th><th>Quota</th></tr></thead>
            <tbody>{balances.map(({ e, b }) => <tr key={e.id}><td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar e={e} /><b>{e.name}</b></div></td><td>{e.dept || '—'}</td><td>{b.used}</td><td>{b.pending || '—'}</td><td><Chip tone={b.left === 0 ? 'pk' : b.left <= 2 ? 'or' : 'gr'}>{b.left}</Chip></td><td>{b.quota}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {tab !== 'balances' && <div className="panel">
        {list.map(l => { const e = d.empById[l.emp]; const canDecide = isAdmin && l.status === 'pending'; const canRemove = isAdmin || (l.emp === me.id && l.status === 'pending'); return (
          <div className="row" key={l.id} data-leave={l.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)', alignItems: 'center', gap: 12, opacity: busy === l.id ? 0.6 : 1, flexWrap: 'wrap', outline: hl === l.id ? '2px solid var(--accent)' : 'none', borderRadius: hl === l.id ? 12 : 0 }}>
            <Avatar e={e} name={e ? e.name : '—'} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600 }}>{e ? e.name : '—'} <Chip tone={l.kind === 'wfh' ? 'gr' : 'bl'} style={{ marginLeft: 6 }}>{l.kind === 'wfh' ? 'Work from home' : 'Leave'}</Chip></div>
              <small style={{ color: 'var(--muted)', display: 'block' }}>{l.from_date === l.to_date ? fmtDY(l.from_date) : fmtD(l.from_date) + ' – ' + fmtDY(l.to_date)} · {daysBetween(l.from_date, l.to_date)} day{daysBetween(l.from_date, l.to_date) === 1 ? '' : 's'}{l.reason ? ' · ' + l.reason : ''}{l.remarks ? ' · ' + l.remarks : ''}</small>
            </div>
            <Chip tone={TONE[l.status] || 'gy'}>{l.status}</Chip>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              {canDecide && <button className="pill on" style={{ height: 30 }} disabled={busy === l.id} onClick={() => approve(l)}>✓ Approve</button>}
              {canDecide && <button className="pill" style={{ height: 30, color: 'var(--danger)' }} disabled={busy === l.id} onClick={() => reject(l)}>✕ Reject</button>}
              {canRemove && <button className="mini-btn" title={l.status === 'pending' && l.emp === me.id && !isAdmin ? 'Withdraw' : 'Delete'} disabled={busy === l.id} onClick={() => remove(l)}>✕</button>}
            </span>
          </div>); })}
        {!list.length && <Empty ring icon="leaf" title={tab === 'pending' ? 'Nothing pending' : 'No requests'}>{isAdmin ? 'Requests from staff appear here for approval.' : 'Apply for leave or work from home with the button above.'}</Empty>}
      </div>}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Approved leave counts as paid days in payroll. Work-from-home days are normal working days; the clock-in is marked WFH automatically.</p>
    </div>
  );
}
