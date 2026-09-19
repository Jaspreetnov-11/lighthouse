'use client';
// Notifications (with alerts), Files and Settings.
import { useEffect, useState } from 'react';
import { useAuth } from '@/controllers/AuthController';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { ActivityModel, AuthModel, FileModel, LeaveModel, TaskModel } from '@/models';
import { Chip, Empty, Icon, LinkBtn, SectionTitle, Seg } from '@/views/ui';
import { THEMES, useTheme } from '@/controllers/useTheme';
import { usePush } from '@/controllers/usePush';
import { AdminControls } from '@/views/screens/AdminControls';
import { Pager, usePager } from '@/views/ui/Pager';
import { fmtD, getUserTaskState, inr, pct, SHIFTS } from '@/lib/format';

/** Buttons inside a notification: accept / approve a task, approve / reject a leave request. */
function NotifActions({ n }) {
  const d = useData();
  const { me, isAdmin } = useAuth();
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  const run = async (fn, msg) => { setBusy(true); try { await fn(); toast(msg); await d.reload('tasks', 'leaves', 'activity', 'alerts', 'today', 'employees'); } catch (err) { toast(err.message); } finally { setBusy(false); } };
  if (n.ref_type === 'task') {
    const t = d.tasks.find(x => x.id === n.ref_id);
    if (!t) return null;
    const mine = String(t.assignee || '').split(',').map(s => s.trim()).includes(me.id);
    const lead = d.isLeaderOf(t.project);
    const uState = getUserTaskState(t, me.id);
    const effectiveStatus = uState ? uState.status : t.status;
    return (
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        {effectiveStatus === 'pipeline' && mine && <button className="pill on" style={{ height: 28, fontSize: 11.5 }} disabled={busy} onClick={() => run(() => TaskModel.setStatus(t.id, 'progress'), 'Accepted. Timer started.')}>▶ Accept</button>}
        {t.status === 'approval' && lead && <><button className="pill on" style={{ height: 28, fontSize: 11.5 }} disabled={busy} onClick={() => run(() => TaskModel.setStatus(t.id, 'completed'), 'Approved.')}>✓ Approve</button><button className="pill" style={{ height: 28, fontSize: 11.5 }} disabled={busy} onClick={() => run(() => TaskModel.setStatus(t.id, 'changes'), 'Changes requested.')}>Changes</button></>}
        {t.status === 'completed' && <Chip tone="gr">Completed</Chip>}
        <LinkBtn href={'/tasks?task=' + t.id}>Open</LinkBtn>
      </span>
    );
  }
  if (n.ref_type === 'leave') {
    const l = d.leaves.find(x => x.id === n.ref_id);
    if (!l) return null;
    if (l.status === 'pending' && isAdmin) {
      return (
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="pill on" style={{ height: 28, fontSize: 11.5 }} disabled={busy} onClick={() => run(() => LeaveModel.decide(l.id, 'approved'), 'Approved.')}>✓ Approve</button>
          <button className="pill" style={{ height: 28, fontSize: 11.5, color: 'var(--danger)' }} disabled={busy} onClick={() => { const note = window.prompt('Reason for rejecting (optional):', '') ; if (note === null) return; run(() => LeaveModel.decide(l.id, 'rejected', note), 'Rejected.'); }}>✕ Reject</button>
        </span>
      );
    }
    return <Chip tone={l.status === 'approved' ? 'gr' : l.status === 'rejected' ? 'pk' : 'or'}>{l.status}</Chip>;
  }
  return n.link ? <LinkBtn href={n.link}>Open</LinkBtn> : null;
}

/** One screen for everything that needs attention plus the activity feed. */
/** Banner shown until this device is subscribed to push. */
function PushBanner({ push, onEnable }) {
  return (
    <div className="panel push-banner">
      <div><b>Turn on push notifications</b><div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{push.standaloneNeeded ? 'On iPhone: tap Share → "Add to Home Screen", open Lighthouse from there, then enable.' : 'Get tasks, approvals and announcements on this device even when the app is closed.'}</div></div>
      <button className="date-btn" onClick={onEnable} disabled={push.busy}><Icon name="bell" />{push.busy ? 'Enabling…' : 'Enable'}</button>
    </div>
  );
}

