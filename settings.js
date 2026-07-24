/*
 * settings.js — the RSI settings model + the three-tab dialog wiring
 * (Inputs / Style / Visibility), mirroring TradingView's RSI settings.
 *
 * Exposes window.RSISettings with:
 *   .state           current settings (see defaults below)
 *   .defaults()      a fresh copy of the TradingView defaults
 *   .open()/.close() dialog control
 *   .onChange(fn)    called (live) whenever any control changes
 */
window.RSISettings = (function () {
  'use strict';

  function defaults() {
    return {
      inputs: {
        length: 14, source: 'close', calcDivergence: true,
        maType: 'SMA', maLength: 14, bbStdDev: 2,
        timeframe: '', waitForClose: true,
      },
      style: {
        rsi:        { visible: true,  color: '#7e57c2', width: 2, lineStyle: 'solid' },
        ma:         { visible: true,  color: '#ff9800', width: 1, lineStyle: 'solid' },
        upperBand:  { visible: true,  value: 70, color: '#787b86', width: 1, lineStyle: 'dashed' },
        middleBand: { visible: true,  value: 50, color: '#5d606b', width: 1, lineStyle: 'dashed' },
        lowerBand:  { visible: true,  value: 30, color: '#787b86', width: 1, lineStyle: 'dashed' },
        fill:       { visible: true,  color: '#787b86', opacity: 0.06 },
        bb:         { visible: true,  color: '#2962ff', width: 1 },
        bbFill:     { visible: true,  color: '#2962ff', opacity: 0.10 },
        precision:  'default',
        priceLabels: true,
        statusValues: true,
      },
      visibility: {
        ticks:   { on: true },
        seconds: { on: true, from: 1, to: 59 },
        minutes: { on: true, from: 1, to: 59 },
        hours:   { on: true, from: 1, to: 24 },
        days:    { on: true, from: 1, to: 366 },
        weeks:   { on: true, from: 1, to: 52 },
        months:  { on: true, from: 1, to: 12 },
        ranges:  { on: true },
      },
    };
  }

  var state = defaults();
  var listeners = [];
  var draft = null; // working copy while dialog is open (Cancel restores)

  function onChange(fn) { listeners.push(fn); }
  function fire() { listeners.forEach(function (f) { f(state); }); }

  // ---------- DOM helpers ----------
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------- Visibility rows (built dynamically) ----------
  var VIS_UNITS = [
    { key: 'ticks',   label: 'Ticks',   range: false },
    { key: 'seconds', label: 'Seconds', range: true },
    { key: 'minutes', label: 'Minutes', range: true },
    { key: 'hours',   label: 'Hours',   range: true },
    { key: 'days',    label: 'Days',    range: true },
    { key: 'weeks',   label: 'Weeks',   range: true },
    { key: 'months',  label: 'Months',  range: true },
    { key: 'ranges',  label: 'Ranges',  range: false },
  ];

  function buildVisibilityRows() {
    var host = $('#visRows');
    host.innerHTML = '';
    VIS_UNITS.forEach(function (u) {
      var row = document.createElement('div');
      row.className = 'row';
      var ctl = u.range
        ? '<span class="muted">from</span><input type="number" data-visfrom="' + u.key + '">' +
          '<span class="muted">to</span><input type="number" data-visto="' + u.key + '">'
        : '';
      row.innerHTML =
        '<span class="lbl"><input type="checkbox" data-vison="' + u.key + '">' + u.label + '</span>' +
        '<span class="ctl">' + ctl + '</span>';
      host.appendChild(row);
    });
  }

  // ---------- push state -> controls ----------
  function syncControlsFromState() {
    var i = draft.inputs, s = draft.style, v = draft.visibility;

    $('#i_length').value = i.length;
    $('#i_source').value = i.source;
    $('#i_calcDiv').checked = i.calcDivergence;
    $('#i_maType').value = i.maType;
    $('#i_maLength').value = i.maLength;
    $('#i_bbStdDev').value = i.bbStdDev;
    $('#i_timeframe').value = i.timeframe;
    $('#i_waitClose').checked = i.waitForClose;

    ['rsi', 'ma', 'upperBand', 'middleBand', 'lowerBand', 'bb'].forEach(function (k) {
      var vis = $('[data-vis="' + k + '"]'); if (vis) vis.checked = s[k].visible;
      var col = $('[data-color="' + k + '"]'); if (col) col.value = s[k].color;
      var w = $('[data-width="' + k + '"]'); if (w) w.value = s[k].width;
      var ls = $('[data-style="' + k + '"]'); if (ls && s[k].lineStyle) ls.value = s[k].lineStyle;
      var val = $('[data-value="' + k + '"]'); if (val && s[k].value != null) val.value = s[k].value;
    });
    ['fill', 'bbFill'].forEach(function (k) {
      $('[data-vis="' + k + '"]').checked = s[k].visible;
      $('[data-color="' + k + '"]').value = s[k].color;
      $('[data-opac="' + k + '"]').value = s[k].opacity;
    });
    $('#s_precision').value = s.precision;
    $('#s_priceLabels').checked = s.priceLabels;
    $('#s_statusValues').checked = s.statusValues;

    VIS_UNITS.forEach(function (u) {
      $('[data-vison="' + u.key + '"]').checked = v[u.key].on;
      if (u.range) {
        $('[data-visfrom="' + u.key + '"]').value = v[u.key].from;
        $('[data-visto="' + u.key + '"]').value = v[u.key].to;
      }
    });
  }

  // ---------- read controls -> draft, commit -> state, fire ----------
  function readControlsIntoDraft() {
    var i = draft.inputs, s = draft.style, v = draft.visibility;

    i.length = +$('#i_length').value || 1;
    i.source = $('#i_source').value;
    i.calcDivergence = $('#i_calcDiv').checked;
    i.maType = $('#i_maType').value;
    i.maLength = +$('#i_maLength').value || 1;
    i.bbStdDev = +$('#i_bbStdDev').value || 2;
    i.timeframe = $('#i_timeframe').value;
    i.waitForClose = $('#i_waitClose').checked;

    ['rsi', 'ma', 'upperBand', 'middleBand', 'lowerBand', 'bb'].forEach(function (k) {
      var vis = $('[data-vis="' + k + '"]'); if (vis) s[k].visible = vis.checked;
      var col = $('[data-color="' + k + '"]'); if (col) s[k].color = col.value;
      var w = $('[data-width="' + k + '"]'); if (w) s[k].width = +w.value;
      var ls = $('[data-style="' + k + '"]'); if (ls) s[k].lineStyle = ls.value;
      var val = $('[data-value="' + k + '"]'); if (val) s[k].value = +val.value;
    });
    ['fill', 'bbFill'].forEach(function (k) {
      s[k].visible = $('[data-vis="' + k + '"]').checked;
      s[k].color = $('[data-color="' + k + '"]').value;
      s[k].opacity = +$('[data-opac="' + k + '"]').value;
    });
    s.precision = $('#s_precision').value;
    s.priceLabels = $('#s_priceLabels').checked;
    s.statusValues = $('#s_statusValues').checked;

    VIS_UNITS.forEach(function (u) {
      v[u.key].on = $('[data-vison="' + u.key + '"]').checked;
      if (u.range) {
        v[u.key].from = +$('[data-visfrom="' + u.key + '"]').value;
        v[u.key].to = +$('[data-visto="' + u.key + '"]').value;
      }
    });

    // live-commit: TradingView applies changes to the chart immediately
    state = JSON.parse(JSON.stringify(draft));
    fire();
  }

  // ---------- dialog control ----------
  function open() {
    draft = JSON.parse(JSON.stringify(state));
    syncControlsFromState();
    $('#overlay').classList.add('open');
  }
  function close() { $('#overlay').classList.remove('open'); }

  function switchTab(name) {
    $$('.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $$('.tabpane').forEach(function (p) { p.classList.toggle('active', p.dataset.pane === name); });
  }

  function init() {
    buildVisibilityRows();

    $('#openSettings').addEventListener('click', open);
    $('#closeX').addEventListener('click', function () { cancel(); });
    $('#overlay').addEventListener('click', function (e) { if (e.target.id === 'overlay') cancel(); });
    $$('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
    });

    // any control change -> live apply
    $('.dialog').addEventListener('input', readControlsIntoDraft);
    $('.dialog').addEventListener('change', readControlsIntoDraft);

    $('#btnDefaults').addEventListener('click', function () {
      draft = defaults(); syncControlsFromState(); readControlsIntoDraft();
    });
    $('#btnOk').addEventListener('click', function () { readControlsIntoDraft(); close(); });
    $('#btnCancel').addEventListener('click', cancel);

    fire(); // initial render
  }

  function cancel() {
    // discard draft, restore last committed state to the chart & controls
    draft = JSON.parse(JSON.stringify(state));
    syncControlsFromState();
    fire();
    close();
  }

  return { get state() { return state; }, defaults: defaults, open: open, close: close, onChange: onChange, init: init };
})();
