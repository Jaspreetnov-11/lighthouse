-- ====================================================================
-- Limelight Workspace - Database Schema
-- Production Relational Schema with Constraints and Optimized Indexing
-- ====================================================================

-- 1. Users & Auth (for secure password hashing and JWT)
CREATE TABLE IF NOT EXISTS lh_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  employee_id TEXT,
  reset_token TEXT,
  reset_expires TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. Staff / Employees Directory
CREATE TABLE IF NOT EXISTS lh_employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  dept TEXT DEFAULT '',
  email TEXT DEFAULT '' COLLATE NOCASE,
  phone TEXT DEFAULT '',
  emp_id TEXT DEFAULT '',
  joined TEXT,
  dob TEXT,
  managers TEXT DEFAULT '[]',
  salary REAL DEFAULT 0,
  access TEXT DEFAULT 'staff',
  av TEXT,
  ini TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 3. Departments
CREATE TABLE IF NOT EXISTS lh_departments (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  billable INTEGER DEFAULT 1,
  daily REAL DEFAULT 8,
  manager TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 4. Projects
CREATE TABLE IF NOT EXISTS lh_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT DEFAULT '',
  billable INTEGER DEFAULT 1,
  manager TEXT DEFAULT '',
  start TEXT,
  alloc REAL DEFAULT 0,
  status TEXT DEFAULT 'Approved',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 5. Tasks (Kanban & time tracking)
CREATE TABLE IF NOT EXISTS lh_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  project TEXT DEFAULT '',
  assignee TEXT DEFAULT '',
  assigned_by TEXT DEFAULT '',
  assigned TEXT,
  deadline TEXT,
  completed TEXT,
  status TEXT DEFAULT 'pipeline',
  mins REAL DEFAULT 0,
  type TEXT DEFAULT 'Other',
  flag INTEGER DEFAULT 0,
  reassigned_by TEXT DEFAULT '',
  reassign_note TEXT DEFAULT '',
  spans TEXT DEFAULT '[]',
  user_timers TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 6. Attendance with GPS coordinates
CREATE TABLE IF NOT EXISTS lh_attendance (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  date TEXT NOT NULL,
  clock_in TEXT DEFAULT '',
  clock_out TEXT DEFAULT '',
  mode TEXT DEFAULT 'office',
  status TEXT DEFAULT '',
  ot_hours REAL DEFAULT 0,
  fine_hours REAL DEFAULT 0,
  note TEXT DEFAULT '',
  in_lat REAL,
  in_lng REAL,
  in_acc REAL,
  in_addr TEXT DEFAULT '',
  out_lat REAL,
  out_lng REAL,
  out_acc REAL,
  out_addr TEXT DEFAULT '',
  sessions TEXT DEFAULT '[]',
  leave_type TEXT DEFAULT '',
  breaks TEXT DEFAULT '[]',
  break_mins NUMERIC DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(emp, date)
);

-- 7. Leaves
CREATE TABLE IF NOT EXISTS lh_leaves (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'approved',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 8. Payments & Salary Ledger
CREATE TABLE IF NOT EXISTS lh_payments (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  type TEXT DEFAULT 'Salary',
  note TEXT DEFAULT '',
  assigned_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 9. Holidays
CREATE TABLE IF NOT EXISTS lh_holidays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 10. Todos
CREATE TABLE IF NOT EXISTS lh_todos (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  owner TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 11. Files
CREATE TABLE IF NOT EXISTS lh_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project TEXT DEFAULT '',
  assigned_by TEXT DEFAULT '',
  size TEXT DEFAULT '',
  date TEXT,
  url TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 12. Activity & Notifications Log
CREATE TABLE IF NOT EXISTS lh_activity (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  at TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ====================================================================
-- OPTIMIZED EXPLICIT INDEXES (Fast lookups, composite search, constraints)
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON lh_users(email);
CREATE INDEX IF NOT EXISTS idx_employees_email ON lh_employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_emp_id ON lh_employees(emp_id);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON lh_employees(dept);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_emp_date ON lh_attendance(emp, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON lh_attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_emp ON lh_attendance(emp);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON lh_tasks(assignee, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON lh_tasks(project);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON lh_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON lh_tasks(deadline);

CREATE INDEX IF NOT EXISTS idx_leaves_emp_range ON lh_leaves(emp, from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_leaves_dates ON lh_leaves(from_date, to_date);

CREATE INDEX IF NOT EXISTS idx_payments_emp_date ON lh_payments(emp, date);
CREATE INDEX IF NOT EXISTS idx_payments_date ON lh_payments(date);
CREATE INDEX IF NOT EXISTS idx_payments_type ON lh_payments(type);

CREATE INDEX IF NOT EXISTS idx_todos_owner_done ON lh_todos(owner, done);
CREATE INDEX IF NOT EXISTS idx_files_project ON lh_files(project);
CREATE INDEX IF NOT EXISTS idx_activity_created ON lh_activity(created_at DESC);

CREATE TABLE IF NOT EXISTS lh_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  billing TEXT DEFAULT 'billable',
  retainer REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  week_off TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lh_push_subs (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  endpoint TEXT UNIQUE NOT NULL,
  keys TEXT NOT NULL,
  ua TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lh_push_subs_emp ON lh_push_subs (emp);

CREATE TABLE IF NOT EXISTS lh_ratings (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  month TEXT NOT NULL,
  marks NUMERIC DEFAULT 0,
  note TEXT DEFAULT '',
  rated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (emp, month)
);

CREATE TABLE IF NOT EXISTS lh_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- AI Agent: every run and uploaded reference material
CREATE TABLE IF NOT EXISTS lh_ai_runs (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  tool TEXT NOT NULL,
  title TEXT DEFAULT '',
  input TEXT DEFAULT '{}',
  output TEXT DEFAULT '{}',
  provider TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lh_ai_runs_emp ON lh_ai_runs (emp, created_at DESC);
CREATE TABLE IF NOT EXISTS lh_ai_refs (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT DEFAULT '',
  chars INTEGER DEFAULT 0,
  text TEXT DEFAULT '',
  hash TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lh_ai_refs_emp ON lh_ai_refs (emp, created_at DESC);

-- 16. Salary Slips
CREATE TABLE IF NOT EXISTS lh_salary_slips (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  gross_earnings REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  net_payable REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  due_amount REAL DEFAULT 0,
  payable_days REAL DEFAULT 0,
  carry_forward REAL DEFAULT 0,
  advance_payments REAL DEFAULT 0,
  earnings_breakdown TEXT DEFAULT '[]',
  deductions_breakdown TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(emp, month)
);
CREATE INDEX IF NOT EXISTS idx_lh_salary_slips_emp ON lh_salary_slips (emp, month DESC);
