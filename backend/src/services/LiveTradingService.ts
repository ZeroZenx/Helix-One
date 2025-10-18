import { BinanceService, OrderParams, AccountInfo, PositionInfo } from './BinanceService';
import { EventEmitter } from 'events';

export interface TradingConfig {
  maxPositionSize: number; // Maximum position size as percentage of account
  maxDailyLoss: number; // Maximum daily loss as percentage
  maxLeverage: number; // Maximum leverage allowed
  stopLossPercentage: number; // Stop loss percentage
  takeProfitPercentage: number; // Take profit percentage
  minTradeAmount: number; // Minimum trade amount in USDT
}

export interface ModelTradingAccount {
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
  confidence: number; // 0-1 confidence score
  reason: string;
  timestamp: Date;
}

export class LiveTradingService extends EventEmitter {
  private binance: BinanceService;
  private config: TradingConfig;
  private modelAccounts: Map<string, ModelTradingAccount> = new Map();
  private isConnected: boolean = false;
  private tradingEnabled: boolean = false;

  constructor(binanceConfig: any, tradingConfig: TradingConfig) {
    super();
    this.binance = new BinanceService(binanceConfig);
    this.config = tradingConfig;
  }

  // Initialize the trading service
  async initialize(): Promise<void> {
    try {
      console.log('Initializing Live Trading Service...');
      
      // Test connectivity
      const isConnected = await this.binance.testConnectivity();
      if (!isConnected) {
        throw new Error('Failed to connect to Binance API');
      }

      this.isConnected = true;
      console.log('✅ Connected to Binance API');

      // Get account info
      const accountInfo = await this.binance.getAccountInfo();
      console.log('Account Info:', {
        totalBalance: accountInfo.totalWalletBalance,
        availableBalance: accountInfo.availableBalance,
        unrealizedPnl: accountInfo.totalUnrealizedPnl
      });

      this.emit('initialized', { accountInfo });
    } catch (error) {
      console.error('Failed to initialize trading service:', error);
      throw error;
    }
  }

  // Create a trading account for an AI model
  createModelAccount(modelId: string, modelName: string, allocatedBalance: number): ModelTradingAccount {
    const account: ModelTradingAccount = {
      modelId,
      modelName,
      allocatedBalance,
      currentBalance: allocatedBalance,
      positions: [],
      totalPnL: 0,
      winRate: 0,
      totalTrades: 0,
      isActive: true
    };

    this.modelAccounts.set(modelId, account);
    console.log(`Created trading account for ${modelName}: $${allocatedBalance}`);
    
    this.emit('modelAccountCreated', account);
    return account;
  }

  // Process a trade signal from an AI model
  async processTradeSignal(signal: TradeSignal): Promise<boolean> {
    if (!this.tradingEnabled) {
      console.log('Trading is disabled, ignoring signal');
      return false;
    }

    const modelAccount = this.modelAccounts.get(signal.modelId);
    if (!modelAccount || !modelAccount.isActive) {
      console.log(`Model ${signal.modelId} not found or inactive`);
      return false;
    }

    try {
      // Validate signal
      if (!this.validateSignal(signal, modelAccount)) {
        console.log(`Invalid signal from ${signal.modelId}: ${signal.reason}`);
        return false;
      }

      // Calculate position size
      const positionSize = this.calculatePositionSize(signal, modelAccount);
      if (positionSize < this.config.minTradeAmount) {
        console.log(`Position size too small: $${positionSize}`);
        return false;
      }

      // Execute the trade
      const orderResult = await this.executeTrade(signal, positionSize);
      
      if (orderResult.success) {
        // Update model account
        this.updateModelAccount(signal, orderResult, modelAccount);
        console.log(`✅ Trade executed for ${signal.modelId}: ${signal.symbol} ${signal.side}`);
        
        this.emit('tradeExecuted', {
          signal,
          orderResult,
          modelAccount
        });
        
        return true;
      } else {
        console.log(`❌ Trade failed for ${signal.modelId}: ${orderResult.error}`);
        return false;
      }
    } catch (error) {
      console.error(`Error processing trade signal from ${signal.modelId}:`, error);
      this.emit('tradeError', { signal, error });
      return false;
    }
  }

  // Validate a trade signal
  private validateSignal(signal: TradeSignal, modelAccount: ModelTradingAccount): boolean {
    // Check confidence threshold
    if (signal.confidence < 0.7) {
      return false;
    }

    // Check if model has sufficient balance
    if (modelAccount.currentBalance < this.config.minTradeAmount) {
      return false;
    }

    // Check daily loss limit
    if (Math.abs(modelAccount.totalPnL) > (modelAccount.allocatedBalance * this.config.maxDailyLoss)) {
      console.log(`Model ${signal.modelId} hit daily loss limit`);
      modelAccount.isActive = false;
      return false;
    }

    // Check leverage limit
    if (signal.leverage && signal.leverage > this.config.maxLeverage) {
      return false;
    }

    return true;
  }