/** Settings card: status of push on this device with enable / disable / test. */
function PushPanel() {
  const { toast } = useUi();
  const push = usePush();
  const on = async () => { try { await push.enable(); toast('Push notifications enabled on this device.'); } catch (err) { toast(err.message); } };
  const off = async () => { try { await push.disable(); toast('Push notifications turned off on this device.'); } catch (err) { toast(err.message); } };
  const test = async () => { try { const r = await push.test(); toast((r && r.message) || 'Sent.'); } catch (err) { toast(err.message); } };
  const status = !push.supported ? 'Not supported in this browser' : push.permission === 'denied' ? 'Blocked in browser settings' : push.subscribed ? 'On for this device' : 'Off on this device';
  return (
    <div className="panel" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div><b style={{ fontSize: 15 }}>Push notifications</b><div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{status}. {push.standaloneNeeded ? 'On iPhone, add Lighthouse to the Home Screen first (Share → Add to Home Screen).' : 'Tasks, approvals and announcements arrive even when the app is closed.'}</div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {push.supported && !push.subscribed && <button className="date-btn" onClick={on} disabled={push.busy || push.permission === 'denied'}><Icon name="bell" />Enable</button>}
        {push.subscribed && <button className="date-btn" onClick={test} disabled={push.busy}>Send test</button>}
        {push.subscribed && <button className="date-btn" onClick={off} disabled={push.busy} style={{ color: 'var(--danger)' }}>Turn off</button>}
      </div>
    </div>
  );
}

