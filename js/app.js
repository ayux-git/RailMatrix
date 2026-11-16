/*
 * app.js
 * ---------------------------------------------------------------------------
 * Everything the user sees and clicks on: the forms, the results, the
 * pop-up notifications and the tabs.
 *
 * Sections in this file:
 *   1. Page elements we use
 *   2. Small helpers (safe text, icons, badges)
 *   3. Alert pop-ups (messages shown with alert())
 *   4. Tabs ("Search Trains" / "PNR Status")
 *   5. Train search form and validation
 *   6. Search results, train cards and class details
 *   7. PNR status tracker
 *   8. Start the app
 *
 * How we put HTML on the page:
 *   We write HTML as text using template strings (the `backtick` strings)
 *   and put it on the page with element.innerHTML = ...
 *   Any text that could come from the user or from data is first passed
 *   through escapeHtml(), so it is always shown as plain text and can never
 *   be run as HTML or JavaScript.
 *
 * Uses functions and data from data.js, probability.js and pnr.js.
 * ---------------------------------------------------------------------------
 */

/* ==========================================================================
 * 1. Page elements we use
 * --------------------------------------------------------------------------
 * The <script> tags in index.html use "defer", so this file runs after the
 * whole page has loaded and these elements already exist.
 * ======================================================================== */

// Search tab
const searchForm = document.getElementById('searchForm');
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const travelDateInput = document.getElementById('travelDate');
const quotaSelect = document.getElementById('quota');
const quotaNote = document.getElementById('quotaNote');
const searchResults = document.getElementById('searchResults');

// PNR tab
const pnrForm = document.getElementById('pnrForm');
const pnrInput = document.getElementById('pnrInput');
const pnrCounter = document.getElementById('pnrCounter');
const pnrResult = document.getElementById('pnrResult');


/* ==========================================================================
 * 2. Small helpers
 * ======================================================================== */

/*
 * Makes text safe to put inside HTML.
 * For example "<b>" becomes "&lt;b&gt;", so it is shown as the text "<b>"
 * instead of being treated as a bold tag.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Text that only screen readers read out (hidden on screen by CSS). */
function srOnly(text) {
  return '<span class="sr-only">' + escapeHtml(text) + '</span>';
}

/* "1 train", "3 trains", "2 classes" */
function plural(count, word, pluralWord) {
  if (count === 1) {
    return count + ' ' + word;
  }
  return count + ' ' + (pluralWord || word + 's');
}

/* 1234 -> "₹1,234" (Indian number format, no paise) */
const rupeeFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
function formatINR(amount) {
  return rupeeFormatter.format(amount);
}

/* "hello world" -> "Hello world" */
function capitalizeFirstLetter(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ---------- Icons ---------- */

/*
 * The drawing instructions (SVG "path" data) for each icon.
 * Each icon is made of one or more lines/shapes.
 */
const ICON_PATHS = {
  check: ['M20 6 9 17l-5-5'],
  checkCircle: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M8 12.5l2.5 2.5L16 9.5'],
  rac: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 3v18'],
  hourglass: ['M7 3h10', 'M7 21h10', 'M8 3v3l4 6-4 6v3', 'M16 3v3l-4 6 4 6v3'],
  ban: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M5.7 5.7l12.6 12.6'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 7v5l3 2'],
  info: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 11v5', 'M12 8h.01'],
  alert: ['M12 3 2 20h20z', 'M12 10v4', 'M12 17h.01'],
  xCircle: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M15 9l-6 6', 'M9 9l6 6'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  refresh: ['M20 12a8 8 0 1 1-2.3-5.7', 'M20 4v5h-5'],
  train: ['M7 4h10a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2z', 'M5 10h14', 'M9 21l1.5-4', 'M15 21l-1.5-4'],
  ticket: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z', 'M14 5v14'],
  search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14', 'M21 21l-4.3-4.3'],
  route: ['M6 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4', 'M18 9a2 2 0 1 0 0-4a2 2 0 1 0 0 4', 'M6 15V9a4 4 0 0 1 4-4h6', 'M18 9v6a4 4 0 0 1-4 4H8'],
  sparkle: ['M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z'],
  chevronDown: ['M6 9l6 6 6-6'],
};

/* Returns the HTML for an icon, e.g. icon('check'). Icons are decorative, so screen readers skip them. */
function icon(name) {
  const paths = ICON_PATHS[name] || [];
  let html = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">';
  for (const pathData of paths) {
    html += '<path d="' + pathData + '"></path>';
  }
  html += '</svg>';
  return html;
}

/* ---------- Status badges ---------- */

/*
 * For each ticket status: its colour family ("tone"), icon, and meaning.
 * The tone is used in CSS class names like "badge--success".
 */
const STATUS_INFO = {
  AVL: { tone: 'success', icon: 'check', meaning: 'Available' },
  CNF: { tone: 'success', icon: 'check', meaning: 'Confirmed' },
  RAC: { tone: 'warning', icon: 'rac', meaning: 'Reservation Against Cancellation' },
  WL: { tone: 'danger', icon: 'hourglass', meaning: 'Waitlisted' },
  NA: { tone: 'neutral', icon: 'ban', meaning: 'Not offered' },
  NOT_OPEN: { tone: 'info', icon: 'clock', meaning: 'Booking not open yet' },
  CAN: { tone: 'neutral', icon: 'xCircle', meaning: 'Cancelled' },
};

/*
 * A coloured status badge with an icon and text, e.g. [✓ AVAILABLE 12].
 * size is optional: 'sm' (small) or 'lg' (large).
 */
function statusBadge(statusType, text, size) {
  const info = STATUS_INFO[statusType] || STATUS_INFO.NA;
  let classes = 'badge badge--' + info.tone;
  if (size) {
    classes += ' badge--' + size;
  }
  return (
    '<span class="' + classes + '" title="' + escapeHtml(info.meaning) + '">' +
    icon(info.icon) +
    '<span class="badge-text">' + escapeHtml(text) + '</span>' +
    '</span>'
  );
}

/*
 * The confirmation chance for a WL / RAC ticket, e.g. "64% · MEDIUM",
 * with a short note underneath. Uses probability.js.
 */
function predictionBadge(input) {
  const result = estimateConfirmationChance(input);

  let iconName = 'alert';
  if (result.band.key === 'HIGH') {
    iconName = 'checkCircle';
  } else if (result.band.key === 'MEDIUM') {
    iconName = 'rac';
  }

  const badgeText = result.percent + '% · ' + result.band.key;
  const note = 'needs ~' + result.needed + ', expected ~' + Math.round(result.expected) + ' cancellations';

  return (
    '<span class="prediction" title="' + escapeHtml(result.explanation) + '">' +
    '<span class="badge badge--' + result.band.tone + '">' + icon(iconName) + '<span class="badge-text">' + escapeHtml(badgeText) + '</span></span>' +
    '<span class="prediction-note">' + escapeHtml(note) + '</span>' +
    '</span>'
  );
}

