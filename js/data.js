/*
 * data.js
 * ---------------------------------------------------------------------------
 * This file holds all the "fake" data for the simulator, plus small helper
 * functions that the other files use.
 *
 * What is inside (in order):
 *   1. A random number generator that always gives the SAME numbers
 *      for the SAME input (so a PNR always shows the same result)
 *   2. Date helpers (format dates, add days, ...)
 *   3. Booking rules (how many days ahead you can book, Tatkal timings)
 *   4. Stations (real names and codes)
 *   5. Travel classes (Sleeper, AC 3 Tier, ...)
 *   6. Quotas (General, Tatkal, Ladies, ...)
 *   7. Festival seasons
 *   8. Train generator (makes a list of trains for a route)
 *   9. Fare calculator
 *  10. Availability generator (AVAILABLE / RAC / WL)
 *  11. Past cancellation data (used by probability.js)
 *  12. Sample PNRs (used by pnr.js)
 *
 * NOTHING here is real IRCTC / Indian Railways data. Only the station names
 * and codes are real; everything else is made up.
 *
 * Note: this file is loaded first (see index.html), so every function and
 * constant declared here can be used directly in probability.js, pnr.js
 * and app.js.
 * ---------------------------------------------------------------------------
 */

/* ==========================================================================
 * 1. Random number generator that can be "repeated"
 * --------------------------------------------------------------------------
 * Math.random() gives different numbers every time. For a simulator we want
 * the opposite: the same train on the same day should always show the same
 * availability. So we turn some text (like "avl|12497|2026-10-24|GN|SL")
 * into a number (a "seed"), and use that seed to produce random-looking
 * numbers. Same text -> same seed -> same numbers.
 *
 * You don't need to understand the maths in hashString() and
 * makeRandomFunction(); just know what they do.
 * ======================================================================== */

