import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader, StatCard } from '../layout/PageHeader';
import { formatRupiah } from '../../utils/formatters';
import { calculateJobCost } from '../../services/domainEngine';

export function ReportsView() {
  const { workOrders } = useErpState();
  const { technicians } = useStaticData();

  const allCompletedTasks = workOrders.flatMap((w) => w.tasks.filter((t) => t.status === 'DONE'));

  const totalRevenue = workOrders.reduce((sum, w) => sum + (w.subtotal - w.discount), 0);
  const totalReceived = workOrders.reduce(
    (sum, w) => sum + w.payments.reduce((pSum, p) => pSum + p.amount, 0),
    0
  );

  let totalPartsCost = 0;
  let totalLaborCost = 0;
  for (const w of workOrders) {
    const cost = calculateJobCost(w, technicians);
    totalPartsCost += cost.partsCost;
    totalLaborCost += cost.laborCost;
  }

  const grossProfit = totalRevenue - totalPartsCost - totalLaborCost;
  const grossMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0';

  // SLA Performance
  const completedWithPromised = workOrders.filter((w) => w.completedAt);
  const onTimeCount = completedWithPromised.filter(
    (w) => new Date(w.completedAt!).getTime() <= new Date(w.promisedAt).getTime()
  ).length;
  const onTimeRate = completedWithPromised.length > 0
    ? Math.round((onTimeCount / completedWithPromised.length) * 100)
    : 100;

  // Technician performance breakdown
  const techReport = technicians.map((t) => {
    const doneTasks = allCompletedTasks.filter((task) => task.technicianId === t.id);
    const totalMinutes = doneTasks.reduce((sum, task) => sum + task.estMinutes, 0);

    let earnedComm = 0;
    for (const w of workOrders) {
      const hasMyTask = w.tasks.some((task) => task.technicianId === t.id && task.status === 'DONE');
      if (hasMyTask) {
        if (t.commissionMode === 'FLAT_PER_JOB') {
          earnedComm += t.commissionRate;
        } else if (t.commissionMode === 'PERCENTAGE_OF_REVENUE') {
          earnedComm += (w.grandTotal * t.commissionRate) / 100;
        } else {
          earnedComm += (totalMinutes / 60) * t.commissionRate;
        }
      }
    }

    return {
      id: t.id,
      name: t.fullName,
      code: t.code,
      skills: t.skills.join(', '),
      taskCount: doneTasks.length,
      estHours: (totalMinutes / 60).toFixed(1),
      commission: earnedComm,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Laporan & Job Costing"
        subtitle="Analisis laba kotor per pekerjaan, beban teknisi, dan kepatuhan SLA antrean."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Nilai WO" value={formatRupiah(totalRevenue)} hint="Gross booking" />
        <StatCard label="Kas Diterima" value={formatRupiah(totalReceived)} hint="Pembayaran masuk" tone="good" />
        <StatCard
          label="Laba Kotor"
          value={formatRupiah(grossProfit)}
          hint={`Margin: ${grossMarginPct}%`}
          tone={grossProfit >= 0 ? 'good' : 'bad'}
        />
        <StatCard
          label="Ketepatan SLA"
          value={`${onTimeRate}%`}
          hint={`${onTimeCount}/${completedWithPromised.length || 0} order tepat waktu`}
          tone={onTimeRate >= 80 ? 'good' : 'warn'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Cost Breakdown */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Struktur Beban Pokok (HPP Jasa)</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-600">Omzet Jasa</dt>
              <dd className="tabular-nums font-semibold text-slate-900">{formatRupiah(totalRevenue)}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-600">Pemakaian Bahan / Part (Suku Cadang)</dt>
              <dd className="tabular-nums text-red-600">-{formatRupiah(totalPartsCost)}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-600">Estimasi Komisi Tenaga Kerja / Teknisi</dt>
              <dd className="tabular-nums text-red-600">-{formatRupiah(totalLaborCost)}</dd>
            </div>
            <div className="flex justify-between pt-1">
              <dt className="font-semibold text-slate-800">Laba Kotor Operasional</dt>
              <dd className="tabular-nums font-bold text-blue-700 text-base">
                {formatRupiah(grossProfit)} ({grossMarginPct}%)
              </dd>
            </div>
          </dl>
        </div>

        {/* Technician Workload */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Beban Kerja & Komisi Teknisi</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase text-slate-500 font-semibold">
                <tr>
                  <th className="p-2">Teknisi</th>
                  <th className="p-2 text-center">Tugas Selesai</th>
                  <th className="p-2 text-right">Jam Kerja</th>
                  <th className="p-2 text-right">Hak Komisi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {techReport.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="p-2">
                      <div className="font-medium text-slate-800">{t.name}</div>
                      <div className="text-[10px] text-slate-400">{t.skills}</div>
                    </td>
                    <td className="p-2 text-center tabular-nums font-semibold">{t.taskCount}</td>
                    <td className="p-2 text-right tabular-nums text-slate-600">{t.estHours} jam</td>
                    <td className="p-2 text-right tabular-nums font-semibold text-emerald-700">
                      {formatRupiah(t.commission)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}