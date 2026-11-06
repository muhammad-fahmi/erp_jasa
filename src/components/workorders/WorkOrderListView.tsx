import { useState } from 'react';
import { useErpState } from '../../context/ErpContext';
import { PageHeader, SearchInput, EmptyState, StatCard } from '../layout/PageHeader';
import { WoStatusBadge } from '../layout/StatusBadges';
import { formatRupiah, formatDateTime, slaCountdown } from '../../utils/formatters';

export function WorkOrderListView({ onOpenWo }: { onOpenWo: (id: string) => void }) {
  const { workOrders } = useErpState();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = workOrders
    .filter((w) => statusFilter === 'all' || w.status === statusFilter)
    .filter(
      (w) =>
        search === '' ||
        w.woNo.toLowerCase().includes(search.toLowerCase()) ||
        w.customerName.toLowerCase().includes(search.toLowerCase()) ||
        w.customerPhone?.includes(search)
    )
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Daftar Work Order"
        subtitle="Semua tiket kerja dengan filter dan pencarian cepat."
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari WO, nama, nomor HP..." />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value="all">Semua Status</option>
              <option value="DRAFT">Draf</option>
              <option value="QUEUED">Antrean</option>
              <option value="IN_PROGRESS">Dikerjakan</option>
              <option value="ON_HOLD">Ditahan</option>
              <option value="QC">QC</option>
              <option value="REWORK">Perbaikan</option>
              <option value="READY">Siap</option>
              <option value="HANDED_OVER">Diserahterima</option>
              <option value="CLOSED">Selesai</option>
              <option value="CANCELLED">Batal</option>
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5 mb-3">
        <StatCard label="Total" value={String(workOrders.length)} />
        <StatCard
          label="Aktif"
          value={String(workOrders.filter((w) => !['CLOSED', 'CANCELLED'].includes(w.status)).length)}
        />
        <StatCard
          label="Terlambat"
          value={String(
            workOrders.filter((w) => new Date(w.promisedAt).getTime() < Date.now() && !['CLOSED', 'CANCELLED'].includes(w.status)).length
          )}
          tone="bad"
        />
        <StatCard label="Siap" value={String(workOrders.filter((w) => w.status === 'READY').length)} tone="good" />
        <StatCard label="QC" value={String(workOrders.filter((w) => w.status === 'QC').length)} tone="warn" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState message="Tidak ada Work Order yang cocok dengan filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-2">WO No</th>
                  <th className="p-2">Pelanggan</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">SLA</th>
                  <th className="p-2">Total</th>
                  <th className="p-2">Dibuat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((wo) => {
                  const sla = slaCountdown(wo.promisedAt);
                  return (
                    <tr key={wo.id} className="hover:bg-slate-50">
                      <td className="p-2">
                        <button
                          onClick={() => onOpenWo(wo.id)}
                          className="font-mono font-semibold text-blue-700 hover:underline"
                        >
                          {wo.woNo}
                        </button>
                      </td>
                      <td className="p-2">
                        <div className="font-medium text-slate-800">{wo.customerName}</div>
                        <div className="text-[11px] text-slate-500">
                          {wo.items.map((i) => i.serviceNameSnap).join(', ')}
                        </div>
                      </td>
                      <td className="p-2">
                        <WoStatusBadge status={wo.status} />
                      </td>
                      <td className="p-2">
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${
                            sla.tone === 'late' ? 'text-red-600' : sla.tone === 'warn' ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {sla.label}
                        </span>
                      </td>
                      <td className="p-2 tabular-nums font-medium text-slate-800">
                        {formatRupiah(wo.grandTotal)}
                      </td>
                      <td className="p-2 text-[11px] text-slate-500">
                        {formatDateTime(wo.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}