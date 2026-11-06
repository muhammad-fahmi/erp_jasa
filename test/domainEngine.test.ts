import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  calculateUnitPrice,
  calculateJobCost,
  evaluateWoStatusFromTasks,
  calculateMovingAverageCost,
  findReorderCandidates,
  computeReorderQty,
  canTransitionPo,
  calculateDueDate,
  expectedAtFromLeadTime,
  postStockMovement,
  resolvePoStatusAfterReceipt,
  validateReturnQty,
  can,
  transitionAllowedByRole,
} from '../src/services/domainEngine.ts';
import type {
  Service,
  PricingRule,
  WorkOrder,
  Technician,
  WoTask,
  Part,
  Supplier,
} from '../src/types/domain.ts';

test('valid transitions follow PRD Section 8', () => {
  assert.equal(canTransition('DRAFT', 'QUEUED'), true);
  assert.equal(canTransition('QUEUED', 'IN_PROGRESS'), true);
  assert.equal(canTransition('IN_PROGRESS', 'QC'), true);
  assert.equal(canTransition('QC', 'READY'), true);
  assert.equal(canTransition('QC', 'REWORK'), true);
  assert.equal(canTransition('REWORK', 'IN_PROGRESS'), true);
  assert.equal(canTransition('READY', 'HANDED_OVER'), true);
  assert.equal(canTransition('HANDED_OVER', 'CLOSED'), true);

  // Illegal transitions
  assert.equal(canTransition('DRAFT', 'CLOSED'), false);
  assert.equal(canTransition('QUEUED', 'READY'), false);
  assert.equal(canTransition('CLOSED', 'DRAFT'), false);
});

test('calculateUnitPrice handles tiered and customer discounts', () => {
  const service = {
    id: 's1',
    code: 'LND-KILO',
    name: 'Laundry Kiloan',
    category: 'Laundry',
    description: '',
    baseUnit: 'kg',
    priceType: 'TIERED',
    basePrice: 10000,
    requiresQc: true,
    isAddon: false,
    isActive: true,
    stages: [],
  } as Service;

  const rules: PricingRule[] = [
    { id: 'r1', serviceId: 's1', minQty: 0, maxQty: 4.99, unitPrice: 10000 },
    { id: 'r2', serviceId: 's1', minQty: 5, unitPrice: 8000 },
    { id: 'r3', serviceId: 's1', customerId: 'vip', minQty: 0, unitPrice: 7000 },
  ];

  // Under 5kg -> 10k
  assert.equal(calculateUnitPrice(service, 3, undefined, rules), 10000);
  // 5kg+ -> 8k
  assert.equal(calculateUnitPrice(service, 6, undefined, rules), 8000);
  // VIP customer -> 7k
  assert.equal(calculateUnitPrice(service, 3, 'vip', rules), 7000);
});

test('evaluateWoStatusFromTasks gates through QC', () => {
  const mockTasks = [
    { id: 't1', status: 'DONE', seq: 1 } as WoTask,
    { id: 't2', status: 'DONE', seq: 2 } as WoTask,
  ];

  assert.equal(evaluateWoStatusFromTasks('IN_PROGRESS', mockTasks, true), 'QC');
  assert.equal(evaluateWoStatusFromTasks('IN_PROGRESS', mockTasks, false), 'READY');

  const inProgTasks = [
    { id: 't1', status: 'DONE', seq: 1 } as WoTask,
    { id: 't2', status: 'IN_PROGRESS', seq: 2 } as WoTask,
  ];
  assert.equal(evaluateWoStatusFromTasks('QUEUED', inProgTasks, true), 'IN_PROGRESS');

  const blockedTasks = [
    { id: 't1', status: 'BLOCKED', seq: 1 } as WoTask,
    { id: 't2', status: 'PENDING', seq: 2 } as WoTask,
  ];
  assert.equal(evaluateWoStatusFromTasks('IN_PROGRESS', blockedTasks, true), 'ON_HOLD');
});

test('calculateJobCost computes margin correctly', () => {
  const wo = {
    id: 'w1',
    woNo: 'WO-01',
    subtotal: 100000,
    discount: 10000, // revenue = 90000
    partUsages: [
      { partId: 'p1', qty: 2, unitCostSnap: 15000 }, // 30000
    ],
    tasks: [
      { id: 't1', status: 'DONE', technicianId: 'tech1', estMinutes: 60 },
    ],
  } as unknown as WorkOrder;

  const techs = [
    {
      id: 'tech1',
      commissionMode: 'PERCENTAGE_OF_REVENUE',
      commissionRate: 10, // 10% of 90000 = 9000
    } as Technician,
  ];

  const cost = calculateJobCost(wo, techs);
  assert.equal(cost.revenue, 90000);
  assert.equal(cost.partsCost, 30000);
  assert.equal(cost.laborCost, 9000);
  assert.equal(cost.grossMargin, 51000); // 90k - 30k - 9k
  assert.equal(cost.marginPct, 56.7);
});

