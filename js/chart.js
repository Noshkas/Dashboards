/*
  charts.js - All chart functionality including technical indicators and rendering
  This file handles the main chart, mini charts, and all technical analysis calculations
*/

/*
  Create an interactive chart for the selected stock. When invoked, the
  card enters chart-mode which hides the header, cards and description and
  reveals a dedicated canvas area with timeframe buttons.
*/
function showChart(card, sym) {
  // Switch to chart mode
  card.classList.add('chart-mode');

  // Hide any existing posts section
  const existingPosts = document.querySelector('.posts-container');
  if (existingPosts) existingPosts.style.display = 'none';

  // Hide the existing close button
  const oldCloseBtn = card.querySelector('button.close-btn');
  if (oldCloseBtn) {
    oldCloseBtn.style.display = 'none';
  }

  // Create chart container
  const container = el('div', 'chart-container');

  // Timeframe buttons definition
  const timeframes = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD', '5Y'];
  let selectedTimeframe = '1D';

  // Guard against racing loads
  let loadVersion = 0;

  // State variables for the chart
  let chartData = [];
  let rawData = [];
  let indicatorsData = {};
  const activeIndicators = new Set();
  const lines = [];
  let pointsMode = false;
  let activePoint = null;
  let resizeObserver;

  // Create timeframe buttons container
  const timeframeButtons = el('div', 'timeframe-buttons');

  // Tools button for accessing points/technical menu
  const toolsBtn = el('button', 'tools-btn');
  toolsBtn.innerHTML = '&#9881;'; /* gear icon */
  timeframeButtons.appendChild(toolsBtn);

  // Tools menu state
  let toolsExpander = null;
  let toolsInTechnical = false;

  toolsBtn.onclick = (e) => {
    e.stopPropagation();
    // Toggle visibility
    if (toolsExpander) {
      toolsExpander.remove();
      toolsExpander = null;
      toolsInTechnical = false;
      return;
    }
    toolsExpander = document.createElement('div');
    toolsExpander.className = 'expander expander-left';

    function renderToolsMenu() {
      toolsExpander.innerHTML = '';
      if (!toolsInTechnical) {
        ['Points', 'Technical'].forEach(label => {
          const b = el('button', 'expander-btn', label);
          b.onclick = (ev) => {
            ev.stopPropagation();
            if (label === 'Technical') {
              toolsInTechnical = true;
              renderToolsMenu();
            } else if (label === 'Points') {
              pointsMode = !pointsMode;
              activePoint = null;
              if (pointsMode) toolsBtn.classList.add('active');
              else toolsBtn.classList.remove('active');
              toolsExpander.remove();
              toolsExpander = null;
              toolsInTechnical = false;
              return;
            }
          };
          toolsExpander.appendChild(b);
        });
      } else {
        const indicators = [
          { short: 'MA', name: 'Moving Average' },
          { short: 'RSI', name: 'Relative Strength Index' },
          { short: 'MACD', name: 'MACD' },
          { short: 'BB', name: 'Bollinger Bands' },
          { short: 'Stoch', name: 'Stochastic Oscillator' },
          { short: 'ATR', name: 'Average True Range' },
          { short: 'OBV', name: 'On-Balance Volume' },
          { short: 'Trendline', name: 'Trendline' }
        ];
        indicators.forEach(ind => {
          const btn = el('button', 'expander-btn', ind.short);
          if (activeIndicators.has(ind.short)) btn.classList.add('active');
          btn.onclick = (ev) => {
            ev.stopPropagation();
            if (activeIndicators.has(ind.short)) {
              activeIndicators.delete(ind.short);
              btn.classList.remove('active');
            } else {
              activeIndicators.add(ind.short);
              btn.classList.add('active');
            }
            drawChart(null, null);
            updateAnalysisInfo();
          };
          toolsExpander.appendChild(btn);
        });
        const backBtn = el('button', 'expander-btn', 'Back');
        backBtn.onclick = (ev) => {
          ev.stopPropagation();
          toolsInTechnical = false;
          renderToolsMenu();
        };
        toolsExpander.appendChild(backBtn);
      }
    }
    renderToolsMenu();
    card.appendChild(toolsExpander);
  };

  // Create actual timeframe buttons
  timeframes.forEach(tf => {
    const btn = el('button', 'timeframe-btn', tf);
    if (tf === selectedTimeframe) btn.classList.add('active');
    btn.onclick = () => {
      timeframeButtons.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTimeframe = tf;
      loadChartData(sym, selectedTimeframe);
    };
    timeframeButtons.appendChild(btn);
  });

  // Exit button
  const exitBtn = el('button', 'exit-btn');
  exitBtn.textContent = '×';
  exitBtn.title = 'Exit';
  exitBtn.onclick = (e) => {
    e.stopPropagation();
    pointsMode = false;
    activePoint = null;
    toolsBtn.classList.remove('active');
    showBlogView(sym);
  };
  timeframeButtons.appendChild(exitBtn);
  container.append(timeframeButtons);

  // Chart area and canvas
  const chartArea = el('div', 'chart-area');
  const canvas = document.createElement('canvas');
  canvas.className = 'chart-canvas';
  chartArea.append(canvas);

  // Tooltip overlay
  const tooltip = el('div', 'chart-tooltip');
  tooltip.innerHTML = '<div class="tooltip-date"></div><div class="tooltip-price"></div>';
  chartArea.append(tooltip);
  container.append(chartArea);

  // Analysis info bar
  const infoBar = el('div', 'analysis-info');
  container.append(infoBar);
  card.append(container);

  // Show placeholder in analysis info until data loads
  updateAnalysisInfo();

  // Ship button
  const shipBtn = el('button', 'ship-btn', 'Shipp');
  shipBtn.onclick = () => {
    if (!rawData || !rawData.length) {
      showBlogView(sym);
      return;
    }
    const currentPrice = rawData[rawData.length - 1].close;
    let triVal = null;
    const trendObj = indicatorsData['Trendline'];
    if (trendObj && trendObj.series && trendObj.series.length) {
      const lastTrend = trendObj.series[trendObj.series.length - 1];
      if (lastTrend != null && lastTrend !== 0) {
        triVal = ((currentPrice - lastTrend) / lastTrend) * 100;
      }
    }
    const indValues = {};
    activeIndicators.forEach(name => {
      const data = indicatorsData[name];
      if (!data) return;
      let val = null;
      if (name === 'BB') {
        const middle = data.middle || data.series;
        if (middle && middle.length) val = middle[middle.length - 1];
      } else if (name === 'MA') {
        const s20 = data.series20;
        const s50 = data.series50;
        let v20 = null, v50 = null;
        if (s20 && s20.length) v20 = s20[s20.length - 1];
        if (s50 && s50.length) v50 = s50[s50.length - 1];
        if (v20 != null) indValues['MA20'] = v20;
        if (v50 != null) indValues['MA50'] = v50;
        return;
      } else {
        const series = data.series;
        if (series && series.length) val = series[series.length - 1];
      }
      if (val != null) indValues[name] = val;
    });
    if (!shippedPosts[sym]) shippedPosts[sym] = [];
    const newChart = {
      id: nextPostId(),
      type: 'chart',
      timeframe: selectedTimeframe,
      rawData: rawData.slice(),
      activeIndicators: Array.from(activeIndicators),
      price: currentPrice,
      tri: triVal,
      indicatorValues: indValues,
      ts: Date.now()
    };
    shippedPosts[sym].push(newChart);
    pushPostToFirestore(sym, {
      type: 'chart',
      timeframe: selectedTimeframe,
      indicatorValues: indValues,
      price: currentPrice,
      tri: triVal,
      ts: newChart.ts
    });
    savePostsToStorage();
    showBlogView(sym);
  };
  card.appendChild(shipBtn);

  // Update analysis info bar
  function updateAnalysisInfo() {
    if (!infoBar) return;
    infoBar.innerHTML = '';
    const parts = [];
    if (!rawData || !rawData.length) {
      infoBar.textContent = 'No analysis data';
      return;
    }
    let price = null;
    if (rawData && rawData.length) {
      const last = rawData[rawData.length - 1];
      if (last && last.close != null) price = last.close;
    }
    if (price != null) {
      parts.push(`Price: $${price.toFixed(2)}`);
    }
    let triText = null;
    const trend = indicatorsData['Trendline'];
    if (trend && trend.series && price != null) {
      const series = trend.series;
      let trendVal = null;
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] != null) { trendVal = series[i]; break; }
      }
      if (trendVal != null && trendVal !== 0) {
        const tri = ((price - trendVal) / trendVal) * 100;
        triText = `TRI: ${(tri >= 0 ? '+' : '')}${tri.toFixed(2)}%`;
        parts.push(triText);
      }
    }
    activeIndicators.forEach(name => {
      const data = indicatorsData[name];
      if (!data) return;
      if (name === 'BB') {
        const up = data.upper ? data.upper[data.upper.length - 1] : null;
        const mid = data.middle ? data.middle[data.middle.length - 1] : null;
        const low = data.lower ? data.lower[data.lower.length - 1] : null;
        if (up != null && mid != null && low != null) {
          parts.push(`BB: ${up.toFixed(2)} / ${mid.toFixed(2)} / ${low.toFixed(2)}`);
        }
      } else if (name === 'MA') {
        const s20 = data.series20;
        const s50 = data.series50;
        let v20 = null, v50 = null;
        if (s20) {
          for (let i = s20.length - 1; i >= 0; i--) {
            if (s20[i] != null) { v20 = s20[i]; break; }
          }
        }
        if (s50) {
          for (let i = s50.length - 1; i >= 0; i--) {
            if (s50[i] != null) { v50 = s50[i]; break; }
          }
        }
        if (v20 != null || v50 != null) {
          const segs = [];
          if (v20 != null) segs.push(`MA20: ${v20.toFixed(2)}`);
          if (v50 != null) segs.push(`MA50: ${v50.toFixed(2)}`);
          parts.push(segs.join(' | '));
        }
      } else {
        const series = data.series || data;
        let val = null;
        if (series) {
          for (let i = series.length - 1; i >= 0; i--) {
            if (series[i] != null) { val = series[i]; break; }
          }
        }
        if (val != null) {
          parts.push(`${name}: ${val.toFixed(2)}`);
        }
      }
    });
    if (!parts.length) {
      infoBar.textContent = 'No analysis data';
    } else {
      parts.forEach(text => {
        const span = el('span', null, text);
        infoBar.appendChild(span);
      });
    }
  }

  // Draw the chart
  function drawChart(highlightIndex, highlightPoint) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let { width: clientWidth, height: clientHeight } = canvas.getBoundingClientRect();
    if (!clientWidth || !clientHeight) {
      const parentRect = canvas.parentNode ? canvas.parentNode.getBoundingClientRect() : { width: 760, height: 0 };
      clientWidth = parentRect.width || 760;
      clientHeight = parentRect.height || 400;
    }
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    ctx.scale(dpr, dpr);
    const margin = { top: 40, right: 20, bottom: 20, left: 20 };
    const width = clientWidth;
    const height = clientHeight;
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;
    ctx.clearRect(0, 0, width, height);
    if (!chartData || chartData.length === 0) return;

    let minPrice = Infinity, maxPrice = -Infinity;
    chartData.forEach(p => {
      if (p.close < minPrice) minPrice = p.close;
      if (p.close > maxPrice) maxPrice = p.close;
    });
    const pad = (maxPrice - minPrice) * 0.05;
    minPrice -= pad;
    maxPrice += pad;
    const priceRange = maxPrice - minPrice || 1;
    const trendUp = chartData[chartData.length - 1].close >= chartData[0].close;
    const lineColor = trendUp ? '#10b981' : '#ef4444';
    const gradient = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom);
    gradient.addColorStop(0, hexToRgba(lineColor, 0.2));
    gradient.addColorStop(1, hexToRgba(lineColor, 0));
    const points = chartData.map((pt, idx) => {
      const x = margin.left + (chartW * idx) / (chartData.length - 1);
      const y = margin.top + chartH * (1 - (pt.close - minPrice) / priceRange);
      return { x, y, price: pt.close };
    });

    // Draw smooth line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    const smoothFactor = 0.35;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) * smoothFactor;
      const cp1y = p1.y + (p2.y - p0.y) * smoothFactor;
      const cp2x = p2.x - (p3.x - p1.x) * smoothFactor;
      const cp2y = p2.y - (p3.y - p1.y) * smoothFactor;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under curve
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) * smoothFactor;
      const cp1y = p1.y + (p2.y - p0.y) * smoothFactor;
      const cp2x = p2.x - (p3.x - p1.x) * smoothFactor;
      const cp2y = p2.y - (p3.y - p1.y) * smoothFactor;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    ctx.lineTo(margin.left + chartW, height - margin.bottom);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Highlight point
    if (highlightPoint) {
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(highlightPoint.x, highlightPoint.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (highlightIndex != null) {
      const p = points[highlightIndex];
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Overlay technical indicators
    if (activeIndicators.size > 0) {
      ctx.save();
      ctx.lineWidth = 1.5;
      const priceScale = { min: minPrice, max: maxPrice };
      const isPriceScaled = (n) => n === 'MA' || n === 'Trendline' || n === 'BB';
      const yFor = (val, scale) => margin.top + chartH * (1 - (val - scale.min) / ((scale.max - scale.min) || 1));

      function drawSmoothCurve(pts) {
        if (pts.length < 2) return;
        const smoothFactor = 0.35;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] || pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] || p2;
          const cp1x = p1.x + (p2.x - p0.x) * smoothFactor;
          const cp1y = p1.y + (p2.y - p0.y) * smoothFactor;
          const cp2x = p2.x - (p3.x - p1.x) * smoothFactor;
          const cp2y = p2.y - (p3.y - p1.y) * smoothFactor;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        ctx.stroke();
      }

      for (const name of activeIndicators) {
        const data = indicatorsData[name];
        if (!data) continue;
        let col;
        switch (name) {
          case 'MA': col = '#1f77b4'; break;
          case 'RSI': col = '#9467bd'; break;
          case 'MACD': col = '#17becf'; break;
          case 'BB': col = '#9ca3af'; break;
          case 'Stoch': col = '#ff7f0e'; break;
          case 'ATR': col = '#d62728'; break;
          case 'OBV': col = '#7f7f7f'; break;
          case 'Trendline': col = '#1f2a44'; break;
          default: col = '#8c564b';
        }
        ctx.strokeStyle = col;

        if (name === 'BB') {
          const { upper, lower, min, max } = data;
          const scale = isPriceScaled('BB') ? priceScale : { min, max };
          // Draw upper band
          let segment = [];
          for (let i = 0; i < upper.length; i++) {
            const val = upper[i];
            if (val == null) {
              if (segment.length > 1) drawSmoothCurve(segment);
              segment = [];
              continue;
            }
            const x = margin.left + (chartW * i) / (chartData.length - 1);
            const y = yFor(val, scale);
            segment.push({ x, y });
          }
          if (segment.length > 1) drawSmoothCurve(segment);
          // Draw lower band
          segment = [];
          for (let i = 0; i < lower.length; i++) {
            const val = lower[i];
            if (val == null) {
              if (segment.length > 1) drawSmoothCurve(segment);
              segment = [];
              continue;
            }
            const x = margin.left + (chartW * i) / (chartData.length - 1);
            const y = yFor(val, scale);
            segment.push({ x, y });
          }
          if (segment.length > 1) drawSmoothCurve(segment);
        } else {
          const { series, series20, series50, min, max } = data;
          const toDraw = [];
          if (name === 'MA' && series20 && series50) {
            toDraw.push({ s: series20, color: '#1f77b4' });
            toDraw.push({ s: series50, color: '#2ca02c' });
          } else if (series) {
            toDraw.push({ s: series, color: col });
          }
          toDraw.forEach(({ s, color }) => {
            let segment = [];
            for (let i = 0; i < s.length; i++) {
              const val = s[i];
              if (val == null) {
                if (segment.length > 1) {
                  ctx.strokeStyle = color;
                  drawSmoothCurve(segment);
                }
                segment = [];
                continue;
              }
              const x = margin.left + (chartW * i) / (chartData.length - 1);
              const scale = isPriceScaled(name) ? priceScale : { min, max };
              const y = yFor(val, scale);
              segment.push({ x, y });
            }
            if (segment.length > 1) {
              ctx.strokeStyle = color;
              drawSmoothCurve(segment);
            }
          });
        }
      }
      ctx.restore();
    }

    // Draw user-defined percentage lines
    if (lines.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 3;
      ctx.font = '12px Inter, sans-serif';
      lines.forEach(line => {
        function findIndexForDate(dateStr) {
          for (let i = 0; i < chartData.length; i++) {
            const d = chartData[i].date;
            if (d === dateStr) return i;
            if (d > dateStr) return i;
          }
          return chartData.length - 1;
        }
        const sIdx = findIndexForDate(line.startDate);
        const eIdx = findIndexForDate(line.endDate);
        if (sIdx == null || eIdx == null) return;
        const sX = margin.left + (chartW * sIdx) / (chartData.length - 1);
        const eX = margin.left + (chartW * eIdx) / (chartData.length - 1);
        const sP = chartData[sIdx].close;
        const eP = chartData[eIdx].close;
        const sY = margin.top + chartH * (1 - (sP - minPrice) / priceRange);
        const eY = margin.top + chartH * (1 - (eP - minPrice) / priceRange);
        ctx.beginPath();
        ctx.moveTo(sX, sY);
        ctx.lineTo(eX, eY);
        ctx.stroke();
        const pctChange = ((eP - sP) / sP) * 100;
        const midX = (sX + eX) / 2;
        const midY = (sY + eY) / 2;
        const angle = Math.atan2(eY - sY, eX - sX);
        const label = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%';
        const textWidth = ctx.measureText(label).width;
        const pad = 6;
        const bubbleW = textWidth + pad * 2;
        const bubbleH = 18;
        const radius = 4;
        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        ctx.fillStyle = '#2563EB';
        ctx.beginPath();
        const w2 = bubbleW / 2;
        const h2 = bubbleH / 2;
        ctx.moveTo(-w2 + radius, -h2);
        ctx.lineTo(w2 - radius, -h2);
        ctx.quadraticCurveTo(w2, -h2, w2, -h2 + radius);
        ctx.lineTo(w2, h2 - radius);
        ctx.quadraticCurveTo(w2, h2, w2 - radius, h2);
        ctx.lineTo(-w2 + radius, h2);
        ctx.quadraticCurveTo(-w2, h2, -w2, h2 - radius);
        ctx.lineTo(-w2, -h2 + radius);
        ctx.quadraticCurveTo(-w2, -h2, -w2 + radius, -h2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 0);
        ctx.restore();
        {
          const sin = Math.sin(angle);
          const cos = Math.cos(angle);
          const pts = [
            { x: -w2, y: -h2 },
            { x: w2, y: -h2 },
            { x: w2, y: h2 },
            { x: -w2, y: h2 }
          ];
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          pts.forEach(pt => {
            const gx = midX + pt.x * cos - pt.y * sin;
            const gy = midY + pt.x * sin + pt.y * cos;
            if (gx < minX) minX = gx;
            if (gx > maxX) maxX = gx;
            if (gy < minY) minY = gy;
            if (gy > maxY) maxY = gy;
          });
          line.bbox = { minX, maxX, minY, maxY };
        }
      });
      ctx.restore();
    }
  }

  // Tooltip handling
  function updateTooltip(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { width: cw, height: ch } = rect;
    const margin = { top: 40, right: 20, bottom: 20, left: 20 };
    const chartW = cw - margin.left - margin.right;
    const chartH = ch - margin.top - margin.bottom;
    let xpct = (x - margin.left) / chartW;
    xpct = Math.max(0, Math.min(1, xpct));
    const idxFloat = xpct * (chartData.length - 1);
    const i = Math.floor(idxFloat);
    const frac = idxFloat - i;
    const i2 = Math.min(chartData.length - 1, i + 1);
    let interpPrice;
    if (i2 !== i) {
      interpPrice = chartData[i].close + (chartData[i2].close - chartData[i].close) * frac;
    } else {
      interpPrice = chartData[i].close;
    }
    let minPrice = Infinity, maxPrice = -Infinity;
    chartData.forEach(pt => {
      if (pt.close < minPrice) minPrice = pt.close;
      if (pt.close > maxPrice) maxPrice = pt.close;
    });
    const pad = (maxPrice - minPrice) * 0.05;
    minPrice -= pad;
    maxPrice += pad;
    const priceRange = maxPrice - minPrice || 1;
    const highlightX = margin.left + xpct * chartW;
    const highlightY = margin.top + chartH * (1 - (interpPrice - minPrice) / priceRange);
    let nearestIndex = Math.round(idxFloat);
    nearestIndex = Math.max(0, Math.min(chartData.length - 1, nearestIndex));
    const d = chartData[nearestIndex];
    tooltip.querySelector('.tooltip-date').textContent = formatTooltipDate(d.date);
    tooltip.querySelector('.tooltip-price').textContent = interpPrice.toFixed(2);
    const tooltipWidth = 120;
    const tooltipHeight = 50;
    let left = e.clientX - rect.left + 10;
    if (left + tooltipWidth > cw) {
      left = cw - tooltipWidth - 10;
    }
    let top = e.clientY - rect.top - tooltipHeight - 10;
    if (top < 0) top = e.clientY - rect.top + 10;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.classList.add('visible');
    drawChart(null, { x: highlightX, y: highlightY });
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
    drawChart(null, null);
  }

  canvas.addEventListener('mousemove', updateTooltip);
  canvas.addEventListener('mouseleave', hideTooltip);

  // Handle point selection for drawing percentage change lines
  canvas.addEventListener('mousedown', function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    for (let i = lines.length - 1; i >= 0; i--) {
      const bbox = lines[i].bbox;
      if (bbox && cx >= bbox.minX && cx <= bbox.maxX && cy >= bbox.minY && cy <= bbox.maxY) {
        lines.splice(i, 1);
        drawChart(null, null);
        return;
      }
    }
    if (!pointsMode) return;
    const margin = { top: 40, right: 20, bottom: 20, left: 20 };
    const cw = rect.width;
    const chartW = cw - margin.left - margin.right;
    let xpct = (cx - margin.left) / chartW;
    xpct = Math.max(0, Math.min(1, xpct));
    const idxFloat = xpct * (chartData.length - 1);
    const nearestIndex = Math.round(idxFloat);
    const clampedIndex = Math.max(0, Math.min(chartData.length - 1, nearestIndex));
    const dateStr = chartData[clampedIndex].date;
    if (!activePoint) {
      activePoint = { date: dateStr };
    } else {
      lines.push({ startDate: activePoint.date, endDate: dateStr });
      activePoint = null;
      drawChart(null, null);
    }
  });

  // Resize observer
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => drawChart(null, null));
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener('resize', () => drawChart(null, null));
  }

  // Fetch and render data
  function loadChartData(symbol, timeframe) {
    const myVersion = ++loadVersion;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.font = '16px Inter, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rect = canvas.getBoundingClientRect();
    ctx.fillText('Loading chart...', rect.width / 2, rect.height / 2);
    ctx.restore();

    getHistoricalData(symbol, timeframe).then(data => {
      if (myVersion !== loadVersion) return;
      rawData = data;
      const windowSize = Math.max(3, Math.floor(rawData.length * 0.1));
      chartData = smoothData(rawData, windowSize);
      const closes = rawData.map(d => d.close);
      indicatorsData = {};
      // Compute all indicators
      {
        const series20 = calculateSMA(closes, 20);
        const series50 = calculateSMA(closes, 50);
        const vals = series20.concat(series50).filter(v => v != null);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        indicatorsData['MA'] = { series20, series50, min, max };
      }
      {
        const series = calculateRSI(closes, 14);
        const vals = series.filter(v => v != null);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        indicatorsData['RSI'] = { series, min, max };
      }
      {
        const series = calculateMACD(closes, 12, 26);
        const vals = series.filter(v => v != null);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        indicatorsData['MACD'] = { series, min, max };
      }
      {
        const bands = calculateBB(closes, 20, 2);
        const upperVals = bands.upper.filter(v => v != null);
        const lowerVals = bands.lower.filter(v => v != null);
        const allVals = upperVals.concat(lowerVals);
        const min = Math.min(...allVals);
        const max = Math.max(...allVals);
        indicatorsData['BB'] = { upper: bands.upper, lower: bands.lower, min, max };
      }
      {
        const series = calculateStoch(rawData, 14);
        const vals = series.filter(v => v != null);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        indicatorsData['Stoch'] = { series, min, max };
      }
      {
        const series = calculateATR(rawData, 14);
        const vals = series.filter(v => v != null);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        indicatorsData['ATR'] = { series, min, max };
      }
      {
        const series = calculateOBV(rawData);
        const vals = series.filter(v => v != null);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        indicatorsData['OBV'] = { series, min, max };
      }
      {
        const series = calculateTrendline(closes);
        const vals = series.filter(v => v != null);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        indicatorsData['Trendline'] = { series, min, max };
      }
      if (myVersion !== loadVersion) return;
      drawChart(null, null);
      updateAnalysisInfo();
    }).catch(() => {
      if (myVersion !== loadVersion) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.font = '14px Inter, sans-serif';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const rect2 = canvas.getBoundingClientRect();
      ctx.fillText('Failed to load chart data.', rect2.width / 2, rect2.height / 2);
      ctx.restore();
    });
  }

  // Initial load
  requestAnimationFrame(() => {
    loadChartData(sym, selectedTimeframe);
  });
}

