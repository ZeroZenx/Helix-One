# HELIX.ONE Phase 3 Progress — 2026-04-15

## Added
- `SettingsAuditService` for JSONL-based settings change history
- Trading route audit diff helpers for risk-setting changes
- `/api/trading/settings-audit` endpoint (admin-only)

## Purpose
This adds traceability whenever execution-critical settings change, especially:
- min/max leverage
- confidence floor
- max trades/day
- max consecutive losses
- max open positions
- paper trading mode

## Why it matters
With aggressive leverage policy (10x–20x), settings drift becomes a real risk. Audit history helps verify what changed, when, and how.
