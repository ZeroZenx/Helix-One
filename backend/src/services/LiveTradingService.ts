import { EventEmitter } from 'events';
import { BinanceService, OrderParams } from './BinanceService';
import { JournalService } from './JournalService';
import { StructuredLogger } from './StructuredLogger';

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
  maxOpenPositions?: number;
  minConfidence?: number;
  minLeverage?: number;
  paperTrading?: boolean;
  maxUnprotectedPositionSeconds?: number;
  stopPlacementRetries?: number;
  breakEvenEnabled?: boolean;
  breakEvenTriggerR?: number;
  breakEvenBufferPct?: number;
  breakEvenFeeBps?: number;
  breakEvenSlippageBps?: number;
  letWinnersRunEnabled?: boolean;
  runnerActivationR?: number;
  runnerPartialTakeProfitPct?: number;
  runnerTrailPct?: number;
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
  lastTradeDay?: string;
  realizedPnL: number;
  dailyRealizedPnL: number;
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
    runnerMode?: boolean;
    partialTakenPct?: number;
    bestPrice?: number;
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
  private logger = new StructuredLogger('trading');
  private lastSignalRejectReason: string | null = null;
  private unprotectedSince: Map<string, number> = new Map();

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

  private breakEvenProtectionPct() {
    const manualBufferPct = Math.max(0, this.config.breakEvenBufferPct ?? 0);
    const feePct = Math.max(0, this.config.breakEvenFeeBps ?? 8) / 10000;
    const slippagePct = Math.max(0, this.config.breakEvenSlippageBps ?? 5) / 10000;
    return manualBufferPct + feePct + slippagePct;
  }

  private breakEvenStopFor(position: { side: 'LONG' | 'SHORT'; entryPrice: number }, extraBufferPct = 0) {
    const entry = Number(position.entryPrice || 0);
    if (!Number.isFinite(entry) || entry <= 0) throw new Error('invalid_entry_price');
    const protectionPct = this.breakEvenProtectionPct() + Math.max(0, extraBufferPct);
    return position.side === 'LONG'
      ? entry * (1 + protectionPct)
      : entry * (1 - protectionPct);
  }

  createModelAccount(modelId: string, modelName: string, allocatedBalance: number): ModelTradingAccount {
    const existing = this.modelAccounts.get(modelId);
    if (existing) return existing;

    const account: ModelTradingAccount = {
      modelId,
      modelName,
      allocatedBalance,
      currentBalance: allocatedBalance,
      realizedPnL: 0,
      dailyRealizedPnL: 0,
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

    signal.leverage = this.resolveSignalLeverage(signal);

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

    const protections = await this.ensurePositionProtection(signal, orderResult);
    if (!protections.ok) {
      this.lastSignalRejectReason = protections.reason || 'unprotected_position_force_closed';
      await this.forceCloseUnprotectedOrder(orderResult, signal);
      this.emit('signal_rejected', { signal, reason: this.lastSignalRejectReason });
      this.journal.append({
        ts: new Date().toISOString(),
        type: 'risk_event',
        modelId: signal.modelId,
        symbol: signal.symbol,
        reason: this.lastSignalRejectReason,
      });
      return false;
    }

    signal.stopLoss = protections.stopLoss;
    signal.takeProfit = protections.takeProfit;
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
      execution: {
        orderId: orderResult.orderId,
        requestedPrice: Number(orderResult.requestedPrice || signal.price || 0),
        fillPrice: Number(orderResult.price || 0),
        slippageBps: Number(orderResult.slippageBps || 0),
        status: orderResult.status,
        paper: Boolean(orderResult.paper),
      },
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

  private reconcileAccountRiskState(account: ModelTradingAccount): void {
    const now = Date.now();

    // Reset daily counters when UTC day changes.
    const utcDay = new Date(now).toISOString().slice(0, 10);
    if (account.lastTradeDay !== utcDay) {
      account.tradesToday = 0;
      account.dailyPnl = 0;
      account.dailyRealizedPnL = 0;
      account.lastTradeDay = utcDay;
    }

    // Cooldown expiry should unlock the consecutive-loss shutdown.
    if (account.cooldownUntil && new Date(account.cooldownUntil).getTime() <= now) {
      account.cooldownUntil = undefined;
      account.consecutiveLosses = 0;
    }
  }

  private validateSignal(signal: TradeSignal, account: ModelTradingAccount): { ok: boolean; reason?: string } {
    this.reconcileAccountRiskState(account);

    const minConfidence = this.config.minConfidence ?? 0.7;
    if (signal.confidence < minConfidence) return { ok: false, reason: 'low_confidence' };

    const requestedLeverage = Number(signal.leverage || 0);
    const minLeverage = Math.max(1, Number(this.config.minLeverage || 1));
    const maxLeverage = Math.max(minLeverage, Number(this.config.maxLeverage || minLeverage));
    if (requestedLeverage > 0 && requestedLeverage < minLeverage) return { ok: false, reason: 'below_min_leverage' };
    if (requestedLeverage > maxLeverage) return { ok: false, reason: 'leverage_limit' };

    const now = Date.now();
    if (account.cooldownUntil && new Date(account.cooldownUntil).getTime() > now) {
      return { ok: false, reason: 'cooldown_active' };
    }

    if (account.tradesToday >= (this.config.maxTradesPerDay ?? 5)) {
      return { ok: false, reason: 'max_trades_per_day' };
    }

    if (account.positions.length >= ((this.config as any).maxOpenPositions ?? 4)) {
      return { ok: false, reason: 'max_open_positions_reached' };
    }

    if (account.consecutiveLosses >= (this.config.maxConsecutiveLosses ?? 3)) {
      return { ok: false, reason: 'consecutive_losses_shutdown' };
    }

    const dailyLossLimit = account.allocatedBalance * this.config.maxDailyLoss;
    if (Math.abs(Math.min(account.dailyPnl, 0)) >= dailyLossLimit) {
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
    const leverage = this.resolveSignalLeverage(signal);
    return maxPositionValue * leverage;
  }

  private resolveSignalLeverage(signal: TradeSignal): number {
    const minLeverage = Math.max(1, Number(this.config.minLeverage || 1));
    const maxLeverage = Math.max(minLeverage, Number(this.config.maxLeverage || minLeverage));
    const requested = Number(signal.leverage || minLeverage);
    if (!Number.isFinite(requested) || requested <= 0) return minLeverage;
    return Math.max(minLeverage, Math.min(maxLeverage, requested));
  }

  private async executeTrade(signal: TradeSignal, positionSizeUsd: number): Promise<any> {
    try {
      const symbol = signal.symbol.endsWith('USDT') ? signal.symbol : `${signal.symbol}USDT`;
      const currentPrice = await this.binance.getCurrentPrice(symbol);
      const quantity = (signal.quantity && signal.quantity > 0) ? signal.quantity : positionSizeUsd / currentPrice;

      if (this.config.paperTrading) {
        const syntheticPrice = Number(currentPrice);
        return {
          success: true,
          orderId: Number(`9${Date.now()}`),
          symbol,
          side: signal.side,
          quantity,
          price: syntheticPrice,
          requestedPrice: Number(signal.price || currentPrice),
          slippageBps: 0,
          status: 'FILLED',
          paper: true,
        };
      }

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
      const requestedPrice = Number(signal.price || currentPrice);
      const sideMultiplier = signal.side === 'BUY' ? 1 : -1;
      const slippageBps = requestedPrice > 0
        ? ((resolvedPrice - requestedPrice) / requestedPrice) * 10000 * sideMultiplier
        : 0;

      return {
        success: true,
        orderId: orderResult.orderId,
        symbol: orderResult.symbol,
        side: orderResult.side,
        quantity: resolvedQty,
        price: resolvedPrice,
        requestedPrice,
        slippageBps,
        status: orderResult.status,
      };
    } catch (error: any) {
      return { success: false, error: error?.message || 'order_failed' };
    }
  }

  private async ensurePositionProtection(signal: TradeSignal, orderResult: any): Promise<{ ok: boolean; reason?: string; stopLoss: number; takeProfit?: number }> {
    const side = signal.side;
    const entry = Number(orderResult.price || signal.price || 0);
    if (!(entry > 0)) return { ok: false, reason: 'missing_entry_price', stopLoss: 0 };

    if (this.config.paperTrading) {
      const stopLoss = signal.stopLoss ?? (side === 'BUY'
        ? entry * (1 - this.config.stopLossPercentage)
        : entry * (1 + this.config.stopLossPercentage));
      const takeProfit = signal.takeProfit ?? (side === 'BUY'
        ? entry * (1 + this.config.takeProfitPercentage)
        : entry * (1 - this.config.takeProfitPercentage));
      return { ok: true, stopLoss, takeProfit };
    }

    const stopLoss = signal.stopLoss ?? (side === 'BUY'
      ? entry * (1 - this.config.stopLossPercentage)
      : entry * (1 + this.config.stopLossPercentage));

    const takeProfit = signal.takeProfit ?? (side === 'BUY'
      ? entry * (1 + this.config.takeProfitPercentage)
      : entry * (1 - this.config.takeProfitPercentage));

    const symbol = String(orderResult.symbol || signal.symbol).endsWith('USDT')
      ? String(orderResult.symbol || signal.symbol)
      : `${String(orderResult.symbol || signal.symbol)}USDT`;

    const closeSide: 'BUY' | 'SELL' = side === 'BUY' ? 'SELL' : 'BUY';
    const qty = Number(orderResult.quantity || signal.quantity || 0);
    const retries = Math.max(1, this.config.stopPlacementRetries ?? 2);
    let lastErrorMsg = 'unknown';

    const ladder: Array<{ label: string; endpoint: string; make: (i: number) => OrderParams }> = [
      {
        label: 'fapi_close_position_mark',
        endpoint: '/fapi/v1/order',
        make: (i) => ({
          symbol,
          side: closeSide,
          type: 'STOP_MARKET',
          stopPrice: stopLoss,
          closePosition: true,
          workingType: 'MARK_PRICE',
          newClientOrderId: `${signal.modelId}_sl_cp_${Date.now()}_${i}`,
        } as OrderParams),
      },
      {
        label: 'fapi_close_position_contract',
        endpoint: '/fapi/v1/order',
        make: (i) => ({
          symbol,
          side: closeSide,
          type: 'STOP_MARKET',
          stopPrice: stopLoss,
          closePosition: true,
          workingType: 'CONTRACT_PRICE',
          newClientOrderId: `${signal.modelId}_sl_cpc_${Date.now()}_${i}`,
        } as OrderParams),
      },
      {
        label: 'fapi_reduce_only_qty',
        endpoint: '/fapi/v1/order',
        make: (i) => ({
          symbol,
          side: closeSide,
          type: 'STOP_MARKET',
          stopPrice: stopLoss,
          quantity: qty > 0 ? qty : undefined,
          reduceOnly: true,
          workingType: 'MARK_PRICE',
          newClientOrderId: `${signal.modelId}_sl_ro_${Date.now()}_${i}`,
        } as OrderParams),
      },
      {
        label: 'papi_um_close_position_mark',
        endpoint: '/papi/v1/um/order',
        make: (i) => ({
          symbol,
          side: closeSide,
          type: 'STOP_MARKET',
          stopPrice: stopLoss,
          closePosition: true,
          workingType: 'MARK_PRICE',
          newClientOrderId: `${signal.modelId}_sl_papi_${Date.now()}_${i}`,
        } as OrderParams),
      },
      {
        label: 'papi_um_reduce_only_qty',
        endpoint: '/papi/v1/um/order',
        make: (i) => ({
          symbol,
          side: closeSide,
          type: 'STOP_MARKET',
          stopPrice: stopLoss,
          quantity: qty > 0 ? qty : undefined,
          reduceOnly: true,
          workingType: 'MARK_PRICE',
          newClientOrderId: `${signal.modelId}_sl_papiro_${Date.now()}_${i}`,
        } as OrderParams),
      },
    ];

    for (const variant of ladder) {
      for (let i = 0; i < retries; i += 1) {
        try {
          await this.binance.placeOrderAt(variant.endpoint, variant.make(i));
          this.logger.info('protective_stop_attached', {
            symbol,
            modelId: signal.modelId,
            variant: variant.label,
            stopLoss,
          });
          return { ok: true, stopLoss, takeProfit };
        } catch (error: any) {
          lastErrorMsg = String(error?.message || 'unknown');
          this.logger.warn('protective_stop_failed', {
            symbol,
            modelId: signal.modelId,
            variant: variant.label,
            tryIndex: i + 1,
            error: lastErrorMsg,
          });
        }
      }
    }

    const compact = lastErrorMsg.replace(/\s+/g, '_').slice(0, 140);
    return { ok: false, reason: `stop_placement_failed:${compact}`, stopLoss, takeProfit };
  }

  private async forceCloseUnprotectedOrder(orderResult: any, signal: TradeSignal): Promise<void> {
    try {
      if (this.config.paperTrading) return;
      const symbol = String(orderResult.symbol || signal.symbol).endsWith('USDT')
        ? String(orderResult.symbol || signal.symbol)
        : `${String(orderResult.symbol || signal.symbol)}USDT`;
      const qty = Number(orderResult.quantity || signal.quantity || 0);
      if (!(qty > 0)) return;
      await this.binance.placeOrder({
        symbol,
        side: signal.side === 'BUY' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: qty,
        newClientOrderId: `${signal.modelId}_forceclose_${Date.now()}`,
      });
      this.logger.warn('unprotected_position_force_closed', {
        symbol,
        modelId: signal.modelId,
        qty,
      });
    } catch (error: any) {
      this.logger.error('unprotected_position_force_close_failed', {
        symbol: signal.symbol,
        modelId: signal.modelId,
        error: error?.message || 'unknown',
      });
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
    account.lastTradeDay = new Date().toISOString().slice(0, 10);
  }

  async updatePositions(): Promise<void> {
    for (const [, account] of this.modelAccounts) {
      this.reconcileAccountRiskState(account);

      for (const position of account.positions) {
        try {
          const symbol = position.symbol.endsWith('USDT') ? position.symbol : `${position.symbol}USDT`;
          const currentPrice = await this.binance.getCurrentPrice(symbol);
          position.currentPrice = currentPrice;

          const priceDiff = position.side === 'LONG' ? currentPrice - position.entryPrice : position.entryPrice - currentPrice;
          position.pnl = priceDiff * position.size * position.leverage;

          // hard stop-loss / take-profit auto close
          const riskPerUnit = position.stopLoss ? Math.abs(position.entryPrice - position.stopLoss) : 0;
          let achievedR = 0;
          if (riskPerUnit > 0) {
            const favorableMove = position.side === 'LONG'
              ? currentPrice - position.entryPrice
              : position.entryPrice - currentPrice;
            achievedR = favorableMove / riskPerUnit;
          }
          const breakEvenTriggerR = this.config.breakEvenTriggerR ?? 1;
          const breakEvenEnabled = Boolean(this.config.breakEvenEnabled);
          if (breakEvenEnabled && riskPerUnit > 0) {
            const breakEvenStop = this.breakEvenStopFor(position);
            const shouldAdvance = achievedR >= breakEvenTriggerR;
            const improvesStop = !position.stopLoss || (
              position.side === 'LONG'
                ? breakEvenStop > position.stopLoss
                : breakEvenStop < position.stopLoss
            );
            if (shouldAdvance && improvesStop) {
              await this.updateStopLoss(account.modelId, position.symbol, breakEvenStop);
              position.stopLoss = breakEvenStop;
              this.journal.append({
                ts: new Date().toISOString(),
                type: 'break_even_plus_armed',
                modelId: account.modelId,
                symbol: position.symbol,
                stopLoss: breakEvenStop,
                achievedR,
                costProtectionPct: this.breakEvenProtectionPct(),
                reason: 'winner_reached_r_threshold_stop_moved_to_cost_aware_be_plus',
              });
            }
          }

          const activateRunner = async (reason: string) => {
            const pct = Math.max(5, Math.min(80, Number(this.config.runnerPartialTakeProfitPct || 30)));
            await this.partialClosePosition(account.modelId, position.symbol, pct);
            position.partialTakenPct = pct;
            position.runnerMode = true;
            position.takeProfit = undefined;
            position.stopLoss = this.breakEvenStopFor(position);
            await this.updateStopLoss(account.modelId, position.symbol, position.stopLoss);
            this.journal.append({
              ts: new Date().toISOString(),
              type: 'winner_runner_activated',
              modelId: account.modelId,
              symbol: position.symbol,
              partialTakenPct: pct,
              stopLoss: position.stopLoss,
              achievedR,
              reason,
            });
          };

          const stopHit = position.stopLoss ? ((position.side === 'LONG' && currentPrice <= position.stopLoss) || (position.side === 'SHORT' && currentPrice >= position.stopLoss)) : false;
          const tpHit = position.takeProfit ? ((position.side === 'LONG' && currentPrice >= position.takeProfit) || (position.side === 'SHORT' && currentPrice <= position.takeProfit)) : false;

          if (stopHit) {
            await this.closePosition(account.modelId, position.symbol, 'stop_loss');
            continue;
          }

          if (tpHit) {
            if (this.config.letWinnersRunEnabled) {
              const alreadyPartial = Number(position.partialTakenPct || 0) > 0;
              if (!alreadyPartial) {
                await activateRunner('take_profit_hit_partial_taken_runner_left_open');
              } else {
                position.runnerMode = true;
                position.takeProfit = undefined;
              }
            } else {
              await this.closePosition(account.modelId, position.symbol, 'take_profit');
              continue;
            }
          }

          if (!tpHit && this.config.letWinnersRunEnabled && riskPerUnit > 0 && Number(position.partialTakenPct || 0) <= 0 && !position.runnerMode) {
            const activationR = Math.max(1, Math.min(10, Number(this.config.runnerActivationR || 2)));
            if (achievedR >= activationR) {
              await activateRunner(`profit_reached_${activationR.toFixed(2)}r_partial_taken_runner_left_open`);
            }
          }

          if (this.config.letWinnersRunEnabled && position.runnerMode) {
            const trailPct = Math.max(0.001, Math.min(0.2, Number(this.config.runnerTrailPct || 0.006)));
            position.bestPrice = position.bestPrice && position.bestPrice > 0
              ? (position.side === 'LONG' ? Math.max(position.bestPrice, currentPrice) : Math.min(position.bestPrice, currentPrice))
              : currentPrice;
            const trailingStop = position.side === 'LONG'
              ? position.bestPrice * (1 - trailPct)
              : position.bestPrice * (1 + trailPct);
            const costAwareFloor = this.breakEvenStopFor(position);
            const candidateStop = position.side === 'LONG'
              ? Math.max(trailingStop, costAwareFloor)
              : Math.min(trailingStop, costAwareFloor);
            const improvesStop = !position.stopLoss || (
              position.side === 'LONG'
                ? candidateStop > position.stopLoss
                : candidateStop < position.stopLoss
            );
            if (improvesStop) {
              await this.updateStopLoss(account.modelId, position.symbol, candidateStop);
              position.stopLoss = candidateStop;
              this.journal.append({
                ts: new Date().toISOString(),
                type: 'runner_stop_trailed',
                modelId: account.modelId,
                symbol: position.symbol,
                stopLoss: candidateStop,
                bestPrice: position.bestPrice,
                trailPct,
              });
            }
          }
        } catch {
          // ignore one position fetch failure
        }
      }

      // Reconcile with exchange positions for accurate display/state.
      try {
        const exchangePositions = await this.binance.getPositions();
        const openOrders = await this.binance.getOpenOrders().catch(() => [] as any[]);
        const localBySymbol = new Map(account.positions.map((p) => [p.symbol, p]));
        const live = exchangePositions
          .map((p: any) => {
            const amt = Number(p.positionAmt || 0);
            const entry = Number(p.entryPrice || 0);
            const mark = Number(p.markPrice || 0);
            const leverage = Number(p.leverage || 1);
            const upnl = Number(p.unRealizedProfit || p.unrealizedPnl || 0);
            if (!Number.isFinite(amt) || Math.abs(amt) <= 0 || entry <= 0) return null;
            const side: 'LONG' | 'SHORT' = amt > 0 ? 'LONG' : 'SHORT';
            const symbol = String(p.symbol || '');
            const prior = localBySymbol.get(symbol);
            const closeSide = side === 'LONG' ? 'SELL' : 'BUY';
            const symbolOrders = openOrders.filter((o: any) => String(o?.symbol || '') === symbol && String(o?.status || '').toUpperCase() === 'NEW' && String(o?.side || '').toUpperCase() === closeSide);
            const stopOrder = symbolOrders.find((o: any) => String(o?.type || '').toUpperCase().includes('STOP'));
            const tpOrder = symbolOrders.find((o: any) => String(o?.type || '').toUpperCase().includes('TAKE_PROFIT'));
            const stopFromOrder = Number(stopOrder?.stopPrice || stopOrder?.price || 0);
            const tpFromOrder = Number(tpOrder?.stopPrice || tpOrder?.price || 0);
            return {
              symbol,
              side,
              size: Math.abs(amt),
              entryPrice: entry,
              currentPrice: mark > 0 ? mark : entry,
              pnl: upnl,
              leverage: Number.isFinite(leverage) && leverage > 0 ? leverage : 1,
              stopLoss: stopFromOrder > 0 ? stopFromOrder : prior?.stopLoss,
              takeProfit: tpFromOrder > 0 ? tpFromOrder : prior?.takeProfit,
              openedAt: prior?.openedAt || new Date().toISOString(),
              source: 'exchange' as const,
              runnerMode: prior?.runnerMode,
              partialTakenPct: prior?.partialTakenPct,
              bestPrice: prior?.bestPrice,
            };
          })
          .filter(Boolean) as any[];

        // Exchange fetch succeeded: make exchange state canonical (including zero positions).
        account.positions = live;
      } catch {
        // keep local positions on exchange fetch failures
      }

      const graceMs = Math.max(15, this.config.maxUnprotectedPositionSeconds ?? 60) * 1000;
      for (const pos of account.positions) {
        const key = `${account.modelId}:${pos.symbol}`;
        if (pos.stopLoss && Number(pos.stopLoss) > 0) {
          this.unprotectedSince.delete(key);
          continue;
        }

        const firstSeen = this.unprotectedSince.get(key) ?? Date.now();
        this.unprotectedSince.set(key, firstSeen);
        const ageMs = Date.now() - firstSeen;

        if (ageMs < graceMs) {
          this.logger.warn('unprotected_position_detected', {
            modelId: account.modelId,
            symbol: pos.symbol,
            ageMs,
          });
          continue;
        }

        const emergencyStop = pos.side === 'LONG'
          ? pos.currentPrice * (1 - this.config.stopLossPercentage)
          : pos.currentPrice * (1 + this.config.stopLossPercentage);

        let attached = false;
        const symbol = pos.symbol.endsWith('USDT') ? pos.symbol : `${pos.symbol}USDT`;
        const closeSide: 'BUY' | 'SELL' = pos.side === 'LONG' ? 'SELL' : 'BUY';
        const qty = Number(pos.size || 0);
        const retries = Math.max(1, this.config.stopPlacementRetries ?? 2);
        const ladder: Array<{ label: string; endpoint: string; make: (i: number) => OrderParams }> = [
          {
            label: 'papi_um_close_position_mark',
            endpoint: '/papi/v1/um/order',
            make: (i) => ({
              symbol,
              side: closeSide,
              type: 'STOP_MARKET',
              stopPrice: emergencyStop,
              closePosition: true,
              workingType: 'MARK_PRICE',
              newClientOrderId: `${account.modelId}_reprotect_papi_${Date.now()}_${i}`,
            } as OrderParams),
          },
          {
            label: 'papi_um_reduce_only_qty',
            endpoint: '/papi/v1/um/order',
            make: (i) => ({
              symbol,
              side: closeSide,
              type: 'STOP_MARKET',
              stopPrice: emergencyStop,
              quantity: qty > 0 ? qty : undefined,
              reduceOnly: true,
              workingType: 'MARK_PRICE',
              newClientOrderId: `${account.modelId}_reprotect_papiro_${Date.now()}_${i}`,
            } as OrderParams),
          },
        ];

        for (const variant of ladder) {
          for (let i = 0; i < retries; i += 1) {
            try {
              await this.binance.placeOrderAt(variant.endpoint, variant.make(i));
              pos.stopLoss = emergencyStop;
              attached = true;
              this.unprotectedSince.delete(key);
              this.logger.warn('unprotected_position_recovered', {
                modelId: account.modelId,
                symbol: pos.symbol,
                stopLoss: emergencyStop,
                variant: variant.label,
              });
              break;
            } catch (error: any) {
              this.logger.warn('unprotected_position_reprotect_failed', {
                modelId: account.modelId,
                symbol: pos.symbol,
                variant: variant.label,
                tryIndex: i + 1,
                error: error?.message || 'unknown',
              });
            }
          }
          if (attached) break;
        }

        if (!attached) {
          await this.closePosition(account.modelId, pos.symbol, 'unprotected_position_timeout');
          this.unprotectedSince.delete(key);
        }
      }

      const openPnL = account.positions.reduce((sum, pos) => sum + pos.pnl, 0);
      account.totalPnL = account.realizedPnL + openPnL;
      account.dailyPnl = account.dailyRealizedPnL + openPnL;
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

    if (!this.config.paperTrading) {
      await this.binance.placeOrder({
        symbol: binanceSymbol,
        side: oppositeSide,
        type: 'MARKET',
        quantity: position.size,
      });
    }

    const pnl = position.pnl;
    account.positions.splice(index, 1);
    account.realizedPnL += pnl;
    account.dailyRealizedPnL += pnl;

    if (pnl <= 0) {
      account.consecutiveLosses += 1;
      const cooldownMinutes = this.config.cooldownMinutes ?? 30;
      account.cooldownUntil = new Date(Date.now() + cooldownMinutes * 60_000).toISOString();
    } else {
      account.consecutiveLosses = 0;
      account.cooldownUntil = undefined;
    }
    account.lastTradeDay = new Date().toISOString().slice(0, 10);
    const openPnL = account.positions.reduce((sum, pos) => sum + pos.pnl, 0);
    account.totalPnL = account.realizedPnL + openPnL;
    account.dailyPnl = account.dailyRealizedPnL + openPnL;
    account.currentBalance = account.allocatedBalance + account.totalPnL;

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

  async getOpenOrders(symbol?: string) {
    return this.binance.getOpenOrders(symbol);
  }

  async cancelOpenOrder(symbol: string, orderId: number) {
    return this.binance.cancelOrder(symbol, orderId);
  }

  async updateStopLoss(modelId: string, symbol: string, stopLoss: number) {
    const account = this.modelAccounts.get(modelId);
    if (!account) throw new Error('model_not_found');

    const pos = account.positions.find((p) => String(p.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (!pos) throw new Error('position_not_found');
    if (!Number.isFinite(stopLoss) || stopLoss <= 0) throw new Error('invalid_stop_loss');

    const binanceSymbol = pos.symbol.endsWith('USDT') ? pos.symbol : `${pos.symbol}USDT`;
    const closeSide: 'BUY' | 'SELL' = pos.side === 'LONG' ? 'SELL' : 'BUY';
    const qty = Number(pos.size || 0);

    try {
      const orders = await this.binance.getOpenOrders(binanceSymbol);
      for (const o of orders) {
        const t = String(o?.type || '').toUpperCase();
        const s = String(o?.side || '').toUpperCase();
        const status = String(o?.status || '').toUpperCase();
        const orderId = Number(o?.orderId);
        if (status !== 'NEW' || !Number.isFinite(orderId) || orderId <= 0) continue;
        if (!t.includes('STOP') || s !== closeSide) continue;
        try { await this.binance.cancelOrder(binanceSymbol, orderId); } catch {}
      }
    } catch {}

    const retries = Math.max(1, this.config.stopPlacementRetries ?? 2);
    const ladder: Array<{ endpoint: string; make: (i: number) => OrderParams }> = [
      {
        endpoint: '/papi/v1/um/order',
        make: (i) => ({
          symbol: binanceSymbol,
          side: closeSide,
          type: 'STOP_MARKET',
          stopPrice: stopLoss,
          closePosition: true,
          workingType: 'MARK_PRICE',
          newClientOrderId: `${modelId}_manualsl_papi_${Date.now()}_${i}`,
        } as OrderParams),
      },
      {
        endpoint: '/papi/v1/um/order',
        make: (i) => ({
          symbol: binanceSymbol,
          side: closeSide,
          type: 'STOP_MARKET',
          stopPrice: stopLoss,
          quantity: qty > 0 ? qty : undefined,
          reduceOnly: true,
          workingType: 'MARK_PRICE',
          newClientOrderId: `${modelId}_manualsl_ro_${Date.now()}_${i}`,
        } as OrderParams),
      },
    ];

    let placed = false;
    for (const variant of ladder) {
      for (let i = 0; i < retries; i += 1) {
        try {
          await this.binance.placeOrderAt(variant.endpoint, variant.make(i));
          placed = true;
          break;
        } catch {
          // try next variant/retry
        }
      }
      if (placed) break;
    }

    if (!placed) throw new Error('stop_update_exchange_failed');

    pos.stopLoss = stopLoss;

    this.journal.append({
      ts: new Date().toISOString(),
      type: 'manual_stop_update',
      modelId,
      symbol: pos.symbol,
      stopLoss,
    });

    return { success: true, symbol: pos.symbol, stopLoss };
  }

  async secureBreakEven(modelId: string, symbol: string, bufferPct = 0.001) {
    const account = this.modelAccounts.get(modelId);
    if (!account) throw new Error('model_not_found');

    const pos = account.positions.find((p) => String(p.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (!pos) throw new Error('position_not_found');

    const safeBuffer = Number.isFinite(bufferPct) && bufferPct >= 0 ? bufferPct : 0.001;
    const stopLoss = this.breakEvenStopFor(pos, safeBuffer);

    await this.updateStopLoss(modelId, symbol, stopLoss);
    return {
      success: true,
      symbol: pos.symbol,
      stopLoss,
      bufferPct: safeBuffer,
      costProtectionPct: this.breakEvenProtectionPct(),
      feeBps: this.config.breakEvenFeeBps ?? 8,
      slippageBps: this.config.breakEvenSlippageBps ?? 5,
    };
  }

  async partialClosePosition(modelId: string, symbol: string, percent: number) {
    const account = this.modelAccounts.get(modelId);
    if (!account) throw new Error('model_not_found');

    const pos = account.positions.find((p) => String(p.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (!pos) throw new Error('position_not_found');

    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) throw new Error('invalid_percent');

    const currentSize = Number(pos.size || 0);
    if (!Number.isFinite(currentSize) || currentSize <= 0) throw new Error('invalid_position_size');

    const closeQty = Number((currentSize * (pct / 100)).toFixed(8));
    if (!Number.isFinite(closeQty) || closeQty <= 0) throw new Error('partial_close_qty_too_small');

    const binanceSymbol = pos.symbol.endsWith('USDT') ? pos.symbol : `${pos.symbol}USDT`;
    const closeSide: 'BUY' | 'SELL' = pos.side === 'LONG' ? 'SELL' : 'BUY';

    if (!this.config.paperTrading) {
      await this.binance.placeOrder({
        symbol: binanceSymbol,
        side: closeSide,
        type: 'MARKET',
        quantity: closeQty,
        reduceOnly: true,
      });
    }

    const realizedPnlPortion = Number(pos.pnl || 0) * (pct / 100);
    const remainingSize = Number((currentSize - closeQty).toFixed(8));

    account.realizedPnL += realizedPnlPortion;
    account.dailyRealizedPnL += realizedPnlPortion;

    if (remainingSize <= 0) {
      const idx = account.positions.findIndex((p) => String(p.symbol).toUpperCase() === String(symbol).toUpperCase());
      if (idx >= 0) account.positions.splice(idx, 1);
    } else {
      pos.size = remainingSize;
      pos.pnl = Number(pos.pnl || 0) - realizedPnlPortion;
    }

    account.lastTradeDay = new Date().toISOString().slice(0, 10);
    const openPnL = account.positions.reduce((sum, openPos) => sum + openPos.pnl, 0);
    account.totalPnL = account.realizedPnL + openPnL;
    account.dailyPnl = account.dailyRealizedPnL + openPnL;
    account.currentBalance = account.allocatedBalance + account.totalPnL;

    this.journal.append({
      ts: new Date().toISOString(),
      type: 'partial_close',
      modelId,
      symbol: pos.symbol,
      percent: pct,
      qtyClosed: closeQty,
      remainingQty: Math.max(remainingSize, 0),
      pnl: realizedPnlPortion,
    });

    return {
      success: true,
      symbol: pos.symbol,
      percent: pct,
      qtyClosed: closeQty,
      remainingQty: Math.max(remainingSize, 0),
      realizedPnl: realizedPnlPortion,
    };
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
        positions: a.positions.map((p) => ({
          symbol: p.symbol,
          side: p.side,
          size: p.size,
          entryPrice: p.entryPrice,
          currentPrice: p.currentPrice,
          pnl: p.pnl,
          leverage: p.leverage,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          openedAt: p.openedAt,
        })),
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
