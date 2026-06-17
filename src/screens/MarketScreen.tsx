import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RefreshCcw, Search } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, TextInput } from '../components/Field';
import { formatMoney } from '../lib/format/money';
import {
  getSettings,
  listInventory,
  listMarketMappings,
  listMarketPriceSnapshots,
  refreshYuyuteiMarket,
  saveMarketMapping,
  saveMarketSnapshot,
  searchYuyuteiMarket
} from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';
import type { InventoryItem, MarketPriceSnapshot, YuyuteiMarketCandidate } from '../types/domain';

export function MarketScreen() {
  const { organization } = useOrg();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeItemId, setActiveItemId] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [candidates, setCandidates] = useState<Record<string, YuyuteiMarketCandidate[]>>({});
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'market'], queryFn: () => listInventory(organization.id) });
  const mappingsQuery = useQuery({ queryKey: ['market-mappings', organization.id], queryFn: () => listMarketMappings(organization.id) });
  const snapshotsQuery = useQuery({ queryKey: ['market-snapshots', organization.id], queryFn: () => listMarketPriceSnapshots(organization.id) });
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const symbol = settingsQuery.data?.currencySymbol || 'S$';
  const snapshots = useMemo(() => snapshotsQuery.data || [], [snapshotsQuery.data]);

  const mappingsByItem = useMemo(() => new Map((mappingsQuery.data || []).map((mapping) => [mapping.inventoryItemId, mapping])), [mappingsQuery.data]);
  const latestByItem = useMemo(() => {
    const map = new Map<string, MarketPriceSnapshot>();
    snapshots.forEach((snapshot) => {
      if (!map.has(snapshot.inventoryItemId)) map.set(snapshot.inventoryItemId, snapshot);
    });
    return map;
  }, [snapshots]);
  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (inventoryQuery.data || [])
      .filter((item) => item.itemType === 'single_card')
      .filter((item) => !query || [item.itemName, item.itemNumber, item.cardNumber, item.setName, item.rarity, item.art].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [inventoryQuery.data, search]);

  const searchMutation = useMutation({
    mutationFn: async (item: InventoryItem) => ({ item, rows: await searchYuyuteiMarket(item) }),
    onSuccess: ({ item, rows }) => {
      setCandidates((current) => ({ ...current, [item.id]: rows }));
      setActiveItemId(item.id);
    }
  });
  const linkMutation = useMutation({
    mutationFn: async ({ item, candidate }: { item: InventoryItem; candidate: YuyuteiMarketCandidate }) => {
      await saveMarketMapping(organization.id, item.id, candidate);
      await saveMarketSnapshot(organization.id, item.id, candidate);
    },
    onSuccess: async () => {
      setManualUrl('');
      await invalidateMarket(queryClient, organization.id);
    }
  });
  const refreshMutation = useMutation({
    mutationFn: async ({ item, sourceUrl }: { item: InventoryItem; sourceUrl: string }) => {
      const candidate = await refreshYuyuteiMarket(sourceUrl);
      await saveMarketMapping(organization.id, item.id, candidate);
      await saveMarketSnapshot(organization.id, item.id, candidate);
    },
    onSuccess: async () => {
      setManualUrl('');
      await invalidateMarket(queryClient, organization.id);
    }
  });

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-2xl font-black">Market</h2>
        <p className="text-sm text-slate-600">Link Japanese cards to Yuyutei and cache the latest JPY price.</p>
      </div>

      <div className="rounded-lg border border-line bg-white p-3">
        <Field label="Filter cards">
          <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, item number, card number, set" />
        </Field>
      </div>

      <div className="grid gap-3">
        {items.map((item) => {
          const mapping = mappingsByItem.get(item.id);
          const latest = latestByItem.get(item.id);
          const rows = candidates[item.id] || [];
          const open = activeItemId === item.id;
          return (
            <article key={item.id} className="grid gap-3 rounded-lg border border-line bg-white p-3 shadow-sm">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div className="min-w-0">
                  <p className="break-words font-black">{item.itemName}</p>
                  <p className="break-all text-sm font-semibold text-slate-600">{item.cardNumber} / {item.rarity} / {item.art} / {item.condition}</p>
                  <p className="break-all text-xs text-slate-500">{item.itemNumber}</p>
                </div>
                <div className="text-right">
                  <p className="font-black">{formatMoney(item.askingPrice, symbol)}</p>
                  <p className="text-xs font-semibold text-slate-500">Your ask</p>
                </div>
              </div>

              <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm">
                <div className="flex min-w-0 justify-between gap-3">
                  <span className="font-semibold text-slate-600">Yuyutei mapping</span>
                  <strong className={`text-right ${mapping ? 'text-action' : 'text-warn'}`}>{mapping ? 'Linked' : 'Not linked'}</strong>
                </div>
                {mapping && (
                  <a className="inline-flex min-h-11 min-w-0 items-center gap-2 break-all text-sm font-bold text-sky-700" href={mapping.sourceUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} className="shrink-0" /> {mapping.displayName || mapping.sourceUrl}
                  </a>
                )}
                <div className="flex min-w-0 justify-between gap-3">
                  <span className="font-semibold text-slate-600">Latest price</span>
                  <strong className="text-right">
                    {latest ? `${formatJpy(latest.price)} ${latest.availability ? `/ ${latest.availability}` : ''}` : 'No snapshot'}
                  </strong>
                </div>
                {latest && <p className="text-xs font-semibold text-slate-500">Checked {new Date(latest.fetchedAt).toLocaleString()}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  variant="secondary"
                  className="flex items-center justify-center gap-2"
                  disabled={!item.cardNumber || searchMutation.isPending}
                  onClick={() => searchMutation.mutate(item)}
                >
                  <Search size={16} /> Search
                </Button>
                <Button
                  className="flex items-center justify-center gap-2"
                  disabled={!mapping || refreshMutation.isPending}
                  onClick={() => mapping && refreshMutation.mutate({ item, sourceUrl: mapping.sourceUrl })}
                >
                  <RefreshCcw size={16} /> Refresh
                </Button>
              </div>

              {open && (
                <div className="grid gap-3 rounded-md border border-line p-3">
                  <div className="grid gap-2">
                    <Field label="Link by Yuyutei card URL">
                      <div className="grid gap-2 min-[520px]:grid-cols-[minmax(0,1fr)_auto]">
                        <TextInput value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} placeholder="https://yuyu-tei.jp/sell/opc/card/op15/10010" />
                        <Button
                          disabled={!manualUrl || refreshMutation.isPending}
                          onClick={() => refreshMutation.mutate({ item, sourceUrl: manualUrl })}
                        >
                          Link URL
                        </Button>
                      </div>
                    </Field>
                  </div>

                  {searchMutation.error && <p className="text-sm text-danger">{searchMutation.error.message}</p>}
                  {linkMutation.error && <p className="text-sm text-danger">{linkMutation.error.message}</p>}
                  {refreshMutation.error && <p className="text-sm text-danger">{refreshMutation.error.message}</p>}

                  <div className="grid gap-2">
                    {rows.length === 0 && !searchMutation.isPending && <p className="text-sm text-slate-600">No search results loaded yet.</p>}
                    {searchMutation.isPending && <p className="text-sm text-slate-600">Searching Yuyutei...</p>}
                    {rows.map((candidate) => (
                      <button
                        key={`${candidate.mode}-${candidate.sourceUrl}`}
                        type="button"
                        className="grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-line bg-white p-3 text-left text-sm"
                        onClick={() => linkMutation.mutate({ item, candidate })}
                      >
                        <span className="min-w-0">
                          <strong className="block break-words">{candidate.mode === 'sell' ? 'Sale' : 'Buylist'} / {candidate.displayName}</strong>
                          <span className="block break-all text-xs text-slate-600">{candidate.cardNumber} / {candidate.sourceUrl}</span>
                        </span>
                        <strong>{formatJpy(candidate.price)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

async function invalidateMarket(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  await queryClient.invalidateQueries({ queryKey: ['market-mappings', orgId] });
  await queryClient.invalidateQueries({ queryKey: ['market-snapshots', orgId] });
}

function formatJpy(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}
