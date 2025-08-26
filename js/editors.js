/*
  editors.js - Editor components and post option handlers
  This file contains all editors, builders, and context menu handlers
*/

/*
  Show a modal text editor for composing a note or analysis
*/
function showTextEditor(card, sym) {
  // Remove any existing editor overlays
  const existing = card.querySelector('.text-editor');
  if (existing) existing.remove();

  const editor = el('div', 'text-editor');

  // Text area for input
  const textarea = document.createElement('textarea');
  textarea.className = 'text-input';
  editor.appendChild(textarea);

  // Buttons container
  const btnRow = el('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '12px';
  btnRow.style.justifyContent = 'center';

  // Post button
  const postBtn = el('button', 'post-btn', 'Post');
  postBtn.onclick = () => {
    const text = textarea.value.trim();
    // Save the note if not empty
    if (text) {
      if (!shippedPosts[sym]) shippedPosts[sym] = [];
      const ts = Date.now();
      shippedPosts[sym].push({
        id: nextPostId(),
        type: 'text',
        content: text,
        ts
      });
      pushPostToFirestore(sym, { type: 'text', content: text, ts });
      savePostsToStorage();
    }
    // Return to blog view
    showBlogView(sym);
  };

  // Cancel button
  const cancelBtn = el('button', 'cancel-btn', 'Cancel');
  cancelBtn.onclick = () => {
    // Simply return to blog view without saving
    showBlogView(sym);
  };

  btnRow.appendChild(postBtn);
  btnRow.appendChild(cancelBtn);
  editor.appendChild(btnRow);
  card.appendChild(editor);

  // Auto-scroll editor into view
  requestAnimationFrame(() => {
    try {
      editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {}
  });
}

// News picker: fetch top 10 relevant news for symbol
function showNewsPicker(card, sym) {
  // Remove existing picker if any
  const existing = card.querySelector('.text-editor');
  if (existing) existing.remove();

  const overlay = el('div', 'text-editor');

  // Title
  const title = el('div', null, `News for ${sym}`);
  title.style.fontWeight = '700';
  title.style.fontSize = '1rem';
  overlay.appendChild(title);

  // Container for list
  const list = el('div', 'news-list');
  list.style.maxHeight = '300px';
  list.style.overflowY = 'auto';
  overlay.appendChild(list);

  // Buttons row
  const btnRow = el('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '12px';
  btnRow.style.justifyContent = 'center';
  const shipBtn = el('button', 'post-btn', 'Shipp');
  const cancelBtn = el('button', 'cancel-btn', 'Cancel');
  btnRow.appendChild(shipBtn);
  btnRow.appendChild(cancelBtn);
  overlay.appendChild(btnRow);
  card.appendChild(overlay);

  // Ensure the picker is brought into view
  requestAnimationFrame(() => {
    try {
      overlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { /* noop */ }
  });

  // Load news
  const url = `${API_BASE}/stock_news?tickers=${encodeURIComponent(sym)}&limit=25&apikey=${API_KEY}`;
  fetchJson(url).then(items => {
    const news = Array.isArray(items) ? items.slice(0, 25) : [];
    const selected = new Set();
    news.forEach((n, idx) => {
      const item = el('div', 'news-item');
      item.dataset.idx = String(idx);
      // Left thumb
      const left = el('div', 'news-thumb');
      const img = document.createElement('img');
      const host = (n && (n.url || n.link)) ? urlToHostname(n.url || n.link) : null;
      img.src = (n && n.image) ? n.image : faviconUrlForHost(host || '');
      img.alt = n.site || n.source || '';
      left.appendChild(img);
      item.appendChild(left);
      // Right content
      const content = el('div', 'news-content');
      const titleEl = el('div', 'news-title', n.title || n.headline || 'Untitled');
      const metaWrap = el('div', 'news-meta');
      const metaIcon = document.createElement('img');
      metaIcon.src = faviconUrlForHost(host || '');
      metaIcon.alt = (n.site || n.source || '').toString();
      metaIcon.className = 'news-meta-ico';
      const metaText = el('span', null, `${n.site || n.source || ''}`);
      const metaDate = el('span', null, `${n.publishedDate || ''}`);
      metaWrap.appendChild(metaIcon);
      metaWrap.appendChild(metaText);
      metaWrap.appendChild(metaDate);
      const snippet = el('div', 'news-snippet', (n.text || '').slice(0, 160));
      content.appendChild(titleEl);
      content.appendChild(metaWrap);
      if ((n.text || '').trim()) content.appendChild(snippet);
      item.appendChild(content);
      item.onclick = () => {
        if (selected.has(idx)) {
          selected.delete(idx);
          item.classList.remove('selected');
        } else {
          selected.add(idx);
          item.classList.add('selected');
        }
      };
      list.appendChild(item);
    });
    // Attach selection set to overlay for use on ship
    overlay._selectedNews = news;
    overlay._selectedIdx = () => Array.from(selected);
  }).catch(() => {
    list.appendChild(el('div', null, 'Failed to load news.'));
  });

  // Actions
  cancelBtn.onclick = () => showBlogView(sym);
  shipBtn.onclick = () => {
    const news = overlay._selectedNews || [];
    const selectedIndexes = (overlay._selectedIdx && overlay._selectedIdx()) || [];
    if (!selectedIndexes.length) {
      showBlogView(sym);
      return;
    }
    const chosen = selectedIndexes.map(i => news[i]).filter(Boolean);
    if (!shippedPosts[sym]) shippedPosts[sym] = [];
    chosen.forEach(n => {
      const ts = Date.now();
      shippedPosts[sym].push({
        id: nextPostId(),
        type: 'news',
        title: n.title || n.headline || 'Untitled',
        url: n.url || n.link || '',
        source: n.site || n.source || '',
        published: n.publishedDate || n.datetime || '',
        ts
      });
      pushPostToFirestore(sym, {
        type: 'news',
        title: n.title || n.headline || 'Untitled',
        url: n.url || n.link || '',
        source: n.site || n.source || '',
        published: n.publishedDate || n.datetime || '',
        ts
      });
    });
    savePostsToStorage();
    showBlogView(sym);
  };
}

// Kings scoring form
function showKingsForm(card, sym, existingPost) {
  // Remove existing overlay if any
  const existing = card.querySelector('.text-editor');
  if (existing) existing.remove();

  const overlay = el('div', 'text-editor kings-overlay');
  const title = el('div', null, `Kings Bewertung – ${sym}`);
  title.style.fontWeight = '700';
  title.style.fontSize = '1rem';
  overlay.appendChild(title);

  const form = document.createElement('div');
  form.style.display = 'flex';
  form.style.flexDirection = 'column';
  form.style.gap = '10px';

  function field(label, options, defaultValue) {
    const wrap = document.createElement('div');
    wrap.className = 'kings-field';
    const lab = document.createElement('div');
    lab.className = 'kings-label';
    lab.textContent = label;
    wrap.appendChild(lab);
    const row = document.createElement('div');
    row.className = 'kings-options';
    let value = (typeof defaultValue === 'number') ? defaultValue : 0;
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kings-option';
      btn.textContent = opt.label;
      btn.onclick = (e) => {
        e.preventDefault();
        value = opt.points;
        Array.from(row.children).forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        recalc();
      };
      if (opt.points === value) {
        btn.classList.add('active');
      }
      row.appendChild(btn);
    });
    wrap._get = () => value;
    wrap.appendChild(row);
    return wrap;
  }

  // Compute prefill values if editing
  const isEdit = !!existingPost;
  const pref = {
    I: { f1: 0, f2: 0, f3: 0, f4: 0, f5: 0 },
    II: { f6: 0, f71: 0, f72: 0, f81: 0, f82: 0, f83: 0, f84: 0 },
    III: { f91: 0, f92: 0, f93: 0, f101: 0, f102: 0, f103: 0 }
  };

  if (isEdit && existingPost) {
    if (existingPost.selection) {
      try {
        const sel = existingPost.selection;
        ['I', 'II', 'III'].forEach(k => {
          if (!sel[k]) sel[k] = {};
        });
        Object.assign(pref.I, {
          f1: +(sel.I.f1 || 0), f2: +(sel.I.f2 || 0), f3: +(sel.I.f3 || 0),
          f4: +(sel.I.f4 || 0), f5: +(sel.I.f5 || 0)
        });
        Object.assign(pref.II, {
          f6: +(sel.II.f6 || 0), f71: +(sel.II.f71 || 0), f72: +(sel.II.f72 || 0),
          f81: +(sel.II.f81 || 0), f82: +(sel.II.f82 || 0), f83: +(sel.II.f83 || 0),
          f84: +(sel.II.f84 || 0)
        });
        Object.assign(pref.III, {
          f91: +(sel.III.f91 || 0), f92: +(sel.III.f92 || 0), f93: +(sel.III.f93 || 0),
          f101: +(sel.III.f101 || 0), f102: +(sel.III.f102 || 0), f103: +(sel.III.f103 || 0)
        });
      } catch {}
    }
  }

  // Field definitions
  const f1 = field('Güter & Dienstleistungen des täglichen Bedarfs',
    [{ label: 'Nein (0)', points: 0 }, { label: 'Teilweise (4)', points: 4 }, { label: 'Ja (8)', points: 8 }],
    pref.I.f1);
  const f2 = field('Verständlichkeit',
    [{ label: 'Nein (0)', points: 0 }, { label: 'Einigermaßen (4)', points: 4 }, { label: 'Sehr verständlich (8)', points: 8 }],
    pref.I.f2);
  const f3 = field('Umsatzrendite',
    [{ label: '< 5% (0)', points: 0 }, { label: '> 5% (2)', points: 2 }, { label: '> 10% (4)', points: 4 },
     { label: '> 15% (6)', points: 6 }, { label: '> 25% (8)', points: 8 }],
    pref.I.f3);
  const f4 = field('Wettbewerbsvorteile',
    [{ label: 'Deutliche Nachteile (0)', points: 0 }, { label: 'Neutral (4)', points: 4 },
     { label: 'Deutliche Vorteile (8)', points: 8 }],
    pref.I.f4);
  const f5 = field('Branchenwachstum',
    [{ label: 'Starke Schrumpfung >5% (0)', points: 0 }, { label: 'Leichte Schrumpfung (2)', points: 2 },
     { label: 'Kein Wachstum (4)', points: 4 }, { label: 'Leichtes Wachstum (6)', points: 6 },
     { label: 'Starkes Wachstum >10% (8)', points: 8 }],
    pref.I.f5);

  const f6 = field('Eigentümerperspektive',
    [{ label: 'Nein (0)', points: 0 }, { label: 'Teilweise/Mittel/Vielleicht (6)', points: 6 },
     { label: 'Ja (12)', points: 12 }],
    pref.II.f6);

  const f71 = field('Qualifikationen',
    [{ label: 'Gering (0)', points: 0 }, { label: 'Mittel/Unsicher (1)', points: 1 },
     { label: 'Hoch, Erfolge (3)', points: 3 }],
    pref.II.f71);
  const f72 = field('Fluktuationen',
    [{ label: 'Kurz dabei, häufige Wechsel (0)', points: 0 }, { label: 'Mittel/Unsicher (1)', points: 1 },
     { label: 'Gering, lange dabei (3)', points: 3 }],
    pref.II.f72);

  const f81 = field('Medienpräsenz/Promifaktor',
    [{ label: 'Viel (0)', points: 0 }, { label: 'Etwas (2)', points: 2 }, { label: 'Wenig (3)', points: 3 }],
    pref.II.f81);
  const f82 = field('Erneuerungsinitiativen',
    [{ label: 'Viele (0)', points: 0 }, { label: 'Einige (2)', points: 2 }, { label: 'Wenige (3)', points: 3 }],
    pref.II.f82);
  const f83 = field('Krisenmanagement',
    [{ label: 'Schrumpfung (0)', points: 0 }, { label: 'Stabil/leichtes Wachstum (2)', points: 2 },
     { label: 'Deutliches Wachstum (3)', points: 3 }],
    pref.II.f83);
  const f84 = field('Kommunikation',
    [{ label: 'Unklare Berichte/Prognosen verfehlt (0)', points: 0 }, { label: 'Teils, teils (2)', points: 2 },
     { label: 'Klare Berichte/Prognosen halten (3)', points: 3 }],
    pref.II.f84);

  const f91 = field('Nettoliquidität',
    [{ label: 'Nettoverschuldung (0)', points: 0 }, { label: 'Neutral (3)', points: 3 },
     { label: 'Hohe Nettoliquidität (5)', points: 5 }],
    pref.III.f91);
  const f92 = field('Eigenkapitalquote',
    [{ label: '< 25% (0)', points: 0 }, { label: '> 25% (2)', points: 2 },
     { label: '40–50% (3)', points: 3 }, { label: '> 50% (4)', points: 4 }, { label: '> 70% (5)', points: 5 }],
    pref.III.f92);
  const f93 = field('Verschuldung zu operativem Cashflow',
    [{ label: '> 3× (0)', points: 0 }, { label: '3× bis 2× (2)', points: 2 },
     { label: '2 bis 1,5× (4)', points: 4 }, { label: '< 1,5× (5)', points: 5 }],
    pref.III.f93);

  const f101 = field('Dividendenqualität',
    [{ label: 'Keine/Unregelmäßig (0)', points: 0 }, { label: 'Regelmäßig, konstant (3)', points: 3 },
     { label: 'Regelmäßig, steigend (5)', points: 5 }],
    pref.III.f101);
  const f102 = field('Kapitalerhöhung/Aktienrückkäufe',
    [{ label: 'Schlecht (0)', points: 0 }, { label: 'Mittel (3)', points: 3 }, { label: 'Gut (5)', points: 5 }],
    pref.III.f102);
  const f103 = field('Akquisitionsstrategie',
    [{ label: 'Schlecht (0)', points: 0 }, { label: 'Mittel (3)', points: 3 }, { label: 'Gut (5)', points: 5 }],
    pref.III.f103);

  const allFields = [f1, f2, f3, f4, f5, f6, f71, f72, f81, f82, f83, f84, f91, f92, f93, f101, f102, f103];

  // Split into three sections
  const section1 = document.createElement('div');
  const section2 = document.createElement('div');
  const section3 = document.createElement('div');
  [f1, f2, f3, f4, f5].forEach(f => section1.appendChild(f));
  [f6, f71, f72, f81, f82, f83, f84].forEach(f => section2.appendChild(f));
  [f91, f92, f93, f101, f102, f103].forEach(f => section3.appendChild(f));

  // Step titles and progress
  const progress = document.createElement('div');
  progress.className = 'kings-progress';
  const seg1 = document.createElement('div');
  seg1.className = 'seg active';
  const seg2 = document.createElement('div');
  seg2.className = 'seg';
  const seg3 = document.createElement('div');
  seg3.className = 'seg';
  progress.appendChild(seg1);
  progress.appendChild(seg2);
  progress.appendChild(seg3);
  overlay.appendChild(progress);

  const stepTitle = document.createElement('div');
  stepTitle.className = 'kings-step-title';
  overlay.appendChild(stepTitle);

  section1.className = 'kings-step';
  section2.className = 'kings-step';
  section3.className = 'kings-step';
  form.appendChild(section1);
  form.appendChild(section2);
  form.appendChild(section3);
  overlay.appendChild(form);

  const totalEl = el('div', 'kings-total-badge', 'Gesamt: 0 / 100');
  overlay.appendChild(totalEl);

  function recalc() {
    let total = 0;
    const sI = f1._get() + f2._get() + f3._get() + f4._get() + f5._get();
    const sII = f6._get() + f71._get() + f72._get() + f81._get() + f82._get() + f83._get() + f84._get();
    const sIII = f91._get() + f92._get() + f93._get() + f101._get() + f102._get() + f103._get();
    total = sI + sII + sIII;
    totalEl.textContent = `Gesamt: ${total} / 100`;
  }

  // Navigation
  let step = 1;
  function showStep(n) {
    step = Math.max(1, Math.min(3, n));
    section1.style.display = (step === 1) ? 'block' : 'none';
    section2.style.display = (step === 2) ? 'block' : 'none';
    section3.style.display = (step === 3) ? 'block' : 'none';
    backBtn.style.display = (step > 1) ? 'inline-block' : 'none';
    nextBtn.style.display = (step < 3) ? 'inline-block' : 'none';
    shipBtn.style.display = (step === 3) ? 'inline-block' : 'none';
    stepTitle.textContent = step === 1 ? 'I. Geschäftsmodell' :
                           step === 2 ? 'II. Management' : 'III. Bilanzqualität & Kapitalmanagement';
    seg1.classList.toggle('active', step >= 1);
    seg2.classList.toggle('active', step >= 2);
    seg3.classList.toggle('active', step >= 3);
    requestAnimationFrame(() => {
      try {
        overlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
    });
  }

  const btnRow = el('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '12px';
  btnRow.style.justifyContent = 'center';
  const backBtn = el('button', 'cancel-btn', 'Back');
  const nextBtn = el('button', 'post-btn', 'Next');
  const shipBtn = el('button', 'post-btn', existingPost ? 'Save' : 'Shipp');
  const cancelBtn = el('button', 'cancel-btn', 'Cancel');
  btnRow.appendChild(backBtn);
  btnRow.appendChild(nextBtn);
  btnRow.appendChild(shipBtn);
  btnRow.appendChild(cancelBtn);
  const footer = document.createElement('div');
  footer.className = 'kings-footer';
  footer.appendChild(btnRow);
  overlay.appendChild(footer);
  card.appendChild(overlay);

  requestAnimationFrame(() => {
    try {
      overlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {}
  });

  recalc();
  showStep(1);
  cancelBtn.onclick = () => showBlogView(sym);
  backBtn.onclick = () => showStep(step - 1);
  nextBtn.onclick = () => showStep(step + 1);
  shipBtn.onclick = () => {
    recalc();
    const summary = {
      I: { f1: f1._get(), f2: f2._get(), f3: f3._get(), f4: f4._get(), f5: f5._get() },
      II: { f6: f6._get(), f71: f71._get(), f72: f72._get(), f81: f81._get(), f82: f82._get(),
           f83: f83._get(), f84: f84._get() },
      III: { f91: f91._get(), f92: f92._get(), f93: f93._get(), f101: f101._get(),
            f102: f102._get(), f103: f103._get() }
    };
    const sI = Math.min(40, (summary.I.f1 + summary.I.f2 + summary.I.f3 + summary.I.f4 + summary.I.f5));
    const sII = Math.min(30, (summary.II.f6 + summary.II.f71 + summary.II.f72 + summary.II.f81 +
                              summary.II.f82 + summary.II.f83 + summary.II.f84));
    const sIII_BQ = Math.min(15, (summary.III.f91 + summary.III.f92 + summary.III.f93));
    const sIII_KM = Math.min(15, (summary.III.f101 + summary.III.f102 + summary.III.f103));
    const axes = {
      needs: Math.min(8, summary.I.f1),
      understand: Math.min(8, summary.I.f2),
      margin: Math.min(8, summary.I.f3),
      moat: Math.min(8, summary.I.f4),
      management: sII,
      financeGrowth: Math.min(38, sIII_BQ + sIII_KM + Math.min(8, summary.I.f5))
    };
    const total = Math.min(100, sI + sII + sIII_BQ + sIII_KM);
    if (existingPost) {
      existingPost.axes = axes;
      existingPost.total = total;
      existingPost.selection = summary;
      savePostsToStorage();
      showBlogView(sym);
    } else {
      if (!shippedPosts[sym]) shippedPosts[sym] = [];
      const ts = Date.now();
      shippedPosts[sym].push({
        id: nextPostId(),
        type: 'kings',
        sym,
        axes,
        total,
        ts,
        selection: summary
      });
      pushPostToFirestore(sym, { type: 'kings', axes, total, ts, selection: summary });
      savePostsToStorage();
      showBlogView(sym);
    }
  };
}

// Portfolio builder
async function showPortfolioBuilder(card) {
  const existing = card.querySelector('.text-editor');
  if (existing) existing.remove();

  const overlay = el('div', 'text-editor portfolio-editor');
  overlay.style.maxWidth = '720px';
  overlay.style.width = '100%';

  // Detect existing portfolio post to edit
  let existingPortfolioPost = null;
  {
    const list = shippedPosts['DASHBOARD'] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] && list[i].type === 'portfolio') {
        existingPortfolioPost = list[i];
        break;
      }
    }
  }

  // Header
  const header = el('div', 'portfolio-header');
  const titleWrap = el('div');
  const title = el('div', 'portfolio-title', existingPortfolioPost ? 'Edit Portfolio' : 'Build Portfolio');
  const subtitle = el('div', 'portfolio-sub', 'Add symbols with quantity. We snapshot today\'s price.');
  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);
  const clearBtn = el('button', 'btn-ghost-sm', 'Clear all');
  header.appendChild(titleWrap);
  header.appendChild(clearBtn);
  overlay.appendChild(header);

  // Table/list
  const list = el('div', 'portfolio-list');
  overlay.appendChild(list);

  // Form row
  const form = el('div', 'portfolio-form');
  const symInp = document.createElement('input');
  symInp.placeholder = 'Symbol';
  symInp.className = 'text-input';
  symInp.style.textTransform = 'uppercase';
  const qtyInp = document.createElement('input');
  qtyInp.type = 'number';
  qtyInp.min = '0';
  qtyInp.step = 'any';
  qtyInp.placeholder = 'Quantity';
  qtyInp.className = 'text-input';
  const dateInp = document.createElement('input');
  dateInp.type = 'datetime-local';
  dateInp.placeholder = 'Buy date/time (optional)';
  dateInp.className = 'text-input';
  const addBtn = el('button', 'post-btn', 'Add');
  form.appendChild(symInp);
  form.appendChild(qtyInp);
  form.appendChild(dateInp);
  form.appendChild(addBtn);
  overlay.appendChild(form);

  // Footer row
  const footer = el('div', 'portfolio-footer');
  const hint = el('button', 'link-muted', 'Use TAB/ENTER to move quickly');
  const btnRow = el('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '10px';
  const saveBtn = el('button', 'post-btn', existingPortfolioPost ? 'Update Portfolio' : 'Save Portfolio');
  const cancelBtn = el('button', 'cancel-btn', 'Cancel');
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  footer.appendChild(hint);
  footer.appendChild(btnRow);
  overlay.appendChild(footer);

  // State
  const items = [];
  if (existingPortfolioPost && Array.isArray(existingPortfolioPost.items)) {
    existingPortfolioPost.items.forEach(it => {
      items.push({ sym: it.sym, qty: (it.qty != null ? it.qty : null) });
    });
  }

  function renderList() {
    list.innerHTML = '';
    if (!items.length) {
      const empty = el('div', 'portfolio-sub', 'No positions yet.');
      empty.style.gridColumn = '1 / -1';
      list.appendChild(empty);
      return;
    }
    items.forEach((it, idx) => {
      const cellLeft = el('div');
      const chip = el('div', 'portfolio-chip');
      const sym = el('span', null, it.sym);
      chip.appendChild(sym);
      if (it.qty != null && it.qty !== '') {
        const q = el('span', 'qty', `× ${it.qty}`);
        chip.appendChild(q);
      }
      if (it.buyTs) {
        const dt = new Date(it.buyTs);
        const dtSpan = el('span', 'qty', dt.toLocaleString());
        dtSpan.style.marginLeft = '6px';
        chip.appendChild(dtSpan);
      }
      cellLeft.appendChild(chip);
      const cellRight = el('div');
      cellRight.style.textAlign = 'right';
      const rm = el('button', 'btn-ghost-sm', 'Remove');
      rm.onclick = () => {
        items.splice(idx, 1);
        renderList();
      };
      cellRight.appendChild(rm);
      list.appendChild(cellLeft);
      list.appendChild(cellRight);
    });
  }

  renderList();

  // Events
  clearBtn.onclick = () => {
    items.length = 0;
    renderList();
  };
  addBtn.onclick = () => {
    const sym = (symInp.value || '').trim().toUpperCase();
    const qty = qtyInp.value.trim();
    const dtVal = dateInp.value;
    if (!sym) return;
    let buyTs = null;
    if (dtVal) {
      // datetime-local is local time without timezone; construct Date in local
      const parsed = new Date(dtVal.replace(' ', 'T'));
      if (!isNaN(parsed.getTime())) buyTs = parsed.getTime();
    }
    items.push({ sym, qty: qty ? Number(qty) : null, buyTs });
    symInp.value = '';
    qtyInp.value = '';
    dateInp.value = '';
    renderList();
    symInp.focus();
  };
  symInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      qtyInp.focus();
    }
  });
  qtyInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addBtn.click();
    }
  });
  cancelBtn.onclick = () => {
    overlay.remove();
  };
  saveBtn.onclick = async () => {
    if (!items.length) {
      overlay.remove();
      return;
    }
    try {
      const ts = Date.now();
      if (existingPortfolioPost) {
        const oldItems = Array.isArray(existingPortfolioPost.items) ? existingPortfolioPost.items : [];
        const oldBySym = {};
        oldItems.forEach(it => {
          if (it && it.sym) oldBySym[it.sym] = it;
        });
        const newSyms = new Set(items.map(it => it.sym));
        const newOnly = Array.from(newSyms).filter(s => !oldBySym[s]);
        const priceMap = {};
        await Promise.all(newOnly.map(async (s) => {
          try {
            const arr = await fetchJson(`${API_BASE}/quote/${s}?apikey=${API_KEY}`);
            const q = Array.isArray(arr) ? arr[0] : null;
            if (q) {
              if (q.price != null && !Number.isNaN(q.price)) priceMap[s] = q.price;
              else if (q.previousClose != null && !Number.isNaN(q.previousClose)) priceMap[s] = q.previousClose;
            }
          } catch {}
        }));
        const merged = items.map(it => {
          const prev = oldBySym[it.sym];
          if (prev) {
            return {
              sym: it.sym,
              qty: (it.qty != null ? it.qty : (prev.qty != null ? prev.qty : null)),
              buyPrice: prev.buyPrice ?? null,
              buyTs: it.buyTs != null ? it.buyTs : (prev.buyTs ?? null)
            };
          } else {
            return {
              sym: it.sym,
              qty: it.qty || null,
              buyPrice: priceMap[it.sym] != null ? priceMap[it.sym] : null,
              buyTs: it.buyTs != null ? it.buyTs : ts
            };
          }
        });
        existingPortfolioPost.items = merged;
        existingPortfolioPost.updatedTs = ts;
        try { await backfillMissingBuyPrices(existingPortfolioPost.items); } catch {}
        savePostsToStorage();
      } else {
        // New portfolio
        const symbols = Array.from(new Set(items.map(it => it.sym)));
        const priceMap = {};
        await Promise.all(symbols.map(async (s) => {
          try {
            const arr = await fetchJson(`${API_BASE}/quote/${s}?apikey=${API_KEY}`);
            const q = Array.isArray(arr) ? arr[0] : null;
            if (q) {
              if (q.price != null && !Number.isNaN(q.price)) priceMap[s] = q.price;
              else if (q.previousClose != null && !Number.isNaN(q.previousClose)) priceMap[s] = q.previousClose;
            }
          } catch {}
        }));
        const enriched = items.map(it => ({
          sym: it.sym,
          qty: it.qty || null,
          buyPrice: priceMap[it.sym] != null ? priceMap[it.sym] : null,
          buyTs: it.buyTs != null ? it.buyTs : ts
        }));
        if (!shippedPosts['DASHBOARD']) shippedPosts['DASHBOARD'] = [];
        shippedPosts['DASHBOARD'].push({
          id: nextPostId(),
          type: 'portfolio',
          items: enriched,
          ts,
          refreshIntervalMin: 10
        });
        try { await backfillMissingBuyPrices(enriched); } catch {}
        pushPostToFirestore('DASHBOARD', {
          type: 'portfolio',
          items: enriched,
          ts,
          refreshIntervalMin: 10
        });
        savePostsToStorage();
      }
      overlay.remove();
      showDashboard();
    } catch (e) {
      const err = el('div', 'error-text', 'Failed to save portfolio.');
      overlay.appendChild(err);
    }
  };
  card.appendChild(overlay);
  requestAnimationFrame(() => {
    try {
      overlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {}
  });
}

