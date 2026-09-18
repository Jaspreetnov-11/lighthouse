-- ====================================================================
-- Limelight Workspace - PostgreSQL (Supabase) schema
-- Column types are kept loose (TEXT dates / ISO timestamps, INTEGER booleans)
-- so the same parameterised SQL runs on SQLite and Postgres.
-- Employee ids are Supabase Auth user ids (UUID as text).
-- ====================================================================

CREATE TABLE IF NOT EXISTS lh_employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  dept TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  emp_id TEXT DEFAULT '',
  joined TEXT,
  dob TEXT,
  managers TEXT DEFAULT '[]',
  salary NUMERIC DEFAULT 0,
  access TEXT DEFAULT 'staff',
  av TEXT,
  ini TEXT,
  active INTEGER DEFAULT 1,
  week_off TEXT DEFAULT '',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

CREATE TABLE IF NOT EXISTS lh_departments (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  billable INTEGER DEFAULT 1,
  daily NUMERIC DEFAULT 8,
  manager TEXT DEFAULT '',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

CREATE TABLE IF NOT EXISTS lh_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT DEFAULT '',
  billable INTEGER DEFAULT 1,
  manager TEXT DEFAULT '',
  start TEXT,
  alloc NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Approved',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

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
  mins NUMERIC DEFAULT 0,
  type TEXT DEFAULT 'Other',
  flag INTEGER DEFAULT 0,
  reassigned_by TEXT DEFAULT '',
  reassign_note TEXT DEFAULT '',
  spans TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

CREATE TABLE IF NOT EXISTS lh_attendance (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  date TEXT NOT NULL,
  clock_in TEXT DEFAULT '',
  clock_out TEXT DEFAULT '',
  mode TEXT DEFAULT 'office',
  status TEXT DEFAULT '',
  ot_hours NUMERIC DEFAULT 0,
  fine_hours NUMERIC DEFAULT 0,
  note TEXT DEFAULT '',
  in_lat NUMERIC,
  in_lng NUMERIC,
  in_acc NUMERIC,
  in_addr TEXT DEFAULT '',
  out_lat NUMERIC,
  out_lng NUMERIC,
  out_acc NUMERIC,
  out_addr TEXT DEFAULT '',
  sessions TEXT DEFAULT '[]',
  leave_type TEXT DEFAULT '',
  breaks TEXT DEFAULT '[]',
  break_mins NUMERIC DEFAULT 0,
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text,
  UNIQUE (emp, date)
);

CREATE TABLE IF NOT EXISTS lh_leaves (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'approved',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

CREATE TABLE IF NOT EXISTS lh_payments (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  date TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT DEFAULT 'Salary',
  note TEXT DEFAULT '',
  assigned_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

CREATE TABLE IF NOT EXISTS lh_holidays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

CREATE TABLE IF NOT EXISTS lh_todos (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  owner TEXT DEFAULT '',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

CREATE TABLE IF NOT EXISTS lh_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project TEXT DEFAULT '',
  assigned_by TEXT DEFAULT '',
  size TEXT DEFAULT '',
  date TEXT,
  url TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

CREATE TABLE IF NOT EXISTS lh_activity (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  at TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);

CREATE INDEX IF NOT EXISTS idx_lh_employees_email ON lh_employees (lower(email));
CREATE INDEX IF NOT EXISTS idx_lh_employees_dept ON lh_employees (dept);
CREATE INDEX IF NOT EXISTS idx_lh_attendance_date ON lh_attendance (date);
CREATE INDEX IF NOT EXISTS idx_lh_attendance_emp ON lh_attendance (emp);
CREATE INDEX IF NOT EXISTS idx_lh_tasks_project ON lh_tasks (project);
CREATE INDEX IF NOT EXISTS idx_lh_tasks_status ON lh_tasks (status);
CREATE INDEX IF NOT EXISTS idx_lh_leaves_emp ON lh_leaves (emp, from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_lh_payments_emp_date ON lh_payments (emp, date);
CREATE INDEX IF NOT EXISTS idx_lh_todos_owner ON lh_todos (owner, done);
CREATE INDEX IF NOT EXISTS idx_lh_activity_created ON lh_activity (created_at DESC);

-- The Express backend is the only client of these tables (service connection).
-- Keep RLS on so the public anon key cannot read them through PostgREST.
ALTER TABLE lh_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_activity ENABLE ROW LEVEL SECURITY;

-- Clients (admin): revenue side of the monthly profit / loss per client
CREATE TABLE IF NOT EXISTS lh_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  billing TEXT DEFAULT 'billable',
  retainer NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);
ALTER TABLE lh_clients ENABLE ROW LEVEL SECURITY;

-- Workspace settings (admin): shifts, grace, hours per day, default password, company name
CREATE TABLE IF NOT EXISTS lh_push_subs (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  endpoint TEXT UNIQUE NOT NULL,
  keys TEXT NOT NULL,
  ua TEXT DEFAULT '',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text
);
ALTER TABLE lh_push_subs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lh_push_subs_emp ON lh_push_subs (emp);

CREATE TABLE IF NOT EXISTS lh_ratings (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  month TEXT NOT NULL,
  marks NUMERIC DEFAULT 0,
  note TEXT DEFAULT '',
  rated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT (now())::text,
  UNIQUE (emp, month)
);
ALTER TABLE lh_ratings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS lh_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT DEFAULT (now())::text
);
ALTER TABLE lh_settings ENABLE ROW LEVEL SECURITY;

-- AI Agent: every run (prompts, content, script, schedule, ads, deck) and uploaded reference material
CREATE TABLE IF NOT EXISTS lh_ai_runs (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  tool TEXT NOT NULL,
  title TEXT DEFAULT '',
  input TEXT DEFAULT '{}',
  output TEXT DEFAULT '{}',
  provider TEXT DEFAULT '',
  created_at TEXT DEFAULT (now())::text
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
  created_at TEXT DEFAULT (now())::text
);
CREATE INDEX IF NOT EXISTS idx_lh_ai_refs_emp ON lh_ai_refs (emp, created_at DESC);
ALTER TABLE lh_ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lh_ai_refs ENABLE ROW LEVEL SECURITY;

-- 16. Salary Slips
CREATE TABLE IF NOT EXISTS lh_salary_slips (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  gross_earnings NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  net_payable NUMERIC DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  due_amount NUMERIC DEFAULT 0,
  payable_days NUMERIC DEFAULT 0,
  carry_forward NUMERIC DEFAULT 0,
  advance_payments NUMERIC DEFAULT 0,
  earnings_breakdown TEXT DEFAULT '[]',
  deductions_breakdown TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (now())::text,
  updated_at TEXT DEFAULT (now())::text,
  UNIQUE(emp, month)
);
CREATE INDEX IF NOT EXISTS idx_lh_salary_slips_emp ON lh_salary_slips (emp, month DESC);
ALTER TABLE lh_salary_slips ENABLE ROW LEVEL SECURITY;
