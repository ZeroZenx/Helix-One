import React, { useState, useEffect } from 'react';
import { tradingApi, TradeSignal, ModelAccount, TradingStatus, SymbolExecutionProfile } from '../services/tradingApi';

interface TradingPanelProps {
  modelId: string;
  modelName: string;
  onTradeExecuted?: (signal: TradeSignal) => void;
}

const TEST_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT'];

export const TradingPanel: React.FC<TradingPanelProps> = ({ 
  modelId, 
  modelName, 
  onTradeExecuted 
}) => {
  const [tradingStatus, setTradingStatus] = useState<TradingStatus | null>(null);
  const [modelAccount, setModelAccount] = useState<ModelAccount | null>(null);
  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testSymbol, setTestSymbol] = useState('BTCUSDT');
  const [symbolProfiles, setSymbolProfiles] = useState<SymbolExecutionProfile[]>([]);
  const [watchlistMap, setWatchlistMap] = useState<Record<string, { tradable: boolean; watchlistOnly: boolean }>>({});

  useEffect(() => {
    loadTradingData();
  }, [modelId]);

  const loadTradingData = async () => {
    try {
      setLoading(true);
      const [status, account, profilePayload] = await Promise.all([
        tradingApi.getTradingStatus(),
        tradingApi.getModelAccount(modelId).catch(() => null),
        tradingApi.getSymbolProfiles().catch(() => null)
      ]);
      
      setTradingStatus(status);
      setModelAccount(account);
      setIsTradingEnabled(status.enabled);
      setSymbolProfiles(profilePayload?.profiles || []);
      setWatchlistMap(Object.fromEntries((profilePayload?.watchlist || []).map((row) => [row.symbol, row])));
    } catch (error) {
      console.error('Error loading trading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTrading = async () => {
    try {
      setLoading(true);
      const result = await tradingApi.toggleTrading(!isTradingEnabled);
      setIsTradingEnabled(result.enabled);
      await loadTradingData();
    } catch (error) {
      console.error('Error toggling trading:', error);
    } finally {
      setLoading(false);
    }
  };

  const createModelAccount = async () => {
    try {
      setLoading(true);
      const account = await tradingApi.createModelAccount(
        modelId, 
        modelName, 
        1000 // $1000 allocation
      );
      setModelAccount(account);
    } catch (error) {
      console.error('Error creating model account:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendTestTrade = async () => {
    if (!modelAccount) return;

    try {
      setLoading(true);
      const signal = tradingApi.generateTradeSignal(
        modelId,
        testSymbol.replace('USDT', ''),
        'BUY',
        0.85,
        `Test trade from frontend (${testSymbol})`,
        {
          type: 'MARKET',
          leverage: 2,
          stopLoss: 60000,
          takeProfit: 70000
        }
      );

      const result = await tradingApi.sendTradeSignal(signal);
      
      if (result.success) {
        console.log('Trade signal sent successfully:', signal);
        onTradeExecuted?.(signal);
        await loadTradingData(); // Refresh data
      }
    } catch (error) {
      console.error('Error sending trade signal:', error);
    } finally {
      setLoading(false);
    }
  };

  const closeAllPositions = async () => {
    try {
      setLoading(true);
      await tradingApi.closeAllPositions(modelId);
      await loadTradingData();
    } catch (error) {
      console.error('Error closing positions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-700 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Live Trading</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            tradingStatus?.connected ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className="text-sm text-gray-400">
            {tradingStatus?.connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {!modelAccount ? (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">No trading account found for {modelName}</p>
          <button
            onClick={createModelAccount}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Create Trading Account ($1000)
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Account Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-400">Balance</p>
              <p className="text-lg font-mono text-white">
                ${modelAccount.currentBalance.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Total P&L</p>
              <p className={`text-lg font-mono ${
                modelAccount.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {modelAccount.totalPnL >= 0 ? '+' : ''}${modelAccount.totalPnL.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Realized P&L</p>
              <p className={`text-lg font-mono ${
                (modelAccount.realizedPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {(modelAccount.realizedPnL || 0) >= 0 ? '+' : ''}${(modelAccount.realizedPnL || 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Daily P&L</p>
              <p className={`text-lg font-mono ${
                (modelAccount.dailyPnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {(modelAccount.dailyPnl || 0) >= 0 ? '+' : ''}${(modelAccount.dailyPnl || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Positions */}
          {modelAccount.positions.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-400 mb-2">Active Positions</h4>
              <div className="space-y-2">
                {modelAccount.positions.map((position, index) => (
                  <div key={index} className="bg-gray-800 rounded p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-mono">
                        {position.symbol} {position.side}
                      </span>
                      <span className={`font-mono ${
                        position.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Size: {position.size} | Entry: ${position.entryPrice.toFixed(2)} | 
                      Current: ${position.currentPrice.toFixed(2)} | Leverage: {position.leverage}x
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      SL: {position.stopLoss ? `$${position.stopLoss.toFixed(4)}` : '—'} | TP: {position.takeProfit ? `$${position.takeProfit.toFixed(4)}` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Symbol Profiles */}
          <div>
            <h4 className="text-sm font-bold text-gray-400 mb-2">Symbol Execution Profiles</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="text-gray-500 border-b border-gray-800">
                  <tr>
                    <th className="py-2 pr-3">Symbol</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Min Conf</th>
                    <th className="py-2 pr-3">Lev</th>
                    <th className="py-2 pr-3">Stop</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2 pr-3">Size</th>
                    <th className="py-2 pr-3">Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {symbolProfiles.map((profile) => (
                    <tr key={profile.symbol} className="border-b border-gray-800/60">
                      <td className="py-2 pr-3 font-mono text-white">{profile.symbol}</td>
                      <td className="py-2 pr-3">{profile.notes?.[0]?.replaceAll('_', ' ') || '—'}</td>
                      <td className="py-2 pr-3">{profile.minConfidencePct}%</td>
                      <td className="py-2 pr-3">{profile.maxLeverage}x</td>
                      <td className="py-2 pr-3">{(profile.stopDistancePct * 100).toFixed(2)}%</td>
                      <td className="py-2 pr-3">{profile.targetR.toFixed(1)}R</td>
                      <td className="py-2 pr-3">{profile.sizeMultiplier.toFixed(2)}x</td>
                      <td className="py-2 pr-3">{profile.spreadCeilingBps} bps</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={toggleTrading}
              disabled={loading}
              className={`px-4 py-2 rounded text-sm font-medium ${
                isTradingEnabled
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              } disabled:opacity-50`}
            >
              {isTradingEnabled ? 'Disable Trading' : 'Enable Trading'}
            </button>

            <select
              value={testSymbol}
              onChange={(e) => setTestSymbol(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded text-sm"
            >
              {TEST_SYMBOLS.map((symbol) => (
                <option key={symbol} value={symbol}>{symbol}</option>
              ))}
            </select>

            <button
              onClick={sendTestTrade}
              disabled={loading || !isTradingEnabled}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Test Trade
            </button>

            {modelAccount.positions.length > 0 && (
              <button
                onClick={closeAllPositions}
                disabled={loading}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
              >
                Close All
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-400">Win Rate</p>
              <p className="text-sm font-mono text-white">
                {(modelAccount.winRate * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Trades</p>
              <p className="text-sm font-mono text-white">
                {modelAccount.totalTrades}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Status</p>
              <p className={`text-sm font-mono ${
                modelAccount.isActive ? 'text-green-400' : 'text-red-400'
              }`}>
                {modelAccount.isActive ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradingPanel;
