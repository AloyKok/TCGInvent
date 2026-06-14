import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, SelectInput, TextArea, TextInput } from '../components/Field';
import { deleteInventoryItem, generateInventoryItemNumber, listInventory, saveInventoryItem, type InventoryInput } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';
import { useAuth } from '../lib/supabase/AuthProvider';
import type { CardArt, CardCategory, CardLanguage, CardRarity, InventoryFilters, InventoryItem } from '../types/domain';
import { cacheInventory } from '../lib/queue/offlineQueue';
import { ONE_PIECE_SET_NAMES } from '../lib/cards/onePieceMetadata';

const emptyFilters: InventoryFilters = {
  search: '',
  setName: '',
  rarity: '',
  art: '',
  category: '',
  language: '',
  condition: '',
  status: '',
  lowStockOnly: false
};

const rarityOptions = ['C', 'UC', 'R', 'SR', 'SEC', 'L', 'P', 'TR', 'SP'].map((value) => ({ value, label: value }));
const artOptions = ['Base', 'Parallel', 'Manga'].map((value) => ({ value, label: value }));
const categoryOptions = ['Character', 'Leader', 'Event', 'Stage', 'DON'].map((value) => ({ value, label: value }));
const languageOptions = [
  { value: 'EN', label: 'English' },
  { value: 'JP', label: 'Japanese' },
  { value: 'OTHER', label: 'Other' }
];
const conditionOptions = ['NM', 'LP', 'MP', 'HP', 'DMG', 'GRADED'].map((value) => ({ value, label: value }));

export function InventoryScreen() {
  const { organization } = useOrg();
  const [filters, setFilters] = useState(emptyFilters);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['inventory', organization.id, filters],
    queryFn: async () => {
      const items = await listInventory(organization.id, filters);
      await cacheInventory(organization.id, items);
      return items;
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (item: InventoryItem) => deleteInventoryItem(organization.id, item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] })
  });

  const items = useMemo(() => query.data || [], [query.data]);
  const filterOptions = useMemo(() => ({
    sets: [...new Set(items.map((item) => item.setName))].sort(),
    conditions: [...new Set(items.map((item) => item.condition))].sort()
  }), [items]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">Inventory</h2>
          <p className="text-sm text-slate-600">{items.length} matching lines</p>
        </div>
        <Button className="flex items-center gap-2" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={18} /> Add
        </Button>
      </div>

      <div className="grid gap-3 rounded-lg border border-line bg-white p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
          <TextInput className="w-full pl-10" placeholder="Search name, set, card or item number" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <SelectInput value={filters.setName} onValueChange={(value) => setFilters({ ...filters, setName: value })} options={[{ value: '', label: 'All sets' }, ...filterOptions.sets.map((value) => ({ value, label: value }))]} />
          <SelectInput value={filters.rarity} onValueChange={(value) => setFilters({ ...filters, rarity: value })} options={[{ value: '', label: 'All rarities' }, ...rarityOptions]} />
          <SelectInput value={filters.art} onValueChange={(value) => setFilters({ ...filters, art: value })} options={[{ value: '', label: 'All art' }, ...artOptions]} />
          <SelectInput value={filters.category} onValueChange={(value) => setFilters({ ...filters, category: value })} options={[{ value: '', label: 'All categories' }, ...categoryOptions]} />
          <SelectInput value={filters.language} onValueChange={(value) => setFilters({ ...filters, language: value })} options={[{ value: '', label: 'All languages' }, ...languageOptions]} />
          <SelectInput value={filters.condition} onValueChange={(value) => setFilters({ ...filters, condition: value })} options={[{ value: '', label: 'All conditions' }, ...filterOptions.conditions.map((value) => ({ value, label: value }))]} />
          <SelectInput
            value={filters.status}
            onValueChange={(value) => setFilters({ ...filters, status: value })}
            options={[
              { value: '', label: 'Any status' },
              { value: 'in_stock', label: 'In stock' },
              { value: 'sold_out', label: 'Sold out' },
              { value: 'reserved', label: 'Reserved' }
            ]}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={filters.lowStockOnly} onChange={(event) => setFilters({ ...filters, lowStockOnly: event.target.checked })} />
          Low stock only
        </label>
      </div>

      {query.isLoading ? <p className="text-sm text-slate-600">Loading inventory...</p> : null}
      {query.error ? <p className="text-sm text-danger">{query.error.message}</p> : null}

      <div className="grid gap-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border border-line bg-white p-3 shadow-sm">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={`${item.cardName} preview`}
                  className="h-28 w-20 shrink-0 rounded-md border border-line bg-slate-50 object-contain sm:h-40 sm:w-28"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-black">{item.cardName}</p>
                <p className="break-all text-sm font-semibold text-slate-600">{item.itemNumber}</p>
                <p className="break-words text-sm text-slate-600">{item.cardNumber} / {item.setName} / {item.language}</p>
                <p className="break-words text-sm text-slate-600">{item.rarity} / {item.art} / {item.category} / {item.condition} / qty {item.quantity}</p>
                <div className="mt-2 sm:hidden">
                  <p className="text-lg font-black">${item.askingPrice.toFixed(2)}</p>
                  <p className={`text-xs font-bold ${item.status === 'in_stock' ? 'text-action' : 'text-warn'}`}>{item.status.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-lg font-black">${item.askingPrice.toFixed(2)}</p>
                <p className={`text-xs font-bold ${item.status === 'in_stock' ? 'text-action' : 'text-warn'}`}>{item.status.replace('_', ' ')}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button variant="secondary" className="flex items-center justify-center gap-2" onClick={() => { setEditing(item); setFormOpen(true); }}>
                <Edit3 size={16} /> Edit
              </Button>
              <Button
                variant="ghost"
                className="flex items-center justify-center gap-2 text-danger"
                onClick={() => {
                  if (confirm(`Delete ${item.cardName} (${item.itemNumber})? Sales history snapshots stay intact.`)) deleteMutation.mutate(item);
                }}
              >
                <Trash2 size={16} /> Delete
              </Button>
            </div>
          </article>
        ))}
      </div>

      {formOpen && (
        <InventoryForm
          item={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });
          }}
        />
      )}
    </div>
  );
}

