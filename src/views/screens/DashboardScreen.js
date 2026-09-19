'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/controllers/AuthController';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useClock } from '@/controllers/useClock';
import { useModals } from '@/controllers/useModals';
import { TaskModel, TodoModel } from '@/models';
import { Avatar, Chip, Empty, GeoLink, Icon, LinkBtn, Panel, Pills, SectionTitle, StatusBars } from '@/views/ui';
import { Bars, DonutChart, HBars, PairBars, Ring } from '@/views/ui/charts';
import { assigneeIds, fmtD, getUserTaskState, hm, hrs1, inr, leaveBalance, MODE_LABEL, round2, shiftDisplay, weekOffOf, overdue, pct, punchMinutes, thisMonth, todayISO, workedToday } from '@/lib/format';

function TaskMini({ t, onOpen, onAccept }) {
  const { taskAssigneeNames } = useData();
  const { me } = useAuth();
  const uState = getUserTaskState(t, me?.id);
  const isPipeline = uState ? uState.status === 'pipeline' : t.status === 'pipeline';
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
      <Chip tone={overdue(t) ? 'pk' : 'gy'} style={{ flex: '0 0 auto' }}>{fmtD(t.deadline)}</Chip>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 500 }}>{t.title}</div><small style={{ color: 'var(--muted)' }}>{t.project_name || 'Project'} · {taskAssigneeNames(t)}</small></div>
      {isPipeline && onAccept ? <button className="pill on" style={{ height: 28, fontSize: 11.5 }} onClick={() => onAccept(t.id)}>Accept</button> : <LinkBtn onClick={() => onOpen(t.id)}>Open</LinkBtn>}
    </div>
  );
}

function ClockCard() {
  const { me } = useAuth();
  const { settings } = useData();
  const clock = useClock();
  const r = clock.punch;
  const st = clock.state;
  const fromYesterday = r && r.date && r.date < todayISO();
  const modeTxt = r && r.mode && r.mode !== 'office' ? ' · ' + (MODE_LABEL[r.mode] || r.mode) : '';
  const sessList = clock.sessions || [];
  const prevMins = sessList.reduce((acc, s) => acc + (Number(s.mins) || 0), 0);

  const head = st === 're_in'
    ? 'Re-clocked in at ' + r.clock_in + ' (Session ' + clock.sessionCount + ')' + modeTxt
    : st === 'in'
    ? 'Clocked in at ' + r.clock_in + (fromYesterday ? ' (yesterday)' : '') + modeTxt
    : st === 'done'
    ? 'Done · ' + hm(punchMinutes(r)) + ' worked' + (sessList.length > 0 ? ' (' + (sessList.length + 1) + ' sessions)' : '') + modeTxt
    : 'Not clocked in yet';

  const isClockedOut = st === 'done';
  const isOpen = st === 'in' || st === 're_in';

  return (
    <div className={'clock-card ' + st}>
      <div className="st"><span className="dot"></span>
        <div style={{ minWidth: 0 }}>
          <b>
            {head}
            {st === 're_in' && <Chip tone="or" style={{ marginLeft: 8 }}>Re-checked in</Chip>}
            {clock.onBreak && <Chip tone="or" style={{ marginLeft: 8 }}>On break since {clock.curBreak.start}</Chip>}
            {r && Number(r.late) && !clock.isRecheck ? <Chip tone="or" style={{ marginLeft: 8 }}>Late</Chip> : null}
          </b>
          <small>
            {st === 're_in' && <>Active since {r.clock_in} <GeoLink lat={r.in_lat} lng={r.in_lng} addr={r.in_addr} acc={r.in_acc} /> · {hm(prevMins)} worked earlier · tap Clock Out when done</>}
            {st === 'in' && <>Since {r.clock_in} <GeoLink lat={r.in_lat} lng={r.in_lng} addr={r.in_addr} acc={r.in_acc} /> · tap Clock Out when you leave</>}
            {st === 'done' && <>Last out {r.clock_out} <GeoLink lat={r.out_lat} lng={r.out_lng} addr={r.out_addr} acc={r.out_acc} />{Number(r.ot_hours) ? ' · OT ' + round2(r.ot_hours) + 'h' : ''} · tap Re-Clock In to start another session</>}
            {st === 'off' && <>{me.name.split(' ')[0]}, your shift is {shiftDisplay(me.shift, settings)} · {clock.selfieIn ? 'selfie + location' : 'location'} is saved with each punch</>}
          </small>
        </div>
      </div>
      <button
        className={'big' + (isClockedOut ? ' recheck-btn' : '')}
        onClick={isClockedOut ? () => window.dispatchEvent(new Event('lh:splash')) : clock.act}
        disabled={clock.busy}
      >
        <Icon name={isOpen ? 'logout' : 'login'} />
        {clock.busy ? 'Getting location…' : isOpen ? 'Clock Out' : isClockedOut ? 'Re-Clock In' : 'Clock In'}
      </button>
      {isOpen && <button type="button" className={'brk' + (clock.onBreak ? ' on' : '')} onClick={clock.onBreak ? clock.endBreak : clock.startBreak} disabled={clock.busy} title="Break time comes off your worked and productive hours">{clock.onBreak ? '▶ End break · ' + hm(clock.breakNow) : '☕ Take a break'}</button>}
    </div>
  );
}