/*
 * A big centred message box, used for "nothing here yet" and error messages.
 * options = { tone, iconName, title, text }
 */
function stateBlock(options) {
  const tone = options.tone || 'neutral';
  const iconName = options.iconName || 'info';

  let textHtml = '';
  if (options.text) {
    textHtml = '<p class="state-text">' + escapeHtml(options.text) + '</p>';
  }

  return `
    <div class="state-block state-block--${tone}">
      <span class="state-icon">${icon(iconName)}</span>
      <h2 class="state-title">${escapeHtml(options.title)}</h2>
      ${textHtml}
    </div>`;
}

/* ==========================================================================
 * 3. Alert pop-ups
 * --------------------------------------------------------------------------
 * Messages are shown with the browser's built-in alert() box, which appears
 * on top of the page. The user must press OK to close it.
 *
 * Use: showAlert('success' | 'warning' | 'error' | 'info', message, optionalTitle)
 * ======================================================================== */

/* The default title for each type of message */
const ALERT_TITLES = {
  success: '✅ Success',
  warning: '⚠️ Warning',
  error: '❌ Error',
  info: 'ℹ️ Info',
};

function showAlert(type, message, title) {
  let heading = ALERT_TITLES[type] || ALERT_TITLES.info;
  if (title) {
    heading = title;
  }

  // alert() freezes the page until OK is pressed. We wait one moment first
  // so the browser can draw the new results BEHIND the pop-up.
  requestAnimationFrame(function () {
    setTimeout(function () {
      alert(heading + '\n\n' + message);
    }, 0);
  });
}

/* ==========================================================================
 * 4. Tabs
 * --------------------------------------------------------------------------
 * Two tab buttons switch between two panels. The address bar shows
 * #search or #pnr, so a link can open a specific tab.
 * Keyboard: Left/Right arrows move between tabs, Home/End jump to first/last.
 * ======================================================================== */

const TAB_IDS = ['tab-search', 'tab-pnr'];

/*
 * Shows one tab and hides the others.
 * options (all optional):
 *   focus: true          -> move keyboard focus to the tab
 *   updateAddress: false -> don't change the #search / #pnr in the address bar
 */
function activateTab(tabId, options) {
  options = options || {};

  for (const id of TAB_IDS) {
    const tab = document.getElementById(id);
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    const isSelected = id === tabId;

    tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    tab.tabIndex = isSelected ? 0 : -1; // only the selected tab can be reached with Tab
    panel.hidden = !isSelected;

    if (isSelected && options.focus) {
      tab.focus();
    }
  }

  if (options.updateAddress !== false) {
    try {
      // "tab-pnr" -> "#pnr"
      history.replaceState(null, '', '#' + tabId.replace('tab-', ''));
    } catch (error) {
      // Some browsers block this when the page is opened as a local file. That's fine.
    }
  }
}

/* Reads #search or #pnr from the address bar. Returns the tab id, or null. */
function tabIdFromAddress() {
  const id = 'tab-' + location.hash.replace('#', '');
  if (TAB_IDS.includes(id)) {
    return id;
  }
  return null;
}

function setUpTabs() {
  TAB_IDS.forEach(function (id, index) {
    const tab = document.getElementById(id);

    tab.addEventListener('click', function () {
      activateTab(id);
    });

    tab.addEventListener('keydown', function (event) {
      let nextIndex = null;
      if (event.key === 'ArrowRight') {
        nextIndex = (index + 1) % TAB_IDS.length; // wraps from last to first
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (index - 1 + TAB_IDS.length) % TAB_IDS.length; // wraps from first to last
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = TAB_IDS.length - 1;
      }

      if (nextIndex !== null) {
        event.preventDefault();
        activateTab(TAB_IDS[nextIndex], { focus: true });
      }
    });
  });

  // When the user presses Back/Forward or edits the #part of the address
  window.addEventListener('hashchange', function () {
    const id = tabIdFromAddress();
    if (id) {
      activateTab(id, { updateAddress: false });
    }
  });

  // Open the tab named in the address, or "Search" by default
  activateTab(tabIdFromAddress() || 'tab-search', { updateAddress: false });
}

/* ==========================================================================
 * 5. Train search form and validation
 * ======================================================================== */

/*
 * Information about the current search. It is null until the first search.
 * Looks like:
 * {
 *   from, to          - station objects
 *   dateISO, date     - travel date as "2026-11-20" and as a Date
 *   quotaCode         - e.g. 'GN'
 *   tatkalClosed      - true if Tatkal was chosen but its window isn't open yet
 *   trains, distance, reason - from getTrainsForRoute()
 *   refreshCount      - { trainNumber: how many times Refresh was pressed }
 *   updatedAt         - { trainNumber: Date of the last update }
 *   openClass         - { trainNumber: class code whose details are open, or null }
 *   availability      - { trainNumber: { classCode: availability object } }
 * }
 */
let currentSearch = null;

/* "Popular" route buttons: [from, to] */
const QUICK_ROUTES = [
  ['NDLS', 'LDH'],
  ['BCT', 'NDLS'],
  ['HWH', 'NDLS'],
  ['MAS', 'SBC'],
  ['ASR', 'NDLS'],
];

/*
 * Finds a station from what the user typed.
 * Accepts "New Delhi (NDLS)", "NDLS", "ndls" or "New Delhi".
 * Returns the station object, or null if nothing matches.
 */
function findStation(typedText) {
  const text = String(typedText || '').trim();
  if (text === '') {
    return null;
  }

  // If the text ends with a code in brackets, like "(NDLS)", use that code
  let code = text;
  const bracketMatch = text.match(/\(([A-Za-z]{2,5})\)\s*$/);
  if (bracketMatch) {
    code = bracketMatch[1];
  }
  code = code.toUpperCase();

  if (STATION_BY_CODE[code]) {
    return STATION_BY_CODE[code];
  }

  // Otherwise try to match the full name or label
  const lowerText = text.toLowerCase();
  for (const station of STATIONS) {
    if (station.name.toLowerCase() === lowerText || station.label.toLowerCase() === lowerText) {
      return station;
    }
  }
  return null;
}

/*
 * Shows (or clears) the red error message under a form field.
 * Pass an empty message '' to clear the error.
 */
