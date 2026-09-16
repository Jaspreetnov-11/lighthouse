'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/controllers/AuthController';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { AttendanceModel, EmployeeModel, PaymentModel } from '@/models';
import { saveCsv } from '@/lib/download';
import { Avatar, Chip, DateBtn, Donut, Empty, Icon, Legend, LinkBtn, Panel, Search, Sq, Stat, TaskChip, Tabs } from '@/views/ui';
import { Pager, usePager } from '@/views/ui/Pager';
import { ImportStaff } from '@/views/screens/ImportStaff';
import { assigneeIds, avFor, fmtD, fmtDY, hm, ini, inr, overdue, shiftDisplay, STATUSES, STATUS_COLOR, STATUS_LABEL, thisMonth } from '@/lib/format';
import {
  StaffSalaryStructure,
  StaffSalaryOverview,
  StaffAttendanceTab,
  StaffLoansTab,
  StaffLeavesTab
} from '@/views/screens/staff';

export function StaffListScreen() {
  const d = useData();
  const { isAdmin } = useAuth();
  const modals = useModals();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [importing, setImporting] = useState(false);

  const activeCount = useMemo(() => d.employees.filter(e => Number(e.active === undefined || e.active === null ? 1 : e.active) === 1).length, [d.employees]);
  const inactiveCount = useMemo(() => d.employees.filter(e => Number(e.active === undefined || e.active === null ? 1 : e.active) === 0).length, [d.employees]);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return d.employees.filter(e => {
      const active = Number(e.active === undefined || e.active === null ? 1 : e.active) === 1;
      if (statusFilter === 'active' && !active) return false;
      if (statusFilter === 'inactive' && active) return false;
      return (
        e.name.toLowerCase().includes(s) ||
        (e.emp_id || '').toLowerCase().includes(s) ||
        (e.phone || '').includes(s) ||
        (e.role || '').toLowerCase().includes(s) ||
        (e.dept || '').toLowerCase().includes(s) ||
        (e.email || '').toLowerCase().includes(s)
      );
    });
  }, [d.employees, q, statusFilter]);

  const pager = usePager(list, 20);
  const groups = useMemo(() => { const g = {}; pager.items.forEach(e => { (g[e.dept || 'Other'] = g[e.dept || 'Other'] || []).push(e); }); return g; }, [pager.items]);
  const totalPending = d.employees.reduce((a, e) => a + (Number(e.pendingBal) || 0), 0);
  const exportStaff = () => saveCsv('staff.csv', [['Name', 'Emp ID', 'Status', 'Role', 'Department', 'Email', 'Phone', 'Joined', 'Salary', 'Pending']].concat(d.employees.map(e => [e.name, e.emp_id, Number(e.active === undefined || e.active === null ? 1 : e.active) === 1 ? 'Active' : 'Inactive', e.role, e.dept, e.email, e.phone || '', e.joined, e.salary || 0, Math.round(e.pendingBal || 0)])));

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 className="sec-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          Staff List
          <Chip tone="gy">{d.employees.length} Total</Chip>
          <Chip tone="gr">{activeCount} Active</Chip>
          {inactiveCount > 0 && <Chip tone="pk">{inactiveCount} Inactive</Chip>}
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && <DateBtn icon="down" onClick={exportStaff}>Export</DateBtn>}
          {isAdmin && <DateBtn icon="file" onClick={() => setImporting(true)}>Import from Excel</DateBtn>}
          {isAdmin && <button className="tb-btn solid" style={{ height: 34 }} onClick={() => modals.open('employee')}>+ Add Staff</button>}
        </div>
        {importing && <ImportStaff onClose={() => setImporting(false)} />}
      </div>
      {isAdmin && <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', gap: 16, flexWrap: 'wrap' }}>
        <div><div style={{ fontWeight: 600, fontSize: 15 }}>Payroll balance</div><div className={'money ' + (totalPending > 0 ? 'neg' : 'pos')} style={{ fontSize: 22, marginTop: 6 }}>{totalPending > 0 ? '- ' : ''}{inr(Math.abs(totalPending))}</div><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Total Pending · {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div></div>
        <div style={{ display: 'flex', gap: 8 }}><Link href="/payroll" className="date-btn">Run payroll</Link><DateBtn icon={null} onClick={() => modals.open('payment')}>+ Add payment</DateBtn></div>
      </div>}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <Search value={q} onChange={setQ} placeholder="Search staff by name, ID, role or phone" style={{ flex: 1, minWidth: 240, maxWidth: 360 }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 2 }}>Filter:</span>
            <button
              type="button"
              className={'date-btn' + (statusFilter === 'all' ? ' active' : '')}
              style={statusFilter === 'all' ? { background: 'var(--accent)', color: '#000', fontWeight: 600 } : {}}
              onClick={() => setStatusFilter('all')}
            >
              All ({d.employees.length})
            </button>
            <button
              type="button"
              className={'date-btn' + (statusFilter === 'active' ? ' active' : '')}
              style={statusFilter === 'active' ? { background: 'var(--accent)', color: '#000', fontWeight: 600 } : {}}
              onClick={() => setStatusFilter('active')}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              className={'date-btn' + (statusFilter === 'inactive' ? ' active' : '')}
              style={statusFilter === 'inactive' ? { background: 'var(--danger)', color: '#fff', fontWeight: 600 } : {}}
              onClick={() => setStatusFilter('inactive')}
            >
              Inactive ({inactiveCount})
            </button>
          </div>
        </div>
        {Object.keys(groups).sort().map(g => (
          <div key={g}>
            <div className="group-h" style={{ padding: '14px 16px 6px' }}>{g} <span className="n">{groups[g].length}</span></div>
            {groups[g].map(e => {
              const pb = Number(e.pendingBal) || 0;
              const active = Number(e.active === undefined || e.active === null ? 1 : e.active) === 1;
              return (
                <div className="staff-row" key={e.id} style={!active ? { opacity: 0.65 } : {}}>
                  <Avatar e={e} cls="" />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Link href={'/staff/' + e.id} className="nm" style={{ textDecoration: 'none', color: 'inherit' }}>{e.name}</Link>
                      <Chip tone={active ? 'gr' : 'pk'} style={{ fontSize: 10.5, height: 18, padding: '0 6px' }}>
                        {active ? 'Active' : 'Inactive'}
                      </Chip>
                    </div>
                    <small style={{ display: 'block', color: 'var(--muted)' }}>{e.role || ''}{e.phone ? ' · ' + e.phone : ''}</small>
                  </div>
                  <span className="id">{e.emp_id || ''}</span>
                  <span className="st" style={{ color: 'var(--muted)' }}>{isAdmin ? (pb > 0 ? 'Pending' : pb < 0 ? 'Advance' : 'Settled') : ('Shift · ' + shiftDisplay(e.shift, d.settings))}</span>
                  <span className={'money ' + (pb > 0 ? 'neg' : pb < 0 ? 'pos' : '')}>{isAdmin ? (pb > 0 ? '- ' : '') + inr(Math.abs(pb)) : ''}</span>
                  {isAdmin ? (
                    active ? (
                      <DateBtn icon={null} onClick={() => modals.open('payment', null, { emp: e.id })}>Add Payment</DateBtn>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic' }}>Exited</span>
                    )
                  ) : <span />}
                </div>
              );
            })}
          </div>
        ))}
        {!list.length && <Empty>No staff match</Empty>}
        <Pager pager={pager} />
      </div>
    </div>
  );
}

