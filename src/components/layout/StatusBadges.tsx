import type { WoStatus, TaskStatus } from '../../types/domain';

const WO_TONES: Record<WoStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-300',
  QUEUED: 'bg-sky-50 text-sky-700 border-sky-300',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-300',
  ON_HOLD: 'bg-amber-50 text-amber-800 border-amber-300',
  QC: 'bg-violet-50 text-violet-700 border-violet-300',
  REWORK: 'bg-red-50 text-red-700 border-red-300',
  READY: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  HANDED_OVER: 'bg-emerald-100 text-emerald-900 border-emerald-400',
  CLOSED: 'bg-slate-800 text-white border-slate-800',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-400 line-through',
};

const WO_LABELS: Record<WoStatus, string> = {
  DRAFT: 'Draf',
  QUEUED: 'Antrean',
  IN_PROGRESS: 'Dikerjakan',
  ON_HOLD: 'Ditahan',
  QC: 'Menunggu QC',
  REWORK: 'Perbaikan',
  READY: 'Siap Diambil',
  HANDED_OVER: 'Diserahterima',
  CLOSED: 'Selesai',
  CANCELLED: 'Batal',
};

const TASK_TONES: Record<TaskStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-500 border-slate-300',
  ASSIGNED: 'bg-sky-50 text-sky-700 border-sky-300',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-300',
  PAUSED: 'bg-amber-50 text-amber-800 border-amber-300',
  BLOCKED: 'bg-orange-50 text-orange-800 border-orange-300',
  DONE: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  QC_REJECTED: 'bg-red-50 text-red-700 border-red-300',
};

const TASK_LABELS: Record<TaskStatus, string> = {
  PENDING: 'Menunggu',
  ASSIGNED: 'Ditugaskan',
  IN_PROGRESS: 'Berjalan',
  PAUSED: 'Jeda',
  BLOCKED: 'Terkunci',
  DONE: 'Selesai',
  QC_REJECTED: 'Ditolak QC',
};

export function WoStatusBadge({ status }: { status: WoStatus }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${WO_TONES[status]}`}>
      {WO_LABELS[status]}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${TASK_TONES[status]}`}>
      {TASK_LABELS[status]}
    </span>
  );
}

export function WoStatusLabel({ status }: { status: WoStatus }) {
  return WO_LABELS[status];
}

export function TaskStatusLabel({ status }: { status: TaskStatus }) {
  return TASK_LABELS[status];
}