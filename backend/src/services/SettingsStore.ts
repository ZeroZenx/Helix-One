import fs from 'fs';
import path from 'path';

export interface RuntimeRiskSettings {
  maxDailyLossPct: number;
  maxPositionSizePct: number;
  maxLeverage: number;
  dailyTargetReturnPct: number;
  killSwitchDrawdownPct: number;
  cooldownMinutes: number;
  maxTradesPerDay: number;
  maxConsecutiveLosses: number;
  minConfidence: number;
}

export interface RuntimeSettings {
  masterApiKey: string;
  masterSecretKey: string;
  deepseekApiKey: string;
  testnet: boolean;
  tradingEnabled: boolean;
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
}

const defaultSettings: RuntimeSettings = {
  masterApiKey: '',
  masterSecretKey: '',
  deepseekApiKey: '',
  testnet: true,
  tradingEnabled: false,
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
    maxPositionSizePct: 10,
    maxLeverage: 5,
    dailyTargetReturnPct: 20,
    killSwitchDrawdownPct: 5,
    cooldownMinutes: 30,
    maxTradesPerDay: 5,
    maxConsecutiveLosses: 3,
    minConfidence: 0.7
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