// Calendar builder for dashboard
function showDashboardCalendarBuilder(card, defaultMode) {
  const existing = card.querySelector('.text-editor');
  if (existing) existing.remove();

  const overlay = el('div', 'text-editor');
  overlay.style.maxWidth = '760px';
  overlay.style.width = '100%';
  const title = el('div', null, 'Post Calendar');
  title.style.fontWeight = '800';
  title.style.fontSize = '1.05rem';
  overlay.appendChild(title);

  // Calendar container
  const cal = el('div');
  cal.style.border = '1px solid #e5e7eb';
  cal.style.borderRadius = '12px';
  cal.style.padding = '10px';
  cal.style.background = '#fff';
  overlay.appendChild(cal);

  // Footer with Post/Cancel
  const btnRow = el('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '12px';
  btnRow.style.justifyContent = 'center';
  btnRow.style.marginTop = '12px';
  const postBtn = el('button', 'post-btn', 'Post');
  const cancelBtn = el('button', 'cancel-btn', 'Cancel');
  btnRow.appendChild(postBtn);
  btnRow.appendChild(cancelBtn);
  overlay.appendChild(btnRow);
  card.appendChild(overlay);

  // State
  let viewDate = new Date();
  let selected = null;

  // Cache month events
  const monthCache = {};

  async function getMonthEvents(date) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (monthCache[key]) return monthCache[key];
    const symbols = Object.keys(shippedPosts).filter(s =>
      s !== 'DASHBOARD' && Array.isArray(shippedPosts[s]) && shippedPosts[s].length > 0
    );

    // If no stocks are being tracked, return empty immediately
    if (symbols.length === 0) {
      monthCache[key] = {};
      return {};
    }

    const symSet = new Set(symbols.map(s => s.toUpperCase()));
    const from = ymd(startOfMonth(date));
    const to = ymd(endOfMonth(date));
    let groups = {};
    try {
      const earnUrl = `${API_BASE}/earning_calendar?from=${from}&to=${to}&apikey=${API_KEY}`;
      const divUrl = `${API_BASE}/stock_dividend_calendar?from=${from}&to=${to}&apikey=${API_KEY}`;
      const [earnings, dividends] = await Promise.all([
        fetchJson(earnUrl).catch(() => []),
        fetchJson(divUrl).catch(() => [])
      ]);
      const add = (dateStr, ev) => {
        if (!dateStr) return;
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(ev);
      };
      (Array.isArray(earnings) ? earnings : []).forEach(it => {
        const symbol = (it.symbol || it.ticker || '').toUpperCase();
        if (!symbol || !symSet.has(symbol)) return;
        const dateStr = (it.date || it.epsDate || it.earningsDate || '').slice(0, 10);
        add(dateStr, {
          kind: 'earnings',
          symbol,
          extra: (it.time ? `(${it.time}) ` : '') +
                 (it.eps ? `EPS ${it.eps}` : (it.epsEstimated ? `Est ${it.epsEstimated}` : ''))
        });
      });
      (Array.isArray(dividends) ? dividends : []).forEach(it => {
        const symbol = (it.symbol || it.ticker || '').toUpperCase();
        if (!symbol || !symSet.has(symbol)) return;
        // Use the ex-dividend date (date field) as primary date for calendar display
        const dateStr = (it.date || it.recordDate || it.paymentDate || it.declarationDate || '').slice(0, 10);
        add(dateStr, {
          kind: 'dividend',
          symbol,
          extra: (it.dividend ? `Div ${it.dividend}` : '') +
                 (it.paymentDate && it.paymentDate !== it.date ? ` (pay: ${it.paymentDate.slice(5)})` : '')
        });
      });
    } catch {}
    monthCache[key] = groups;
    return groups;
  }

  async function renderCalendar() {
    cal.innerHTML = '';

    // Check if there are any stocks to track
    const symbols = Object.keys(shippedPosts).filter(s =>
      s !== 'DASHBOARD' && Array.isArray(shippedPosts[s]) && shippedPosts[s].length > 0
    );

    if (symbols.length === 0) {
      // Show message if no stocks are being tracked
      const msgDiv = el('div');
      msgDiv.style.textAlign = 'center';
      msgDiv.style.padding = '30px';
      msgDiv.style.color = '#6b7280';
      msgDiv.innerHTML = 'No stocks are being tracked yet.<br>Add some stocks first to see calendar events.';
      cal.appendChild(msgDiv);
      return;
    }

    // Show loading indicator
    const loadingDiv = el('div');
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.padding = '20px';
    loadingDiv.style.color = '#6b7280';
    loadingDiv.textContent = 'Loading calendar...';
    cal.appendChild(loadingDiv);

    const now = viewDate;
    let viewStart = startOfMonth(now);
    let viewEnd = endOfMonth(now);

    // Header with month and nav
    const header = el('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '8px';
    const prev = el('button', 'btn-ghost-sm', '‹');
    const next = el('button', 'btn-ghost-sm', '›');
    const label = el('div', null, now.toLocaleString('en-US', { month: 'long', year: 'numeric' }));
    label.style.fontWeight = '700';
    header.appendChild(prev);
    header.appendChild(label);
    header.appendChild(next);
    cal.appendChild(header);

    // Weekday header
    const grid = el('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
    grid.style.gap = '6px';
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    days.forEach(dn => {
      const h = el('div', null, dn);
      h.style.fontWeight = '700';
      h.style.color = '#6b7280';
      grid.appendChild(h);
    });

    const first = startOfWeek(startOfMonth(now));
    const last = endOfWeek(endOfMonth(now));
    const monthEvents = await getMonthEvents(now);

    // Clear loading indicator and rebuild calendar
    cal.innerHTML = '';
    cal.appendChild(header);

    let cur = new Date(first);

    while (cur <= last) {
      const cell = el('div');
      cell.style.minHeight = '64px';
      cell.style.border = '1px solid #e5e7eb';
      cell.style.borderRadius = '10px';
      cell.style.padding = '6px';
      cell.style.background = '#f9fafb';
      cell.style.cursor = 'pointer';
      const dnum = el('div', null, String(cur.getDate()));
      dnum.style.fontWeight = '800';
      dnum.style.fontSize = '0.9rem';
      cell.appendChild(dnum);
      const inMonth = (cur.getMonth() === now.getMonth());
      if (!inMonth) {
        cell.style.opacity = '0.5';
      }

      // Preview events for this date
      const key = ymd(cur);
      const items = Array.isArray(monthEvents[key]) ? monthEvents[key] : [];
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

      // Create a proper copy of the date to avoid reference issues
      const dateForThisCell = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate());
      cell.onclick = () => {
        const s = startOfWeek(dateForThisCell);
        const e = endOfWeek(dateForThisCell);
        selected = { from: ymd(s), to: ymd(e) };
        Array.from(grid.children).forEach((c, i) => {
          if (i >= 7) c.style.outline = 'none';
        });
        cell.style.outline = '2px solid #10b981';
        cell.style.outlineOffset = '-1px';
        postBtn.disabled = false;
      };
      grid.appendChild(cell);
      cur.setDate(cur.getDate() + 1);
    }
    cal.appendChild(grid);
    prev.onclick = () => {
      viewDate = new Date(now);
      viewDate.setMonth(now.getMonth() - 1);
      renderCalendar();
    };
    next.onclick = () => {
      viewDate = new Date(now);
      viewDate.setMonth(now.getMonth() + 1);
      renderCalendar();
    };
  }

  renderCalendar();
  postBtn.disabled = true;

  cancelBtn.onclick = () => {
    overlay.remove();
  };
  postBtn.onclick = async () => {
    if (!selected) return;
    await createDashboardCalendarPostWithRange('weekly', selected.from, selected.to);
    overlay.remove();
    showDashboard();
  };
}

async function createDashboardCalendarPostWithRange(mode, from, to) {
  try {
    const symbols = Object.keys(shippedPosts).filter(s =>
      s !== 'DASHBOARD' && Array.isArray(shippedPosts[s]) && shippedPosts[s].length > 0
    );
    if (!symbols.length) return;
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
    if (!shippedPosts['DASHBOARD']) shippedPosts['DASHBOARD'] = [];
    const ts = Date.now();
    shippedPosts['DASHBOARD'].push({
      id: nextPostId(),
      type: 'calendar',
      mode,
      range: { from, to },
      groups,
      ts
    });
    savePostsToStorage();
  } catch {}
}

// Helper: delete a post and its direct comment children
function deletePostAndComments(sym, target) {
  try {
    const list = shippedPosts[sym] || [];
    // invoke cleanup if present
    try { if (target && typeof target._cleanup === 'function') target._cleanup(); } catch {}
    const isComment = target && target.type === 'comment';
    const parentId = target && target.id != null ? String(target.id) : null;
    const filtered = list.filter(item => {
      if (item === target) return false;
      if (!isComment && item && item.type === 'comment' && parentId && String(item.parentId) === parentId) return false;
      return true;
    });
    shippedPosts[sym] = filtered;
    savePostsToStorage();
  } catch {}
}

// Post context menu handlers
function handleTextPostOptions(e, postDiv, p, sym) {
  document.querySelectorAll('.post-options').forEach(n => n.remove());
  const menu = document.createElement('div');
  menu.className = 'post-options';
  const px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
  const py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
  menu.style.left = px + 'px';
  menu.style.top = py + 'px';

  const editBtn = document.createElement('button');
  editBtn.className = 'opt-btn';
  const isEditing = !!postDiv.querySelector('[contenteditable="true"], textarea');
  editBtn.textContent = isEditing ? 'Save' : 'Edit';

  const delBtn = document.createElement('button');
  delBtn.className = 'opt-btn';
  delBtn.textContent = 'Delete';

  const cmtBtn = document.createElement('button');
  cmtBtn.className = 'opt-btn';
  cmtBtn.textContent = 'Comment';

  const markBtn = document.createElement('button');
  markBtn.className = 'opt-btn';
  markBtn.textContent = 'Mark';

  menu.appendChild(editBtn);
  menu.appendChild(cmtBtn);
  menu.appendChild(markBtn);
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
    const textEl = postDiv.querySelector('.text-content');
    const existingArea = postDiv.querySelector('[contenteditable="true"], textarea');
    if (existingArea) {
      const newText = (existingArea.value !== undefined ? existingArea.value : existingArea.textContent).trim();
      if (newText) {
        p.content = newText;
        savePostsToStorage();
      }
      showBlogView(sym);
      return;
    }
    textEl.setAttribute('contenteditable', 'true');
    textEl.focus();
  };

  cmtBtn.onclick = () => {
    menu.remove();
    const editor = el('div', 'text-editor');
    const ta = document.createElement('textarea');
    ta.className = 'text-input';
    const row = el('div');
    row.style.display = 'flex';
    row.style.gap = '12px';
    row.style.justifyContent = 'center';
    const postBtn = el('button', 'post-btn', 'Post');
    const cancelBtn = el('button', 'cancel-btn', 'Cancel');
    row.appendChild(postBtn);
    row.appendChild(cancelBtn);
    editor.appendChild(ta);
    editor.appendChild(row);
    const card = document.querySelector('.card');
    card.appendChild(editor);
    requestAnimationFrame(() => {
      try {
        editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
    });
    cancelBtn.onclick = () => {
      editor.remove();
    };
    postBtn.onclick = () => {
      const text = ta.value.trim();
      if (text) {
        if (!shippedPosts[sym]) shippedPosts[sym] = [];
        const ts = Date.now();
        shippedPosts[sym].push({
          id: nextPostId(),
          type: 'comment',
          parentId: p.id,
          content: text,
          ts
        });
        pushPostToFirestore(sym, { type: 'comment', parentId: p.id, content: text, ts });
        savePostsToStorage();
      }
      editor.remove();
      showBlogView(sym);
    };
  };

  markBtn.onclick = () => {
    menu.innerHTML = '';
    const mk = (t) => {
      const b = document.createElement('button');
      b.className = 'opt-btn';
      b.textContent = t;
      return b;
    };
    const good = mk('Good');
    const neutral = mk('Neutral');
    const bad = mk('Bad');
    const back = mk('Back');
    [good, neutral, bad, back].forEach(b => menu.appendChild(b));
    const apply = (val) => {
      p.mark = val;
      savePostsToStorage();
      const existingDot = postDiv.querySelector('.mark-indicator');
      if (!existingDot) {
        const dot = document.createElement('div');
        dot.className = 'mark-indicator';
        dot.style.background = (val === 'good') ? '#10b981' :
                              (val === 'bad') ? '#ef4444' : '#9ca3af';
        postDiv.appendChild(dot);
      } else {
        existingDot.style.background = (val === 'good') ? '#10b981' :
                                       (val === 'bad') ? '#ef4444' : '#9ca3af';
      }
      menu.remove();
    };
    good.onclick = () => apply('good');
    neutral.onclick = () => apply('neutral');
    bad.onclick = () => apply('bad');
    back.onclick = () => {
      menu.remove();
    };
  };

  delBtn.onclick = () => {
    menu.remove();
    deletePostAndComments(sym, p);
    showBlogView(sym);
  };
}

function handleChartPostOptions(e, postDiv, p, sym) {
  document.querySelectorAll('.post-options').forEach(n => n.remove());
  const px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
  const py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
  const menu = document.createElement('div');
  menu.className = 'post-options';
  menu.style.left = px + 'px';
  menu.style.top = py + 'px';

  const editBtn = document.createElement('button');
  editBtn.className = 'opt-btn';
  editBtn.textContent = 'Edit';
  const delBtn = document.createElement('button');
  delBtn.className = 'opt-btn';
  delBtn.textContent = 'Delete';
  const cmtBtn = document.createElement('button');
  cmtBtn.className = 'opt-btn';
  cmtBtn.textContent = 'Comment';
  const markBtn = document.createElement('button');
  markBtn.className = 'opt-btn';
  markBtn.textContent = 'Mark';

  menu.appendChild(editBtn);
  menu.appendChild(cmtBtn);
  menu.appendChild(markBtn);
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

  delBtn.onclick = () => {
    menu.remove();
    deletePostAndComments(sym, p);
    showBlogView(sym);
  };

  cmtBtn.onclick = () => {
    menu.remove();
    const editor = el('div', 'text-editor');
    const ta = document.createElement('textarea');
    ta.className = 'text-input';
    const row = el('div');
    row.style.display = 'flex';
    row.style.gap = '12px';
    row.style.justifyContent = 'center';
    const postBtn = el('button', 'post-btn', 'Post');
    const cancelBtn = el('button', 'cancel-btn', 'Cancel');
    row.appendChild(postBtn);
    row.appendChild(cancelBtn);
    editor.appendChild(ta);
    editor.appendChild(row);
    const card = document.querySelector('.card');
    card.appendChild(editor);
    requestAnimationFrame(() => {
      try {
        editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
    });
    cancelBtn.onclick = () => {
      editor.remove();
    };
    postBtn.onclick = () => {
      const text = ta.value.trim();
      if (text) {
        if (!shippedPosts[sym]) shippedPosts[sym] = [];
        const ts = Date.now();
        shippedPosts[sym].push({
          id: nextPostId(),
          type: 'comment',
          parentId: p.id,
          content: text,
          ts
        });
        pushPostToFirestore(sym, { type: 'comment', parentId: p.id, content: text, ts });
        savePostsToStorage();
      }
      editor.remove();
      showBlogView(sym);
    };
  };

  markBtn.onclick = () => {
    menu.innerHTML = '';
    const mk = (t) => {
      const b = document.createElement('button');
      b.className = 'opt-btn';
      b.textContent = t;
      return b;
    };
    const good = mk('Good');
    const neutral = mk('Neutral');
    const bad = mk('Bad');
    const back = mk('Back');
    [good, neutral, bad, back].forEach(b => menu.appendChild(b));
    const apply = (val) => {
      p.mark = val;
      savePostsToStorage();
      const existingDot = postDiv.querySelector('.mark-indicator');
      if (!existingDot) {
        const dot = document.createElement('div');
        dot.className = 'mark-indicator';
        dot.style.background = (val === 'good') ? '#10b981' :
                              (val === 'bad') ? '#ef4444' : '#9ca3af';
        postDiv.appendChild(dot);
      } else {
        existingDot.style.background = (val === 'good') ? '#10b981' :
                                       (val === 'bad') ? '#ef4444' : '#9ca3af';
      }
      menu.remove();
    };
    good.onclick = () => apply('good');
    neutral.onclick = () => apply('neutral');
    bad.onclick = () => apply('bad');
    back.onclick = () => {
      showBlogView(sym);
    };
  };

  editBtn.onclick = () => {
    menu.innerHTML = '';
    const mkBtn = (label) => {
      const b = document.createElement('button');
      b.className = 'opt-btn';
      b.textContent = label;
      return b;
    };
    const techBtn = mkBtn('Technicals');
    const backBtn = mkBtn('Back');
    menu.appendChild(techBtn);
    menu.appendChild(backBtn);

    techBtn.onclick = () => {
      menu.innerHTML = '';
      const active = new Set(p.activeIndicators || []);
      const all = ['MA', 'RSI', 'MACD', 'BB', 'Stoch', 'ATR', 'OBV', 'Trendline'];
      const renderList = () => {
        menu.innerHTML = '';
        all.forEach(name => {
          const b = mkBtn(name + (active.has(name) ? ' ✓' : ''));
          b.onclick = (ev) => {
            ev.stopPropagation();
            if (active.has(name)) active.delete(name);
            else active.add(name);
            p.activeIndicators = Array.from(active);
            savePostsToStorage();
            const miniCanvas = postDiv.querySelector('canvas');
            if (miniCanvas) {
              try {
                renderMiniChart(miniCanvas, p.rawData, p.activeIndicators);
              } catch {}
            }
            renderList();
          };
          menu.appendChild(b);
        });
        const back = mkBtn('Back');
        back.onclick = (ev) => {
          ev.stopPropagation();
          editBtn.onclick();
        };
        menu.appendChild(back);
      };
      renderList();
    };

    backBtn.onclick = () => {
      showBlogView(sym);
    };
  };
}

function handleNewsPostOptions(e, postDiv, p, sym) {
  document.querySelectorAll('.post-options').forEach(n => n.remove());
  const menu = document.createElement('div');
  menu.className = 'post-options';
  const px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
  const py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
  menu.style.left = px + 'px';
  menu.style.top = py + 'px';

  const cmtBtn = document.createElement('button');
  cmtBtn.className = 'opt-btn';
  cmtBtn.textContent = 'Comment';
  const aiSumBtn = document.createElement('button');
  aiSumBtn.className = 'opt-btn';
  aiSumBtn.textContent = 'AI Summary';
  const markBtn = document.createElement('button');
  markBtn.className = 'opt-btn';
  markBtn.textContent = 'Mark';
  const delBtn = document.createElement('button');
  delBtn.className = 'opt-btn';
  delBtn.textContent = 'Delete';

  menu.appendChild(cmtBtn);
  menu.appendChild(aiSumBtn);
  menu.appendChild(markBtn);
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

  cmtBtn.onclick = () => {
    menu.remove();
    const editor = el('div', 'text-editor');
    const ta = document.createElement('textarea');
    ta.className = 'text-input';
    const row = el('div');
    row.style.display = 'flex';
    row.style.gap = '12px';
    row.style.justifyContent = 'center';
    const postBtn = el('button', 'post-btn', 'Post');
    const cancelBtn = el('button', 'cancel-btn', 'Cancel');
    row.appendChild(postBtn);
    row.appendChild(cancelBtn);
    editor.appendChild(ta);
    editor.appendChild(row);
    const card = document.querySelector('.card');
    card.appendChild(editor);
    cancelBtn.onclick = () => {
      editor.remove();
    };
    postBtn.onclick = () => {
      const text = ta.value.trim();
      if (text) {
        if (!shippedPosts[sym]) shippedPosts[sym] = [];
        const ts = Date.now();
        shippedPosts[sym].push({
          id: nextPostId(),
          type: 'comment',
          parentId: p.id,
          content: text,
          ts
        });
        pushPostToFirestore(sym, { type: 'comment', parentId: p.id, content: text, ts });
        savePostsToStorage();
      }
      editor.remove();
      showBlogView(sym);
    };
  };

  aiSumBtn.onclick = () => {
    menu.remove();
    try {
      if (!shippedPosts[sym]) shippedPosts[sym] = [];
      const ts = Date.now();
      const commentPost = {
        id: nextPostId(),
        type: 'comment',
        parentId: p.id,
        content: 'Generating AI summary...',
        ts,
        status: 'streaming'
      };
      shippedPosts[sym].push(commentPost);
      pushPostToFirestore(sym, { type: 'comment', parentId: p.id, content: commentPost.content, ts });
      savePostsToStorage();
      showBlogView(sym);
      // Kick off streaming for this news URL
      const url = p && p.url ? p.url : '';
      let acc = '';
      const update = (delta) => {
        acc += delta;
        const text = normalizeToParagraph(stripMarkdownLinks(acc));
        commentPost.content = text;
        savePostsToStorage();
        try {
          const el = document.querySelector(`[data-post-id="${commentPost.id}"] .text-content`);
          if (el) el.textContent = text;
        } catch {}
      };
      const done = () => {
        commentPost.content = normalizeToParagraph(stripMarkdownLinks(acc || commentPost.content || ''));
        commentPost.status = 'done';
        savePostsToStorage();
      };
      const fail = (err) => {
        const msg = (err && err.status) ? `AI summary failed (${err.status}).` : 'AI summary failed.';
        commentPost.content = msg;
        commentPost.status = 'failed';
        savePostsToStorage();
        try {
          const el = document.querySelector(`[data-post-id="${commentPost.id}"] .text-content`);
          if (el) el.textContent = msg;
        } catch {}
      };
      if (url) {
        try { openAIStreamSummarizeNews(sym, [url], update, done, fail); } catch { fail(); }
      } else {
        fail();
      }
    } catch {}
  };

  markBtn.onclick = () => {
    menu.innerHTML = '';
    const mk = (t) => {
      const b = document.createElement('button');
      b.className = 'opt-btn';
      b.textContent = t;
      return b;
    };
    const good = mk('Good');
    const neutral = mk('Neutral');
    const bad = mk('Bad');
    const back = mk('Back');
    [good, neutral, bad, back].forEach(b => menu.appendChild(b));
    const apply = (val) => {
      p.mark = val;
      savePostsToStorage();
      const existingDot = postDiv.querySelector('.mark-indicator');
      if (!existingDot) {
        const dot = document.createElement('div');
        dot.className = 'mark-indicator';
        dot.style.background = (val === 'good') ? '#10b981' :
                              (val === 'bad') ? '#ef4444' : '#9ca3af';
        postDiv.appendChild(dot);
      } else {
        existingDot.style.background = (val === 'good') ? '#10b981' :
                                       (val === 'bad') ? '#ef4444' : '#9ca3af';
      }
      showBlogView(sym);
    };
    good.onclick = () => apply('good');
    neutral.onclick = () => apply('neutral');
    bad.onclick = () => apply('bad');
    back.onclick = () => {
      showBlogView(sym);
    };
  };

  delBtn.onclick = () => {
    menu.remove();
    deletePostAndComments(sym, p);
    showBlogView(sym);
  };
}

function handleCommentPostOptions(e, postDiv, p, sym) {
  document.querySelectorAll('.post-options').forEach(n => n.remove());
  const menu = document.createElement('div');
  menu.className = 'post-options';
  const px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
  const py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
  menu.style.left = px + 'px';
  menu.style.top = py + 'px';

  const editBtn = document.createElement('button');
  editBtn.className = 'opt-btn';
  const isEditing = !!postDiv.querySelector('[contenteditable="true"], textarea');
  editBtn.textContent = isEditing ? 'Save' : 'Edit';
  const delBtn = document.createElement('button');
  delBtn.className = 'opt-btn';
  delBtn.textContent = 'Delete';

  menu.appendChild(editBtn);
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
    const textEl = postDiv.querySelector('.text-content');
    const existingArea = postDiv.querySelector('[contenteditable="true"], textarea');
    if (existingArea) {
      const newText = (existingArea.value !== undefined ? existingArea.value : existingArea.textContent).trim();
      if (newText) {
        p.content = newText;
        savePostsToStorage();
      }
      showBlogView(sym);
      return;
    }
    textEl.setAttribute('contenteditable', 'true');
    textEl.focus();
  };

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
}

function handleKingsPostOptions(e, postDiv, p, sym) {
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
  const cmtBtn = document.createElement('button');
  cmtBtn.className = 'opt-btn';
  cmtBtn.textContent = 'Comment';
  const markBtn = document.createElement('button');
  markBtn.className = 'opt-btn';
  markBtn.textContent = 'Mark';
  const delBtn = document.createElement('button');
  delBtn.className = 'opt-btn';
  delBtn.textContent = 'Delete';

  menu.appendChild(editBtn);
  menu.appendChild(cmtBtn);
  menu.appendChild(markBtn);
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
    try {
      showKingsForm(document.querySelector('.card'), sym, p);
    } catch (err) {
      console.error(err);
    }
  };

  cmtBtn.onclick = () => {
    menu.remove();
    const editor = el('div', 'text-editor');
    const ta = document.createElement('textarea');
    ta.className = 'text-input';
    const row = el('div');
    row.style.display = 'flex';
    row.style.gap = '12px';
    row.style.justifyContent = 'center';
    const postBtn = el('button', 'post-btn', 'Post');
    const cancelBtn = el('button', 'cancel-btn', 'Cancel');
    row.appendChild(postBtn);
    row.appendChild(cancelBtn);
    editor.appendChild(ta);
    editor.appendChild(row);
    const card = document.querySelector('.card');
    card.appendChild(editor);
    requestAnimationFrame(() => {
      try {
        editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
    });
    cancelBtn.onclick = () => {
      editor.remove();
    };
    postBtn.onclick = () => {
      const text = ta.value.trim();
      if (text) {
        if (!shippedPosts[sym]) shippedPosts[sym] = [];
        const ts = Date.now();
        shippedPosts[sym].push({
          id: nextPostId(),
          type: 'comment',
          parentId: p.id,
          content: text,
          ts
        });
        pushPostToFirestore(sym, { type: 'comment', parentId: p.id, content: text, ts });
        savePostsToStorage();
      }
      editor.remove();
      showBlogView(sym);
    };
  };

  markBtn.onclick = () => {
    menu.innerHTML = '';
    const mk = (t) => {
      const b = document.createElement('button');
      b.className = 'opt-btn';
      b.textContent = t;
      return b;
    };
    const good = mk('Good');
    const neutral = mk('Neutral');
    const bad = mk('Bad');
    const back = mk('Back');
    [good, neutral, bad, back].forEach(b => menu.appendChild(b));
    const apply = (val) => {
      p.mark = val;
      savePostsToStorage();
      const existingDot = postDiv.querySelector('.mark-indicator');
      if (!existingDot) {
        const dot = document.createElement('div');
        dot.className = 'mark-indicator';
        dot.style.background = (val === 'good') ? '#10b981' :
                              (val === 'bad') ? '#ef4444' : '#9ca3af';
        postDiv.appendChild(dot);
      } else {
        existingDot.style.background = (val === 'good') ? '#10b981' :
                                       (val === 'bad') ? '#ef4444' : '#9ca3af';
      }
      menu.remove();
    };
    good.onclick = () => apply('good');
    neutral.onclick = () => apply('neutral');
    bad.onclick = () => apply('bad');
    back.onclick = () => {
      menu.remove();
    };
  };

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
}
