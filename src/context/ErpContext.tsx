import { createContext, useContext, useState, type ReactNode } from 'react';
import type {
  WorkOrder,
  WorkOrderItem,
  WoTask,
  PartUsage,
  Customer,
  PaymentMethod,
  Service,
  SlaPolicy,
  PricingRule,
  Station,
  Technician,
  Part,
  Subscription,
  Supplier,
  PurchaseRequest,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  SupplierReturn,
  StockMovement,
  StockTransfer,
  SupplierPayment,
  PrStatus,
  User,
} from '../types/domain';
import {
  calculateMovingAverageCost,
  calculatePromisedAt,
  calculateUnitPrice,
  evaluateWoStatusFromTasks,
  expandTasksForService,
  postStockMovement,
  resolvePoStatusAfterReceipt,
  type StockPosting,
} from '../services/domainEngine';
import {
  initialBranches,
  initialCustomers,
  initialParts,
  initialPricingRules,
  initialServices,
  initialSlaPolicies,
  initialStations,
  initialStockMovements,
  initialStockTransfers,
  initialSubscriptions,
  initialSuppliers,
  initialPurchaseOrders,
  initialPurchaseRequests,
  initialSupplierPayments,
  initialGoodsReceipts,
  initialTechnicians,
  initialUsers,
  initialWorkOrders,
} from '../data/seedData';

