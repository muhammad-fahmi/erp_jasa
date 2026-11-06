import { useState } from 'react';
import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader } from '../layout/PageHeader';
import { formatRupiah } from '../../utils/formatters';
import { calculatePromisedAt, calculateUnitPrice, can } from '../../services/domainEngine';
import type { SlaTier } from '../../types/domain';

export function IntakeView({ onCreated }: { onCreated: (woId: string) => void }) {
  const { services, slaPolicies, customers, pricingRules } = useStaticData();
  const { addWorkOrder, currentUser } = useErpState();

  const canCreate = can(currentUser.role, 'wo:create');

  const [customerId, setCustomerId] = useState<string>('');
  const [walkInName, setWalkInName] = useState('');
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [slaTier, setSlaTier] = useState<SlaTier>('REGULAR');
  const [entryChannel, setEntryChannel] = useState<'WALK_IN' | 'WHATSAPP' | 'WEB' | 'PHONE'>('WALK_IN');
  const [notes, setNotes] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const customer = customers.find((c) => c.id === customerId);
  const unitPrice = service ? calculateUnitPrice(service, quantity, customerId || undefined, pricingRules) : 0;
  const lineTotal = unitPrice * quantity;
  const slaPolicy = slaPolicies.find((p) => p.tier === slaTier);
  const promisedPreview = slaPolicy
    ? calculatePromisedAt(new Date(), slaPolicy, 3, service?.stages[0]?.estMinutes ?? 20)
    : null;

  function submit() {
    if (!service) return;
    const name = customerId ? customer!.name : walkInName.trim();
    if (!name) {
      setFlash('Nama pelanggan wajib diisi untuk pelanggan walk-in.');
      return;
    }
    if (quantity <= 0) {
      setFlash('Jumlah harus lebih dari 0.');
      return;
    }
    const wo = addWorkOrder({
      customerId: customerId || undefined,
      customerName: name,
      customerPhone: customer?.phone,
      serviceId: service.id,
      quantity,
      entryChannel,
      slaTier,
      intakeNotes: notes.trim() || undefined,
    });
    setFlash(`Work Order ${wo.woNo} dibuat dan masuk antrean produksi.`);
    setWalkInName('');
    setQuantity(1);
    setNotes('');
    setTimeout(() => onCreated(wo.id), 600);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Intake Work Order"
        subtitle="Terima unit, catat kondisi, dan system akan otomatis membuat tugas kerja per tahap."
      />

      {flash && (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Form */}
        <div className="lg:col-span-2 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Pelanggan Terdaftar</span>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="rounded border border-slate-300 px-2.5 py-2 text-sm"
              >
                <option value="">-- Walk-in (tidak terdaftar) --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">
                Nama Walk-in {customerId ? '(tidak dipakai)' : ''}
              </span>
              <input
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                disabled={!!customerId}
                placeholder="Nama pelanggan"
                className="rounded border border-slate-300 px-2.5 py-2 text-sm disabled:bg-slate-100"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">Jenis Jasa</span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="rounded border border-slate-300 px-2.5 py-2 text-sm"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.category} &mdash; {s.name} ({s.baseUnit})
                </option>
              ))}
            </select>
            {service && (
              <span className="text-[11px] text-slate-500">{service.description}</span>
            )}
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Jumlah ({service?.baseUnit})</span>
              <input
                type="number"
                min={0}
                step="0.1"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="rounded border border-slate-300 px-2.5 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Tingkat Layanan</span>
              <select
                value={slaTier}
                onChange={(e) => setSlaTier(e.target.value as SlaTier)}
                className="rounded border border-slate-300 px-2.5 py-2 text-sm"
              >
                {slaPolicies.map((p) => (
                  <option key={p.id} value={p.tier}>
                    {p.name} ({p.baseHours} jam)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Kanal Masuk</span>
              <select
                value={entryChannel}
                onChange={(e) => setEntryChannel(e.target.value as typeof entryChannel)}
                className="rounded border border-slate-300 px-2.5 py-2 text-sm"
              >
                <option value="WALK_IN">Datang Langsung</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="WEB">Website</option>
                <option value="PHONE">Telepon</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">Catatan Kondisi / Keluhan</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Contoh: Noda tinta di paha kiri, 1 kancing hilang, bau tidak hilang..."
              className="rounded border border-slate-300 px-2.5 py-2 text-sm"
            />
          </label>

          {canCreate ? (
            <button
              onClick={submit}
              className="self-start rounded bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Terima &amp; Masukkan Antrean
            </button>
          ) : (
            <div className="rounded bg-slate-200 px-4 py-2 text-xs font-medium text-slate-500">
              Hanya Front Desk/Supervisor yang dapat menerima WO baru
            </div>
          )}
        </div>

        {/* Ringkasan */}
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ringkasan Biaya</h2>
            <dl className="mt-2 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Harga satuan</dt>
                <dd className="font-medium tabular-nums">{formatRupiah(unitPrice)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Jumlah</dt>
                <dd className="tabular-nums">
                  {quantity} {service?.baseUnit}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-300 pt-1.5">
                <dt className="font-medium text-slate-700">Total</dt>
                <dd className="text-base font-semibold tabular-nums text-blue-700">
                  {formatRupiah(lineTotal)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Perkiraan Selesai
            </h2>
            {promisedPreview ? (
              <p className="mt-1 text-sm text-slate-700">
                {promisedPreview.toLocaleString('id-ID', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Jakarta',
                })}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-slate-500">
              Termasuk estimasi antrean terkini. Stages: {service?.stages.length ?? 0} tahap, total ±
              {service?.stages.reduce((s, t) => s + t.estMinutes, 0) ?? 0} menit kerja.
            </p>
          </div>

          {service && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tahap yang Akan Dibuat
              </h2>
              <ol className="mt-2 flex flex-col gap-1.5">
                {service.stages
                  .slice()
                  .sort((a, b) => a.seq - b.seq)
                  .map((st) => (
                    <li key={st.id} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-600">
                          {st.seq}
                        </span>
                        {st.name}
                        {st.isQcStage && (
                          <span className="rounded bg-violet-100 px-1 text-[9px] font-semibold text-violet-700">
                            QC
                          </span>
                        )}
                      </span>
                      <span className="text-slate-400">{st.estMinutes}m</span>
                    </li>
                  ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}