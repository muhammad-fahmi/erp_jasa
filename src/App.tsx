import { useState, useEffect } from 'react';
import { AppProviders, useErpState, useStaticData } from './context/ErpContext';
import { useAuth } from './context/AuthContext';
import { Sidebar, UserSwitcher, type NavKey } from './components/layout/Sidebar';
import { can, ROLE_LABEL, type Role } from './services/domainEngine';
import { DashboardView } from './components/dashboard/DashboardView';
import { IntakeView } from './components/workorders/IntakeView';
import { JobBoardView } from './components/workorders/JobBoardView';
import { WorkOrderListView } from './components/workorders/WorkOrderListView';
import { WorkOrderDetail } from './components/workorders/WorkOrderDetail';
import { TechnicianTasksView } from './components/workorders/TechnicianTasksView';
import { QcQueueView } from './components/workorders/QcQueueView';
import { HandoverView } from './components/workorders/HandoverView';
import { PartsInventoryView } from './components/inventory/PartsInventoryView';
import { SubscriptionsView } from './components/subscriptions/SubscriptionsView';
import { ReportsView } from './components/reports/ReportsView';
import { SuppliersView } from './components/supply/SuppliersView';
import { PurchaseRequestsView } from './components/supply/PurchaseRequestsView';
import { PurchaseOrdersView } from './components/supply/PurchaseOrdersView';
import { GoodsReceiptView } from './components/supply/GoodsReceiptView';
import { TransfersView } from './components/supply/TransfersView';
import LoginPage from './components/auth/LoginPage';
import { AuthProvider } from './context/AuthContext';

function AppContent() {
  const { currentUser, setCurrentUser } = useErpState();
  const { users } = useStaticData();
  const { user: authUser, logout } = useAuth();
  const [requestedTab, setRequestedTab] = useState<NavKey>('dashboard');
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);

  // Sync logged in user role/id if matching static user exists
  useEffect(() => {
    if (authUser) {
      const match = users.find((u) => u.email === authUser.email || u.role === authUser.role);
      if (match && match.id !== currentUser.id) {
        setCurrentUser(match.id);
      }
    }
  }, [authUser, users, currentUser.id, setCurrentUser]);

  // Derive during render: a tab the new role cannot access falls back to its home tab.
  const activeTab = can(currentUser.role, requestedTab)
    ? requestedTab
    : currentUser.role === 'TECHNICIAN'
      ? 'tasks'
      : 'dashboard';

  const handleOpenWo = (id: string) => {
    setSelectedWoId(id);
  };

  const handleCloseWo = () => {
    setSelectedWoId(null);
  };

  const handleWoCreated = (woId: string) => {
    setSelectedWoId(woId);
    setRequestedTab('board');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 antialiased font-sans">
      <Sidebar
        active={activeTab}
        role={currentUser.role}
        onNavigate={(tab) => {
          setRequestedTab(tab);
          setSelectedWoId(null);
        }}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Sistem Operasional Servis &amp; Jasa
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
              PRD Compliant
            </span>
          </div>

          <div className="flex items-center gap-4">
            <UserSwitcher
              currentUser={currentUser}
              users={users}
              onChange={(userId) => setCurrentUser(userId)}
            />
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="inline-block h-6 w-6 rounded-full bg-blue-100 text-center leading-6 font-bold text-blue-700">
                {currentUser.fullName[0]}
              </span>
              <div className="flex flex-col leading-tight">
                <span className="font-semibold text-slate-800">{currentUser.fullName}</span>
                <span className="text-[10px] text-slate-500">{ROLE_LABEL[currentUser.role as Role] ?? currentUser.role}</span>
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-600 transition"
              title="Keluar / Logout"
            >
              Keluar
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl">
            {selectedWoId ? (
              <WorkOrderDetail woId={selectedWoId} onClose={handleCloseWo} />
            ) : (
              <>
                {activeTab === 'dashboard' && <DashboardView onOpenWo={handleOpenWo} />}
                {activeTab === 'intake' && <IntakeView onCreated={handleWoCreated} />}
                {activeTab === 'board' && <JobBoardView onOpenWo={handleOpenWo} />}
                {activeTab === 'workorders' && <WorkOrderListView onOpenWo={handleOpenWo} />}
                {activeTab === 'tasks' && (
                  <TechnicianTasksView currentTechnicianId={currentUser.technicianId ?? 'tech-1'} />
                )}
                {activeTab === 'qc' && <QcQueueView onOpenWo={handleOpenWo} />}
                {activeTab === 'handover' && <HandoverView onOpenWo={handleOpenWo} />}
                {activeTab === 'subscriptions' && <SubscriptionsView />}
                {activeTab === 'parts' && <PartsInventoryView />}
                {activeTab === 'suppliers' && <SuppliersView />}
                {activeTab === 'pr' && <PurchaseRequestsView />}
                {activeTab === 'po' && <PurchaseOrdersView />}
                {activeTab === 'grn' && <GoodsReceiptView />}
                {activeTab === 'transfers' && <TransfersView />}
                {activeTab === 'reports' && <ReportsView />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function AppWithAuth() {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <AppContent />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppProviders>
        <AppWithAuth />
      </AppProviders>
    </AuthProvider>
  );
}