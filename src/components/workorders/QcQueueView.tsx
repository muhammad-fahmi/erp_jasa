import { useState } from 'react';
import { useErpState } from '../../context/ErpContext';
import { PageHeader, EmptyState } from '../layout/PageHeader';
import { WorkOrderDetail } from './WorkOrderDetail';
import { formatDateTime } from '../../utils/formatters';
import { can } from '../../services/domainEngine';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';

export function QcQueueView({ onOpenWo }: { onOpenWo: (id: string) => void }) {
  const { workOrders, currentUser } = useErpState();
  const [openId, setOpenId] = useState<string | null>(null);

  const canQcDecide = can(currentUser.role, 'qc:decide');

  if (openId) {
    return <WorkOrderDetail woId={openId} onClose={() => setOpenId(null)} />;
  }

  const waiting = workOrders.filter((w) => w.status === 'QC');
  const rework = workOrders.filter((w) => w.status === 'REWORK');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Antrean Quality Control"
        subtitle="Gerbang mutu wajib sebelum serah-terima. Tidak ada unit yang lolos tanpa tanda tangan QC."
      />

      {waiting.length === 0 && rework.length === 0 ? (
        <EmptyState message="Antrean QC kosong. Semua pekerjaan sudah lolos inspeksi." />
      ) : (
        <>
          {waiting.length > 0 && (
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <ShieldCheck size={15} className="text-violet-600" /> Menunggu Inspeksi ({waiting.length})
              </h2>
              <div className="flex flex-col gap-2">
                {waiting.map((wo) => (
                  <button
                    key={wo.id}
                    onClick={() => onOpenWo(wo.id)}
                    className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-white p-3 text-left hover:border-violet-400 hover:shadow-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-blue-700">{wo.woNo}</span>
                        <span className="text-sm font-medium text-slate-800">{wo.customerName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Janji: {formatDateTime(wo.promisedAt)} &middot; {wo.items.length} item
                      </div>
                    </div>
                    {canQcDecide ? (
                      <span className="shrink-0 rounded bg-violet-600 px-3 py-1 text-[11px] font-semibold text-white">
                        Periksa
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-400">
                        Hanya QC/Supervisor
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {rework.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                Dalam Proses Perbaikan ({rework.length})
              </h2>
              <div className="flex flex-col gap-2">
                {rework.map((wo) => (
                  <button
                    key={wo.id}
                    onClick={() => onOpenWo(wo.id)}
                    className="flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 p-3 text-left hover:border-red-400"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-red-700">{wo.woNo}</span>
                        <span className="text-sm font-medium text-slate-800">{wo.customerName}</span>
                      </div>
                      <div className="text-[11px] text-red-700">Ditolak QC, sedang dikembalikan ke teknisi.</div>
                    </div>
                    <CheckCircle2 size={16} className="shrink-0 text-red-500" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}