/*
  Simple moving average smoothing
*/
function smoothData(data, windowSize) {
  if (!data || data.length === 0 || windowSize < 2) return data;
  const half = Math.floor(windowSize / 2);
  const result = data.map((pt, idx) => {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, idx - half);
    const end = Math.min(data.length - 1, idx + half);
    for (let i = start; i <= end; i++) {
      sum += data[i].close;
      count++;
    }
    return { date: pt.date, close: sum / count };
  });
  return result;
}

/* Technical indicator calculations */

// Simple Moving Average
function calculateSMA(values, period) {
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

// Exponential Moving Average
function calculateEMA(values, period) {
  const result = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let emaPrev = null;
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val == null) {
      result[i] = null;
      continue;
    }
    if (emaPrev == null) {
      if (i >= period - 1) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += values[j];
        emaPrev = sum / period;
        result[i] = emaPrev;
      }
    } else {
      emaPrev = val * k + emaPrev * (1 - k);
      result[i] = emaPrev;
    }
  }
  return result;
}

// Relative Strength Index (RSI)
function calculateRSI(values, period) {
  const rsi = new Array(values.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }
  return rsi;
}

// MACD
function calculateMACD(values, fast = 12, slow = 26) {
  const emaFast = calculateEMA(values, fast);
  const emaSlow = calculateEMA(values, slow);
  const macd = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) {
      macd[i] = emaFast[i] - emaSlow[i];
    } else {
      macd[i] = null;
    }
  }
  return macd;
}

