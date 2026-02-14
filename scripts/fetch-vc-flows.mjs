#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const args = parseArgs(process.argv.slice(2));
const lookbackDays = numberOrDefault(args.lookback, 30);
const perVcLimit = numberOrDefault(args['per-vc'], 6);
const vcLimit = numberOrDefault(args['vc-limit'], 100);
const concurrency = Math.max(1, numberOrDefault(args.concurrency, 6));
const demoOnFail = booleanFromArg(args['demo-on-fail'], false);
const outPath = args.out
  ? path.resolve(projectRoot, args.out)
  : path.resolve(projectRoot, 'data/deals.json');

const VC_FILE = path.resolve(projectRoot, 'data/vc_firms.json');
const FUNDING_KEYWORDS = [
  'raise',
  'raised',
  'funding',
  'investment',
  'invests',
  'invested',
  'investor',
  'backs',
  'backed',
  'series a',
  'series b',
  'series c',
  'series d',
  'series e',
  'seed',
  'pre-seed',
  'venture round',
  'round',
  'announces financing',
  'announced financing',
  'growth round'
];

const SECTOR_RULES = [
  { sector: 'AI & ML', keywords: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'generative'] },
  { sector: 'Climate & Energy', keywords: ['climate', 'battery', 'solar', 'carbon', 'grid', 'fusion', 'energy storage'] },
  { sector: 'Biotech & Health', keywords: ['biotech', 'genomics', 'therapeutics', 'medtech', 'healthtech', 'clinical'] },
  { sector: 'Fintech', keywords: ['fintech', 'payments', 'banking', 'lending', 'credit', 'insurtech'] },
  { sector: 'Cybersecurity', keywords: ['cybersecurity', 'zero trust', 'identity security', 'threat', 'endpoint security'] },
  { sector: 'Developer Tools', keywords: ['developer', 'devtools', 'api platform', 'open source', 'software engineering'] },
  { sector: 'Enterprise SaaS', keywords: ['saas', 'enterprise software', 'workflow', 'b2b software', 'automation platform'] },
  { sector: 'Semis, Robotics & Hardware', keywords: ['semiconductor', 'chip', 'robotics', 'autonomous', 'hardware', 'aerospace'] },
  { sector: 'Consumer & Commerce', keywords: ['consumer', 'marketplace', 'ecommerce', 'social platform', 'creator economy'] },
  { sector: 'Web3 & Crypto', keywords: ['crypto', 'blockchain', 'web3', 'digital asset', 'defi'] }
];

const STAGE_RULES = [
  { stage: 'Pre-Seed', patterns: ['pre-seed', 'pre seed'] },
  { stage: 'Seed', patterns: ['seed round', 'seed financing', 'seed funding', 'angel round'] },
  { stage: 'Series A', patterns: ['series a'] },
  { stage: 'Series B', patterns: ['series b'] },
  { stage: 'Series C', patterns: ['series c'] },
  { stage: 'Series D+', patterns: ['series d', 'series e', 'series f', 'series g'] },
  { stage: 'Growth', patterns: ['growth round', 'late-stage', 'late stage', 'private equity', 'pre-ipo', 'pre ipo'] },
  { stage: 'Debt', patterns: ['venture debt', 'debt financing'] }
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA',
  'MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY','DC'
];

