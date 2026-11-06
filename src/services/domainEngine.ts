import type {
  WorkOrder,
  WoStatus,
  TaskStatus,
  Service,
  PricingRule,
  SlaPolicy,
  Station,
  Technician,
  WoTask,
  JobCost,
  CommissionMode,
  Part,
  PurchaseOrder,
  StockMovement,
  StockMovementType,
  Supplier,
} from '../types/domain.ts';

/**
 * Moving-average cost update on goods receipt.
 * ponytail: single-warehouse average per part. Multi-branch averaging
 * would key the average on (part_id, branch_id) instead.
 */
export function calculateMovingAverageCost(
  currentQty: number,
  currentAvgCost: number,
  receivedQty: number,
  receivedUnitCost: number
): number {
  const newQty = currentQty + receivedQty;
  if (newQty <= 0) return receivedUnitCost;
  return (currentQty * currentAvgCost + receivedQty * receivedUnitCost) / newQty;
}

/** Parts whose stock sits at or below the reorder point. */
export function findReorderCandidates(parts: Part[]): Part[] {
  return parts.filter((p) => {
    const threshold = p.reorderPoint ?? p.minStock;
    return p.stockQty <= threshold;
  });
}

export function computeReorderQty(part: Part): number {
  if (part.reorderQty) return part.reorderQty;
  const target = part.maxStock ?? (part.minStock ?? 5) * 2;
  return Math.max(0, target - part.stockQty);
}

export function calculatePoTotal(
  items: { qtyOrdered: number; unitCost: number; lineTotal?: number }[]
): number {
  return items.reduce((sum, i) => sum + (i.lineTotal ?? i.qtyOrdered * i.unitCost), 0);
}

/** Legit PO transitions, mirroring PRD Section 8 conventions. */
export const PO_TRANSITIONS: Record<PurchaseOrder['status'], PurchaseOrder['status'][]> = {
  DRAFT: ['ORDERED', 'CANCELLED'],
  ORDERED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
};