function setFieldError(input, message) {
  const errorElement = document.getElementById(input.id + '-error');
  if (errorElement) {
    errorElement.textContent = message || '';
  }
  input.setAttribute('aria-invalid', message ? 'true' : 'false');

  const field = input.closest('.field');
  if (field) {
    field.classList.toggle('has-error', !!message);
  }
}

/* Checks the From or To field. Returns an error message, or '' if it is fine. */
function checkStationField(input, otherInput, isDestination) {
  const value = input.value.trim();
  if (value === '') {
    return 'Please enter the ' + (isDestination ? 'destination' : 'origin') + ' station.';
  }

  const station = findStation(value);
  if (!station) {
    return 'Station not recognised. Please choose one from the suggestions list.';
  }

  if (isDestination) {
    const otherStation = findStation(otherInput.value);
    if (otherStation && otherStation.code === station.code) {
      return 'Origin and destination must be different stations.';
    }
  }
  return '';
}

/* Checks the travel date. Returns an error message, or '' if it is fine. */
function checkDateField() {
  const value = travelDateInput.value;
  if (!value) {
    return 'Please select a valid travel date.';
  }

  const date = parseISODate(value);
  if (!date) {
    return 'Please enter a valid date.';
  }

  const days = daysFromToday(date);
  if (days < 0) {
    return 'Travel date cannot be in the past.';
  }
  if (days > RULES.MAX_ADVANCE_DAYS) {
    const lastDate = addDays(startOfToday(), RULES.MAX_ADVANCE_DAYS);
    return 'You can book at most ' + RULES.MAX_ADVANCE_DAYS + ' days ahead (until ' + formatDate(lastDate) + ').';
  }
  return '';
}

/* Checks the quota dropdown. Returns an error message, or '' if it is fine. */
function checkQuotaField() {
  if (QUOTA_BY_CODE[quotaSelect.value]) {
    return '';
  }
  return 'Please select a quota.';
}

/*
 * Checks one field (by its id), shows or hides its error message,
 * and returns the message ('' = no error).
 */
function validateSearchField(fieldId) {
  let message = '';
  if (fieldId === 'origin') {
    message = checkStationField(originInput, destinationInput, false);
  } else if (fieldId === 'destination') {
    message = checkStationField(destinationInput, originInput, true);
  } else if (fieldId === 'travelDate') {
    message = checkDateField();
  } else if (fieldId === 'quota') {
    message = checkQuotaField();
  }
  setFieldError(document.getElementById(fieldId), message);
  return message;
}

/* Checks every field. Returns the ids of fields with errors (empty list = all good). */
function validateSearchForm() {
  const fieldIds = ['origin', 'destination', 'travelDate', 'quota'];
  const fieldsWithErrors = [];
  for (const id of fieldIds) {
    if (validateSearchField(id)) {
      fieldsWithErrors.push(id);
    }
  }
  return fieldsWithErrors;
}

/*
 * true when a Tatkal quota is chosen for a date that is too far away
 * (Tatkal only opens for today's and tomorrow's journeys).
 */
function isTatkalWindowClosed() {
  const quota = QUOTA_BY_CODE[quotaSelect.value];
  const date = parseISODate(travelDateInput.value);
  if (!quota || !quota.isTatkal || !date) {
    return false;
  }
  const days = daysFromToday(date);
  return days > RULES.TATKAL_MAX_DAYS_AHEAD && days <= RULES.MAX_ADVANCE_DAYS;
}

/* Shows a blue info (or orange warning) box under the form about the chosen quota. */
function updateQuotaNote() {
  const quota = QUOTA_BY_CODE[quotaSelect.value];

  // General quota has no note
  if (!quota || !quota.note) {
    quotaNote.className = 'note';
    quotaNote.innerHTML = '';
    quotaNote.hidden = true;
    return;
  }

  let tone = 'info';
  let title = quota.name + ' quota';
  let text = quota.note;

  if (isTatkalWindowClosed()) {
    const date = parseISODate(travelDateInput.value);
    const opensOn = addDays(date, -1);
    tone = 'warning';
    title = 'Tatkal window not open for this date';
    text =
      quota.name + ' is only bookable for journeys today or tomorrow (within the next 2 days). ' +
      'For ' + formatDate(date) + ' it opens on ' + formatDateLong(opensOn) + ' at ' + RULES.TATKAL_OPEN_AC + ' (AC) / ' +
      RULES.TATKAL_OPEN_NON_AC + ' (non-AC). You can still search to see projected fares.';
  }

  quotaNote.className = 'note note--' + tone;
  quotaNote.innerHTML = `
    ${icon(tone === 'warning' ? 'alert' : 'info')}
    <div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </div>`;
  quotaNote.hidden = false;
}

/* The message shown before the first search */
function showSearchPlaceholder() {
  searchResults.innerHTML = stateBlock({
    tone: 'neutral',
    iconName: 'route',
    title: 'Find trains on your route',
    text: 'Enter origin, destination, travel date and quota, then press “Search trains”. Or try one of the popular routes above.',
  });
}

/* Runs when the "Search trains" button is pressed */
function onSearchSubmit(event) {
  event.preventDefault(); // stop the browser from reloading the page

  // 1. Check the form
  const fieldsWithErrors = validateSearchForm();
  if (fieldsWithErrors.length > 0) {
    document.getElementById(fieldsWithErrors[0]).focus(); // jump to the first wrong field
    showAlert('error', 'Please fix ' + plural(fieldsWithErrors.length, 'highlighted field') + ' before searching.', 'Check your search');
    return;
  }

  // 2. Read the form
  const from = findStation(originInput.value);
  const to = findStation(destinationInput.value);
  originInput.value = from.label; // tidy up what was typed, e.g. "ndls" -> "New Delhi (NDLS)"
  destinationInput.value = to.label;
  const dateISO = travelDateInput.value;
  const date = parseISODate(dateISO);
  const quotaCode = quotaSelect.value;
  const tatkalClosed = isTatkalWindowClosed();

  if (tatkalClosed) {
    showAlert(
      'warning',
      'Tatkal for ' + formatDate(date) + ' opens on ' + formatDate(addDays(date, -1)) + '. Showing projected fares only.',
      'Tatkal window not open'
    );
  }

  // 3. Find the trains
  const routeResult = getTrainsForRoute(from.code, to.code, dateISO);
  const searchedAt = new Date();

  currentSearch = {
    from: from,
    to: to,
    dateISO: dateISO,
    date: date,
    quotaCode: quotaCode,
    tatkalClosed: tatkalClosed,
    trains: routeResult.trains,
    distance: routeResult.distance,
    reason: routeResult.reason,
    refreshCount: {},
    updatedAt: {},
    openClass: {},
    availability: {},
  };

  // Pretend each train's data was last updated a few minutes ago
  for (const train of routeResult.trains) {
    const minutesAgo = createRandomGenerator(['updated', train.number, dateISO, quotaCode]).int(2, 28);
    currentSearch.refreshCount[train.number] = 0;
    currentSearch.updatedAt[train.number] = new Date(searchedAt.getTime() - minutesAgo * 60000);
  }

  // 4. Show the results
  renderSearchResults();

  const routeText = from.code + ' → ' + to.code;
  if (routeResult.trains.length > 0) {
    showAlert('success', 'Search complete: ' + plural(routeResult.trains.length, 'train') + ' found for ' + routeText + ' on ' + formatDate(date) + '.');
  } else {
    showAlert('warning', 'No trains found for ' + routeText + ' on ' + formatDate(date) + '.', 'No trains found');
  }
}

