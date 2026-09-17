'use strict';

const attendanceModel = require('../models/attendance.model');
const attendanceService = require('../services/attendance.service');
const employeeModel = require('../models/employee.model');
const apiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { todayISO, thisMonth, toMins, nowHHMM, shiftOf, hoursPerDay, round2 } = require('../utils/calculations');

// Selfies are stored on the row; list responses only say whether one exists.
const pub = a => {
  if (!a) return a;
  const { in_selfie, out_selfie, ...rest } = a;
  let sessions = [];
  if (a.sessions) {
    try {
      sessions = typeof a.sessions === 'string' ? JSON.parse(a.sessions) : a.sessions;
      if (!Array.isArray(sessions)) sessions = [];
    } catch (e) { sessions = []; }
  }
  const cleanSessions = sessions.map(s => ({
    ...s,
    in_selfie: Boolean(s.in_selfie),
    out_selfie: Boolean(s.out_selfie)
  }));
  return {
    ...rest,
    ot_hours: round2(a.ot_hours),
    fine_hours: round2(a.fine_hours),
    sessions: cleanSessions,
    session_count: cleanSessions.length + (a.clock_in ? 1 : 0),
    is_recheck: cleanSessions.length > 0,
    in_selfie: Boolean(in_selfie),
    out_selfie: Boolean(out_selfie)
  };
};
const pubAll = rows => (rows || []).map(pub);

const breakStart = catchAsync(async (req, res) => {
  const punch = await attendanceService.startBreak(req.user.id);
  return apiResponse.success(res, pub(punch), 'Break started. Tap End break when you are back.');
});

const breakEnd = catchAsync(async (req, res) => {
  const punch = await attendanceService.endBreak(req.user.id);
  return apiResponse.success(res, pub(punch), 'Break ended · ' + punch.lastBreakMins + ' min');
});

const clockIn = catchAsync(async (req, res) => {
  const empId = req.user.id;
  if (!empId) {
    throw new AppError('No employee profile linked to this user.', 400);
  }

  const { lat, lng, acc, addr, mode, selfie } = req.body;
  const punch = await attendanceService.processClockIn(empId, { lat, lng, acc, addr, mode, selfie });
  return apiResponse.success(res, pub(punch), 'Clocked in successfully');
});

const clockOut = catchAsync(async (req, res) => {
  const empId = req.user.id;
  if (!empId) {
    throw new AppError('No employee profile linked to this user.', 400);
  }

  const { lat, lng, acc, addr, selfie } = req.body;
  const punch = await attendanceService.processClockOut(empId, { lat, lng, acc, addr, selfie });
  return apiResponse.success(res, pub(punch), 'Clocked out successfully');
});

const getTodayStatus = catchAsync(async (req, res) => {
  const today = todayISO();
  const empId = req.user ? req.user.employeeId : null;

  let myPunch = null;
  if (empId) {
    myPunch = await attendanceModel.findByEmpAndDate(empId, today);
    // Still clocked in from a late-night shift that started yesterday? Show that punch so they can clock out.
    if (!myPunch) {
      const y = new Date(today + 'T00:00:00Z'); y.setUTCDate(y.getUTCDate() - 1);
      const open = await attendanceModel.findOpenPunch(empId, y.toISOString().slice(0, 10));
      if (open) {
        // Is this a legitimate overnight punch (e.g. within 14 hours of clock-in)?
        const inMins = toMins(open.clock_in) || 0;
        const nowMins = toMins(nowHHMM()) || 0;
        const elapsedMins = (nowMins + 1440) - inMins;
        if (elapsedMins <= 14 * 60) {
          myPunch = open;
        } else {
          // Lingering missed clock-out from yesterday: auto-close it
          const emp = await employeeModel.findById(empId);
          const s = shiftOf(emp ? emp.shift : 'day');
          let autoOut = s.end || '19:00';
          const endMins = toMins(autoOut) || (19 * 60);
          if (inMins >= endMins) {
            const standardMins = hoursPerDay() * 60;
            const target = Math.min(inMins + standardMins, 23 * 60 + 59);
            const hh = String(Math.floor(target / 60)).padStart(2, '0');
            const mm = String(target % 60).padStart(2, '0');
            autoOut = `${hh}:${mm}`;
          }
          await attendanceModel.update(open.id, {
            clock_out: autoOut,
            note: (open.note ? open.note + ' · ' : '') + 'Auto-closed at shift end'
          });
          myPunch = null;
        }
      }
    }
  }

  const allToday = await attendanceModel.listDayAttendance(today);
  const totalStaff = await employeeModel.count();

  const present = allToday.filter(a => a.status === 'present' || a.clock_in).length;
  const half = allToday.filter(a => a.status === 'half').length;
  const absent = allToday.filter(a => a.status === 'absent').length;
  const wfh = allToday.filter(a => a.mode === 'wfh').length;

  return apiResponse.success(res, {
    today,
    myPunch: pub(myPunch),
    summary: {
      totalStaff,
      present,
      half,
      absent,
      wfh,
      notMarked: Math.max(0, totalStaff - present - half - absent)
    },
    staffAttendance: pubAll(allToday)
  });
});

