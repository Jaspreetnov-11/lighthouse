'use strict';

/**
 * Task workflow
 *   pipeline  -> assignee accepts        -> progress (timer starts: started_at)
 *   progress  -> assignee submits        -> approval
 *   approval  -> team leader approves    -> completed (timer stops: completed_at, taken_mins)
 *   approval  -> team leader requests    -> changes   -> assignee resumes -> progress
 *
 * Only admins and the project's team leader (project.manager) can create / edit / delete tasks
 * in that project. Assignees can move their own tasks through the workflow.
 */

const taskModel = require('../models/task.model');
const projectModel = require('../models/project.model');
const employeeModel = require('../models/employee.model');
const activityModel = require('../models/activity.model');
const apiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { todayISO } = require('../utils/calculations');
const attendanceModel = require('../models/attendance.model');
const worktime = require('../services/worktime.service');

/** Minutes actually worked on a task: its timer span intersected with the assignees' clocked-in time. */
async function cappedTaken(task) {
  const first = worktime.taskSpan(task);
  if (!task || !first) return 0;
  const rows = await attendanceModel.getSince(new Date(first[0] - 86400000).toISOString().slice(0, 10));
  return worktime.taskWorkedMinutes(task, worktime.attendanceIntervalsByEmp(rows));
}

const splitIds = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const nowISO = () => new Date().toISOString();
const minsSince = iso => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

async function assertCanManage(req, projectId, task = null) {
  if (req.user.role === 'admin' || req.user.role === 'manager') return null; // team leaders may assign on any project
  if (task && task.assigned_by === req.user.id) return null;
  if (!projectId) throw new AppError('Select a project. Only its team leader can assign tasks.', 403);
  const project = await projectModel.findById(projectId);
  if (!project) throw new AppError('Project not found', 404);
  const managers = splitIds(project.manager);
  if (!managers.includes(req.user.id)) throw new AppError('Only the team leader of this project can assign or edit its tasks.', 403);
  return project;
}

function parseUserTimers(v, assignees = []) {
  let map = {};
  if (v) {
    try {
      map = typeof v === 'string' ? JSON.parse(v) : (typeof v === 'object' && v !== null ? v : {});
    } catch (e) {
      map = {};
    }
  }
  const ids = Array.isArray(assignees) ? assignees : splitIds(assignees);
  const result = {};
  for (const id of ids) {
    result[id] = map[id] || { status: 'pipeline', started_at: null, completed_at: null, taken_mins: 0 };
  }
  return result;
}

function calculateUserMins(spans, empId, now = Date.now()) {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  let totalMs = 0;
  for (const sp of spans) {
    if (sp && (!sp.u || sp.u === empId)) {
      const s = Date.parse(sp.s);
      const e = sp.e ? Date.parse(sp.e) : nowMs;
      if (!isNaN(s) && !isNaN(e) && e > s) {
        totalMs += (e - s);
      }
    }
  }
  return Math.round(totalMs / 60000);
}

/**
 * Fields that change when the status moves.
 * Supports both single-assignee tasks and independent per-user timers for multi-assignee tasks.
 */