/* Swaps the From and To stations */
function swapStations() {
  const oldOrigin = originInput.value;
  originInput.value = destinationInput.value;
  destinationInput.value = oldOrigin;

  for (const id of ['origin', 'destination']) {
    const input = document.getElementById(id);
    if (input.value.trim()) {
      validateSearchField(id);
    } else {
      setFieldError(input, '');
    }
  }
}

function setUpSearch() {
  // Station suggestions for the From / To boxes (sorted A to Z)
  const sortedStations = STATIONS.slice().sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  let optionsHtml = '';
  for (const station of sortedStations) {
    optionsHtml += '<option value="' + escapeHtml(station.label) + '"></option>';
  }
  document.getElementById('stationList').innerHTML = optionsHtml;

  // Quota dropdown
  let quotaOptionsHtml = '<option value="">Select a quota</option>';
  for (const quota of QUOTAS) {
    quotaOptionsHtml += '<option value="' + quota.code + '">' + escapeHtml(quota.name) + ' (' + quota.code + ')</option>';
  }
  quotaSelect.innerHTML = quotaOptionsHtml;
  quotaSelect.value = 'GN';

  // Date limits: from today up to 120 days ahead. Default: 4 days from today.
  const today = startOfToday();
  travelDateInput.min = toISODate(today);
  travelDateInput.max = toISODate(addDays(today, RULES.MAX_ADVANCE_DAYS));
  travelDateInput.value = toISODate(addDays(today, 4));

  // "Popular" route buttons
  const quickRoutesBox = document.getElementById('quickRoutes');
  quickRoutesBox.innerHTML = '';
  for (const route of QUICK_ROUTES) {
    const fromStation = STATION_BY_CODE[route[0]];
    const toStation = STATION_BY_CODE[route[1]];

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.setAttribute('aria-label', 'Search ' + fromStation.name + ' to ' + toStation.name);
    button.textContent = route[0] + ' → ' + route[1];

    button.addEventListener('click', function () {
      originInput.value = fromStation.label;
      destinationInput.value = toStation.label;
      setFieldError(originInput, '');
      setFieldError(destinationInput, '');
      // Submit the form, just like pressing the "Search trains" button
      if (searchForm.requestSubmit) {
        searchForm.requestSubmit();
      } else {
        searchForm.dispatchEvent(new Event('submit', { cancelable: true })); // for older browsers
      }
    });

    quickRoutesBox.appendChild(button);
  }

  // Check the station fields while the user types / leaves them
  for (const id of ['origin', 'destination']) {
    const input = document.getElementById(id);
    const isDestination = id === 'destination';
    const otherInput = isDestination ? originInput : destinationInput;
    const otherId = isDestination ? 'origin' : 'destination';

    // A value was picked or typed and the user moved on
    input.addEventListener('change', function () {
      const station = findStation(input.value);
      if (station) {
        input.value = station.label;
      }
      validateSearchField(id);
      if (otherInput.value.trim()) {
        validateSearchField(otherId);
      }
    });

    // The user left the field
    input.addEventListener('blur', function () {
      if (input.value.trim()) {
        validateSearchField(id);
      }
    });

    // While typing: remove the error as soon as the value becomes correct
    input.addEventListener('input', function () {
      const hasError = input.getAttribute('aria-invalid') === 'true';
      if (hasError && checkStationField(input, otherInput, isDestination) === '') {
        setFieldError(input, '');
      }
    });
  }

  travelDateInput.addEventListener('change', function () {
    validateSearchField('travelDate');
    updateQuotaNote();
  });

  quotaSelect.addEventListener('change', function () {
    validateSearchField('quota');
    updateQuotaNote();
  });

  document.getElementById('swapBtn').addEventListener('click', swapStations);
  searchForm.addEventListener('submit', onSearchSubmit);

  updateQuotaNote();
  showSearchPlaceholder();
}

/* ==========================================================================
 * 6. Search results, train cards and class details
 * ======================================================================== */

function renderSearchResults() {
  const search = currentSearch;
  const quota = QUOTA_BY_CODE[search.quotaCode];

  // No trains: show a message and stop
  if (search.trains.length === 0) {
    let text;
    if (search.reason === 'too-close') {
      text = search.from.name + ' and ' + search.to.name + ' are only about ' + search.distance + ' km apart, so no long-distance trains are listed. Try a station in another city.';
    } else {
      text = 'No simulated trains run between ' + search.from.name + ' and ' + search.to.name + ' on ' + formatDateLong(search.date) + '. Try another date.';
    }
    searchResults.innerHTML = stateBlock({ tone: 'warning', iconName: 'search', title: 'No trains found', text: text });
    return;
  }

  // Extra labels next to the heading
  let tagsHtml = '';
  const festival = getFestivalSeason(search.date);
  if (festival) {
    tagsHtml += '<span class="tag tag--warning">' + icon('sparkle') + escapeHtml(festival.name + ': high demand') + '</span>';
  }
  if (search.tatkalClosed) {
    tagsHtml += '<span class="tag tag--info">' + icon('clock') + 'Tatkal not open yet</span>';
  }

  const metaText = ' · ' + formatDateLong(search.date) + ' · ' + quota.name + ' quota · ~' + search.distance + ' km';

  searchResults.innerHTML = `
    <div class="results-head">
      <div>
        <h2 class="results-title" tabindex="-1" id="searchResultsTitle">${plural(search.trains.length, 'train')} found</h2>
        <p class="results-meta"><strong>${escapeHtml(search.from.code + ' → ' + search.to.code)}</strong>${escapeHtml(metaText)}</p>
      </div>
      <div class="results-tags">${tagsHtml}</div>
    </div>

    <ul class="status-legend" aria-label="Status legend">
      <li>${statusBadge('AVL', 'AVAILABLE', 'sm')} berths free</li>
      <li>${statusBadge('RAC', 'RAC', 'sm')} shared berth</li>
      <li>${statusBadge('WL', 'WL', 'sm')} waitlist</li>
    </ul>

    <ul class="train-list"></ul>`;

  // Add one card per train
  const trainList = searchResults.querySelector('.train-list');
  for (const train of search.trains) {
    const listItem = document.createElement('li');
    listItem.appendChild(buildTrainCard(train));
    trainList.appendChild(listItem);
  }

  // Move screen-reader focus to the results heading (without scrolling)
  document.getElementById('searchResultsTitle').focus({ preventScroll: true });
}

