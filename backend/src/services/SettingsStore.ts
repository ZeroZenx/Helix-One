import fs from 'fs';
import path from 'path';

export interface RuntimeRiskSettings {
  maxDailyLossPct: number;
  maxPositionSizePct: number;
  maxLeverage: number;
  minLeverage: number;
  maxOpenPositions: number;
  dailyTargetReturnPct: number;
  killSwitchDrawdownPct: number;
  cooldownMinutes: number;
  maxTradesPerDay: number;
  maxConsecutiveLosses: number;
  minConfidence: number;
  paperTrading: boolean;
  deepseekDecisionEnabled?: boolean;
  breakEvenEnabled?: boolean;
  breakEvenTriggerR?: number;
  breakEvenBufferPct?: number;
  breakEvenFeeBps?: number;
  breakEvenSlippageBps?: number;
  letWinnersRunEnabled?: boolean;
  runnerActivationR?: number;
  runnerPartialTakeProfitPct?: number;
  runnerTrailPct?: number;
  tradeSymbols?: string[];
}

export interface SelfLearningSettings {
  enabled: boolean;
  intervalHours: number;
  minClosedTrades: number;
  autoRiskTightening: boolean;
  allowLivePromotion: boolean;
  notifyOnReview: boolean;
}

export interface RuntimeSettings {
  masterApiKey: string;
  masterSecretKey: string;
  aiProvider: 'deepseek' | 'openai' | 'gemini';
  deepseekApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  testnet: boolean;
  tradingEnabled: boolean;
  tradeConfirmation: boolean;
  modelAccounts: Array<{
    modelId: number;
    modelName: string;
    tradingEnabled: boolean;
    balance: number;
  }>;
  riskSettings: RuntimeRiskSettings;
  notificationSettings: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    telegramEnabled: boolean;
    email: string;
    telegramBotToken: string;
    telegramUserId: string;
    telegramPairingCode: string;
    telegramMinSeverity: 'info' | 'warning' | 'critical';
    telegramRateLimitSec: number;
  };
  selfLearningSettings: SelfLearningSettings;
}

const defaultSettings: RuntimeSettings = {
  masterApiKey: '',
  masterSecretKey: '',
  aiProvider: 'deepseek',
  deepseekApiKey: '',
  openaiApiKey: '',
  geminiApiKey: '',
  testnet: true,
  tradingEnabled: false,
  tradeConfirmation: false,
  modelAccounts: [
    {
      modelId: 1,
      modelName: 'DeepSeek Chat V3.1',
      tradingEnabled: false,
      balance: 10000
    }
  ],
  riskSettings: {
    maxDailyLossPct: 3,
    maxPositionSizePct: 8,
    maxLeverage: 20,
    minLeverage: 10,
    dailyTargetReturnPct: 20,
    killSwitchDrawdownPct: 5,
    cooldownMinutes: 45,
    maxTradesPerDay: 8,
    maxConsecutiveLosses: 3,
    minConfidence: 0.60,
    paperTrading: true,
    maxOpenPositions: 4,
    breakEvenEnabled: true,
    breakEvenTriggerR: 1,
    breakEvenBufferPct: 0.001,
    breakEvenFeeBps: 8,
    breakEvenSlippageBps: 5,
    letWinnersRunEnabled: true,
    runnerActivationR: 2,
    runnerPartialTakeProfitPct: 30,
    runnerTrailPct: 0.006,
  },
  notificationSettings: {
    pushEnabled: true,
    emailEnabled: false,
    telegramEnabled: false,
    email: '',
    telegramBotToken: '',
    telegramUserId: '',
    telegramPairingCode: '',
    telegramMinSeverity: 'info',
    telegramRateLimitSec: 120,
  },
  selfLearningSettings: {
    enabled: true,
    intervalHours: 6,
    minClosedTrades: 30,
    autoRiskTightening: true,
    allowLivePromotion: false,
    notifyOnReview: true,
  }
};

export class SettingsStore {
  private filePath: string;

  constructor() {
    this.filePath = path.resolve(process.cwd(), 'data', 'runtime-settings.json');
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  get(): RuntimeSettings {
    if (!fs.existsSync(this.filePath)) {
      this.set(defaultSettings);
      return defaultSettings;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        ...defaultSettings,
        ...data,
        riskSettings: {
          ...defaultSettings.riskSettings,
          ...(data.riskSettings || {})
        },
        notificationSettings: {
          ...defaultSettings.notificationSettings,
          ...(data.notificationSettings || {})
        },
        selfLearningSettings: {
          ...defaultSettings.selfLearningSettings,
          ...(data.selfLearningSettings || {})
        }
      };
    } catch {
      return defaultSettings;
    }
  }

  set(settings: RuntimeSettings): RuntimeSettings {
    fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2));
    return settings;
  }
}
