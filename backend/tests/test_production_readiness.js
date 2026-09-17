'use strict';

/**
 * Production Readiness Test Suite
 * Validates all 4 newly implemented features + backward compatibility + security:
 * 1. Deduct leave with leave_type (Casual Leave, Sick Leave, etc.)
 * 2. Multi-leader projects (comma-separated managers, auth checks, permissions)
 * 3. Direct task reassignment by assignee (independent of leader)
 * 4. Self-task creation, update, and deletion (with or without project)
 * 5. Single leader project backward compatibility
 * 6. Database schema column validation
 */

const assert = require('assert');
const db = require('../config/db');
const { initDatabase } = require('../database/init');
const attendanceModel = require('../models/attendance.model');
const projectModel = require('../models/project.model');
const taskModel = require('../models/task.model');
const employeeModel = require('../models/employee.model');
const taskController = require('../controllers/task.controller');
const attendanceController = require('../controllers/attendance.controller');
const projectController = require('../controllers/project.controller');
const { todayISO } = require('../utils/calculations');

// Mock request / response helpers
function mockReq(user, body = {}, params = {}, query = {}) {
  return { user, body, params, query };
}

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.data = payload; return this; }
  };
  return res;
}

function callCtrl(fn, req, res) {
  return new Promise((resolve, reject) => {
    const next = err => (err ? reject(err) : resolve(res));
    const origJson = res.json.bind(res);
    res.json = payload => {
      origJson(payload);
      resolve(res);
      return res;
    };
    Promise.resolve(fn(req, res, next)).catch(reject);
  });
}