export function StaffProfileScreen({ id }) {
  const d = useData();
  const { me, isAdmin, isHR, canManageStaff } = useAuth();
  const canViewPayrollTabs = isAdmin || isHR || canManageStaff;
  const { toast, confirm } = useUi();
  const modals = useModals();
  const router = useRouter();
  const [detail, setDetail] = useState(null);
  const [stats, setStats] = useState(null);
  const [pays, setPays] = useState([]);
  const [tab, setTab] = useState('all');
  const [subTab, setSubTab] = useState('profile');
  const e = d.employees.find(x => x.id === id);

  const sidePager = usePager(d.employees, 30);
  const myTasksAll = useMemo(() => (detail && detail.tasks) || d.tasks.filter(t => assigneeIds(t).includes(id)), [detail, d.tasks, id]);
  const taskPager = usePager(myTasksAll, 10);

  useEffect(() => {
    let alive = true;
    Promise.all([EmployeeModel.get(id), AttendanceModel.stats(id, thisMonth()), PaymentModel.list({ empId: id, month: '' })]).then(([det, st, pr]) => { if (alive) { setDetail(det); setStats(st); setPays(pr.data || []); } }).catch(err => toast(err.message));
    return () => { alive = false; };
  }, [id, d.employees, toast]);

  if (!e) return <div className="content"><Empty>Staff member not found. <LinkBtn href="/staff">Back to list</LinkBtn></Empty></div>;

  const isActive = Number(e.active === undefined || e.active === null ? 1 : e.active) === 1;
  const myTasks = myTasksAll;
  const pr = (detail && detail.payroll) || { earned: e.earned, paid: e.paid, pending: e.pendingBal };
  const pb = Number(pr.pending) || 0;
  const st = stats || { present: 0, half: 0, absent: 0, leave: 0, unaccounted: 0, workdaysSoFar: 0, avgWorkingMinutes: 0 };
  const projIds = [...new Set(myTasks.filter(t => t.project).map(t => t.project))];
  const projs = projIds.map(pid => d.projById[pid]).filter(Boolean).filter(p => tab === 'all' || (tab === 'bill' ? p.billable : !p.billable));
  const tstat = STATUSES.map(k => [STATUS_COLOR[k], myTasks.filter(t => t.status === k).length]);
  const topP = Object.entries(myTasks.filter(t => t.project).reduce((m, t) => { m[t.project] = (m[t.project] || 0) + (Number(t.mins) || 0); return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const remove = async () => {
    if (id === me.id) { toast('You cannot exit or remove yourself.'); return; }
    const ok = await confirm({
      title: 'Exit Employee (Soft Delete)',
      message: `Are you sure you want to mark ${e.name} (${e.emp_id || 'Staff'}) as Inactive / Exited?`,
      sub: 'All historical attendance, payroll, payments, and task records will remain safely preserved in the database. Their login will be deactivated and active tasks unassigned.',
      okText: 'Confirm Exit',
      cancelText: 'Keep Active',
      danger: true
    });
    if (!ok) return;
    try {
      await EmployeeModel.remove(id);
      toast(`${e.name} has been marked as Inactive (Exited).`);
      await d.reload('employees', 'tasks', 'activity');
      router.replace('/staff');
    } catch (err) {
      toast(err.message);
    }
  };

  const reactivate = async () => {
    const ok = await confirm({
      title: 'Reactivate Employee',
      message: `Do you want to reactivate ${e.name} (${e.emp_id || 'Staff'})?`,
      sub: 'Their status will be restored to Active and login access will be re-enabled.',
      okText: 'Reactivate',
      cancelText: 'Cancel',
      danger: false
    });
    if (!ok) return;
    try {
      await EmployeeModel.update(id, { active: 1 });
      toast(`${e.name} has been reactivated successfully.`);
      await d.reload('employees', 'activity');
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <div className="two">
      <aside>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Link href="/staff" className="date-btn">‹ Staff list</Link>{isAdmin && <button className="tb-btn solid" style={{ height: 34, padding: '0 12px', fontSize: 12.5 }} onClick={() => modals.open('employee')}>+ Add</button>}</div>
        <div className="list">
          {sidePager.items.map(x => {
            const b = Number(x.pendingBal) || 0;
            const itemActive = Number(x.active === undefined || x.active === null ? 1 : x.active) === 1;
            return (
              <Link
                key={x.id}
                href={'/staff/' + x.id}
                className={'emp-item' + (x.id === id ? ' on' : '')}
                style={{ textDecoration: 'none', color: 'inherit', opacity: itemActive ? 1 : 0.6 }}
              >
                <Avatar e={x} cls="" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="nm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                    {!itemActive && <span style={{ fontSize: 9.5, color: 'var(--danger)', background: 'rgba(255,92,122,0.15)', borderRadius: 4, padding: '1px 4px', lineHeight: 1.2 }}>Exited</span>}
                  </div>
                  <small>{x.role || ''}</small>
                </div>
                <span className={'hrs money' + (b > 0 ? ' neg' : '')}>{inr(b)}</span>
              </Link>
            );
          })}
        </div>
        <Pager pager={sidePager} compact />
      </aside>
      <div className="content">
        <div className="panel profile"><Avatar e={e} cls="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h2 style={{ margin: 0 }}>{e.name}</h2>
              <Chip tone={isActive ? 'gr' : 'pk'}>
                {isActive ? 'Active' : 'Inactive (Exited)'}
              </Chip>
            </div>
            <div className="m">
              <span>{e.email || ''}</span>
              <span className="sep">|</span>
              <span><b>Status:</b> <span style={{ color: isActive ? 'var(--success, #4ADE95)' : 'var(--danger, #FF5C7A)', fontWeight: 600 }}>{isActive ? 'Active' : 'Inactive / Exited'}</span></span>
              <span className="sep">|</span>
              <span><b>Designation:</b> {e.role || '—'}</span>
              <span className="sep">|</span>
              <span><b>Emp ID:</b> {e.emp_id || '—'}</span>
              <span className="sep">|</span>
              <span><b>Phone:</b> {e.phone || '—'}</span>
            </div>
            <div className="m">
              <span><b>Department:</b> {e.dept || '—'}</span><span className="sep">|</span>
              <span><b>Joined:</b> {fmtDY(e.joined)}</span><span className="sep">|</span>
              <span><b>Shift:</b> {e.shift === 'evening' ? '2 pm – 10 pm' : '11 am – 7 pm'}</span>
              {canViewPayrollTabs && <><span className="sep">|</span><span><b>Salary:</b> {inr(e.salary)} / month</span></>}<span className="sep">|</span>
              <span><b>Managers:</b></span>
              {(Array.isArray(e.managers) ? e.managers : []).map(m => <span className="mgr" key={m}><span className={'avatar sm ' + avFor(m)}>{ini(m)}</span>{m}</span>)}
              {!(Array.isArray(e.managers) && e.managers.length) && <span>—</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {canViewPayrollTabs && <DateBtn icon={null} onClick={() => modals.open('payment', null, { emp: e.id })}>+ Payment</DateBtn>}
            {d.canAssign && isActive && <DateBtn icon={null} onClick={() => modals.open('task', null, { assignee: e.id, dept: e.dept })}>+ Task</DateBtn>}
            {(isAdmin || me.id === e.id) && <Sq icon="file" label="Edit" onClick={() => modals.open('employee', e.id)} />}
            {isAdmin && (
              isActive ? (
                <Sq label="Exit Staff" onClick={remove} style={{ color: 'var(--danger)' }}>✕</Sq>
              ) : (
                <button
                  type="button"
                  className="tb-btn"
                  style={{ height: 32, padding: '0 12px', fontSize: 12, color: 'var(--success, #4ADE95)', borderColor: 'rgba(74,222,149,0.3)', background: 'rgba(74,222,149,0.1)' }}
                  onClick={reactivate}
                >
                  ↻ Reactivate Staff
                </button>
              )
            )}
          </div>
        </div>

        {/* Staff Profile Sub-Navigation Tabs */}
        {(() => {
          const availableTabs = [
            ['profile', 'Profile'],
            ['attendance', 'Attendance'],
            ...(canViewPayrollTabs ? [
              ['salary_overview', 'Salary Overview'],
              ['salary_structure', 'Salary Structure'],
              ['loans', 'Loans']
            ] : []),
            ['leaves', 'Leave(s)']
          ];
          const activeSubTab = availableTabs.some(([k]) => k === subTab) ? subTab : 'profile';

          return (
            <div className="tabs" style={{ margin: '14px 0 20px', overflowX: 'auto', borderBottom: '1px solid var(--line-soft)', paddingBottom: 0 }}>
              {availableTabs.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={activeSubTab === k ? 'on' : ''}
                  onClick={() => setSubTab(k)}
                  style={{ whiteSpace: 'nowrap', padding: '10px 16px', fontSize: 13.5 }}
                >
                  {label}
                </button>
              ))}
            </div>
          );
        })()}

        {subTab === 'profile' && (
          <>
            <div className="emp-stats">
              <Stat icon="file" tone="gr" value={(pb > 0 ? '- ' : '') + inr(Math.abs(pb))} valueClass={'money' + (pb > 0 ? ' neg' : '')} label={pb > 0 ? 'Pending this month' : pb < 0 ? 'Advance given' : 'Settled'} />
              <Stat icon="clock" tone="tl" value={hm(st.avgWorkingMinutes)} label="Avg Working Hours" />
              <Stat icon="cal" tone="or" value={<>{st.present + st.half}<span style={{ fontSize: 12, color: 'var(--muted)' }}> / {st.workdaysSoFar}</span></>} label={'Days present · ' + st.unaccounted + ' unaccounted'} />
              <Stat icon="flag" tone="pk" value={myTasks.filter(overdue).length} label="Task Alerts" />
            </div>
            <div className="emp-charts">
              <Panel title={'Attendance · ' + new Date().toLocaleDateString('en-GB', { month: 'short' })} bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}><Donut parts={[['#4ADE95', st.present], ['#FFB84D', st.half], ['#FF5C7A', st.absent], ['#6FA8FF', st.leave], ['var(--track)', st.unaccounted]]} center={(st.present + st.half) + '|Days'} size={150} /><Legend items={[['#4ADE95', 'Present ' + st.present], ['#FFB84D', 'Half ' + st.half], ['#FF5C7A', 'Absent ' + st.absent], ['#6FA8FF', 'Leave ' + st.leave]]} /></Panel>
              <Panel title="Tasks Status" bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 6 }}><Donut parts={tstat} center={myTasks.length + '|Total Tasks'} size={150} /><Legend items={STATUSES.map((k, i) => [tstat[i][0], STATUS_LABEL[k] + ' ' + tstat[i][1]])} /></Panel>
              <Panel title="Recent payments" right={<LinkBtn href="/payments">All</LinkBtn>}>{pays.length ? <div className="list">{pays.slice(0, 6).map(p => <div className="row" key={p.id}><Chip tone={p.type === 'Fine' ? 'pk' : p.type === 'Advance' ? 'or' : 'gr'}>{p.type}</Chip><span style={{ flex: 1, fontSize: 12.5 }}>{fmtD(p.date)}{p.note ? ' · ' + p.note : ''}</span><b className="money">{inr(p.amount)}</b></div>)}</div> : <Empty>No payments yet</Empty>}</Panel>
            </div>
            <div className="emp-bottom">
              <div className="panel"><div className="panel-h">All Projects ({projIds.length})</div><Tabs items={[['all', 'All'], ['bill', 'Billable'], ['non', 'Non-billable']]} value={tab} onChange={setTab} style={{ padding: '0 12px' }} /><div className="list" style={{ padding: '8px 12px' }}>{projs.map(p => <div className="row" key={p.id}><span className="avatar sm p">{ini(p.name)}</span><span style={{ flex: 1 }}>{p.name}</span><Chip tone={p.billable ? 'gr' : 'gy'}>{p.billable ? 'Billable' : 'Non-billable'}</Chip></div>)}{!projs.length && <Empty>No projects</Empty>}{topP.length > 0 && <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 8, paddingTop: 8 }}>{topP.map(([p, m]) => <div className="row" key={p}><span style={{ flex: 1, fontSize: 12.5 }}>{d.projName(p)}</span><b>{hm(m)}</b></div>)}</div>}</div></div>
              <div className="panel"><div className="panel-h">Tasks ({myTasks.length})</div><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Task</th><th>Project</th><th>Assigned</th><th>Deadline</th><th>Est / Taken</th><th>Status</th></tr></thead><tbody>{taskPager.items.map(t => <tr key={t.id}><td><LinkBtn onClick={() => modals.open('task', t.id)} style={{ textAlign: 'left' }}>{t.title}</LinkBtn></td><td>{t.project_name || d.projName(t.project)}</td><td>{fmtD(t.assigned)}</td><td style={{ color: overdue(t) ? 'var(--danger)' : undefined }}>{fmtD(t.deadline)}</td><td>{hm(t.mins)} / {hm(t.taken_mins)}</td><td><TaskChip status={t.status} /></td></tr>)}</tbody></table>{!myTasks.length && <Empty icon="file">No tasks found</Empty>}</div><Pager pager={taskPager} /></div>
            </div>
          </>
        )}

        {subTab === 'attendance' && (
          <StaffAttendanceTab employee={e} />
        )}

        {subTab === 'salary_overview' && canViewPayrollTabs && (
          <StaffSalaryOverview
            employee={e}
            onNavigateToStructure={() => setSubTab('salary_structure')}
          />
        )}

        {subTab === 'salary_structure' && canViewPayrollTabs && (
          <StaffSalaryStructure
            employee={e}
            onCancel={() => setSubTab('salary_overview')}
            onUpdated={() => { d.reload('employees'); }}
          />
        )}

        {subTab === 'loans' && canViewPayrollTabs && (
          <StaffLoansTab employee={e} />
        )}

        {subTab === 'leaves' && (
          <StaffLeavesTab employee={e} />
        )}
      </div>
    </div>
  );
}
