import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, Boxes, Clock3, MoreHorizontal, ScanLine } from 'lucide-react';
import { PendingSyncIndicator } from './PendingSyncIndicator';
import { useOrg } from '../lib/org/OrgProvider';
import { useRealtimeSync } from '../lib/supabase/useRealtimeSync';
import { isLocalDemoMode } from '../lib/supabase/client';

const nav = [
  { to: '/', label: 'Sell', icon: ScanLine },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/history', label: 'History', icon: Clock3 },
  { to: '/more', label: 'More', icon: MoreHorizontal }
];

export function AppShell() {
  const { organization } = useOrg();
  useRealtimeSync(organization.id);

  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip bg-slate-50 text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex min-w-0 max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-action">CardPulse</p>
              {isLocalDemoMode && <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">Local demo</span>}
            </div>
            <h1 className="truncate text-lg font-bold leading-tight">{organization.name}</h1>
          </div>
          <PendingSyncIndicator />
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-5xl px-3 pb-28 pt-4 sm:px-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] shadow-soft">
        <div className="mx-auto grid max-w-5xl grid-cols-5">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold sm:text-xs ${isActive ? 'text-action' : 'text-slate-500'}`
              }
            >
              <Icon size={22} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
