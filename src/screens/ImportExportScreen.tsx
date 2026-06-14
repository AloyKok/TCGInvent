import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Button } from '../components/Button';
import { Field, TextArea } from '../components/Field';
import { listInventory, listTransactions, saveInventoryItem, type InventoryInput } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';
import { useAuth } from '../lib/supabase/AuthProvider';
import type { CardArt, CardCategory, CardLanguage, CardRarity } from '../types/domain';

export function ImportExportScreen() {
  const { organization, isOwner } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<string[]>([]);
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'export'], queryFn: () => listInventory(organization.id) });
  const salesQuery = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 1000) });
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
            cardName: row.card_name,
            cardNumber: row.card_number,
            setName: row.set_name,
            rarity: (row.rarity || 'C') as CardRarity,
            art: (row.art || 'Base') as CardArt,
            language: (row.language || 'EN') as CardLanguage,
            category: (row.category || 'Character') as CardCategory,
            condition: row.condition || 'NM',
            gradeCompany: row.grade_company || null,
            grade: row.grade || null,
            quantity: Number(row.quantity || 1),
            costBasis: row.cost_basis ? Number(row.cost_basis) : null,
            askingPrice: Number(row.asking_price || 0),
            marketPrice: row.market_price ? Number(row.market_price) : null,
            imageUrl: row.image_url || null,
            notes: row.notes || null,
            status: 'in_stock'
          };
          if (!input.cardName || !input.setName || !input.cardNumber) throw new Error('missing required card fields');
          await saveInventoryItem(organization.id, user.id, input);
          messages.push(`Row ${index + 2}: imported ${input.cardName}`);
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
    card_name: item.cardName,
    card_number: item.cardNumber,
    set_name: item.setName,
    rarity: item.rarity,
    art: item.art,
    language: item.language,
    category: item.category,
    condition: item.condition,
    grade_company: item.gradeCompany || '',
    grade: item.grade || '',
    quantity: item.quantity,
    cost_basis: item.costBasis || '',
    asking_price: item.askingPrice,
    market_price: item.marketPrice || '',
    image_url: item.imageUrl || '',
    notes: item.notes || ''
  }))), [inventoryQuery.data]);
  const salesCsv = useMemo(() => Papa.unparse((salesQuery.data || []).flatMap((tx) =>
    tx.lineItems.map((line) => ({
      transaction_id: tx.id,
      created_at: tx.createdAt,
      status: tx.status,
      payment_method: tx.paymentMethod,
      total: tx.total,
      card_name: line.cardNameSnapshot,
      item_number: line.itemNumberSnapshot,
      rarity: line.raritySnapshot,
      art: line.artSnapshot,
      category: line.categorySnapshot,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: line.lineTotal,
      created_by: tx.createdBy
    }))
  )), [salesQuery.data]);

  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-black">Import / Export</h2>
      <section className="grid gap-3 rounded-lg border border-line bg-white p-3">
        <h3 className="font-black">CSV import</h3>
        <p className="break-words text-sm text-slate-600">Columns: item_number, card_name, card_number, set_name, rarity, art, language, category, condition, grade_company, grade, quantity, cost_basis, asking_price, market_price, image_url, notes. Leave item_number blank to auto-generate it.</p>
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
