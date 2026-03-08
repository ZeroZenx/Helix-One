import axios from 'axios';

export interface RiskIntelSnapshot {
  generatedAt: string;
  funding: Array<{ symbol: string; fundingRate: number; markPrice: number }>;
  openInterest: Array<{ symbol: string; openInterestUsd: number }>;
  newsHeadlines: Array<{ source: string; title: string }>;
  marketRegime: 'trend' | 'range' | 'breakout' | 'breakdown' | 'squeeze' | 'event_driven' | 'unclear';
  regimeConfidence: number;
  liquidityState: 'good' | 'acceptable' | 'poor';
  volatilityState: 'low' | 'normal' | 'high';
  riskFlags: string[];
}

export class RiskIntelService {
  async getSnapshot(symbols: string[] = ['BTCUSDT', 'ETHUSDT']): Promise<RiskIntelSnapshot> {
    const [funding, oi, news] = await Promise.all([
      this.fetchFunding(symbols),
      this.fetchOpenInterest(symbols),
      this.fetchNews(),
    ]);

    const riskFlags: string[] = [];

    const elevatedFunding = funding.some((f) => Math.abs(f.fundingRate) > 0.0008);
    if (elevatedFunding) riskFlags.push('Elevated funding detected');

    const lowLiquidity = oi.some((x) => x.openInterestUsd < 50_000_000);
    const liquidityState = lowLiquidity ? 'acceptable' : 'good';

    const volatilityState: 'low' | 'normal' | 'high' = elevatedFunding ? 'high' : 'normal';
    const marketRegime = elevatedFunding ? 'event_driven' : 'trend';
    const regimeConfidence = elevatedFunding ? 62 : 70;

    if (news.length === 0) riskFlags.push('No live news headlines available');

    return {
      generatedAt: new Date().toISOString(),
      funding,
      openInterest: oi,
      newsHeadlines: news,
      marketRegime,
      regimeConfidence,
      liquidityState,
      volatilityState,
      riskFlags,
    };
  }

  async getDailyBriefing(balance = 0, availableMargin = 0, previousDayPnl = 0, consecutiveLosses = 0) {
    const snapshot = await this.getSnapshot();
    const recommendedRiskLevel = snapshot.riskFlags.length > 0 ? 'reduced' : 'normal';

    return {
      generatedAt: new Date().toISOString(),
      account: {
        balance,
        availableMargin,
        previousDayPnl,
        consecutiveLosses,
      },
      market: {
        regime: snapshot.marketRegime,
        regimeConfidence: snapshot.regimeConfidence,
        liquidityState: snapshot.liquidityState,
        volatilityState: snapshot.volatilityState,
        funding: snapshot.funding,
        openInterest: snapshot.openInterest,
      },
      news: snapshot.newsHeadlines,
      recommendedRiskLevel,
      maxTradesToday: 5,
      notes: snapshot.riskFlags,
    };
  }

  private async fetchFunding(symbols: string[]) {
    const out: Array<{ symbol: string; fundingRate: number; markPrice: number }> = [];
    for (const symbol of symbols) {
      try {
        const [fundingRes, markRes] = await Promise.all([
          axios.get('https://fapi.binance.com/fapi/v1/premiumIndex', { params: { symbol }, timeout: 8000 }),
          axios.get('https://fapi.binance.com/fapi/v1/premiumIndex', { params: { symbol }, timeout: 8000 }),
        ]);
        out.push({
          symbol,
          fundingRate: Number(fundingRes.data.lastFundingRate || 0),
          markPrice: Number(markRes.data.markPrice || 0),
        });
      } catch {
        out.push({ symbol, fundingRate: 0, markPrice: 0 });
      }
    }
    return out;
  }

  private async fetchOpenInterest(symbols: string[]) {
    const out: Array<{ symbol: string; openInterestUsd: number }> = [];
    for (const symbol of symbols) {
      try {
        const [oiRes, markRes] = await Promise.all([
          axios.get('https://fapi.binance.com/fapi/v1/openInterest', { params: { symbol }, timeout: 8000 }),
          axios.get('https://fapi.binance.com/fapi/v1/premiumIndex', { params: { symbol }, timeout: 8000 }),
        ]);
        const oi = Number(oiRes.data.openInterest || 0);
        const mark = Number(markRes.data.markPrice || 0);
        out.push({ symbol, openInterestUsd: oi * mark });
      } catch {
        out.push({ symbol, openInterestUsd: 0 });
      }
    }
    return out;
  }

  private async fetchNews() {
    const feeds = [
      { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
      { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
      { source: 'Binance Announcements', url: 'https://www.binance.com/en/support/announcement/rss' },
    ];

    const headlines: Array<{ source: string; title: string }> = [];

    await Promise.all(
      feeds.map(async (feed) => {
        try {
          const res = await axios.get(feed.url, { timeout: 8000 });
          const xml: string = String(res.data || '');
          const matches = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g)]
            .map((m) => (m[1] || m[2] || '').trim())
            .filter((t) => this.isUsefulHeadline(t))
            .slice(0, 6);

          for (const title of matches) {
            headlines.push({ source: feed.source, title: this.cleanHeadline(title) });
          }
        } catch {
          // ignore per-feed failure
        }
      })
    );

    const deduped: Array<{ source: string; title: string }> = [];
    const seen = new Set<string>();
    for (const h of headlines) {
      const key = h.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(h);
      if (deduped.length >= 10) break;
    }

    return deduped;
  }

  private cleanHeadline(title: string) {
    return title.replace(/\s+/g, ' ').trim();
  }

  private isUsefulHeadline(title: string) {
    const t = title.toLowerCase().trim();
    if (!t) return false;
    if (t.includes('rss')) return false;
    if (t === 'coindesk: bitcoin, ethereum, crypto news and price data') return false;
    if (t === 'cointelegraph.com news') return false;
    if (t.includes('announcement') && t.length < 20) return false;
    return true;
  }
}
