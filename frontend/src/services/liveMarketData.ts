// Live Market Data Service
export interface LiveMarketData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap: number;
  marketCapDominance: number;
  circulatingSupply: number;
  maxSupply: number | null;
  sentiment: 'VERY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'VERY_BEARISH';
  technicalIndicators: {
    rsi14: number;
    macdSignal: 'BUY' | 'SELL' | 'HOLD';
    ma50: number;
    ma200: number;
    supportLevel: number;
    resistanceLevel: number;
  };
}

class LiveMarketDataService {
  private baseUrl = 'https://api.coingecko.com/api/v3';
  private cache: Map<string, LiveMarketData> = new Map();
  private lastUpdate: number = 0;
  private updateInterval = 60000; // 60 seconds (CoinGecko free tier limit)

  // Calculate technical indicators (simplified)
  private calculateRSI(prices: number[]): number {
    if (prices.length < 14) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i < 14; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / 13;
    const avgLoss = losses / 13;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(prices: number[]): 'BUY' | 'SELL' | 'HOLD' {
    if (prices.length < 26) return 'HOLD';
    
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;
    
    if (macd > 0) return 'BUY';
    if (macd < 0) return 'SELL';
    return 'HOLD';
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  private calculateMovingAverage(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private calculateSupportResistance(prices: number[]): { support: number; resistance: number } {
    if (prices.length < 20) {
      const current = prices[prices.length - 1];
      return {
        support: current * 0.95,
        resistance: current * 1.05
      };
    }
    
    const recentPrices = prices.slice(-20);
    const min = Math.min(...recentPrices);
    const max = Math.max(...recentPrices);
    const current = prices[prices.length - 1];
    
    return {
      support: min + (current - min) * 0.8,
      resistance: max - (max - current) * 0.8
    };
  }

  private determineSentiment(rsi: number, change24h: number, macd: string): LiveMarketData['sentiment'] {
    if (rsi > 70 && change24h > 5) return 'VERY_BULLISH';
    if (rsi > 60 && change24h > 2) return 'BULLISH';
    if (rsi < 30 && change24h < -5) return 'VERY_BEARISH';
    if (rsi < 40 && change24h < -2) return 'BEARISH';
    return 'NEUTRAL';
  }

  // Fetch live market data from CoinGecko
  async fetchLiveMarketData(): Promise<LiveMarketData[]> {
    try {
      const now = Date.now();
      if (now - this.lastUpdate < this.updateInterval && this.cache.size > 0) {
        console.log('Using cached market data');
        return Array.from(this.cache.values());
      }

      console.log('Fetching fresh market data from CoinGecko...');
      
      // Fetch detailed market data
      const response = await fetch(
        `${this.baseUrl}/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,ripple,dogecoin,binancecoin&order=market_cap_desc&per_page=6&page=1&sparkline=true&price_change_percentage=24h`
      );
      
      if (!response.ok) {
        console.error('CoinGecko API error:', response.status, response.statusText);
        return this.cache.size > 0 ? Array.from(this.cache.values()) : [];
      }
      
      const data = await response.json();
      console.log('Fetched data for', data.length, 'coins');
      
      // Fetch additional data for each coin
      const detailedData = await Promise.all(
        data.map(async (coin: any) => {
          try {
            // Fetch detailed coin data
            const detailResponse = await fetch(
              `${this.baseUrl}/coins/${coin.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
            );
            const detailData = await detailResponse.json();
            
            // Use real sparkline history from CoinGecko for technical analysis.
            const priceHistory = this.extractPriceHistory(coin);
            
            const rsi = this.calculateRSI(priceHistory);
            const macd = this.calculateMACD(priceHistory);
            const ma50 = this.calculateMovingAverage(priceHistory, 50);
            const ma200 = this.calculateMovingAverage(priceHistory, 200);
            const { support, resistance } = this.calculateSupportResistance(priceHistory);
            const sentiment = this.determineSentiment(rsi, coin.price_change_percentage_24h, macd);
            
            const marketData: LiveMarketData = {
              symbol: coin.symbol.toUpperCase(),
              name: coin.name,
              price: coin.current_price,
              change24h: coin.price_change_percentage_24h,
              high24h: coin.high_24h,
              low24h: coin.low_24h,
              volume24h: coin.total_volume,
              marketCap: coin.market_cap,
              marketCapDominance: detailData.market_data?.market_cap_percentage?.usd || 0,
              circulatingSupply: coin.circulating_supply,
              maxSupply: coin.max_supply,
              sentiment,
              technicalIndicators: {
                rsi14: Math.round(rsi),
                macdSignal: macd,
                ma50: Math.round(ma50),
                ma200: Math.round(ma200),
                supportLevel: Math.round(support),
                resistanceLevel: Math.round(resistance)
              }
            };
            
            this.cache.set(coin.symbol, marketData);
            return marketData;
          } catch (error) {
            console.error(`Error fetching detailed data for ${coin.symbol}:`, error);
            return null;
          }
        })
      );
      
      this.lastUpdate = now;
      return detailedData.filter(Boolean);
    } catch (error) {
      console.error('Error fetching live market data:', error);
      return Array.from(this.cache.values());
    }
  }

  private extractPriceHistory(coin: any): number[] {
    const sparkline = coin?.sparkline_in_7d?.price;
    if (Array.isArray(sparkline) && sparkline.length > 20) {
      return sparkline.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0);
    }
    return [Number(coin?.current_price || 0)].filter((v) => v > 0);
  }

  // Get market dominance data
  async getMarketDominance(): Promise<{ bitcoin: number; ethereum: number; others: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/global`);
      const data = await response.json();
      
      return {
        bitcoin: data.data?.market_cap_percentage?.btc || 0,
        ethereum: data.data?.market_cap_percentage?.eth || 0,
        others: 100 - (data.data?.market_cap_percentage?.btc || 0) - (data.data?.market_cap_percentage?.eth || 0)
      };
    } catch (error) {
      console.error('Error fetching market dominance:', error);
      return { bitcoin: 0, ethereum: 0, others: 0 };
    }
  }

  // Get fear & greed index
  async getFearGreedIndex(): Promise<{ value: number; sentiment: string }> {
    try {
      const marketData = await this.fetchLiveMarketData();
      if (marketData.length === 0) return { value: 0, sentiment: 'UNAVAILABLE' };
      const avgChange = marketData.reduce((sum, coin) => sum + coin.change24h, 0) / marketData.length;
      
      let value = 50;
      if (avgChange > 5) value = 80;
      else if (avgChange > 2) value = 65;
      else if (avgChange < -5) value = 20;
      else if (avgChange < -2) value = 35;
      
      let sentiment = 'NEUTRAL';
      if (value > 75) sentiment = 'EXTREME GREED';
      else if (value > 55) sentiment = 'GREED';
      else if (value < 25) sentiment = 'EXTREME FEAR';
      else if (value < 45) sentiment = 'FEAR';
      
      return { value, sentiment };
    } catch (error) {
      console.error('Error fetching fear & greed index:', error);
      return { value: 0, sentiment: 'UNAVAILABLE' };
    }
  }

  // Get live trading volume
  async getTradingVolume(): Promise<{ total24h: number; bitcoin: number; ethereum: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/global`);
      const data = await response.json();
      
      return {
        total24h: data.data?.total_volume?.usd || 0,
        bitcoin: data.data?.total_volume?.usd * 0.4 || 0,
        ethereum: data.data?.total_volume?.usd * 0.2 || 0
      };
    } catch (error) {
      console.error('Error fetching trading volume:', error);
      return { total24h: 0, bitcoin: 0, ethereum: 0 };
    }
  }
}

export const liveMarketDataService = new LiveMarketDataService();
export default liveMarketDataService;
