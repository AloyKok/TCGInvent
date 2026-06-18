import { handleYuyuteiMarket } from './yuyuteiMarketCore.js';

export default async function handler(request: { method?: string; body?: unknown }, response: {
  status: (code: number) => { json: (body: unknown) => void; end: () => void };
  setHeader: (name: string, value: string) => void;
}) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'method not allowed' });
    return;
  }

  try {
    const result = await handleYuyuteiMarket(request.body as { action?: string; cardNumber?: string; sourceUrl?: string });
    response.status(result.status).json(result.body);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Yuyutei returned 403')) {
      response.status(200).json({ error: error.message });
      return;
    }
    response.status(500).json({ error: error instanceof Error ? error.message : 'Yuyutei fetch failed' });
  }
}
