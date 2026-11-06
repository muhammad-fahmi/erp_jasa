import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function api(path: string, opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = {};
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}

test('Feature 3: Job Board & Task Dispatch instrumental', async () => {
  // 1. Auth logins
  const ownerLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'owner@erp.local', password: 'Owner123!' },
  });
  assert.equal(ownerLogin.status, 200);

  const supervisorLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'supervisor@erp.local', password: 'Owner123!' },
  });
  assert.equal(supervisorLogin.status, 200);
  const supervisorToken = supervisorLogin.body.token;

  const frontLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'front@erp.local', password: 'Owner123!' },
  });
  assert.equal(frontLogin.status, 200);
  const frontToken = frontLogin.body.token;

  const techLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'tech@erp.local', password: 'Owner123!' },
  });
  assert.equal(techLogin.status, 200);
  const techToken = techLogin.body.token;
  const techId = techLogin.body.user.technicianId;
  assert.ok(techId, 'tech user must have technicianId');

  // 2. Create sample WO to populate tasks
  const servicesRes = await api('/api/services', {
    headers: { Authorization: `Bearer ${frontToken}` },
  });
  assert.equal(servicesRes.status, 200);
  const service = servicesRes.body.find((s: any) => s.code === 'LND-KILO') || servicesRes.body[0];

  const createRes = await api('/api/workorders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${frontToken}` },
    body: {
      customerName: 'Job Board Test Customer',
      customerPhone: '08999999999',
      serviceId: service.id,
      quantity: 5,
      entryChannel: 'WALK_IN',
      slaTier: 'EXPRESS',
      intakeNotes: 'Testing job board dispatch',
    },
  });
  assert.equal(createRes.status, 201);
  const tasks = createRes.body.tasks;
  assert.ok(tasks.length >= 2);
  const testTask = tasks[0];

  // 3. GET /api/board - permissions & listing
  const boardRes = await api('/api/board', {
    headers: { Authorization: `Bearer ${supervisorToken}` },
  });
  assert.equal(boardRes.status, 200);
  assert.ok(Array.isArray(boardRes.body.tasks));
  assert.ok(boardRes.body.tasks.length > 0);
  assert.ok(boardRes.body.pagination);

  // Filter test by status PENDING
  const filteredRes = await api('/api/board?status=PENDING', {
    headers: { Authorization: `Bearer ${supervisorToken}` },
  });
  assert.equal(filteredRes.status, 200);
  const allPending = filteredRes.body.tasks.every((t: any) => t.status === 'PENDING');
  assert.equal(allPending, true);

  // 4. Dispatch/Assign task: Supervisor assigns task to technician
  const assignRes = await api('/api/board/assign', {
    method: 'POST',
    headers: { Authorization: `Bearer ${supervisorToken}` },
    body: {
      taskId: testTask.id,
      technicianId: techId,
    },
  });
  assert.equal(assignRes.status, 200);
  assert.equal(assignRes.body.status, 'ASSIGNED');
  assert.equal(assignRes.body.assigned_to, techId);

  // FRONT_DESK is forbidden from assigning tasks
  const frontAssignRes = await api('/api/board/assign', {
    method: 'POST',
    headers: { Authorization: `Bearer ${frontToken}` },
    body: {
      taskId: testTask.id,
      technicianId: techId,
    },
  });
  assert.equal(frontAssignRes.status, 403);

  // 5. Release task back to PENDING (by tech)
  const releaseRes = await api('/api/board/release', {
    method: 'POST',
    headers: { Authorization: `Bearer ${techToken}` },
    body: { taskId: testTask.id },
  });
  assert.equal(releaseRes.status, 200);
  assert.equal(releaseRes.body.status, 'PENDING');
  assert.equal(releaseRes.body.assigned_to, null);

  // 6. Technician claims task
  const claimRes = await api('/api/board/claim', {
    method: 'POST',
    headers: { Authorization: `Bearer ${techToken}` },
    body: { taskId: testTask.id },
  });
  assert.equal(claimRes.status, 200);
  assert.equal(claimRes.body.status, 'ASSIGNED');
  assert.equal(claimRes.body.assigned_to, techId);

  // 7. Start task (marks IN_PROGRESS and sets started_at)
  const startRes = await api('/api/board/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${techToken}` },
    body: { taskId: testTask.id },
  });
  assert.equal(startRes.status, 200);
  assert.equal(startRes.body.status, 'IN_PROGRESS');
  assert.ok(startRes.body.started_at);

  // 8. Role-based visibility check on /api/board
  // Technician only sees their own assigned tasks
  const techBoardRes = await api('/api/board', {
    headers: { Authorization: `Bearer ${techToken}` },
  });
  assert.equal(techBoardRes.status, 200);
  const onlyMine = techBoardRes.body.tasks.every((t: any) => t.assigned_to === techId);
  assert.equal(onlyMine, true);
});