  // Calculate position size based on risk management
  private calculatePositionSize(signal: TradeSignal, modelAccount: ModelTradingAccount): number {
    const maxPositionValue = modelAccount.currentBalance * this.config.maxPositionSize;
    const leverage = signal.leverage || 1;
    const positionValue = maxPositionValue * leverage;
    
    // Calculate quantity based on current price
    const currentPrice = this.getCurrentPrice(signal.symbol);
    const quantity = positionValue / currentPrice;
    
    return quantity * currentPrice; // Return in USDT
  }

  // Execute a trade on Binance
  private async executeTrade(signal: TradeSignal, positionSize: number): Promise<any> {
    try {
      const symbol = signal.symbol + 'USDT'; // Convert to Binance format
      const currentPrice = await this.binance.getCurrentPrice(symbol);
      
      // Set leverage if specified
      if (signal.leverage) {
        await this.binance.setLeverage(symbol, signal.leverage);
      }

      // Prepare order parameters
      const orderParams: OrderParams = {
        symbol,
        side: signal.side,
        type: signal.type,
        quantity: positionSize / currentPrice,
        newClientOrderId: `${signal.modelId}_${Date.now()}`
      };

      // Add price for limit orders
      if (signal.type === 'LIMIT' && signal.price) {
        orderParams.price = signal.price;
        orderParams.timeInForce = 'GTC';
      }

      // Execute the order
      const orderResult = await this.binance.placeOrder(orderParams);
      
      return {
        success: true,
        orderId: orderResult.orderId,
        symbol: orderResult.symbol,
        side: orderResult.side,
        quantity: orderResult.executedQty,
        price: orderResult.price,
        status: orderResult.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update model account after trade execution
  private updateModelAccount(signal: TradeSignal, orderResult: any, modelAccount: ModelTradingAccount): void {
    // Add position
    const position = {
      symbol: signal.symbol,
      side: signal.side === 'BUY' ? 'LONG' : 'SHORT',
      size: parseFloat(orderResult.quantity),
      entryPrice: parseFloat(orderResult.price),
      currentPrice: parseFloat(orderResult.price),
      pnl: 0,
      leverage: signal.leverage || 1,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit
    };

    modelAccount.positions.push(position);
    modelAccount.totalTrades++;
    
    // Update win rate (simplified)
    modelAccount.winRate = (modelAccount.winRate * (modelAccount.totalTrades - 1) + 1) / modelAccount.totalTrades;
  }

  // Get current price for a symbol
  private getCurrentPrice(symbol: string): number {
    // This would typically fetch from a price cache or API
    // For now, return a mock price
    const mockPrices: { [key: string]: number } = {
      'BTC': 65000,
      'ETH': 3500,
      'SOL': 200,
      'XRP': 0.6,
      'DOGE': 0.15,
      'BNB': 600
    };
    
    return mockPrices[symbol] || 100;
  }

  // Update position P&L
  async updatePositions(): Promise<void> {
    for (const [modelId, account] of this.modelAccounts) {
      for (const position of account.positions) {
        try {
          const currentPrice = await this.binance.getCurrentPrice(position.symbol + 'USDT');
          position.currentPrice = currentPrice;
          
          // Calculate P&L
          const priceDiff = position.side === 'LONG' 
            ? currentPrice - position.entryPrice
            : position.entryPrice - currentPrice;
          
          position.pnl = priceDiff * position.size * position.leverage;
        } catch (error) {
          console.error(`Error updating position for ${position.symbol}:`, error);
        }
      }
      
      // Update total P&L
      account.totalPnL = account.positions.reduce((sum, pos) => sum + pos.pnl, 0);
      account.currentBalance = account.allocatedBalance + account.totalPnL;
    }
  }

  // Get model account status
  getModelAccount(modelId: string): ModelTradingAccount | undefined {
    return this.modelAccounts.get(modelId);
  }

  // Get all model accounts
  getAllModelAccounts(): ModelTradingAccount[] {
    return Array.from(this.modelAccounts.values());
  }

  // Enable/disable trading
  setTradingEnabled(enabled: boolean): void {
    this.tradingEnabled = enabled;
    console.log(`Trading ${enabled ? 'enabled' : 'disabled'}`);
    this.emit('tradingToggled', enabled);
  }

  // Get trading status
  getTradingStatus(): { connected: boolean; enabled: boolean; accounts: number } {
    return {
      connected: this.isConnected,
      enabled: this.tradingEnabled,
      accounts: this.modelAccounts.size
    };
  }

  // Close all positions for a model
  async closeAllPositions(modelId: string): Promise<void> {
    const account = this.modelAccounts.get(modelId);
    if (!account) return;

    for (const position of account.positions) {
      try {
        const symbol = position.symbol + 'USDT';
        const oppositeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
        
        await this.binance.placeOrder({
          symbol,
          side: oppositeSide,
          type: 'MARKET',
          quantity: position.size
        });
        
        console.log(`Closed position: ${position.symbol} ${position.side}`);
      } catch (error) {
        console.error(`Error closing position ${position.symbol}:`, error);
      }
    }
    
    account.positions = [];
  }
}