function statusPatch(existing, status, actorId = null) {
  const now = nowISO();
  const assignees = splitIds(existing.assignee || existing.assignees);
  const isMulti = assignees.length > 1;
  const isAssigneeActor = isMulti && actorId && assignees.includes(actorId);

  let spans = worktime.parseSpans(existing);
  if (!spans.length && existing.started_at) {
    spans = [{ s: existing.started_at, e: existing.completed_at || (existing.status === 'progress' ? null : (existing.updated_at || now)) }];
  }

  // Multi-assignee: assignee starts, pauses, or finishes their own part
  if (isAssigneeActor) {
    const userTimers = parseUserTimers(existing.user_timers, assignees);
    const uPrev = userTimers[actorId] || {};

    // Close any open span for this specific user
    for (const sp of spans) {
      if ((!sp.u || sp.u === actorId) && !sp.e) sp.e = now;
    }

    if (status === 'pipeline') {
      userTimers[actorId] = { status: 'pipeline', started_at: null, completed_at: null, taken_mins: 0 };
      spans = spans.filter(sp => sp.u && sp.u !== actorId);
    } else if (status === 'progress') {
      spans.push({ s: now, u: actorId });
      userTimers[actorId] = {
        status: 'progress',
        started_at: uPrev.started_at || now,
        completed_at: null,
        taken_mins: uPrev.taken_mins || 0
      };
    } else if (status === 'approval' || status === 'completed') {
      const userMins = calculateUserMins(spans, actorId, now);
      userTimers[actorId] = {
        status,
        started_at: uPrev.started_at || now,
        completed_at: now,
        taken_mins: userMins
      };
    } else if (status === 'changes') {
      userTimers[actorId] = {
        status: 'changes',
        started_at: uPrev.started_at || now,
        completed_at: null,
        taken_mins: uPrev.taken_mins || 0
      };
    }

    // Determine overall task status from all assignees
    const statuses = assignees.map(id => userTimers[id]?.status || 'pipeline');
    let overallStatus = 'pipeline';
    if (statuses.every(s => s === 'completed')) {
      overallStatus = 'completed';
    } else if (statuses.every(s => s === 'approval' || s === 'completed')) {
      overallStatus = 'approval';
    } else if (statuses.some(s => s === 'progress')) {
      overallStatus = 'progress';
    } else if (statuses.some(s => s === 'changes')) {
      overallStatus = 'changes';
    } else if (statuses.some(s => s === 'approval')) {
      overallStatus = 'progress';
    }

    const startedTimes = assignees.map(id => userTimers[id]?.started_at).filter(Boolean).sort();
    const patch = {
      status: overallStatus,
      started_at: startedTimes[0] || null,
      spans: JSON.stringify(spans),
      user_timers: JSON.stringify(userTimers),
      taken_mins: assignees.reduce((acc, id) => acc + (Number(userTimers[id]?.taken_mins) || 0), 0)
    };

    if (overallStatus === 'completed') {
      patch.completed = todayISO();
      patch.completed_at = now;
    } else if (overallStatus === 'approval') {
      patch.completed = null;
      patch.completed_at = now;
    } else {
      patch.completed = null;
      patch.completed_at = null;
    }
    return patch;
  }

  // Single-assignee OR Team Leader / Admin changing overall task
  for (const sp of spans) if (!sp.e) sp.e = now;

  const patch = { status };
  let userTimers = isMulti
    ? parseUserTimers(existing.user_timers, assignees)
    : (assignees.length ? { [assignees[0]]: { status, started_at: existing.started_at, completed_at: existing.completed_at, taken_mins: existing.taken_mins || 0 } } : {});

  if (status === 'pipeline') {
    spans = [];
    patch.started_at = null; patch.completed = null; patch.completed_at = null; patch.taken_mins = 0;
    for (const id of assignees) {
      userTimers[id] = { status: 'pipeline', started_at: null, completed_at: null, taken_mins: 0 };
    }
  } else if (status === 'progress') {
    if (isMulti) {
      for (const id of assignees) {
        if (!userTimers[id] || userTimers[id].status === 'pipeline') {
          spans.push({ s: now, u: id });
          userTimers[id] = { status: 'progress', started_at: now, completed_at: null, taken_mins: 0 };
        }
      }
    } else {
      spans.push({ s: now, u: assignees[0] || null });
      if (assignees[0]) {
        userTimers[assignees[0]] = { status: 'progress', started_at: userTimers[assignees[0]]?.started_at || now, completed_at: null, taken_mins: userTimers[assignees[0]]?.taken_mins || 0 };
      }
    }
    if (!existing.started_at) patch.started_at = now;
    patch.completed = null; patch.completed_at = null;
  } else if (status === 'approval') {
    patch.completed = null; patch.completed_at = now;
    for (const id of assignees) {
      if (userTimers[id]) {
        userTimers[id].status = 'approval';
        userTimers[id].completed_at = now;
        userTimers[id].taken_mins = calculateUserMins(spans, id, now);
      }
    }
  } else if (status === 'completed') {
    patch.completed = todayISO();
    patch.completed_at = existing.status === 'approval' && existing.completed_at ? existing.completed_at : now;
    for (const id of assignees) {
      if (userTimers[id]) {
        userTimers[id].status = 'completed';
        userTimers[id].completed_at = patch.completed_at;
        userTimers[id].taken_mins = calculateUserMins(spans, id, now);
      }
    }
  } else if (status === 'changes') {
    patch.completed = null; patch.completed_at = null;
    for (const id of assignees) {
      if (userTimers[id]) {
        userTimers[id].status = 'changes';
        userTimers[id].completed_at = null;
      }
    }
  }

  patch.spans = JSON.stringify(spans);
  patch.user_timers = JSON.stringify(userTimers);
  return patch;
}

async function notifyAssignees(ids, task, text) {
  await activityModel.notify(ids, text, { kind: 'task', link: '/tasks?task=' + task.id, ref_type: 'task', ref_id: task.id });
}

