import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Edit3, Package, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Field, SelectInput, TextArea, TextInput } from '../components/Field';
import { deleteInventoryItem, generateInventoryItemNumber, getSettings, listInventory, saveInventoryItem, type InventoryInput } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';
import { useAuth } from '../lib/supabase/AuthProvider';
import { formatMoney } from '../lib/format/money';
import type {
  CardArt,
  CardCategory,
  CardLanguage,
  CardRarity,
  InventoryFilters,
  InventoryItem,
  InventoryItemType,
  SealedProductType
} from '../types/domain';
import { cacheInventory } from '../lib/queue/offlineQueue';
import { ONE_PIECE_SET_NAMES } from '../lib/cards/onePieceMetadata';
import { inventoryItemTypeLabels, sealedProductTypeLabels, sealedProductTypeOptions } from '../lib/inventory/productTypes';

const emptyFilters: InventoryFilters = {
  search: '',
  itemType: '',
  setName: '',
  rarity: '',
  art: '',
  category: '',
  language: '',
  condition: '',
  status: '',
  lowStockOnly: false
};

const rarityOptions = ['C', 'UC', 'R', 'SR', 'SEC', 'Leader', 'Promo'].map((value) => ({ value, label: value }));
const artOptions = ['Base', 'Parallel', 'Manga'].map((value) => ({ value, label: value }));
const categoryOptions = ['Character', 'Leader', 'Event', 'Stage', 'DON'].map((value) => ({ value, label: value }));
const languageOptions = [
  { value: 'EN', label: 'English' },
  { value: 'JP', label: 'Japanese' },
  { value: 'OTHER', label: 'Other' }
];
const conditionOptions = ['NM', 'LP', 'MP', 'HP', 'DMG', 'GRADED'].map((value) => ({ value, label: value }));
const sealedConditionOptions = ['SEALED', 'OPENED', 'DAMAGED'].map((value) => ({ value, label: value }));
const itemTypeOptions = [
  { value: '', label: 'All item types' },
  { value: 'single_card', label: 'Single cards' },
  { value: 'sealed_product', label: 'Sealed products' },
  { value: 'mystery_pack', label: 'Mystery packs' }
];

