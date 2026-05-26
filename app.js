// ── STORAGE ──────────────────────────────────────────────────────────────────

function loadDays() {
  try { return JSON.parse(localStorage.getItem('cut_days') || '{}'); }
  catch { return {}; }
}

function saveDays(days) {
  localStorage.setItem('cut_days', JSON.stringify(days));
}

function saveDay(dateStr, day) {
  const days = loadDays();
  days[dateStr] = day;
  saveDays(days);
}

function loadSettings() {
  const defaults = { protein_multiplier: 2.0, unit: 'kg' };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('cut_settings') || '{}') }; }
  catch { return defaults; }
}

function saveSettings(s) {
  localStorage.setItem('cut_settings', JSON.stringify(s));
}

// ── DATE UTILS ────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ── DATA LOGIC ────────────────────────────────────────────────────────────────

function getOrCreateDay(dateStr, days) {
  return days[dateStr] || { metrics: null, meals: [], note: '' };
}

// Walk backward from dateStr to find the most recent recorded metrics.
// Returns { metrics, from } or null.
function resolveMetrics(dateStr, days) {
  const keys = Object.keys(days).sort().reverse();
  for (const k of keys) {
    if (k <= dateStr && days[k] && days[k].metrics) {
      return { metrics: days[k].metrics, from: k };
    }
  }
  return null;
}

function mealTotals(meals) {
  return (meals || []).reduce(
    (acc, m) => ({ cal: acc.cal + (m.cal || 0), protein: acc.protein + (m.protein || 0) }),
    { cal: 0, protein: 0 }
  );
}

// Unit helpers
function kgToDisplay(kg, unit) {
  return unit === 'lbs' ? +(kg * 2.20462).toFixed(1) : +kg.toFixed(1);
}
function inputToKg(val, unit) {
  const v = parseFloat(val);
  return unit === 'lbs' ? v / 2.20462 : v;
}
function unitLabel(unit) { return unit === 'lbs' ? 'lbs' : 'kg'; }

// Full computed status for a given day
function dayStatus(dateStr) {
  const days = loadDays();
  const settings = loadSettings();
  const day = getOrCreateDay(dateStr, days);
  const resolved = day.metrics ? { metrics: day.metrics, from: dateStr } : resolveMetrics(dateStr, days);
  const metrics = resolved?.metrics || null;
  const inherited = !!(resolved && resolved.from !== dateStr);
  const totals = mealTotals(day.meals);
  const proteinGoal = metrics ? metrics.weight_kg * settings.protein_multiplier : null;
  const calRem = metrics !== null ? metrics.bmr - totals.cal : null;
  const protRem = proteinGoal !== null ? proteinGoal - totals.protein : null;
  const status = day.status || 'auto'; // 'auto' | 'skip' | 'cheat'
  const hasMeals = (day.meals || []).length > 0;

  // dayType drives streak, history badges, and trends
  // 'deficit' | 'over' | 'cheat' | 'skip'
  let dayType;
  if (status === 'cheat') {
    dayType = 'cheat';
  } else if (status === 'skip') {
    dayType = 'skip';
  } else if (!hasMeals) {
    dayType = 'skip'; // no meals logged = no data, treat as neutral
  } else if (calRem !== null && calRem >= 0) {
    dayType = 'deficit';
  } else if (calRem !== null) {
    dayType = 'over';
  } else {
    dayType = 'skip';
  }

  return {
    day,
    metrics,
    inherited,
    inheritedFrom: resolved?.from || null,
    totals,
    proteinGoal,
    calRem,
    protRem,
    status,
    dayType,
    inDeficit: dayType === 'deficit',
  };
}

// ── RENDERING HELPERS ─────────────────────────────────────────────────────────

function progressBar(value, max, dangerOver = false) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const cls = dangerOver && value > max ? 'over' : '';
  return `<div class="progress-track"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>`;
}

