# RSI Indicator — TradingView-accurate engine + demo

A drop-in RSI (Relative Strength Index) implementation that matches
TradingView's built-in **Relative Strength Index** indicator feature-for-feature,
plus a self-contained demo chart so you can see it running.

## What's included

- **`rsi.js`** — the indicator engine. Zero dependencies, framework-agnostic
  (works in the browser or Node). This is the piece meant to be ported into
  your charting system.
- **`index.html`** — a demo chart (candlesticks + RSI sub-panel) that wires the
  engine to a canvas renderer, with live controls for every setting.
- **`data.js`** — deterministic sample EUR/USD data so the demo is reproducible.
- **`test.js`** — verifies the core RSI against the published Wilder/StockCharts
  reference values.

## Feature parity with TradingView's RSI

| TradingView feature | Status |
|---|---|
| Core RSI with **Wilder's RMA smoothing** (`ta.rsi`) | ✅ exact |
| Configurable **Length** | ✅ |
| Configurable **Source** (close / open / high / low / hl2 / hlc3 / ohlc4) | ✅ |
| **RSI-based MA** overlay | ✅ |
| MA types: SMA, EMA, WMA, VWMA, RMA | ✅ |
| **Bollinger Bands** on the RSI-based MA (basis + mult) | ✅ |
| **Overbought / Oversold** levels + midline (70 / 30 / 50) | ✅ |
| OB/OS zone fill | ✅ |
| **Regular divergence** detection (bullish / bearish) via RSI pivots | ✅ |

## Usage

```js
const result = RSI.calculate(bars, {
  length: 14,
  source: 'close',
  maType: 'SMA + Bollinger Bands',
  maLength: 14,
  bbMult: 2.0,
  overbought: 70,
  oversold: 30,
  showDivergence: true,
});

// result.rsi        -> number[] aligned to bars (NaN during warm-up)
// result.ma         -> RSI-based MA (or null)
// result.bbUpper/Lower
// result.divergences.bullish / .bearish -> [{from, to}, ...]
```

`bars` is an array of `{ open, high, low, close, volume }`. All output series are
index-aligned with the input, using `NaN` for warm-up bars (matching TradingView's
`na` gaps) so plotting code can simply skip them.

## Notes on accuracy

The core RSI uses full-precision Wilder RMA smoothing exactly as TradingView's
`ta.rsi` does — no intermediate rounding. Verified against the published
reference dataset in `test.js` (`node test.js`).

## Porting into your platform

The engine has no rendering assumptions — it takes bars and returns arrays.
To integrate, feed it your OHLC series and plot the returned arrays with your
existing chart renderer. Happy to wire it directly into your indicator API once
I have access to the codebase.
