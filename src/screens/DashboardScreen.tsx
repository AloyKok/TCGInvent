import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Field, SelectInput, TextInput } from '../components/Field';
import { formatEventPeriod } from '../lib/events/dateRange';
import {
  formatMonthLabel,
  getLocalDateKey,
  getLocalMonthKey,
  getRevenueMonth,
  matchesSaleScope
} from '../lib/reports/revenuePeriods';
import { listEvents, listInventory, listTransactions } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';

export function DashboardScreen() {
  const { organization } = useOrg();
  const [month, setMonth] = useState(getLocalMonthKey());
  const [saleScope, setSaleScope] = useState('');
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'dashboard'], queryFn: () => listInventory(organization.id) });
  const salesQuery = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 5000) });
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const today = getLocalDateKey();
  const inventory = useMemo(() => inventoryQuery.data || [], [inventoryQuery.data]);
  const transactions = useMemo(() => salesQuery.data || [], [salesQuery.data]);
  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const selectedEvent = events.find((event) => event.id === saleScope);
  const scopeLabel = saleScope === 'daily'
    ? 'Daily sales'
    : saleScope === 'shows'
      ? 'All card shows'
      : selectedEvent?.name || 'All sales';
  const metrics = useMemo(() => {
    const completed = transactions.filter((tx) => tx.status === 'completed');
    const monthSales = completed.filter((tx) =>
      getRevenueMonth(tx, eventsById) === month && matchesSaleScope(tx, saleScope)
    );
    const todayDailySales = completed.filter((tx) => !tx.eventId && getLocalDateKey(tx.createdAt) === today);
    const dailyMonthSales = completed.filter((tx) => !tx.eventId && getRevenueMonth(tx, eventsById) === month);
    const showMonthSales = completed.filter((tx) => tx.eventId && getRevenueMonth(tx, eventsById) === month);
    return {
      todayDailyCount: todayDailySales.length,
      todayDailyRevenue: todayDailySales.reduce((sum, tx) => sum + tx.total, 0),
      monthCount: monthSales.length,
      monthRevenue: monthSales.reduce((sum, tx) => sum + tx.total, 0),
      dailyMonthRevenue: dailyMonthSales.reduce((sum, tx) => sum + tx.total, 0),
      showMonthRevenue: showMonthSales.reduce((sum, tx) => sum + tx.total, 0),
      units: inventory.reduce((sum, item) => sum + item.quantity, 0),
      askingValue: inventory.reduce((sum, item) => sum + item.quantity * item.askingPrice, 0),
      costValue: inventory.reduce((sum, item) => sum + item.quantity * (item.costBasis || 0), 0),
      lowStock: inventory.filter((item) => item.quantity > 0 && item.quantity <= 2)
    };
  }, [eventsById, inventory, month, saleScope, today, transactions]);
  const sourceSummaries = useMemo(() => {
    const completed = transactions.filter((tx) => tx.status === 'completed');
    const summaries: Array<{ id: string; name: string; detail: string; count: number; revenue: number }> = [];
    if (!saleScope || saleScope === 'daily') {
      const sales = completed.filter((tx) => !tx.eventId && getRevenueMonth(tx, eventsById) === month);
      const revenue = sales.reduce((sum, tx) => sum + tx.total, 0);
      summaries.push({
        id: 'daily',
        name: 'Daily sales',
        detail: 'Transactions not assigned to a card show',
        count: sales.length,
        revenue
      });
    }
    events
      .filter((event) => event.startDate.slice(0, 7) === month)
      .filter((event) => !saleScope || saleScope === 'shows' || saleScope === event.id)
      .forEach((event) => {
        const sales = completed.filter((tx) => tx.eventId === event.id);
        summaries.push({
          id: event.id,
          name: event.name,
          detail: formatEventPeriod(event),
          count: sales.length,
          revenue: sales.reduce((sum, tx) => sum + tx.total, 0)
        });
      });
    return summaries;
  }, [events, eventsById, month, saleScope, transactions]);
  const monthlySummaries = useMemo(() => {
    const totals = new Map<string, { count: number; revenue: number }>();
    transactions.filter((tx) => tx.status === 'completed').forEach((tx) => {
      const revenueMonth = getRevenueMonth(tx, eventsById);
      const current = totals.get(revenueMonth) || { count: 0, revenue: 0 };
      totals.set(revenueMonth, { count: current.count + 1, revenue: current.revenue + tx.total });
    });
    if (!totals.has(month)) totals.set(month, { count: 0, revenue: 0 });
    return [...totals.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, 12)
      .map(([key, value]) => ({ month: key, ...value }));
  }, [eventsById, month, transactions]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <div>
          <h2 className="text-2xl font-black">Dashboard</h2>
          <p className="text-sm text-slate-600">{formatMonthLabel(month)} / {scopeLabel}</p>
        </div>
        <div className="grid gap-2 min-[400px]:grid-cols-2">
          <Field label="Revenue month">
            <TextInput type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </Field>
          <Field label="Sales source">
            <SelectInput
              value={saleScope}
              onValueChange={setSaleScope}
              options={[
                { value: '', label: 'All sales' },
                { value: 'daily', label: 'Daily sales' },
                { value: 'shows', label: 'All card shows' },
                ...events.map((event) => ({ value: event.id, label: `${event.name} / ${formatEventPeriod(event)}` }))
              ]}
            />
          </Field>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Today daily sales" value={String(metrics.todayDailyCount)} />
        <Metric label="Today daily revenue" value={`$${metrics.todayDailyRevenue.toFixed(2)}`} />
        <Metric label="Month sales" value={String(metrics.monthCount)} />
        <Metric label="Month revenue" value={`$${metrics.monthRevenue.toFixed(2)}`} />
        <Metric label="Daily month revenue" value={`$${metrics.dailyMonthRevenue.toFixed(2)}`} />
        <Metric label="Show month revenue" value={`$${metrics.showMonthRevenue.toFixed(2)}`} />
        <Metric label="Inventory units" value={String(metrics.units)} />
        <Metric label="Inventory ask / cost" value={`$${metrics.askingValue.toFixed(2)} / $${metrics.costValue.toFixed(2)}`} />
      </div>
      <section className="rounded-lg border border-line bg-white p-3">
        <h3 className="font-black">Revenue breakdown</h3>
        <div className="mt-3 grid gap-2">
          {sourceSummaries.length === 0 && <p className="text-sm text-slate-600">No sales sources for this month.</p>}
          {sourceSummaries.map((source) => (
            <button
              key={source.id}
              type="button"
              className="grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-slate-50 p-3 text-left"
              onClick={() => setSaleScope(source.id)}
            >
              <span className="min-w-0">
                <strong className="block truncate">{source.name}</strong>
                <span className="block break-words text-xs text-slate-600">{source.detail} / {source.count} sales</span>
              </span>
              <strong className="text-lg">${source.revenue.toFixed(2)}</strong>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-line bg-white p-3">
        <h3 className="font-black">Revenue by month</h3>
        <div className="mt-3 grid gap-2">
          {monthlySummaries.map((summary) => (
            <button
              key={summary.month}
              type="button"
              className={`grid min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md p-3 text-left ${summary.month === month ? 'bg-emerald-50 ring-1 ring-action' : 'bg-slate-50'}`}
              onClick={() => setMonth(summary.month)}
            >
              <span className="min-w-0">
                <strong className="block">{formatMonthLabel(summary.month)}</strong>
                <span className="block text-xs text-slate-600">{summary.count} completed sales</span>
              </span>
              <strong className="text-lg">${summary.revenue.toFixed(2)}</strong>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-line bg-white p-3">
        <h3 className="font-black">Low stock</h3>
        <div className="mt-3 grid gap-2">
          {metrics.lowStock.length === 0 && <p className="text-sm text-slate-600">No low-stock items.</p>}
          {metrics.lowStock.slice(0, 12).map((item) => (
            <div key={item.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md bg-slate-50 p-3 text-sm">
              <span className="min-w-0 break-words">{item.itemName} / <span className="break-all">{item.itemNumber}</span></span>
              <strong className="whitespace-nowrap">qty {item.quantity}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xl font-black sm:text-2xl">{value}</p>
    </div>
  );
}
