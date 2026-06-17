export interface YuyuteiMarketCandidate {
  source: 'yuyutei';
  mode: 'sell' | 'buy';
  sourceUrl: string;
  externalId?: string | null;
  cardNumber?: string | null;
  rarity?: string | null;
  name: string;
  displayName: string;
  price: number;
  currency: 'JPY';
  availability?: string | null;
  imageUrl?: string | null;
}

export async function handleYuyuteiMarket(body: { action?: string; cardNumber?: string; sourceUrl?: string }) {
  if (body.action === 'search') {
    const cardNumber = String(body.cardNumber || '').trim().toUpperCase();
    if (!cardNumber) return { status: 400, body: { error: 'cardNumber is required' } };
    const [sell, buy] = await Promise.all([
      searchYuyutei('sell', cardNumber),
      searchYuyutei('buy', cardNumber)
    ]);
    return { status: 200, body: { candidates: [...sell, ...buy] } };
  }

  if (body.action === 'refresh') {
    const sourceUrl = String(body.sourceUrl || '').trim();
    if (!isAllowedYuyuteiCardUrl(sourceUrl)) return { status: 400, body: { error: 'invalid Yuyutei card URL' } };
    return { status: 200, body: { result: await fetchYuyuteiDetail(sourceUrl) } };
  }

  return { status: 400, body: { error: 'unknown action' } };
}

async function searchYuyutei(mode: 'sell' | 'buy', cardNumber: string) {
  const url = `https://yuyu-tei.jp/${mode}/opc/s/search?search_word=${encodeURIComponent(cardNumber)}`;
  const html = await fetchHtml(url);
  return parseSearchCandidates(html, mode)
    .filter((candidate) => candidate.cardNumber?.toUpperCase() === cardNumber)
    .slice(0, 20);
}

async function fetchYuyuteiDetail(sourceUrl: string): Promise<YuyuteiMarketCandidate> {
  const html = await fetchHtml(sourceUrl);
  const mode = sourceUrl.includes('/buy/') ? 'buy' : 'sell';
  const product = parseJsonLdProduct(html);
  const fallback = parseDetailFallback(html, sourceUrl, mode);
  const price = product?.price ?? fallback.price;
  if (price == null || Number.isNaN(price)) throw new Error('Yuyutei price not found');

  const cardNumber = product?.description || fallback.cardNumber || null;
  const displayName = product?.name || fallback.displayName || 'Yuyutei card';
  const parsedName = splitDisplayName(displayName);

  return {
    source: 'yuyutei',
    mode,
    sourceUrl,
    externalId: externalIdFromUrl(sourceUrl),
    cardNumber,
    rarity: parsedName.rarity || fallback.rarity || null,
    name: parsedName.name || fallback.name || displayName,
    displayName,
    price,
    currency: 'JPY',
    availability: product?.availability || fallback.availability || null,
    imageUrl: product?.image || fallback.imageUrl || null
  };
}

function parseSearchCandidates(html: string, mode: 'sell' | 'buy'): YuyuteiMarketCandidate[] {
  const candidates: YuyuteiMarketCandidate[] = [];
  const seen = new Set<string>();
  const linkPattern = new RegExp(`https://yuyu-tei\\.jp/${mode}/opc/card/[^"'<\\s]+`, 'g');
  const links = html.match(linkPattern) || [];

  for (const sourceUrl of links) {
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    const index = html.indexOf(sourceUrl);
    const beforeLink = html.slice(Math.max(0, index - 1200), index);
    const beforeSection = html.slice(Math.max(0, index - 4000), index);
    const chunk = html.slice(Math.max(0, index - 1000), Math.min(html.length, index + 2600));
    const imageMatch = getCardImageMatch(beforeLink) || getCardImageMatch(chunk);
    const cardNumber = textFromMatch(chunk.match(/border[^>]*>\s*([A-Z]{1,4}\d{1,2}-\d{3})\s*<\/span>/i));
    const name = textFromMatch(chunk.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)) || parseAlt(imageMatch?.[2] || '').name;
    const rarity = getSectionRarity(beforeSection) || parseAlt(imageMatch?.[2] || '').rarity;
    const price = parseYen(chunk);
    if (!cardNumber || !name || price == null) continue;

    candidates.push({
      source: 'yuyutei',
      mode,
      sourceUrl,
      externalId: externalIdFromUrl(sourceUrl),
      cardNumber,
      rarity,
      name,
      displayName: [rarity, name].filter(Boolean).join(' '),
      price,
      currency: 'JPY',
      availability: parseAvailability(chunk),
      imageUrl: imageUrlFromYuyuteiUrl(sourceUrl) || imageMatch?.[1] || null
    });
  }

  return candidates;
}

