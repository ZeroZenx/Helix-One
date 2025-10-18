// Trading API Service for Frontend
export interface TradeSignal {
  modelId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity?: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  confidence: number;
  reason: string;
  timestamp: Date;
}

export interface ModelAccount {
  modelId: string;
  modelName: string;
  allocatedBalance: number;
  currentBalance: number;
  positions: Array<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entryPrice: number;
    currentPrice: number;
    pnl: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
  }>;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  isActive: boolean;
}

export interface TradingStatus {
  connected: boolean;
  enabled: boolean;
  accounts: number;
}

class TradingApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://your-api-domain.com/api/trading'
      : 'http://localhost:3001/api/trading';
  }

  // Get trading status
  async getTradingStatus(): Promise<TradingStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      if (!response.ok) throw new Error('Failed to fetch trading status');
      return await response.json();
    } catch (error) {
      console.error('Error fetching trading status:', error);
      throw error;
    }
  }

  // Get all model accounts
  async getModelAccounts(): Promise<ModelAccount[]> {
    try {
      const response = await fetch(`${this.baseUrl}/accounts`);
      if (!response.ok) throw new Error('Failed to fetch model accounts');
      return await response.json();
    } catch (error) {
      console.error('Error fetching model accounts:', error);
      throw error;
    }
  }

  // Get specific model account
  async getModelAccount(modelId: string): Promise<ModelAccount> {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/${modelId}`);
      if (!response.ok) throw new Error('Failed to fetch model account');
      return await response.json();
    } catch (error) {
      console.error('Error fetching model account:', error);
      throw error;
    }
  }

  // Create model account
  async createModelAccount(modelId: string, modelName: string, allocatedBalance: number): Promise<ModelAccount> {
    try {
      const response = await fetch(`${this.baseUrl}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelId,
          modelName,
          allocatedBalance
        })
      });

      if (!response.ok) throw new Error('Failed to create model account');
      return await response.json();
    } catch (error) {
      console.error('Error creating model account:', error);
      throw error;
    }
  }

  // Send trade signal
  async sendTradeSignal(signal: TradeSignal): Promise<{ success: boolean; signal: TradeSignal }> {
    try {
      const response = await fetch(`${this.baseUrl}/signals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signal)
      });

      if (!response.ok) throw new Error('Failed to send trade signal');
      return await response.json();
    } catch (error) {
      console.error('Error sending trade signal:', error);
      throw error;
    }
  }

  // Toggle trading
  async toggleTrading(enabled: boolean): Promise<{ enabled: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled })
      });

      if (!response.ok) throw new Error('Failed to toggle trading');
      return await response.json();
    } catch (error) {
      console.error('Error toggling trading:', error);
      throw error;
    }
  }

  // Update positions
  async updatePositions(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/update-positions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) throw new Error('Failed to update positions');
      return await response.json();
    } catch (error) {
      console.error('Error updating positions:', error);
      throw error;
    }
  }

  // Close all positions for a model
  async closeAllPositions(modelId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/close-positions/${modelId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) throw new Error('Failed to close positions');
      return await response.json();
    } catch (error) {
      console.error('Error closing positions:', error);
      throw error;
    }
  }

  // Generate trade signal from AI model decision
  generateTradeSignal(
    modelId: string,
    symbol: string,
    side: 'BUY' | 'SELL',
    confidence: number,
    reason: string,
    options: {
      type?: 'MARKET' | 'LIMIT';
      quantity?: number;
      price?: number;
      leverage?: number;
      stopLoss?: number;
      takeProfit?: number;
    } = {}
  ): TradeSignal {
    return {
      modelId,
      symbol,
      side,
      type: options.type || 'MARKET',
      quantity: options.quantity,
      price: options.price,
      stopLoss: options.stopLoss,
      takeProfit: options.takeProfit,
      leverage: options.leverage,
      confidence,
      reason,
      timestamp: new Date()
    };
  }

  // Simulate AI model trading decision
  simulateModelTrading(modelId: string, currentPrice: number, marketData: any): TradeSignal | null {
    // This is a simplified simulation - in reality, this would come from your AI models
    const confidence = Math.random();
    const shouldTrade = confidence > 0.7; // 30% chance of trading

    if (!shouldTrade) return null;

    const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
    const symbol = 'BTC'; // This would be determined by your AI model
    const leverage = Math.floor(Math.random() * 3) + 1; // 1-3x leverage

    return this.generateTradeSignal(
      modelId,
      symbol,
      side,
      confidence,
      `AI detected ${side === 'BUY' ? 'bullish' : 'bearish'} momentum`,
      {
        type: 'MARKET',
        leverage,
        stopLoss: side === 'BUY' ? currentPrice * 0.98 : currentPrice * 1.02,
        takeProfit: side === 'BUY' ? currentPrice * 1.05 : currentPrice * 0.95
      }
    );
  }
}

// Export singleton instance
export const tradingApi = new TradingApiService();
export default tradingApi;
