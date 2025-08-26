/*
  views.js - View components for blog view, dashboard, and post rendering
  This file handles all the different views and post types
*/

/*
  Show a lightweight preview of the stock - blog view
  This view analyses a stock and allows the user to ship the analysis as posts
*/
function showBlogView(sym, fromClose, fromDashboard) {
  // Clear the page and create a blogview container
  document.body.innerHTML = '';
  const blog = el('div', 'blogview');
  const wrap = el('div', 'wrapper');
  const card = el('div', 'card');
  wrap.append(card);
  blog.append(wrap);
  document.body.append(blog);

  // Persist route
  saveRoute({ view: 'blog', sym, fromDashboard: !!fromDashboard });

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    if (card.classList.contains('chart-mode')) {
      // If in chart mode, go back to preview mode
      showBlogView(sym, false, fromDashboard);
    } else {
      if (fromDashboard) showDashboard();
      else showStock(sym);
    }
  };
  card.append(closeBtn);

  // Plus button to open chart/analysis menu
  const plusBtn = document.createElement('button');
  plusBtn.className = 'plus-btn';
  plusBtn.innerHTML = '+';
  plusBtn.title = 'Add';
  let expander = null;
  let inAnalysis = false;
  plusBtn.onclick = (e) => {
    e.stopPropagation();
    if (expander) {
      expander.remove();
      expander = null;
      return;
    }
    expander = document.createElement('div');
    expander.className = 'expander';
    function renderOptions() {
      expander.innerHTML = '';
      if (!inAnalysis) {
        ['Chart', 'Text', 'Analysis'].forEach(label => {
          const b = document.createElement('button');
          b.className = 'expander-btn';
          b.textContent = label;
          b.onclick = () => {
            if (label === 'Analysis') {
              inAnalysis = true;
              renderOptions();
            } else if (label === 'Chart') {
              expander.remove();
              expander = null;
              saveRoute({ view: 'blog', sym, fromDashboard: !!fromDashboard });
              showChart(card, sym);
            } else if (label === 'Text') {
              expander.remove();
              expander = null;
              showTextEditor(card, sym);
            }
          };
          expander.appendChild(b);
        });
      } else {
        ['News', 'Kings', 'Back'].forEach(label => {
          const b = document.createElement('button');
          b.className = 'expander-btn';
          b.textContent = label;
          b.onclick = () => {
            if (label === 'Back') {
              inAnalysis = false;
              renderOptions();
            } else if (label === 'News') {
              expander.remove();
              expander = null;
              showNewsPicker(card, sym);
            } else if (label === 'Kings') {
              expander.remove();
              expander = null;
              showKingsForm(card, sym);
            }
          };
          expander.appendChild(b);
        });
      }
    }
    renderOptions();
    card.appendChild(expander);
  };
  card.append(plusBtn);

  // Return button: always go back to the start screen
  const returnBtn = document.createElement('button');
  returnBtn.className = 'return-btn';
  returnBtn.innerHTML = '↩︎';
  returnBtn.title = 'Return to start';
  returnBtn.onclick = e => {
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

  // Header section
  const hdr = el('div', 'header');
  card.append(hdr);
  hdr.append(el('div', 'symbol', sym));
  const cname = el('div', 'cname');
  hdr.append(cname);
  const price = el('div', 'price neutral');
  hdr.append(price);
  const meta = el('div', 'meta');
  hdr.append(meta);

  // Fetch profile and quote to populate header
  fetchJson(`${API_BASE}/profile/${sym}?apikey=${API_KEY}`)
    .then(profileArr => {
      const inf = profileArr[0] || {};
      cname.textContent = inf.companyName || '—';
      return fetchJson(`${API_BASE}/quote/${sym}?apikey=${API_KEY}`).then(quoteArr => {
        const q = quoteArr[0] || {};
        const pr = inf.price || q.price;
        const change = q.change || 0;
        const changePercent = q.changesPercentage || 0;
        const priceClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
        price.className = `price ${priceClass}`;
        if (pr && changePercent !== 0) {
          price.innerHTML = `$${shortFmt(pr)} <span class="price-change ${change < 0 ? 'negative' : ''}">${change > 0 ? '+' : ''}${changePercent.toFixed(2)}%</span>`;
        } else {
          price.textContent = pr ? `$${shortFmt(pr)}` : '—';
        }
        meta.innerHTML = `<span>${inf.exchangeShortName || '—'}</span><span>${inf.sector || '—'}</span><span>${inf.industry || '—'}</span>`;
      });
    })
    .catch(() => {
      // If fetching header information fails, leave placeholders
    });

  // Render any shipped posts immediately
  renderPostsForSymbol(sym, card);
}

/*
  Simple dashboard view: reuses blog/card layout but limits actions to text posts
*/
function showDashboard() {
  document.body.innerHTML = '';
  const blog = el('div', 'blogview');
  const wrap = el('div', 'wrapper');
  const card = el('div', 'card');
  wrap.append(card);
  blog.append(wrap);
  document.body.append(blog);

  // Persist route
  saveRoute({ view: 'dashboard' });

  // Close button -> return to start
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    document.body.innerHTML = '';
    document.body.appendChild(input);
    input.value = '';
    input.focus();
  };
  card.append(closeBtn);

  // Plus in dashboard: provide Calendar, Text, and Portfolio
  const plusBtn = document.createElement('button');
  plusBtn.className = 'plus-btn';
  plusBtn.innerHTML = '+';
  plusBtn.title = 'Add';
  let expander = null;
  plusBtn.onclick = (e) => {
    e.stopPropagation();
    if (expander) {
      expander.remove();
      expander = null;
      return;
    }
    expander = document.createElement('div');
    expander.className = 'expander';
    const btnText = document.createElement('button');
    btnText.className = 'expander-btn';
    btnText.textContent = 'Text';
    btnText.onclick = () => {
      expander.remove();
      expander = null;
      showTextEditor(card, 'DASHBOARD');
    };
    const btnPortfolio = document.createElement('button');
    btnPortfolio.className = 'expander-btn';
    btnPortfolio.textContent = 'Portfolio';
    btnPortfolio.onclick = () => {
      expander.remove();
      expander = null;
      showPortfolioBuilder(card);
    };
    const btnCalendar = document.createElement('button');
    btnCalendar.className = 'expander-btn';
    btnCalendar.textContent = 'Calendar';
    btnCalendar.onclick = async () => {
      expander.remove();
      expander = null;
      showDashboardCalendarBuilder(card, 'weekly');
    };
    expander.appendChild(btnText);
    expander.appendChild(btnPortfolio);
    expander.appendChild(btnCalendar);
    card.appendChild(expander);
  };
  card.append(plusBtn);

  // Return button
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

  // Header
  const hdr = el('div', 'header');
  card.append(hdr);
  hdr.append(el('div', 'symbol', 'DASHBOARD'));
  hdr.append(el('div', 'cname', 'Personal Dashboard'));
  const price = el('div', 'price neutral', '—');
  hdr.append(price);
  const stocksMeta = el('div', 'meta');
  hdr.append(stocksMeta);

  // Stocks with posts shown in header as chips
  renderStocksList(stocksMeta);

  // Pre-made TRI post: aggregates TRI across symbols
  renderTriOverview(card);

  // Render any existing dashboard posts
  renderDashboardPosts(card);
}

