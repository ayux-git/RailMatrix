/**
 * app.js
 * ---------------------------------------------------------------------------
 * UI logic: rendering, event handling and state for the three sections.
 *
 *   1. DOM helpers + icons    4. Train search (form, validation, results)
 *   2. Toast notifications    5. Class cards, details panel, refresh
 *   3. Tabs                   6. PNR status tracker (with predictions)
 *                             7. Init
 *
 * Security: user input is never rendered with innerHTML. Every node is built
 * with createElement / textContent through the el() helper.
 *
 * Depends on: data.js, probability.js, pnr.js (window.RailMatrix)
 * ---------------------------------------------------------------------------
 */
(function (global, doc) {
  'use strict';

  const RailMatrix = global.RailMatrix;
  const { data, dates: D, probability, pnr: PNR } = RailMatrix;

  /* ======================================================================
   * 1. DOM helpers and icons
   * ==================================================================== */

  const $ = (sel, root) => (root || doc).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || doc).querySelectorAll(sel));
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function applyAttrs(node, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach((key) => {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    });
  }

  function appendChildren(node, children) {
    children.flat(Infinity).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(child instanceof Node ? child : doc.createTextNode(String(child)));
    });
  }

  /** Create an HTML element. Strings become text nodes (safe for user input). */
  function el(tag, attrs, ...children) {
    const node = doc.createElement(tag);
    applyAttrs(node, attrs);
    appendChildren(node, children);
    return node;
  }

  /** Create an SVG element. */
  function svgEl(tag, attrs, ...children) {
    const node = doc.createElementNS(SVG_NS, tag);
    applyAttrs(node, attrs);
    appendChildren(node, children);
    return node;
  }

  /** Visually hidden text for screen readers. */
  const srOnly = (text) => el('span', { class: 'sr-only' }, text);

  const ICONS = {
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

  /** Build a decorative stroke icon (hidden from assistive tech). */
  function icon(name, extraClass) {
    const node = svgEl('svg', {
      class: `icon${extraClass ? ' ' + extraClass : ''}`,
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    (ICONS[name] || []).forEach((d) => node.appendChild(svgEl('path', { d })));
    return node;
  }

  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const formatINR = (n) => inr.format(n);
  const plural = (n, word, pluralWord) => `${n} ${n === 1 ? word : pluralWord || word + 's'}`;
  const prefersReducedMotion = () =>
    !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /** Status -> tone (colour family), icon and plain-language meaning. */
  const STATUS_META = {
    AVL: { tone: 'success', icon: 'check', meaning: 'Available' },
    CNF: { tone: 'success', icon: 'check', meaning: 'Confirmed' },
    RAC: { tone: 'warning', icon: 'rac', meaning: 'Reservation Against Cancellation' },
    WL: { tone: 'danger', icon: 'hourglass', meaning: 'Waitlisted' },
    NA: { tone: 'neutral', icon: 'ban', meaning: 'Not offered' },
    NOT_OPEN: { tone: 'info', icon: 'clock', meaning: 'Booking not open yet' },
    CAN: { tone: 'neutral', icon: 'xCircle', meaning: 'Cancelled' },
  };

  /** A status badge: colour + icon + text (never colour alone). */
  function statusBadge(type, text, size) {
    const meta = STATUS_META[type] || STATUS_META.NA;
    return el(
      'span',
      { class: `badge badge--${meta.tone}${size ? ' badge--' + size : ''}`, title: meta.meaning },
      icon(meta.icon),
      el('span', { class: 'badge-text' }, text)
    );
  }

  /**
   * Confirmation chance for a WL / RAC ticket, shown as a coloured badge
   * ("64% · MEDIUM") plus a one-line reason. Uses probability.js.
   */
  function predictionEl(input) {
    const res = probability.estimate(input);
    const iconName = res.band.key === 'HIGH' ? 'checkCircle' : res.band.key === 'MEDIUM' ? 'rac' : 'alert';
    return el(
      'span',
      { class: 'prediction', title: res.explanation },
      el(
        'span',
        { class: `badge badge--${res.band.tone}` },
        icon(iconName),
        el('span', { class: 'badge-text' }, `${res.percent}% · ${res.band.key}`)
      ),
      el('span', { class: 'prediction-note' }, `needs ~${res.needed}, expected ~${Math.round(res.expected)} cancellations`)
    );
  }

  /** Shared empty / error state block. */
  function stateBlock({ tone, iconName, title, text, action }) {
    return el(
      'div',
      { class: `state-block state-block--${tone || 'neutral'}` },
      el('span', { class: 'state-icon' }, icon(iconName || 'info')),
      el('h2', { class: 'state-title' }, title),
      text ? el('p', { class: 'state-text' }, text) : null,
      action || null
    );
  }

  /* ======================================================================
   * 2. Toast notifications (stacking, auto-dismiss, pause on hover/focus)
   * ==================================================================== */

  const Toast = (function () {
    const DURATION = 5000;
    const MAX_VISIBLE = 4;
    const META = {
      success: { icon: 'checkCircle', title: 'Success' },
      warning: { icon: 'alert', title: 'Warning' },
      error: { icon: 'xCircle', title: 'Error' },
      info: { icon: 'info', title: 'Info' },
    };
    let region;

    function show(type, message, title) {
      region = region || $('#toastRegion');
      const meta = META[type] || META.info;
      const closeBtn = el('button', { type: 'button', class: 'toast-close', 'aria-label': 'Dismiss notification' }, icon('x'));
      const toast = el(
        'div',
        { class: `toast toast--${type}` },
        el('span', { class: 'toast-icon' }, icon(meta.icon)),
        el(
          'div',
          { class: 'toast-body' },
          el('p', { class: 'toast-title' }, title || meta.title),
          el('p', { class: 'toast-msg' }, message)
        ),
        closeBtn,
        el('span', { class: 'toast-progress', 'aria-hidden': 'true' })
      );

      let timer = null;
      let remaining = DURATION;
      let startedAt = 0;
      let running = false;
      let leaving = false;

      const dismiss = () => {
        if (leaving) return;
        leaving = true;
        clearTimeout(timer);
        toast.classList.add('toast--leaving');
        setTimeout(() => toast.remove(), prefersReducedMotion() ? 0 : 220);
      };
      const start = () => {
        if (running || leaving) return;
        running = true;
        startedAt = Date.now();
        timer = setTimeout(dismiss, remaining);
        toast.classList.remove('is-paused');
      };
      const pause = () => {
        if (!running) return;
        running = false;
        clearTimeout(timer);
        remaining -= Date.now() - startedAt;
        toast.classList.add('is-paused');
      };

      toast.dismiss = dismiss;
      closeBtn.addEventListener('click', dismiss);
      toast.addEventListener('mouseenter', pause);
      toast.addEventListener('mouseleave', () => {
        if (!toast.contains(doc.activeElement)) start();
      });
      toast.addEventListener('focusin', pause);
      toast.addEventListener('focusout', (e) => {
        if (!toast.contains(e.relatedTarget)) start();
      });

      region.appendChild(toast);
      const active = $$('.toast:not(.toast--leaving)', region);
      if (active.length > MAX_VISIBLE) active.slice(0, active.length - MAX_VISIBLE).forEach((t) => t.dismiss());
      start();
      return toast;
    }

    return {
      show,
      success: (msg, title) => show('success', msg, title),
      warning: (msg, title) => show('warning', msg, title),
      error: (msg, title) => show('error', msg, title),
      info: (msg, title) => show('info', msg, title),
    };
  })();

  /* ======================================================================
   * 3. Tabs
   * ==================================================================== */

  const TAB_IDS = ['tab-search', 'tab-pnr'];

  function activateTab(tabId, options) {
    const opts = options || {};
    TAB_IDS.forEach((id) => {
      const tab = $('#' + id);
      const selected = id === tabId;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      $('#' + tab.getAttribute('aria-controls')).hidden = !selected;
      if (selected && opts.focus) tab.focus();
    });
    if (opts.updateHash !== false) {
      try {
        global.history.replaceState(null, '', '#' + tabId.replace('tab-', ''));
      } catch (e) {
        /* some file:// contexts block history changes */
      }
    }
    if (opts.scroll) global.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function tabFromHash() {
    const id = 'tab-' + (global.location.hash || '').replace('#', '');
    return TAB_IDS.includes(id) ? id : null;
  }

  function initTabs() {
    TAB_IDS.forEach((id, index) => {
      const tab = $('#' + id);
      tab.addEventListener('click', () => activateTab(id));
      tab.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight') next = (index + 1) % TAB_IDS.length;
        else if (e.key === 'ArrowLeft') next = (index - 1 + TAB_IDS.length) % TAB_IDS.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = TAB_IDS.length - 1;
        if (next !== null) {
          e.preventDefault();
          activateTab(TAB_IDS[next], { focus: true });
        }
      });
    });
    global.addEventListener('hashchange', () => {
      const id = tabFromHash();
      if (id) activateTab(id, { updateHash: false });
    });
    activateTab(tabFromHash() || 'tab-search', { updateHash: false });
  }

  /* ======================================================================
   * 4. Train search: form, validation, results
   * ==================================================================== */

  const state = {
    search: null, // the current search and its results
  };

  const QUICK_ROUTES = [
    ['NDLS', 'LDH'],
    ['BCT', 'NDLS'],
    ['HWH', 'NDLS'],
    ['MAS', 'SBC'],
    ['ASR', 'NDLS'],
  ];

  /** Accepts "New Delhi (NDLS)", "NDLS", "ndls" or "New Delhi". Returns a station or null. */
  function resolveStation(value) {
    const v = String(value || '').trim();
    if (!v) return null;
    const match = v.match(/\(([A-Za-z]{2,5})\)\s*$/);
    const code = (match ? match[1] : v).toUpperCase();
    if (data.STATION_BY_CODE[code]) return data.STATION_BY_CODE[code];
    const lower = v.toLowerCase();
    return data.STATIONS.find((s) => s.name.toLowerCase() === lower || s.label.toLowerCase() === lower) || null;
  }

  function setFieldError(input, message) {
    const errorEl = $('#' + input.id + '-error');
    if (errorEl) errorEl.textContent = message || '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    const field = input.closest('.field');
    if (field) field.classList.toggle('has-error', !!message);
  }

  const searchEls = {};

  function validateStationField(input, otherInput, isDestination) {
    const value = input.value.trim();
    if (!value) return `Please enter the ${isDestination ? 'destination' : 'origin'} station.`;
    const station = resolveStation(value);
    if (!station) return 'Station not recognised. Please choose one from the suggestions list.';
    if (isDestination) {
      const other = resolveStation(otherInput.value);
      if (other && other.code === station.code) return 'Origin and destination must be different stations.';
    }
    return '';
  }

  function validateDateField() {
    const value = searchEls.date.value;
    if (!value) return 'Please select a valid travel date.';
    const date = D.parseISODate(value);
    if (!date) return 'Please enter a valid date.';
    const days = D.daysFromToday(date);
    if (days < 0) return 'Travel date cannot be in the past.';
    if (days > data.RULES.MAX_ADVANCE_DAYS) {
      const last = D.addDays(D.startOfToday(), data.RULES.MAX_ADVANCE_DAYS);
      return `You can book at most ${data.RULES.MAX_ADVANCE_DAYS} days ahead (until ${D.formatDate(last)}).`;
    }
    return '';
  }

  function validateQuotaField() {
    return data.QUOTA_BY_CODE[searchEls.quota.value] ? '' : 'Please select a quota.';
  }

  /** Validate one field by input id and show/hide its inline error. Returns the message. */
  function validateSearchField(id) {
    let message = '';
    if (id === 'origin') message = validateStationField(searchEls.origin, searchEls.destination, false);
    if (id === 'destination') message = validateStationField(searchEls.destination, searchEls.origin, true);
    if (id === 'travelDate') message = validateDateField();
    if (id === 'quota') message = validateQuotaField();
    setFieldError($('#' + id), message);
    return message;
  }

  function validateSearchForm() {
    const ids = ['origin', 'destination', 'travelDate', 'quota'];
    const errors = ids.filter((id) => validateSearchField(id));
    return { valid: errors.length === 0, errors };
  }

  /** Days ahead when the date is valid, else null. */
  function selectedDaysAhead() {
    const date = D.parseISODate(searchEls.date.value);
    return date ? D.daysFromToday(date) : null;
  }

  function isTatkalOutsideWindow() {
    const quota = data.QUOTA_BY_CODE[searchEls.quota.value];
    const days = selectedDaysAhead();
    return !!(quota && quota.isTatkal && days !== null && days > data.RULES.TATKAL_MAX_DAYS_AHEAD && days <= data.RULES.MAX_ADVANCE_DAYS);
  }

  /** Info / warning note under the form for the selected quota. */
  function updateQuotaNote() {
    const note = searchEls.quotaNote;
    const quota = data.QUOTA_BY_CODE[searchEls.quota.value];
    note.replaceChildren();
    note.className = 'note';
    if (!quota || !quota.note) {
      note.hidden = true;
      return;
    }
    let tone = 'info';
    let title = `${quota.name} quota`;
    let text = quota.note;
    if (isTatkalOutsideWindow()) {
      const date = D.parseISODate(searchEls.date.value);
      const opens = D.addDays(date, -1);
      tone = 'warning';
      title = 'Tatkal window not open for this date';
      text =
        `${quota.name} is only bookable for journeys today or tomorrow (within the next 2 days). ` +
        `For ${D.formatDate(date)} it opens on ${D.formatDateLong(opens)} at ${data.RULES.TATKAL_OPEN_AC} (AC) / ` +
        `${data.RULES.TATKAL_OPEN_NON_AC} (non-AC). You can still search to see projected fares.`;
    }
    note.classList.add(`note--${tone}`);
    note.append(
      icon(tone === 'warning' ? 'alert' : 'info'),
      el('div', null, el('strong', null, title), el('p', null, text))
    );
    note.hidden = false;
  }

  function renderSearchEmpty() {
    const results = searchEls.results;
    results.replaceChildren(
      stateBlock({
        tone: 'neutral',
        iconName: 'route',
        title: 'Find trains on your route',
        text: 'Enter origin, destination, travel date and quota, then press “Search trains”. Or try one of the popular routes above.',
      })
    );
  }

  function onSearchSubmit(e) {
    e.preventDefault();

    const { valid, errors } = validateSearchForm();
    if (!valid) {
      $('#' + errors[0]).focus();
      Toast.error(`Please fix ${plural(errors.length, 'highlighted field')} before searching.`, 'Check your search');
      return;
    }

    const from = resolveStation(searchEls.origin.value);
    const to = resolveStation(searchEls.destination.value);
    searchEls.origin.value = from.label; // normalise to the canonical label
    searchEls.destination.value = to.label;
    const dateISO = searchEls.date.value;
    const date = D.parseISODate(dateISO);
    const quotaCode = searchEls.quota.value;
    const tatkalClosed = isTatkalOutsideWindow();

    if (tatkalClosed) {
      Toast.warning(
        `Tatkal for ${D.formatDate(date)} opens on ${D.formatDate(D.addDays(date, -1))}. Showing projected fares only.`,
        'Tatkal window not open'
      );
    }

    const result = data.getTrainsForRoute(from.code, to.code, dateISO);
    const searchedAt = new Date();
    state.search = {
      from,
      to,
      dateISO,
      date,
      quotaCode,
      tatkalClosed,
      ...result,
      refresh: {},
      updatedAt: {},
      openClass: {},
      availability: {},
    };
    result.trains.forEach((t) => {
      const minsAgo = RailMatrix.rng.createRng('updated', t.number, dateISO, quotaCode).int(2, 28);
      state.search.refresh[t.number] = 0;
      state.search.updatedAt[t.number] = new Date(searchedAt.getTime() - minsAgo * 60000);
    });

    renderSearchResults();

    const route = `${from.code} → ${to.code}`;
    if (result.trains.length) {
      Toast.success(`Search complete: ${plural(result.trains.length, 'train')} found for ${route} on ${D.formatDate(date)}.`);
    } else {
      Toast.warning(`No trains found for ${route} on ${D.formatDate(date)}.`, 'No trains found');
    }
  }

  function renderSearchResults() {
    const s = state.search;
    const results = searchEls.results;
    const quota = data.QUOTA_BY_CODE[s.quotaCode];

    if (!s.trains.length) {
      const text =
        s.reason === 'too-close'
          ? `${s.from.name} and ${s.to.name} are only about ${s.distance} km apart, so no long-distance trains are listed. Try a station in another city.`
          : `No simulated trains run between ${s.from.name} and ${s.to.name} on ${D.formatDateLong(s.date)}. Try another date.`;
      results.replaceChildren(
        stateBlock({ tone: 'warning', iconName: 'search', title: 'No trains found', text })
      );
      return;
    }

    const festival = data.getFestivalSeason(s.date);
    const summary = el(
      'div',
      { class: 'results-head' },
      el(
        'div',
        null,
        el('h2', { class: 'results-title', tabindex: '-1', id: 'searchResultsTitle' }, `${plural(s.trains.length, 'train')} found`),
        el(
          'p',
          { class: 'results-meta' },
          el('strong', null, `${s.from.code} → ${s.to.code}`),
          ` · ${D.formatDateLong(s.date)} · ${quota.name} quota · ~${s.distance} km`
        )
      ),
      el(
        'div',
        { class: 'results-tags' },
        festival ? el('span', { class: 'tag tag--warning' }, icon('sparkle'), `${festival.name}: high demand`) : null,
        s.tatkalClosed ? el('span', { class: 'tag tag--info' }, icon('clock'), 'Tatkal not open yet') : null
      )
    );

    const legend = el(
      'ul',
      { class: 'status-legend', 'aria-label': 'Status legend' },
      el('li', null, statusBadge('AVL', 'AVAILABLE', 'sm'), ' berths free'),
      el('li', null, statusBadge('RAC', 'RAC', 'sm'), ' shared berth'),
      el('li', null, statusBadge('WL', 'WL', 'sm'), ' waitlist')
    );

    const list = el('ul', { class: 'train-list' }, s.trains.map((t) => el('li', null, buildTrainCard(t))));
    results.replaceChildren(summary, legend, list);
    $('#searchResultsTitle').focus({ preventScroll: true });
  }

  function runningDaysEl(days) {
    const names = D.WEEKDAYS.filter((_, i) => days[i]);
    const label = days.every(Boolean) ? 'Runs daily' : `Runs on ${names.join(', ')}`;
    return el(
      'div',
      { class: 'run-days' },
      srOnly(label),
      el(
        'ul',
        { class: 'day-pills', 'aria-hidden': 'true' },
        D.WEEKDAYS.map((d, i) => el('li', { class: days[i] ? 'is-on' : '', title: `${d}: ${days[i] ? 'runs' : 'does not run'}` }, d.charAt(0)))
      )
    );
  }

  /* ======================================================================
   * 5. Train card, class cards, details panel, refresh
   * ==================================================================== */

  function buildTrainCard(train) {
    const s = state.search;
    const id = train.number;
    const card = el('article', { class: 'card train-card', 'aria-labelledby': `t${id}-title`, 'data-train': id });

    const head = el(
      'header',
      { class: 'train-head' },
      el(
        'div',
        { class: 'train-title-wrap' },
        el('h3', { class: 'train-title', id: `t${id}-title` }, el('span', { class: 'train-num' }, id), ' ', el('span', { class: 'train-name' }, train.name)),
        el('span', { class: `type-badge type-${train.type.toLowerCase()}` }, train.typeLabel)
      ),
      runningDaysEl(train.runningDays)
    );

    const times = el(
      'div',
      { class: 'train-times' },
      el(
        'div',
        { class: 'time-block' },
        srOnly('Departs '),
        el('strong', { class: 'time' }, D.formatTime(train.departure)),
        el('span', { class: 'stn' }, s.from.code),
        el('span', { class: 'stn-name' }, s.from.name)
      ),
      el(
        'div',
        { class: 'duration' },
        srOnly('Journey time '),
        el('span', { class: 'duration-time' }, D.formatDuration(train.duration)),
        el('span', { class: 'duration-line', 'aria-hidden': 'true' }),
        el('span', { class: 'duration-km' }, `${train.distance} km`)
      ),
      el(
        'div',
        { class: 'time-block time-block--end' },
        srOnly('Arrives '),
        el(
          'strong',
          { class: 'time' },
          D.formatTime(train.arrival),
          train.arrivalDayOffset
            ? el('sup', { class: 'day-offset', title: `Arrives ${plural(train.arrivalDayOffset, 'day')} later` }, `+${train.arrivalDayOffset}`, srOnly(train.arrivalDayOffset === 1 ? ' day' : ' days'))
            : null
        ),
        el('span', { class: 'stn' }, s.to.code),
        el('span', { class: 'stn-name' }, s.to.name)
      )
    );

    const grid = el('ul', { class: 'class-grid', 'aria-label': `Classes on train ${id}` });
    const details = el('div', { class: 'class-details', id: `t${id}-details`, hidden: true });
    const refreshBtn = el(
      'button',
      { type: 'button', class: 'btn btn-secondary btn-sm refresh-btn', 'aria-label': `Refresh availability for ${id} ${train.name}` },
      icon('refresh'),
      el('span', null, 'Refresh')
    );
    const updated = el('p', { class: 'updated' });
    const foot = el('footer', { class: 'train-foot' }, updated, refreshBtn);

    card.append(head, times, grid, details, foot);
    refreshBtn.addEventListener('click', () => refreshTrain(card, train));
    fillClassGrid(card, train);
    return card;
  }

  function computeAvailability(train) {
    const s = state.search;
    const map = {};
    train.classes.forEach((cls) => {
      map[cls] = data.getAvailability(train, cls, s.quotaCode, s.dateISO, s.refresh[train.number]);
    });
    s.availability[train.number] = map;
    return map;
  }

  function updatedText(train) {
    const at = state.search.updatedAt[train.number];
    const mins = Math.max(0, Math.round((Date.now() - at.getTime()) / 60000));
    return `Last updated ${D.formatClock(at)} · ${mins === 0 ? 'just now' : plural(mins, 'min') + ' ago'}`;
  }

  function fillClassGrid(card, train) {
    const avl = computeAvailability(train);
    const grid = $('.class-grid', card);
    const openCls = state.search.openClass[train.number];
    grid.replaceChildren(
      ...train.classes.map((cls) => {
        const a = avl[cls];
        const c = data.CLASSES[cls];
        const meta = STATUS_META[a.status];
        const btn = el(
          'button',
          {
            type: 'button',
            class: `class-card class-card--${meta.tone}`,
            'aria-expanded': openCls === cls ? 'true' : 'false',
            'aria-controls': `t${train.number}-details`,
            'data-cls': cls,
          },
          el('span', { class: 'cc-top' }, el('span', { class: 'cc-code' }, cls), el('span', { class: 'cc-name' }, c.name)),
          el('span', { class: 'cc-fare' }, a.fare ? [srOnly('Fare '), formatINR(a.fare.total)] : el('span', { class: 'muted' }, '—')),
          el('span', { class: 'cc-status' }, srOnly('Status: '), statusBadge(a.status, a.label)),
          el('span', { class: 'cc-chevron' }, icon('chevronDown'))
        );
        btn.addEventListener('click', () => toggleClassDetails(card, train, cls));
        return el('li', null, btn);
      })
    );
    $('.updated', card).textContent = updatedText(train);
    if (openCls) renderClassDetails(card, train, openCls);
  }

  function toggleClassDetails(card, train, cls) {
    const s = state.search;
    const isOpen = s.openClass[train.number] === cls;
    s.openClass[train.number] = isOpen ? null : cls;
    $$('.class-card', card).forEach((b) => b.setAttribute('aria-expanded', !isOpen && b.dataset.cls === cls ? 'true' : 'false'));
    const details = $('.class-details', card);
    if (isOpen) {
      details.hidden = true;
      details.replaceChildren();
    } else {
      renderClassDetails(card, train, cls);
    }
  }

  function berthBar(pct) {
    return svgEl(
      'svg',
      { class: 'berth-bar', viewBox: '0 0 100 8', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
      svgEl('rect', { class: 'berth-bar-track', x: 0, y: 0, width: 100, height: 8, rx: 4 }),
      pct > 0 ? svgEl('rect', { class: 'berth-bar-fill', x: 0, y: 0, width: Math.max(4, pct), height: 8, rx: 4 }) : null
    );
  }

  function statusExplanation(a, train) {
    const c = data.CLASSES[a.cls];
    const unit = c.seats ? 'seat' : 'berth';
    switch (a.status) {
      case 'AVL':
        return `${plural(a.count, unit)} available to book right now in this quota.`;
      case 'RAC':
        return c.seats
          ? 'RAC is not issued in chair car classes.'
          : `You would be RAC ${a.count}: you get a shared side-lower berth and move up as confirmed passengers cancel.`;
      case 'WL':
        return `You would be WL ${a.count}. A ${unit} is allotted only if enough passengers cancel; e-tickets still waitlisted after charting are cancelled automatically.`;
      case 'NOT_OPEN':
        return `Tatkal booking for this journey opens on ${D.formatDateLong(a.opensAt.date)} at ${a.opensAt.time}. The fare shown is projected.`;
      default:
        return `The ${data.QUOTA_BY_CODE[a.quotaCode].name} quota is not offered in ${c.name} on ${train.number}. Try the General quota.`;
    }
  }

  function renderClassDetails(card, train, cls) {
    const s = state.search;
    const a = s.availability[train.number][cls];
    const c = data.CLASSES[cls];
    const details = $('.class-details', card);
    const quota = data.QUOTA_BY_CODE[s.quotaCode];
    const titleId = `t${train.number}-${cls}-dtitle`;

    const head = el(
      'div',
      { class: 'details-head' },
      el('h4', { id: titleId }, `${c.name} (${cls}) · ${quota.name} quota`),
      statusBadge(a.status, a.label, 'lg')
    );
    const explain = el('p', { class: 'details-text' }, statusExplanation(a, train));

    // Berth-type breakdown
    let berthSection = null;
    if (a.status !== 'NA' && a.status !== 'NOT_OPEN') {
      const total = a.berths.reduce((sum, b) => sum + b.count, 0);
      berthSection = el(
        'section',
        { class: 'details-section', 'aria-label': c.seats ? 'Seat-type breakdown' : 'Berth-type breakdown' },
        el('h5', null, c.seats ? 'Seat-type breakdown' : 'Berth-type breakdown'),
        el(
          'table',
          { class: 'berth-table' },
          el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Type'), el('th', { scope: 'col' }, 'Free'), el('th', { scope: 'col' }, el('span', { class: 'sr-only' }, 'Share')))),
          el(
            'tbody',
            null,
            a.berths.map((b) =>
              el(
                'tr',
                null,
                el('th', { scope: 'row' }, b.type),
                el('td', { class: 'num' }, String(b.count)),
                el('td', { class: 'bar-cell' }, berthBar(total ? (b.count / total) * 100 : 0))
              )
            )
          )
        ),
        a.status === 'RAC'
          ? el('p', { class: 'muted small' }, 'No full berths are free. RAC passengers share side-lower berths until a berth is released.')
          : a.status === 'WL'
          ? el('p', { class: 'muted small' }, 'No berths or RAC places are free in this quota.')
          : null
      );
    }

    // Fare breakdown
    let fareSection = null;
    if (a.fare) {
      fareSection = el(
        'section',
        { class: 'details-section', 'aria-label': 'Fare breakdown' },
        el('h5', null, 'Fare breakdown (per passenger)'),
        el(
          'dl',
          { class: 'fare-list' },
          a.fare.parts.map((p) => [el('dt', null, p.label), el('dd', null, (p.amount < 0 ? '−' : '') + formatINR(Math.abs(p.amount)))]),
          el('dt', { class: 'fare-total' }, 'Total (rounded)'),
          el('dd', { class: 'fare-total' }, formatINR(a.fare.total))
        )
      );
    }

    const actions = el('div', { class: 'details-actions' }, el('p', { class: 'muted small' }, updatedText(train)));
    if (a.status === 'RAC' || a.status === 'WL') {
      actions.appendChild(
        el(
          'div',
          { class: 'chance-inline' },
          el('span', { class: 'small' }, 'Confirmation chance:'),
          predictionEl({
            statusType: a.status,
            position: a.count,
            cls,
            quota: s.quotaCode,
            daysLeft: D.daysFromToday(s.date),
            popularity: train.popularity,
            trainKey: train.number,
            racPool: a.racPool,
          })
        )
      );
    }

    details.replaceChildren(
      el('div', { class: 'details-inner', role: 'region', 'aria-labelledby': titleId }, head, explain, el('div', { class: 'details-grid' }, berthSection, fareSection), actions)
    );
    details.hidden = false;
  }

  function refreshTrain(card, train) {
    const s = state.search;
    const before = train.classes.map((cls) => s.availability[train.number][cls].label);

    s.refresh[train.number] += 1;
    s.updatedAt[train.number] = new Date();
    fillClassGrid(card, train);

    const after = train.classes.map((cls) => s.availability[train.number][cls].label);
    const changed = after.filter((label, i) => label !== before[i]).length;
    Toast.info(
      `Availability refreshed for ${train.number} ${train.name}: ${changed ? plural(changed, 'class', 'classes') + ' changed' : 'no change'}.`,
      'Refreshed'
    );
  }

  function swapStations() {
    const o = searchEls.origin.value;
    searchEls.origin.value = searchEls.destination.value;
    searchEls.destination.value = o;
    ['origin', 'destination'].forEach((id) => {
      if ($('#' + id).value.trim()) validateSearchField(id);
      else setFieldError($('#' + id), '');
    });
  }

  function initSearch() {
    searchEls.form = $('#searchForm');
    searchEls.origin = $('#origin');
    searchEls.destination = $('#destination');
    searchEls.date = $('#travelDate');
    searchEls.quota = $('#quota');
    searchEls.quotaNote = $('#quotaNote');
    searchEls.results = $('#searchResults');
    searchEls.submit = $('#searchBtn');

    // Station suggestions
    $('#stationList').replaceChildren(
      ...data.STATIONS.slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((st) => el('option', { value: st.label }))
    );

    // Quota dropdown
    searchEls.quota.replaceChildren(
      el('option', { value: '' }, 'Select a quota'),
      ...data.QUOTAS.map((q) => el('option', { value: q.code }, `${q.name} (${q.code})`))
    );
    searchEls.quota.value = 'GN';

    // Date limits: today .. today + 120
    const today = D.startOfToday();
    searchEls.date.min = D.toISODate(today);
    searchEls.date.max = D.toISODate(D.addDays(today, data.RULES.MAX_ADVANCE_DAYS));
    searchEls.date.value = D.toISODate(D.addDays(today, 4));

    // Popular routes
    $('#quickRoutes').replaceChildren(
      ...QUICK_ROUTES.map(([a, b]) => {
        const from = data.STATION_BY_CODE[a];
        const to = data.STATION_BY_CODE[b];
        const chip = el('button', { type: 'button', class: 'chip', 'aria-label': `Search ${from.name} to ${to.name}` }, `${a} → ${b}`);
        chip.addEventListener('click', () => {
          searchEls.origin.value = from.label;
          searchEls.destination.value = to.label;
          setFieldError(searchEls.origin, '');
          setFieldError(searchEls.destination, '');
          searchEls.form.requestSubmit ? searchEls.form.requestSubmit() : searchEls.form.dispatchEvent(new Event('submit', { cancelable: true }));
        });
        return chip;
      })
    );

    // Live validation: on blur / change, and clear errors as the user fixes them.
    ['origin', 'destination'].forEach((id) => {
      const input = $('#' + id);
      input.addEventListener('change', () => {
        const st = resolveStation(input.value);
        if (st) input.value = st.label;
        validateSearchField(id);
        const other = id === 'origin' ? 'destination' : 'origin';
        if ($('#' + other).value.trim()) validateSearchField(other);
      });
      input.addEventListener('blur', () => {
        if (input.value.trim()) validateSearchField(id);
      });
      input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') === 'true' && !validateStationField(input, id === 'origin' ? searchEls.destination : searchEls.origin, id === 'destination')) {
          setFieldError(input, '');
        }
      });
    });
    searchEls.date.addEventListener('change', () => {
      validateSearchField('travelDate');
      updateQuotaNote();
    });
    searchEls.quota.addEventListener('change', () => {
      validateSearchField('quota');
      updateQuotaNote();
    });

    $('#swapBtn').addEventListener('click', swapStations);
    searchEls.form.addEventListener('submit', onSearchSubmit);

    updateQuotaNote();
    renderSearchEmpty();
  }

  /* ======================================================================
   * 6. PNR status tracker (with confirmation predictions)
   * ==================================================================== */

  const pnrEls = {};

  function updatePnrCounter(len) {
    const counter = pnrEls.counter;
    counter.textContent = len === 10 ? '10/10 digits · ready to check' : `${len}/10 digits`;
    counter.classList.toggle('is-complete', len === 10);
  }

  function showPnrError(message) {
    setFieldError(pnrEls.input, message);
  }

  function initPnrInput() {
    const input = pnrEls.input;
    // Block letters/symbols as they are typed.
    input.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'insertText' && e.data && /[^\d\s-]/.test(e.data)) {
        e.preventDefault();
        showPnrError('Only digits 0–9 are allowed in a PNR.');
      }
    });
    // Sanitise everything else (paste, autofill, drag and drop): strip non-digits, max 10.
    input.addEventListener('input', () => {
      const raw = input.value;
      const hadInvalid = /[^\d\s-]/.test(raw);
      let digits = raw.replace(/\D/g, '');
      const tooLong = digits.length > 10;
      digits = digits.slice(0, 10);
      if (digits !== raw) input.value = digits;
      updatePnrCounter(digits.length);
      if (hadInvalid) showPnrError('Letters and symbols were removed: a PNR contains digits only.');
      else if (tooLong) showPnrError('A PNR has exactly 10 digits, so the extra digits were removed.');
      else showPnrError('');
    });
    input.addEventListener('blur', () => {
      const len = input.value.length;
      if (len > 0 && len < 10) showPnrError(`Invalid PNR: please enter exactly 10 digits (${len} entered).`);
    });
  }

  function renderPnrError(title, text) {
    pnrEls.result.replaceChildren(
      stateBlock({ tone: 'danger', iconName: 'xCircle', title, text })
    );
  }

  function pnrSummaryText(r) {
    const n = r.summary.total;
    const word = n === 1 ? 'passenger' : 'passengers';
    const everyone = n === 1 ? 'the passenger' : n === 2 ? 'both passengers' : `all ${n} passengers`;
    if (r.isCancelled) return `booking cancelled for ${everyone}`;
    if (r.summary.wl) return `${r.summary.wl} of ${n} ${word} still on waitlist`;
    if (r.summary.rac) return `${r.summary.rac} of ${n} ${word} in RAC`;
    if (r.summary.can) return `${r.summary.cnf} confirmed, ${r.summary.can} cancelled`;
    return `${everyone} confirmed`;
  }

  function renderPnrResult(r) {
    const c = data.CLASSES[r.cls];
    const quota = data.QUOTA_BY_CODE[r.quota];
    const chartBadge = r.chartPrepared
      ? el('span', { class: 'badge badge--success' }, icon('checkCircle'), el('span', { class: 'badge-text' }, 'Chart Prepared'))
      : el('span', { class: 'badge badge--neutral' }, icon('clock'), el('span', { class: 'badge-text' }, 'Chart Not Prepared'));

    const header = el(
      'header',
      { class: 'pnr-head' },
      el(
        'div',
        null,
        el('h2', { id: 'pnrResultTitle', tabindex: '-1' }, 'PNR ', el('span', { class: 'mono' }, r.pnr)),
        el('p', { class: 'results-meta' }, pnrSummaryText(r).replace(/^./, (ch) => ch.toUpperCase()))
      ),
      el('div', { class: 'pnr-badges' }, r.isSample ? el('span', { class: 'tag tag--info' }, 'Sample') : null, chartBadge)
    );

    const banner = r.isCancelled
      ? el(
          'div',
          { class: 'note note--neutral', role: 'note' },
          icon('xCircle'),
          el('div', null, el('strong', null, 'This booking has been cancelled.'), el('p', null, 'Any refund is credited to the original payment method in 5–7 working days (simulated).'))
        )
      : r.chartPrepared && r.summary.wl
      ? el(
          'div',
          { class: 'note note--warning', role: 'note' },
          icon('alert'),
          el('div', null, el('strong', null, 'Chart prepared.'), el('p', null, 'Passengers still waitlisted after charting are not allowed to board on an e-ticket.'))
        )
      : null;

    const journey = el(
      'dl',
      { class: 'journey-grid' },
      [
        ['Train', `${r.train.number} ${r.train.name}`],
        ['Journey date', D.formatDateLong(r.journeyDate)],
        ['Class', `${r.cls} · ${c.name}`],
        ['Quota', `${quota.name} (${quota.code})`],
        ['Boarding', `${r.from.name} (${r.from.code}) · ${D.formatTime(r.departure)}`],
        ['Destination', `${r.to.name} (${r.to.code}) · ${D.formatTime(r.arrival)}${r.arrivalDayOffset ? ` (+${r.arrivalDayOffset} day)` : ''}`],
      ].map(([k, v]) => el('div', { class: 'journey-item' }, el('dt', null, k), el('dd', null, v)))
    );

    // Prediction column: confirmation chance for passengers still on RAC / WL.
    const predictionCell = (p) => {
      const pending = p.current.type === 'WL' || p.current.type === 'RAC';
      if (p.current.type === 'CNF') return el('span', { class: 'muted small' }, 'Already confirmed');
      if (p.current.type === 'CAN') return el('span', { class: 'muted small' }, 'Cancelled');
      if (pending && r.chartPrepared) return el('span', { class: 'muted small' }, 'Chart prepared: not confirmed');
      return predictionEl({
        statusType: p.current.type,
        position: p.current.pos,
        cls: r.cls,
        quota: r.quota,
        daysLeft: r.daysLeft,
        popularity: r.popularity,
        trainKey: r.train.number,
        racPool: data.CANCELLATION_DATA.defaultRacPool[r.cls],
      });
    };
    const rows = r.passengers.map((p) => {
      const action = predictionCell(p);
      return el(
        'tr',
        null,
        el('th', { scope: 'row', 'data-label': 'Passenger' }, `Passenger ${p.no}`),
        el('td', { 'data-label': 'Booking status' }, statusBadge(p.booking.type, p.bookingText)),
        el('td', { 'data-label': 'Current status' }, statusBadge(p.current.type, p.currentText)),
        el('td', { 'data-label': 'Prediction' }, action)
      );
    });

    const table = el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'pnr-table' },
        el('caption', { class: 'sr-only' }, `Passenger status for PNR ${r.pnr}`),
        el(
          'thead',
          null,
          el('tr', null, ['Passenger', 'Booking status', 'Current status', 'Prediction'].map((h) => el('th', { scope: 'col' }, h)))
        ),
        el('tbody', null, rows)
      )
    );

    const counts = el(
      'ul',
      { class: 'count-chips', 'aria-label': 'Status counts' },
      el('li', null, plural(r.summary.total, 'passenger')),
      r.summary.cnf ? el('li', null, statusBadge('CNF', `${r.summary.cnf} CNF`, 'sm')) : null,
      r.summary.rac ? el('li', null, statusBadge('RAC', `${r.summary.rac} RAC`, 'sm')) : null,
      r.summary.wl ? el('li', null, statusBadge('WL', `${r.summary.wl} WL`, 'sm')) : null,
      r.summary.can ? el('li', null, statusBadge('CAN', `${r.summary.can} CAN`, 'sm')) : null
    );

    const foot = el(
      'p',
      { class: 'muted small' },
      `Checked at ${D.formatClock(new Date())}. `,
      r.chartPrepared ? 'Final chart has been prepared. ' : 'The chart is usually prepared about 4 hours before departure. ',
      'Prediction = simulated chance of a confirmed berth, from past cancellations on this train ',
      '(HIGH above 70%, MEDIUM 35–70%, LOW below 35%).'
    );

    pnrEls.result.replaceChildren(
      el('article', { class: 'card pnr-card', 'aria-labelledby': 'pnrResultTitle' }, header, banner, journey, counts, table, foot)
    );
    $('#pnrResultTitle').focus({ preventScroll: true });
  }

  function checkPnr(rawValue) {
    const check = PNR.validate(rawValue);
    if (!check.valid) {
      showPnrError(check.error);
      pnrEls.input.focus();
      renderPnrError('Invalid PNR', `${check.error} A PNR is the 10-digit number printed at the top of your ticket.`);
      Toast.error(check.error.startsWith('Invalid PNR') ? check.error : `Invalid PNR: ${check.error}`);
      return;
    }

    pnrEls.input.value = check.pnr;
    updatePnrCounter(10);
    showPnrError('');
    const result = PNR.lookup(check.pnr);

    if (!result.found) {
      renderPnrError(`PNR ${check.pnr} not found`, result.reason);
      Toast.error(`PNR ${check.pnr} not found. Please check the number and try again.`, 'PNR not found');
      return;
    }

    renderPnrResult(result);
    const message = `PNR ${result.pnr} checked: ${pnrSummaryText(result)}.`;
    if (result.isCancelled) Toast.warning(message);
    else if (result.summary.wl || result.summary.rac) Toast.info(message, 'PNR checked');
    else Toast.success(message, 'PNR checked');
  }

  function initPnr() {
    pnrEls.form = $('#pnrForm');
    pnrEls.input = $('#pnrInput');
    pnrEls.counter = $('#pnrCounter');
    pnrEls.result = $('#pnrResult');
    pnrEls.submit = $('#pnrBtn');

    initPnrInput();
    pnrEls.form.addEventListener('submit', (e) => {
      e.preventDefault();
      checkPnr(pnrEls.input.value);
    });

    $('#sampleChips').replaceChildren(
      ...data.SAMPLE_PNRS.map((s) => {
        const chip = el(
          'button',
          { type: 'button', class: `chip chip--${s.tone}`, 'aria-label': `Try sample PNR ${s.pnr} (${s.label})` },
          el('span', { class: 'mono' }, s.pnr),
          el('span', { class: 'chip-sub' }, s.label)
        );
        chip.addEventListener('click', () => {
          pnrEls.input.value = s.pnr;
          updatePnrCounter(10);
          checkPnr(s.pnr);
        });
        return chip;
      })
    );

    pnrEls.result.replaceChildren(
      stateBlock({
        tone: 'neutral',
        iconName: 'ticket',
        title: 'Check a PNR',
        text: 'Enter a 10-digit PNR or tap a sample above to see passenger-wise booking and current status.',
      })
    );
  }

  /* ======================================================================
   * 7. Init
   * ==================================================================== */

  function init() {
    initSearch();
    initPnr();
    initTabs();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
