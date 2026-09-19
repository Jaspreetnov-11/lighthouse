'use client';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { ProjectModel } from '@/models';
import { Avatar, Chip, Donut, Empty, Icon, LinkBtn, Panel, Search, Seg, Sq, TaskChip, Tabs } from '@/views/ui';
import { Pager, usePager } from '@/views/ui/Pager';
import { avFor, fmtD, fmtDY, hm, ini, overdue, pct, STATUSES, STATUS_COLOR, STATUS_LABEL, thisMonth } from '@/lib/format';

const colFor = n => ({ p: '#B48CFF', g: '#4ADE95', r: '#FF7AB3', b: '#6FA8FF', br: '#D9A066', o: '#FFD21F', t: '#5EE0D6' })[avFor(n)];

export function ProjectsScreen() {
  const d = useData();
  const { toast, confirm } = useUi();
  const modals = useModals();
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [view, setView] = useState('overview');
  const [detail, setDetail] = useState(null);

  // Opened from a notification or alert (/projects?project=ID): select that project
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('project'); if (id) { setSel(id); setRange('all'); setTab('all'); setView('overview'); } }, []);
  useEffect(() => { if ((!sel || !d.projById[sel]) && d.projects.length) setSel(d.projects[0].id); }, [d.projects, d.projById, sel]);
  useEffect(() => { if (!sel) return; let alive = true; ProjectModel.get(sel).then(p => { if (alive) setDetail(p); }).catch(() => {}); return () => { alive = false; }; }, [sel, d.tasks]);

  const [range, setRange] = useState('all'); // all | month
  const [month, setMonth] = useState(() => thisMonth());
  const inMonth = p => String(p.start || p.created_at || '').slice(0, 7) === month || d.tasks.some(t => t.project === p.id && (String(t.assigned || '').slice(0, 7) === month || String(t.completed || '').slice(0, 7) === month || (t.status !== 'completed' && String(t.deadline || '').slice(0, 7) === month)));
  const list = useMemo(() => d.projects.filter(p => p.name.toLowerCase().includes(q.toLowerCase())).filter(p => tab === 'all' || (tab === 'bill' ? p.billable : !p.billable)).filter(p => range === 'all' || inMonth(p)), [d.projects, d.tasks, q, tab, range, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const listPager = usePager(list, 10);
  const p = d.projById[sel];
  const tasks = useMemo(() => (detail && detail.id === sel && detail.tasks) || d.tasks.filter(t => t.project === sel), [detail, sel, d.tasks]);
  const taskPager = usePager(tasks, 10);
  const used = p ? Number(p.consumed_mins) || 0 : 0, alloc = p ? Number(p.alloc) || 0 : 0, pc = pct(used, alloc), over = alloc > 0 && used > alloc;
  const members = [...new Set(tasks.flatMap(t => String(t.assignee || '').split(',')).map(s => s.trim()).filter(Boolean))].map(id => d.empById[id]).filter(Boolean);
  const depts = Object.entries(tasks.reduce((m, t) => { const e = d.empById[String(t.assignee || '').split(',')[0]]; const k = e ? e.dept : 'Unassigned'; m[k] = (m[k] || 0) + (Number(t.mins) || 0); return m; }, {})).sort((a, b) => b[1] - a[1]);
  const maxD = Math.max(1, ...depts.map(x => x[1]), alloc);
  const tstat = STATUSES.map(k => [STATUS_COLOR[k], tasks.filter(t => t.status === k).length]);
  const files = d.files.filter(f => f.project === sel);
  const remove = async () => {
    if (!p) return;
    const ok = await confirm({
      title: 'Delete Project',
      message: `Delete ${p.name}?`,
      sub: 'Its tasks become personal tasks.',
      okText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    try {
      await ProjectModel.remove(p.id);
      toast('Project deleted.');
      setSel(null);
      await d.reload('projects', 'tasks');
    } catch (err) {
      toast(err.message);
    }
  };

  const body = () => {
    if (!p) return <Empty>Add a project to get started</Empty>;
    if (view === 'tasks') return <div className="panel"><div className="panel-h">Tasks ({tasks.length}) {d.isLeaderOf(p.id) && <LinkBtn onClick={() => modals.open('task', null, { project: p.id })}>+ Assign task</LinkBtn>}</div><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Task</th><th>Assignee</th><th>Assigned</th><th>Deadline</th><th>Est / Taken</th><th>Status</th></tr></thead><tbody>{taskPager.items.map(t => <tr key={t.id}><td><LinkBtn onClick={() => modals.open('task', t.id)} style={{ textAlign: 'left' }}>{t.title}</LinkBtn></td><td>{d.taskAssigneeNames(t)}</td><td>{fmtD(t.assigned)}</td><td style={{ color: overdue(t) ? 'var(--danger)' : undefined }}>{fmtD(t.deadline)}</td><td>{hm(t.mins)} / {hm(t.taken_mins)}</td><td><TaskChip status={t.status} /></td></tr>)}</tbody></table>{!tasks.length && <Empty>No tasks yet</Empty>}</div><Pager pager={taskPager} /></div>;
    if (view === 'files') return <div className="panel"><div className="panel-h">Files ({files.length}) <LinkBtn onClick={() => modals.open('file', null, { project: p.id })}>+ Upload file</LinkBtn></div>{files.map(f => <div className="file-row" key={f.id}><span className="ic pu" style={{ display: 'grid', placeItems: 'center' }}><Icon name="file" size={14} /></span><a href={'/api/files/' + f.id + '/download'} style={{ color: 'inherit' }}>{f.name}</a><span className="r"><span>{f.uploader_name || ''}</span><span>{f.size}</span><span>{fmtD(f.date)}</span></span></div>)}{!files.length && <Empty>No files yet</Empty>}</div>;
    if (view === 'members') return <div className="panel"><div className="panel-h">Members ({members.length})</div><div className="list" style={{ padding: '0 16px 12px' }}>{members.map(e => <div className="row" key={e.id}><Avatar e={e} /><div><div>{e.name}</div><small style={{ color: 'var(--muted)' }}>{e.role || ''} · {e.dept || ''}</small></div><span className="r"><b>{hm(tasks.filter(t => String(t.assignee || '').includes(e.id)).reduce((a, t) => a + (Number(t.mins) || 0), 0))}</b></span></div>)}{!members.length && <Empty>No members yet. Assign a task to add someone.</Empty>}</div></div>;
    return (<>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="panel"><div className="panel-h" style={{ fontSize: 16 }}>Project Health</div><div className="health"><Donut parts={[[over ? '#FF5C7A' : pc > 0 ? '#4ADE95' : 'var(--track)', Math.min(100, pc)], ['var(--track)', Math.max(0, 100 - Math.min(100, pc))]]} center={pc + '%|'} size={110} /><div><Chip tone={over ? 'pk' : pc > 0 ? 'gr' : 'gy'}>{over ? 'Overrun' : pc > 0 ? 'On Track' : 'Not started'}</Chip><div style={{ fontWeight: 600, marginTop: 10 }}>{hm(used)} / {hm(alloc)}</div><small style={{ color: 'var(--muted)' }}>Taken / Allocated · est. {hm(p.est_mins)}</small></div></div></div>
        <div className="panel"><div className="panel-h" style={{ fontSize: 16 }}>Tasks Status</div><div className="health" style={{ gap: 24 }}><Donut parts={tstat} center={tasks.length + '|Total Tasks'} size={110} /><div style={{ flex: 1, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6 }}>{STATUSES.map((k, i) => <span key={k} style={{ display: 'flex', justifyContent: 'space-between' }}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: tstat[i][0], marginRight: 8 }}></i>{STATUS_LABEL[k]}</span><b>{tstat[i][1]}</b></span>)}</div></div></div>
      </div>
      <div className="panel"><div className="panel-h" style={{ fontSize: 16, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>Departments Allocation<div className="legend" style={{ fontWeight: 400 }}><span><i style={{ background: '#FFD21F' }}></i>Allocated ({hm(alloc)})</span><span><i style={{ background: '#B48CFF' }}></i>Consumed</span></div></div><div className="panel-b">{depts.map(([dd, m]) => <div className="alloc-row" key={dd}><div>{dd}<small>{hm(m)} consumed</small></div><div><div className="t"><div className="f" style={{ width: Math.round((m / maxD) * 100) + '%', background: '#B48CFF' }}></div></div></div></div>)}{!depts.length && <Empty>No time logged yet</Empty>}</div></div>
    </>);
  };

  return (
    <div className="two">
      <aside><b style={{ fontSize: 14 }}>Projects</b>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Seg items={[['all', 'Overall'], ['month', 'Month']]} value={range} onChange={setRange} />{range === 'month' && <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto', height: 32, fontSize: 12.5, padding: '0 8px', borderRadius: 100 }} />}</span>{d.canCreateProject && <button className="tb-btn solid" style={{ height: 34, padding: '0 12px', fontSize: 12.5 }} onClick={() => modals.open('project')}>+ Add Project</button>}</div>
        <Search value={q} onChange={setQ} />
        <Tabs items={[['all', 'All (' + d.projects.length + ')'], ['bill', 'Billable'], ['non', 'Non-billable']]} value={tab} onChange={setTab} style={{ fontSize: 12 }} />
        <div className="list" style={{ gap: 10 }}>
          {listPager.items.map(x => { const u = Number(x.consumed_mins) || 0, al = Number(x.alloc) || 0, c = pct(u, al), ov = al > 0 && u > al, col = ov ? '#FF5C7A' : c > 0 ? '#4ADE95' : 'var(--track)'; return (
            <div className={'proj-item' + (x.id === sel ? ' on' : '')} key={x.id} onClick={() => { setSel(x.id); setView('overview'); }}>
              <div className="top"><span className="ini" style={{ background: colFor(x.name) }}>{ini(x.name)}</span><div style={{ flex: 1, minWidth: 0 }}><span className="nm">{x.name}</span><small>{x.client || ''}</small></div><Chip tone={x.billable ? 'gr' : 'gy'}>{x.billable ? 'Billable' : 'Non-bill'}</Chip></div>
              <div className="bar-row"><div className="t"><div className="f" style={{ width: Math.min(100, c) + '%', background: col }}></div></div><div className="l"><span style={{ color: 'var(--muted)' }}>{hm(u)} / {hm(al)}</span><span className="pct" style={{ color: col }}>{c}%</span></div></div>
            </div>); })}
          {!list.length && <Empty>No projects match</Empty>}
        </div>
        <Pager pager={listPager} compact />
      </aside>
      <div className="content">
        {p && (<>
          <div className="panel">
            <div className="proj-head">
              <span className="ini">{ini(p.name)}</span>
              <h2>{p.name}</h2>
              <Chip tone="gy">{p.billable ? 'Billable' : 'Non-Billable'}</Chip>
              <Chip tone="pu">Project</Chip>
              <Chip tone={p.status === 'Approved' ? 'gr' : 'or'}>{p.status === 'Approved' ? '✓ ' : ''}{p.status || ''}</Chip>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                {d.isLeaderOf(p.id) && <Sq icon="edit" label="Edit project" onClick={() => modals.open('project', p.id)} />}
                {d.isLeaderOf(p.id) && <Sq label="Delete project" onClick={remove} style={{ color: 'var(--danger)' }}>✕</Sq>}
              </div>
            </div>
            <div className="proj-meta">
              <span>Project Start Date: <b>{fmtDY(p.start)}</b></span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                Team leader{(d.projectManagers ? d.projectManagers(p) : []).length > 1 ? 's' : ''}:
                {(d.projectManagers ? d.projectManagers(p) : []).length ? (d.projectManagers(p)).map(m => (
                  <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Avatar e={m} /> {m.name}
                  </span>
                )) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Avatar e={d.empById[p.manager]} /> {d.empName(p.manager)}</span>
                )}
              </span>
              <span>Assigned Members: {members.length ? members.map(e => e.name).join(', ') : '—'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><div className="proj-tabs">{[['overview', 'chart', 'Overview'], ['tasks', 'circle-check', 'Tasks'], ['files', 'folder', 'Files'], ['members', 'users', 'Members']].map(([k, ic, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}><Icon name={ic} size={14} />{l}</button>)}</div>{d.isLeaderOf(p.id) && <button className="tb-btn solid" onClick={() => modals.open('task', null, { project: p.id })}>+ Assign task</button>}</div>
        </>)}
        {body()}
      </div>
    </div>
  );
}
