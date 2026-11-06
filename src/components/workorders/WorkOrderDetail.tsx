import { useState } from 'react';
import { useErpState, useStaticData } from '../../context/ErpContext';
import { WoStatusBadge, TaskStatusBadge } from '../layout/StatusBadges';
import { formatRupiah, formatDateTime, slaCountdown } from '../../utils/formatters';
import { calculateJobCost, canTransition, VALID_TRANSITIONS, can, transitionAllowedByRole } from '../../services/domainEngine';
import type { PaymentMethod, WoStatus } from '../../types/domain';
import { X } from 'lucide-react';

const TRANSITION_LABEL: Partial<Record<WoStatus, string>> = {
  QUEUED: 'Masukkan Antrean',
  IN_PROGRESS: 'Mulai Kerjakan',
  ON_HOLD: 'Tahan',
  QC: 'Kirim ke QC',
  READY: 'Tandai Siap',
  REWORK: 'Kembalikan untuk Perbaikan',
  HANDED_OVER: 'Serah-Terima',
  CLOSED: 'Tutup (Lunas)',
  CANCELLED: 'Batalkan',
};

export function WorkOrderDetail({ woId, onClose }: { woId: string; onClose: () => void }) {
  const { workOrders, transitionWo, addPartUsage, recordPayment, updateWorkOrderTask, parts, currentUser } = useErpState();
  const { technicians } = useStaticData();
  const wo = workOrders.find((w) => w.id === woId);

  const role = currentUser.role;
  const canExecuteTask = can(role, 'task:execute');
  const canQcDecide = can(role, 'qc:decide');

  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [partId, setPartId] = useState(parts[0]?.id ?? '');
  const [partQty, setPartQty] = useState(1);

  if (!wo) {
    return (
      <div className="rounded border border-slate-200 bg-white p-8 text-center text-slate-500">
        Work order tidak ditemukan.
        <button onClick={onClose} className="ml-2 underline">
          Kembali
        </button>
      </div>
    );
  }

  const sla = slaCountdown(wo.promisedAt);
  const cost = calculateJobCost(wo, technicians);
  const paid = wo.payments.reduce((s, p) => s + p.amount, 0);
  // PRD Section 4: technicians never see margin; front desk never sees HPP breakdown.
  const canSeeFinancials = role !== 'TECHNICIAN' && role !== 'FRONT_DESK';
  const nextStatuses = VALID_TRANSITIONS[wo.status].filter((s) => transitionAllowedByRole(role, s));

  function doTransition(to: WoStatus) {
    if (canTransition(wo!.status, to)) transitionWo(wo!.id, to);
  }

  function toggleChecklist(taskId: string, checklistId: string) {
    const task = wo!.tasks.find((t) => t.id === taskId)!;
    const checklist = task.checklist.map((c) =>
      c.id === checklistId ? { ...c, done: !c.done } : c
    );
    const mandatoryAllDone = checklist.filter((c) => c.isMandatory).every((c) => c.done);
    updateWorkOrderTask(wo!.id, taskId, {
      checklist,
      ...(mandatoryAllDone ? { status: 'DONE', finishedAt: new Date().toISOString() } : {}),
    });
  }

  function startTask(taskId: string) {
    updateWorkOrderTask(wo!.id, taskId, {
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-lg font-semibold text-slate-900">{wo.woNo}</h1>
            <WoStatusBadge status={wo.status} />
            <span
              className={`text-xs font-semibold tabular-nums ${
                sla.tone === 'late' ? 'text-red-600' : sla.tone === 'warn' ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {sla.label}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {wo.customerName}
            {wo.customerPhone ? ` (${wo.customerPhone})` : ''} &middot; Janji:{' '}
            {formatDateTime(wo.promisedAt)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Tutup"
        >
          <X size={18} />
        </button>
      </div>

      {wo.intakeNotes && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Catatan intake:</strong> {wo.intakeNotes}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: tasks + photos */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Task timeline */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Tahap Kerja</h2>
            <ol className="mt-3 flex flex-col">
              {wo.tasks.map((task, i) => {
                const tech = technicians.find((t) => t.id === task.technicianId);
                const isQc = wo.tasks.some((s) => s.seq === task.seq && s.status === 'PENDING');
                return (
                  <li key={task.id} className="flex gap-3">
                    {/* Timeline rail */}
                    <div className="flex flex-col items-center">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                          task.status === 'DONE'
                            ? 'bg-emerald-500 text-white'
                            : task.status === 'IN_PROGRESS'
                              ? 'bg-blue-500 text-white'
                              : task.status === 'BLOCKED'
                                ? 'bg-orange-500 text-white'
                                : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {task.seq}
                      </span>
                      {i < wo.tasks.length - 1 && (
                        <span className="mt-1 w-0.5 flex-1 bg-slate-200" />
                      )}
                    </div>

                    <div className="flex-1 pb-5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{task.stageName}</span>
                        <TaskStatusBadge status={task.status} />
                        {task.qcResult === 'REJECT' && (
                          <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">
                            QC Tolak
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {tech ? `${tech.fullName}` : 'Belum ditugaskan'} &middot; estimasi{' '}
                        {task.estMinutes} menit
                        {task.finishedAt && ` &middot; selesai ${formatDateTime(task.finishedAt)}`}
                      </div>

                      {/* Checklist */}
                      {task.checklist.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1">
                          {task.checklist.map((c) => (
                            <li key={c.id}>
                              <label className="flex cursor-pointer items-start gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={c.done}
                                  onChange={() => toggleChecklist(task.id, c.id)}
                                  className="mt-0.5"
                                />
                                <span className={c.done ? 'text-slate-400 line-through' : 'text-slate-700'}>
                                  {c.label}
                                  {c.isMandatory && <span className="ml-1 text-[10px] text-red-500">*wajib</span>}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}

                      {task.blockedReason && (
                        <div className="mt-2 rounded bg-orange-50 px-2 py-1 text-[11px] text-orange-800">
                          Terkunci: {task.blockedReason}
                        </div>
                      )}

                      {/* Technician actions */}
                      {(task.status === 'PENDING' || task.status === 'ASSIGNED') && canExecuteTask && (
                        <button
                          onClick={() => startTask(task.id)}
                          className="mt-2 rounded bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                        >
                          {task.status === 'PENDING' ? 'Mulai' : 'Lanjutkan'}
                        </button>
                      )}
                      {isQc && task.status === 'PENDING' && wo.status === 'QC' && canQcDecide && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() =>
                              updateWorkOrderTask(wo.id, task.id, {
                                status: 'DONE',
                                finishedAt: new Date().toISOString(),
                                qcResult: 'PASS',
                              })
                            }
                            className="rounded bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            QC: Lolos
                          </button>
                          <button
                            onClick={() =>
                              updateWorkOrderTask(wo.id, task.id, {
                                status: 'QC_REJECTED',
                                qcResult: 'REJECT',
                                qcNotes: 'Tidak memenuhi standar mutu',
                              })
                            }
                            className="rounded bg-red-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                          >
                            QC: Tolak
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Photos */}
          {wo.photos.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">Bukti Foto</h2>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {wo.photos.map((p) => (
                  <figure key={p.id} className="overflow-hidden rounded border border-slate-200">
                    <img src={p.url} alt={p.caption ?? p.kind} className="h-32 w-full object-cover" />
                    <figcaption className="bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                      {p.caption ?? p.kind}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: financials, transitions, part usage, payment */}
        <div className="flex flex-col gap-3">
          {/* Actions */}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nextStatuses.map((s) => (
                <button
                  key={s}
                  onClick={() => doTransition(s)}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                    s === 'CANCELLED' || s === 'REWORK'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : s === 'READY'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  {TRANSITION_LABEL[s] ?? s}
                </button>
              ))}
              {nextStatuses.length === 0 && (
                <span className="text-[11px] text-slate-400">Tidak ada aksi tersedia (terminal).</span>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Item</h2>
            <ul className="mt-2 flex flex-col gap-1.5">
              {wo.items.map((it) => (
                <li key={it.id} className="flex items-start justify-between text-xs">
                  <span className="text-slate-700">
                    {it.serviceNameSnap}
                    <span className="ml-1 text-slate-400">
                      {it.quantity} {it.unit} &times; {formatRupiah(it.unitPrice)}
                    </span>
                  </span>
                  <span className="tabular-nums font-medium">{formatRupiah(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm">
              <span className="font-medium">Total Tagihan</span>
              <span className="font-semibold tabular-nums text-blue-700">{formatRupiah(wo.grandTotal)}</span>
            </div>
          </div>

          {/* Job costing (Supervisor/Owner only per RBAC) */}
          {canSeeFinancials && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Job Costing (internal)
              </h2>
              <dl className="mt-2 flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Pendapatan bersih</dt>
                  <dd className="tabular-nums">{formatRupiah(cost.revenue)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Biaya bahan/part</dt>
                  <dd className="tabular-nums text-red-600">-{formatRupiah(cost.partsCost)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Komisi teknisi</dt>
                  <dd className="tabular-nums text-red-600">-{formatRupiah(cost.laborCost)}</dd>
                </div>
                <div className="mt-1 flex justify-between border-t border-slate-300 pt-1.5 text-sm">
                  <dt className="font-semibold">Margin kotor</dt>
                  <dd
                    className={`font-semibold tabular-nums ${cost.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                  >
                    {formatRupiah(cost.grossMargin)} ({cost.marginPct}%)
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Part usage */}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pemakaian Bahan
            </h2>
            <ul className="mt-2 flex flex-col gap-1 text-xs">
              {wo.partUsages.length === 0 && (
                <li className="text-slate-400">Belum ada bahan tercatat.</li>
              )}
              {wo.partUsages.map((u) => (
                <li key={u.id} className="flex items-center justify-between">
                  <span className="text-slate-700">{u.partName}</span>
                  <span className="tabular-nums text-slate-600">
                    {u.qty} &times; {formatRupiah(u.unitCostSnap)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-1.5">
              <select
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]"
              >
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (sisa {p.stockQty})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                value={partQty}
                onChange={(e) => setPartQty(parseFloat(e.target.value) || 0)}
                className="w-16 rounded border border-slate-300 px-2 py-1 text-[11px]"
              />
              <button
                onClick={() => partId && partQty > 0 && addPartUsage(wo.id, partId, partQty)}
                className="rounded bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
              >
                Pakai
              </button>
            </div>          </div>

          {/* Payment */}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pembayaran</h2>
            {wo.payments.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {wo.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="text-slate-600">
                      {p.method} &middot; {formatDateTime(p.paidAt)}
                    </span>
                    <span className="tabular-nums font-medium">{formatRupiah(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-slate-600">Terbayar</span>
              <span className={`tabular-nums font-semibold ${paid >= wo.grandTotal ? 'text-emerald-600' : 'text-amber-600'}`}>
                {formatRupiah(paid)} / {formatRupiah(wo.grandTotal)}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5">
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                className="rounded border border-slate-300 px-2 py-1 text-[11px]"
              >
                <option value="CASH">Tunai</option>
                <option value="QRIS">QRIS</option>
                <option value="TRANSFER">Transfer</option>
                <option value="CARD">Kartu</option>
                <option value="PREPAID_BALANCE">Saldo</option>
              </select>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                placeholder="Jumlah"
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]"
              />
              <button
                onClick={() => payAmount > 0 && recordPayment(wo.id, payMethod, payAmount)}
                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
              >
                Bayar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}