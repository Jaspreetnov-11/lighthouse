'use strict';

const attendanceModel = require('../models/attendance.model');
const employeeModel = require('../models/employee.model');
const leaveModel = require('../models/leave.model');
const activityModel = require('../models/activity.model');
const AppError = require('../utils/appError');
const { todayISO, thisMonth, nowHHMM, workdaysIn, isLate, otHoursFor, punchMinutes, shiftOf, hoursPerDay, toMins, weekOff, weekOffOf, round2 } = require('../utils/calculations');
const holidayModel = require('../models/holiday.model');
const yesterdayOf = iso => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const MODES = ['office', 'wfh', 'field'];
const parseBreaks = v => { if (!v) return []; try { const l = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(l) ? l : []; } catch (e) { return []; } };

const settingsService = require('./settings.service');
const db = require('../config/db');

const newId = p => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

// ---- selfies: small JPEG/PNG data URLs stored with the punch, purged after N days
const SELFIE_MAX_BYTES = 80 * 1024;
function cleanSelfie(selfie, required, label) {
  const s = typeof selfie === 'string' ? selfie.trim() : '';
  if (!s) { if (required) throw new AppError(`A selfie is required to ${label}. Allow the camera and try again.`, 400); return null; }
  const m = s.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new AppError('Selfie must be a JPEG or PNG image.', 400);
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > SELFIE_MAX_BYTES) throw new AppError('Selfie is too large. Please retake it.', 400);
  return s;
}
let lastPurge = '';
async function purgeOldSelfies() {
  const today = todayISO();
  if (lastPurge === today) return;
  lastPurge = today;
  const days = settingsService.get().selfieRetentionDays || 30;
  const cutoff = new Date(today + 'T00:00:00Z'); cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const iso = cutoff.toISOString().slice(0, 10);
  try {
    const r = await db.run('UPDATE lh_attendance SET in_selfie = NULL, out_selfie = NULL WHERE date < ? AND (in_selfie IS NOT NULL OR out_selfie IS NOT NULL)', [iso]);
    if (r.changes) console.log(`[SELFIES] purged ${r.changes} record(s) older than ${days} days`);
  } catch (e) { console.error('[SELFIES] purge failed:', e.message); }
}

/** Pure computation: month stats from preloaded rows. */
function computeMonthStats(rows, leaves, month, opts = {}) {
  const holidaySet = new Set((opts.holidays || []).map(h => String(h.date || h).slice(0, 10)));
  const wo = Array.isArray(opts.weekOff) && opts.weekOff.length ? opts.weekOff : weekOff();
  const startFrom = [opts.joined ? String(opts.joined).slice(0, 10) : '', String((settingsService.get() || {}).attendanceFrom || '').slice(0, 10)].filter(Boolean).sort().pop() || '';
  let present = 0, half = 0, absent = 0, late = 0, otHours = 0, fineHours = 0, totalWorkedMinutes = 0, daysWithOut = 0, breakMinutes = 0;

  for (const r of rows) {
    const st = r.status || (r.clock_in ? 'present' : '');
    if (st === 'present') present++;
    else if (st === 'half') half++;
    else if (st === 'absent') absent++;
    if (Number(r.late)) late++;
    otHours += Number(r.ot_hours) || 0;
    fineHours += Number(r.fine_hours) || 0;
    breakMinutes += Number(r.break_mins) || 0;
    if (r.clock_in && r.clock_out) {
      totalWorkedMinutes += punchMinutes(r);
      daysWithOut++;
    }
  }

  let leaveDays = 0;
  for (const l of leaves) {
    if (l.status && l.status !== 'approved') continue;
    if (l.kind === 'wfh') continue; // work-from-home days are working days, not leave
    const start = new Date(String(l.from_date).slice(0, 10) + 'T00:00:00');
    const end = new Date(String(l.to_date).slice(0, 10) + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (iso.slice(0, 7) === month && !wo.includes(d.getDay())) leaveDays++;
    }
  }

  // Absent = a working day that has already passed (before today) with no punch, no approved leave and no holiday.
  const today = todayISO();
  const punched = new Set(rows.filter(r => r.clock_in || r.status).map(r => String(r.date).slice(0, 10)));
  const leaveSet = new Set();
  for (const l of leaves) {
    if ((l.status && l.status !== 'approved') || l.kind === 'wfh') continue;
    const a = new Date(String(l.from_date).slice(0, 10) + 'T00:00:00'), b = new Date(String(l.to_date).slice(0, 10) + 'T00:00:00');
    for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) leaveSet.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  const [yy, mm] = month.split('-').map(Number);
  const lastDay = new Date(yy, mm, 0).getDate();
  let missed = 0;
  const missedDays = [];
  for (let d = 1; d <= lastDay; d++) {
    const iso = month + '-' + String(d).padStart(2, '0');
    if (iso >= today) break;
    if (startFrom && iso < startFrom) continue;
    if (wo.includes(new Date(yy, mm - 1, d).getDay()) || holidaySet.has(iso)) continue;
    if (punched.has(iso) || leaveSet.has(iso)) continue;
    missed++; missedDays.push(iso);
  }
  absent += missed;
  const workdaysSoFar = workdaysIn(month, true, wo);
  const workdaysTotal = workdaysIn(month, false, wo);
  const unaccounted = Math.max(0, workdaysSoFar - present - half - absent - leaveDays);
  const avgWorkingMinutes = daysWithOut > 0 ? Math.round(totalWorkedMinutes / daysWithOut) : 0;

  otHours = round2(otHours);
  fineHours = round2(fineHours);

  // Per-day series for charts (date, minutes worked, status, late, mode)
  const days = rows.map(r => ({ date: r.date, mins: r.clock_in && r.clock_out ? punchMinutes(r) : 0, open: Boolean(r.clock_in && !r.clock_out), status: r.status || (r.clock_in ? 'present' : ''), late: Number(r.late) ? 1 : 0, mode: r.mode || 'office', ot: round2(r.ot_hours), breakMins: Number(r.break_mins) || 0 })).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    month, present, half, absent, late, leave: leaveDays, otHours, fineHours, days, breakMinutes, missedDays,
    workdaysSoFar, workdaysTotal, unaccounted, avgWorkingMinutes, totalWorkedMinutes,
    expectedMinutesSoFar: workdaysSoFar * hoursPerDay() * 60,
    expectedMinutesTotal: workdaysTotal * hoursPerDay() * 60
  };
}

