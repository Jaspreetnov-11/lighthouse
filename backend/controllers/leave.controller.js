'use strict';

const leaveModel = require('../models/leave.model');
const employeeModel = require('../models/employee.model');
const activityModel = require('../models/activity.model');
const apiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { todayISO } = require('../utils/calculations');

const getAllLeaves = catchAsync(async (req, res) => {
  const { empId, month } = req.query;

  // Admins see everyone; others only their own
  const scopeEmp = req.user.role === 'admin' ? empId : req.user.id;
  let leaves;
  if (scopeEmp) {
    leaves = await leaveModel.getEmployeeLeaves(scopeEmp, month);
  } else {
    leaves = await leaveModel.findAll({}, { orderBy: 'from_date DESC', limit: 300 });
  }

  return apiResponse.success(res, leaves);
});

const getLeavesToday = catchAsync(async (req, res) => {
  const today = todayISO();
  const onLeave = await leaveModel.getLeavesOnDate(today);
  return apiResponse.success(res, onLeave);
});

const applyLeave = catchAsync(async (req, res) => {
  const { from_date, to_date, reason = '', emp, remarks = '' } = req.body;
  const kind = req.body.kind === 'wfh' ? 'wfh' : 'leave';
  // Everyone applies for themselves; only admins can record leave / WFH for someone else
  const targetEmpId = req.user.role === 'admin' && emp ? emp : req.user.id;

  // Admins' own entries are approved straight away; everyone else's wait for an admin decision
  const status = req.user.role === 'admin' ? 'approved' : 'pending';
  const id = 'l_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const leave = await leaveModel.create({
    id,
    emp: targetEmpId,
    from_date,
    to_date,
    reason,
    kind,
    remarks: String(remarks || '').trim().slice(0, 500),
    status
  });

  const empRecord = await employeeModel.findById(targetEmpId);
  const name = empRecord ? empRecord.name : 'Staff';
  const span = from_date === to_date ? from_date : `${from_date} to ${to_date}`;
  const what = kind === 'wfh' ? 'work from home' : 'leave';
  const detail = `${span}${reason ? ' · ' + reason : ''}${leave.remarks ? ' · ' + leave.remarks : ''}`;
  if (status === 'pending') {
    const admins = await employeeModel.findAll({ access: 'admin' });
    // Approvers open the Leaves page where every pending request lives
    await activityModel.notify(admins.map(a => a.id).filter(x => x !== req.user.id), `${name} requested ${what}: ${detail}`, { kind: 'leave', link: '/leaves?leave=' + leave.id, ref_type: 'leave', ref_id: leave.id });
    await activityModel.log(`${name} requested ${what} (${span}) · awaiting approval`);
  } else {
    await activityModel.log(`${name} ${kind === 'wfh' ? 'will work from home' : 'is on leave'} (${detail})`);
  }

  return apiResponse.created(res, leave, status === 'pending' ? (kind === 'wfh' ? 'Work-from-home request send for approval' : 'Leave request send for approval') : (kind === 'wfh' ? 'Work from home recorded' : 'Leave recorded'));
});

/** Admin approves or rejects a leave / WFH request; the person is notified. */
const decideLeave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const status = req.body.status === 'approved' ? 'approved' : req.body.status === 'rejected' ? 'rejected' : null;
  if (!status) throw new AppError('status must be approved or rejected', 400);
  const existing = await leaveModel.findById(id);
  if (!existing) throw new AppError('Request not found', 404);
  const note = String(req.body.note || '').trim().slice(0, 300);
  const updated = await leaveModel.update(id, { status, remarks: note ? `${existing.remarks || ''}${existing.remarks ? ' · ' : ''}Admin: ${note}` : existing.remarks });
  const span = existing.from_date === existing.to_date ? existing.from_date : `${existing.from_date} to ${existing.to_date}`;
  const what = existing.kind === 'wfh' ? 'work from home' : 'leave';
  await activityModel.notify(existing.emp, `Your ${what} request (${span}) was ${status}${note ? ' · ' + note : ''}`, { kind: 'leave', link: '/leaves?leave=' + id, ref_type: 'leave', ref_id: id });
  const empRecord = await employeeModel.findById(existing.emp);
  await activityModel.log(`${req.user.name} ${status} ${empRecord ? empRecord.name + "'s" : 'a'} ${what} request (${span})`);
  return apiResponse.success(res, updated, `Request ${status}`);
});

const deleteLeave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const existing = await leaveModel.findById(id);
  if (!existing) {
    throw new AppError('Leave record not found', 404);
  }
  // Staff may withdraw their own pending request; admins can remove any record
  if (req.user.role !== 'admin' && !(existing.emp === req.user.id && existing.status === 'pending')) {
    throw new AppError('Only admins can remove this record.', 403);
  }

  await leaveModel.delete(id);
  return apiResponse.success(res, null, 'Leave record deleted successfully');
});

module.exports = {
  getAllLeaves,
  getLeavesToday,
  applyLeave,
  decideLeave,
  deleteLeave
};
