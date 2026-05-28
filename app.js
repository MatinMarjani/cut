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

function loadFoods() {
  try { return JSON.parse(localStorage.getItem('cut_foods') || '[]'); }
  catch { return []; }
}
function saveFoods(foods) { localStorage.setItem('cut_foods', JSON.stringify(foods)); }

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
  return (meals || []).reduce((acc, m) => {
    const t = itemTotals(m);
    return { cal: acc.cal + t.cal, protein: acc.protein + t.protein };
  }, { cal: 0, protein: 0 });
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

// Macros for a food + qty (snapshots — not re-read from library later)
function calcFoodMacros(food, qty) {
  const q = parseFloat(qty) || 0;
  if (food.type === 'serving') {
    return { cal: Math.round(food.cal * q), protein: +((food.protein * q).toFixed(1)) };
  }
  const per = food.per || 100;
  return { cal: Math.round(food.cal * q / per), protein: +((food.protein * q / per).toFixed(1)) };
}

// Per-meal totals — handles both new (items[]) and legacy (flat cal/protein) formats
function itemTotals(meal) {
  if (meal.items && meal.items.length > 0) {
    return meal.items.reduce(
      (acc, it) => ({ cal: acc.cal + (it.cal || 0), protein: acc.protein + (it.protein || 0) }),
      { cal: 0, protein: 0 }
    );
  }
  return { cal: meal.cal || 0, protein: meal.protein || 0 };
}

// Auto-name for a meal if left blank
function resolveMealName(meal) {
  if (meal.name && meal.name.trim()) return meal.name.trim();
  if (meal.items && meal.items.length === 1) return meal.items[0].name || 'Meal';
  return 'Meal';
}

// Wrap a legacy flat meal as a single item for editing in the new modal
function legacyToSingleItem(meal) {
  return { name: meal.name || '', cal: meal.cal || 0, protein: meal.protein || 0 };
}

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
  document.getElementById('btn-add-meal')?.addEventListener('click', () => openMealModal(dateStr));
  document.getElementById('day-note')?.addEventListener('change', e => {
    const days = loadDays();
    const day = getOrCreateDay(dateStr, days);
    day.note = e.target.value;
    saveDay(dateStr, day);
  });
  document.querySelectorAll('.meal-edit-btn').forEach(b =>
    b.addEventListener('click', () => {
      const days = loadDays();
      const day  = getOrCreateDay(dateStr, days);
      const meal = day.meals.find(m => m.id === b.dataset.id);
      if (meal) openMealModal(dateStr, meal);
    }));
  document.querySelectorAll('.meal-expand-btn').forEach(b =>
    b.addEventListener('click', () => {
      const el = document.getElementById(`mitems-${b.dataset.id}`);
      if (el) { el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
    }));
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
  const { cal, protein } = itemTotals(m);
  const name = m.name || resolveMealName(m);
  const hasItems = m.items && m.items.length > 1;
  return `
    <div class="meal-row" id="mrow-${m.id}">
      <div class="meal-info-wrap">
        <div class="meal-name">${escHtml(name)}</div>
        <div class="meal-macros">${protein}g protein · ${cal} kcal</div>
      </div>
      <div class="meal-actions">
        ${hasItems ? `<button class="btn-icon meal-expand-btn" data-id="${m.id}" title="Details">▾</button>` : ''}
        <button class="btn-icon meal-edit-btn" data-id="${m.id}" title="Edit">✎</button>
        <button class="btn-icon danger meal-del-btn" data-id="${m.id}" title="Delete">✕</button>
      </div>
    </div>
    ${hasItems ? `
    <div class="meal-items-detail" id="mitems-${m.id}" style="display:none">
      ${m.items.map(it => `
        <div class="meal-item-row">
          <span>${escHtml(it.name || '–')}${it.qty ? ` <span class="qty-tag">${it.qty}${it.unit || 'g'}</span>` : ''}</span>
          <span class="muted">${it.protein}g · ${it.cal} kcal</span>
        </div>`).join('')}
    </div>` : ''}`;
}

