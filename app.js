const stageWeight = {
  'Pre-Seed': 1.0,
  Seed: 1.2,
  'Series A': 1.6,
  'Series B': 2.0,
  'Series C': 2.4,
  'Series D+': 2.8,
  Growth: 3.0,
  Debt: 1.8,
  Unspecified: 1.0
};

const sectorColor = {
  'AI & ML': '#0a8a73',
  'Climate & Energy': '#2f9f3d',
  'Biotech & Health': '#2c7be5',
  Fintech: '#f28c28',
  Cybersecurity: '#3555aa',
  'Developer Tools': '#6f6a99',
  'Enterprise SaaS': '#1d7d96',
  'Semis, Robotics & Hardware': '#78724b',
  'Consumer & Commerce': '#a84c34',
  'Web3 & Crypto': '#8b5fbf',
  Other: '#6d747c'
};

const dom = {
  generatedAt: document.querySelector('#generatedAt'),
  dataNote: document.querySelector('#dataNote'),
  daysFilter: document.querySelector('#daysFilter'),
  sectorFilter: document.querySelector('#sectorFilter'),
  vcFilter: document.querySelector('#vcFilter'),
  stageFilter: document.querySelector('#stageFilter'),
  dealCount: document.querySelector('#dealCount'),
  vcCount: document.querySelector('#vcCount'),
  hotspotCount: document.querySelector('#hotspotCount'),
  spotTitle: document.querySelector('#spotTitle'),
  spotSummary: document.querySelector('#spotSummary'),
  dealList: document.querySelector('#dealList')
};

const map = L.map('map', {
  zoomControl: true,
  minZoom: 3,
  maxZoom: 12,
  worldCopyJump: true
}).setView([39.5, -98.35], 4);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

let dataset = {
  generated_at: null,
  deals: []
};
let selectedKey = null;
let hasFitted = false;

loadData();

async function loadData() {
  try {
    const res = await fetch('./data/deals.json', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to load deals.json (${res.status})`);
    }

    const parsed = await res.json();
    dataset = {
      generated_at: parsed.generated_at,
      deals: Array.isArray(parsed.deals) ? parsed.deals : []
    };

    hydrateFilters(dataset.deals);
    updateHeader(parsed);
    attachEvents();
    render();
  } catch (error) {
    dom.generatedAt.textContent = `Dataset load failed: ${error.message}`;
    dom.dataNote.textContent = '';
    dom.spotSummary.textContent =
      'No dataset loaded. Run `npm run refresh:data` in this project to build data/deals.json and reload the page.';
  }
}

function hydrateFilters(deals) {
  const sectors = [...new Set(deals.map((deal) => deal.sector).filter(Boolean))].sort();
  const stages = [...new Set(deals.map((deal) => deal.stage).filter(Boolean))].sort();

  sectors.forEach((sector) => {
    const option = document.createElement('option');
    option.value = sector;
    option.textContent = sector;
    dom.sectorFilter.appendChild(option);
  });

  stages.forEach((stage) => {
    const option = document.createElement('option');
    option.value = stage;
    option.textContent = stage;
    dom.stageFilter.appendChild(option);
  });
}

function updateHeader(parsed) {
  const generated = dataset.generated_at ? new Date(dataset.generated_at) : null;
  const generatedText = generated ? generated.toLocaleString() : 'Unknown';
  const totalDeals = Array.isArray(parsed.deals) ? parsed.deals.length : 0;
  dom.generatedAt.textContent = `Last refresh: ${generatedText} | Signals: ${totalDeals}`;
  dom.dataNote.textContent = parsed?.meta?.note || '';
}

function attachEvents() {
  dom.daysFilter.addEventListener('change', render);
  dom.sectorFilter.addEventListener('change', render);
  dom.stageFilter.addEventListener('change', render);
  dom.vcFilter.addEventListener('input', render);
}

function render() {
  const filteredDeals = applyFilters(dataset.deals);
  const bubbles = buildBubbles(filteredDeals);

  renderMap(bubbles);
  renderStats(filteredDeals, bubbles);

  if (!selectedKey || !bubbles.some((bubble) => bubble.key === selectedKey)) {
    selectedKey = bubbles.length ? bubbles[0].key : null;
  }

  renderRightPanel(bubbles);
}

function applyFilters(deals) {
  const days = Number(dom.daysFilter.value);
  const sector = dom.sectorFilter.value;
  const stage = dom.stageFilter.value;
  const vcQuery = dom.vcFilter.value.trim().toLowerCase();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return deals.filter((deal) => {
    const ts = new Date(deal.published_at).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) {
      return false;
    }

    if (sector !== 'all' && deal.sector !== sector) {
      return false;
    }

    if (stage !== 'all' && deal.stage !== stage) {
      return false;
    }

    if (vcQuery && !String(deal.vc_name || '').toLowerCase().includes(vcQuery)) {
      return false;
    }

    return true;
  });
}

function buildBubbles(deals) {
  const grouped = new Map();

  deals.forEach((deal) => {
    if (!deal.location || !Number.isFinite(deal.location.lat) || !Number.isFinite(deal.location.lon)) {
      return;
    }

    const key = `${deal.location.city},${deal.location.state}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        city: deal.location.city,
        state: deal.location.state,
        lat: deal.location.lat,
        lon: deal.location.lon,
        deals: [],
        sectorCounts: {}
      });
    }

    const bubble = grouped.get(key);
    bubble.deals.push(deal);
    bubble.sectorCounts[deal.sector] = (bubble.sectorCounts[deal.sector] || 0) + 1;
  });

  return [...grouped.values()]
    .map((bubble) => {
      const weightedScore = bubble.deals.reduce((sum, deal) => sum + scoreDeal(deal), 0);
      const dominantSector = Object.entries(bubble.sectorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other';
      return {
        ...bubble,
        weightedScore,
        dominantSector,
        latestAt: bubble.deals
          .map((deal) => new Date(deal.published_at).getTime())
          .sort((a, b) => b - a)[0]
      };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);
}

function scoreDeal(deal) {
  const stageScore = stageWeight[deal.stage] || 1;
  const amountScore = Number.isFinite(deal.amount_usd_m) ? Math.log10(deal.amount_usd_m + 1) : 0.65;
  const confidenceScore = Number.isFinite(deal.confidence) ? deal.confidence : 0.5;
  return stageScore + amountScore + confidenceScore;
}

function renderMap(bubbles) {
  markerLayer.clearLayers();

  if (!bubbles.length) {
    dom.spotTitle.textContent = 'No hotspots in filter range';
    dom.spotSummary.textContent = 'Try expanding the lookback window or removing filters.';
    dom.dealList.innerHTML = '';
    return;
  }

  const bounds = [];

  bubbles.forEach((bubble) => {
    const radius = clamp(6 + Math.sqrt(bubble.weightedScore) * 2.1, 6, 44);
    const fillColor = sectorColor[bubble.dominantSector] || sectorColor.Other;

    const marker = L.circleMarker([bubble.lat, bubble.lon], {
      radius: 1,
      weight: 1.2,
      color: fillColor,
      fillColor,
      fillOpacity: 0.28
    });

    marker.bindPopup(
      `<strong>${bubble.city}, ${bubble.state}</strong><br/>` +
        `${bubble.deals.length} signals | ${bubble.dominantSector}`
    );

    marker.on('click', () => {
      selectedKey = bubble.key;
      renderRightPanel(bubbles);
    });

    marker.addTo(markerLayer);
    bounds.push([bubble.lat, bubble.lon]);

    window.setTimeout(() => marker.setRadius(radius), 18);
  });

  if (!hasFitted && bounds.length > 1) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
    hasFitted = true;
  }
}

