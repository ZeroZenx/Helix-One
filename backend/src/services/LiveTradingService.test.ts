import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveTradingService } from './LiveTradingService';

function makeService(overrides: Partial<any> = {}) {
  const service = new LiveTradingService(
    { apiKey: 'x', secretKey: 'y', testnet: true },
    {
      maxPositionSize: 0.08,
      maxDailyLoss: 0.03,
      maxLeverage: 20,
      minLeverage: 10,
      maxOpenPositions: 4,
      minTradeAmount: 10,
      stopLossPercentage: 0.02,
      takeProfitPercentage: 0.05,
      maxTradesPerDay: 8,
      maxConsecutiveLosses: 3,
      minConfidence: 0.6,
      paperTrading: true,
      ...overrides,
    }
  );

  (service as any).isConnected = true;
  (service as any).tradingEnabled = true;
  service.createModelAccount('1', 'Test', 1000);
  return service;
}

describe('LiveTradingService risk policy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes leverage up to the minimum floor', () => {
    const service = makeService();
    const resolved = (service as any).resolveSignalLeverage({ leverage: 1 });
    expect(resolved).toBe(10);
  });

  it('caps leverage at configured maximum', () => {
    const service = makeService();
    const resolved = (service as any).resolveSignalLeverage({ leverage: 50 });
    expect(resolved).toBe(20);
  });

  it('rejects signals below confidence floor', async () => {
    const service = makeService();
    const ok = await service.processTradeSignal({
      modelId: '1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      confidence: 0.4,
      leverage: 10,
      reason: 'test',
      timestamp: new Date(),
    });
    expect(ok).toBe(false);
    expect(service.getLastSignalRejectReason()).toBe('low_confidence');
  });

  it('rejects signals below min leverage when explicitly provided', async () => {
    const service = makeService();
    const ok = await service.processTradeSignal({
      modelId: '1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      confidence: 0.8,
      leverage: 5,
      reason: 'test',
      timestamp: new Date(),
    });
    expect(ok).toBe(false);
    expect(service.getLastSignalRejectReason()).toBe('below_min_leverage');
  });

  it('paper trading path avoids live order placement', async () => {
    const service = makeService();
    const placeOrderSpy = vi.spyOn((service as any).binance, 'placeOrder');
    const placeOrderAtSpy = vi.spyOn((service as any).binance, 'placeOrderAt');
    const setLeverageSpy = vi.spyOn((service as any).binance, 'setLeverage');
    vi.spyOn((service as any).binance, 'getCurrentPrice').mockResolvedValue(50000);

    const ok = await service.processTradeSignal({
      modelId: '1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      confidence: 0.8,
      leverage: 10,
      reason: 'paper test',
      timestamp: new Date(),
    });

    expect(ok).toBe(true);
    expect(placeOrderSpy).not.toHaveBeenCalled();
    expect(placeOrderAtSpy).not.toHaveBeenCalled();
    expect(setLeverageSpy).not.toHaveBeenCalled();
  });

  it('rejects trades when max open positions is reached', async () => {
    const service = makeService({ maxOpenPositions: 1 });
    const account = (service as any).modelAccounts.get('1');
    account.positions.push({
      symbol: 'ETHUSDT',
      side: 'LONG',
      size: 1,
      entryPrice: 2000,
      currentPrice: 2000,
      pnl: 0,
      leverage: 10,
      openedAt: new Date().toISOString(),
    });

    const ok = await service.processTradeSignal({
      modelId: '1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      confidence: 0.8,
      leverage: 10,
      reason: 'max-open-test',
      timestamp: new Date(),
    });

    expect(ok).toBe(false);
    expect(service.getLastSignalRejectReason()).toBe('max_open_positions_reached');
  });
});