export function InventoryScreen() {
  const { organization } = useOrg();
  const [filters, setFilters] = useState(emptyFilters);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
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

  const items = useMemo(() => {
    let rows = query.data || [];
    if (searchParams.get('aging')) {
      const cutoff = Date.now() - (settingsQuery.data?.agingThresholdDays || 60) * 86400000;
      rows = rows.filter((item) => item.quantity > 0 && new Date(item.createdAt).getTime() <= cutoff);
    }
    if (searchParams.get('belowMarket')) {
      rows = rows.filter((item) => item.quantity > 0 && item.marketPrice != null && item.askingPrice < item.marketPrice);
    }
    return rows;
  }, [query.data, searchParams, settingsQuery.data?.agingThresholdDays]);
  const filterOptions = useMemo(() => ({
    sets: [...new Set(items.map((item) => item.setName).filter((value): value is string => Boolean(value)))].sort(),
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
        {(searchParams.get('aging') || searchParams.get('belowMarket')) && (
          <button
            type="button"
            className="min-h-11 rounded-md bg-amber-50 px-3 text-left text-sm font-bold text-amber-900"
            onClick={() => setSearchParams({})}
          >
            Showing dashboard attention items / tap to clear
          </button>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
          <TextInput className="w-full pl-10" placeholder="Search name, product type, set or item number" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <SelectInput value={filters.itemType} onValueChange={(value) => setFilters({ ...filters, itemType: value })} options={itemTypeOptions} />
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
                  alt={`${item.itemName} preview`}
                  className="h-28 w-20 shrink-0 rounded-md border border-line bg-slate-50 object-contain sm:h-40 sm:w-28"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-black">{item.itemName}</p>
                <p className="break-all text-sm font-semibold text-slate-600">{item.itemNumber}</p>
                <p className="break-words text-sm font-semibold text-action">{inventoryItemTypeLabels[item.itemType]}</p>
                {item.itemType === 'single_card' ? (
                  <>
                    <p className="break-words text-sm text-slate-600">{item.cardNumber} / {item.setName} / {item.language}</p>
                    <p className="break-words text-sm text-slate-600">{item.rarity} / {item.art} / {item.category} / {item.condition} / qty {item.quantity}</p>
                  </>
                ) : (
                  <p className="break-words text-sm text-slate-600">
                    {item.productCategory ? `${sealedProductTypeLabels[item.productCategory]} / ` : ''}{item.language} / {item.condition} / qty {item.quantity}
                  </p>
                )}
                <div className="mt-2 sm:hidden">
                  <p className="text-lg font-black">{formatMoney(item.askingPrice, settingsQuery.data?.currencySymbol)}</p>
                  <p className={`text-xs font-bold ${item.status === 'in_stock' ? 'text-action' : 'text-warn'}`}>{item.status.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-lg font-black">{formatMoney(item.askingPrice, settingsQuery.data?.currencySymbol)}</p>
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
                  if (confirm(`Delete ${item.itemName} (${item.itemNumber})? Sales history snapshots stay intact.`)) deleteMutation.mutate(item);
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
  const [selectedType, setSelectedType] = useState<InventoryItemType | null>(item?.itemType || null);
  const [input, setInput] = useState<InventoryInput>({
    itemNumber: item?.itemNumber || '',
    autoGenerateItemNumber: !item,
    itemType: item?.itemType || 'single_card',
    productCategory: item?.productCategory || null,
    itemName: item?.itemName || '',
    cardNumber: item?.cardNumber || '',
    setName: item?.setName || '',
    rarity: item?.rarity || 'C',
    art: item?.art || 'Base',
    language: item?.language || 'EN',
    category: item?.category || 'Character',
    condition: item?.condition || 'NM',
    gradeCompany: item?.gradeCompany || '',
    grade: item?.grade || '',
    certNumber: item?.certNumber || '',
    quantity: item?.quantity ?? 1,
    costBasis: item?.costBasis || null,
    floorPrice: item?.floorPrice || null,
    askingPrice: item?.askingPrice ?? 0,
    marketPrice: item?.marketPrice || null,
    location: item?.location || '',
    acquisitionSource: item?.acquisitionSource || '',
    acquisitionDate: item?.acquisitionDate || '',
    listedOnline: item?.listedOnline || false,
    tags: item?.tags || [],
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
    const reference = input.itemType === 'single_card'
      ? input.cardNumber || ''
      : input.itemType === 'sealed_product'
        ? input.productCategory || ''
        : 'pack';
    if (!input.autoGenerateItemNumber || !reference.trim() || !input.condition.trim()) {
      setGeneratedItemNumber(input.itemNumber || '');
      return;
    }
    let cancelled = false;
    generateInventoryItemNumber(organization.id, input.itemType, reference, input.condition)
      .then((number) => {
        if (!cancelled) setGeneratedItemNumber(number);
      })
      .catch(() => {
        if (!cancelled) setGeneratedItemNumber('');
      });
    return () => {
      cancelled = true;
    };
  }, [input.autoGenerateItemNumber, input.cardNumber, input.condition, input.itemNumber, input.itemType, input.productCategory, organization.id]);
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
          if (!selectedType) return;
          mutation.mutate();
        }}
      >
        <div className="sticky -top-3 z-20 flex items-center justify-between border-b border-line bg-white py-2 sm:-top-4">
          <h3 id="inventory-form-title" className="text-xl font-black">{item ? 'Edit item' : 'Add item'}</h3>
          <button type="button" className="grid min-h-11 min-w-11 place-items-center" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        {!selectedType ? (
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-slate-600">What are you adding?</p>
            <ItemTypeChoice
              icon={<CreditCard size={24} />}
              title="Single card"
              description="One Piece singles with card number, set, rarity, art and condition."
              onClick={() => chooseItemType('single_card')}
            />
            <ItemTypeChoice
              icon={<Package size={24} />}
              title="Sealed product"
              description="Booster boxes, booster packs, starter decks, promo sets and collections."
              onClick={() => chooseItemType('sealed_product')}
            />
            <ItemTypeChoice
              icon={<Sparkles size={24} />}
              title="Mystery pack"
              description="Self-made mystery packs sold as your own product."
              onClick={() => chooseItemType('mystery_pack')}
            />
          </div>
        ) : (
          <>
            {!item && (
              <button
                type="button"
                className="min-h-11 rounded-md border border-line bg-slate-50 px-3 text-left text-sm font-semibold text-action"
                onClick={() => setSelectedType(null)}
              >
                {inventoryItemTypeLabels[selectedType]} · Change type
              </button>
            )}
            <Field label={selectedType === 'single_card' ? 'Card name' : 'Product name'}>
              <TextInput value={input.itemName} onChange={(e) => setInput({ ...input, itemName: e.target.value })} required />
            </Field>
            {selectedType === 'single_card' && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Card number"><TextInput value={input.cardNumber || ''} onChange={(e) => setInput({ ...input, cardNumber: e.target.value })} required /></Field>
                  <Field label="Set name">
                    <SelectInput
                      value={input.setName || ''}
                      onValueChange={(value) => setInput({ ...input, setName: value })}
                      placeholder="Select a set"
                      options={ONE_PIECE_SET_NAMES.map((value) => ({ value, label: value }))}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Field label="Rarity">
                    <SelectInput value={input.rarity || 'C'} onValueChange={(value) => setInput({ ...input, rarity: value as CardRarity })} options={rarityOptions} />
                  </Field>
                  <Field label="Art">
                    <SelectInput value={input.art || 'Base'} onValueChange={(value) => setInput({ ...input, art: value as CardArt })} options={artOptions} />
                  </Field>
                  <Field label="Language">
                    <SelectInput value={input.language} onValueChange={(value) => setInput({ ...input, language: value as CardLanguage })} options={languageOptions} />
                  </Field>
                  <Field label="Category">
                    <SelectInput value={input.category || 'Character'} onValueChange={(value) => setInput({ ...input, category: value as CardCategory })} options={categoryOptions} />
                  </Field>
                </div>
                <Field label="Condition">
                  <SelectInput value={input.condition} onValueChange={(value) => setInput({ ...input, condition: value })} options={conditionOptions} />
                </Field>
                {input.condition === 'GRADED' && (
                  <div className="grid gap-3 min-[380px]:grid-cols-2">
                    <Field label="Grade company"><TextInput value={input.gradeCompany || ''} onChange={(e) => setInput({ ...input, gradeCompany: e.target.value })} /></Field>
                    <Field label="Grade"><TextInput value={input.grade || ''} onChange={(e) => setInput({ ...input, grade: e.target.value })} /></Field>
                    <Field label="Cert number"><TextInput value={input.certNumber || ''} onChange={(e) => setInput({ ...input, certNumber: e.target.value })} /></Field>
                  </div>
                )}
              </>
            )}
            {selectedType === 'sealed_product' && (
              <div className="grid gap-3 min-[400px]:grid-cols-2">
                <Field label="Sealed product type">
                  <SelectInput
                    value={input.productCategory || ''}
                    onValueChange={(value) => setInput({ ...input, productCategory: value as SealedProductType })}
                    placeholder="Select product type"
                    options={sealedProductTypeOptions}
                  />
                </Field>
                <Field label="Condition">
                  <SelectInput value={input.condition} onValueChange={(value) => setInput({ ...input, condition: value })} options={sealedConditionOptions} />
                </Field>
              </div>
            )}
            {selectedType !== 'single_card' && (
              <Field label="Language">
                <SelectInput value={input.language} onValueChange={(value) => setInput({ ...input, language: value as CardLanguage })} options={languageOptions} />
              </Field>
            )}
        <div className="grid gap-3 min-[380px]:grid-cols-3">
          <Field label="Qty"><TextInput type="number" min={0} value={input.quantity} onChange={(e) => setInput({ ...input, quantity: Number(e.target.value) })} required /></Field>
          <Field label="Cost"><TextInput type="number" min={0} step="0.01" value={input.costBasis ?? ''} onChange={(e) => setInput({ ...input, costBasis: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Asking price"><TextInput type="number" min={0} step="0.01" value={input.askingPrice} onChange={(e) => setInput({ ...input, askingPrice: Number(e.target.value) })} required /></Field>
        </div>
        <div className="grid gap-3 rounded-md border border-line bg-slate-50 p-3">
          <p className="text-sm font-black">Optional sale controls</p>
          <div className="grid gap-3 min-[380px]:grid-cols-2">
            <Field label="Floor price"><TextInput type="number" min={0} step="0.01" value={input.floorPrice ?? ''} onChange={(e) => setInput({ ...input, floorPrice: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Location"><TextInput value={input.location || ''} onChange={(e) => setInput({ ...input, location: e.target.value })} placeholder="Binder A / page 4 / slot 2" /></Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={Boolean(input.listedOnline)}
              onChange={(e) => setInput({ ...input, listedOnline: e.target.checked })}
            />
            Listed online
          </label>
        </div>
        <div className="grid gap-3 rounded-md border border-line bg-slate-50 p-3">
          <p className="text-sm font-black">Optional acquisition details</p>
          <div className="grid gap-3 min-[380px]:grid-cols-2">
            <Field label="Acquisition source"><TextInput value={input.acquisitionSource || ''} onChange={(e) => setInput({ ...input, acquisitionSource: e.target.value })} placeholder="Vendor, trade, collection" /></Field>
            <Field label="Acquisition date"><TextInput type="date" value={input.acquisitionDate || ''} onChange={(e) => setInput({ ...input, acquisitionDate: e.target.value })} /></Field>
          </div>
          <Field label="Tags">
            <TextInput
              value={(input.tags || []).join(', ')}
              onChange={(e) => setInput({ ...input, tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
              placeholder="hot, showcase, discount"
            />
          </Field>
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
          <p className="mt-2 text-xs text-slate-500">
            {selectedType === 'single_card'
              ? 'Format: OP + card number + condition + sequence.'
              : selectedType === 'sealed_product'
                ? 'Format: SEALED + product type + sequence.'
                : 'Format: MYSTERY-PACK + sequence.'}
          </p>
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
          <Button
            className="flex-1"
            disabled={
              mutation.isPending ||
              !input.itemName.trim() ||
              (selectedType === 'single_card' && (!input.setName || !input.cardNumber)) ||
              (selectedType === 'sealed_product' && !input.productCategory)
            }
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
          </>
        )}
      </form>
    </div>
  );

  function chooseItemType(itemType: InventoryItemType) {
    setSelectedType(itemType);
    setInput((current) => ({
      ...current,
      itemType,
      productCategory: itemType === 'sealed_product' ? 'booster_box' : null,
      cardNumber: itemType === 'single_card' ? current.cardNumber : null,
      setName: itemType === 'single_card' ? current.setName : null,
      rarity: itemType === 'single_card' ? current.rarity || 'C' : null,
      art: itemType === 'single_card' ? current.art || 'Base' : null,
      category: itemType === 'single_card' ? current.category || 'Character' : null,
      condition: itemType === 'single_card' ? 'NM' : itemType === 'sealed_product' ? 'SEALED' : 'NEW'
    }));
  }
}

function ItemTypeChoice({
  icon,
  title,
  description,
  onClick
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="grid min-h-20 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-line bg-white p-3 text-left shadow-sm transition hover:border-action hover:bg-sky-50"
      onClick={onClick}
    >
      <span className="grid h-12 w-12 place-items-center rounded-md bg-slate-100 text-action">{icon}</span>
      <span className="min-w-0">
        <strong className="block">{title}</strong>
        <span className="mt-1 block text-sm text-slate-600">{description}</span>
      </span>
    </button>
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
