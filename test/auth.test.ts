import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const API_URL = process.env.API_URL || 'http://localhost:3001';

// ponytail: raw fetch, zero extra dependencies. Add supertest only if cookie jar needed.
async function api(path: string, opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

test('Feature 1: Auth & RBAC instrumental', async () => {
  // 1. Health check -> DB online
  const health = await api('/api/auth/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.db, 'connected');

  // 2. Login owner seed
  const loginOwner = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'owner@erp.local', password: 'Owner123!' },
  });
  assert.equal(loginOwner.status, 200, `login failed: ${JSON.stringify(loginOwner.body)}`);
  assert.ok(loginOwner.body.token);
  assert.equal(loginOwner.body.user.role, 'OWNER');
  const ownerToken = loginOwner.body.token;
  const branchId = loginOwner.body.user.branchId;

  // 3. Register FRONT_DESK (OWNER role-gated)
  const tsEmail = `test.frontdesk.${Date.now()}@erp.local`;
  const registerRes = await api('/api/auth/register', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      email: tsEmail,
      password: 'password123',
      fullName: 'Test Front Desk',
      role: 'FRONT_DESK',
      branchId: branchId || undefined,
    },
  });
  assert.equal(registerRes.status, 201, `register failed: ${JSON.stringify(registerRes.body)}`);
  assert.equal(registerRes.body.role, 'FRONT_DESK');

  // 4. Login as newly registered user
  const loginUser = await api('/api/auth/login', {
    method: 'POST',
    body: { email: tsEmail, password: 'password123' },
  });
  assert.equal(loginUser.status, 200);
  const userToken = loginUser.body.token;

  // 5. Read profile /me
  const me = await api('/api/auth/me', { headers: { Authorization: `Bearer ${userToken}` } });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, tsEmail);
  assert.equal(me.body.role, 'FRONT_DESK');

  // 6. RBAC enforcement: FRONT_DESK blocked from /users (403), OWNER allowed (200)
  const usersForbidden = await api('/api/auth/users', { headers: { Authorization: `Bearer ${userToken}` } });
  assert.equal(usersForbidden.status, 403);

  const usersAllowed = await api('/api/auth/users', { headers: { Authorization: `Bearer ${ownerToken}` } });
  assert.equal(usersAllowed.status, 200);
  assert.ok(Array.isArray(usersAllowed.body));

  // 7. Invalid password -> 401
  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'owner@erp.local', password: 'wrongpassword' },
  });
  assert.equal(badLogin.status, 401);

  // 8. Register without token -> 401
  const unauthRegister = await api('/api/auth/register', {
    method: 'POST',
    body: { email: 'hacker@erp.local', password: 'password123', fullName: 'Hacker', role: 'TECHNICIAN' },
  });
  assert.equal(unauthRegister.status, 401);
});
