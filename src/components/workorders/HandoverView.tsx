import { useState } from 'react';
import { useErpState } from '../../context/ErpContext';
import { PageHeader, SearchInput, EmptyState } from '../layout/PageHeader';
import { formatRupiah } from '../../utils/formatters';
import { can, transitionAllowedByRole } from '../../services/domainEngine';
import type { PaymentMethod } from '../../types/domain';

export function HandoverView({ onOpenWo }: { onOpenWo: (id: string) => void }) {
  const { workOrders, transitionWo, recordPayment, currentUser } = useErpState();
  const [search, setSearch] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payAmount, setPayAmount] = useState(0);

  const canHandover = transitionAllowedByRole(currentUser.role, 'HANDED_OVER');
  const canClose = transitionAllowedByRole(currentUser.role, 'CLOSED');
  const canReceivePayment = can(currentUser.role, 'payment:receive');

  const ready = workOrders
    .filter((w) => w.status === 'READY' || w.status === 'HANDED_OVER')
    .filter(
      (w) =>
        search === '' ||
        w.woNo.toLowerCase().includes(search.toLowerCase()) ||
        w.customerName.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.promisedAt.localeCompare(b.promisedAt));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Serah-Terima & Kasir"
        subtitle="Unit yang lolos QC siap diserahkan. Catat pembayaran dan tutup siklus transaksi."
        actions={
          <SearchInput value={search} onChange={setSearch} placeholder="Cari WO / pelanggan..." />
        }
      />

      {ready.length === 0 ? (
        <EmptyState message="Tidak ada unit siap diambil. Semua pesanan sedang diproses atau sudah selesai." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ready.map((wo) => {
            const paid = wo.payments.reduce((s, p) => s + p.amount, 0);
            const isHandover = wo.status === 'HANDED_OVER';
            const due = wo.grandTotal - paid;

            return (
              <div
                key={wo.id}
                className={`rounded-lg border p-3 ${
                  isHandover ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-blue-700">{wo.woNo}</span>
                      <span className="text-xs font-medium text-slate-700">{wo.customerName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">{wo.items.map((i) => i.serviceNameSnap).join(', ')}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    isHandover ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'
                  }`}>
                    {isHandover ? 'Diserahterima' : 'Siap Diambil'}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-600">Total tagihan</span>
                  <span className="tabular-nums font-semibold text-slate-800">{formatRupiah(wo.grandTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Terbayar</span>
                  <span className={`tabular-nums font-semibold ${
                    paid >= wo.grandTotal ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {formatRupiah(paid)}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  {!isHandover && canHandover && (
                    <button
                      onClick={() => transitionWo(wo.id, 'HANDED_OVER')}
                      className="flex-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Tandai Diserahterima
                    </button>
                  )}
                  {isHandover && due > 0 && canReceivePayment && (
                    <>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                        className="rounded border border-slate-300 px-2 py-1 text-[11px]"
                      >
                        <option value="CASH">Tunai</option>
                        <option value="QRIS">QRIS</option>
                        <option value="TRANSFER">Transfer</option>
                        <option value="CARD">Kartu</option>
                        <option value="PREPAID_BALANCE">Saldo</option>
                      </select>
                      <input
                        type="number"
                        value={payAmount}
                        onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                        placeholder="Jumlah"
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-[11px]"
                      />
                      <button
                        onClick={() => payAmount > 0 && recordPayment(wo.id, payMethod, payAmount)}
                        className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                      >
                        Bayar
                      </button>
                    </>
                  )}
                  {isHandover && due <= 0 && canClose && (
                    <button
                      onClick={() => transitionWo(wo.id, 'CLOSED')}
                      className="flex-1 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Tutup & Selesai
                    </button>
                  )}
                  {!canHandover && !canClose && !canReceivePayment && (
                    <span className="text-[11px] text-slate-400">Tidak memiliki izin untuk serah-terima/pembayaran</span>
                  )}
                </div>

                <button
                  onClick={() => onOpenWo(wo.id)}
                  className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  Detail Lengkap
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}