// Bollinger Bands
function calculateBB(values, period = 20, multiplier = 2) {
  const sma = calculateSMA(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (sma[i] != null) {
      let sum = 0;
      let sqSum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const v = values[j];
        sum += v;
        sqSum += v * v;
      }
      const mean = sum / period;
      const variance = (sqSum / period) - (mean * mean);
      const sd = Math.sqrt(Math.max(variance, 0));
      upper[i] = sma[i] + multiplier * sd;
      lower[i] = sma[i] - multiplier * sd;
    }
  }
  return { upper, middle: sma, lower };
}

// Stochastic Oscillator
function calculateStoch(data, kPeriod = 14) {
  const stoch = new Array(data.length).fill(null);
  for (let i = 0; i < data.length; i++) {
    if (i >= kPeriod - 1) {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = i - kPeriod + 1; j <= i; j++) {
        const d = data[j];
        if (d.high > highestHigh) highestHigh = d.high;
        if (d.low < lowestLow) lowestLow = d.low;
      }
      const denom = highestHigh - lowestLow;
      if (denom === 0) {
        stoch[i] = 0;
      } else {
        stoch[i] = ((data[i].close - lowestLow) / denom) * 100;
      }
    }
  }
  return stoch;
}

// Average True Range (ATR)
function calculateATR(data, period = 14) {
  const atr = new Array(data.length).fill(null);
  const trueRanges = new Array(data.length).fill(0);
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges[i] = tr;
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRanges[i];
  atr[period] = sum / period;
  for (let i = period + 1; i < data.length; i++) {
    atr[i] = ((atr[i - 1] * (period - 1)) + trueRanges[i]) / period;
  }
  return atr;
}