export function NotificationsScreen() {
  const d = useData();
  const { toast } = useUi();
  const a = d.alerts || { overdueTasks: [], overshotProjects: [] };
  const alerts = [
    ...a.overshotProjects.map(p => ({ c: 'var(--danger)', t: p.name + ' is at ' + pct(Number(p.consumed_mins), Number(p.alloc)) + '% of its allocated hours', m: 'Project overrun', go: '/projects?project=' + p.id })),
    ...a.overdueTasks.map(t => ({ c: 'var(--warn)', t: '"' + t.title + '" (' + d.taskAssigneeNames(t) + ') was due ' + fmtD(t.deadline), m: 'Overdue task', go: '/tasks?task=' + t.id }))
  ];
  const { confirm } = useUi();
  const { isAdmin } = useAuth();
  const modals = useModals();
  const push = usePush();
  const enablePush = async () => { try { await push.enable(); toast('Push notifications enabled on this device.'); } catch (err) { toast(err.message); } };
  const markAll = async () => { try { await ActivityModel.markAllRead(); await d.reload('activity'); } catch (err) { toast(err.message); } };
  const removeOne = async id => { try { await ActivityModel.remove(id); await d.reload('activity'); } catch (err) { toast(err.message); } };
  const clearAll = async () => {
    const ok = await confirm({
      title: 'Clear Notifications',
      message: 'Delete all notifications?',
      sub: 'This action cannot be undone.',
      okText: 'Clear All',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    try { await ActivityModel.clear(); await d.reload('activity'); toast('Notifications cleared.'); } catch (err) { toast(err.message); }
  };
  const pager = usePager(d.activity.items, 20);
  const when = at => (at ? new Date(at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  return (
    <div className="content">
      {push.supported && !push.subscribed && push.permission !== 'denied' && <PushBanner push={push} onEnable={enablePush} />}
      {alerts.length > 0 && (<>
        <SectionTitle>Needs attention <Chip tone="pk">{alerts.length}</Chip></SectionTitle>
        <div className="panel panel-b list simple-list notif-alert" style={{ paddingTop: 4 }}>
          {alerts.map((i, k) => <div className="row" key={k}><i className="dot" style={{ background: i.c }}></i><div>{i.t}<small>{i.m}</small></div><LinkBtn href={i.go} style={{ marginLeft: 'auto' }}>Open</LinkBtn></div>)}
        </div>
      </>)}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><SectionTitle>Notifications {d.activity.unread > 0 && <Chip tone="pu">{d.activity.unread} new</Chip>}</SectionTitle><span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>{isAdmin && <button className="date-btn" onClick={() => modals.open('announce')}><Icon name="bell" />Send announcement</button>}{d.activity.unread > 0 && <LinkBtn onClick={markAll}>Mark all read</LinkBtn>}{d.activity.items.length > 0 && <LinkBtn onClick={clearAll} style={{ color: 'var(--danger)' }}>Clear all</LinkBtn>}</span></div>
      <div className="panel panel-b list simple-list" style={{ paddingTop: 4 }}>
        {pager.items.map(x => <div className="row" key={x.id} style={x.read ? undefined : { background: 'var(--ov-04)', margin: '0 -16px', paddingLeft: 16, paddingRight: 16 }}><i className="dot" style={{ background: x.read ? 'var(--dim)' : x.kind === 'announcement' ? 'var(--pink)' : x.kind === 'task' ? 'var(--accent)' : x.kind === 'project' ? 'var(--violet)' : 'var(--info)' }}></i><div style={{ flex: 1, minWidth: 0 }}>{x.text}<small>{when(x.at)}</small></div><NotifActions n={x} /><button className="mini-btn" onClick={() => removeOne(x.id)} aria-label="Delete notification" title="Delete">✕</button></div>)}
        {!d.activity.items.length && !alerts.length && <Empty ring title="All clear">Nothing needs your attention</Empty>}
        {!d.activity.items.length && alerts.length > 0 && <Empty>No notifications yet</Empty>}
        <Pager pager={pager} compact />
      </div>
    </div>
  );
}

export function FilesScreen() {
  const d = useData();
  const { isAdmin, me } = useAuth();
  const { toast, confirm } = useUi();
  const modals = useModals();
  const del = async id => {
    const ok = await confirm({
      title: 'Remove File',
      message: 'Remove this file?',
      sub: 'This action cannot be undone.',
      okText: 'Remove',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    try { await FileModel.remove(id); await d.reload('files'); toast('File removed.'); } catch (err) { toast(err.message); }
  };
  const pager = usePager(d.files, 20);
  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><SectionTitle>Files</SectionTitle><button className="tb-btn solid" style={{ height: 34 }} onClick={() => modals.open('file')}>+ Upload file</button></div>
      <div className="panel" style={{ overflowX: 'auto' }}><table><thead><tr><th>Name</th><th>Project</th><th>Uploaded by</th><th>Size</th><th>Modified</th><th></th></tr></thead><tbody>
        {pager.items.map(f => <tr key={f.id}><td><a href={FileModel.downloadUrl(f.id)} style={{ color: 'inherit' }}>{f.name}</a></td><td>{f.project_name || '—'}</td><td>{f.uploader_name || '—'}</td><td>{f.size}</td><td>{fmtD(f.date)}</td><td>{(isAdmin || f.assigned_by === me.id) && <button className="mini-btn" onClick={() => del(f.id)} aria-label="Delete">✕</button>}</td></tr>)}
      </tbody></table>{!d.files.length && <Empty>No files yet</Empty>}<Pager pager={pager} /></div>
    </div>
  );
}

export function SettingsScreen() {
  const { me, user, isAdmin } = useAuth();
  const d = useData();
  const modals = useModals();
  const [health, setHealth] = useState(null);
  useEffect(() => { AuthModel.health().then(setHealth).catch(() => setHealth({ status: 'unreachable' })); }, []);
  const meRow = d.employees.find(e => e.id === me.id);
  const role = isAdmin ? 'Admin' : me.access === 'manager' ? 'Team leader' : 'Staff';
  const [theme, setTheme] = useTheme();
  return (
    <div className="content">
      <SectionTitle>Settings</SectionTitle>
      <div className="panel" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div><b style={{ fontSize: 15 }}>Appearance</b><div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Dark keeps the yellow accent; Light is white with a graphite accent. Saved on this device.</div></div>
        <Seg items={THEMES} value={theme} onChange={setTheme} />
      </div>
      <PushPanel />
      <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 15 }}>Your account</b><Chip tone={isAdmin ? 'pu' : 'gy'}>{role}</Chip></div>
          <div className="kv"><div><span>Name</span><b>{me.name}</b></div><div><span>Email</span><b>{me.email}</b></div><div><span>Designation</span><b>{me.role || '—'}</b></div><div><span>Department</span><b>{me.dept || '—'}</b></div><div><span>Employee ID</span><b>{me.empId || '—'}</b></div><div><span>Shift</span><b>{SHIFTS[(meRow && meRow.shift) || me.shift] || SHIFTS.day}</b></div>{(isAdmin || meRow) && meRow && meRow.salary !== undefined && <div><span>Monthly salary</span><b className="money">{inr(meRow.salary)}</b></div>}{meRow && meRow.pendingBal !== undefined && <div><span>Pending this month</span><b className="money">{inr(meRow.pendingBal)}</b></div>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="date-btn" onClick={() => modals.open('password')}><Icon name="file" />Change password</button>{isAdmin && meRow && <button className="date-btn" onClick={() => modals.open('employee', meRow.id)}><Icon name="users" />Edit my profile</button>}</div>
          <div className="kv"><div><span>API</span><b>{health ? (health.status === 'ok' ? 'Online · v' + health.version : 'Unreachable') : 'Checking…'}</b></div><div><span>Signed in as</span><b>{user ? user.email : ''}</b></div></div>
        </div>
      </div>
      {isAdmin && <AdminControls />}
    </div>
  );
}
