import { Link } from 'react-router-dom';
import { CalendarDays, Download, Settings, Tags, TrendingUp, Users } from 'lucide-react';
import { signOut } from '../lib/supabase/api';
import { isLocalDemoMode } from '../lib/supabase/client';

const links = [
  { to: '/labels', label: 'Labels', icon: Tags },
  { to: '/market', label: 'Market', icon: TrendingUp },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/import-export', label: 'Import / Export', icon: Download },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export function MoreScreen() {
  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-black">More</h2>
      <div className="grid gap-2">
        {links.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex min-h-14 items-center gap-3 rounded-lg border border-line bg-white px-4 font-bold">
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </div>
      {!isLocalDemoMode && (
        <button className="min-h-14 rounded-lg border border-line bg-white px-4 text-left font-bold text-danger" onClick={() => signOut()}>
          Sign out
        </button>
      )}
    </div>
  );
}
