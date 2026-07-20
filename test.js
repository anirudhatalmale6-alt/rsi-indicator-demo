/*
 * test.js — verifies the core RSI against the published Wilder / StockCharts
 * 14-period reference dataset. Run: `node test.js`
 *
 * Note: the classic published table rounds intermediate average gain/loss to
 * 2 decimals, so it drifts from the exact math by up to ~0.07. TradingView's
 * ta.rsi (and this engine) use full-precision RMA. We therefore assert against
 * the exact hand-computed first value and keep a loose tolerance vs the rounded
 * published series.
 */
const RSI = require('./rsi.js');

const closes = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,
  45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64,46.21,46.25,
  45.71,46.45,45.78,45.35,44.03,44.18,44.22,44.57,43.42,42.66,43.13];

const rsi = RSI.computeRSI(closes, 14).filter(v => !isNaN(v));

let pass = true;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name);
  if (!cond) pass = false;
}

// Exact first RSI = 100 - 100/(1 + (3.34/14)/(1.40/14)) = 70.4645...
check('first RSI == 70.46 (exact Wilder math)', Math.abs(rsi[0] - 70.4645) < 0.001);

// Loose check against the rounded published series
const published = [70.53,66.32,66.55,69.41,66.36,57.97,62.93,63.26,56.06,62.38,
  54.71,50.42,39.99,41.46,41.87,45.46,37.30,33.08,37.77];
let maxErr = 0;
for (let i = 0; i < published.length; i++) maxErr = Math.max(maxErr, Math.abs(rsi[i] - published[i]));
check('within 0.08 of published (rounded) series, max err=' + maxErr.toFixed(4), maxErr < 0.08);

// RSI must always be within [0, 100]
check('all RSI in [0,100]', rsi.every(v => v >= 0 && v <= 100));

// Monotone-up input => RSI pins near 100
const up = Array.from({length: 30}, (_, i) => 100 + i);
check('all-up series => RSI == 100', RSI.computeRSI(up, 14).slice(-1)[0] === 100);

process.exit(pass ? 0 : 1);