const CITY_COORDINATES = [
  ['San Francisco', 'CA', 37.7749, -122.4194],
  ['Palo Alto', 'CA', 37.4419, -122.1430],
  ['Menlo Park', 'CA', 37.4530, -122.1817],
  ['Redwood City', 'CA', 37.4852, -122.2364],
  ['Cambridge', 'MA', 42.3736, -71.1097],
  ['Boston', 'MA', 42.3601, -71.0589],
  ['New York', 'NY', 40.7128, -74.0060],
  ['Seattle', 'WA', 47.6062, -122.3321],
  ['Santa Monica', 'CA', 34.0195, -118.4912],
  ['Foster City', 'CA', 37.5585, -122.2711],
  ['Westport', 'CT', 41.1415, -73.3579],
  ['San Mateo', 'CA', 37.5630, -122.3255],
  ['Austin', 'TX', 30.2672, -97.7431],
  ['Los Angeles', 'CA', 34.0522, -118.2437],
  ['Waltham', 'MA', 42.3765, -71.2356],
  ['Boulder', 'CO', 40.0150, -105.2705],
  ['Washington', 'DC', 38.9072, -77.0369],
  ['Alexandria', 'VA', 38.8048, -77.0469],
  ['Santa Clara', 'CA', 37.3541, -121.9552],
  ['San Diego', 'CA', 32.7157, -117.1611],
  ['San Jose', 'CA', 37.3382, -121.8863],
  ['Mountain View', 'CA', 37.3861, -122.0839],
  ['Redmond', 'WA', 47.6739, -122.1215],
  ['Oakland', 'CA', 37.8044, -122.2712],
  ['Pleasanton', 'CA', 37.6624, -121.8747],
  ['Salt Lake City', 'UT', 40.7608, -111.8910],
  ['Chicago', 'IL', 41.8781, -87.6298],
  ['Miami', 'FL', 25.7617, -80.1918],
  ['Atlanta', 'GA', 33.7490, -84.3880],
  ['Denver', 'CO', 39.7392, -104.9903],
  ['Phoenix', 'AZ', 33.4484, -112.0740],
  ['Dallas', 'TX', 32.7767, -96.7970],
  ['Houston', 'TX', 29.7604, -95.3698],
  ['Raleigh', 'NC', 35.7796, -78.6382],
  ['Durham', 'NC', 35.9940, -78.8986],
  ['Nashville', 'TN', 36.1627, -86.7816],
  ['Pittsburgh', 'PA', 40.4406, -79.9959],
  ['Philadelphia', 'PA', 39.9526, -75.1652],
  ['Portland', 'OR', 45.5152, -122.6784],
  ['Minneapolis', 'MN', 44.9778, -93.2650],
  ['Detroit', 'MI', 42.3314, -83.0458],
  ['Columbus', 'OH', 39.9612, -82.9988],
  ['Cleveland', 'OH', 41.4993, -81.6944],
  ['Baltimore', 'MD', 39.2904, -76.6122],
  ['Richmond', 'VA', 37.5407, -77.4360],
  ['Madison', 'WI', 43.0731, -89.4012],
  ['Ann Arbor', 'MI', 42.2808, -83.7430],
  ['Tampa', 'FL', 27.9506, -82.4572],
  ['Orlando', 'FL', 28.5383, -81.3792],
  ['Charlotte', 'NC', 35.2271, -80.8431],
  ['Arlington', 'VA', 38.8816, -77.0910],
  ['Irvine', 'CA', 33.6846, -117.8265]
];

const CITY_MAP = new Map(
  CITY_COORDINATES.map(([city, state, lat, lon]) => [
    `${city.toLowerCase()},${state}`,
    { city, state, lat, lon }
  ])
);

const CITY_BY_NAME = CITY_COORDINATES
  .map(([city, state, lat, lon]) => ({ city, state, lat, lon, key: city.toLowerCase() }))
  .sort((a, b) => b.city.length - a.city.length);

const stageWeights = {
  'Pre-Seed': 1.0,
  'Seed': 1.2,
  'Series A': 1.6,
  'Series B': 2.0,
  'Series C': 2.4,
  'Series D+': 2.8,
  'Growth': 3.0,
  'Debt': 1.8,
  'Unspecified': 1.0
};

const firms = await loadVcFirms();
const vcs = firms.slice(0, vcLimit);
const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

const startedAt = Date.now();
let succeeded = 0;
let failed = 0;

