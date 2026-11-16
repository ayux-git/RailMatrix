/*
 * probability.js
 * ---------------------------------------------------------------------------
 * Works out the chance that a waitlisted (WL) or RAC ticket gets confirmed.
 * (Everything here is simulated.)
 *
 * The idea in simple words:
 *   A WL / RAC ticket becomes confirmed only when enough people who already
 *   have confirmed tickets cancel them before the chart is prepared.
 *
 *   1. Look at how many people cancelled on this train + class in the last
 *      4 weeks (from the fake history in data.js) and take the average.
 *   2. Adjust that average for: days left before the journey, the quota,
 *      the day of the week, and festival season.
 *      -> this gives the EXPECTED number of cancellations still to come.
 *   3. Work out how many cancellations this ticket NEEDS:
 *        RAC 5 -> needs 5 cancellations
 *        WL 5  -> needs (everyone on RAC) + 5, because all RAC passengers
 *                 are ahead of every WL passenger.
 *   4. Use the "normal distribution" (bell curve) to find the chance that
 *      the real number of cancellations is at least the number needed.
 *
 * Uses functions and data from data.js.
 * ---------------------------------------------------------------------------
 */

/* The three chance levels shown to the user */
const CHANCE_BANDS = {
  HIGH: { key: 'HIGH', label: 'High chance', tone: 'success' },
  MEDIUM: { key: 'MEDIUM', label: 'Medium chance', tone: 'warning' },
  LOW: { key: 'LOW', label: 'Low chance', tone: 'danger' },
};

/*
 * The "error function" from statistics. It is needed for the bell-curve
 * calculation below. This is a well-known approximation
 * (Abramowitz & Stegun formula 7.1.26) - you don't need to follow the maths.
 */
