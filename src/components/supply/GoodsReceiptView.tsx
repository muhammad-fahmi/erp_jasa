import { useState } from 'react';
import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader, EmptyState, StatCard } from '../layout/PageHeader';
import { formatRupiah, formatActor } from '../../utils/formatters';
import { can, ROLE_LABEL, type Role } from '../../services/domainEngine';

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

export function GoodsReceiptView() {
  const { purchaseOrders, goodsReceipts, createGrn, postReturn, currentUser, supplierReturns } = useErpState();
  const { users } = useStaticData();
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [partId, setPartId] = useState<string>('');
  const [qtyAccepted, setQtyAccepted] = useState<number>(0);
  const [qtyRejected, setQtyRejected] = useState<number>(0);
  const [rejectReason, setRejectReason] = useState<string>('');

  const role = currentUser.role;
  const canReceiveGrn = can(role, 'grn:receive');
  const canReturn = can(role, 'supplier:return');

  const po = purchaseOrders.find((p) => p.id === selectedPoId);
  const openPos = purchaseOrders.filter((p) => p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED');

  function handleReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!po || !partId || (qtyAccepted <= 0 && qtyRejected <= 0)) return;
    const item = po.items.find((i) => i.partId === partId);
    if (!item) return;

    createGrn(po.id, {
      partId,
      qtyAccepted: Number(qtyAccepted),
      qtyRejected: Number(qtyRejected),
      unitCost: item.unitCost,
      rejectReason: qtyRejected > 0 ? rejectReason || 'Cacat pengiriman' : undefined,
    });

    setQtyAccepted(0);
    setQtyRejected(0);
    setRejectReason('');
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Penerimaan Barang (GRN) & Inspeksi QC"
        subtitle="Verifikasi fisik kedatangan PO: terima stok bersih, catat afkir, dan cetak bukti GRN."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
        <StatCard label="PO Menunggu Kirim" value={String(openPos.length)} tone="warn" />
        <StatCard label="Total Dokumen GRN" value={String(goodsReceipts.length)} />
        <StatCard label="Inspeksi Lolos" value={String(goodsReceipts.filter((g) => g.status === 'INSPECTED_PASS').length)} tone="good" />
        <StatCard label="Ada Cacat / Tolak" value={String(goodsReceipts.filter((g) => g.status === 'INSPECTED_REJECT').length)} tone="bad" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Form Penerimaan */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Input Penerimaan PO</h2>
          <form onSubmit={handleReceive} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pilih PO Terbuka</label>
              <select
                value={selectedPoId}
                onChange={(e) => {
                  setSelectedPoId(e.target.value);
                  const p = purchaseOrders.find((x) => x.id === e.target.value);
                  if (p && p.items[0]) {
                    setPartId(p.items[0].partId);
                    setQtyAccepted(p.items[0].qtyOrdered - p.items[0].qtyReceived);
                  }
                }}
                className="w-full rounded border border-slate-300 bg-white p-2 text-xs"
              >
                <option value="">-- Pilih PO --</option>
                {openPos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.poNo} &middot; {p.supplierName} ({formatRupiah(p.totalAmount)})
                  </option>
                ))}
              </select>
            </div>

            {po && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Item Barang</label>
                  <select
                    value={partId}
                    onChange={(e) => {
                      setPartId(e.target.value);
                      const i = po.items.find((x) => x.partId === e.target.value);
                      if (i) setQtyAccepted(Math.max(0, i.qtyOrdered - i.qtyReceived));
                    }}
                    className="w-full rounded border border-slate-300 bg-white p-2 text-xs"
                  >
                    {po.items.map((i) => {
                      const outstanding = i.qtyOrdered - i.qtyReceived;
                      return (
                        <option key={i.partId} value={i.partId} disabled={outstanding <= 0}>
                          {i.partName} (Sisa: {outstanding} {i.purchaseUnit})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-emerald-700 mb-1">Qty Diterima (Lolos)</label>
                    <input
                      type="number"
                      min="0"
                      value={qtyAccepted}
                      onChange={(e) => setQtyAccepted(Number(e.target.value))}
                      className="w-full rounded border border-slate-300 p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-red-700 mb-1">Qty Cacat (Tolak)</label>
                    <input
                      type="number"
                      min="0"
                      value={qtyRejected}
                      onChange={(e) => setQtyRejected(Number(e.target.value))}
                      className="w-full rounded border border-slate-300 p-2 text-xs"
                    />
                  </div>
                </div>

                {qtyRejected > 0 && (
                  <div>
                    <label className="block text-[11px] font-semibold text-red-700 mb-1">Alasan Penolakan</label>
                    <input
                      type="text"
                      placeholder="Contoh: Kemasan pecah, bocor..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full rounded border border-red-300 p-2 text-xs"
                    />
                  </div>
                )}

                {canReceiveGrn ? (
                <button
                  type="submit"
                  className="w-full rounded bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Posting GRN & Update Stok
                </button>
              ) : (
                <div className="w-full rounded bg-slate-200 py-2 text-xs font-medium text-slate-500 text-center">
                  Tidak memiliki izin menerima barang
                </div>
              )}
              </>
            )}
          </form>
        </div>

        {/* Riwayat Dokumen GRN */}
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-800">Histori Penerimaan (GRN)</h2>
            {supplierReturns.length > 0 && (
              <span className="rounded bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                {supplierReturns.length} Retur Tercatat
              </span>
            )}
          </div>
          {goodsReceipts.length === 0 ? (
            <EmptyState message="Belum ada transaksi penerimaan barang." />
          ) : (
            <div className="space-y-3">
              {goodsReceipts.map((grn) => (
                <div key={grn.id} className="rounded border border-slate-200 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-semibold text-blue-700">{grn.grnNo}</span>
                      <span className="ml-2 text-slate-500">Ref: {grn.poNo}</span>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        grn.status === 'INSPECTED_PASS'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {grn.status === 'INSPECTED_PASS' ? 'Lolos Penuh' : 'Ada Cacat'}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 bg-slate-50 rounded p-2">
                    {grn.items.map((item) => {
                      const returnedQty = supplierReturns
                        .filter((sr) => sr.goodsReceiptId === grn.id)
                        .flatMap((sr) => sr.items)
                        .filter((i) => i.partId === item.partId)
                        .reduce((s, i) => s + i.qtyReturned, 0);
                      return (
                        <div key={item.id} className="py-1 flex items-center justify-between">
                          <div>
                            <span className="font-medium text-slate-800">{item.partName}</span>
                            <span className="ml-2 text-slate-500">
                              Masuk: <strong className="text-emerald-700">{item.qtyReceived}</strong>
                              {item.qtyRejected > 0 && (
                                <span className="text-red-700 ml-2">Cacat: <strong>{item.qtyRejected}</strong></span>
                              )}
                            </span>
                          </div>
                          {item.qtyRejected > 0 && canReturn && returnedQty < item.qtyRejected && (
                            <button
                              onClick={() =>
                                postReturn(grn.id, {
                                  partId: item.partId,
                                  qtyReturned: item.qtyRejected - returnedQty,
                                  unitCost: item.unitCost,
                                  reason: 'DAMAGED',
                                  notes: item.rejectReason,
                                })
                              }
                              className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-700"
                            >
                              Buat Retur Pemasok
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">Diterima:</span>
                      <ActorCell userId={grn.receivedBy} users={users} />
                    </div>
                    {grn.inspectedBy && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Diinspeksi:</span>
                        <ActorCell userId={grn.inspectedBy} users={users} />
                      </div>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {new Date(grn.receiptDate).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                    </span>
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