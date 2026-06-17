# HELIX.ONE Next Phase Plan — 2026-04-15

## Completed recently
- Added paper/live mode UI warnings
- Added execution mode badge direction
- Expanded journal analytics
- Configured user-approved leverage and risk settings direction
- Added runtime policy documentation

## Immediate next tasks
1. Add richer dashboard analytics cards using journal review output:
   - expectancy
   - net PnL
   - gross win / gross loss
   - streaks
   - best / worst trade
2. Add settings-change audit logging
3. Add explicit paper/live mode labels in more operations panels
4. Continue backend cleanup and test coverage for leverage floor + paper mode

## Target execution policy
- Min leverage: 10x
- Max leverage: 20x
- Max trades/day: 8
- Max consecutive losses: 3
- Confidence floor: 0.60
- Max open positions: 4