function renderStocksList(stocksMeta) {
  const symbols = Object.keys(shippedPosts).filter(s =>
    s !== 'DASHBOARD' && Array.isArray(shippedPosts[s]) && shippedPosts[s].length > 0
  );
  if (!symbols.length) return;
  symbols.sort().forEach(s => {
    const count = shippedPosts[s].length;
    const chip = document.createElement('span');
    chip.textContent = `${s} (${count})`;
    chip.style.cursor = 'pointer';
    chip.onclick = () => {
      saveRoute({ view: 'blog', sym: s, fromDashboard: true });
      showBlogView(s, false, true);
    };
    stocksMeta.appendChild(chip);
  });
}

function renderTriOverview(card) {
  const allSymbols = new Set();
  // Symbols with posts
  Object.keys(shippedPosts).forEach(s => {
    if (s !== 'DASHBOARD' && Array.isArray(shippedPosts[s]) && shippedPosts[s].length > 0) {
      allSymbols.add(s);
    }
  });
  // Symbols in portfolio
  const dposts = shippedPosts['DASHBOARD'] || [];
  dposts.forEach(p => {
    if (p && p.type === 'portfolio' && Array.isArray(p.items)) {
      p.items.forEach(it => {
        if (it && it.sym) allSymbols.add(it.sym);
      });
    }
  });
  const syms = Array.from(allSymbols);
  if (!syms.length) return;

  const triCard = el('div', 'tri-post');
  const title = el('div', 'tri-title', 'TRI Overview');
  triCard.appendChild(title);
  const grid = el('div', 'tri-grid');
  grid.appendChild(el('div', 'tri-colhead', 'Symbol'));
  grid.appendChild(el('div', 'tri-colhead', '1W'));
  grid.appendChild(el('div', 'tri-colhead', '1M'));
  grid.appendChild(el('div', 'tri-colhead', '6M'));
  grid.appendChild(el('div', 'tri-colhead', '1Y'));
  triCard.appendChild(grid);
  card.append(triCard);

  const timeframes = ['1W', '1M', '6M', '1Y'];
  const tfToPoints = { '1W': 66, '1M': 22, '6M': 132, '1Y': 252 };

  // Fallback: derive records from latest chart post if API fails
  function fallbackRecordsFromPosts(sym, approxPoints) {
    try {
      const list = shippedPosts[sym] || [];
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        if (p && p.type === 'chart' && Array.isArray(p.rawData) && p.rawData.length >= 2) {
          const recs = p.rawData.slice(-approxPoints).map(r => ({
            date: r.date,
            close: r.close
          }));
          if (recs.length >= 2) return recs;
        }
      }
    } catch {}
    return [];
  }

  syms.forEach(sym => {
    Promise.all(timeframes.map(tf => getHistoricalDataTop(sym, tf))).then(dataSets => {
      const triVals = {};
      const lastDates = {};
      dataSets.forEach((records, idx) => {
        const tf = timeframes[idx];
        if (!Array.isArray(records) || records.length < 2) {
          records = fallbackRecordsFromPosts(sym, tfToPoints[tf] || 22);
        }
        if (!Array.isArray(records) || records.length < 2) {
          triVals[tf] = null;
          return;
        }
        const closes = records.map(r => r && typeof r.close === 'number' ? r.close : null).filter(v => v != null);
        if (closes.length < 2) {
          triVals[tf] = null;
          return;
        }
        const series = (typeof miniCalculateTrendline === 'function' ? miniCalculateTrendline : calculateTrendline)(closes);
        const trendVal = series[series.length - 1];
        const priceVal = closes[closes.length - 1];
        let tri = null;
        if (trendVal != null && trendVal !== 0 && priceVal != null) {
          tri = ((priceVal - trendVal) / trendVal) * 100;
        }
        triVals[tf] = tri;
        const lr = records[records.length - 1];
        lastDates[tf] = lr && lr.date;
      });
      const symCell = el('div', 'tri-symbol', sym);
      grid.appendChild(symCell);
      timeframes.forEach(tf => {
        const v = triVals[tf];
        const badge = el('div', `tri-badge ${v == null ? 'neu' : (v >= 0 ? 'pos' : 'neg')}`,
          v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
        const ld = lastDates[tf];
        if (ld) badge.title = `as of ${ld}`;
        grid.appendChild(badge);
      });
    }).catch(() => {
      const symCell = el('div', 'tri-symbol', sym);
      grid.appendChild(symCell);
      timeframes.forEach(() => {
        grid.appendChild(el('div', 'tri-badge neu', '—'));
      });
    });
  });
  const foot = el('div', 'tri-footnote', 'TRI = (Price − Trendline) / Trendline × 100.');
  triCard.appendChild(foot);
}

