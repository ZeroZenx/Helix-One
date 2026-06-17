# HELIX.ONE Build Fixes — 2026-04-15

## Backend TypeScript build fixes applied
- Removed duplicate `maxOpenPositions` key from the settings-audit risk summary helper in `src/routes/trading.ts`
- Added `maxOpenPositions?: number` to `TradingConfig` in `src/services/LiveTradingService.ts`

## Why
The backend build failed because:
1. an object literal had the same key twice
2. `maxOpenPositions` was being passed into `TradingConfig` but not declared in the type

These fixes align the runtime risk policy changes with the backend type system.