// On-Balance Volume (OBV)
function calculateOBV(data) {
  const obv = new Array(data.length).fill(null);
  obv[0] = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i - 1].close) {
      obv[i] = obv[i - 1] + data[i].volume;
    } else if (data[i].close < data[i - 1].close) {
      obv[i] = obv[i - 1] - data[i].volume;
    } else {
      obv[i] = obv[i - 1];
    }
  }
  return obv;
}

// Trendline using linear regression
function calculateTrendline(values) {
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const y = values[i];
    if (y == null) continue;
    const x = i;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    count++;
  }
  if (count === 0) return new Array(n).fill(null);
  const slope = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / count;
  const result = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    result[i] = slope * i + intercept;
  }
  return result;
}

/* Mini versions for post rendering */
function miniSmoothData(data, windowSize) {
  if (!data || data.length === 0 || windowSize < 2) return data;
  const half = Math.floor(windowSize / 2);
  return data.map((pt, idx) => {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, idx - half);
    const end = Math.min(data.length - 1, idx + half);
    for (let i = start; i <= end; i++) {
      sum += data[i].close;
      count++;
    }
    return { date: pt.date, close: sum / count };
  });
}

function miniCalculateSMA(values, period) {
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

function miniCalculateEMA(values, period) {
  const result = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let emaPrev = null;
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val == null) {
      result[i] = null;
      continue;
    }
    if (emaPrev == null) {
      if (i >= period - 1) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += values[j];
        emaPrev = sum / period;
        result[i] = emaPrev;
      }
    } else {
      emaPrev = val * k + emaPrev * (1 - k);
      result[i] = emaPrev;
    }
  }
  return result;
}

