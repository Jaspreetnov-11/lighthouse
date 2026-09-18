'use strict';
/**
 * Monthly performance score per employee, built from completed tasks.
 *
 *   points per task = 10 × type weight × timeliness × efficiency   (split equally between assignees)
 *
 *   type weight  – creative work counts more (Shoot / Edit / Design 1.5, Content 1.3, Social Media 1.0,
 *                  Client Call 0.8, Other 0.7). Admins can override via settings.taskWeights.
 *   timeliness   – delivered on/before the deadline ×1.5, up to 2 days late ×0.9, later ×0.6, no deadline ×1.0
 *   efficiency   – time taken vs the hours allocated to the task: well under ×1.25, under ×1.1,
 *                  slightly over ×1.0, over ×0.9, far over ×0.75 (×1.0 when nothing was tracked)
 */
const taskModel = require('../models/task.model');
const employeeModel = require('../models/employee.model');
const settingsService = require('./settings.service');
const db = require('../config/db');
const attendanceModel = require('../models/attendance.model');
const worktime = require('./worktime.service');
const { thisMonth } = require('../utils/calculations');

const DEFAULT_WEIGHTS = { Shoot: 1.5, Edit: 1.5, Design: 1.5, Content: 1.3, 'Social Media': 1.0, 'Client Call': 0.8, Other: 0.7 };
const BASE = 10;

function weightsNow() {
  const s = settingsService.get() || {};
  return { ...DEFAULT_WEIGHTS, ...((s.taskWeights && typeof s.taskWeights === 'object') ? s.taskWeights : {}) };
}

const daysLate = (done, deadline) => Math.round((new Date(done + 'T00:00:00') - new Date(deadline + 'T00:00:00')) / 86400000);
const istDate = iso => { const d = new Date(new Date(iso).getTime() + 330 * 60000); return d.toISOString().slice(0, 10); };
/** The day the work was handed in: submit-for-approval time when known, else the approval date. */
const deliveredOn = t => (t.completed_at ? istDate(t.completed_at) : String(t.completed || '').slice(0, 10));

function timelinessOf(t) {
  const done = deliveredOn(t);
  if (!t.deadline || !done) return { f: 1.0, onTime: null };
  const late = daysLate(done, String(t.deadline).slice(0, 10));
  if (late <= 0) return { f: 1.5, onTime: true };
  if (late <= 2) return { f: 0.9, onTime: false };
  return { f: 0.6, onTime: false };
}

function efficiencyOf(t) {
  const est = Number(t.mins) || 0, taken = Number(t.taken_mins) || 0;
  if (!est || !taken) return null; // nothing tracked
  const r = taken / est;
  if (r <= 0.75) return 1.25;
  if (r <= 1) return 1.1;
  if (r <= 1.25) return 1.0;
  if (r <= 1.5) return 0.9;
  return 0.75;
}

/** Score one task: volume points (creative work weighs more) plus its timeliness / efficiency readings. */
function scoreTask(t, weights) {
  const w = weights[t.type] !== undefined ? Number(weights[t.type]) : (weights.Other || 0.7);
  const tl = timelinessOf(t);
  const ef = efficiencyOf(t);
  return { points: BASE * w, weight: w, onTime: tl.onTime, efficiency: ef, creative: w >= 1.3 };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Software half of the score (50):
 *   volume 20      – weighted task points against the month's best (never less than a bar of half a
 *                    standard task per working day, so one small task cannot earn full marks)
 *   on time 15     – share of delivered tasks handed in on or before the deadline (submit time counts);
 *                    on-time and efficiency reach full weight at 4 delivered tasks
 *   efficiency 10  – time worked vs hours allocated (only time while clocked in, in progress)
 *   attendance 5   – days attended out of working days, minus 0.25 per late arrival
 * Delivered = approved this month, or submitted and waiting for approval.
 */
