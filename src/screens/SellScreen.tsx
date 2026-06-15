import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, SelectInput, TextArea, TextInput } from '../components/Field';
import { QrScanner } from '../components/QrScanner';
import { formatEventPeriod } from '../lib/events/dateRange';
import { getCartSubtotal, useCartStore } from '../store/cartStore';
import { completeSale, listEvents, listInventory } from '../lib/supabase/api';
import { cacheInventory, getCachedInventory, queueSale, syncQueuedSales } from '../lib/queue/offlineQueue';
import { useOrg } from '../lib/org/OrgProvider';
import type { InventoryItem } from '../types/domain';

export function SellScreen() {
  const { organization } = useOrg();
  const queryClient = useQueryClient();
  const [scannerError, setScannerError] = useState('');
  const [manual, setManual] = useState('');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const cart = useCartStore();
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const inventoryQuery = useQuery({
    queryKey: ['inventory', organization.id, 'sell-cache'],
    queryFn: async () => {
      const items = await listInventory(organization.id);
      await cacheInventory(organization.id, items);
      return items;
    }
  });
  const inventory = useMemo(() => inventoryQuery.data || [], [inventoryQuery.data]);
  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const selectedEvent = events.find((event) => event.id === cart.eventId);
  const subtotal = getCartSubtotal(cart.lines);
  const total = Math.min(subtotal, Math.max(0, cart.finalTotal ?? subtotal));
  const discount = Math.max(0, subtotal - total);

  useEffect(() => {
    syncQueuedSales().then(() => queryClient.invalidateQueries({ queryKey: ['history', organization.id] })).catch(() => undefined);
  }, [organization.id, queryClient]);

  useEffect(() => {
    if (eventsQuery.isSuccess && cart.eventId && !events.some((event) => event.id === cart.eventId)) {
      cart.setEventId('');
    }
  }, [cart, events, eventsQuery.isSuccess]);

  const resolveItem = useCallback(async (code: string) => {
    const value = code.trim();
    const cached = inventory.length ? inventory : await getCachedInventory(organization.id);
    return cached.find((item) => item.id === value || item.itemNumber.toLowerCase() === value.toLowerCase()) || null;
  }, [inventory, organization.id]);

  const addScannedItem = useCallback(async (value: string) => {
    if (!selectedEvent) {
      showFeedback(setFlash, 'error', 'Select a card show before adding items');
      return;
    }
    const item = await resolveItem(value);
    if (!item) {
      showFeedback(setFlash, 'error', 'Item not found');
      return;
    }
    if (item.quantity <= 0 || item.status !== 'in_stock') {
      showFeedback(setFlash, 'error', `${item.itemName} is not available`);
      return;
    }
    cart.addItem(item, 1);
    showFeedback(setFlash, 'ok', `${item.itemName} $${item.askingPrice.toFixed(2)}`);
  }, [cart, resolveItem, selectedEvent]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEvent) throw new Error('Select a card show before completing the sale');
      if (!cart.lines.length) throw new Error('Cart is empty');
      const payload = {
        orgId: organization.id,
        cart: cart.lines.map((line) => ({ inventoryItemId: line.item.id, quantity: line.quantity })),
        discount,
        paymentMethod: cart.paymentMethod,
        eventId: selectedEvent.id,
        clientRef: crypto.randomUUID(),
        notes: cart.notes || null
      };

      if (!navigator.onLine) {
        await queueSale(payload);
        return { queued: true as const };
      }

      try {
        const transaction = await completeSale(payload);
        return { queued: false as const, transaction };
      } catch (error) {
        if (!navigator.onLine) {
          await queueSale(payload);
          return { queued: true as const };
        }
        throw error;
      }
    },
    onSuccess: async (result) => {
      cart.clear();
      await queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });
      await queryClient.invalidateQueries({ queryKey: ['history', organization.id] });
      showFeedback(setFlash, 'ok', result.queued ? 'Sale queued for sync' : 'Sale completed');
    }
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <section className="grid gap-4">
        <div>
          <h2 className="text-2xl font-black">Sell</h2>
          <p className="text-sm text-slate-600">Scan CardPulse labels or use manual lookup.</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-3 shadow-sm">
          <Field label="Card show">
            <SelectInput
              value={cart.eventId}
              onValueChange={(nextEventId) => {
                if (cart.lines.length && nextEventId !== cart.eventId) {
                  if (!confirm('Changing the show will clear the current cart. Continue?')) return;
                  cart.clear();
                }
                cart.setEventId(nextEventId);
                setFlash(null);
              }}
              options={[
                { value: '', label: 'Select a show before selling' },
                ...events.map((event) => ({
                  value: event.id,
                  label: `${event.name} / ${formatEventPeriod(event)}${event.location ? ` / ${event.location}` : ''}`
                }))
              ]}
            />
          </Field>
          {!eventsQuery.isLoading && events.length === 0 && (
            <Link to="/events" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-md bg-action px-4 py-2 text-sm font-semibold text-white">
              <CalendarDays size={18} /> Create first show
            </Link>
          )}
          {selectedEvent && (
            <p className="mt-2 text-sm font-semibold text-action">
              Sales will be recorded under {selectedEvent.name}.
            </p>
          )}
        </div>
        {selectedEvent ? (
          <>
            <QrScanner active onScan={addScannedItem} onError={setScannerError} />
            {scannerError && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{scannerError}</p>}
          </>
        ) : (
          <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-line bg-slate-50 p-6 text-center">
            <div>
              <CalendarDays className="mx-auto text-slate-400" size={32} />
              <p className="mt-2 font-bold">Select a card show to start selling</p>
              <p className="mt-1 text-sm text-slate-600">Scanner and manual lookup will unlock for that show.</p>
            </div>
          </div>
        )}
        {flash && (
          <div className={`rounded-lg p-3 text-sm font-bold ${flash.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-danger'}`}>
            {flash.text}
          </div>
        )}
        <form
          className="rounded-lg border border-line bg-white p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedEvent) return;
            addScannedItem(manual);
            setManual('');
          }}
        >
          <Field label="Manual add">
          <div className="flex min-w-0 gap-2">
              <TextInput
                className="min-w-0 flex-1"
                placeholder="Item number or QR UUID"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                disabled={!selectedEvent}
              />
              <Button className="grid min-w-11 place-items-center px-3" aria-label="Add manual item" disabled={!selectedEvent || !manual.trim()}>
                <Search size={18} />
              </Button>
            </div>
          </Field>
          {selectedEvent && <ManualResults items={inventory} query={manual} onAdd={addScannedItem} />}
        </form>
      </section>

      <aside className="grid content-start gap-3">
        <div className="rounded-lg border border-line bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black">Cart</h3>
            <p className="text-sm font-semibold text-slate-600">{cart.lines.length} lines</p>
          </div>
          <div className="mt-3 grid gap-2">
            {cart.lines.length === 0 && <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">Cart is empty.</p>}
            {cart.lines.map((line) => (
              <div key={line.item.id} className="min-w-0 rounded-md border border-line p-3">
                <div className="flex min-w-0 justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-bold">{line.item.itemName}</p>
                    <p className="break-all text-xs text-slate-600">{line.item.itemNumber}</p>
                    <p className="break-words text-xs text-slate-600">{line.item.rarity} / {line.item.art} / {line.item.category} / {line.item.condition}</p>
                    <p className="text-sm font-semibold">${line.item.askingPrice.toFixed(2)}</p>
                  </div>
                  <button className="grid min-h-11 min-w-11 place-items-center text-danger" onClick={() => cart.removeItem(line.item.id)} aria-label="Remove">
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line" onClick={() => cart.setQuantity(line.item.id, line.quantity - 1)} aria-label="Decrease">
                    <Minus size={16} />
                  </button>
                  <span className="text-lg font-black">{line.quantity}</span>
                  <button className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line" onClick={() => cart.setQuantity(line.item.id, line.quantity + 1)} aria-label="Increase">
                    <Plus size={16} />
                  </button>
                  <span className="ml-auto font-black">${(line.item.askingPrice * line.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-20 rounded-lg border border-line bg-white p-3 shadow-soft">
          <div className="grid gap-3">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Card show</p>
              <p className="mt-1 font-bold">{selectedEvent?.name || 'Not selected'}</p>
            </div>
            <div className="flex justify-between text-sm"><span>Subtotal</span><strong>${subtotal.toFixed(2)}</strong></div>
            <Field label="Final total">
              <TextInput
                type="number"
                min={0}
                max={subtotal}
                step="0.01"
                value={total}
                onChange={(event) => cart.setFinalTotal(Math.min(subtotal, Math.max(0, Number(event.target.value) || 0)))}
                disabled={!cart.lines.length}
              />
            </Field>
            {discount > 0 && <div className="flex justify-between text-sm text-action"><span>Price adjustment</span><strong>-${discount.toFixed(2)}</strong></div>}
            <Field label="Payment">
              <SelectInput
                value={cart.paymentMethod}
                onValueChange={(value) => cart.setPaymentMethod(value as typeof cart.paymentMethod)}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'card', label: 'Card' },
                  { value: 'other', label: 'Other' }
                ]}
              />
            </Field>
            <Field label="Notes">
              <TextArea value={cart.notes} onChange={(event) => cart.setNotes(event.target.value)} />
            </Field>
            {checkoutMutation.error && <p className="text-sm text-danger">{checkoutMutation.error.message}</p>}
            <Button className="min-h-14 text-base" disabled={!selectedEvent || !cart.lines.length || checkoutMutation.isPending} onClick={() => checkoutMutation.mutate()}>
              {checkoutMutation.isPending ? 'Completing...' : `Complete $${total.toFixed(2)}`}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ManualResults({ items, query, onAdd }: { items: InventoryItem[]; query: string; onAdd: (value: string) => void }) {
  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (value.length < 2) return [];
    return items
      .filter((item) => [item.itemName, item.itemNumber, item.cardNumber, item.productCategory].filter(Boolean).join(' ').toLowerCase().includes(value))
      .slice(0, 5);
  }, [items, query]);

  if (!results.length) return null;

  return (
    <div className="mt-3 grid gap-1">
      {results.map((item) => (
        <button key={item.id} type="button" className="min-h-11 min-w-0 rounded-md bg-slate-50 px-3 py-2 text-left text-sm" onClick={() => onAdd(item.id)}>
          <strong className="break-words">{item.itemName}</strong>
          <span className="block break-all text-xs text-slate-600">{item.itemNumber} / ${item.askingPrice.toFixed(2)}</span>
        </button>
      ))}
    </div>
  );
}

function showFeedback(setFlash: (value: { tone: 'ok' | 'error'; text: string }) => void, tone: 'ok' | 'error', text: string) {
  setFlash({ tone, text });
  if (tone === 'ok') {
    try {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = 880;
      oscillator.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.05);
    } catch {
      // Audio feedback is best-effort; vibration/visual feedback still run.
    }
  }
  navigator.vibrate?.(tone === 'ok' ? 40 : [30, 40, 30]);
}
