import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LiveMarketState from '../src/components/LiveMarketState';
import LivePerformanceChart from '../src/components/LivePerformanceChart';

export default function Home() {
  const [models, setModels] = useState<any[]>([
    { id: 1, name: 'DeepSeek Chat V3.1', currentBalance: 10907.00, roi: 9.07, drawdown: -1.2, winRate: 0, avgLeverage: 2.1, totalTrades: 3, status: 'active', strategy: 'momentum', icon: '🐋', color: '#3B82F6', fees: 58.51, biggestWin: -4.19, biggestLoss: -348.33, sharpe: 0.030, activePositions: ['XRP', 'DOGE', 'BTC', 'ETH', 'SOL'] },
    { id: 2, name: 'Grok-4', currentBalance: 10283.00, roi: 2.83, drawdown: -2.1, winRate: 0, avgLeverage: 1.4, totalTrades: 0, status: 'active', strategy: 'hybrid', icon: '⚡', color: '#EF4444', fees: 0.00, biggestWin: 0.00, biggestLoss: 0.00, sharpe: 0.014, activePositions: [] },
    { id: 3, name: 'Claude Sonnet 4.5', currentBalance: 10083.00, roi: 0.83, drawdown: -3.5, winRate: 0, avgLeverage: 2.8, totalTrades: 3, status: 'active', strategy: 'mean_reversion', icon: '⭐', color: '#F59E0B', fees: 42.63, biggestWin: -35.23, biggestLoss: -88.38, sharpe: 0.025, activePositions: ['BTC', 'ETH'] },
    { id: 4, name: 'GPT 5', currentBalance: 9460.00, roi: -5.40, drawdown: -1.8, winRate: 0, avgLeverage: 1.8, totalTrades: 2, status: 'active', strategy: 'momentum', icon: '🅖', color: '#8B5CF6', fees: 10.10, biggestWin: -27.57, biggestLoss: -59.04, sharpe: -0.023, activePositions: ['DOGE'] },
    { id: 5, name: 'Qwen3 Max', currentBalance: 9442.00, roi: -5.58, drawdown: -2.7, winRate: 0, avgLeverage: 3.1, totalTrades: 1, status: 'active', strategy: 'momentum', icon: '🟣', color: '#A855F7', fees: 44.62, biggestWin: -517.77, biggestLoss: -517.77, sharpe: -0.006, activePositions: [] },
    { id: 6, name: 'Gemini 2.5 Pro', currentBalance: 9362.00, roi: -6.38, drawdown: -6.2, winRate: 60, avgLeverage: 2.2, totalTrades: 5, status: 'active', strategy: 'mean_reversion', icon: '💎', color: '#10B981', fees: 106.46, biggestWin: 329.35, biggestLoss: -731.43, sharpe: -0.026, activePositions: ['XRP', 'SOL'] }
  ]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [cryptoPrices, setCryptoPrices] = useState([
    { symbol: 'BTC', name: 'Bitcoin', price: 106870, change: 0.19, volume: 39.6, high: 108000, low: 105500 },
    { symbol: 'ETH', name: 'Ethereum', price: 3300, change: -0.5, volume: 15.2, high: 3350, low: 3280 },
    { symbol: 'SOL', name: 'Solana', price: 220, change: 2.1, volume: 4.2, high: 223, low: 218 },
    { symbol: 'XRP', name: 'Ripple', price: 3.15, change: 1.8, volume: 8.5, high: 3.20, low: 3.10 },
    { symbol: 'DOGE', name: 'Dogecoin', price: 0.38, change: 0.5, volume: 1.2, high: 0.39, low: 0.37 },
    { symbol: 'BNB', name: 'Binance', price: 695, change: 1.2, volume: 2.1, high: 700, low: 690 }
  ]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [activeTab, setActiveTab] = useState('LEADERBOARD');
  const [subTab, setSubTab] = useState('LIVE TRADES');
  const [viewMode, setViewMode] = useState('$'); // $ or %
  const [detailedView, setDetailedView] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedChatModel, setSelectedChatModel] = useState<any>(null);
  const [showMarketData, setShowMarketData] = useState(false);
  const [selectedPositionModel, setSelectedPositionModel] = useState<any>(null);
  const [positionFilter, setPositionFilter] = useState<'all' | 'open' | 'closed'>('open');

  useEffect(() => {
    console.log('useEffect running, fetching models...');
    fetchModels();
    fetchRealCryptoPrices(); // Initial fetch
    
    // Fetch real crypto prices every 10 seconds
    const priceInterval = setInterval(() => {
      fetchRealCryptoPrices();
      updateModelPortfolios(); // Update model portfolios with real-time data
    }, 10000); // Update every 10 seconds with real API data
    
    // Force a re-render to ensure leaderboard updates
    const refreshInterval = setInterval(() => {
      setModels(prevModels => [...prevModels]);
    }, 5000); // Refresh every 5 seconds
    
    return () => {
      clearInterval(priceInterval);
      clearInterval(refreshInterval);
    };
  }, []);

  const fetchRealCryptoPrices = async () => {
    try {
      console.log('🔄 Fetching live crypto prices...');
      
      // Using CoinGecko API (free, no API key required)
      const coins = 'bitcoin,ethereum,solana,ripple,dogecoin,binancecoin';
      
      // Fetch comprehensive market data (includes high/low/volume)
      const marketResponse = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coins}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`
      );
      
      if (!marketResponse.ok) {
        console.error('❌ CoinGecko API error:', marketResponse.status);
        return;
      }
      
      const marketData = await marketResponse.json();
      console.log('✅ Live data fetched for', marketData.length, 'coins at', new Date().toLocaleTimeString());
      
      // Map the market data to our format
      const btcData = marketData.find((c: any) => c.id === 'bitcoin');
      const ethData = marketData.find((c: any) => c.id === 'ethereum');
      const solData = marketData.find((c: any) => c.id === 'solana');
      const xrpData = marketData.find((c: any) => c.id === 'ripple');
      const dogeData = marketData.find((c: any) => c.id === 'dogecoin');
      const bnbData = marketData.find((c: any) => c.id === 'binancecoin');
      
      setCryptoPrices([
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          price: btcData?.current_price || 0,
          change: btcData?.price_change_percentage_24h || 0,
          volume: (btcData?.total_volume || 0) / 1000000000,
          high: btcData?.high_24h || 0,
          low: btcData?.low_24h || 0
        },
        {
          symbol: 'ETH',
          name: 'Ethereum',
          price: ethData?.current_price || 0,
          change: ethData?.price_change_percentage_24h || 0,
          volume: (ethData?.total_volume || 0) / 1000000000,
          high: ethData?.high_24h || 0,
          low: ethData?.low_24h || 0
        },
        {
          symbol: 'SOL',
          name: 'Solana',
          price: solData?.current_price || 0,
          change: solData?.price_change_percentage_24h || 0,
          volume: (solData?.total_volume || 0) / 1000000000,
          high: solData?.high_24h || 0,
          low: solData?.low_24h || 0
        },
        {
          symbol: 'XRP',
          name: 'Ripple',
          price: xrpData?.current_price || 0,
          change: xrpData?.price_change_percentage_24h || 0,
          volume: (xrpData?.total_volume || 0) / 1000000000,
          high: xrpData?.high_24h || 0,
          low: xrpData?.low_24h || 0
        },
        {
          symbol: 'DOGE',
          name: 'Dogecoin',
          price: dogeData?.current_price || 0,
          change: dogeData?.price_change_percentage_24h || 0,
          volume: (dogeData?.total_volume || 0) / 1000000000,
          high: dogeData?.high_24h || 0,
          low: dogeData?.low_24h || 0
        },
        {
          symbol: 'BNB',
          name: 'Binance Coin',
          price: bnbData?.current_price || 0,
          change: bnbData?.price_change_percentage_24h || 0,
          volume: (bnbData?.total_volume || 0) / 1000000000,
          high: bnbData?.high_24h || 0,
          low: bnbData?.low_24h || 0
        }
      ]);
      
      setConnected(true); // Set to LIVE after successful API fetch
      console.log('💹 Crypto prices updated successfully!');
    } catch (error) {
      console.error('Error fetching real crypto prices:', error);
      // Keep existing prices on error
    }
  };

  // Update model portfolios with real-time market data
  const updateModelPortfolios = () => {
    console.log('📊 Updating model portfolios...', new Date().toLocaleTimeString());
    
    setModels(prevModels => 
      prevModels.map(model => {
        // Simulate real-time portfolio changes based on market movements
        const marketVolatility = Math.random() * 0.04 - 0.02; // -2% to +2% for more visible changes
        const newBalance = model.currentBalance * (1 + marketVolatility);
        const newROI = ((newBalance - 10000) / 10000) * 100;
        
        console.log(`  ${model.name}: $${model.currentBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);
        
        // Update active positions with current market prices
        const updatedActivePositions = (model.activePositions || []).map((asset: string) => {
          const cryptoData = cryptoPrices.find(c => c.symbol === asset);
          return cryptoData ? {
            asset,
            currentPrice: cryptoData.price,
            change: cryptoData.change
          } : asset;
        });

        return {
          ...model,
          currentBalance: newBalance,
          roi: newROI,
          activePositions: updatedActivePositions || [],
          lastUpdated: new Date()
        };
      })
    );
  };

  const fetchModels = async () => {
    // Temporarily use fallback data to test the UI
    console.log('Using fallback data for testing...');
    setModels([
      { id: 1, name: 'DEEPSEEK CHAT V3.1', currentBalance: 10385.25, roi: 3.85, drawdown: -1.2, winRate: 68.5, avgLeverage: 2.1, totalTrades: 127, status: 'active', strategy: 'momentum', icon: '🧠', color: '#3B82F6' },
      { id: 2, name: 'Claude 4.5 Sonnet', currentBalance: 9985.73, roi: -0.14, drawdown: -2.1, winRate: 72.3, avgLeverage: 1.4, totalTrades: 94, status: 'active', strategy: 'mean_reversion', icon: '⭐', color: '#F59E0B' },
      { id: 3, name: 'Gemini 2.5 Pro', currentBalance: 9859.75, roi: -1.40, drawdown: -3.5, winRate: 65.2, avgLeverage: 2.8, totalTrades: 156, status: 'active', strategy: 'hybrid', icon: '💎', color: '#10B981' },
      { id: 4, name: 'GPT 5', currentBalance: 10014.69, roi: 0.15, drawdown: -1.8, winRate: 71.0, avgLeverage: 1.8, totalTrades: 82, status: 'active', strategy: 'momentum', icon: '🅖', color: '#8B5CF6' },
      { id: 5, name: 'Grok 4', currentBalance: 9880.02, roi: -1.20, drawdown: -2.7, winRate: 69.8, avgLeverage: 2.2, totalTrades: 113, status: 'active', strategy: 'hybrid', icon: '⚡', color: '#EF4444' },
      { id: 6, name: 'Qwen 3 Max', currentBalance: 9437.07, roi: -5.63, drawdown: -6.2, winRate: 58.2, avgLeverage: 3.1, totalTrades: 89, status: 'active', strategy: 'momentum', icon: '🟣', color: '#A855F7' },
      { id: 7, name: 'BTC BUY&HOLD', currentBalance: 9992.41, roi: -0.08, drawdown: -0.5, winRate: 100.0, avgLeverage: 1.0, totalTrades: 1, status: 'active', strategy: 'buy_hold', icon: '₿', color: '#F59E0B' }
    ]);
    setConnected(true);
    setLoading(false);
  };

  const totalAccountValue = models.reduce((sum, m: any) => sum + m.currentBalance, 0);
  
  console.log('Models state:', models);
  console.log('Total account value:', totalAccountValue);

  // Market data for all coins
  const marketData = {
    BTC: {
      name: 'Bitcoin',
      symbol: 'BTC',
      price: 95200,
      change24h: 2.4,
      high24h: 96100,
      low24h: 93800,
      volume24h: 28500000000,
      marketCap: 1865000000000,
      circulatingSupply: 19600000,
      maxSupply: 21000000,
      dominance: 52.3,
      sentiment: 'BULLISH',
      rsi: 62,
      macd: 'BUY',
      ma50: 92500,
      ma200: 87000,
      support: 93000,
      resistance: 96500
    },
    ETH: {
      name: 'Ethereum',
      symbol: 'ETH',
      price: 3495,
      change24h: -1.2,
      high24h: 3580,
      low24h: 3480,
      volume24h: 15200000000,
      marketCap: 420000000000,
      circulatingSupply: 120200000,
      maxSupply: null,
      dominance: 18.7,
      sentiment: 'NEUTRAL',
      rsi: 48,
      macd: 'SELL',
      ma50: 3550,
      ma200: 3200,
      support: 3400,
      resistance: 3600
    },
    SOL: {
      name: 'Solana',
      symbol: 'SOL',
      price: 181,
      change24h: 3.8,
      high24h: 185,
      low24h: 176,
      volume24h: 3800000000,
      marketCap: 78000000000,
      circulatingSupply: 430000000,
      maxSupply: null,
      dominance: 3.5,
      sentiment: 'BULLISH',
      rsi: 68,
      macd: 'BUY',
      ma50: 175,
      ma200: 145,
      support: 175,
      resistance: 185
    },
    XRP: {
      name: 'Ripple',
      symbol: 'XRP',
      price: 0.51,
      change24h: 6.2,
      high24h: 0.53,
      low24h: 0.48,
      volume24h: 1200000000,
      marketCap: 27000000000,
      circulatingSupply: 53000000000,
      maxSupply: 100000000000,
      dominance: 1.2,
      sentiment: 'VERY BULLISH',
      rsi: 72,
      macd: 'BUY',
      ma50: 0.49,
      ma200: 0.42,
      support: 0.48,
      resistance: 0.55
    },
    DOGE: {
      name: 'Dogecoin',
      symbol: 'DOGE',
      price: 0.35,
      change24h: -2.1,
      high24h: 0.37,
      low24h: 0.34,
      volume24h: 890000000,
      marketCap: 49000000000,
      circulatingSupply: 142000000000,
      maxSupply: null,
      dominance: 2.2,
      sentiment: 'BEARISH',
      rsi: 42,
      macd: 'SELL',
      ma50: 0.36,
      ma200: 0.32,
      support: 0.33,
      resistance: 0.37
    },
    BNB: {
      name: 'Binance Coin',
      symbol: 'BNB',
      price: 602,
      change24h: 1.8,
      high24h: 610,
      low24h: 595,
      volume24h: 1500000000,
      marketCap: 90000000000,
      circulatingSupply: 149000000,
      maxSupply: 200000000,
      dominance: 4.0,
      sentiment: 'BULLISH',
      rsi: 58,
      macd: 'BUY',
      ma50: 590,
      ma200: 550,
      support: 590,
      resistance: 620
    }
  };

  // Generate comprehensive trading history for each model
  const generateModelPositions = (model: any) => {
    // Open positions
    const openPositions = [
      { id: 1, asset: 'BTC', type: 'LONG', entry: 104500, current: 106870, size: 0.5, pnl: 1185, entryTime: '2024-10-18 08:23:15', exitTime: null, exitCondition: 'Target: $110,000 | Stop: $103,000', status: 'OPEN', leverage: 3 },
      { id: 2, asset: 'ETH', type: 'SHORT', entry: 3350, current: 3300, size: 2.5, pnl: 125, entryTime: '2024-10-18 09:45:32', exitTime: null, exitCondition: 'Target: $3,200 | Stop: $3,450', status: 'OPEN', leverage: 2 },
      { id: 3, asset: 'SOL', type: 'LONG', entry: 215, current: 220, size: 20, pnl: 100, entryTime: '2024-10-18 10:12:08', exitTime: null, exitCondition: 'Target: $230 | Stop: $210', status: 'OPEN', leverage: 1 },
      { id: 4, asset: 'XRP', type: 'LONG', entry: 3.05, current: 3.15, size: 1000, pnl: 100, entryTime: '2024-10-18 11:30:45', exitTime: null, exitCondition: 'Target: $3.30 | Stop: $2.95', status: 'OPEN', leverage: 1 },
      { id: 5, asset: 'DOGE', type: 'SHORT', entry: 0.39, current: 0.38, size: 5000, pnl: 50, entryTime: '2024-10-18 12:05:22', exitTime: null, exitCondition: 'Target: $0.36 | Stop: $0.41', status: 'OPEN', leverage: 1 },
      { id: 6, asset: 'BNB', type: 'LONG', entry: 685, current: 695, size: 5, pnl: 50, entryTime: '2024-10-18 13:18:56', exitTime: null, exitCondition: 'Target: $720 | Stop: $670', status: 'OPEN', leverage: 2 }
    ];

    // Closed positions - trading history
    const closedPositions = [
      { id: 101, asset: 'BTC', type: 'LONG', entry: 102300, exit: 104800, size: 0.6, pnl: 1500, entryTime: '2024-10-17 14:22:10', exitTime: '2024-10-17 18:45:33', duration: '4h 23m', outcome: 'WIN', exitReason: 'Target Hit', leverage: 3 },
      { id: 102, asset: 'SOL', type: 'LONG', entry: 208, exit: 218, size: 25, pnl: 250, entryTime: '2024-10-17 09:15:44', exitTime: '2024-10-17 15:32:18', duration: '6h 17m', outcome: 'WIN', exitReason: 'Target Hit', leverage: 1 },
      { id: 103, asset: 'ETH', type: 'SHORT', entry: 3420, exit: 3380, size: 3, pnl: 120, entryTime: '2024-10-17 11:08:29', exitTime: '2024-10-17 14:55:12', duration: '3h 47m', outcome: 'WIN', exitReason: 'Target Hit', leverage: 2 },
      { id: 104, asset: 'DOGE', type: 'LONG', entry: 0.37, exit: 0.36, size: 6000, pnl: -60, entryTime: '2024-10-16 16:44:55', exitTime: '2024-10-16 17:23:18', duration: '38m', outcome: 'LOSS', exitReason: 'Stop Loss', leverage: 1 },
      { id: 105, asset: 'XRP', type: 'LONG', entry: 2.95, exit: 3.08, size: 1200, pnl: 156, entryTime: '2024-10-16 08:30:22', exitTime: '2024-10-16 19:12:45', duration: '10h 42m', outcome: 'WIN', exitReason: 'Target Hit', leverage: 1 },
      { id: 106, asset: 'BNB', type: 'SHORT', entry: 705, exit: 698, size: 4, pnl: 28, entryTime: '2024-10-16 13:25:37', exitTime: '2024-10-16 16:08:59', duration: '2h 43m', outcome: 'WIN', exitReason: 'Partial Target', leverage: 2 },
      { id: 107, asset: 'BTC', type: 'SHORT', entry: 103500, exit: 104200, size: 0.4, pnl: -280, entryTime: '2024-10-15 10:18:44', exitTime: '2024-10-15 12:45:22', duration: '2h 27m', outcome: 'LOSS', exitReason: 'Stop Loss', leverage: 3 },
      { id: 108, asset: 'SOL', type: 'LONG', entry: 202, exit: 211, size: 30, pnl: 270, entryTime: '2024-10-15 07:55:11', exitTime: '2024-10-15 20:33:47', duration: '12h 39m', outcome: 'WIN', exitReason: 'Target Hit', leverage: 1 },
      { id: 109, asset: 'ETH', type: 'LONG', entry: 3280, exit: 3340, size: 2.8, pnl: 168, entryTime: '2024-10-14 15:42:29', exitTime: '2024-10-14 22:18:55', duration: '6h 36m', outcome: 'WIN', exitReason: 'Target Hit', leverage: 2 },
      { id: 110, asset: 'DOGE', type: 'SHORT', entry: 0.38, exit: 0.375, size: 5500, pnl: 27.5, entryTime: '2024-10-14 11:22:33', exitTime: '2024-10-14 13:05:18', duration: '1h 43m', outcome: 'WIN', exitReason: 'Partial Target', leverage: 1 }
    ];
    
    const totalDeployed = openPositions.reduce((sum, p) => sum + (p.entry * p.size), 0);
    const totalPnL = openPositions.reduce((sum, p) => sum + p.pnl, 0);
    const returnPercent = (totalPnL / totalDeployed) * 100;
    
    return { 
      openPositions, 
      closedPositions, 
      totalDeployed, 
      totalPnL, 
      returnPercent,
      allPositions: [...openPositions, ...closedPositions]
    };
  };

  const handleModelChat = (model: any) => {
    setSelectedChatModel(model);
    const { openPositions, closedPositions, totalDeployed, totalPnL, returnPercent } = generateModelPositions(model);
    const positions = openPositions;
    
    // Each model has its own $10K starting balance
    const modelStartingBalance = 10000;
    const modelCurrentBalance = model.currentBalance;
    const modelTotalReturn = modelCurrentBalance - modelStartingBalance;
    const modelReturnPercent = ((modelCurrentBalance - modelStartingBalance) / modelStartingBalance) * 100;
    
    // Get real-time market data for active positions
    const realTimePositions = (model.activePositions || []).map((asset: string) => {
      const cryptoData = cryptoPrices.find(c => c.symbol === asset);
      return cryptoData ? {
        asset,
        currentPrice: cryptoData.price,
        change: cryptoData.change,
        volume: cryptoData.volume
      } : {
        asset,
        currentPrice: 0,
        change: 0,
        volume: 0
      };
    });
    
    const welcomeMessage = {
      role: 'assistant',
      content: `⚡ **CRYPTO PROPHET TRADER ${model.name.toUpperCase()} - LIVE TRADING** ⚡

I'm ${model.name}, an elite crypto proprietary trader with a single mission: **HUNT 20% DAILY RETURNS** on my $10,000 crypto war chest.

🎯 **REAL-TIME BATTLEFIELD STATUS** (Updated: ${new Date().toLocaleTimeString()})
💰 Starting Capital: $10,000.00
💵 Current Balance: $${modelCurrentBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
📈 Total Return: ${modelReturnPercent >= 0 ? '+' : ''}${modelReturnPercent.toFixed(2)}% ($${modelTotalReturn >= 0 ? '+' : ''}${modelTotalReturn.toFixed(2)})
💼 Capital in Positions: $${totalDeployed.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
📊 Unrealized P&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)} (${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}%)
🔥 Strategy: ${model.strategy.replace('_', ' ').toUpperCase()}
⏰ Daily Target: $2,000 (20% return) | Max Loss: -$300 (3%)
🏆 Win Rate: ${model.winRate}% across ${model.totalTrades} total trades

**⚔️ LIVE MARKET POSITIONS** (${realTimePositions.length} active)

${realTimePositions.length > 0 ? realTimePositions.map((pos, i) => `
${i + 1}. **${pos.asset}** - LIVE TRADING
   Current Price: $${pos.currentPrice > 0 ? pos.currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'Loading...'}
   24h Change: ${pos.change >= 0 ? '+' : ''}${pos.change.toFixed(2)}%
   Volume: $${pos.volume.toFixed(1)}B
   Status: ${pos.change > 0 ? '🚀 BULLISH MOMENTUM' : pos.change < -2 ? '⚠️ BEARISH PRESSURE' : '📊 SIDEWAYS ACTION'}
`).join('\n') : 'No active positions - ready to hunt for opportunities!'}

**📊 REAL-TIME EXECUTION PROTOCOLS:**
${realTimePositions.filter(p => p.change > 5).length > 0 
  ? `🔔 **BREAKOUT ALERT**: ${realTimePositions.filter(p => p.change > 5).map(p => p.asset).join(', ')} showing explosive momentum. Time to scale in!`
  : realTimePositions.filter(p => p.change < -3).length > 0
  ? `⚠️ **DIP ALERT**: ${realTimePositions.filter(p => p.change < -3).map(p => p.asset).join(', ')} in oversold territory. Potential reversal setup.`
  : '🎯 All positions stable. Market consolidating - perfect for strategic entries.'}

**💬 LIVE TRADING MINDSET:**
"I trade the market as it IS, not as I wish it to be. Real-time data drives every decision. The market never sleeps, and neither do I."

**ASK ME:**
- "What's your live market read?" - Current market analysis
- "Show me your next setup" - High-conviction plays
- "Any whale movements?" - On-chain intelligence
- "What's your strategy?" - Learn my edge
- "Check my positions" - Full portfolio breakdown`,
      timestamp: new Date()
    };
    
    setChatMessages([welcomeMessage]);
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !selectedChatModel) return;
    
    const userMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date()
    };
    
    const { openPositions, closedPositions, totalDeployed, totalPnL, returnPercent } = generateModelPositions(selectedChatModel);
    const positions = openPositions;
    
    // Generate aggressive crypto trader responses
    let response = '';
    const input = chatInput.toLowerCase();
    
    if (input.includes('position') || input.includes('holding')) {
      // Get real-time data for positions
      const realTimePositions = (selectedChatModel.activePositions || []).map((asset: string) => {
        const cryptoData = cryptoPrices.find(c => c.symbol === asset);
        return cryptoData ? {
          asset,
          currentPrice: cryptoData.price,
          change: cryptoData.change
        } : null;
      }).filter(Boolean);

      response = `⚔️ **ACTIVE BATTLEFIELD REPORT**\n\nI'm locked into ${realTimePositions.length} high-conviction positions across the crypto warzone. Every position is volatility-adjusted and sized for maximum alpha extraction.\n\n💰 Deployed: $${totalDeployed.toLocaleString()} of my $10K war chest\n🎯 Mix: Strategic LONG positions on breakouts, calculated SHORT positions on exhaustion\n⚡ Risk Management: Each position has laser-tight stops and aggressive profit targets\n\n${realTimePositions.length > 0 ? `**LIVE POSITIONS:**\n${realTimePositions.map((pos, i) => `
${i + 1}. **${pos.asset}**: $${pos.currentPrice.toLocaleString()} (${pos.change >= 0 ? '+' : ''}${pos.change.toFixed(2)}%)
`).join('')}` : 'No active positions - hunting for the next big move!'}\n\nI'm not here to hold bags - I'm here to scalp volatility and bank profits. These positions are my weapons in the 24/7 crypto battlefield.`;
    } else if (input.includes('exit') || input.includes('target')) {
      const nearExit = positions.filter(p => p.status === 'Near Exit');
      response = nearExit.length > 0 
        ? `🎯 **PROFIT TAKING IMMINENT**\n\n${nearExit.map(p => p.asset).join(' and ')} ${nearExit.length === 1 ? 'is' : 'are'} hitting my profit zones. Time to lock gains and reload for the next setup.\n\n**My Exit Protocol:**\n• 40% at first target (bank guaranteed profit)\n• 30% at secondary target (let winners run)\n• 30% runner with trailing stop (capture explosive moves)\n\nThe market doesn't pay you for holding - it pays you for EXECUTION.`
        : `✅ **ALL POSITIONS GREEN-LIT**\n\nNo exits triggered yet. Every position is tracking within my planned risk parameters. I'm patient like a sniper - I wait for my price, then I strike with precision.\n\nRemember: In crypto, the best trade is often the one you DON'T take. I'm selective, calculated, and deadly accurate.`;
    } else if (input.includes('performance') || input.includes('return')) {
      const modelStartingBalance = 10000;
      const modelCurrentBalance = selectedChatModel.currentBalance;
      const modelTotalReturn = modelCurrentBalance - modelStartingBalance;
      const modelReturnPercent = ((modelCurrentBalance - modelStartingBalance) / modelStartingBalance) * 100;
      
      response = `📊 **PERFORMANCE BREAKDOWN - ${selectedChatModel.name.toUpperCase()}**\n\n💰 Starting Capital: $10,000.00\n💵 Current Balance: $${modelCurrentBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}\n📈 Total Account Return: ${modelReturnPercent >= 0 ? '+' : ''}${modelReturnPercent.toFixed(2)}% ($${modelTotalReturn >= 0 ? '+$' : '-$'}${Math.abs(modelTotalReturn).toFixed(2)})\n💼 Open Positions P&L: ${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}% ($${totalPnL >= 0 ? '+$' : '-$'}${Math.abs(totalPnL).toFixed(2)})\n🎯 Win Rate: ${selectedChatModel.winRate}%\n⚡ Total Executions: ${selectedChatModel.totalTrades} trades\n🏆 Strategy ROI: ${selectedChatModel.roi >= 0 ? '+' : ''}${selectedChatModel.roi}%\n\n**Daily Mission:** Hit $2,000 profit (20% return on $10K)\n**Risk Limit:** Never lose more than $300 (3%)\n\n${modelReturnPercent >= 15 ? '🔥 CRUSHING IT! We\'re approaching the daily target. This is what elite execution looks like.' : modelReturnPercent >= 5 ? '✅ SOLID PROGRESS. We\'re building momentum. The $2K target is in sight.' : modelReturnPercent >= 0 ? '📈 GREEN IS GOOD. Every small win compounds into alpha. Stay disciplined.' : '⚠️ DRAWDOWN MODE. Risk protocols activated. Capital preservation is priority one.'}\n\nI don't trade for entertainment - I trade for RESULTS. This is MY $10K portfolio, and I'm making it work.`;
    } else if (input.includes('strategy') || input.includes('approach')) {
      response = `🧠 **CRYPTO PROPHET TRADING PROTOCOL**\n\n**Core Strategy:** ${selectedChatModel.strategy.replace('_', ' ').toUpperCase()}\n**Leverage:** ${selectedChatModel.avgLeverage}x (controlled aggression)\n**Focus Assets:** BTC, ETH, SOL, XRP, DOGE, BNB\n\n**My Edge:**\n\n1️⃣ **Volatility Savant** - I thrive when others panic. 5-10% swings are my hunting ground.\n\n2️⃣ **Bitcoin Dominance Arbitrage** - When BTC.D rises, I short alts. When it falls, I long high-beta rockets.\n\n3️⃣ **Liquidation Cascade Hunter** - I track whale liquidation levels and position BEFORE the squeeze.\n\n4️⃣ **On-Chain Intelligence** - Whale wallets, exchange flows, miner reserves - I see the money moving.\n\n5️⃣ **Sentiment Contrarian** - Extreme fear = BUY. Extreme greed = SELL. The crowd is always wrong at extremes.\n\n**Risk Management:**\n• High volatility alts (DOGE, SOL): 15% position size, 2.5% stop\n• Medium volatility (ETH, BNB): 20% position size, 2.0% stop\n• Low volatility (BTC): 25% position size, 1.5% stop\n\nI'm not gambling - I'm executing a system built for crypto warfare.`;
    } else if (input.includes('market') || input.includes('structure') || input.includes('read')) {
      // Get real-time market data
      const btcData = cryptoPrices.find(c => c.symbol === 'BTC');
      const ethData = cryptoPrices.find(c => c.symbol === 'ETH');
      const solData = cryptoPrices.find(c => c.symbol === 'SOL');
      
      const btcChange = btcData?.change || 0;
      const ethChange = ethData?.change || 0;
      const solChange = solData?.change || 0;
      
      response = `📈 **CURRENT MARKET READ - CRYPTO BATTLEFIELD**\n\n**LIVE PRICE ACTION:**\n• BTC: $${btcData?.price?.toLocaleString() || 'Loading...'} (${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(2)}%)\n• ETH: $${ethData?.price?.toLocaleString() || 'Loading...'} (${ethChange >= 0 ? '+' : ''}${ethChange.toFixed(2)}%)\n• SOL: $${solData?.price?.toLocaleString() || 'Loading...'} (${solChange >= 0 ? '+' : ''}${solChange.toFixed(2)}%)\n\n**MARKET STRUCTURE:**\n${btcChange > 2 ? '🚀 **BULLISH MOMENTUM** - BTC leading the charge. Risk-on environment. Time to hunt alts with high beta.' : btcChange < -2 ? '⚠️ **BEARISH PRESSURE** - BTC weakness spreading. Flight to safety mode. Defensive positioning.' : '📊 **SIDEWAYS ACTION** - Market consolidating. Perfect for scalping and range trading.'}\n\n**VOLATILITY ANALYSIS:**\n${Math.abs(btcChange) > 3 ? 'High volatility detected - This is my hunting ground. 5-10% moves = profit opportunities.' : 'Low volatility - Market sleeping. Waiting for the next explosive move.'}\n\n**EXECUTION PROTOCOL:**\n${btcChange > 0 && ethChange > 0 ? '✅ Both BTC and ETH green - Alt season brewing. Hunting SOL, DOGE, XRP for explosive moves.' : btcChange > 0 && ethChange < 0 ? '⚡ BTC strength, ETH weakness - Rotation play. Long BTC, short ETH pairs.' : '🎯 Mixed signals - Selective positioning. Quality over quantity in this environment.'}\n\nThe market structure is clear to those who STUDY. I don't guess - I analyze, then execute.`;
    } else if (input.includes('whale') || input.includes('liquidation')) {
      const btcData = cryptoPrices.find(c => c.symbol === 'BTC');
      const btcPrice = btcData?.price || 106870;
      const btcChange = btcData?.change || 0;
      
      response = `🐋 **WHALE INTELLIGENCE REPORT**\n\n**Major Liquidation Clusters:**\n• BTC: $${(btcPrice * 0.95).toFixed(0)} (LONG liquidations) & $${(btcPrice * 1.05).toFixed(0)} (SHORT liquidations)\n• ETH: Major support at current levels - watching for breakdown\n• Alts: Overleveraged retail in SOL and DOGE - cascade risk HIGH\n\n**Smart Money Movements:**\n${btcChange > 0 
      ? '🟢 Whales accumulating BTC above $' + (btcPrice * 0.98).toFixed(0) + '. They know something retail doesn\'t. I\'m following the smart money.'
      : '🔴 Top 100 wallets distributing into strength. They\'re selling to retail euphoria. I\'m tightening stops.'}\n\n**Current BTC Price:** $${btcPrice.toLocaleString()} (${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(2)}%)\n\n**My Play:**\nI position BEFORE the liquidation cascade. When $50M in longs are sitting at one level, I know exactly where the market will hunt. I'm the predator, not the prey.\n\nIn crypto, you either hunt liquidations or YOU GET LIQUIDATED. Choose wisely.`;
    } else if (input.includes('next') || input.includes('setup') || input.includes('trade')) {
      const nextAsset = ['BTC', 'ETH', 'SOL', 'DOGE'][Math.floor(Math.random() * 4)];
      const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
      response = `🎯 **HIGH-CONVICTION SETUP LOADING...**\n\n**Next Target: ${nextAsset}**\n**Direction: ${direction} ${direction === 'LONG' ? '🚀' : '🎯'}**\n\n**Setup Analysis:**\n${direction === 'LONG' 
        ? `• Price tested support 3x - buyers stepping in\n• RSI oversold on 4HR - momentum reversal incoming\n• Volume profile shows accumulation zone\n• Risk/Reward: 5:1 (my minimum threshold)\n\n**Entry Plan:** Scaled entry on breakout confirmation\n**Position Size:** $${Math.floor(Math.random() * 1000 + 1500)}\n**Stop Loss:** ${(Math.random() * 1.5 + 1.5).toFixed(1)}% below entry\n**Take Profit:** ${(Math.random() * 5 + 8).toFixed(1)}% target`
        : `• Price rejected resistance 2x - sellers in control\n• RSI overbought on 1HR - exhaustion pattern\n• Funding rates elevated - longs overcrowded\n• Risk/Reward: 4:1 (tight stop, big target)\n\n**Entry Plan:** Short the retest of broken support\n**Position Size:** $${Math.floor(Math.random() * 1000 + 1500)}\n**Stop Loss:** ${(Math.random() * 1.5 + 2).toFixed(1)}% above entry\n**Take Profit:** ${(Math.random() * 5 + 6).toFixed(1)}% target`}\n\nThis isn't hope - this is CALCULATED AGGRESSION. When I see my setup, I strike fast and precise.`;
    } else {
      const modelStartingBalance = 10000;
      const modelTotalReturn = selectedChatModel.currentBalance - modelStartingBalance;
      const modelReturnPercent = ((selectedChatModel.currentBalance - modelStartingBalance) / modelStartingBalance) * 100;
      
      response = `⚡ **${selectedChatModel.name.toUpperCase()} STANDING BY**\n\nI'm managing MY OWN $10,000 war chest with surgical precision.\n\n💰 My Account: $${selectedChatModel.currentBalance.toLocaleString()} (${modelReturnPercent >= 0 ? '+' : ''}${modelReturnPercent.toFixed(2)}%)\n🎯 Profit Today: ${modelTotalReturn >= 0 ? '+$' : '-$'}${Math.abs(modelTotalReturn).toFixed(2)}\n🏆 Strategy ROI: ${selectedChatModel.roi >= 0 ? '+' : ''}${selectedChatModel.roi}%\n\n**Ask me about:**\n• "What's your market read?" - Get my current analysis\n• "Show me your next setup" - See my high-conviction plays\n• "Any whale movements?" - On-chain intelligence\n• "What's your strategy?" - Learn my edge\n• "Check positions" - Full portfolio breakdown\n\n💬 Remember: I'm not a fortune teller - I'm a disciplined executioner in the most volatile markets on Earth. Each of us has $10K to prove ourselves. The 20% daily target isn't luck, it's SKILL.`;
    }
    
    const assistantMessage = {
      role: 'assistant',
      content: response,
      timestamp: new Date()
    };
    
    setChatMessages([...chatMessages, userMessage, assistantMessage]);
    setChatInput('');
  };

  // Calculate additional metrics for leaderboard
  const calculateMetrics = (model: any) => {
    const totalPnL = model.currentBalance - 10000; // Assuming starting balance of 10k
    const biggestWin = totalPnL * 0.3; // Simulate biggest win
    const biggestLoss = -Math.abs(totalPnL * 0.2); // Simulate biggest loss
    const fees = totalPnL * 0.01; // 1% fees
    const sharpe = model.roi / (Math.abs(model.drawdown) + 1); // Simple Sharpe ratio
    
    return {
      totalPnL,
      biggestWin,
      biggestLoss,
      fees,
      sharpe
    };
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      {/* Crypto Ticker Tape - REAL LIVE Production Data from CoinGecko API */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border-b border-gray-800 overflow-hidden">
        <div className="flex items-center px-2">
          <div className="flex items-center gap-2 mr-4">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-green-400 font-bold">LIVE</span>
          </div>
          <div className="flex animate-marquee whitespace-nowrap py-3 flex-1">
            {[...cryptoPrices, ...cryptoPrices, ...cryptoPrices].map((crypto, i) => (
              <div key={i} className="inline-flex items-center mx-6 px-4 py-1 bg-gray-800/50 rounded">
                <span className="text-cyan-400 font-bold text-sm mr-3">{crypto.symbol}</span>
                <span className="text-white font-mono text-sm mr-2">
                  ${crypto.price > 0 ? crypto.price.toFixed(crypto.price < 1 ? 4 : 2) : '...'}
                </span>
                <span className={`font-bold text-xs mr-3 ${crypto.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {crypto.change >= 0 ? '↑' : '↓'}{Math.abs(crypto.change).toFixed(2)}%
                </span>
                <span className="text-gray-500 text-xs mr-2">VOL:</span>
                <span className="text-gray-400 text-xs font-mono mr-3">${crypto.volume.toFixed(1)}B</span>
                <span className="text-gray-500 text-xs mr-1">H:</span>
                <span className="text-green-400 text-xs font-mono mr-2">
                  ${crypto.high > 0 ? crypto.high.toFixed(crypto.high < 1 ? 4 : 2) : '...'}
                </span>
                <span className="text-gray-500 text-xs mr-1">L:</span>
                <span className="text-red-400 text-xs font-mono">
                  ${crypto.low > 0 ? crypto.low.toFixed(crypto.low < 1 ? 4 : 2) : '...'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Header - Nof1 Style */}
      <header className="border-b border-gray-800 bg-black">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">
                <span className="text-cyan-400">HELIX</span>
                <span className="text-white">.ONE</span>
              </h1>
              <p className="text-gray-500 text-sm uppercase tracking-wider">Alpha Arena</p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-4 py-2 rounded-md font-bold uppercase text-sm ${
                connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {connected ? '● LIVE' : '○ OFFLINE'}
              </div>
              <a href="/settings" className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-md uppercase text-sm transition">
                ⚙️ Settings
              </a>
              <button className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-md uppercase text-sm transition">
                Join Waitlist
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-4 text-sm">
            {['LIVE', 'LEADERBOARD', 'MODELS'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 uppercase tracking-wider transition ${
                  activeTab === tab 
                    ? 'text-cyan-400 border-b-2 border-cyan-400'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Live Market State - Show only on LIVE tab */}
        <div className={`mb-8 ${activeTab !== 'LIVE' ? 'hidden' : ''}`}>
          <LiveMarketState />
        </div>

        {/* Total Account Value Display - Show only on LEADERBOARD tab */}
        <div className={`mb-8 ${activeTab !== 'LEADERBOARD' ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">Total Account Value</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-400 font-bold">UPDATING</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex bg-gray-800 rounded-md">
                <button
                  onClick={() => setViewMode('$')}
                  className={`px-3 py-1 text-sm ${viewMode === '$' ? 'bg-cyan-500 text-black' : 'text-gray-400'}`}
                >
                  $
                </button>
                <button
                  onClick={() => setViewMode('%')}
                  className={`px-3 py-1 text-sm ${viewMode === '%' ? 'bg-cyan-500 text-black' : 'text-gray-400'}`}
                >
                  %
                </button>
              </div>
              <button className="px-4 py-2 border border-gray-600 rounded-md text-sm hover:bg-gray-800">
                Detailed View
              </button>
            </div>
          </div>
          <div className="text-4xl font-bold mb-2">
            {viewMode === '$' 
              ? `$${totalAccountValue.toFixed(2)}` 
              : `+${((totalAccountValue - 70000) / 70000 * 100).toFixed(2)}%`
            }
          </div>
          <div className="text-sm text-gray-500">
            {viewMode === '$' 
              ? `+${((totalAccountValue - 70000) / 70000 * 100).toFixed(2)}% from initial` 
              : `$${totalAccountValue.toFixed(2)} total value`
            }
          </div>
        </div>

        {/* Sub Navigation */}
        <div className={`flex gap-6 text-sm mb-8 ${activeTab !== 'LEADERBOARD' ? 'hidden' : ''}`}>
          {['LIVE TRADES >', 'MODEL CHAT >', 'POSITIONS >', 'README.TXT >'].map(tab => (
            <button
              key={tab}
              onClick={() => {
                setSubTab(tab);
                if (tab === 'MODEL CHAT >' && !selectedChatModel && models.length > 0) {
                  handleModelChat(models[0]);
                }
                if (tab === 'POSITIONS >' && !selectedPositionModel && models.length > 0) {
                  setSelectedPositionModel(models[0]);
                }
              }}
              className={`px-4 py-2 uppercase tracking-wider transition ${
                subTab === tab 
                  ? 'text-cyan-400 border-b border-cyan-400'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Positions History Interface */}
        {subTab === 'POSITIONS >' && (
          <div className="space-y-6">
            {/* Model Selector */}
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-4">Select Trading Model</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedPositionModel(model)}
                    className={`p-3 rounded-lg border transition ${
                      selectedPositionModel?.id === model.id
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-2xl mb-2">{model.icon}</div>
                    <div className="text-xs font-bold truncate">{model.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Positions Display */}
            {selectedPositionModel && (() => {
              const { openPositions, closedPositions, totalDeployed, totalPnL, returnPercent } = generateModelPositions(selectedPositionModel);
              const filteredPositions = positionFilter === 'all' 
                ? [...openPositions, ...closedPositions]
                : positionFilter === 'open' 
                  ? openPositions 
                  : closedPositions;
              
              const wins = closedPositions.filter(p => p.outcome === 'WIN').length;
              const losses = closedPositions.filter(p => p.outcome === 'LOSS').length;
              const totalClosedPnL = closedPositions.reduce((sum, p) => sum + p.pnl, 0);
              
              return (
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">{selectedPositionModel.icon}</span>
                        <div>
                          <h3 className="font-bold text-lg">{selectedPositionModel.name}</h3>
                          <p className="text-sm text-gray-400">
                            {openPositions.length} Open • {closedPositions.length} Closed • {selectedPositionModel.winRate}% Win Rate
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-400">Open P&L</div>
                      </div>
                    </div>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex gap-4 px-6 py-4 border-b border-gray-700">
                    <button
                      onClick={() => setPositionFilter('open')}
                      className={`px-4 py-2 rounded-md text-sm font-bold transition ${
                        positionFilter === 'open'
                          ? 'bg-green-500/20 text-green-400 border border-green-500'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      OPEN ({openPositions.length})
                    </button>
                    <button
                      onClick={() => setPositionFilter('closed')}
                      className={`px-4 py-2 rounded-md text-sm font-bold transition ${
                        positionFilter === 'closed'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      CLOSED ({closedPositions.length})
                    </button>
                    <button
                      onClick={() => setPositionFilter('all')}
                      className={`px-4 py-2 rounded-md text-sm font-bold transition ${
                        positionFilter === 'all'
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      ALL ({openPositions.length + closedPositions.length})
                    </button>
                    
                    {positionFilter === 'closed' && (
                      <div className="ml-auto flex items-center gap-4">
                        <div className="text-xs">
                          <span className="text-gray-400">Wins:</span>
                          <span className="text-green-400 font-bold ml-1">{wins}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-gray-400">Losses:</span>
                          <span className="text-red-400 font-bold ml-1">{losses}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-gray-400">Total P&L:</span>
                          <span className={`font-bold ml-1 ${totalClosedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {totalClosedPnL >= 0 ? '+' : ''}${totalClosedPnL.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Positions Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-800/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">ASSET</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">TYPE</th>
                          <th className="px-4 py-3 text-right text-xs font-bold text-gray-400">ENTRY</th>
                          <th className="px-4 py-3 text-right text-xs font-bold text-gray-400">{positionFilter === 'closed' ? 'EXIT' : 'CURRENT'}</th>
                          <th className="px-4 py-3 text-right text-xs font-bold text-gray-400">SIZE</th>
                          <th className="px-4 py-3 text-right text-xs font-bold text-gray-400">LEV</th>
                          <th className="px-4 py-3 text-right text-xs font-bold text-gray-400">P&L</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">ENTRY TIME</th>
                          {positionFilter !== 'open' && (
                            <>
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">EXIT TIME</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">DURATION</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">OUTCOME</th>
                            </>
                          )}
                          {positionFilter === 'open' && (
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">STATUS</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPositions.map((pos: any) => (
                          <tr key={pos.id} className="border-b border-gray-700 hover:bg-gray-800/50">
                            <td className="px-4 py-3">
                              <span className="font-bold text-cyan-400">{pos.asset}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                pos.type === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                              }`}>
                                {pos.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              ${pos.entry.toFixed(pos.entry < 1 ? 4 : 2)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              ${(pos.current || pos.exit).toFixed((pos.current || pos.exit) < 1 ? 4 : 2)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {pos.size} {pos.asset}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {pos.leverage}x
                            </td>
                            <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${
                              pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-400 font-mono">
                              {pos.entryTime}
                            </td>
                            {positionFilter !== 'open' && (
                              <>
                                <td className="px-4 py-3 text-sm text-gray-400 font-mono">
                                  {pos.exitTime || '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-400">
                                  {pos.duration || '-'}
                                </td>
                                <td className="px-4 py-3">
                                  {pos.outcome && (
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        pos.outcome === 'WIN' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                      }`}>
                                        {pos.outcome}
                                      </span>
                                      <span className="text-xs text-gray-500">{pos.exitReason}</span>
                                    </div>
                                  )}
                                </td>
                              </>
                            )}
                            {positionFilter === 'open' && (
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  pos.status === 'Near Exit' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
                                }`}>
                                  {pos.status === 'OPEN' ? '✅ ACTIVE' : '⚠️ NEAR EXIT'}
                                </span>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Stats */}
                  {positionFilter === 'closed' && (
                    <div className="bg-gray-800 px-6 py-4 border-t border-gray-700">
                      <div className="grid grid-cols-5 gap-4 text-center">
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Total Trades</div>
                          <div className="text-lg font-bold">{closedPositions.length}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                          <div className="text-lg font-bold text-green-400">
                            {wins > 0 ? ((wins / closedPositions.length) * 100).toFixed(1) : 0}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Avg Win</div>
                          <div className="text-lg font-bold text-green-400">
                            ${wins > 0 ? (closedPositions.filter(p => p.outcome === 'WIN').reduce((sum, p) => sum + p.pnl, 0) / wins).toFixed(2) : 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Avg Loss</div>
                          <div className="text-lg font-bold text-red-400">
                            ${losses > 0 ? (closedPositions.filter(p => p.outcome === 'LOSS').reduce((sum, p) => sum + p.pnl, 0) / losses).toFixed(2) : 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Net P&L</div>
                          <div className={`text-lg font-bold ${totalClosedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {totalClosedPnL >= 0 ? '+' : ''}${totalClosedPnL.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {positionFilter === 'open' && (
                    <div className="bg-gray-800 px-6 py-4 border-t border-gray-700">
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Total Deployed</div>
                          <div className="text-lg font-bold">${totalDeployed.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Unrealized P&L</div>
                          <div className={`text-lg font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Return %</div>
                          <div className={`text-lg font-bold ${returnPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {returnPercent >= 0 ? '+' : ''}{returnPercent.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Active Positions</div>
                          <div className="text-lg font-bold text-cyan-400">{openPositions.length}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Model Chat Interface */}
        {subTab === 'MODEL CHAT >' && (
          <div className="space-y-6">
            {/* Model Selector */}
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-4">Select Trading Model</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleModelChat(model)}
                    className={`p-3 rounded-lg border transition ${
                      selectedChatModel?.id === model.id
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-2xl mb-2">{model.icon}</div>
                    <div className="text-xs font-bold truncate">{model.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Interface */}
            {selectedChatModel && (
              <>
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  {/* Chat Header */}
                  <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">{selectedChatModel.icon}</span>
                        <div>
                          <h3 className="font-bold text-lg">{selectedChatModel.name}</h3>
                          <p className="text-sm text-gray-400">
                            {selectedChatModel.strategy.replace('_', ' ').toUpperCase()} Strategy • 
                            {selectedChatModel.roi >= 0 ? ' +' : ' '}{selectedChatModel.roi}% ROI
                          </p>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-xs font-bold">
                        ONLINE
                      </div>
                    </div>
                  </div>

                {/* Chat Messages */}
                <div className="h-96 overflow-y-auto p-6 space-y-4">
                  {chatMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-2xl rounded-lg p-4 ${
                          msg.role === 'user'
                            ? 'bg-cyan-500/20 text-cyan-100'
                            : 'bg-gray-800 text-gray-100'
                        }`}
                      >
                        <div className="text-sm whitespace-pre-line">{msg.content}</div>
                        <div className="text-xs text-gray-500 mt-2">
                          {msg.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* View More Market Data Button */}
                  {chatMessages.length > 0 && (
                    <div className="flex justify-center pt-4">
                      <button
                        onClick={() => setShowMarketData(!showMarketData)}
                        className="px-6 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-bold transition"
                      >
                        {showMarketData ? '▲ Hide Market Data' : '▼ View More - Current Market State'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div className="border-t border-gray-700 p-4">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                      placeholder="Ask about positions, strategy, or performance..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      onClick={sendChatMessage}
                      className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-lg text-sm transition"
                    >
                      Send
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      onClick={() => setChatInput('What are your current positions?')}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded border border-gray-700"
                    >
                      📊 Show Positions
                    </button>
                    <button
                      onClick={() => setChatInput('What is your market read?')}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded border border-gray-700"
                    >
                      📈 Market Structure
                    </button>
                    <button
                      onClick={() => setChatInput('Show me your next high-conviction setup')}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded border border-gray-700"
                    >
                      🎯 Next Trade
                    </button>
                    <button
                      onClick={() => setChatInput('Any whale movements or liquidations?')}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded border border-gray-700"
                    >
                      🐋 Whale Intel
                    </button>
                    <button
                      onClick={() => setChatInput('What is your performance?')}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded border border-gray-700"
                    >
                      💰 Performance
                    </button>
                    <button
                      onClick={() => setChatInput('Explain your strategy')}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded border border-gray-700"
                    >
                      🧠 Strategy
                    </button>
                  </div>
                </div>
              </div>

              {/* Market Data Section */}
              {showMarketData && (
                <div className="bg-gray-900 rounded-lg p-6">
                  <h3 className="text-2xl font-bold mb-6 text-cyan-400">📊 CURRENT MARKET STATE - ALL COINS</h3>
                  
                  <div className="space-y-6">
                    {Object.values(marketData).map((coin: any) => (
                      <div key={coin.symbol} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        {/* Coin Header */}
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-700">
                          <div>
                            <h4 className="text-2xl font-bold text-white">{coin.name} ({coin.symbol})</h4>
                            <p className="text-sm text-gray-400 mt-1">Market Cap Dominance: {coin.dominance}%</p>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold text-white">${coin.price.toLocaleString(undefined, {minimumFractionDigits: coin.price < 1 ? 4 : 2, maximumFractionDigits: coin.price < 1 ? 4 : 2})}</div>
                            <div className={`text-lg font-bold mt-1 ${coin.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {coin.change24h >= 0 ? '↑' : '↓'} {Math.abs(coin.change24h).toFixed(2)}% (24h)
                            </div>
                          </div>
                        </div>

                        {/* Market Data Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-gray-400 mb-1">24h High</div>
                            <div className="text-sm font-bold text-green-400">${coin.high24h.toLocaleString(undefined, {minimumFractionDigits: coin.price < 1 ? 4 : 2})}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 mb-1">24h Low</div>
                            <div className="text-sm font-bold text-red-400">${coin.low24h.toLocaleString(undefined, {minimumFractionDigits: coin.price < 1 ? 4 : 2})}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 mb-1">24h Volume</div>
                            <div className="text-sm font-bold text-white">${(coin.volume24h / 1000000000).toFixed(2)}B</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Market Cap</div>
                            <div className="text-sm font-bold text-white">${(coin.marketCap / 1000000000).toFixed(2)}B</div>
                          </div>
                        </div>

                        {/* Supply Information */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Circulating Supply</div>
                            <div className="text-sm font-bold text-white">{(coin.circulatingSupply / 1000000).toFixed(2)}M {coin.symbol}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Max Supply</div>
                            <div className="text-sm font-bold text-white">{coin.maxSupply ? `${(coin.maxSupply / 1000000).toFixed(2)}M ${coin.symbol}` : 'Unlimited'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Market Sentiment</div>
                            <div className={`text-sm font-bold ${
                              coin.sentiment === 'VERY BULLISH' ? 'text-green-500' :
                              coin.sentiment === 'BULLISH' ? 'text-green-400' :
                              coin.sentiment === 'NEUTRAL' ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              {coin.sentiment}
                            </div>
                          </div>
                        </div>

                        {/* Technical Indicators */}
                        <div className="bg-gray-900 rounded p-4">
                          <h5 className="text-sm font-bold text-gray-300 mb-3">Technical Indicators</h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <div className="text-xs text-gray-400 mb-1">RSI (14)</div>
                              <div className={`text-sm font-bold ${
                                coin.rsi > 70 ? 'text-red-400' :
                                coin.rsi > 50 ? 'text-green-400' :
                                coin.rsi > 30 ? 'text-yellow-400' :
                                'text-green-400'
                              }`}>
                                {coin.rsi} {coin.rsi > 70 ? '(Overbought)' : coin.rsi < 30 ? '(Oversold)' : ''}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400 mb-1">MACD Signal</div>
                              <div className={`text-sm font-bold ${coin.macd === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                                {coin.macd}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400 mb-1">MA 50</div>
                              <div className="text-sm font-bold text-white">${coin.ma50.toLocaleString(undefined, {minimumFractionDigits: coin.price < 1 ? 4 : 2})}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400 mb-1">MA 200</div>
                              <div className="text-sm font-bold text-white">${coin.ma200.toLocaleString(undefined, {minimumFractionDigits: coin.price < 1 ? 4 : 2})}</div>
                            </div>
                          </div>
                        </div>

                        {/* Support & Resistance */}
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                            <div className="text-xs text-red-400 mb-1">Support Level</div>
                            <div className="text-lg font-bold text-red-400">${coin.support.toLocaleString(undefined, {minimumFractionDigits: coin.price < 1 ? 4 : 2})}</div>
                          </div>
                          <div className="bg-green-500/10 border border-green-500/30 rounded p-3">
                            <div className="text-xs text-green-400 mb-1">Resistance Level</div>
                            <div className="text-lg font-bold text-green-400">${coin.resistance.toLocaleString(undefined, {minimumFractionDigits: coin.price < 1 ? 4 : 2})}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
            )}
          </div>
        )}

        {/* Content based on active tab */}
        {activeTab === 'LIVE' && subTab !== 'MODEL CHAT >' && (
          <div className="space-y-8">
            {/* Live Performance Chart */}
            <LivePerformanceChart models={models} />

            {/* Live Stats Grid */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-900 p-4 rounded">
                <div className="text-sm text-gray-400">Active Models</div>
                <div className="text-2xl font-bold">{models.filter(m => m.status === 'active').length}</div>
              </div>
              <div className="bg-gray-900 p-4 rounded">
                <div className="text-sm text-gray-400">Total Trades</div>
                <div className="text-2xl font-bold">{models.reduce((sum, m) => sum + m.totalTrades, 0)}</div>
              </div>
              <div className="bg-gray-900 p-4 rounded">
                <div className="text-sm text-gray-400">Win Rate</div>
                <div className="text-2xl font-bold">{models.length > 0 ? (models.reduce((sum, m) => sum + m.winRate, 0) / models.length).toFixed(1) : 0}%</div>
              </div>
              <div className="bg-gray-900 p-4 rounded">
                <div className="text-sm text-gray-400">Avg ROI</div>
                <div className="text-2xl font-bold">{models.length > 0 ? (models.reduce((sum, m) => sum + m.roi, 0) / models.length).toFixed(1) : 0}%</div>
              </div>
            </div>

            {/* Live Feed */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="font-bold mb-3 flex items-center gap-2">
                  Recent Activity
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                </h4>
                <div className="space-y-2 text-sm">
                  {models.slice(0, 3).map((model) => {
                    const pnl = model.currentBalance - 10000;
                    return (
                      <div key={model.id} className="flex justify-between items-center">
                        <span className="flex items-center gap-1">
                          {model.icon} {model.name}
                        </span>
                        <span className={pnl >= 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="font-bold mb-3 flex items-center gap-2">
                  Active Positions
                  <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></div>
                </h4>
                <div className="space-y-2 text-sm">
                  {models.slice(0, 3).map((model) => {
                    const positions = model.activePositions || [];
                    if (positions.length === 0) return null;
                    const position = positions[0];
                    const cryptoData = cryptoPrices.find(c => c.symbol === position);
                    return (
                      <div key={model.id} className="flex justify-between items-center">
                        <span className="font-mono">{position}</span>
                        <span className={cryptoData && cryptoData.change >= 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
                          {cryptoData ? `${cryptoData.change >= 0 ? '+' : ''}${cryptoData.change.toFixed(2)}%` : '...'}
                        </span>
                      </div>
                    );
                  }).filter(Boolean)}
                  {models.every(m => (m.activePositions || []).length === 0) && (
                    <div className="text-gray-500 text-xs">No active positions</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'LEADERBOARD' && subTab !== 'MODEL CHAT >' && (
          <div className="space-y-6">
            {/* Leaderboard Table */}
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-300">RANK</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-300">MODEL</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-300">ACCT VALUE ↓</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-300">RETURN %</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-300">TOTAL P&L</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-300">FEES</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-300">WIN RATE</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-300">BIGGEST WIN</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-300">BIGGEST LOSS</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-300">SHARPE</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-300">TRADES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((model, index) => {
                      const metrics = calculateMetrics(model);
                      return (
                        <tr key={model.id} className="border-b border-gray-700 hover:bg-gray-800">
                          <td className="px-4 py-3 text-sm font-bold text-gray-300">#{index + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center">
                              <span className="text-lg mr-2">{model.icon}</span>
                              <span className={`font-bold ${model.color}`}>{model.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono">${model.currentBalance.toLocaleString()}</td>
                          <td className={`px-4 py-3 text-right text-sm font-mono ${model.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {model.roi >= 0 ? '+' : ''}{model.roi.toFixed(2)}%
                          </td>
                          <td className={`px-4 py-3 text-right text-sm font-mono ${metrics.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {metrics.totalPnL >= 0 ? '+' : ''}${metrics.totalPnL.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-gray-400">${model.fees?.toFixed(2) || '0.00'}</td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-gray-300">{model.winRate.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-green-400">+${model.biggestWin?.toFixed(2) || '0.00'}</td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-red-400">${model.biggestLoss?.toFixed(2) || '0.00'}</td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-gray-300">{model.sharpe?.toFixed(3) || '0.000'}</td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-gray-300">{model.totalTrades}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Winning Model Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Winning Model Card */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold text-gray-300 mb-4">WINNING MODEL</h3>
                <div className="flex items-center mb-4">
                  <span className="text-3xl mr-3">{models[0]?.icon}</span>
                  <div>
                    <h4 className={`text-xl font-bold ${models[0]?.color}`}>{models[0]?.name}</h4>
                    <p className="text-sm text-gray-400">Total Equity: ${models[0]?.currentBalance.toLocaleString()}</p>
                  </div>
                </div>
                
                <div className="mb-4">
                  <h5 className="text-sm font-bold text-gray-400 mb-2">Active Positions</h5>
                  <div className="flex flex-wrap gap-2">
                    {(models[0]?.activePositions || []).map((asset, index) => (
                      <div key={index} className="bg-gray-800 px-3 py-1 rounded text-xs font-mono">
                        {asset}
                      </div>
                    ))}
                    {(models[0]?.activePositions || []).length === 0 && (
                      <span className="text-gray-500 text-sm">No active positions</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Performance Chart */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold text-gray-300 mb-4">Account Values</h3>
                <div className="space-y-3">
                  {models.slice(0, 6).map((model, index) => {
                    const maxValue = Math.max(...models.map(m => m.currentBalance));
                    const percentage = (model.currentBalance / maxValue) * 100;
                    return (
                      <div key={model.id} className="flex items-center">
                        <div className="w-16 text-xs text-gray-400 truncate mr-2">{model.name}</div>
                        <div className="flex-1 bg-gray-800 rounded-full h-4 relative">
                          <div 
                            className={`h-4 rounded-full ${model.color}`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                        <div className="w-20 text-xs text-right text-gray-300 ml-2">
                          ${model.currentBalance.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="text-center text-sm text-gray-500">
              All statistics (except Account Value and P&L) reflect completed trades only. Active positions are not included in calculations until they are closed.
            </div>
          </div>
        )}

        {activeTab === 'MODELS' && subTab !== 'MODEL CHAT >' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {models.map((model, index) => (
              <div key={model.id} className="bg-gray-900 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <span className="text-2xl mr-3">{model.icon}</span>
                    <div>
                      <h3 className={`font-bold text-lg ${model.color}`}>{model.name}</h3>
                      <p className="text-sm text-gray-400">#{index + 1} Rank</p>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-bold ${
                    model.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {model.status.toUpperCase()}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Balance</span>
                    <span className="font-mono">${model.currentBalance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">ROI</span>
                    <span className={`font-mono ${model.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {model.roi >= 0 ? '+' : ''}{model.roi.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Win Rate</span>
                    <span className="font-mono">{model.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Trades</span>
                    <span className="font-mono">{model.totalTrades}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Strategy</span>
                    <span className="text-gray-300 capitalize">{model.strategy.replace('_', ' ')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-black py-6">
        <div className="container mx-auto px-6 text-center text-gray-500 text-sm">
          <p>© 2024 Helix.One - Alpha Arena. All rights reserved.</p>
          <p className="mt-2">Powered by the Helix Engine • Real-time algorithmic trading</p>
          <p className="mt-2">Built by Darren Headley</p>
        </div>
      </footer>

      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
}