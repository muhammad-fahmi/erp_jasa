import { useState } from 'react';
import { useStaticData } from '../../context/ErpContext';
import { PageHeader, StatCard, SearchInput, EmptyState } from '../layout/PageHeader';
import { formatDate } from '../../utils/formatters';

const CADENCE_LABELS: Record<string, string> = {
  WEEKLY: 'Mingguan',
  BIWEEKLY: '2 Mingguan',
  MONTHLY: 'Bulanan',
  CUSTOM_DAYS: 'Khusus',
};

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function SubscriptionsView() {
  const { subscriptions, services, customers } = useStaticData();
  const [search, setSearch] = useState('');

  const filtered = subscriptions.filter(
    (s) =>
      search === '' ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.customerName.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = subscriptions.filter((s) => s.isActive).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Paket Berulang & Kontrak"
        subtitle="Manajemen langganan reguler B2B / B2C (laundry kiloan kantor, servis armada)."
        actions={
          <SearchInput value={search} onChange={setSearch} placeholder="Cari kode/pelanggan..." />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total Kontrak" value={String(subscriptions.length)} hint="Terdaftar di sistem" />
        <StatCard label="Kontrak Aktif" value={String(activeCount)} hint="Otomatis terbit WO" tone="good" />
        <StatCard label="Jadwal Mendatang" value={filtered[0]?.nextRunDate ? formatDate(filtered[0].nextRunDate) : '-'} hint="Run batch berikutnya" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState message="Tidak ada data langganan yang ditemukan." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-2.5">No. Kontrak</th>
                  <th className="p-2.5">Pelanggan</th>
                  <th className="p-2.5">Layanan</th>
                  <th className="p-2.5">Siklus</th>
                  <th className="p-2.5">Hari Jemput / Antar</th>
                  <th className="p-2.5">Kuota / Batch</th>
                  <th className="p-2.5">Jadwal Berikut</th>
                  <th className="p-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((sub) => {
                  const svc = services.find((s) => s.id === sub.serviceId);
                  const cust = customers.find((c) => c.id === sub.customerId);
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono text-xs font-semibold text-blue-700">{sub.code}</td>
                      <td className="p-2.5">
                        <div className="font-medium text-slate-800">{sub.customerName}</div>
                        {cust?.phone && <div className="text-[11px] text-slate-500">{cust.phone}</div>}
                      </td>
                      <td className="p-2.5 text-slate-700">{svc?.name ?? sub.serviceId}</td>
                      <td className="p-2.5 text-slate-600">{CADENCE_LABELS[sub.cadence] ?? sub.cadence}</td>
                      <td className="p-2.5 text-slate-600">
                        {DAY_NAMES[sub.pickupDay]} &rarr; {DAY_NAMES[sub.deliveryDay]}
                      </td>
                      <td className="p-2.5 tabular-nums font-semibold text-slate-800">
                        {sub.quantity} {svc?.baseUnit ?? 'unit'}
                      </td>
                      <td className="p-2.5 tabular-nums text-slate-700 font-medium">
                        {formatDate(sub.nextRunDate)}
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${
                            sub.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {sub.isActive ? 'Aktif' : 'Non-aktif'}
                        </span>
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