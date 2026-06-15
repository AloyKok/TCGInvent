import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Field, TextInput } from '../components/Field';
import { formatEventPeriod, getLocalDateInputValue } from '../lib/events/dateRange';
import { listEvents, listTransactions, saveEvent } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';

export function EventsScreen() {
  const { organization } = useOrg();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const today = getLocalDateInputValue();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [location, setLocation] = useState('');
  const query = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const salesQuery = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 5000) });
  const mutation = useMutation({
    mutationFn: () => saveEvent(organization.id, { name, startDate, endDate, location }),
    onSuccess: async () => {
      setName('');
      setLocation('');
      await queryClient.invalidateQueries({ queryKey: ['events', organization.id] });
    }
  });

  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-black">Events</h2>
      <form className="grid gap-3 rounded-lg border border-line bg-white p-3" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <Field label="Name"><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <div className="grid gap-3 min-[400px]:grid-cols-2">
          <Field label="Start date">
            <TextInput
              type="date"
              value={startDate}
              onChange={(event) => {
                const nextStartDate = event.target.value;
                setStartDate(nextStartDate);
                if (endDate < nextStartDate) setEndDate(nextStartDate);
              }}
              required
            />
          </Field>
          <Field label="End date">
            <TextInput type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
          </Field>
        </div>
        <Field label="Location"><TextInput value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
        {mutation.error && <p className="text-sm text-danger">{mutation.error.message}</p>}
        <Button disabled={mutation.isPending}>Add event</Button>
      </form>
      <div className="grid gap-2">
        {(query.data || []).map((event) => (
          <div key={event.id} className="rounded-lg border border-line bg-white p-3">
            <p className="font-black">{event.name}</p>
            <p className="text-sm text-slate-600">{formatEventPeriod(event)}{event.location ? ` / ${event.location}` : ''}</p>
            <p className="mt-2 text-sm font-semibold text-action">
              {summarizeEvent(salesQuery.data || [], event.id)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function summarizeEvent(transactions: Awaited<ReturnType<typeof listTransactions>>, eventId: string) {
  const rows = transactions.filter((tx) => tx.eventId === eventId && tx.status === 'completed');
  const total = rows.reduce((sum, tx) => sum + tx.total, 0);
  return `${rows.length} sales / $${total.toFixed(2)}`;
}
