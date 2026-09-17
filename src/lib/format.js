// Shared formatting + calculation helpers (View helpers). Pure functions, no side effects.

// Task workflow: pipeline -> (accept) progress -> (submit) approval -> (approve) completed | (request) changes -> progress
export const STATUSES = ['pipeline', 'progress', 'approval', 'completed', 'changes'];
export const STATUS_LABEL = { pipeline: 'In Pipeline', progress: 'In Progress', approval: 'Pending Approval', completed: 'Completed', changes: 'Changes', hold: 'Changes' };
export const STATUS_CHIP = { completed: 'gr', progress: 'or', pipeline: 'bl', approval: 'pu', changes: 'pk', hold: 'pk' };
export const STATUS_COLOR = { completed: '#4ADE95', progress: '#FFB84D', pipeline: '#6FA8FF', approval: '#B48CFF', changes: '#FF7AB3', hold: '#FF7AB3' };
export const ATT = { present: ['P', 'Present', 'gr'], half: ['HD', 'Half Day', 'or'], absent: ['A', 'Absent', 'pk'], leave: ['L', 'Leave', 'bl'] };
export const PAY_TYPES = ['Salary', 'Advance', 'Bonus', 'Reimbursement', 'Fine'];
export const TASK_TYPES = ['Shoot', 'Edit', 'Design', 'Content', 'Social Media', 'Client Call', 'Other'];
export const SHIFTS = { day: 'Day · 11 am – 7 pm', evening: 'Evening · 2 pm – 10 pm', ten: '10 am – 6 pm', noon: '12 pm – 5 pm', flexible: 'Flexible' };
/** Human label for a shift key from workspace settings (falls back to the built-in names). */
export const shiftDisplay = (key, settings) => { const k = key || 'day'; const s = settings && settings.shifts && settings.shifts[k]; return s ? (s.display || s.label) : (SHIFTS[k] || k); };
export const ACCESS_LABEL = { admin: 'Admin (full access)', manager: 'Team leader (projects + tasks)', staff: 'Staff (own work)' };
const AV = ['p', 'g', 'r', 'b', 'br', 'o', 't'];

