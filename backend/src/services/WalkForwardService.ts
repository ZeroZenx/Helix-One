export interface BacktestTrade {
  ts: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entry: number;
  exit: number;
  feesBps?: number;
  slippageBps?: number;
}

export interface WalkForwardWindow {
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
}

export interface BacktestMetrics {
  expectancyR: number;
  sharpe: number;
  maxDrawdownPct: number;
  turnover: number;
  slippageAdjustedExpectancyR: number;
  winRatePct: number;
  sampleSize: number;
}

export class WalkForwardService {
  runMetrics(trades: BacktestTrade[]): BacktestMetrics {
    const returns = trades.map((t) => this.tradeReturn(t));
    const wins = returns.filter((r) => r > 0).length;
    const expectancy = returns.length === 0 ? 0 : returns.reduce((a, b) => a + b, 0) / returns.length;
    const sharpe = this.sharpe(returns);
    const maxDrawdownPct = this.maxDrawdown(returns);
    const turnover = trades.length;
    const slippageAdjustedExpectancyR = trades.length === 0
      ? 0
      : trades.map((t) => this.tradeReturn(t, true)).reduce((a, b) => a + b, 0) / trades.length;

    return {
      expectancyR: expectancy,
      sharpe,
      maxDrawdownPct,
      turnover,
      slippageAdjustedExpectancyR,
      winRatePct: returns.length === 0 ? 0 : (wins / returns.length) * 100,
      sampleSize: trades.length,
    };
  }

  runWalkForward(trades: BacktestTrade[], windows: WalkForwardWindow[]) {
    return windows.map((w) => {
      const testTrades = trades.filter((t) => t.ts >= w.testStart && t.ts <= w.testEnd);
      const trainTrades = trades.filter((t) => t.ts >= w.trainStart && t.ts <= w.trainEnd);

      const leakage = trainTrades.some((t) => t.ts > w.testStart);

      return {
        window: w,
        leakageDetected: leakage,
        trainMetrics: this.runMetrics(trainTrades),
        testMetrics: this.runMetrics(testTrades),
      };
    });
  }

  private tradeReturn(t: BacktestTrade, includeCosts = false): number {
    const raw = t.side === 'BUY' ? (t.exit - t.entry) / t.entry : (t.entry - t.exit) / t.entry;
    if (!includeCosts) return raw;
    const costs = ((t.feesBps || 0) + (t.slippageBps || 0)) / 10000;
    return raw - costs;
  }

  private sharpe(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(Math.max(variance, 0));
    return std === 0 ? 0 : mean / std;
  }

  private maxDrawdown(returns: number[]): number {
    let equity = 1;
    let peak = 1;
    let maxDd = 0;
    for (const r of returns) {
      equity *= (1 + r);
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  }
}