const getAttendanceList = catchAsync(async (req, res) => {
  const { date = todayISO(), empId } = req.query;

  let records;
  if (empId) {
    records = await attendanceModel.findAll({ emp: empId }, { orderBy: 'date DESC', limit: 100 });
  } else {
    records = await attendanceModel.listDayAttendance(date);
  }

  return apiResponse.success(res, pubAll(records));
});

const updateAttendance = catchAsync(async (req, res) => {
  const { id } = req.params;
  const existing = await attendanceModel.findById(id);
  if (!existing) {
    throw new AppError('Attendance entry not found', 404);
  }

  const updateData = { ...req.body };
  if (updateData.ot_hours !== undefined) updateData.ot_hours = round2(updateData.ot_hours);
  if (updateData.fine_hours !== undefined) updateData.fine_hours = round2(updateData.fine_hours);

  const updated = await attendanceModel.update(id, updateData);
  return apiResponse.success(res, pub(updated), 'Attendance updated successfully');
});

/**
 * Admin/manager marks a day for any employee (P / HD / A / L, overtime, fine, note).
 * Creates the record when missing, updates it otherwise. Empty status clears the mark.
 */
const markAttendance = catchAsync(async (req, res) => {
  const { emp, date, status = '', mode, ot_hours, fine_hours, note, clock_in, clock_out, leave_type } = req.body;
  const employee = await employeeModel.findById(emp);
  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  const existing = await attendanceModel.findByEmpAndDate(emp, date);
  const patch = { status };
  if (mode !== undefined) patch.mode = mode;
  if (ot_hours !== undefined) patch.ot_hours = round2(ot_hours);
  if (fine_hours !== undefined) patch.fine_hours = round2(fine_hours);
  if (note !== undefined) patch.note = String(note);
  if (clock_in !== undefined) patch.clock_in = clock_in;
  if (clock_out !== undefined) patch.clock_out = clock_out;
  if (leave_type !== undefined) patch.leave_type = String(leave_type);

  let record;
  if (existing) {
    record = await attendanceModel.update(existing.id, patch);
    // A record with nothing left in it is removed so the day shows as "not marked" again
    if (!record.status && !record.clock_in && !record.clock_out && !Number(record.ot_hours) && !Number(record.fine_hours) && !record.note) {
      await attendanceModel.delete(existing.id);
      record = null;
    }
  } else {
    if (!status && !Number(patch.ot_hours) && !Number(patch.fine_hours) && !patch.note) {
      return apiResponse.success(res, null, 'Nothing to record');
    }
    record = await attendanceModel.create({
      id: 'a_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4),
      emp,
      date,
      clock_in: clock_in || '',
      clock_out: clock_out || '',
      mode: mode || 'office',
      status,
      leave_type: leave_type ? String(leave_type) : '',
      ot_hours: round2(ot_hours),
      fine_hours: round2(fine_hours),
      note: note || ''
    });
  }

  return apiResponse.success(res, pub(record), record ? 'Attendance marked' : 'Attendance cleared');
});

const getEmployeeMonthStats = catchAsync(async (req, res) => {
  const { empId } = req.params;
  const { month = thisMonth() } = req.query;

  const stats = await attendanceService.getMonthStats(empId, month);
  return apiResponse.success(res, stats);
});

module.exports = {
  breakStart,
  breakEnd,
  clockIn,
  clockOut,
  getTodayStatus,
  getAttendanceList,
  updateAttendance,
  markAttendance,
  getEmployeeMonthStats
};

/** Month summary for every employee (avg hours, total vs expected, OT, late) — admins / managers. */
const getTeamSummary = catchAsync(async (req, res) => {
  const { month = thisMonth() } = req.query;
  const summary = await attendanceService.getTeamSummary(month);
  return apiResponse.success(res, summary);
});
module.exports.getTeamSummary = getTeamSummary;

/** The stored selfie image for a punch (strictly admins only). */
const getSelfie = catchAsync(async (req, res) => {
  const { id, which } = req.params;
  const row = await attendanceModel.findById(id);
  if (!row) throw new AppError('Attendance entry not found', 404);
  const isAdmin = req.user && (req.user.role === 'admin' || req.user.access === 'admin');
  if (!isAdmin) throw new AppError('Only admins can view attendance verification photos.', 403);
  const data = which === 'out' ? row.out_selfie : row.in_selfie;
  if (!data) throw new AppError('No selfie stored for this punch', 404);
  const m = String(data).match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) throw new AppError('Stored image is invalid', 500);
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.send(Buffer.from(m[2], 'base64'));
});
module.exports.getSelfie = getSelfie;