/* The small M T W T F S S pills showing which days a train runs */
function runningDaysHtml(runningDays) {
  const dayNames = [];
  let runsEveryDay = true;
  for (let i = 0; i < 7; i++) {
    if (runningDays[i]) {
      dayNames.push(WEEKDAYS[i]);
    } else {
      runsEveryDay = false;
    }
  }
  const label = runsEveryDay ? 'Runs daily' : 'Runs on ' + dayNames.join(', ');

  let pillsHtml = '';
  for (let i = 0; i < 7; i++) {
    const day = WEEKDAYS[i];
    const runs = runningDays[i];
    const title = day + ': ' + (runs ? 'runs' : 'does not run');
    pillsHtml += '<li' + (runs ? ' class="is-on"' : '') + ' title="' + title + '">' + day.charAt(0) + '</li>';
  }

  return `
    <div class="run-days">
      ${srOnly(label)}
      <ul class="day-pills" aria-hidden="true">${pillsHtml}</ul>
    </div>`;
}

/* Builds the card for one train and returns it (an <article> element). */
function buildTrainCard(train) {
  const search = currentSearch;
  const number = train.number;

  // "+1" next to the arrival time when the train arrives on a later day
  let dayOffsetHtml = '';
  if (train.arrivalDayOffset) {
    const offset = train.arrivalDayOffset;
    dayOffsetHtml =
      '<sup class="day-offset" title="Arrives ' + plural(offset, 'day') + ' later">+' + offset +
      srOnly(offset === 1 ? ' day' : ' days') + '</sup>';
  }

  const card = document.createElement('article');
  card.className = 'card train-card';
  card.setAttribute('aria-labelledby', 't' + number + '-title');
  card.setAttribute('data-train', number);

  card.innerHTML = `
    <header class="train-head">
      <div class="train-title-wrap">
        <h3 class="train-title" id="t${number}-title"><span class="train-num">${number}</span> <span class="train-name">${escapeHtml(train.name)}</span></h3>
        <span class="type-badge type-${train.type.toLowerCase()}">${escapeHtml(train.typeLabel)}</span>
      </div>
      ${runningDaysHtml(train.runningDays)}
    </header>

    <div class="train-times">
      <div class="time-block">
        ${srOnly('Departs ')}
        <strong class="time">${formatTime(train.departure)}</strong>
        <span class="stn">${escapeHtml(search.from.code)}</span>
        <span class="stn-name">${escapeHtml(search.from.name)}</span>
      </div>
      <div class="duration">
        ${srOnly('Journey time ')}
        <span class="duration-time">${formatDuration(train.duration)}</span>
        <span class="duration-line" aria-hidden="true"></span>
        <span class="duration-km">${train.distance} km</span>
      </div>
      <div class="time-block time-block--end">
        ${srOnly('Arrives ')}
        <strong class="time">${formatTime(train.arrival)}${dayOffsetHtml}</strong>
        <span class="stn">${escapeHtml(search.to.code)}</span>
        <span class="stn-name">${escapeHtml(search.to.name)}</span>
      </div>
    </div>

    <ul class="class-grid" aria-label="Classes on train ${number}"></ul>

    <div class="class-details" id="t${number}-details" hidden></div>

    <footer class="train-foot">
      <p class="updated"></p>
      <button type="button" class="btn btn-secondary btn-sm refresh-btn" aria-label="Refresh availability for ${number} ${escapeHtml(train.name)}">${icon('refresh')}<span>Refresh</span></button>
    </footer>`;

  card.querySelector('.refresh-btn').addEventListener('click', function () {
    refreshTrain(card, train);
  });

  fillClassGrid(card, train);
  return card;
}

/* Gets the availability of every class on a train and saves it in currentSearch */
function loadAvailability(train) {
  const search = currentSearch;
  const byClass = {};
  for (const cls of train.classes) {
    byClass[cls] = getAvailability(train, cls, search.quotaCode, search.dateISO, search.refreshCount[train.number]);
  }
  search.availability[train.number] = byClass;
  return byClass;
}

/* "Last updated 10:42 AM · 5 mins ago" */
function lastUpdatedText(train) {
  const updatedAt = currentSearch.updatedAt[train.number];
  const minutesAgo = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 60000));
  const agoText = minutesAgo === 0 ? 'just now' : plural(minutesAgo, 'min') + ' ago';
  return 'Last updated ' + formatClock(updatedAt) + ' · ' + agoText;
}

/* Fills a train card with one button per class (fare + status) */
function fillClassGrid(card, train) {
  const availability = loadAvailability(train);
  const openClass = currentSearch.openClass[train.number];

  let html = '';
  for (const cls of train.classes) {
    const avl = availability[cls];
    const travelClass = CLASSES[cls];
    const tone = STATUS_INFO[avl.status].tone;

    let fareHtml = '<span class="muted">—</span>';
    if (avl.fare) {
      fareHtml = srOnly('Fare ') + formatINR(avl.fare.total);
    }

    html += `
      <li>
        <button type="button" class="class-card class-card--${tone}" aria-expanded="${openClass === cls ? 'true' : 'false'}" aria-controls="t${train.number}-details" data-cls="${cls}">
          <span class="cc-top"><span class="cc-code">${cls}</span><span class="cc-name">${escapeHtml(travelClass.name)}</span></span>
          <span class="cc-fare">${fareHtml}</span>
          <span class="cc-status">${srOnly('Status: ')}${statusBadge(avl.status, avl.label)}</span>
          <span class="cc-chevron">${icon('chevronDown')}</span>
        </button>
      </li>`;
  }

  const grid = card.querySelector('.class-grid');
  grid.innerHTML = html;

  // Clicking a class opens / closes its details
  const buttons = grid.querySelectorAll('.class-card');
  for (const button of buttons) {
    button.addEventListener('click', function () {
      toggleClassDetails(card, train, button.dataset.cls);
    });
  }

  card.querySelector('.updated').textContent = lastUpdatedText(train);

  // If a class was open before (e.g. before a refresh), show its new details
  if (openClass) {
    renderClassDetails(card, train, openClass);
  }
}

