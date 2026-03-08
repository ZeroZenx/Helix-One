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
    const [funding, oi, news, micro] = await Promise.all([
      this.fetchFunding(symbols),
      this.fetchOpenInterest(symbols),
      this.fetchNews(),
      this.fetchMicrostructure(symbols),
    ]);

    const riskFlags: string[] = [];
    const primary = micro.find((m) => m.symbol === 'BTCUSDT') || micro[0];

    const elevatedFunding = funding.some((f) => Math.abs(f.fundingRate) > 0.0008);
    if (elevatedFunding) riskFlags.push('Elevated funding detected');

    const veryLowLiquidity = oi.some((x) => x.openInterestUsd > 0 && x.openInterestUsd < 20_000_000);
    const lowLiquidity = oi.some((x) => x.openInterestUsd > 0 && x.openInterestUsd < 50_000_000);
    const veryWideSpread = micro.some((m) => m.available && m.spreadBps > 12);
    const wideSpread = micro.some((m) => m.available && m.spreadBps > 5);

    let liquidityState: 'good' | 'acceptable' | 'poor' = 'good';
    if (veryLowLiquidity || veryWideSpread) liquidityState = 'poor';
    else if (lowLiquidity || wideSpread) liquidityState = 'acceptable';
    if (liquidityState === 'acceptable') riskFlags.push('Liquidity reduced');
    if (liquidityState === 'poor') riskFlags.push('Liquidity poor');

    const atrPct = primary?.atrPct ?? 0;
    const volatilityState: 'low' | 'normal' | 'high' = atrPct > 1.2 ? 'high' : atrPct < 0.35 && atrPct > 0 ? 'low' : 'normal';
    if (volatilityState === 'high') riskFlags.push('High short-term volatility');

    const trendPct = primary?.emaTrendPct ?? 0;
    const change24h = primary?.change24hPct ?? 0;

    let marketRegime: RiskIntelSnapshot['marketRegime'] = 'unclear';
    if (!primary || !primary.available) {
      marketRegime = 'unclear';
      riskFlags.push('Market microstructure unavailable');
    } else if (elevatedFunding && volatilityState === 'high') {
      marketRegime = 'event_driven';
    } else if (Math.abs(change24h) >= 2.2 && Math.abs(trendPct) >= 0.3) {
      marketRegime = change24h > 0 ? 'breakout' : 'breakdown';
    } else if (Math.abs(trendPct) <= 0.12 && volatilityState === 'low') {
      marketRegime = 'squeeze';
    } else if (Math.abs(trendPct) <= 0.2) {
      marketRegime = 'range';
    } else {
      marketRegime = 'trend';
    }

    let regimeConfidence = 55;
    regimeConfidence += Math.min(20, Math.abs(trendPct) * 28);
    regimeConfidence += Math.min(15, Math.abs(change24h) * 3);
    if (volatilityState === 'high') regimeConfidence -= 8;
    if (liquidityState === 'acceptable') regimeConfidence -= 6;
    if (liquidityState === 'poor') regimeConfidence -= 14;
    if (!primary?.available) regimeConfidence -= 18;
    regimeConfidence = Math.max(35, Math.min(92, Math.round(regimeConfidence)));
    if (regimeConfidence < 60) riskFlags.push('Low regime confidence');

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

  private async fetchMicrostructure(symbols: string[]) {
    const out: Array<{
      symbol: string;
      spreadBps: number;
      atrPct: number;
      emaTrendPct: number;
      change24hPct: number;
      available: boolean;
    }> = [];

    for (const symbol of symbols) {
      try {
        const [bookRes, klineRes, ticker24hRes] = await Promise.all([
          axios.get('https://fapi.binance.com/fapi/v1/ticker/bookTicker', { params: { symbol }, timeout: 8000 }),
          axios.get('https://fapi.binance.com/fapi/v1/klines', { params: { symbol, interval: '5m', limit: 120 }, timeout: 8000 }),
          axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr', { params: { symbol }, timeout: 8000 }),
        ]);

        const bid = Number(bookRes.data.bidPrice || 0);
        const ask = Number(bookRes.data.askPrice || 0);
        const mid = (bid + ask) / 2;
        const spreadBps = bid > 0 && ask > 0 && mid > 0 ? ((ask - bid) / mid) * 10000 : 0;

        const closes = (klineRes.data || []).map((k: any) => Number(k[4] || 0)).filter((x: number) => x > 0);
        const highs = (klineRes.data || []).map((k: any) => Number(k[2] || 0));
        const lows = (klineRes.data || []).map((k: any) => Number(k[3] || 0));

        const atr = this.calcAtr(highs, lows, closes, 14);
        const lastClose = closes[closes.length - 1] || 0;
        const atrPct = lastClose > 0 ? (atr / lastClose) * 100 : 0;

        const ema20 = this.calcEma(closes, 20);
        const ema50 = this.calcEma(closes, 50);
        const emaTrendPct = lastClose > 0 ? ((ema20 - ema50) / lastClose) * 100 : 0;

        const change24hPct = Number(ticker24hRes.data?.priceChangePercent || 0);

        out.push({ symbol, spreadBps, atrPct, emaTrendPct, change24hPct, available: true });
      } catch {
        out.push({ symbol, spreadBps: 0, atrPct: 0, emaTrendPct: 0, change24hPct: 0, available: false });
      }
    }

    return out;
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

  private calcEma(values: number[], period: number): number {
    if (values.length === 0) return 0;
    const k = 2 / (period + 1);
    let ema = values[0];
    for (let i = 1; i < values.length; i += 1) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private calcAtr(highs: number[], lows: number[], closes: number[], period: number): number {
    if (closes.length < period + 1) return 0;
    const trs: number[] = [];
    for (let i = 1; i < closes.length; i += 1) {
      const high = highs[i] || closes[i];
      const low = lows[i] || closes[i];
      const prevClose = closes[i - 1];
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trs.push(tr);
    }
    const window = trs.slice(-period);
    if (window.length === 0) return 0;
    return window.reduce((a, b) => a + b, 0) / window.length;
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