export function canTransitionPo(from: PurchaseOrder['status'], to: PurchaseOrder['status']): boolean {
  return PO_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Due date = receipt date + supplier terms of payment. */
export function calculateDueDate(receiptDate: string, supplier: Supplier): string {
  const d = new Date(receiptDate);
  d.setDate(d.getDate() + supplier.termOfPayment);
  return d.toISOString();
}

export function expectedAtFromLeadTime(orderDate: string, supplier: Supplier): string {
  const d = new Date(orderDate);
  d.setDate(d.getDate() + supplier.leadTimeDays);
  return d.toISOString();
}

export interface StockPosting {
  qtyBefore: number;
  qtyAfter: number;
  movement: Omit<StockMovement, 'id' | 'createdAt' | 'qtyAfter'>;
}

/**
 * Single place where stock changes are recorded. Every call must produce a
 * ledger row so `part_stocks` can never drift from `stock_movements`.
 */
export function postStockMovement(args: {
  part: Part;
  branchId: string;
  type: StockMovementType;
  qtyDelta: number;
  refType?: StockMovement['refType'];
  refId?: string;
  notes?: string;
  createdBy: string;
  now: string;
}): StockPosting {
  const qtyBefore = args.part.stockQty;
  const qtyAfter = qtyBefore + args.qtyDelta;
  return {
    qtyBefore,
    qtyAfter,
    movement: {
      partId: args.part.id,
      partName: args.part.name,
      branchId: args.branchId,
      type: args.type,
      qtyDelta: args.qtyDelta,
      unitCost: args.part.unitCost,
      refType: args.refType,
      refId: args.refId,
      notes: args.notes,
      createdBy: args.createdBy,
    },
  };
}

/** Staging on a PO: all items in, or a partial receipt. */
export function resolvePoStatusAfterReceipt(
  items: { qtyOrdered: number; qtyReceived: number }[]
): PurchaseOrder['status'] {
  const allComplete = items.every((i) => i.qtyReceived >= i.qtyOrdered);
  if (allComplete) return 'RECEIVED';
  const anyReceived = items.some((i) => i.qtyReceived > 0);
  return anyReceived ? 'PARTIALLY_RECEIVED' : 'ORDERED';
}

export function validateReturnQty(
  grnItem: { qtyReceived: number; qtyRejected: number },
  returnQty: number
): { ok: boolean; error?: string } {
  const available = grnItem.qtyRejected;
  if (returnQty <= 0) return { ok: false, error: 'Jumlah retur harus lebih dari 0.' };
  if (returnQty > available) {
    return {
      ok: false,
      error: `Jumlah retur melebihi qty yang ditolak (${available}).`,
    };
  }
  return { ok: true };
}


// Valid transitions per PRD Section 8
export const VALID_TRANSITIONS: Record<WoStatus, WoStatus[]> = {
  DRAFT: ['QUEUED', 'CANCELLED'],
  QUEUED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'QC', 'READY', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  QC: ['READY', 'REWORK'],
  REWORK: ['IN_PROGRESS'],
  READY: ['HANDED_OVER', 'IN_PROGRESS', 'CANCELLED'],
  HANDED_OVER: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: WoStatus, to: WoStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// Compute unit price applying tiered/customer rules
export function calculateUnitPrice(
  service: Service,
  qty: number,
  customerId?: string,
  rules: PricingRule[] = []
): number {
  // 1. Customer-specific rule
  if (customerId) {
    const custRule = rules.find(
      (r) =>
        r.serviceId === service.id &&
        r.customerId === customerId &&
        qty >= r.minQty &&
        (r.maxQty === undefined || qty <= r.maxQty)
    );
    if (custRule) return custRule.unitPrice;
  }

  // 2. Volume-tier rule
  const tierRule = rules.find(
    (r) =>
      r.serviceId === service.id &&
      !r.customerId &&
      qty >= r.minQty &&
      (r.maxQty === undefined || qty <= r.maxQty)
  );
  if (tierRule) return tierRule.unitPrice;

  // 3. Fallback to base
  return service.basePrice;
}

// Calculate promised delivery date based on SLA tier + queue depth
export function calculatePromisedAt(
  acceptedAt: Date,
  policy: SlaPolicy,
  queueTaskCount: number,
  avgTaskMinutes = 20
): Date {
  // Base SLA hours + queue offset (ponytail: queue offset capped at +24h to avoid endless delay)
  const queueHours = Math.min((queueTaskCount * avgTaskMinutes) / 60, 24);
  const totalHours = policy.baseHours + queueHours;
  const promised = new Date(acceptedAt.getTime() + totalHours * 3600 * 1000);
  return promised;
}

// Expand a service's stage templates into runnable tasks for a WO
export function expandTasksForService(
  workOrderId: string,
  service: Service,
  stations: Station[],
  technicians: Technician[]
): WoTask[] {
  return service.stages
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((stage, idx) => {
      // Find eligible technician by skill
      const eligibleTechs = technicians.filter(
        (t) => t.isActive && t.skills.includes(stage.requiredSkill)
      );
      // Pick first (in full app, use load balancing)
      const assignedTech = eligibleTechs[idx % (eligibleTechs.length || 1)];

      // Find eligible station
      const assignedStation = stations.find(
        (s) => s.isActive && (!s.requiredSkill || s.requiredSkill === stage.requiredSkill)
      );

      return {
        id: `task-${workOrderId}-${stage.seq}`,
        workOrderId,
        seq: stage.seq,
        stageCode: stage.code,
        stageName: stage.name,
        status: 'PENDING' as TaskStatus,
        stationId: assignedStation?.id,
        technicianId: assignedTech?.id,
        estMinutes: stage.estMinutes,
        checklist: stage.checklistItems.map((c) => ({
          id: c.id,
          label: c.label,
          isMandatory: c.isMandatory,
          done: false,
        })),
      };
    });
}

// Calculate technician commission for a task/job
export function calculateCommission(
  mode: CommissionMode,
  rate: number,
  revenue: number,
  actualMinutes?: number
): number {
  switch (mode) {
    case 'FLAT_PER_JOB':
      return rate;
    case 'PERCENTAGE_OF_REVENUE':
      return (revenue * rate) / 100;
    case 'TIERED_PER_HOUR': {
      const hours = (actualMinutes || 60) / 60;
      return hours * rate;
    }
  }
}

// Job costing: revenue - parts - labor = gross margin
export function calculateJobCost(
  wo: WorkOrder,
  technicians: Technician[]
): JobCost {
  const revenue = Math.max(0, wo.subtotal - wo.discount);
  const partsCost = wo.partUsages.reduce(
    (sum, u) => sum + u.qty * u.unitCostSnap,
    0
  );

  // Labor = commission of technicians assigned to tasks
  let laborCost = 0;
  for (const t of wo.tasks) {
    if (t.technicianId && t.status === 'DONE') {
      const tech = technicians.find((x) => x.id === t.technicianId);
      if (tech) {
        const comm = calculateCommission(
          tech.commissionMode,
          tech.commissionRate,
          revenue,
          t.estMinutes
        );
        laborCost += comm;
      }
    }
  }

  const grossMargin = revenue - partsCost - laborCost;
  const marginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;

  return {
    revenue,
    partsCost,
    laborCost,
    grossMargin,
    marginPct: Math.round(marginPct * 10) / 10,
  };
}

// Evaluate next WO status when a task is updated
export function evaluateWoStatusFromTasks(
  currentStatus: WoStatus,
  tasks: WoTask[],
  requiresQc: boolean
): WoStatus {
  if (currentStatus === 'CANCELLED' || currentStatus === 'CLOSED' || currentStatus === 'HANDED_OVER') {
    return currentStatus;
  }

  const anyInProgress = tasks.some((t) => t.status === 'IN_PROGRESS');
  const anyBlocked = tasks.some((t) => t.status === 'BLOCKED');
  const anyRejected = tasks.some((t) => t.status === 'QC_REJECTED');
  const allDone = tasks.length > 0 && tasks.every((t) => t.status === 'DONE');

  if (anyRejected) return 'REWORK';
  if (anyBlocked) return 'ON_HOLD';
  if (allDone) return requiresQc ? 'QC' : 'READY';
  if (anyInProgress) return 'IN_PROGRESS';

  return currentStatus;
}

export type Role =
  | 'OWNER'
  | 'SUPERVISOR'
  | 'FRONT_DESK'
  | 'TECHNICIAN'
  | 'QC'
  | 'FINANCE'
  | 'PARTS';

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  SUPERVISOR: 'Supervisor',
  FRONT_DESK: 'Front Desk',
  TECHNICIAN: 'Teknisi',
  QC: 'QC',
  FINANCE: 'Finance',
  PARTS: 'Gudang',
};

export const PERMISSIONS: Record<string, Role[]> = {
  dashboard: ['OWNER', 'SUPERVISOR', 'FRONT_DESK', 'TECHNICIAN', 'QC', 'FINANCE', 'PARTS'],
  intake: ['OWNER', 'SUPERVISOR', 'FRONT_DESK'],
  board: ['OWNER', 'SUPERVISOR', 'FRONT_DESK', 'QC', 'PARTS'],
  workorders: ['OWNER', 'SUPERVISOR', 'FRONT_DESK', 'QC', 'PARTS', 'FINANCE'],
  tasks: ['OWNER', 'SUPERVISOR', 'TECHNICIAN'],
  qc: ['OWNER', 'SUPERVISOR', 'QC'],
  handover: ['OWNER', 'SUPERVISOR', 'FRONT_DESK', 'FINANCE'],
  subscriptions: ['OWNER', 'SUPERVISOR', 'FRONT_DESK'],
  parts: ['OWNER', 'SUPERVISOR', 'PARTS'],
  suppliers: ['OWNER', 'SUPERVISOR', 'PARTS'],
  pr: ['OWNER', 'SUPERVISOR', 'PARTS'],
  po: ['OWNER', 'SUPERVISOR', 'PARTS', 'FINANCE'],
  grn: ['OWNER', 'SUPERVISOR', 'PARTS', 'QC'],
  transfers: ['OWNER', 'SUPERVISOR', 'PARTS'],
  reports: ['OWNER', 'SUPERVISOR', 'FINANCE'],
  'pr:submit': ['PARTS', 'SUPERVISOR', 'OWNER'],
  'pr:review': ['SUPERVISOR', 'OWNER'],
  'po:create': ['PARTS', 'SUPERVISOR', 'OWNER'],
  'po:issue': ['PARTS', 'SUPERVISOR', 'OWNER'],
  'po:cancel': ['PARTS', 'SUPERVISOR', 'OWNER'],
  'grn:receive': ['PARTS', 'SUPERVISOR', 'OWNER'],
  'grn:inspect': ['QC', 'PARTS', 'SUPERVISOR', 'OWNER'],
  'supplier:return': ['PARTS', 'SUPERVISOR', 'OWNER'],
  'stock:transfer': ['PARTS', 'SUPERVISOR', 'OWNER'],
  'stock:adjust': ['PARTS', 'SUPERVISOR', 'OWNER'],
  'supplier:payment': ['FINANCE', 'OWNER'],
  'payment:receive': ['FRONT_DESK', 'FINANCE', 'SUPERVISOR', 'OWNER'],
  'wo:override': ['SUPERVISOR', 'OWNER'],
  'qc:decide': ['QC', 'SUPERVISOR', 'OWNER'],
  'task:execute': ['TECHNICIAN', 'SUPERVISOR', 'OWNER'],
  'wo:create': ['FRONT_DESK', 'SUPERVISOR', 'OWNER'],
};

export function can(role: Role, perm: string): boolean {
  return PERMISSIONS[perm]?.includes(role) ?? false;
}

/**
 * Role check on top of the legal transition table (PRD Sections 4 + 8).
 * Cancellation is Supervisor/Owner only; handover and closure belong to
 * whoever takes payment; QC verdicts belong to QC.
 */
export function transitionAllowedByRole(role: Role, to: WoStatus): boolean {
  switch (to) {
    case 'CANCELLED':
      return can(role, 'wo:override');
    case 'QUEUED':
      return can(role, 'wo:create');
    case 'ON_HOLD':
    case 'IN_PROGRESS':
      return can(role, 'task:execute') || can(role, 'wo:override');
    case 'QC':
    case 'READY':
    case 'REWORK':
      return can(role, 'qc:decide') || can(role, 'wo:override');
    case 'HANDED_OVER':
    case 'CLOSED':
      return can(role, 'payment:receive');
    case 'DRAFT':
      return false;
  }
}
