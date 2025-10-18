import axios from 'axios';

/**
 * AI Service - Integrates OpenAI and DeepSeek
 * Provides AI-powered trading insights, chat, and analysis
 */

export type AIProvider = 'openai' | 'deepseek' | 'claude' | 'gemini' | 'grok';

export class AIService {
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
    provider: AIProvider = 'deepseek'
  ): Promise<{ signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string }> {
    const prompt = `Analyze this trading opportunity and provide a recommendation.

Symbol: ${symbol}
Current Price: ${priceData.current}
24h Change: ${priceData.change}%

Technical Indicators:
- RSI: ${indicators.rsi}
- MACD: ${indicators.macd}
- EMA20: ${indicators.ema20}
- Volume: ${indicators.volume}

Provide trading signal (BUY/SELL/HOLD), confidence (0-1), and reasoning.
Respond in JSON format: {"signal": "...", "confidence": 0.0, "reasoning": "..."}`;

    const messages = [
      { role: 'system', content: 'You are an expert algorithmic trader. Always respond in valid JSON format.' },
      { role: 'user', content: prompt }
    ];

    const response = await this.callAI(messages, provider);

    try {
      return JSON.parse(response);
    } catch (error) {
      // Fallback if parsing fails
      return {
        signal: 'HOLD',
        confidence: 0.5,
        reasoning: 'Unable to generate signal'
      };
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
    if (!this.deepseekKey) {
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
            'Authorization': `Bearer ${this.deepseekKey}`,
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
    return !!this.deepseekKey;
  }

  /**
   * Get available AI providers
   */
  getAvailableProviders(): AIProvider[] {
    const providers: AIProvider[] = [];
    if (this.isOpenAIConfigured()) providers.push('openai');
    if (this.isDeepSeekConfigured()) providers.push('deepseek');
    if (this.isClaudeConfigured()) providers.push('claude');
    if (this.isGeminiConfigured()) providers.push('gemini');
    if (this.isGrokConfigured()) providers.push('grok');
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