async function runTests() {
  console.log('=== STARTING PRODUCTION READINESS AUDIT ===\n');

  await initDatabase();

  // Test employees
  const adminUser = { id: 'test_admin_prod', name: 'Prod Admin', role: 'admin' };
  const lead1 = { id: 'test_lead_1', name: 'Lead One', role: 'staff' };
  const lead2 = { id: 'test_lead_2', name: 'Lead Two', role: 'staff' };
  const staff1 = { id: 'test_staff_1', name: 'Staff Alex', role: 'staff' };
  const staff2 = { id: 'test_staff_2', name: 'Staff Bob', role: 'staff' };

  for (const u of [adminUser, lead1, lead2, staff1, staff2]) {
    const existing = await employeeModel.findById(u.id);
    if (!existing) {
      await employeeModel.create({
        id: u.id,
        name: u.name,
        role: u.role === 'admin' ? 'Super Admin' : 'Developer',
        dept: 'Tech',
        email: `${u.id}@example.com`,
        salary: 50000,
        access: u.role === 'admin' ? 'admin' : 'staff',
        active: 1
      });
    }
  }

  // ----------------------------------------------------
  // TEST 1: Database Column Check
  // ----------------------------------------------------
  console.log('1. Auditing Database Columns:');
  const attCols = await db.columns('lh_attendance');
  assert(attCols.has('leave_type'), 'lh_attendance must have leave_type column');
  console.log('   ✓ lh_attendance has leave_type column');

  // ----------------------------------------------------
  // TEST 2: Deduct Leave Flow with leave_type
  // ----------------------------------------------------
  console.log('\n2. Testing Deduct Leave Flow:');
  const today = todayISO();
  // Clear any existing attendance for test_staff_1 today
  const existingAtt = await attendanceModel.findByEmpAndDate(staff1.id, today);
  if (existingAtt) await attendanceModel.delete(existingAtt.id);

  // Admin marks attendance as leave with leave_type = Weekly Off
  const markReq = mockReq(adminUser, {
    emp: staff1.id,
    date: today,
    status: 'leave',
    leave_type: 'Weekly Off'
  });
  const markRes = await callCtrl(attendanceController.markAttendance, markReq, mockRes());
  assert.strictEqual(markRes.statusCode, 200, 'Attendance marking failed');
  assert.strictEqual(markRes.data.data.status, 'leave');
  assert.strictEqual(markRes.data.data.leave_type, 'Weekly Off');

  // Fetch via list and verify leave_type is included in response
  const listReq = mockReq(adminUser, {}, {}, { date: today });
  const listRes = await callCtrl(attendanceController.getAttendanceList, listReq, mockRes());
  const found = (listRes.data.data || []).find(x => x.emp === staff1.id);
  assert(found, 'Employee attendance record must be in day list');
  assert.strictEqual(found.leave_type, 'Weekly Off', 'Returned leave_type should match Weekly Off');
  console.log('   ✓ Leave deducted with Weekly Off and verified in listDayAttendance');

  // ----------------------------------------------------
  // TEST 3: Multi-Leader Projects
  // ----------------------------------------------------
  console.log('\n3. Testing Multi-Leader Projects:');
  // Admin creates project with two managers: lead1 and lead2
  const pId = 'p_prod_test_' + Date.now();
  const proj = await projectModel.create({
    id: pId,
    name: 'Multi-Leader Alpha',
    manager: `${lead1.id}, ${lead2.id}`,
    client: 'Acme Corp',
    billable: 1,
    alloc: 120,
    status: 'Approved'
  });
  assert(proj, 'Project creation failed');

  // Verify managerIds format logic
  const splitIds = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  const managers = splitIds(proj.manager);
  assert(managers.includes(lead1.id) && managers.includes(lead2.id), 'Both leaders must be present in manager field');

  // Verify Lead 1 can update the project
  const updateReq1 = mockReq(lead1, { name: 'Multi-Leader Alpha Updated', alloc: 180 }, { id: pId });
  const updateRes1 = await callCtrl(projectController.updateProject, updateReq1, mockRes());
  assert.strictEqual(updateRes1.statusCode, 200, 'Lead 1 should be allowed to update project');

  // Verify Lead 2 can also update the project
  const updateReq2 = mockReq(lead2, { alloc: 200 }, { id: pId });
  const updateRes2 = await callCtrl(projectController.updateProject, updateReq2, mockRes());
  assert.strictEqual(updateRes2.statusCode, 200, 'Lead 2 should be allowed to update project');

  // Verify unauthorized staff cannot update project
  try {
    const unauthReq = mockReq(staff1, { name: 'Hacked' }, { id: pId });
    await callCtrl(projectController.updateProject, unauthReq, mockRes());
    assert.fail('Unauthorized staff should not be able to update project');
  } catch (err) {
    assert.strictEqual(err.statusCode, 403, 'Should reject with 403 Forbidden');
  }
  console.log('   ✓ Both team leaders have authorization; unauthorized staff rejected with 403');

  // ----------------------------------------------------
  // TEST 4: Direct Task Reassignment & Rejection Lifecycle
  // ----------------------------------------------------
  console.log('\n4. Testing Direct Task Reassignment & Rejection:');
  // Create a task assigned to staff1
  const tId = 't_prod_reassign_' + Date.now();
  const task = await taskModel.create({
    id: tId,
    title: 'Design Wireframe',
    project: pId,
    assignee: staff1.id,
    assigned_by: lead1.id,
    status: 'progress',
    started_at: new Date().toISOString(),
    mins: 60
  });

  // Staff 1 reassigns task directly to Staff 2 (overloaded scenario)
  const reassignReq = mockReq(staff1, { assignee: staff2.id, note: 'Overloaded with feature release' }, { id: tId });
  const reassignRes = await callCtrl(taskController.reassignTask, reassignReq, mockRes());
  assert.strictEqual(reassignRes.statusCode, 200, 'Reassignment by assignee failed');
  assert.strictEqual(reassignRes.data.data.assignee, staff2.id, 'Task assignee should be updated to staff2');
  assert.strictEqual(reassignRes.data.data.reassigned_by, staff1.id, 'reassigned_by should be staff1');
  assert.strictEqual(reassignRes.data.data.status, 'pipeline', 'Status should be reset to pipeline');
  assert.strictEqual(reassignRes.data.data.started_at, null, 'started_at timer should be reset');
  console.log('   ✓ Reassigned to staff2: removed from staff1, reset to pipeline with reassigned_by');

  // Staff 2 rejects the reassigned task -> should return to Staff 1's pipeline
  const rejectReq = mockReq(staff2, { reason: 'No bandwidth today' }, { id: tId });
  const rejectRes = await callCtrl(taskController.rejectTask, rejectReq, mockRes());
  assert.strictEqual(rejectRes.statusCode, 200, 'Rejection failed');
  assert.strictEqual(rejectRes.data.data.assignee, staff1.id, 'Task assignee should revert to staff1');
  assert.strictEqual(rejectRes.data.data.status, 'pipeline', 'Task should be in staff1 pipeline');
  console.log('   ✓ Staff 2 rejected task -> successfully reverted to Staff 1 in pipeline');

  // Verify non-assignee cannot reject
  try {
    const unauthReject = mockReq(staff2, {}, { id: tId }); // staff2 is no longer assignee!
    await callCtrl(taskController.rejectTask, unauthReject, mockRes());
    assert.fail('Non-assignee should not be allowed to reject');
  } catch (err) {
    assert.strictEqual(err.statusCode, 403, 'Should reject with 403 Forbidden');
  }
  console.log('   ✓ Non-assignee rejected with 403 Forbidden');

  // ----------------------------------------------------
  // TEST 5: Self Task Creation, Movement & Deletion
  // ----------------------------------------------------
  console.log('\n5. Testing Self Task Creation & Operations:');
  // Staff 2 creates a personal self-task with no project
  const selfReq = mockReq(staff2, {
    title: 'Research Vector Indexes',
    mins: 90,
    status: 'progress'
  });
  const selfRes = await callCtrl(taskController.createSelfTask, selfReq, mockRes());
  assert.strictEqual(selfRes.statusCode, 201, 'Self-task creation failed');
  const selfTask = selfRes.data.data;
  assert.strictEqual(selfTask.assignee, staff2.id);
  assert.strictEqual(selfTask.assigned_by, staff2.id);
  assert.strictEqual(selfTask.status, 'progress');
  assert(selfTask.started_at, 'started_at should be set for progress status');

  // Staff 2 updates status to completed
  const statusReq = mockReq(staff2, { status: 'completed' }, { id: selfTask.id });
  const statusRes = await callCtrl(taskController.updateTaskStatus, statusReq, mockRes());
  assert.strictEqual(statusRes.statusCode, 200, 'Status update to completed failed');

  // Staff 2 deletes their self-task (without project)
  const delReq = mockReq(staff2, {}, { id: selfTask.id });
  const delRes = await callCtrl(taskController.deleteTask, delReq, mockRes());
  assert.strictEqual(delRes.statusCode, 200, 'Self-task deletion failed');
  const checkDeleted = await taskModel.findById(selfTask.id);
  assert(!checkDeleted, 'Self task must be deleted from database');
  console.log('   ✓ Self-task created, progressed, and deleted by staff user without 403 error');

  // ----------------------------------------------------
  // TEST 5B: Task Workflow Progression & Column Shuffling
  // ----------------------------------------------------
  console.log('\n5B. Testing Task Workflow Progression & Column Shuffling:');
  // Task tId is currently in pipeline for staff1
  // Step 1: Staff 1 moves pipeline -> progress (accepts & starts)
  const toProgressReq = mockReq(staff1, { status: 'progress' }, { id: tId });
  const progRes = await callCtrl(taskController.updateTaskStatus, toProgressReq, mockRes());
  assert.strictEqual(progRes.statusCode, 200);
  assert.strictEqual(progRes.data.data.status, 'progress');
  assert(progRes.data.data.started_at, 'started_at should be recorded on progress');

  // Step 2: Staff 1 moves progress -> approval (submits for approval)
  const toApprovalReq = mockReq(staff1, { status: 'approval' }, { id: tId });
  const appRes = await callCtrl(taskController.updateTaskStatus, toApprovalReq, mockRes());
  assert.strictEqual(appRes.statusCode, 200);
  assert.strictEqual(appRes.data.data.status, 'approval');

  // Step 3: Lead 1 moves approval -> completed (approved)
  const toCompletedReq = mockReq(lead1, { status: 'completed' }, { id: tId });
  const compRes = await callCtrl(taskController.updateTaskStatus, toCompletedReq, mockRes());
  assert.strictEqual(compRes.statusCode, 200);
  assert.strictEqual(compRes.data.data.status, 'completed');
  assert(compRes.data.data.completed, 'completed date should be set');

  // Step 4: Lead 1 moves completed -> changes (request changes on completed card)
  const toChangesReq = mockReq(lead1, { status: 'changes' }, { id: tId });
  const chgRes = await callCtrl(taskController.updateTaskStatus, toChangesReq, mockRes());
  assert.strictEqual(chgRes.statusCode, 200);
  assert.strictEqual(chgRes.data.data.status, 'changes');
  assert.strictEqual(chgRes.data.data.completed, null, 'completed date should be cleared when moving to changes');

  // Step 5: Staff 1 moves changes -> progress (resume)
  const resumeReq = mockReq(staff1, { status: 'progress' }, { id: tId });
  const resRes = await callCtrl(taskController.updateTaskStatus, resumeReq, mockRes());
  assert.strictEqual(resRes.statusCode, 200);
  assert.strictEqual(resRes.data.data.status, 'progress');

  // Step 6: Shuffling freely into any section (e.g. progress -> pipeline)
  const shuffleReq = mockReq(staff1, { status: 'pipeline' }, { id: tId });
  const shufRes = await callCtrl(taskController.updateTaskStatus, shuffleReq, mockRes());
  assert.strictEqual(shufRes.statusCode, 200);
  assert.strictEqual(shufRes.data.data.status, 'pipeline');
  assert.strictEqual(shufRes.data.data.started_at, null, 'started_at should be reset when shuffled back to pipeline');

  console.log('   ✓ Full sequential workflow and arbitrary column shuffling verified');

  // ----------------------------------------------------
  // TEST 6: Single Leader Project Backward Compatibility
  // ----------------------------------------------------
  console.log('\n6. Testing Single Leader Project Backward Compatibility:');
  const legacyPId = 'p_prod_legacy_' + Date.now();
  const legacyProj = await projectModel.create({
    id: legacyPId,
    name: 'Legacy Single Leader',
    manager: lead1.id, // Single ID string
    billable: 1,
    status: 'Approved'
  });
  assert(legacyProj);
  const legacyUpdateReq = mockReq(lead1, { alloc: 50 }, { id: legacyPId });
  const legacyUpdateRes = await callCtrl(projectController.updateProject, legacyUpdateReq, mockRes());
  assert.strictEqual(legacyUpdateRes.statusCode, 200, 'Single manager project update failed');
  console.log('   ✓ Single manager legacy format works seamlessly');

  // ----------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------
  console.log('\n7. Cleaning up test fixtures...');
  await projectModel.delete(pId);
  await projectModel.delete(legacyPId);
  await taskModel.delete(tId);
  if (existingAtt) await attendanceModel.delete(existingAtt.id);
  for (const u of [adminUser, lead1, lead2, staff1, staff2]) {
    await employeeModel.delete(u.id);
  }
  console.log('   ✓ Cleanup completed.');

  console.log('\n=============================================');
  console.log('>>> ALL PRODUCTION READINESS CHECKS PASSED! <<<');
  console.log('=============================================\n');
}

runTests().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
