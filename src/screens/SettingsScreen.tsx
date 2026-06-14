import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Field, SelectInput, TextInput } from '../components/Field';
import { getSettings, listEvents, updateSettings } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';
import type { CardLanguage } from '../types/domain';
import { isLocalDemoMode } from '../lib/supabase/client';
import { resetLocalDatabase } from '../lib/local/localDatabase';

export function SettingsScreen() {
  const { organization, isOwner } = useOrg();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const [currency, setCurrency] = useState('USD');
  const [defaultCondition, setDefaultCondition] = useState('NM');
  const [defaultLanguage, setDefaultLanguage] = useState<CardLanguage>('EN');
  const [activeEventId, setActiveEventId] = useState('');
  const [labelSheetPreset, setLabelSheetPreset] = useState('30-up-avery-5160');
  const [pricingApiKey, setPricingApiKey] = useState('');

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    setCurrency(settings.currency);
    setDefaultCondition(settings.defaultCondition);
    setDefaultLanguage(settings.defaultLanguage);
    setActiveEventId(settings.activeEventId || '');
    setLabelSheetPreset(settings.labelSheetPreset);
    setPricingApiKey(settings.pricingApiKey || '');
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: () => updateSettings(organization.id, { currency, defaultCondition, defaultLanguage, activeEventId, labelSheetPreset, pricingApiKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', organization.id] })
  });

  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-black">Settings</h2>
      {!isOwner && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Only owners can change settings.</p>}
      <form className="grid gap-3 rounded-lg border border-line bg-white p-3" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <div className="grid gap-3 min-[400px]:grid-cols-2">
          <Field label="Currency"><TextInput value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} disabled={!isOwner} /></Field>
          <Field label="Default condition"><TextInput value={defaultCondition} onChange={(event) => setDefaultCondition(event.target.value)} disabled={!isOwner} /></Field>
        </div>
        <div className="grid gap-3 min-[400px]:grid-cols-2">
          <Field label="Default language">
            <SelectInput
              value={defaultLanguage}
              onValueChange={(value) => setDefaultLanguage(value as CardLanguage)}
              disabled={!isOwner}
              options={[
                { value: 'EN', label: 'English' },
                { value: 'JP', label: 'Japanese' },
                { value: 'OTHER', label: 'Other' }
              ]}
            />
          </Field>
          <Field label="Active event">
            <SelectInput
              value={activeEventId}
              onValueChange={setActiveEventId}
              disabled={!isOwner}
              options={[
                { value: '', label: 'None' },
                ...(eventsQuery.data || []).map((event) => ({ value: event.id, label: event.name }))
              ]}
            />
          </Field>
        </div>
        <Field label="Label preset"><TextInput value={labelSheetPreset} onChange={(event) => setLabelSheetPreset(event.target.value)} disabled={!isOwner} /></Field>
        <Field label="Pricing API key"><TextInput value={pricingApiKey} onChange={(event) => setPricingApiKey(event.target.value)} disabled={!isOwner} /></Field>
        {mutation.error && <p className="text-sm text-danger">{mutation.error.message}</p>}
        <Button disabled={!isOwner || mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save settings'}</Button>
      </form>
      {isOwner && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-3">
          <h3 className="font-black text-danger">Danger zone</h3>
          {isLocalDemoMode ? (
            <>
              <p className="mt-1 text-sm text-red-800">Restore the original demo inventory and remove all local test sales.</p>
              <Button
                type="button"
                variant="danger"
                className="mt-3"
                onClick={() => {
                  if (!confirm('Reset all local demo data?')) return;
                  resetLocalDatabase();
                  window.location.reload();
                }}
              >
                Reset local demo
              </Button>
            </>
          ) : (
            <p className="mt-1 text-sm text-red-800">Bulk clearing is intentionally not automated in this version. Use Supabase backups before destructive maintenance.</p>
          )}
        </section>
      )}
    </div>
  );
}