function renderDashboardPosts(card) {
  const posts = shippedPosts['DASHBOARD'] || [];
  if (!posts.length) return;

  const postsContainer = el('div', 'posts-container');
  posts.forEach((p, idx) => {
    if (p.type === 'text') {
      const postDiv = el('div', 'post');
      postDiv.classList.add('text-post');
      const header = el('div', 'post-header', `DASHBOARD • Note`);
      const textEl = el('div', 'text-content', p.content);
      postDiv.appendChild(header);
      postDiv.appendChild(textEl);
      if (p.ts) {
        const meta = el('div', 'post-info');
        meta.appendChild(el('span', null, formatDateTime(p.ts)));
        postDiv.appendChild(meta);
      }
      postsContainer.appendChild(postDiv);
    } else if (p.type === 'portfolio') {
      renderPortfolioPost(postsContainer, p);
    } else if (p.type === 'calendar') {
      renderCalendarPost(postsContainer, p);
    }
  });
  card.append(postsContainer);
}

function renderPortfolioPost(container, p) {
  const postDiv = el('div', 'post');
  postDiv.classList.add('text-post');
  const header = el('div', 'post-header', `DASHBOARD • Portfolio`);
  const contentContainer = el('div');
  contentContainer.style.display = 'flex';
  contentContainer.style.flexDirection = 'column';
  contentContainer.style.gap = '6px';

  function renderPerf(perfs) {
    contentContainer.innerHTML = '';
    const title = el('div', 'tri-title', 'Portfolio');
    contentContainer.appendChild(title);
    const grid = el('div', 'portfolio-grid');
    grid.appendChild(el('div', 'tri-colhead', 'Symbol'));
    grid.appendChild(el('div', 'tri-colhead', 'Change'));
    grid.appendChild(el('div', 'tri-colhead', 'PnL'));
    grid.appendChild(el('div', 'tri-colhead', 'Value'));
    if (perfs && Array.isArray(perfs.perStock)) {
      perfs.perStock.forEach(r => {
        const symCell = el('div', 'tri-symbol', r.sym);
        grid.appendChild(symCell);
        const pctVal = (r.pct == null ? null : r.pct);
        const absVal = (r.abs == null ? null : r.abs);
        const valNow = (r.latestClose != null ? r.latestClose * (r.qty != null ? r.qty : 1) : null);
        const pctBadge = el('div', `tri-badge ${pctVal == null ? 'neu' : (pctVal >= 0 ? 'pos' : 'neg')}`,
          pctVal == null ? '—' : `${pctVal >= 0 ? '+' : ''}${pctVal.toFixed(2)}%`);
        const absBadge = el('div', `tri-badge ${absVal == null ? 'neu' : (absVal >= 0 ? 'pos' : 'neg')}`,
          absVal == null ? '—' : `${absVal >= 0 ? '+' : ''}${shortFmt(absVal)}`);
        const valBadge = el('div', `tri-badge neu`, valNow == null ? '—' : `${shortFmt(valNow)}`);
        grid.appendChild(pctBadge);
        grid.appendChild(absBadge);
        grid.appendChild(valBadge);
      });
    }
    contentContainer.appendChild(grid);
    const totWrap = el('div', 'tri-footnote');
    try {
      const valid = Array.isArray(perfs.perStock) ?
        perfs.perStock.filter(r => r.buyClose != null && r.latestClose != null) : [];
      let totalValue = null;
      if (valid.length) {
        totalValue = valid.reduce((sum, r) => sum + (r.latestClose * (r.qty != null ? r.qty : 1)), 0);
      }
      const pct = perfs && perfs.portfolio ? perfs.portfolio.pct : null;
      const abs = perfs && perfs.portfolio ? perfs.portfolio.abs : null;
      const pctBadge = el('span', `tri-badge ${pct == null ? 'neu' : (pct >= 0 ? 'pos' : 'neg')}`,
        pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
      const absBadge = el('span', `tri-badge ${abs == null ? 'neu' : (abs >= 0 ? 'pos' : 'neg')}`,
        abs == null ? '—' : `${abs >= 0 ? '+' : ''}${shortFmt(abs)}`);
      const valueStr = (totalValue == null ? '' : ` • Value ${shortFmt(totalValue)}`);
      const label = el('span', null, 'Total ');
      totWrap.appendChild(label);
      totWrap.appendChild(pctBadge);
      totWrap.appendChild(document.createTextNode(' '));
      totWrap.appendChild(absBadge);
      if (valueStr) totWrap.appendChild(el('span', null, valueStr));
    } catch {}
    contentContainer.appendChild(totWrap);
  }

  // Initial render
  (async () => {
    try {
      try { await backfillMissingBuyPrices(p.items || []); } catch {}
      const perfs = await computePortfolioPerformanceFromSnapshot(p.items || []);
      p.perfs = perfs;
      renderPerf(perfs);
    } catch { /* noop */ }
  })();

  // Auto-refresh (table only)
  const intervalMin = p.refreshIntervalMin || 10;
  if (intervalMin && intervalMin > 0) {
    try {
      const ms = Math.max(1, intervalMin) * 60 * 1000;
      const timer = setInterval(async () => {
        try {
          const perfs = await computePortfolioPerformanceFromSnapshot(p.items || []);
          p.perfs = perfs;
          renderPerf(perfs);
        } catch { /* noop */ }
      }, ms);
      postDiv._cleanup = () => clearInterval(timer);
    } catch { /* noop */ }
  }

  postDiv.appendChild(header);
  postDiv.appendChild(contentContainer);
  if (p.ts) {
    const meta = el('div', 'post-info');
    meta.appendChild(el('span', null, formatDateTime(p.ts)));
    postDiv.appendChild(meta);
  }

  // Right-click menu for portfolio post
  postDiv.oncontextmenu = (e) => {
    e.preventDefault();
    document.querySelectorAll('.post-options').forEach(n => n.remove());
    const menu = document.createElement('div');
    menu.className = 'post-options';
    const px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
    const py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
    menu.style.left = px + 'px';
    menu.style.top = py + 'px';
    const editBtn = document.createElement('button');
    editBtn.className = 'opt-btn';
    editBtn.textContent = 'Edit';
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'opt-btn';
    refreshBtn.textContent = 'Refresh';
    const delBtn = document.createElement('button');
    delBtn.className = 'opt-btn';
    delBtn.textContent = 'Delete';
    menu.appendChild(editBtn);
    menu.appendChild(refreshBtn);
    menu.appendChild(delBtn);
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', ev => ev.stopPropagation());
    menu.addEventListener('click', ev => ev.stopPropagation());
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
    editBtn.onclick = () => {
      menu.remove();
      showPortfolioBuilder(document.querySelector('.card'));
    };
    // removed chart view
    refreshBtn.onclick = async () => {
      menu.remove();
      try {
        try { await backfillMissingBuyPrices(p.items || []); } catch {}
        p.perfs = await computePortfolioPerformanceFromSnapshot(p.items || []);
        renderPerf(p.perfs);
      } catch {}
    };
    delBtn.onclick = () => {
      menu.remove();
      try {
        const list = shippedPosts['DASHBOARD'] || [];
        const indexInList = list.indexOf(p);
        if (indexInList >= 0) {
          const old = list[indexInList];
          if (old && typeof old._cleanup === 'function') {
            try { old._cleanup(); } catch {}
          }
          list.splice(indexInList, 1);
          savePostsToStorage();
          showDashboard();
        }
      } catch {}
    };
  };
  container.appendChild(postDiv);
}

function renderCalendarPost(container, p) {
  const postDiv = el('div', 'post');
  postDiv.classList.add('text-post');
  const header = el('div', 'post-header', `DASHBOARD • Calendar (${p.mode === 'monthly' ? 'Monthly' : 'Weekly'})`);
  postDiv.appendChild(header);
  if (p.ts || p.range) {
    const meta = el('div', 'post-info');
    if (p.ts) meta.appendChild(el('span', null, formatDateTime(p.ts)));
    if (p.range && p.range.from && p.range.to) {
      meta.appendChild(el('span', null, `${p.range.from} → ${p.range.to}`));
    }
    postDiv.appendChild(meta);
  }

  // Real calendar layout grid
  const calWrap = el('div');
  calWrap.style.border = '1px solid #e5e7eb';
  calWrap.style.borderRadius = '12px';
  calWrap.style.padding = '8px';
  const head = el('div');
  head.style.display = 'grid';
  head.style.gridTemplateColumns = 'repeat(7, 1fr)';
  head.style.gap = '6px';
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(dn => {
    const h = el('div', null, dn);
    h.style.fontWeight = '700';
    h.style.color = '#6b7280';
    head.appendChild(h);
  });
  const grid = el('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '10px';
  grid.style.gridAutoRows = '1fr';
  const groups = p.groups || {};

  // Derive period view from range
  const fromD = p.range && p.range.from ? new Date(p.range.from) : new Date();
  const toD = p.range && p.range.to ? new Date(p.range.to) : new Date();

  let firstCell, lastCell;
  if (p.mode === 'weekly') {
    firstCell = new Date(fromD);
    lastCell = new Date(toD);
  } else {
    const s = startOfMonth(fromD);
    const e = endOfMonth(fromD);
    firstCell = startOfWeek(s);
    lastCell = endOfWeek(e);
  }

  const cur = new Date(firstCell);
  while (cur <= lastCell) {
    const cell = el('div');
    cell.style.minHeight = '110px';
    cell.style.border = '1px solid #e5e7eb';
    cell.style.borderRadius = '14px';
    cell.style.background = '#f9fafb';
    cell.style.padding = '10px';
    const dnum = el('div', null, String(cur.getDate()));
    dnum.style.fontWeight = '800';
    dnum.style.fontSize = '0.9rem';
    cell.appendChild(dnum);
    const dayKey = ymd(cur);
    const items = Array.isArray(groups[dayKey]) ? groups[dayKey] : [];
    if (items.length) {
      const hasE = items.some(ev => ev && ev.kind === 'earnings');
      const hasD = items.some(ev => ev && ev.kind === 'dividend');
      if (hasE && hasD) {
        cell.style.background = 'linear-gradient(135deg, #dbeafe 0%, #dbeafe 50%, #dcfce7 50%, #dcfce7 100%)';
        cell.style.borderColor = '#93c5fd';
      } else if (hasE) {
        cell.style.background = '#dbeafe';
        cell.style.borderColor = '#93c5fd';
      } else if (hasD) {
        cell.style.background = '#dcfce7';
        cell.style.borderColor = '#86efac';
      }
      // Centered unique symbols overlay
      const symWrap = el('div');
      symWrap.style.display = 'flex';
      symWrap.style.flexWrap = 'wrap';
      symWrap.style.justifyContent = 'center';
      symWrap.style.alignItems = 'center';
      symWrap.style.gap = '6px';
      symWrap.style.marginTop = '6px';
      const uniq = Array.from(new Set(items.map(ev => ev && ev.symbol).filter(Boolean))).slice(0, 4);
      uniq.forEach(s => {
        const tag = el('span', 'cal-symbol', s);
        tag.style.background = 'rgba(255,255,255,.6)';
        tag.style.padding = '2px 6px';
        tag.style.borderRadius = '8px';
        symWrap.appendChild(tag);
      });
      cell.appendChild(symWrap);
    }
    grid.appendChild(cell);
    cur.setDate(cur.getDate() + 1);
  }
  calWrap.appendChild(head);
  calWrap.appendChild(grid);
  postDiv.appendChild(calWrap);

  postDiv.oncontextmenu = (e) => {
    e.preventDefault();
    document.querySelectorAll('.post-options').forEach(n => n.remove());
    const menu = document.createElement('div');
    menu.className = 'post-options';
    const px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
    const py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
    menu.style.left = px + 'px';
    menu.style.top = py + 'px';
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'opt-btn';
    refreshBtn.textContent = 'Refresh';
    const delBtn = document.createElement('button');
    delBtn.className = 'opt-btn';
    delBtn.textContent = 'Delete';
    menu.appendChild(refreshBtn);
    menu.appendChild(delBtn);
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', ev => ev.stopPropagation());
    menu.addEventListener('click', ev => ev.stopPropagation());
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
    refreshBtn.onclick = async () => {
      menu.remove();
      try {
        await refreshDashboardCalendarPost(p);
        showDashboard();
      } catch {}
    };
    delBtn.onclick = () => {
      menu.remove();
      const list = shippedPosts['DASHBOARD'] || [];
      const indexInList = list.indexOf(p);
      if (indexInList >= 0) {
        list.splice(indexInList, 1);
        savePostsToStorage();
        showDashboard();
      }
    };
  };
  container.appendChild(postDiv);
}

/*
  Render posts for a specific symbol
*/
function renderPostsForSymbol(sym, card) {
  const posts = shippedPosts[sym] || [];
  if (!posts.length) return;

  const postsContainer = el('div', 'posts-container');
  posts.forEach((p, idx) => {
    const postDiv = el('div', 'post');
    postDiv.dataset.postIndex = String(idx);
    const ensureId = () => {
      if (!p.id) p.id = nextPostId();
    };
    ensureId();

    if (p.type === 'text') {
      renderTextPost(postDiv, p, sym);
    } else if (p.type === 'chart') {
      renderChartPost(postDiv, p, sym);
    } else if (p.type === 'news') {
      renderNewsPost(postDiv, p, sym);
    } else if (p.type === 'ai_news') {
      renderAINewsPost(postDiv, p, sym);
    } else if (p.type === 'comment') {
      renderCommentPost(postDiv, p, sym);
    } else if (p.type === 'kings') {
      renderKingsPost(postDiv, p, sym);
    }

    postsContainer.appendChild(postDiv);

    // If this is a comment, move it directly under its parent if present
    if (p.type === 'comment' && p.parentId) {
      const siblings = Array.from(postsContainer.children);
      const parentEl = siblings.find(ch => ch.dataset && ch.dataset.postId === String(p.parentId));
      if (parentEl) {
        parentEl.after(postDiv);
      }
    }
  });

  // Tag each post element with its id for positioning child comments and live updates
  Array.from(postsContainer.children).forEach((elNode, i) => {
    const pp = posts[i];
    if (pp && pp.id) elNode.dataset.postId = String(pp.id);
  });

  // Second pass: move all comment posts directly under their parent
  const childrenArray = Array.from(postsContainer.children);
  childrenArray.forEach(parentEl => {
    const parentId = parentEl.dataset && parentEl.dataset.postId;
    if (!parentId) return;
    // Gather comments for this parent
    const comments = childrenArray.filter(ch => {
      const idxStr = ch.dataset && ch.dataset.postIndex;
      if (idxStr == null) return false;
      const cp = posts[Number(idxStr)];
      return cp && cp.type === 'comment' && String(cp.parentId) === String(parentId);
    });
    if (!comments.length) return;
    // Sort comments by timestamp ascending
    comments.sort((a, b) => {
      const ap = posts[Number(a.dataset.postIndex)] || {};
      const bp = posts[Number(b.dataset.postIndex)] || {};
      const at = ap.ts || 0, bt = bp.ts || 0;
      return at - bt;
    });
    // Move comments in order to directly follow the parent
    let anchor = parentEl;
    comments.forEach(c => {
      anchor.after(c);
      anchor = c;
    });
  });

  card.appendChild(postsContainer);
}

function renderTextPost(postDiv, p, sym) {
  postDiv.classList.add('text-post');
  const header = el('div', 'post-header', `${sym} • Note`);
  const textEl = el('div', 'text-content', p.content);
  postDiv.appendChild(header);
  postDiv.appendChild(textEl);
  if (p.ts) {
    const meta = el('div', 'post-info');
    meta.appendChild(el('span', null, formatDateTime(p.ts)));
    postDiv.appendChild(meta);
  }
  // Mark indicator dot
  if (p.mark) {
    const dot = document.createElement('div');
    dot.className = 'mark-indicator';
    dot.style.background = (p.mark === 'good') ? '#10b981' :
                          (p.mark === 'bad') ? '#ef4444' : '#9ca3af';
    postDiv.appendChild(dot);
  }
  // Right-click options for text posts
  postDiv.oncontextmenu = (e) => {
    e.preventDefault();
    handleTextPostOptions(e, postDiv, p, sym);
  };
}

function renderChartPost(postDiv, p, sym) {
  postDiv.classList.add('chart-post');
  const header = el('div', 'post-header', `${sym} • ${p.timeframe || ''}`);
  postDiv.appendChild(header);
  if (p.mark) {
    const dot = document.createElement('div');
    dot.className = 'mark-indicator';
    dot.style.background = (p.mark === 'good') ? '#10b981' :
                          (p.mark === 'bad') ? '#ef4444' : '#9ca3af';
    postDiv.appendChild(dot);
  }
  // Information bar
  const infoBar = el('div', 'post-info');
  if (p.ts) infoBar.appendChild(el('span', null, formatDateTime(p.ts)));
  // Show price if available
  if (p.price != null) {
    const priceSpan = document.createElement('span');
    priceSpan.dataset.role = 'price';
    priceSpan.textContent = `Price: $${p.price.toFixed(2)}`;
    infoBar.appendChild(priceSpan);
  }
  // Show TRI
  if (p.tri != null) {
    const triSpan = document.createElement('span');
    triSpan.dataset.role = 'tri';
    const triPrefix = p.tri >= 0 ? '+' : '';
    triSpan.textContent = `TRI: ${triPrefix}${p.tri.toFixed(2)}%`;
    infoBar.appendChild(triSpan);
  }
  postDiv.appendChild(infoBar);
  // Create canvas for mini chart
  const miniCanvas = document.createElement('canvas');
  miniCanvas.className = 'mini-chart-canvas';
  postDiv.appendChild(miniCanvas);
  // Legend for indicators
  const legend = document.createElement('div');
  legend.className = 'post-legend';
  const colorFor = (ind) => {
    switch (ind) {
      case 'MA20': return '#1f77b4';
      case 'MA50': return '#2ca02c';
      case 'RSI': return '#9467bd';
      case 'MACD': return '#17becf';
      case 'BB': return '#9ca3af';
      case 'Stoch': return '#ff7f0e';
      case 'ATR': return '#d62728';
      case 'OBV': return '#7f7f7f';
      case 'Trendline': return '#1f2a44';
      default: return '#8c564b';
    }
  };
  const addLegendItem = (label, color, value) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const sw = document.createElement('span');
    sw.className = 'legend-swatch';
    sw.style.background = color;
    const text = document.createElement('span');
    if (value != null) {
      const formatted = (typeof value === 'number') ? value.toFixed(2) : value;
      text.textContent = `${label}: ${formatted}`;
    } else {
      text.textContent = label;
    }
    item.appendChild(sw);
    item.appendChild(text);
    legend.appendChild(item);
  };
  // Build legend from active indicators
  if (p && Array.isArray(p.activeIndicators)) {
    const inds = new Set(p.activeIndicators);
    if (inds.has('MA')) {
      const v20 = p.indicatorValues ? p.indicatorValues['MA20'] : null;
      const v50 = p.indicatorValues ? p.indicatorValues['MA50'] : null;
      addLegendItem('MA20', colorFor('MA20'), v20);
      addLegendItem('MA50', colorFor('MA50'), v50);
    }
    ['RSI', 'MACD', 'BB', 'Stoch', 'ATR', 'OBV', 'Trendline'].forEach(k => {
      if (inds.has(k)) {
        const val = p.indicatorValues ? p.indicatorValues[k] : null;
        addLegendItem(k, colorFor(k), val);
      }
    });
  }
  infoBar.appendChild(legend);
  // Optionclick for chart posts
  postDiv.oncontextmenu = (e) => {
    e.preventDefault();
    handleChartPostOptions(e, postDiv, p, sym);
  };
  // Append the post to the container before drawing
  // Draw the mini chart after DOM insertion
  requestAnimationFrame(() => {
    try {
      renderMiniChart(miniCanvas, p.rawData, p.activeIndicators);
    } catch (err) {
      console.error('Failed to render mini chart', err);
    }
  });
}

function renderNewsPost(postDiv, p, sym) {
  postDiv.classList.add('text-post');
  const header = el('div', 'post-header', `${sym} • News`);
  if (p.mark) {
    const dot = document.createElement('div');
    dot.className = 'mark-indicator';
    dot.style.background = (p.mark === 'good') ? '#10b981' : (p.mark === 'bad') ? '#ef4444' : '#9ca3af';
    postDiv.appendChild(dot);
  }
  // Card-like layout to mirror picker design
  const row = el('div');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '42px 1fr';
  row.style.gap = '10px';
  const thumb = el('div', 'news-thumb');
  const img = document.createElement('img');
  const host = p.url ? urlToHostname(p.url) : null;
  img.src = faviconUrlForHost(host || '');
  img.alt = p.source || '';
  thumb.appendChild(img);
  const content = el('div', 'news-content');
  const link = document.createElement('a');
  link.href = p.url || '#'; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = p.title || 'Untitled';
  link.className = 'news-title';
  const meta = el('div', 'news-meta');
  const metaIco = document.createElement('img');
  metaIco.src = faviconUrlForHost(host || '');
  metaIco.alt = p.source || '';
  metaIco.className = 'news-meta-ico';
  const metaText = el('span', null, p.source || '');
  const metaDate = el('span', null, p.published ? String(p.published).slice(0, 16) : '');
  meta.appendChild(metaIco);
  meta.appendChild(metaText);
  meta.appendChild(metaDate);
  content.appendChild(link);
  content.appendChild(meta);
  row.appendChild(thumb);
  row.appendChild(content);
  postDiv.appendChild(header);
  postDiv.appendChild(row);
  if (p.ts) {
    const info = el('div', 'post-info');
    info.appendChild(el('span', null, formatDateTime(p.ts)));
    postDiv.appendChild(info);
  }
  // Options: Delete and Comment
  postDiv.oncontextmenu = (e) => {
    e.preventDefault();
    handleNewsPostOptions(e, postDiv, p, sym);
  };
}

function renderAINewsPost(postDiv, p, sym) {
  postDiv.classList.add('text-post');
  const header = el('div', 'post-header', `${sym} • AI News`);
  postDiv.appendChild(header);
  const body = el('div', 'text-content', (p.content && normalizeToParagraph(stripMarkdownLinks(p.content))) || 'Generating summary...');
  postDiv.appendChild(body);
  const meta = el('div', 'post-info');
  if (p.ts) meta.appendChild(el('span', null, formatDateTime(p.ts)));
  if (Array.isArray(p.urls) && p.urls.length) {
    const linkWrap = document.createElement('span');
    linkWrap.textContent = 'Sources: ';
    p.urls.slice(0, 2).forEach((u) => {
      const host = urlToHostname(u);
      const ico = faviconUrlForHost(host);
      const a = document.createElement('a');
      a.href = u;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'inline-flex';
      a.style.alignItems = 'center';
      a.style.justifyContent = 'center';
      a.style.width = '22px';
      a.style.height = '22px';
      a.style.borderRadius = '50%';
      a.style.overflow = 'hidden';
      a.style.marginRight = '6px';
      a.style.border = '1px solid #e5e7eb';
      a.style.background = '#fff';
      const img = document.createElement('img');
      img.src = ico;
      img.alt = host || 'source';
      img.style.width = '16px';
      img.style.height = '16px';
      img.style.borderRadius = '50%';
      img.referrerPolicy = 'no-referrer';
      a.appendChild(img);
      linkWrap.appendChild(a);
    });
    meta.appendChild(linkWrap);
  }
  postDiv.appendChild(meta);

  // Right-click menu: delete
  postDiv.oncontextmenu = (e) => {
    e.preventDefault();
    document.querySelectorAll('.post-options').forEach(n => n.remove());
    const menu = document.createElement('div');
    menu.className = 'post-options';
    const px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
    const py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
    menu.style.left = px + 'px';
    menu.style.top = py + 'px';
    const delBtn = document.createElement('button');
    delBtn.className = 'opt-btn';
    delBtn.textContent = 'Delete';
    menu.appendChild(delBtn);
    document.body.appendChild(menu);
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
    delBtn.onclick = () => {
      menu.remove();
      const list = shippedPosts[sym] || [];
      const indexInList = list.indexOf(p);
      if (indexInList >= 0) {
        list.splice(indexInList, 1);
        savePostsToStorage();
        showBlogView(sym);
      }
    };
  };

  // If streaming required and not yet started, kick it off
  // Attach a flag to avoid duplicate streams after re-render
  if (p.status === 'streaming' && !p._streamingAttached) {
    p._streamingAttached = true;
    const urls = Array.isArray(p.urls) ? p.urls.slice(0, 2) : [];
    let acc = '';
    const update = (delta) => {
      acc += delta;
      body.textContent = normalizeToParagraph(stripMarkdownLinks(acc));
      // Detect and surface any new links as icons during stream
      const found = extractUrlsFromText(acc);
      if (found && found.length) {
        // Merge with existing p.urls (max 2 shown)
        const set = new Set([...(p.urls || []), ...found]);
        p.urls = Array.from(set);
        savePostsToStorage();
        // Rebuild icons
        const existingMeta = meta;
        const nodes = Array.from(existingMeta.childNodes);
        const idx = nodes.findIndex(n => n && n.nodeType === 1 && n.tagName === 'SPAN' && n.textContent && n.textContent.trim().startsWith('Sources:'));
        if (idx >= 0) existingMeta.removeChild(nodes[idx]);
        if (p.urls && p.urls.length) {
          const wrap = document.createElement('span');
          wrap.textContent = 'Sources: ';
          p.urls.slice(0, 2).forEach((u) => {
            const host = urlToHostname(u);
            const ico = faviconUrlForHost(host);
            const a = document.createElement('a');
            a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.style.display = 'inline-flex'; a.style.alignItems = 'center'; a.style.justifyContent = 'center';
            a.style.width = '22px'; a.style.height = '22px'; a.style.borderRadius = '50%'; a.style.overflow = 'hidden'; a.style.marginRight = '6px'; a.style.border = '1px solid #e5e7eb'; a.style.background = '#fff';
            const img = document.createElement('img'); img.src = ico; img.alt = host || 'source'; img.style.width = '16px'; img.style.height = '16px'; img.style.borderRadius = '50%'; img.referrerPolicy = 'no-referrer';
            a.appendChild(img);
            wrap.appendChild(a);
          });
          existingMeta.appendChild(wrap);
        }
      }
    };
    const done = () => {
      p.content = normalizeToParagraph(stripMarkdownLinks(acc || body.textContent || ''));
      p.status = 'done';
      savePostsToStorage();
    };
    const fail = (err) => {
      const msg = (err && err.status) ? `AI summary failed (${err.status}).` : 'AI summary failed.';
      body.textContent = msg;
      p.content = msg;
      p.status = 'failed';
      savePostsToStorage();
    };
    try {
      openAIStreamSummarizeNews(sym, urls, update, done, fail);
    } catch (e) {
      fail();
    }
  }
}

function renderCommentPost(postDiv, p, sym) {
  postDiv.classList.add('text-post', 'comment-post');
  const header = el('div', 'post-header', `${sym} • Comment`);
  const textEl = el('div', 'text-content', p.content || '');
  postDiv.appendChild(header);
  postDiv.appendChild(textEl);
  if (p.ts) {
    const meta = el('div', 'post-info');
    meta.appendChild(el('span', null, formatDateTime(p.ts)));
    postDiv.appendChild(meta);
  }
  if (p.mark) {
    const dot = document.createElement('div');
    dot.className = 'mark-indicator';
    dot.style.background = (p.mark === 'good') ? '#10b981' :
                          (p.mark === 'bad') ? '#ef4444' : '#9ca3af';
    postDiv.appendChild(dot);
  }
  // Context menu: edit/save/delete
  postDiv.oncontextmenu = (e) => {
    e.preventDefault();
    handleCommentPostOptions(e, postDiv, p, sym);
  };
}

function renderKingsPost(postDiv, p, sym) {
  postDiv.classList.add('chart-post');
  const header = el('div', 'post-header', `${sym} • Kings`);
  postDiv.appendChild(header);
  if (p.mark) {
    const dot = document.createElement('div');
    dot.className = 'mark-indicator';
    dot.style.background = (p.mark === 'good') ? '#10b981' :
                          (p.mark === 'bad') ? '#ef4444' : '#9ca3af';
    postDiv.appendChild(dot);
  }
  const infoBar = el('div', 'post-info');
  if (p.ts) infoBar.appendChild(el('span', null, formatDateTime(p.ts)));
  infoBar.appendChild(el('span', null, `Score: ${Math.round(p.total)}/100`));
  postDiv.appendChild(infoBar);
  const canvas = document.createElement('canvas');
  canvas.className = 'kings-chart-canvas';
  postDiv.appendChild(canvas);
  // Right-click: edit, comment, mark and delete
  postDiv.oncontextmenu = (e) => {
    e.preventDefault();
    handleKingsPostOptions(e, postDiv, p, sym);
  };
  // Draw hex chart
  requestAnimationFrame(() => {
    drawKingsHexChart(canvas, p);
  });
}

function drawKingsHexChart(canvas, p) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) * 0.35;
  const axes = p.axes || {};
  const axesDef = [
    { key: 'needs', label: 'Güter & Dienstleistungen', max: 8 },
    { key: 'understand', label: 'Verständlichkeit', max: 8 },
    { key: 'margin', label: 'Umsatzrendite', max: 8 },
    { key: 'moat', label: 'Wettbewerbsvorteile', max: 8 },
    { key: 'management', label: 'Management', max: 30 },
    { key: 'financeGrowth', label: 'Bilanz & Kapital + Wachstum', max: 38 }
  ];
  const angleStep = (Math.PI * 2) / axesDef.length;
  // Guides (rings)
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let r = 0.25; r <= 1.0; r += 0.25) {
    ctx.beginPath();
    for (let i = 0; i < axesDef.length; i++) {
      const ang = -Math.PI / 2 + i * angleStep;
      const x = cx + Math.cos(ang) * radius * r;
      const y = cy + Math.sin(ang) * radius * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  // Axis lines and labels
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = '#374151';
  ctx.strokeStyle = '#d1d5db';
  axesDef.forEach((def, i) => {
    const ang = -Math.PI / 2 + i * angleStep;
    const x = cx + Math.cos(ang) * radius;
    const y = cy + Math.sin(ang) * radius;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    // label
    const lbl = def.label;
    const lx = cx + Math.cos(ang) * (radius + 16);
    const ly = cy + Math.sin(ang) * (radius + 16);
    ctx.textAlign = Math.cos(ang) > 0.2 ? 'left' : Math.cos(ang) < -0.2 ? 'right' : 'center';
    ctx.textBaseline = Math.sin(ang) > 0.2 ? 'top' : Math.sin(ang) < -0.2 ? 'bottom' : 'middle';
    ctx.fillText(lbl, lx, ly);
  });
  // Data polygon
  const poly = [];
  axesDef.forEach((def, i) => {
    const ang = -Math.PI / 2 + i * angleStep;
    const val = Math.max(0, Math.min((def.max || 1), axes[def.key] || 0));
    const pct = val / (def.max || 1);
    const x = cx + Math.cos(ang) * radius * pct;
    const y = cy + Math.sin(ang) * radius * pct;
    poly.push({ x, y });
  });
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(16,185,129,0.25)';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // Tooltip for axes
  let tooltipEl = canvas.parentElement.querySelector('.chart-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    tooltipEl.innerHTML = '<div class="tooltip-date"></div><div class="tooltip-price"></div>';
    canvas.parentElement.appendChild(tooltipEl);
  }
  function showTooltip(e) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const vx = mx - cx;
    const vy = my - cy;
    const ang = Math.atan2(vy, vx);
    const raw = ang - (-Math.PI / 2);
    const twoPi = Math.PI * 2;
    const norm = ((raw % twoPi) + twoPi) % twoPi;
    const idx = Math.round(norm / angleStep) % axesDef.length;
    const def = axesDef[idx];
    const val = Math.max(0, Math.min((def.max || 1), axes[def.key] || 0));
    const pct = ((val / (def.max || 1)) * 100).toFixed(0);
    tooltipEl.querySelector('.tooltip-date').textContent = def.label;
    tooltipEl.querySelector('.tooltip-price').textContent = `${val} / ${def.max} (${pct}%)`;
    const ttWidth = 140;
    const ttHeight = 52;
    let left = mx + 10;
    if (left + ttWidth > r.width) left = r.width - ttWidth - 10;
    let top = my - ttHeight - 10;
    if (top < 0) top = my + 10;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.classList.add('visible');
  }
  function hideTooltip() {
    tooltipEl.classList.remove('visible');
  }
  canvas.addEventListener('mousemove', showTooltip);
  canvas.addEventListener('mouseleave', hideTooltip);
}

