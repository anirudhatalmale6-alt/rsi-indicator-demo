# RSI Indicator — TradingView-accurate engine + full settings dialog

A drop-in RSI (Relative Strength Index) implementation that matches
TradingView's built-in **Relative Strength Index** indicator — both the
calculation and the complete **three-tab settings dialog** (Inputs / Style /
Visibility), with every control fully wired to the live chart.

## What's included

- **`rsi.js`** — the indicator engine. Zero dependencies, framework-agnostic
  (browser or Node). This is the piece meant to be ported into your charts.
- **`settings.js`** — the settings model + the three-tab dialog wiring, mirroring
  TradingView's RSI settings exactly.
- **`chart.js`** — a candlestick + RSI renderer that honours every setting.
- **`index.html`** — the demo (open it and click ⚙ Settings).
- **`data.js`** — deterministic sample EUR/USD data.
- **`test.js`** — verifies the core RSI against the published Wilder reference.

## The three settings tabs (all functional)

### 1. Inputs
- **Length**
- **Source** — open / high / low / close / hl2 / hlc3 / ohlc4 / hlcc4
- **Calculate Divergence** — regular bullish/bearish, drawn on the RSI pane with Bull/Bear labels
- **Smoothing → MA Type** — None / SMA / SMA + Bollinger Bands / EMA / SMMA (RMA) / WMA / VWMA
- **MA Length**, **BB StdDev**
- **Calculation → Timeframe** + **Wait for timeframe closes**

### 2. Style
Per-plot **visibility, colour, line width and line style** for:
- RSI line, RSI-based MA
- Upper / Middle / Lower bands (with editable values 70 / 50 / 30)
- Bollinger Bands
- **Background fill** between the bands, and BB background fill (colour + opacity)
- **Precision** (Default / 0–5)
- **Labels on price scale**, **Values in status line**

### 3. Visibility
Which timeframes the indicator displays on — Ticks / Seconds / Minutes / Hours /
Days / Weeks / Months / Ranges, each with on/off and from–to range inputs.

Changes apply **live** (as you edit), with **Defaults / Cancel / Ok** behaving
just like TradingView (Cancel reverts, Defaults resets, Ok commits).

## Calculation accuracy

The core RSI uses full-precision **Wilder's RMA smoothing** exactly as
TradingView's `ta.rsi` does — no intermediate rounding. Verified against the
published reference dataset in `test.js` (`node test.js`). The RSI-based MA
supports SMA, EMA, WMA, VWMA and SMMA/RMA, and the Bollinger Bands use the same
basis + standard-deviation formula.

## Usage (engine only)

```js
const result = RSI.calculate(bars, {
  length: 14, source: 'close',
  maType: 'SMA + Bollinger Bands', maLength: 14, bbMult: 2.0,
  overbought: 70, oversold: 30, middle: 50,
  showDivergence: true,
});
// result.rsi / result.ma / result.bbUpper / result.bbLower
// result.divergences.bullish / .bearish -> [{from, to}, ...]
```

`bars` is `{ open, high, low, close, volume }[]`. Output series are index-aligned
with the input, using `NaN` for warm-up bars (TradingView's `na` gaps).

## Porting into your platform

The engine has no rendering assumptions — feed it OHLC, get arrays back, plot
with your existing renderer. The settings dialog is plain HTML/JS/CSS with a
clean state object, so it maps directly onto whatever UI framework your charts
use. Tell me what your backtesting charts are built in and I'll deliver it in
that exact form.
