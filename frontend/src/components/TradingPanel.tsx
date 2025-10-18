import React, { useState, useEffect } from 'react';
import { tradingApi, TradeSignal, ModelAccount, TradingStatus } from '../services/tradingApi';

interface TradingPanelProps {
  modelId: string;
  modelName: string;
  onTradeExecuted?: (signal: TradeSignal) => void;
}

export const TradingPanel: React.FC<TradingPanelProps> = ({ 
  modelId, 
  modelName, 
  onTradeExecuted 
}) => {
  const [tradingStatus, setTradingStatus] = useState<TradingStatus | null>(null);
  const [modelAccount, setModelAccount] = useState<ModelAccount | null>(null);
  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTradingData();
  }, [modelId]);

  const loadTradingData = async () => {
    try {
      setLoading(true);
      const [status, account] = await Promise.all([
        tradingApi.getTradingStatus(),
        tradingApi.getModelAccount(modelId).catch(() => null)
      ]);
      
      setTradingStatus(status);
      setModelAccount(account);
      setIsTradingEnabled(status.enabled);
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
        'BTC',
        'BUY',
        0.85,
        'Test trade from frontend',
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400">Balance</p>
              <p className="text-lg font-mono text-white">
                ${modelAccount.currentBalance.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">P&L</p>
              <p className={`text-lg font-mono ${
                modelAccount.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {modelAccount.totalPnL >= 0 ? '+' : ''}${modelAccount.totalPnL.toFixed(2)}
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
                      Current: ${position.currentPrice.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex space-x-2">
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