async function computeMonth(month = thisMonth()) {
  const weights = weightsNow();
  const prevMonth = (() => { const [y, m] = month.split('-').map(Number); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); })();
  const [rawTasks, employees, attRows, team] = await Promise.all([
    taskModel.findAll(), employeeModel.findAll({}, { orderBy: 'name ASC' }),
    attendanceModel.getSince(prevMonth + '-01').catch(() => []),
    require('./attendance.service').getTeamSummary(month).catch(() => null)
  ]);
  const attByEmp = worktime.attendanceIntervalsByEmp(attRows);
  const tasks = rawTasks.map(t => (t.started_at ? { ...t, taken_mins: worktime.taskWorkedMinutes(t, attByEmp) } : t));
  const attStats = Object.fromEntries(((team && team.staff) || []).map(x => [x.id, x]));
  const workdays = (team && team.workdaysSoFar) || 1;

  const byEmp = {};
  for (const e of employees) byEmp[e.id] = { id: e.id, name: e.name, dept: e.dept || '', role: e.role || '', ini: e.ini || '', av: e.av || '', points: 0, tasks: 0, awaiting: 0, onTime: 0, withDeadline: 0, creative: 0, takenMins: 0, tracked: 0, effSum: 0 };
  for (const t of tasks) {
    const delivered = (t.status === 'completed' && String(t.completed || '').slice(0, 7) === month) || (t.status === 'approval' && deliveredOn(t).slice(0, 7) === month);
    if (!delivered) continue;
    const ids = String(t.assignee || '').split(',').map(x => x.trim()).filter(id => byEmp[id]);
    if (!ids.length) continue;
    const sc = scoreTask(t, weights);
    for (const id of ids) {
      const e = byEmp[id];
      e.points += sc.points / ids.length;
      e.tasks += 1;
      if (t.status === 'approval') e.awaiting += 1;
      if (sc.onTime !== null) { e.withDeadline += 1; if (sc.onTime) e.onTime += 1; }
      if (sc.creative) e.creative += 1;
      if (sc.efficiency !== null) { e.effSum += sc.efficiency; e.tracked += 1; e.takenMins += Number(t.taken_mins) || 0; }
    }
  }

  const ratings = await db.all('SELECT emp, marks, note FROM lh_ratings WHERE month = ?', [month]).catch(() => []);
  const rated = Object.fromEntries(ratings.map(r => [r.emp, { marks: clamp(Number(r.marks) || 0, 0, 50), note: r.note || '' }]));
  const maxPoints = Math.max(0, ...Object.values(byEmp).map(e => e.points));
  const bar = Math.max(maxPoints, BASE * 0.5 * workdays); // half a standard task per working day

  const r1 = v => Math.round(v * 10) / 10;
  const list = Object.values(byEmp).map(e => {
    const st = attStats[e.id];
    const volume = bar > 0 ? 20 * Math.min(1, e.points / bar) : 0;
    // Quality needs a few tasks behind it: full weight from 4 delivered tasks, proportionally less below that
    const conf = Math.min(1, e.tasks / 4);
    const onTimeScore = conf * (e.withDeadline ? 15 * (e.onTime / e.withDeadline) : (e.tasks ? 9 : 0));
    const effScore = conf * (e.tracked ? 10 * clamp(((e.effSum / e.tracked) - 0.75) / 0.5, 0, 1) : (e.tasks ? 5 : 0));
    let attScore = 0;
    // Attended days out of the days that were due (absents are counted from the attendance start date)
    if (st) { const attended = (st.present || 0) + (st.half || 0) * 0.5; const due = attended + (st.absent || 0) + (st.half || 0) * 0.5; attScore = due > 0 ? clamp(5 * (attended / due) - 0.25 * (st.late || 0), 0, 5) : 0; }
    const auto = r1(volume + onTimeScore + effScore + attScore);
    const rt = rated[e.id];
    const adminMarks = rt ? rt.marks : null;
    return {
      ...e, points: r1(e.points), auto, adminMarks, adminNote: rt ? rt.note : '', total: r1(auto + (adminMarks || 0)),
      breakdown: { volume: r1(volume), onTime: r1(onTimeScore), efficiency: r1(effScore), attendance: r1(attScore) },
      onTimePct: e.withDeadline ? Math.round((e.onTime / e.withDeadline) * 100) : null,
      avgTakenMins: e.tracked ? Math.round(e.takenMins / e.tracked) : 0
    };
  })
    .sort((x, y) => y.total - x.total || y.auto - x.auto || y.tasks - x.tasks || x.name.localeCompare(y.name))
    .map((e, i) => ({ ...e, rank: (e.tasks > 0 || e.adminMarks !== null) ? i + 1 : null }));
  // ranks only among people with delivered work or admin marks, numbered without gaps
  let n = 0; for (const e of list) if (e.rank !== null) e.rank = ++n;
  return { month, base: BASE, weights, maxPoints: r1(maxPoints), bar: r1(bar), list };
}

/** Admin marks (0-50) for one person for a month. */
async function rate({ emp, month, marks, note = '', by = '' }) {
  const m = Math.min(50, Math.max(0, Number(marks) || 0));
  const existing = await db.get('SELECT id FROM lh_ratings WHERE emp = ? AND month = ?', [emp, month]);
  const now = new Date().toISOString();
  if (existing) await db.run('UPDATE lh_ratings SET marks = ?, note = ?, rated_by = ?, updated_at = ? WHERE id = ?', [m, String(note).slice(0, 300), by, now, existing.id]);
  else await db.run('INSERT INTO lh_ratings (id, emp, month, marks, note, rated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['r_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4), emp, month, m, String(note).slice(0, 300), by, now]);
  return { emp, month, marks: m, note };
}

module.exports = { computeMonth, rate, scoreTask, DEFAULT_WEIGHTS };
