import { useState } from 'react';
import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader, SearchInput, EmptyState, StatCard } from '../layout/PageHeader';
import { formatRupiah, formatActor } from '../../utils/formatters';
import { can, ROLE_LABEL, type Role } from '../../services/domainEngine';
import type { PrStatus, PurchaseOrder, PurchaseRequest } from '../../types/domain';

const STATUS_LABEL: Record<PrStatus, string> = {
  DRAFT: 'Draf',
  SUBMITTED: 'Diajukan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  PO_CREATED: 'PO Terbuat',
};
const STATUS_TONE: Record<PrStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-300',
  SUBMITTED: 'bg-sky-50 text-sky-700 border-sky-300',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  REJECTED: 'bg-red-50 text-red-700 border-red-300',
  PO_CREATED: 'bg-violet-50 text-violet-700 border-violet-300',
};

function Badge({ status }: { status: PrStatus }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const PO_DERIVED_BADGE: Record<string, { label: string; tone: string }> = {
  PAID: { label: 'PO Lunas', tone: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  PARTIALLY_PAID: { label: 'PO Dibayar Sebagian', tone: 'bg-amber-50 text-amber-700 border-amber-300' },
  CANCELLED: { label: 'PO Dibatalkan', tone: 'bg-red-50 text-red-700 border-red-300' },
};

function PrStatusBadge({ pr, pos }: { pr: PurchaseRequest; pos: PurchaseOrder[] }) {
  if (pr.status !== 'PO_CREATED') return <Badge status={pr.status} />;
  const po = pos.find((p) => p.purchaseRequestId === pr.id);
  if (!po) return <Badge status={pr.status} />;
  const derived =
    po.status === 'CANCELLED'
      ? PO_DERIVED_BADGE.CANCELLED
      : po.paymentStatus !== 'UNPAID'
        ? PO_DERIVED_BADGE[po.paymentStatus]
        : undefined;
  if (!derived) return <Badge status={pr.status} />;
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${derived.tone}`}>
      {derived.label}
    </span>
  );
}

function ActorCell({ userId, users }: { userId?: string; users: { id: string; fullName: string; role: Role }[] }) {
  const actor = formatActor(userId, users);
  if (!actor) return <span className="text-slate-400">-</span>;
  const roleLabel = ROLE_LABEL[actor.role as Role] ?? actor.role;
  return (
    <div className="leading-tight">
      <div className="font-medium text-slate-800">{actor.name}</div>
      <span className="inline-block rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
        {roleLabel}
      </span>
    </div>
  );
}

export function PurchaseRequestsView() {
  const { purchaseRequests, submitPr, reviewPr, createPo, parts, currentUser, purchaseOrders } = useErpState();
  const { users } = useStaticData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const role = currentUser.role;
  const canSubmit = can(role, 'pr:submit');
  const canReview = can(role, 'pr:review');
  const canCreatePo = can(role, 'po:create');

  const filtered = purchaseRequests
    .filter((pr) => statusFilter === 'all' || pr.status === statusFilter)
    .filter(
      (pr) =>
        search === '' ||
        pr.prNo.toLowerCase().includes(search.toLowerCase()) ||
        pr.triggerNote?.toLowerCase().includes(search.toLowerCase())
    )
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Purchase Request (PR)"
        subtitle="Permohonan pengadaan internal: otomatis dari reorder point atau manual oleh Staff Gudang."
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari nomor PR / catatan..." />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Status:</span>
              <div className="inline-flex rounded-md border border-slate-300 bg-white overflow-hidden">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setStatusFilter('SUBMITTED')}
                  className={`px-3 py-1 text-xs font-medium transition-colors border-l border-slate-300 ${
                    statusFilter === 'SUBMITTED'
                      ? 'bg-sky-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Diajukan
                </button>
                <button
                  onClick={() => setStatusFilter('APPROVED')}
                  className={`px-3 py-1 text-xs font-medium transition-colors border-l border-slate-300 ${
                    statusFilter === 'APPROVED'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Disetujui
                </button>
                <button
                  onClick={() => setStatusFilter('PO_CREATED')}
                  className={`px-3 py-1 text-xs font-medium transition-colors border-l border-slate-300 ${
                    statusFilter === 'PO_CREATED'
                      ? 'bg-violet-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  PO Terbuat
                </button>
              </div>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
        <StatCard label="Total PR" value={String(purchaseRequests.length)} />
        <StatCard label="Menunggu Persetujuan" value={String(purchaseRequests.filter((p) => p.status === 'SUBMITTED').length)} tone="warn" />
        <StatCard label="Disetujui" value={String(purchaseRequests.filter((p) => p.status === 'APPROVED').length)} tone="good" />
        <StatCard label="PO Terbuat" value={String(purchaseRequests.filter((p) => p.status === 'PO_CREATED').length)} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState message="Tidak ada PR yang cocok." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-2.5">No. PR</th>
                  <th className="p-2.5">Cabang</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Otomatis</th>
                  <th className="p-2.5">Est. Total</th>
                  <th className="p-2.5">Diajukan Oleh</th>
                  <th className="p-2.5">Disetujui Oleh</th>
                  <th className="p-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((pr) => (
                  <tr key={pr.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono text-xs font-semibold text-blue-700">{pr.prNo}</td>
                    <td className="p-2.5 text-slate-600">{pr.branchId}</td>
                    <td className="p-2.5"><PrStatusBadge pr={pr} pos={purchaseOrders} /></td>
                    <td className="p-2.5 text-center">
                      {pr.isAutoGenerated ? (
                        <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Auto</span>
                      ) : (
                        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Manual</span>
                      )}
                    </td>
                    <td className="p-2.5 tabular-nums text-slate-800">
                      <div>{formatRupiah(pr.totalEstimate)}</div>
                      {pr.totalEstimate >= 5_000_000 && (
                        <span className="inline-block rounded bg-purple-100 px-1.5 py-0.2 text-[9px] font-semibold text-purple-800">
                          Nilai Tinggi (&gt;5jt)
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-600">
                      <ActorCell userId={pr.submittedBy} users={users} />
                      {pr.submittedAt && (
                        <div className="text-[10px] text-slate-400">
                          {new Date(pr.submittedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-600">
                      <ActorCell userId={pr.reviewedBy} users={users} />
                      {pr.reviewedAt && (
                        <div className="text-[10px] text-slate-400">
                          {new Date(pr.reviewedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1">
                        {pr.status === 'DRAFT' && canSubmit && (
                          <button onClick={() => submitPr(pr.id)} className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">
                            Ajukan
                          </button>
                        )}
                        {pr.status === 'SUBMITTED' && canReview && (
                          <>
                            <button onClick={() => reviewPr(pr.id, 'APPROVED')} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700">
                              Setujui
                            </button>
                            <button onClick={() => reviewPr(pr.id, 'REJECTED')} className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700">
                              Tolak
                            </button>
                          </>
                        )}
                        {pr.status === 'APPROVED' && canCreatePo && (
                          <button
                            onClick={() =>
                              createPo({
                                branchId: pr.branchId,
                                supplierId: parts.find((x) => x.id === pr.items[0]?.partId)?.defaultSupplierId ?? 'sup-1',
                                purchaseRequestId: pr.id,
                                priority: pr.priority,
                                notes: `Dari ${pr.prNo}`,
                                items: pr.items
                                  .map((i) => ({
                                    partId: i.partId,
                                    qtyOrdered: i.qtyOrdered > 0 ? i.qtyOrdered : i.qtyRequested,
                                    unitCost: i.estUnitCost,
                                  })),
                              })
                            }
                            className="rounded bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-violet-700"
                          >
                            Buat PO
                          </button>
                        )}
                        {pr.status === 'REJECTED' && (
                          <span className="text-[10px] text-red-600">Ditolak: {pr.reviewNote ?? '-'}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}