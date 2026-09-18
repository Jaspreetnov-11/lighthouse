'use strict';
/**
 * Productive hours per employee for a month, from task time that happened while clocked in.
 *
 *   own      – minutes the person spent on their tasks this month: task timer spans (accept → done,
 *              still running = until now) intersected with their attendance sessions, breaks removed,
 *              overlapping tasks counted once
 *   managed  – credit for whoever assigned a task: managerShare × the assignees' worked minutes on it
 *              this month + assignMins per task (operations / team leaders work while tasks run)
 *   productive = own + managed
 *
 * Nothing can exceed the person's clocked-in time, so a task left running overnight no longer
 * inflates the numbers.
 */
const taskModel = require('../models/task.model');
const employeeModel = require('../models/employee.model');
const attendanceModel = require('../models/attendance.model');
const settingsService = require('./settings.service');
const worktime = require('./worktime.service');
const { thisMonth, punchMinutes } = require('../utils/calculations');

const monthRange = month => {
  const [y, m] = month.split('-').map(Number);
  return [Date.parse(`${month}-01T00:00:00+05:30`), Date.parse(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00+05:30`)];
};

async function computeMonth(month = thisMonth()) {
  const s = settingsService.get() || {};
  const share = Number(s.managerShare) || 0, assignMins = Number(s.assignMins) || 0;
  const [from, to] = monthRange(month);
  const now = Date.now();
  const [tasks, employees, rows] = await Promise.all([taskModel.findAll(), employeeModel.findAll({}, { orderBy: 'name ASC' }), attendanceModel.getMonthAttendanceAll(month)]);
  const byEmp = worktime.attendanceIntervalsByEmp(rows, now);
  const range = { from, to };
  const inMonth = tasks.filter(t => worktime.taskSpans(t, now, range).length > 0);

  const out = {};
  for (const e of employees) out[e.id] = { id: e.id, name: e.name, dept: e.dept || '', role: e.role || '', ini: e.ini || '', av: e.av || '', ownMins: 0, managedMins: 0, breakMins: 0, clockMins: 0, tasksWorked: 0, tasksAssigned: 0, running: 0 };
  for (const e of employees) {
    const mine = inMonth.filter(t => worktime.assigneesOf(t).includes(e.id));
    out[e.id].ownMins = worktime.personMinutes(mine, e.id, byEmp, { from, to, now });
    out[e.id].tasksWorked = mine.length;
    out[e.id].running = mine.filter(t => t.status === 'progress').length;
  }
  for (const t of inMonth) {
    const by = t.assigned_by && out[t.assigned_by];
    if (!by || worktime.assigneesOf(t).includes(t.assigned_by)) continue;
    by.managedMins += worktime.taskWorkedMinutes(t, byEmp, now, range) * share + assignMins;
    by.tasksAssigned += 1;
  }
  for (const r of rows) { const e = out[r.emp]; if (!e) continue; e.breakMins += Number(r.break_mins) || 0; if (r.clock_in && r.clock_out) e.clockMins += punchMinutes(r); }
  const list = Object.values(out).map(e => {
    const own = Math.round(e.ownMins), managed = Math.round(e.managedMins);
    return { ...e, ownMins: own, managedMins: managed, productiveMins: Math.min(own + managed, Math.max(own + managed, 0)) };
  }).sort((a, b) => b.productiveMins - a.productiveMins || a.name.localeCompare(b.name));
  const totals = list.reduce((a, e) => ({ productiveMins: a.productiveMins + e.productiveMins, clockMins: a.clockMins + e.clockMins, breakMins: a.breakMins + e.breakMins }), { productiveMins: 0, clockMins: 0, breakMins: 0 });
  return { month, managerShare: share, assignMins, totals, list };
}

module.exports = { computeMonth };