interface ErpState {
  currentUser: User;
  setCurrentUser: (userOrId: User | string) => void;
  workOrders: WorkOrder[];
  parts: Part[];
  suppliers: Supplier[];
  purchaseRequests: PurchaseRequest[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  supplierReturns: SupplierReturn[];
  stockTransfers: StockTransfer[];
  stockMovements: StockMovement[];
  supplierPayments: SupplierPayment[];

  updateWorkOrder: (id: string, patch: Partial<WorkOrder>) => void;
  updateWorkOrderTask: (woId: string, taskId: string, patch: Partial<WoTask>) => void;
  addWorkOrder: (draft: {
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    serviceId: string;
    quantity: number;
    entryChannel: WorkOrder['entryChannel'];
    slaTier: SlaPolicy['tier'];
    intakeNotes?: string;
  }) => WorkOrder;
  transitionWo: (woId: string, toStatus: WorkOrder['status'], _reason?: string) => void;
  addPartUsage: (woId: string, partId: string, qty: number, taskId?: string) => void;
  recordPayment: (woId: string, method: PaymentMethod, amount: number) => void;

  // Supply chain
  submitPr: (prId: string) => void;
  reviewPr: (prId: string, decision: 'APPROVED' | 'REJECTED', note?: string) => void;
  createPo: (draft: {
    branchId: string;
    supplierId: string;
    purchaseRequestId?: string;
    priority: number;
    notes?: string;
    items: { partId: string; qtyOrdered: number; unitCost: number }[];
  }) => PurchaseOrder;
  issuePo: (poId: string) => void;
  cancelPo: (poId: string) => void;
  createGrn: (poId: string, lines: { partId: string; qtyAccepted: number; qtyRejected: number; unitCost: number; rejectReason?: string }) => GoodsReceipt;
  postReturn: (
    grnId: string,
    returns: { partId: string; qtyReturned: number; unitCost: number; reason: SupplierReturn['items'][number]['reason']; notes?: string }
  ) => SupplierReturn | null;
  sendTransfer: (partId: string, fromBranchId: string, toBranchId: string, qty: number, notes?: string) => StockTransfer;
  receiveTransfer: (trfId: string) => void;
  adjustStock: (partId: string, branchId: string, qtyDelta: number, notes?: string) => void;
  recordSupplierPayment: (poId: string, amount: number, method: SupplierPayment['method'], referenceNo?: string) => void;
}

interface StaticData {
  services: Service[];
  slaPolicies: SlaPolicy[];
  pricingRules: PricingRule[];
  stations: Station[];
  technicians: Technician[];
  customers: Customer[];
  subscriptions: Subscription[];
  branches: typeof initialBranches;
  users: typeof initialUsers;
}

const StaticDataContext = createContext<StaticData | null>(null);
const ErpStateContext = createContext<ErpState | null>(null);

export function useStaticData(): StaticData {
  const ctx = useContext(StaticDataContext);
  if (!ctx) throw new Error('useStaticData must be used within StaticDataProvider');
  return ctx;
}

export function useErpState(): ErpState {
  const ctx = useContext(ErpStateContext);
  if (!ctx) throw new Error('useErpState must be used within ErpStateProvider');
  return ctx;
}

function applyMovement(
  prevParts: Part[],
  prevMovements: StockMovement[],
  postings: StockPosting[]
): { parts: Part[]; movements: StockMovement[] } {
  let parts = prevParts;
  const newMovements: StockMovement[] = [];
  for (const posting of postings) {
    parts = parts.map((p) => {
      if (p.id !== posting.movement.partId) return p;
      const updated = { ...p, stockQty: posting.qtyAfter };
      // Moving average on purchase receipts
      if (posting.movement.type === 'PURCHASE_RECEIPT') {
        updated.unitCost = calculateMovingAverageCost(
          posting.qtyBefore,
          p.unitCost,
          posting.movement.qtyDelta,
          posting.movement.unitCost
        );
      }
      return updated;
    });
    newMovements.push({
      ...posting.movement,
      id: `sm-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      qtyAfter: posting.qtyAfter,
      createdAt: new Date().toISOString(),
    });
  }
  return { parts, movements: [...newMovements, ...prevMovements] };
}

export function AppProviders({ children }: { children: ReactNode }) {
  const staticData: StaticData = {
    services: initialServices,
    slaPolicies: initialSlaPolicies,
    pricingRules: initialPricingRules,
    stations: initialStations,
    technicians: initialTechnicians,
    customers: initialCustomers,
    subscriptions: initialSubscriptions,
    branches: initialBranches,
    users: initialUsers,
  };

  const [currentUser, setCurrentUserState] = useState<User>(initialUsers[1]); // Agus Pratama (SUPERVISOR)

  const setCurrentUser = (userOrId: User | string) => {
    if (typeof userOrId === 'string') {
      const found = initialUsers.find((u) => u.id === userOrId || u.role === userOrId);
      if (found) setCurrentUserState(found);
    } else {
      setCurrentUserState(userOrId);
    }
  };

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [parts, setParts] = useState<Part[]>(initialParts);
  const [suppliers] = useState<Supplier[]>(initialSuppliers);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>(initialPurchaseRequests);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(initialPurchaseOrders);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>(initialGoodsReceipts);
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturn[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>(initialStockTransfers);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(initialStockMovements);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>(initialSupplierPayments);

  const findPart = (list: Part[], id: string): Part => {
    const p = list.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown part: ${id}`);
    return p;
  };

  function updateWorkOrder(id: string, patch: Partial<WorkOrder>) {
    setWorkOrders((prev) => prev.map((wo) => (wo.id === id ? { ...wo, ...patch } : wo)));
  }

  function updateWorkOrderTask(woId: string, taskId: string, patch: Partial<WoTask>) {
    setWorkOrders((prev) =>
      prev.map((wo) => {
        if (wo.id !== woId) return wo;
        const tasks = wo.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
        // Auto-evaluate WO status from tasks
        const primaryItem = wo.items.find((i) => i.serviceId);
        const svc = primaryItem ? staticData.services.find((s) => s.id === primaryItem.serviceId) : undefined;
        const requiresQc = svc?.requiresQc ?? true;
        const newStatus = evaluateWoStatusFromTasks(wo.status, tasks, requiresQc);
        return { ...wo, tasks, status: newStatus };
      })
    );
  }

  function addWorkOrder(draft: {
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    serviceId: string;
    quantity: number;
    entryChannel: WorkOrder['entryChannel'];
    slaTier: SlaPolicy['tier'];
    intakeNotes?: string;
  }): WorkOrder {
    const svc = staticData.services.find((s) => s.id === draft.serviceId);
    if (!svc) throw new Error(`Unknown service: ${draft.serviceId}`);

    const unitPrice = calculateUnitPrice(svc, draft.quantity, draft.customerId, staticData.pricingRules);
    const item: WorkOrderItem = {
      id: `woi-${Date.now()}`,
      serviceId: svc.id,
      serviceNameSnap: `${svc.name} (${svc.baseUnit})`,
      quantity: draft.quantity,
      unit: svc.baseUnit,
      unitPrice,
      lineTotal: unitPrice * draft.quantity,
      notes: undefined,
    };

    const now = new Date();
    const slaPolicy = staticData.slaPolicies.find((p) => p.tier === draft.slaTier) ?? staticData.slaPolicies[2];
    // Count queued/active tasks for this service's stations as proxy for queue depth
    const queueDepth = workOrders.filter((w) => w.status === 'QUEUED' || w.status === 'IN_PROGRESS').length;
    const promisedAt = calculatePromisedAt(now, slaPolicy, queueDepth, svc.stages[0]?.estMinutes ?? 20);

    const newId = `wo-${Date.now()}`;
    const woNo = `WO-JKT-2026-${String(workOrders.length + 1).padStart(4, '0')}`;
    const tasks = expandTasksForService(newId, svc, staticData.stations, staticData.technicians);

    const wo: WorkOrder = {
      id: newId,
      woNo,
      branchId: 'br-jkt',
      customerId: draft.customerId,
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      entryChannel: draft.entryChannel,
      status: 'QUEUED', // Auto-transition to QUEUED after intake confirm
      slaTier: draft.slaTier,
      priority: draft.slaTier === 'SAME_DAY' ? 1 : draft.slaTier === 'EXPRESS' ? 2 : 3,
      promisedAt: promisedAt.toISOString(),
      acceptedAt: now.toISOString(),
      subtotal: item.lineTotal,
      discount: 0,
      tax: 0,
      grandTotal: item.lineTotal,
      intakeNotes: draft.intakeNotes,
      publicToken: `tk-${now.getTime()}`,
      createdBy: currentUser.id,
      createdAt: now.toISOString(),
      items: [item],
      tasks,
      partUsages: [],
      photos: [],
      payments: [],
    };

    setWorkOrders((prev) => [...prev, wo]);
    return wo;
  }

  function transitionWo(woId: string, toStatus: WorkOrder['status'], _reason?: string) {
    setWorkOrders((prev) =>
      prev.map((wo) => {
        if (wo.id !== woId) return wo;
        const patch: Partial<WorkOrder> = { status: toStatus };
        if (toStatus === 'HANDED_OVER') patch.completedAt = new Date().toISOString();
        if (toStatus === 'CLOSED') {
          // Auto-close when all payments received
          const paid = wo.payments.reduce((s, p) => s + p.amount, 0);
          if (paid >= wo.grandTotal) patch.completedAt = new Date().toISOString();
        }
        return { ...wo, ...patch };
      })
    );
  }

  function addPartUsage(woId: string, partId: string, qty: number, taskId?: string) {
    const part = parts.find((p) => p.id === partId);
    if (!part || qty <= 0) return;

    const now = new Date().toISOString();
    const posting = postStockMovement({
      part,
      branchId: 'br-jkt',
      type: 'JOB_CONSUMPTION',
      qtyDelta: -qty,
      refType: 'WO',
      refId: woId,
      notes: `Dipakai pada ${woId}`,
      createdBy: currentUser.id,
      now,
    });

    const { parts: nextParts, movements } = applyMovement(parts, stockMovements, [posting]);
    setParts(nextParts);
    setStockMovements(movements);

    const usage: PartUsage = {
      id: `pu-${Date.now()}`,
      workOrderId: woId,
      taskId,
      partId,
      partName: part.name,
      qty,
      unitCostSnap: part.unitCost,
      createdAt: now,
    };
    setWorkOrders((prev) =>
      prev.map((wo) => (wo.id === woId ? { ...wo, partUsages: [...wo.partUsages, usage] } : wo))
    );
  }

  function recordPayment(woId: string, method: PaymentMethod, amount: number) {
    setWorkOrders((prev) =>
      prev.map((wo) => {
        if (wo.id !== woId) return wo;
        const payment = {
          id: `pay-${Date.now()}`,
          paymentNo: `PAY-${wo.woNo.split('-').pop()}`,
          amount,
          method,
          status: 'PAID' as const,
          paidAt: new Date().toISOString(),
        };
        const payments = [...wo.payments, payment];
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
        // Auto-transition to CLOSED when fully paid after handover
        if (wo.status === 'HANDED_OVER' && totalPaid >= wo.grandTotal) {
          return { ...wo, payments, status: 'CLOSED' };
        }
        return { ...wo, payments };
      })
    );
  }

  // ---- Supply chain ----

  function setPrStatus(prId: string, status: PrStatus, extra?: Partial<PurchaseRequest>) {
    setPurchaseRequests((prev) =>
      prev.map((pr) => (pr.id === prId ? { ...pr, status, ...extra } : pr))
    );
  }

  function submitPr(prId: string) {
    setPrStatus(prId, 'SUBMITTED', {
      submittedBy: currentUser.id,
      submittedAt: new Date().toISOString(),
    });
  }

  function reviewPr(prId: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
    setPrStatus(prId, decision, {
      reviewedBy: currentUser.id,
      reviewedAt: new Date().toISOString(),
      reviewNote: note,
    });
  }

  function createPo(draft: {
    branchId: string;
    supplierId: string;
    purchaseRequestId?: string;
    priority: number;
    notes?: string;
    items: { partId: string; qtyOrdered: number; unitCost: number }[];
  }): PurchaseOrder {
    const supplier = suppliers.find((s) => s.id === draft.supplierId);
    if (!supplier) throw new Error(`Unknown supplier: ${draft.supplierId}`);
    const now = new Date();
    const newId = `po-${Date.now()}`;
    const items: PurchaseOrderItem[] = draft.items
      .filter((i) => i.qtyOrdered > 0)
      .map((i) => {
        const part = findPart(parts, i.partId);
        const purchaseUnit = part.purchaseUnit ?? part.unit;
        const conversionRatio = part.conversionRatio ?? 1;
        return {
          id: `poi-${Date.now()}-${i.partId}`,
          partId: part.id,
          partName: part.name,
          qtyOrdered: i.qtyOrdered,
          qtyReceived: 0,
          unitCost: i.unitCost,
          purchaseUnit,
          conversionRatio,
          lineTotal: i.qtyOrdered * i.unitCost,
        };
      });
    if (items.length === 0) throw new Error('PO harus punya minimal satu item.');

    const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);
    const expected = new Date(now);
    expected.setDate(expected.getDate() + supplier.leadTimeDays);

    const po: PurchaseOrder = {
      id: newId,
      poNo: `PO-JKT-2026-${String(purchaseOrders.length + 1).padStart(4, '0')}`,
      purchaseRequestId: draft.purchaseRequestId,
      branchId: draft.branchId,
      supplierId: supplier.id,
      supplierName: supplier.name,
      status: 'DRAFT',
      priority: draft.priority,
      orderDate: now.toISOString(),
      expectedAt: expected.toISOString(),
      totalAmount,
      paymentStatus: 'UNPAID',
      notes: draft.notes,
      issuedBy: currentUser.id,
      createdAt: now.toISOString(),
      items,
    };

    setPurchaseOrders((prev) => [po, ...prev]);
    if (draft.purchaseRequestId) setPrStatus(draft.purchaseRequestId, 'PO_CREATED');
    return po;
  }

  function issuePo(poId: string) {
    setPurchaseOrders((prev) =>
      prev.map((po) =>
        po.id === poId ? { ...po, status: 'ORDERED', issuedAt: new Date().toISOString(), issuedBy: currentUser.id } : po
      )
    );
  }

  function cancelPo(poId: string) {
    setPurchaseOrders((prev) =>
      prev.map((po) => (po.id === poId ? { ...po, status: 'CANCELLED' } : po))
    );
  }

  function createGrn(
    poId: string,
    lines: { partId: string; qtyAccepted: number; qtyRejected: number; unitCost: number; rejectReason?: string }
  ): GoodsReceipt {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) throw new Error(`Unknown PO: ${poId}`);

    const now = new Date().toISOString();
    const receipts: GoodsReceipt['items'] = [];
    const postings: StockPosting[] = [];

    for (const line of [lines]) {
      const poi = po.items.find((i) => i.partId === line.partId);
      if (!poi) continue;
      const outstanding = poi.qtyOrdered - poi.qtyReceived;
      const accepted = Math.min(line.qtyAccepted, Math.max(0, outstanding));
      if (accepted <= 0 && line.qtyRejected <= 0) continue;

      const part = findPart(parts, line.partId);
      postings.push(
        postStockMovement({
          part,
          branchId: po.branchId,
          type: 'PURCHASE_RECEIPT',
          qtyDelta: accepted,
          refType: 'GRN',
          refId: `grn-${poId}`,
          notes: `Penerimaan ${po.poNo}`,
          createdBy: currentUser.id,
          now,
        })
      );

      receipts.push({
        id: `gri-${Date.now()}-${line.partId}`,
        purchaseOrderItemId: poi.id,
        partId: part.id,
        partName: part.name,
        qtyReceived: accepted,
        qtyRejected: line.qtyRejected,
        unitCost: line.unitCost,
        rejectReason: line.rejectReason,
      });
    }

    if (postings.length === 0) throw new Error('Tidak ada barang yang diterima.');

    const grn: GoodsReceipt = {
      id: `grn-${Date.now()}`,
      grnNo: `GRN-JKT-2026-${String(goodsReceipts.length + 1).padStart(4, '0')}`,
      purchaseOrderId: po.id,
      poNo: po.poNo,
      branchId: po.branchId,
      status: receipts.some((r) => r.qtyRejected > 0) ? 'INSPECTED_REJECT' : 'INSPECTED_PASS',
      receiptDate: now,
      receivedBy: currentUser.id,
      inspectedBy: currentUser.id,
      inspectedAt: now,
      createdAt: now,
      items: receipts,
    };

    const { parts: nextParts, movements } = applyMovement(parts, stockMovements, postings);
    setParts(nextParts);
    setStockMovements(movements);

    // Update PO received quantities + status
    setPurchaseOrders((prev) =>
      prev.map((p) => {
        if (p.id !== poId) return p;
        const items = p.items.map((poi) => {
          const r = receipts.find((x) => x.purchaseOrderItemId === poi.id);
          if (!r) return poi;
          return { ...poi, qtyReceived: poi.qtyReceived + r.qtyReceived };
        });
        const status = resolvePoStatusAfterReceipt(items);
        const supplier = suppliers.find((s) => s.id === p.supplierId);
        const due =
          status === 'RECEIVED' && supplier
            ? new Date(new Date(now).getTime() + supplier.termOfPayment * 86400000).toISOString()
            : p.dueDate;
        return { ...p, items, status, dueDate: due, receivedBy: currentUser.id };
      })
    );

    setGoodsReceipts((prev) => [grn, ...prev]);
    return grn;
  }

