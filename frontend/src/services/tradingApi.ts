// Trading API Service for Frontend
import { getTradingApiBaseUrl } from '../utils/api';

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
    this.baseUrl = getTradingApiBaseUrl();
  }

  private async request(path: string, init?: RequestInit): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Request failed: ${path}`);
    }
    return data;
  }

  async getTradingStatus(): Promise<TradingStatus> {
    return this.request('/status');
  }

  async getModelAccounts(): Promise<ModelAccount[]> {
    return this.request('/accounts');
  }

  async getModelAccount(modelId: string): Promise<ModelAccount> {
    return this.request(`/accounts/${modelId}`);
  }

  async createModelAccount(modelId: string, modelName: string, allocatedBalance: number): Promise<ModelAccount> {
    return this.request('/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, modelName, allocatedBalance }),
    });
  }

  async sendTradeSignal(signal: TradeSignal): Promise<{ success: boolean; signal: TradeSignal }> {
    return this.request('/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
    });
  }

  async toggleTrading(enabled: boolean): Promise<{ enabled: boolean; message: string }> {
    return this.request('/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }

  async updatePositions(): Promise<{ success: boolean; message: string }> {
    return this.request('/update-positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async closeAllPositions(modelId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/close-positions/${modelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async helixEvaluate(payload: any, adminKey: string) {
    return this.request('/helix/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    });
  }

  async updateDarwinWeights(payload: { performanceByAgent: Record<string, number>; floor?: number; ceiling?: number }, adminKey: string) {
    return this.request('/helix/darwin/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    });
  }

  async startPromptExperiment(payload: { promptFile: string; objectiveMetric: 'expectancy' | 'sharpe' | 'max_drawdown'; lookbackDays: number; baselineValue: number; summary: string }, adminKey: string) {
    return this.request('/helix/prompt-experiments/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    });
  }

  async completePromptExperiment(payload: { id: string; candidateValue: number }, adminKey: string) {
    return this.request('/helix/prompt-experiments/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    });
  }

  async listPromptExperiments(adminKey: string, limit = 20) {
    return this.request(`/helix/prompt-experiments?limit=${limit}`, {
      headers: { 'x-admin-key': adminKey },
    });
  }

  async runWalkForward(payload: { trades: any[]; windows: any[] }, adminKey: string) {
    return this.request('/helix/walk-forward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    });
  }

  async validateExperimentContract(payload: any, adminKey: string) {
    return this.request('/helix/experiment-contract/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    });
  }

  async evaluatePromotionContract(payload: any, adminKey: string) {
    return this.request('/helix/experiment-contract/evaluate-promotion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    });
  }

  async getExperimentLeaderboard(adminKey: string, limit = 20) {
    return this.request(`/helix/experiment-contract/leaderboard?limit=${limit}`, {
      headers: { 'x-admin-key': adminKey },
    });
  }

  async getExperimentRuns(adminKey: string, limit = 50) {
    return this.request(`/helix/experiment-contract/runs?limit=${limit}`, {
      headers: { 'x-admin-key': adminKey },
    });
  }

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
      timestamp: new Date(),
    };
  }

  simulateModelTrading(_modelId: string, _currentPrice: number, _marketData: any): TradeSignal | null {
    return null;
  }
}

export const tradingApi = new TradingApiService();
export default tradingApi;
