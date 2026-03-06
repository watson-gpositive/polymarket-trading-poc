import { config } from '../utils/config.js';

async function jget(url) {
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function parseMaybeJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeMarket(m) {
  const outcomeNames = parseMaybeJsonArray(m?.outcomes);
  const outcomePrices = parseMaybeJsonArray(m?.outcomePrices);
  const outcomes = outcomeNames.map((name, i) => ({ name, price: outcomePrices[i] }));

  const title = m?.question ?? m?.title ?? m?.slug ?? 'unknown';
  const categoryRaw = `${m?.category ?? m?.tags?.[0] ?? ''}`.toLowerCase();
  return {
    id: m?.id ?? m?.conditionId ?? m?.slug,
    title,
    category: categoryRaw || 'unknown',
    outcomes,
    active: Boolean(m?.active) && !Boolean(m?.closed),
    raw: m
  };
}

export async function fetchActiveMarkets(limit = 300) {
  const candidates = [
    `${config.gammaBase}/markets?closed=false&active=true&archived=false&limit=${limit}`,
    `${config.gammaBase}/markets?active=true&limit=${limit}`,
    `${config.gammaBase}/events?closed=false&limit=${limit}`
  ];

  for (const u of candidates) {
    try {
      const data = await jget(u);
      const arr = Array.isArray(data) ? data : (data?.data ?? data?.markets ?? data?.events ?? []);
      return arr.map(normalizeMarket).filter(m => m.active);
    } catch {
    }
  }
  return [];
}

export async function fetchWalletProfile(address) {
  if (!address) return null;
  const url = `https://polymarket.com/@${address}`;
  return { address, source: url, note: 'Profile parsing via browser/API adapter pending' };
}