  function postReturn(
    grnId: string,
    returns: { partId: string; qtyReturned: number; unitCost: number; reason: SupplierReturn['items'][number]['reason']; notes?: string }
  ): SupplierReturn | null {
    const grn = goodsReceipts.find((g) => g.id === grnId);
    if (!grn) throw new Error(`Unknown GRN: ${grnId}`);
    const po = purchaseOrders.find((p) => p.id === grn.purchaseOrderId);
    if (!po) throw new Error(`Unknown PO for GRN: ${grnId}`);

    const items = [returns]
      .filter((r) => r.qtyReturned > 0)
      .map((r) => {
        const part = findPart(parts, r.partId);
        return {
          id: `sri-${Date.now()}-${r.partId}`,
          partId: part.id,
          partName: part.name,
          qtyReturned: r.qtyReturned,
          unitCost: r.unitCost,
          reason: r.reason,
          notes: r.notes,
        };
      });
    if (items.length === 0) return null;

    const now = new Date().toISOString();
    const totalAmount = items.reduce((s, i) => s + i.qtyReturned * i.unitCost, 0);
    const sr: SupplierReturn = {
      id: `sr-${Date.now()}`,
      srNo: `SR-JKT-2026-${String(supplierReturns.length + 1).padStart(4, '0')}`,
      goodsReceiptId: grn.id,
      purchaseOrderId: po.id,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      branchId: po.branchId,
      status: 'COMPLETED',
      returnDate: now,
      totalAmount,
      createdBy: currentUser.id,
      completedAt: now,
      createdAt: now,
      items,
    };

    const postings = items.map((i) => {
      const part = findPart(parts, i.partId);
      return postStockMovement({
        part,
        branchId: po.branchId,
        type: 'RETURN_OUT',
        qtyDelta: -i.qtyReturned,
        refType: 'SR',
        refId: sr.id,
        notes: `Retur ${sr.srNo} (${i.reason})`,
        createdBy: currentUser.id,
        now,
      });
    });
    const { parts: nextParts, movements } = applyMovement(parts, stockMovements, postings);
    setParts(nextParts);
    setStockMovements(movements);

    setSupplierReturns((prev) => [sr, ...prev]);
    return sr;
  }

