import { useState } from 'react';
import { useErpState, useStaticData } from '../../context/ErpContext';
import { PageHeader, EmptyState } from '../layout/PageHeader';
import { TaskStatusBadge } from '../layout/StatusBadges';
import { slaCountdown } from '../../utils/formatters';
import type { TaskStatus } from '../../types/domain';

export function TechnicianTasksView({ currentTechnicianId }: { currentTechnicianId: string }) {
  const { workOrders, updateWorkOrderTask } = useErpState();
  const { technicians, stations } = useStaticData();
  const [techId, setTechId] = useState(currentTechnicianId);

  const tech = technicians.find((t) => t.id === techId);

  // All tasks assigned to this technician, from WOs still open
  const myTasks = workOrders
    .filter((w) => !['CLOSED', 'CANCELLED', 'HANDED_OVER'].includes(w.status))
    .flatMap((w) =>
      w.tasks
        .filter((t) => t.technicianId === techId)
        .map((t) => ({ wo: w, task: t }))
    )
    .filter(({ task }) => task.status !== 'DONE')
    .sort((a, b) => a.wo.promisedAt.localeCompare(b.wo.promisedAt));

  function setStatus(taskId: string, woId: string, status: TaskStatus) {
    updateWorkOrderTask(woId, taskId, {
      status,
      ...(status === 'IN_PROGRESS' ? { startedAt: new Date().toISOString() } : {}),
      ...(status === 'DONE' ? { finishedAt: new Date().toISOString() } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tugas Saya"
        subtitle="Tampilan kerja teknisi: fokus pada tugas yang sedang menjadi tanggung jawab Anda."
        actions={
          <select
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.code})
              </option>
            ))}
          </select>
        }
      />

      {tech && (
        <div className="rounded border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">{tech.fullName}</span> &middot; Keahlian:{' '}
          {tech.skills.join(', ')} &middot; Kapasitas {tech.dailyHours} jam/hari &middot; Komisi{' '}
          {tech.commissionMode === 'PERCENTAGE_OF_REVENUE'
            ? `${tech.commissionRate}% dari omzet`
            : tech.commissionMode === 'TIERED_PER_HOUR'
              ? `Rp${tech.commissionRate.toLocaleString('id-ID')}/jam`
              : `Rp${tech.commissionRate.toLocaleString('id-ID')}/job`}
        </div>
      )}

      {myTasks.length === 0 ? (
        <EmptyState message="Tidak ada tugas aktif untuk teknisi ini. Semua stage sudah selesai." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {myTasks.map(({ wo, task }) => {
            const sla = slaCountdown(wo.promisedAt);
            const station = stations.find((s) => s.id === task.stationId);
            return (
              <div
                key={task.id}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-blue-700">{wo.woNo}</span>
                      <TaskStatusBadge status={task.status} />
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-slate-800">
                      {task.stageName} &middot; seq {task.seq}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {station?.name ?? 'Tanpa stasiun'} &middot; estimasi {task.estMinutes} menit
                    </div>
                  </div>
                  <div
                    className={`shrink-0 text-xs font-semibold tabular-nums ${
                      sla.tone === 'late' ? 'text-red-600' : sla.tone === 'warn' ? 'text-amber-600' : 'text-emerald-600'
                    }`}
                  >
                    {sla.label}
                  </div>
                </div>

                {task.blockedReason && (
                  <div className="mt-2 rounded bg-orange-50 px-2 py-1 text-[11px] text-orange-800">
                    Terkunci: {task.blockedReason}
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(task.status === 'PENDING' || task.status === 'ASSIGNED') && (
                    <button
                      onClick={() => setStatus(task.id, wo.id, 'IN_PROGRESS')}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Mulai
                    </button>
                  )}
                  {task.status === 'IN_PROGRESS' && (
                    <>
                      <button
                        onClick={() => setStatus(task.id, wo.id, 'DONE')}
                        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Selesai
                      </button>
                      <button
                        onClick={() => setStatus(task.id, wo.id, 'PAUSED')}
                        className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                      >
                        Jeda
                      </button>
                      <button
                        onClick={() => setStatus(task.id, wo.id, 'BLOCKED')}
                        className="rounded bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
                      >
                        Butuh Part
                      </button>
                    </>
                  )}
                  {task.status === 'PAUSED' && (
                    <button
                      onClick={() => setStatus(task.id, wo.id, 'IN_PROGRESS')}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Lanjutkan
                    </button>
                  )}
                  {task.status === 'BLOCKED' && (
                    <button
                      onClick={() => setStatus(task.id, wo.id, 'IN_PROGRESS')}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Part ready, lanjut
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}