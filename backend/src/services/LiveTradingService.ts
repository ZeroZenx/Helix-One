import { EventEmitter } from 'events';
import { BinanceService, OrderParams } from './BinanceService';
import { JournalService } from './JournalService';

export interface TradingConfig {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxLeverage: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  minTradeAmount: number;
  killSwitchDrawdownPct?: number;
  cooldownMinutes?: number;
  maxTradesPerDay?: number;
  maxConsecutiveLosses?: number;
  minConfidence?: number;
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
  confidence: number;
  reason: string;
  timestamp: Date;
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
    openedAt: string;
    source?: 'local' | 'exchange';
  }>;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  isActive: boolean;
  consecutiveLosses: number;
  tradesToday: number;
  dailyPnl: number;
  cooldownUntil?: string;
  killSwitchTriggered: boolean;
}

export class LiveTradingService extends EventEmitter {
  private binance: BinanceService;
  private config: TradingConfig;
  private modelAccounts: Map<string, ModelTradingAccount> = new Map();
  private isConnected = false;
  private tradingEnabled = false;
  private journal = new JournalService();
  private lastSignalRejectReason: string | null = null;

  constructor(binanceConfig: any, tradingConfig: TradingConfig) {
    super();
    this.binance = new BinanceService(binanceConfig);
    this.config = tradingConfig;
  }

  async initialize(): Promise<void> {
    const isConnected = await this.binance.testConnectivity();
    if (!isConnected) throw new Error('Failed to connect to Binance API');
    this.isConnected = true;
    this.emit('initialized');
  }

  createModelAccount(modelId: string, modelName: string, allocatedBalance: number): ModelTradingAccount {
    const existing = this.modelAccounts.get(modelId);
    if (existing) return existing;

    const account: ModelTradingAccount = {
      modelId,
      modelName,
      allocatedBalance,
      currentBalance: allocatedBalance,
      positions: [],
      totalPnL: 0,
      winRate: 0,
      totalTrades: 0,
      isActive: true,
      consecutiveLosses: 0,
      tradesToday: 0,
      dailyPnl: 0,
      killSwitchTriggered: false,
    };

    this.modelAccounts.set(modelId, account);
    return account;
  }

  async processTradeSignal(signal: TradeSignal): Promise<boolean> {
    this.lastSignalRejectReason = null;
    if (!this.tradingEnabled) {
      this.lastSignalRejectReason = 'trading_disabled';
      return false;
    }

    const modelAccount = this.modelAccounts.get(signal.modelId);
    if (!modelAccount || !modelAccount.isActive) {
      this.lastSignalRejectReason = 'model_account_inactive';
      return false;
    }

    const gate = this.validateSignal(signal, modelAccount);
    if (!gate.ok) {
      this.lastSignalRejectReason = gate.reason || 'gate_rejected';
      this.emit('signal_rejected', { signal, reason: gate.reason });
      this.journal.append({
        ts: new Date().toISOString(),
        type: 'signal_rejected',
        modelId: signal.modelId,
        symbol: signal.symbol,
        reason: gate.reason,
      });
      return false;
    }

    const positionSizeUsd = this.calculatePositionSizeUsd(signal, modelAccount);
    if (positionSizeUsd < this.config.minTradeAmount) {
      this.lastSignalRejectReason = 'min_trade_amount';
      return false;
    }

    const orderResult = await this.executeTrade(signal, positionSizeUsd);
    if (!orderResult.success) {
      this.lastSignalRejectReason = orderResult?.error || 'order_failed';
      return false;
    }

    this.updateModelAccountOnOpen(signal, orderResult, modelAccount);

    this.journal.append({
      ts: new Date().toISOString(),
      type: 'trade_open',
      modelId: signal.modelId,
      symbol: signal.symbol,
      side: signal.side,
      entry: Number(orderResult.price),
      qty: Number(orderResult.quantity),
      confidence: signal.confidence,
      reason: signal.reason,
      risk: {
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        maxLeverage: this.config.maxLeverage,
      },
    });
    this.emit('trade_open', {
      modelId: signal.modelId,
      symbol: signal.symbol,
      side: signal.side,
      entry: Number(orderResult.price),
      quantity: Number(orderResult.quantity),
      confidence: signal.confidence,
      reason: signal.reason,
      leverage: signal.leverage || 1,
    });

    return true;
  }

