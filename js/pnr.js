/*
 * pnr.js
 * ---------------------------------------------------------------------------
 * Everything about PNR numbers:
 *
 *   validatePnr(text) - checks what the user typed (spaces and hyphens are
 *                       removed, letters are not allowed, must be 10 digits)
 *   lookupPnr(pnr)    - returns a simulated booking for a PNR. The same PNR
 *                       always gives the same booking.
 *
 * Simulator rules:
 *   - The 4 sample PNRs in data.js return fixed, hand-made bookings.
 *   - PNRs that start with 0 or 9, or use one digit 10 times (like
 *     5555555555), are "not found".
 *   - Any other 10-digit PNR makes up a booking on a simulated train.
 *
 * How passenger status works here:
 *   Think of every ticket as standing in ONE queue:
 *     rank 0          = confirmed
 *     rank 1 to R     = RAC 1 to RAC R   (R = number of RAC places)
 *     rank R+1 and up = WL 1, WL 2, ...
 *   All passengers on one PNR move forward in the queue together.
 *
 * Uses functions and data from data.js.
 * ---------------------------------------------------------------------------
 */

/* ==========================================================================
 * Validation
 * ======================================================================== */

/* Removes spaces and hyphens: "452-189 6307" -> "4521896307" */
function cleanPnrInput(text) {
  if (text === null || text === undefined) {
    text = '';
  }
  return String(text).replace(/[\s-]+/g, '');
}

/*
 * Checks a PNR typed by the user.
 * Returns { valid: true/false, pnr: cleaned text, error: message or null }
 */
function validatePnr(text) {
  const cleaned = cleanPnrInput(text);

  if (cleaned === '') {
    return { valid: false, pnr: '', error: 'Please enter your 10-digit PNR number.' };
  }
  if (/\D/.test(cleaned)) {
    // \D means "any character that is not a digit"
    return { valid: false, pnr: cleaned, error: 'PNR can contain digits only (0–9).' };
  }
  if (cleaned.length !== 10) {
    return { valid: false, pnr: cleaned, error: 'Invalid PNR: please enter exactly 10 digits.' };
  }
  return { valid: true, pnr: cleaned, error: null };
}

/* ==========================================================================
 * Status text
 * ======================================================================== */

/* Status object -> text, e.g. "CNF S4/32 Side Upper", "RAC 2", "WL 5", "CAN" */
function formatTicketStatus(status, classCode) {
  if (status.type === 'CNF') {
    return 'CNF ' + status.coach + '/' + status.berth + ' ' + berthTypeFor(classCode, status.berth);
  }
  if (status.type === 'RAC') {
    return 'RAC ' + status.pos;
  }
  if (status.type === 'WL') {
    return 'WL ' + status.pos;
  }
  return 'CAN';
}

/* ==========================================================================
 * Build the final result object (used for both samples and made-up PNRs)
 * ======================================================================== */

function buildPnrResult(booking) {
  const journeyDate = addDays(startOfToday(), booking.journeyOffset);

  // Add a passenger number and readable status text to each passenger
  const passengers = [];
  for (let i = 0; i < booking.passengers.length; i++) {
    const p = booking.passengers[i];
    passengers.push({
      no: i + 1,
      booking: p.booking,
      current: p.current,
      bookingText: formatTicketStatus(p.booking, booking.cls),
      currentText: formatTicketStatus(p.current, booking.cls),
    });
  }

  // Count passengers by their CURRENT status
  const summary = { total: passengers.length, cnf: 0, rac: 0, wl: 0, can: 0 };
  for (const p of passengers) {
    if (p.current.type === 'CNF') summary.cnf++;
    if (p.current.type === 'RAC') summary.rac++;
    if (p.current.type === 'WL') summary.wl++;
    if (p.current.type === 'CAN') summary.can++;
  }

  const arrival = booking.departure + booking.duration;

  return {
    found: true,
    pnr: booking.pnr,
    isSample: booking.isSample === true,
    train: booking.train,
    popularity: popularityForTrainNumber(booking.train.number),
    from: STATION_BY_CODE[booking.from],
    to: STATION_BY_CODE[booking.to],
    departure: booking.departure,
    arrival: arrival,
    arrivalDayOffset: Math.floor(arrival / 1440), // 1 = arrives the next day
    journeyDate: journeyDate,
    daysLeft: booking.journeyOffset,
    cls: booking.cls,
    quota: booking.quota,
    chartPrepared: booking.chartPrepared,
    isCancelled: summary.can === summary.total, // every passenger cancelled
    passengers: passengers,
    summary: summary,
  };
}

/* ==========================================================================
 * Make up a booking for any other PNR
 * --------------------------------------------------------------------------
 * The random generator is seeded with the PNR itself, so the same PNR
 * always gives the same booking.
 *
 * Important: the ORDER of the random calls below decides the result.
 * Changing the order would change which booking each PNR shows.
 * ======================================================================== */

/* Picks two far-apart stations, a date, and a train that runs that day. */
function pickRandomRoute(random) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const fromStation = random.pick(STATIONS);
    const toStation = random.pick(STATIONS);

    // Same station or same city? Try again.
    if (fromStation.code === toStation.code || fromStation.city === toStation.city) {
      continue;
    }
    // Too close? Try again.
    if (distanceKm(fromStation, toStation) < 200) {
      continue;
    }

    const daysAhead = random.int(0, 45);
    const dateISO = toISODate(addDays(startOfToday(), daysAhead));
    const trains = getTrainsForRoute(fromStation.code, toStation.code, dateISO).trains;

    if (trains.length > 0) {
      return { offset: daysAhead, train: random.pick(trains) };
    }
  }
  return null; // could not find a route (very rare)
}

