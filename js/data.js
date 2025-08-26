/*
  data.js - Data management, API calls, storage, and Firebase integration
  This file handles all data persistence and external API interactions
*/

// Storage keys
const STORAGE_KEY = 'stock_blog_posts_v1';
const FIREBASE_DOC = 'posts_store_v1';

// Track the currently visible post index for each symbol
const currentPostIndices = {};

// Storage functions
function savePostsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shippedPosts));
  } catch (e) { /* ignore quota/security errors */ }

  // Firestore sync (best-effort)
  if (window.__firebaseReady && window.__firebase) {
    window.__firebaseReady.then(({ db }) => {
      const { setDoc, doc } = window.__firebase;
      const ref = doc(db, 'stock_posts', FIREBASE_DOC);
      setDoc(ref, shippedPosts).catch(() => {});
    }).catch(() => {});
  }
}

function loadPostsFromStorage() {
  let loadedLocal = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        for (const sym in data) shippedPosts[sym] = data[sym];
        loadedLocal = true;
      }
    }
  } catch (e) { /* ignore parse errors */ }

  // Try fetching from Firestore and merge (Firebase wins on conflicts)
  if (window.__firebaseReady && window.__firebase) {
    window.__firebaseReady.then(({ db }) => {
      const { getDoc, doc } = window.__firebase;
      const ref = doc(db, 'stock_posts', FIREBASE_DOC);
      getDoc(ref).then(snap => {
        if (snap.exists()) {
          const cloud = snap.data() || {};
          // Merge: ensure we don't drop existing local symbols
          for (const sym in shippedPosts) {
            if (!(sym in cloud)) cloud[sym] = shippedPosts[sym];
          }
          // Replace in-memory with merged cloud
          for (const k in shippedPosts) delete shippedPosts[k];
          for (const sym in cloud) shippedPosts[sym] = cloud[sym];
          // Persist back locally so next load is fast
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(shippedPosts));
          } catch {}
        } else if (!loadedLocal) {
          // Initialize empty doc to establish structure
          const { setDoc } = window.__firebase;
          setDoc(ref, shippedPosts).catch(() => {});
        }
      }).catch(() => {});
    }).catch(() => {});
  }
}

