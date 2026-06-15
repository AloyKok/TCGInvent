import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, TextInput } from '../components/Field';
import { LabelCard } from '../components/LabelCard';
import { getSettings, listInventory } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';

export function LabelsScreen() {
  const { organization } = useOrg();
  const [search, setSearch] = useState('');
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'labels'], queryFn: () => listInventory(organization.id) });
  const currency = settingsQuery.data?.currency || 'USD';
  const items = (inventoryQuery.data || []).filter((item) =>
    [item.itemName, item.itemNumber, item.cardNumber, item.productCategory].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid gap-4">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 print:hidden">
        <div className="min-w-0">
          <h2 className="text-2xl font-black">Labels</h2>
          <p className="truncate text-sm text-slate-600">{settingsQuery.data?.labelSheetPreset || '30-up-avery-5160'}</p>
        </div>
        <Button className="flex shrink-0 items-center gap-2" onClick={() => window.print()}><Printer size={18} /> Print</Button>
      </div>
      <div className="print:hidden">
        <Field label="Filter labels">
          <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, item number or product type" />
        </Field>
      </div>
      <div className="label-sheet grid gap-2 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-3 print:gap-0">
        {items.map((item) => <LabelCard key={item.id} item={item} currency={currency} />)}
      </div>
    </div>
  );
}