function miniCalculateRSI(values, period) {
  const rsi = new Array(values.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }
  return rsi;
}

function miniCalculateMACD(values, fast = 12, slow = 26) {
  const emaFast = miniCalculateEMA(values, fast);
  const emaSlow = miniCalculateEMA(values, slow);
  const macd = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) {
      macd[i] = emaFast[i] - emaSlow[i];
    } else {
      macd[i] = null;
    }
  }
  return macd;
}

function miniCalculateBB(values, period = 20, multiplier = 2) {
  const sma = miniCalculateSMA(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (sma[i] != null) {
      let sum = 0;
      let sqSum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const v = values[j];
        sum += v;
        sqSum += v * v;
      }
      const mean = sum / period;
      const variance = (sqSum / period) - (mean * mean);
      const sd = Math.sqrt(Math.max(variance, 0));
      upper[i] = sma[i] + multiplier * sd;
      lower[i] = sma[i] - multiplier * sd;
    }
  }
  return { upper, middle: sma, lower };
}

function miniCalculateStoch(data, kPeriod = 14) {
  const stoch = new Array(data.length).fill(null);
  for (let i = 0; i < data.length; i++) {
    if (i >= kPeriod - 1) {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = i - kPeriod + 1; j <= i; j++) {
        const d = data[j];
        if (d.high > highestHigh) highestHigh = d.high;
        if (d.low < lowestLow) lowestLow = d.low;
      }
      const denom = highestHigh - lowestLow;
      if (denom === 0) {
        stoch[i] = 0;
      } else {
        stoch[i] = ((data[i].close - lowestLow) / denom) * 100;
      }
    }
  }
  return stoch;
}

function miniCalculateATR(data, period = 14) {
  const atr = new Array(data.length).fill(null);
  const trueRanges = new Array(data.length).fill(0);
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges[i] = tr;
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRanges[i];
  atr[period] = sum / period;
  for (let i = period + 1; i < data.length; i++) {
    atr[i] = ((atr[i - 1] * (period - 1)) + trueRanges[i]) / period;
  }
  return atr;
}

function miniCalculateOBV(data) {
  const obv = new Array(data.length).fill(null);
  obv[0] = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i - 1].close) {
      obv[i] = obv[i - 1] + data[i].volume;
    } else if (data[i].close < data[i - 1].close) {
      obv[i] = obv[i - 1] - data[i].volume;
    } else {
      obv[i] = obv[i - 1];
    }
  }
  return obv;
}

function miniCalculateTrendline(values) {
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const y = values[i];
    if (y == null) continue;
    const x = i;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    count++;
  }
  if (count === 0) return new Array(n).fill(null);
  const slope = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / count;
  const result = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    result[i] = slope * i + intercept;
  }
  return result;
}

