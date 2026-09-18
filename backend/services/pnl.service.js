'use strict';

/**
 * Client profit / loss for a month.
 *
 *  revenue = client's monthly retainer (billable clients)
 *          + one-time fees of the client's projects that started in that month
 *  cost    = staff time on the client's projects in that month × each person's hourly cost
 *            (hourly cost = monthly salary / (working days × 8h)); a task with several
 *            assignees splits its minutes equally between them
 *  profit  = revenue − cost
 *
 * Minutes attributed to a month: completed tasks by their completion date (taken_mins);
 * tasks still running count the time from max(start, month start) until now.
 */

const db = require('../config/db');
const clientModel = require('../models/client.model');
const attendanceModel = require('../models/attendance.model');
const worktime = require('./worktime.service');
const { thisMonth, workdaysIn, hoursPerDay } = require('../utils/calculations');

const splitIds = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const monthOf = iso => String(iso || '').slice(0, 7);

function monthBounds(month) {
  const start = new Date(month + '-01T00:00:00Z');
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

/** Minutes of a task that fall inside the month (see header). */
function minutesInMonth(t, month, now, byEmp = {}) {
  if (!t.started_at) return 0;
  // Only the work spans inside this month, while the assignees were clocked in
  const { start, end } = monthBounds(month);
  return worktime.taskWorkedMinutes(t, byEmp, now.getTime(), { from: start.getTime(), to: end.getTime() });
}

class PnlService {
  async hourlyRates(month) {
    const emps = await db.all('SELECT id, name, salary FROM lh_employees');
    const hours = Math.max(1, workdaysIn(month, false)) * hoursPerDay();
    const map = {};
    for (const e of emps) map[e.id] = { name: e.name, rate: (Number(e.salary) || 0) / hours };
    return map;
  }

  /** P&L for every client in a month. */
  async monthly(month = thisMonth()) {
    const now = new Date();
    const [clients, projects, tasks, rates, attRows] = await Promise.all([
      clientModel.listWithProjectCounts(),
      db.all("SELECT id, name, client_id, client, billable, fee, start, alloc, status FROM lh_projects WHERE client_id <> ''"),
      db.all("SELECT t.id, t.title, t.project, t.assignee, t.status, t.mins, t.taken_mins, t.started_at, t.completed_at, t.completed, t.spans, t.updated_at FROM lh_tasks t JOIN lh_projects p ON p.id = t.project WHERE p.client_id <> ''"),
      this.hourlyRates(month),
      attendanceModel.getMonthAttendanceAll(month).catch(() => [])
    ]);
    const byEmp = worktime.attendanceIntervalsByEmp(attRows, now.getTime());
    const projById = Object.fromEntries(projects.map(p => [p.id, p]));
    const perProject = {};
    for (const t of tasks) {
      const mins = minutesInMonth(t, month, now, byEmp);
      if (!mins) continue;
      const ids = splitIds(t.assignee);
      const share = ids.length ? mins / ids.length : 0;
      const pp = perProject[t.project] = perProject[t.project] || { mins: 0, cost: 0, tasks: 0, people: {} };
      pp.mins += mins; pp.tasks += 1;
      for (const id of ids) {
        const r = rates[id] || { name: 'Former staff', rate: 0 };
        const c = (share / 60) * r.rate;
        pp.cost += c;
        pp.people[id] = pp.people[id] || { name: r.name, mins: 0, cost: 0 };
        pp.people[id].mins += share; pp.people[id].cost += c;
      }
    }

    const rows = clients.map(c => {
      const cps = projects.filter(p => p.client_id === c.id);
      const projRows = cps.map(p => {
        const pp = perProject[p.id] || { mins: 0, cost: 0, tasks: 0, people: {} };
        return {
          id: p.id, name: p.name, status: p.status, billable: Number(p.billable) ? 1 : 0, start: p.start,
          fee: Number(p.fee) || 0, feeThisMonth: monthOf(p.start) === month ? Number(p.fee) || 0 : 0,
          alloc: Number(p.alloc) || 0, mins: Math.round(pp.mins), cost: Math.round(pp.cost), tasks: pp.tasks,
          people: Object.values(pp.people).map(x => ({ name: x.name, mins: Math.round(x.mins), cost: Math.round(x.cost) })).sort((a, b) => b.cost - a.cost)
        };
      });
      const billable = c.billing !== 'non-billable';
      const retainer = billable ? Number(c.retainer) || 0 : 0;
      const fees = projRows.reduce((a, p) => a + p.feeThisMonth, 0);
      const revenue = retainer + fees;
      const cost = projRows.reduce((a, p) => a + p.cost, 0);
      const mins = projRows.reduce((a, p) => a + p.mins, 0);
      return {
        ...c, retainer: Number(c.retainer) || 0, project_count: Number(c.project_count) || 0, active: Number(c.active) ? 1 : 0,
        month, revenue: Math.round(revenue), retainerThisMonth: Math.round(retainer), feesThisMonth: Math.round(fees),
        cost: Math.round(cost), profit: Math.round(revenue - cost), minutes: mins,
        margin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : (cost > 0 ? -100 : 0),
        projects: projRows
      };
    });

    const totals = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.profit, minutes: a.minutes + r.minutes }), { revenue: 0, cost: 0, profit: 0, minutes: 0 });
    return { month, workdays: workdaysIn(month, false), totals, clients: rows };
  }
}

module.exports = new PnlService();