const mkPart = (over: Partial<Part> = {}): Part => ({
  id: 'p1',
  code: 'PRT-01',
  name: 'Busi',
  category: 'Pengapian',
  unit: 'pcs',
  unitCost: 10000,
  minStock: 5,
  stockQty: 10,
  reorderPoint: 5,
  ...over,
});

test('moving average cost blends opening balance with receipt', () => {
  // 10 @ 10k + 10 @ 20k => 20 @ 15k
  const avg = calculateMovingAverageCost(10, 10000, 10, 20000);
  assert.equal(avg, 15000);
  // Receiving into empty stock just adopts the receipt cost
  assert.equal(calculateMovingAverageCost(0, 0, 5, 18000), 18000);
});

test('reorder candidates respect reorderPoint over minStock', () => {
  const parts = [
    mkPart({ id: 'a', stockQty: 5, reorderPoint: 5, minStock: 2 }), // at threshold -> flagged
    mkPart({ id: 'b', stockQty: 6, reorderPoint: 5, minStock: 2 }), // above -> safe
    mkPart({ id: 'c', stockQty: 1, reorderPoint: undefined, minStock: 5 }), // falls back to minStock
  ];
  const flagged = findReorderCandidates(parts).map((p) => p.id);
  assert.deepEqual(flagged, ['a', 'c']);
});

test('computeReorderQty tops up toward maxStock', () => {
  assert.equal(computeReorderQty(mkPart({ stockQty: 2, maxStock: 20, reorderQty: undefined })), 18);
  // Explicit reorderQty always wins
  assert.equal(computeReorderQty(mkPart({ stockQty: 2, reorderQty: 50 })), 50);
  // No maxStock => target is 2x minStock
  assert.equal(computeReorderQty(mkPart({ stockQty: 2, minStock: 5, maxStock: undefined, reorderQty: undefined })), 8);
});

test('PO status transitions follow procurement lifecycle', () => {
  assert.equal(canTransitionPo('DRAFT', 'ORDERED'), true);
  assert.equal(canTransitionPo('ORDERED', 'PARTIALLY_RECEIVED'), true);
  assert.equal(canTransitionPo('ORDERED', 'RECEIVED'), true);
  assert.equal(canTransitionPo('PARTIALLY_RECEIVED', 'RECEIVED'), true);

  assert.equal(canTransitionPo('DRAFT', 'RECEIVED'), false);
  assert.equal(canTransitionPo('RECEIVED', 'ORDERED'), false);
  assert.equal(canTransitionPo('CANCELLED', 'ORDERED'), false);
});

test('due date and ETA derive from supplier terms and lead time', () => {
  const supplier = {
    id: 's1',
    code: 'SUP-01',
    name: 'CV Sinar Jaya',
    phone: '0812',
    picName: 'Budi',
    termOfPayment: 30,
    leadTimeDays: 7,
    rating: 4,
    isActive: true,
  } as Supplier;

  // 2026-01-01 + 30 days
  assert.equal(calculateDueDate('2026-01-01T00:00:00.000Z', supplier).slice(0, 10), '2026-01-31');
  // 2026-01-01 + 7 days
  assert.equal(expectedAtFromLeadTime('2026-01-01T00:00:00.000Z', supplier).slice(0, 10), '2026-01-08');
});

