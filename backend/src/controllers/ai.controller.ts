import { Request, Response } from 'express';
import { AIProvider, AIService } from '../services/ai.service';
import { PrismaClient } from '@prisma/client';
import { BinanceService } from '../services/BinanceService';
import { RiskIntelService } from '../services/RiskIntelService';
import { SettingsStore } from '../services/SettingsStore';

const aiService = new AIService();
const prisma = new PrismaClient();
const riskIntel = new RiskIntelService();
const settingsStore = new SettingsStore();

function normalizeSymbol(input: string): string {
  const s = String(input || '').toUpperCase().trim();
  if (!s) return '';
  return s.endsWith('USDT') ? s : `${s}USDT`;
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let out = values[0];
  for (let i = 1; i < values.length; i += 1) out = values[i] * k + out * (1 - k);
  return out;
}

function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

function macd(values: number[]): number {
  if (values.length < 26) return 0;
  return ema(values, 12) - ema(values, 26);
}

function atr(klines: any[], period = 14): number {
  if (klines.length <= period) return 0;
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i += 1) {
    const high = Number(klines[i][2] || 0);
    const low = Number(klines[i][3] || 0);
    const prevClose = Number(klines[i - 1][4] || 0);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * Chat with a trading model
 */
export const chatWithModel = async (req: Request, res: Response) => {
  try {
    const { modelId } = req.params;
    const { message } = req.body;
    const provider = 'deepseek';

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const modelData = await prisma.model.findUnique({
      where: { id: parseInt(modelId) }
    });

    if (!modelData) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const aiResponse = await aiService.chatWithModel(
      modelData.name,
      message,
      modelData,
      'deepseek'
    );

    res.json({
      model: modelData.name,
      response: aiResponse,
      provider
    });

  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get AI market analysis
 */
export const getMarketAnalysis = async (req: Request, res: Response) => {
  try {
    const provider = 'deepseek';

    return res.status(501).json({
      error: 'Market analysis requires a live market data provider. No mock data is served.'
    });

  } catch (error: any) {
    console.error('Market analysis error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get AI trading signal
 */
export const getTradingSignal = async (req: Request, res: Response) => {
  try {
    const { symbol, provider = 'deepseek' } = req.body;
    const selectedProvider: AIProvider = provider === 'deepseek' ? 'deepseek' : 'deepseek';
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedSymbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const settings = settingsStore.get();
    const binance = new BinanceService({
      apiKey: settings.masterApiKey || 'public',
      secretKey: settings.masterSecretKey || 'public',
      testnet: settings.testnet,
    });

    const [ticker, klines, riskSnapshot] = await Promise.all([
      binance.get24hrTicker(normalizedSymbol),
      binance.getKlines(normalizedSymbol, '5m', 200),
      riskIntel.getSnapshot([normalizedSymbol, 'BTCUSDT', 'ETHUSDT']),
    ]);

    if (!ticker || !Array.isArray(klines) || klines.length < 30) {
      return res.status(503).json({ error: `Insufficient live market data for ${normalizedSymbol}.` });
    }

    const closes = klines.map((k) => Number(k[4] || 0)).filter((x) => Number.isFinite(x) && x > 0);
    const volumes = klines.map((k) => Number(k[5] || 0)).filter((x) => Number.isFinite(x) && x >= 0);
    if (closes.length < 30 || volumes.length === 0) {
      return res.status(503).json({ error: `Live candle parsing failed for ${normalizedSymbol}.` });
    }

    let balance = 0;
    let availableMargin = 0;
    try {
      if (settings.masterApiKey && settings.masterSecretKey) {
        const account = await binance.getAccountInfo();
        balance = Number(account.totalWalletBalance || 0);
        availableMargin = Number(account.availableBalance || 0);
      }
    } catch {
      // Leave account fields as 0; hard gates will prefer NO_TRADE when account context is weak.
    }

    const priceData = {
      current: Number(ticker.lastPrice || closes[closes.length - 1]),
      change: Number(ticker.priceChangePercent || 0),
      high: Number(ticker.highPrice || 0),
      low: Number(ticker.lowPrice || 0),
      quoteVolume: Number(ticker.quoteVolume || 0),
      bid: Number(ticker.bidPrice || 0),
      ask: Number(ticker.askPrice || 0),
    };

    const indicators = {
      rsi: Number(rsi(closes).toFixed(2)),
      macd: Number(macd(closes).toFixed(6)),
      ema20: Number(ema(closes.slice(-60), 20).toFixed(6)),
      volume: volumes[volumes.length - 1],
      atr14: Number(atr(klines, 14).toFixed(6)),
    };

    const runtimeContext = {
      generatedAt: new Date().toISOString(),
      account: {
        balance,
        availableMargin,
        previousDayPnl: 0,
        consecutiveLosses: 0,
      },
      market: {
        regime: riskSnapshot.marketRegime,
        regimeConfidence: riskSnapshot.regimeConfidence,
        liquidityState: riskSnapshot.liquidityState,
        volatilityState: riskSnapshot.volatilityState,
      },
      news: riskSnapshot.newsHeadlines,
      notes: riskSnapshot.riskFlags,
      maxTradesToday: settings.riskSettings.maxTradesPerDay,
      riskSettings: {
        maxDailyLossPct: settings.riskSettings.maxDailyLossPct,
        maxLeverage: settings.riskSettings.maxLeverage,
        maxConsecutiveLosses: settings.riskSettings.maxConsecutiveLosses,
        minConfidence: settings.riskSettings.minConfidence,
      },
    };

    const decision = await aiService.getStructuredTradingDecision(
      normalizedSymbol,
      priceData,
      indicators,
      selectedProvider,
      runtimeContext
    );

    res.json({
      provider: selectedProvider,
      decision,
      context: {
        symbol: normalizedSymbol,
        marketDataTimestamp: new Date(Number(klines[klines.length - 1][6] || Date.now())).toISOString(),
        runtimeGeneratedAt: runtimeContext.generatedAt,
      },
    });

  } catch (error: any) {
    console.error('Trading signal error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get AI performance analysis
 */
export const analyzeModelPerformance = async (req: Request, res: Response) => {
  try {
    const { modelId } = req.params;
    const provider = 'deepseek';

    const modelData = await prisma.model.findUnique({
      where: { id: parseInt(modelId) }
    });
    const tradeHistory = await prisma.trade.findMany({
      where: { modelId: parseInt(modelId) },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    if (!modelData) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const analysis = await aiService.analyzePerformance(
      modelData,
      tradeHistory,
      'deepseek'
    );

    res.json({
      model: modelData.name,
      analysis,
      provider,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Performance analysis error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get available AI providers
 */
export const getAIStatus = async (req: Request, res: Response) => {
  try {
    const deepseek = aiService.isDeepSeekConfigured();

    res.json({
      available: deepseek ? ['deepseek'] : [],
      total: deepseek ? 1 : 0,
      providers: {
        deepseek,
        mode: 'deepseek_only'
      }
    });

  } catch (error: any) {
    console.error('AI status error:', error);
    res.status(500).json({ error: error.message });
  }
};
