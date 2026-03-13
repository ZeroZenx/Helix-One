import { Router } from 'express';
import axios from 'axios';
import { LiveTradingService, TradingConfig, TradeSignal } from '../services/LiveTradingService';
import { BinanceService } from '../services/BinanceService';
import { SettingsStore } from '../services/SettingsStore';
import { RiskIntelService } from '../services/RiskIntelService';
import { TelegramAlertService, AlertSeverity } from '../services/TelegramAlertService';
import { authenticateAdmin } from '../middleware/auth';
import { StructuredLogger } from '../services/StructuredLogger';
import { HelixEvolutionService } from '../services/HelixEvolutionService';
import { WalkForwardService } from '../services/WalkForwardService';
import { PromotionAuditService } from '../services/PromotionAuditService';
import { ExperimentGovernanceService } from '../services/ExperimentGovernanceService';
import { JournalService } from '../services/JournalService';

const router = Router();
const settingsStore = new SettingsStore();
const riskIntel = new RiskIntelService();
const telegramAlerts = new TelegramAlertService();
const logger = new StructuredLogger('trading');
const helixEvolution = new HelixEvolutionService();
const walkForward = new WalkForwardService();
const promotionAudit = new PromotionAuditService();
const experimentGovernance = new ExperimentGovernanceService();
const journalService = new JournalService();
let tradingService: LiveTradingService | null = null;
let lastExchangeAuthDownAlerted = false;

function keepOrUpdateSecret(currentValue: string, nextValue: unknown): string {
  if (typeof nextValue !== 'string') return currentValue;
  const candidate = nextValue.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!candidate) return currentValue;
  if (/^\*+$/.test(candidate)) return currentValue;
  return candidate;
}

function toNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function calcMaxDrawdownFromPnL(pnls: number[]): number {
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

function buildMetricsFromJournal(entries: any[], allocatedBalance = 10000) {
  const closes = entries.filter((e) => e?.type === 'trade_close');
  const opens = entries.filter((e) => e?.type === 'trade_open');

  const pnls = closes.map((e) => toNumber(e.pnl, 0));
  const sampleSize = pnls.length;
  const avgPnl = sampleSize > 0 ? pnls.reduce((a, b) => a + b, 0) / sampleSize : 0;
  const maxDdUsd = calcMaxDrawdownFromPnL(pnls);
  const maxDrawdownPct = allocatedBalance > 0 ? (maxDdUsd / allocatedBalance) * 100 : 0;

  // In absence of full per-trade R and exact costs in journal, we use normalized pnl proxies.
  const expectancyR = allocatedBalance > 0 ? avgPnl / allocatedBalance : 0;
  const slippageAdjustedExpectancyR = expectancyR * 0.95;
  const variance = sampleSize > 1
    ? pnls.reduce((acc, x) => acc + (x - avgPnl) ** 2, 0) / (sampleSize - 1)
    : 0;
  const sharpe = variance > 0 ? avgPnl / Math.sqrt(variance) : 0;

  const expectedNetEdgeBps = expectancyR * 10000;

  return {
    sampleSize,
    maxDrawdownPct,
    turnover: opens.length,
    expectancyR,
    slippageAdjustedExpectancyR,
    sharpe,
    expectedNetEdgeBps,
  };
}

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
      masterApiKey: keepOrUpdateSecret(current.masterApiKey, payload.masterApiKey),
      masterSecretKey: keepOrUpdateSecret(current.masterSecretKey, payload.masterSecretKey),
      deepseekApiKey: keepOrUpdateSecret(current.deepseekApiKey, payload.deepseekApiKey),
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
        telegramBotToken: keepOrUpdateSecret(
          current.notificationSettings.telegramBotToken,
          payload.notificationSettings?.telegramBotToken
        ),
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

router.post('/helix/evaluate', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const plan = helixEvolution.evaluateTrade(body.snapshot, body.candidate, body.constraints);
    res.json({ success: true, plan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'helix_evaluate_failed' });
  }
});

router.post('/helix/darwin/update', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const updated = helixEvolution.updateDarwinianWeights(
      body.performanceByAgent || {},
      Number(body.floor ?? 0.3),
      Number(body.ceiling ?? 2.5)
    );
    res.json({ success: true, weights: updated });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'darwin_update_failed' });
  }
});

router.post('/helix/prompt-experiments/start', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const experiment = helixEvolution.startPromptExperiment({
      promptFile: String(body.promptFile || ''),
      objectiveMetric: body.objectiveMetric || 'expectancy',
      lookbackDays: Number(body.lookbackDays || 5),
      baselineValue: Number(body.baselineValue || 0),
      summary: String(body.summary || 'targeted prompt adjustment'),
    });
    res.json({ success: true, experiment });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'experiment_start_failed' });
  }
});

router.post('/helix/prompt-experiments/complete', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const experiment = helixEvolution.completePromptExperiment(String(body.id || ''), Number(body.candidateValue));
    if (!experiment) return res.status(404).json({ success: false, error: 'experiment_not_found' });
    res.json({ success: true, experiment });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'experiment_complete_failed' });
  }
});