function openMealModal(dateStr, existingMeal = null) {
  let mealName = existingMeal?.name || '';
  let items = existingMeal
    ? (existingMeal.items
        ? existingMeal.items.map(i => ({ ...i }))
        : [legacyToSingleItem(existingMeal)])
    : [];
  let addMode = null; // null | 'library' | 'manual'
  let selectedFood = null;
  let searchQuery = '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  function render() {
    let modal = overlay.querySelector('.modal');
    if (!modal) { modal = document.createElement('div'); modal.className = 'modal'; overlay.appendChild(modal); }

    modal.innerHTML = `
      <h2>${existingMeal ? 'Edit meal' : 'Add meal'}</h2>
      <input class="input" id="mm-name" type="text" placeholder="Name (optional)" value="${escHtml(mealName)}">

      <div class="mm-items">
        ${items.length === 0
          ? '<p class="muted" style="margin:6px 0">No items yet.</p>'
          : items.map((it, i) => `
            <div class="mm-item-row">
              <div>
                <span class="mm-item-name">${escHtml(it.name || '–')}</span>
                ${it.qty ? `<span class="qty-tag">${it.qty}${it.unit || 'g'}</span>` : ''}
                <div class="muted" style="font-size:12px">${it.protein}g protein · ${it.cal} kcal</div>
              </div>
              <button class="btn-icon danger mm-remove" data-idx="${i}">✕</button>
            </div>`).join('')}
      </div>

      ${addMode === null ? `
        <div class="mm-add-btns">
          <button class="btn-secondary" id="mm-lib">From library</button>
          <button class="btn-secondary" id="mm-manual">Enter manually</button>
        </div>` : ''}

      ${addMode === 'library' ? libraryPickerHTML() : ''}
      ${addMode === 'manual'  ? manualItemHTML()    : ''}

      <div class="form-actions" style="margin-top:14px">
        <button class="btn-secondary" id="mm-cancel">Cancel</button>
        <button class="btn-primary" id="mm-save" ${items.length === 0 ? 'disabled' : ''}>Save meal</button>
      </div>`;

    wireModal(modal);
  }

  function libraryPickerHTML() {
    const foods = loadFoods();
    const filtered = foods.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return `
      <div class="mm-section">
        <input class="input" id="mm-search" type="text" placeholder="Search foods…" value="${escHtml(searchQuery)}" autocomplete="off">
        <div class="mm-food-list">
          ${filtered.length === 0
            ? '<p class="muted">No foods. Add some in Settings → Food library.</p>'
            : filtered.map(f => `
              <div class="mm-food-row ${selectedFood?.id === f.id ? 'mm-food-selected' : ''}" data-food-id="${f.id}">
                <span>${escHtml(f.name)}</span>
                <span class="muted">${f.type === 'serving' ? 'per serving' : `per ${f.per || 100}g`}</span>
              </div>
              ${selectedFood?.id === f.id ? qtyInputHTML(f) : ''}`).join('')}
        </div>
        <button class="btn-link mm-back" style="margin-top:8px">← Back</button>
      </div>`;
  }

  function qtyInputHTML(food) {
    const unitStr = food.type === 'serving' ? 'serving(s)' : 'g';
    const defQty  = food.serving_g && food.type === 'weight' ? food.serving_g : '';
    return `
      <div class="mm-qty-form">
        <div class="qty-row">
          <input class="input" id="mm-qty" type="number" placeholder="Qty" value="${defQty}" step="any" min="0" inputmode="decimal">
          <span class="qty-unit-label">${unitStr}</span>
        </div>
        <div class="mm-preview" id="mm-preview"></div>
        <button class="btn-primary" id="mm-add-lib">Add item</button>
      </div>`;
  }

  function manualItemHTML() {
    return `
      <div class="mm-section">
        <input class="input" id="mm-m-name" type="text" placeholder="Item name (optional)">
        <div class="form-row">
          <input class="input" type="number" id="mm-m-cal"  placeholder="Calories" min="0" inputmode="decimal">
          <input class="input" type="number" id="mm-m-prot" placeholder="Protein (g)" min="0" step="0.1" inputmode="decimal">
        </div>
        <div class="form-actions">
          <button class="btn-link mm-back">← Back</button>
          <button class="btn-primary" id="mm-add-manual">Add item</button>
        </div>
      </div>`;
  }

  function wireModal(modal) {
    modal.querySelector('#mm-name')?.addEventListener('input', e => { mealName = e.target.value; });
    modal.querySelector('#mm-cancel')?.addEventListener('click', () => overlay.remove());
    modal.querySelector('#mm-save')?.addEventListener('click', saveMealFromModal);
    modal.querySelectorAll('.mm-remove').forEach(btn =>
      btn.addEventListener('click', () => { items.splice(+btn.dataset.idx, 1); render(); }));

    // Mode switches
    modal.querySelector('#mm-lib')?.addEventListener('click', () => { addMode = 'library'; render(); });
    modal.querySelector('#mm-manual')?.addEventListener('click', () => { addMode = 'manual'; render(); });
    modal.querySelectorAll('.mm-back').forEach(b => b.addEventListener('click', () => {
      addMode = null; selectedFood = null; render();
    }));

    // Library search (partial re-render to avoid closing keyboard)
    modal.querySelector('#mm-search')?.addEventListener('input', e => {
      searchQuery = e.target.value;
      const list = modal.querySelector('.mm-food-list');
      if (!list) return;
      const foods = loadFoods();
      const filtered = foods.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
      list.innerHTML = filtered.length === 0
        ? '<p class="muted">No foods. Add some in Settings → Food library.</p>'
        : filtered.map(f => `
          <div class="mm-food-row ${selectedFood?.id === f.id ? 'mm-food-selected' : ''}" data-food-id="${f.id}">
            <span>${escHtml(f.name)}</span>
            <span class="muted">${f.type === 'serving' ? 'per serving' : `per ${f.per || 100}g`}</span>
          </div>
          ${selectedFood?.id === f.id ? qtyInputHTML(f) : ''}`).join('');
      wireFoodRows(modal);
      wireQtyInput(modal);
    });

    wireFoodRows(modal);
    wireQtyInput(modal);

    // Manual add
    modal.querySelector('#mm-add-manual')?.addEventListener('click', () => {
      const name    = modal.querySelector('#mm-m-name')?.value.trim() || '';
      const cal     = parseFloat(modal.querySelector('#mm-m-cal')?.value)  || 0;
      const protein = parseFloat(modal.querySelector('#mm-m-prot')?.value) || 0;
      items.push({ name, cal, protein });
      addMode = null;
      render();
    });
  }

  function wireFoodRows(modal) {
    modal.querySelectorAll('.mm-food-row').forEach(row =>
      row.addEventListener('click', () => {
        const food = loadFoods().find(f => f.id === row.dataset.foodId);
        if (!food) return;
        selectedFood = selectedFood?.id === food.id ? null : food;
        render();
        if (selectedFood) setTimeout(() => modal.querySelector('#mm-qty')?.focus(), 50);
      }));
  }

  function wireQtyInput(modal) {
    modal.querySelector('#mm-qty')?.addEventListener('input', e => {
      const preview = modal.querySelector('#mm-preview');
      if (!preview || !selectedFood) return;
      const m = calcFoodMacros(selectedFood, e.target.value);
      preview.textContent = m.cal || m.protein ? `→ ${m.cal} kcal · ${m.protein}g protein` : '';
    });
    modal.querySelector('#mm-add-lib')?.addEventListener('click', () => {
      const qty = parseFloat(modal.querySelector('#mm-qty')?.value);
      if (!qty || !selectedFood) { alert('Enter a quantity.'); return; }
      const macros = calcFoodMacros(selectedFood, qty);
      items.push({
        name: selectedFood.name, foodId: selectedFood.id,
        qty, unit: selectedFood.type === 'serving' ? 'srv' : 'g',
        cal: macros.cal, protein: macros.protein,
      });
      selectedFood = null; addMode = null; searchQuery = '';
      render();
    });
  }

  function saveMealFromModal() {
    if (items.length === 0) return;
    const finalName = mealName.trim() || (items.length === 1 ? (items[0].name || 'Meal') : 'Meal');
    const meal = { id: existingMeal?.id || uid(), name: finalName, items, ts: existingMeal?.ts || Date.now() };
    const days = loadDays();
    const day  = getOrCreateDay(dateStr, days);
    if (existingMeal) {
      const idx = day.meals.findIndex(m => m.id === existingMeal.id);
      if (idx >= 0) day.meals[idx] = meal; else day.meals.push(meal);
    } else {
      day.meals.push(meal);
    }
    saveDay(dateStr, day);
    overlay.remove();
    renderToday();
  }

  render();
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