/* Opens the details of a class, or closes them if they are already open */
function toggleClassDetails(card, train, cls) {
  const wasOpen = currentSearch.openClass[train.number] === cls;
  currentSearch.openClass[train.number] = wasOpen ? null : cls;

  // Update aria-expanded on every class button (only the opened one is "true")
  for (const button of card.querySelectorAll('.class-card')) {
    const isThisOneOpen = !wasOpen && button.dataset.cls === cls;
    button.setAttribute('aria-expanded', isThisOneOpen ? 'true' : 'false');
  }

  const details = card.querySelector('.class-details');
  if (wasOpen) {
    details.hidden = true;
    details.innerHTML = '';
  } else {
    renderClassDetails(card, train, cls);
  }
}

/* A small horizontal bar (0 to 100%) used in the berth table */
function berthBarHtml(percent) {
  let fillHtml = '';
  if (percent > 0) {
    fillHtml = '<rect class="berth-bar-fill" x="0" y="0" width="' + Math.max(4, percent) + '" height="8" rx="4"></rect>';
  }
  return (
    '<svg class="berth-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<rect class="berth-bar-track" x="0" y="0" width="100" height="8" rx="4"></rect>' +
    fillHtml +
    '</svg>'
  );
}

/* One sentence explaining what a status means for the user */
function statusExplanation(avl, train) {
  const travelClass = CLASSES[avl.cls];
  const unit = travelClass.seats ? 'seat' : 'berth';

  if (avl.status === 'AVL') {
    return plural(avl.count, unit) + ' available to book right now in this quota.';
  }
  if (avl.status === 'RAC') {
    if (travelClass.seats) {
      return 'RAC is not issued in chair car classes.';
    }
    return 'You would be RAC ' + avl.count + ': you get a shared side-lower berth and move up as confirmed passengers cancel.';
  }
  if (avl.status === 'WL') {
    return 'You would be WL ' + avl.count + '. A ' + unit + ' is allotted only if enough passengers cancel; e-tickets still waitlisted after charting are cancelled automatically.';
  }
  if (avl.status === 'NOT_OPEN') {
    return 'Tatkal booking for this journey opens on ' + formatDateLong(avl.opensAt.date) + ' at ' + avl.opensAt.time + '. The fare shown is projected.';
  }
  // 'NA'
  return 'The ' + QUOTA_BY_CODE[avl.quotaCode].name + ' quota is not offered in ' + travelClass.name + ' on ' + train.number + '. Try the General quota.';
}

/* Shows the details panel for one class: explanation, berth table, fare table, chance */
function renderClassDetails(card, train, cls) {
  const search = currentSearch;
  const avl = search.availability[train.number][cls];
  const travelClass = CLASSES[cls];
  const quota = QUOTA_BY_CODE[search.quotaCode];
  const titleId = 't' + train.number + '-' + cls + '-dtitle';

  // --- Berth-type table (not shown when the quota isn't offered or Tatkal isn't open) ---
  let berthHtml = '';
  if (avl.status !== 'NA' && avl.status !== 'NOT_OPEN') {
    let totalFree = 0;
    for (const berth of avl.berths) {
      totalFree += berth.count;
    }

    let rowsHtml = '';
    for (const berth of avl.berths) {
      const percent = totalFree ? (berth.count / totalFree) * 100 : 0;
      rowsHtml += `
        <tr>
          <th scope="row">${escapeHtml(berth.type)}</th>
          <td class="num">${berth.count}</td>
          <td class="bar-cell">${berthBarHtml(percent)}</td>
        </tr>`;
    }

    let noteHtml = '';
    if (avl.status === 'RAC') {
      noteHtml = '<p class="muted small">No full berths are free. RAC passengers share side-lower berths until a berth is released.</p>';
    } else if (avl.status === 'WL') {
      noteHtml = '<p class="muted small">No berths or RAC places are free in this quota.</p>';
    }

    const heading = travelClass.seats ? 'Seat-type breakdown' : 'Berth-type breakdown';
    berthHtml = `
      <section class="details-section" aria-label="${heading}">
        <h5>${heading}</h5>
        <table class="berth-table">
          <thead>
            <tr><th scope="col">Type</th><th scope="col">Free</th><th scope="col"><span class="sr-only">Share</span></th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        ${noteHtml}
      </section>`;
  }

  // --- Fare table ---
  let fareHtml = '';
  if (avl.fare) {
    let partsHtml = '';
    for (const part of avl.fare.parts) {
      const sign = part.amount < 0 ? '−' : ''; // show discounts with a minus sign
      partsHtml += '<dt>' + escapeHtml(part.label) + '</dt><dd>' + sign + formatINR(Math.abs(part.amount)) + '</dd>';
    }
    fareHtml = `
      <section class="details-section" aria-label="Fare breakdown">
        <h5>Fare breakdown (per passenger)</h5>
        <dl class="fare-list">
          ${partsHtml}
          <dt class="fare-total">Total (rounded)</dt>
          <dd class="fare-total">${formatINR(avl.fare.total)}</dd>
        </dl>
      </section>`;
  }

  // --- Confirmation chance (only for RAC and WL) ---
  let chanceHtml = '';
  if (avl.status === 'RAC' || avl.status === 'WL') {
    const prediction = predictionBadge({
      statusType: avl.status,
      position: avl.count,
      cls: cls,
      quota: search.quotaCode,
      daysLeft: daysFromToday(search.date),
      popularity: train.popularity,
      trainKey: train.number,
      racPool: avl.racPool,
    });
    chanceHtml = '<div class="chance-inline"><span class="small">Confirmation chance:</span>' + prediction + '</div>';
  }

  const details = card.querySelector('.class-details');
  details.innerHTML = `
    <div class="details-inner" role="region" aria-labelledby="${titleId}">
      <div class="details-head">
        <h4 id="${titleId}">${escapeHtml(travelClass.name + ' (' + cls + ') · ' + quota.name + ' quota')}</h4>
        ${statusBadge(avl.status, avl.label, 'lg')}
      </div>
      <p class="details-text">${escapeHtml(statusExplanation(avl, train))}</p>
      <div class="details-grid">
        ${berthHtml}
        ${fareHtml}
      </div>
      <div class="details-actions">
        <p class="muted small">${escapeHtml(lastUpdatedText(train))}</p>
        ${chanceHtml}
      </div>
    </div>`;
  details.hidden = false;
}