test('postStockMovement never allows negative stock on consumption', () => {
  const part = mkPart({ stockQty: 3 });
  const posting = postStockMovement({
    part,
    branchId: 'br-jkt',
    type: 'JOB_CONSUMPTION',
    qtyDelta: -2,
    refType: 'WO',
    refId: 'wo-1',
    createdBy: 'u-tech1',
    now: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(posting.qtyBefore, 3);
  assert.equal(posting.qtyAfter, 1);
  assert.equal(posting.movement.qtyDelta, -2);
  assert.equal(posting.movement.partId, 'p1');
});

test('PO status resolves to partial when some items outstanding', () => {
  assert.equal(
    resolvePoStatusAfterReceipt([
      { qtyOrdered: 10, qtyReceived: 10 },
      { qtyOrdered: 5, qtyReceived: 5 },
    ]),
    'RECEIVED'
  );
  assert.equal(
    resolvePoStatusAfterReceipt([
      { qtyOrdered: 10, qtyReceived: 10 },
      { qtyOrdered: 5, qtyReceived: 0 },
    ]),
    'PARTIALLY_RECEIVED'
  );
  assert.equal(
    resolvePoStatusAfterReceipt([{ qtyOrdered: 5, qtyReceived: 0 }]),
    'ORDERED'
  );
});

test('validateReturnQty caps returns at rejected quantity', () => {
  const grnItem = { qtyReceived: 10, qtyRejected: 3 };
  assert.equal(validateReturnQty(grnItem, 3).ok, true);
  assert.equal(validateReturnQty(grnItem, 4).ok, false);
  assert.equal(validateReturnQty(grnItem, 0).ok, false);
});

test('PR review is restricted to Supervisor/Owner per PRD Section 4.1', () => {
  assert.equal(can('SUPERVISOR', 'pr:review'), true);
  assert.equal(can('OWNER', 'pr:review'), true);
  assert.equal(can('PARTS', 'pr:review'), false);
  assert.equal(can('FINANCE', 'pr:review'), false);
  assert.equal(can('FRONT_DESK', 'pr:review'), false);
  assert.equal(can('QC', 'pr:review'), false);
  assert.equal(can('TECHNICIAN', 'pr:review'), false);
});

test('technician is denied procurement, reports and payments', () => {
  assert.equal(can('TECHNICIAN', 'po:create'), false);
  assert.equal(can('TECHNICIAN', 'po:issue'), false);
  assert.equal(can('TECHNICIAN', 'grn:receive'), false);
  assert.equal(can('TECHNICIAN', 'supplier:payment'), false);
  assert.equal(can('TECHNICIAN', 'payment:receive'), false);
  assert.equal(can('TECHNICIAN', 'reports'), false);
  assert.equal(can('TECHNICIAN', 'pr'), false);
  assert.equal(can('TECHNICIAN', 'po'), false);
  // technician keeps only dashboard + own tasks
  assert.equal(can('TECHNICIAN', 'dashboard'), true);
  assert.equal(can('TECHNICIAN', 'tasks'), true);
  assert.equal(can('TECHNICIAN', 'task:execute'), true);
});

test('supplier payment belongs to Finance/Owner only', () => {
  assert.equal(can('FINANCE', 'supplier:payment'), true);
  assert.equal(can('OWNER', 'supplier:payment'), true);
  assert.equal(can('PARTS', 'supplier:payment'), false);
  assert.equal(can('SUPERVISOR', 'supplier:payment'), false);
});

test('QC inspects goods receipts; front desk cannot', () => {
  assert.equal(can('QC', 'grn:inspect'), true);
  assert.equal(can('PARTS', 'grn:inspect'), true);
  assert.equal(can('FRONT_DESK', 'grn:inspect'), false);
  assert.equal(can('TECHNICIAN', 'grn:inspect'), false);
});

test('owner holds every sampled permission', () => {
  for (const perm of ['pr:review', 'po:issue', 'grn:inspect', 'supplier:payment', 'task:execute', 'qc:decide', 'reports', 'workorders']) {
    assert.equal(can('OWNER', perm), true, `OWNER should hold ${perm}`);
  }
});

test('unknown permission is denied rather than throwing', () => {
  assert.equal(can('OWNER', 'perm:does-not-exist'), false);
  assert.equal(can('SUPERVISOR', ''), false);
});

test('role gate composes with the legal transition table', () => {
  // Cancellation is Supervisor/Owner only (PRD Section 8)
  assert.equal(transitionAllowedByRole('SUPERVISOR', 'CANCELLED'), true);
  assert.equal(transitionAllowedByRole('PARTS', 'CANCELLED'), false);
  assert.equal(transitionAllowedByRole('FRONT_DESK', 'CANCELLED'), false);

  // QC verdicts
  assert.equal(transitionAllowedByRole('QC', 'READY'), true);
  assert.equal(transitionAllowedByRole('QC', 'REWORK'), true);
  assert.equal(transitionAllowedByRole('PARTS', 'REWORK'), false);

  // Handover and closure follow payment permission
  assert.equal(transitionAllowedByRole('FRONT_DESK', 'HANDED_OVER'), true);
  assert.equal(transitionAllowedByRole('FINANCE', 'CLOSED'), true);
  assert.equal(transitionAllowedByRole('PARTS', 'HANDED_OVER'), false);

  // Intake only for front counter roles
  assert.equal(transitionAllowedByRole('FRONT_DESK', 'QUEUED'), true);
  assert.equal(transitionAllowedByRole('TECHNICIAN', 'QUEUED'), false);

  assert.equal(transitionAllowedByRole('OWNER', 'DRAFT'), false);
});
