Darren,

Good move. Now the next step is not improving the prompt. The next step is improving the operational routine around the bot. A strong prompt without structure around execution still leads to unstable trading.

Operational framework

1) Daily operating routine
- Produce a daily briefing report before first trade.
- Include: account balance, available margin, previous day PnL, consecutive losses, funding rates, top crypto news, macro events next 8h, BTC/ETH HTF trend, volatility, liquidity, recommended risk level.
- Example fields:
  - Account balance
  - Daily risk budget
  - Market regime
  - Liquidity
  - News risk
  - Funding bias
  - Recommended posture
  - Max trades today

2) Intraday loop (recommended minimum cycle: 5 minutes)
- Pull market data
- Pull news data
- Update volatility metrics
- Check risk limits
- Scan setups
- Score setups
- Decide trade or no trade

3) Hard risk controls (baseline for small account)
- Max risk per trade: $2 to $3
- Max daily loss: $10
- Max open positions: 1 or 2
- Max leverage: 5x to 10x
- Max trades per day: 5
- Stop trading after 3 consecutive losses
- Cooldown 30 minutes after loss
- Kill switch at 5% equity drawdown

4) Mandatory pre-trade gate
- News risk low
- Spread acceptable
- Liquidity acceptable
- Funding not extreme
- Slippage acceptable
- Market regime clear
- Stop loss defined
- Risk within limits
- Trade not chasing momentum
- Entry not at major resistance/support
If any fail: Decision = NO_TRADE

5) Market intelligence sources
- Crypto: CoinDesk, The Block, CoinTelegraph, Binance announcements
- Macro: Fed, CPI, interest-rate decisions, unemployment data
- Metrics: funding rates, OI, liquidation heatmaps, long/short ratio

6) Monitor these metrics continuously
- Equity curve
- Daily PnL
- Win rate
- Average R
- Max drawdown
- Sharpe
- Profit factor
- Trade duration
If profit factor < 1.2 over 50 trades: reduce size or halt

7) Post-trade journaling
Log every trade with symbol, side, entry, stop, TP, risk, reason, outcome, PnL, duration.
Run pattern review after each 100 trades.

8) Regime detection required
Classify as trend, range, high volatility, low liquidity, or event-driven.
Trade only when regime confidence > 60, else NO_TRADE.

9) Volatility guardrails
Use ATR, realized vol, volume spikes.
If ATR spike > 2x normal: pause trading for 30 minutes.

10) Reduce trade frequency
Prefer 1-3 high-quality trades/day.
After two profitable trades: reduce size by 50% or stop for the day.

11) Architecture layers
1. Market data ingestion
2. News ingestion
3. Feature calculation
4. LLM reasoning
5. Risk engine
6. Execution engine
7. Trade journal

12) Include transaction costs
Account for Binance maker/taker fees, funding, and slippage.
Reference: https://www.binance.com/en/support/faq/detail/360033544231

13) Core instruction to preserve
"Survival of capital takes priority over frequency of trades."
