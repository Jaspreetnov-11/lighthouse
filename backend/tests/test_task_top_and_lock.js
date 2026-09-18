'use strict';

const assert = require('assert');
const db = require('../config/db');
const taskModel = require('../models/task.model');
const taskController = require('../controllers/task.controller');

const { initDatabase } = require('../database/init');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; }
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
  console.log('=== RUNNING TESTS FOR TASK TOP ORDERING & TIMER LOCK ON APPROVAL ===\n');
  await initDatabase();

  // Setup: Find or create an admin/manager employee and project
  let emp = await db.get("SELECT id, name, role FROM lh_employees WHERE role = 'admin' LIMIT 1");
  if (!emp) {
    emp = await db.get("SELECT id, name, role FROM lh_employees LIMIT 1");
  }
  if (!emp) {
    await db.run("INSERT INTO lh_employees (id, name, email, role, access) VALUES ('emp_admin_test', 'Admin Test', 'admin_test@lighthouse.io', 'admin', 'admin')");
    emp = { id: 'emp_admin_test', name: 'Admin Test', role: 'admin' };
  }

  let project = await db.get("SELECT id, name FROM lh_projects LIMIT 1");
  if (!project) {
    await db.run("INSERT INTO lh_projects (id, name, manager) VALUES ('p_test', 'Test Proj', ?)", [emp.id]);
    project = { id: 'p_test', name: 'Test Proj' };
  }

  const reqUser = { id: emp.id, name: emp.name, role: 'admin', access: 'admin' };

  // Pre-cleanup of any prior test tasks
  await db.run("DELETE FROM lh_tasks WHERE title LIKE 'Task Alpha%' OR title LIKE 'Task Beta%'");

  // -------------------------------------------------------------
  // Test 1: Task Assignment -> Latest task appears at the top of pipeline
  // -------------------------------------------------------------
  console.log('1. Testing Task Assignment appears at the top of Pipeline:');
  const req1 = {
    user: reqUser,
    body: {
      title: 'Task Alpha 1',
      project: project.id,
      assignee: emp.id,
      deadline: '2026-09-30',
      mins: 120,
      status: 'pipeline'
    }
  };
  const res1 = await callCtrl(taskController.createTask, req1, mockRes());
  assert.strictEqual(res1.statusCode, 201);
  const task1 = res1.body.data;

  // Short delay to ensure distinct timestamp
  await new Promise(r => setTimeout(r, 60));

  const req2 = {
    user: reqUser,
    body: {
      title: 'Task Beta 2 (Latest Assigned)',
      project: project.id,
      assignee: emp.id,
      deadline: '2026-09-25', // Note: earlier deadline than Alpha, but assigned later!
      mins: 120,
      status: 'pipeline'
    }
  };
  const res2 = await callCtrl(taskController.createTask, req2, mockRes());
  assert.strictEqual(res2.statusCode, 201);
  const task2 = res2.body.data;

  // Fetch pipeline tasks
  const pipelineTasks = await taskModel.filterTasks({ status: 'pipeline' });
  assert.ok(pipelineTasks.length >= 2);
  assert.strictEqual(pipelineTasks[0].id, task2.id, 'Latest assigned task must be at index 0 of pipeline!');
  console.log('   ✓ Newly assigned task appears at the very top of pipeline, regardless of deadline.');

  // -------------------------------------------------------------
  // Test 2: Status update -> updated task moves to top of its new section
  // -------------------------------------------------------------
  console.log('\n2. Testing Section Update -> moved task appears at the top of that section:');
  await new Promise(r => setTimeout(r, 60));

  // Move task1 from pipeline -> progress
  const moveReq = {
    user: reqUser,
    params: { id: task1.id },
    body: { status: 'progress' }
  };
  const moveRes = await callCtrl(taskController.updateTaskStatus, moveReq, mockRes());
  assert.strictEqual(moveRes.statusCode, 200);

  const progressTasks = await taskModel.filterTasks({ status: 'progress' });
  assert.strictEqual(progressTasks[0].id, task1.id, 'Moved task must be at the top of progress column!');
  console.log('   ✓ Task moved to progress appears at index 0 of progress section.');

  // -------------------------------------------------------------
  // Test 3: Timer Lock on Send for Approval
  // -------------------------------------------------------------
  console.log('\n3. Testing Timer Lock on Approval Submission:');
  
  // Set started_at to 90 minutes ago (1.5 hours)
  const ninetyMinsAgo = new Date(Date.now() - (90 * 60000)).toISOString();
  await db.run("UPDATE lh_tasks SET started_at = ? WHERE id = ?", [ninetyMinsAgo, task1.id]);

  await new Promise(r => setTimeout(r, 60));

  // Submit task1 for approval
  const approvalReq = {
    user: reqUser,
    params: { id: task1.id },
    body: { status: 'approval' }
  };
  const approvalRes = await callCtrl(taskController.updateTaskStatus, approvalReq, mockRes());
  assert.strictEqual(approvalRes.statusCode, 200);
  const approvedTask = approvalRes.body.data;

  // Verify taken_mins was locked to ~90 minutes
  assert.ok(approvedTask.taken_mins >= 89 && approvedTask.taken_mins <= 91, `Expected taken_mins ~90, got ${approvedTask.taken_mins}`);
  assert.ok(approvedTask.completed_at, 'completed_at timestamp must be recorded on approval submission');

  // Verify it appears at the top of approval section
  const approvalTasks = await taskModel.filterTasks({ status: 'approval' });
  assert.strictEqual(approvalTasks[0].id, task1.id, 'Task submitted for approval must be at top of approval section!');
  console.log(`   ✓ Task timer locked at ${approvedTask.taken_mins} mins upon submission for approval.`);
  console.log('   ✓ Task appears at index 0 of Pending Approval section.');

  // -------------------------------------------------------------
  // Test 4: Approving Task (approval -> completed) preserves locked time
  // -------------------------------------------------------------
  console.log('\n4. Testing Completion preserves locked time:');
  
  // Wait a small moment to simulate manager reviewing later
  await new Promise(r => setTimeout(r, 60));

  const completeReq = {
    user: reqUser,
    params: { id: task1.id },
    body: { status: 'completed' }
  };
  const completeRes = await callCtrl(taskController.updateTaskStatus, completeReq, mockRes());
  assert.strictEqual(completeRes.statusCode, 200);
  const completedTask = completeRes.body.data;

  assert.strictEqual(completedTask.taken_mins, approvedTask.taken_mins, 'Completed task must preserve locked taken_mins from approval!');
  
  const completedTasks = await taskModel.filterTasks({ status: 'completed' });
  assert.strictEqual(completedTasks[0].id, task1.id, 'Newly completed task must be at the top of completed section!');
  console.log(`   ✓ Completed task preserved locked ${completedTask.taken_mins} mins without adding review wait time.`);
  console.log('   ✓ Newly completed task appears at index 0 of Completed section.');

  // -------------------------------------------------------------
  // Test 5: Clean up test records
  // -------------------------------------------------------------
  await db.run("DELETE FROM lh_tasks WHERE id IN (?, ?)", [task1.id, task2.id]);
  console.log('\n5. Cleanup test tasks:');
  console.log('   ✓ Test tasks cleaned up.');

  console.log('\n======================================================');
  console.log('>>> ALL TASK TOP & TIMER LOCK TESTS PASSED! <<<');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
