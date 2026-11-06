import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader, StatCard } from '../layout/PageHeader';
import { WoStatusBadge } from '../layout/StatusBadges';
import { formatRupiah, formatDateTime } from '../../utils/formatters';

export function DashboardView({ onOpenWo }: { onOpenWo: (id: string) => void }) {
  const { workOrders, parts } = useErpState();
  const { subscriptions } = useStaticData();

  const open = workOrders.filter((w) => !['CLOSED', 'CANCELLED', 'HANDED_OVER'].includes(w.status));
  const overdue = open.filter((w) => new Date(w.promisedAt).getTime() < Date.now());
  const readyCount = workOrders.filter((w) => w.status === 'READY').length;
  const qcCount = workOrders.filter((w) => w.status === 'QC').length;
  const todayRevenue = workOrders
    .filter((w) => w.completedAt && new Date(w.completedAt).toDateString() === new Date().toDateString())
    .reduce((s, w) => s + w.grandTotal, 0);
  const lowStock = parts.filter((p) => p.stockQty <= (p.reorderPoint ?? p.minStock));
  const activeSubs = subscriptions.filter((s) => s.isActive);
  const rework = workOrders.filter((w) => w.status === 'REWORK');

  const attention = [...overdue, ...rework].slice(0, 8);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Dashboard Operasional"
        subtitle="Kinerja hari ini: SLA, antrean, mutu, dan stok. Pantau yang merah lebih dulu."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="WO Aktif" value={String(open.length)} hint="Di luar Closed/Batal" />
        <StatCard
          label="Terlambat SLA"
          value={String(overdue.length)}
          hint="Butuh aksi sekarang"
          tone={overdue.length > 0 ? 'bad' : 'good'}
        />
        <StatCard label="Siap Diambil" value={String(readyCount)} hint="Menunggu pelanggan" tone={readyCount > 0 ? 'good' : 'default'} />
        <StatCard label="Antrean QC" value={String(qcCount)} hint="Belum diinspeksi" tone={qcCount > 0 ? 'warn' : 'default'} />
        <StatCard label="Omzet Hari Ini" value={formatRupiah(todayRevenue)} hint="WO yang selesai hari ini" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800">Butuh Perhatian</h2>
          {attention.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Semua WO berjalan sesuai jadwal. Tidak ada yang terlambat atau ditolak QC.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {attention.map((wo) => (
                <li key={wo.id}>
                  <button
                    onClick={() => onOpenWo(wo.id)}
                    className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-slate-50"
                  >
                    <div>
                      <span className="font-mono text-xs font-semibold text-blue-700">{wo.woNo}</span>
                      <span className="ml-2 text-sm text-slate-700">{wo.customerName}</span>
                      <div className="text-[11px] text-slate-500">
                        Janji: {formatDateTime(wo.promisedAt)} &middot; {formatRupiah(wo.grandTotal)}
                      </div>
                    </div>
                    <WoStatusBadge status={wo.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Stok Menipis</h2>
            {lowStock.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">Stok aman.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">{p.name}</span>
                    <span className="tabular-nums font-semibold text-red-600">
                      {p.stockQty} {p.unit} (min {p.minStock})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Langganan Aktif</h2>
            {activeSubs.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">Belum ada paket berulang.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {activeSubs.map((s) => (
                  <li key={s.id} className="text-xs text-slate-700">
                    <span className="font-medium">{s.code}</span> &middot; {s.customerName} &middot;{' '}
                    {s.quantity} kg &middot; next: {s.nextRunDate}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
