import { useState } from 'react';
import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader } from '../layout/PageHeader';
import { WoStatusBadge } from '../layout/StatusBadges';
import { formatRupiah, slaCountdown } from '../../utils/formatters';
import type { WorkOrder, WoStatus } from '../../types/domain';

const BOARD_COLUMNS: { key: WoStatus; label: string }[] = [
  { key: 'QUEUED', label: 'Antrean' },
  { key: 'IN_PROGRESS', label: 'Dikerjakan' },
  { key: 'ON_HOLD', label: 'Ditahan' },
  { key: 'QC', label: 'Menunggu QC' },
  { key: 'REWORK', label: 'Perbaikan' },
  { key: 'READY', label: 'Siap Diambil' },
];

export function JobBoardView({ onOpenWo }: { onOpenWo: (id: string) => void }) {
  const { workOrders } = useErpState();
  const { technicians, stations } = useStaticData();
  const [branchFilter, setBranchFilter] = useState('all');

  const filtered =
    branchFilter === 'all' ? workOrders : workOrders.filter((w) => w.branchId === branchFilter);

  function card(wo: WorkOrder) {
    const sla = slaCountdown(wo.promisedAt);
    const done = wo.tasks.filter((t) => t.status === 'DONE').length;
    const techNames = [
      ...new Set(
        wo.tasks
          .map((t) => technicians.find((x) => x.id === t.technicianId)?.fullName)
          .filter(Boolean)
      ),
    ];
    const slaColor =
      sla.tone === 'late' ? 'text-red-600' : sla.tone === 'warn' ? 'text-amber-600' : 'text-emerald-600';

    return (
      <button
        key={wo.id}
        onClick={() => onOpenWo(wo.id)}
        className="w-full rounded border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold text-blue-700">{wo.woNo}</span>
          <WoStatusBadge status={wo.status} />
        </div>
        <div className="mt-1 truncate text-[13px] font-medium text-slate-800">{wo.customerName}</div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">
          {wo.items.map((i) => i.serviceNameSnap).join(', ')}
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">
            Tahap {done}/{wo.tasks.length}
          </span>
          <span className={`font-semibold tabular-nums ${slaColor}`}>{sla.label}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {formatRupiah(wo.grandTotal)}
          {techNames.length > 0 && <span> &middot; {techNames.join(', ')}</span>}
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-slate-100">
          <div
            className="h-full rounded bg-blue-500"
            style={{ width: `${wo.tasks.length ? (done / wo.tasks.length) * 100 : 0}%` }}
          />
        </div>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Job Board"
        subtitle="Papan produksi real-time. Setiap kartu adalah satu WO; klik untuk membuka detail."
        actions={
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="all">Semua Cabang</option>
            <option value="br-jkt">Jakarta Selatan</option>
            <option value="br-bdg">Bandung Dago</option>
          </select>
        }
      />

      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map((col) => {
          const items = filtered.filter((w) => w.status === col.key);
          const stationLoad = new Set(
            filtered
              .filter((w) => w.status === col.key)
              .flatMap((w) => w.tasks.filter((t) => t.stationId).map((t) => t.stationId))
          );
          return (
            <div key={col.key} className="w-56 shrink-0">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {col.label}
                </span>
                <span className="rounded bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-700">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.length === 0 ? (
                  <div className="rounded border border-dashed border-slate-300 py-6 text-center text-[11px] text-slate-400">
                    Kosong
                  </div>
                ) : (
                  items.map(card)
                )}
              </div>
              {stationLoad.size > 0 && (
                <div className="mt-2 text-[10px] text-slate-400">
                  {stationLoad.size} stasiun terlibat
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded border border-slate-200 bg-white p-3">
        <h3 className="text-xs font-semibold text-slate-700">Beban Stations</h3>
        <div className="mt-2 flex flex-wrap gap-3">
          {stations.filter((s) => s.branchId === 'br-jkt').map((s) => {
            const active = workOrders
              .filter((w) => w.status === 'IN_PROGRESS')
              .flatMap((w) => w.tasks)
              .filter((t) => t.stationId === s.id && t.status === 'IN_PROGRESS').length;
            return (
              <div key={s.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5">
                <div className="text-[11px] font-medium text-slate-700">{s.name}</div>
                <div className="text-[10px] text-slate-500">
                  {active} aktif / kapasitas {s.parallelCapacity}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}