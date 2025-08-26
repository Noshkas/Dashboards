/*
  main.js - Core application logic, initialization, and routing
  This file handles the main application flow, navigation, and view management
*/

// Global state
const shippedPosts = {};
let __blogFromDashboard = false;
let __postIdCounter = Date.now();

// Constants
const ROUTE_KEY = 'stock_view_last_route_v1';

// Entry point - Initialize app
loadPostsFromStorage();

const input = document.getElementById('input');

// Restore last route if any
(function restoreLastRoute() {
  const r = loadRoute();
  if (!r) { input.focus(); return; }
  if (r.view === 'dashboard') {
    showDashboard();
    return;
  }
  if (r.view === 'stock' && r.sym) {
    showStock(r.sym);
    return;
  }
  if (r.view === 'blog' && r.sym) {
    showBlogView(r.sym, false, r.fromDashboard === true);
    return;
  }
  input.focus();
})();

// Input handler for stock search
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && input.value.trim().length >= 1) {
    const value = input.value.trim();
    if (value.toUpperCase() === 'DASHBOARD') {
      saveRoute({ view: 'dashboard' });
      showDashboard();
    } else if (value.startsWith('/')) {
      // Open the blog view for slash-prefixed symbol codes
      const sym = value.toUpperCase().replace(/^\//, '');
      saveRoute({ view: 'blog', sym, fromDashboard: false });
      showBlogView(sym, true, false);
    } else {
      const sym = value.toUpperCase();
      saveRoute({ view: 'stock', sym });
      showStock(sym);
    }
  }
});

// Route management
function saveRoute(route) {
  try { localStorage.setItem(ROUTE_KEY, JSON.stringify(route)); } catch {}
}

function loadRoute() {
  try {
    const raw = localStorage.getItem(ROUTE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

// ID generation
function nextPostId() {
  return (++__postIdCounter) + '-' + Math.random().toString(36).slice(2, 7);
}

/*
  Display the full stock dashboard. This view shows a summary of
  fundamentals including market cap, PE, EPS, dividend yield and more.
*/
function showStock(sym) {
  document.body.innerHTML = '';
  const wrap = el('div', 'wrapper'), card = el('div', 'card');
  wrap.append(card);
  document.body.append(wrap);

  // Force auth overlay if not signed in
  if (typeof ensureAuth === 'function') ensureAuth();

  // Persist route and set up navigation
  saveRoute({ view: 'stock', sym });

  // Close button returns to search view
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close';
  closeBtn.onclick = e => {
    e.stopPropagation();
    document.body.innerHTML = '';
    document.body.appendChild(input);
    input.value = '';
    input.focus();
  };
  card.append(closeBtn);

  // Plus button shows preview
  const plusBtn = document.createElement('button');
  plusBtn.className = 'plus-btn';
  plusBtn.innerHTML = '+';
  plusBtn.title = 'Add';
  plusBtn.onclick = e => {
    e.stopPropagation();
    saveRoute({ view: 'stock', sym });
    showBlogView(sym, false, false);
  };
  card.append(plusBtn);

  // Global return button (always back to start screen)
  const returnBtn = document.createElement('button');
  returnBtn.className = 'return-btn';
  returnBtn.innerHTML = '↩︎';
  returnBtn.title = 'Return to start';
  returnBtn.onclick = (e) => {
    e.stopPropagation();
    document.body.innerHTML = '';
    document.body.appendChild(input);
    input.value = '';
    input.focus();
  };
  card.append(returnBtn);

  // Home button: go to dashboard
  const homeBtn = document.createElement('button');
  homeBtn.className = 'home-btn';
  homeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>';
  homeBtn.title = 'Dashboard';
  homeBtn.onclick = (e) => {
    e.stopPropagation();
    saveRoute({ view: 'dashboard' });
    showDashboard();
  };
  card.append(homeBtn);

  // Header
  const hdr = el('div', 'header'); card.append(hdr);
  hdr.append(el('div', 'symbol', sym));
  const cname = el('div', 'cname'); hdr.append(cname);
  const priceContainer = el('div', 'price neutral'); hdr.append(priceContainer);
  const meta = el('div', 'meta'); hdr.append(meta);
  const loading = el('div', 'loading', 'Loading stock data...');
  card.append(loading);

  Promise.all([
    fetchJson(`${API_BASE}/profile/${sym}?apikey=${API_KEY}`),
    fetchJson(`${API_BASE}/quote/${sym}?apikey=${API_KEY}`),
    fetchJson(`${API_BASE}/income-statement/${sym}?limit=1&apikey=${API_KEY}`)
  ]).then(([profileArr, quoteArr, incomeArr]) => {
    if (!profileArr.length) throw new Error('No profile');
    const inf = profileArr[0] || {};
    const q = quoteArr[0] || {};
    const income = incomeArr[0] || {};
    cname.textContent = inf.companyName || '—';
    const price = inf.price || q.price;
    const change = q.change || 0;
    const changePercent = q.changesPercentage || 0;
    const priceClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
    priceContainer.className = `price ${priceClass}`;
    if (price && changePercent !== 0) {
      priceContainer.innerHTML = `$${shortFmt(price)} <span class="price-change ${change < 0 ? 'negative' : ''}">${change > 0 ? '+' : ''}${changePercent.toFixed(2)}%</span>`;
    } else {
      priceContainer.textContent = price ? `$${shortFmt(price)}` : '—';
    }
    meta.innerHTML = `<span>${inf.exchangeShortName || '—'}</span><span>${inf.sector || '—'}</span><span>${inf.industry || '—'}</span>`;

    // Remove loader and populate cards
    loading.remove();
    const cards = el('div', 'cards'); card.append(cards);
    addCard(cards, 'Market Cap', shortFmt(inf.mktCap));
    addCard(cards, 'P/E Ratio', q.pe ? q.pe.toFixed(2) : '—');
    addCard(cards, 'EPS', q.eps ? `$${q.eps.toFixed(2)}` : '—');
    const dy = q.lastDiv && inf.price ? ((q.lastDiv / inf.price) * 100).toFixed(2) + '%' : (q.dividendYield ? (q.dividendYield * 100).toFixed(2) + '%' : '—');
    addCard(cards, 'Dividend Yield', dy);
    addCard(cards, 'Revenue', shortFmt(income.revenue), income.revenue > 0);
    addCard(cards, 'EBITDA', shortFmt(income.ebitda), income.ebitda > 0);
    addCard(cards, 'Net Income', shortFmt(income.netIncome), income.netIncome > 0);
    addCard(cards, 'Volume', shortFmt(q.volume));

    // Kings Score (latest shipped Kings post for this symbol)
    try {
      const kp = (shippedPosts[sym] || []).filter(p => p && p.type === 'kings');
      if (kp.length) {
        let last = kp[0];
        for (let i = 1; i < kp.length; i++) {
          const a = last && last.ts ? last.ts : 0;
          const b = kp[i] && kp[i].ts ? kp[i].ts : 0;
          if (b >= a) last = kp[i];
        }
        const score = (last && typeof last.total === 'number') ? Math.round(last.total) : null;
        addCard(cards, 'Kings Score', score != null ? `${score} / 100` : '—');
      }
    } catch {}

    // Description section
    const descSection = el('div', 'desc-section');
    descSection.append(el('p', 'desc-title', 'About'));
    descSection.append(el('div', 'desc', inf.description || 'No description available.'));
    card.append(descSection);
  }).catch(() => {
    loading.remove();
    card.append(el('div', 'error', 'Failed to load stock data. Please check the symbol and try again.'));
  });
}
