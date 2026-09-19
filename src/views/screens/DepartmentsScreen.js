'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/controllers/AuthController';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { DepartmentModel } from '@/models';
import { Avatar, Chip, DateBtn, Donut, Empty, Icon, Search, Sq, Stat } from '@/views/ui';
import { Pager, usePager } from '@/views/ui/Pager';
import { assigneeIds, hm, ini, inr, overdue, pct, STATUSES, STATUS_COLOR } from '@/lib/format';

export function DepartmentsScreen() {
  const d = useData();
  const { isAdmin } = useAuth();
  const { toast, confirm } = useUi();
  const modals = useModals();
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('members');

  useEffect(() => { if ((!sel || !d.departments.find(x => x.id === sel)) && d.departments.length) setSel(d.departments[0].id); }, [d.departments, sel]);
  const list = useMemo(() => d.departments.filter(x => x.name.toLowerCase().includes(q.toLowerCase())), [d.departments, q]);
  const listPager = usePager(list, 10);
  const dep = d.departments.find(x => x.id === sel);
  const members = dep ? d.employees.filter(e => e.dept === dep.name) : [];
  const mIds = new Set(members.map(e => e.id));
  const tasks = d.tasks.filter(t => assigneeIds(t).some(id => mIds.has(id)));
  const consumed = tasks.reduce((a, t) => a + (Number(t.mins) || 0), 0);
  const projIds = [...new Set(tasks.map(t => t.project).filter(Boolean))];
  const alloc = projIds.reduce((a, p) => a + (Number((d.projById[p] || {}).alloc) || 0), 0);
  const payroll = members.reduce((a, e) => a + (Number(e.salary) || 0), 0), pend = members.reduce((a, e) => a + (Number(e.pendingBal) || 0), 0);
  const bill = tasks.filter(t => { const p = d.projById[t.project]; return p && p.billable; }).reduce((a, t) => a + (Number(t.mins) || 0), 0), nonbill = consumed - bill;
  const tstat = STATUSES.map(k => [STATUS_COLOR[k], tasks.filter(t => t.status === k).length]);
  const presentToday = ((d.today && d.today.staffAttendance) || []).filter(a => mIds.has(a.emp) && (a.status === 'present' || a.status === 'half' || a.clock_in)).length;
  const attPct = members.length ? Math.round((presentToday / members.length) * 100) : 0;
  const totalMins = d.tasks.reduce((a, t) => a + (Number(t.mins) || 0), 0) || 1;
  const share = x => { const ids = new Set(d.employees.filter(e => e.dept === x.name).map(e => e.id)); return Math.round((d.tasks.filter(t => assigneeIds(t).some(id => ids.has(id))).reduce((a, t) => a + (Number(t.mins) || 0), 0) / totalMins) * 100); };
  const files = d.files.filter(f => mIds.has(f.assigned_by));
  const remove = async () => {
    if (!dep) return;
    const ok = await confirm({
      title: 'Delete Department',
      message: `Delete department "${dep.name}"?`,
      sub: 'This action cannot be undone.',
      okText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    try {
      await DepartmentModel.remove(dep.id);
      toast('Department deleted.');
      setSel(null);
      await d.reload('departments');
    } catch (err) {
      toast(err.message);
    }
  };

  const body = () => {
    if (tab === 'projects') return <div className="panel" style={{ margin: '0 20px' }}><div className="panel-h">Projects ({projIds.length})</div><div className="list" style={{ padding: '0 16px 12px' }}>{projIds.map(id => d.projById[id]).filter(Boolean).map(p => <div className="row" key={p.id}><span className="avatar sm p">{ini(p.name)}</span><span style={{ flex: 1 }}>{p.name}</span><b>{hm(tasks.filter(t => t.project === p.id).reduce((a, t) => a + (Number(t.mins) || 0), 0))}</b></div>)}{!projIds.length && <Empty>No projects yet</Empty>}</div></div>;
    if (tab === 'files') return <div className="panel" style={{ margin: '0 20px' }}><div className="panel-h">Files ({files.length})</div>{files.map(f => <div className="file-row" key={f.id}><span className="ic pu" style={{ display: 'grid', placeItems: 'center' }}><Icon name="file" size={14} /></span><span>{f.name}</span><span className="r"><span>{f.uploader_name || ''}</span><span>{f.size}</span></span></div>)}{!files.length && <Empty>No files</Empty>}</div>;
    return (<>
      <div className="dept-stats">
        <Stat icon="clock" tone="tl" value={members.length + ' staff'} label="Team size" />
        {isAdmin && <Stat icon="file" tone="gr" value={inr(payroll)} valueClass="money" label="Monthly payroll" />}
        {isAdmin && <Stat icon="file" tone="or" value={inr(pend)} valueClass={'money' + (pend > 0 ? ' neg' : '')} label="Pending pay" />}
        <Stat icon="cal" tone="pk" value={presentToday + '/' + members.length} label="Present today" />
        <Stat icon="leaf" tone="bl" value={pct(consumed, alloc) + '%'} label="Allocation consumed" />
        <Stat icon="flag" tone="pk" value={tasks.filter(overdue).length} label="Task Alerts" />
      </div>
      <div className="dept-charts">
        <div className="panel"><div className="panel-h">Attendance today</div><div className="panel-b" style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: 10 }}><Donut parts={[['#4ADE95', attPct], ['var(--track)', 100 - attPct]]} center={attPct + '%|Present'} size={110} /></div></div>
        <div className="panel"><div className="panel-h">Tasks Status</div><div className="panel-b" style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: 10 }}><Donut parts={tstat} center={tasks.length + '|Total Tasks'} size={110} /></div></div>
        <div className="panel"><div className="panel-h">Time Spent</div><div className="panel-b" style={{ display: 'flex', gap: 20, alignItems: 'center' }}><Donut parts={[['#B48CFF', bill], ['#6A6A74', nonbill]]} center={pct(bill, consumed) + '%|Billable'} size={110} /><div style={{ flex: 1, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 10 }}><span style={{ display: 'flex', justifyContent: 'space-between' }}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#B48CFF', marginRight: 8 }}></i>Billable</span><b>{hm(bill)}</b></span><span style={{ display: 'flex', justifyContent: 'space-between' }}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#6A6A74', marginRight: 8 }}></i>Non-billable</span><b>{hm(nonbill)}</b></span></div></div></div>
      </div>
      <div className="panel" style={{ margin: '16px 20px 0' }}><div className="panel-h">Members ({members.length})</div><div className="list" style={{ padding: '0 16px 12px' }}>{members.map(e => <div className="row" key={e.id}><Avatar e={e} /><div><div>{e.name}</div><small style={{ color: 'var(--muted)' }}>{e.role || ''}</small></div><span className="r" style={{ fontSize: 12, color: 'var(--muted)' }}>{inr(e.salary)} · {e.emp_id || ''}</span></div>)}{!members.length && <Empty>No members. Add an employee to this department.</Empty>}</div></div>
    </>);
  };

  return (
    <div className="two">
      <aside>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><DateBtn>{new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</DateBtn><button className="tb-btn solid" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => modals.open('dept')}>+ Add Dept</button></div>
        <b style={{ fontSize: 14 }}>Departments ({d.departments.length}) <i style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)' }}></i></b>
        <Search value={q} onChange={setQ} />
        <div className="list" style={{ gap: 10 }}>{listPager.items.map(x => <div className={'dept-item' + (x.id === sel ? ' on' : '')} key={x.id} onClick={() => setSel(x.id)}><div className="top"><span className="ini">{x.name.slice(0, 2).toUpperCase()}</span><span className="nm">{x.name}</span><Chip tone={x.billable ? 'gr' : 'gy'}>{x.billable ? 'Billable' : 'Non-billable'}</Chip></div><div className="t"><div className="f" style={{ width: share(x) + '%' }}></div></div><div className="pct">{share(x)}% · {x.staff_count || 0} staff</div></div>)}{!list.length && <Empty>No departments match</Empty>}</div>
        <Pager pager={listPager} compact />
      </aside>
      <div className="content" style={{ padding: '0 0 30px' }}>
        {dep ? (
          <div className="panel" style={{ margin: '22px 24px 0' }}>
            <div className="dept-head"><div className="r1"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><b style={{ fontSize: 16 }}>{dep.name}</b><Chip tone={dep.billable ? 'gr' : 'gy'}>{dep.billable ? 'Billable' : 'Non-billable'} ●</Chip></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Sq icon="edit" label="Edit" onClick={() => modals.open('dept', dep.id)} /><Sq label="Delete" onClick={remove} style={{ color: 'var(--danger)' }}>✕</Sq></div></div>
              <div className="facts"><span>Active Projects: <b>{projIds.length}</b></span><span>Total Members: <b>{members.length}</b></span><span>Daily Hours: <b>{dep.daily || 8}h</b></span><span>Working Days/Wk: <b>6</b></span></div>
              <div className="facts"><span>Manager&apos;s: <b>{dep.manager ? d.empName(dep.manager) : '—'}</b></span></div></div>
            <div className="big-tabs">{[['members', 'Members (' + members.length + ')'], ['projects', 'Projects'], ['files', 'Files']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
            {body()}<div style={{ height: 20 }}></div>
          </div>
        ) : <Empty>Add a department to get started</Empty>}
      </div>
    </div>
  );
}
