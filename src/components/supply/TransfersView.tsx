import { useState } from 'react';
import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader, EmptyState, StatCard } from '../layout/PageHeader';
import { formatActor } from '../../utils/formatters';
import { can, ROLE_LABEL, type Role } from '../../services/domainEngine';

export function TransfersView() {
  const { parts, stockTransfers, sendTransfer, receiveTransfer, currentUser } = useErpState();
  const { branches, users } = useStaticData();

  const role = currentUser.role;
  const canSend = can(role, 'stock:transfer');
  const canReceive = can(role, 'stock:transfer'); // receiving also parts/spv/owner

  const [partId, setPartId] = useState(parts[0]?.id ?? '');
  const [fromBranch, setFromBranch] = useState(branches[0]?.id ?? '');
  const [toBranch, setToBranch] = useState(branches[1]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!partId || !fromBranch || !toBranch || qty <= 0) return;
    try {
      sendTransfer(partId, fromBranch, toBranch, Number(qty), notes);
      setQty(1);
      setNotes('');
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Transfer Antar Cabang"
        subtitle="Mutasi persediaan antar cabang (Two-Step: Kirim / In-Transit → Terima)."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 mb-4">
        <StatCard label="Total Dokumen" value={String(stockTransfers.length)} />
        <StatCard label="Dalam Perjalanan" value={String(stockTransfers.filter((t) => t.status === 'IN_TRANSIT').length)} tone="warn" />
        <StatCard label="Selesai Diterima" value={String(stockTransfers.filter((t) => t.status === 'COMPLETED').length)} tone="good" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Form Kirim Transfer */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Buat Mutasi Baru</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pilih Item</label>
              <select
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white p-2 text-xs"
              >
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Sisa: {p.stockQty} {p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Dari Cabang</label>
                <select
                  value={fromBranch}
                  onChange={(e) => setFromBranch(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white p-2 text-xs"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tujuan Cabang</label>
                <select
                  value={toBranch}
                  onChange={(e) => setToBranch(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white p-2 text-xs"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} disabled={b.id === fromBranch}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Jumlah</label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-full rounded border border-slate-300 p-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Catatan</label>
              <input
                type="text"
                placeholder="Alasan transfer..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded border border-slate-300 p-2 text-xs"
              />
            </div>

{canSend ? (
              <button
                type="submit"
                className="w-full rounded bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Kirim Transfer
              </button>
            ) : (
              <div className="w-full rounded bg-slate-200 py-2 text-xs font-medium text-slate-500 text-center">
                Hanya Gudang/Supervisor yang dapat mengirim transfer
              </div>
            )}
          </form>
        </div>

        {/* Tabel Dokumen Transfer */}
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Daftar Dokumen Transfer</h2>
          {stockTransfers.length === 0 ? (
            <EmptyState message="Belum ada transfer antar cabang." />
          ) : (
            <div className="space-y-3">
              {stockTransfers.map((trf) => (
                <div key={trf.id} className="rounded border border-slate-200 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-semibold text-blue-700">{trf.trfNo}</span>
                      <span className="ml-2 font-medium text-slate-700">
                        {trf.fromBranchId} → {trf.toBranchId}
                      </span>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        trf.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {trf.status === 'COMPLETED' ? 'Selesai' : 'In-Transit'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded">
                    <div>
                      <div className="font-semibold text-slate-800">{trf.partName}</div>
                      <div className="text-[11px] text-slate-500">
                        Qty Dikirim: <strong>{trf.qtySent}</strong>
                        {trf.notes && <span> &middot; {trf.notes}</span>}
                      </div>
                    </div>
                    {trf.status === 'IN_TRANSIT' && canReceive && (
                      <button
                        onClick={() => receiveTransfer(trf.id)}
                        className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Konfirmasi Terima
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      Dibuat oleh{' '}
                      {(() => {
                        const actor = formatActor(trf.createdBy, users);
                        return actor ? `${actor.name} (${ROLE_LABEL[actor.role as Role] ?? actor.role})` : trf.createdBy;
                      })()}
                    </span>
                    <span>{new Date(trf.createdAt).toLocaleString('id-ID')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}