/* The "Refresh" button on a train card: get new numbers and say how many classes changed */
function refreshTrain(card, train) {
  const search = currentSearch;

  // Remember the old labels, e.g. ["AVAILABLE 12", "WL 4"]
  const labelsBefore = [];
  for (const cls of train.classes) {
    labelsBefore.push(search.availability[train.number][cls].label);
  }

  search.refreshCount[train.number] += 1;
  search.updatedAt[train.number] = new Date();
  fillClassGrid(card, train);

  // Count how many labels are different now
  let changedCount = 0;
  train.classes.forEach(function (cls, i) {
    if (search.availability[train.number][cls].label !== labelsBefore[i]) {
      changedCount++;
    }
  });

  const changeText = changedCount ? plural(changedCount, 'class', 'classes') + ' changed' : 'no change';
  showAlert('info', 'Availability refreshed for ' + train.number + ' ' + train.name + ': ' + changeText + '.', 'Refreshed');
}

/* ==========================================================================
 * 7. PNR status tracker
 * ======================================================================== */

/* Updates the "7/10 digits" counter under the PNR box */
function updatePnrCounter(length) {
  if (length === 10) {
    pnrCounter.textContent = '10/10 digits · ready to check';
  } else {
    pnrCounter.textContent = length + '/10 digits';
  }
  pnrCounter.classList.toggle('is-complete', length === 10);
}

function showPnrError(message) {
  setFieldError(pnrInput, message);
}

/* Makes sure only digits can go into the PNR box (max 10) */
function setUpPnrInput() {
  // Stop letters/symbols as they are typed
  pnrInput.addEventListener('beforeinput', function (event) {
    const isTyping = event.inputType === 'insertText' && event.data;
    if (isTyping && /[^\d\s-]/.test(event.data)) {
      event.preventDefault();
      showPnrError('Only digits 0–9 are allowed in a PNR.');
    }
  });

  // Clean up anything else (paste, autofill, drag and drop): keep digits only, max 10
  pnrInput.addEventListener('input', function () {
    const typed = pnrInput.value;
    const hadLettersOrSymbols = /[^\d\s-]/.test(typed);
    let digits = typed.replace(/\D/g, ''); // remove everything that is not a digit
    const wasTooLong = digits.length > 10;
    digits = digits.slice(0, 10);

    if (digits !== typed) {
      pnrInput.value = digits;
    }
    updatePnrCounter(digits.length);

    if (hadLettersOrSymbols) {
      showPnrError('Letters and symbols were removed: a PNR contains digits only.');
    } else if (wasTooLong) {
      showPnrError('A PNR has exactly 10 digits, so the extra digits were removed.');
    } else {
      showPnrError('');
    }
  });

  // When leaving the box with too few digits
  pnrInput.addEventListener('blur', function () {
    const length = pnrInput.value.length;
    if (length > 0 && length < 10) {
      showPnrError('Invalid PNR: please enter exactly 10 digits (' + length + ' entered).');
    }
  });
}

function showPnrErrorBlock(title, text) {
  pnrResult.innerHTML = stateBlock({ tone: 'danger', iconName: 'xCircle', title: title, text: text });
}

/* A short summary like "2 of 3 passengers still on waitlist" */
function pnrSummaryText(result) {
  const total = result.summary.total;
  const word = total === 1 ? 'passenger' : 'passengers';

  let everyone;
  if (total === 1) {
    everyone = 'the passenger';
  } else if (total === 2) {
    everyone = 'both passengers';
  } else {
    everyone = 'all ' + total + ' passengers';
  }

  if (result.isCancelled) return 'booking cancelled for ' + everyone;
  if (result.summary.wl) return result.summary.wl + ' of ' + total + ' ' + word + ' still on waitlist';
  if (result.summary.rac) return result.summary.rac + ' of ' + total + ' ' + word + ' in RAC';
  if (result.summary.can) return result.summary.cnf + ' confirmed, ' + result.summary.can + ' cancelled';
  return everyone + ' confirmed';
}

/* What to show in the "Prediction" column for one passenger */
function passengerPredictionHtml(passenger, result) {
  const type = passenger.current.type;
  const isPending = type === 'WL' || type === 'RAC';

  if (type === 'CNF') {
    return '<span class="muted small">Already confirmed</span>';
  }
  if (type === 'CAN') {
    return '<span class="muted small">Cancelled</span>';
  }
  if (isPending && result.chartPrepared) {
    return '<span class="muted small">Chart prepared: not confirmed</span>';
  }
  return predictionBadge({
    statusType: type,
    position: passenger.current.pos,
    cls: result.cls,
    quota: result.quota,
    daysLeft: result.daysLeft,
    popularity: result.popularity,
    trainKey: result.train.number,
    racPool: CANCELLATION_DATA.defaultRacPool[result.cls],
  });
}

