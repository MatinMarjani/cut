# Cut

A personal nutrition tracker built as a PWA (Progressive Web App). Runs on Android and iOS, installs to the home screen, works offline. No backend — all data lives on your device.

## Goal

Eat below your BMR. Log meals, track your deficit, watch your weight trend down.

## Features

### Daily logging
- **Day navigation** — tap ‹ › in the Today tab to log meals for past days (e.g. adding dinner after midnight)
- **Meals with ingredients** — a meal can have multiple items; each item is either picked from your food library or entered manually
- **Food library** — define foods once with their macro profile (per 100g or per serving); the app calculates calories and protein when you enter the weight or quantity
- **Daily metrics** — weight, BMR, body fat %; if you skip the scale, the last recorded values carry forward automatically
- **Daily note** — one line of context per day (skipped gym, ate out, etc.)

### Progress and status
- **Progress bars** — calories eaten vs BMR, protein vs goal; shows headroom or overage
- **Protein goal** — bodyweight × a configurable multiplier (g/kg), set in Settings
- **Day status** — three states you can set manually:
  - *Auto* — calculated from your logged meals (green ✓ if under BMR, red ✕ if over)
  - *Skip* — untracked day, excluded from streak and adherence stats
  - *Cheat* — known bad day, breaks streak; no meal entry required

### History and trends
- **History** — tap any past day to see its meals (with per-ingredient breakdown), metrics, and note
- **Trends** — weight chart, daily calories vs BMR chart, deficit streak, adherence rate, and a breakdown of deficit / over-BMR / cheat / skipped days

### Data
- **Export JSON** — full backup including days, settings, and food library
- **Import JSON** — restore from a backup (merges all data)
- **Export CSV** — one row per meal item, for analysis in Excel or Google Sheets
- **Unit toggle** — kg or lbs, converted on display and input; food quantities always in grams

---

## Install on your phone

### Android
1. Open the app URL in Chrome
2. Tap the install banner or Chrome menu → **"Add to Home Screen"**
3. Done — launches as a standalone app, works offline

### iOS
1. Open the app URL in Safari
2. Tap the Share button → **"Add to Home Screen"**
3. Done

> **iOS note:** Safari may clear app data if the app is unused for 7 days. Export a JSON backup regularly.

---

## Data storage

All data lives in `localStorage` on the device. Nothing is sent to any server.

| Key | Contents |
|-----|----------|
| `cut_days` | All logged days — meals (with items), metrics, notes, day status |
| `cut_settings` | Protein multiplier, weight unit preference |
| `cut_foods` | Food library entries |

### Meal data format

Meals support two formats, both handled transparently:

- **New format** — a meal has an `items` array; each item stores a snapshot of cal/protein at the time of logging, so editing a food in the library never changes past records
- **Legacy format** — flat `cal` + `protein` fields; renders and edits correctly without any migration

### Backup and restore

**Settings → Export JSON** downloads a timestamped backup file containing all three storage keys. **Import JSON** restores everything. Store the file in cloud storage or email it to yourself — this is the only way to move data between devices.

### Updating the app

Push new code to GitHub → Pages redeploys automatically → the service worker on your phone picks up the update next time the app is open with internet. Bump the cache version in `sw.js` (`cut-v4` → `cut-v5`) with each push so the phone discards the old cache.

Your data is never affected by app updates.

---

## Develop locally

No build tools or dependencies — just a static server (service workers require HTTPS or localhost).

**VS Code** — install [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer), right-click `index.html` → "Open with Live Server".

**Python:**
```bash
python -m http.server 8080
```

**Node:**
```bash
npx serve .
```

## Generate icons

Open `create-icons.html` in any browser, download both PNGs, place them in `icons/`.

---

## Stack

Plain HTML, CSS, and JavaScript — no framework, no build step, no dependencies.

| File | Purpose |
|------|---------|
| `index.html` | App shell — four tabs, bottom nav |
| `app.js` | All logic — storage, rendering, modals, export |
| `style.css` | Dark-theme mobile-first styles |
| `manifest.json` | PWA metadata — name, icons, display mode |
| `sw.js` | Service worker — cache-first offline strategy |
| `create-icons.html` | Generates 192×512 PNG icons via canvas |
