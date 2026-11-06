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

test('Feature 4: Pricing & Job Costing instrumental', async () => {
  // 1. Authenticate users
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

  // 2. Fetch service & customers to get IDs
  const servicesRes = await api('/api/services', {
    headers: { Authorization: `Bearer ${frontToken}` },
  });
  assert.equal(servicesRes.status, 200);
  const kiloService = servicesRes.body.find((s: any) => s.code === 'LND-KILO');
  assert.ok(kiloService, 'LND-KILO service must exist');

  // 3. Test GET /api/pricing/:serviceId breakdown
  // 3a. Tier 1: Qty < 5 should use base tier (unit_price = 10000)
  const priceTier1 = await api(`/api/pricing/${kiloService.id}?qty=3`, {
    headers: { Authorization: `Bearer ${frontToken}` },
  });
  assert.equal(priceTier1.status, 200);
  assert.equal(priceTier1.body.quantity, 3);
  assert.equal(priceTier1.body.unitPrice, 10000);
  assert.equal(priceTier1.body.lineTotal, 30000);
  assert.ok(priceTier1.body.appliedRule);
  assert.equal(priceTier1.body.appliedRule.isCustomerSpecific, false);
  assert.ok(Array.isArray(priceTier1.body.slaOptions));
  assert.ok(priceTier1.body.slaOptions.length >= 3);

  // Check SLA options lead hours
  const regularSla = priceTier1.body.slaOptions.find((s: any) => s.tier === 'REGULAR');
  const sameDaySla = priceTier1.body.slaOptions.find((s: any) => s.tier === 'SAME_DAY');
  assert.ok(regularSla && sameDaySla);
  assert.equal(regularSla.leadHours, 72);
  assert.equal(sameDaySla.leadHours, 6);

  // 3b. Tier 2: Qty >= 5 should use volume tier (unit_price = 8000)
  const priceTier2 = await api(`/api/pricing/${kiloService.id}?qty=10`, {
    headers: { Authorization: `Bearer ${frontToken}` },
  });
  assert.equal(priceTier2.status, 200);
  assert.equal(priceTier2.body.quantity, 10);
  assert.equal(priceTier2.body.unitPrice, 8000);
  assert.equal(priceTier2.body.lineTotal, 80000);
  assert.ok(priceTier2.body.appliedRule);
  assert.equal(priceTier2.body.appliedRule.unitPrice, 8000);

  // 4. Create Work Order and test POST /api/workorders/:id/calculate
  const createWoRes = await api('/api/workorders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${frontToken}` },
    body: {
      customerName: 'Customer Pricing Test',
      customerPhone: '081234567899',
      serviceId: kiloService.id,
      quantity: 2,
      entryChannel: 'WALK_IN',
      slaTier: 'REGULAR',
      intakeNotes: 'Initial intake with 2kg',
    },
  });
  assert.equal(createWoRes.status, 201);
  const woId = createWoRes.body.id;
  assert.equal(Number(createWoRes.body.unit_price), 10000);
  assert.equal(Number(createWoRes.body.line_total), 20000);

  // 4a. Recalculate with new quantity = 8 (qualifies for tiered 8000/kg)
  const recalcRes = await api(`/api/workorders/${woId}/calculate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${frontToken}` },
    body: {
      quantity: 8,
      slaTier: 'SAME_DAY',
    },
  });
  assert.equal(recalcRes.status, 200);
  assert.equal(Number(recalcRes.body.calculation.unitPrice), 8000);
  assert.equal(Number(recalcRes.body.calculation.lineTotal), 64000);
  assert.equal(Number(recalcRes.body.calculation.leadHours), 6);
  assert.equal(Number(recalcRes.body.workOrder.quantity), 8);
  assert.equal(Number(recalcRes.body.workOrder.unit_price), 8000);
  assert.equal(Number(recalcRes.body.workOrder.line_total), 64000);
  assert.equal(recalcRes.body.workOrder.sla_tier, 'SAME_DAY');

  // 4b. Verify fetched WO reflects recalculated values
  const getWoRes = await api(`/api/workorders/${woId}`, {
    headers: { Authorization: `Bearer ${frontToken}` },
  });
  assert.equal(getWoRes.status, 200);
  assert.equal(Number(getWoRes.body.quantity), 8);
  assert.equal(Number(getWoRes.body.unit_price), 8000);
  assert.equal(Number(getWoRes.body.line_total), 64000);
  assert.equal(getWoRes.body.sla_tier, 'SAME_DAY');
});
