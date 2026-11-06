import type { ReactNode } from 'react';
import type { Role, User } from '../../types/domain';
import { can, ROLE_LABEL } from '../../services/domainEngine';
import {
  LayoutDashboard,
  ClipboardPlus,
  KanbanSquare,
  ListChecks,
  Wrench,
  ShieldCheck,
  HandCoins,
  BarChart3,
  Users,
  Package,
  Repeat,
  Truck,
  FileText,
  ShoppingBag,
  ArrowLeftRight,
} from 'lucide-react';

export type NavKey =
  | 'dashboard'
  | 'intake'
  | 'board'
  | 'orders'
  | 'workorders'
  | 'tasks'
  | 'qc'
  | 'handover'
  | 'reports'
  | 'parts'
  | 'subscriptions'
  | 'suppliers'
  | 'pr'
  | 'po'
  | 'grn'
  | 'transfers';

interface NavItem {
  key: NavKey;
  label: string;
  icon: ReactNode;
  category?: 'core' | 'supply';
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, category: 'core' },
  { key: 'intake', label: 'Intake Baru', icon: <ClipboardPlus size={16} />, category: 'core' },
  { key: 'board', label: 'Job Board', icon: <KanbanSquare size={16} />, category: 'core' },
  { key: 'workorders', label: 'Work Orders', icon: <ListChecks size={16} />, category: 'core' },
  { key: 'tasks', label: 'Tugas Saya', icon: <Wrench size={16} />, category: 'core' },
  { key: 'qc', label: 'Antrean QC', icon: <ShieldCheck size={16} />, category: 'core' },
  { key: 'handover', label: 'Serah-Terima & Kasir', icon: <HandCoins size={16} />, category: 'core' },
  { key: 'subscriptions', label: 'Langganan', icon: <Repeat size={16} />, category: 'core' },
  { key: 'parts', label: 'Bahan & Kartu Stok', icon: <Package size={16} />, category: 'supply' },
  { key: 'suppliers', label: 'Katalog Pemasok', icon: <Truck size={16} />, category: 'supply' },
  { key: 'pr', label: 'Purchase Request', icon: <FileText size={16} />, category: 'supply' },
  { key: 'po', label: 'Purchase Orders', icon: <ShoppingBag size={16} />, category: 'supply' },
  { key: 'grn', label: 'Penerimaan GRN', icon: <Package size={16} />, category: 'supply' },
  { key: 'transfers', label: 'Transfer Cabang', icon: <ArrowLeftRight size={16} />, category: 'supply' },
  { key: 'reports', label: 'Laporan', icon: <BarChart3 size={16} />, category: 'core' },
];

export function Sidebar({
  active,
  role,
  onNavigate,
}: {
  active: NavKey;
  role: Role;
  onNavigate: (k: NavKey) => void;
}) {
  const visibleItems = NAV_ITEMS.filter((item) => can(role, item.key));

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-slate-900 text-slate-100 flex flex-col">
      <div className="px-4 py-4 border-b border-slate-700/60">
        <div className="text-sm font-bold tracking-tight">ERP Jasa</div>
        <div className="text-[11px] text-slate-400">Work Order System</div>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {visibleItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors ${
              active === item.key
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function UserSwitcher({
  currentUser,
  users,
  onChange,
}: {
  currentUser: User;
  users: User[];
  onChange: (userId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Users size={14} className="text-slate-400" />
      <span className="text-[11px] text-slate-400">Pengguna:</span>
      <select
        value={currentUser.id}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.fullName} — {ROLE_LABEL[u.role] ?? u.role}
          </option>
        ))}
      </select>
    </div>
  );
}