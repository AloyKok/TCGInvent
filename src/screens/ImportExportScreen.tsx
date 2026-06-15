import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Button } from '../components/Button';
import { Field, TextArea } from '../components/Field';
import { getRevenueMonth } from '../lib/reports/revenuePeriods';
import { listEvents, listInventory, listTransactions, saveInventoryItem, type InventoryInput } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';
import { useAuth } from '../lib/supabase/AuthProvider';
import type {
  CardArt,
  CardCategory,
  CardLanguage,
  CardRarity,
  InventoryItemType,
  SealedProductType
} from '../types/domain';

export function ImportExportScreen() {
  const { organization, isOwner } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<string[]>([]);
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'export'], queryFn: () => listInventory(organization.id) });
  const salesQuery = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 5000) });
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      const messages: string[] = [];
      for (const [index, row] of parsed.data.entries()) {
        try {
          const input: InventoryInput = {
            itemNumber: row.item_number,
            autoGenerateItemNumber: !row.item_number,
            itemType: (row.item_type || 'single_card') as InventoryItemType,
            productCategory: (row.product_category || null) as SealedProductType | null,
            itemName: row.item_name || row.card_name,
            cardNumber: row.card_number || null,
            setName: row.set_name || null,
            rarity: row.rarity ? row.rarity as CardRarity : null,
            art: row.art ? row.art as CardArt : null,
            language: (row.language || 'EN') as CardLanguage,
            category: row.category ? row.category as CardCategory : null,
            condition: row.condition || (row.item_type === 'sealed_product' ? 'SEALED' : row.item_type === 'mystery_pack' ? 'NEW' : 'NM'),
            gradeCompany: row.grade_company || null,
            grade: row.grade || null,
            certNumber: row.cert_number || null,
            quantity: Number(row.quantity || 1),
            costBasis: row.cost_basis ? Number(row.cost_basis) : null,
            floorPrice: row.floor_price ? Number(row.floor_price) : null,
            askingPrice: Number(row.asking_price || 0),
            marketPrice: row.market_price ? Number(row.market_price) : null,
            location: row.location || null,
            acquisitionSource: row.acquisition_source || null,
            acquisitionDate: row.acquisition_date || null,
            listedOnline: row.listed_online === 'true' || row.listed_online === '1',
            tags: row.tags ? row.tags.split('|').map((tag) => tag.trim()).filter(Boolean) : [],
            imageUrl: row.image_url || null,
            notes: row.notes || null,
            status: 'in_stock'
          };
          if (!input.itemName) throw new Error('missing item_name');
          if (input.itemType === 'single_card' && (!input.setName || !input.cardNumber)) throw new Error('missing required card fields');
          if (input.itemType === 'sealed_product' && !input.productCategory) throw new Error('missing product_category');
          await saveInventoryItem(organization.id, user.id, input);
          messages.push(`Row ${index + 2}: imported ${input.itemName}`);
        } catch (error) {
          messages.push(`Row ${index + 2}: ${error instanceof Error ? error.message : 'failed'}`);
        }
      }
      setReport(messages);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] })
  });
  const inventoryCsv = useMemo(() => Papa.unparse((inventoryQuery.data || []).map((item) => ({
    item_number: item.itemNumber,
    qr_value: item.id,
    item_type: item.itemType,
    product_category: item.productCategory || '',
    item_name: item.itemName,
    card_number: item.cardNumber || '',
    set_name: item.setName || '',
    rarity: item.rarity || '',
    art: item.art || '',
    language: item.language,
    category: item.category || '',
    condition: item.condition,
    grade_company: item.gradeCompany || '',
    grade: item.grade || '',
    cert_number: item.certNumber || '',
    quantity: item.quantity,
    cost_basis: item.costBasis || '',
    floor_price: item.floorPrice || '',
    asking_price: item.askingPrice,
    market_price: item.marketPrice || '',
    location: item.location || '',
    acquisition_source: item.acquisitionSource || '',
    acquisition_date: item.acquisitionDate || '',
    listed_online: item.listedOnline ? 'true' : 'false',
    tags: item.tags.join('|'),
    image_url: item.imageUrl || '',
    notes: item.notes || ''
  }))), [inventoryQuery.data]);
  const salesCsv = useMemo(() => {
    const eventsById = new Map((eventsQuery.data || []).map((event) => [event.id, event]));
    return Papa.unparse((salesQuery.data || []).flatMap((tx) =>
      tx.lineItems.map((line) => ({
      transaction_id: tx.id,
      created_at: tx.createdAt,
      revenue_month: getRevenueMonth(tx, eventsById),
      sale_type: tx.eventId ? 'show' : 'daily',
      show_name: tx.eventId ? eventsById.get(tx.eventId)?.name || 'Unknown show' : '',
      status: tx.status,
      payment_method: tx.paymentMethod,
      total: tx.total,
      transaction_cost_total: tx.costTotal,
      transaction_gross_profit: tx.costUnknown ? '' : tx.grossProfit,
      cost_unknown: tx.costUnknown ? 'true' : 'false',
      item_name: line.itemNameSnapshot,
      item_type: line.itemTypeSnapshot,
      product_category: line.productCategorySnapshot || '',
      item_number: line.itemNumberSnapshot,
      rarity: line.raritySnapshot || '',
      art: line.artSnapshot || '',
      category: line.categorySnapshot || '',
      quantity: line.quantity,
      unit_price: line.unitPrice,
      unit_cost: line.costUnknown ? '' : line.unitCost,
      line_total: line.lineTotal,
      line_profit: line.costUnknown ? '' : line.lineProfit,
      created_by: tx.createdBy
    }))
    ));
  }, [eventsQuery.data, salesQuery.data]);

  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-black">Import / Export</h2>
      <section className="grid gap-3 rounded-lg border border-line bg-white p-3">
        <h3 className="font-black">CSV import</h3>
        <p className="break-words text-sm text-slate-600">Columns: item_number, item_type, product_category, item_name, card_number, set_name, rarity, art, language, category, condition, grade_company, grade, cert_number, quantity, cost_basis, floor_price, asking_price, market_price, location, acquisition_source, acquisition_date, listed_online, tags, image_url, notes. Use | between tags. Leave item_number blank to auto-generate it.</p>
        <Field label="Inventory CSV">
          <TextArea value={csv} onChange={(event) => setCsv(event.target.value)} />
        </Field>
        <Button onClick={() => importMutation.mutate()} disabled={!csv || importMutation.isPending}>Import inventory</Button>
        {report.length > 0 && <pre className="max-h-64 min-w-0 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-slate-950 p-3 text-xs text-white">{report.join('\n')}</pre>}
      </section>
      <ExportBlock title="Inventory CSV" text={inventoryCsv} filename="cardpulse-inventory.csv" />
      <ExportBlock title="Sales CSV" text={salesCsv} filename="cardpulse-sales.csv" />
      {isOwner && <ExportBlock title="Owner JSON backup" text={JSON.stringify({ inventory: inventoryQuery.data || [], sales: salesQuery.data || [] }, null, 2)} filename="cardpulse-backup.json" />}
    </div>
  );
}

function ExportBlock({ title, text, filename }: { title: string; text: string; filename: string }) {
  const download = () => {
    const blob = new Blob([text], { type: filename.endsWith('.json') ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="grid gap-3 rounded-lg border border-line bg-white p-3">
      <h3 className="font-black">{title}</h3>
      <Button variant="secondary" onClick={download}>Download</Button>
    </section>
  );
}
