import fs from 'fs';
import path from 'path';

export class JournalService {
  private journalPath: string;

  constructor() {
    this.journalPath = path.resolve(process.cwd(), 'data', 'trade-journal.jsonl');
    fs.mkdirSync(path.dirname(this.journalPath), { recursive: true });
  }

  append(entry: any) {
    fs.appendFileSync(this.journalPath, JSON.stringify(entry) + '\n');
  }

  list(limit = 200) {
    if (!fs.existsSync(this.journalPath)) return [];
    const lines = fs
      .readFileSync(this.journalPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-limit);
    return lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  listByType(type: string, limit = 200, scanLimit = 100000) {
    if (!fs.existsSync(this.journalPath)) return [];
    const lines = fs
      .readFileSync(this.journalPath, 'utf8')
      .split('\n')
      .filter(Boolean);

    const out: any[] = [];
    for (let i = lines.length - 1, scanned = 0; i >= 0 && scanned < scanLimit && out.length < limit; i -= 1, scanned += 1) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry?.type === type) out.push(entry);
      } catch {
        // ignore malformed journal lines
      }
    }

    return out.reverse();
  }

  review(lastN = 100) {
    const trades = this.list(lastN);
    const closed = trades.filter((t: any) => typeof t.pnl === 'number');
    const wins = closed.filter((t: any) => t.pnl > 0);
    const losses = closed.filter((t: any) => t.pnl <= 0);

    const grossWin = wins.reduce((a: number, t: any) => a + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((a: number, t: any) => a + t.pnl, 0));
    const netPnl = closed.reduce((a: number, t: any) => a + t.pnl, 0);
    const expectancy = closed.length ? netPnl / closed.length : 0;
    const bestTrade = closed.length ? Math.max(...closed.map((t: any) => Number(t.pnl || 0))) : 0;
    const worstTrade = closed.length ? Math.min(...closed.map((t: any) => Number(t.pnl || 0))) : 0;

    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    for (const trade of closed) {
      const pnl = Number(trade.pnl || 0);
      if (pnl > 0) {
        currentWinStreak += 1;
        currentLossStreak = 0;
      } else {
        currentLossStreak += 1;
        currentWinStreak = 0;
      }
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    }

    return {
      tradeCount: closed.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      avgPnl: expectancy,
      expectancy,
      netPnl,
      grossWin,
      grossLoss,
      bestTrade,
      worstTrade,
      maxDrawdownApprox: this.maxDrawdown(closed.map((t: any) => t.pnl)),
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0,
      maxWinStreak,
      maxLossStreak,
    };
  }

  private maxDrawdown(pnls: number[]) {
    let peak = 0;
    let equity = 0;
    let maxDd = 0;

    for (const pnl of pnls) {
      equity += pnl;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDd) maxDd = dd;
    }

    return maxDd;
  }
}
