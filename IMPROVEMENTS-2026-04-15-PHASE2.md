# HELIX.ONE Improvements — Phase 2 (2026-04-15)

## User-directed leverage policy
Implemented Darren's requested leverage floor policy:
- minimum leverage: 10x
- maximum leverage: 20x
- probe trades are no longer allowed below 10x
- high-confidence trades can use 20x

Note: this is materially more aggressive than I recommend.

## Changes applied

### 1) Runtime risk settings expanded
Added:
- `minLeverage`
- `paperTrading`

Updated defaults toward stricter ops:
- max leverage: 20
- min leverage: 10
- max position size: 8%
- cooldown: 45 minutes
- max trades/day: 4
- max consecutive losses: 2
- confidence floor: 0.72
- paper trading default: enabled

### 2) LiveTradingService updated
- Added leverage floor enforcement
- Added leverage resolution helper
- Signals now normalize leverage before sizing/execution
- Added paper-trading execution path that simulates fills without sending exchange orders
- Close / partial close / force-close paths now skip exchange writes in paper mode

### 3) Worker execution policy updated
- Auto-worker now respects 10x minimum leverage
- Auto-worker can use 20x on stronger-confidence setups
- Probe mode no longer drops to 1x

### 4) Settings UI updated
Added settings support for:
- Min Leverage
- Paper Trading Mode

## Current position
HELIX.ONE now has:
- better auth hygiene
- better API consistency
- tighter confidence gates
- explicit 10x–20x leverage policy
- paper trading groundwork

## Still recommended next work
- Add explicit paper/live badges everywhere in UI
- Add trade replay and equity curve analytics
- Add test coverage around leverage floor, confidence gate, and paper mode
- Add a dedicated strategy diagnostics page
- Persist paper/live mode and leverage policy changes safely with audit entries
