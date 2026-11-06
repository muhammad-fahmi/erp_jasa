import { useState } from 'react';
import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader, SearchInput, EmptyState, StatCard } from '../layout/PageHeader';
import { formatRupiah, formatActor } from '../../utils/formatters';
import { can, ROLE_LABEL, type Role } from '../../services/domainEngine';
import type { PoStatus, SupplierPaymentStatus } from '../../types/domain';

const STATUS_LABEL: Record<PoStatus, string> = {
  DRAFT: 'Draf',
  ORDERED: 'Dipesan',
  PARTIALLY_RECEIVED: 'Sebagian',
  RECEIVED: 'Diterima',
  CANCELLED: 'Dibatalkan',
};
const STATUS_TONE: Record<PoStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-300',
  ORDERED: 'bg-sky-50 text-sky-700 border-sky-300',
  PARTIALLY_RECEIVED: 'bg-amber-50 text-amber-700 border-amber-300',
  RECEIVED: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  CANCELLED: 'bg-red-50 text-red-700 border-red-300',
};
const PAY_LABEL: Record<SupplierPaymentStatus, string> = {
  UNPAID: 'Belum Bayar',
  PARTIALLY_PAID: 'Sebagian',
  PAID: 'Lunas',
};
const PAY_TONE: Record<SupplierPaymentStatus, string> = {
  UNPAID: 'bg-red-50 text-red-700 border-red-300',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 border-amber-300',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-300',
};

function Badge({ status, tones, labels }: { status: string; tones: Record<string, string>; labels: Record<string, string> }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${tones[status]}`}>
      {labels[status]}
    </span>
  );
}

function ActorCell({ userId, users }: { userId?: string; users: { id: string; fullName: string; role: Role }[] }) {
  const actor = formatActor(userId, users);
  if (!actor) return <span className="text-slate-400">-</span>;
  return (
    <div className="leading-tight">
      <div className="font-medium text-slate-800">{actor.name}</div>
      <span className="inline-block rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
        {ROLE_LABEL[actor.role as Role] ?? actor.role}
      </span>
    </div>
  );
}

export function PurchaseOrdersView() {
  const { purchaseOrders, issuePo, cancelPo, createGrn, recordSupplierPayment, currentUser } = useErpState();
  const { users } = useStaticData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const role = currentUser.role;
  const canIssue = can(role, 'po:issue');
  const canCancel = can(role, 'po:cancel');
  const canReceiveGrn = can(role, 'grn:receive');
  const canPay = can(role, 'supplier:payment');

  const filtered = purchaseOrders
    .filter((po) => statusFilter === 'all' || po.status === statusFilter)
    .filter(
      (po) =>
        search === '' ||
        po.poNo.toLowerCase().includes(search.toLowerCase()) ||
        po.supplierName.toLowerCase().includes(search.toLowerCase())
    )
    .slice()
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Purchase Order (PO)"
        subtitle="Pesanan ke pemasok: dari draft → dikirim → diterima (parsial/penuh) → tagihan AP."
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari PO / pemasok..." />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
              <option value="all">Semua Status</option>
              <option value="DRAFT">Draf</option>
              <option value="ORDERED">Dipesan</option>
              <option value="PARTIALLY_RECEIVED">Sebagian Diterima</option>
              <option value="RECEIVED">Diterima Penuh</option>
              <option value="CANCELLED">Dibatalkan</option>
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 mb-4">
        <StatCard label="Total PO" value={String(purchaseOrders.length)} />
        <StatCard label="Dipesan" value={String(purchaseOrders.filter((p) => p.status === 'ORDERED').length)} tone="warn" />
        <StatCard label="Sebagian" value={String(purchaseOrders.filter((p) => p.status === 'PARTIALLY_RECEIVED').length)} tone="warn" />
        <StatCard label="Diterima" value={String(purchaseOrders.filter((p) => p.status === 'RECEIVED').length)} tone="good" />
        <StatCard label="Belum Bayar" value={String(purchaseOrders.filter((p) => p.paymentStatus === 'UNPAID').length)} tone="bad" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState message="Tidak ada PO yang cocok." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-2.5">No. PO</th>
                  <th className="p-2.5">Pemasok</th>
                  <th className="p-2.5">Status PO</th>
                  <th className="p-2.5">Total</th>
                  <th className="p-2.5">Status Bayar</th>
                  <th className="p-2.5">Jatuh Tempo</th>
                  <th className="p-2.5">Diterbitkan Oleh</th>
                  <th className="p-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono text-xs font-semibold text-blue-700">{po.poNo}</td>
                    <td className="p-2.5">
                      <div className="font-medium text-slate-800">{po.supplierName}</div>
                      <div className="text-[11px] text-slate-500">{po.branchId}</div>
                    </td>
                    <td className="p-2.5">
                      <Badge status={po.status} tones={STATUS_TONE} labels={STATUS_LABEL} />
                    </td>
                    <td className="p-2.5 tabular-nums font-medium text-slate-800">{formatRupiah(po.totalAmount)}</td>
                    <td className="p-2.5">
                      <Badge status={po.paymentStatus} tones={PAY_TONE} labels={PAY_LABEL} />
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-600">
                      {po.dueDate ? new Date(po.dueDate).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '-'}
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-600">
                      <ActorCell userId={po.issuedBy} users={users} />
                      {po.issuedAt && (
                        <div className="text-[10px] text-slate-400">
                          {new Date(po.issuedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1">
                        {po.status === 'DRAFT' && (canIssue || canCancel) && (
                          <>
                            {canIssue && (
                              <button onClick={() => issuePo(po.id)} className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">
                                Kirim PO
                              </button>
                            )}
                            {canCancel && (
                              <button onClick={() => cancelPo(po.id)} className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700">
                                Batal
                              </button>
                            )}
                          </>
                        )}
                        {po.status === 'ORDERED' && canReceiveGrn && (
                          <button
                            onClick={() =>
                              createGrn(po.id, { partId: '', qtyAccepted: 0, qtyRejected: 0, unitCost: 0 })
                            }
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            Terima (GRN)
                          </button>
                        )}
                        {po.status === 'PARTIALLY_RECEIVED' && canReceiveGrn && (
                          <button
                            onClick={() =>
                              createGrn(po.id, { partId: '', qtyAccepted: 0, qtyRejected: 0, unitCost: 0 })
                            }
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            Terima Sisa
                          </button>
                        )}
                        {po.paymentStatus !== 'PAID' && po.status === 'RECEIVED' && canPay && (
                          <button
                            onClick={() => {
                              const amt = prompt('Jumlah pembayaran:', String(po.totalAmount));
                              if (amt && !isNaN(Number(amt))) recordSupplierPayment(po.id, Number(amt), 'TRANSFER');
                            }}
                            className="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                          >
                            Bayar
                          </button>
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