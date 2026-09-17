'use strict';

const BaseModel = require('./base.model');
const db = require('../config/db');

/** Match a task whose comma-separated assignee list contains `id`. */
function assigneeClause(col, id, params) {
  params.push(id, `${id},%`, `%,${id}`, `%,${id},%`);
  return `(${col} = ? OR ${col} LIKE ? OR ${col} LIKE ? OR ${col} LIKE ?)`;
}

class TaskModel extends BaseModel {
  constructor() {
    super('lh_tasks');
  }

  async filterTasks({ assignee, project, status, overdueOnly, todayDate, limit = 500, offset = 0 } = {}) {
    let sql = `
      SELECT t.*,
             p.name as project_name,
             e.name as assignee_name,
             e.role as assignee_role,
             e.av as assignee_av,
             e.ini as assignee_ini,
             ab.name as assigned_by_name,
             ab.role as assigned_by_role,
             ab.av as assigned_by_av
      FROM lh_tasks t
      LEFT JOIN lh_projects p ON t.project = p.id
      LEFT JOIN lh_employees e ON t.assignee = e.id
      LEFT JOIN lh_employees ab ON t.assigned_by = ab.id
      WHERE 1=1
    `;
    const params = [];

    if (assignee) sql += ' AND ' + assigneeClause('t.assignee', assignee, params);
    if (project) { sql += ' AND t.project = ?'; params.push(project); }
    if (status) { sql += ' AND t.status = ?'; params.push(status); }
    if (overdueOnly && todayDate) {
      sql += " AND t.status != 'completed' AND t.deadline IS NOT NULL AND t.deadline < ?";
      params.push(todayDate);
    }

    sql += " ORDER BY CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END, t.deadline ASC, t.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset));
    return db.all(sql, params);
  }

  async getStatusCounts(assignee = null) {
    let sql = 'SELECT status, COUNT(*) as count FROM lh_tasks';
    const params = [];
    if (assignee) sql += ' WHERE ' + assigneeClause('assignee', assignee, params);
    sql += ' GROUP BY status';
    return db.all(sql, params);
  }

  async findById(id) {
    const sql = `
      SELECT t.*,
             p.name as project_name,
             e.name as assignee_name,
             e.role as assignee_role,
             e.av as assignee_av,
             e.ini as assignee_ini,
             ab.name as assigned_by_name,
             ab.role as assigned_by_role,
             ab.av as assigned_by_av
      FROM lh_tasks t
      LEFT JOIN lh_projects p ON t.project = p.id
      LEFT JOIN lh_employees e ON t.assignee = e.id
      LEFT JOIN lh_employees ab ON t.assigned_by = ab.id
      WHERE t.id = ?
    `;
    return db.get(sql, [id]);
  }

  /** Remove an employee from every task's assignee list. */
  async unassignEverywhere(empId) {
    const rows = await db.all("SELECT id, assignee FROM lh_tasks WHERE assignee LIKE ?", [`%${empId}%`]);
    for (const r of rows) {
      const rest = String(r.assignee || '').split(',').map(s => s.trim()).filter(s => s && s !== empId).join(',');
      await db.run('UPDATE lh_tasks SET assignee = ?, updated_at = ? WHERE id = ?', [rest, new Date().toISOString(), r.id]);
    }
    return rows.length;
  }
}

module.exports = new TaskModel();
