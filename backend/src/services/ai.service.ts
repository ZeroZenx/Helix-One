import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { SettingsStore } from './SettingsStore';

/**
 * AI Service - Integrates OpenAI and DeepSeek
 * Provides AI-powered trading insights, chat, and analysis
 */

export type AIProvider = 'openai' | 'deepseek' | 'claude' | 'gemini' | 'grok';

export interface TradingRuntimeContext {
  generatedAt?: string;
  account?: {
    balance?: number;
    availableMargin?: number;
    previousDayPnl?: number;
    consecutiveLosses?: number;
  };
  market?: {
    regime?: 'trend' | 'range' | 'breakout' | 'breakdown' | 'squeeze' | 'event_driven' | 'unclear';
    regimeConfidence?: number;
    liquidityState?: 'good' | 'acceptable' | 'poor';
    volatilityState?: 'low' | 'normal' | 'high';
  };
  news?: Array<{ source: string; title: string }>;
  notes?: string[];
  maxTradesToday?: number;
  riskSettings?: {
    maxDailyLossPct?: number;
    maxLeverage?: number;
    maxConsecutiveLosses?: number;
    minConfidence?: number;
  };
}

export interface StructuredTradingDecision {
  decision: 'TRADE' | 'NO_TRADE';
  symbol: string | null;
  side: 'LONG' | 'SHORT' | null;
  setup_type: 'trend_pullback' | 'breakout' | 'reversal' | 'range_reversion' | null;
  regime: 'trend' | 'range' | 'breakout' | 'breakdown' | 'squeeze' | 'event_driven' | 'unclear';
  confidence: number;
  news_risk: 'low' | 'medium' | 'high';
  liquidity_state: 'good' | 'acceptable' | 'poor';
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  position_size_usd: number | null;
  max_loss_usd: number | null;
  expected_rr: number | null;
  holding_window_minutes: number | null;
  reasons: string[];
  risk_flags: string[];
  pre_trade_checks_passed: boolean;
  post_decision_actions: Array<'wait' | 'monitor' | 'reduce size' | 'block trading' | 'close stale orders'>;
  review_time_utc: string;
}

export class AIService {
  private settingsStore = new SettingsStore();
  private openaiKey: string;
  private deepseekKey: string;
  private claudeKey: string;
  private geminiKey: string;
  private grokKey: string;
  
  private openaiUrl = 'https://api.openai.com/v1/chat/completions';
  private deepseekUrl = 'https://api.deepseek.com/v1/chat/completions';
  private claudeUrl = 'https://api.anthropic.com/v1/messages';
  private geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  private grokUrl = 'https://api.x.ai/v1/chat/completions';

  constructor() {
    this.openaiKey = process.env.OPENAI_API_KEY || '';
    this.deepseekKey = process.env.DEEPSEEK_API_KEY || '';
    this.claudeKey = process.env.ANTHROPIC_API_KEY || '';
    this.geminiKey = process.env.GOOGLE_API_KEY || '';
    this.grokKey = process.env.GROK_API_KEY || '';
  }

  private getActiveDeepSeekKey(): string {
    try {
      const runtimeKey = this.settingsStore.get().deepseekApiKey || '';
      if (runtimeKey) return runtimeKey;
    } catch {
      // ignore settings read failures and fallback to env.
    }
    return this.deepseekKey;
  }