function Kpi({ label, value, sub, tone, bar }) {
  return <div className={'kpi ' + (tone || '')}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}{bar !== undefined && <div className="bar"><i style={{ width: Math.min(100, bar) + '%' }}></i></div>}</div>;
}

const dayLabel = iso => String(Number(String(iso).slice(8, 10)));

export function DashboardScreen() {
  const { me, isAdmin } = useAuth();
  const d = useData();
  const { toast } = useUi();
  const modals = useModals();
  const [pill, setPill] = useState('all');
  const [todoText, setTodoText] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(t); }, []); // live "worked today"
  const now = new Date();
  const month = thisMonth();
  const myPunch = d.today ? d.today.myPunch : null;
  const todayMins = workedToday(myPunch, now);
  void tick;

  const my = useMemo(() => d.tasks.filter(t => assigneeIds(t).includes(me.id)), [d.tasks, me.id]);
  const myOpen = my.filter(t => t.status !== 'completed');
  const filt = (arr, k) => (k === 'all' ? arr : arr.filter(t => t.status === k));
  const counts = arr => ({ all: arr.length, pipeline: filt(arr, 'pipeline').length, progress: filt(arr, 'progress').length, approval: filt(arr, 'approval').length, changes: filt(arr, 'changes').length });
  const pillItems = [['all', 'All'], ['pipeline', 'New'], ['progress', 'In progress'], ['approval', 'Awaiting approval'], ['changes', 'Changes']];

  const meRow = d.employees.find(e => e.id === me.id);
  const st = d.myStats || { present: 0, half: 0, absent: 0, late: 0, leave: 0, otHours: 0, avgWorkingMinutes: 0, totalWorkedMinutes: 0, expectedMinutesSoFar: 0, workdaysSoFar: 0, unaccounted: 0, days: [] };
  const hoursPerDay = (d.settings && d.settings.hoursPerDay) || 8;
  const deliveredMine = my.filter(t => t.status === 'completed' && String(t.completed || '').slice(0, 7) === month);
  const onTimeMine = deliveredMine.filter(t => !t.deadline || t.completed <= t.deadline).length;
  const team = d.teamSummary;
  const prod = d.productivity;
  const myProd = prod && prod.list ? prod.list.find(e => e.id === me.id) : null;
  const leaveQuota = d.settings && d.settings.leavesPerYear !== undefined ? Number(d.settings.leavesPerYear) : 12;
  const myLeave = leaveBalance(d.leaves, me.id, leaveQuota, weekOffOf(meRow, (d.settings && d.settings.weekOff) || [0]));
  const deliveredAll = d.tasks.filter(t => t.status === 'completed' && String(t.completed || '').slice(0, 7) === month);
  const totalPending = d.employees.reduce((a, e) => a + (Number(e.pendingBal) || 0), 0);
  const overdueAll = d.tasks.filter(overdue);

  // Daily hours (this month) for the bar chart
  const dailyBars = useMemo(() => (st.days || []).map(x => ({ label: dayLabel(x.date), value: Math.round((x.mins || 0) / 6) / 10, tone: x.late ? 'var(--viz-warn)' : undefined, tip: fmtD(x.date) + (x.late ? ' · late' : '') + (x.mode && x.mode !== 'office' ? ' · ' + (MODE_LABEL[x.mode] || x.mode) : '') + (x.open ? ' · still clocked in' : '') })), [st.days]);
  const attParts = [
    { label: 'Present', value: st.present, color: 'var(--viz-present)' },
    { label: 'Half day', value: st.half, color: 'var(--viz-half)' },
    { label: 'Leave', value: st.leave, color: 'var(--viz-leave)' },
    { label: 'Absent', value: st.absent, color: 'var(--viz-absent)' }
  ];

  // Team charts (admins / team leaders)
  // Productive hours (task time, minus breaks) per department and per person
  const deptHours = useMemo(() => {
    if (!prod || !prod.list) return [];
    const m = {};
    for (const s of prod.list) { const k = s.dept || 'Other'; m[k] = m[k] || { mins: 0, n: 0 }; m[k].mins += s.productiveMins || 0; m[k].n += 1; }
    const list = Object.entries(m).map(([k, v]) => ({ label: k, value: Math.round(v.mins / 6) / 10, tip: v.n + ' staff' })).sort((a, b) => b.value - a.value);
    const withVal = list.filter(x => x.value > 0);
    return (withVal.length ? withVal : list).slice(0, 8);
  }, [prod]);
  const topStaff = useMemo(() => (prod && prod.list ? prod.list.filter(s => s.productiveMins > 0).slice(0, 6).map(s => ({ label: s.name, value: Math.round(s.productiveMins / 6) / 10, tip: (s.dept || '') + ' · tasks ' + hrs1(s.ownMins) + (s.managedMins ? ' · managing ' + hrs1(s.managedMins) : '') })) : []), [prod]);
  // Team average productive hours per person per working day (people with any task time this month)
  const teamAvgProd = useMemo(() => { if (!prod || !prod.list || !team) return 0; const active = prod.list.filter(s => s.productiveMins > 0); const days = Math.max(1, team.workdaysSoFar || 1); return active.length ? Math.round(active.reduce((a, s) => a + s.productiveMins, 0) / active.length / days) : 0; }, [prod, team]);
  const clientBars = useMemo(() => (isAdmin ? (d.clients || []).filter(c => c.revenue > 0 || c.cost > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 6).map(c => ({ label: c.name, a: c.revenue || 0, b: c.cost || 0 })) : []), [d.clients, isAdmin]);
  const projects = d.projects.filter(p => isAdmin || p.manager === me.id).slice().sort((a, b) => Number(b.consumed_mins) - Number(a.consumed_mins)).slice(0, 6);
  const [localTodos, setLocalTodos] = useState(null); // optimistic copy so a new to-do shows instantly
  useEffect(() => { setLocalTodos(null); }, [d.todos]);
  const todos = localTodos || d.todos;
  const perf = d.performance;
  const perfList = perf ? perf.list : [];
  const top5 = perfList.filter(e => e.rank !== null && e.total > 0).slice(0, 5);
  const mePerf = perfList.find(e => e.id === me.id);
  const rankedCount = perfList.filter(e => e.rank !== null).length;
  const [adding, setAdding] = useState(false);

  const addTodo = async e => {
    if (e && e.preventDefault) e.preventDefault();
    const v = todoText.trim();
    if (!v || adding) return;
    setAdding(true);
    try {
      const created = await TodoModel.create(v);
      setTodoText('');
      setLocalTodos([created, ...(todos || [])]);
      toast('To-do added');
      await d.reload('todos');
    } catch (err) { toast('Could not add to-do: ' + (err.message || 'unknown error')); }
    finally { setAdding(false); }
  };
  const toggleTodo = async id => { try { await TodoModel.toggle(id); await d.reload('todos'); } catch (err) { toast(err.message); } };
  const delTodo = async id => { try { await TodoModel.remove(id); await d.reload('todos'); } catch (err) { toast(err.message); } };
  const openTask = id => { window.location.assign('/tasks?task=' + id); };
  const accept = async id => { try { await TaskModel.setStatus(id, 'progress'); toast('Accepted. Timer started.'); await d.reload('tasks', 'activity'); } catch (err) { toast(err.message); } };
  const listOr = arr => (arr.length ? <div className="list" style={{ marginTop: 10 }}>{arr.slice(0, 6).map(t => <TaskMini key={t.id} t={t} onOpen={openTask} onAccept={accept} />)}</div> : <div className="empty" style={{ padding: '30px 10px' }}><Icon name="circle-check" size={30} style={{ color: 'var(--dim)' }} />Nothing here</div>);
  const inrK = v => (v >= 100000 ? '₹' + (Math.round(v / 10000) / 10) + 'L' : v >= 1000 ? '₹' + Math.round(v / 1000) + 'k' : '₹' + Math.round(v));

  return (
    <div className="content">
      <ClockCard />

      <SectionTitle>Your month</SectionTitle>
      <div className="viz-grid">
        <div className="panel viz-card">
          <div className="viz-h">Worked today<span>target {hoursPerDay}h</span></div>
          <div className="viz-b" style={{ alignItems: 'center' }}>
            <Ring value={todayMins} max={hoursPerDay * 60} format={hrs1} sub={myPunch && myPunch.clock_in ? (myPunch.clock_out ? 'in ' + myPunch.clock_in + ' · out ' + myPunch.clock_out : 'since ' + myPunch.clock_in) : 'not clocked in'} tone={todayMins >= hoursPerDay * 60 ? 'var(--viz-present)' : undefined} />
          </div>
        </div>
        <div className="panel viz-card wide">
          <div className="viz-h">Daily hours this month<span>{hrs1(st.totalWorkedMinutes)} of {hrs1(st.expectedMinutesSoFar)} expected{st.late ? <> · <i className="viz-sw" style={{ background: 'var(--viz-warn)' }}></i> late</> : null}</span></div>
          <div className="viz-b"><Bars data={dailyBars} target={hoursPerDay} max={Math.max(hoursPerDay + 2, ...dailyBars.map(x => x.value))} format={v => v + 'h'} empty="No punches this month yet" labelEvery={dailyBars.length > 14 ? 2 : 1} /></div>
        </div>
        <div className="panel viz-card">
          <div className="viz-h">Attendance<span>{st.workdaysSoFar} working days so far</span></div>
          <div className="viz-b"><DonutChart parts={attParts} center={(st.present + st.half) + '|days'} /></div>
        </div>
      </div>
      <div className="kpis">
        <Kpi label="Avg working hours / day" value={hrs1(st.avgWorkingMinutes)} sub={'target ' + hoursPerDay + 'h 00m'} tone={st.avgWorkingMinutes >= hoursPerDay * 60 ? 'ok' : st.avgWorkingMinutes > 0 ? 'warn' : ''} />
        <Kpi label="Late arrivals" value={st.late} sub={st.late ? 'after grace time' : 'none this month'} tone={st.late ? 'warn' : 'ok'} />
        <Kpi label="Productive hours" value={hrs1(myProd ? myProd.productiveMins : 0)} sub={myProd ? 'tasks ' + hrs1(myProd.ownMins) + (myProd.managedMins ? ' · managing ' + hrs1(myProd.managedMins) : '') + (myProd.breakMins ? ' · breaks −' + hrs1(myProd.breakMins) : '') : 'from task time'} tone={myProd && st.totalWorkedMinutes > 0 && myProd.productiveMins >= st.totalWorkedMinutes * 0.6 ? 'ok' : ''} />
        <Kpi label="Leaves left" value={myLeave.left} sub={'used ' + myLeave.used + ' of ' + myLeave.quota + (myLeave.pending ? ' · ' + myLeave.pending + ' pending' : '')} tone={myLeave.left === 0 ? 'bad' : myLeave.left <= 2 ? 'warn' : ''} />
        <Kpi label="Overtime" value={round2(st.otHours) + 'h'} sub={'paid at ' + ((d.settings && d.settings.otRate) || 1) + '× hourly'} />
        <Kpi label="Tasks delivered" value={deliveredMine.length} sub={deliveredMine.length ? onTimeMine + ' on time' : 'this month'} tone={deliveredMine.length && onTimeMine === deliveredMine.length ? 'ok' : ''} />
        <Kpi label="Your pending pay" value={inr(meRow ? meRow.pendingBal : 0)} sub={meRow && meRow.earned !== undefined ? 'earned ' + inr(meRow.earned) + ' · paid ' + inr(meRow.paid) : 'this month'} />
      </div>

      <SectionTitle>Performance <span className="lb-hint" title="Score out of 100 = software 50 + admin 50. Software half: Volume 20 (task points, creative work like Shoot / Edit / Design weighs 1.5, against the month's best and a minimum bar) + On time 15 (handed in on or before the deadline; the submit-for-approval time counts) + Efficiency 10 (time worked vs hours allocated; only time while clocked in and in progress) + Attendance 5 (days attended, minus late arrivals). Tasks waiting for approval already count. Admin half: marks out of 50 from Settings → Admin controls → Ratings.">how scoring works</span></SectionTitle>
      <div className="dash-2 lb-grid">
        <div className="panel">
          <div className="panel-h">Top performers this month<Chip tone="gy">{rankedCount} ranked</Chip></div>
          <div className="panel-b">
            {top5.length ? <div className="lb">{top5.map((e, i) => (
              <div className={'lb-row' + (e.id === me.id ? ' me' : '')} key={e.id}>
                <span className={'lb-rank r' + (i + 1)}>{i + 1}</span>
                <Avatar e={e} cls="" />
                <div className="lb-who"><b>{e.name}{e.id === me.id ? ' (you)' : ''}</b><small>{e.dept || '—'}{e.role ? ' · ' + e.role : ''}</small></div>
                <div className="lb-stats"><span><b>{e.tasks}</b> tasks</span><span><b>{e.onTimePct === null ? '—' : e.onTimePct + '%'}</b> on time</span><span><b>{e.creative}</b> creative</span></div>
                <div className="lb-pts"><b>{e.total}</b><small>/ 100 · auto {e.auto}{e.adminMarks !== null ? ' · admin ' + e.adminMarks : ''}</small></div>
              </div>))}</div> : <Empty ring icon="chart" title="No tasks delivered yet">Points appear as tasks get approved this month</Empty>}
          </div>
        </div>
        <div className="panel lb-me">
          <div className="panel-h">Your score</div>
          <div className="panel-b">
            <div className="lb-hero"><b>{mePerf ? mePerf.total : 0}</b><span>/ 100 · {mePerf && mePerf.rank ? 'rank ' + mePerf.rank + ' of ' + rankedCount : 'not ranked yet'}</span></div>
            <div className="kv">
              <div><span>Software score</span><b>{mePerf ? mePerf.auto : 0} / 50</b></div>
              {mePerf && mePerf.breakdown && <div className="lb-break"><span>Volume <b>{mePerf.breakdown.volume}</b>/20</span><span>On time <b>{mePerf.breakdown.onTime}</b>/15</span><span>Efficiency <b>{mePerf.breakdown.efficiency}</b>/10</span><span>Attendance <b>{mePerf.breakdown.attendance}</b>/5</span></div>}
              <div><span>Admin marks</span><b>{mePerf && mePerf.adminMarks !== null ? mePerf.adminMarks + ' / 50' : 'not given yet'}</b></div>
              <div><span>Tasks delivered</span><b>{mePerf ? mePerf.tasks : 0}</b></div>
              <div><span>Delivered on time</span><b>{mePerf && mePerf.onTimePct !== null ? mePerf.onTimePct + '%' : '—'}</b></div>
              <div><span>Creative tasks</span><b>{mePerf ? mePerf.creative : 0}</b></div>
              <div><span>Avg time per task</span><b>{mePerf && mePerf.avgTakenMins ? hrs1(mePerf.avgTakenMins) : '—'}</b></div>
            </div>
            <small className="lb-tip">Software half = volume + on-time + efficiency + attendance. Your timer stops the moment you submit for approval, and submitted tasks already count.</small>
          </div>
        </div>
      </div>

      <div className="dash-2">
        <div className="panel"><div className="panel-h">My open tasks {d.canAssign && <LinkBtn onClick={() => modals.open('task')}>+ Assign</LinkBtn>}</div><div className="panel-b"><Pills items={pillItems} value={pill} onChange={setPill} counts={counts(myOpen)} />{listOr(filt(myOpen, pill))}</div></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel title="My tasks by status" right={<Chip tone="gy">{my.length} total</Chip>}><StatusBars tasks={my} /></Panel>
          <div className="panel">
            <div className="panel-h">My to-do list<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{todos.filter(t => t.done).length}/{todos.length} done</span></div>
            <form className="todo-input" onSubmit={addTodo}><button type="button" className="plus" aria-label="Add to-do" disabled={adding} onClick={addTodo}>+</button><input value={todoText} onChange={e => setTodoText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTodo(); } }} placeholder="Add a to-do" maxLength={120} autoComplete="off" enterKeyHint="done" /></form>
            <div className="todo-list">{todos.map(t => <label className={'todo-item' + (t.done ? ' done' : '')} key={t.id}><input type="checkbox" checked={!!t.done} onChange={() => toggleTodo(t.id)} /><span>{t.text}</span><button type="button" className="x" onClick={() => delTodo(t.id)} aria-label="Remove">✕</button></label>)}</div>
            {!todos.length && <Empty ring icon="tasks" title="Nothing on your list">Add a to-do to get started</Empty>}
          </div>
        </div>
      </div>

      {team && (<>
        <SectionTitle>Team this month</SectionTitle>
        <div className="kpis">
          <Kpi label="Staff" value={team.staffCount} sub={team.lateCount + ' late arrivals'} tone={team.lateCount ? 'warn' : ''} />
          <Kpi label="Team avg productive / day" value={hrs1(teamAvgProd)} sub={'per person · target ' + hoursPerDay + 'h 00m'} tone={teamAvgProd >= hoursPerDay * 60 ? 'ok' : teamAvgProd > 0 ? 'warn' : ''} />
          <Kpi label="Productive hours" value={hrs1(prod && prod.totals ? prod.totals.productiveMins : 0)} sub={prod && prod.totals ? 'of ' + hrs1(team.totalWorkedMinutes) + ' clocked' + (prod.totals.breakMins ? ' · breaks −' + hrs1(prod.totals.breakMins) : '') : 'from task time'} bar={prod && prod.totals ? pct(prod.totals.productiveMins, team.totalWorkedMinutes) : 0} tone={prod && prod.totals && team.totalWorkedMinutes > 0 && prod.totals.productiveMins >= team.totalWorkedMinutes * 0.6 ? 'ok' : ''} />
          <Kpi label="Team hours" value={hrs1(team.totalWorkedMinutes)} sub={'of ' + hrs1(team.expectedMinutesSoFar) + ' expected'} bar={pct(team.totalWorkedMinutes, team.expectedMinutesSoFar)} />
          <Kpi label="Overtime hours" value={round2(team.otHours) + 'h'} sub="across the team" />
          <Kpi label="Tasks delivered" value={deliveredAll.length} sub={overdueAll.length + ' overdue'} tone={overdueAll.length ? 'bad' : ''} />
          {isAdmin && <Kpi label="Payroll pending" value={inr(totalPending)} sub={<Link href="/payroll" className="link">Run payroll</Link>} tone={totalPending > 0 ? 'warn' : 'ok'} />}
        </div>
        <div className="viz-grid three">
          <div className="panel viz-card"><div className="viz-h">Productive hours by department<span>task time − breaks</span></div><div className="viz-b"><HBars data={deptHours} format={v => v + 'h'} empty="No task time logged yet" /></div></div>
          <div className="panel viz-card"><div className="viz-h">Most productive this month<span>incl. assigner credit</span></div><div className="viz-b"><HBars data={topStaff} format={v => v + 'h'} empty="No task time logged yet" /></div></div>
          {isAdmin && <div className="panel viz-card"><div className="viz-h">Clients · revenue vs cost<Link href="/clients" className="link" style={{ fontSize: 12 }}>All clients</Link></div><div className="viz-b"><PairBars data={clientBars} names={['Revenue', 'Staff cost']} format={inrK} empty="Add clients and projects to see profit here" /></div></div>}
        </div>
      </>)}

      {projects.length > 0 && (
        <Panel title={isAdmin ? 'Projects' : 'Projects you lead'} right={<LinkBtn href="/projects">All projects</LinkBtn>}>
          <div className="list">
            {projects.map(p => { const used = Number(p.consumed_mins) || 0, alloc = Number(p.alloc) || 0, c = pct(used, alloc), over = alloc > 0 && used > alloc; return (
              <div className="row" key={p.id} style={{ alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 500 }}>{p.name} <small style={{ color: 'var(--muted)' }}>· {p.completed_task_count || 0}/{p.task_count || 0} tasks done</small></div><div className="t" style={{ height: 6, marginTop: 6 }}><div className="f" style={{ width: Math.min(100, c) + '%', background: over ? 'var(--viz-absent)' : 'var(--viz-present)' }}></div></div></div>
                <span style={{ fontSize: 12, color: over ? 'var(--danger)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{hrs1(used)} / {hrs1(alloc)}</span>
              </div>); })}
          </div>
        </Panel>
      )}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Signed in as {me.email}. <Link href="/settings" className="link">Settings</Link></p>
    </div>
  );
}
