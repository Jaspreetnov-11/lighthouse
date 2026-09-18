'use client';
// Form controllers for every "Add / Edit" dialog. Builds the field config, validates, calls the model, reloads data.
import { useCallback } from 'react';
import { useAuth } from './AuthController';
import { useData } from './DataController';
import { useUi } from './UiController';
import { ActivityModel, AttendanceModel, AuthModel, ClientModel, DepartmentModel, EmployeeModel, FileModel, HolidayModel, LeaveModel, PaymentModel, ProjectModel, TaskModel } from '@/models';
import { ACCESS_LABEL, avFor, ini, nextEmpCode, PAY_TYPES, SHIFTS, STATUSES, STATUS_LABEL, TASK_TYPES, todayISO, WEEK_DAYS } from '@/lib/format';

export function useModals() {
  const { me, isAdmin } = useAuth();
  const { employees, departments, projects, tasks, clients, settings, assignableProjects, reload } = useData();
  const { openModal, toast } = useUi();

  const open = useCallback((kind, id, preset = {}) => {
    const empOpts = [{ v: '', l: 'None' }].concat(employees.map(e => ({ v: e.id, l: e.name })));
    const empOnly = employees.map(e => ({ v: e.id, l: e.name }));
    const deptOpts = departments.map(d => ({ v: d.name, l: d.name }));
    const meId = me ? me.id : '';

    if (kind === 'task') {
      const t = id ? tasks.find(x => x.id === id) : null;
      const projOpts = (t ? projects : assignableProjects).map(p => ({ v: p.id, l: p.name }));
      if (!t && !projOpts.length) { toast(isAdmin ? 'Create a project first, then assign tasks in it.' : 'Only the team leader of a project can assign tasks.'); return; }
      const people = d => employees.filter(e => !d.dept || e.dept === d.dept).map(e => ({ v: e.id, l: e.name, sub: e.role || '', av: e.av || avFor(e.name), ini: e.ini || ini(e.name) }));
      const assignerName = t ? (t.assigned_by_name || (t.assigned_by ? (employees.find(e => e.id === t.assigned_by)?.name || t.assigned_by) : '')) : (me?.name || '');
      openModal({
        title: t ? 'Edit task' : 'Assign task', sub: t ? ('Assigned by ' + (assignerName || '—') + (t.assigned ? ' · ' + t.assigned : '')) : ('Assigning as ' + (me?.name || 'team leader') + ' · Pick project, department, and assignees.'), ok: t ? 'Save changes' : 'Assign task',
        fields: [
          { name: 'title', label: 'Task title', required: true, span: true, value: t ? t.title : '', placeholder: 'What needs to be done?' },
          { name: 'project', label: 'Project', type: 'select', required: true, placeholder: 'Select project', options: projOpts, value: t ? t.project : (preset.project || '') },
          { name: 'dept', label: 'Department', type: 'select', required: true, placeholder: 'Select department', options: deptOpts, value: t ? (t.dept || '') : (preset.dept || ''), onChange: (v, all) => ({ assignees: (all.assignees || []).filter(x => { const e = employees.find(y => y.id === x); return e && e.dept === v; }) }) },
          { name: 'assignees', label: 'Assign to (one or more)', type: 'multiselect', required: true, span: true, error: 'Assign the task to at least one person.', optionsFor: people, lockedHint: v => (!v.project ? 'Select a project first' : !v.dept ? 'Select a department to see its people' : ''), value: t ? String(t.assignee || '').split(',').map(s => s.trim()).filter(Boolean) : (preset.assignee ? [preset.assignee] : []) },
          { name: 'type', label: 'Task type', type: 'select', required: true, placeholder: 'Select type', options: TASK_TYPES.map(x => ({ v: x, l: x })), value: t ? t.type : (preset.type || '') },
          { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES.map(k => ({ v: k, l: STATUS_LABEL[k] })), value: t ? t.status : 'pipeline' },
          { name: 'assigned', label: 'Assigned on', type: 'date', required: true, value: t ? (t.assigned || '') : todayISO() },
          { name: 'deadline', label: 'Deadline', type: 'date', required: true, value: t ? (t.deadline || '') : todayISO(), validate: (v, all) => v >= all.assigned || 'Deadline cannot be before the assigned date.' },
          { name: 'est_hours', label: 'Estimated time (hours)', type: 'number', required: true, value: t ? Math.round(((Number(t.mins) || 0) / 60) * 10) / 10 : 2, min: 0.5, step: 0.5, help: 'Compared with actual time taken.' },
          { name: 'assigned_by_display', label: 'Assign by', type: 'text', value: assignerName, disabled: true, readOnly: true, help: t ? 'Task assigner' : 'Task registered as assigned by you' }
        ],
        onSubmit: async d => {
          const body = { title: d.title, project: d.project, dept: d.dept, assignee: (Array.isArray(d.assignees) ? d.assignees : []).join(','), assigned: d.assigned, deadline: d.deadline, status: d.status, mins: Math.round((Number(d.est_hours) || 0) * 60), type: d.type };
          if (t) { await TaskModel.update(t.id, body); toast('Task updated.'); } else { await TaskModel.create(body); toast('Task assigned. The assignees have been notified.'); }
          await reload('tasks', 'projects', 'activity', 'alerts');
        }
      });
    } else if (kind === 'project') {
      const p = id ? projects.find(x => x.id === id) : null;
      const clientOpts = clients.map(c => ({ v: c.id, l: c.name + (c.billing === 'non-billable' ? ' · non-billable' : '') }));
      const leaderPeople = employees.map(e => ({ v: e.id, l: e.name, sub: e.role || '', av: e.av || avFor(e.name), ini: e.ini || ini(e.name) }));
      openModal({
        title: p ? 'Edit project' : 'Add project', sub: 'Pick the client: billing follows the client and the project counts in that client\'s monthly profit. Team leader(s) assign and approve its tasks.', ok: p ? 'Save changes' : 'Add project',
        fields: [
          { name: 'name', label: 'Project name', required: true, value: p ? p.name : '', placeholder: 'e.g. Bihar Project' },
          { name: 'client_id', label: 'Client', type: 'select', required: true, placeholder: clientOpts.length ? 'Select client' : 'No clients yet — add one under Clients', options: clientOpts, value: p ? (p.client_id || '') : (preset.client_id || ''), onChange: v => { const c = clients.find(x => x.id === v); return c ? { billable: c.billing === 'non-billable' ? '0' : '1' } : {}; } },
          { name: 'manager', label: 'Team leader(s)', type: 'multiselect', required: true, span: true, error: 'Select at least one team leader.', options: isAdmin ? leaderPeople : leaderPeople.filter(o => o.v === meId), value: p ? (Array.isArray(p.manager) ? p.manager : String(p.manager || '').split(',').map(s => s.trim()).filter(Boolean)) : (meId ? [meId] : []) },
          { name: 'billable', label: 'Billing', type: 'select', options: [{ v: '1', l: 'Billable' }, { v: '0', l: 'Non-billable' }], value: p ? (p.billable ? '1' : '0') : '1', help: 'Set from the client; change only for an exception.' },
          { name: 'fee', label: 'Project fee (₹, one-time)', type: 'number', value: p ? (Number(p.fee) || 0) : 0, min: 0, step: 500, help: 'Counted as revenue in the month the project starts. Leave 0 for retainer clients.' },
          { name: 'start', label: 'Start date', type: 'date', required: true, value: p ? (p.start || '') : todayISO() },
          { name: 'alloc', label: 'Allocated hours', type: 'number', required: true, value: p ? Math.round((Number(p.alloc) || 0) / 60) : 40, min: 0, step: 1 },
          { name: 'status', label: 'Status', type: 'select', options: ['Draft', 'Approved', 'On Hold', 'Closed'].map(x => ({ v: x, l: x })), value: p ? p.status : 'Approved' }
        ],
        onSubmit: async d => {
          const mgrIds = Array.isArray(d.manager) ? d.manager.filter(Boolean) : String(d.manager || '').split(',').map(s => s.trim()).filter(Boolean);
          const body = { name: d.name, client_id: d.client_id, manager: mgrIds.join(','), billable: d.billable === '1', fee: Number(d.fee) || 0, start: d.start, alloc: Math.round(Number(d.alloc) * 60), status: d.status };
          if (p) { await ProjectModel.update(p.id, body); toast('Project updated.'); } else { await ProjectModel.create(body); toast('Project added.'); }
          await reload('projects', 'clients', 'activity');
        }
      });
    } else if (kind === 'client') {
      const c = id ? clients.find(x => x.id === id) : null;
      openModal({
        title: c ? 'Edit client' : 'Add client', sub: 'Monthly retainer is the revenue side; staff time on the client\'s projects is the cost side. Profit = retainer + project fees − cost.', ok: c ? 'Save changes' : 'Add client',
        fields: [
          { name: 'name', label: 'Client name', required: true, value: c ? c.name : '', placeholder: 'e.g. Bihar Government' },
          { name: 'billing', label: 'Billing', type: 'select', required: true, options: [{ v: 'billable', l: 'Billable' }, { v: 'non-billable', l: 'Non-billable (internal / pro bono)' }], value: c ? c.billing : 'billable' },
          { name: 'retainer', label: 'Monthly retainer (₹)', type: 'number', value: c ? (Number(c.retainer) || 0) : 0, min: 0, step: 1000, help: 'Fixed monthly amount the client pays. 0 if project-wise only.' },
          { name: 'contact_name', label: 'Contact person', value: c ? c.contact_name : '' },
          { name: 'phone', label: 'Phone', type: 'tel', value: c ? c.phone : '' },
          { name: 'email', label: 'Email', type: 'email', value: c ? c.email : '' },
          { name: 'notes', label: 'Notes', type: 'textarea', span: true, value: c ? c.notes : '' }
        ],
        onSubmit: async d => {
          const body = { name: d.name, billing: d.billing, retainer: Number(d.retainer) || 0, contact_name: d.contact_name, phone: d.phone, email: d.email, notes: d.notes };
          if (c) { await ClientModel.update(c.id, body); toast('Client updated.'); } else { await ClientModel.create(body); toast('Client added.'); }
          await reload('clients', 'projects');
        }
      });
    } else if (kind === 'employee') {
      const e = id ? employees.find(x => x.id === id) : null;
      const mgrOpts = [{ v: '', l: 'None' }].concat(employees.filter(x => !e || x.id !== e.id).map(x => ({ v: x.name, l: x.name + (x.role ? ' · ' + x.role : '') })));
      const currentMgr = e && Array.isArray(e.managers) && e.managers.length ? e.managers[0] : '';
      const autoEmpId = nextEmpCode(employees);
      openModal({
        title: e ? 'Edit staff' : 'Add staff', sub: e ? 'Leave the password blank to keep the current one.' : 'Creates the login. If this email already has a Limelight login it is linked as-is; type a password only to set a new one.', ok: e ? 'Save changes' : 'Add staff',
        fields: [
          { name: 'name', label: 'Full name', required: true, value: e ? e.name : '' },
          { name: 'email', label: 'Email (login)', type: 'email', required: true, value: e ? e.email : '' },
          { name: 'password', label: e ? 'New password' : 'Password', type: 'password', value: '', placeholder: e ? 'Leave blank to keep' : 'Blank = Limelight@123', validate: v => !v || v.length >= 6 || 'At least 6 characters.' },
          { name: 'phone', label: 'Phone', type: 'tel', value: e ? e.phone : '', placeholder: '98xxxxxxxx' },
          { name: 'role', label: 'Designation', required: true, value: e ? e.role : '', placeholder: 'e.g. Video Editor' },
          { name: 'dept', label: 'Department', type: 'select', required: true, placeholder: 'Select department', options: deptOpts, value: e ? e.dept : '' },
          { name: 'shift', label: 'Shift', type: 'select', required: true, options: settings && settings.shifts ? Object.entries(settings.shifts).map(([v, s]) => ({ v, l: s.display || s.label })) : Object.entries(SHIFTS).map(([v, l]) => ({ v, l })), value: e ? (e.shift || 'day') : 'day', help: (settings ? settings.graceMins : 20) + ' min grace after shift start. Overtime after the shift OT time at ' + (settings ? settings.otRate : 1) + '× hourly pay. Change the rules under Settings → Admin controls.' },
          { name: 'week_off', label: 'Weekly off', type: 'select', options: [{ v: '', l: 'Default (' + WEEK_DAYS[(settings && settings.weekOff && settings.weekOff[0]) ?? 0] + ')' }].concat(WEEK_DAYS.map((n, i) => ({ v: String(i), l: n }))).concat([{ v: '0,6', l: 'Saturday + Sunday' }, { v: '5,6', l: 'Friday + Saturday' }]), value: e ? (e.week_off || '') : '', help: 'Attendance, absents and leave balance skip this day' },
          { name: 'access', label: 'App access', type: 'select', required: true, options: Object.entries(ACCESS_LABEL).map(([v, l]) => ({ v, l })), value: e ? (e.access || 'staff') : 'staff' },
          { name: 'salary', label: 'Monthly salary (₹)', type: 'number', required: true, value: e ? (e.salary || 0) : 25000, min: 0, step: 500 },
          { name: 'emp_id', label: 'Employee ID', value: e ? (e.emp_id || '') : autoEmpId, placeholder: 'Auto (' + autoEmpId + ')' },
          { name: 'joined', label: 'Joining date', type: 'date', required: true, value: e ? (e.joined || '') : todayISO() },
          { name: 'dob', label: 'Date of birth', type: 'date', value: e ? (e.dob || '') : '' },
          { name: 'manager', label: 'Reporting manager', type: 'select', options: mgrOpts, value: currentMgr }
        ],
        onSubmit: async d => {
          const empIdToSave = (d.emp_id && String(d.emp_id).trim()) ? String(d.emp_id).trim() : (e ? (e.emp_id || '') : autoEmpId);
          const body = { name: d.name, email: d.email, phone: d.phone, role: d.role, dept: d.dept, shift: d.shift, week_off: d.week_off || '', salary: Number(d.salary) || 0, emp_id: empIdToSave, joined: d.joined, dob: d.dob || null, access: d.access, managers: d.manager ? [d.manager] : [] };
          if (d.password) body.password = d.password;
          if (e) { await EmployeeModel.update(e.id, body); toast('Staff updated.'); } else { const r = await EmployeeModel.create(body); toast(r && r.passwordSet ? 'Staff added. They can log in now.' : 'Staff added and linked to their existing login.'); }
          await reload('employees', 'departments', 'activity');
        }
      });
    } else if (kind === 'dept') {
      const x = id ? departments.find(d => d.id === id) : null;
      openModal({
        title: x ? 'Edit department' : 'Add department', ok: x ? 'Save changes' : 'Add department',
        fields: [
          { name: 'name', label: 'Department name', required: true, value: x ? x.name : '' },
          { name: 'billable', label: 'Type', type: 'select', options: [{ v: '1', l: 'Billable' }, { v: '0', l: 'Non-billable' }], value: x ? (x.billable ? '1' : '0') : '1' },
          { name: 'daily', label: 'Daily hours', type: 'number', value: x ? x.daily : 8, min: 1, step: 1 },
          { name: 'manager', label: 'Department head', type: 'select', options: empOpts, value: x ? (x.manager || '') : '' }
        ],
        onSubmit: async d => {
          const body = { name: d.name, billable: d.billable === '1', daily: Number(d.daily) || 8, manager: d.manager };
          if (x) { await DepartmentModel.update(x.id, body); toast('Department updated.'); } else { await DepartmentModel.create(body); toast('Department added.'); }
          await reload('departments', 'employees');
        }
      });
    } else if (kind === 'leave') {
      const canPickOthers = isAdmin; // everyone else applies for themselves only
      openModal({
        title: 'Apply leave / work from home', sub: 'Leave days count as paid days in payroll. Work-from-home days are normal working days: clock in as usual and the punch is marked WFH.', ok: 'Apply',
        fields: [
          { name: 'kind', label: 'Type', type: 'select', required: true, options: [{ v: 'leave', l: 'Leave' }, { v: 'wfh', l: 'Work from home' }], value: preset.kind || 'leave', onChange: v => ({ reason: v === 'wfh' ? 'Client visit' : 'Casual' }) },
          { name: 'emp', label: 'Employee', type: 'select', required: true, options: canPickOthers ? empOnly : empOnly.filter(o => o.v === meId), value: canPickOthers ? (preset.emp || meId) : meId, hidden: () => !canPickOthers },
          { name: 'from_date', label: 'From', type: 'date', required: true, value: todayISO() },
          { name: 'to_date', label: 'To', type: 'date', required: true, value: todayISO(), validate: (v, all) => v >= all.from_date || 'End date must be after start date.' },
          { name: 'reason', label: 'Reason', type: 'select', required: true, optionsFor: v => (v.kind === 'wfh' ? ['Client visit', 'Field work', 'Health', 'Weather / travel', 'Other'] : ['Casual', 'Sick', 'Personal', 'Vacation', 'Other']).map(x => ({ v: x, l: x })), value: 'Casual' },
          { name: 'remarks', label: 'Remarks', type: 'textarea', span: true, value: '', placeholder: 'Anything the team should know (optional)' }
        ],
        onSubmit: async d => {
          await LeaveModel.apply({ kind: d.kind, emp: d.emp, from_date: d.from_date, to_date: d.to_date, reason: d.reason, remarks: d.remarks });
          toast(isAdmin ? (d.kind === 'wfh' ? 'Work from home recorded.' : 'Leave recorded.') : 'Request sent. Admin will approve it; you will get a notification.');
          await reload('leaves', 'employees', 'activity', 'myStats');
        }
      });
    } else if (kind === 'payment') {
      openModal({
        title: id ? 'Edit payment' : 'Add payment', sub: 'Salary, advance and bonus reduce the pending balance. Fine increases it.', ok: id ? 'Save changes' : 'Add payment',
        fields: [
          { name: 'emp', label: 'Staff', type: 'select', options: empOnly, value: preset.emp || (id ? preset.row?.emp : meId) },
          { name: 'type', label: 'Type', type: 'select', options: PAY_TYPES.map(x => ({ v: x, l: x })), value: preset.type || (preset.row ? preset.row.type : 'Salary') },
          { name: 'amount', label: 'Amount (₹)', type: 'number', required: true, value: preset.amount || (preset.row ? preset.row.amount : ''), min: 1, step: 1 },
          { name: 'date', label: 'Date', type: 'date', required: true, value: preset.row ? preset.row.date : todayISO() },
          { name: 'note', label: 'Note', span: true, value: preset.row ? preset.row.note : '', placeholder: 'e.g. September salary' }
        ],
        onSubmit: async d => {
          const body = { emp: d.emp, type: d.type, amount: Number(d.amount), date: d.date, note: d.note };
          if (id) { await PaymentModel.update(id, body); toast('Payment updated.'); } else { await PaymentModel.create(body); toast('Payment recorded.'); }
          await reload('employees', 'activity');
          if (preset.after) preset.after();
        }
      });
    } else if (kind === 'attendance') {
      const a = preset.row || null;
      const sess = a && Array.isArray(a.sessions) ? a.sessions : [];
      const sessSub = sess.length > 0
        ? `${sess.length} previous completed session(s): ` + sess.map((s, idx) => `[S${idx + 1}: ${s.clock_in}-${s.clock_out}]`).join(', ')
        : '';
      openModal({
        title: a ? 'Edit attendance' : 'Mark attendance', sub: sessSub || undefined, ok: 'Save',
        fields: [
          { name: 'status', label: 'Status', type: 'select', options: [{ v: 'present', l: 'Present' }, { v: 'half', l: 'Half day' }, { v: 'absent', l: 'Absent' }, { v: 'leave', l: 'Leave' }], value: a ? (a.status || 'present') : 'present' },
          { name: 'mode', label: 'Mode', type: 'select', options: [{ v: 'office', l: 'Office' }, { v: 'wfh', l: 'Work from home' }, { v: 'field', l: 'On field' }], value: a ? a.mode : 'office' },
          { name: 'clock_in', label: 'Clock in', type: 'time', value: a ? a.clock_in : '' },
          { name: 'clock_out', label: 'Clock out', type: 'time', value: a ? (a.clock_out || '') : '' },
          { name: 'ot_hours', label: 'Overtime hours', type: 'number', value: a ? a.ot_hours : 0, min: 0, step: 0.5 },
          { name: 'fine_hours', label: 'Fine hours', type: 'number', value: a ? a.fine_hours : 0, min: 0, step: 0.5 },
          { name: 'note', label: 'Note', span: true, value: a ? a.note : '' }
        ],
        onSubmit: async d => {
          if (!a) throw new Error('Use the P / HD / A / L buttons to create a record first.');
          await AttendanceModel.update(a.id, { status: d.status, mode: d.mode, clock_in: d.clock_in, clock_out: d.clock_out, ot_hours: Math.round(((Number(d.ot_hours) || 0) + Number.EPSILON) * 100) / 100, fine_hours: Math.round(((Number(d.fine_hours) || 0) + Number.EPSILON) * 100) / 100, note: d.note });
          toast('Attendance saved.');
          await reload('today', 'employees');
          if (preset.after) preset.after();
        }
      });
    } else if (kind === 'announce') {
      openModal({
        title: 'Send announcement', sub: 'Goes to everybody as a notification and as a push notification on their phones.', ok: 'Send',
        fields: [
          { name: 'dept', label: 'Send to', type: 'select', options: [{ v: '', l: 'Everyone' }].concat(deptOpts), value: '' },
          { name: 'text', label: 'Message', type: 'textarea', required: true, value: '', placeholder: 'e.g. Office closed tomorrow for Diwali. Enjoy the holiday!', validate: v => (v && v.length <= 500) || 'Keep it under 500 characters.' }
        ],
        onSubmit: async d => {
          const r = await ActivityModel.broadcast(d.text, d.dept);
          toast((r && r.message) || 'Announcement sent.');
          await reload('activity');
        }
      });
    } else if (kind === 'password') {
      openModal({
        title: 'Change password', sub: 'You stay signed in on this device; use the new password on your next login.', ok: 'Change password',
        fields: [
          { name: 'current', label: 'Current password', type: 'password', required: true, value: '' },
          { name: 'next', label: 'New password', type: 'password', required: true, value: '', validate: v => (v && v.length >= 6) || 'At least 6 characters.' },
          { name: 'confirm', label: 'Confirm new password', type: 'password', required: true, value: '' }
        ],
        onSubmit: async d => {
          if (d.next !== d.confirm) throw new Error('New passwords do not match.');
          const r = await AuthModel.changePassword(d.current, d.next);
          toast((r && r.message) || 'Password changed.');
        }
      });
    } else if (kind === 'holiday') {
      openModal({
        title: 'Add holiday', sub: 'Holidays show under Events for everyone.', ok: 'Add holiday',
        fields: [
          { name: 'name', label: 'Holiday name', required: true, span: true, value: '', placeholder: 'e.g. Diwali' },
          { name: 'date', label: 'Date', type: 'date', required: true, value: todayISO() }
        ],
        onSubmit: async d => { await HolidayModel.create({ name: d.name, date: d.date }); toast('Holiday added.'); await reload('holidays'); }
      });
    } else if (kind === 'file') {
      const projOpts = [{ v: '', l: 'General' }].concat(projects.map(p => ({ v: p.id, l: p.name })));
      openModal({
        title: 'Upload file', sub: 'Files are stored on the server and listed under the project.', ok: 'Upload',
        fields: [
          { name: 'file', label: 'File', type: 'file', required: true, span: true, error: 'Choose a file first.' },
          { name: 'project', label: 'Project', type: 'select', options: projOpts, value: preset.project || '' }
        ],
        onSubmit: async d => {
          await FileModel.upload(d.file, d.project);
          toast('File uploaded.');
          await reload('files', 'activity');
        }
      });
    }
  }, [employees, departments, projects, tasks, clients, settings, assignableProjects, me, isAdmin, openModal, toast, reload]);

  return { open };
}
