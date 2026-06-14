import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Field, SelectInput, TextInput } from '../components/Field';
import { formatEventPeriod } from '../lib/events/dateRange';
import { listEvents, listTransactions, voidSale } from '../lib/supabase/api';
import { useMembershipsQuery, useOrg } from '../lib/org/OrgProvider';

export function HistoryScreen() {
  const { organization } = useOrg();
  const [date, setDate] = useState('');
  const [eventId, setEventId] = useState('');
  const [adminId, setAdminId] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 500) });
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const membershipsQuery = useMembershipsQuery();
  const mutation = useMutation({
    mutationFn: (id: string) => voidSale(organization.id, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['history', organization.id] });
      await queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });
    }
  });
  const rows = (query.data || []).filter((tx) =>
    (!date || tx.createdAt.slice(0, 10) === date) &&
    (!eventId || tx.eventId === eventId) &&
    (!adminId || tx.createdBy === adminId)
  );
  const eventLabels = useMemo(
    () => new Map((eventsQuery.data || []).map((event) => [event.id, `${event.name} / ${formatEventPeriod(event)}`])),
    [eventsQuery.data]
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:flex md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-black">History</h2>
          <p className="text-sm text-slate-600">{rows.length} transactions</p>
        </div>
        <div className="grid gap-2 min-[400px]:grid-cols-2 md:grid-cols-3">
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Event">
            <SelectInput
              value={eventId}
              onValueChange={setEventId}
              options={[
                { value: '', label: 'All shows' },
                ...(eventsQuery.data || []).map((event) => ({ value: event.id, label: `${event.name} / ${formatEventPeriod(event)}` }))
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
                <p className="font-black">${tx.total.toFixed(2)} <span className="text-sm font-semibold text-slate-500">{tx.paymentMethod}</span></p>
                <p className="text-xs text-slate-600">{new Date(tx.createdAt).toLocaleString()}</p>
                <p className="mt-1 inline-flex max-w-full break-words rounded bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800">
                  {tx.eventId ? eventLabels.get(tx.eventId) || 'Unknown show' : 'No show assigned'}
                </p>
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
                  <span className="min-w-0 break-words">{line.cardNameSnapshot} / <span className="break-all">{line.itemNumberSnapshot}</span> / {line.raritySnapshot} {line.artSnapshot} x {line.quantity}</span>
                  <strong className="whitespace-nowrap">${line.lineTotal.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