/*
  Render a miniature interactive chart for a shipped post
*/
function renderMiniChart(canvas, rawData, activeIndicatorsArr) {
  if (!rawData || rawData.length === 0) return;
  const windowSize = Math.max(3, Math.floor(rawData.length * 0.1));
  const chartData = miniSmoothData(rawData, windowSize);
  const closes = rawData.map(d => d.close);
  const indicatorsMini = {};
  const activeSet = new Set(activeIndicatorsArr || []);

  function computeIndicator(name, computeFn) {
    const series = computeFn();
    const vals = series.filter(v => v != null);
    if (vals.length) {
      indicatorsMini[name] = { series, min: Math.min(...vals), max: Math.max(...vals) };
    }
  }

  if (activeSet.has('MA')) {
    const series20 = miniCalculateSMA(closes, 20);
    const series50 = miniCalculateSMA(closes, 50);
    const vals = series20.concat(series50).filter(v => v != null);
    if (vals.length) {
      indicatorsMini['MA'] = {
        series20,
        series50,
        min: Math.min(...vals),
        max: Math.max(...vals)
      };
    }
  }
  if (activeSet.has('RSI')) {
    computeIndicator('RSI', () => miniCalculateRSI(closes, 14));
  }
  if (activeSet.has('MACD')) {
    computeIndicator('MACD', () => miniCalculateMACD(closes, 12, 26));
  }
  if (activeSet.has('BB')) {
    const bands = miniCalculateBB(closes, 20, 2);
    const upperVals = bands.upper.filter(v => v != null);
    const lowerVals = bands.lower.filter(v => v != null);
    const allVals = upperVals.concat(lowerVals);
    if (allVals.length) {
      indicatorsMini['BB'] = { upper: bands.upper, lower: bands.lower, min: Math.min(...allVals), max: Math.max(...allVals) };
    }
  }
  if (activeSet.has('Stoch')) {
    computeIndicator('Stoch', () => miniCalculateStoch(rawData, 14));
  }
  if (activeSet.has('ATR')) {
    computeIndicator('ATR', () => miniCalculateATR(rawData, 14));
  }
  if (activeSet.has('OBV')) {
    computeIndicator('OBV', () => miniCalculateOBV(rawData));
  }
  if (activeSet.has('Trendline')) {
    computeIndicator('Trendline', () => miniCalculateTrendline(closes));
  }

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const margin = { top: 30, right: 16, bottom: 20, left: 20 };
  const width = rect.width;
  const height = rect.height;
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  let minPrice = Infinity, maxPrice = -Infinity;
  chartData.forEach(p => {
    if (p.close < minPrice) minPrice = p.close;
    if (p.close > maxPrice) maxPrice = p.close;
  });
  const pad = (maxPrice - minPrice) * 0.05;
  minPrice -= pad;
  maxPrice += pad;
  const priceRange = maxPrice - minPrice || 1;
  const trendUp = chartData[chartData.length - 1].close >= chartData[0].close;
  const lineColor = trendUp ? '#10b981' : '#ef4444';
  const gradient = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom);
  gradient.addColorStop(0, miniHexToRgba(lineColor, 0.2));
  gradient.addColorStop(1, miniHexToRgba(lineColor, 0));

  const points = chartData.map((pt, idx) => {
    const x = margin.left + (chartW * idx) / (chartData.length - 1);
    const y = margin.top + chartH * (1 - (pt.close - minPrice) / priceRange);
    return { x, y, price: pt.close };
  });

  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  const smoothFactor = 0.35;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) * smoothFactor;
    const cp1y = p1.y + (p2.y - p0.y) * smoothFactor;
    const cp2x = p2.x - (p3.x - p1.x) * smoothFactor;
    const cp2y = p2.y - (p3.y - p1.y) * smoothFactor;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fill area under curve
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) * smoothFactor;
    const cp1y = p1.y + (p2.y - p0.y) * smoothFactor;
    const cp2x = p2.x - (p3.x - p1.x) * smoothFactor;
    const cp2y = p2.y - (p3.y - p1.y) * smoothFactor;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.lineTo(margin.left + chartW, height - margin.bottom);
  ctx.lineTo(margin.left, height - margin.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Overlay active indicators
  if (activeSet.size > 0) {
    ctx.save();
    ctx.lineWidth = 1.5;
    const priceScaleMini = { min: minPrice, max: maxPrice };
    const isPriceScaled = (n) => n === 'MA' || n === 'Trendline' || n === 'BB';
    const yFor = (val, scale) => margin.top + chartH * (1 - (val - scale.min) / ((scale.max - scale.min) || 1));

    function drawSmooth(seriesVals, col, min, max, scaleOverride) {
      let segment = [];
      for (let i = 0; i < seriesVals.length; i++) {
        const val = seriesVals[i];
        if (val == null) {
          if (segment.length > 1) {
            ctx.beginPath();
            ctx.moveTo(segment[0].x, segment[0].y);
            for (let j = 0; j < segment.length - 1; j++) {
              const a = segment[j - 1] || segment[j];
              const b = segment[j];
              const c = segment[j + 1];
              const d = segment[j + 2] || c;
              const cp1x = b.x + (c.x - a.x) * smoothFactor;
              const cp1y = b.y + (c.y - a.y) * smoothFactor;
              const cp2x = c.x - (d.x - b.x) * smoothFactor;
              const cp2y = c.y - (d.y - b.y) * smoothFactor;
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, c.x, c.y);
            }
            ctx.strokeStyle = col;
            ctx.stroke();
          }
          segment = [];
          continue;
        }
        const x = margin.left + (chartW * i) / (chartData.length - 1);
        const scale = scaleOverride || { min, max };
        const y = yFor(val, scale);
        segment.push({ x, y });
      }
      if (segment.length > 1) {
        ctx.beginPath();
        ctx.moveTo(segment[0].x, segment[0].y);
        for (let j = 0; j < segment.length - 1; j++) {
          const a = segment[j - 1] || segment[j];
          const b = segment[j];
          const c = segment[j + 1];
          const d = segment[j + 2] || c;
          const cp1x = b.x + (c.x - a.x) * smoothFactor;
          const cp1y = b.y + (c.y - a.y) * smoothFactor;
          const cp2x = c.x - (d.x - b.x) * smoothFactor;
          const cp2y = c.y - (d.y - b.y) * smoothFactor;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, c.x, c.y);
        }
        ctx.strokeStyle = col;
        ctx.stroke();
      }
    }

    activeSet.forEach(name => {
      const data = indicatorsMini[name];
      if (!data) return;
      let col;
      switch (name) {
        case 'MA': col = '#1f77b4'; break;
        case 'RSI': col = '#9467bd'; break;
        case 'MACD': col = '#17becf'; break;
        case 'BB': col = '#9ca3af'; break;
        case 'Stoch': col = '#ff7f0e'; break;
        case 'ATR': col = '#d62728'; break;
        case 'OBV': col = '#7f7f7f'; break;
        case 'Trendline': col = '#1f2a44'; break;
        default: col = '#8c564b';
      }
      if (name === 'BB') {
        const { upper, lower, min, max } = data;
        const scale = isPriceScaled('BB') ? priceScaleMini : { min, max };
        drawSmooth(upper, col, min, max, scale);
        drawSmooth(lower, col, min, max, scale);
      } else if (name === 'MA') {
        const { series20, series50, min, max } = data;
        const scale = priceScaleMini;
        drawSmooth(series20, '#1f77b4', min, max, scale);
        drawSmooth(series50, '#2ca02c', min, max, scale);
      } else {
        const { series, min, max } = data;
        const scale = isPriceScaled(name) ? priceScaleMini : { min, max };
        drawSmooth(series, col, min, max, scale);
      }
    });
    ctx.restore();
  }

  // Tooltip handling for mini chart
  let tooltipEl = canvas.parentElement.querySelector('.chart-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    tooltipEl.innerHTML = '<div class="tooltip-date"></div><div class="tooltip-price"></div>';
    canvas.parentElement.appendChild(tooltipEl);
  }
  tooltipEl.style.opacity = '0';

  function updateMiniTooltip(e) {
    const rect2 = canvas.getBoundingClientRect();
    const x = e.clientX - rect2.left;
    const y = e.clientY - rect2.top;
    const xpct = Math.max(0, Math.min(1, (x - margin.left) / chartW));
    const idxFloat = xpct * (chartData.length - 1);
    const i = Math.floor(idxFloat);
    const frac = idxFloat - i;
    const i2 = Math.min(chartData.length - 1, i + 1);
    let interpPrice;
    if (i2 !== i) {
      interpPrice = chartData[i].close + (chartData[i2].close - chartData[i].close) * frac;
    } else {
      interpPrice = chartData[i].close;
    }
    const highlightX = margin.left + xpct * chartW;
    const minP = minPrice;
    const maxP = maxPrice;
    const highlightY = margin.top + chartH * (1 - (interpPrice - minP) / (maxP - minP || 1));
    let nearestIndex = Math.round(idxFloat);
    nearestIndex = Math.max(0, Math.min(chartData.length - 1, nearestIndex));
    const d = rawData[nearestIndex];
    tooltipEl.querySelector('.tooltip-date').textContent = miniFormatTooltipDate(d.date);
    tooltipEl.querySelector('.tooltip-price').textContent = interpPrice.toFixed(2);
    const ttWidth = 120;
    const ttHeight = 50;
    let left = x + 10;
    if (left + ttWidth > rect2.width) left = rect2.width - ttWidth - 10;
    let top = y - ttHeight - 10;
    if (top < 0) top = y + 10;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.opacity = '1';

    // Redraw with highlight
    ctx.save();
    drawChartPoint();
    ctx.restore();

    function drawChartPoint() {
      ctx.clearRect(0, 0, width, height);
      // Re-draw price line and fill
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let j = 0; j < points.length - 1; j++) {
        const p0 = points[j - 1] || points[j];
        const p1 = points[j];
        const p2 = points[j + 1];
        const p3 = points[j + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) * smoothFactor;
        const cp1y = p1.y + (p2.y - p0.y) * smoothFactor;
        const cp2x = p2.x - (p3.x - p1.x) * smoothFactor;
        const cp2y = p2.y - (p3.y - p1.y) * smoothFactor;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Fill area
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let j = 0; j < points.length - 1; j++) {
        const p0 = points[j - 1] || points[j];
        const p1 = points[j];
        const p2 = points[j + 1];
        const p3 = points[j + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) * smoothFactor;
        const cp1y = p1.y + (p2.y - p0.y) * smoothFactor;
        const cp2x = p2.x - (p3.x - p1.x) * smoothFactor;
        const cp2y = p2.y - (p3.y - p1.y) * smoothFactor;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      ctx.lineTo(margin.left + chartW, height - margin.bottom);
      ctx.lineTo(margin.left, height - margin.bottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      // Draw indicators again
      if (activeSet.size > 0) {
        ctx.save();
        ctx.lineWidth = 1.5;
        const priceScaleMini = { min: minPrice, max: maxPrice };
        const isPriceScaled = (n) => n === 'MA' || n === 'Trendline' || n === 'BB';
        const yFor = (val, scale) => margin.top + chartH * (1 - (val - scale.min) / ((scale.max - scale.min) || 1));

        function drawSmoothLocal(seriesVals, col, min, max, scaleOverride) {
          let segment = [];
          for (let i = 0; i < seriesVals.length; i++) {
            const val = seriesVals[i];
            if (val == null) {
              if (segment.length > 1) {
                ctx.beginPath();
                ctx.moveTo(segment[0].x, segment[0].y);
                for (let j = 0; j < segment.length - 1; j++) {
                  const a = segment[j - 1] || segment[j];
                  const b = segment[j];
                  const c = segment[j + 1];
                  const d = segment[j + 2] || c;
                  const cp1x = b.x + (c.x - a.x) * smoothFactor;
                  const cp1y = b.y + (c.y - a.y) * smoothFactor;
                  const cp2x = c.x - (d.x - b.x) * smoothFactor;
                  const cp2y = c.y - (d.y - b.y) * smoothFactor;
                  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, c.x, c.y);
                }
                ctx.strokeStyle = col;
                ctx.stroke();
              }
              segment = [];
              continue;
            }
            const x = margin.left + (chartW * i) / (chartData.length - 1);
            const scale = scaleOverride || { min, max };
            const y = yFor(val, scale);
            segment.push({ x, y });
          }
          if (segment.length > 1) {
            ctx.beginPath();
            ctx.moveTo(segment[0].x, segment[0].y);
            for (let j = 0; j < segment.length - 1; j++) {
              const a = segment[j - 1] || segment[j];
              const b = segment[j];
              const c = segment[j + 1];
              const d = segment[j + 2] || c;
              const cp1x = b.x + (c.x - a.x) * smoothFactor;
              const cp1y = b.y + (c.y - a.y) * smoothFactor;
              const cp2x = c.x - (d.x - b.x) * smoothFactor;
              const cp2y = c.y - (d.y - b.y) * smoothFactor;
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, c.x, c.y);
            }
            ctx.strokeStyle = col;
            ctx.stroke();
          }
        }

        activeSet.forEach(name => {
          const data = indicatorsMini[name];
          if (!data) return;
          let col;
          switch (name) {
            case 'MA': col = '#1f77b4'; break;
            case 'RSI': col = '#9467bd'; break;
            case 'MACD': col = '#17becf'; break;
            case 'BB': col = '#9ca3af'; break;
            case 'Stoch': col = '#ff7f0e'; break;
            case 'ATR': col = '#d62728'; break;
            case 'OBV': col = '#7f7f7f'; break;
            case 'Trendline': col = '#1f2a44'; break;
            default: col = '#8c564b';
          }
          if (name === 'BB') {
            const { upper, lower, min, max } = data;
            const scale = isPriceScaled('BB') ? priceScaleMini : { min, max };
            drawSmoothLocal(upper, col, min, max, scale);
            drawSmoothLocal(lower, col, min, max, scale);
          } else if (name === 'MA') {
            const { series20, series50, min, max } = data;
            const scale = priceScaleMini;
            drawSmoothLocal(series20, '#1f77b4', min, max, scale);
            drawSmoothLocal(series50, '#2ca02c', min, max, scale);
          } else {
            const { series, min, max } = data;
            const scale = isPriceScaled(name) ? priceScaleMini : { min, max };
            drawSmoothLocal(series, col, min, max, scale);
          }
        });
        ctx.restore();
      }
      // Draw highlight circle
      ctx.beginPath();
      ctx.arc(highlightX, highlightY, 3, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
    }
  }

  function hideMiniTooltip() {
    tooltipEl.style.opacity = '0';
    renderMiniChart(canvas, rawData, activeIndicatorsArr);
  }

  canvas.addEventListener('mousemove', updateMiniTooltip);
  canvas.addEventListener('mouseleave', hideMiniTooltip);
}