function InventoryForm({ item, onClose, onSaved }: { item: InventoryItem | null; onClose: () => void; onSaved: () => void }) {
  const { organization } = useOrg();
  const { user } = useAuth();
  const [input, setInput] = useState<InventoryInput>({
    itemNumber: item?.itemNumber || '',
    autoGenerateItemNumber: !item,
    cardName: item?.cardName || '',
    cardNumber: item?.cardNumber || '',
    setName: item?.setName || '',
    rarity: item?.rarity || 'C',
    art: item?.art || 'Base',
    language: item?.language || 'EN',
    category: item?.category || 'Character',
    condition: item?.condition || 'NM',
    gradeCompany: item?.gradeCompany || '',
    grade: item?.grade || '',
    quantity: item?.quantity ?? 1,
    costBasis: item?.costBasis || null,
    askingPrice: item?.askingPrice ?? 0,
    marketPrice: item?.marketPrice || null,
    imageUrl: item?.imageUrl || '',
    notes: item?.notes || '',
    status: item?.status || 'in_stock'
  });
  const [generatedItemNumber, setGeneratedItemNumber] = useState(item?.itemNumber || '');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!input.autoGenerateItemNumber || !input.cardNumber.trim() || !input.condition.trim()) {
      setGeneratedItemNumber(input.itemNumber || '');
      return;
    }
    let cancelled = false;
    generateInventoryItemNumber(organization.id, input.cardNumber, input.condition)
      .then((number) => {
        if (!cancelled) setGeneratedItemNumber(number);
      })
      .catch(() => {
        if (!cancelled) setGeneratedItemNumber('');
      });
    return () => {
      cancelled = true;
    };
  }, [input.autoGenerateItemNumber, input.cardNumber, input.condition, input.itemNumber, organization.id]);
  const mutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Not signed in');
      return saveInventoryItem(organization.id, user.id, input, item?.id);
    },
    onSuccess: onSaved
  });

  return (
    <div className="fixed inset-0 z-50 flex min-w-0 items-start justify-center overflow-hidden bg-slate-950/50 sm:items-center sm:p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-form-title"
        className="grid max-h-dvh min-h-dvh w-full min-w-0 max-w-2xl gap-4 overflow-y-auto overscroll-contain bg-white p-3 shadow-soft sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="sticky -top-3 z-20 flex items-center justify-between border-b border-line bg-white py-2 sm:-top-4">
          <h3 id="inventory-form-title" className="text-xl font-black">{item ? 'Edit item' : 'Add item'}</h3>
          <button type="button" className="grid min-h-11 min-w-11 place-items-center" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <Field label="Card name"><TextInput value={input.cardName} onChange={(e) => setInput({ ...input, cardName: e.target.value })} required /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Card number"><TextInput value={input.cardNumber} onChange={(e) => setInput({ ...input, cardNumber: e.target.value })} required /></Field>
          <Field label="Set name">
            <SelectInput
              value={input.setName}
              onValueChange={(value) => setInput({ ...input, setName: value })}
              placeholder="Select a set"
              options={ONE_PIECE_SET_NAMES.map((value) => ({ value, label: value }))}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Rarity">
            <SelectInput value={input.rarity} onValueChange={(value) => setInput({ ...input, rarity: value as CardRarity })} options={rarityOptions} />
          </Field>
          <Field label="Art">
            <SelectInput value={input.art} onValueChange={(value) => setInput({ ...input, art: value as CardArt })} options={artOptions} />
          </Field>
          <Field label="Language">
            <SelectInput value={input.language} onValueChange={(value) => setInput({ ...input, language: value as CardLanguage })} options={languageOptions} />
          </Field>
          <Field label="Category">
            <SelectInput value={input.category} onValueChange={(value) => setInput({ ...input, category: value as CardCategory })} options={categoryOptions} />
          </Field>
        </div>
        <div className="grid gap-3 min-[380px]:grid-cols-3">
          <Field label="Condition">
            <SelectInput value={input.condition} onValueChange={(value) => setInput({ ...input, condition: value })} options={conditionOptions} />
          </Field>
          <Field label="Grade co."><TextInput value={input.gradeCompany || ''} onChange={(e) => setInput({ ...input, gradeCompany: e.target.value })} /></Field>
          <Field label="Grade"><TextInput value={input.grade || ''} onChange={(e) => setInput({ ...input, grade: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3 min-[380px]:grid-cols-3">
          <Field label="Qty"><TextInput type="number" min={0} value={input.quantity} onChange={(e) => setInput({ ...input, quantity: Number(e.target.value) })} required /></Field>
          <Field label="Cost"><TextInput type="number" min={0} step="0.01" value={input.costBasis ?? ''} onChange={(e) => setInput({ ...input, costBasis: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Ask"><TextInput type="number" min={0} step="0.01" value={input.askingPrice} onChange={(e) => setInput({ ...input, askingPrice: Number(e.target.value) })} required /></Field>
        </div>
        <div className="rounded-md border border-line p-3">
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={input.autoGenerateItemNumber}
              onChange={(e) => setInput({ ...input, autoGenerateItemNumber: e.target.checked })}
            />
            Auto-generate item number
          </label>
          <Field label="Item number">
            <TextInput
              value={input.autoGenerateItemNumber ? generatedItemNumber : input.itemNumber || ''}
              onChange={(e) => setInput({ ...input, itemNumber: e.target.value.toUpperCase() })}
              disabled={input.autoGenerateItemNumber}
              placeholder="OP-OP04-123-NM-001"
              required={!input.autoGenerateItemNumber}
            />
          </Field>
          <p className="mt-2 text-xs text-slate-500">Format: OP + card number + condition + sequence.</p>
        </div>
        <Field label="Photo">
          <TextInput
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setInput({ ...input, imageUrl: await fileToDataUrl(file) });
              } catch {
                alert('This photo could not be processed. Try a JPEG or PNG image.');
              }
            }}
          />
        </Field>
        {input.imageUrl && (
          <img
            src={input.imageUrl}
            alt="Item preview"
            className="h-auto max-h-[65dvh] w-full rounded-md border border-line bg-slate-50 object-contain"
          />
        )}
        <Field label="Notes"><TextArea value={input.notes || ''} onChange={(e) => setInput({ ...input, notes: e.target.value })} /></Field>
        {mutation.error && <p className="text-sm text-danger">{mutation.error.message}</p>}
        <div className="sticky bottom-0 flex gap-2 bg-white pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={mutation.isPending || !input.setName}>{mutation.isPending ? 'Saving...' : 'Save'}</Button>
        </div>
      </form>
    </div>
  );
}

async function fileToDataUrl(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to process image');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}
