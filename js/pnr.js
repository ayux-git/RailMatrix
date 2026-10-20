/**
 * pnr.js
 * ---------------------------------------------------------------------------
 * PNR validation and deterministic PNR status simulation.
 *
 *  - validate(raw)  : strips spaces/hyphens, rejects letters, requires 10 digits
 *  - lookup(pnr)    : returns a simulated booking. The same PNR always gives the
 *                     same result (seeded by the PNR itself).
 *
 * Simulator rules:
 *  - The four sample PNRs in data.js return fixed, hand-made scenarios.
 *  - PNRs starting with 0 or 9, or made of one repeated digit, are "not found".
 *  - Every other 10-digit PNR generates a booking on a real simulated route.
 *
 * Status model: every ticket sits in one queue.
 *   rank 0 = confirmed, 1..R = RAC 1..R, R+1.. = WL 1..
 * Passengers on one PNR move together, so their statuses stay consistent.
 *
 * Depends on: data.js
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const RailMatrix = global.RailMatrix;
  const { data, dates, rng: rngLib } = RailMatrix;
  const { createRng } = rngLib;

  /* ======================================================================
   * Validation
   * ==================================================================== */

  /** Clean user input: remove whitespace and hyphens, keep everything else for checking. */
  function normalize(raw) {
    return String(raw == null ? '' : raw).replace(/[\s-]+/g, '');
  }

  /**
   * @returns {{ valid: boolean, pnr: string, error: string|null }}
   */
  function validate(raw) {
    const cleaned = normalize(raw);
    if (!cleaned) return { valid: false, pnr: '', error: 'Please enter your 10-digit PNR number.' };
    if (/\D/.test(cleaned)) return { valid: false, pnr: cleaned, error: 'PNR can contain digits only (0–9).' };
    if (cleaned.length !== 10) {
      return { valid: false, pnr: cleaned, error: 'Invalid PNR: please enter exactly 10 digits.' };
    }
    return { valid: true, pnr: cleaned, error: null };
  }

  /* ======================================================================
   * Status helpers
   * ==================================================================== */

  /** Human-readable status, e.g. "CNF S4/32 Lower", "RAC 2", "WL 5", "CAN". */
  function formatStatus(s, cls) {
    switch (s.type) {
      case 'CNF':
        return `CNF ${s.coach}/${s.berth} ${data.berthTypeFor(cls, s.berth)}`;
      case 'RAC':
        return `RAC ${s.pos}`;
      case 'WL':
        return `WL ${s.pos}`;
      default:
        return 'CAN';
    }
  }

  /* ======================================================================
   * Result builder (shared by samples and generated PNRs)
   * ==================================================================== */

  function buildResult(spec) {
    const journeyDate = dates.addDays(dates.startOfToday(), spec.journeyOffset);
    const passengers = spec.passengers.map((p, i) => {
      return {
        no: i + 1,
        booking: p.booking,
        current: p.current,
        bookingText: formatStatus(p.booking, spec.cls),
        currentText: formatStatus(p.current, spec.cls),
      };
    });
    const count = (type) => passengers.filter((p) => p.current.type === type).length;
    const summary = { total: passengers.length, cnf: count('CNF'), rac: count('RAC'), wl: count('WL'), can: count('CAN') };

    return {
      found: true,
      pnr: spec.pnr,
      isSample: !!spec.isSample,
      train: spec.train,
      popularity: data.popularityForTrainNumber(spec.train.number),
      from: data.STATION_BY_CODE[spec.from],
      to: data.STATION_BY_CODE[spec.to],
      departure: spec.departure,
      arrival: spec.departure + spec.duration,
      arrivalDayOffset: Math.floor((spec.departure + spec.duration) / 1440),
      journeyDate,
      daysLeft: spec.journeyOffset,
      cls: spec.cls,
      quota: spec.quota,
      chartPrepared: spec.chartPrepared,
      isCancelled: summary.can === summary.total,
      passengers,
      summary,
    };
  }

  /* ======================================================================
   * Random (seeded) booking generator
   * ==================================================================== */

  function pickRoute(rng) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const from = rng.pick(data.STATIONS);
      const to = rng.pick(data.STATIONS);
      if (from.code === to.code || from.city === to.city) continue;
      if (data.distanceKm(from, to) < 200) continue;
      const offset = rng.int(0, 45);
      const dateISO = dates.toISODate(dates.addDays(dates.startOfToday(), offset));
      const { trains } = data.getTrainsForRoute(from.code, to.code, dateISO);
      if (trains.length) return { from, to, offset, train: rng.pick(trains) };
    }
    return null;
  }

  function generate(pnr) {
    const rng = createRng('pnr', pnr);
    const route = pickRoute(rng);
    if (!route) return null;
    const { train, offset } = route;
    const cls = rng.pick(train.classes);
    const c = data.CLASSES[cls];

    // Quota: Tatkal could only have been booked within its window.
    let quota = rng.weighted([
      { value: 'GN', weight: 70 },
      { value: 'TQ', weight: 12 },
      { value: 'SS', weight: 8 },
      { value: 'LD', weight: 4 },
      { value: 'HP', weight: 3 },
      { value: 'PT', weight: 3 },
    ]);
    if (!data.isQuotaOffered(quota, cls)) quota = 'GN';
    if (data.QUOTA_BY_CODE[quota].isTatkal && offset > data.RULES.TATKAL_MAX_DAYS_AHEAD) quota = 'GN';

    const paxCount = rng.weighted([
      { value: 1, weight: 30 },
      { value: 2, weight: 30 },
      { value: 3, weight: 18 },
      { value: 4, weight: 12 },
      { value: 5, weight: 6 },
      { value: 6, weight: 4 },
    ]);

    const racPool = data.CANCELLATION_DATA.defaultRacPool[cls] || 0;
    const fromRank = (q, berthBase) => {
      if (q <= 0) return { type: 'CNF', coach: berthBase.coach, berth: berthBase.berth };
      if (q <= racPool) return { type: 'RAC', pos: q };
      return { type: 'WL', pos: q - racPool };
    };
    const seatBlock = () => ({
      coach: `${c.coachPrefix}${rng.int(1, c.coaches)}`,
      start: rng.int(1, c.berthsPerCoach - paxCount),
    });

    const cancelled = rng.chance(0.06);
    const kind = rng.weighted([
      { value: 'CNF', weight: 35 },
      { value: 'RAC', weight: racPool ? 15 : 0 },
      { value: 'WL', weight: 50 },
    ]);

    // Starting queue rank of passenger 1 at booking time
    let q0 = 0;
    if (kind === 'RAC') q0 = rng.int(1, Math.max(1, racPool - paxCount));
    if (kind === 'WL') q0 = racPool + rng.int(1, 90);

    // How far the whole PNR moved since booking
    let shift = 0;
    if (q0 > 0) {
      const r = rng.next();
      if (r < 0.3) shift = 0; // no change since booking
      else shift = rng.int(1, Math.max(2, Math.round((q0 + paxCount) * rng.range(0.3, 1.3))));
    }

    const bookedSeats = seatBlock();
    const newSeats = seatBlock();
    let newlyConfirmed = 0;
    const passengers = [];
    for (let i = 0; i < paxCount; i++) {
      const qb = q0 === 0 ? 0 : q0 + i;
      const booking = fromRank(qb, { coach: bookedSeats.coach, berth: bookedSeats.start + i });
      let current;
      if (cancelled) {
        current = { type: 'CAN' };
      } else if (qb === 0) {
        current = booking;
      } else {
        const qc = qb - shift;
        current = fromRank(qc, { coach: newSeats.coach, berth: newSeats.start + newlyConfirmed });
        if (current.type === 'CNF') newlyConfirmed++;
      }
      passengers.push({ booking, current });
    }

    return buildResult({
      pnr,
      train: { number: train.number, name: train.name },
      from: train.from,
      to: train.to,
      departure: train.departure,
      duration: train.duration,
      journeyOffset: offset,
      cls,
      quota,
      chartPrepared: offset === 0,
      passengers,
    });
  }

  /* ======================================================================
   * Lookup
   * ==================================================================== */

  /**
   * @param {string} pnr a validated 10-digit PNR
   * @returns {object} { found: false, pnr, reason } or a full result (see buildResult)
   */
  function lookup(pnr) {
    const sample = data.SAMPLE_PNRS.find((s) => s.pnr === pnr);
    if (sample) return buildResult({ ...sample, isSample: true });

    if (/^[09]/.test(pnr) || /^(\d)\1{9}$/.test(pnr)) {
      return {
        found: false,
        pnr,
        reason: 'No booking matches this PNR. It may be mistyped, or the record was flushed after the journey was completed.',
      };
    }
    const result = generate(pnr);
    return result || { found: false, pnr, reason: 'This PNR could not be simulated. Please try another number.' };
  }

  RailMatrix.pnr = Object.freeze({ validate, lookup, formatStatus });
})(window);
