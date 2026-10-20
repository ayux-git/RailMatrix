# RailMatrix · Railway Berth Availability & Waitlist PNR Status Simulator

A responsive, accessible web app that **simulates** Indian Railways berth availability, PNR status and waitlist confirmation chances. It is built with plain HTML, CSS and vanilla JavaScript. There are no frameworks, no backend and no build step.

> **Disclaimer:** This is a simulator for learning and demonstration. All trains, availability, fares, PNRs and predictions are generated in JavaScript. It is **not** real IRCTC or Indian Railways data. Station names and codes are real; everything else is made up.

---

## How to run

1. Download or clone the project folder.
2. Double-click **`index.html`** to open it in any modern browser (Chrome, Edge, Firefox, Safari).

That's it. The scripts are plain IIFEs rather than ES modules, so the app also works from `file://`, where browsers block module scripts. If you prefer a local server, any static server works, for example `npx serve .` or `python -m http.server`.

## File structure

```
index.html          Page shell: header, two tabs (Search, PNR Status), toast region
css/style.css       Mobile-first, minimal light styles using CSS variables
js/data.js          Seeded RNG, date helpers, stations, classes, quotas, train types,
                    festival seasons, train/availability/fare generators,
                    historical cancellation data, sample PNRs
js/probability.js   Waitlist / RAC confirmation probability model
js/pnr.js           PNR validation and deterministic PNR status simulation
js/app.js           UI: rendering, events, validation, toasts, inline predictions
README.md           This file
```

Every script attaches to a single global namespace, `window.RailMatrix`, so nothing else leaks into global scope.

## Features

### 1. Train search
- From/To inputs with a **datalist autocomplete** of 40 real stations, such as NDLS, BCT, HWH, MAS, SBC, LDH, JUC, ASR, LKO and JP. You can type a code ("ldh"), a name or pick a suggestion.
- **Swap** button, **quota** dropdown with 7 quotas, and one-click **popular route** chips.
- Date picker limited to **today … today + 120 days**.
- **Inline validation** under each field, with `aria-invalid` and `aria-describedby`. It catches empty fields, unknown stations, same origin and destination, invalid, past or too-far dates, and a missing quota.
- **Quota rules:**
  - **Tatkal and Premium Tatkal** are only bookable for journeys today or tomorrow, the "next 2 days". Any other date shows a warning note and a warning toast. Cards then show "NOT OPEN YET" with the opening date and time.
  - **Senior Citizen, Ladies, Divyang and Foreign Tourist** show an eligibility info note.
- Results show 5–8 trains filtered logically for the route:
  - Rajdhani only runs on Delhi routes of 400 km or more.
  - Shatabdi and Vande Bharat only run on day routes of 900 km or less.
  - Only trains whose running days include the chosen weekday appear.
- Stations closer than 60 km, such as NDLS → DLI, give a friendly "no trains" empty state.

### 2. Class-wise availability cards
- One card per class (1A, 2A, 3A, 3E, SL, EC, CC), showing the class name, fare and status.
- Statuses use colour **plus an icon and text**:
  - ✓ `AVAILABLE 42` in green.
  - ◐ `RAC 14` in yellow.
  - ⧗ `WL 28` in red.
  - `NOT OFFERED` (quota not offered in that class) and `NOT OPEN YET` (Tatkal window closed).
- Fares vary by quota. Tatkal adds a charge, Premium Tatkal adds dynamic pricing, Divyang gets a concession and Foreign Tourist pays a surcharge.
- Click a card to expand its details:
  - A berth-type breakdown (Lower, Middle, Upper, Side Lower, Side Upper, or seat types for chair cars).
  - A fare breakdown and the last-updated time.
  - For RAC and WL cards, the **confirmation chance** shown directly, such as `46% · MEDIUM`.
- **Deterministic:** the same train, date, quota and class always give the same result.
- **Refresh** button per train. It instantly applies a small, still deterministic, drift and reports how many classes changed.

### 3. PNR status tracker
- **Live validation** of the PNR input:
  - Letters are blocked as you type.
  - Pasted spaces, hyphens and letters are stripped.
  - Input is capped at 10 digits, with a digit counter.
- Simulated booking details: train, date, class, quota, boarding and destination stations, and the chart status ("Chart Prepared" or "Chart Not Prepared").
- Passenger table for 1–6 passengers showing booking status, current status (for example `CNF S4/32 Lower`, `RAC 2` or `WL 5`), with colour and icon badges. The table turns into stacked cards on phones.
- **Sample PNR chips:**

  | PNR | Scenario |
  |---|---|
  | `2345678901` | Fully confirmed, chart prepared |
  | `4521896307` | Waitlisted: 2 of 3 passengers still on waitlist |
  | `6123409875` | RAC |
  | `8102938475` | Cancelled |

- **Error states** for invalid PNRs and for "not found". Any PNR starting with 0 or 9, or one repeated digit such as `5555555555`, is not found.
- **Prediction column:** every passenger still on WL or RAC gets their confirmation chance right in the table. It shows a percentage and a band with an icon, plus a short note with the cancellations needed and expected. Hover it to read the full reason.
  - **HIGH**: above 70%, green.
  - **MEDIUM**: 35–70%, amber.
  - **LOW**: below 35%, red.