function renderStats(filteredDeals, bubbles) {
  const activeVcs = new Set(filteredDeals.map((deal) => deal.vc_id)).size;
  dom.dealCount.textContent = `Deals: ${filteredDeals.length}`;
  dom.vcCount.textContent = `Active VCs: ${activeVcs}`;
  dom.hotspotCount.textContent = `Hotspots: ${bubbles.length}`;
}

function renderRightPanel(bubbles) {
  const bubble = bubbles.find((entry) => entry.key === selectedKey);

  if (!bubble) {
    dom.spotTitle.textContent = 'Select a hotspot';
    dom.spotSummary.textContent = 'Click a bubble to inspect the deal stream in that city.';
    dom.dealList.innerHTML = '';
    return;
  }

  dom.spotTitle.textContent = `${bubble.city}, ${bubble.state}`;
  const vcs = new Set(bubble.deals.map((deal) => deal.vc_name));
  dom.spotSummary.textContent =
    `${bubble.deals.length} funding signals from ${vcs.size} VC firms. Dominant sector: ${bubble.dominantSector}.`;

  const sortedDeals = [...bubble.deals]
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .slice(0, 40);

  dom.dealList.innerHTML = sortedDeals
    .map((deal) => {
      const date = new Date(deal.published_at).toLocaleDateString();
      const amount = Number.isFinite(deal.amount_usd_m) ? ` | $${deal.amount_usd_m}M` : '';
      const hasLink = /^https?:\/\//i.test(deal.source_url || '');
      const titleNode = hasLink
        ? `<a href="${escapeHtml(deal.source_url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(deal.title)}</a>`
        : `<span>${escapeHtml(deal.title)}</span>`;
      return `
        <li>
          ${titleNode}
          <div class="deal-meta">${escapeHtml(deal.vc_name)} | ${escapeHtml(deal.stage)} | ${escapeHtml(deal.sector)}${amount} | ${date}</div>
        </li>
      `;
    })
    .join('');
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
