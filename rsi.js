/*
 * rsi.js — TradingView-accurate RSI indicator engine.
 *
 * Framework-agnostic, zero dependencies. Mirrors TradingView's built-in
 * "Relative Strength Index" (Pine v6) exactly:
 *   - Wilder's RMA smoothing for the core RSI (ta.rsi)
 *   - Optional RSI-based moving average (SMA / EMA / WMA / VWMA / RMA)
 *   - Optional Bollinger Bands on the RSI-based MA
 *   - Overbought / oversold levels + midline
 *   - Regular divergence detection (bullish / bearish) via RSI pivots
 *
 * All series are returned index-aligned with the input bars. Warm-up bars
 * that cannot be computed yet are returned as NaN (matching TradingView's
 * "na" gaps), so callers can simply skip NaN when plotting.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RSI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- primitive smoothers (all NaN-safe, index-aligned) ----

  // Wilder's RMA, seeded with an SMA of the first `len` values (as Pine does).
  function rma(src, len) {
    const out = new Array(src.length).fill(NaN);
    const alpha = 1 / len;
    let prev = NaN;
    let seedSum = 0, seedCount = 0;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (isNaN(v)) continue;
      if (isNaN(prev)) {
        seedSum += v;
        seedCount++;
        if (seedCount === len) {
          prev = seedSum / len;
          out[i] = prev;
        }
      } else {
        prev = alpha * v + (1 - alpha) * prev;
        out[i] = prev;
      }
    }
    return out;
  }

  function smaWindow(src, len) {
    const out = new Array(src.length).fill(NaN);
    for (let i = 0; i < src.length; i++) {
      if (i < len - 1) continue;
      let sum = 0, ok = true;
      for (let j = i - len + 1; j <= i; j++) {
        if (isNaN(src[j])) { ok = false; break; }
        sum += src[j];
      }
      if (ok) out[i] = sum / len;
    }
    return out;
  }

  function ema(src, len) {
    const out = new Array(src.length).fill(NaN);
    const alpha = 2 / (len + 1);
    let prev = NaN, seedSum = 0, seedCount = 0;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (isNaN(v)) continue;
      if (isNaN(prev)) {
        seedSum += v; seedCount++;
        if (seedCount === len) { prev = seedSum / len; out[i] = prev; }
      } else {
        prev = alpha * v + (1 - alpha) * prev;
        out[i] = prev;
      }
    }
    return out;
  }

  function wma(src, len) {
    const out = new Array(src.length).fill(NaN);
    const denom = (len * (len + 1)) / 2;
    for (let i = 0; i < src.length; i++) {
      if (i < len - 1) continue;
      let sum = 0, ok = true;
      for (let j = 0; j < len; j++) {
        const v = src[i - len + 1 + j];
        if (isNaN(v)) { ok = false; break; }
        sum += v * (j + 1);
      }
      if (ok) out[i] = sum / denom;
    }
    return out;
  }

  // Volume-weighted MA (needs volume aligned to src)
  function vwma(src, volume, len) {
    const out = new Array(src.length).fill(NaN);
    for (let i = 0; i < src.length; i++) {
      if (i < len - 1) continue;
      let num = 0, den = 0, ok = true;
      for (let j = i - len + 1; j <= i; j++) {
        const v = src[j], vol = volume ? volume[j] : 1;
        if (isNaN(v) || isNaN(vol)) { ok = false; break; }
        num += v * vol; den += vol;
      }
      if (ok && den !== 0) out[i] = num / den;
    }
    return out;
  }

  function stdev(src, len) {
    const out = new Array(src.length).fill(NaN);
    for (let i = 0; i < src.length; i++) {
      if (i < len - 1) continue;
      let mean = 0, ok = true;
      for (let j = i - len + 1; j <= i; j++) {
        if (isNaN(src[j])) { ok = false; break; }
        mean += src[j];
      }
      if (!ok) continue;
      mean /= len;
      let variance = 0;
      for (let j = i - len + 1; j <= i; j++) variance += (src[j] - mean) ** 2;
      // TradingView ta.stdev uses population stdev (divide by len)
      out[i] = Math.sqrt(variance / len);
    }
    return out;
  }

  function movingAverage(type, src, len, volume) {
    switch ((type || 'SMA').toUpperCase()) {
      case 'SMA': return smaWindow(src, len);
      case 'EMA': return ema(src, len);
      case 'WMA': return wma(src, len);
      case 'VWMA': return vwma(src, volume, len);
      case 'RMA': return rma(src, len);
      default: return smaWindow(src, len);
    }
  }

  // ---- core RSI (matches Pine ta.rsi exactly) ----
  function computeRSI(source, length) {
    const n = source.length;
    const upMoves = new Array(n).fill(NaN);
    const downMoves = new Array(n).fill(NaN);
    for (let i = 1; i < n; i++) {
      const change = source[i] - source[i - 1];
      upMoves[i] = Math.max(change, 0);
      downMoves[i] = -Math.min(change, 0);
    }
    const up = rma(upMoves, length);
    const down = rma(downMoves, length);
    const rsi = new Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      if (isNaN(up[i]) || isNaN(down[i])) continue;
      if (down[i] === 0) rsi[i] = 100;
      else if (up[i] === 0) rsi[i] = 0;
      else rsi[i] = 100 - 100 / (1 + up[i] / down[i]);
    }
    return rsi;
  }

  // ---- pivot helpers for divergence ----
  function pivotLow(series, left, right) {
    const out = new Array(series.length).fill(false);
    for (let i = left; i < series.length - right; i++) {
      const v = series[i];
      if (isNaN(v)) continue;
      let isPivot = true;
      for (let j = i - left; j <= i + right; j++) {
        if (j === i) continue;
        if (isNaN(series[j]) || series[j] <= v) { isPivot = false; break; }
      }
      out[i] = isPivot;
    }
    return out;
  }

  function pivotHigh(series, left, right) {
    const out = new Array(series.length).fill(false);
    for (let i = left; i < series.length - right; i++) {
      const v = series[i];
      if (isNaN(v)) continue;
      let isPivot = true;
      for (let j = i - left; j <= i + right; j++) {
        if (j === i) continue;
        if (isNaN(series[j]) || series[j] >= v) { isPivot = false; break; }
      }
      out[i] = isPivot;
    }
    return out;
  }

  // Regular divergence (TradingView's built-in default: lookback 5 left / 5 right,
  // confirmed range 5..60 bars between pivots).
  function detectDivergences(rsi, priceLow, priceHigh, opts) {
    const lbL = opts.lookbackLeft, lbR = opts.lookbackRight;
    const rangeMin = opts.rangeMin, rangeMax = opts.rangeMax;
    const bull = [], bear = [];

    const plPivots = pivotLow(rsi, lbL, lbR);
    let lastPL = -1;
    for (let i = 0; i < rsi.length; i++) {
      if (!plPivots[i]) continue;
      if (lastPL >= 0) {
        const gap = i - lastPL;
        if (gap >= rangeMin && gap <= rangeMax) {
          // bullish regular: RSI higher low + price lower low
          if (rsi[i] > rsi[lastPL] && priceLow[i] < priceLow[lastPL]) {
            bull.push({ from: lastPL, to: i });
          }
        }
      }
      lastPL = i;
    }

    const phPivots = pivotHigh(rsi, lbL, lbR);
    let lastPH = -1;
    for (let i = 0; i < rsi.length; i++) {
      if (!phPivots[i]) continue;
      if (lastPH >= 0) {
        const gap = i - lastPH;
        if (gap >= rangeMin && gap <= rangeMax) {
          // bearish regular: RSI lower high + price higher high
          if (rsi[i] < rsi[lastPH] && priceHigh[i] > priceHigh[lastPH]) {
            bear.push({ from: lastPH, to: i });
          }
        }
      }
      lastPH = i;
    }
    return { bullish: bull, bearish: bear };
  }

  /*
   * Main entry point.
   *
   * bars: array of { open, high, low, close, volume } (volume optional).
   * options (all optional, defaults match TradingView):
   *   length            = 14        RSI length
   *   source            = 'close'   'open'|'high'|'low'|'close'|'hl2'|'hlc3'|'ohlc4'
   *   maType            = 'None'    'None'|'SMA'|'EMA'|'WMA'|'VWMA'|'RMA'|'SMA + Bollinger Bands'
   *   maLength          = 14
   *   bbMult            = 2.0
   *   overbought        = 70
   *   oversold          = 30
   *   middle            = 50
   *   showDivergence    = false
   *   divLookbackLeft   = 5
   *   divLookbackRight  = 5
   *   divRangeMin       = 5
   *   divRangeMax       = 60
   *
   * Returns { rsi, ma, bbUpper, bbLower, levels, divergences }.
   */
  function calculate(bars, options) {
    const o = Object.assign({
      length: 14, source: 'close', maType: 'None', maLength: 14, bbMult: 2.0,
      overbought: 70, oversold: 30, middle: 50, showDivergence: false,
      divLookbackLeft: 5, divLookbackRight: 5, divRangeMin: 5, divRangeMax: 60,
    }, options || {});

    const src = bars.map(function (b) {
      switch (o.source) {
        case 'open': return b.open;
        case 'high': return b.high;
        case 'low': return b.low;
        case 'hl2': return (b.high + b.low) / 2;
        case 'hlc3': return (b.high + b.low + b.close) / 3;
        case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
        default: return b.close;
      }
    });
    const volume = bars.map(function (b) { return b.volume != null ? b.volume : 1; });

    const rsi = computeRSI(src, o.length);

    let ma = null, bbUpper = null, bbLower = null;
    const wantsBB = /bollinger/i.test(o.maType);
    if (o.maType && o.maType.toLowerCase() !== 'none') {
      const maType = wantsBB ? 'SMA' : o.maType;
      ma = movingAverage(maType, rsi, o.maLength, volume);
      if (wantsBB) {
        const dev = stdev(rsi, o.maLength);
        bbUpper = ma.map(function (m, i) { return isNaN(m) || isNaN(dev[i]) ? NaN : m + o.bbMult * dev[i]; });
        bbLower = ma.map(function (m, i) { return isNaN(m) || isNaN(dev[i]) ? NaN : m - o.bbMult * dev[i]; });
      }
    }

    let divergences = { bullish: [], bearish: [] };
    if (o.showDivergence) {
      divergences = detectDivergences(
        rsi,
        bars.map(function (b) { return b.low; }),
        bars.map(function (b) { return b.high; }),
        { lookbackLeft: o.divLookbackLeft, lookbackRight: o.divLookbackRight,
          rangeMin: o.divRangeMin, rangeMax: o.divRangeMax }
      );
    }

    return {
      rsi: rsi,
      ma: ma,
      bbUpper: bbUpper,
      bbLower: bbLower,
      levels: { overbought: o.overbought, oversold: o.oversold, middle: o.middle },
      divergences: divergences,
      options: o,
    };
  }

  return { calculate: calculate, computeRSI: computeRSI, rma: rma, ema: ema, sma: smaWindow, wma: wma, vwma: vwma, stdev: stdev };
});
