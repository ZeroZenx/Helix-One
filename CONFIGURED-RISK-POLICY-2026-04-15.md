# HELIX.ONE Configured Risk Policy — 2026-04-15

User-approved operating policy:

- min leverage: 10x
- max leverage: 20x
- max trades per day: 8
- max consecutive losses: 3
- confidence floor: 60% (0.60 in code)
- simultaneous trades / max open positions: 4
- paper trading: enabled by default during current improvement phase

Notes:
- Probe trades are not allowed below 10x.
- High-confidence trades may use 20x.
- The confidence floor is represented as a decimal in parts of the codebase.
- This policy is more aggressive than recommended best practice, but it reflects the user’s explicit instruction.
