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

  review(lastN = 100) {
    const trades = this.list(lastN);
    const closed = trades.filter((t: any) => typeof t.pnl === 'number');
    const wins = closed.filter((t: any) => t.pnl > 0);
    const losses = closed.filter((t: any) => t.pnl <= 0);

    const grossWin = wins.reduce((a: number, t: any) => a + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((a: number, t: any) => a + t.pnl, 0));

    return {
      tradeCount: closed.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      avgPnl: closed.length ? closed.reduce((a: number, t: any) => a + t.pnl, 0) / closed.length : 0,
      maxDrawdownApprox: this.maxDrawdown(closed.map((t: any) => t.pnl)),
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0,
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
