import React, { useState, useEffect } from 'react';
import { liveMarketDataService, LiveMarketData } from '../services/liveMarketData';

export const LiveMarketState: React.FC = () => {
  const [marketData, setMarketData] = useState<LiveMarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await liveMarketDataService.fetchLiveMarketData();
        setMarketData(data);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Error fetching market data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Update every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'VERY_BULLISH': return 'text-green-400 bg-green-500/20';
      case 'BULLISH': return 'text-green-300 bg-green-500/10';
      case 'NEUTRAL': return 'text-yellow-400 bg-yellow-500/20';
      case 'BEARISH': return 'text-red-300 bg-red-500/10';
      case 'VERY_BEARISH': return 'text-red-400 bg-red-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'VERY_BULLISH': return '🚀';
      case 'BULLISH': return '📈';
      case 'NEUTRAL': return '➡️';
      case 'BEARISH': return '📉';
      case 'VERY_BEARISH': return '🔻';
      default: return '❓';
    }
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
    return `$${num.toFixed(decimals)}`;
  };

  const formatSupply = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-800 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">CURRENT MARKET STATE - ALL COINS</h2>
        <div className="text-sm text-gray-400">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>

      <div className="space-y-6">
        {marketData.map((coin) => (
          <div key={coin.symbol} className="bg-gray-800 rounded-lg p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Basic Info */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-white">{coin.name} ({coin.symbol})</h3>
                  <div className="text-sm text-gray-400">
                    Market Cap Dominance: {coin.marketCapDominance.toFixed(1)}%
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-bold text-white">
                      {formatNumber(coin.price, coin.price < 1 ? 4 : 2)}
                    </span>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${
                      coin.change24h >= 0 ? 'text-green-400 bg-green-500/20' : 'text-red-400 bg-red-500/20'
                    }`}>
                      {coin.change24h >= 0 ? '↑' : '↓'} {Math.abs(coin.change24h).toFixed(2)}% (24h)
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400">24h High</div>
                      <div className="text-white font-mono">
                        {formatNumber(coin.high24h, coin.high24h < 1 ? 4 : 2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">24h Low</div>
                      <div className="text-white font-mono">
                        {formatNumber(coin.low24h, coin.low24h < 1 ? 4 : 2)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">24h Volume</div>
                    <div className="text-white font-mono">{formatNumber(coin.volume24h)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Market Cap</div>
                    <div className="text-white font-mono">{formatNumber(coin.marketCap)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">Circulating Supply</div>
                    <div className="text-white font-mono">{formatSupply(coin.circulatingSupply)} {coin.symbol}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Max Supply</div>
                    <div className="text-white font-mono">
                      {coin.maxSupply ? formatSupply(coin.maxSupply) : 'Unlimited'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Column - Sentiment & Technical */}
              <div className="space-y-4">
                <div>
                  <div className="text-gray-400 text-sm mb-2">Market Sentiment</div>
                  <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-bold ${getSentimentColor(coin.sentiment)}`}>
                    <span>{getSentimentIcon(coin.sentiment)}</span>
                    {coin.sentiment.replace('_', ' ')}
                  </div>
                </div>

                <div>
                  <div className="text-gray-400 text-sm mb-3">Technical Indicators</div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">RSI (14)</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono">{coin.technicalIndicators.rsi14}</span>
                        <div className={`w-16 h-2 rounded-full bg-gray-700`}>
                          <div 
                            className={`h-2 rounded-full ${
                              coin.technicalIndicators.rsi14 > 70 ? 'bg-red-500' :
                              coin.technicalIndicators.rsi14 < 30 ? 'bg-green-500' : 'bg-yellow-500'
                            }`}
                            style={{ width: `${coin.technicalIndicators.rsi14}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">MACD Signal</span>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        coin.technicalIndicators.macdSignal === 'BUY' ? 'bg-green-500/20 text-green-400' :
                        coin.technicalIndicators.macdSignal === 'SELL' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {coin.technicalIndicators.macdSignal}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">MA 50</span>
                      <span className="text-white font-mono">
                        {formatNumber(coin.technicalIndicators.ma50, coin.technicalIndicators.ma50 < 1 ? 4 : 2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">MA 200</span>
                      <span className="text-white font-mono">
                        {formatNumber(coin.technicalIndicators.ma200, coin.technicalIndicators.ma200 < 1 ? 4 : 2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Support/Resistance */}
              <div className="space-y-4">
                <div>
                  <div className="text-gray-400 text-sm mb-3">Support & Resistance</div>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-300">Support Level</span>
                        <span className="text-green-400 font-mono">
                          {formatNumber(coin.technicalIndicators.supportLevel, coin.technicalIndicators.supportLevel < 1 ? 4 : 2)}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-700 rounded-full">
                        <div 
                          className="h-2 bg-green-500 rounded-full"
                          style={{ 
                            width: `${Math.min(100, ((coin.price - coin.technicalIndicators.supportLevel) / (coin.technicalIndicators.resistanceLevel - coin.technicalIndicators.supportLevel)) * 100)}%` 
                          }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-300">Current Price</span>
                        <span className="text-white font-mono">
                          {formatNumber(coin.price, coin.price < 1 ? 4 : 2)}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-700 rounded-full">
                        <div 
                          className="h-2 bg-blue-500 rounded-full"
                          style={{ 
                            width: `${Math.min(100, ((coin.price - coin.technicalIndicators.supportLevel) / (coin.technicalIndicators.resistanceLevel - coin.technicalIndicators.supportLevel)) * 100)}%` 
                          }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-300">Resistance Level</span>
                        <span className="text-red-400 font-mono">
                          {formatNumber(coin.technicalIndicators.resistanceLevel, coin.technicalIndicators.resistanceLevel < 1 ? 4 : 2)}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-700 rounded-full">
                        <div 
                          className="h-2 bg-red-500 rounded-full"
                          style={{ width: '100%' }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-700">
                  <div className="text-gray-400 text-sm mb-2">Price Analysis</div>
                  <div className="text-sm text-gray-300">
                    {coin.price > coin.technicalIndicators.resistanceLevel ? (
                      <span className="text-green-400">Above resistance - Strong bullish momentum</span>
                    ) : coin.price < coin.technicalIndicators.supportLevel ? (
                      <span className="text-red-400">Below support - Bearish pressure</span>
                    ) : (
                      <span className="text-yellow-400">Trading in range - Consolidation phase</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveMarketState;