/*
 * Turns a queue rank into a status (see the explanation at the top of this file).
 * seat is only used when the rank means "confirmed".
 */
function statusFromRank(rank, racPool, seat) {
  if (rank <= 0) {
    return { type: 'CNF', coach: seat.coach, berth: seat.berth };
  }
  if (rank <= racPool) {
    return { type: 'RAC', pos: rank };
  }
  return { type: 'WL', pos: rank - racPool };
}

function generateRandomBooking(pnr) {
  const random = createRandomGenerator(['pnr', pnr]);

  const route = pickRandomRoute(random);
  if (route === null) {
    return null;
  }
  const train = route.train;
  const daysAhead = route.offset;

  const cls = random.pick(train.classes);
  const travelClass = CLASSES[cls];

  // Quota (most bookings are General)
  let quota = random.weighted([
    { value: 'GN', weight: 70 },
    { value: 'TQ', weight: 12 },
    { value: 'SS', weight: 8 },
    { value: 'LD', weight: 4 },
    { value: 'HP', weight: 3 },
    { value: 'PT', weight: 3 },
  ]);
  if (!isQuotaOffered(quota, cls)) {
    quota = 'GN';
  }
  // Tatkal can only be booked for today or tomorrow
  if (QUOTA_BY_CODE[quota].isTatkal && daysAhead > RULES.TATKAL_MAX_DAYS_AHEAD) {
    quota = 'GN';
  }

  // Number of passengers on the ticket (1 to 6)
  const passengerCount = random.weighted([
    { value: 1, weight: 30 },
    { value: 2, weight: 30 },
    { value: 3, weight: 18 },
    { value: 4, weight: 12 },
    { value: 5, weight: 6 },
    { value: 6, weight: 4 },
  ]);

  const racPool = CANCELLATION_DATA.defaultRacPool[cls] || 0;

  // Picks a coach and the first berth number for a group of passengers
  function pickSeatBlock() {
    const coach = travelClass.coachPrefix + random.int(1, travelClass.coaches);
    const firstBerth = random.int(1, travelClass.berthsPerCoach - passengerCount);
    return { coach: coach, start: firstBerth };
  }

  const isCancelled = random.chance(0.06); // about 6% of bookings are cancelled

  // What status did the ticket have when it was booked?
  let racWeight = 0;
  if (racPool) {
    racWeight = 15;
  }
  const bookedAs = random.weighted([
    { value: 'CNF', weight: 35 },
    { value: 'RAC', weight: racWeight },
    { value: 'WL', weight: 50 },
  ]);

  // Queue rank of passenger 1 at booking time (0 = confirmed)
  let firstRank = 0;
  if (bookedAs === 'RAC') {
    firstRank = random.int(1, Math.max(1, racPool - passengerCount));
  }
  if (bookedAs === 'WL') {
    firstRank = racPool + random.int(1, 90);
  }

  // How many places the whole PNR has moved forward since booking
  let moved = 0;
  if (firstRank > 0) {
    const roll = random.next();
    if (roll < 0.3) {
      moved = 0; // 30%: no change since booking
    } else {
      const factor = random.range(0.3, 1.3);
      const maxMove = Math.max(2, Math.round((firstRank + passengerCount) * factor));
      moved = random.int(1, maxMove);
    }
  }

  const bookedSeats = pickSeatBlock(); // seats given at booking time (if confirmed then)
  const newSeats = pickSeatBlock(); // seats given later to passengers who got confirmed

  let newlyConfirmed = 0;
  const passengers = [];

  for (let i = 0; i < passengerCount; i++) {
    // Rank of this passenger when booked
    let bookingRank = 0;
    if (firstRank !== 0) {
      bookingRank = firstRank + i;
    }
    const bookingStatus = statusFromRank(bookingRank, racPool, {
      coach: bookedSeats.coach,
      berth: bookedSeats.start + i,
    });

    // Status now
    let currentStatus;
    if (isCancelled) {
      currentStatus = { type: 'CAN' };
    } else if (bookingRank === 0) {
      currentStatus = bookingStatus; // was confirmed from the start
    } else {
      const currentRank = bookingRank - moved;
      currentStatus = statusFromRank(currentRank, racPool, {
        coach: newSeats.coach,
        berth: newSeats.start + newlyConfirmed,
      });
      if (currentStatus.type === 'CNF') {
        newlyConfirmed++;
      }
    }

    passengers.push({ booking: bookingStatus, current: currentStatus });
  }

  return buildPnrResult({
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
  });
}

/* ==========================================================================
 * Lookup
 * ======================================================================== */

/*
 * Finds the booking for an already-validated 10-digit PNR.
 * Returns either { found: false, pnr, reason } or a full result (see buildPnrResult).
 */
function lookupPnr(pnr) {
  // 1. Is it one of the sample PNRs?
  for (const sample of SAMPLE_PNRS) {
    if (sample.pnr === pnr) {
      const booking = Object.assign({}, sample, { isSample: true });
      return buildPnrResult(booking);
    }
  }

  // 2. Simulator rule: starts with 0 or 9, or is one digit repeated 10 times -> not found
  const startsWith0or9 = pnr[0] === '0' || pnr[0] === '9';
  const allSameDigit = pnr === pnr[0].repeat(10);
  if (startsWith0or9 || allSameDigit) {
    return {
      found: false,
      pnr: pnr,
      reason: 'No booking matches this PNR. It may be mistyped, or the record was flushed after the journey was completed.',
    };
  }

  // 3. Otherwise make up a booking
  const result = generateRandomBooking(pnr);
  if (result === null) {
    return { found: false, pnr: pnr, reason: 'This PNR could not be simulated. Please try another number.' };
  }
  return result;
}
