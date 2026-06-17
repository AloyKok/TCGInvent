import { createClient } from '@supabase/supabase-js';
import { handleYuyuteiMarket, type YuyuteiMarketCandidate } from '../yuyuteiMarketCore.js';
import type { Database } from '../../src/types/database.js';

export const config = {
  maxDuration: 60
};

type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => { json: (body: unknown) => void; end: () => void };
};

type MarketMappingRow = {
  org_id: string;
  inventory_item_id: string;
  source_url: string;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.status(405).json({ error: 'method not allowed' });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    response.status(500).json({ error: 'CRON_SECRET is not configured' });
    return;
  }

  if (getHeader(request, 'authorization') !== `Bearer ${cronSecret}`) {
    response.status(401).json({ error: 'unauthorized' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    response.status(500).json({ error: 'Supabase server environment is not configured' });
    return;
  }

  const limit = clampPositiveInteger(process.env.MARKET_REFRESH_LIMIT, 150);
  const concurrency = clampPositiveInteger(process.env.MARKET_REFRESH_CONCURRENCY, 2);
  const supabase = createAdminClient(supabaseUrl, serviceRoleKey);

  const { data: mappings, error } = await supabase
    .from('market_mappings')
    .select('org_id, inventory_item_id, source_url')
    .eq('source', 'yuyutei')
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    response.status(500).json({ error: error.message });
    return;
  }

  const rows = (mappings || []) as MarketMappingRow[];
  const results = await runWithConcurrency(rows, concurrency, async (mapping) => refreshMapping(supabase, mapping));
  const refreshed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);

  response.status(200).json({
    ok: true,
    checkedAt: new Date().toISOString(),
    scheduledFor: '21:00 Asia/Singapore',
    scanned: rows.length,
    refreshed,
    failed: failed.length,
    errors: failed.slice(0, 10)
  });
}

async function refreshMapping(
  supabase: ReturnType<typeof createAdminClient>,
  mapping: MarketMappingRow
): Promise<{ ok: true; inventoryItemId: string } | { ok: false; inventoryItemId: string; error: string }> {
  try {
    const result = await handleYuyuteiMarket({ action: 'refresh', sourceUrl: mapping.source_url });
    if (result.status !== 200 || !('result' in result.body)) {
      const error = 'error' in result.body ? String(result.body.error) : 'Yuyutei refresh failed';
      throw new Error(error);
    }

    const candidate = result.body.result as YuyuteiMarketCandidate;
    const { error } = await supabase.from('market_price_snapshots').insert({
      org_id: mapping.org_id,
      inventory_item_id: mapping.inventory_item_id,
      source: 'yuyutei',
      source_url: candidate.sourceUrl,
      price: candidate.price,
      currency: candidate.currency,
      availability: candidate.availability || null,
      raw: candidate as unknown as Database['public']['Tables']['market_price_snapshots']['Insert']['raw']
    });
    if (error) throw error;

    return { ok: true, inventoryItemId: mapping.inventory_item_id };
  } catch (error) {
    return {
      ok: false,
      inventoryItemId: mapping.inventory_item_id,
      error: error instanceof Error ? error.message : 'Unknown refresh error'
    };
  }
}

async function runWithConcurrency<T, R>(rows: T[], concurrency: number, task: (row: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < rows.length) {
      const current = rows[index];
      index += 1;
      results.push(await task(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  return results;
}

function getHeader(request: ApiRequest, name: string) {
  const value = request.headers?.[name] || request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function clampPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function createAdminClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
