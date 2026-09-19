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

/** Work spans stored on the task: [{ s, e? }] — one per "in progress" period. */
function parseSpans(t) { const v = t && t.spans; if (!v) return []; try { const l = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(l) ? l : []; } catch (e) { return []; } }

/**
 * Merged [start, end] periods the task was actually being worked on (status "progress"), clipped to range.
 * The timer stops when the task is submitted for approval and resumes only if changes are requested.
 * Tasks from before spans existed fall back to started_at → completed_at (or now while in progress).
 */
function taskSpans(t, now = Date.now(), { from = -Infinity, to = Infinity, empId = null } = {}) {
  if (!t) return [];
  let raw = parseSpans(t);
  if (empId) {
    const hasTagged = raw.some(x => x && x.u);
    if (hasTagged) {
      raw = raw.filter(x => !x.u || x.u === empId);
    }
  }
  let list = raw.map(x => { const s = Date.parse(x.s); const e = x.e ? Date.parse(x.e) : (t.status === 'progress' ? now : s); return [s, e]; }).filter(x => !Number.isNaN(x[0]) && !Number.isNaN(x[1]));
  if (!list.length && t.started_at) {
    const s = Date.parse(t.started_at);
    const e = t.completed_at ? Date.parse(t.completed_at) : (t.status === 'progress' ? now : (Date.parse(t.updated_at) || now));
    if (!Number.isNaN(s) && !Number.isNaN(e)) list = [[s, e]];
  }
  return merge(list.map(([a, b]) => [Math.max(a, from), Math.min(b, to, now)]));
}

/** First start / last end of the work spans (null if never started). */
function taskSpan(t, now = Date.now()) { const l = taskSpans(t, now); return l.length ? [l[0][0], l[l.length - 1][1]] : null; }

const assigneesOf = t => String((t && t.assignee) || '').split(',').map(s => s.trim()).filter(Boolean);

/** Minutes one person actually worked on one task (work spans ∩ their attendance). */
function taskMinutesFor(t, empId, byEmp, now = Date.now(), range) {
  const r = typeof range === 'object' && range !== null ? range : {};
  const spans = taskSpans(t, now, { ...r, empId });
  if (!byEmp) {
    return Math.round(spans.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0) / 60000);
  }
  return overlapMinutes(spans, byEmp[empId] || []);
}

/** Total worked minutes on a task across its assignees. */
function taskWorkedMinutes(t, byEmp, now = Date.now(), range) {
  return assigneesOf(t).reduce((a, id) => a + taskMinutesFor(t, id, byEmp, now, range), 0);
}

/** Minutes a person worked on any of `tasks` (union of spans ∩ attendance), optionally clipped to [from, to]. */
function personMinutes(tasks, empId, byEmp, { from = -Infinity, to = Infinity, now = Date.now() } = {}) {
  const spans = merge(tasks.filter(t => assigneesOf(t).includes(empId)).flatMap(t => taskSpans(t, now, { from, to, empId })));
  if (!byEmp) {
    return Math.round(spans.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0) / 60000);
  }
  return overlapMinutes(spans, byEmp[empId] || []);
}

module.exports = { attendanceIntervalsByEmp, parseSpans, taskSpans, taskSpan, taskMinutesFor, taskWorkedMinutes, personMinutes, overlapMinutes, merge, assigneesOf };