const getAllTasks = catchAsync(async (req, res) => {
  const { assignee, project, status, overdueOnly, page = 1, limit = 500 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const [tasks, total, statusCounts] = await Promise.all([
    taskModel.filterTasks({ assignee, project, status, overdueOnly: overdueOnly === 'true' || overdueOnly === true, todayDate: todayISO(), limit, offset }),
    taskModel.count(),
    taskModel.getStatusCounts(assignee)
  ]);
  // worked_mins: task time while the assignees were clocked in (what the timers and productivity show)
  const started = tasks.filter(t => t.started_at);
  if (started.length) {
    const earliest = started.map(t => String(t.started_at).slice(0, 10)).sort()[0];
    const byEmp = worktime.attendanceIntervalsByEmp(await attendanceModel.getSince(earliest));
    for (const t of tasks) t.worked_mins = worktime.taskWorkedMinutes(t, byEmp);
  }
  return apiResponse.success(res, tasks, 'Tasks fetched successfully', 200, { total, statusCounts });
});

const getTaskById = catchAsync(async (req, res) => {
  const task = await taskModel.findById(req.params.id);
  if (!task) throw new AppError('Task not found', 404);
  return apiResponse.success(res, task);
});

const createTask = catchAsync(async (req, res) => {
  const { title, project, dept, assignee, assigned = todayISO(), deadline, mins = 0, type, status = 'pipeline', flag = false } = req.body;
  const projectRow = await assertCanManage(req, project);
  const ids = splitIds(assignee);
  if (!ids.length) throw new AppError('Assign the task to at least one person.', 400);
  if (deadline < assigned) throw new AppError('Deadline cannot be before the assigned date.', 400);

  const initialUserTimers = {};
  for (const uid of ids) {
    initialUserTimers[uid] = { status: 'pipeline', started_at: null, completed_at: null, taken_mins: 0 };
  }

  const id = 't_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const base = {
    id, title, project, dept,
    assignee: ids.join(','),
    assigned_by: req.user.id,
    assigned, deadline,
    mins: Number(mins) || 0,
    type,
    flag: flag ? 1 : 0,
    status: 'pipeline',
    started_at: null,
    completed_at: null,
    taken_mins: 0,
    spans: '[]',
    user_timers: JSON.stringify(initialUserTimers)
  };
  const task = await taskModel.create({ ...base, ...statusPatch(base, status, req.user.id) });

  const projName = projectRow ? projectRow.name : ((await projectModel.findById(project)) || {}).name || 'project';
  await notifyAssignees(ids, task, `New task assigned to you by ${req.user.name}: "${title}" (${projName}) · due ${deadline}`);
  await activityModel.log(`${req.user.name} assigned "${title}" (${projName})`);
  return apiResponse.created(res, task, 'Task created successfully');
});

const updateTask = catchAsync(async (req, res) => {
  const existing = await taskModel.findById(req.params.id);
  if (!existing) throw new AppError('Task not found', 404);
  await assertCanManage(req, req.body.project || existing.project, existing);

  const updateData = { ...req.body };
  for (const k of ['id', 'assigned_by', 'started_at', 'completed_at', 'taken_mins', 'project_name', 'assignee_name', 'assignee_role', 'assignee_av', 'assignee_ini']) delete updateData[k];
  if (updateData.assignee !== undefined) {
    const ids = splitIds(updateData.assignee);
    if (!ids.length) throw new AppError('Assign the task to at least one person.', 400);
    updateData.assignee = ids.join(',');
    const prevTimers = parseUserTimers(existing.user_timers, ids);
    const nextTimers = {};
    for (const uid of ids) {
      nextTimers[uid] = prevTimers[uid] || { status: 'pipeline', started_at: null, completed_at: null, taken_mins: 0 };
    }
    updateData.user_timers = JSON.stringify(nextTimers);
  }
  if (updateData.flag !== undefined) updateData.flag = updateData.flag ? 1 : 0;
  if (updateData.mins !== undefined) updateData.mins = Number(updateData.mins) || 0;
  if (updateData.status && updateData.status !== existing.status) {
    Object.assign(updateData, statusPatch(existing, updateData.status, req.user.id));
    if (updateData.status !== 'pipeline') updateData.taken_mins = await cappedTaken({ ...existing, ...updateData });
  }
  else delete updateData.status;

  const updated = await taskModel.update(existing.id, updateData);

  const before = new Set(splitIds(existing.assignee));
  const added = splitIds(updated.assignee).filter(x => !before.has(x));
  if (added.length) await notifyAssignees(added, updated, `New task assigned to you: "${updated.title}" · due ${updated.deadline}`);
  return apiResponse.success(res, updated, 'Task updated successfully');
});

const updateTaskStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const existing = await taskModel.findById(req.params.id);
  if (!existing) throw new AppError('Task not found', 404);

  const ids = splitIds(existing.assignee);
  const isMulti = ids.length > 1;
  const isAssignee = ids.includes(req.user.id);
  if (!isMulti && existing.status === status) return apiResponse.success(res, existing, 'No change');
  if (isMulti && isAssignee) {
    const currentTimers = parseUserTimers(existing.user_timers, ids);
    if (currentTimers[req.user.id] && currentTimers[req.user.id].status === status) {
      return apiResponse.success(res, existing, 'No change');
    }
  } else if (existing.status === status) {
    return apiResponse.success(res, existing, 'No change');
  }

  const isCreator = existing.assigned_by === req.user.id;
  const isAdminOrMgr = req.user.role === 'admin' || req.user.role === 'manager' || req.user.access === 'admin' || req.user.access === 'manager';
  let isLeader = isAdminOrMgr || isCreator;
  if (!isLeader && existing.project) {
    const p = await projectModel.findById(existing.project);
    isLeader = Boolean(p && splitIds(p.manager).includes(req.user.id));
  }
  // Allow leaders, creators, managers, admins, and assignees to move/shuffle tasks across any column
  const allowed = isLeader || isAssignee;
  if (!allowed) {
    throw new AppError('Only the assignee, team leader, or admin can move this task.', 403);
  }

  const patch = statusPatch(existing, status, req.user.id);
  if (patch.status !== 'pipeline') patch.taken_mins = await cappedTaken({ ...existing, ...patch });
  const updated = await taskModel.update(existing.id, patch);

  const who = req.user.name;
  if (status === 'progress' && (existing.status === 'pipeline' || isMulti)) {
    await activityModel.log(`${who} ${isMulti ? 'started working on' : 'accepted'} "${existing.title}"`);
  } else if (status === 'approval') {
    await activityModel.log(`${who} submitted "${existing.title}" for approval`);
    if (existing.project) {
      const p = await projectModel.findById(existing.project);
      if (p && p.manager) {
        const mgrs = splitIds(p.manager).filter(id => id !== req.user.id);
        if (mgrs.length) await activityModel.notify(mgrs, `"${existing.title}" is waiting for your approval`, { kind: 'task', link: '/tasks?task=' + existing.id, ref_type: 'task', ref_id: existing.id });
      }
    }
  } else if (status === 'completed') {
    await activityModel.log(`${who} approved "${existing.title}"`);
    await notifyAssignees(ids, updated, `"${existing.title}" was approved and marked completed`);
  } else if (status === 'changes') {
    await activityModel.log(`${who} requested changes on "${existing.title}"`);
    await notifyAssignees(ids, updated, `Changes requested on "${existing.title}"`);
  } else {
    await activityModel.log(`${who} moved "${existing.title}" to ${status}`);
  }

  return apiResponse.success(res, updated, `Task moved to ${status}`);
});

const deleteTask = catchAsync(async (req, res) => {
  const existing = await taskModel.findById(req.params.id);
  if (!existing) throw new AppError('Task not found', 404);
  await assertCanManage(req, existing.project, existing);
  await taskModel.delete(existing.id);
  return apiResponse.success(res, null, 'Task deleted successfully');
});

/**
 * Direct task reassignment:
 * Any current assignee can reassign their task to another colleague (e.g. when overloaded),
 * without requiring team leader intervention. Project team leaders and admins can also reassign.
 */
const reassignTask = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { assignee, note = '' } = req.body;
  const existing = await taskModel.findById(id);
  if (!existing) throw new AppError('Task not found', 404);

  const currentAssignees = splitIds(existing.assignee);
  const isAssignee = currentAssignees.includes(req.user.id);
  let isLeader = req.user.role === 'admin';
  let projectRow = null;
  if (existing.project) {
    projectRow = await projectModel.findById(existing.project);
    if (projectRow && splitIds(projectRow.manager).includes(req.user.id)) {
      isLeader = true;
    }
  }

  if (!isAssignee && !isLeader) {
    throw new AppError('Only the current assignee, project team leader, or admin can reassign this task.', 403);
  }

  const newIds = splitIds(assignee).filter(x => x !== req.user.id);
  if (!newIds.length) {
    throw new AppError('Select at least one colleague (other than yourself) to reassign this task to.', 400);
  }

  const initialUserTimers = {};
  for (const uid of newIds) {
    initialUserTimers[uid] = { status: 'pipeline', started_at: null, completed_at: null, taken_mins: 0 };
  }

  const updated = await taskModel.update(existing.id, {
    assignee: newIds.join(','),
    reassigned_by: req.user.id,
    reassign_note: String(note || '').trim(),
    status: 'pipeline',
    started_at: null,
    completed_at: null,
    taken_mins: 0,
    spans: '[]',
    user_timers: JSON.stringify(initialUserTimers)
  });

  const who = req.user.name;
  const noteSuffix = note ? ` (Note: ${note})` : '';

  // Notify new assignees
  await notifyAssignees(newIds, updated, `${who} reassigned task to you: "${existing.title}"${noteSuffix}`);

  // Notify project leaders if reassigned by assignee
  if (projectRow && projectRow.manager) {
    const leaderIds = splitIds(projectRow.manager).filter(lid => lid !== req.user.id);
    if (leaderIds.length) {
      await activityModel.notify(leaderIds, `${who} reassigned "${existing.title}" to ${newIds.join(', ')}${noteSuffix}`, {
        kind: 'task',
        link: '/tasks?task=' + existing.id,
        ref_type: 'task',
        ref_id: existing.id
      });
    }
  }

  await activityModel.log(`${who} reassigned "${existing.title}"${noteSuffix}`);
  return apiResponse.success(res, updated, 'Task reassigned successfully');
});

