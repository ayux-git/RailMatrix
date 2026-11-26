# RailMatrix · Berth Availability & PNR Status Simulator

A simple web app that **simulates** Indian Railways berth availability, PNR status and waitlist confirmation chances.
It uses plain HTML, CSS and JavaScript. There are no frameworks, no backend and no build step.

> **Disclaimer:** This is a simulator for learning. Station names and codes are real; everything else
> (trains, availability, fares, PNRs, predictions) is made up. It is **not** real IRCTC data.

## How to run

Double-click **`index.html`** to open it in any modern browser.

## Files

```
index.html      The page: header, two tabs (Search Trains, PNR Status), forms
css/style.css   All the styles
js/data.js      Fixed data: stations, classes, quotas, festivals, train types, sample PNRs
js/app.js       Logic + UI: random numbers, trains, fares, availability,
                confirmation chance, PNR lookup, and everything you click
```

`data.js` is loaded first, so `app.js` can use everything declared in it.

## Features

### Train search
- From/To boxes with station suggestions (type a code like `ldh`, a name, or pick one), a swap button and popular-route buttons.
- Date picker limited to today … today + 120 days, and a quota dropdown with 7 quotas.
- Error messages under each field (empty, unknown station, same station, past or too-far date).
- **Tatkal / Premium Tatkal** only open for today or tomorrow. For any other date a warning is shown and cards say "NOT OPEN YET".
- Other quotas (Senior Citizen, Ladies, Divyang, Foreign Tourist) show an eligibility note.
- 5–8 trains per route. Rajdhani runs only to/from Delhi; Shatabdi and Vande Bharat only on shorter day routes. Stations closer than 60 km have no trains.

### Class cards
- One button per class with fare and status: ✓ `AVAILABLE 42`, ◐ `RAC 14`, ⧗ `WL 28`, `NOT OFFERED` or `NOT OPEN YET`.
- Click a class to see the free berth types, the fare breakdown and, for RAC/WL, the confirmation chance.
- **Refresh** changes the numbers a little and tells you how many classes changed.
- The same train, date, quota and class always give the same result.

### PNR status
- The PNR box accepts digits only (max 10) and shows a digit counter.
- Shows train, date, class, quota, stations, chart status and a passenger table (booking status, current status, prediction).
- Sample PNRs:

  | PNR | Scenario |
  |---|---|
  | `2345678901` | Confirmed, chart prepared |
  | `4521896307` | 2 of 3 passengers on waitlist |
  | `6123409875` | RAC |
  | `8102938475` | Cancelled |

- PNRs starting with 0 or 9, or one repeated digit (`5555555555`), are "not found". Any other PNR makes up a booking.

### Alerts
Results and errors are also shown with the browser's `alert()` pop-up.

## How the simulation works

- **Repeatable randomness:** `makeRandom(text)` turns text into a seed, so the same text always gives the same "random" numbers.
- **Availability:** a demand score is worked out from train popularity, days to travel, weekday, festivals, class and quota.
  `free = pool × (0.95 − demand) ± noise`. If `free > 0` berths are available; otherwise the queue fills RAC first, then WL.
- **Fare:** base fare + reservation + superfast + Tatkal/dynamic charges − concessions + 5% GST on AC classes.
- **Confirmation chance:**
  1. Average cancellations per journey for this train and class.
  2. Expected cancellations still to come = average × time left × quota × weekday × festival factors.
  3. Cancellations needed: `RAC n` needs `n`; `WL n` needs all RAC places + `n`.
  4. A bell curve gives the chance that enough cancellations happen: **HIGH** above 70%, **MEDIUM** 35–70%, **LOW** below 35%.