function errorFunction(x) {
  let sign = 1;
  if (x < 0) {
    sign = -1;
  }
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/*
 * For a bell curve: the chance that a value is LESS than z standard
 * deviations away from the average. (Called the "normal CDF".)
 */
function normalCdf(z) {
  return 0.5 * (1 + errorFunction(z / Math.SQRT2));
}

/*
 * What share of a journey's cancellations are still to come when
 * `daysLeft` days are left (a number from 0.25 to 1).
 *
 * 25% always happen at the very end (when the chart is prepared).
 * The other 75% happen over the last few weeks, mostly close to the journey.
 */
function remainingShare(daysLeft) {
  const days = Math.max(0, daysLeft);
  return 0.25 + 0.75 * (1 - Math.exp(-days / 12));
}

/* Percent -> HIGH (above 70%), MEDIUM (35% to 70%) or LOW (below 35%) */
function bandFor(percent) {
  if (percent > 70) {
    return CHANCE_BANDS.HIGH;
  }
  if (percent >= 35) {
    return CHANCE_BANDS.MEDIUM;
  }
  return CHANCE_BANDS.LOW;
}

/*
 * Estimates the chance that a WL / RAC ticket gets a confirmed berth.
 *
 * input = {
 *   statusType: 'WL' or 'RAC',
 *   position:   WL / RAC number (1 or more),
 *   cls:        class code, e.g. 'SL',
 *   quota:      quota code, e.g. 'GN',
 *   daysLeft:   days until the journey (0 to 120),
 *   popularity: (optional) 0 to 1, default 0.6 = an average busy train,
 *   trainKey:   (optional) train number, used to look up its history,
 *   racPool:    (optional) how many RAC places this train/class has,
 * }
 *
 * Returns an object with: percent, band, expected, needed, explanation, and more.
 */
function estimateConfirmationChance(input) {
  /* ---- Clean up the input ---- */

  let statusType = 'WL';
  if (input.statusType === 'RAC') {
    statusType = 'RAC';
  }

  const position = Math.max(1, Math.round(input.position));
  const cls = input.cls;

  let quota = 'GN';
  if (QUOTA_BY_CODE[input.quota]) {
    quota = input.quota;
  }

  const daysLeft = clamp(Math.round(input.daysLeft), 0, RULES.MAX_ADVANCE_DAYS);

  let popularity = 0.6;
  if (typeof input.popularity === 'number') {
    popularity = input.popularity;
  }

  let trainKey = 'generic-' + cls;
  if (input.trainKey) {
    trainKey = input.trainKey;
  }

  let racPool;
  if (typeof input.racPool === 'number') {
    racPool = input.racPool;
  } else {
    racPool = CANCELLATION_DATA.defaultRacPool[cls] || 0;
  }

  const journeyDate = addDays(startOfToday(), daysLeft);
  const weekday = weekdayIndex(journeyDate);
  const festival = getFestivalSeason(journeyDate);

  /* ---- Step 1: average cancellations in the last 4 weeks ---- */

  const history = getCancellationHistory(trainKey, cls, popularity);
  const lastFourWeeks = history.slice(-4);
  let total = 0;
  for (const week of lastFourWeeks) {
    total += week.value;
  }
  const recentAvg = total / lastFourWeeks.length;

  /* ---- Step 2: expected cancellations still to come ---- */

  const timeShare = remainingShare(daysLeft);
  const quotaFactor = CANCELLATION_DATA.quotaFactor[quota];
  const dowFactor = CANCELLATION_DATA.dowFactor[weekday];
  let festivalFactor = 1;
  if (festival) {
    festivalFactor = CANCELLATION_DATA.festivalFactor;
  }
  const expected = recentAvg * timeShare * quotaFactor * dowFactor * festivalFactor;

  /* ---- Step 3: cancellations this ticket needs ---- */

  let needed;
  if (statusType === 'RAC') {
    needed = position;
  } else {
    needed = racPool + position;
  }

  /* ---- Step 4: chance that cancellations >= needed ---- */

  // Spread of the bell curve. Made a bit wider than usual because real
  // cancellations vary a lot from one journey to the next.
  const spread = 1.3 * Math.sqrt(Math.max(expected, 1)) + 2;
  const z = (needed - 0.5 - expected) / spread;
  const percent = clamp(Math.round((1 - normalCdf(z)) * 100), 1, 99); // never show 0% or 100%
  const band = bandFor(percent);

  /* ---- Reasons in plain words ('up' = helps, 'down' = hurts) ---- */

  const factors = [];

  let cancellationWord = 'cancellations';
  if (needed === 1) {
    cancellationWord = 'cancellation';
  }
  factors.push({ effect: 'neutral', label: statusType + ' ' + position + ' needs about ' + needed + ' ' + cancellationWord });

  if (daysLeft >= 15) {
    factors.push({ effect: 'up', label: daysLeft + ' days to travel: plenty of time for cancellations' });
  } else if (daysLeft <= 3) {
    let label;
    if (daysLeft === 0) {
      label = 'Travelling today: only chart-time cancellations remain';
    } else if (daysLeft === 1) {
      label = 'Only 1 day left before charting';
    } else {
      label = 'Only ' + daysLeft + ' days left before charting';
    }
    factors.push({ effect: 'down', label: label });
  } else {
    factors.push({ effect: 'neutral', label: daysLeft + ' days to travel: some cancellations still to come' });
  }

  if (quotaFactor < 1) {
    let why;
    if (QUOTA_BY_CODE[quota].isTatkal) {
      why = 'confirmed Tatkal tickets are non-refundable, so few are cancelled';
    } else {
      why = 'this quota has a small pool with few cancellations';
    }
    factors.push({ effect: 'down', label: QUOTA_BY_CODE[quota].name + ' quota: ' + why });
  } else {
    factors.push({ effect: 'up', label: 'General quota: largest pool with the most cancellations' });
  }

  if (festival) {
    factors.push({ effect: 'down', label: festival.name + ' season: travellers rarely cancel' });
  }

  if (dowFactor < 1) {
    factors.push({ effect: 'down', label: WEEKDAYS_LONG[weekday] + ' travel: high demand, fewer cancellations' });
  } else if (dowFactor > 1.03) {
    factors.push({ effect: 'up', label: WEEKDAYS_LONG[weekday] + ' travel: mid-week trips are cancelled more often' });
  }

  const popularityScore = Math.round(popularity * 100);
  if (popularity >= 0.8) {
    factors.push({ effect: 'down', label: 'Very popular train (' + popularityScore + '/100): passengers hold on to tickets' });
  } else if (popularity <= 0.5) {
    factors.push({ effect: 'up', label: 'Less crowded train (' + popularityScore + '/100): more cancellations per berth' });
  }

  /* ---- One-sentence explanation (shown as a tooltip) ---- */

  let whereText = 'on similar routes';
  if (input.trainKey) {
    whereText = 'on this train';
  }
  let berthWord = 'berth';
  if (CLASSES[cls].seats) {
    berthWord = 'seat';
  }
  const explanation =
    'Based on avg. ' + Math.round(recentAvg) + ' cancellations per journey ' + whereText + ' ' +
    '(' + cls + ') in the last 30 days, we expect about ' + Math.round(expected) + ' more before the chart is prepared. ' +
    'Your ticket needs roughly ' + needed + ' to get a confirmed ' + berthWord + '.';

  return {
    statusType: statusType,
    position: position,
    cls: cls,
    quota: quota,
    daysLeft: daysLeft,
    journeyDate: journeyDate,
    percent: percent,
    band: band,
    expected: expected,
    needed: needed,
    recentAvg: recentAvg,
    history: history,
    factors: factors,
    explanation: explanation,
  };
}