/* Turns any text into a whole number between 0 and 4,294,967,295. */
function hashString(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ charCode, 2654435761);
    h2 = Math.imul(h2 ^ charCode, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/*
 * Returns a function. Every time you call that function it gives the next
 * "random" decimal number between 0 (included) and 1 (not included).
 * (This algorithm is called "Mulberry32".)
 */
function makeRandomFunction(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Creates a random number generator from a list of "keys".
 * Example:
 *   const random = createRandomGenerator(['avl', '12497', '2026-10-24', 'GN', 'SL']);
 *   random.int(1, 6);  // a whole number from 1 to 6 (always the same one for these keys)
 */
function createRandomGenerator(keys) {
  const nextRandom = makeRandomFunction(hashString(keys.join('|')));

  return {
    // A decimal number from 0 to 1
    next: function () {
      return nextRandom();
    },

    // A decimal number from min to max
    range: function (min, max) {
      return min + nextRandom() * (max - min);
    },

    // A whole number from min to max (both included)
    int: function (min, max) {
      return min + Math.floor(nextRandom() * (max - min + 1));
    },

    // true with the given probability. chance(0.3) is true about 30% of the time.
    chance: function (probability) {
      return nextRandom() < probability;
    },

    // One random item from a list
    pick: function (list) {
      return list[Math.floor(nextRandom() * list.length)];
    },

    // One random value, where bigger "weight" = more likely.
    // options looks like: [{ value: 'GN', weight: 70 }, { value: 'TQ', weight: 12 }]
    weighted: function (options) {
      let totalWeight = 0;
      for (const option of options) {
        totalWeight += option.weight;
      }
      let randomPoint = nextRandom() * totalWeight;
      for (const option of options) {
        randomPoint -= option.weight;
        if (randomPoint < 0) {
          return option.value;
        }
      }
      return options[options.length - 1].value;
    },
  };
}

/* ==========================================================================
 * 2. Date helpers
 * --------------------------------------------------------------------------
 * All dates are "calendar dates" at midnight (00:00) in the user's own
 * time zone. Times of day are stored as "minutes after midnight",
 * e.g. 6:40 AM = 6 * 60 + 40 = 400.
 * ======================================================================== */

const MILLISECONDS_PER_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* Adds a leading zero: 5 -> "05", 12 -> "12" */
function twoDigits(number) {
  return String(number).padStart(2, '0');
}

/* Today's date at 00:00 */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/* Date -> "2026-11-16" (the format used by <input type="date">) */
function toISODate(date) {
  return date.getFullYear() + '-' + twoDigits(date.getMonth() + 1) + '-' + twoDigits(date.getDate());
}

/*
 * "2026-11-16" -> Date.
 * Returns null if the text is not in that format or the date does not
 * exist (for example "2026-02-31").
 */
function parseISODate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const parts = text.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  const date = new Date(year, month - 1, day); // months start at 0 in JavaScript

  // If the day did not exist, JavaScript silently rolls over (Feb 31 -> Mar 3).
  // We catch that here.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/* Returns a new date that is `days` days after `date` (use a negative number to go back). */
function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/* Number of whole days from dateA to dateB (works correctly across daylight-saving changes). */
function daysBetween(dateA, dateB) {
  const a = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const b = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((b - a) / MILLISECONDS_PER_DAY);
}

/* How many days from today until `date` (0 = today, 1 = tomorrow, -1 = yesterday) */
function daysFromToday(date) {
  return daysBetween(startOfToday(), date);
}

/*
 * Day of the week as a number: Monday = 0 ... Sunday = 6.
 * (JavaScript's getDay() uses Sunday = 0, so we shift it.)
 */
function weekdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

/* Date -> "16 Nov 2026" */
function formatDate(date) {
  return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

/* Date -> "Mon, 16 Nov 2026" */
function formatDateLong(date) {
  return WEEKDAYS[weekdayIndex(date)] + ', ' + formatDate(date);
}

/* Date -> "16 Nov" */
function formatShortDate(date) {
  return date.getDate() + ' ' + MONTHS[date.getMonth()];
}

/* Minutes after midnight -> "HH:MM". Values past midnight wrap around (1500 -> "01:00"). */
function formatTime(minutes) {
  let m = Math.round(minutes) % 1440; // 1440 = minutes in a day
  if (m < 0) {
    m = m + 1440;
  }
  return twoDigits(Math.floor(m / 60)) + ':' + twoDigits(m % 60);
}

/* Minutes -> "4h 30m" */
function formatDuration(minutes) {
  return Math.floor(minutes / 60) + 'h ' + twoDigits(minutes % 60) + 'm';
}

/* Date -> "10:42 AM" */
function formatClock(date) {
  let hours = date.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }
  return hours + ':' + twoDigits(date.getMinutes()) + ' ' + suffix;
}

/* ==========================================================================
 * 3. Booking rules
 * ======================================================================== */

const RULES = {
  MAX_ADVANCE_DAYS: 120, // you can book at most 120 days ahead
  TATKAL_MAX_DAYS_AHEAD: 1, // Tatkal: only for journeys today or tomorrow
  MIN_TRAIN_DISTANCE_KM: 60, // stations closer than this have no long-distance trains
  TATKAL_OPEN_AC: '10:00 AM',
  TATKAL_OPEN_NON_AC: '11:00 AM',
};

/* Keeps a number between min and max. clamp(150, 0, 100) -> 100 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* ==========================================================================
 * 4. Stations (real names and codes, approximate map coordinates)
 * ======================================================================== */

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
];

// Give every station a display label, e.g. "New Delhi (NDLS)",
// and build a lookup table so we can find a station by its code:
//   STATION_BY_CODE['NDLS'] -> the New Delhi station object
const STATION_BY_CODE = {};
for (const station of STATIONS) {
  station.label = station.name + ' (' + station.code + ')';
  STATION_BY_CODE[station.code] = station;
}

const DELHI_CODES = ['NDLS', 'DLI', 'NZM'];

/*
 * Approximate rail distance in km between two stations.
 * We work out the straight-line distance on the globe (the "haversine"
 * formula) and add 22% because tracks are never perfectly straight.
 */
function distanceKm(stationA, stationB) {
  const EARTH_RADIUS_KM = 6371;
  const toRadians = function (degrees) {
    return (degrees * Math.PI) / 180;
  };
  const dLat = toRadians(stationB.lat - stationA.lat);
  const dLon = toRadians(stationB.lon - stationA.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(stationA.lat)) * Math.cos(toRadians(stationB.lat)) * Math.sin(dLon / 2) ** 2;
  const straightLineKm = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  return Math.round(straightLineKm * 1.22);
}

/* ==========================================================================
 * 5. Travel classes
 * --------------------------------------------------------------------------
 *   perKm, minFare, reservation, superfast  -> used for the fare
 *   tatkalRate, tatkalMin, tatkalMax        -> extra Tatkal charge
 *   pool      = berths/seats in the General quota for one journey
 *   racRatio  = share of the pool that can be given as RAC (0 = no RAC)
 *   demand    = how much more (or less) popular this class is
 *   coachPrefix, coaches, berthsPerCoach    -> used to make coach/berth numbers
 *   seats     = true for chair cars (seats instead of berths)
 * ======================================================================== */

const CLASSES = {
  '1A': {
    code: '1A', name: 'First AC', ac: true,
    perKm: 3.6, minFare: 1200, reservation: 60, superfast: 75,
    tatkalRate: 0.3, tatkalMin: 400, tatkalMax: 500,
    pool: 18, racRatio: 0, demand: -0.12,
    coachPrefix: 'H', coaches: 1, berthsPerCoach: 24, seats: false,
  },
  '2A': {
    code: '2A', name: 'AC 2 Tier', ac: true,
    perKm: 2.1, minFare: 700, reservation: 50, superfast: 45,
    tatkalRate: 0.3, tatkalMin: 400, tatkalMax: 500,
    pool: 80, racRatio: 0.06, demand: 0,
    coachPrefix: 'A', coaches: 2, berthsPerCoach: 48, seats: false,
  },
  '3A': {
    code: '3A', name: 'AC 3 Tier', ac: true,
    perKm: 1.5, minFare: 500, reservation: 40, superfast: 45,
    tatkalRate: 0.3, tatkalMin: 300, tatkalMax: 400,
    pool: 160, racRatio: 0.07, demand: 0.1,
    coachPrefix: 'B', coaches: 6, berthsPerCoach: 72, seats: false,
  },
  '3E': {
    code: '3E', name: 'AC 3 Economy', ac: true,
    perKm: 1.38, minFare: 450, reservation: 40, superfast: 45,
    tatkalRate: 0.3, tatkalMin: 300, tatkalMax: 400,
    pool: 100, racRatio: 0.06, demand: 0.05,
    coachPrefix: 'M', coaches: 3, berthsPerCoach: 80, seats: false,
  },
  SL: {
    code: 'SL', name: 'Sleeper', ac: false,
    perKm: 0.55, minFare: 150, reservation: 20, superfast: 30,
    tatkalRate: 0.1, tatkalMin: 100, tatkalMax: 200,
    pool: 240, racRatio: 0.08, demand: 0.08,
    coachPrefix: 'S', coaches: 10, berthsPerCoach: 72, seats: false,
  },
  CC: {
    code: 'CC', name: 'AC Chair Car', ac: true,
    perKm: 1.3, minFare: 300, reservation: 40, superfast: 45,
    tatkalRate: 0.3, tatkalMin: 125, tatkalMax: 225,
    pool: 200, racRatio: 0, demand: 0.03,
    coachPrefix: 'C', coaches: 8, berthsPerCoach: 78, seats: true,
  },
  EC: {
    code: 'EC', name: 'Executive Chair Car', ac: true,
    perKm: 2.6, minFare: 700, reservation: 60, superfast: 75,
    tatkalRate: 0.3, tatkalMin: 400, tatkalMax: 500,
    pool: 46, racRatio: 0, demand: -0.1,
    coachPrefix: 'E', coaches: 1, berthsPerCoach: 56, seats: true,
  },
};

/* The order in which classes are shown on a train card. */
const CLASS_ORDER = ['1A', '2A', '3A', '3E', 'SL', 'EC', 'CC'];

/*
 * The berth/seat pattern that repeats along a coach.
 * The first item is berth 1, the second is berth 2, and so on.
 */
const SLEEPER_PATTERN = ['Lower', 'Middle', 'Upper', 'Lower', 'Middle', 'Upper', 'Side Lower', 'Side Upper'];
const BERTH_PATTERNS = {
  '1A': ['Lower', 'Upper'],
  '2A': ['Lower', 'Upper', 'Lower', 'Upper', 'Side Lower', 'Side Upper'],
  '3A': SLEEPER_PATTERN,
  '3E': SLEEPER_PATTERN,
  SL: SLEEPER_PATTERN,
  CC: ['Window', 'Middle', 'Aisle', 'Aisle', 'Window'],
  EC: ['Window', 'Aisle', 'Aisle', 'Window'],
};
const BERTH_TYPE_ORDER = ['Lower', 'Middle', 'Upper', 'Side Lower', 'Side Upper', 'Window', 'Aisle'];

/* Berth type for a berth number. Example: berthTypeFor('SL', 32) -> 'Side Upper' */
function berthTypeFor(classCode, berthNumber) {
  const pattern = BERTH_PATTERNS[classCode];
  return pattern[(berthNumber - 1) % pattern.length];
}

/*
 * The different berth types of a class and what share of the coach each one is.
 * Example for 2A: [{ type: 'Lower', share: 0.33 }, { type: 'Upper', share: 0.33 }, ...]
 */
function berthTypesFor(classCode) {
  const pattern = BERTH_PATTERNS[classCode];

  // Count how many times each type appears in the pattern
  const counts = {};
  for (const type of pattern) {
    counts[type] = (counts[type] || 0) + 1;
  }

  // Return them in a fixed, sensible order
  const result = [];
  for (const type of BERTH_TYPE_ORDER) {
    if (counts[type]) {
      result.push({ type: type, share: counts[type] / pattern.length });
    }
  }
  return result;
}

/* ==========================================================================
 * 6. Quotas
 * --------------------------------------------------------------------------
 *   poolFactor  = size of this quota compared to the General quota
 *   demandBoost = how much extra demand this quota has
 *   classes     = classes where this quota exists (null = all classes)
 *   note        = message shown under the search form
 * ======================================================================== */

const TATKAL_CLASSES = ['2A', '3A', '3E', 'SL', 'CC', 'EC'];

const QUOTAS = [
  {
    code: 'GN', name: 'General', poolFactor: 1, demandBoost: 0, classes: null,
    note: null,
  },
  {
    code: 'TQ', name: 'Tatkal', poolFactor: 0.22, demandBoost: 0.18, classes: TATKAL_CLASSES,
    isTatkal: true,
    note: 'Tatkal opens one day before the journey (10:00 AM for AC, 11:00 AM for non-AC classes). Extra Tatkal charges apply and confirmed Tatkal tickets are not refundable.',
  },
  {
    code: 'PT', name: 'Premium Tatkal', poolFactor: 0.1, demandBoost: 0.24, classes: TATKAL_CLASSES,
    isTatkal: true, dynamic: true,
    note: 'Premium Tatkal follows the Tatkal booking window but uses dynamic fares that rise with demand.',
  },
  {
    code: 'SS', name: 'Senior Citizen', poolFactor: 0.06, demandBoost: 0.05, classes: ['2A', '3A', '3E', 'SL'],
    note: 'Eligibility: men aged 60+ and women aged 58+. Lower berths are allotted on priority. Carry valid age proof on board.',
  },
  {
    code: 'LD', name: 'Ladies', poolFactor: 0.03, demandBoost: 0.02, classes: ['SL', 'CC'],
    note: 'Eligibility: women travelling alone or with children below 12 years. Offered mainly in Sleeper (SL) and Chair Car (CC).',
  },
  {
    code: 'HP', name: 'Divyang', poolFactor: 0.025, demandBoost: 0, classes: ['3A', '3E', 'SL', 'CC'],
    concession: 0.5,
    note: 'Requires a valid Divyang (disability) concession certificate or UDID card. A 50% fare concession is simulated.',
  },
  {
    code: 'FT', name: 'Foreign Tourist', poolFactor: 0.03, demandBoost: -0.05, classes: ['1A', '2A', '3A', 'CC', 'EC'],
    fareMultiplier: 1.5,
    note: 'Only for foreign passport holders and NRIs. A passport is required at booking and on board.',
  },
];

// Lookup table: QUOTA_BY_CODE['GN'] -> the General quota object
const QUOTA_BY_CODE = {};
for (const quota of QUOTAS) {
  QUOTA_BY_CODE[quota.code] = quota;
}

/* Is this quota available in this class? */
function isQuotaOffered(quotaCode, classCode) {
  const quota = QUOTA_BY_CODE[quotaCode];
  if (!quota) {
    return false;
  }
  if (quota.classes === null) {
    return true; // offered in every class
  }
  return quota.classes.includes(classCode);
}

/* ==========================================================================
 * 7. Festival seasons (same dates every year)
 *    from: [month, day]   to: [month, day]
 * ======================================================================== */

const FESTIVAL_SEASONS = [
  { name: 'Durga Puja & Dussehra', from: [10, 8], to: [10, 24] },
  { name: 'Diwali & Chhath', from: [10, 25], to: [11, 20] },
  { name: 'Christmas & New Year', from: [12, 20], to: [1, 3] },
  { name: 'Pongal & Makar Sankranti', from: [1, 12], to: [1, 17] },
  { name: 'Holi', from: [3, 1], to: [3, 20] },
  { name: 'Summer vacation', from: [5, 1], to: [6, 30] },
];

/* Returns the festival season that `date` falls in, or null if none. */
function getFestivalSeason(date) {
  // Turn the date into a number like 1116 for 16 November (month * 100 + day),
  // so we can compare dates with < and >.
  const monthDay = (date.getMonth() + 1) * 100 + date.getDate();

  for (const season of FESTIVAL_SEASONS) {
    const start = season.from[0] * 100 + season.from[1];
    const end = season.to[0] * 100 + season.to[1];

    let inSeason;
    if (start <= end) {
      inSeason = monthDay >= start && monthDay <= end;
    } else {
      // The season crosses New Year (e.g. 20 Dec to 3 Jan)
      inSeason = monthDay >= start || monthDay <= end;
    }

    if (inSeason) {
      return season;
    }
  }
  return null;
}

/* Extra demand by day of the week (Mon..Sun). Friday and Sunday are the busiest. */
const WEEKDAY_DEMAND = [0.02, -0.04, -0.04, 0, 0.08, 0.04, 0.1];

/* ==========================================================================
 * 8. Train types and the train generator
 * --------------------------------------------------------------------------
 *   weight      = how likely this type is to be picked
 *   max         = at most this many trains of this type on one route
 *   numPrefix   = possible starting digits of the train number
 *   speed       = [min, max] average speed in km/h
 *   classes     = classes this type of train has
 *   minKm/maxKm = route length this type is used for
 *   delhiOnly   = only for routes that start or end in Delhi
 *   daily       = chance that the train runs every day
 *   dayTrain    = runs in the daytime (morning or afternoon start)
 *   pop         = [min, max] popularity (0 to 1)
 *   fareFactor  = fare multiplier
 *   superfast   = adds a superfast charge to the fare
 * ======================================================================== */

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
const SUPERFAST_SUFFIXES = ['Superfast Express', 'Express', 'Mail', 'Sampark Kranti Express', 'Intercity Express', 'Antyodaya Express'];

/* Makes up a train name, e.g. "Mumbai Rajdhani Express" or "Ganga Mail". */
function makeTrainName(random, trainType, fromStation, toStation) {
  const cityPair = fromStation.city + '–' + toStation.city;

  if (trainType.key === 'RAJ') {
    // Rajdhani trains are named after the city that is NOT Delhi
    let otherStation = fromStation;
    if (DELHI_CODES.includes(fromStation.code)) {
      otherStation = toStation;
    }
    return otherStation.city + ' Rajdhani Express';
  }
  if (trainType.key === 'DUR') return cityPair + ' Duronto Express';
  if (trainType.key === 'VB') return cityPair + ' Vande Bharat Express';
  if (trainType.key === 'SHT') return toStation.city + ' Shatabdi Express';
  if (trainType.key === 'JSH') return cityPair + ' Jan Shatabdi Express';
  if (trainType.key === 'GR') return cityPair + ' Garib Rath Express';
  if (trainType.key === 'HMS') return cityPair + ' Humsafar Express';

  if (trainType.key === 'SF') {
    if (random.chance(0.5)) {
      const firstWord = random.pick(NAMED_TRAINS);
      const suffix = random.pick(SUPERFAST_SUFFIXES);
      return firstWord + ' ' + suffix;
    }
    return cityPair + ' ' + random.pick(SUPERFAST_SUFFIXES);
  }

  // Mail / Express
  if (random.chance(0.6)) {
    return random.pick(NAMED_TRAINS) + ' Express';
  }
  return fromStation.city + '–' + toStation.city + ' Mail';
}

/*
 * Which days of the week the train runs.
 * Returns 7 numbers for Mon..Sun: 1 = runs, 0 = does not run.
 */
function makeRunningDays(random, trainType) {
  if (random.chance(trainType.daily)) {
    return [1, 1, 1, 1, 1, 1, 1]; // daily train
  }

  const days = [0, 0, 0, 0, 0, 0, 0];

  let pattern;
  if (trainType.dayTrain) {
    pattern = 'six';
  } else {
    pattern = random.weighted([
      { value: 'three', weight: 3 },
      { value: 'two', weight: 2 },
      { value: 'weekly', weight: 2 },
      { value: 'six', weight: 1 },
    ]);
  }

  const startDay = random.int(0, 6);

  if (pattern === 'six') {
    // Runs every day except one
    days.fill(1);
    days[startDay] = 0;
  } else if (pattern === 'three') {
    // Runs 3 days a week, every other day
    days[startDay] = 1;
    days[(startDay + 2) % 7] = 1;
    days[(startDay + 4) % 7] = 1;
  } else if (pattern === 'two') {
    // Runs 2 days a week
    days[startDay] = 1;
    days[(startDay + 3) % 7] = 1;
  } else {
    // Weekly
    days[startDay] = 1;
  }
  return days;
}

/* Popularity (0 to 1) for a train that is not from the route generator (e.g. trains in a PNR). */
function popularityForTrainNumber(trainNumber) {
  const random = createRandomGenerator(['pop', trainNumber]);
  return Math.round(random.range(0.45, 0.92) * 100) / 100;
}

/*
 * Makes the list of trains that run between two stations on a date.
 *
 * The trains for a route are always generated in the same order (the random
 * generator is based only on the two station codes), so the same train
 * (number, name, timings, running days) appears on every date it runs.
 *
 * Returns: { trains: [...], distance: km, reason: null | 'invalid' | 'too-close' | 'not-running' }
 */
function getTrainsForRoute(fromCode, toCode, dateISO) {
  const fromStation = STATION_BY_CODE[fromCode];
  const toStation = STATION_BY_CODE[toCode];
  const date = parseISODate(dateISO);

  if (!fromStation || !toStation || !date || fromStation.code === toStation.code) {
    return { trains: [], distance: 0, reason: 'invalid' };
  }

  const distance = distanceKm(fromStation, toStation);
  if (distance < RULES.MIN_TRAIN_DISTANCE_KM) {
    return { trains: [], distance: distance, reason: 'too-close' };
  }

  // Which train types make sense for this route?
  const involvesDelhi = DELHI_CODES.includes(fromStation.code) || DELHI_CODES.includes(toStation.code);
  const suitableTypes = TRAIN_TYPES.filter(function (type) {
    const rightLength = distance >= type.minKm && distance <= type.maxKm;
    const delhiOk = !type.delhiOnly || involvesDelhi;
    return rightLength && delhiOk;
  });

  const routeRandom = createRandomGenerator(['route', fromStation.code, toStation.code]);
  const howManyTrains = createRandomGenerator(['count', fromStation.code, toStation.code, dateISO]).int(5, 8);
  const weekday = weekdayIndex(date);

  const countPerType = {}; // e.g. { RAJ: 1, SF: 3 }
  const usedNames = [];
  const usedNumbers = [];
  const trains = [];

  // Keep making trains until we have enough (with a safety limit of 80 tries)
  for (let attempt = 0; attempt < 80 && trains.length < howManyTrains; attempt++) {
    // Types that have not reached their maximum yet
    const typesLeft = suitableTypes.filter(function (type) {
      return (countPerType[type.key] || 0) < type.max;
    });
    if (typesLeft.length === 0) {
      break;
    }

    // Pick a type (types with a bigger weight are picked more often)
    const typeOptions = typesLeft.map(function (type) {
      return { value: type, weight: type.weight };
    });
    const type = routeRandom.weighted(typeOptions);

    const name = makeTrainName(routeRandom, type, fromStation, toStation);

    // Train number: a prefix like "124", then random digits until it is 5 digits long
    let number = routeRandom.pick(type.numPrefix);
    while (number.length < 5) {
      number = number + String(routeRandom.int(0, 9));
    }

    const speed = routeRandom.range(type.speed[0], type.speed[1]);

    // Departure time in minutes after midnight, rounded to 5 minutes
    let departure;
    if (type.dayTrain) {
      // Either early morning (5:30 - 8:00) or afternoon (14:00 - 17:00)
      const timeWindow = routeRandom.pick([[330, 480], [840, 1020]]);
      departure = Math.round(routeRandom.int(timeWindow[0], timeWindow[1]) / 5) * 5;
    } else {
      departure = Math.round(routeRandom.int(0, 1435) / 5) * 5;
    }

    // Journey time in minutes (at least 45), rounded to 5 minutes
    const travelMinutes = (distance / speed) * 60 * routeRandom.range(0.95, 1.1);
    const stopsMinutes = routeRandom.int(5, 30);
    const duration = Math.max(45, Math.round((travelMinutes + stopsMinutes) / 5) * 5);

    const runningDays = makeRunningDays(routeRandom, type);
    const popularity = Math.round(routeRandom.range(type.pop[0], type.pop[1]) * 100) / 100;

    // Some Superfast / Express trains get an extra or missing class
    let classes = type.classes.slice(); // copy the list
    if (type.key === 'SF') {
      if (routeRandom.chance(0.4)) {
        classes = classes.filter(function (cls) {
          return cls !== '1A';
        });
      }
      if (routeRandom.chance(0.35)) {
        classes.push('3E');
      }
    } else if (type.key === 'EXP') {
      if (routeRandom.chance(0.25)) {
        classes.push('1A');
      }
    }

    // Skip duplicates (same name or number as an earlier train)
    if (usedNames.includes(name) || usedNumbers.includes(number)) {
      continue;
    }
    usedNames.push(name);
    usedNumbers.push(number);
    countPerType[type.key] = (countPerType[type.key] || 0) + 1;

    // Skip trains that do not run on the chosen day of the week
    if (!runningDays[weekday]) {
      continue;
    }

    // Put the classes in the standard display order
    const orderedClasses = CLASS_ORDER.filter(function (cls) {
      return classes.includes(cls);
    });

    trains.push({
      number: number,
      name: name,
      type: type.key,
      typeLabel: type.label,
      from: fromStation.code,
      to: toStation.code,
      distance: distance,
      departure: departure,
      duration: duration,
      arrival: departure + duration,
      arrivalDayOffset: Math.floor((departure + duration) / 1440), // 1 = arrives next day
      runningDays: runningDays,
      classes: orderedClasses,
      popularity: popularity,
      fareFactor: type.fareFactor,
      superfast: type.superfast,
    });
  }

  // Earliest departure first
  trains.sort(function (a, b) {
    return a.departure - b.departure;
  });

  let reason = null;
  if (trains.length === 0) {
    reason = 'not-running';
  }
  return { trains: trains, distance: distance, reason: reason };
}

/* ==========================================================================
 * 9. Fare calculator
 * --------------------------------------------------------------------------
 * Returns { total: 1234, parts: [{ label: 'Base fare', amount: 1000 }, ...] }
 * `demand` is only used for Premium Tatkal (its price goes up with demand).
 * ======================================================================== */

function computeFare(train, classCode, quotaCode, demand) {
  const travelClass = CLASSES[classCode];
  const quota = QUOTA_BY_CODE[quotaCode] || QUOTA_BY_CODE.GN;

  const baseFare = Math.max(travelClass.minFare, Math.round(travelClass.perKm * train.distance * train.fareFactor));

  const parts = [];
  parts.push({ label: 'Base fare', amount: baseFare });
  parts.push({ label: 'Reservation charge', amount: travelClass.reservation });

  if (train.superfast) {
    parts.push({ label: 'Superfast charge', amount: travelClass.superfast });
  }

  if (quota.isTatkal) {
    const tatkalCharge = clamp(Math.round(baseFare * travelClass.tatkalRate), travelClass.tatkalMin, travelClass.tatkalMax);
    parts.push({ label: 'Tatkal charge', amount: tatkalCharge });

    if (quota.dynamic) {
      const demandValue = demand || 0.8;
      const surgeRate = clamp(0.25 + demandValue * 0.4, 0.2, 0.9);
      parts.push({ label: 'Dynamic pricing surcharge', amount: Math.round((baseFare + tatkalCharge) * surgeRate) });
    }
  }

  if (quota.fareMultiplier) {
    parts.push({ label: 'Foreign tourist surcharge', amount: Math.round(baseFare * (quota.fareMultiplier - 1)) });
  }

  if (quota.concession) {
    parts.push({ label: 'Divyang concession (50%)', amount: -Math.round(baseFare * quota.concession) });
  }

  // GST is added on AC classes only
  if (travelClass.ac) {
    const subtotal = sumOfAmounts(parts);
    parts.push({ label: 'GST (5%)', amount: Math.round(subtotal * 0.05) });
  }

  // Round the total to the nearest 5 rupees
  const total = Math.round(sumOfAmounts(parts) / 5) * 5;
  return { total: total, parts: parts };
}

/* Adds up the `amount` of every item in a list */
function sumOfAmounts(items) {
  let sum = 0;
  for (const item of items) {
    sum += item.amount;
  }
  return sum;
}

/* ==========================================================================
 * 10. Availability generator
 * ======================================================================== */

/*
 * How much demand there is for a train + class + quota + date.
 * About 0.2 = quiet train, about 1.6 = sold out with a long waitlist.
 */
function demandPressure(train, classCode, quotaCode, date) {
  const quota = QUOTA_BY_CODE[quotaCode];
  const daysAhead = clamp(daysFromToday(date), 0, RULES.MAX_ADVANCE_DAYS);
  const closeness = 1 - daysAhead / RULES.MAX_ADVANCE_DAYS; // 1 = travelling today, 0 = 120 days away
  const festivalBoost = getFestivalSeason(date) ? 0.22 : 0;

  return (
    -0.05 +
    train.popularity * 0.5 +
    closeness * 0.32 +
    WEEKDAY_DEMAND[weekdayIndex(date)] +
    festivalBoost +
    CLASSES[classCode].demand +
    quota.demandBoost
  );
}

/*
 * Splits `freeCount` free berths across the berth types of a class.
 * Example result for SL with 10 free: [{ type: 'Lower', count: 3 }, { type: 'Middle', count: 2 }, ...]
 */
function distributeBerths(random, classCode, freeCount) {
  const types = berthTypesFor(classCode);

  // Give each type a slightly random weight based on its normal share
  const weights = [];
  let totalWeight = 0;
  for (const t of types) {
    const weight = t.share * random.range(0.5, 1.5);
    weights.push(weight);
    totalWeight += weight;
  }

  // Exact (decimal) number of berths for each type
  const exactCounts = [];
  for (const weight of weights) {
    exactCounts.push((weight / totalWeight) * freeCount);
  }

  // Start with the rounded-down numbers
  const result = [];
  let assigned = 0;
  for (let i = 0; i < types.length; i++) {
    const count = Math.floor(exactCounts[i]);
    result.push({ type: types[i].type, count: count });
    assigned += count;
  }

  // Hand out the berths left over from rounding down, starting with the
  // types that had the biggest decimal part.
  let leftOver = freeCount - assigned;
  const order = [];
  for (let i = 0; i < exactCounts.length; i++) {
    order.push({ index: i, fraction: exactCounts[i] - Math.floor(exactCounts[i]) });
  }
  order.sort(function (a, b) {
    return b.fraction - a.fraction;
  });

  let k = 0;
  while (leftOver > 0) {
    result[order[k].index].count++;
    leftOver--;
    k = (k + 1) % order.length;
  }
  return result;
}

/* When the Tatkal window opens for a journey: the day before, at 10 AM (AC) or 11 AM (non-AC). */
function tatkalOpensAt(journeyDate, classCode) {
  let time = RULES.TATKAL_OPEN_NON_AC;
  if (CLASSES[classCode].ac) {
    time = RULES.TATKAL_OPEN_AC;
  }
  return { date: addDays(journeyDate, -1), time: time };
}

/*
 * Simulated availability for one train + class + quota + date.
 * The same inputs always give the same result. Each time the user presses
 * "Refresh", refreshCount goes up by 1 and the numbers change a little.
 *
 * status is one of:
 *   'AVL'      - berths available
 *   'RAC'      - Reservation Against Cancellation
 *   'WL'       - waitlist
 *   'NA'       - this quota does not exist in this class
 *   'NOT_OPEN' - Tatkal booking has not opened yet
 */
function getAvailability(train, classCode, quotaCode, dateISO, refreshCount) {
  const travelClass = CLASSES[classCode];
  const quota = QUOTA_BY_CODE[quotaCode];
  const date = parseISODate(dateISO);

  // Quota not offered in this class
  if (!isQuotaOffered(quotaCode, classCode)) {
    return {
      cls: classCode, quotaCode: quotaCode, pool: 0, racPool: 0, count: 0, berths: [], fare: null,
      status: 'NA', label: 'NOT OFFERED',
    };
  }

  const pressure = demandPressure(train, classCode, quotaCode, date);
  const fare = computeFare(train, classCode, quotaCode, pressure);

  // Tatkal window not open yet: show the fare but no availability
  if (quota.isTatkal && daysFromToday(date) > RULES.TATKAL_MAX_DAYS_AHEAD) {
    return {
      cls: classCode, quotaCode: quotaCode, pool: 0, racPool: 0, count: 0, berths: [], fare: fare,
      status: 'NOT_OPEN', label: 'NOT OPEN YET', opensAt: tatkalOpensAt(date, classCode),
    };
  }

  const random = createRandomGenerator(['avl', train.number, dateISO, quotaCode, classCode]);

  // pool = total berths in this quota, racPool = how many RAC places there are
  const pool = Math.max(2, Math.round(travelClass.pool * quota.poolFactor));
  let racPool = 0;
  if (travelClass.racRatio) {
    racPool = Math.max(1, Math.round(pool * travelClass.racRatio));
  }

  // free = berths still free. Negative means people are already on RAC / waitlist.
  let free = Math.round(pool * (0.95 - pressure) + random.range(-0.15, 0.15) * pool);

  // Each refresh changes the number a little (bookings and cancellations "happen")
  for (let i = 1; i <= (refreshCount || 0); i++) {
    free += createRandomGenerator(['refresh', train.number, dateISO, quotaCode, classCode, i]).int(-5, 4);
  }
  free = Math.min(free, pool);

  // Berths available
  if (free > 0) {
    const berthRandom = createRandomGenerator(['berths', train.number, dateISO, quotaCode, classCode, free]);
    return {
      cls: classCode, quotaCode: quotaCode, pool: pool, racPool: racPool, fare: fare, pressure: pressure,
      status: 'AVL', count: free, label: 'AVAILABLE ' + free,
      berths: distributeBerths(berthRandom, classCode, free),
    };
  }

  // No berths free. Position in the queue: free = 0 -> position 1, free = -1 -> position 2, ...
  const queuePosition = 1 - free;

  // The first `racPool` people in the queue get RAC
  if (racPool && queuePosition <= racPool) {
    return {
      cls: classCode, quotaCode: quotaCode, pool: pool, racPool: racPool, fare: fare, pressure: pressure,
      status: 'RAC', count: queuePosition, label: 'RAC ' + queuePosition,
      berths: distributeBerths(random, classCode, 0),
    };
  }

  // Everyone after that is on the waitlist
  const waitlistNumber = queuePosition - racPool;
  return {
    cls: classCode, quotaCode: quotaCode, pool: pool, racPool: racPool, fare: fare, pressure: pressure,
    status: 'WL', count: waitlistNumber, label: 'WL ' + waitlistNumber,
    berths: distributeBerths(random, classCode, 0),
  };
}

/* ==========================================================================
 * 11. Past cancellation data (used by probability.js)
 * ======================================================================== */

const CANCELLATION_DATA = {
  // Average cancellations per journey in the General quota, by class
  basePerJourney: { SL: 110, '3A': 65, '3E': 38, '2A': 28, '1A': 8, CC: 45, EC: 10 },

  // Some quotas are rarely cancelled (e.g. confirmed Tatkal tickets give no refund)
  quotaFactor: { GN: 1, TQ: 0.4, PT: 0.2, SS: 0.6, LD: 0.5, HP: 0.5, FT: 0.3 },

  // How often people cancel, by day of travel (Mon..Sun). Weekend travellers keep their tickets.
  dowFactor: [1.05, 1.08, 1.08, 1.02, 0.92, 0.97, 0.9],

  // Festival travellers rarely cancel
  festivalFactor: 0.78,

  // Typical number of RAC places when we don't know the exact train (used for PNRs)
  defaultRacPool: { SL: 19, '3A': 11, '3E': 6, '2A': 5, '1A': 0, CC: 0, EC: 0 },
};

/*
 * Cancellations per journey for each of the last 8 weeks (oldest first).
 * Each week's number is based on that week's Monday, so it stays the same
 * for the whole week. Popular trains have fewer cancellations.
 */
function getCancellationHistory(trainKey, classCode, popularity) {
  const today = startOfToday();
  const thisMonday = addDays(today, -weekdayIndex(today));
  const baseValue = CANCELLATION_DATA.basePerJourney[classCode] * (1.1 - 0.3 * popularity);

  const weeks = [];
  for (let weeksAgo = 8; weeksAgo >= 1; weeksAgo--) {
    const weekStart = addDays(thisMonday, -7 * weeksAgo);
    const random = createRandomGenerator(['hist', trainKey, classCode, toISODate(weekStart)]);

    let festivalEffect = 1;
    if (getFestivalSeason(weekStart)) {
      festivalEffect = CANCELLATION_DATA.festivalFactor;
    }

    weeks.push({
      weekStart: weekStart,
      label: formatShortDate(weekStart),
      value: Math.max(0, Math.round(baseValue * festivalEffect * random.range(0.72, 1.28))),
    });
  }
  return weeks;
}

/* ==========================================================================
 * 12. Sample PNRs (fixed examples for the "Try a sample PNR" buttons)
 * --------------------------------------------------------------------------
 *   journeyOffset = days from today (so the chart status always makes sense)
 *   departure / duration are in minutes
 *   A passenger status looks like one of:
 *     { type: 'CNF', coach: 'S4', berth: 32 }   confirmed
 *     { type: 'RAC', pos: 3 }                   RAC number 3
 *     { type: 'WL',  pos: 12 }                  waitlist number 12
 *     { type: 'CAN' }                           cancelled
 * ======================================================================== */

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