function mealFormHTML(meal) {
  return `
    <div class="meal-form">
      <input class="input" type="text" placeholder="Meal name" value="${meal?.name || ''}" data-field="name">
      <div class="form-row">
        <input class="input" type="number" placeholder="Calories" value="${meal?.cal || ''}" data-field="cal" min="0" inputmode="decimal">
        <input class="input" type="number" placeholder="Protein (g)" value="${meal?.protein || ''}" data-field="protein" min="0" step="0.1" inputmode="decimal">
      </div>
      <div class="form-actions">
        <button class="btn-secondary meal-cancel">Cancel</button>
        <button class="btn-primary meal-save">Save</button>
      </div>
    </div>`;
}

// ── TODAY TAB ─────────────────────────────────────────────────────────────────

function renderToday() {
  const dateStr = selectedDate;
  const { day, metrics, inherited, inheritedFrom, totals, proteinGoal, calRem, protRem, inDeficit, dayType, status } = dayStatus(dateStr);
  const settings = loadSettings();

  // Metrics card
  let metricsCard;
  if (metrics) {
    const wDisplay = `${kgToDisplay(metrics.weight_kg, settings.unit)} ${unitLabel(settings.unit)}`;
    metricsCard = `
      <div class="card">
        <div class="card-title">Body metrics</div>
        <div class="metrics-row">
          <div class="metric-item">
            <span class="metric-label">Weight</span>
            <span class="metric-value">${wDisplay}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">BMR</span>
            <span class="metric-value">${metrics.bmr}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Body fat</span>
            <span class="metric-value">${metrics.bf_pct}%</span>
          </div>
        </div>
        ${inherited ? `<p class="inherited-note">From ${formatDate(inheritedFrom)} — not measured today</p>` : ''}
        <button class="btn-link" id="btn-metrics">Edit today's metrics</button>
      </div>`;
  } else {
    metricsCard = `
      <div class="card card-empty">
        <p class="muted">No metrics recorded yet</p>
        <button class="btn-primary" id="btn-metrics">Add metrics</button>
      </div>`;
  }

  // Progress card
  let progressCard = '';
  if (metrics) {
    const calPct = Math.min((totals.cal / metrics.bmr) * 100, 100);
    const protPct = proteinGoal ? Math.min((totals.protein / proteinGoal) * 100, 100) : 0;
    const calOver = totals.cal > metrics.bmr;
    const protDone = totals.protein >= proteinGoal;
    const statusText = inDeficit
      ? `In deficit — ${calRem} kcal headroom`
      : `Over BMR — ${Math.abs(calRem)} kcal over`;

    progressCard = `
      <div class="card">
        <div class="progress-section">
          <div class="progress-header">
            <span>Calories</span>
            <span>${totals.cal} / ${metrics.bmr} kcal</span>
          </div>
          ${progressBar(totals.cal, metrics.bmr, true)}
          <div class="progress-remaining ${calOver ? 'over' : ''}">
            ${calOver ? `${Math.abs(calRem)} kcal over BMR` : `${calRem} kcal remaining`}
          </div>
        </div>
        <div class="progress-section">
          <div class="progress-header">
            <span>Protein</span>
            <span>${totals.protein.toFixed(1)} / ${proteinGoal.toFixed(0)} g</span>
          </div>
          ${progressBar(totals.protein, proteinGoal)}
          <div class="progress-remaining ${protDone ? 'done' : ''}">
            ${protDone ? `Goal hit! ${Math.abs(protRem).toFixed(1)}g over` : `${protRem.toFixed(1)}g still needed`}
          </div>
        </div>
        <div class="status-badge ${inDeficit ? 'status-good' : 'status-bad'}">${statusText}</div>
      </div>`;
  }

  // Override progress card when status is manually set
  if (status === 'cheat') {
    progressCard = `
      <div class="card">
        <div class="status-badge status-cheat">✕ Cheat day — marked as lost</div>
      </div>`;
  } else if (status === 'skip') {
    progressCard = `
      <div class="card">
        <div class="status-badge status-skip">— Skipped / untracked</div>
      </div>`;
  }

  // Day status toggle — always visible
  const statusToggle = `
    <div class="card">
      <div class="card-title">Day status</div>
      <div class="toggle-group">
        <button class="toggle-btn ${status === 'auto'  ? 'active' : ''}" data-status="auto">Auto</button>
        <button class="toggle-btn ${status === 'skip'  ? 'active' : ''}" data-status="skip">— Skip</button>
        <button class="toggle-btn ${status === 'cheat' ? 'active cheat' : ''}" data-status="cheat">✕ Cheat</button>
      </div>
      <p class="muted" style="margin-top:8px">${
        status === 'skip'  ? 'Day excluded from streak and adherence.' :
        status === 'cheat' ? 'Marked as lost. Breaks streak.' :
                             'Status calculated from your meals.'
      }</p>
    </div>`;

  // Meals card
  const meals = day.meals || [];
  const mealsCard = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Meals</span>
        <button class="btn-add" id="btn-add-meal">+ Add</button>
      </div>
      <div id="add-meal-form"></div>
      <div id="meals-list">
        ${meals.length === 0 ? '<p class="muted">No meals logged yet.</p>' : meals.map(mealRowHTML).join('')}
      </div>
    </div>`;

  // Note card
  const noteCard = `
    <div class="card">
      <div class="card-title">Daily note</div>
      <textarea class="input note-input" id="day-note" placeholder="Reflection, context, anything...">${day.note || ''}</textarea>
    </div>`;

  const isToday = dateStr === todayStr();
  const dateLabel = isToday ? 'Today' : formatDate(dateStr);

  document.getElementById('tab-today').innerHTML = `
    <div class="tab-header">
      <h1>Cut</h1>
      <div class="date-nav">
        <button class="btn-icon" id="btn-prev-day">‹</button>
        <span class="tab-sub">${dateLabel}</span>
        <button class="btn-icon" id="btn-next-day" ${isToday ? 'disabled' : ''}>›</button>
      </div>
    </div>
    <div class="tab-body">
      ${metricsCard}
      ${progressCard}
      ${mealsCard}
      ${statusToggle}
      ${noteCard}
    </div>`;

  // Events
  document.getElementById('btn-prev-day').addEventListener('click', () => {
    selectedDate = addDays(selectedDate, -1);
    renderToday();
  });
  document.getElementById('btn-next-day').addEventListener('click', () => {
    if (selectedDate < todayStr()) { selectedDate = addDays(selectedDate, 1); renderToday(); }
  });
  document.getElementById('btn-metrics')?.addEventListener('click', openMetricsModal);
  document.getElementById('btn-add-meal')?.addEventListener('click', toggleAddMealForm);
  document.getElementById('day-note')?.addEventListener('change', e => {
    const days = loadDays();
    const day = getOrCreateDay(dateStr, days);
    day.note = e.target.value;
    saveDay(dateStr, day);
  });
  document.querySelectorAll('.meal-edit-btn').forEach(b =>
    b.addEventListener('click', () => toggleInlineEdit(b.dataset.id)));
  document.querySelectorAll('.meal-del-btn').forEach(b =>
    b.addEventListener('click', () => deleteMeal(b.dataset.id)));
  document.querySelectorAll('[data-status]').forEach(btn =>
    btn.addEventListener('click', () => {
      const days = loadDays();
      const day = getOrCreateDay(dateStr, days);
      day.status = btn.dataset.status;
      saveDay(dateStr, day);
      renderToday();
    }));
}

function mealRowHTML(m) {
  return `
    <div class="meal-row" id="mrow-${m.id}">
      <div>
        <div class="meal-name">${escHtml(m.name || 'Unnamed')}</div>
        <div class="meal-macros">${m.protein}g protein · ${m.cal} kcal</div>
      </div>
      <div class="meal-actions">
        <button class="btn-icon meal-edit-btn" data-id="${m.id}" title="Edit">✎</button>
        <button class="btn-icon danger meal-del-btn" data-id="${m.id}" title="Delete">✕</button>
      </div>
    </div>
    <div class="inline-edit-form" id="iedit-${m.id}" style="display:none"></div>`;
}

function toggleAddMealForm() {
  const c = document.getElementById('add-meal-form');
  if (c.innerHTML) { c.innerHTML = ''; return; }
  c.innerHTML = mealFormHTML(null);
  c.querySelector('.meal-save').addEventListener('click', () => saveMeal(null, c));
  c.querySelector('.meal-cancel').addEventListener('click', () => { c.innerHTML = ''; });
}

function toggleInlineEdit(id) {
  const container = document.getElementById(`iedit-${id}`);
  if (!container) return;
  if (container.style.display !== 'none' && container.innerHTML) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  // Close any other open inline edits
  document.querySelectorAll('[id^="iedit-"]').forEach(el => {
    el.style.display = 'none';
    el.innerHTML = '';
  });

  const days = loadDays();
  const day = getOrCreateDay(todayStr(), days);
  const meal = day.meals.find(m => m.id === id);
  if (!meal) return;

  container.innerHTML = mealFormHTML(meal);
  container.style.display = 'block';
  container.querySelector('.meal-save').addEventListener('click', () => saveMeal(id, container));
  container.querySelector('.meal-cancel').addEventListener('click', () => {
    container.style.display = 'none';
    container.innerHTML = '';
  });
}

function saveMeal(id, container) {
  const name = container.querySelector('[data-field="name"]').value.trim() || 'Unnamed';
  const cal = parseFloat(container.querySelector('[data-field="cal"]').value) || 0;
  const protein = parseFloat(container.querySelector('[data-field="protein"]').value) || 0;

  const dateStr = selectedDate;
  const days = loadDays();
  const day = getOrCreateDay(dateStr, days);

  if (id) {
    const i = day.meals.findIndex(m => m.id === id);
    if (i >= 0) day.meals[i] = { ...day.meals[i], name, cal, protein };
  } else {
    day.meals.push({ id: uid(), name, cal, protein, ts: Date.now() });
  }

  saveDay(dateStr, day);
  renderToday();
}

function deleteMeal(id) {
  const dateStr = selectedDate;
  const days = loadDays();
  const day = getOrCreateDay(dateStr, days);
  day.meals = day.meals.filter(m => m.id !== id);
  saveDay(dateStr, day);
  renderToday();
}

function openMetricsModal() {
  const dateStr = selectedDate;
  const { metrics } = dayStatus(dateStr);
  const settings = loadSettings();
  const unit = unitLabel(settings.unit);
  const wVal = metrics ? kgToDisplay(metrics.weight_kg, settings.unit) : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Today's metrics</h2>
      <div>
        <label class="form-label">Weight (${unit})</label>
        <input class="input" type="number" id="m-weight" value="${wVal}" placeholder="e.g. 75.5" step="0.1" inputmode="decimal">
      </div>
      <div>
        <label class="form-label">BMR (kcal)</label>
        <input class="input" type="number" id="m-bmr" value="${metrics?.bmr || ''}" placeholder="e.g. 1820" inputmode="decimal">
      </div>
      <div>
        <label class="form-label">Body fat %</label>
        <input class="input" type="number" id="m-bf" value="${metrics?.bf_pct || ''}" placeholder="e.g. 18.5" step="0.1" inputmode="decimal">
      </div>
      <div class="form-actions">
        <button class="btn-secondary" id="m-cancel">Cancel</button>
        <button class="btn-primary" id="m-save">Save</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('m-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('m-save').addEventListener('click', () => {
    const weight_kg = inputToKg(document.getElementById('m-weight').value, settings.unit);
    const bmr = parseInt(document.getElementById('m-bmr').value, 10);
    const bf_pct = parseFloat(document.getElementById('m-bf').value) || 0;
    if (!weight_kg || !bmr) { alert('Weight and BMR are required.'); return; }
    const days = loadDays();
    const day = getOrCreateDay(dateStr, days);
    day.metrics = { weight_kg, bmr, bf_pct };
    saveDay(dateStr, day);
    overlay.remove();
    renderToday();
  });
}

// ── HISTORY TAB ───────────────────────────────────────────────────────────────

function renderHistory() {
  const days = loadDays();
  const settings = loadSettings();
  const keys = Object.keys(days).sort().reverse();

  if (keys.length === 0) {
    document.getElementById('tab-history').innerHTML =
      '<div class="empty-state">No history yet. Start logging today!</div>';
    return;
  }

  const rows = keys.map(dateStr => {
    const { day, metrics, totals, dayType, inherited } = dayStatus(dateStr);
    const statusIcon = { deficit: '✓', over: '✕', cheat: '✕', skip: '—' }[dayType] ?? '—';
    const statusCls  = { deficit: 'good', over: 'bad', cheat: 'cheat', skip: '' }[dayType] ?? '';
    const statusLabel = dayType === 'cheat' ? ' Cheat' : '';
    const wText = metrics ? `${kgToDisplay(metrics.weight_kg, settings.unit)} ${unitLabel(settings.unit)}` : '–';

    return `
      <div class="history-item">
        <div class="history-header" data-date="${dateStr}">
          <span class="history-date">${formatDate(dateStr)}${inherited ? '<span class="inherited-badge">inherited</span>' : ''}</span>
          <div class="history-summary">
            <span>${totals.cal} kcal</span>
            <span>${totals.protein.toFixed(0)}g</span>
            <span class="h-status ${statusCls}">${statusIcon}${statusLabel}</span>
          </div>
        </div>
        <div class="history-detail" id="hd-${dateStr}" style="display:none">
          ${metrics ? `<div class="metrics-mini">${wText} · BMR ${metrics.bmr} kcal · BF ${metrics.bf_pct}%</div>` : ''}
          ${(day.meals || []).length > 0
            ? `<div>${day.meals.map(m => `
                <div class="h-meal-row">
                  <span>${escHtml(m.name || 'Unnamed')}</span>
                  <span>${m.protein}g · ${m.cal} kcal</span>
                </div>`).join('')}</div>`
            : '<p class="muted">No meals logged.</p>'}
          ${day.note ? `<p class="h-note">"${escHtml(day.note)}"</p>` : ''}
        </div>
      </div>`;
  }).join('');

  document.getElementById('tab-history').innerHTML = `
    <div class="tab-header"><h1>History</h1></div>
    <div class="tab-body" style="padding:0 12px">${rows}</div>`;

  document.querySelectorAll('.history-header').forEach(h => {
    h.addEventListener('click', () => {
      const detail = document.getElementById(`hd-${h.dataset.date}`);
      detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
  });
}

// ── TRENDS TAB ────────────────────────────────────────────────────────────────

function renderTrends() {
  const days = loadDays();
  const settings = loadSettings();
  const allKeys = Object.keys(days).sort();

  if (allKeys.length < 2) {
    document.getElementById('tab-trends').innerHTML =
      '<div class="empty-state">Log at least 2 days to see trends.</div>';
    return;
  }

  // Resolve status for each day (uses inherited metrics)
  const statuses = allKeys.map(d => ({ dateStr: d, ...dayStatus(d) }));
  const recent = statuses.slice(-30);

  // Stats — skip days excluded from counted days
  const counted   = recent.filter(d => d.dayType !== 'skip');
  const deficitCount = counted.filter(d => d.dayType === 'deficit').length;
  const overCount    = counted.filter(d => d.dayType === 'over').length;
  const cheatCount   = counted.filter(d => d.dayType === 'cheat').length;
  const adherencePct = counted.length > 0 ? Math.round((deficitCount / counted.length) * 100) : 0;
  const avgCal = counted.length > 0
    ? Math.round(counted.reduce((s, d) => s + d.totals.cal, 0) / counted.length)
    : 0;
  const avgBMR = Math.round(recent.filter(d => d.metrics).reduce((s, d) => s + d.metrics.bmr, 0) /
    (recent.filter(d => d.metrics).length || 1));

  // Deficit streak — skip days are transparent (don't break or extend)
  let streak = 0;
  for (let i = statuses.length - 1; i >= 0; i--) {
    const t = statuses[i].dayType;
    if (t === 'skip') continue;       // neutral — look further back
    if (t === 'deficit') { streak++; continue; }
    break;                            // 'over' or 'cheat' — streak ends
  }

  // Weight chart — only days with actual (non-inherited) measurements
  const weightPoints = allKeys
    .filter(d => days[d]?.metrics?.weight_kg)
    .slice(-30)
    .map(d => ({ dateStr: d, v: days[d].metrics.weight_kg }));

  // Calories chart
  const calPoints = recent.map(d => ({ dateStr: d.dateStr, v: d.totals.cal }));
  const bmrPoints = recent.map(d => ({ dateStr: d.dateStr, v: d.metrics?.bmr || null }));

  const unit = unitLabel(settings.unit);

  document.getElementById('tab-trends').innerHTML = `
    <div class="tab-header"><h1>Trends</h1></div>
    <div class="tab-body">
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-value ${adherencePct >= 70 ? 'good' : 'bad'}">${adherencePct}%</span>
          <span class="stat-label">deficit rate (${counted.length} tracked days)</span>
        </div>
        <div class="stat-card">
          <span class="stat-value ${streak > 0 ? 'good' : ''}">${streak}</span>
          <span class="stat-label">deficit streak</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${avgCal}</span>
          <span class="stat-label">avg kcal/day</span>
        </div>
        <div class="stat-card">
          <span class="stat-value ${avgCal <= avgBMR ? 'good' : 'bad'}">${avgBMR > 0 ? (avgCal <= avgBMR ? '-' : '+') + Math.abs(avgBMR - avgCal) : '–'}</span>
          <span class="stat-label">avg daily delta kcal</span>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-value good">${deficitCount}</span>
          <span class="stat-label">deficit days</span>
        </div>
        <div class="stat-card">
          <span class="stat-value bad">${overCount}</span>
          <span class="stat-label">over BMR days</span>
        </div>
        <div class="stat-card">
          <span class="stat-value cheat">${cheatCount}</span>
          <span class="stat-label">cheat days</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${recent.length - counted.length}</span>
          <span class="stat-label">skipped days</span>
        </div>
      </div>

      ${weightPoints.length >= 2 ? `
        <div class="card">
          <div class="card-title">Weight (${unit})</div>
          ${svgLine(weightPoints.map(p => ({ v: kgToDisplay(p.v, settings.unit), dateStr: p.dateStr })))}
          <div class="chart-labels">
            <span>${formatDate(weightPoints[0].dateStr)}</span>
            <span>${formatDate(weightPoints[weightPoints.length-1].dateStr)}</span>
          </div>
        </div>` : ''}

      <div class="card">
        <div class="card-title">Daily calories vs BMR</div>
        ${svgLine(calPoints, bmrPoints)}
        <div class="chart-labels">
          <span>${formatDate(recent[0].dateStr)}</span>
          <span>${formatDate(recent[recent.length-1].dateStr)}</span>
        </div>
      </div>
    </div>`;
}

function svgLine(points, refPoints = null) {
  if (points.length < 2) return '';
  const W = 300, H = 90, P = 12;
  const vals = points.map(p => p.v);
  const allVals = refPoints
    ? [...vals, ...refPoints.map(p => p.v).filter(v => v !== null)]
    : vals;
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const cx = i => P + (i / (points.length - 1)) * (W - 2 * P);
  const cy = v => H - P - ((v - min) / range) * (H - 2 * P);

  const poly = points.map((p, i) => `${cx(i)},${cy(p.v)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${cx(i)}" cy="${cy(p.v)}" r="3" fill="#4ade80"/>`).join('');

  let refLine = '';
  if (refPoints) {
    const validRef = refPoints.filter(p => p.v !== null);
    if (validRef.length > 0) {
      const avgRef = validRef.reduce((s, p) => s + p.v, 0) / validRef.length;
      const ry = cy(avgRef);
      refLine = `<line x1="${P}" y1="${ry}" x2="${W - P}" y2="${ry}" stroke="#555" stroke-dasharray="5,3" stroke-width="1.5"/>`;
    }
  }

  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">
    ${refLine}
    <polyline points="${poly}" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

// ── SETTINGS TAB ──────────────────────────────────────────────────────────────

function renderSettings() {
  const s = loadSettings();
  const exampleGoal = (75 * s.protein_multiplier).toFixed(0);

  document.getElementById('tab-settings').innerHTML = `
    <div class="tab-header"><h1>Settings</h1></div>
    <div class="tab-body">
      <div class="card">
        <div class="card-title">Protein goal</div>
        <label class="form-label">Multiplier (g per kg bodyweight)</label>
        <input class="input" type="number" id="s-mult" value="${s.protein_multiplier}" step="0.1" min="0.5" max="5" inputmode="decimal">
        <p class="muted" style="margin-top:8px">e.g. 75 kg × ${s.protein_multiplier} = ${exampleGoal}g/day</p>
      </div>

      <div class="card">
        <div class="card-title">Weight unit</div>
        <div class="toggle-group">
          <button class="toggle-btn ${s.unit === 'kg' ? 'active' : ''}" data-unit="kg">kg</button>
          <button class="toggle-btn ${s.unit === 'lbs' ? 'active' : ''}" data-unit="lbs">lbs</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Data</div>
        <div class="data-actions">
          <button class="btn-secondary" id="btn-export-json">Export JSON (backup)</button>
          <button class="btn-secondary" id="btn-export-csv">Export CSV (spreadsheet)</button>
          <button class="btn-secondary" id="btn-import-json">Import JSON (restore)</button>
        </div>
        <p class="muted">Export regularly — data lives only in this browser.</p>
        <input type="file" id="import-file" accept=".json" style="display:none">
      </div>

      <div class="card danger-zone">
        <div class="card-title">Danger zone</div>
        <button class="btn-secondary" id="btn-clear-all">Clear all data</button>
      </div>
    </div>`;

  document.getElementById('s-mult').addEventListener('change', e => {
    const s = loadSettings();
    s.protein_multiplier = parseFloat(e.target.value) || 2.0;
    saveSettings(s);
    renderSettings();
  });

  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = loadSettings();
      s.unit = btn.dataset.unit;
      saveSettings(s);
      renderSettings();
    });
  });

  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-import-json').addEventListener('click', () =>
    document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', importJSON);
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('Delete ALL data? This cannot be undone.')) {
      localStorage.removeItem('cut_days');
      alert('Data cleared.');
      navigate('today');
    }
  });
}

