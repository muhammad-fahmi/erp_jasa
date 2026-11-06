import { useState } from 'react';
import { useErpState } from '../../context/ErpContext';
import { PageHeader, SearchInput, EmptyState, StatCard } from '../layout/PageHeader';

export function SuppliersView() {
  const { suppliers, createPo } = useErpState();
  const [search, setSearch] = useState('');

  const filtered = suppliers.filter(
    (s) =>
      search === '' ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Katalog Pemasok"
        subtitle="Master data pemasok suku cadang & bahan habis pakai."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Cari nama / kode pemasok..." />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 mb-4">
        <StatCard label="Total Pemasok" value={String(suppliers.length)} />
        <StatCard
          label="Aktif"
          value={String(suppliers.filter((s) => s.isActive).length)}
          tone="good"
        />
        <StatCard label="Lead Time Rata-rata" value={`${(suppliers.reduce((s, x) => s + x.leadTimeDays, 0) / suppliers.length).toFixed(1)} hari`} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState message="Tidak ada pemasok yang cocok." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-2.5">Kode</th>
                  <th className="p-2.5">Nama Pemasok</th>
                  <th className="p-2.5">Kontak / PIC</th>
                  <th className="p-2.5 text-center">Lead Time</th>
                  <th className="p-2.5 text-center">TOP</th>
                  <th className="p-2.5 text-center">Rating</th>
                  <th className="p-2.5 text-center">Status</th>
                  <th className="p-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono text-xs font-semibold text-blue-700">{sup.code}</td>
                    <td className="p-2.5 font-medium text-slate-800">{sup.name}</td>
                    <td className="p-2.5 text-slate-600 text-xs">
                      {sup.picName} &middot; {sup.phone}
                      {sup.email && <div>{sup.email}</div>}
                    </td>
                    <td className="p-2.5 text-center tabular-nums text-slate-700">{sup.leadTimeDays} hari</td>
                    <td className="p-2.5 text-center tabular-nums text-slate-700">{sup.termOfPayment} hari</td>
                    <td className="p-2.5 text-center">
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        {'★'.repeat(Math.round(sup.rating))}{'☆'.repeat(5 - Math.round(sup.rating))}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${sup.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {sup.isActive ? 'Aktif' : 'Non-aktif'}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <button
                        onClick={() => createPo({ branchId: 'br-jkt', supplierId: sup.id, priority: 3, items: [] })}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Buat PO
                      </button>
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