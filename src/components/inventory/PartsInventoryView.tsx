import { useState } from 'react';
import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader, StatCard, SearchInput, EmptyState } from '../layout/PageHeader';
import { formatRupiah, formatActor } from '../../utils/formatters';
import { can, ROLE_LABEL, type Role } from '../../services/domainEngine';

export function PartsInventoryView() {
  const { parts, stockMovements, adjustStock, currentUser } = useErpState();
  const { users } = useStaticData();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'catalog' | 'movements'>('catalog');

  const canAdjust = can(currentUser.role, 'stock:adjust');

  const categories = ['all', ...new Set(parts.map((p) => p.category))];

  const filtered = parts
    .filter((p) => categoryFilter === 'all' || p.category === categoryFilter)
    .filter(
      (p) =>
        search === '' ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase())
    );

  const lowStock = parts.filter((p) => p.stockQty <= (p.reorderPoint ?? p.minStock));
  const totalValuation = parts.reduce((sum, p) => sum + p.stockQty * p.unitCost, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Bahan, Suku Cadang & Kartu Stok"
        subtitle="Tracking pemakaian bahan servis, batas reorder point, dan buku besar mutasi fisik."
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs">
              <button
                onClick={() => setActiveTab('catalog')}
                className={`px-3 py-1 rounded ${activeTab === 'catalog' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600'}`}
              >
                Katalog Bahan
              </button>
              <button
                onClick={() => setActiveTab('movements')}
                className={`px-3 py-1 rounded ${activeTab === 'movements' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600'}`}
              >
                Kartu Stok (Ledger)
              </button>
            </div>
            {activeTab === 'catalog' && (
              <>
                <SearchInput value={search} onChange={setSearch} placeholder="Cari bahan/part..." />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c === 'all' ? 'Semua Kategori' : c}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
        <StatCard label="Total Item" value={String(parts.length)} hint="SKU bahan aktif" />
        <StatCard
          label="Perlu Reorder"
          value={String(lowStock.length)}
          hint="Di bawah reorder point"
          tone={lowStock.length > 0 ? 'bad' : 'good'}
        />
        <StatCard label="Nilai Stok" value={formatRupiah(totalValuation)} hint="Valuasi rata-rata bergerak" />
        <StatCard label="Mutasi Ledger" value={String(stockMovements.length)} hint="Transaksi tercatat" />
      </div>

      {activeTab === 'catalog' ? (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState message="Tidak ada bahan yang sesuai filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-2.5">Kode</th>
                    <th className="p-2.5">Nama Item</th>
                    <th className="p-2.5">Kategori</th>
                    <th className="p-2.5 text-right">Stok Fisik</th>
                    <th className="p-2.5 text-right">Reorder Point</th>
                    <th className="p-2.5 text-right">Harga Pokok Rata-rata</th>
                    <th className="p-2.5 text-right">Nilai Total</th>
                    <th className="p-2.5 text-center">Status</th>
                    <th className="p-2.5 text-center">Opname Cepat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((p) => {
                    const threshold = p.reorderPoint ?? p.minStock;
                    const isLow = p.stockQty <= threshold;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono text-xs text-blue-700 font-semibold">{p.code}</td>
                        <td className="p-2.5 font-medium text-slate-800">{p.name}</td>
                        <td className="p-2.5 text-xs text-slate-500">{p.category}</td>
                        <td className="p-2.5 text-right tabular-nums font-semibold text-slate-800">
                          {p.stockQty} <span className="text-xs font-normal text-slate-500">{p.unit}</span>
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-xs text-slate-500">
                          {threshold} {p.unit}
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-slate-700">
                          {formatRupiah(p.unitCost)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums font-medium text-slate-900">
                          {formatRupiah(p.stockQty * p.unitCost)}
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${
                              isLow
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {isLow ? 'Perlu Restock' : 'Aman'}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          {canAdjust ? (
                            <button
                              onClick={() => {
                                const input = prompt(`Sesuaikan stok untuk ${p.name} (masukkan angka delta, misal +5 atau -2):`);
                                if (input) {
                                  const delta = Number(input);
                                  if (!isNaN(delta) && delta !== 0) {
                                    adjustStock(p.id, 'br-jkt', delta);
                                  }
                                }
                              }}
                              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                            >
                              Opname
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-2.5">Waktu</th>
                  <th className="p-2.5">Item Barang</th>
                  <th className="p-2.5">Tipe Gerakan</th>
                  <th className="p-2.5 text-right">Perubahan Qty</th>
                  <th className="p-2.5 text-right">Sisa Stok</th>
                  <th className="p-2.5">Ref / Catatan</th>
                  <th className="p-2.5">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockMovements.map((sm) => (
                  <tr key={sm.id} className="hover:bg-slate-50">
                    <td className="p-2.5 text-[11px] text-slate-500">
                      {new Date(sm.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="p-2.5 font-medium text-slate-800">{sm.partName}</td>
                    <td className="p-2.5">
                      <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700">
                        {sm.type}
                      </span>
                    </td>
                    <td className={`p-2.5 text-right tabular-nums font-semibold ${sm.qtyDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {sm.qtyDelta > 0 ? `+${sm.qtyDelta}` : sm.qtyDelta}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-slate-800">{sm.qtyAfter}</td>
                    <td className="p-2.5 text-xs text-slate-600">
                      {sm.refType && <strong className="mr-1">{sm.refType}:</strong>}
                      {sm.notes ?? '-'}
                    </td>
                    <td className="p-2.5 text-xs text-slate-500">
                      {(() => {
                        const actor = formatActor(sm.createdBy, users);
                        if (!actor) return sm.createdBy;
                        return (
                          <div>
                            <span className="font-medium text-slate-700">{actor.name}</span>
                            <span className="ml-1 text-[10px] text-slate-400">
                              ({ROLE_LABEL[actor.role as Role] ?? actor.role})
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}