/* Shows the full PNR result card */
function renderPnrResult(result) {
  const travelClass = CLASSES[result.cls];
  const quota = QUOTA_BY_CODE[result.quota];

  // --- Chart badge ---
  let chartBadge;
  if (result.chartPrepared) {
    chartBadge = '<span class="badge badge--success">' + icon('checkCircle') + '<span class="badge-text">Chart Prepared</span></span>';
  } else {
    chartBadge = '<span class="badge badge--neutral">' + icon('clock') + '<span class="badge-text">Chart Not Prepared</span></span>';
  }

  let sampleTag = '';
  if (result.isSample) {
    sampleTag = '<span class="tag tag--info">Sample</span>';
  }

  // --- Warning banner (cancelled, or still waitlisted after the chart) ---
  let bannerHtml = '';
  if (result.isCancelled) {
    bannerHtml = `
      <div class="note note--neutral" role="note">
        ${icon('xCircle')}
        <div>
          <strong>This booking has been cancelled.</strong>
          <p>Any refund is credited to the original payment method in 5–7 working days (simulated).</p>
        </div>
      </div>`;
  } else if (result.chartPrepared && result.summary.wl) {
    bannerHtml = `
      <div class="note note--warning" role="note">
        ${icon('alert')}
        <div>
          <strong>Chart prepared.</strong>
          <p>Passengers still waitlisted after charting are not allowed to board on an e-ticket.</p>
        </div>
      </div>`;
  }

  // --- Journey details ---
  let arrivalText = result.to.name + ' (' + result.to.code + ') · ' + formatTime(result.arrival);
  if (result.arrivalDayOffset) {
    arrivalText += ' (+' + result.arrivalDayOffset + ' day)';
  }
  const journeyRows = [
    ['Train', result.train.number + ' ' + result.train.name],
    ['Journey date', formatDateLong(result.journeyDate)],
    ['Class', result.cls + ' · ' + travelClass.name],
    ['Quota', quota.name + ' (' + quota.code + ')'],
    ['Boarding', result.from.name + ' (' + result.from.code + ') · ' + formatTime(result.departure)],
    ['Destination', arrivalText],
  ];
  let journeyHtml = '';
  for (const row of journeyRows) {
    journeyHtml += '<div class="journey-item"><dt>' + escapeHtml(row[0]) + '</dt><dd>' + escapeHtml(row[1]) + '</dd></div>';
  }

  // --- Count chips: "3 passengers", "1 CNF", "2 WL" ---
  const summary = result.summary;
  let countsHtml = '<li>' + plural(summary.total, 'passenger') + '</li>';
  if (summary.cnf) countsHtml += '<li>' + statusBadge('CNF', summary.cnf + ' CNF', 'sm') + '</li>';
  if (summary.rac) countsHtml += '<li>' + statusBadge('RAC', summary.rac + ' RAC', 'sm') + '</li>';
  if (summary.wl) countsHtml += '<li>' + statusBadge('WL', summary.wl + ' WL', 'sm') + '</li>';
  if (summary.can) countsHtml += '<li>' + statusBadge('CAN', summary.can + ' CAN', 'sm') + '</li>';

  // --- Passenger table ---
  let passengerRowsHtml = '';
  for (const passenger of result.passengers) {
    passengerRowsHtml += `
      <tr>
        <th scope="row" data-label="Passenger">Passenger ${passenger.no}</th>
        <td data-label="Booking status">${statusBadge(passenger.booking.type, passenger.bookingText)}</td>
        <td data-label="Current status">${statusBadge(passenger.current.type, passenger.currentText)}</td>
        <td data-label="Prediction">${passengerPredictionHtml(passenger, result)}</td>
      </tr>`;
  }

  // --- Footer text ---
  let chartText = 'The chart is usually prepared about 4 hours before departure. ';
  if (result.chartPrepared) {
    chartText = 'Final chart has been prepared. ';
  }
  const footerText =
    'Checked at ' + formatClock(new Date()) + '. ' + chartText +
    'Prediction = simulated chance of a confirmed berth, from past cancellations on this train ' +
    '(HIGH above 70%, MEDIUM 35–70%, LOW below 35%).';

  // --- Put it all together ---
  pnrResult.innerHTML = `
    <article class="card pnr-card" aria-labelledby="pnrResultTitle">
      <header class="pnr-head">
        <div>
          <h2 id="pnrResultTitle" tabindex="-1">PNR <span class="mono">${escapeHtml(result.pnr)}</span></h2>
          <p class="results-meta">${escapeHtml(capitalizeFirstLetter(pnrSummaryText(result)))}</p>
        </div>
        <div class="pnr-badges">${sampleTag}${chartBadge}</div>
      </header>

      ${bannerHtml}

      <dl class="journey-grid">${journeyHtml}</dl>

      <ul class="count-chips" aria-label="Status counts">${countsHtml}</ul>

      <div class="table-wrap">
        <table class="pnr-table">
          <caption class="sr-only">Passenger status for PNR ${escapeHtml(result.pnr)}</caption>
          <thead>
            <tr>
              <th scope="col">Passenger</th>
              <th scope="col">Booking status</th>
              <th scope="col">Current status</th>
              <th scope="col">Prediction</th>
            </tr>
          </thead>
          <tbody>${passengerRowsHtml}</tbody>
        </table>
      </div>

      <p class="muted small">${escapeHtml(footerText)}</p>
    </article>`;

  // Move screen-reader focus to the result heading (without scrolling)
  document.getElementById('pnrResultTitle').focus({ preventScroll: true });
}

/* Checks a PNR and shows the result (or an error) */
function checkPnr(typedValue) {
  // 1. Validate
  const check = validatePnr(typedValue);
  if (!check.valid) {
    showPnrError(check.error);
    pnrInput.focus();
    showPnrErrorBlock('Invalid PNR', check.error + ' A PNR is the 10-digit number printed at the top of your ticket.');
    if (check.error.startsWith('Invalid PNR')) {
      showAlert('error', check.error);
    } else {
      showAlert('error', 'Invalid PNR: ' + check.error);
    }
    return;
  }

  pnrInput.value = check.pnr;
  updatePnrCounter(10);
  showPnrError('');

  // 2. Look it up
  const result = lookupPnr(check.pnr);

  if (!result.found) {
    showPnrErrorBlock('PNR ' + check.pnr + ' not found', result.reason);
    showAlert('error', 'PNR ' + check.pnr + ' not found. Please check the number and try again.', 'PNR not found');
    return;
  }

  // 3. Show it
  renderPnrResult(result);

  const message = 'PNR ' + result.pnr + ' checked: ' + pnrSummaryText(result) + '.';
  if (result.isCancelled) {
    showAlert('warning', message);
  } else if (result.summary.wl || result.summary.rac) {
    showAlert('info', message, 'PNR checked');
  } else {
    showAlert('success', message, 'PNR checked');
  }
}

function setUpPnr() {
  setUpPnrInput();

  pnrForm.addEventListener('submit', function (event) {
    event.preventDefault(); // stop the browser from reloading the page
    checkPnr(pnrInput.value);
  });

  // "Try a sample PNR" buttons
  const sampleBox = document.getElementById('sampleChips');
  sampleBox.innerHTML = '';
  for (const sample of SAMPLE_PNRS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip chip--' + sample.tone;
    button.setAttribute('aria-label', 'Try sample PNR ' + sample.pnr + ' (' + sample.label + ')');
    button.innerHTML = '<span class="mono">' + sample.pnr + '</span><span class="chip-sub">' + escapeHtml(sample.label) + '</span>';

    button.addEventListener('click', function () {
      pnrInput.value = sample.pnr;
      updatePnrCounter(10);
      checkPnr(sample.pnr);
    });

    sampleBox.appendChild(button);
  }

  // Message shown before the first check
  pnrResult.innerHTML = stateBlock({
    tone: 'neutral',
    iconName: 'ticket',
    title: 'Check a PNR',
    text: 'Enter a 10-digit PNR or tap a sample above to see passenger-wise booking and current status.',
  });
}

/* ==========================================================================
 * 8. Start the app
 * ======================================================================== */

function startApp() {
  setUpSearch();
  setUpPnr();
  setUpTabs();
}

startApp();
