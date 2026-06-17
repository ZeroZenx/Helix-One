# HELIX.ONE Review — 2026-04-15

## What I checked
- README and startup scripts
- Frontend dashboard and settings pages
- Backend trading routes, AI routes, settings store, evolution service, and live trading service

## Key findings

### 1) No honest basis for a “90% win rate” claim
There is no credible, audited path in this codebase to support a real 90% win-rate trading strategy. Any such claim would be unsafe and misleading.

### 2) Strongest part of the system
The strongest part is not signal quality — it is the **risk-control scaffolding**:
- kill switch
- cooldowns
- trade/day limits
- leverage caps
- break-even / stop logic
- journal + governance/eval tooling

That is the right foundation.

### 3) Biggest weaknesses found
- Dashboard had hardcoded backend URLs in places, making deployment brittle.
- AI chat endpoint was publicly exposed without admin auth.
- Evolution confidence gates were a bit too demo-friendly for live use.
- Auto-worker leverage logic effectively forced a minimum of 5x even for probe trades, which is too aggressive.
- Settings defaults still allow fairly loose live behavior unless tightened by operator.

## Changes applied

### Security
- Locked `/api/ai/chat/:modelId` behind admin auth.
- Left read-only AI status/market-analysis public.

### Frontend reliability
- Switched dashboard API base to use `getTradingApiBaseUrl()` consistently.
- Replaced remaining hardcoded `127.0.0.1:3001` status fetches with API helper.

### Trading safety
- Tightened `HelixEvolutionService` style confidence defaults:
  - neutral/balanced: 65
  - risk_on: 67
  - risk_off: 75
- Fixed worker leverage selection:
  - probe trades now use **1x**
  - normal trades use the lower of runtime max leverage and symbol profile max leverage

## Recommended next improvements

### High priority
1. Add a true **paper trading mode** separate from Binance live/testnet.
2. Add **backtest result import** and equity-curve review UI.
3. Add **slippage/fill-quality analytics** from actual fills, not estimates.
4. Add **symbol-specific max daily loss / open-position caps**.
5. Add **regime-specific disable switches** (e.g. disable DOGE in high-volatility regimes).

### Medium priority
1. Move secrets from JSON settings into environment or secret store.
2. Add request rate limiting for sensitive endpoints.
3. Add full audit trail for settings changes.
4. Add structured unit tests for:
   - confidence gates
   - kill switch
   - cooldown logic
   - protective stop placement
   - leverage caps

### Strategy reality check
If you want better real-world performance, the likely path is:
- fewer symbols
- lower leverage
- stricter setup filters
- wider no-trade zones
- more post-trade analytics
- paper validation before any live changes

## Bottom line
HELIX.ONE is closer to a **risk-aware execution framework** than a proven alpha engine.
That’s actually good news: safer to improve from here than from an overfit “magic strategy.”