// Portfolio chart functions
function drawPortfolioChart(container, portfolioPost) {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'chart-canvas';
  canvas.style.width = '100%';
  canvas.style.height = '320px';
  canvas.style.borderRadius = '12px';
  container.appendChild(canvas);
  ensurePortfolioSeries(portfolioPost);
  const rawData = (portfolioPost.series || []).map(s => ({
    date: new Date(s.t).toISOString().slice(0, 19).replace('T', ' '),
    close: s.v
  }));
  if (rawData.length < 2) {
    const info = el('div', 'tri-footnote', 'Collecting data for portfolio chart...');
    container.appendChild(info);
    return;
  }
  renderMiniChart(canvas, rawData, []);
}

function ensurePortfolioSeries(post) {
  if (!post.series) post.series = [];
  if (post.series.length === 0) {
    // Seed series at earliest buy date across items (portfolio inception)
    let ts = post.ts || Date.now();
    const items = Array.isArray(post.items) ? post.items : [];
    items.forEach(it => {
      if (it && it.buyTs && it.buyTs < ts) ts = it.buyTs;
    });
    const total = (post.items || []).reduce((sum, it) => {
      const q = it.qty != null ? it.qty : 1;
      const p = it.buyPrice != null ? it.buyPrice : 0;
      return sum + q * p;
    }, 0);
    post.series.push({ t: ts, v: total });
  }
}