  function sendTransfer(
    partId: string,
    fromBranchId: string,
    toBranchId: string,
    qty: number,
    notes?: string
  ): StockTransfer {
    const part = findPart(parts, partId);
    if (fromBranchId === toBranchId) throw new Error('Cabang asal dan tujuan harus berbeda.');
    if (qty <= 0) throw new Error('Jumlah transfer harus lebih dari 0.');
    if (part.stockQty < qty) throw new Error(`Stok ${part.name} tidak cukup (${part.stockQty} ${part.unit}).`);

    const now = new Date().toISOString();
    const posting = postStockMovement({
      part,
      branchId: fromBranchId,
      type: 'TRANSFER_OUT',
      qtyDelta: -qty,
      refType: 'TRF',
      refId: `trf-${Date.now()}`,
      notes: notes ?? `Kirim ke ${toBranchId}`,
      createdBy: currentUser.id,
      now,
    });
    const { parts: nextParts, movements } = applyMovement(parts, stockMovements, [posting]);
    setParts(nextParts);
    setStockMovements(movements);

    const trf: StockTransfer = {
      id: `trf-${Date.now()}`,
      trfNo: `TRF-${fromBranchId}-${toBranchId}-2026-${String(stockTransfers.length + 1).padStart(4, '0')}`,
      partId: part.id,
      partName: part.name,
      fromBranchId,
      toBranchId,
      qtySent: qty,
      qtyReceived: 0,
      status: 'IN_TRANSIT',
      sentAt: now,
      notes,
      createdBy: currentUser.id,
      createdAt: now,
    };
    setStockTransfers((prev) => [trf, ...prev]);
    return trf;
  }