function foodLibraryHTML() {
  const foods = loadFoods();
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Food library</span>
        <button class="btn-add" id="btn-add-food">+ Add</button>
      </div>
      ${foods.length === 0 ? '<p class="muted">No foods yet.</p>' : foods.map(f => `
        <div class="food-row">
          <div>
            <span class="food-name">${escHtml(f.name)}</span>
            <div class="muted" style="font-size:12px">${f.type === 'serving'
              ? `${f.cal} kcal · ${f.protein}g protein per serving`
              : `${f.cal} kcal · ${f.protein}g protein per ${f.per || 100}g`}
            </div>
          </div>
          <div class="meal-actions">
            <button class="btn-icon food-edit-btn" data-id="${f.id}">✎</button>
            <button class="btn-icon danger food-del-btn" data-id="${f.id}">✕</button>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderSettings() {
  const s = loadSettings();
  const exampleGoal = (75 * s.protein_multiplier).toFixed(0);

  document.getElementById('tab-settings').innerHTML = `
    <div class="tab-header"><h1>Settings</h1></div>
    <div class="tab-body">
      ${foodLibraryHTML()}
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

  // Food library events
  document.getElementById('btn-add-food')?.addEventListener('click', () => openFoodModal());
  document.querySelectorAll('.food-edit-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const food = loadFoods().find(f => f.id === btn.dataset.id);
      if (food) openFoodModal(food);
    }));
  document.querySelectorAll('.food-del-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!confirm('Delete this food?')) return;
      const foods = loadFoods().filter(f => f.id !== btn.dataset.id);
      saveFoods(foods);
      renderSettings();
    }));
}