function parseJsonLdProduct(html: string) {
  const scripts = collectMatches(html, /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(decodeHtml(script[1].trim()));
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const product = rows.find((row) => row?.['@type'] === 'Product');
      if (!product) continue;
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      return {
        name: String(product.name || ''),
        description: product.description ? String(product.description) : null,
        image: product.image ? String(product.image) : null,
        price: offer?.price == null ? null : Number(String(offer.price).replace(/,/g, '')),
        availability: offer?.availability ? String(offer.availability).replace(/^https?:\/\/schema\.org\//, '') : null
      };
    } catch {
      // Ignore non-product JSON-LD.
    }
  }
  return null;
}

function getCardImageMatch(chunk: string) {
  const matches = collectMatches(chunk, /<img[^>]+src="([^"]*card\.yuyu-tei\.jp[^"]+)"[^>]+alt="([^"]+)"/gi);
  return matches[matches.length - 1] || null;
}

function parseDetailFallback(html: string, sourceUrl: string, mode: 'sell' | 'buy') {
  const title = textFromMatch(html.match(/<h1[^>]*>\s*([\s\S]*?)\s*<\/h1>/i));
  const cardNumber = textFromMatch(html.match(/>\s*([A-Z]{1,4}\d{1,2}-\d{3})\s*<\/span>/i));
  const price = parseYen(html);
  const imageUrl = textFromMatch(html.match(/<img[^>]+class="[^"]*vimg[^"]*"[^>]+src="([^"]+)"/i));
  const parsed = splitDisplayName(title || '');
  return {
    source: 'yuyutei' as const,
    mode,
    sourceUrl,
    externalId: externalIdFromUrl(sourceUrl),
    cardNumber,
    rarity: parsed.rarity,
    name: parsed.name,
    displayName: title,
    price,
    availability: parseAvailability(html),
    imageUrl
  };
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'ja,en;q=0.8'
    }
  });
  if (!response.ok) throw new Error(`Yuyutei returned ${response.status}`);
  return await response.text();
}

function isAllowedYuyuteiCardUrl(url: string) {
  return /^https:\/\/yuyu-tei\.jp\/(sell|buy)\/opc\/card\/[a-z0-9-]+\/\d+\/?$/i.test(url);
}

function externalIdFromUrl(url: string) {
  const match = url.match(/\/(sell|buy)\/opc\/card\/([^/]+\/\d+)/i);
  return match?.[2] || null;
}

function imageUrlFromYuyuteiUrl(url: string) {
  const externalId = externalIdFromUrl(url);
  return externalId ? `https://card.yuyu-tei.jp/opc/100_140/${externalId}.jpg` : null;
}

function getSectionRarity(value: string) {
  const matches = collectMatches(value, />(P-[A-Z]+|SEC|SR|R|UC|C|L|SP)<\/span>\s*Card List/gi);
  return matches[matches.length - 1]?.[1] || null;
}

function parseAlt(value: string) {
  const parts = decodeHtml(value).trim().split(/\s+/);
  const cardNumber = parts.find((part) => /^[A-Z]{1,4}\d{1,2}-\d{3}$/i.test(part));
  const rarity = cardNumber ? parts[parts.indexOf(cardNumber) + 1] : null;
  const name = cardNumber ? parts.slice(parts.indexOf(cardNumber) + 2).join(' ') : decodeHtml(value).trim();
  return { cardNumber, rarity, name };
}

function splitDisplayName(value: string) {
  const cleaned = decodeHtml(value).replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^([A-Z]-?[A-Z]+|[A-Z]+)\s+(.+)$/);
  return {
    rarity: match?.[1] || null,
    name: match?.[2] || cleaned
  };
}

function parseYen(value: string) {
  const match = value.match(/([0-9][0-9,]*)\s*円/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function parseAvailability(value: string) {
  if (/在庫\s*:\s*◯/.test(value) || /InStock/.test(value)) return 'InStock';
  if (/在庫\s*:\s*×/.test(value) || /OutOfStock/.test(value)) return 'OutOfStock';
  return null;
}

function textFromMatch(match?: RegExpMatchArray | null) {
  return match?.[1] ? decodeHtml(stripTags(match[1])).trim() : null;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ');
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function collectMatches(value: string, pattern: RegExp) {
  const matches: RegExpMatchArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    matches.push(match);
  }
  return matches;
}
