/*
   1. Helpers
/*
/*
  A random number generator that always gives the SAME numbers for the
  SAME text. For example makeRandom('pnr4521896307') always makes the same
  booking, so a PNR shows the same result every time you check it.
 */
function makeRandom(text) {
  // Turn the text into a number (called the "seed")
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = (Math.imul(31, seed) + text.charCodeAt(i)) | 0;
  }

  // Gives the next random number between 0 and 1 (the "Mulberry32" algorithm)
  function next() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next: next,
    // a decimal number from min to max
    between: function (min, max) { return min + next() * (max - min); },
    // a whole number from min to max (both included)
    int: function (min, max) { return min + Math.floor(next() * (max - min + 1)); },
    // one random item from a list
    pick: function (list) { return list[Math.floor(next() * list.length)]; },
  };
}

/* Picks one item from a list. Items with a bigger "weight" are picked more often. */
function pickWeighted(random, items) {
  let total = 0;
  for (const item of items) total += item.weight;

  let point = random.next() * total;
  for (const item of items) {
    point -= item.weight;
    if (point < 0) return item;
  }
  return items[items.length - 1];
}

/* Keeps a number between min and max: clamp(150, 0, 100) -> 100 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* Today's date at midnight */
function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/* 0 = today, 1 = tomorrow, -1 = yesterday */
function daysFromToday(date) {
  return Math.round((date - today()) / 86400000); // 86,400,000 milliseconds in a day
}