  function receiveTransfer(trfId: string) {
    const trf = stockTransfers.find((t) => t.id === trfId);
    if (!trf || trf.status !== 'IN_TRANSIT') return;
    const part = findPart(parts, trf.partId);
    const now = new Date().toISOString();
    const posting = postStockMovement({
      part,
      branchId: trf.toBranchId,
      type: 'TRANSFER_IN',
      qtyDelta: trf.qtySent,
      refType: 'TRF',
      refId: trf.id,
      notes: `Diterima dari ${trf.fromBranchId}`,
      createdBy: currentUser.id,
      now,
    });
    // Stock is flat/global in this build; apply as aggregate receipt
    const { parts: nextParts, movements } = applyMovement(parts, stockMovements, [posting]);
    setParts(nextParts);
    setStockMovements(movements);

    setStockTransfers((prev) =>
      prev.map((t) =>
        t.id === trfId
          ? { ...t, status: 'COMPLETED', receivedAt: now, qtyReceived: t.qtySent }
          : t
      )
    );
  }

  function adjustStock(partId: string, branchId: string, qtyDelta: number, notes?: string) {
    if (qtyDelta === 0) return;
    const part = findPart(parts, partId);
    const now = new Date().toISOString();
    const posting = postStockMovement({
      part,
      branchId,
      type: qtyDelta > 0 ? 'ADJUSTMENT_PLUS' : 'ADJUSTMENT_MINUS',
      qtyDelta,
      refType: 'ADJ',
      refId: `adj-${Date.now()}`,
      notes: notes ?? 'Opname fisik',
      createdBy: currentUser.id,
      now,
    });
    const { parts: nextParts, movements } = applyMovement(parts, stockMovements, [posting]);
    setParts(nextParts);
    setStockMovements(movements);
  }