class AttendanceService {
  async processClockIn(empId, { lat = null, lng = null, acc = null, addr = '', mode = 'office', selfie = '' } = {}) {
    const today = todayISO();
    const [existing, emp] = await Promise.all([
      attendanceModel.findByEmpAndDate(empId, today),
      employeeModel.findById(empId)
    ]);

    // Prevent duplicate clock-in only if currently clocked in for today
    if (existing && existing.clock_in && !existing.clock_out) {
      throw new AppError('Already clocked in right now. Clock out first.', 400);
    }

    // Auto-close any dangling open punches from previous days so employee is never blocked
    const dangling = await db.all(
      "SELECT * FROM lh_attendance WHERE emp = ? AND date < ? AND clock_in <> '' AND (clock_out = '' OR clock_out IS NULL)",
      [empId, today]
    );
    for (const d of dangling) {
      const s = shiftOf(emp ? emp.shift : 'day');
      let autoOut = s.end || '19:00';
      const inMins = toMins(d.clock_in) || 0;
      const endMins = toMins(autoOut) || (19 * 60);
      if (inMins >= endMins) {
        const standardMins = hoursPerDay() * 60;
        const target = Math.min(inMins + standardMins, 23 * 60 + 59);
        const hh = String(Math.floor(target / 60)).padStart(2, '0');
        const mm = String(target % 60).padStart(2, '0');
        autoOut = `${hh}:${mm}`;
      }
      const note = (d.note ? d.note + ' · ' : '') + 'Auto-closed at shift end';
      await attendanceModel.update(d.id, { clock_out: autoOut, note });
    }

    const inSelfie = cleanSelfie(selfie, settingsService.get().selfieOnClockIn, 'clock in');
    purgeOldSelfies();

    if (!MODES.includes(mode)) mode = 'office';
    // An approved work-from-home request for today switches the punch to WFH mode
    const wfh = await db.get("SELECT id FROM lh_leaves WHERE emp = ? AND kind = 'wfh' AND from_date <= ? AND to_date >= ? AND (status = 'approved' OR status = '' OR status IS NULL) LIMIT 1", [empId, today, today]);
    if (wfh && mode === 'office') mode = 'wfh';

    const timeStr = nowHHMM();
    const shift = emp ? emp.shift : 'day';

    // Parse existing sessions
    let sessions = [];
    if (existing && existing.sessions) {
      try {
        sessions = typeof existing.sessions === 'string' ? JSON.parse(existing.sessions) : existing.sessions;
        if (!Array.isArray(sessions)) sessions = [];
      } catch (e) { sessions = []; }
    }

    // Is this a re-checkin? (User already clocked in & out previously today)
    const isRecheck = Boolean(existing && existing.clock_in && existing.clock_out);
    if (isRecheck) {
      // Archive previous session into sessions array
      const prevMins = punchMinutes({ clock_in: existing.clock_in, clock_out: existing.clock_out, out_next_day: existing.out_next_day });
      sessions.push({
        in: existing.clock_in,
        out: existing.clock_out,
        clock_in: existing.clock_in,
        clock_out: existing.clock_out,
        mins: prevMins,
        mode: existing.mode || 'office',
        in_lat: existing.in_lat,
        in_lng: existing.in_lng,
        in_addr: existing.in_addr,
        out_lat: existing.out_lat,
        out_lng: existing.out_lng,
        out_addr: existing.out_addr,
        in_selfie: existing.in_selfie,
        out_selfie: existing.out_selfie,
        out_next_day: existing.out_next_day || 0
      });
    }

    // Only the first punch checks if the user is late for the shift
    const late = (existing && existing.clock_in) ? (Number(existing.late) || 0) : (isLate(shift, timeStr) ? 1 : 0);

    const record = await attendanceModel.upsertPunch({
      id: existing ? existing.id : newId('a_'),
      emp: empId,
      date: today,
      clock_in: timeStr,
      clock_out: '',
      mode: mode || 'office',
      status: 'present',
      late,
      sessions: JSON.stringify(sessions),
      ot_hours: existing ? existing.ot_hours : 0,
      fine_hours: existing ? existing.fine_hours : 0,
      note: existing ? existing.note : '',
      in_lat: lat, in_lng: lng, in_acc: acc, in_addr: addr || '',
      in_selfie: inSelfie,
      out_lat: null, out_lng: null, out_acc: null, out_addr: '',
      out_selfie: null, out_next_day: 0
    });

    const sessionNum = sessions.length + 1;
    const recheckMsg = isRecheck ? ` (re-checkin, Session ${sessionNum})` : '';
    await activityModel.log(`${emp ? emp.name : 'Employee'} clocked in${recheckMsg} at ${timeStr}${late && !isRecheck ? ' (late)' : ''}${mode === 'wfh' ? ' · work from home' : mode === 'field' ? ' · on field' : ''}${addr ? ' from ' + addr : ''}`);
    return record;
  }

