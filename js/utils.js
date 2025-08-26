/*
  utils.js - Utility functions, formatters, and helper methods
  This file contains common utilities used throughout the application
*/

// API Configuration
const API_KEY = 'IRIx6Ug8hoeW5uqo8fiuCtev3rO9ToEE';
const API_BASE = 'https://financialmodelingprep.com/api/v3';

// OpenAI configuration (user-provided key)
// WARNING: This key is embedded client-side per user request.
const OPENAI_API_KEY = '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';

// Build concise prompt for AI news summarization
function buildAINewsPrompt(sym, urls) {
  const urlLines = (urls || []).slice(0, 2).map((u, i) => `  ${i + 1}. ${u}`).join('\n');
  return (
    `You are a concise financial news assistant. In plain language, write one short paragraph (60–90 words)` +
    ` about ${sym}. State the key facts from the article(s) and naturally weave in what it implies and` +
    ` what to expect next, without headings or labels. Keep a neutral tone and avoid unsupported speculation.` +
    ` Do not use bullet points or lists. No chain-of-thought.` +
    `\nArticles:\n${urlLines}\n` +
    `Output: One cohesive paragraph, no headings, no labels, no lists.`
  );
}

// Extract URLs from markdown or raw text
function extractUrlsFromText(text) {
  try {
    if (!text) return [];
    const urls = [];
    // Markdown links [label](url)
    const md = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g; let m;
    while ((m = md.exec(text)) !== null) {
      urls.push(m[1]);
    }
    // Raw urls
    const raw = /(https?:\/\/[^\s)]+)(?![^\(]*\))/g; let r;
    while ((r = raw.exec(text)) !== null) {
      urls.push(r[1]);
    }
    return Array.from(new Set(urls));
  } catch { return []; }
}

// Remove markdown link artifacts from readable text
function stripMarkdownLinks(text) {
  try {
    if (!text) return text;
    // Remove " ([label](url))" blocks first
    let out = text.replace(/\s*\(\[[^\]]+\]\((https?:\/\/[^\s)]+)\)\)/g, '');
    // Then remove standalone [label](url)
    out = out.replace(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g, '');
    return out;
  } catch { return text; }
}

// Normalize text to a paragraph (remove bullet markers, collapse lines)
function normalizeToParagraph(text) {
  try {
    if (!text) return text;
    const noBullets = text
      .split('\n')
      .map(line => line.replace(/^\s*[-*•]\s+/, '').trim())
      .join(' ');
    return noBullets.replace(/\s{2,}/g, ' ').trim();
  } catch { return text; }
}

function urlToHostname(u) {
  try { return new URL(u).hostname; } catch { return null; }
}

function faviconUrlForHost(host) {
  if (!host) return '';
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

// Stream Responses API (SSE) and surface output_text deltas
async function streamOpenAIResponse(reqBody, onDelta, onDone, onError) {
  try {
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({ ...reqBody, stream: true })
    });
    if (!resp.ok || !resp.body) {
      // Fallback: non-streaming request to at least get a full summary
      const fallback = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...reqBody, stream: false })
      });
      if (!fallback.ok) {
        let msg = `OpenAI request failed (${fallback.status})`;
        try {
          const raw = await fallback.text();
          const err = JSON.parse(raw);
          if (err && err.error && err.error.message) msg = err.error.message;
        } catch {}
        if (typeof onError === 'function') onError({ status: fallback.status, message: msg });
        return;
      }
      const json = await fallback.json().catch(() => null);
      const text = json && (json.output_text || json.output || '');
      if (text && typeof onDelta === 'function') onDelta(String(text));
      if (typeof onDone === 'function') onDone();
      return;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        // Parse SSE event lines
        // Look for lines starting with 'data: '
        const lines = chunk.split('\n');
        let dataLine = null;
        let eventType = null;
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          }
          if (line.startsWith('data:')) {
            dataLine = line.slice(5).trim();
          }
        }
        if (!dataLine || dataLine === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataLine);
          // The Responses API streams output_text via type response.output_text.delta
          const type = parsed.type || eventType;
          if (type === 'response.output_text.delta' && parsed.delta) {
            if (typeof onDelta === 'function') onDelta(String(parsed.delta));
          } else if (type === 'response.completed') {
            if (typeof onDone === 'function') onDone();
          } else if (type === 'response.error') {
            if (typeof onError === 'function') onError(parsed.error || new Error('OpenAI error'));
          }
        } catch (e) {
          // ignore malformed chunks
        }
      }
    }
    if (typeof onDone === 'function') onDone();
  } catch (err) {
    if (typeof onError === 'function') onError(err);
  }
}

