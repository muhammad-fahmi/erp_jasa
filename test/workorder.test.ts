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

test('Feature 2: WorkOrder Lifecycle instrumental', async () => {
  const ownerLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'owner@erp.local', password: 'Owner123!' },
  });
  assert.equal(ownerLogin.status, 200);
  const ownerToken = ownerLogin.body.token;

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

  const qcLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'qc@erp.local', password: 'Owner123!' },
  });
  assert.equal(qcLogin.status, 200);
  const qcToken = qcLogin.body.token;

  const servicesRes = await api('/api/services', {
    headers: { Authorization: `Bearer ${frontToken}` },
  });
  assert.equal(servicesRes.status, 200);
  assert.ok(servicesRes.body.length > 0);
  const service = servicesRes.body.find((s: any) => s.code === 'LND-KILO') || servicesRes.body[0];

  const createRes = await api('/api/workorders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${frontToken}` },
    body: {
      customerName: 'Budi Santoso Walkin',
      customerPhone: '081234567890',
      serviceId: service.id,
      quantity: 6,
      entryChannel: 'WALK_IN',
      slaTier: 'REGULAR',
      intakeNotes: 'Pakaian putih dipisah',
    },
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.status, 'DRAFT');
  assert.equal(Number(createRes.body.unit_price), 8000);
  assert.equal(Number(createRes.body.line_total), 48000);
  assert.ok(Array.isArray(createRes.body.tasks));
  assert.ok(createRes.body.tasks.length >= 4);

  const woId = createRes.body.id;

  const queuedRes = await api(`/api/workorders/${woId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${frontToken}` },
    body: { status: 'QUEUED' },
  });
  assert.equal(queuedRes.status, 200);
  assert.equal(queuedRes.body.status, 'QUEUED');

  const illegalRes = await api(`/api/workorders/${woId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${frontToken}` },
    body: { status: 'CLOSED' },
  });
  assert.equal(illegalRes.status, 400);

  const firstTask = createRes.body.tasks[0];
  const startTaskRes = await api(`/api/workorders/${woId}/tasks/${firstTask.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${techToken}` },
    body: { status: 'IN_PROGRESS' },
  });
  assert.equal(startTaskRes.status, 200);
  assert.equal(startTaskRes.body.status, 'IN_PROGRESS');

  const woRunning = await api(`/api/workorders/${woId}`, {
    headers: { Authorization: `Bearer ${techToken}` },
  });
  assert.equal(woRunning.status, 200);
  assert.equal(woRunning.body.status, 'IN_PROGRESS');

  for (const t of createRes.body.tasks) {
    const doneTask = await api(`/api/workorders/${woId}/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techToken}` },
      body: { status: 'DONE' },
    });
    assert.equal(doneTask.status, 200);
  }

  const woQcReady = await api(`/api/workorders/${woId}`, {
    headers: { Authorization: `Bearer ${qcToken}` },
  });
  assert.equal(woQcReady.status, 200);
  assert.equal(woQcReady.body.status, 'QC');

  const qcPassRes = await api(`/api/workorders/${woId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${qcToken}` },
    body: { status: 'READY' },
  });
  assert.equal(qcPassRes.status, 200);
  assert.equal(qcPassRes.body.status, 'READY');

  const handoverRes = await api(`/api/workorders/${woId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${frontToken}` },
    body: { status: 'HANDED_OVER' },
  });
  assert.equal(handoverRes.status, 200);
  assert.equal(handoverRes.body.status, 'HANDED_OVER');

  const closeRes = await api(`/api/workorders/${woId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: { status: 'CLOSED' },
  });
  assert.equal(closeRes.status, 200);
  assert.equal(closeRes.body.status, 'CLOSED');
});
