export function formatRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso));
}

/** Human-readable countdown / overdue indicator against a promised_at ISO string. */
export function slaCountdown(promisedAt: string): {
  label: string;
  tone: 'ok' | 'warn' | 'late';
} {
  const diffMs = new Date(promisedAt).getTime() - Date.now();
  const absHours = Math.abs(diffMs) / 3600000;
  const h = Math.floor(absHours);
  const m = Math.floor((absHours - h) * 60);
  if (diffMs >= 0) {
    return {
      label: `Sisa ${h > 0 ? `${h}j ` : ''}${m}m`,
      tone: absHours <= 4 ? 'warn' : 'ok',
    };
  }
  return { label: `Telat ${h}j ${m}m`, tone: 'late' };
}

export function relativeMinutes(iso?: string): string {
  if (!iso) return '-';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} menit lalu`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export interface ActorInfo {
  id: string;
  name: string;
  role: string;
}

export function formatActor(
  userId?: string,
  users: { id: string; fullName: string; role: string }[] = []
): ActorInfo | null {
  if (!userId) return null;
  const u = users.find((x) => x.id === userId);
  if (!u) return { id: userId, name: userId, role: '-' };
  return { id: u.id, name: u.fullName, role: u.role };
}