function openFoodModal(existingFood = null) {
  let type = existingFood?.type || 'weight';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  function render() {
    let modal = overlay.querySelector('.modal');
    if (!modal) { modal = document.createElement('div'); modal.className = 'modal'; overlay.appendChild(modal); }
    modal.innerHTML = `
      <h2>${existingFood ? 'Edit food' : 'New food'}</h2>
      <label class="form-label">Name</label>
      <input class="input" id="f-name" type="text" value="${escHtml(existingFood?.name || '')}" placeholder="e.g. Salmon">
      <label class="form-label" style="margin-top:10px">Type</label>
      <div class="toggle-group">
        <button class="toggle-btn ${type === 'weight'  ? 'active' : ''}" data-type="weight">By weight (per 100g)</button>
        <button class="toggle-btn ${type === 'serving' ? 'active' : ''}" data-type="serving">By serving</button>
      </div>
      ${foodFieldsHTML(type, existingFood)}
      <p class="muted" style="margin-top:6px">1 oz = 28g · 1 lb = 454g</p>
      <div class="form-actions" style="margin-top:12px">
        <button class="btn-secondary" id="f-cancel">Cancel</button>
        <button class="btn-primary" id="f-save">Save</button>
      </div>`;

    modal.querySelectorAll('[data-type]').forEach(btn =>
      btn.addEventListener('click', () => { type = btn.dataset.type; render(); }));
    // Live-update the "per Xg" labels as user types the reference amount
    modal.querySelector('#f-per')?.addEventListener('input', e => {
      modal.querySelectorAll('.f-per-label').forEach(el => { el.textContent = e.target.value || '?'; });
    });
    modal.querySelector('#f-cancel').addEventListener('click', () => overlay.remove());
    modal.querySelector('#f-save').addEventListener('click', () => {
      const name    = modal.querySelector('#f-name').value.trim();
      const cal     = parseFloat(modal.querySelector('#f-cal').value)     || 0;
      const protein = parseFloat(modal.querySelector('#f-protein').value) || 0;
      const per       = type === 'weight' ? (parseFloat(modal.querySelector('#f-per')?.value)     || 100) : null;
      const serving_g = type === 'weight' ? (parseFloat(modal.querySelector('#f-serving')?.value) || null) : null;
      if (!name) { alert('Name is required.'); return; }
      const food = { id: existingFood?.id || uid(), name, type, cal, protein };
      if (per && per !== 100) food.per = per;
      if (serving_g) food.serving_g = serving_g;
      const foods = loadFoods();
      if (existingFood) {
        const idx = foods.findIndex(f => f.id === existingFood.id);
        if (idx >= 0) foods[idx] = food; else foods.push(food);
      } else {
        foods.push(food);
      }
      saveFoods(foods);
      overlay.remove();
      renderSettings();
    });
  }
  render();
}

function foodFieldsHTML(type, food) {
  if (type === 'serving') return `
    <div class="form-row" style="margin-top:10px">
      <div style="flex:1">
        <label class="form-label">Cal / serving</label>
        <input class="input" type="number" id="f-cal" value="${food?.cal || ''}" placeholder="180" inputmode="decimal">
      </div>
      <div style="flex:1">
        <label class="form-label">Protein / serving (g)</label>
        <input class="input" type="number" id="f-protein" value="${food?.protein || ''}" placeholder="21" step="0.1" inputmode="decimal">
      </div>
    </div>`;
  const per = food?.per || 100;
  return `
    <label class="form-label" style="margin-top:10px">Reference amount (g) — whatever the nutrition label uses</label>
    <input class="input" type="number" id="f-per" value="${per}" placeholder="100" min="1" inputmode="decimal">
    <div class="form-row" style="margin-top:8px">
      <div style="flex:1">
        <label class="form-label">Calories per <span class="f-per-label">${per}</span>g</label>
        <input class="input" type="number" id="f-cal" value="${food?.cal || ''}" placeholder="208" inputmode="decimal">
      </div>
      <div style="flex:1">
        <label class="form-label">Protein per <span class="f-per-label">${per}</span>g</label>
        <input class="input" type="number" id="f-protein" value="${food?.protein || ''}" placeholder="20" step="0.1" inputmode="decimal">
      </div>
    </div>
    <label class="form-label" style="margin-top:10px">Default serving size (g) — optional quick-fill</label>
    <input class="input" type="number" id="f-serving" value="${food?.serving_g || ''}" placeholder="e.g. 150" inputmode="decimal">`;
}

function exportJSON() {
  const data = { days: loadDays(), settings: loadSettings(), foods: loadFoods(), exported: new Date().toISOString() };
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
      if (data.foods) saveFoods(data.foods);
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