async function updatePortfolioSeries(post) {
  const items = Array.isArray(post.items) ? post.items : [];
  let total = 0;
  await Promise.all(items.map(async (it) => {
    const q = it.qty != null ? it.qty : 1;
    let price = null;
    try {
      const arr = await fetchJson(`${API_BASE}/quote/${it.sym}?apikey=${API_KEY}`);
      const r = Array.isArray(arr) ? arr[0] : null;
      if (r) {
        if (r.price != null && !Number.isNaN(r.price)) price = r.price;
        else if (r.previousClose != null && !Number.isNaN(r.previousClose)) price = r.previousClose;
      }
    } catch {}
    if (price == null) price = it.buyPrice || 0;
    total += q * price;
  }));
  const now = Date.now();
  ensurePortfolioSeries(post);
  post.series.push({ t: now, v: total });
}

function renderPortfolioMiniChart(container, post) {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'mini-chart-canvas';
  container.appendChild(canvas);
  ensurePortfolioSeries(post);
  const rawData = post.series.map(s => ({
    date: new Date(s.t).toISOString().slice(0, 19).replace('T', ' '),
    close: s.v
  }));
  const activeIndicatorsArr = [];
  renderMiniChart(canvas, rawData, activeIndicatorsArr);
}

// Recompute indicator values and TRI for a post
function recomputePostMetrics(post) {
  try {
    const rawData = post.rawData || [];
    if (!rawData.length) return post;
    const closes = rawData.map(d => d.close);
    const indValues = {};
    const active = new Set(post.activeIndicators || []);
    if (active.has('BB')) {
      const bands = miniCalculateBB(closes, 20, 2);
      const up = bands.upper[bands.upper.length - 1];
      const mid = bands.middle[bands.middle.length - 1];
      const low = bands.lower[bands.lower.length - 1];
      if (up != null) indValues['BB'] = mid;
    }
    if (active.has('MA')) {
      const s20 = miniCalculateSMA(closes, 20);
      const s50 = miniCalculateSMA(closes, 50);
      const v20 = s20[s20.length - 1];
      const v50 = s50[s50.length - 1];
      if (v20 != null) indValues['MA20'] = v20;
      if (v50 != null) indValues['MA50'] = v50;
    }
    if (active.has('RSI')) {
      const s = miniCalculateRSI(closes, 14);
      const v = s[s.length - 1];
      if (v != null) indValues['RSI'] = v;
    }
    if (active.has('MACD')) {
      const s = miniCalculateMACD(closes, 12, 26);
      const v = s[s.length - 1];
      if (v != null) indValues['MACD'] = v;
    }
    if (active.has('Stoch')) {
      const s = miniCalculateStoch(rawData, 14);
      const v = s[s.length - 1];
      if (v != null) indValues['Stoch'] = v;
    }
    if (active.has('ATR')) {
      const s = miniCalculateATR(rawData, 14);
      const v = s[s.length - 1];
      if (v != null) indValues['ATR'] = v;
    }
    if (active.has('OBV')) {
      const s = miniCalculateOBV(rawData);
      const v = s[s.length - 1];
      if (v != null) indValues['OBV'] = v;
    }
    if (active.has('Trendline')) {
      const s = miniCalculateTrendline(closes);
      const v = s[s.length - 1];
      if (v != null) indValues['Trendline'] = v;
    }
    const currentPrice = rawData[rawData.length - 1].close;
    let tri = null;
    if (active.has('Trendline') && indValues['Trendline'] != null && currentPrice) {
      tri = ((currentPrice - indValues['Trendline']) / currentPrice) * 100;
    }
    post.price = currentPrice;
    post.tri = tri;
    post.indicatorValues = indValues;
    return post;
  } catch {
    return post;
  }
}
