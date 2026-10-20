/**
 * data.js
 * ---------------------------------------------------------------------------
 * Mock reference data and deterministic (seeded) generators for the simulator:
 *   - seeded pseudo-random number generator (same input -> same output)
 *   - date helpers (local calendar dates, no timezone surprises)
 *   - stations, travel classes, quotas, train types, festival seasons
 *   - train generator for a route, availability generator, fare calculator
 *   - simulated historical cancellation data (used by probability.js)
 *   - sample PNRs (used by pnr.js)
 *
 * NOTHING here is real IRCTC / Indian Railways data. Station names and codes
 * are real; everything else is simulated.
 *
 * All public members live on a single global namespace: window.RailMatrix
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const RailMatrix = (global.RailMatrix = global.RailMatrix || {});

  /* ======================================================================
   * 1. Seeded pseudo-random number generator
   * ==================================================================== */

  /** Hash any string into a 32-bit unsigned integer (cyrb53-style mixing). */
  function hashString(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }

  /** Mulberry32: tiny, fast PRNG returning floats in [0, 1). */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Create a seeded RNG from any number of "key parts".
   * createRng('avl', '12497', '2026-10-24', 'GN', 'SL') always yields the same sequence.
   */
  function createRng(...parts) {
    const next = mulberry32(hashString(parts.join('|')));
    return {
      next,
      range: (min, max) => min + next() * (max - min),
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      chance: (p) => next() < p,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      /** entries: [{ value, weight }] */
      weighted(entries) {
        const total = entries.reduce((sum, e) => sum + e.weight, 0);
        let r = next() * total;
        for (const e of entries) {
          r -= e.weight;
          if (r < 0) return e.value;
        }
        return entries[entries.length - 1].value;
      },
    };
  }

  /* ======================================================================
   * 2. Date helpers (all dates are local calendar dates at 00:00)
   * ==================================================================== */

  const MS_PER_DAY = 86400000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const pad2 = (n) => String(n).padStart(2, '0');

  function startOfToday() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  /** Parse "YYYY-MM-DD" into a local Date. Returns null for malformed or impossible dates. */
  function parseISODate(str) {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const [y, m, day] = str.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
    return d;
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  /** Whole calendar days from a to b (DST-safe). */
  function daysBetween(a, b) {
    const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / MS_PER_DAY);
  }

  function daysFromToday(d) {
    return daysBetween(startOfToday(), d);
  }

  /** Monday = 0 ... Sunday = 6 */
  function weekdayIndex(d) {
    return (d.getDay() + 6) % 7;
  }

  function formatDate(d) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatDateLong(d) {
    return `${WEEKDAYS[weekdayIndex(d)]}, ${formatDate(d)}`;
  }

  function formatShortDate(d) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  /** Minutes since midnight -> "HH:MM" (wraps past midnight). */
  function formatTime(minutes) {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  }

  function formatDuration(minutes) {
    return `${Math.floor(minutes / 60)}h ${pad2(minutes % 60)}m`;
  }

  /** Date object -> "10:42 AM" */
  function formatClock(date) {
    let h = date.getHours();
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${pad2(date.getMinutes())} ${suffix}`;
  }

  /* ======================================================================
   * 3. Global booking rules
   * ==================================================================== */

  const RULES = Object.freeze({
    MAX_ADVANCE_DAYS: 120, // Advance Reservation Period
    TATKAL_MAX_DAYS_AHEAD: 1, // Tatkal: journeys today or tomorrow only (the "next 2 days")
    MIN_TRAIN_DISTANCE_KM: 60, // stations closer than this have no long-distance trains
    TATKAL_OPEN_AC: '10:00 AM',
    TATKAL_OPEN_NON_AC: '11:00 AM',
  });

  /* ======================================================================
   * 4. Stations (real names and codes, approximate coordinates)
   * ==================================================================== */

  const STATIONS = [
    { code: 'NDLS', name: 'New Delhi', city: 'New Delhi', lat: 28.643, lon: 77.219 },
    { code: 'DLI', name: 'Delhi Junction', city: 'Delhi', lat: 28.661, lon: 77.228 },
    { code: 'NZM', name: 'Hazrat Nizamuddin', city: 'Delhi', lat: 28.588, lon: 77.253 },
    { code: 'BCT', name: 'Mumbai Central', city: 'Mumbai', lat: 18.97, lon: 72.819 },
    { code: 'CSMT', name: 'Mumbai CSMT', city: 'Mumbai', lat: 18.94, lon: 72.835 },
    { code: 'LTT', name: 'Lokmanya Tilak Terminus', city: 'Mumbai', lat: 19.069, lon: 72.891 },
    { code: 'HWH', name: 'Howrah Junction', city: 'Kolkata', lat: 22.584, lon: 88.342 },
    { code: 'SDAH', name: 'Sealdah', city: 'Kolkata', lat: 22.567, lon: 88.37 },
    { code: 'MAS', name: 'Chennai Central', city: 'Chennai', lat: 13.083, lon: 80.275 },
    { code: 'SBC', name: 'KSR Bengaluru', city: 'Bengaluru', lat: 12.978, lon: 77.569 },
    { code: 'LDH', name: 'Ludhiana Junction', city: 'Ludhiana', lat: 30.912, lon: 75.849 },
    { code: 'JUC', name: 'Jalandhar City', city: 'Jalandhar', lat: 31.335, lon: 75.58 },
    { code: 'ASR', name: 'Amritsar Junction', city: 'Amritsar', lat: 31.633, lon: 74.866 },
    { code: 'CDG', name: 'Chandigarh', city: 'Chandigarh', lat: 30.705, lon: 76.822 },
    { code: 'JAT', name: 'Jammu Tawi', city: 'Jammu', lat: 32.706, lon: 74.877 },
    { code: 'DDN', name: 'Dehradun', city: 'Dehradun', lat: 30.316, lon: 78.033 },
    { code: 'LKO', name: 'Lucknow Charbagh', city: 'Lucknow', lat: 26.832, lon: 80.923 },
    { code: 'CNB', name: 'Kanpur Central', city: 'Kanpur', lat: 26.453, lon: 80.351 },
    { code: 'PRYJ', name: 'Prayagraj Junction', city: 'Prayagraj', lat: 25.446, lon: 81.827 },
    { code: 'BSB', name: 'Varanasi Junction', city: 'Varanasi', lat: 25.327, lon: 82.986 },
    { code: 'GKP', name: 'Gorakhpur Junction', city: 'Gorakhpur', lat: 26.759, lon: 83.38 },
    { code: 'PNBE', name: 'Patna Junction', city: 'Patna', lat: 25.603, lon: 85.137 },
    { code: 'JP', name: 'Jaipur Junction', city: 'Jaipur', lat: 26.919, lon: 75.788 },
    { code: 'JU', name: 'Jodhpur Junction', city: 'Jodhpur', lat: 26.284, lon: 73.024 },
    { code: 'UDZ', name: 'Udaipur City', city: 'Udaipur', lat: 24.569, lon: 73.708 },
    { code: 'AGC', name: 'Agra Cantt', city: 'Agra', lat: 27.158, lon: 77.99 },
    { code: 'ADI', name: 'Ahmedabad Junction', city: 'Ahmedabad', lat: 23.026, lon: 72.601 },
    { code: 'BPL', name: 'Bhopal Junction', city: 'Bhopal', lat: 23.267, lon: 77.413 },
    { code: 'INDB', name: 'Indore Junction', city: 'Indore', lat: 22.717, lon: 75.868 },
    { code: 'NGP', name: 'Nagpur Junction', city: 'Nagpur', lat: 21.152, lon: 79.088 },
    { code: 'PUNE', name: 'Pune Junction', city: 'Pune', lat: 18.529, lon: 73.874 },
    { code: 'MAO', name: 'Madgaon', city: 'Goa', lat: 15.273, lon: 73.968 },
    { code: 'SC', name: 'Secunderabad Junction', city: 'Hyderabad', lat: 17.434, lon: 78.501 },
    { code: 'BZA', name: 'Vijayawada Junction', city: 'Vijayawada', lat: 16.518, lon: 80.619 },
    { code: 'VSKP', name: 'Visakhapatnam', city: 'Visakhapatnam', lat: 17.722, lon: 83.29 },
    { code: 'BBS', name: 'Bhubaneswar', city: 'Bhubaneswar', lat: 20.267, lon: 85.843 },
    { code: 'GHY', name: 'Guwahati', city: 'Guwahati', lat: 26.183, lon: 91.751 },
    { code: 'ERS', name: 'Ernakulam Junction', city: 'Kochi', lat: 9.969, lon: 76.29 },
    { code: 'TVC', name: 'Thiruvananthapuram Central', city: 'Thiruvananthapuram', lat: 8.487, lon: 76.952 },
    { code: 'CBE', name: 'Coimbatore Junction', city: 'Coimbatore', lat: 11.001, lon: 76.966 },
  ].map((s) => Object.freeze({ ...s, label: `${s.name} (${s.code})` }));

  const STATION_BY_CODE = Object.freeze(
    STATIONS.reduce((map, s) => {
      map[s.code] = s;
      return map;
    }, {})
  );

  const DELHI_CODES = ['NDLS', 'DLI', 'NZM'];

  /** Approximate rail distance: great-circle distance x 1.22 detour factor. */
  function distanceKm(a, b) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.22);
  }

  /* ======================================================================
   * 5. Travel classes
   *    pool     = berths/seats in the General quota pool per journey
   *    racRatio = share of the pool that can be issued as RAC (0 = no RAC)
   *    demand   = extra demand pressure for this class
   * ==================================================================== */

  const CLASSES = {
    '1A': { code: '1A', name: 'First AC', ac: true, perKm: 3.6, minFare: 1200, reservation: 60, superfast: 75,
      tatkalRate: 0.3, tatkalMin: 400, tatkalMax: 500, pool: 18, racRatio: 0, demand: -0.12,
      coachPrefix: 'H', coaches: 1, berthsPerCoach: 24, seats: false },
    '2A': { code: '2A', name: 'AC 2 Tier', ac: true, perKm: 2.1, minFare: 700, reservation: 50, superfast: 45,
      tatkalRate: 0.3, tatkalMin: 400, tatkalMax: 500, pool: 80, racRatio: 0.06, demand: 0,
      coachPrefix: 'A', coaches: 2, berthsPerCoach: 48, seats: false },
    '3A': { code: '3A', name: 'AC 3 Tier', ac: true, perKm: 1.5, minFare: 500, reservation: 40, superfast: 45,
      tatkalRate: 0.3, tatkalMin: 300, tatkalMax: 400, pool: 160, racRatio: 0.07, demand: 0.1,
      coachPrefix: 'B', coaches: 6, berthsPerCoach: 72, seats: false },
    '3E': { code: '3E', name: 'AC 3 Economy', ac: true, perKm: 1.38, minFare: 450, reservation: 40, superfast: 45,
      tatkalRate: 0.3, tatkalMin: 300, tatkalMax: 400, pool: 100, racRatio: 0.06, demand: 0.05,
      coachPrefix: 'M', coaches: 3, berthsPerCoach: 80, seats: false },
    SL: { code: 'SL', name: 'Sleeper', ac: false, perKm: 0.55, minFare: 150, reservation: 20, superfast: 30,
      tatkalRate: 0.1, tatkalMin: 100, tatkalMax: 200, pool: 240, racRatio: 0.08, demand: 0.08,
      coachPrefix: 'S', coaches: 10, berthsPerCoach: 72, seats: false },
    CC: { code: 'CC', name: 'AC Chair Car', ac: true, perKm: 1.3, minFare: 300, reservation: 40, superfast: 45,
      tatkalRate: 0.3, tatkalMin: 125, tatkalMax: 225, pool: 200, racRatio: 0, demand: 0.03,
      coachPrefix: 'C', coaches: 8, berthsPerCoach: 78, seats: true },
    EC: { code: 'EC', name: 'Executive Chair Car', ac: true, perKm: 2.6, minFare: 700, reservation: 60, superfast: 75,
      tatkalRate: 0.3, tatkalMin: 400, tatkalMax: 500, pool: 46, racRatio: 0, demand: -0.1,
      coachPrefix: 'E', coaches: 1, berthsPerCoach: 56, seats: true },
  };

  /** Display order of classes on availability cards. */
  const CLASS_ORDER = ['1A', '2A', '3A', '3E', 'SL', 'EC', 'CC'];

  /** Berth / seat layout repeated along a coach (index 0 = berth 1). */
  const SLEEPER_8 = ['Lower', 'Middle', 'Upper', 'Lower', 'Middle', 'Upper', 'Side Lower', 'Side Upper'];
  const BERTH_PATTERNS = {
    '1A': ['Lower', 'Upper'],
    '2A': ['Lower', 'Upper', 'Lower', 'Upper', 'Side Lower', 'Side Upper'],
    '3A': SLEEPER_8,
    '3E': SLEEPER_8,
    SL: SLEEPER_8,
    CC: ['Window', 'Middle', 'Aisle', 'Aisle', 'Window'],
    EC: ['Window', 'Aisle', 'Aisle', 'Window'],
  };
  const BERTH_TYPE_ORDER = ['Lower', 'Middle', 'Upper', 'Side Lower', 'Side Upper', 'Window', 'Aisle'];

  /** Berth type of berth number n in class cls, e.g. berthTypeFor('SL', 32) -> 'Side Upper'. */
  function berthTypeFor(cls, n) {
    const p = BERTH_PATTERNS[cls];
    return p[(n - 1) % p.length];
  }

  /** Unique berth types for a class with their share of the coach, in a stable order. */
  function berthTypesFor(cls) {
    const pattern = BERTH_PATTERNS[cls];
    const counts = {};
    pattern.forEach((t) => (counts[t] = (counts[t] || 0) + 1));
    return BERTH_TYPE_ORDER.filter((t) => counts[t]).map((t) => ({ type: t, share: counts[t] / pattern.length }));
  }

  /* ======================================================================
   * 6. Quotas
   *    poolFactor  = size of the quota pool relative to the General pool
   *    demandBoost = extra demand pressure on this quota
   *    classes     = classes in which the quota is offered (null = all)
   * ==================================================================== */

  const TATKAL_CLASSES = ['2A', '3A', '3E', 'SL', 'CC', 'EC'];

  const QUOTAS = [
    { code: 'GN', name: 'General', poolFactor: 1, demandBoost: 0, classes: null, note: null },
    { code: 'TQ', name: 'Tatkal', poolFactor: 0.22, demandBoost: 0.18, classes: TATKAL_CLASSES, isTatkal: true,
      note: 'Tatkal opens one day before the journey (10:00 AM for AC, 11:00 AM for non-AC classes). Extra Tatkal charges apply and confirmed Tatkal tickets are not refundable.' },
    { code: 'PT', name: 'Premium Tatkal', poolFactor: 0.1, demandBoost: 0.24, classes: TATKAL_CLASSES, isTatkal: true, dynamic: true,
      note: 'Premium Tatkal follows the Tatkal booking window but uses dynamic fares that rise with demand.' },
    { code: 'SS', name: 'Senior Citizen', poolFactor: 0.06, demandBoost: 0.05, classes: ['2A', '3A', '3E', 'SL'],
      note: 'Eligibility: men aged 60+ and women aged 58+. Lower berths are allotted on priority. Carry valid age proof on board.' },
    { code: 'LD', name: 'Ladies', poolFactor: 0.03, demandBoost: 0.02, classes: ['SL', 'CC'],
      note: 'Eligibility: women travelling alone or with children below 12 years. Offered mainly in Sleeper (SL) and Chair Car (CC).' },
    { code: 'HP', name: 'Divyang', poolFactor: 0.025, demandBoost: 0, classes: ['3A', '3E', 'SL', 'CC'], concession: 0.5,
      note: 'Requires a valid Divyang (disability) concession certificate or UDID card. A 50% fare concession is simulated.' },
    { code: 'FT', name: 'Foreign Tourist', poolFactor: 0.03, demandBoost: -0.05, classes: ['1A', '2A', '3A', 'CC', 'EC'], fareMultiplier: 1.5,
      note: 'Only for foreign passport holders and NRIs. A passport is required at booking and on board.' },
  ];

  const QUOTA_BY_CODE = Object.freeze(
    QUOTAS.reduce((map, q) => {
      map[q.code] = q;
      return map;
    }, {})
  );

  function isQuotaOffered(quotaCode, cls) {
    const q = QUOTA_BY_CODE[quotaCode];
    return !!q && (!q.classes || q.classes.includes(cls));
  }

  /* ======================================================================
   * 7. Festival seasons (recurring every year, month/day ranges)
   * ==================================================================== */

  const FESTIVAL_SEASONS = [
    { name: 'Durga Puja & Dussehra', from: [10, 8], to: [10, 24] },
    { name: 'Diwali & Chhath', from: [10, 25], to: [11, 20] },
    { name: 'Christmas & New Year', from: [12, 20], to: [1, 3] },
    { name: 'Pongal & Makar Sankranti', from: [1, 12], to: [1, 17] },
    { name: 'Holi', from: [3, 1], to: [3, 20] },
    { name: 'Summer vacation', from: [5, 1], to: [6, 30] },
  ];

  function getFestivalSeason(date) {
    const md = (date.getMonth() + 1) * 100 + date.getDate();
    for (const s of FESTIVAL_SEASONS) {
      const a = s.from[0] * 100 + s.from[1];
      const b = s.to[0] * 100 + s.to[1];
      const inSeason = a <= b ? md >= a && md <= b : md >= a || md <= b; // wraps over New Year
      if (inSeason) return s;
    }
    return null;
  }

  /** Extra demand by weekday (Mon..Sun): Friday and Sunday are the busiest. */
  const DOW_DEMAND = [0.02, -0.04, -0.04, 0, 0.08, 0.04, 0.1];

  /* ======================================================================
   * 8. Train types and the train generator
   * ==================================================================== */

  const TRAIN_TYPES = [
    { key: 'RAJ', label: 'Rajdhani', weight: 1.4, max: 1, numPrefix: ['124', '123', '224'], speed: [78, 88],
      classes: ['1A', '2A', '3A'], minKm: 400, maxKm: 3500, delhiOnly: true, daily: 0.6, pop: [0.75, 0.97], fareFactor: 1.28, superfast: true },
    { key: 'DUR', label: 'Duronto', weight: 0.8, max: 1, numPrefix: ['122', '222'], speed: [74, 84],
      classes: ['1A', '2A', '3A', 'SL'], minKm: 600, maxKm: 3500, daily: 0.25, pop: [0.65, 0.9], fareFactor: 1.18, superfast: true },
    { key: 'VB', label: 'Vande Bharat', weight: 1.3, max: 1, numPrefix: ['224', '226', '206'], speed: [80, 95],
      classes: ['CC', 'EC'], minKm: 150, maxKm: 900, daily: 0, dayTrain: true, pop: [0.7, 0.97], fareFactor: 1.38, superfast: true },
    { key: 'SHT', label: 'Shatabdi', weight: 1, max: 1, numPrefix: ['120'], speed: [75, 88],
      classes: ['CC', 'EC'], minKm: 100, maxKm: 800, daily: 0.2, dayTrain: true, pop: [0.65, 0.92], fareFactor: 1.24, superfast: true },
    { key: 'JSH', label: 'Jan Shatabdi', weight: 0.8, max: 1, numPrefix: ['120', '121'], speed: [58, 68],
      classes: ['CC'], minKm: 100, maxKm: 650, daily: 0.7, dayTrain: true, pop: [0.5, 0.85], fareFactor: 1.0, superfast: true },
    { key: 'GR', label: 'Garib Rath', weight: 0.7, max: 1, numPrefix: ['122', '129', '229'], speed: [62, 72],
      classes: ['3E', 'CC'], minKm: 400, maxKm: 3000, daily: 0.15, pop: [0.6, 0.9], fareFactor: 0.82, superfast: true },
    { key: 'HMS', label: 'Humsafar', weight: 0.7, max: 1, numPrefix: ['223', '229'], speed: [60, 70],
      classes: ['3A', 'SL'], minKm: 500, maxKm: 3500, daily: 0.1, pop: [0.45, 0.8], fareFactor: 1.12, superfast: true },
    { key: 'SF', label: 'Superfast', weight: 3, max: 6, numPrefix: ['12', '22'], speed: [55, 66],
      classes: ['1A', '2A', '3A', 'SL'], minKm: 60, maxKm: 4000, daily: 0.65, pop: [0.4, 0.9], fareFactor: 1.0, superfast: true },
    { key: 'EXP', label: 'Mail/Express', weight: 2.5, max: 6, numPrefix: ['11', '13', '14', '15', '18', '19'], speed: [46, 56],
      classes: ['2A', '3A', 'SL'], minKm: 60, maxKm: 4000, daily: 0.6, pop: [0.3, 0.8], fareFactor: 0.95, superfast: false },
  ];

  const NAMED_TRAINS = [
    'Paschim', 'Purvottar', 'Golden Temple', 'Ganga', 'Kaveri', 'Godavari', 'Sabarmati', 'Tapti Ganga',
    'Saryu Yamuna', 'Brahmaputra', 'Sutlej', 'Narmada', 'Konark', 'Chambal', 'Malwa', 'Vindhyachal',
    'Himgiri', 'Kashi Vishwanath', 'Gomti', 'Saurashtra', 'Gitanjali', 'Coromandel', 'Navjeevan',
    'Jhelum', 'Amarnath', 'Mahananda', 'Shalimar', 'Dakshin', 'Utkal', 'Avadh Assam',
  ];
  const SF_SUFFIXES = ['Superfast Express', 'Express', 'Mail', 'Sampark Kranti Express', 'Intercity Express', 'Antyodaya Express'];

  function trainName(rng, type, from, to) {
    const pair = `${from.city}–${to.city}`;
    switch (type.key) {
      case 'RAJ': {
        const other = DELHI_CODES.includes(from.code) ? to : from;
        return `${other.city} Rajdhani Express`;
      }
      case 'DUR': return `${pair} Duronto Express`;
      case 'VB': return `${pair} Vande Bharat Express`;
      case 'SHT': return `${to.city} Shatabdi Express`;
      case 'JSH': return `${pair} Jan Shatabdi Express`;
      case 'GR': return `${pair} Garib Rath Express`;
      case 'HMS': return `${pair} Humsafar Express`;
      case 'SF':
        return rng.chance(0.5) ? `${rng.pick(NAMED_TRAINS)} ${rng.pick(SF_SUFFIXES)}` : `${pair} ${rng.pick(SF_SUFFIXES)}`;
      default:
        return rng.chance(0.6) ? `${rng.pick(NAMED_TRAINS)} Express` : `${from.city}–${to.city} Mail`;
    }
  }

  /** Array of 7 flags (Mon..Sun) saying which days the train runs. */
  function makeRunningDays(rng, type) {
    if (rng.chance(type.daily)) return [1, 1, 1, 1, 1, 1, 1];
    const days = [0, 0, 0, 0, 0, 0, 0];
    const kind = type.dayTrain
      ? 'six'
      : rng.weighted([
          { value: 'three', weight: 3 },
          { value: 'two', weight: 2 },
          { value: 'weekly', weight: 2 },
          { value: 'six', weight: 1 },
        ]);
    const s = rng.int(0, 6);
    if (kind === 'six') {
      days.fill(1);
      days[s] = 0;
    } else if (kind === 'three') {
      days[s] = days[(s + 2) % 7] = days[(s + 4) % 7] = 1;
    } else if (kind === 'two') {
      days[s] = days[(s + 3) % 7] = 1;
    } else {
      days[s] = 1;
    }
    return days;
  }

  /** Popularity (0..1) for a train that did not come from the route generator (e.g. PNR trains). */
  function popularityForTrainNumber(number) {
    return Math.round(createRng('pop', number).range(0.45, 0.92) * 100) / 100;
  }

  /**
   * Generate trains for a route that run on the given date.
   * Trains come from a route-seeded stream, so the same train (number, name,
   * timings, running days) appears on every date it runs.
   *
   * @returns {{ trains: object[], distance: number, reason: string|null }}
   *          reason: null | 'invalid' | 'too-close' | 'not-running'
   */
  function getTrainsForRoute(fromCode, toCode, dateISO) {
    const from = STATION_BY_CODE[fromCode];
    const to = STATION_BY_CODE[toCode];
    const date = parseISODate(dateISO);
    if (!from || !to || !date || from.code === to.code) {
      return { trains: [], distance: 0, reason: 'invalid' };
    }
    const distance = distanceKm(from, to);
    if (distance < RULES.MIN_TRAIN_DISTANCE_KM) {
      return { trains: [], distance, reason: 'too-close' };
    }

    const involvesDelhi = DELHI_CODES.includes(from.code) || DELHI_CODES.includes(to.code);
    const eligible = TRAIN_TYPES.filter(
      (t) => distance >= t.minKm && distance <= t.maxKm && (!t.delhiOnly || involvesDelhi)
    );

    const routeRng = createRng('route', from.code, to.code);
    const target = createRng('count', from.code, to.code, dateISO).int(5, 8);
    const weekday = weekdayIndex(date);
    const typeCount = {};
    const usedNames = new Set();
    const usedNumbers = new Set();
    const trains = [];

    for (let i = 0; i < 80 && trains.length < target; i++) {
      const available = eligible.filter((t) => (typeCount[t.key] || 0) < t.max);
      if (!available.length) break;
      const type = routeRng.weighted(available.map((t) => ({ value: t, weight: t.weight })));

      const name = trainName(routeRng, type, from, to);
      const prefix = routeRng.pick(type.numPrefix);
      let number = prefix;
      while (number.length < 5) number += String(routeRng.int(0, 9));
      const speed = routeRng.range(type.speed[0], type.speed[1]);
      let departure;
      if (type.dayTrain) {
        const win = routeRng.pick([[330, 480], [840, 1020]]);
        departure = Math.round(routeRng.int(win[0], win[1]) / 5) * 5;
      } else {
        departure = Math.round(routeRng.int(0, 1435) / 5) * 5;
      }
      const duration = Math.max(
        45,
        Math.round(((distance / speed) * 60 * routeRng.range(0.95, 1.1) + routeRng.int(5, 30)) / 5) * 5
      );
      const runningDays = makeRunningDays(routeRng, type);
      const popularity = Math.round(routeRng.range(type.pop[0], type.pop[1]) * 100) / 100;
      let classes = type.classes.slice();
      if (type.key === 'SF') {
        if (routeRng.chance(0.4)) classes = classes.filter((c) => c !== '1A');
        if (routeRng.chance(0.35)) classes.push('3E');
      } else if (type.key === 'EXP' && routeRng.chance(0.25)) {
        classes.push('1A');
      }

      if (usedNames.has(name) || usedNumbers.has(number)) continue; // duplicate, try the next candidate
      usedNames.add(name);
      usedNumbers.add(number);
      typeCount[type.key] = (typeCount[type.key] || 0) + 1;

      if (!runningDays[weekday]) continue; // does not run on the chosen day

      trains.push(
        Object.freeze({
          number,
          name,
          type: type.key,
          typeLabel: type.label,
          from: from.code,
          to: to.code,
          distance,
          departure,
          duration,
          arrival: departure + duration,
          arrivalDayOffset: Math.floor((departure + duration) / 1440),
          runningDays,
          classes: CLASS_ORDER.filter((c) => classes.includes(c)),
          popularity,
          fareFactor: type.fareFactor,
          superfast: type.superfast,
        })
      );
    }

    trains.sort((a, b) => a.departure - b.departure);
    return { trains, distance, reason: trains.length ? null : 'not-running' };
  }

  /* ======================================================================
   * 9. Fare calculator
   * ==================================================================== */

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /**
   * @param {object} train     needs distance, fareFactor, superfast
   * @param {string} cls       class code
   * @param {string} quotaCode quota code
   * @param {number} pressure  demand pressure (only used for Premium Tatkal dynamic pricing)
   * @returns {{ total: number, parts: {label: string, amount: number}[] }}
   */
  function computeFare(train, cls, quotaCode, pressure) {
    const c = CLASSES[cls];
    const q = QUOTA_BY_CODE[quotaCode] || QUOTA_BY_CODE.GN;
    const base = Math.max(c.minFare, Math.round(c.perKm * train.distance * train.fareFactor));
    const parts = [
      { label: 'Base fare', amount: base },
      { label: 'Reservation charge', amount: c.reservation },
    ];
    if (train.superfast) parts.push({ label: 'Superfast charge', amount: c.superfast });
    if (q.isTatkal) {
      const tatkal = clamp(Math.round(base * c.tatkalRate), c.tatkalMin, c.tatkalMax);
      parts.push({ label: 'Tatkal charge', amount: tatkal });
      if (q.dynamic) {
        const surge = clamp(0.25 + (pressure || 0.8) * 0.4, 0.2, 0.9);
        parts.push({ label: 'Dynamic pricing surcharge', amount: Math.round((base + tatkal) * surge) });
      }
    }
    if (q.fareMultiplier) {
      parts.push({ label: 'Foreign tourist surcharge', amount: Math.round(base * (q.fareMultiplier - 1)) });
    }
    if (q.concession) {
      parts.push({ label: 'Divyang concession (50%)', amount: -Math.round(base * q.concession) });
    }
    const subtotal = parts.reduce((s, p) => s + p.amount, 0);
    if (c.ac) parts.push({ label: 'GST (5%)', amount: Math.round(subtotal * 0.05) });
    const total = Math.round(parts.reduce((s, p) => s + p.amount, 0) / 5) * 5;
    return { total, parts };
  }

  /* ======================================================================
   * 10. Availability generator
   * ==================================================================== */

  /** Demand pressure: ~0.2 (quiet) .. ~1.6 (sold out with a long waitlist). */
  function demandPressure(train, cls, quotaCode, date) {
    const q = QUOTA_BY_CODE[quotaCode];
    const days = clamp(daysFromToday(date), 0, RULES.MAX_ADVANCE_DAYS);
    const closeness = 1 - days / RULES.MAX_ADVANCE_DAYS;
    const festival = getFestivalSeason(date) ? 0.22 : 0;
    return (
      -0.05 +
      train.popularity * 0.5 +
      closeness * 0.32 +
      DOW_DEMAND[weekdayIndex(date)] +
      festival +
      CLASSES[cls].demand +
      q.demandBoost
    );
  }

  /** Split `count` free berths across berth types (deterministic for a given rng). */
  function distributeBerths(rng, cls, count) {
    const types = berthTypesFor(cls);
    const weights = types.map((t) => t.share * rng.range(0.5, 1.5));
    const totalW = weights.reduce((s, w) => s + w, 0);
    const raw = weights.map((w) => (w / totalW) * count);
    const result = types.map((t, i) => ({ type: t.type, count: Math.floor(raw[i]) }));
    let remainder = count - result.reduce((s, r) => s + r.count, 0);
    const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
    for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) result[order[k].i].count++;
    return result;
  }

  /** When the Tatkal window opens for a journey date (the day before, 10 or 11 AM). */
  function tatkalOpensAt(journeyDate, cls) {
    return {
      date: addDays(journeyDate, -1),
      time: CLASSES[cls].ac ? RULES.TATKAL_OPEN_AC : RULES.TATKAL_OPEN_NON_AC,
    };
  }

  /**
   * Simulated availability for one train + date + quota + class.
   * Deterministic: the same inputs (including refreshCount) always produce the same result.
   *
   * status: 'AVL' | 'RAC' | 'WL' | 'NA' (quota not offered) | 'NOT_OPEN' (Tatkal window closed)
   */
  function getAvailability(train, cls, quotaCode, dateISO, refreshCount) {
    const c = CLASSES[cls];
    const q = QUOTA_BY_CODE[quotaCode];
    const date = parseISODate(dateISO);
    const base = { cls, quotaCode, pool: 0, racPool: 0, count: 0, berths: [], fare: null };

    if (!isQuotaOffered(quotaCode, cls)) {
      return { ...base, status: 'NA', label: 'NOT OFFERED' };
    }

    const pressure = demandPressure(train, cls, quotaCode, date);
    const fare = computeFare(train, cls, quotaCode, pressure);

    if (q.isTatkal && daysFromToday(date) > RULES.TATKAL_MAX_DAYS_AHEAD) {
      return { ...base, fare, status: 'NOT_OPEN', label: 'NOT OPEN YET', opensAt: tatkalOpensAt(date, cls) };
    }

    const rng = createRng('avl', train.number, dateISO, quotaCode, cls);
    const pool = Math.max(2, Math.round(c.pool * q.poolFactor));
    const racPool = c.racRatio ? Math.max(1, Math.round(pool * c.racRatio)) : 0;

    let net = Math.round(pool * (0.95 - pressure) + rng.range(-0.15, 0.15) * pool);
    // Each refresh drifts availability a little (bookings and cancellations "happen").
    for (let i = 1; i <= (refreshCount || 0); i++) {
      net += createRng('refresh', train.number, dateISO, quotaCode, cls, i).int(-5, 4);
    }
    net = Math.min(net, pool);

    const result = { ...base, pool, racPool, fare, pressure };
    if (net > 0) {
      return {
        ...result,
        status: 'AVL',
        count: net,
        label: `AVAILABLE ${net}`,
        berths: distributeBerths(createRng('berths', train.number, dateISO, quotaCode, cls, net), cls, net),
      };
    }
    const overflow = 1 - net; // net 0 -> first RAC/WL position is 1
    if (racPool && overflow <= racPool) {
      return { ...result, status: 'RAC', count: overflow, label: `RAC ${overflow}`, berths: distributeBerths(rng, cls, 0) };
    }
    const wl = overflow - racPool;
    return { ...result, status: 'WL', count: wl, label: `WL ${wl}`, berths: distributeBerths(rng, cls, 0) };
  }

  /* ======================================================================
   * 11. Historical cancellation data (feeds probability.js)
   * ==================================================================== */

  const CANCELLATION_DATA = Object.freeze({
    /** Average cancellations per journey in the General quota, by class. */
    basePerJourney: { SL: 110, '3A': 65, '3E': 38, '2A': 28, '1A': 8, CC: 45, EC: 10 },
    /** Tickets in some quotas are rarely cancelled (e.g. no refund on confirmed Tatkal). */
    quotaFactor: { GN: 1, TQ: 0.4, PT: 0.2, SS: 0.6, LD: 0.5, HP: 0.5, FT: 0.3 },
    /** Cancellation tendency by weekday of travel (Mon..Sun). Weekend travellers hold on to tickets. */
    dowFactor: [1.05, 1.08, 1.08, 1.02, 0.92, 0.97, 0.9],
    /** Festival travellers rarely cancel. */
    festivalFactor: 0.78,
    /** Typical RAC pool when the exact train is unknown (standalone predictor / PNR). */
    defaultRacPool: { SL: 19, '3A': 11, '3E': 6, '2A': 5, '1A': 0, CC: 0, EC: 0 },
  });

  /**
   * Cancellations per journey for the last 8 weeks (oldest first).
   * Seeded per week (aligned to Mondays) so values stay stable during a week.
   * Popular trains see fewer cancellations relative to their size.
   */
  function getCancellationHistory(trainKey, cls, popularity) {
    const today = startOfToday();
    const thisMonday = addDays(today, -weekdayIndex(today));
    const base = CANCELLATION_DATA.basePerJourney[cls] * (1.1 - 0.3 * popularity);
    const weeks = [];
    for (let w = 8; w >= 1; w--) {
      const weekStart = addDays(thisMonday, -7 * w);
      const rng = createRng('hist', trainKey, cls, toISODate(weekStart));
      const fest = getFestivalSeason(weekStart) ? CANCELLATION_DATA.festivalFactor : 1;
      weeks.push({
        weekStart,
        label: formatShortDate(weekStart),
        value: Math.max(0, Math.round(base * fest * rng.range(0.72, 1.28))),
      });
    }
    return weeks;
  }

  /* ======================================================================
   * 12. Sample PNRs (fixed scenarios for the demo chips)
   *     journeyOffset = days from today, so the chart status stays sensible.
   *     Status objects: {type:'CNF', coach, berth} | {type:'RAC', pos} | {type:'WL', pos} | {type:'CAN'}
   * ==================================================================== */

  const SAMPLE_PNRS = [
    {
      pnr: '2345678901', label: 'Confirmed', tone: 'success',
      train: { number: '12029', name: 'Swarna Shatabdi Express' },
      from: 'ASR', to: 'NDLS', departure: 16 * 60 + 55, duration: 6 * 60 + 5,
      journeyOffset: 0, cls: 'CC', quota: 'GN', chartPrepared: true,
      passengers: [
        { booking: { type: 'CNF', coach: 'C2', berth: 21 }, current: { type: 'CNF', coach: 'C2', berth: 21 } },
        { booking: { type: 'WL', pos: 2 }, current: { type: 'CNF', coach: 'C4', berth: 58 } },
      ],
    },
    {
      pnr: '4521896307', label: 'Waitlisted', tone: 'danger',
      train: { number: '12497', name: 'Shan-e-Punjab Express' },
      from: 'NDLS', to: 'LDH', departure: 6 * 60 + 40, duration: 4 * 60 + 30,
      journeyOffset: 4, cls: 'SL', quota: 'GN', chartPrepared: false,
      passengers: [
        { booking: { type: 'WL', pos: 21 }, current: { type: 'RAC', pos: 18 } },
        { booking: { type: 'WL', pos: 22 }, current: { type: 'WL', pos: 1 } },
        { booking: { type: 'WL', pos: 23 }, current: { type: 'WL', pos: 2 } },
      ],
    },
    {
      pnr: '6123409875', label: 'RAC', tone: 'warning',
      train: { number: '12951', name: 'Mumbai Rajdhani Express' },
      from: 'BCT', to: 'NDLS', departure: 17 * 60, duration: 15 * 60 + 32,
      journeyOffset: 2, cls: '3A', quota: 'GN', chartPrepared: false,
      passengers: [
        { booking: { type: 'RAC', pos: 5 }, current: { type: 'RAC', pos: 2 } },
        { booking: { type: 'RAC', pos: 6 }, current: { type: 'RAC', pos: 3 } },
      ],
    },
    {
      pnr: '8102938475', label: 'Cancelled', tone: 'neutral',
      train: { number: '12301', name: 'Howrah Rajdhani Express' },
      from: 'HWH', to: 'NDLS', departure: 16 * 60 + 50, duration: 17 * 60 + 10,
      journeyOffset: 6, cls: '2A', quota: 'GN', chartPrepared: false,
      passengers: [
        { booking: { type: 'CNF', coach: 'A1', berth: 12 }, current: { type: 'CAN' } },
        { booking: { type: 'CNF', coach: 'A1', berth: 13 }, current: { type: 'CAN' } },
      ],
    },
  ];

  /* ======================================================================
   * Public API
   * ==================================================================== */

  RailMatrix.rng = Object.freeze({ hashString, createRng });
  RailMatrix.dates = Object.freeze({
    MONTHS, WEEKDAYS, WEEKDAYS_LONG,
    startOfToday, toISODate, parseISODate, addDays, daysBetween, daysFromToday, weekdayIndex,
    formatDate, formatDateLong, formatShortDate, formatTime, formatDuration, formatClock,
  });
  RailMatrix.data = Object.freeze({
    RULES, STATIONS, STATION_BY_CODE, CLASSES, CLASS_ORDER, QUOTAS, QUOTA_BY_CODE,
    FESTIVAL_SEASONS, TRAIN_TYPES, CANCELLATION_DATA, SAMPLE_PNRS,
    distanceKm, berthTypeFor, berthTypesFor, isQuotaOffered, getFestivalSeason, tatkalOpensAt,
    getTrainsForRoute, getAvailability, computeFare, demandPressure, getCancellationHistory,
    popularityForTrainNumber, clamp,
  });
})(window);