  private loadPrompt(fileName: string, fallback: string): string {
    try {
      const fullPath = path.resolve(process.cwd(), 'prompts', fileName);
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf8');
      }
    } catch {
      // ignore and use fallback
    }
    return fallback;
  }

  /**
   * Chat with a trading model using AI
   */
  async chatWithModel(
    modelName: string,
    userMessage: string,
    modelData: any,
    provider: AIProvider = 'openai'
  ): Promise<string> {
    const systemPrompt = `You are ${modelName}, an AI trading model on the Helix.One platform.

Your current stats:
- ROI: ${modelData.roi}%
- Win Rate: ${modelData.winRate}%
- Total Trades: ${modelData.totalTrades}
- Strategy: ${modelData.strategy}
- Balance: $${modelData.currentBalance}
- Leverage: ${modelData.avgLeverage}x

You are helpful, concise, and speak like a professional trader. Answer questions about your performance, strategy, and market outlook.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    return await this.callAI(messages, provider);
  }

  /**
   * Get AI-powered market analysis
   */
  async analyzeMarket(
    marketData: any,
    provider: AIProvider = 'deepseek'
  ): Promise<string> {
    const prompt = `Analyze the current market conditions and provide trading insights.

Current market data:
${JSON.stringify(marketData, null, 2)}

Provide:
1. Overall market sentiment
2. Key opportunities
3. Risk factors
4. Recommended actions

Keep it concise and actionable.`;

    const messages = [
      { role: 'system', content: 'You are a professional crypto market analyst.' },
      { role: 'user', content: prompt }
    ];

    if (provider === 'openai') {
      return await this.callOpenAI(messages);
    } else {
      return await this.callDeepSeek(messages);
    }
  }

  /**
   * Get AI trading signal recommendation
   */
  async getTradingSignal(
    symbol: string,
    priceData: any,
    indicators: any,
    provider: AIProvider = 'deepseek',
    runtimeContext?: TradingRuntimeContext
  ): Promise<{ signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string }> {
    const decision = await this.getStructuredTradingDecision(symbol, priceData, indicators, provider, runtimeContext);
    const signal =
      decision.decision === 'TRADE'
        ? decision.side === 'LONG'
          ? 'BUY'
          : decision.side === 'SHORT'
            ? 'SELL'
            : 'HOLD'
        : 'HOLD';

    return {
      signal,
      confidence: decision.confidence / 100,
      reasoning: decision.reasons.length > 0
        ? decision.reasons.join('; ')
        : decision.risk_flags.length > 0
          ? `Risk flags: ${decision.risk_flags.join(', ')}`
          : `Decision: ${decision.decision}`
    };
  }

  async getStructuredTradingDecision(
    symbol: string,
    priceData: any,
    indicators: any,
    provider: AIProvider = 'deepseek',
    runtimeContext?: TradingRuntimeContext
  ): Promise<StructuredTradingDecision> {
    const coreSystem = this.loadPrompt(
      'system_trading_brain.md',
      'You are a disciplined futures trader and risk manager. When in doubt return NO_TRADE.'
    );

    const opsFramework = this.loadPrompt('risk_operating_framework.md', '');

    const prompt = `Analyze this trading opportunity and provide a recommendation.

Symbol: ${symbol}
Current Price: ${priceData.current}
24h Change: ${priceData.change}%

Technical Indicators:
- RSI: ${indicators.rsi}
- MACD: ${indicators.macd}
- EMA20: ${indicators.ema20}
- Volume: ${indicators.volume}

Return ONE JSON object ONLY in this exact schema:
{
  "decision": "TRADE" | "NO_TRADE",
  "symbol": "${symbol}" | null,
  "side": "LONG" | "SHORT" | null,
  "setup_type": "trend_pullback" | "breakout" | "reversal" | "range_reversion" | null,
  "regime": "trend" | "range" | "breakout" | "breakdown" | "squeeze" | "event_driven" | "unclear",
  "confidence": 0-100,
  "news_risk": "low" | "medium" | "high",
  "liquidity_state": "good" | "acceptable" | "poor",
  "entry": number | null,
  "stop_loss": number | null,
  "take_profit": number | null,
  "position_size_usd": number | null,
  "max_loss_usd": number | null,
  "expected_rr": number | null,
  "holding_window_minutes": number | null,
  "reasons": ["short bullet reasons"],
  "risk_flags": ["list of active concerns"],
  "pre_trade_checks_passed": boolean,
  "post_decision_actions": ["wait" | "monitor" | "reduce size" | "block trading" | "close stale orders"],
  "review_time_utc": "ISO timestamp"
}

Runtime context (hard constraints + current operating environment):
${JSON.stringify(runtimeContext || {}, null, 2)}

If runtime context signals missing/stale/conflicting data or risk threshold breach, return NO_TRADE.`;

    const messages = [
      { role: 'system', content: `${coreSystem}\n\nOperational Framework:\n${opsFramework}` },
      { role: 'user', content: prompt }
    ];

    try {
      const response = await this.callAI(messages, provider);
      const parsed = JSON.parse(response);
      return this.applyHardRiskGates(this.normalizeDecision(parsed, symbol, runtimeContext), runtimeContext);
    } catch (error) {
      return this.applyHardRiskGates(this.defaultNoTrade(symbol, 'Unable to generate signal'), runtimeContext);
    }
  }

  /**
   * Analyze model performance and suggest improvements
   */
  async analyzePerformance(
    modelData: any,
    tradeHistory: any[],
    provider: AIProvider = 'openai'
  ): Promise<string> {
    const prompt = `Analyze this trading model's performance and suggest improvements.

Model: ${modelData.name}
Strategy: ${modelData.strategy}
ROI: ${modelData.roi}%
Win Rate: ${modelData.winRate}%
Total Trades: ${modelData.totalTrades}
Drawdown: ${modelData.drawdown}%

Recent trades summary:
${tradeHistory.slice(0, 10).map(t => `- ${t.signal} at $${t.entryPrice}: ${t.profit > 0 ? 'Win' : 'Loss'} $${t.profit}`).join('\n')}

Provide:
1. Performance assessment
2. Strengths and weaknesses
3. Suggested parameter adjustments
4. Risk management recommendations

Keep it actionable and specific.`;

    const messages = [
      { role: 'system', content: 'You are a quantitative trading strategist specializing in algorithmic optimization.' },
      { role: 'user', content: prompt }
    ];

    return await this.callAI(messages, provider);
  }

  private defaultNoTrade(symbol: string, reason: string): StructuredTradingDecision {
    return {
      decision: 'NO_TRADE',
      symbol,
      side: null,
      setup_type: null,
      regime: 'unclear',
      confidence: 0,
      news_risk: 'high',
      liquidity_state: 'poor',
      entry: null,
      stop_loss: null,
      take_profit: null,
      position_size_usd: null,
      max_loss_usd: null,
      expected_rr: null,
      holding_window_minutes: null,
      reasons: [reason],
      risk_flags: ['decision_engine_fallback'],
      pre_trade_checks_passed: false,
      post_decision_actions: ['wait', 'monitor'],
      review_time_utc: new Date().toISOString(),
    };
  }

  private normalizeDecision(raw: any, symbol: string, runtimeContext?: TradingRuntimeContext): StructuredTradingDecision {
    const normalized: StructuredTradingDecision = {
      decision: raw?.decision === 'TRADE' ? 'TRADE' : 'NO_TRADE',
      symbol: typeof raw?.symbol === 'string' ? raw.symbol : symbol,
      side: raw?.side === 'LONG' || raw?.side === 'SHORT' ? raw.side : null,
      setup_type: raw?.setup_type === 'trend_pullback' || raw?.setup_type === 'breakout' || raw?.setup_type === 'reversal' || raw?.setup_type === 'range_reversion' ? raw.setup_type : null,
      regime: raw?.regime === 'trend' || raw?.regime === 'range' || raw?.regime === 'breakout' || raw?.regime === 'breakdown' || raw?.regime === 'squeeze' || raw?.regime === 'event_driven' ? raw.regime : 'unclear',
      confidence: typeof raw?.confidence === 'number' ? Math.max(0, Math.min(100, raw.confidence)) : 0,
      news_risk: raw?.news_risk === 'low' || raw?.news_risk === 'medium' ? raw.news_risk : 'high',
      liquidity_state: raw?.liquidity_state === 'good' || raw?.liquidity_state === 'acceptable' ? raw.liquidity_state : 'poor',
      entry: typeof raw?.entry === 'number' ? raw.entry : null,
      stop_loss: typeof raw?.stop_loss === 'number' ? raw.stop_loss : null,
      take_profit: typeof raw?.take_profit === 'number' ? raw.take_profit : null,
      position_size_usd: typeof raw?.position_size_usd === 'number' ? raw.position_size_usd : null,
      max_loss_usd: typeof raw?.max_loss_usd === 'number' ? raw.max_loss_usd : null,
      expected_rr: typeof raw?.expected_rr === 'number' ? raw.expected_rr : null,
      holding_window_minutes: typeof raw?.holding_window_minutes === 'number' ? raw.holding_window_minutes : null,
      reasons: Array.isArray(raw?.reasons) ? raw.reasons.map((x: any) => String(x)).slice(0, 8) : [],
      risk_flags: Array.isArray(raw?.risk_flags) ? raw.risk_flags.map((x: any) => String(x)).slice(0, 12) : [],
      pre_trade_checks_passed: Boolean(raw?.pre_trade_checks_passed),
      post_decision_actions: Array.isArray(raw?.post_decision_actions) ? raw.post_decision_actions.filter((x: any) => ['wait', 'monitor', 'reduce size', 'block trading', 'close stale orders'].includes(String(x))) : [],
      review_time_utc: typeof raw?.review_time_utc === 'string' ? raw.review_time_utc : new Date().toISOString(),
    };

    if (normalized.reasons.length === 0) {
      normalized.reasons.push(normalized.decision === 'TRADE' ? 'Trade candidate accepted by model.' : 'Model returned NO_TRADE.');
    }

    if (!runtimeContext?.market?.regime && normalized.regime === 'unclear') {
      normalized.risk_flags.push('missing_market_regime');
    }

    return normalized;
  }

  private applyHardRiskGates(
    decision: StructuredTradingDecision,
    runtimeContext?: TradingRuntimeContext
  ): StructuredTradingDecision {
    const out: StructuredTradingDecision = { ...decision, reasons: [...decision.reasons], risk_flags: [...decision.risk_flags], post_decision_actions: [...decision.post_decision_actions] };
    const hardBlocks: string[] = [];
    const threshold = runtimeContext?.riskSettings?.minConfidence ?? 0.7;
    const minConfidencePct = Math.max(0, Math.min(1, threshold)) * 100;

    if (!runtimeContext?.generatedAt) hardBlocks.push('missing_runtime_timestamp');
    if (!runtimeContext?.market?.regime) hardBlocks.push('missing_regime_data');
    if (!runtimeContext?.account || typeof runtimeContext.account.balance !== 'number') hardBlocks.push('missing_account_state');

    if (runtimeContext?.market?.regimeConfidence !== undefined && runtimeContext.market.regimeConfidence < minConfidencePct) {
      hardBlocks.push('low_regime_confidence');
    }
    if (out.news_risk === 'high') hardBlocks.push('high_news_risk');
    if (out.liquidity_state === 'poor') hardBlocks.push('poor_liquidity');

    const consecutiveLosses = runtimeContext?.account?.consecutiveLosses ?? 0;
    const maxConsecutiveLosses = runtimeContext?.riskSettings?.maxConsecutiveLosses ?? 3;
    if (consecutiveLosses >= maxConsecutiveLosses) hardBlocks.push('consecutive_losses_shutdown');

    const maxDailyLossPct = runtimeContext?.riskSettings?.maxDailyLossPct ?? 3;
    const balance = runtimeContext?.account?.balance ?? 0;
    const previousDayPnl = runtimeContext?.account?.previousDayPnl ?? 0;
    const dailyLossLimit = Math.abs(balance) * (maxDailyLossPct / 100);
    if (previousDayPnl < 0 && Math.abs(previousDayPnl) >= dailyLossLimit && dailyLossLimit > 0) {
      hardBlocks.push('daily_drawdown_limit_near_breach');
    }

    if (out.decision === 'TRADE') {
      if (!out.side) hardBlocks.push('missing_trade_side');
      if (out.entry === null || out.stop_loss === null || out.take_profit === null) hardBlocks.push('missing_entry_stop_or_target');
      if ((out.expected_rr ?? 0) < 1.5) hardBlocks.push('insufficient_reward_to_risk');
      if (out.pre_trade_checks_passed !== true) hardBlocks.push('pre_trade_gate_failed');
    }

    if (hardBlocks.length > 0) {
      out.decision = 'NO_TRADE';
      out.side = null;
      out.entry = null;
      out.stop_loss = null;
      out.take_profit = null;
      out.position_size_usd = null;
      out.max_loss_usd = null;
      out.expected_rr = null;
      out.pre_trade_checks_passed = false;
      out.risk_flags.push(...hardBlocks);
      out.post_decision_actions = Array.from(new Set([...out.post_decision_actions, 'wait', 'monitor']));
      out.reasons = Array.from(new Set([...out.reasons, `Hard risk gate rejected trade: ${hardBlocks.join(', ')}`]));
      out.review_time_utc = new Date().toISOString();
    }

    return out;
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(messages: any[]): Promise<string> {
    if (!this.openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await axios.post(
        this.openaiUrl,
        {
          model: 'gpt-4-turbo-preview',
          messages,
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('OpenAI API error:', error.response?.data || error.message);
      throw new Error(`OpenAI error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Call DeepSeek API
   */
  private async callDeepSeek(messages: any[]): Promise<string> {
    const key = this.getActiveDeepSeekKey();
    if (!key) {
      throw new Error('DeepSeek API key not configured');
    }

    try {
      const response = await axios.post(
        this.deepseekUrl,
        {
          model: 'deepseek-chat',
          messages,
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('DeepSeek API error:', error.response?.data || error.message);
      throw new Error(`DeepSeek error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Check if OpenAI is configured
   */
  isOpenAIConfigured(): boolean {
    return !!this.openaiKey;
  }

  /**
   * Check if DeepSeek is configured
   */
  isDeepSeekConfigured(): boolean {
    return !!this.getActiveDeepSeekKey();
  }

  /**
   * Get available AI providers
   */
  getAvailableProviders(): AIProvider[] {
    const providers: AIProvider[] = [];
    if (this.isDeepSeekConfigured()) providers.push('deepseek');
    return providers;
  }

  /**
   * Main AI call router
   */
  private async callAI(messages: any[], provider: AIProvider): Promise<string> {
    switch (provider) {
      case 'openai':
        return await this.callOpenAI(messages);
      case 'deepseek':
        return await this.callDeepSeek(messages);
      case 'claude':
        return await this.callClaude(messages);
      case 'gemini':
        return await this.callGemini(messages);
      case 'grok':
        return await this.callGrok(messages);
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  }

  /**
   * Call Claude (Anthropic) API
   */
  private async callClaude(messages: any[]): Promise<string> {
    if (!this.claudeKey) {
      throw new Error('Claude API key not configured');
    }

    try {
      // Convert messages format for Claude
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      const response = await axios.post(
        this.claudeUrl,
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: systemMessage?.content || '',
          messages: userMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
          }))
        },
        {
          headers: {
            'x-api-key': this.claudeKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.content[0].text;
    } catch (error: any) {
      console.error('Claude API error:', error.response?.data || error.message);
      throw new Error(`Claude error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Call Gemini (Google) API
   */
  private async callGemini(messages: any[]): Promise<string> {
    if (!this.geminiKey) {
      throw new Error('Gemini API key not configured');
    }

    try {
      // Combine messages for Gemini
      const prompt = messages.map(m => m.content).join('\n\n');

      const response = await axios.post(
        `${this.geminiUrl}?key=${this.geminiKey}`,
        {
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.candidates[0].content.parts[0].text;
    } catch (error: any) {
      console.error('Gemini API error:', error.response?.data || error.message);
      throw new Error(`Gemini error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Call Grok (xAI) API
   */
  private async callGrok(messages: any[]): Promise<string> {
    if (!this.grokKey) {
      throw new Error('Grok API key not configured');
    }

    try {
      const response = await axios.post(
        this.grokUrl,
        {
          model: 'grok-beta',
          messages,
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.grokKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('Grok API error:', error.response?.data || error.message);
      throw new Error(`Grok error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Check if Claude is configured
   */
  isClaudeConfigured(): boolean {
    return !!this.claudeKey;
  }

  /**
   * Check if Gemini is configured
   */
  isGeminiConfigured(): boolean {
    return !!this.geminiKey;
  }

  /**
   * Check if Grok is configured
   */
  isGrokConfigured(): boolean {
    return !!this.grokKey;
  }
}