/**
 * Reject a reassigned task:
 * When the recipient of a reassigned task rejects it, it automatically returns
 * back to the user who reassigned/assigned it, placing it back in their pipeline.
 */
const rejectTask = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason = '' } = req.body;
  const existing = await taskModel.findById(id);
  if (!existing) throw new AppError('Task not found', 404);

  const currentAssignees = splitIds(existing.assignee);
  if (!currentAssignees.includes(req.user.id)) {
    throw new AppError('Only the current assignee can reject this task.', 403);
  }

  // Determine who to return the task to: the person who reassigned it, or who assigned it
  const returnTo = existing.reassigned_by || existing.assigned_by;
  if (!returnTo || returnTo === req.user.id) {
    throw new AppError('No prior assigner found to return this task to.', 400);
  }

  const updated = await taskModel.update(existing.id, {
    assignee: returnTo,
    reassigned_by: '',
    reassign_note: '',
    status: 'pipeline',
    started_at: null,
    completed_at: null,
    taken_mins: 0,
    spans: '[]',
    user_timers: JSON.stringify({ [returnTo]: { status: 'pipeline', started_at: null, completed_at: null, taken_mins: 0 } })
  });

  const who = req.user.name;
  const reasonSuffix = reason ? ` (Reason: ${reason})` : '';

  // Notify the user who originally reassigned/assigned the task
  await activityModel.notify(
    [returnTo],
    `${who} rejected task "${existing.title}". It has been returned to your pipeline.${reasonSuffix}`,
    {
      kind: 'task',
      link: '/tasks?task=' + existing.id,
      ref_type: 'task',
      ref_id: existing.id
    }
  );

  await activityModel.log(`${who} rejected task "${existing.title}" · returned to previous assigner${reasonSuffix}`);
  return apiResponse.success(res, updated, 'Task rejected and returned to assigner');
});

/**
 * Self Task Assign:
 * Allows any staff member to create and assign tasks to themselves.
 */
const createSelfTask = catchAsync(async (req, res) => {
  const { title, project = '', dept = '', deadline = todayISO(), mins = 120, type = 'Feature', status = 'progress' } = req.body;
  if (!title || title.trim().length < 2) {
    throw new AppError('Task title must be at least 2 characters.', 400);
  }

  const userEmp = await employeeModel.findById(req.user.id);
  const taskDept = dept || (userEmp ? userEmp.dept : '') || '';
  const assigned = todayISO();
  const taskDeadline = deadline < assigned ? assigned : deadline;

  const id = 't_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const base = {
    id,
    title: title.trim(),
    project: project || '',
    dept: taskDept,
    assignee: req.user.id,
    assigned_by: req.user.id,
    assigned,
    deadline: taskDeadline,
    mins: Number(mins) || 120,
    type: type || 'Feature',
    flag: 0,
    status: 'pipeline',
    started_at: null,
    spans: '[]',
    completed_at: null,
    taken_mins: 0
  };

  const initialStatus = ['pipeline', 'progress'].includes(status) ? status : 'progress';
  const task = await taskModel.create({ ...base, ...statusPatch(base, initialStatus) });

  let projName = 'Personal / Operational';
  if (project) {
    const p = await projectModel.findById(project);
    if (p) projName = p.name;
  }

  await activityModel.log(`${req.user.name} created self-assigned task "${title.trim()}" (${projName})`);
  return apiResponse.created(res, task, 'Self-task created successfully');
});

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  reassignTask,
  rejectTask,
  createSelfTask,
  parseUserTimers,
  calculateUserMins,
  statusPatch
};
