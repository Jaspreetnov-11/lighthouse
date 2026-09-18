'use strict';

/**
 * Database initialisation.
 *  - Postgres (Supabase): applies schema.pg.sql (idempotent). No demo data is seeded; people come
 *    from Supabase Auth and appear in lh_employees when an admin adds them.
 *  - SQLite (local fallback): applies schema.sql and seeds demo data when the database is empty.
 *  - Both: adds columns introduced after the first release (ensureColumns) and migrates old values.
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const env = require('../config/env');

// Columns added after the initial schema. Applied with ALTER TABLE when missing.
const EXTRA_COLUMNS = {
  lh_employees: [['shift', "TEXT DEFAULT 'day'"], ['active', 'INTEGER DEFAULT 1'], ['week_off', "TEXT DEFAULT ''"], ['salary_structure', "TEXT DEFAULT ''"]],
  lh_tasks: [
    ['dept', "TEXT DEFAULT ''"],
    ['started_at', 'TEXT'],
    ['completed_at', 'TEXT'],
    ['taken_mins', 'NUMERIC DEFAULT 0'],
    ['spans', "TEXT DEFAULT '[]'"],
    ['reassigned_by', "TEXT DEFAULT ''"],
    ['reassign_note', "TEXT DEFAULT ''"],
    ['created_at', "TEXT DEFAULT (datetime('now'))"],
    ['updated_at', "TEXT DEFAULT (datetime('now'))"]
  ],
  lh_projects: [['client_id', "TEXT DEFAULT ''"], ['fee', 'NUMERIC DEFAULT 0']],
  lh_leaves: [['kind', "TEXT DEFAULT 'leave'"], ['remarks', "TEXT DEFAULT ''"]],
  lh_attendance: [['late', 'INTEGER DEFAULT 0'], ['in_selfie', 'TEXT'], ['out_selfie', 'TEXT'], ['out_next_day', 'INTEGER DEFAULT 0'], ['sessions', "TEXT DEFAULT '[]'"], ['leave_type', "TEXT DEFAULT ''"], ['breaks', "TEXT DEFAULT '[]'"], ['break_mins', 'NUMERIC DEFAULT 0']],
  lh_ai_refs: [['hash', "TEXT DEFAULT ''"]],
  lh_activity: [['user_id', "TEXT DEFAULT ''"], ['kind', "TEXT DEFAULT 'info'"], ['link', "TEXT DEFAULT ''"], ['ref_type', "TEXT DEFAULT ''"], ['ref_id', "TEXT DEFAULT ''"]]
};

async function ensureColumns() {
  for (const [table, cols] of Object.entries(EXTRA_COLUMNS)) {
    const existing = await db.columns(table);
    for (const [name, type] of cols) {
      if (!existing.has(name)) {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${db.isPostgres ? type : type.replace('NUMERIC', 'REAL')}`);
      }
    }
  }
  // Ensure lh_salary_slips table exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS lh_salary_slips (
      id TEXT PRIMARY KEY,
      emp TEXT NOT NULL,
      month TEXT NOT NULL,
      year TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      gross_earnings ${db.isPostgres ? 'NUMERIC' : 'REAL'} DEFAULT 0,
      total_deductions ${db.isPostgres ? 'NUMERIC' : 'REAL'} DEFAULT 0,
      net_payable ${db.isPostgres ? 'NUMERIC' : 'REAL'} DEFAULT 0,
      paid_amount ${db.isPostgres ? 'NUMERIC' : 'REAL'} DEFAULT 0,
      due_amount ${db.isPostgres ? 'NUMERIC' : 'REAL'} DEFAULT 0,
      payable_days ${db.isPostgres ? 'NUMERIC' : 'REAL'} DEFAULT 0,
      carry_forward ${db.isPostgres ? 'NUMERIC' : 'REAL'} DEFAULT 0,
      advance_payments ${db.isPostgres ? 'NUMERIC' : 'REAL'} DEFAULT 0,
      earnings_breakdown TEXT DEFAULT '[]',
      deductions_breakdown TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(emp, month)
    );
  `);
  // Task status "On Hold" became "Changes" (changes requested by the reviewer)
  await db.run("UPDATE lh_tasks SET status = 'changes' WHERE status = 'hold'");
  try {
    await db.run("UPDATE lh_tasks SET updated_at = created_at WHERE (updated_at IS NULL OR updated_at = '') AND created_at IS NOT NULL AND created_at != ''");
  } catch (e) { /* ignore */ }
}

async function seedSqlite() {
  const { getSeedData } = require('./seed');
  const seed = getSeedData();
  const s = db.getSqlite();
  const ins = (sql, rows, pick) => {
    const stmt = s.prepare(sql);
    for (const r of rows) stmt.run(...pick(r));
  };
  ins('INSERT OR IGNORE INTO lh_departments (id, name, billable, daily, manager) VALUES (?, ?, ?, ?, ?)', seed.departments, d => [d.id, d.name, d.billable, d.daily, d.manager]);
  ins('INSERT OR IGNORE INTO lh_employees (id, name, role, dept, email, phone, emp_id, joined, dob, managers, salary, access, av, ini) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', seed.employees, e => [e.id, e.name, e.role, e.dept, e.email, e.phone, e.emp_id, e.joined, e.dob, e.managers, e.salary, e.access, e.av, e.ini]);
  ins('INSERT OR IGNORE INTO lh_projects (id, name, client, billable, manager, start, alloc, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', seed.projects, p => [p.id, p.name, p.client, p.billable, p.manager, p.start, p.alloc, p.status]);
  ins('INSERT OR IGNORE INTO lh_tasks (id, title, project, assignee, assigned_by, assigned, deadline, completed, status, mins, type, flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', seed.tasks, t => [t.id, t.title, t.project, t.assignee, t.assigned_by, t.assigned, t.deadline, t.completed, t.status, t.mins, t.type, t.flag]);
  ins('INSERT OR IGNORE INTO lh_attendance (id, emp, date, clock_in, clock_out, mode, status, ot_hours, fine_hours, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', seed.attendance, a => [a.id, a.emp, a.date, a.clock_in, a.clock_out, a.mode, a.status, a.ot_hours, a.fine_hours, a.note]);
  ins('INSERT OR IGNORE INTO lh_leaves (id, emp, from_date, to_date, reason, status) VALUES (?, ?, ?, ?, ?, ?)', seed.leaves, l => [l.id, l.emp, l.from_date, l.to_date, l.reason, l.status]);
  ins('INSERT OR IGNORE INTO lh_payments (id, emp, date, amount, type, note, assigned_by) VALUES (?, ?, ?, ?, ?, ?, ?)', seed.payments, p => [p.id, p.emp, p.date, p.amount, p.type, p.note, p.assigned_by]);
  ins('INSERT OR IGNORE INTO lh_holidays (id, name, date) VALUES (?, ?, ?)', seed.holidays || [], h => [h.id, h.name, h.date]);
  ins('INSERT OR IGNORE INTO lh_activity (id, text, at, read) VALUES (?, ?, ?, ?)', seed.activity || [], a => [a.id, a.text, a.at, a.read]);
}

async function initDatabase() {
  if (db.isPostgres) {
    await db.exec(fs.readFileSync(path.resolve(__dirname, 'schema.pg.sql'), 'utf8'));
    await ensureColumns();
    return 'postgres';
  }

  await db.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  await ensureColumns();
  const row = await db.get('SELECT COUNT(*) as count FROM lh_employees');
  if (!row || Number(row.count) === 0) await seedSqlite();
  return 'sqlite:' + env.DATABASE_PATH;
}

module.exports = { initDatabase };