- Confirmed passengers show “Already confirmed”, and cancelled ones show “Cancelled”. If the chart is already prepared, waitlisted passengers show “Chart prepared: not confirmed”.

### 4. Alerts and notifications
- Custom **toasts** for success, warning, error and info:
  - Each has a distinct colour and icon.
  - They stack (max 4) and auto-dismiss after 5 seconds, with a progress bar.
  - Hovering or focusing a toast pauses it, and each has a close button.
  - They sit in an `aria-live="polite"` region.
- Toasts fire for search results, validation errors, Tatkal window warnings, PNR checks, not-found PNRs and availability refreshes.

### UI, UX and accessibility
- Mobile-first layout tested at 360 px, tablet and desktop, using CSS Grid, Flexbox and CSS variables.
- Sticky header and keyboard-accessible tabs (ARIA tabs pattern with Arrow, Home and End keys). Tabs are deep-linkable via `#search` and `#pnr`.
- Simple, minimal light design: white header, flat cards with thin borders, one blue accent colour, and status colours only where they carry meaning.
- Results appear instantly after submitting, with no loading screen.
- Empty and error states in every section.
- Semantic HTML, a label on every input, a skip link, visible focus rings, `prefers-reduced-motion` support and forced-colours support.
- **Safe rendering:** user input never goes through `innerHTML`. All DOM is built with `createElement` and `textContent`.

## How the simulation works

### Deterministic randomness
`data.js` hashes a list of keys into a 32-bit seed (cyrb53-style), then feeds a **Mulberry32** PRNG:

```js
createRng('avl', trainNo, date, quota, cls)   // same keys → same numbers, every time
```

### Trains for a route
1. **Distance:** great-circle distance between station coordinates × 1.22, to account for rail detours.
2. **Eligible train types** follow distance and route rules.
3. **Generation:** a route-seeded stream generates candidate trains: name, number, departure, speed-based duration, running days, classes and popularity (0–1).
4. **Filtering:** trains that don't run on the chosen weekday are skipped until 5–8 trains are found.

Because the stream is seeded by route only, the same train shows up on every date it runs.

### Availability
For each class and quota a **demand pressure** is computed:

```
pressure = 0.5·popularity + 0.32·closeness-to-date + weekday demand
         + festival boost + class demand + quota demand − 0.05
net      = pool × (0.95 − pressure) ± seeded noise
```

- **net > 0** gives `AVAILABLE net`. The free berths are split across berth types using the coach layout. For example, SL repeats L, M, U, L, M, U, SL, SU.
- Otherwise the overflow fills the **RAC** pool first, then becomes **WL**.
- **Refresh** adds a small seeded drift per refresh count.

Fares are calculated as:

```
fare = base (per-km rate × distance × train factor) + reservation + superfast
       + Tatkal or dynamic charges − concessions + 5% GST (AC classes)
```

### PNR status
- Sample PNRs return fixed scenarios.
- Other PNRs seed a random route, train, class, quota, passenger count and booking type.
- Each passenger sits in one queue: `0 = CNF`, `1..R = RAC`, `R+1… = WL`. All passengers on a PNR move by the same seeded shift, so statuses stay consistent.
- The chart is "prepared" when the journey is today.

### Confirmation probability (`probability.js`)
1. **History.** Take the last 4 weeks of the train's simulated cancellations per journey to get `avg`. Popular trains have relatively fewer cancellations.
2. **Expected cancellations still to come:**
   ```
   expected = avg × remainingShare(daysLeft) × quotaFactor × weekdayFactor × festivalFactor
   remainingShare(d) = 0.25 + 0.75·(1 − e^(−d/12))
   ```
   The 0.25 term represents chart-time releases.
3. **Cancellations needed:** `RAC n` needs `n`. `WL n` needs `RAC pool + n`, because every RAC ticket is ahead of every WL ticket.
4. **Probability.** Cancellations are modelled as an over-dispersed count, Normal(`expected`, `1.3·√expected + 2`):
   ```
   P = 1 − Φ((needed − 0.5 − expected) / sd)
   ```
   The result is clamped to 1–99% and banded as LOW, MEDIUM or HIGH.

### Testing done
- **Logic tests** of the data, probability and PNR modules run in Node with a fake `window`. They covered:
  - Determinism, train counts per route and berth totals.
  - Tatkal window and Tatkal fare.
  - The probability falling as WL position grows.
  - All sample PNRs and the not-found rules.
  - 400 random PNRs for valid berth numbers.
- **End-to-end runs** in headless Microsoft Edge covered:
  - Every validation path and the search, expand and refresh flow.
  - PNR samples, errors and the inline prediction column.
  - No horizontal overflow at 360 px, and no console errors.

## Possible future improvements
- Real-time-looking updates: auto-refresh with a "data changed" indicator.
- Intermediate stations and partial-route quotas (PQWL, RLWL, GNWL) with their different clearance rates.
- Sorting and filtering trains by departure, duration, availability or class.
- Seat map visualisation for a coach, with a chosen berth preference.
- Calendar heat-map of availability across the next 30 days to pick the best date.
- A backtest of the probability model to calibrate it against the simulated outcomes.
- Offline support with a Service Worker so the app installs as a PWA.
- Internationalisation (Hindi and regional languages) and ₹/date locale switching.
- Unit tests with a test runner and CI, plus automated accessibility checks (axe-core).