router.get('/helix/prompt-experiments', authenticateAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    res.json({ success: true, experiments: helixEvolution.listPromptExperiments(limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'experiment_list_failed' });
  }
});

router.post('/helix/walk-forward', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const trades = Array.isArray(body.trades) ? body.trades : [];
    const windows = Array.isArray(body.windows) ? body.windows : [];
    const result = walkForward.runWalkForward(trades, windows);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'walk_forward_failed' });
  }
});

router.post('/helix/experiment-contract/validate', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const result = experimentGovernance.validateContract(body.contract || body);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'contract_validate_failed' });
  }
});

router.post('/helix/experiment-contract/evaluate-promotion', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const contract = body.contract || {};
    const check = experimentGovernance.validateContract(contract);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: 'invalid_contract', details: check.errors });
    }

    const baselineMetrics = body.baselineMetrics || {};
    const candidateMetrics = body.candidateMetrics || {};
    const regimeSlices = Array.isArray(body.regimeSlices) ? body.regimeSlices : [];

    const record = experimentGovernance.recordRun({
      contract,
      baselineMetrics,
      candidateMetrics,
      regimeSlices,
    });

    res.json({ success: true, record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'promotion_evaluate_failed' });
  }
});

router.get('/helix/experiment-contract/leaderboard', authenticateAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    res.json({ success: true, leaderboard: experimentGovernance.leaderboard(limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'leaderboard_failed' });
  }
});

router.get('/helix/experiment-contract/runs', authenticateAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    res.json({ success: true, runs: experimentGovernance.listRuns(limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'runs_list_failed' });
  }
});

router.post('/helix/experiment-contract/live-evaluate', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const allocatedBalance = Number(body.allocatedBalance || settingsStore.get().modelAccounts?.[0]?.balance || 10000);
    const minSamples = Number(body.minSamples || 30);

    const entries = journalService.list(500);
    const closes = entries.filter((e: any) => e?.type === 'trade_close');
    const mid = Math.max(1, Math.floor(closes.length / 2));

    const baselineEntries = entries.filter((e: any) => e?.type !== 'trade_close' || closes.slice(0, mid).includes(e));
    const candidateEntries = entries.filter((e: any) => e?.type !== 'trade_close' || closes.slice(mid).includes(e));

    const baselineMetrics = buildMetricsFromJournal(baselineEntries, allocatedBalance);
    const candidateMetrics = buildMetricsFromJournal(candidateEntries, allocatedBalance);

    const snapshot = await riskIntel.getSnapshot(['BTCUSDT', 'ETHUSDT']);
    const regime = (snapshot.marketRegime === 'trend' || snapshot.marketRegime === 'range' || snapshot.marketRegime === 'event_driven')
      ? snapshot.marketRegime
      : 'unknown';

    const regimeSlices = [
      {
        regime,
        sampleSize: candidateMetrics.sampleSize,
        slippageAdjustedExpectancyR: candidateMetrics.slippageAdjustedExpectancyR,
        maxDrawdownPct: candidateMetrics.maxDrawdownPct,
        turnover: candidateMetrics.turnover,
      },
    ];

    const contract = {
      objective: body.contract?.objective || 'slippageAdjustedExpectancyR',
      window: body.contract?.window || {
        trainStart: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        trainEnd: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        testStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        testEnd: new Date().toISOString(),
      },
      minSamples,
      hardRiskGates: {
        maxDrawdownPct: Number(body.contract?.hardRiskGates?.maxDrawdownPct || 8),
        maxTurnover: Number(body.contract?.hardRiskGates?.maxTurnover || 120),
        requirePositiveEdge: true,
        minExpectedNetEdgeBps: Number(body.contract?.hardRiskGates?.minExpectedNetEdgeBps || 0),
      },
      rollbackTarget: body.contract?.rollbackTarget || 'prompts/system_trading_brain.md@main',
      atomicChange: body.contract?.atomicChange || { type: 'prompt', changedKeys: ['live.auto_feed'] },
      improvementDelta: Number(body.contract?.improvementDelta || 0),
      regimeSpecialized: Boolean(body.contract?.regimeSpecialized || false),
    };

    const check = experimentGovernance.validateContract(contract as any);
    if (!check.valid) return res.status(400).json({ success: false, error: 'invalid_live_contract', details: check.errors });

    const record = experimentGovernance.recordRun({
      contract: contract as any,
      baselineMetrics: baselineMetrics as any,
      candidateMetrics: candidateMetrics as any,
      regimeSlices: regimeSlices as any,
    });

    res.json({
      success: true,
      mode: 'live_auto_feed',
      inputs: {
        baselineMetrics,
        candidateMetrics,
        regimeSlices,
        contract,
      },
      record,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'live_evaluate_failed' });
  }
});

router.get('/helix/promotion-audit', authenticateAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 30);
    res.json({ success: true, entries: promotionAudit.list(limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'promotion_audit_list_failed' });
  }
});

router.post('/helix/promotion-audit', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const entry = promotionAudit.append({
      ts: typeof body.ts === 'string' ? body.ts : new Date().toISOString(),
      type: String(body.type || 'unknown'),
      ...body,
    });
    res.json({ success: true, entry });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'promotion_audit_append_failed' });
  }
});

export default router;