const pad2 = n => String(n).padStart(2, '0');
/** Local calendar date (never UTC), so it matches the server's Asia/Kolkata day. */
export const isoLocal = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
export const todayISO = () => isoLocal(new Date());
export const thisMonth = () => todayISO().slice(0, 7);
export const monthKey = iso => (iso || '').slice(0, 7);
export const fmtD = iso => (iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');
export const fmtDY = iso => (iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const monthLabel = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
export const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
export const hm = mins => { mins = Math.round(mins || 0); return String(Math.floor(mins / 60)).padStart(2, '0') + 'h ' + String(mins % 60).padStart(2, '0') + 'm'; };
/** Hours + minutes, e.g. "8h 20m" (no leading zero on hours). */
export const hrs1 = mins => { const m = Math.max(0, Math.round(Number(mins) || 0)); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
/** Rounds a number to at most 2 decimal places (eliminating floating-point artifacts like 3.030000000000002 -> 3.03). */
export const round2 = n => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const toMins = s => { if (!s || !s.includes(':')) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
/** Minutes of a punch: finished (handles clock-out after midnight, sessions/rechecking) or live until now. */
/** Breaks recorded on a punch: [{ start, end?, mins? }] */
export const breaksOf = p => { if (!p || !p.breaks) return []; try { const l = typeof p.breaks === 'string' ? JSON.parse(p.breaks) : p.breaks; return Array.isArray(l) ? l : []; } catch (e) { return []; } };
export const openBreak = p => breaksOf(p).find(b => b && b.start && !b.end) || null;
/** Break minutes so far (closed breaks + the running one). */
export const breakMinutes = (p, now = new Date()) => { let m = Number(p && p.break_mins) || 0; const ob = openBreak(p); if (ob) m += Math.max(0, Math.round((now - new Date((ob.startDate || p.date) + 'T' + ob.start + ':00')) / 60000)); return m; };
export const punchMinutes = (punch, now = new Date()) => {
  if (!punch || !punch.clock_in) return 0;
  let total = 0;
  if (punch.sessions) {
    try {
      const list = typeof punch.sessions === 'string' ? JSON.parse(punch.sessions) : punch.sessions;
      if (Array.isArray(list)) {
        for (const s of list) {
          if (s && s.mins !== undefined && s.mins !== null) {
            total += Number(s.mins) || 0;
          } else if (s && (s.clock_in || s.in) && (s.clock_out || s.out)) {
            const cin = s.clock_in || s.in;
            const cout = s.clock_out || s.out;
            const [h1, m1] = cin.split(':').map(Number);
            const [h2, m2] = cout.split(':').map(Number);
            total += Math.max(0, (h2 * 60 + m2) + (Number(s.out_next_day) ? 1440 : 0) - (h1 * 60 + m1));
          }
        }
      }
    } catch (e) { /* ignore */ }
  }
  const a = toMins(punch.clock_in);
  if (punch.clock_out) {
    total += Math.max(0, toMins(punch.clock_out) + (Number(punch.out_next_day) ? 1440 : 0) - a);
  } else {
    const nowM = now.getHours() * 60 + now.getMinutes();
    const startedYesterday = punch.date && punch.date < isoLocal(now);
    total += Math.max(0, nowM + (startedYesterday ? 1440 : 0) - a);
  }
  return Math.max(0, total - breakMinutes(punch, now));
};
/** Minutes worked so far today from a punch (live while clocked in). */
export const workedToday = (punch, now = new Date()) => punchMinutes(punch, now);
export const MODE_LABEL = { office: 'Office', wfh: 'Work from home', field: 'On field' };
export const hhmm = d => { let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0'); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + ':' + m + ' ' + ap; };
export const nowHHMM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
export const ini = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
export const avFor = n => AV[[...String(n || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const inr = n => INR.format(Math.round(Number(n) || 0));
export const minsBetween = (a, b) => { if (!a || !b) return 0; const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1)); };
export const overdue = t => t.status !== 'completed' && t.deadline && t.deadline < todayISO();
export const attStatus = a => (a ? (a.status || (a.clock_in ? 'present' : '')) : '');
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : a > 0 ? 100 : 0);
export const workdaysIn = (month, upToToday = true) => {
  const [y, mo] = month.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  const lim = upToToday && month === thisMonth() ? new Date().getDate() : last;
  let n = 0;
  for (let i = 1; i <= lim; i++) if (new Date(y, mo - 1, i).getDay() !== 0) n++;
  return n;
};
export const nextOccurrence = mmdd => { const y = new Date().getFullYear(); let d = new Date(y + '-' + mmdd + 'T00:00:00'); const t = new Date(todayISO() + 'T00:00:00'); if (d < t) d = new Date((y + 1) + '-' + mmdd + 'T00:00:00'); return d; };
export const daysUntil = d => Math.round((d - new Date(todayISO() + 'T00:00:00')) / 86400000);
export const whenLabel = d => { const n = daysUntil(d); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); };
export const assigneeIds = t => String(t.assignee || '').split(',').map(s => s.trim()).filter(Boolean);
export const managerIds = p => {
  if (!p || !p.manager) return [];
  if (Array.isArray(p.manager)) return p.manager;
  return String(p.manager).split(',').map(s => s.trim()).filter(Boolean);
};
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** Minutes taken on a task: stored when completed, live (since accept) while in progress. */
export const takenMins = (t, now = Date.now()) => {
  if (!t) return 0;
  if (t.worked_mins !== undefined && t.worked_mins !== null) return Number(t.worked_mins) || 0; // only time while clocked in
  if (t.status === 'completed') return Number(t.taken_mins) || 0;
  if (t.started_at) return Math.max(0, Math.round((now - new Date(t.started_at).getTime()) / 60000));
  return 0;
};
export const isRunning = t => Boolean(t && t.started_at && t.status !== 'completed');

/** Leave days (kind 'leave') a request uses inside a calendar year, skipping week-off days. */
export const leaveDaysIn = (l, year, weekOff = [0]) => {
  if (!l || l.kind === 'wfh') return 0;
  const s = new Date(String(l.from_date).slice(0, 10) + 'T00:00:00'), e = new Date(String(l.to_date).slice(0, 10) + 'T00:00:00');
  let n = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (d.getFullYear() === year && !weekOff.includes(d.getDay())) n++;
  return n;
};
/** Used / pending / left for one person this year. */
export const leaveBalance = (leaves, empId, quota = 12, weekOff = [0], year = new Date().getFullYear()) => {
  let used = 0, pending = 0;
  for (const l of leaves || []) {
    if (l.emp !== empId || l.kind === 'wfh') continue;
    const st = l.status || 'approved';
    if (st === 'approved') used += leaveDaysIn(l, year, weekOff);
    else if (st === 'pending') pending += leaveDaysIn(l, year, weekOff);
  }
  return { quota, used, pending, left: Math.max(0, quota - used), year };
};

export const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Week-off days for a person: their own setting, else the workspace default (settings.weekOff). */
export const weekOffOf = (e, fallback = [0]) => {
  const raw = e && e.week_off != null ? String(e.week_off).trim() : '';
  if (!raw) return Array.isArray(fallback) && fallback.length ? fallback : [0];
  const days = raw.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
  return days.length ? days : fallback;
};
export const weekOffLabel = (e, fallback) => weekOffOf(e, fallback).map(d => WEEK_DAYS[d]).join(', ');

/** Next sequential employee code, e.g. LH0050 -> LH0051 */
export const nextEmpCode = (employees = []) => {
  let max = 0;
  for (const emp of (employees || [])) {
    const raw = String((emp && (emp.emp_id || emp.empId)) || '').trim();
    const m = raw.match(/^LH(\d+)$/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (Number.isFinite(num) && num > max) max = num;
    }
  }
  return 'LH' + String(max + 1).padStart(4, '0');
};