// High-level helper to stream AI news summary
async function openAIStreamSummarizeNews(sym, urls, onDelta, onDone, onError) {
  const prompt = buildAINewsPrompt(sym, urls);
  const body = {
    model: 'gpt-5',
    reasoning: { effort: 'high' },
    input: prompt,
    // Enable web search preview tool
    tools: [ { type: 'web_search_preview' } ],
    tool_choice: 'auto',
    // Explicitly request streaming (redundant with wrapper but kept for clarity)
    stream: true
  };
  return streamOpenAIResponse(body, onDelta, onDone, onError);
}

/*
  Helper to create an element with optional class name and text content
*/
function el(tag, cls, txt) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (txt) d.textContent = txt;
  return d;
}

/*
  Utility to fetch JSON from a URL. Throws on network error
*/
function fetchJson(u, options) {
  try {
    const opts = (options && typeof options === 'object') ? options : {};
    const noCache = !!opts.noCache;
    let url = String(u || '');
    if (noCache) {
      url += (url.includes('?') ? '&' : '?') + `_=${Date.now()}`;
    }
    const fetchOpts = {};
    if (noCache) fetchOpts.cache = 'no-store';
    return fetch(url, fetchOpts).then(r => {
      if (!r.ok) throw new Error('Network response was not ok');
      return r.json();
    });
  } catch (e) {
    return Promise.reject(e);
  }
}

/*
  Format large numbers into a short string (K, M, B, T) with at most one
  decimal place. Negative values are preserved.
*/
function shortFmt(n) {
  if (!n || isNaN(n)) return '—';
  n = Number(n);
  const negative = n < 0;
  n = Math.abs(n);
  let result;
  if (n < 1e3)        result = n.toLocaleString();
  else if (n < 1e6)   result = (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  else if (n < 1e9)   result = (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  else if (n < 1e12)  result = (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  else                result = (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
  return (negative ? '-' : '') + result;
}

// Format a timestamp (ms or ISO) into a readable date/time
function formatDateTime(ts) {
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

/*
  Adds a key metric card to the parent container. Optionally apply a
  positive or negative class based on the boolean flag.
*/
function addCard(parent, title, val, positive) {
  const c = el('div', 'info');
  const valClass = positive !== undefined ? (positive ? 'positive' : 'negative') : '';
  c.innerHTML = `<div class='info-title'>${title}</div><div class='info-val ${valClass}'>${val || '—'}</div>`;
  parent.append(c);
}

// Format date/time label for x-axis and tooltip
function formatDateLabel(dateStr, tf) {
  // dateStr could be 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS'
  if (tf === '1D' || tf === '1W') {
    // For intraday, show HH:MM
    const parts = dateStr.split(' ');
    const time = parts[1] || '';
    return time.slice(0, 5);
  } else {
    // For daily, show abbreviated month + day
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Format tooltip date/time separately for readability
function formatTooltipDate(dateStr) {
  if (dateStr.includes(' ')) {
    // Intraday: convert to locale time with date
    const [dPart, tPart] = dateStr.split(' ');
    const d = new Date(dPart + 'T' + tPart);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } else {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

// Mini version for chart tooltips
function miniFormatTooltipDate(dateStr) {
  if (dateStr.includes(' ')) {
    const [dPart, tPart] = dateStr.split(' ');
    const d = new Date(dPart + 'T' + tPart);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } else {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

// Convert hex color to rgba string with given alpha
function hexToRgba(hex, alpha) {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Mini version for chart rendering
function miniHexToRgba(hex, alpha) {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Date utilities for calendar
function ymd(d) {
  // Use local date instead of ISO to avoid timezone issues
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(d) {
  const c = new Date(d);
  const day = c.getDay();
  const diff = (day === 0 ? 6 : day - 1);
  c.setDate(c.getDate() - diff);
  // Reset time to start of day to avoid timezone issues
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  // Reset time to start of day to avoid timezone issues
  e.setHours(0, 0, 0, 0);
  return e;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// Export/Import utilities
function exportPostsToFile() {
  try {
    const blob = new Blob([JSON.stringify(shippedPosts, null, 2)], {
      type: 'application/json'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'posts.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  } catch (e) { /* noop */ }
}

function importPostsFromFile(onDone) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json';
  inp.onchange = () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (json && typeof json === 'object') {
          for (const sym in json) shippedPosts[sym] = json[sym];
          savePostsToStorage();
          if (typeof onDone === 'function') onDone();
        }
      } catch (e) { /* noop */ }
    };
    reader.readAsText(file);
  };
  inp.click();
}
