/**
 * Automated test suite for Multi-Assignee User-Specific Task Timers
 */
const assert = require('assert');
const { parseUserTimers, calculateUserMins, statusPatch } = require('../controllers/task.controller');
const { taskSpans, taskMinutesFor, personMinutes } = require('../services/worktime.service');

function runTests() {
  console.log('--- Starting Multi-Assignee Task Timer Tests ---');

  // Test 1: parseUserTimers initialization
  console.log('Test 1: parseUserTimers initializes empty object with default pipeline for all assignees');
  const emptyTimers = parseUserTimers(null, ['emp_1', 'emp_2']);
  assert.strictEqual(emptyTimers['emp_1'].status, 'pipeline');
  assert.strictEqual(emptyTimers['emp_2'].status, 'pipeline');
  assert.strictEqual(emptyTimers['emp_1'].started_at, null);
  assert.strictEqual(emptyTimers['emp_2'].started_at, null);
  console.log('✓ Test 1 passed');

  // Test 2: User 1 starts multi-assignee task
  console.log('Test 2: User 1 starts task -> User 1 is progress, User 2 remains pipeline');
  const initialTask = {
    id: 'task_multi_1',
    status: 'pipeline',
    assignee: 'emp_1,emp_2',
    user_timers: JSON.stringify(emptyTimers),
    spans: '[]',
    taken_mins: 0
  };

  const patch1 = statusPatch(initialTask, 'progress', 'emp_1');
  assert.strictEqual(patch1.status, 'progress', 'Overall task status should be progress');
  assert.ok(patch1.user_timers, 'user_timers must be updated');

  const timersAfterU1Start = JSON.parse(patch1.user_timers);
  assert.strictEqual(timersAfterU1Start['emp_1'].status, 'progress', 'User 1 should be in progress');
  assert.ok(timersAfterU1Start['emp_1'].started_at, 'User 1 must have started_at');
  assert.strictEqual(timersAfterU1Start['emp_2'].status, 'pipeline', 'User 2 must remain in pipeline');
  assert.strictEqual(timersAfterU1Start['emp_2'].started_at, null, 'User 2 must not have started_at');

  const spansAfterU1Start = JSON.parse(patch1.spans);
  assert.strictEqual(spansAfterU1Start.length, 1);
  assert.strictEqual(spansAfterU1Start[0].u, 'emp_1', 'Span must be tagged with emp_1');
  console.log('✓ Test 2 passed');

  // Test 3: User 2 starts task while User 1 is already in progress
  console.log('Test 3: User 2 starts task -> User 2 becomes progress without resetting User 1');
  const taskWithU1Running = {
    ...initialTask,
    ...patch1
  };

  const patch2 = statusPatch(taskWithU1Running, 'progress', 'emp_2');
  assert.strictEqual(patch2.status, 'progress');
  const timersAfterU2Start = JSON.parse(patch2.user_timers);
  assert.strictEqual(timersAfterU2Start['emp_1'].status, 'progress', 'User 1 still in progress');
  assert.strictEqual(timersAfterU2Start['emp_1'].started_at, timersAfterU1Start['emp_1'].started_at, 'User 1 start time preserved');
  assert.strictEqual(timersAfterU2Start['emp_2'].status, 'progress', 'User 2 now in progress');
  assert.ok(timersAfterU2Start['emp_2'].started_at, 'User 2 has their own started_at');

  const spansAfterU2Start = JSON.parse(patch2.spans);
  assert.strictEqual(spansAfterU2Start.length, 2, 'Should have 2 open spans');
  assert.strictEqual(spansAfterU2Start.some(s => s.u === 'emp_1' && !s.e), true);
  assert.strictEqual(spansAfterU2Start.some(s => s.u === 'emp_2' && !s.e), true);
  console.log('✓ Test 3 passed');

  // Test 4: User 1 completes their part and sends for approval
  console.log('Test 4: User 1 submits for approval -> User 1 stops, User 2 still in progress, overall status progress');
  const taskWithBothRunning = {
    ...taskWithU1Running,
    ...patch2
  };

  const patch3 = statusPatch(taskWithBothRunning, 'approval', 'emp_1');
  // Since User 2 is still working, overall task must remain in progress!
  assert.strictEqual(patch3.status, 'progress', 'Overall task status stays progress until all assignees submit');
  const timersAfterU1Approval = JSON.parse(patch3.user_timers);
  assert.strictEqual(timersAfterU1Approval['emp_1'].status, 'approval');
  assert.ok(timersAfterU1Approval['emp_1'].completed_at, 'User 1 has completed_at');
  assert.strictEqual(timersAfterU1Approval['emp_2'].status, 'progress', 'User 2 is still working in progress');

  const spansAfterU1Approval = JSON.parse(patch3.spans);
  const u1ClosedSpan = spansAfterU1Approval.find(s => s.u === 'emp_1');
  const u2OpenSpan = spansAfterU1Approval.find(s => s.u === 'emp_2');
  assert.ok(u1ClosedSpan && u1ClosedSpan.e, 'User 1 span closed');
  assert.ok(u2OpenSpan && !u2OpenSpan.e, 'User 2 span still open');
  console.log('✓ Test 4 passed');

  // Test 5: User 2 completes their part and sends for approval
  console.log('Test 5: User 2 submits for approval -> All submitted -> Overall status becomes approval');
  const taskWithU1DoneU2Working = {
    ...taskWithBothRunning,
    ...patch3
  };

  const patch4 = statusPatch(taskWithU1DoneU2Working, 'approval', 'emp_2');
  assert.strictEqual(patch4.status, 'approval', 'Overall task status is now approval because all assignees submitted');
  const timersAfterBothApproval = JSON.parse(patch4.user_timers);
  assert.strictEqual(timersAfterBothApproval['emp_1'].status, 'approval');
  assert.strictEqual(timersAfterBothApproval['emp_2'].status, 'approval');
  console.log('✓ Test 5 passed');

  // Test 6: Backward compatibility with single-assignee task
  console.log('Test 6: Single-assignee task works seamlessly');
  const singleTask = {
    id: 'task_single_1',
    status: 'pipeline',
    assignees: 'emp_single',
    user_timers: null,
    spans: '[]',
    taken_mins: 0
  };

  const singlePatch1 = statusPatch(singleTask, 'progress', 'emp_single');
  assert.strictEqual(singlePatch1.status, 'progress');
  assert.ok(singlePatch1.started_at);
  const singlePatch2 = statusPatch({ ...singleTask, ...singlePatch1 }, 'approval', 'emp_single');
  assert.strictEqual(singlePatch2.status, 'approval');
  assert.ok(singlePatch2.completed_at);
  console.log('✓ Test 6 passed');

  // Test 7: Worktime calculation per user
  console.log('Test 7: Worktime service filters tagged spans per empId');
  const testSpans = [
    { s: '2026-09-19T09:00:00.000Z', e: '2026-09-19T10:00:00.000Z', u: 'emp_1' }, // 60 mins for emp_1
    { s: '2026-09-19T09:30:00.000Z', e: '2026-09-19T10:00:00.000Z', u: 'emp_2' }  // 30 mins for emp_2
  ];
  const dummyTask = {
    assignees: 'emp_1,emp_2',
    spans: JSON.stringify(testSpans),
    started_at: '2026-09-19T09:00:00.000Z',
    completed_at: '2026-09-19T10:00:00.000Z',
    taken_mins: 90
  };

  const u1Mins = taskMinutesFor(dummyTask, 'emp_1');
  const u2Mins = taskMinutesFor(dummyTask, 'emp_2');
  assert.strictEqual(u1Mins, 60, 'emp_1 should have 60 mins');
  assert.strictEqual(u2Mins, 30, 'emp_2 should have 30 mins');
  console.log('✓ Test 7 passed');

  console.log('\nAll Multi-Assignee Task Timer tests passed successfully! 🎉');
}

try {
  runTests();
  process.exit(0);
} catch (err) {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
}
