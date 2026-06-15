import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Field, SelectInput } from '../components/Field';
import { formatEventPeriod, getLocalDateInputValue } from '../lib/events/dateRange';
import { listEvents, listInventory, listTransactions } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';

export function DashboardScreen() {
  const { organization } = useOrg();
  const [eventId, setEventId] = useState('');
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'dashboard'], queryFn: () => listInventory(organization.id) });
  const salesQuery = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 500) });
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const today = getLocalDateInputValue();
  const inventory = useMemo(() => inventoryQuery.data || [], [inventoryQuery.data]);
  const transactions = useMemo(() => salesQuery.data || [], [salesQuery.data]);
  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const selectedEvent = events.find((event) => event.id === eventId);
  const metrics = useMemo(() => {
    const completed = transactions.filter((tx) => tx.status === 'completed');
    const filtered = completed.filter((tx) => !eventId || tx.eventId === eventId);
    const todaySales = filtered.filter((tx) => tx.createdAt.slice(0, 10) === today);
    return {
      todayCount: todaySales.length,
      todayRevenue: todaySales.reduce((sum, tx) => sum + tx.total, 0),
      totalCount: filtered.length,
      totalRevenue: filtered.reduce((sum, tx) => sum + tx.total, 0),
      units: inventory.reduce((sum, item) => sum + item.quantity, 0),
      askingValue: inventory.reduce((sum, item) => sum + item.quantity * item.askingPrice, 0),
      costValue: inventory.reduce((sum, item) => sum + item.quantity * (item.costBasis || 0), 0),
      lowStock: inventory.filter((item) => item.quantity > 0 && item.quantity <= 2)
    };
  }, [eventId, inventory, today, transactions]);
  const eventSummaries = useMemo(
    () => events.map((event) => {
      const sales = transactions.filter((tx) => tx.status === 'completed' && tx.eventId === event.id);
      const revenue = sales.reduce((sum, tx) => sum + tx.total, 0);
      return {
        ...event,
        count: sales.length,
        revenue,
        average: sales.length ? revenue / sales.length : 0
      };
    }),
    [events, transactions]
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:flex sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-black">Dashboard</h2>
          <p className="text-sm text-slate-600">{selectedEvent ? selectedEvent.name : 'All card shows'}</p>
        </div>
        <Field label="Show">
          <SelectInput
            value={eventId}
            onValueChange={setEventId}
            className="sm:min-w-72"
            options={[
              { value: '', label: 'All shows' },
              ...events.map((event) => ({ value: event.id, label: `${event.name} / ${formatEventPeriod(event)}` }))
            ]}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Today sales" value={String(metrics.todayCount)} />
        <Metric label="Today revenue" value={`$${metrics.todayRevenue.toFixed(2)}`} />
        <Metric label={selectedEvent ? 'Show sales' : 'All sales'} value={String(metrics.totalCount)} />
        <Metric label={selectedEvent ? 'Show revenue' : 'All revenue'} value={`$${metrics.totalRevenue.toFixed(2)}`} />
        <Metric label="Inventory units" value={String(metrics.units)} />
        <Metric label="Ask value" value={`$${metrics.askingValue.toFixed(2)}`} />
        <Metric label="Cost value" value={`$${metrics.costValue.toFixed(2)}`} />
      </div>
      <section className="rounded-lg border border-line bg-white p-3">
        <h3 className="font-black">Revenue by show</h3>
        <div className="mt-3 grid gap-2">
          {eventSummaries.length === 0 && <p className="text-sm text-slate-600">No card shows created yet.</p>}
          {eventSummaries.map((event) => (
            <button
              key={event.id}
              type="button"
              className="grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-slate-50 p-3 text-left"
              onClick={() => setEventId(event.id)}
            >
              <span className="min-w-0">
                <strong className="block truncate">{event.name}</strong>
                <span className="block break-words text-xs text-slate-600">{formatEventPeriod(event)} / {event.count} sales / ${event.average.toFixed(2)} average</span>
              </span>
              <strong className="text-lg">${event.revenue.toFixed(2)}</strong>
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