  function recordSupplierPayment(
    poId: string,
    amount: number,
    method: SupplierPayment['method'],
    referenceNo?: string
  ) {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po || amount <= 0) return;
    const now = new Date().toISOString();
    const payment: SupplierPayment = {
      id: `sp-${Date.now()}`,
      paymentNo: `SPJ-JKT-2026-${String(supplierPayments.length + 1).padStart(4, '0')}`,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      purchaseOrderId: po.id,
      poNo: po.poNo,
      branchId: po.branchId,
      amount,
      paidAt: now,
      method,
      referenceNo,
      paidBy: currentUser.id,
      createdAt: now,
    };
    setSupplierPayments((prev) => [payment, ...prev]);

    const totalPaid =
      supplierPayments.filter((x) => x.purchaseOrderId === poId).reduce((s, x) => s + x.amount, 0) +
      amount;
    const paymentStatus =
      totalPaid >= po.totalAmount ? 'PAID' : totalPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === poId ? { ...p, paymentStatus } : p))
    );
  }

  return (
    <StaticDataContext.Provider value={staticData}>
      <ErpStateContext.Provider
        value={{
          currentUser,
          setCurrentUser,
          workOrders,
          parts,
          suppliers,
          purchaseRequests,
          purchaseOrders,
          goodsReceipts,
          supplierReturns,
          stockTransfers,
          stockMovements,
          supplierPayments,
          updateWorkOrder,
          updateWorkOrderTask,
          addWorkOrder,
          transitionWo,
          addPartUsage,
          recordPayment,
          submitPr,
          reviewPr,
          createPo,
          issuePo,
          cancelPo,
          createGrn,
          postReturn,
          sendTransfer,
          receiveTransfer,
          adjustStock,
          recordSupplierPayment,
        }}
      >
        {children}
      </ErpStateContext.Provider>
    </StaticDataContext.Provider>
  );
}
