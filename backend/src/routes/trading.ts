import { Router } from 'express';
import axios from 'axios';
import { LiveTradingService, TradingConfig, TradeSignal } from '../services/LiveTradingService';
import { BinanceService } from '../services/BinanceService';
import { SettingsStore } from '../services/SettingsStore';
import { RiskIntelService } from '../services/RiskIntelService';
import { TelegramAlertService, AlertSeverity } from '../services/TelegramAlertService';
import { authenticateAdmin } from '../middleware/auth';
import { StructuredLogger } from '../services/StructuredLogger';

const router = Router();
const settingsStore = new SettingsStore();
const riskIntel = new RiskIntelService();
const telegramAlerts = new TelegramAlertService();
const logger = new StructuredLogger('trading');
let tradingService: LiveTradingService | null = null;
let lastExchangeAuthDownAlerted = false;

async function sendTelegramAlert(
  severity: AlertSeverity,
  title: string,
  lines: string[],
  dedupeKey: string
) {
  const s = settingsStore.get();
  const n = s.notificationSettings;
  try {
    await telegramAlerts.send({
      enabled: Boolean(n.telegramEnabled),
      botToken: n.telegramBotToken,
      userId: n.telegramUserId,
      minSeverity: n.telegramMinSeverity || 'info',
      rateLimitSec: n.telegramRateLimitSec || 120,
      severity,
      title,
      lines,
      dedupeKey,
    });
  } catch (error: any) {
    logger.warn('telegram_alert_failed', { error: error?.message || 'unknown', dedupeKey });
  }
}

function buildTradingConfigFromSettings(): TradingConfig {
  const s = settingsStore.get();
  return {
    maxPositionSize: s.riskSettings.maxPositionSizePct / 100,
    maxDailyLoss: s.riskSettings.maxDailyLossPct / 100,
    maxLeverage: s.riskSettings.maxLeverage,
    stopLossPercentage: 0.02,
    takeProfitPercentage: 0.05,
    minTradeAmount: 10,
    killSwitchDrawdownPct: s.riskSettings.killSwitchDrawdownPct / 100,
    cooldownMinutes: s.riskSettings.cooldownMinutes,
    maxTradesPerDay: s.riskSettings.maxTradesPerDay,
    maxConsecutiveLosses: s.riskSettings.maxConsecutiveLosses,
    minConfidence: s.riskSettings.minConfidence,
  };
}

async function ensureTradingService() {
  if (tradingService) return tradingService;

  const s = settingsStore.get();
  if (!s.masterApiKey || !s.masterSecretKey) return null;

  tradingService = new LiveTradingService(
    { apiKey: s.masterApiKey, secretKey: s.masterSecretKey, testnet: s.testnet },
    buildTradingConfigFromSettings()
  );

  await tradingService.initialize();

  // DeepSeek-only account
  const deepseekAccount = s.modelAccounts.find((m) => m.modelId === 1) || {
    modelId: 1,
    modelName: 'DeepSeek Chat V3.1',
    balance: 10000,
    tradingEnabled: false,
  };

  tradingService.createModelAccount('1', 'DeepSeek Chat V3.1', deepseekAccount.balance || 10000);
  tradingService.setTradingEnabled(s.tradingEnabled);

  tradingService.on('trade_open', async (event: any) => {
    await sendTelegramAlert(
      'info',
      'Trade Opened',
      [
        `Symbol: ${event.symbol}`,
        `Side: ${event.side}`,
        `Entry: ${Number(event.entry || 0).toFixed(6)}`,
        `Qty: ${Number(event.quantity || 0).toFixed(6)}`,
        `Leverage: ${event.leverage || 1}x`,
        `Reason: ${event.reason || 'n/a'}`,
      ],
      `trade_open_${event.modelId}_${event.symbol}`
    );
  });

  tradingService.on('trade_close', async (event: any) => {
    await sendTelegramAlert(
      Number(event.pnl || 0) >= 0 ? 'info' : 'warning',
      'Trade Closed',
      [
        `Symbol: ${event.symbol}`,
        `PnL: ${Number(event.pnl || 0) >= 0 ? '+' : ''}${Number(event.pnl || 0).toFixed(2)} USD`,
        `Reason: ${event.reason || 'n/a'}`,
        `Consecutive Losses: ${event.consecutiveLosses ?? 0}`,
      ],
      `trade_close_${event.modelId}_${event.symbol}`
    );
  });

  tradingService.on('risk_event', async (event: any) => {
    if (event?.type === 'kill_switch_triggered') {
      await sendTelegramAlert(
        'critical',
        'Kill Switch Triggered',
        [
          `Model: ${event.modelId}`,
          `Drawdown: ${(Number(event.drawdownPct || 0) * 100).toFixed(2)}%`,
          'Trading disabled for this model.',
        ],
        `kill_switch_${event.modelId}`
      );
    }
  });

  return tradingService;
}

