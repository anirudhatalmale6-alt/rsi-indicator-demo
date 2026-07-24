/*
 * chart.js — renders the candlestick + RSI panels and honours every setting
 * from the three-tab dialog. Re-renders live whenever settings change.
 */
(function () {
  'use strict';
  var bars = window.DEMO_BARS;
  var priceCv = document.getElementById('price');
  var rsiCv = document.getElementById('rsi');
  var UP = '#26a69a', DOWN = '#ef5350';
  var PADL = 8, PADR = 58, PADT = 12, PADB = 18;

  function dash(ctx, style) {
    if (style === 'dashed') ctx.setLineDash([5, 3]);
    else if (style === 'dotted') ctx.setLineDash([1, 3]);
    else ctx.setLineDash([]);
  }
  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function fit(cv) {
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || cv.parentElement.clientWidth, h = cv.height;
    cv.width = w * dpr; cv.height = h * dpr;
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }
  function precisionOf(s) { return s.precision === 'default' ? 2 : +s.precision; }

  function calc(cfg) {
    return RSI.calculate(bars, {
      length: cfg.inputs.length,
      source: cfg.inputs.source,
      maType: cfg.inputs.maType,
      maLength: cfg.inputs.maLength,
      bbMult: cfg.inputs.bbStdDev,
      overbought: cfg.style.upperBand.value,
      oversold: cfg.style.lowerBand.value,
      middle: cfg.style.middleBand.value,
      showDivergence: cfg.inputs.calcDivergence,
    });
  }

  function render(cfg) {
    var res = calc(cfg);
    drawPrice();
    drawRSI(res, cfg);
    updateStatus(res, cfg);
    updateLegend(cfg);
  }

  function drawPrice() {
    var f = fit(priceCv), ctx = f.ctx, w = f.w, h = f.h, n = bars.length;
    ctx.clearRect(0, 0, w, h);
    var hi = -Infinity, lo = Infinity;
    for (var k = 0; k < n; k++) { if (bars[k].high > hi) hi = bars[k].high; if (bars[k].low < lo) lo = bars[k].low; }
    var pad = (hi - lo) * 0.06; hi += pad; lo -= pad;
    var x = function (i) { return PADL + (i + 0.5) * (w - PADL - PADR) / n; };
    var y = function (v) { return PADT + (hi - v) / (hi - lo) * (h - PADT - PADB); };
    grid(ctx, w, h, hi, lo, y, function (v) { return v.toFixed(4); });
    var cw = Math.max(1.5, (w - PADL - PADR) / n * 0.6);
    for (var i = 0; i < n; i++) {
      var b = bars[i], up = b.close >= b.open;
      ctx.strokeStyle = ctx.fillStyle = up ? UP : DOWN; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x(i), y(b.high)); ctx.lineTo(x(i), y(b.low)); ctx.stroke();
      var yo = y(b.open), yc = y(b.close);
      ctx.fillRect(x(i) - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
    }
  }

  function drawRSI(res, cfg) {
    var f = fit(rsiCv), ctx = f.ctx, w = f.w, h = f.h, n = bars.length;
    ctx.clearRect(0, 0, w, h);
    var s = cfg.style;
    var x = function (i) { return PADL + (i + 0.5) * (w - PADL - PADR) / n; };
    var y = function (v) { return PADT + (100 - v) / 100 * (h - PADT - PADB); };

    // background fill between upper & lower band
    if (s.fill.visible) {
      ctx.fillStyle = hexA(s.fill.color, s.fill.opacity);
      ctx.fillRect(PADL, y(s.upperBand.value), w - PADL - PADR, y(s.lowerBand.value) - y(s.upperBand.value));
    }
    // band lines
    [s.upperBand, s.middleBand, s.lowerBand].forEach(function (band) {
      if (!band.visible) return;
      ctx.save(); ctx.strokeStyle = band.color; ctx.lineWidth = band.width; ctx.globalAlpha = 0.85;
      dash(ctx, band.lineStyle);
      ctx.beginPath(); ctx.moveTo(PADL, y(band.value)); ctx.lineTo(w - PADR, y(band.value)); ctx.stroke();
      ctx.restore();
    });

    // Bollinger Bands (fill + lines) when present
    if (res.bbUpper && s.bbFill.visible) band(ctx, res.bbUpper, res.bbLower, x, y, hexA(s.bbFill.color, s.bbFill.opacity));
    if (res.bbUpper && s.bb.visible) {
      line(ctx, res.bbUpper, x, y, s.bb.color, s.bb.width, 'solid');
      line(ctx, res.bbLower, x, y, s.bb.color, s.bb.width, 'solid');
    }
    // RSI-based MA
    if (res.ma && s.ma.visible) line(ctx, res.ma, x, y, s.ma.color, s.ma.width, s.ma.lineStyle);
    // RSI line
    if (s.rsi.visible) line(ctx, res.rsi, x, y, s.rsi.color, s.rsi.width, s.rsi.lineStyle);

    // right-axis grid + band value labels
    axisGrid(ctx, w, h, y);
    if (s.priceLabels) {
      [[s.upperBand], [s.middleBand], [s.lowerBand]].forEach(function (a) {
        var band = a[0]; if (!band.visible) return;
        tag(ctx, w, y(band.value), band.value.toFixed(0), band.color);
      });
      var last = lastValid(res.rsi);
      if (last != null) tag(ctx, w, y(last), last.toFixed(precisionOf(s)), s.rsi.color, true);
    }

    // divergences (on RSI pane, TradingView-style, with Bull/Bear labels)
    if (cfg.inputs.calcDivergence) {
      drawDiv(ctx, res.divergences.bullish, x, function (i) { return y(res.rsi[i]); }, '#26a69a', 'Bull');
      drawDiv(ctx, res.divergences.bearish, x, function (i) { return y(res.rsi[i]); }, '#ef5350', 'Bear');
    }
  }

  // ---- primitives ----
  function grid(ctx, w, h, hi, lo, y, fmt) {
    ctx.strokeStyle = '#2a2e39'; ctx.fillStyle = '#787b86'; ctx.lineWidth = 1;
    ctx.font = '10px sans-serif'; ctx.textBaseline = 'middle'; ctx.setLineDash([]);
    for (var s = 0; s <= 5; s++) {
      var v = lo + (hi - lo) * s / 5, yy = y(v);
      ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(PADL, yy); ctx.lineTo(w - PADR, yy); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillText(fmt(v), w - PADR + 6, yy);
    }
  }
  function axisGrid(ctx, w, h, y) {
    ctx.strokeStyle = '#2a2e39'; ctx.globalAlpha = 0.4; ctx.setLineDash([]);
    [0, 50, 100].forEach(function (v) { ctx.beginPath(); ctx.moveTo(PADL, y(v)); ctx.lineTo(w - PADR, y(v)); ctx.stroke(); });
    ctx.globalAlpha = 1;
  }
  function tag(ctx, w, yy, text, color, filled) {
    ctx.font = '10px sans-serif'; ctx.textBaseline = 'middle';
    if (filled) {
      ctx.fillStyle = color; var tw = ctx.measureText(text).width + 8;
      ctx.fillRect(w - PADR + 2, yy - 7, tw, 14); ctx.fillStyle = '#fff';
      ctx.fillText(text, w - PADR + 6, yy);
    } else { ctx.fillStyle = color; ctx.fillText(text, w - PADR + 6, yy); }
  }
  function line(ctx, arr, x, y, color, lw, style) {
    ctx.strokeStyle = color; ctx.lineWidth = lw; dash(ctx, style || 'solid');
    ctx.beginPath(); var started = false;
    for (var i = 0; i < arr.length; i++) {
      if (isNaN(arr[i])) { started = false; continue; }
      var px = x(i), py = y(arr[i]);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  function band(ctx, up, dn, x, y, fill) {
    ctx.fillStyle = fill; ctx.beginPath(); var started = false;
    for (var i = 0; i < up.length; i++) { if (isNaN(up[i])) continue;
      var px = x(i), py = y(up[i]); if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py); }
    for (var j = dn.length - 1; j >= 0; j--) { if (isNaN(dn[j])) continue; ctx.lineTo(x(j), y(dn[j])); }
    ctx.closePath(); ctx.fill();
  }
  function drawDiv(ctx, list, x, yOf, color, label) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.font = '9px sans-serif';
    list.forEach(function (d) {
      ctx.setLineDash([4, 2]);
      ctx.beginPath(); ctx.moveTo(x(d.from), yOf(d.from)); ctx.lineTo(x(d.to), yOf(d.to)); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x(d.to), yOf(d.to), 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(label, x(d.to) + 4, yOf(d.to) - 5);
    });
    ctx.restore();
  }
  function lastValid(arr) { for (var i = arr.length - 1; i >= 0; i--) if (!isNaN(arr[i])) return arr[i]; return null; }

  function updateStatus(res, cfg) {
    var p = precisionOf(cfg.style);
    document.getElementById('statusParams').textContent =
      cfg.inputs.length + ' ' + cfg.inputs.source +
      (cfg.inputs.maType !== 'None' ? ' · MA ' + cfg.inputs.maType + ' ' + cfg.inputs.maLength : '');
    var el = document.getElementById('statusValues');
    if (!cfg.style.statusValues) { el.textContent = ''; return; }
    var r = lastValid(res.rsi), m = res.ma ? lastValid(res.ma) : null;
    el.innerHTML = '<span style="color:' + cfg.style.rsi.color + '">' + (r != null ? r.toFixed(p) : '—') + '</span>' +
      (m != null ? '  <span style="color:' + cfg.style.ma.color + '">MA ' + m.toFixed(p) + '</span>' : '');
  }

  function updateLegend(cfg) {
    var items = [];
    if (cfg.style.rsi.visible) items.push(sw('RSI', cfg.style.rsi.color));
    if (cfg.inputs.maType !== 'None' && cfg.style.ma.visible) items.push(sw('RSI-based MA', cfg.style.ma.color));
    if (/bollinger/i.test(cfg.inputs.maType) && cfg.style.bb.visible) items.push(sw('Bollinger Bands', cfg.style.bb.color));
    if (cfg.style.upperBand.visible) items.push(sw('Upper ' + cfg.style.upperBand.value, cfg.style.upperBand.color));
    if (cfg.style.lowerBand.visible) items.push(sw('Lower ' + cfg.style.lowerBand.value, cfg.style.lowerBand.color));
    document.getElementById('legend').innerHTML = items.join('');
  }
  function sw(text, color) {
    return '<span style="display:inline-flex;align-items:center;gap:6px">' +
      '<i style="width:16px;height:3px;border-radius:2px;background:' + color + ';display:inline-block"></i>' + text + '</span>';
  }

  RSISettings.onChange(render);
  RSISettings.init();
  window.addEventListener('resize', function () { render(RSISettings.state); });
})();
