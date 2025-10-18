import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';

interface Model {
  id: number;
  name: string;
  currentBalance: number;
  roi: number;
  drawdown: number;
  winRate: number;
  avgLeverage: number;
  totalTrades: number;
  status: string;
  strategy: string;
  icon: string;
  color: string;
}

interface Position {
  id: string;
  symbol: string;
  entryTime: string;
  entryPrice: number;
  side: 'LONG' | 'SHORT';
  quantity: number;
  leverage: number;
  liquidationPrice: number;
  margin: number;
  unrealizedPnL: number;
  icon: string;
}

interface Trade {
  id: string;
  side: 'LONG' | 'SHORT';
  coin: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  holdingTime: string;
  notionalEntry: number;
  notionalExit: number;
  totalFees: number;
  netPnL: number;
  icon: string;
}

export default function ModelDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [model, setModel] = useState<Model | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  // Mock data - in production, fetch from API
  useEffect(() => {
    if (id) {
      // Mock model data
      const mockModel: Model = {
        id: parseInt(id as string),
        name: 'DEEPSEEK CHAT V3.1',
        currentBalance: 10385.25,
        roi: 3.85,
        drawdown: -1.2,
        winRate: 68.5,
        avgLeverage: 12.1,
        totalTrades: 127,
        status: 'active',
        strategy: 'momentum',
        icon: '🧠',
        color: '#3B82F6'
      };

      // Mock positions data
      const mockPositions: Position[] = [
        {
          id: '1',
          symbol: 'ETH',
          entryTime: '18:04:35',
          entryPrice: 3860,
          side: 'SHORT',
          quantity: 6.21,
          leverage: 20,
          liquidationPrice: 3974,
          margin: 1166,
          unrealizedPnL: -33.22,
          icon: 'Ξ'
        },
        {
          id: '2',
          symbol: 'SOL',
          entryTime: '18:04:42',
          entryPrice: 185.69,
          side: 'SHORT',
          quantity: 64.69,
          leverage: 10,
          liquidationPrice: 199.19,
          margin: 1304,
          unrealizedPnL: 108.36,
          icon: '◎'
        },
        {
          id: '3',
          symbol: 'BTC',
          entryTime: '23:48:29',
          entryPrice: 1089,
          side: 'SHORT',
          quantity: 6.43,
          leverage: 10,
          liquidationPrice: 1140,
          margin: 722.10,
          unrealizedPnL: 26.04,
          icon: '₿'
        }
      ];

      // Mock trades data
      const mockTrades: Trade[] = [
        {
          id: '1',
          side: 'SHORT',
          coin: 'BNB',
          entryPrice: 1076.6,
          exitPrice: 1087.9,
          quantity: 4.81,
          holdingTime: '3H 37M',
          notionalEntry: 5178,
          notionalExit: 5233,
          totalFees: 4.69,
          netPnL: -59.04,
          icon: '💎'
        },
        {
          id: '2',
          side: 'SHORT',
          coin: 'DOGE',
          entryPrice: 0.18513,
          exitPrice: 0.18584,
          quantity: 32419.00,
          holdingTime: '25M',
          notionalEntry: 6002,
          notionalExit: 6025,
          totalFees: 5.41,
          netPnL: -27.57,
          icon: '🐕'
        }
      ];

      setModel(mockModel);
      setPositions(mockPositions);
      setTrades(mockTrades);
      setLoading(false);
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading model data...</p>
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Model Not Found</h1>
          <button 
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition"
          >
            Back to Leaderboard
          </button>
        </div>
      </div>
    );
  }

  const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
  const totalPnL = model.currentBalance - 10000;
  const totalFees = model.totalTrades * 2.5;
  const netRealized = totalPnL - totalUnrealizedPnL;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Alpha Arena by Nof1</h1>
            </div>
            <div className="flex items-center space-x-8">
              <a href="/" className="text-gray-600 hover:text-gray-900">LIVE</a>
              <a href="/" className="text-gray-600 hover:text-gray-900">LEADERBOARD</a>
              <a href="/" className="text-gray-900 font-semibold">MODELS</a>
              <button className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition">
                JOIN THE PLATFORM WAITLIST →
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Buttons */}
        <div className="mb-8">
          <div className="flex space-x-4">
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              ← LIVE CHART
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              📊 LEADERBOARD
            </button>
          </div>
        </div>

        {/* Model Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${model.color}20`, borderColor: `${model.color}40` }} className="border">
                <span className="text-2xl">{model.icon}</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{model.name}</h2>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Total Account Value: <span className="font-semibold">${model.currentBalance.toFixed(2)}</span></p>
                  <p>Available Cash: <span className="font-semibold">${(model.currentBalance * 0.4).toFixed(2)}</span></p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <a href="#" className="text-sm text-blue-600 hover:text-blue-800">[LINK TO WALLET]</a>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Total P&L:</p>
            <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Total Fees:</p>
            <p className="text-2xl font-bold text-gray-900">${totalFees.toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Does not include funding costs and rebates</p>
            <p className="text-sm text-gray-600 mb-1">Net Realized:</p>
            <p className={`text-2xl font-bold ${netRealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netRealized >= 0 ? '+' : ''}${netRealized.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Trading Statistics */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">General Statistics</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Average Leverage:</span>
                <span className="font-semibold">{model.avgLeverage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Average Confidence:</span>
                <span className="font-semibold">61.9%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Biggest Win:</span>
                <span className="font-semibold text-red-600">-$27.57</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Biggest Loss:</span>
                <span className="font-semibold text-red-600">-$59.04</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">HOLD TIMES</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Long:</span>
                <span className="font-semibold text-green-600">0.0%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Short:</span>
                <span className="font-semibold text-green-600">95.1%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Flat:</span>
                <span className="font-semibold text-green-600">4.9%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Positions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">ACTIVE POSITIONS</h3>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Unrealized P&L:</p>
              <p className={`text-lg font-bold ${totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalUnrealizedPnL >= 0 ? '+' : ''}${totalUnrealizedPnL.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {positions.map((position) => (
              <motion.div
                key={position.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{position.icon}</span>
                  <button className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 transition">
                    VIEW
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Entry Time:</span>
                    <span className="font-medium">{position.entryTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Entry Price:</span>
                    <span className="font-medium">${position.entryPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Side:</span>
                    <span className="font-medium text-red-600">{position.side}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Quantity:</span>
                    <span className="font-medium">{position.quantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Leverage:</span>
                    <span className="font-medium">{position.leverage}X</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Liquidation Price:</span>
                    <span className="font-medium">${position.liquidationPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Margin:</span>
                    <span className="font-medium">${position.margin.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Unrealized P&L:</span>
                    <span className={`font-medium ${position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2">
                    <p className="text-gray-600 text-xs">Exit Plan:</p>
                    <button className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 transition mt-1">
                      VIEW
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Last 25 Trades */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">LAST 25 TRADES</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">SIDE</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">COIN</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">ENTRY PRICE</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">EXIT PRICE</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">QUANTITY</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">HOLDING TIME</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">NOTIONAL ENTRY</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">NOTIONAL EXIT</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">TOTAL FEES</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">NET P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="text-red-600 font-medium">{trade.side}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{trade.icon}</span>
                        <span className="font-medium">{trade.coin}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium">${trade.entryPrice.toFixed(2)}</td>
                    <td className="py-3 px-4 font-medium">${trade.exitPrice.toFixed(2)}</td>
                    <td className="py-3 px-4 font-medium">{trade.quantity.toFixed(2)}</td>
                    <td className="py-3 px-4 font-medium">{trade.holdingTime}</td>
                    <td className="py-3 px-4 font-medium">${trade.notionalEntry.toFixed(0)}</td>
                    <td className="py-3 px-4 font-medium">${trade.notionalExit.toFixed(0)}</td>
                    <td className="py-3 px-4 font-medium">${trade.totalFees.toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <span className={`font-medium ${trade.netPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.netPnL >= 0 ? '+' : ''}${trade.netPnL.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Back Button */}
        <div className="text-center mt-8">
          <button 
            onClick={() => router.push('/')}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            [← BACK TO LEADERBOARD]
          </button>
        </div>
      </div>
    </div>
  );
}