router.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

router.get('/status', async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) {
      return res.json({
        connected: false,
        enabled: false,
        accounts: 0,
        activePortfolios: [],
        engineConnected: false,
        globalTradingEnabled: false,
        portfolioTradingEnabled: false,
        exchangeAuthConnected: false,
        exchangeAuthError: 'trading_service_not_initialized',
      });
    }
    await svc.updatePositions();
    const tradingStatus = svc.getTradingStatus();
    const portfolioEnabled = tradingStatus.activePortfolios.some((p) => p.tradingEnabled);
    let exchangeAuthConnected = false;
    let exchangeAuthError: string | null = null;
    try {
      await svc.getExchangeAccountInfo();
      exchangeAuthConnected = true;
      if (lastExchangeAuthDownAlerted) {
        await sendTelegramAlert(
          'info',
          'Exchange Connection Restored',
          ['Binance account authentication recovered.'],
          'exchange_auth_recovered'
        );
      }
      lastExchangeAuthDownAlerted = false;
    } catch (error: any) {
      exchangeAuthError = error?.message || 'exchange_account_fetch_failed';
      if (!lastExchangeAuthDownAlerted) {
        await sendTelegramAlert(
          'warning',
          'Exchange Connection Issue',
          [`Error: ${exchangeAuthError}`],
          'exchange_auth_down'
        );
        lastExchangeAuthDownAlerted = true;
      }
    }

    res.json({
      ...tradingStatus,
      providerMode: 'deepseek_only',
      engineConnected: tradingStatus.connected,
      globalTradingEnabled: tradingStatus.enabled,
      portfolioTradingEnabled: portfolioEnabled,
      exchangeAuthConnected,
      exchangeAuthError,
    });
  } catch (error: any) {
    logger.error('status_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ error: error?.message || 'status_failed' });
  }
});

router.get('/settings', (req, res) => {
  const s = settingsStore.get();
  const masked = (v: string) => (v ? '********' : '');
  res.json({
    ...s,
    masterApiKey: masked(s.masterApiKey),
    masterSecretKey: '',
    deepseekApiKey: '',
    notificationSettings: {
      ...s.notificationSettings,
      telegramBotToken: '',
    },
    hasMasterApiKey: Boolean(s.masterApiKey),
    hasMasterSecretKey: Boolean(s.masterSecretKey),
    hasDeepseekApiKey: Boolean(s.deepseekApiKey),
    hasTelegramBotToken: Boolean(s.notificationSettings.telegramBotToken),
    providerMode: 'deepseek_only',
    modelAccounts: [{ modelId: 1, modelName: 'DeepSeek Chat V3.1', tradingEnabled: s.modelAccounts[0]?.tradingEnabled ?? false, balance: s.modelAccounts[0]?.balance ?? 10000 }],
  });
});

router.post('/settings', authenticateAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const current = settingsStore.get();

    const next = {
      ...current,
      masterApiKey: payload.masterApiKey ?? current.masterApiKey,
      masterSecretKey: payload.masterSecretKey ?? current.masterSecretKey,
      deepseekApiKey: payload.deepseekApiKey ?? current.deepseekApiKey,
      testnet: payload.testnet ?? current.testnet,
      tradingEnabled: payload.tradingEnabled ?? current.tradingEnabled,
      modelAccounts: [
        {
          modelId: 1,
          modelName: 'DeepSeek Chat V3.1',
          tradingEnabled: payload.modelAccounts?.[0]?.tradingEnabled ?? current.modelAccounts?.[0]?.tradingEnabled ?? false,
          balance: payload.modelAccounts?.[0]?.balance ?? current.modelAccounts?.[0]?.balance ?? 10000,
        },
      ],
      riskSettings: {
        ...current.riskSettings,
        ...(payload.riskSettings || {}),
      },
      notificationSettings: {
        ...current.notificationSettings,
        ...(payload.notificationSettings || {}),
      },
    };

    settingsStore.set(next);
    tradingService = null; // force re-init with new settings
    await ensureTradingService();

    logger.info('settings_saved', {
      testnet: next.testnet,
      tradingEnabled: next.tradingEnabled,
      deepseekEnabled: next.modelAccounts?.[0]?.tradingEnabled ?? false,
    });

    res.json({ success: true, settings: next, providerMode: 'deepseek_only' });
  } catch (error: any) {
    logger.error('settings_save_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'save_failed' });
  }
});