// Firestore: one-document-per-post push to avoid 1 MiB doc cap
async function pushPostToFirestore(sym, post) {
  try {
    if (!window.__firebaseReady || !window.__firebase) return;
    const { db, auth } = await window.__firebaseReady;
    if (!auth || !auth.currentUser) return;
    const { collection, addDoc, serverTimestamp } = window.__firebase;
    const colRef = collection(db, 'users', auth.currentUser.uid, 'posts');
    const { rawData, ...slim } = post || {};
    await addDoc(colRef, {
      sym,
      ...slim,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch { /* noop */ }
}

// Authentication
function ensureAuth() {
  try {
    if (!window.__firebaseReady || !window.__firebase) return;
    window.__firebaseReady.then(({ auth }) => {
      if (auth.currentUser) return;
      const overlay = el('div', 'text-editor');
      overlay.style.maxWidth = '520px';
      const title = el('div', null, 'Welcome back');
      title.style.fontWeight = '800';
      title.style.fontSize = '1.1rem';
      title.style.textAlign = 'center';
      const subtitle = el('div', null, 'Sign in to sync your posts');
      subtitle.style.color = '#6b7280';
      subtitle.style.textAlign = 'center';
      const email = document.createElement('input');
      email.type = 'email';
      email.placeholder = 'Email';
      email.className = 'text-input';
      email.style.background = '#f9fafb';
      email.style.border = '1px solid #e5e7eb';
      email.style.borderRadius = '12px';
      const pass = document.createElement('input');
      pass.type = 'password';
      pass.placeholder = 'Password';
      pass.className = 'text-input';
      pass.style.background = '#f9fafb';
      pass.style.border = '1px solid #e5e7eb';
      pass.style.borderRadius = '12px';
      const row = el('div');
      row.style.display = 'flex';
      row.style.gap = '12px';
      row.style.justifyContent = 'center';
      const signIn = el('button', 'post-btn', 'Sign in');
      const create = el('button', 'cancel-btn', 'Register');
      row.appendChild(signIn);
      row.appendChild(create);
      overlay.appendChild(title);
      overlay.appendChild(subtitle);
      overlay.appendChild(email);
      overlay.appendChild(pass);
      overlay.appendChild(row);
      // Attach to the central card on page if present, else body
      const card = document.querySelector('.card') || document.body;
      card.appendChild(overlay);
      requestAnimationFrame(() => {
        try {
          overlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {}
      });
      signIn.onclick = async () => {
        try {
          const { signInWithEmailAndPassword } = window.__firebase || {};
          const { auth } = window.__firebase || {};
          await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
          overlay.remove();
        } catch {
          alert('Sign in failed');
        }
      };
      create.onclick = async () => {
        try {
          const { createUserWithEmailAndPassword } = window.__firebase || {};
          const { auth } = window.__firebase || {};
          await createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
          overlay.remove();
        } catch {
          alert('Registration failed');
        }
      };
    }).catch(() => {});
  } catch {}
}

// Historical data fetching
function getHistoricalData(symbol, timeframe) {
  let url = '';
  const now = new Date();
  const y = now.getFullYear();
  // Determine endpoint depending on timeframe
  switch (timeframe) {
    case '1D':
      // 5 minute intraday data for the current day
      url = `${API_BASE}/historical-chart/5min/${symbol}?apikey=${API_KEY}`;
      break;
    case '1W':
      // 30 minute intraday data gives enough points for a week
      url = `${API_BASE}/historical-chart/30min/${symbol}?apikey=${API_KEY}`;
      break;
    case '1M':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=22&apikey=${API_KEY}`;
      break;
    case '3M':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=66&apikey=${API_KEY}`;
      break;
    case '6M':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=132&apikey=${API_KEY}`;
      break;
    case '1Y':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=252&apikey=${API_KEY}`;
      break;
    case 'YTD': {
      const from = `${y}-01-01`;
      const to = now.toISOString().slice(0, 10);
      url = `${API_BASE}/historical-price-full/${symbol}?from=${from}&to=${to}&apikey=${API_KEY}`;
      break;
    }
    case '5Y':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=1260&apikey=${API_KEY}`;
      break;
    default:
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=90&apikey=${API_KEY}`;
  }
  return fetchJson(url).then(data => {
    let records;
    if (Array.isArray(data)) {
      // Intraday endpoints return an array of objects
      records = data;
    } else {
      records = data.historical || [];
    }
    // FMP returns data sorted newest first; reverse for chronological order
    records = records.slice().reverse();
    // For intraday 5min data, limit to most recent trading day
    if (timeframe === '1D' && records.length > 0) {
      const lastEntry = records[records.length - 1];
      const lastDateOnly = (lastEntry.date || '').split(' ')[0];
      records = records.filter(item => (item.date || '').startsWith(lastDateOnly));
    }
    return records.map(item => item);
  });
}

// Top-level historical data fetcher for posts
function getHistoricalDataTop(symbol, timeframe) {
  let url = '';
  const now = new Date();
  const y = now.getFullYear();
  switch (timeframe) {
    case '1D':
      url = `${API_BASE}/historical-chart/5min/${symbol}?apikey=${API_KEY}`;
      break;
    case '1W':
      url = `${API_BASE}/historical-chart/30min/${symbol}?apikey=${API_KEY}`;
      break;
    case '1M':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=22&apikey=${API_KEY}`;
      break;
    case '3M':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=66&apikey=${API_KEY}`;
      break;
    case '6M':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=132&apikey=${API_KEY}`;
      break;
    case '1Y':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=252&apikey=${API_KEY}`;
      break;
    case 'YTD': {
      const from = `${y}-01-01`;
      const to = now.toISOString().slice(0, 10);
      url = `${API_BASE}/historical-price-full/${symbol}?from=${from}&to=${to}&apikey=${API_KEY}`;
      break;
    }
    case '5Y':
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=1260&apikey=${API_KEY}`;
      break;
    default:
      url = `${API_BASE}/historical-price-full/${symbol}?timeseries=90&apikey=${API_KEY}`;
  }
  return fetchJson(url).then(data => {
    let records;
    if (Array.isArray(data)) records = data;
    else records = data.historical || [];
    records = records.slice().reverse();
    if (timeframe === '1D' && records.length > 0) {
      const lastEntry = records[records.length - 1];
      const lastDateOnly = (lastEntry.date || '').split(' ')[0];
      records = records.filter(item => (item.date || '').startsWith(lastDateOnly));
    }
    return records.map(item => item);
  });
}

// Portfolio performance computation
async function computePortfolioPerformanceFromSnapshot(items) {
  // items: [{ sym, qty, buyPrice, buyTs }]
  const results = [];
  for (const it of items) {
    const { sym, qty, buyPrice } = it;
    let latestClose = null;
    try {
      const arr = await fetchJson(`${API_BASE}/quote/${sym}?apikey=${API_KEY}`, { noCache: true });
      const q = Array.isArray(arr) ? arr[0] : null;
      if (q) {
        // Prefer real-time price; fall back to previousClose if needed
        if (q.price != null && !Number.isNaN(q.price)) {
          latestClose = q.price;
        } else if (q.previousClose != null && !Number.isNaN(q.previousClose)) {
          latestClose = q.previousClose;
        }
      }
    } catch {}
    if (buyPrice == null || latestClose == null) {
      results.push({ sym, qty, pct: null, abs: null });
    } else {
      const pct = ((latestClose - buyPrice) / buyPrice) * 100;
      const abs = qty != null ? (latestClose - buyPrice) * qty : (latestClose - buyPrice);
      results.push({ sym, qty, pct, abs, buyClose: buyPrice, latestClose });
    }
  }
  // Aggregate portfolio
  let portfolioPct = null, portfolioAbs = null;
  const valid = results.filter(r => r.pct != null);
  if (valid.length) {
    const anyQty = valid.some(r => r.qty != null);
    if (anyQty) {
      let totalBuy = 0, totalValueChange = 0;
      valid.forEach(r => {
        const q = r.qty || 1;
        totalBuy += r.buyClose * q;
        totalValueChange += (r.latestClose - r.buyClose) * q;
      });
      portfolioAbs = totalValueChange;
      portfolioPct = totalBuy ? (totalValueChange / totalBuy) * 100 : null;
    } else {
      portfolioPct = valid.reduce((a, b) => a + b.pct, 0) / valid.length;
      portfolioAbs = valid.reduce((a, b) => a + (b.latestClose - b.buyClose), 0);
    }
  }
  return {
    perStock: results,
    portfolio: { pct: portfolioPct, abs: portfolioAbs }
  };
}

// Try to resolve an entry price for a given symbol and timestamp (local date)
async function resolveEntryPrice(sym, ts) {
  try {
    const dateStr = ymd(new Date(ts || Date.now()));
    // Prefer historical daily close for the buy date
    const histUrl = `${API_BASE}/historical-price-full/${sym}?from=${dateStr}&to=${dateStr}&apikey=${API_KEY}`;
    const data = await fetchJson(histUrl, { noCache: true }).catch(() => null);
    const recs = data && (Array.isArray(data) ? data : data.historical);
    if (Array.isArray(recs) && recs.length) {
      const close = recs[0] && recs[0].close;
      if (close != null && !Number.isNaN(close)) return close;
    }
  } catch {}
  // Fallback to current quote/previousClose
  try {
    const arr = await fetchJson(`${API_BASE}/quote/${sym}?apikey=${API_KEY}`, { noCache: true });
    const q = Array.isArray(arr) ? arr[0] : null;
    if (q) {
      if (q.price != null && !Number.isNaN(q.price)) return q.price;
      if (q.previousClose != null && !Number.isNaN(q.previousClose)) return q.previousClose;
    }
  } catch {}
  return null;
}

// Backfill missing buyPrice values for a list of items (in-place)
async function backfillMissingBuyPrices(items) {
  if (!Array.isArray(items)) return;
  for (const it of items) {
    try {
      if (!it || it.buyPrice != null) continue;
      const price = await resolveEntryPrice(it.sym, it.buyTs || Date.now());
      if (price != null) {
        it.buyPrice = price;
        if (it.buyTs == null) it.buyTs = Date.now();
      }
    } catch {}
  }
}