function exportJSON() {
  const data = { days: loadDays(), settings: loadSettings(), exported: new Date().toISOString() };
  download(`cut_backup_${todayStr()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

function exportCSV() {
  const days = loadDays();
  const keys = Object.keys(days).sort();
  const rows = ['Date,Meal,Calories,Protein_g,Weight_kg,BMR,BF_pct,Note'];
  for (const dateStr of keys) {
    const { day, metrics } = dayStatus(dateStr);
    const meals = day.meals || [];
    if (meals.length === 0) {
      rows.push(`${dateStr},,,, ${metrics?.weight_kg || ''},${metrics?.bmr || ''},${metrics?.bf_pct || ''},"${day.note || ''}"`);
    } else {
      meals.forEach((m, i) => {
        const first = i === 0;
        rows.push([
          dateStr,
          `"${(m.name || '').replace(/"/g, '""')}"`,
          m.cal,
          m.protein,
          first ? (metrics?.weight_kg || '') : '',
          first ? (metrics?.bmr || '') : '',
          first ? (metrics?.bf_pct || '') : '',
          first ? `"${(day.note || '').replace(/"/g, '""')}"` : '',
        ].join(','));
      });
    }
  }
  download(`cut_export_${todayStr()}.csv`, rows.join('\n'), 'text/csv');
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.days) saveDays(data.days);
      if (data.settings) saveSettings(data.settings);
      alert('Import successful!');
      navigate(currentTab);
    } catch { alert('Invalid backup file.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function download(filename, content, type) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────

let currentTab = 'today';
let selectedDate = todayStr();

function navigate(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add('active');

  if (tab === 'today')    { selectedDate = todayStr(); renderToday(); }
  if (tab === 'history')  renderHistory();
  if (tab === 'trends')   renderTrends();
  if (tab === 'settings') renderSettings();
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── INIT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.tab)));

  navigate('today');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
