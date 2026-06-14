import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { getQueuedSales, syncQueuedSales } from '../lib/queue/offlineQueue';

export function PendingSyncIndicator() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const pending = await getQueuedSales();
      if (mounted) setCount(pending.length);
    };
    const sync = async () => {
      await syncQueuedSales();
      await refresh();
    };

    refresh();
    window.addEventListener('online', sync);
    window.addEventListener('cardpulse-queue-change', refresh);
    const interval = window.setInterval(sync, 30000);

    return () => {
      mounted = false;
      window.removeEventListener('online', sync);
      window.removeEventListener('cardpulse-queue-change', refresh);
      window.clearInterval(interval);
    };
  }, []);

  if (count === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900">
      <CloudOff className="shrink-0" size={16} aria-hidden="true" />
      <span>{count} pending<span className="hidden min-[380px]:inline"> sync</span></span>
    </div>
  );
}
