'use strict';
/**
 * Work time = task time that happened while the person was clocked in (breaks excluded).
 *
 * A task timer runs from "accept" until completion, day and night. Counting that raw span
 * makes a 3-day task look like 72 hours of work. So every task span is intersected with the
 * person's attendance sessions; overlapping tasks are unioned first so two tasks running at
 * the same time do not count twice.
 *
 * All wall-clock values in attendance rows are IST (date + HH:MM); task timestamps are ISO/UTC.
 */
const IST = '+05:30';
const DAY = 86400000;
const at = (date, hhmm) => Date.parse(String(date).slice(0, 10) + 'T' + hhmm + ':00' + IST);
const parseList = v => { if (!v) return []; try { const l = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(l) ? l : []; } catch (e) { return []; } };

/** Sort + merge [start, end] pairs. */
function merge(list) {
  const s = list.filter(x => x && x[1] > x[0]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of s) { const last = out[out.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else out.push([iv[0], iv[1]]); }
  return out;
}

/** Subtract merged `cuts` from merged `base`. */
function subtract(base, cuts) {
  let out = base.map(x => [x[0], x[1]]);
  for (const c of cuts) {
    const next = [];
    for (const iv of out) {
      if (c[1] <= iv[0] || c[0] >= iv[1]) { next.push(iv); continue; }
      if (c[0] > iv[0]) next.push([iv[0], c[0]]);
      if (c[1] < iv[1]) next.push([c[1], iv[1]]);
    }
    out = next;
  }
  return out;
}

/** Minutes of overlap between two merged interval lists. */
function overlapMinutes(a, b) {
  let ms = 0, i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) ms += hi - lo;
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return Math.round(ms / 60000);
}

/** Clocked-in intervals (breaks removed) for every employee in the given attendance rows. */
function attendanceIntervalsByEmp(rows, now = Date.now()) {
  const raw = {}, cuts = {};
  for (const r of rows || []) {
    if (!r || !r.emp || !r.date) continue;
    const list = (raw[r.emp] = raw[r.emp] || []);
    for (const s of parseList(r.sessions)) {
      const cin = s.clock_in || s.in, cout = s.clock_out || s.out;
      if (!cin) continue;
      const start = at(r.date, cin);
      const end = cout ? at(r.date, cout) + (Number(s.out_next_day) ? DAY : 0) : now;
      if (end > start) list.push([start, Math.min(end, now)]);
    }
    if (r.clock_in) {
      const start = at(r.date, r.clock_in);
      const end = r.clock_out ? at(r.date, r.clock_out) + (Number(r.out_next_day) ? DAY : 0) : now;
      if (end > start) list.push([start, Math.min(end, now)]);
    }
    const c = (cuts[r.emp] = cuts[r.emp] || []);
    for (const b of parseList(r.breaks)) {
      if (!b || !b.start) continue;
      const bs = at(b.startDate || r.date, b.start);
      const be = b.end ? at(b.endDate || b.startDate || r.date, b.end) : now;
      if (be > bs) c.push([bs, Math.min(be, now)]);
    }
  }
  const out = {};
  for (const emp of Object.keys(raw)) out[emp] = subtract(merge(raw[emp]), merge(cuts[emp] || []));
  return out;
}

/** [start, end] of a task's timer, or null if it never started. */
function taskSpan(t, now = Date.now()) {
  if (!t || !t.started_at) return null;
  const start = Date.parse(t.started_at);
  if (Number.isNaN(start)) return null;
  const isFrozen = (t.status === 'approval' || t.status === 'completed' || t.status === 'changes') && t.completed_at;
  const end = isFrozen ? Date.parse(t.completed_at) : (t.completed_at ? Date.parse(t.completed_at) : now);
  return end > start ? [start, Math.min(end, now)] : null;
}

const assigneesOf = t => String((t && t.assignee) || '').split(',').map(s => s.trim()).filter(Boolean);

/** Minutes one person actually worked on one task (task span ∩ their attendance). */
function taskMinutesFor(t, empId, byEmp, now = Date.now()) {
  const span = taskSpan(t, now);
  if (!span) return 0;
  return overlapMinutes([span], byEmp[empId] || []);
}

/** Total worked minutes on a task across its assignees. */
function taskWorkedMinutes(t, byEmp, now = Date.now()) {
  return assigneesOf(t).reduce((a, id) => a + taskMinutesFor(t, id, byEmp, now), 0);
}

/** Minutes a person worked on any of `tasks` (union of spans ∩ attendance), optionally clipped to [from, to]. */
function personMinutes(tasks, empId, byEmp, { from = -Infinity, to = Infinity, now = Date.now() } = {}) {
  const spans = merge(tasks.filter(t => assigneesOf(t).includes(empId)).map(t => taskSpan(t, now)).filter(Boolean).map(([a, b]) => [Math.max(a, from), Math.min(b, to)]));
  return overlapMinutes(spans, byEmp[empId] || []);
}

module.exports = { attendanceIntervalsByEmp, taskSpan, taskMinutesFor, taskWorkedMinutes, personMinutes, overlapMinutes, merge, assigneesOf };
