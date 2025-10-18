import { Request, Response } from 'express';
import { AIService } from '../services/ai.service';
import { PrismaClient } from '@prisma/client';

const aiService = new AIService();
const prisma = new PrismaClient();

/**
 * Chat with a trading model
 */
export const chatWithModel = async (req: Request, res: Response) => {
  try {
    const { modelId } = req.params;
    const { message, provider = 'openai' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get model data (fallback if database not available)
    let modelData;
    try {
      modelData = await prisma.model.findUnique({
        where: { id: parseInt(modelId) }
      });
    } catch (error) {
      // Fallback to demo data
      const demoModels = [
        { id: 1, name: 'Helix_Momentum_Alpha', roi: 12.4, winRate: 68.5, totalTrades: 127, strategy: 'momentum', currentBalance: 11240, avgLeverage: 2.1 },
        { id: 2, name: 'Helix_Reversion_Beta', roi: 7.8, winRate: 72.3, totalTrades: 94, strategy: 'mean_reversion', currentBalance: 10780, avgLeverage: 1.4 },
        { id: 3, name: 'Helix_Hybrid_Gamma', roi: 15.8, winRate: 65.2, totalTrades: 156, strategy: 'hybrid', currentBalance: 11580, avgLeverage: 2.8 }
      ];
      modelData = demoModels.find(m => m.id === parseInt(modelId));
    }

    if (!modelData) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const aiResponse = await aiService.chatWithModel(
      modelData.name,
      message,
      modelData,
      provider as 'openai' | 'deepseek'
    );

    res.json({
      model: modelData.name,
      response: aiResponse,
      provider
    });

  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: error.message,
      fallback: "I'm a trading model on Helix.One. How can I help you understand my performance?"
    });
  }
};

/**
 * Get AI market analysis
 */
export const getMarketAnalysis = async (req: Request, res: Response) => {
  try {
    const { provider = 'deepseek' } = req.query;

    // Mock market data (in production, fetch from real sources)
    const marketData = {
      btc: { price: 95000, change24h: 2.4, volume: '28.5B' },
      eth: { price: 3500, change24h: 1.8, volume: '12.3B' },
      sentiment: 'bullish',
      fearGreedIndex: 72
    };

    const analysis = await aiService.analyzeMarket(
      marketData,
      provider as 'openai' | 'deepseek'
    );

    res.json({
      analysis,
      marketData,
      provider,
      timestamp: new Date().toISOString()
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

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Mock price and indicator data
    const priceData = {
      current: 95000,
      change: 2.4,
      high24h: 96000,
      low24h: 93000
    };

    const indicators = {
      rsi: 65,
      macd: 150,
      ema20: 94500,
      volume: 28.5
    };

    const signal = await aiService.getTradingSignal(
      symbol,
      priceData,
      indicators,
      provider as 'openai' | 'deepseek'
    );

    res.json({
      symbol,
      signal,
      priceData,
      indicators,
      provider,
      timestamp: new Date().toISOString()
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
    const { provider = 'openai' } = req.query;

    // Get model data
    let modelData, tradeHistory;
    try {
      modelData = await prisma.model.findUnique({
        where: { id: parseInt(modelId) }
      });
      tradeHistory = await prisma.trade.findMany({
        where: { modelId: parseInt(modelId) },
        orderBy: { timestamp: 'desc' },
        take: 50
      });
    } catch (error) {
      // Fallback
      modelData = { 
        name: 'Helix_Momentum_Alpha', 
        roi: 12.4, 
        winRate: 68.5, 
        totalTrades: 127, 
        strategy: 'momentum',
        drawdown: -3.2
      };
      tradeHistory = [];
    }

    if (!modelData) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const analysis = await aiService.analyzePerformance(
      modelData,
      tradeHistory,
      provider as 'openai' | 'deepseek'
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
    const providers = aiService.getAvailableProviders();

    res.json({
      available: providers,
      total: providers.length,
      providers: {
        openai: aiService.isOpenAIConfigured(),
        deepseek: aiService.isDeepSeekConfigured(),
        claude: aiService.isClaudeConfigured(),
        gemini: aiService.isGeminiConfigured(),
        grok: aiService.isGrokConfigured()
      }
    });

  } catch (error: any) {
    console.error('AI status error:', error);
    res.status(500).json({ error: error.message });
  }
};