const perVcResults = await runPool(vcs, concurrency, async (vc) => {
  const rssUrl = buildGoogleNewsRssUrl(vc.name);
  try {
    const xml = await fetchRss(rssUrl);
    const items = parseRssItems(xml);
    const deals = [];

    for (const item of items) {
      const normalized = normalizeDeal(vc, item, cutoff);
      if (!normalized) {
        continue;
      }
      deals.push(normalized);
      if (deals.length >= perVcLimit) {
        break;
      }
    }

    succeeded += 1;
    return { vc: vc.id, deals, status: 'ok' };
  } catch (error) {
    failed += 1;
    return { vc: vc.id, deals: [], status: 'error', error: String(error.message || error) };
  }
});

const scrapedDeals = dedupeDeals(perVcResults.flatMap((entry) => entry.deals));
let deals = scrapedDeals;
let demoMode = false;
if (demoOnFail && deals.length === 0) {
  deals = buildDemoDeals(vcs, lookbackDays);
  demoMode = true;
}

const bubbles = aggregateBubbles(deals);
const sampleErrors = perVcResults
  .filter((entry) => entry.status === 'error')
  .slice(0, 12)
  .map((entry) => ({ vc: entry.vc, error: entry.error }));

const note =
  demoMode
    ? 'Live scrape unavailable, using synthetic demo data. Disable demo mode for production signals.'
    : failed === vcs.length
      ? 'All source fetches failed. Check internet access or firewall rules, then rerun.'
      : deals.length === 0
      ? 'No qualifying funding signals were found for the configured lookback window. Increase lookback days or rerun later.'
      : '';

const payload = {
  generated_at: new Date().toISOString(),
  lookback_days: lookbackDays,
  configuration: {
    vc_count: vcs.length,
    per_vc_limit: perVcLimit,
    concurrency
  },
  meta: {
    requests_succeeded: succeeded,
    requests_failed: failed,
    scraped_deals: scrapedDeals.length,
    total_deals: deals.length,
    demo_mode: demoMode,
    deals_with_coordinates: deals.filter((deal) => deal.location && Number.isFinite(deal.location.lat)).length,
    runtime_ms: Date.now() - startedAt,
    note,
    error_sample: sampleErrors
  },
  deals,
  bubbles
};

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(payload, null, 2));

console.log(
  `Wrote ${deals.length} deals (${bubbles.length} bubbles) for ${vcs.length} VCs to ${path.relative(projectRoot, outPath)}`
);

async function loadVcFirms() {
  const raw = await fs.readFile(VC_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('VC registry is empty or invalid.');
  }
  return parsed;
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
        return [key, value];
      })
  );
}

function numberOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function booleanFromArg(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function buildGoogleNewsRssUrl(vcName) {
  const query = `\"${vcName}\" startup (funding OR investment OR raises OR series OR seed) press release`;
  const encoded = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
}

async function fetchRss(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'VCFlowTracker/1.0 (+https://example.local)'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseRssItems(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  return items.map((item) => ({
    title: cleanText(readTag(item, 'title')),
    link: cleanText(readTag(item, 'link')),
    pubDate: cleanText(readTag(item, 'pubDate')),
    description: cleanText(readTag(item, 'description')),
    source: cleanText(readTag(item, 'source'))
  }));
}

function readTag(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

function cleanText(value) {
  if (!value) {
    return '';
  }
  return decodeXml(stripHtml(stripCdata(value))).replace(/\s+/g, ' ').trim();
}

function stripCdata(value) {
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, ' ');
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function normalizeDeal(vc, item, cutoff) {
  if (!item.title || !item.link || !item.pubDate) {
    return null;
  }

  const published = new Date(item.pubDate);
  if (!Number.isFinite(published.getTime()) || published.getTime() < cutoff) {
    return null;
  }

  const lower = `${item.title} ${item.description}`.toLowerCase();
  if (!isFundingSignal(lower)) {
    return null;
  }

  const stage = inferStage(lower);
  const sector = inferSector(lower);
  const amountUsdM = inferAmountUsdMillions(lower);
  const company = inferCompany(item.title, item.description, vc.name);
  const location = inferLocation(`${item.title}. ${item.description}`, vc);

  const confidence = clamp(
    0.35 +
      (stage !== 'Unspecified' ? 0.15 : 0) +
      (sector !== 'Other' ? 0.1 : 0) +
      (Number.isFinite(amountUsdM) ? 0.2 : 0) +
      (company !== 'Unknown' ? 0.1 : 0) +
      location.confidence_boost,
    0,
    0.98
  );

  return {
    id: hashId(`${vc.id}|${item.link}|${published.toISOString()}`),
    vc_id: vc.id,
    vc_name: vc.name,
    company,
    title: item.title,
    source_url: item.link,
    source_name: item.source || extractHost(item.link),
    published_at: published.toISOString(),
    stage,
    sector,
    amount_usd_m: Number.isFinite(amountUsdM) ? Number(amountUsdM.toFixed(2)) : null,
    confidence: Number(confidence.toFixed(2)),
    location: {
      city: location.city,
      state: location.state,
      lat: location.lat,
      lon: location.lon,
      method: location.method,
      confidence: Number((0.5 + location.confidence_boost).toFixed(2))
    }
  };
}

function isFundingSignal(lowerText) {
  return FUNDING_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

function inferStage(lowerText) {
  for (const rule of STAGE_RULES) {
    if (rule.patterns.some((pattern) => lowerText.includes(pattern))) {
      return rule.stage;
    }
  }
  return 'Unspecified';
}

function inferSector(lowerText) {
  for (const rule of SECTOR_RULES) {
    if (rule.keywords.some((keyword) => lowerText.includes(keyword))) {
      return rule.sector;
    }
  }
  return 'Other';
}

function inferAmountUsdMillions(lowerText) {
  const patterns = [
    /\$\s?([0-9][0-9,.]*\.?[0-9]*)\s?(billion|million|bn|m|b|k)?/i,
    /([0-9][0-9,.]*\.?[0-9]*)\s?(billion|million|bn|m|b|k)\s+usd/i
  ];

  for (const pattern of patterns) {
    const match = lowerText.match(pattern);
    if (!match) {
      continue;
    }

    const rawNumber = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(rawNumber)) {
      continue;
    }

    const unit = (match[2] || '').toLowerCase();
    if (unit === 'billion' || unit === 'bn' || unit === 'b') {
      return rawNumber * 1000;
    }
    if (unit === 'million' || unit === 'm') {
      return rawNumber;
    }
    if (unit === 'k') {
      return rawNumber / 1000;
    }

    if (rawNumber <= 500) {
      return rawNumber;
    }
  }

  return null;
}

function inferCompany(title, description, vcName) {
  const cleanedTitle = title.replace(/\s+-\s+[^-]{2,70}$/, '').trim();
  const merged = `${cleanedTitle}. ${description}`;

  const patterns = [
    /^(.*?)\s+(?:raises|raised|secures|secured|announces|announced|closes|closed|lands|landed|nabs|bags|gets|wins)\b/i,
    /(?:backs|invests in|led|leads|co-leads|joins)\s+([A-Z][A-Za-z0-9&'\-. ]{1,60})/,
    /^([A-Z][A-Za-z0-9&'\-. ]{1,60})\s+(?:completes|launches|debuts)\b/
  ];

  for (const pattern of patterns) {
    const match = merged.match(pattern);
    if (!match) {
      continue;
    }

    const candidate = normalizeCompanyName(match[1], vcName);
    if (candidate) {
      return candidate;
    }
  }

  return 'Unknown';
}

function normalizeCompanyName(value, vcName) {
  if (!value) {
    return '';
  }

  const cleaned = value
    .replace(/\b(inc\.?|ltd\.?|llc|corp\.?|company|co\.?|plc)\b/gi, '')
    .replace(/^["'`\s]+|["'`\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 2 || cleaned.length > 65) {
    return '';
  }

  if (cleaned.toLowerCase().includes(vcName.toLowerCase())) {
    return '';
  }

  return cleaned;
}

function inferLocation(text, vc) {
  const lower = text.toLowerCase();

  const statePattern = US_STATES.join('|');
  const cityState = text.match(new RegExp(`\\b([A-Z][A-Za-z]+(?:\\s[A-Z][A-Za-z]+){0,2}),\\s*(${statePattern})\\b`, 'i'));
  if (cityState) {
    const city = toTitleCase(cityState[1]);
    const state = cityState[2].toUpperCase();
    const point = lookupCity(city, state);
    if (point) {
      return { ...point, method: 'city_state_match', confidence_boost: 0.3 };
    }
  }

  const based = text.match(/\b([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+){0,2})-based\b/i);
  if (based) {
    const city = toTitleCase(based[1]);
    const point = lookupByCity(city);
    if (point) {
      return { ...point, method: 'based_phrase', confidence_boost: 0.22 };
    }
  }

  for (const city of CITY_BY_NAME) {
    if (new RegExp(`\\b${escapeRegExp(city.key)}\\b`, 'i').test(lower)) {
      return {
        city: city.city,
        state: city.state,
        lat: city.lat,
        lon: city.lon,
        method: 'city_keyword',
        confidence_boost: 0.18
      };
    }
  }

  const fallback = lookupCity(vc.hq_city, vc.hq_state) || {
    city: vc.hq_city,
    state: vc.hq_state,
    lat: null,
    lon: null
  };

  return { ...fallback, method: 'vc_hq_fallback', confidence_boost: 0.06 };
}

function lookupCity(city, state) {
  return CITY_MAP.get(`${city.toLowerCase()},${state}`) || null;
}

function lookupByCity(cityName) {
  const key = cityName.toLowerCase();
  const match = CITY_BY_NAME.find((city) => city.key === key);
  if (!match) {
    return null;
  }
  return { city: match.city, state: match.state, lat: match.lat, lon: match.lon };
}

function toTitleCase(value) {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown source';
  }
}

function hashId(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `deal_${Math.abs(hash)}`;
}

function dedupeDeals(deals) {
  const seen = new Set();
  const out = [];
  for (const deal of deals) {
    const key = `${deal.vc_id}|${deal.source_url}|${deal.published_at}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(deal);
  }
  return out.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
}

function aggregateBubbles(deals) {
  const byLocation = new Map();

  for (const deal of deals) {
    if (!deal.location || !Number.isFinite(deal.location.lat) || !Number.isFinite(deal.location.lon)) {
      continue;
    }

    const key = `${deal.location.city},${deal.location.state}`;
    if (!byLocation.has(key)) {
      byLocation.set(key, {
        key,
        city: deal.location.city,
        state: deal.location.state,
        lat: deal.location.lat,
        lon: deal.location.lon,
        deal_count: 0,
        weighted_score: 0,
        latest_at: deal.published_at,
        amount_usd_m_total: 0,
        sector_counts: {},
        vc_counts: {}
      });
    }

    const bubble = byLocation.get(key);
    bubble.deal_count += 1;
    bubble.weighted_score += scoreDeal(deal);
    bubble.amount_usd_m_total += Number.isFinite(deal.amount_usd_m) ? deal.amount_usd_m : 0;
    bubble.latest_at = new Date(deal.published_at) > new Date(bubble.latest_at) ? deal.published_at : bubble.latest_at;
    bubble.sector_counts[deal.sector] = (bubble.sector_counts[deal.sector] || 0) + 1;
    bubble.vc_counts[deal.vc_name] = (bubble.vc_counts[deal.vc_name] || 0) + 1;
  }

  return [...byLocation.values()]
    .map((bubble) => ({
      key: bubble.key,
      city: bubble.city,
      state: bubble.state,
      lat: bubble.lat,
      lon: bubble.lon,
      deal_count: bubble.deal_count,
      weighted_score: Number(bubble.weighted_score.toFixed(2)),
      latest_at: bubble.latest_at,
      amount_usd_m_total: Number(bubble.amount_usd_m_total.toFixed(2)),
      top_sectors: topItems(bubble.sector_counts, 3),
      top_vcs: topItems(bubble.vc_counts, 3)
    }))
    .sort((a, b) => b.weighted_score - a.weighted_score);
}

function scoreDeal(deal) {
  const stageScore = stageWeights[deal.stage] ?? 1;
  const amountScore = Number.isFinite(deal.amount_usd_m) ? Math.log10(deal.amount_usd_m + 1) : 0.6;
  const confidenceScore = deal.confidence || 0.5;
  return stageScore + amountScore + confidenceScore;
}

function topItems(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildDemoDeals(vcs, lookback) {
  const hubs = CITY_COORDINATES.slice(0, 20).map(([city, state, lat, lon]) => ({ city, state, lat, lon }));
  const sectors = SECTOR_RULES.map((rule) => rule.sector);
  const stages = ['Seed', 'Series A', 'Series B', 'Series C', 'Growth'];
  const amountRange = {
    Seed: [2, 15],
    'Series A': [10, 45],
    'Series B': [30, 120],
    'Series C': [80, 300],
    Growth: [200, 900]
  };
  const prefixes = [
    'Vector',
    'Nimbus',
    'Atlas',
    'Axiom',
    'Flux',
    'Forge',
    'Pulse',
    'Helix',
    'Cinder',
    'Quanta',
    'Summit',
    'Catalyst',
    'Nova',
    'Titan',
    'Signal',
    'Northstar',
    'Cipher',
    'Vertex',
    'Linear',
    'Foundry'
  ];
  const suffixes = [
    'Labs',
    'Systems',
    'Compute',
    'Dynamics',
    'Stack',
    'Health',
    'Robotics',
    'Networks',
    'Cloud',
    'Data',
    'Security',
    'Bio',
    'Works',
    'Fabric',
    'Intelligence',
    'Energy',
    'Automation',
    'Platforms',
    'OS',
    'Markets'
  ];

  const count = Math.max(40, Math.min(200, vcs.length * 2));
  const now = Date.now();
  const deals = [];

  for (let i = 0; i < count; i += 1) {
    const vc = vcs[i % vcs.length];
    const hub = hubs[(i * 7) % hubs.length];
    const stage = stages[(i * 3) % stages.length];
    const sector = sectors[(i * 5) % sectors.length] || 'Other';
    const [min, max] = amountRange[stage];
    const amount = Number((min + ((i * 17) % (max - min + 1))).toFixed(2));
    const company = `${prefixes[(i * 3) % prefixes.length]} ${suffixes[(i * 5 + Math.floor(i / 4)) % suffixes.length]}`;
    const sectorPhrase = sector.toLowerCase().replace(/&/g, 'and');
    const daysAgo = i % Math.max(lookback, 7);
    const publishedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000 - ((i * 3791) % 86000000)).toISOString();

    deals.push({
      id: `demo_${i}_${vc.id}`,
      vc_id: vc.id,
      vc_name: vc.name,
      company,
      title: `${company} raises $${amount}M ${stage} round to scale ${sectorPhrase} platform`,
      source_url: '#',
      source_name: 'Demo dataset',
      published_at: publishedAt,
      stage,
      sector,
      amount_usd_m: amount,
      confidence: 0.62,
      location: {
        city: hub.city,
        state: hub.state,
        lat: hub.lat,
        lon: hub.lon,
        method: 'demo',
        confidence: 0.6
      }
    });
  }

  return deals.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
}

async function runPool(items, limit, worker) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let cursor = 0;

  async function runOne() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runOne());
  await Promise.all(runners);
  return results;
}