  async processClockOut(empId, { lat = null, lng = null, acc = null, addr = '', selfie = '' } = {}) {
    const today = todayISO();
    const [todays, emp] = await Promise.all([
      attendanceModel.findByEmpAndDate(empId, today),
      employeeModel.findById(empId)
    ]);

    let existing = null;
    if (todays && todays.clock_in && !todays.clock_out) {
      existing = todays;
    } else if (todays && todays.clock_out) {
      throw new AppError('Already clocked out. Tap Re-Clock In if you want to start another session.', 400);
    } else {
      // Check if there is an open overnight shift from yesterday
      const openYesterday = await attendanceModel.findOpenPunch(empId, yesterdayOf(today));
      if (openYesterday && openYesterday.date !== today) {
        existing = openYesterday;
      }
    }

    if (!existing || !existing.clock_in) {
      throw new AppError('You have not clocked in yet today.', 400);
    }
    const outSelfie = cleanSelfie(selfie, settingsService.get().selfieOnClockOut, 'clock out');

    const timeStr = nowHHMM();
    const nextDay = existing.date !== today;
    const shift = emp ? emp.shift : 'day';

    // Calculate total worked minutes across all sessions
    let sessions = [];
    if (existing.sessions) {
      try {
        sessions = typeof existing.sessions === 'string' ? JSON.parse(existing.sessions) : existing.sessions;
        if (!Array.isArray(sessions)) sessions = [];
      } catch (e) { sessions = []; }
    }

    // Temporary record to compute cumulative worked minutes
    const tempRecord = { ...existing, clock_out: timeStr, out_next_day: nextDay ? 1 : 0 };
    const workedMins = punchMinutes(tempRecord);

    // Overtime calculation:
    // Overtime is automatic (when enabled): hours after the shift's OT threshold or hours exceeding daily standard
    let ot = 0;
    if (settingsService.get().autoOvertime !== false) {
      const standardMins = hoursPerDay() * 60;
      const otFromHours = workedMins > standardMins ? round2((workedMins - standardMins) / 60) : 0;
      const otFromShift = otHoursFor(shift, timeStr, nextDay);
      ot = round2(Math.max(Number(existing.ot_hours) || 0, otFromHours, otFromShift));
    } else {
      ot = round2(existing.ot_hours);
    }

    const record = await attendanceModel.update(existing.id, {
      clock_out: timeStr,
      out_next_day: nextDay ? 1 : 0,
      ot_hours: ot,
      out_lat: lat,
      out_lng: lng,
      out_acc: acc,
      out_addr: addr || '',
      out_selfie: outSelfie
    });

    const sessionCount = sessions.length + 1;
    const sessionText = sessionCount > 1 ? ` across ${sessionCount} sessions` : '';
    await activityModel.log(`${emp ? emp.name : 'Employee'} clocked out at ${timeStr} (${Math.floor(workedMins / 60)}h ${workedMins % 60}m worked${sessionText}${ot ? ', OT ' + ot + 'h' : ''})`);
    return record;
  }

