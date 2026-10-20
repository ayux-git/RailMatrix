/**
 * probability.js
 * ---------------------------------------------------------------------------
 * Waitlist / RAC confirmation probability model (simulated).
 *
 * Idea: a WL or RAC ticket confirms when enough confirmed passengers cancel
 * before the chart is prepared. So we:
 *   1. take the recent average cancellations per journey for this train + class
 *      (last 4 weeks of the simulated 8-week history in data.js),
 *   2. scale it by the share of cancellations still to come (days left),
 *      the quota, day of week and festival season -> EXPECTED cancellations,
 *   3. work out how many cancellations this ticket NEEDS
 *      (RAC n -> n;  WL n -> the whole RAC queue + n, since everyone on RAC
 *       is ahead of every WL ticket),
 *   4. treat cancellations as an over-dispersed count (normal approximation)
 *      and return P(cancellations >= needed) as a percentage.
 *
 * Depends on: data.js (RailMatrix.data, RailMatrix.dates)
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const RailMatrix = global.RailMatrix;
  const { data, dates } = RailMatrix;
  const { CANCELLATION_DATA, CLASSES, QUOTA_BY_CODE, clamp } = data;

  const BANDS = Object.freeze({
    HIGH: { key: 'HIGH', label: 'High chance', tone: 'success' },
    MEDIUM: { key: 'MEDIUM', label: 'Medium chance', tone: 'warning' },
    LOW: { key: 'LOW', label: 'Low chance', tone: 'danger' },
  });

  /** Error function (Abramowitz & Stegun 7.1.26, max error ~1.5e-7). */
  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-ax * ax);
    return sign * y;
  }

  function normalCdf(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  /** Share of a journey's cancellations that still happen when `daysLeft` days remain. */
  function remainingShare(daysLeft) {
    // 25% happen at chart preparation (no-shows, emergency quota release); the rest
    // build up over the final weeks, concentrated close to departure.
    return 0.25 + 0.75 * (1 - Math.exp(-Math.max(0, daysLeft) / 12));
  }

  function bandFor(percent) {
    if (percent > 70) return BANDS.HIGH;
    if (percent >= 35) return BANDS.MEDIUM;
    return BANDS.LOW;
  }

  /**
   * Estimate the chance that a WL / RAC ticket gets a confirmed berth.
   *
   * @param {object} input
   * @param {'WL'|'RAC'} input.statusType
   * @param {number} input.position     WL or RAC number (>= 1)
   * @param {string} input.cls          class code
   * @param {string} input.quota        quota code
   * @param {number} input.daysLeft     days until the journey (0..120)
   * @param {number} [input.popularity] 0..1 (default 0.6, an "average busy train")
   * @param {string} [input.trainKey]   train number (history seed); omitted = generic route
   * @param {number} [input.racPool]    size of the RAC queue for this train/class
   * @returns {object} result with percent, band, expected, needed, history, factors, explanation
   */
  function estimate(input) {
    const statusType = input.statusType === 'RAC' ? 'RAC' : 'WL';
    const position = Math.max(1, Math.round(input.position));
    const cls = input.cls;
    const quota = QUOTA_BY_CODE[input.quota] ? input.quota : 'GN';
    const daysLeft = clamp(Math.round(input.daysLeft), 0, data.RULES.MAX_ADVANCE_DAYS);
    const popularity = typeof input.popularity === 'number' ? input.popularity : 0.6;
    const trainKey = input.trainKey || `generic-${cls}`;
    const racPool =
      typeof input.racPool === 'number' ? input.racPool : CANCELLATION_DATA.defaultRacPool[cls] || 0;

    const journeyDate = dates.addDays(dates.startOfToday(), daysLeft);
    const weekday = dates.weekdayIndex(journeyDate);
    const festival = data.getFestivalSeason(journeyDate);

    // 1. Historical baseline
    const history = data.getCancellationHistory(trainKey, cls, popularity);
    const recent = history.slice(-4);
    const recentAvg = recent.reduce((s, w) => s + w.value, 0) / recent.length;

    // 2. Expected cancellations still to come for this journey
    const timeShare = remainingShare(daysLeft);
    const quotaFactor = CANCELLATION_DATA.quotaFactor[quota];
    const dowFactor = CANCELLATION_DATA.dowFactor[weekday];
    const festivalFactor = festival ? CANCELLATION_DATA.festivalFactor : 1;
    const expected = recentAvg * timeShare * quotaFactor * dowFactor * festivalFactor;

    // 3. Cancellations this ticket needs
    const needed = statusType === 'RAC' ? position : racPool + position;

    // 4. P(C >= needed), C ~ Normal(expected, sd) with over-dispersion
    const sd = 1.3 * Math.sqrt(Math.max(expected, 1)) + 2;
    const z = (needed - 0.5 - expected) / sd;
    const percent = clamp(Math.round((1 - normalCdf(z)) * 100), 1, 99);
    const band = bandFor(percent);

    // Human-readable factors (effect: 'up' helps, 'down' hurts, 'neutral')
    const factors = [];
    factors.push({
      effect: 'neutral',
      label: `${statusType} ${position} needs about ${needed} cancellation${needed === 1 ? '' : 's'}`,
    });
    if (daysLeft >= 15) {
      factors.push({ effect: 'up', label: `${daysLeft} days to travel: plenty of time for cancellations` });
    } else if (daysLeft <= 3) {
      factors.push({
        effect: 'down',
        label: daysLeft === 0 ? 'Travelling today: only chart-time cancellations remain' : `Only ${daysLeft} day${daysLeft === 1 ? '' : 's'} left before charting`,
      });
    } else {
      factors.push({ effect: 'neutral', label: `${daysLeft} days to travel: some cancellations still to come` });
    }
    if (quotaFactor < 1) {
      const why = QUOTA_BY_CODE[quota].isTatkal
        ? 'confirmed Tatkal tickets are non-refundable, so few are cancelled'
        : 'this quota has a small pool with few cancellations';
      factors.push({ effect: 'down', label: `${QUOTA_BY_CODE[quota].name} quota: ${why}` });
    } else {
      factors.push({ effect: 'up', label: 'General quota: largest pool with the most cancellations' });
    }
    if (festival) {
      factors.push({ effect: 'down', label: `${festival.name} season: travellers rarely cancel` });
    }
    if (dowFactor < 1) {
      factors.push({ effect: 'down', label: `${dates.WEEKDAYS_LONG[weekday]} travel: high demand, fewer cancellations` });
    } else if (dowFactor > 1.03) {
      factors.push({ effect: 'up', label: `${dates.WEEKDAYS_LONG[weekday]} travel: mid-week trips are cancelled more often` });
    }
    if (popularity >= 0.8) {
      factors.push({ effect: 'down', label: `Very popular train (${Math.round(popularity * 100)}/100): passengers hold on to tickets` });
    } else if (popularity <= 0.5) {
      factors.push({ effect: 'up', label: `Less crowded train (${Math.round(popularity * 100)}/100): more cancellations per berth` });
    }

    const avgRounded = Math.round(recentAvg);
    const explanation =
      `Based on avg. ${avgRounded} cancellations per journey ${input.trainKey ? 'on this train' : 'on similar routes'} ` +
      `(${cls}) in the last 30 days, we expect about ${Math.round(expected)} more before the chart is prepared. ` +
      `Your ticket needs roughly ${needed} to get a confirmed ${CLASSES[cls].seats ? 'seat' : 'berth'}.`;

    return {
      statusType,
      position,
      cls,
      quota,
      daysLeft,
      journeyDate,
      percent,
      band,
      expected,
      needed,
      recentAvg,
      history,
      factors,
      explanation,
    };
  }

  RailMatrix.probability = Object.freeze({ estimate, bandFor, BANDS, remainingShare });
})(window);