router.post('/telegram/test', authenticateAdmin, async (req, res) => {
  try {
    const s = settingsStore.get();
    const botToken = String(req.body?.botToken ?? s.notificationSettings.telegramBotToken ?? '').trim();
    const chatId = String(req.body?.chatId ?? s.notificationSettings.telegramUserId ?? '').trim();
    const pairingCode = String(req.body?.pairingCode ?? s.notificationSettings.telegramPairingCode ?? '').trim();

    if (!botToken || !chatId) {
      return res.status(400).json({ success: false, error: 'telegram_bot_token_and_user_id_required' });
    }

    const message = [
      'HELIX.ONE Telegram linked successfully.',
      `Time: ${new Date().toISOString()}`,
      pairingCode ? `Pairing: ${pairingCode}` : '',
      'Status: Alerts channel active.'
    ].filter(Boolean).join('\n');

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const result = await axios.post(url, {
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }, { timeout: 10000 });

    if (!result.data?.ok) {
      return res.status(500).json({ success: false, error: result.data?.description || 'telegram_send_failed' });
    }

    logger.info('telegram_test_ok', { chatId });
    return res.json({ success: true, connected: true });
  } catch (error: any) {
    const description = error?.response?.data?.description || error?.message || 'telegram_send_failed';
    logger.warn('telegram_test_failed', { error: description });
    return res.status(500).json({ success: false, connected: false, error: description });
  }
});

router.post('/test-connection', authenticateAdmin, async (req, res) => {
  const { apiKey, secretKey, testnet } = req.body || {};
  if (!apiKey || !secretKey) return res.status(400).json({ success: false, connected: false, error: 'API key and secret key are required' });

  try {
    const binanceService = new BinanceService({ apiKey, secretKey, testnet });
    const accountInfo = await binanceService.getAccountInfo();
    logger.info('connection_test_ok', { testnet: Boolean(testnet) });
    res.json({ success: true, connected: true, accountInfo });
  } catch (error: any) {
    logger.warn('connection_test_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, connected: false, error: error?.message || 'test_failed' });
  }
});

router.post('/toggle', authenticateAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled ?? req.body?.enable ?? false);
    const current = settingsStore.get();
    settingsStore.set({ ...current, tradingEnabled: enabled });

    const svc = await ensureTradingService();
    if (svc) svc.setTradingEnabled(enabled);

    logger.info('trading_toggled', { enabled });
    res.json({ success: true, enabled, message: `Trading ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error: any) {
    logger.error('trading_toggle_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'toggle_failed' });
  }
});

router.post('/signals', authenticateAdmin, async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.status(400).json({ error: 'Trading service not initialized. Configure API keys first.' });

    const signal: TradeSignal = req.body;
    if (!signal.modelId || !signal.symbol || !signal.side || !signal.type) {
      return res.status(400).json({ error: 'Invalid signal format' });
    }

    // hard enforce deepseek-only model account
    signal.modelId = '1';

    const success = await svc.processTradeSignal(signal);
    logger.info('signal_processed', { success, symbol: signal.symbol, side: signal.side });
    res.json({ success, signal });
  } catch (error: any) {
    logger.error('signal_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ error: error?.message || 'signal_failed' });
  }
});

router.post('/close-positions', authenticateAdmin, async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.status(400).json({ error: 'Trading service not initialized' });

    await svc.closeAllPositions('1');
    logger.warn('positions_closed_all', { modelId: 1 });
    res.json({ success: true, message: 'All DeepSeek positions closed' });
  } catch (error: any) {
    logger.error('close_positions_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'close_failed' });
  }
});

router.get('/daily-briefing', async (req, res) => {
  try {
    const svc = await ensureTradingService();
    const account = svc?.getModelAccount('1');

    let walletBalance = 0;
    let availableMargin = 0;
    let exchangeConnected = false;
    let exchangeError: string | null = null;
    if (svc) {
      try {
        const exchangeAccount = await svc.getExchangeAccountInfo();
        walletBalance = Number(exchangeAccount.totalWalletBalance || 0);
        availableMargin = Number(exchangeAccount.availableBalance || 0);
        exchangeConnected = true;
      } catch (error: any) {
        exchangeError = error?.message || 'exchange_account_fetch_failed';
      }
    } else {
      exchangeError = 'trading_service_not_initialized';
    }

    const briefing = await riskIntel.getDailyBriefing(
      walletBalance,
      availableMargin,
      account?.dailyPnl ?? 0,
      account?.consecutiveLosses ?? 0
    );

    res.json({
      ...briefing,
      providerMode: 'deepseek_only',
      exchangeConnected,
      exchangeError,
      accountSource: exchangeConnected ? 'binance' : 'unavailable',
      maxTradesToday: settingsStore.get().riskSettings.maxTradesPerDay,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'briefing_failed' });
  }
});

router.get('/risk-context', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || 'BTCUSDT,ETHUSDT').split(',').map((s) => s.trim()).filter(Boolean);
    const snapshot = await riskIntel.getSnapshot(symbols);
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'risk_context_failed' });
  }
});

router.get('/journal', async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.json({ entries: [], review: {} });

    const limit = Number(req.query.limit || 200);
    const lastN = Number(req.query.reviewWindow || 100);

    res.json({
      entries: svc.getJournalEntries(limit),
      review: svc.getJournalReview(lastN),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'journal_failed' });
  }
});

export default router;