  /** Start a break on the open punch (today's or last night's). */
  async startBreak(empId) {
    const today = todayISO();
    const open = await attendanceModel.findOpenPunch(empId, yesterdayOf(today));
    if (!open) throw new AppError('Clock in first to take a break.', 400);
    const breaks = parseBreaks(open.breaks);
    if (breaks.some(b => b && b.start && !b.end)) throw new AppError('You are already on a break.', 400);
    breaks.push({ start: nowHHMM(), startDate: today });
    return attendanceModel.update(open.id, { breaks: JSON.stringify(breaks) });
  }

  /** End the current break; its minutes come off worked and productive hours. */
  async endBreak(empId) {
    const today = todayISO();
    const open = await attendanceModel.findOpenPunch(empId, yesterdayOf(today));
    if (!open) throw new AppError('You are not clocked in.', 400);
    const breaks = parseBreaks(open.breaks);
    const cur = breaks.find(b => b && b.start && !b.end);
    if (!cur) throw new AppError('You are not on a break.', 400);
    const end = nowHHMM();
    const mins = Math.max(1, Math.round((new Date(today + 'T' + end + ':00') - new Date((cur.startDate || open.date) + 'T' + cur.start + ':00')) / 60000));
    cur.end = end; cur.endDate = today; cur.mins = mins;
    const total = breaks.reduce((a, b) => a + (Number(b.mins) || 0), 0);
    const rec = await attendanceModel.update(open.id, { breaks: JSON.stringify(breaks), break_mins: total });
    return { ...rec, lastBreakMins: mins };
  }

  computeMonthStats(rows, leaves, month) {
    return computeMonthStats(rows, leaves, month);
  }

  async getMonthStats(empId, month = thisMonth()) {
    const [rows, leaves, holidays, emp] = await Promise.all([
      attendanceModel.getMonthAttendance(empId, month),
      leaveModel.getEmployeeLeaves(empId, month),
      holidayModel.findAll().catch(() => []),
      employeeModel.findById(empId)
    ]);
    return computeMonthStats(rows, leaves, month, { holidays, joined: emp ? emp.joined : '', weekOff: weekOffOf(emp) });
  }

  /** Per-employee month summary for the whole team (dashboard + reports). */
  async getTeamSummary(month = thisMonth()) {
    const [employees, rows, leaves, holidays] = await Promise.all([
      employeeModel.findAll({}, { orderBy: 'name ASC' }),
      attendanceModel.getMonthAttendanceAll(month),
      leaveModel.getLeavesInMonthAll(month),
      holidayModel.findAll().catch(() => [])
    ]);
    const byEmp = {}; for (const r of rows) (byEmp[r.emp] = byEmp[r.emp] || []).push(r);
    const lvEmp = {}; for (const l of leaves) (lvEmp[l.emp] = lvEmp[l.emp] || []).push(l);
    const staff = employees.map(e => ({
      id: e.id, name: e.name, dept: e.dept, emp_id: e.emp_id, shift: e.shift || 'day', shiftLabel: shiftOf(e.shift).label,
      weekOff: weekOffOf(e),
      ...computeMonthStats(byEmp[e.id] || [], lvEmp[e.id] || [], month, { holidays, joined: e.joined, weekOff: weekOffOf(e) })
    }));
    const withHours = staff.filter(s => s.totalWorkedMinutes > 0);
    return {
      month,
      workdaysSoFar: workdaysIn(month, true),
      workdaysTotal: workdaysIn(month, false),
      staffCount: staff.length,
      avgWorkingMinutes: withHours.length ? Math.round(withHours.reduce((a, s) => a + s.avgWorkingMinutes, 0) / withHours.length) : 0,
      totalWorkedMinutes: staff.reduce((a, s) => a + s.totalWorkedMinutes, 0),
      expectedMinutesSoFar: staff.reduce((a, s) => a + (s.expectedMinutesSoFar || 0), 0),
      otHours: round2(staff.reduce((a, s) => a + (Number(s.otHours) || 0), 0)),
      lateCount: staff.reduce((a, s) => a + s.late, 0),
      staff
    };
  }
}

module.exports = new AttendanceService();
