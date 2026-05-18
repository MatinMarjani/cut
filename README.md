# Cut

A personal nutrition tracker built as a PWA (Progressive Web App). Runs on Android and iOS, installs to the home screen, works offline. No backend — all data lives on your device.

## Goal

Eat below your BMR. Log meals, track your deficit, watch your weight trend down.

## Features

- **Log meals** — name, calories, protein per meal; editable at any time
- **Daily metrics** — weight, BMR, body fat %; inherited from the last recorded day if you skip the scale
- **Progress bars** — calories vs BMR, protein vs goal; shows remaining or overage
- **Deficit status** — clear indicator if you're under or over BMR for the day
- **Protein goal** — based on bodyweight × a configurable multiplier (g/kg)
- **History** — tap any past day to see its meals, metrics, and note
- **Trends** — weight over time, daily calories vs BMR, deficit streak, adherence %
- **Daily note** — one-line reflection per day
- **Export / Import** — JSON backup and CSV export for spreadsheets
- **Unit toggle** — kg or lbs, converted on display and input
- **Offline** — works with no internet after first load

## Install on your phone

### Android
1. Open the app URL in Chrome
2. Tap the banner or Chrome menu → **"Add to Home Screen"**
3. Done — launches like a native app

### iOS
1. Open the app URL in Safari
2. Tap the Share button → **"Add to Home Screen"**
3. Done

> **iOS note:** Safari may clear app data if the app is unused for 7 days. Export a backup regularly.

## Develop locally

No build tools or dependencies. Just a static server to satisfy service worker requirements.

**VS Code** — install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension, right-click `index.html` → "Open with Live Server".

**Python:**
```bash
python -m http.server 8080
# open http://localhost:8080
```

**Node:**
```bash
npx serve .
```

## Generate icons

Open `create-icons.html` in any browser, download both PNGs, place them in `icons/`.

## Data

All data is stored in `localStorage` on the device — nothing is sent anywhere.

| Key | Contents |
|-----|----------|
| `cut_days` | All logged days (meals, metrics, notes) |
| `cut_settings` | Protein multiplier, unit preference |

### Backup and restore

Use **Settings → Export JSON** to download a full backup. **Import JSON** restores it. The JSON file is plain text — you can inspect it, email it to yourself, or store it in cloud storage.

CSV export (one row per meal) is available for analysis in Excel or Google Sheets.

### Updating the app

Pushing new code to GitHub updates the hosted files. The service worker on your phone picks up the update automatically the next time you open the app with an internet connection. Your data is not affected by updates.

## Stack

Plain HTML, CSS, and JavaScript — no framework, no build step, no dependencies.

- `manifest.json` — PWA metadata (name, icons, display mode)
- `sw.js` — service worker for offline caching (cache-first strategy)
- `app.js` — all application logic
- `style.css` — dark-theme mobile-first styles