  private validateSignal(signal: TradeSignal, account: ModelTradingAccount): { ok: boolean; reason?: string } {
    const minConfidence = this.config.minConfidence ?? 0.7;
    if (signal.confidence < minConfidence) return { ok: false, reason: 'low_confidence' };

    if (signal.leverage && signal.leverage > this.config.maxLeverage) return { ok: false, reason: 'leverage_limit' };

    const now = Date.now();
    if (account.cooldownUntil && new Date(account.cooldownUntil).getTime() > now) {
      return { ok: false, reason: 'cooldown_active' };
    }

    if (account.tradesToday >= (this.config.maxTradesPerDay ?? 5)) {
      return { ok: false, reason: 'max_trades_per_day' };
    }

    if (account.consecutiveLosses >= (this.config.maxConsecutiveLosses ?? 3)) {
      return { ok: false, reason: 'consecutive_losses_shutdown' };
    }

    const dailyLossLimit = account.allocatedBalance * this.config.maxDailyLoss;
    if (Math.abs(account.dailyPnl) >= dailyLossLimit) {
      return { ok: false, reason: 'daily_loss_limit' };
    }

    const killSwitchPct = this.config.killSwitchDrawdownPct ?? 0.05;
    const drawdownPct = (account.allocatedBalance - account.currentBalance) / account.allocatedBalance;
    if (drawdownPct >= killSwitchPct) {
      account.killSwitchTriggered = true;
      account.isActive = false;
      this.emit('risk_event', { type: 'kill_switch_triggered', modelId: account.modelId, drawdownPct });
      return { ok: false, reason: 'kill_switch_triggered' };
    }

    return { ok: true };
  }

  private calculatePositionSizeUsd(signal: TradeSignal, account: ModelTradingAccount): number {
    const maxPositionValue = account.currentBalance * this.config.maxPositionSize;
    const leverage = signal.leverage || 1;
    return maxPositionValue * leverage;
  }

  private async executeTrade(signal: TradeSignal, positionSizeUsd: number): Promise<any> {
    try {
      const symbol = signal.symbol.endsWith('USDT') ? signal.symbol : `${signal.symbol}USDT`;
      const currentPrice = await this.binance.getCurrentPrice(symbol);
      const quantity = (signal.quantity && signal.quantity > 0) ? signal.quantity : positionSizeUsd / currentPrice;

      if (signal.leverage && signal.leverage > 1) {
        try {
          await this.binance.setLeverage(symbol, signal.leverage);
        } catch {
          // Fallback: continue with order placement even if leverage update fails.
          // Some testnet account/symbol configurations reject leverage changes.
        }
      }

      const orderParams: OrderParams = {
        symbol,
        side: signal.side,
        type: signal.type,
        quantity,
        newClientOrderId: `${signal.modelId}_${Date.now()}`,
      };

      if (signal.type === 'LIMIT' && signal.price) {
        orderParams.price = signal.price;
        orderParams.timeInForce = 'GTC';
      }

      const orderResult = await this.binance.placeOrder(orderParams);

      const execQty = Number(orderResult.executedQty || 0);
      const origQty = Number(orderResult.origQty || 0);
      const resolvedQty = execQty > 0 ? execQty : (origQty > 0 ? origQty : Number(quantity));

      const avgPrice = Number(orderResult.avgPrice || 0);
      const orderPrice = Number(orderResult.price || 0);
      const resolvedPrice = avgPrice > 0 ? avgPrice : (orderPrice > 0 ? orderPrice : Number(currentPrice));

      return {
        success: true,
        orderId: orderResult.orderId,
        symbol: orderResult.symbol,
        side: orderResult.side,
        quantity: resolvedQty,
        price: resolvedPrice,
        status: orderResult.status,
      };
    } catch (error: any) {
      return { success: false, error: error?.message || 'order_failed' };
    }
  }

  private updateModelAccountOnOpen(signal: TradeSignal, orderResult: any, account: ModelTradingAccount) {
    const side: 'LONG' | 'SHORT' = signal.side === 'BUY' ? 'LONG' : 'SHORT';
    account.positions.push({
      symbol: signal.symbol,
      side,
      size: Number(orderResult.quantity),
      entryPrice: Number(orderResult.price),
      currentPrice: Number(orderResult.price),
      pnl: 0,
      leverage: signal.leverage || 1,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      openedAt: new Date().toISOString(),
    });
    account.totalTrades += 1;
    account.tradesToday += 1;
  }

