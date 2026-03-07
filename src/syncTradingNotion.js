import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TRADING_PATH = path.resolve(ROOT, 'TRADING.md');
const PAGE_ID_PATH = path.resolve(ROOT, 'logs', 'notion-trading-page-id.txt');

const NOTION_TOKEN = process.env.NOTION_ACCESS_TOKEN || '';
const NOTION_VERSION = '2022-06-28';
const NOTION_PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID || '315b4225-f2d5-81d4-90f7-ccfcedfa708a';

async function notion(pathname, method = 'GET', body) {
  const res = await fetch(`https://api.notion.com/v1${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${pathname} ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}

function cleanId(id) {
  return String(id || '').trim().replace(/-/g, '');
}

function chunk(str, n = 1800) {
  const out = [];
  for (let i = 0; i < str.length; i += n) out.push(str.slice(i, i + n));
  return out;
}

async function ensurePageId() {
  if (process.env.NOTION_TRADING_PAGE_ID) return cleanId(process.env.NOTION_TRADING_PAGE_ID);
  if (fs.existsSync(PAGE_ID_PATH)) return cleanId(fs.readFileSync(PAGE_ID_PATH, 'utf8'));

  const created = await notion('/pages', 'POST', {
    parent: { page_id: cleanId(NOTION_PARENT_PAGE_ID) },
    properties: {
      title: {
        title: [{ text: { content: 'Polymarket Paper Trading' } }],
      },
    },
  });

  fs.mkdirSync(path.dirname(PAGE_ID_PATH), { recursive: true });
  fs.writeFileSync(PAGE_ID_PATH, created.id);
  return cleanId(created.id);
}

async function clearChildren(pageId) {
  const listed = await notion(`/blocks/${pageId}/children?page_size=100`);
  const children = listed.results || [];
  for (const b of children) {
    await notion(`/blocks/${b.id}`, 'DELETE');
  }
}

async function appendBlocks(pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 50) {
    await notion(`/blocks/${pageId}/children`, 'PATCH', { children: blocks.slice(i, i + 50) });
  }
}

async function main() {
  if (!fs.existsSync(TRADING_PATH)) {
    console.log('SKIP: TRADING.md missing');
    return;
  }
  if (!NOTION_TOKEN) {
    console.log('SKIP: NOTION_ACCESS_TOKEN missing');
    return;
  }

  const pageId = await ensurePageId();
  const trading = fs.readFileSync(TRADING_PATH, 'utf8');

  await clearChildren(pageId);

  const blocks = [
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: 'Polymarket Paper Trading Journal' } }],
      },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: `Last sync: ${new Date().toISOString()}` } }],
      },
    },
    {
      object: 'block',
      type: 'divider',
      divider: {},
    },
  ];

  for (const part of chunk(trading, 1800)) {
    blocks.push({
      object: 'block',
      type: 'code',
      code: {
        language: 'markdown',
        rich_text: [{ type: 'text', text: { content: part } }],
      },
    });
  }

  await appendBlocks(pageId, blocks);
  console.log(`OK: Notion trading page synced (${pageId})`);
}

main().catch(err => {
  console.error('ERROR syncing Notion:', err.message);
  process.exit(1);
});