// Calendar refresh
async function refreshDashboardCalendarPost(post) {
  if (!post || post.type !== 'calendar') return;
  try {
    const symbols = Object.keys(shippedPosts).filter(s =>
      s !== 'DASHBOARD' && Array.isArray(shippedPosts[s]) && shippedPosts[s].length > 0
    );
    if (!symbols.length) return;
    const from = post.range && post.range.from ? post.range.from : null;
    const to = post.range && post.range.to ? post.range.to : null;
    if (!from || !to) return;
    const earnUrl = `${API_BASE}/earning_calendar?from=${from}&to=${to}&apikey=${API_KEY}`;
    const divUrl = `${API_BASE}/stock_dividend_calendar?from=${from}&to=${to}&apikey=${API_KEY}`;
    const [earnings, dividends] = await Promise.all([
      fetchJson(earnUrl).catch(() => []),
      fetchJson(divUrl).catch(() => [])
    ]);
    const symSet = new Set(symbols.map(s => s.toUpperCase()));
    const groups = {};
    function addEvent(date, ev) {
      if (!date) return;
      if (!groups[date]) groups[date] = [];
      groups[date].push(ev);
    }
    (Array.isArray(earnings) ? earnings : []).forEach(it => {
      const symbol = (it.symbol || it.ticker || '').toUpperCase();
      if (!symbol || !symSet.has(symbol)) return;
      const date = (it.date || it.epsDate || it.earningsDate || '').slice(0, 10);
      addEvent(date, {
        kind: 'earnings',
        symbol,
        name: it.company || it.companyName || '',
        extra: (it.time ? `(${it.time}) ` : '') +
               (it.eps ? `EPS ${it.eps}` : (it.epsEstimated ? `Est ${it.epsEstimated}` : ''))
      });
    });
    (Array.isArray(dividends) ? dividends : []).forEach(it => {
      const symbol = (it.symbol || it.ticker || '').toUpperCase();
      if (!symbol || !symSet.has(symbol)) return;
      // Use the ex-dividend date (date field) as primary date for calendar display
      const date = (it.date || it.recordDate || it.paymentDate || it.declarationDate || '').slice(0, 10);
      addEvent(date, {
        kind: 'dividend',
        symbol,
        name: it.company || it.companyName || '',
        extra: (it.dividend ? `Div ${it.dividend}` : '') +
               (it.paymentDate && it.paymentDate !== it.date ? ` (pay: ${it.paymentDate.slice(5)})` : '')
      });
    });
    post.groups = groups;
    post.ts = Date.now();
    savePostsToStorage();
  } catch {}
}