  async updatePositions(): Promise<void> {
    for (const [, account] of this.modelAccounts) {
      for (const position of account.positions) {
        try {
          const symbol = position.symbol.endsWith('USDT') ? position.symbol : `${position.symbol}USDT`;
          const currentPrice = await this.binance.getCurrentPrice(symbol);
          position.currentPrice = currentPrice;

          const priceDiff = position.side === 'LONG' ? currentPrice - position.entryPrice : position.entryPrice - currentPrice;
          position.pnl = priceDiff * position.size * position.leverage;

          // hard stop-loss / take-profit auto close
          const stopHit = position.stopLoss ? ((position.side === 'LONG' && currentPrice <= position.stopLoss) || (position.side === 'SHORT' && currentPrice >= position.stopLoss)) : false;
          const tpHit = position.takeProfit ? ((position.side === 'LONG' && currentPrice >= position.takeProfit) || (position.side === 'SHORT' && currentPrice <= position.takeProfit)) : false;

          if (stopHit || tpHit) {
            await this.closePosition(account.modelId, position.symbol, stopHit ? 'stop_loss' : 'take_profit');
          }
        } catch {
          // ignore one position fetch failure
        }
      }

      // Reconcile with exchange positions for accurate display/state.
      try {
        const exchangePositions = await this.binance.getPositions();
        const live = exchangePositions
          .map((p: any) => {
            const amt = Number(p.positionAmt || 0);
            const entry = Number(p.entryPrice || 0);
            const mark = Number(p.markPrice || 0);
            const leverage = Number(p.leverage || 1);
            const upnl = Number(p.unRealizedProfit || p.unrealizedPnl || 0);
            if (!Number.isFinite(amt) || Math.abs(amt) <= 0 || entry <= 0) return null;
            const side: 'LONG' | 'SHORT' = amt > 0 ? 'LONG' : 'SHORT';
            return {
              symbol: String(p.symbol || ''),
              side,
              size: Math.abs(amt),
              entryPrice: entry,
              currentPrice: mark > 0 ? mark : entry,
              pnl: upnl,
              leverage: Number.isFinite(leverage) && leverage > 0 ? leverage : 1,
              openedAt: new Date().toISOString(),
              source: 'exchange' as const,
            };
          })
          .filter(Boolean) as any[];

        if (live.length > 0) {
          account.positions = live;
        }
      } catch {
        // keep local positions on exchange fetch failures
      }

      account.totalPnL = account.positions.reduce((sum, pos) => sum + pos.pnl, 0);
      account.dailyPnl = account.totalPnL;
      account.currentBalance = account.allocatedBalance + account.totalPnL;

      const drawdownPct = (account.allocatedBalance - account.currentBalance) / account.allocatedBalance;
      if (drawdownPct >= (this.config.killSwitchDrawdownPct ?? 0.05)) {
        account.killSwitchTriggered = true;
        account.isActive = false;
        this.emit('risk_event', { type: 'kill_switch_triggered', modelId: account.modelId, drawdownPct });
      }
    }
  }

  async closePosition(modelId: string, symbol: string, reason = 'manual') {
    const account = this.modelAccounts.get(modelId);
    if (!account) return;

    const index = account.positions.findIndex((p) => p.symbol === symbol);
    if (index === -1) return;

    const position = account.positions[index];
    const binanceSymbol = position.symbol.endsWith('USDT') ? position.symbol : `${position.symbol}USDT`;
    const oppositeSide: 'BUY' | 'SELL' = position.side === 'LONG' ? 'SELL' : 'BUY';

    await this.binance.placeOrder({
      symbol: binanceSymbol,
      side: oppositeSide,
      type: 'MARKET',
      quantity: position.size,
    });

    const pnl = position.pnl;
    account.positions.splice(index, 1);

    if (pnl <= 0) {
      account.consecutiveLosses += 1;
      const cooldownMinutes = this.config.cooldownMinutes ?? 30;
      account.cooldownUntil = new Date(Date.now() + cooldownMinutes * 60_000).toISOString();
    } else {
      account.consecutiveLosses = 0;
    }

    this.journal.append({
      ts: new Date().toISOString(),
      type: 'trade_close',
      modelId,
      symbol,
      pnl,
      reason,
      consecutiveLosses: account.consecutiveLosses,
      cooldownUntil: account.cooldownUntil || null,
    });
    this.emit('trade_close', {
      modelId,
      symbol,
      pnl,
      reason,
      consecutiveLosses: account.consecutiveLosses,
      cooldownUntil: account.cooldownUntil || null,
    });
  }

  async closeAllPositions(modelId: string): Promise<void> {
    const account = this.modelAccounts.get(modelId);
    if (!account) return;

    const symbols = [...account.positions.map((p) => p.symbol)];
    for (const symbol of symbols) {
      await this.closePosition(modelId, symbol, 'close_all');
    }
  }

  getModelAccount(modelId: string): ModelTradingAccount | undefined {
    return this.modelAccounts.get(modelId);
  }

  async getExchangeAccountInfo() {
    return this.binance.getAccountInfo();
  }

  getAllModelAccounts(): ModelTradingAccount[] {
    return Array.from(this.modelAccounts.values());
  }

  setTradingEnabled(enabled: boolean): void {
    this.tradingEnabled = enabled;
  }

  getTradingStatus() {
    return {
      connected: this.isConnected,
      enabled: this.tradingEnabled,
      accounts: this.modelAccounts.size,
      activePortfolios: this.getAllModelAccounts().map((a) => ({
        modelId: Number(a.modelId),
        modelName: a.modelName,
        currentBalance: a.currentBalance,
        positionsCount: a.positions.length,
        tradingEnabled: a.isActive,
        killSwitchTriggered: a.killSwitchTriggered,
        cooldownUntil: a.cooldownUntil || null,
      })),
    };
  }

  getJournalReview(lastN = 100) {
    return this.journal.review(lastN);
  }

  getJournalEntries(limit = 200) {
    return this.journal.list(limit);
  }

  getLastSignalRejectReason() {
    return this.lastSignalRejectReason;
  }
}