/* Date -> "2026-11-25" (the format used by <input type="date">) */
function toISO(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

/* "2026-11-25" -> Date */
function fromISO(text) {
  const parts = text.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/* Day of the week: Monday = 0 ... Sunday = 6 */
function weekday(date) {
  return (date.getDay() + 6) % 7;
}

/* Date -> "Wed, 25 Nov 2026" */
function formatDate(date) {
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/* Minutes after midnight -> "06:40" */
function formatTime(minutes) {
  minutes = minutes % 1440; // 1440 minutes in a day
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return h + ':' + m;
}

/* 270 -> "4h 30m" */
function formatDuration(minutes) {
  return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
}

/* The time right now, e.g. "10:42 am" */
function clockNow() {
  return new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/* 1234 -> "₹1,234" */
function rupees(amount) {
  return '₹' + amount.toLocaleString('en-IN');
}

/* Returns the festival name if the date is in a festival season, otherwise null */
function getFestival(date) {
  const monthDay = (date.getMonth() + 1) * 100 + date.getDate(); // 25 Nov -> 1125
  for (const festival of FESTIVALS) {
    let inSeason;
    if (festival.from <= festival.to) {
      inSeason = monthDay >= festival.from && monthDay <= festival.to;
    } else {
      inSeason = monthDay >= festival.from || monthDay <= festival.to; // crosses New Year
    }
    if (inSeason) return festival.name;
  }
  return null;
}

/* Approximate rail distance in km (straight-line distance on the globe + 22% for curves) */
function distanceKm(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  const straightLine = 2 * 6371 * Math.asin(Math.sqrt(h)); // 6371 km = Earth's radius
  return Math.round(straightLine * 1.22);
}


/* ==========================================================
   2. Trains, fares and availability
   ========================================================== */

/* Is this quota offered in this class? */
function quotaOffered(quotaCode, cls) {
  const classes = QUOTAS[quotaCode].classes;
  return classes === null || classes.includes(cls);
}

/* Which days a train runs: 7 numbers for Mon..Sun (1 = runs, 0 = doesn't) */
function makeRunningDays(random, type) {
  if (random.next() < type.daily) {
    return [1, 1, 1, 1, 1, 1, 1];
  }

  const days = [0, 0, 0, 0, 0, 0, 0];
  const start = random.int(0, 6);
  let pattern = random.pick(['three', 'three', 'three', 'two', 'two', 'weekly', 'weekly', 'six']);
  if (type.dayTrain) pattern = 'six';

  if (pattern === 'six') {        // every day except one
    days.fill(1);
    days[start] = 0;
  } else if (pattern === 'three') { // 3 days a week
    days[start] = 1;
    days[(start + 2) % 7] = 1;
    days[(start + 4) % 7] = 1;
  } else if (pattern === 'two') {   // 2 days a week
    days[start] = 1;
    days[(start + 3) % 7] = 1;
  } else {                          // once a week
    days[start] = 1;
  }
  return days;
}

/*
 * Makes the list of trains between two stations on a date.
 * Returns { trains: [...], distance: km, tooClose: true/false }
 */
function getTrains(fromCode, toCode, dateISO) {
  const from = STATIONS[fromCode];
  const to = STATIONS[toCode];
  const distance = distanceKm(from, to);

  // Stations that are very close have no long-distance trains
  if (distance < 60) {
    return { trains: [], distance: distance, tooClose: true };
  }

  // Train types that suit this route (right length, and Rajdhani only to/from Delhi)
  const touchesDelhi = DELHI_STATIONS.includes(fromCode) || DELHI_STATIONS.includes(toCode);
  const suitableTypes = TRAIN_TYPES.filter(function (type) {
    return distance >= type.minKm && distance <= type.maxKm && (!type.delhiOnly || touchesDelhi);
  });

  // The random generator depends only on the route, so the same train
  // (number, name, times) shows up on every date it runs.
  const random = makeRandom('route' + fromCode + toCode);
  const howMany = makeRandom('count' + fromCode + toCode + dateISO).int(5, 8);
  const day = weekday(fromISO(dateISO));

  const trains = [];
  const usedNames = [];
  const usedNumbers = [];
  const typeCount = {}; // e.g. { RAJ: 1, SF: 3 }

  for (let attempt = 0; attempt < 80 && trains.length < howMany; attempt++) {
    // Only types that have not reached their maximum yet
    const choices = suitableTypes.filter(function (type) {
      return (typeCount[type.key] || 0) < type.max;
    });
    if (choices.length === 0) break;

    const type = pickWeighted(random, choices);

    // Name, e.g. "Mumbai–Delhi Rajdhani Express" or "Ganga Mail"
    let name = from.city + '–' + to.city + ' ' + type.label + ' Express';
    if (type.generic) {
      name = random.pick(NAMED_TRAINS) + ' ' + random.pick(['Express', 'Superfast Express', 'Mail']);
    }

    // 5-digit number, e.g. prefix "124" + 2 random digits
    let number = random.pick(type.numPrefix);
    while (number.length < 5) {
      number += random.int(0, 9);
    }

    // Departure time (minutes after midnight, in 5-minute steps)
    let departure = random.int(0, 287) * 5;
    if (type.dayTrain) {
      departure = random.pick([330, 840]) + random.int(0, 30) * 5; // morning or afternoon
    }

    // Journey time, rounded to 5 minutes
    const speed = random.between(type.speed[0], type.speed[1]);
    const minutes = (distance / speed) * 60 + random.int(5, 30);
    const duration = Math.max(45, Math.round(minutes / 5) * 5);

    const runningDays = makeRunningDays(random, type);
    const popularity = random.between(type.pop[0], type.pop[1]);

    // Skip duplicates
    if (usedNames.includes(name) || usedNumbers.includes(number)) continue;
    usedNames.push(name);
    usedNumbers.push(number);
    typeCount[type.key] = (typeCount[type.key] || 0) + 1;

    // Skip trains that don't run on the chosen day
    if (!runningDays[day]) continue;

    trains.push({
      number: number,
      name: name,
      typeLabel: type.label,
      from: fromCode,
      to: toCode,
      distance: distance,
      departure: departure,
      duration: duration,
      runningDays: runningDays,
      classes: type.classes,
      popularity: popularity,
      fareFactor: type.fareFactor,
      superfast: type.superfast,
    });
  }

  // Earliest departure first
  trains.sort(function (a, b) { return a.departure - b.departure; });

  return { trains: trains, distance: distance, tooClose: false };
}

/*
 * Works out the fare for one passenger.
 * Returns { total: 1235, parts: [['Base fare', 1000], ['Reservation charge', 40], ...] }
 */
function getFare(train, cls, quotaCode, demand) {
  const c = CLASSES[cls];
  const quota = QUOTAS[quotaCode];
  const base = Math.max(c.minFare, Math.round(c.perKm * train.distance * train.fareFactor));

  const parts = [['Base fare', base], ['Reservation charge', c.reservation]];

  if (train.superfast) {
    parts.push(['Superfast charge', c.superfast]);
  }
  if (quota.tatkal) {
    const rate = c.ac ? 0.3 : 0.1;
    const tatkal = clamp(Math.round(base * rate), c.tatkalMin, c.tatkalMax);
    parts.push(['Tatkal charge', tatkal]);

    if (quotaCode === 'PT') {
      const surge = clamp(0.25 + demand * 0.4, 0.2, 0.9); // Premium Tatkal costs more when demand is high
      parts.push(['Dynamic pricing surcharge', Math.round((base + tatkal) * surge)]);
    }
  }
  if (quotaCode === 'FT') {
    parts.push(['Foreign tourist surcharge', Math.round(base * 0.5)]);
  }
  if (quotaCode === 'HP') {
    parts.push(['Divyang concession (50%)', -Math.round(base * 0.5)]);
  }

  // GST is added on AC classes only
  let subtotal = 0;
  for (const part of parts) subtotal += part[1];
  if (c.ac) {
    const gst = Math.round(subtotal * 0.05);
    parts.push(['GST (5%)', gst]);
    subtotal += gst;
  }

  return { total: Math.round(subtotal / 5) * 5, parts: parts }; // round to the nearest ₹5
}

/*
 * How busy a train is for a class + quota + date.
 * About 0.2 = quiet, about 1.6 = sold out with a long waitlist.
 */
function getDemand(train, cls, quotaCode, date) {
  const daysLeft = clamp(daysFromToday(date), 0, MAX_DAYS_AHEAD);
  const closeness = 1 - daysLeft / MAX_DAYS_AHEAD; // 1 = travelling today
  const festivalBoost = getFestival(date) ? 0.22 : 0;

  return -0.05 + train.popularity * 0.5 + closeness * 0.32 + WEEKDAY_DEMAND[weekday(date)]
    + festivalBoost + CLASSES[cls].demand + QUOTAS[quotaCode].demand;
}

/* Splits the free berths into berth types, e.g. { Lower: 4, Middle: 2, Upper: 3, ... } */
function splitBerths(random, cls, free) {
  const pattern = CLASSES[cls].berths;
  const counts = {};
  for (const type of pattern) counts[type] = 0;
  for (let i = 0; i < free; i++) {
    counts[random.pick(pattern)]++; // types that appear more in the pattern get more berths
  }
  return counts;
}

/*
 * Availability for one train + class + quota + date.
 * status is 'AVL', 'RAC', 'WL', 'NA' (quota not offered) or 'NOT_OPEN' (Tatkal not open yet).
 * Each press of "Refresh" adds 1 to `refreshes` and changes the numbers a little.
 */
function getAvailability(train, cls, quotaCode, dateISO, refreshes) {
  const c = CLASSES[cls];
  const quota = QUOTAS[quotaCode];
  const date = fromISO(dateISO);

  if (!quotaOffered(quotaCode, cls)) {
    return { status: 'NA', label: 'NOT OFFERED', fare: null };
  }

  const demand = getDemand(train, cls, quotaCode, date);
  const fare = getFare(train, cls, quotaCode, demand);

  if (quota.tatkal && daysFromToday(date) > TATKAL_DAYS_AHEAD) {
    return { status: 'NOT_OPEN', label: 'NOT OPEN YET', fare: fare, opensOn: addDays(date, -1) };
  }

  const random = makeRandom('avl' + train.number + dateISO + quotaCode + cls);
  const pool = Math.max(2, Math.round(c.pool * quota.poolFactor));
  let racPool = 0;
  if (c.racRatio > 0) racPool = Math.max(1, Math.round(pool * c.racRatio));

  // free berths (a negative number means people are already on RAC / waitlist)
  let free = Math.round(pool * (0.95 - demand + random.between(-0.15, 0.15)));
  for (let i = 1; i <= refreshes; i++) {
    free += makeRandom('refresh' + train.number + dateISO + quotaCode + cls + i).int(-5, 4);
  }
  free = Math.min(free, pool);

  if (free > 0) {
    return { status: 'AVL', count: free, label: 'AVAILABLE ' + free, fare: fare, berths: splitBerths(random, cls, free) };
  }

  // No berths left: the first people in the queue get RAC, the rest go on the waitlist
  const position = 1 - free;
  if (position <= racPool) {
    return { status: 'RAC', count: position, label: 'RAC ' + position, fare: fare, racPool: racPool };
  }
  const wl = position - racPool;
  return { status: 'WL', count: wl, label: 'WL ' + wl, fare: fare, racPool: racPool };
}


/* ==========================================================
   3. Confirmation chance for RAC / WL tickets
   ----------------------------------------------------------
   A RAC / WL ticket gets confirmed only if enough people cancel.
   1. Find the average number of cancellations on this train.
   2. Adjust it for days left, quota, weekday and festivals
      -> the EXPECTED number of cancellations still to come.
   3. Work out how many cancellations this ticket NEEDS
      (RAC 5 needs 5; WL 5 needs all the RAC places + 5).
   4. Use a bell curve to get the chance that expected >= needed.
   ========================================================== */

/* Bell-curve maths: the chance that a "normal" value is below z (a standard approximation) */
function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/*
 * ticket = { type: 'RAC' or 'WL', position, cls, quota, daysLeft, popularity, trainNumber, racPool }
 * Returns { percent, band, color, needed, expected, average }
 */
function confirmationChance(ticket) {
  const date = addDays(today(), ticket.daysLeft);

  // Step 1: average cancellations per journey (popular trains have fewer)
  const base = CLASSES[ticket.cls].cancels * (1.1 - 0.3 * ticket.popularity);
  const average = base * makeRandom('hist' + ticket.trainNumber + ticket.cls).between(0.85, 1.15);

  // Step 2: expected cancellations still to come
  const timeLeft = 0.25 + 0.75 * (1 - Math.exp(-ticket.daysLeft / 12)); // 25% always happen at chart time
  const festivalFactor = getFestival(date) ? 0.78 : 1;
  const expected = average * timeLeft * QUOTAS[ticket.quota].cancelFactor * WEEKDAY_CANCELS[weekday(date)] * festivalFactor;

  // Step 3: cancellations needed
  let needed = ticket.position;
  if (ticket.type === 'WL') needed = ticket.racPool + ticket.position;

  // Step 4: chance that cancellations >= needed
  const spread = 1.3 * Math.sqrt(Math.max(expected, 1)) + 2;
  const z = (needed - 0.5 - expected) / spread;
  const percent = clamp(Math.round((1 - normalCdf(z)) * 100), 1, 99); // never 0% or 100%

  let band = 'LOW';
  let color = 'red';
  if (percent > 70) {
    band = 'HIGH';
    color = 'green';
  } else if (percent >= 35) {
    band = 'MEDIUM';
    color = 'yellow';
  }

  return { percent: percent, band: band, color: color, needed: needed, expected: Math.round(expected), average: Math.round(average) };
}

/* HTML for the chance, e.g. "64% · MEDIUM  needs ~20, expected ~23 cancellations" */
function chanceHtml(ticket) {
  const c = confirmationChance(ticket);
  const tooltip = 'Based on avg. ' + c.average + ' cancellations per journey on this train (' + ticket.cls +
    '), we expect about ' + c.expected + ' more before the chart is prepared. Your ticket needs roughly ' + c.needed + '.';
  return `<span class="badge ${c.color}" title="${tooltip}">${c.percent}% · ${c.band}</span>
          <small class="muted">needs ~${c.needed}, expected ~${c.expected} cancellations</small>`;
}


/*
   4. PNR lookup
  
   - The 4 sample PNRs (data.js) return fixed bookings.
   - PNRs starting with 0 or 9, or one digit repeated (5555555555)
     are "not found".
   - Any other PNR makes up a booking, seeded by the PNR itself.
 */

/* Returns a booking, or null if the PNR is "not found" */
function lookupPnr(pnr) {
  for (const sample of SAMPLE_PNRS) {
    if (sample.pnr === pnr) return sample;
  }
  if (pnr[0] === '0' || pnr[0] === '9' || pnr === pnr[0].repeat(10)) {
    return null;
  }
  return makeRandomBooking(pnr);
}

/*
 * Every ticket stands in one queue: rank 0 = confirmed,
 * rank 1..racPool = RAC 1..racPool, after that = WL 1, WL 2, ...
 */
function rankToStatus(rank, racPool, coach, berth) {
  if (rank <= 0) return { type: 'CNF', coach: coach, berth: berth };
  if (rank <= racPool) return { type: 'RAC', pos: rank };
  return { type: 'WL', pos: rank - racPool };
}

function makeRandomBooking(pnr) {
  const random = makeRandom('pnr' + pnr);
  const codes = Object.keys(STATIONS);

  // 1. Pick two far-apart stations, a date, and a train that runs that day
  let train = null;
  let daysAhead = 0;
  for (let attempt = 0; attempt < 40 && train === null; attempt++) {
    const from = random.pick(codes);
    const to = random.pick(codes);
    if (STATIONS[from].city === STATIONS[to].city) continue;
    if (distanceKm(STATIONS[from], STATIONS[to]) < 200) continue;

    daysAhead = random.int(0, 45);
    const trains = getTrains(from, to, toISO(addDays(today(), daysAhead))).trains;
    if (trains.length > 0) train = random.pick(trains);
  }
  if (train === null) return null;

  // 2. Class, quota and number of passengers
  const cls = random.pick(train.classes);
  let quota = random.pick(['GN', 'GN', 'GN', 'GN', 'GN', 'GN', 'GN', 'TQ', 'TQ', 'SS', 'LD', 'HP', 'PT']);
  if (!quotaOffered(quota, cls) || (QUOTAS[quota].tatkal && daysAhead > TATKAL_DAYS_AHEAD)) {
    quota = 'GN';
  }
  const count = random.pick([1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6]);
  const racPool = CLASSES[cls].racPlaces;
  const isCancelled = random.next() < 0.06; // about 6% of bookings are cancelled

  // 3. Queue rank of passenger 1 when the ticket was booked (0 = confirmed)
  let bookedAs = random.pick(['CNF', 'CNF', 'CNF', 'RAC', 'WL', 'WL', 'WL', 'WL']);
  if (bookedAs === 'RAC' && racPool === 0) bookedAs = 'WL';
  let firstRank = 0;
  if (bookedAs === 'RAC') firstRank = random.int(1, Math.max(1, racPool - count));
  if (bookedAs === 'WL') firstRank = racPool + random.int(1, 90);

  // 4. How many places the whole PNR has moved up since booking
  let moved = 0;
  if (firstRank > 0 && random.next() > 0.3) {
    const maxMove = Math.max(2, Math.round((firstRank + count) * random.between(0.3, 1.3)));
    moved = random.int(1, maxMove);
  }

  // 5. Coach and first berth number for this group
  const coach = CLASSES[cls].prefix + random.int(1, CLASSES[cls].coaches);
  const firstBerth = random.int(1, CLASSES[cls].perCoach - count);

  // 6. Each passenger's booking status and current status
  const passengers = [];
  let confirmedSoFar = 0;
  for (let i = 0; i < count; i++) {
    const bookingRank = firstRank === 0 ? 0 : firstRank + i;
    const booking = rankToStatus(bookingRank, racPool, coach, firstBerth + i);

    let current;
    if (isCancelled) {
      current = { type: 'CAN' };
    } else if (bookingRank === 0) {
      current = booking; // confirmed from the start
    } else {
      current = rankToStatus(bookingRank - moved, racPool, coach, firstBerth + confirmedSoFar);
      if (current.type === 'CNF') confirmedSoFar++;
    }
    passengers.push({ booking: booking, current: current });
  }

  return {
    pnr: pnr,
    train: { number: train.number, name: train.name },
    from: train.from,
    to: train.to,
    departure: train.departure,
    duration: train.duration,
    journeyOffset: daysAhead,
    cls: cls,
    quota: quota,
    chartPrepared: daysAhead === 0, // the chart is ready only on the day of the journey
    passengers: passengers,
  };
}

/* Status -> text, e.g. "CNF S4/32 Side Upper", "RAC 2", "WL 5", "CAN" */
function statusText(status, cls) {
  if (status.type === 'CNF') {
    const pattern = CLASSES[cls].berths;
    const berthType = pattern[(status.berth - 1) % pattern.length];
    return 'CNF ' + status.coach + '/' + status.berth + ' ' + berthType;
  }
  if (status.type === 'RAC') return 'RAC ' + status.pos;
  if (status.type === 'WL') return 'WL ' + status.pos;
  return 'CAN';
}


/*
   5. Tabs, alerts and badges
 */

/* Shows the "search" or "pnr" section and highlights its tab button */
function showTab(name, button) {
  document.getElementById('search').hidden = name !== 'search';
  document.getElementById('pnr').hidden = name !== 'pnr';
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.remove('active');
  }
  button.classList.add('active');
}

/* Shows a pop-up message. The short delay lets the page draw the results first. */
function showAlert(title, message) {
  setTimeout(function () {
    alert(title + '\n\n' + message);
  }, 100);
}

/* Colour and symbol for each status */
const BADGES = {
  AVL: ['green', '✓'],
  CNF: ['green', '✓'],
  RAC: ['yellow', '◐'],
  WL: ['red', '⧗'],
  NA: ['gray', '–'],
  NOT_OPEN: ['blue', '🕒'],
  CAN: ['gray', '✕'],
};

/* A coloured badge, e.g. badge('WL', 'WL 5') */
function badge(type, text) {
  return `<span class="badge ${BADGES[type][0]}">${BADGES[type][1]} ${text}</span>`;
}

/* Shows (or clears, with '') the red error message under a form field */
function setError(id, message) {
  document.getElementById(id + '-error').textContent = message;
  document.getElementById(id).classList.toggle('invalid', message !== '');
}


/*
   6. Train search page
 */

const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const dateInput = document.getElementById('travelDate');
const quotaSelect = document.getElementById('quota');

let search = null; // details of the last search
let trains = [];   // trains found in the last search

/* Finds a station from "New Delhi (NDLS)", "NDLS", "ndls" or "New Delhi". Returns its code or null. */
function findStation(text) {
  text = text.trim().toLowerCase();
  for (const code in STATIONS) {
    const s = STATIONS[code];
    if (text === code.toLowerCase() || text === s.name.toLowerCase() || text === s.label.toLowerCase()) {
      return code;
    }
  }
  return null;
}

/* Checks the form, shows the error messages and returns how many errors there are */
function validateSearch() {
  let originError = '';
  let destinationError = '';
  let dateError = '';

  const from = findStation(originInput.value);
  const to = findStation(destinationInput.value);

  if (originInput.value.trim() === '') originError = 'Please enter the origin station.';
  else if (!from) originError = 'Station not recognised. Please choose one from the suggestions list.';

  if (destinationInput.value.trim() === '') destinationError = 'Please enter the destination station.';
  else if (!to) destinationError = 'Station not recognised. Please choose one from the suggestions list.';
  else if (from === to) destinationError = 'Origin and destination must be different stations.';

  if (dateInput.value === '') {
    dateError = 'Please select a valid travel date.';
  } else {
    const days = daysFromToday(fromISO(dateInput.value));
    if (days < 0) dateError = 'Travel date cannot be in the past.';
    if (days > MAX_DAYS_AHEAD) dateError = 'You can book at most ' + MAX_DAYS_AHEAD + ' days ahead.';
  }

  setError('origin', originError);
  setError('destination', destinationError);
  setError('travelDate', dateError);

  let count = 0;
  if (originError) count++;
  if (destinationError) count++;
  if (dateError) count++;
  return count;
}

/* true if Tatkal is chosen for a date further away than tomorrow */
function isTatkalClosed() {
  if (!QUOTAS[quotaSelect.value].tatkal || dateInput.value === '') return false;
  return daysFromToday(fromISO(dateInput.value)) > TATKAL_DAYS_AHEAD;
}

/* Shows the info (or warning) box about the chosen quota */
function updateQuotaNote() {
  const quota = QUOTAS[quotaSelect.value];
  const note = document.getElementById('quotaNote');

  if (quota.note === '') {
    note.hidden = true;
    return;
  }

  if (isTatkalClosed()) {
    const date = fromISO(dateInput.value);
    note.className = 'note warning';
    note.innerHTML = `<b>⚠️ Tatkal window not open for this date</b><br>
      ${quota.name} is only bookable for journeys today or tomorrow. For ${formatDate(date)} it opens on
      ${formatDate(addDays(date, -1))} at 10:00 AM (AC) / 11:00 AM (non-AC). You can still search to see projected fares.`;
  } else {
    note.className = 'note';
    note.innerHTML = `<b>ℹ️ ${quota.name} quota</b><br>${quota.note}`;
  }
  note.hidden = false;
}

function swapStations() {
  const temp = originInput.value;
  originInput.value = destinationInput.value;
  destinationInput.value = temp;
  setError('origin', '');
  setError('destination', '');
}

/* The "popular route" buttons */
function quickSearch(fromCode, toCode) {
  originInput.value = STATIONS[fromCode].label;
  destinationInput.value = STATIONS[toCode].label;
  searchTrains();
}

/* Runs when the "Search trains" button is pressed */
function searchTrains(event) {
  if (event) event.preventDefault(); // stop the page from reloading

  const errorCount = validateSearch();
  if (errorCount > 0) {
    showAlert('Check your search', 'Please fix ' + errorCount + ' highlighted field(s) before searching.');
    return;
  }

  const from = findStation(originInput.value);
  const to = findStation(destinationInput.value);
  originInput.value = STATIONS[from].label; // tidy up, e.g. "ndls" -> "New Delhi (NDLS)"
  destinationInput.value = STATIONS[to].label;

  const result = getTrains(from, to, dateInput.value);
  search = {
    from: from,
    to: to,
    dateISO: dateInput.value,
    date: fromISO(dateInput.value),
    quota: quotaSelect.value,
    distance: result.distance,
    tooClose: result.tooClose,
    tatkalClosed: isTatkalClosed(),
  };
  trains = result.trains;
  for (const train of trains) {
    train.refreshes = 0;     // how many times "Refresh" was pressed
    train.openClass = null;  // which class's details are open
    train.updated = clockNow();
  }

  renderResults();

  const route = from + ' → ' + to + ' on ' + formatDate(search.date);
  if (search.tatkalClosed) {
    showAlert('⚠️ Tatkal window not open', 'Tatkal for ' + formatDate(search.date) + ' opens on ' +
      formatDate(addDays(search.date, -1)) + '. Showing projected fares only.');
  }
  if (trains.length > 0) {
    showAlert('✅ Success', 'Search complete: ' + trains.length + ' trains found for ' + route + '.');
  } else {
    showAlert('No trains found', 'No trains found for ' + route + '.');
  }
}

/* Shows the list of trains */
function renderResults() {
  const box = document.getElementById('searchResults');
  const from = STATIONS[search.from];
  const to = STATIONS[search.to];

  if (trains.length === 0) {
    let text = 'No simulated trains run between ' + from.name + ' and ' + to.name + ' on ' + formatDate(search.date) + '. Try another date.';
    if (search.tooClose) {
      text = from.name + ' and ' + to.name + ' are only about ' + search.distance + ' km apart, so no long-distance trains run. Try a station in another city.';
    }
    box.innerHTML = `<div class="empty"><h3>No trains found</h3><p>${text}</p></div>`;
    return;
  }

  let tags = '';
  const festival = getFestival(search.date);
  if (festival) tags += ` <span class="badge yellow">✨ ${festival}: high demand</span>`;
  if (search.tatkalClosed) tags += ' <span class="badge blue">🕒 Tatkal not open yet</span>';

  let html = `
    <h3>${trains.length} trains found</h3>
    <p class="muted">
      <b>${search.from} → ${search.to}</b> · ${formatDate(search.date)} · ${QUOTAS[search.quota].name} quota · ~${search.distance} km
      ${tags}
    </p>`;

  for (let i = 0; i < trains.length; i++) {
    html += `<div class="card" id="train-${i}">${trainCardHtml(i)}</div>`;
  }
  box.innerHTML = html;
}

/* "Runs daily" or "Runs on Mon, Wed, Fri" */
function runningDaysText(runningDays) {
  if (!runningDays.includes(0)) return 'Runs daily';
  const days = [];
  for (let i = 0; i < 7; i++) {
    if (runningDays[i]) days.push(DAY_NAMES[i]);
  }
  return 'Runs on ' + days.join(', ');
}

/* The HTML inside one train card */
function trainCardHtml(i) {
  const train = trains[i];
  const from = STATIONS[train.from];
  const to = STATIONS[train.to];
  const arrival = train.departure + train.duration;
  const extraDays = Math.floor(arrival / 1440); // 1 = arrives the next day

  // Get the availability of every class and make one button per class
  train.avail = {};
  let classButtons = '';
  for (const cls of train.classes) {
    const a = getAvailability(train, cls, search.quota, search.dateISO, train.refreshes);
    train.avail[cls] = a;

    const isOpen = cls === train.openClass ? 'open' : '';
    const fare = a.fare ? rupees(a.fare.total) : '—';
    classButtons += `
      <button class="class-btn ${isOpen}" onclick="toggleClass(${i}, '${cls}')">
        <b>${cls}</b> <small class="muted">${CLASSES[cls].name}</small><br>
        ${fare}<br>
        ${badge(a.status, a.label)}
      </button>`;
  }

  let details = '';
  if (train.openClass) details = detailsHtml(train, train.openClass);

  return `
    <div class="train-head">
      <h4>${train.number} ${train.name} <span class="badge gray">${train.typeLabel}</span></h4>
      <small class="muted">${runningDaysText(train.runningDays)}</small>
    </div>

    <div class="times">
      <div><b>${formatTime(train.departure)}</b><br>${from.name} (${from.code})</div>
      <div class="muted center">${formatDuration(train.duration)}<br>${train.distance} km</div>
      <div class="right"><b>${formatTime(arrival)}${extraDays ? ' (+' + extraDays + ' day)' : ''}</b><br>${to.name} (${to.code})</div>
    </div>

    <div class="classes">${classButtons}</div>
    ${details}

    <div class="train-foot">
      <small class="muted">Last updated ${train.updated}</small>
      <button class="btn small" onclick="refreshTrain(${i})">↻ Refresh</button>
    </div>`;
}

/* Opens a class's details, or closes them if they are already open */
function toggleClass(i, cls) {
  const train = trains[i];
  train.openClass = train.openClass === cls ? null : cls;
  document.getElementById('train-' + i).innerHTML = trainCardHtml(i);
}

/* The details box for one class: explanation, berth split, fare split and chance */
function detailsHtml(train, cls) {
  const a = train.avail[cls];
  const c = CLASSES[cls];
  const quota = QUOTAS[search.quota];
  const unit = c.seats ? 'seat' : 'berth';

  // One sentence explaining the status
  let explanation = '';
  if (a.status === 'AVL') {
    explanation = a.count + ' ' + unit + '(s) available to book right now in this quota.';
  } else if (a.status === 'RAC') {
    explanation = 'You would be RAC ' + a.count + ': you get a shared side-lower berth and move up as confirmed passengers cancel.';
  } else if (a.status === 'WL') {
    explanation = 'You would be WL ' + a.count + '. A ' + unit + ' is given only if enough passengers cancel. E-tickets still waitlisted after the chart are cancelled automatically.';
  } else if (a.status === 'NOT_OPEN') {
    explanation = 'Tatkal booking for this journey opens on ' + formatDate(a.opensOn) + ' at ' + (c.ac ? '10:00 AM' : '11:00 AM') + '. The fare shown is projected.';
  } else {
    explanation = 'The ' + quota.name + ' quota is not offered in ' + c.name + ' on this train. Try the General quota.';
  }

  // Berth (or seat) types that are free
  let berthTable = '';
  if (a.status === 'AVL') {
    let rows = '';
    for (const type in a.berths) {
      rows += `<tr><td>${type}</td><td>${a.berths[type]}</td></tr>`;
    }
    berthTable = `<div><h5>${c.seats ? 'Seat' : 'Berth'} types free</h5><table>${rows}</table></div>`;
  }

  // Fare breakdown
  let fareTable = '';
  if (a.fare) {
    let rows = '';
    for (const part of a.fare.parts) {
      const amount = part[1] < 0 ? '−' + rupees(-part[1]) : rupees(part[1]);
      rows += `<tr><td>${part[0]}</td><td>${amount}</td></tr>`;
    }
    rows += `<tr class="total"><td>Total (rounded)</td><td>${rupees(a.fare.total)}</td></tr>`;
    fareTable = `<div><h5>Fare per passenger</h5><table>${rows}</table></div>`;
  }

  // Confirmation chance (only for RAC and WL)
  let chance = '';
  if (a.status === 'RAC' || a.status === 'WL') {
    chance = '<p>Confirmation chance: ' + chanceHtml({
      type: a.status,
      position: a.count,
      cls: cls,
      quota: search.quota,
      daysLeft: daysFromToday(search.date),
      popularity: train.popularity,
      trainNumber: train.number,
      racPool: a.racPool,
    }) + '</p>';
  }

  return `
    <div class="details">
      <h4>${c.name} (${cls}) · ${quota.name} quota ${badge(a.status, a.label)}</h4>
      <p>${explanation}</p>
      <div class="details-grid">${berthTable}${fareTable}</div>
      ${chance}
    </div>`;
}

/* The "Refresh" button: get new numbers and say how many classes changed */
function refreshTrain(i) {
  const train = trains[i];

  const before = [];
  for (const cls of train.classes) before.push(train.avail[cls].label);

  train.refreshes++;
  train.updated = clockNow();
  document.getElementById('train-' + i).innerHTML = trainCardHtml(i);

  let changed = 0;
  for (let k = 0; k < train.classes.length; k++) {
    if (train.avail[train.classes[k]].label !== before[k]) changed++;
  }

  const changeText = changed > 0 ? changed + ' class(es) changed' : 'no change';
  showAlert('Refreshed', 'Availability refreshed for ' + train.number + ' ' + train.name + ': ' + changeText + '.');
}


/*
   7. PNR status page
   */

const pnrInput = document.getElementById('pnrInput');

/* Runs on every key press in the PNR box: keeps digits only (max 10) */
function onPnrInput() {
  const typed = pnrInput.value;
  const digits = typed.replace(/\D/g, ''); // remove everything that is not a digit

  pnrInput.value = digits.slice(0, 10);
  document.getElementById('pnrCounter').textContent = pnrInput.value.length + '/10 digits';

  if (/[^\d\s-]/.test(typed)) {
    setError('pnrInput', 'Only digits 0–9 are allowed in a PNR.');
  } else if (digits.length > 10) {
    setError('pnrInput', 'A PNR has exactly 10 digits, so the extra digits were removed.');
  } else {
    setError('pnrInput', '');
  }
}

/* The "Try a sample PNR" buttons */
function trySample(pnr) {
  pnrInput.value = pnr;
  onPnrInput();
  checkPnr();
}

/* Runs when "Check status" is pressed */
function checkPnr(event) {
  if (event) event.preventDefault(); // stop the page from reloading

  const pnr = pnrInput.value;
  const box = document.getElementById('pnrResult');

  // 1. Validate
  if (pnr.length !== 10) {
    const message = pnr === '' ? 'Please enter your 10-digit PNR number.' : 'Invalid PNR: please enter exactly 10 digits.';
    setError('pnrInput', message);
    box.innerHTML = `<div class="empty error-box"><h3>Invalid PNR</h3>
      <p>${message} A PNR is the 10-digit number printed at the top of your ticket.</p></div>`;
    showAlert('❌ Error', message);
    return;
  }
  setError('pnrInput', '');

  // 2. Look it up
  const booking = lookupPnr(pnr);
  if (booking === null) {
    box.innerHTML = `<div class="empty error-box"><h3>PNR ${pnr} not found</h3>
      <p>No booking matches this PNR. It may be mistyped, or the record was removed after the journey.</p></div>`;
    showAlert('PNR not found', 'PNR ' + pnr + ' not found. Please check the number and try again.');
    return;
  }

  // 3. Show it
  box.innerHTML = pnrResultHtml(booking);
  const allCancelled = booking.passengers.every(function (p) { return p.current.type === 'CAN'; });
  showAlert(allCancelled ? '⚠️ Warning' : 'PNR checked', 'PNR ' + pnr + ' checked: ' + pnrSummary(booking) + '.');
}

/* A short summary like "2 of 3 passengers still on waitlist" */
function pnrSummary(booking) {
  const count = { CNF: 0, RAC: 0, WL: 0, CAN: 0 };
  for (const p of booking.passengers) count[p.current.type]++;
  const n = booking.passengers.length;
  const total = n + (n === 1 ? ' passenger' : ' passengers');

  if (count.CAN === booking.passengers.length) return 'booking cancelled for ' + total;
  if (count.WL > 0) return count.WL + ' of ' + total + ' still on waitlist';
  if (count.RAC > 0) return count.RAC + ' of ' + total + ' in RAC';
  if (count.CAN > 0) return count.CNF + ' confirmed, ' + count.CAN + ' cancelled';
  return 'all ' + total + ' confirmed';
}

/* What to show in the "Prediction" column for one passenger */
function predictionHtml(passenger, booking) {
  const type = passenger.current.type;
  if (type === 'CNF') return '<small class="muted">Already confirmed</small>';
  if (type === 'CAN') return '<small class="muted">Cancelled</small>';
  if (booking.chartPrepared) return '<small class="muted">Chart prepared: not confirmed</small>';

  return chanceHtml({
    type: type,
    position: passenger.current.pos,
    cls: booking.cls,
    quota: booking.quota,
    daysLeft: booking.journeyOffset,
    popularity: makeRandom('pop' + booking.train.number).between(0.45, 0.92),
    trainNumber: booking.train.number,
    racPool: CLASSES[booking.cls].racPlaces,
  });
}

/* The full PNR result card */
function pnrResultHtml(b) {
  const from = STATIONS[b.from];
  const to = STATIONS[b.to];
  const arrival = b.departure + b.duration;
  const extraDays = Math.floor(arrival / 1440);
  const allCancelled = b.passengers.every(function (p) { return p.current.type === 'CAN'; });
  const anyWaitlisted = b.passengers.some(function (p) { return p.current.type === 'WL'; });

  const chart = b.chartPrepared
    ? '<span class="badge green">✓ Chart Prepared</span>'
    : '<span class="badge gray">🕒 Chart Not Prepared</span>';

  // Warning box for cancelled bookings, or waitlisted after the chart
  let banner = '';
  if (allCancelled) {
    banner = '<div class="note"><b>This booking has been cancelled.</b><br>Any refund is credited to the original payment method in 5–7 working days (simulated).</div>';
  } else if (b.chartPrepared && anyWaitlisted) {
    banner = '<div class="note warning"><b>Chart prepared.</b><br>Passengers still waitlisted after charting cannot board on an e-ticket.</div>';
  }

  let rows = '';
  for (let i = 0; i < b.passengers.length; i++) {
    const p = b.passengers[i];
    rows += `
      <tr>
        <td>Passenger ${i + 1}</td>
        <td>${badge(p.booking.type, statusText(p.booking, b.cls))}</td>
        <td>${badge(p.current.type, statusText(p.current, b.cls))}</td>
        <td>${predictionHtml(p, b)}</td>
      </tr>`;
  }

  return `
    <div class="card">
      <div class="train-head">
        <div>
          <h3>PNR ${b.pnr}</h3>
          <p class="muted">${pnrSummary(b)}</p>
        </div>
        ${chart}
      </div>

      ${banner}

      <table class="info">
        <tr><td>Train</td><td>${b.train.number} ${b.train.name}</td></tr>
        <tr><td>Journey date</td><td>${formatDate(addDays(today(), b.journeyOffset))}</td></tr>
        <tr><td>Class</td><td>${b.cls} · ${CLASSES[b.cls].name}</td></tr>
        <tr><td>Quota</td><td>${QUOTAS[b.quota].name} (${b.quota})</td></tr>
        <tr><td>Boarding</td><td>${from.name} (${from.code}) · ${formatTime(b.departure)}</td></tr>
        <tr><td>Destination</td><td>${to.name} (${to.code}) · ${formatTime(arrival)}${extraDays ? ' (+' + extraDays + ' day)' : ''}</td></tr>
      </table>

      <div class="table-wrap">
        <table>
          <tr><th>Passenger</th><th>Booking status</th><th>Current status</th><th>Prediction</th></tr>
          ${rows}
        </table>
      </div>

      <p class="muted"><small>Checked at ${clockNow()}. Prediction = simulated chance of a confirmed berth based on past
        cancellations (HIGH above 70%, MEDIUM 35–70%, LOW below 35%). Hover over a prediction to see why.</small></p>
    </div>`;
}


/*
   8. Start-up: fill the station list, quota list and date limits
*/

// Station suggestions for the From / To boxes
let stationOptions = '';
for (const code in STATIONS) {
  stationOptions += `<option value="${STATIONS[code].label}"></option>`;
}
document.getElementById('stationList').innerHTML = stationOptions;

// Quota dropdown
let quotaOptions = '';
for (const code in QUOTAS) {
  quotaOptions += `<option value="${code}">${QUOTAS[code].name} (${code})</option>`;
}
quotaSelect.innerHTML = quotaOptions;

// Date: from today up to 120 days ahead, 4 days from today by default
dateInput.min = toISO(today());
dateInput.max = toISO(addDays(today(), MAX_DAYS_AHEAD));
dateInput.value = toISO(addDays(today(), 4));