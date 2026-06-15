import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Printer, RefreshCcw, TrendingDown, TrendingUp } from 'lucide-react';
import { Field, SelectInput, TextInput } from '../components/Field';
import { formatMoney, formatPercent } from '../lib/format/money';
import { getLocalDateKey, getLocalMonthKey, getRevenueMonth } from '../lib/reports/revenuePeriods';
import { getQueuedSales } from '../lib/queue/offlineQueue';
import { getSettings, listEvents, listInventory, listTransactions } from '../lib/supabase/api';
import { useMembershipsQuery, useOrg } from '../lib/org/OrgProvider';
import type { InventoryItem, ShowEvent, Transaction } from '../types/domain';

type TimePeriod = 'today' | 'show' | 'month' | 'custom';
type ChannelFilter = 'all' | 'walk-in' | 'show';

export function DashboardScreen() {
  const { organization } = useOrg();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [adminId, setAdminId] = useState('');
  const [customStart, setCustomStart] = useState(getLocalDateKey());
  const [customEnd, setCustomEnd] = useState(getLocalDateKey());
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'dashboard'], queryFn: () => listInventory(organization.id) });
  const salesQuery = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 5000) });
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const queueQuery = useQuery({ queryKey: ['pending-sales'], queryFn: getQueuedSales, refetchInterval: 15000 });
  const membershipsQuery = useMembershipsQuery();

  const inventory = useMemo(() => inventoryQuery.data || [], [inventoryQuery.data]);
  const transactions = useMemo(() => salesQuery.data || [], [salesQuery.data]);
  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const settings = settingsQuery.data;
  const symbol = settings?.currencySymbol || 'S$';
  const agingDays = settings?.agingThresholdDays || 60;
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const activeShow = useMemo(() => pickActiveShow(events, settings?.activeEventId), [events, settings?.activeEventId]);
  const period = useMemo(
    () => buildPeriod(timePeriod, activeShow, customStart, customEnd),
    [activeShow, customEnd, customStart, timePeriod]
  );
  const priorPeriod = useMemo(
    () => buildPriorPeriod(timePeriod, period, activeShow, events),
    [activeShow, events, period, timePeriod]
  );

  const currentSales = useMemo(
    () => filterSales(transactions, eventsById, period, channel, adminId),
    [adminId, channel, eventsById, period, transactions]
  );
  const priorSales = useMemo(
    () => filterSales(transactions, eventsById, priorPeriod, channel, adminId),
    [adminId, channel, eventsById, priorPeriod, transactions]
  );
  const metrics = useMemo(() => summarizeSales(currentSales), [currentSales]);
  const priorMetrics = useMemo(() => summarizeSales(priorSales), [priorSales]);
  const inventoryHealth = useMemo(() => summarizeInventory(inventory, agingDays), [agingDays, inventory]);
  const monthlyTrend = useMemo(
    () => buildMonthlyTrend(transactions, eventsById, channel, adminId),
    [adminId, channel, eventsById, transactions]
  );
  const performanceRows = useMemo(
    () => buildPerformanceRows(currentSales, eventsById),
    [currentSales, eventsById]
  );
  const topSellers = useMemo(() => buildTopSellers(currentSales), [currentSales]);
  const needsAttention = useMemo(
    () => buildAttentionItems(inventory, events, agingDays, queueQuery.data || []),
    [agingDays, events, inventory, queueQuery.data]
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <div>
          <h2 className="text-2xl font-black">Dashboard</h2>
          <p className="text-sm font-semibold text-slate-600">{period.label} / {channelLabel(channel)}</p>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <Field label="Time period">
            <SelectInput
              value={timePeriod}
              onValueChange={(value) => setTimePeriod(value as TimePeriod)}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'show', label: activeShow ? `This show: ${activeShow.name}` : 'This show' },
                { value: 'month', label: 'This month' },
                { value: 'custom', label: 'Custom range' }
              ]}
            />
          </Field>
          <Field label="Channel">
            <SelectInput
              value={channel}
              onValueChange={(value) => setChannel(value as ChannelFilter)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'walk-in', label: 'Online sales' },
                { value: 'show', label: 'Card show' }
              ]}
            />
          </Field>
          <Field label="Admin">
            <SelectInput
              value={adminId}
              onValueChange={setAdminId}
              options={[
                { value: '', label: 'All' },
                ...(membershipsQuery.data || []).map((membership) => ({
                  value: membership.userId,
                  label: membership.displayName || membership.userId.slice(0, 8)
                }))
              ]}
            />
          </Field>
        </div>
        {timePeriod === 'custom' && (
          <div className="grid gap-2 min-[420px]:grid-cols-2">
            <Field label="Start date"><TextInput type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></Field>
            <Field label="End date"><TextInput type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></Field>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroMetric label="Revenue" value={formatMoney(metrics.revenue, symbol)} delta={compare(metrics.revenue, priorMetrics.revenue)} />
        <HeroMetric
          label="Gross profit"
          value={metrics.costUnknown ? 'Cost unknown' : formatMoney(metrics.grossProfit, symbol)}
          detail={metrics.costUnknown ? 'Historical sales need cost data' : `${formatPercent(metrics.margin)} margin`}
          delta={metrics.costUnknown || priorMetrics.costUnknown ? null : compare(metrics.grossProfit, priorMetrics.grossProfit)}
        />
        <HeroMetric
          label="Avg sale value"
          value={formatMoney(metrics.averageSaleValue, symbol)}
          detail={`${metrics.salesCount} sales / ${metrics.unitsSold} units`}
          delta={compare(metrics.averageSaleValue, priorMetrics.averageSaleValue)}
        />
        <HeroMetric
          label="Payment split"
          value={`${formatPercent(metrics.cashPercent, 0)} / ${formatPercent(metrics.cardPercent, 0)}`}
          detail={`${formatMoney(metrics.cashTotal, symbol)} cash / ${formatMoney(metrics.cardTotal, symbol)} card`}
        />
      </div>

      <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black">Inventory health</h3>
          <Link to="/inventory?aging=1" className="rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
            {inventoryHealth.agingCount} aging
          </Link>
        </div>
        <div className="mt-4 grid gap-3 text-sm">
          <HealthRow label="Capital tied up (cost)" value={formatMoney(inventoryHealth.costValue, symbol)} />
          <HealthRow label="Potential value (ask)" value={formatMoney(inventoryHealth.askValue, symbol)} />
          <HealthRow
            label="Unrealized margin"
            value={`${formatMoney(inventoryHealth.unrealizedMargin, symbol)} / ${formatPercent(inventoryHealth.unrealizedMarginPercent)}`}
            accent
          />
          <HealthRow label="Units / distinct cards" value={`${inventoryHealth.units} / ${inventoryHealth.distinctItems}`} />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <h3 className="text-lg font-black">Revenue trend</h3>
        <div className="mt-4 grid h-56 grid-cols-6 items-end gap-2">
          {monthlyTrend.map((month) => (
            <div key={month.month} className="grid h-full min-w-0 content-end gap-2">
              <span className="truncate text-center text-xs font-bold text-slate-500">{formatMoney(month.revenue, symbol)}</span>
              <div className="flex min-h-0 items-end gap-1">
                <div
                  className={`min-h-2 flex-1 rounded-t ${month.current ? 'bg-sky-700' : 'bg-slate-200'}`}
                  style={{ height: `${month.revenueHeight}%` }}
                  title={`${month.label} revenue ${formatMoney(month.revenue, symbol)}`}
                />
                <div
                  className="min-h-2 flex-1 rounded-t bg-emerald-500"
                  style={{ height: `${month.profitHeight}%` }}
                  title={`${month.label} profit ${formatMoney(month.profit, symbol)}`}
                />
              </div>
              <span className={`truncate text-center text-sm font-black ${month.current ? 'text-sky-700' : 'text-slate-600'}`}>{month.shortLabel}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">Blue is revenue. Green is gross profit where cost is known.</p>
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <h3 className="text-lg font-black">Performance by show / channel</h3>
        <div className="mt-3 grid gap-2">
          {performanceRows.length === 0 && <p className="text-sm text-slate-600">No completed sales for this filter.</p>}
          {performanceRows.map((row) => (
            <div key={row.id} className="grid gap-1 rounded-md bg-slate-50 p-3 text-sm">
              <div className="flex min-w-0 justify-between gap-3">
                <strong className="min-w-0 break-words">{row.name}</strong>
                <strong className="shrink-0">{formatMoney(row.revenue, symbol)}</strong>
              </div>
              <p className="text-xs font-semibold text-slate-600">
                Profit {row.costUnknown ? 'cost unknown' : `${formatMoney(row.profit, symbol)} / ${formatPercent(row.margin)}`} / {row.count} sales
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <h3 className="text-lg font-black">Top sellers by profit</h3>
        <div className="mt-3 grid gap-2">
          {topSellers.length === 0 && <p className="text-sm text-slate-600">No line items for this filter.</p>}
          {topSellers.map((row) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md bg-slate-50 p-3 text-sm">
              <span className="min-w-0">
                <strong className="block break-words">{row.name}</strong>
                <span className="block text-xs text-slate-600">{row.units} units / {formatMoney(row.revenue, symbol)} revenue</span>
              </span>
              <strong>{row.costUnknown ? 'Unknown' : formatMoney(row.profit, symbol)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <h3 className="text-lg font-black">Needs attention</h3>
        <div className="mt-3 grid gap-2">
          {needsAttention.map((item) => (
            <Link key={item.label} to={item.to} className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md bg-slate-50 p-3 text-sm font-semibold">
              {item.icon}
              <span className="break-words">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function HeroMetric({ label, value, detail, delta }: { label: string; value: string; detail?: string; delta?: number | null }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white p-3 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-black">{value}</p>
      {detail && <p className="mt-1 text-sm font-bold text-slate-500">{detail}</p>}
      {delta !== undefined && delta !== null && (
        <p className={`mt-2 flex items-center gap-1 text-sm font-black ${delta >= 0 ? 'text-action' : 'text-danger'}`}>
          {delta >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          {Math.abs(delta).toFixed(0)}% vs prior period
        </p>
      )}
    </div>
  );
}

function HealthRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 border-b border-line/70 pb-2 last:border-b-0 last:pb-0">
      <span className="min-w-0 break-words font-semibold text-slate-600">{label}</span>
      <strong className={`text-right ${accent ? 'text-action' : ''}`}>{value}</strong>
    </div>
  );
}

function buildPeriod(timePeriod: TimePeriod, activeShow: ShowEvent | null, customStart: string, customEnd: string) {
  const today = getLocalDateKey();
  if (timePeriod === 'today') return { start: today, end: today, kind: 'date' as const, label: 'Today' };
  if (timePeriod === 'show' && activeShow) return { start: activeShow.startDate, end: activeShow.endDate, kind: 'date' as const, eventId: activeShow.id, label: activeShow.name };
  if (timePeriod === 'custom') return { start: customStart, end: customEnd < customStart ? customStart : customEnd, kind: 'date' as const, label: `${customStart} to ${customEnd}` };
  const month = getLocalMonthKey();
  return { start: `${month}-01`, end: lastDayOfMonth(month), kind: 'month' as const, label: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`)) };
}

function buildPriorPeriod(timePeriod: TimePeriod, period: ReturnType<typeof buildPeriod>, activeShow: ShowEvent | null, events: ShowEvent[]) {
  if (timePeriod === 'show' && activeShow) {
    const previous = events
      .filter((event) => event.startDate < activeShow.startDate)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    if (previous) return { start: previous.startDate, end: previous.endDate, kind: 'date' as const, eventId: previous.id, label: previous.name };
  }
  const start = new Date(`${period.start}T00:00:00`);
  const end = new Date(`${period.end}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const priorEnd = new Date(start);
  priorEnd.setDate(priorEnd.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorStart.getDate() - days + 1);
  return { start: getLocalDateKey(priorStart), end: getLocalDateKey(priorEnd), kind: period.kind, label: 'Prior period' };
}

function filterSales(
  transactions: Transaction[],
  eventsById: ReadonlyMap<string, ShowEvent>,
  period: { start: string; end: string; kind: 'date' | 'month'; eventId?: string },
  channel: ChannelFilter,
  adminId: string
) {
  return transactions.filter((tx) => {
    if (tx.status !== 'completed') return false;
    if (adminId && tx.createdBy !== adminId) return false;
    if (channel === 'walk-in' && tx.eventId) return false;
    if (channel === 'show' && !tx.eventId) return false;
    if (period.eventId && tx.eventId !== period.eventId) return false;
    if (period.kind === 'month' && tx.eventId && !period.eventId) {
      const revenueMonth = getRevenueMonth(tx, eventsById);
      return revenueMonth >= period.start.slice(0, 7) && revenueMonth <= period.end.slice(0, 7);
    }
    const transactionDate = getLocalDateKey(tx.createdAt);
    return transactionDate >= period.start && transactionDate <= period.end;
  });
}

function summarizeSales(rows: Transaction[]) {
  const revenue = rows.reduce((sum, tx) => sum + tx.total, 0);
  const costUnknown = rows.some((tx) => tx.costUnknown);
  const grossProfit = costUnknown ? 0 : rows.reduce((sum, tx) => sum + tx.grossProfit, 0);
  const unitsSold = rows.reduce((sum, tx) => sum + tx.lineItems.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
  const cashTotal = rows.filter((tx) => tx.paymentMethod === 'cash').reduce((sum, tx) => sum + tx.total, 0);
  const cardTotal = rows.filter((tx) => tx.paymentMethod === 'card').reduce((sum, tx) => sum + tx.total, 0);
  return {
    revenue,
    grossProfit,
    costUnknown,
    margin: revenue > 0 ? grossProfit / revenue * 100 : 0,
    salesCount: rows.length,
    unitsSold,
    averageSaleValue: rows.length ? revenue / rows.length : 0,
    cashTotal,
    cardTotal,
    cashPercent: revenue > 0 ? cashTotal / revenue * 100 : 0,
    cardPercent: revenue > 0 ? cardTotal / revenue * 100 : 0
  };
}

function summarizeInventory(items: InventoryItem[], agingDays: number) {
  const inStock = items.filter((item) => item.quantity > 0 && item.status === 'in_stock');
  const costValue = inStock.reduce((sum, item) => sum + item.quantity * (item.costBasis || 0), 0);
  const askValue = inStock.reduce((sum, item) => sum + item.quantity * item.askingPrice, 0);
  const cutoff = Date.now() - agingDays * 86400000;
  return {
    costValue,
    askValue,
    unrealizedMargin: askValue - costValue,
    unrealizedMarginPercent: askValue > 0 ? (askValue - costValue) / askValue * 100 : 0,
    units: inStock.reduce((sum, item) => sum + item.quantity, 0),
    distinctItems: inStock.length,
    agingCount: inStock.filter((item) => new Date(item.createdAt).getTime() <= cutoff).length
  };
}

function buildMonthlyTrend(transactions: Transaction[], eventsById: ReadonlyMap<string, ShowEvent>, channel: ChannelFilter, adminId: string) {
  const current = getLocalMonthKey();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${current}-01T00:00:00`);
    date.setMonth(date.getMonth() - (5 - index));
    return getLocalMonthKey(date);
  });
  const values = months.map((month) => {
    const sales = transactions.filter((tx) =>
      tx.status === 'completed' &&
      getRevenueMonth(tx, eventsById) === month &&
      (!adminId || tx.createdBy === adminId) &&
      (channel === 'all' || (channel === 'walk-in' ? !tx.eventId : Boolean(tx.eventId)))
    );
    const revenue = sales.reduce((sum, tx) => sum + tx.total, 0);
    const profit = sales.some((tx) => tx.costUnknown) ? 0 : sales.reduce((sum, tx) => sum + tx.grossProfit, 0);
    return { month, revenue, profit };
  });
  const max = Math.max(1, ...values.map((row) => Math.max(row.revenue, row.profit)));
  return values.map((row) => {
    const label = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(`${row.month}-01T00:00:00`));
    return {
      ...row,
      current: row.month === current,
      label,
      shortLabel: label.split(' ')[0],
      revenueHeight: Math.max(6, row.revenue / max * 100),
      profitHeight: Math.max(6, row.profit / max * 100)
    };
  });
}

function buildPerformanceRows(rows: Transaction[], eventsById: ReadonlyMap<string, ShowEvent>) {
  const map = new Map<string, { id: string; name: string; count: number; revenue: number; profit: number; costUnknown: boolean }>();
  rows.forEach((tx) => {
    const id = tx.eventId || 'walk-in';
    const name = tx.eventId ? eventsById.get(tx.eventId)?.name || 'Unknown show' : 'Online sales';
    const current = map.get(id) || { id, name, count: 0, revenue: 0, profit: 0, costUnknown: false };
    current.count += 1;
    current.revenue += tx.total;
    current.profit += tx.costUnknown ? 0 : tx.grossProfit;
    current.costUnknown = current.costUnknown || tx.costUnknown;
    map.set(id, current);
  });
  return [...map.values()]
    .map((row) => ({ ...row, margin: row.revenue > 0 ? row.profit / row.revenue * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildTopSellers(rows: Transaction[]) {
  const map = new Map<string, { id: string; name: string; units: number; revenue: number; profit: number; costUnknown: boolean }>();
  rows.forEach((tx) => tx.lineItems.forEach((line) => {
    const id = line.inventoryItemId || `misc:${line.itemNameSnapshot}`;
    const current = map.get(id) || { id, name: line.itemNameSnapshot, units: 0, revenue: 0, profit: 0, costUnknown: false };
    current.units += line.quantity;
    current.revenue += line.lineTotal;
    current.profit += line.costUnknown ? 0 : line.lineProfit;
    current.costUnknown = current.costUnknown || Boolean(line.costUnknown || tx.costUnknown);
    map.set(id, current);
  }));
  return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, 8);
}

function buildAttentionItems(items: InventoryItem[], events: ShowEvent[], agingDays: number, queued: unknown[]) {
  const cutoff = Date.now() - agingDays * 86400000;
  const slowMovers = items.filter((item) => item.quantity > 0 && new Date(item.createdAt).getTime() <= cutoff).length;
  const belowMarket = items.filter((item) => item.marketPrice != null && item.askingPrice < item.marketPrice).length;
  const missingFloor = items.filter((item) => item.quantity > 0 && !item.floorPrice).length;
  const upcoming = events
    .filter((event) => new Date(`${event.startDate}T00:00:00`).getTime() >= Date.now() - 86400000)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return [
    { label: `${slowMovers} slow movers unsold ${agingDays}+ days / review for discounting`, to: '/inventory?aging=1', icon: <TrendingDown className="text-warn" size={18} /> },
    { label: upcoming ? `${upcoming.name} starts ${upcoming.startDate} / print labels and set floor prices` : `${missingFloor} items need floor prices before the next show`, to: '/labels', icon: <Printer className="text-sky-700" size={18} /> },
    { label: `${belowMarket} cards priced below market / reprice to capture margin`, to: '/inventory?belowMarket=1', icon: <RefreshCcw className="text-slate-500" size={18} /> },
    { label: `${queued.length} pending offline sales to sync`, to: '/sell', icon: <AlertTriangle className={queued.length ? 'text-danger' : 'text-slate-400'} size={18} /> }
  ];
}

function compare(current: number, prior: number) {
  if (prior === 0) return current > 0 ? 100 : 0;
  return (current - prior) / Math.abs(prior) * 100;
}

function pickActiveShow(events: ShowEvent[], activeEventId?: string | null) {
  if (activeEventId) return events.find((event) => event.id === activeEventId) || null;
  const today = getLocalDateKey();
  return events.find((event) => event.startDate <= today && event.endDate >= today) ||
    events.filter((event) => event.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ||
    events[0] ||
    null;
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return getLocalDateKey(new Date(year, monthNumber, 0));
}

function channelLabel(channel: ChannelFilter) {
  if (channel === 'walk-in') return 'Online sales';
  if (channel === 'show') return 'Card show';
  return 'All channels';
}
