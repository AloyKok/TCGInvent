import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Field, SelectInput, TextInput } from '../components/Field';
import { formatEventPeriod } from '../lib/events/dateRange';
import { formatMoney } from '../lib/format/money';
import {
  formatMonthLabel,
  getLocalDateKey,
  getLocalMonthKey,
  getRevenueMonth,
  matchesSaleScope
} from '../lib/reports/revenuePeriods';
import { getSettings, listEvents, listTransactions, voidSale } from '../lib/supabase/api';
import { useMembershipsQuery, useOrg } from '../lib/org/OrgProvider';

export function HistoryScreen() {
  const { organization } = useOrg();
  const [month, setMonth] = useState(getLocalMonthKey());
  const [date, setDate] = useState('');
  const [saleScope, setSaleScope] = useState('');
  const [adminId, setAdminId] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 5000) });
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const membershipsQuery = useMembershipsQuery();
  const mutation = useMutation({
    mutationFn: (id: string) => voidSale(organization.id, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['history', organization.id] });
      await queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });
    }
  });
  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const rows = (query.data || []).filter((tx) =>
    (!month || getRevenueMonth(tx, eventsById) === month) &&
    (!date || getLocalDateKey(tx.createdAt) === date) &&
    matchesSaleScope(tx, saleScope) &&
    (!adminId || tx.createdBy === adminId)
  );
  const completedRows = rows.filter((tx) => tx.status === 'completed');
  const completedRevenue = completedRows.reduce((sum, tx) => sum + tx.total, 0);
  const symbol = settingsQuery.data?.currencySymbol || 'S$';
  const eventLabels = useMemo(
    () => new Map(events.map((event) => [event.id, `${event.name} / ${formatEventPeriod(event)}`])),
    [events]
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:flex md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-black">History</h2>
          <p className="text-sm text-slate-600">
            {rows.length} transactions / {formatMoney(completedRevenue, symbol)} completed revenue
          </p>
        </div>
        <div className="grid gap-2 min-[400px]:grid-cols-2 xl:grid-cols-4">
          <Field label="Revenue month">
            <TextInput type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
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
          <Field label="Admin">
            <SelectInput
              value={adminId}
              onValueChange={setAdminId}
              options={[
                { value: '', label: 'All admins' },
                ...(membershipsQuery.data || []).map((membership) => ({
                  value: membership.userId,
                  label: membership.displayName || membership.userId.slice(0, 8)
                }))
              ]}
            />
          </Field>
        </div>
      </div>
      <div className="grid gap-3">
        {rows.map((tx) => (
          <article key={tx.id} className="rounded-lg border border-line bg-white p-3">
            <div className="flex min-w-0 justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black">{formatMoney(tx.total, symbol)} <span className="text-sm font-semibold text-slate-500">{tx.paymentMethod}</span></p>
                <p className="text-xs font-semibold text-slate-600">
                  Gross profit: {tx.costUnknown ? 'cost unknown' : `${formatMoney(tx.grossProfit, symbol)} / cost ${formatMoney(tx.costTotal, symbol)}`}
                </p>
                <p className="text-xs text-slate-600">{new Date(tx.createdAt).toLocaleString()}</p>
                <p className="mt-1 inline-flex max-w-full break-words rounded bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800">
                  {tx.eventId ? eventLabels.get(tx.eventId) || 'Unknown show' : 'Daily sale'}
                </p>
                {tx.eventId && (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Revenue month: {formatMonthLabel(getRevenueMonth(tx, eventsById))} (show start)
                  </p>
                )}
                <p className={`mt-1 text-xs font-bold ${tx.status === 'completed' ? 'text-action' : 'text-danger'}`}>{tx.status}</p>
              </div>
              {tx.status === 'completed' && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (confirm('Void this sale and restock its line items?')) mutation.mutate(tx.id);
                  }}
                >
                  Void
                </Button>
              )}
            </div>
            <div className="mt-3 grid gap-1">
              {tx.lineItems.map((line) => (
                <div key={`${tx.id}-${line.inventoryItemId}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md bg-slate-50 p-2 text-sm">
                  <span className="min-w-0 break-words">
                    {line.itemNameSnapshot} / <span className="break-all">{line.itemNumberSnapshot}</span>
                    {line.raritySnapshot ? ` / ${line.raritySnapshot} ${line.artSnapshot || ''}` : ''} x {line.quantity}
                  </span>
                  <span className="text-right">
                    <strong className="block whitespace-nowrap">{formatMoney(line.lineTotal, symbol)}</strong>
                    <span className="block text-xs font-semibold text-slate-500">
                      {line.costUnknown ? 'cost unknown' : `Profit ${formatMoney(line.lineProfit, symbol)}`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
