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
import { SettingsAuditService } from '../services/SettingsAuditService';
import { TradeIntelligenceService } from '../services/TradeIntelligenceService';
import { OperatorIntelligenceService } from '../services/OperatorIntelligenceService';
import { AIService } from '../services/ai.service';

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
const settingsAudit = new SettingsAuditService();
const tradeIntelligence = new TradeIntelligenceService();
const operatorIntelligence = new OperatorIntelligenceService();
const aiService = new AIService();
let tradingService: LiveTradingService | null = null;
let lastExchangeAuthDownAlerted = false;
let executionWorkerStarted = false;
let lastAutoSignalKey = '';
let lastAutoSignalAt = 0;
let lastWorkerRunAt: string | null = null;
let lastWorkerAction: string = 'idle';
let lastWorkerReason: string = 'not_started';
let lastWorkerReasonHuman: string = 'Worker has not started yet.';
let armedTrigger: { key: string; cyclesWithoutFill: number; armedAt: number } | null = null;
const STALE_TRIGGER_MAX_CYCLES = 5;
const DEFAULT_EXECUTION_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT'];
const AI_FRESHNESS_MAX_MS = Math.max(60_000, Number(process.env.AI_FRESHNESS_MAX_MS || 5 * 60_000));
let lastAiDecisionAt: string | null = null;
let lastExecutionSource: 'RULES' | 'AI' | 'HYBRID' = 'HYBRID';
let lastFallbackMode = false;
let lastCycleSymbolRejects: Array<{ symbol: string; reason: string }> = [];
let lastPositionFeedback: Array<{ symbol: string; stance: 'HOLD' | 'TRIM' | 'EXIT' | 'WATCH'; confidence: number; summary: string; ts: string }> = [];
const lastSeenPriceBySymbol = new Map<string, number>();
let lastSideSource: 'AI' | 'RULES' | 'N/A' = 'N/A';
let lastChosenSide: 'BUY' | 'SELL' | 'N/A' = 'N/A';
let lastAiGateDecision: 'TRADE' | 'NO_TRADE' | 'N/A' = 'N/A';
let lastFinalExecutionDecision: 'TRADE' | 'NO_TRADE' = 'NO_TRADE';
let lastAiConversations: Array<{ ts: string; symbol: string; promptSummary: string; responseSummary: string; confidence: number; delta: string }> = [];
const prevAiBySymbol = new Map<string, { decision: string; confidence: number; reason: string }>();
let selfLearningSchedulerStarted = false;
let selfLearningTimer: NodeJS.Timeout | null = null;
let selfLearningRunning = false;
let lastSelfLearningRunAt: string | null = null;
let nextSelfLearningRunAt: string | null = null;
let lastSelfLearningResult: any = null;
let lastSelfLearningError: string | null = null;

function getExecutionSymbols() {
  const configured = (settingsStore.get().riskSettings as any)?.tradeSymbols;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured
      .map((s: any) => String(s || '').trim().toUpperCase())
      .filter((s: string) => Boolean(s));
  }
  return DEFAULT_EXECUTION_SYMBOLS;
}

function getSymbolExecutionProfile(symbol: string) {
  const key = String(symbol || '').toUpperCase();
  const profiles: Record<string, {
    minConfidencePct: number;
    maxLeverage: number;
    stopDistancePct: number;
    targetR: number;
    sizeMultiplier: number;
    spreadCeilingBps: number;
    notes: string[];
  }> = {
    BTCUSDT: {
      minConfidencePct: 62,
      maxLeverage: 5,
      stopDistancePct: 0.005,
      targetR: 2.2,
      sizeMultiplier: 1,
      spreadCeilingBps: 8,
      notes: ['primary_symbol', 'allows_full_risk_budget'],
    },
    ETHUSDT: {
      minConfidencePct: 64,
      maxLeverage: 4,
      stopDistancePct: 0.0055,
      targetR: 2.0,
      sizeMultiplier: 0.85,
      spreadCeilingBps: 9,
      notes: ['secondary_symbol', 'slightly_reduced_size'],
    },
    XRPUSDT: {
      minConfidencePct: 66,
      maxLeverage: 3,
      stopDistancePct: 0.007,
      targetR: 2.0,
      sizeMultiplier: 0.65,
      spreadCeilingBps: 10,
      notes: ['alt_symbol_relaxed_gate', 'reduced_size'],
    },
    DOGEUSDT: {
      minConfidencePct: 68,
      maxLeverage: 2,
      stopDistancePct: 0.009,
      targetR: 2.2,
      sizeMultiplier: 0.5,
      spreadCeilingBps: 12,
      notes: ['meme_symbol_relaxed_gate', 'smallest_size'],
    },
    BNBUSDT: {
      minConfidencePct: 65,
      maxLeverage: 3,
      stopDistancePct: 0.006,
      targetR: 2.0,
      sizeMultiplier: 0.7,
      spreadCeilingBps: 8,
      notes: ['exchange_beta_symbol', 'moderate_size'],
    },
  };
  return profiles[key] || {
    minConfidencePct: 75,
    maxLeverage: 2,
    stopDistancePct: 0.006,
    targetR: 2,
    sizeMultiplier: 0.5,
    spreadCeilingBps: 8,
    notes: ['fallback_profile'],
  };
}

function getExecutionSymbolProfiles() {
  return getExecutionSymbols().map((symbol) => ({
    symbol,
    ...getSymbolExecutionProfile(symbol),
    tradable: true,
    watchlistOnly: false,
  }));
}

function getWatchlistSymbols() {
  return ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB'];
}

function keepOrUpdateSecret(currentValue: string, nextValue: unknown): string {
  if (typeof nextValue !== 'string') return currentValue;
  const candidate = nextValue.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!candidate) return currentValue;
  if (/^\*+$/.test(candidate)) return currentValue;
  return candidate;
}

function summarizeRiskSettingsForAudit(riskSettings: any) {
  return {
    maxDailyLossPct: Number(riskSettings?.maxDailyLossPct ?? 0),
    maxPositionSizePct: Number(riskSettings?.maxPositionSizePct ?? 0),
    maxLeverage: Number(riskSettings?.maxLeverage ?? 0),
    minLeverage: Number(riskSettings?.minLeverage ?? 0),
    maxOpenPositions: Number(riskSettings?.maxOpenPositions ?? 0),
    cooldownMinutes: Number(riskSettings?.cooldownMinutes ?? 0),
    maxTradesPerDay: Number(riskSettings?.maxTradesPerDay ?? 0),
    maxConsecutiveLosses: Number(riskSettings?.maxConsecutiveLosses ?? 0),
    minConfidence: Number(riskSettings?.minConfidence ?? 0),
    paperTrading: Boolean(riskSettings?.paperTrading),
  };
}

function buildSettingsAuditChanges(before: any, after: any) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const beforeRisk = summarizeRiskSettingsForAudit(before?.riskSettings || {});
  const afterRisk = summarizeRiskSettingsForAudit(after?.riskSettings || {});

  for (const key of Object.keys(afterRisk)) {
    if (JSON.stringify((beforeRisk as any)[key]) !== JSON.stringify((afterRisk as any)[key])) {
      changes[`riskSettings.${key}`] = {
        before: (beforeRisk as any)[key],
        after: (afterRisk as any)[key],
      };
    }
  }

  if (Boolean(before?.tradingEnabled) !== Boolean(after?.tradingEnabled)) {
    changes['tradingEnabled'] = { before: Boolean(before?.tradingEnabled), after: Boolean(after?.tradingEnabled) };
  }

  const beforePortfolio = Boolean(before?.modelAccounts?.[0]?.tradingEnabled);
  const afterPortfolio = Boolean(after?.modelAccounts?.[0]?.tradingEnabled);
  if (beforePortfolio !== afterPortfolio) {
    changes['modelAccounts[0].tradingEnabled'] = { before: beforePortfolio, after: afterPortfolio };
  }

  return changes;
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

function formatSymbolRejects(symbolRejects: Array<{ symbol: string; reason: string }>) {
  if (!symbolRejects.length) return 'No eligible setup this cycle.';
  return symbolRejects
    .map((r) => {
      const reason = String(r.reason || 'blocked')
        .replace(/^ai_no_trade:/, 'AI says no trade: ')
        .replace(/_/g, ' ');
      return `${r.symbol}: ${reason}`;
    })
    .join(' • ');
}

function humanizeWorkerReason(reason: string) {
  const r = String(reason || '').trim();
  if (!r) return 'No reason available.';
  if (r === 'not_started') return 'Worker has not started yet.';
  if (r === 'service_unavailable') return 'Trading service is unavailable right now.';
  if (r === 'trading_or_portfolio_disabled') return 'Global trading or DeepSeek Portfolio Trading is disabled in settings.';
  if (r === 'trade_confirmation_required') return 'Trade confirmation is enabled. Auto-execution is blocked until manually confirmed.';
  if (r === 'deepseek_not_configured') return 'DeepSeek API key is missing or not configured.';
  if (r === 'openai_not_configured') return 'OpenAI API key is missing or not configured.';
  if (r === 'gemini_not_configured') return 'Gemini API key is missing or not configured.';
  if (r === 'missing_price') return 'Live market price is missing; skipping this cycle.';
  if (r === 'duplicate_cooldown') return 'Duplicate signal cooldown active; waiting before re-entry.';
  if (r === 'stale_trigger_expired_recheck_regime') return 'Trigger expired without fill; waiting for a fresh setup.';
  if (r === 'ai_stale_guard_blocked') return 'AI heartbeat is stale; execution blocked for safety.';
  if (r.startsWith('plan_blocked:')) {
    const detail = r.slice('plan_blocked:'.length);
    if (detail.includes(';')) {
      const parsed = detail.split(';').map((x) => {
        const [symbol, ...rest] = x.split(':');
        return { symbol, reason: rest.join(':') };
      }).filter((x) => x.symbol);
      return `No trade this cycle. ${formatSymbolRejects(parsed as any)}`;
    }
    return `No trade this cycle: ${detail.replace(/_/g, ' ')}.`;
  }
  if (r.startsWith('signal_rejected:')) {
    const parts = r.split(':');
    const symbol = parts[1] || 'symbol';
    const why = (parts.slice(2).join(':') || 'risk gate rejected').replace(/_/g, ' ');
    return `Trade rejected for ${symbol}: ${why}.`;
  }
  return r.replace(/_/g, ' ');
}

function chooseRuleSide(params: {
  regime: string;
  symbol: string;
  currentPrice: number;
  momentum15mPct?: number;
  emaTrendPct?: number;
  rsi14?: number;
}) : 'BUY' | 'SELL' {
  const regime = String(params.regime || '').toLowerCase();
  const momentum15m = Number(params.momentum15mPct || 0);
  const emaTrend = Number(params.emaTrendPct || 0);
  const rsi = Number(params.rsi14 || 50);

  if (regime === 'breakdown') return 'SELL';
  if (regime === 'breakout') return 'BUY';

  // Trend-follow in directional regimes.
  if (regime === 'trend') {
    if (emaTrend < -0.03 || momentum15m < -0.08) return 'SELL';
    return 'BUY';
  }

  // Symmetric mean-reversion behavior in range/squeeze regimes.
  if (regime === 'range' || regime === 'squeeze') {
    if (rsi >= 62 || momentum15m >= 0.10) return 'SELL';
    if (rsi <= 38 || momentum15m <= -0.10) return 'BUY';
    if (emaTrend < -0.04) return 'SELL';
    if (emaTrend > 0.04) return 'BUY';
  }

  // Micro fallback using recent price drift.
  const last = lastSeenPriceBySymbol.get(params.symbol);
  lastSeenPriceBySymbol.set(params.symbol, params.currentPrice);
  if (last && Number.isFinite(last) && last > 0) {
    const deltaPct = ((params.currentPrice - last) / last) * 100;
    if (deltaPct <= -0.05) return 'SELL';
    if (deltaPct >= 0.05) return 'BUY';
  }

  return emaTrend < 0 ? 'SELL' : 'BUY';
}

function buildPositionFeedback(position: any) {
  const pnl = Number(position?.pnl || 0);
  const entry = Number(position?.entryPrice || 0);
  const mark = Number(position?.currentPrice || 0);
  const side = String(position?.side || 'LONG').toUpperCase();
  const movePct = entry > 0 ? (Math.abs(mark - entry) / entry) * 100 : 0;

  let stance: 'HOLD' | 'TRIM' | 'EXIT' | 'WATCH' = 'WATCH';
  let confidence = 58;
  let summary = 'Position stable. Continue monitoring.';

  if (pnl > 0 && movePct >= 0.25) {
    stance = 'HOLD';
    confidence = 72;
    summary = `Unrealized PnL positive (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}). Momentum favorable, keep holding with stop discipline.`;
  } else if (pnl > 0 && movePct >= 0.12) {
    stance = 'TRIM';
    confidence = 64;
    summary = `Position in profit (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}). Consider partial take-profit and keep runner.`;
  } else if (pnl < 0 && movePct >= 0.35) {
    stance = 'EXIT';
    confidence = 69;
    summary = `Adverse move building (${pnl.toFixed(2)}). Protect capital; consider reducing or exiting if invalidation remains.`;
  } else {
    stance = 'WATCH';
    confidence = 55;
    summary = `No strong edge yet. ${side} position needs confirmation before adding risk.`;
  }

  return {
    symbol: String(position?.symbol || 'UNKNOWN'),
    stance,
    confidence,
    summary,
    ts: new Date().toISOString(),
  };
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

function buildJournalWalkForward(entries: any[], allocatedBalance = 10000) {
  const closes = entries
    .filter((e) => e?.type === 'trade_close')
    .sort((a, b) => new Date(String(a.ts || 0)).getTime() - new Date(String(b.ts || 0)).getTime());

  if (closes.length < 4) {
    return {
      success: false,
      reason: 'insufficient_closed_trades_for_walk_forward',
      sampleSize: closes.length,
      windows: [],
    };
  }

  const mid = Math.max(1, Math.floor(closes.length / 2));
  const train = closes.slice(0, mid);
  const test = closes.slice(mid);
  return {
    success: true,
    sampleSize: closes.length,
    windows: [{
      window: {
        trainStart: train[0]?.ts || null,
        trainEnd: train[train.length - 1]?.ts || null,
        testStart: test[0]?.ts || null,
        testEnd: test[test.length - 1]?.ts || null,
      },
      leakageDetected: false,
      trainMetrics: buildMetricsFromJournal(train, allocatedBalance),
      testMetrics: buildMetricsFromJournal(test, allocatedBalance),
    }],
  };
}

async function getLearningJournalEntries(limit = 1000, tradeCloseLimit = 500) {
  const fileEntries = journalService.list(limit) || [];
  const fileTradeCloses = journalService.listByType('trade_close', tradeCloseLimit, Math.max(100000, limit * 20)) || [];
  let liveEntries: any[] = [];
  try {
    const svc = await ensureTradingService();
    liveEntries = svc?.getJournalEntries(limit) || [];
  } catch {
    liveEntries = [];
  }

  const dedup = new Map<string, any>();
  [...liveEntries, ...fileEntries, ...fileTradeCloses].forEach((entry: any) => {
    const key = [
      entry?.ts || '',
      entry?.type || '',
      entry?.modelId || '',
      entry?.symbol || '',
      entry?.pnl ?? '',
      entry?.reason || '',
    ].join('|');
    if (!dedup.has(key)) dedup.set(key, entry);
  });

  const merged = Array.from(dedup.values())
    .sort((a: any, b: any) => new Date(String(a?.ts || 0)).getTime() - new Date(String(b?.ts || 0)).getTime());
  const tradeCloses = merged.filter((entry: any) => entry?.type === 'trade_close');
  const otherEntries = merged.filter((entry: any) => entry?.type !== 'trade_close');
  const otherBudget = Math.max(0, limit - tradeCloses.length);

  return [...otherEntries.slice(-otherBudget), ...tradeCloses]
    .sort((a: any, b: any) => new Date(String(a?.ts || 0)).getTime() - new Date(String(b?.ts || 0)).getTime());
}

function getSelfLearningSettings() {
  const s = settingsStore.get();
  const raw = (s as any).selfLearningSettings || {};
  return {
    enabled: raw.enabled !== false,
    intervalHours: Math.max(1, Math.min(168, Number(raw.intervalHours || 6))),
    minClosedTrades: Math.max(5, Math.min(500, Number(raw.minClosedTrades || 30))),
    autoRiskTightening: raw.autoRiskTightening !== false,
    allowLivePromotion: raw.allowLivePromotion === true,
    notifyOnReview: raw.notifyOnReview !== false,
  };
}

function buildSelfLearningContract(settings: any, minClosedTrades: number) {
  return {
    objective: 'slippageAdjustedExpectancyR',
    window: {
      trainStart: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      trainEnd: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      testStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      testEnd: new Date().toISOString(),
    },
    minSamples: minClosedTrades,
    hardRiskGates: {
      maxDrawdownPct: Number(settings.riskSettings?.killSwitchDrawdownPct || 5),
      maxTurnover: Number(settings.riskSettings?.maxTradesPerDay || 8) * 14,
      requirePositiveEdge: true,
      minExpectedNetEdgeBps: 0,
    },
    rollbackTarget: 'prompts/system_trading_brain.md@main',
    atomicChange: { type: 'risk_template' as const, changedKeys: ['self_learning.review'] },
    improvementDelta: 0,
    regimeSpecialized: false,
  };
}

async function runSelfLearningReview(reason: 'scheduled' | 'manual' | 'startup' = 'scheduled') {
  if (selfLearningRunning) {
    return {
      success: false,
      skipped: true,
      reason: 'self_learning_review_already_running',
      lastRunAt: lastSelfLearningRunAt,
    };
  }

  selfLearningRunning = true;
  lastSelfLearningError = null;
  const startedAt = new Date().toISOString();

  try {
    const settings = settingsStore.get();
    const cfg = getSelfLearningSettings();
    const allocatedBalance = Number(settings.modelAccounts?.[0]?.balance || 10000);
    const entries = await getLearningJournalEntries(10_000);
    const closes = entries.filter((e: any) => e?.type === 'trade_close');
    const mid = Math.max(1, Math.floor(closes.length / 2));
    const baselineEntries = entries.filter((e: any) => e?.type !== 'trade_close' || closes.slice(0, mid).includes(e));
    const candidateEntries = entries.filter((e: any) => e?.type !== 'trade_close' || closes.slice(mid).includes(e));

    const baselineMetrics = buildMetricsFromJournal(baselineEntries, allocatedBalance);
    const candidateMetrics = buildMetricsFromJournal(candidateEntries, allocatedBalance);
    const snapshot = await riskIntel.getSnapshot(getExecutionSymbols().slice(0, 2));
    const regime = (snapshot.marketRegime === 'trend' || snapshot.marketRegime === 'range' || snapshot.marketRegime === 'event_driven')
      ? snapshot.marketRegime
      : 'unknown';
    const regimeSlices = [{
      regime,
      sampleSize: candidateMetrics.sampleSize,
      slippageAdjustedExpectancyR: candidateMetrics.slippageAdjustedExpectancyR,
      maxDrawdownPct: candidateMetrics.maxDrawdownPct,
      turnover: candidateMetrics.turnover,
    }];
    const contract = buildSelfLearningContract(settings, cfg.minClosedTrades);
    const check = experimentGovernance.validateContract(contract as any);
    if (!check.valid) throw new Error(`self_learning_contract_invalid:${check.errors.join(',')}`);

    const record = experimentGovernance.recordRun({
      contract: contract as any,
      baselineMetrics: baselineMetrics as any,
      candidateMetrics: candidateMetrics as any,
      regimeSlices: regimeSlices as any,
    });

    const walkForwardResult = buildJournalWalkForward(entries, allocatedBalance);
    const hasEnoughEvidence = closes.length >= cfg.minClosedTrades;
    const decision = hasEnoughEvidence ? record.result.decision : 'insufficient_evidence';
    const reasons = hasEnoughEvidence
      ? (record.result.reasons || [])
      : Array.from(new Set([...(record.result.reasons || []), 'scheduler_evidence_gate_not_met']));
    const shouldTightenRisk = cfg.autoRiskTightening
      && hasEnoughEvidence
      && (decision === 'reverted' || reasons.includes('non_positive_edge_after_costs') || reasons.includes('drawdown_above_threshold'));
    let riskAdjustment: any = null;

    if (shouldTightenRisk) {
      const before = settingsStore.get();
      const currentRisk = before.riskSettings || {};
      const nextMaxPositionSizePct = Math.max(1, Number(currentRisk.maxPositionSizePct || 5) * 0.8);
      const nextCooldownMinutes = Math.min(240, Math.max(Number(currentRisk.cooldownMinutes || 30), Number(currentRisk.cooldownMinutes || 30) + 10));
      const after = {
        ...before,
        riskSettings: {
          ...currentRisk,
          maxPositionSizePct: Number(nextMaxPositionSizePct.toFixed(2)),
          cooldownMinutes: nextCooldownMinutes,
        },
      };
      settingsStore.set(after);
      tradingService = null;
      riskAdjustment = {
        applied: true,
        reason: 'protective_tightening_after_negative_learning_review',
        before: {
          maxPositionSizePct: currentRisk.maxPositionSizePct,
          cooldownMinutes: currentRisk.cooldownMinutes,
        },
        after: {
          maxPositionSizePct: after.riskSettings.maxPositionSizePct,
          cooldownMinutes: after.riskSettings.cooldownMinutes,
        },
      };
      settingsAudit.append({
        ts: new Date().toISOString(),
        actor: 'self_learning_scheduler',
        type: 'risk_auto_tightened',
        summary: 'Self-learning review tightened risk after weak/unsafe evidence',
        changes: riskAdjustment,
      });
    }

    const promotionAllowed = cfg.allowLivePromotion && decision === 'kept';
    const result = {
      success: true,
      mode: reason,
      startedAt,
      completedAt: new Date().toISOString(),
      enabled: cfg.enabled,
      evidence: {
        closedTrades: closes.length,
        requiredClosedTrades: cfg.minClosedTrades,
        readinessPct: cfg.minClosedTrades > 0 ? Math.min(100, Math.round((closes.length / cfg.minClosedTrades) * 100)) : 0,
      },
      promotionAllowed,
      livePromotionSubmitted: false,
      record,
      walkForwardResult,
      riskAdjustment,
      nextAction: promotionAllowed
        ? 'candidate_passed_gates_but_live_promotion_requires_explicit_signal_path'
        : decision === 'kept'
          ? 'candidate_kept_in_shadow_review_no_live_promotion'
          : decision === 'insufficient_evidence'
            ? 'collect_more_closed_trades_before_strategy_changes'
            : 'baseline_kept_risk_protection_active',
    };

    lastSelfLearningRunAt = result.completedAt;
    lastSelfLearningResult = result;
    promotionAudit.append({
      ts: result.completedAt,
      type: 'self_learning_review',
      mode: reason,
      decision,
      reasons,
      candidateMetrics,
      baselineMetrics,
      riskAdjustment,
      walkForward: walkForwardResult,
      nextAction: result.nextAction,
    });

    if (cfg.notifyOnReview) {
      await sendTelegramAlert(
        decision === 'reverted' ? 'warning' : 'info',
        'Self-Learning Review Complete',
        [
          `Decision: ${decision}`,
          `Reasons: ${reasons.slice(0, 4).join(', ') || 'none'}`,
          `Closed trades: ${closes.length}/${cfg.minClosedTrades}`,
          riskAdjustment?.applied ? `Risk tightened: max position ${riskAdjustment.before.maxPositionSizePct}% -> ${riskAdjustment.after.maxPositionSizePct}%` : 'Risk change: none',
        ],
        `self_learning_review_${decision}_${new Date().toISOString().slice(0, 13)}`
      );
    }

    return result;
  } catch (error: any) {
    const msg = error?.message || 'self_learning_review_failed';
    lastSelfLearningError = msg;
    lastSelfLearningRunAt = new Date().toISOString();
    lastSelfLearningResult = { success: false, mode: reason, startedAt, completedAt: lastSelfLearningRunAt, error: msg };
    promotionAudit.append({
      ts: lastSelfLearningRunAt,
      type: 'self_learning_review_failed',
      mode: reason,
      error: msg,
    });
    logger.error('self_learning_review_failed', { error: msg });
    return lastSelfLearningResult;
  } finally {
    selfLearningRunning = false;
  }
}

function scheduleNextSelfLearningRun(immediate = false) {
  if (selfLearningTimer) clearTimeout(selfLearningTimer);
  const cfg = getSelfLearningSettings();
  if (!cfg.enabled) {
    nextSelfLearningRunAt = null;
    return;
  }
  const delayMs = immediate ? 30_000 : cfg.intervalHours * 60 * 60 * 1000;
  nextSelfLearningRunAt = new Date(Date.now() + delayMs).toISOString();
  selfLearningTimer = setTimeout(async () => {
    await runSelfLearningReview('scheduled');
    scheduleNextSelfLearningRun(false);
  }, delayMs);
  selfLearningTimer.unref?.();
}

function startSelfLearningScheduler() {
  if (selfLearningSchedulerStarted) return;
  selfLearningSchedulerStarted = true;
  scheduleNextSelfLearningRun(true);
  logger.info('self_learning_scheduler_started', { nextRunAt: nextSelfLearningRunAt });
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
    minLeverage: Number((s.riskSettings as any).minLeverage || 10),
    maxOpenPositions: Number((s.riskSettings as any).maxOpenPositions || 4),
    paperTrading: Boolean((s.riskSettings as any).paperTrading),
    maxUnprotectedPositionSeconds: 15,
    stopPlacementRetries: 4,
    breakEvenEnabled: Boolean((s.riskSettings as any).breakEvenEnabled),
    breakEvenTriggerR: Number((s.riskSettings as any).breakEvenTriggerR || 1),
    breakEvenBufferPct: Number((s.riskSettings as any).breakEvenBufferPct || 0),
    breakEvenFeeBps: Number((s.riskSettings as any).breakEvenFeeBps ?? 8),
    breakEvenSlippageBps: Number((s.riskSettings as any).breakEvenSlippageBps ?? 5),
    letWinnersRunEnabled: (s.riskSettings as any).letWinnersRunEnabled !== false,
    runnerActivationR: Number((s.riskSettings as any).runnerActivationR ?? 2),
    runnerPartialTakeProfitPct: Number((s.riskSettings as any).runnerPartialTakeProfitPct ?? 30),
    runnerTrailPct: Number((s.riskSettings as any).runnerTrailPct ?? 0.006),
  };
}

function startExecutionWorker() {
  if (executionWorkerStarted) return;
  executionWorkerStarted = true;

  const runCycle = async () => {
    lastWorkerRunAt = new Date().toISOString();
    try {
      const svc = await ensureTradingService();
      if (!svc) {
        lastWorkerAction = 'skip';
        lastWorkerReason = 'service_unavailable';
        return;
      }

      const s = settingsStore.get();

      // Always refresh position monitor feedback each cycle, even when entry gates block new trades.
      try {
        await svc.updatePositions();
        const currentOpenPositions = svc.getModelAccount('1')?.positions || [];
        lastPositionFeedback = currentOpenPositions.slice(0, 5).map((p) => buildPositionFeedback(p));
      } catch {
        // keep prior monitor state on transient sync failures
      }

      const portfolioEnabled = Boolean(s.modelAccounts?.[0]?.tradingEnabled);
      if (!s.tradingEnabled || !portfolioEnabled) {
        lastWorkerAction = 'skip';
        lastWorkerReason = 'trading_or_portfolio_disabled';
        return;
      }

      if (Boolean((s as any).tradeConfirmation)) {
        lastWorkerAction = 'skip';
        lastWorkerReason = 'trade_confirmation_required';
        return;
      }

      const selectedProvider = aiService.getSelectedProvider();
      const providerConfigured = selectedProvider === 'openai'
        ? aiService.isOpenAIConfigured()
        : selectedProvider === 'gemini'
          ? aiService.isGeminiConfigured()
          : aiService.isDeepSeekConfigured();

      if (!providerConfigured) {
        lastWorkerAction = 'skip';
        lastWorkerReason = `${selectedProvider}_not_configured`;
        return;
      }

      const portfolio = svc.getModelAccount('1');
      let balance = Number(portfolio?.currentBalance || portfolio?.allocatedBalance || 0);
      let availableMargin = 0;
      let exchangeRuntimeDegraded = false;

      try {
        const exchangeAccount = await svc.getExchangeAccountInfo();
        balance = Number(exchangeAccount?.totalWalletBalance || balance || 0);
        availableMargin = Number(exchangeAccount?.availableBalance || 0);
      } catch (error: any) {
        exchangeRuntimeDegraded = true;
        logger.warn('worker_exchange_account_fallback', {
          error: error?.message || 'unknown',
        });
      }

      const executionSymbols = getExecutionSymbols();
      const snapshot = await riskIntel.getSnapshot(executionSymbols);
      const runtimeContext = {
        generatedAt: snapshot.generatedAt,
        account: {
          balance,
          availableMargin,
          previousDayPnl: Number(portfolio?.dailyPnl || 0),
          consecutiveLosses: Number(portfolio?.consecutiveLosses || 0),
        },
        market: {
          regime: snapshot.marketRegime,
          regimeConfidence: snapshot.regimeConfidence,
          liquidityState: snapshot.liquidityState,
          volatilityState: snapshot.volatilityState,
        },
        news: snapshot.newsHeadlines,
        notes: [
          ...(snapshot.riskFlags || []),
          ...(exchangeRuntimeDegraded ? ['exchange_account_fetch_degraded_using_portfolio_fallback'] : []),
        ],
        maxTradesToday: s.riskSettings.maxTradesPerDay,
        riskSettings: {
          maxDailyLossPct: s.riskSettings.maxDailyLossPct,
          maxLeverage: s.riskSettings.maxLeverage,
          maxConsecutiveLosses: s.riskSettings.maxConsecutiveLosses,
          minConfidence: s.riskSettings.minConfidence,
        },
      };

      const baseConstraints = {
        equityUsd: Math.max(0, balance),
        availableMarginUsd: Math.max(0, availableMargin),
        currentDrawdownPct: portfolio && portfolio.allocatedBalance > 0
          ? Math.max(0, ((portfolio.allocatedBalance - portfolio.currentBalance) / portfolio.allocatedBalance) * 100)
          : 0,
        maxDrawdownPct: Number(s.riskSettings.killSwitchDrawdownPct || 5),
        perTradeRiskPct: Math.min(1.5, Math.max(0.25, Number(s.riskSettings.maxPositionSizePct || 5) / 20)),
        maxOpenPositions: Math.max(1, Number((s.riskSettings as any).maxOpenPositions || 1)),
        openPositions: Number(portfolio?.positions?.length || 0),
        slippageBps: 8,
        feesBps: s.testnet ? 2 : 6,
      };

      const symbolRejects: Array<{ symbol: string; reason: string }> = [];
      const selectedCandidates: Array<{ plan: any; confidence: number; sideSource: 'AI' | 'RULES'; side: 'BUY' | 'SELL'; profile: ReturnType<typeof getSymbolExecutionProfile> }> = [];

      for (const symbol of executionSymbols) {
        const symbolFunding = snapshot.funding.find((x) => x.symbol === symbol) || snapshot.funding[0];
        const currentPrice = Number(symbolFunding?.markPrice || 0);
        if (currentPrice <= 0) {
          symbolRejects.push({ symbol, reason: 'missing_price' });
          continue;
        }

        const profile = getSymbolExecutionProfile(symbol);
        const stopDistance = currentPrice * profile.stopDistancePct;
        const micro = (snapshot as any).microstructure?.find((m: any) => m.symbol === symbol) || {};
        if (Number(micro.spreadBps || 0) > profile.spreadCeilingBps) {
          symbolRejects.push({ symbol, reason: `spread_above_symbol_limit:${Number(micro.spreadBps || 0).toFixed(2)}>${profile.spreadCeilingBps}` });
          continue;
        }
        const aiDecision = await aiService.getStructuredTradingDecision(
          symbol,
          { current: currentPrice, change: Number(micro.change24hPct || 0) },
          {
            rsi: Number(micro.rsi14 || 50),
            macd: Number(micro.emaTrendPct || 0),
            ema20: currentPrice,
            volume: Number(micro.volume24hUsd || 0),
            momentum15mPct: Number(micro.momentum15mPct || 0),
            spreadBps: Number(micro.spreadBps || 0),
            atrPct: Number(micro.atrPct || 0),
            support: Number(micro.support || 0),
            resistance: Number(micro.resistance || 0),
          },
          selectedProvider as any,
          {
            ...runtimeContext,
            notes: [
              ...(runtimeContext.notes || []),
              `symbol_profile=${JSON.stringify({
                symbol,
                minConfidencePct: profile.minConfidencePct,
                maxLeverage: profile.maxLeverage,
                stopDistancePct: profile.stopDistancePct,
                targetR: profile.targetR,
                sizeMultiplier: profile.sizeMultiplier,
                spreadCeilingBps: profile.spreadCeilingBps,
                notes: profile.notes,
              })}`,
              `symbol_microstructure=${JSON.stringify({
                symbol,
                spreadBps: Number(micro.spreadBps || 0),
                atrPct: Number(micro.atrPct || 0),
                emaTrendPct: Number(micro.emaTrendPct || 0),
                rsi14: Number(micro.rsi14 || 50),
                momentum15mPct: Number(micro.momentum15mPct || 0),
                volume24hUsd: Number(micro.volume24hUsd || 0),
                support: Number(micro.support || 0),
                resistance: Number(micro.resistance || 0),
              })}`,
            ],
          }
        );
        lastAiDecisionAt = new Date().toISOString();

        const aiReason = Array.isArray(aiDecision.reasons) && aiDecision.reasons.length
          ? String(aiDecision.reasons[0])
          : 'no_reason';
        const prev = prevAiBySymbol.get(symbol);
        const delta = !prev
          ? 'first observation'
          : prev.decision !== aiDecision.decision
            ? `decision ${prev.decision} → ${aiDecision.decision}`
            : prev.confidence !== Number(aiDecision.confidence || 0)
              ? `confidence ${prev.confidence}% → ${Number(aiDecision.confidence || 0)}%`
              : prev.reason !== aiReason
                ? 'reason updated'
                : 'no material change';

        prevAiBySymbol.set(symbol, {
          decision: aiDecision.decision,
          confidence: Number(aiDecision.confidence || 0),
          reason: aiReason,
        });

        lastAiConversations.unshift({
          ts: new Date().toISOString(),
          symbol,
          promptSummary: `regime=${snapshot.marketRegime}, liq=${snapshot.liquidityState}, vol=${snapshot.volatilityState}, conf=${snapshot.regimeConfidence}%`,
          responseSummary: `${aiDecision.decision} (${aiReason})`,
          confidence: Number(aiDecision.confidence || 0),
          delta,
        });
        lastAiConversations = lastAiConversations.slice(0, 30);

        const ruleSide = chooseRuleSide({
          regime: snapshot.marketRegime,
          symbol,
          currentPrice,
          momentum15mPct: Number(micro.momentum15mPct || 0),
          emaTrendPct: Number(micro.emaTrendPct || 0),
          rsi14: Number(micro.rsi14 || 50),
        });
        const side: 'BUY' | 'SELL' = aiDecision.decision === 'TRADE'
          ? (aiDecision.side === 'SHORT' ? 'SELL' : aiDecision.side === 'LONG' ? 'BUY' : ruleSide)
          : ruleSide;
        const sideSource: 'AI' | 'RULES' = aiDecision.side ? 'AI' : 'RULES';
        const trendStrength = Math.max(profile.minConfidencePct - 5, Math.min(95, Number(aiDecision.confidence || snapshot.regimeConfidence || 50)));
        const volatilityPct = snapshot.volatilityState === 'high' ? 2.6 : snapshot.volatilityState === 'low' ? 1.0 : 1.8;
        const spreadBps = snapshot.liquidityState === 'poor' ? 15 : snapshot.liquidityState === 'acceptable' ? 8 : 4;
        const volumeScore = snapshot.liquidityState === 'good' ? 75 : snapshot.liquidityState === 'acceptable' ? 55 : 30;

        const candidate = {
          symbol,
          side,
          entry: aiDecision.entry ?? currentPrice,
          stopLoss: aiDecision.stop_loss ?? (side === 'BUY' ? currentPrice - stopDistance : currentPrice + stopDistance),
          takeProfit: aiDecision.take_profit ?? (side === 'BUY' ? currentPrice + stopDistance * profile.targetR : currentPrice - stopDistance * profile.targetR),
          confidence: trendStrength,
          thesis: `ai=${aiDecision.decision} regime=${snapshot.marketRegime} confidence=${aiDecision.confidence} side=${side} side_source=${aiDecision.side ? 'ai' : 'rules'} profile=${symbol}`,
          style: snapshot.marketRegime === 'range' ? 'mean_reversion' : 'momentum',
        };

        const plan = helixEvolution.evaluateTrade(
          {
            symbol,
            price: currentPrice,
            change24hPct: 0,
            trendStrength,
            volatilityPct,
            spreadBps,
            volumeScore,
            sector: 'technology',
          },
          candidate,
          baseConstraints
        );

        const reasons = [...(aiDecision.reasons || []), ...(plan.reasons || []), ...profile.notes];
        if (Number(aiDecision.confidence || 0) < profile.minConfidencePct) {
          reasons.push(`below_symbol_confidence_floor:${Number(aiDecision.confidence || 0)}<${profile.minConfidencePct}`);
        }
        logger.info('ai_decision_trace', {
          model: selectedProvider,
          symbol,
          decision: aiDecision.decision === 'TRADE' && plan.decision === 'TRADE' ? 'TRADE' : 'NO_TRADE',
          regime: snapshot.marketRegime,
          regimeConfidence: snapshot.regimeConfidence,
          liquidityState: snapshot.liquidityState,
          volatilityState: snapshot.volatilityState,
          reasons,
          expectedRMultiple: Number(plan.expectedRMultiple || aiDecision.expected_rr || 0),
          expectedNetEdgeBps: Number(plan.expectedNetEdgeBps || 0),
        });

        journalService.append({
          ts: new Date().toISOString(),
          type: 'ai_decision',
          model: 'deepseek',
          symbol,
          side,
          decision: aiDecision.decision === 'TRADE' && plan.decision === 'TRADE' ? 'TRADE' : 'NO_TRADE',
          confidence: Number(aiDecision.confidence || snapshot.regimeConfidence || 0),
          reasons,
          gateResult: plan.decision === 'TRADE' ? 'passed' : 'blocked',
          regime: snapshot.marketRegime,
          liquidityState: snapshot.liquidityState,
          volatilityState: snapshot.volatilityState,
          entry: Number(plan.entry || aiDecision.entry || currentPrice || 0),
          stopLoss: Number(plan.stopLoss || aiDecision.stop_loss || 0),
          takeProfit: Number(plan.takeProfit || aiDecision.take_profit || 0),
          expectedRMultiple: Number(plan.expectedRMultiple || aiDecision.expected_rr || 0),
          expectedNetEdgeBps: Number(plan.expectedNetEdgeBps || 0),
        });

        const softProbeEligible = (
          aiDecision.decision !== 'TRADE' &&
          String(snapshot.marketRegime || '').toLowerCase() === 'range' &&
          String(snapshot.liquidityState || '').toLowerCase() === 'good' &&
          String(snapshot.volatilityState || '').toLowerCase() === 'low' &&
          Number(snapshot.regimeConfidence || 0) >= 58 &&
          !Array.isArray(snapshot.riskFlags) ? false : (snapshot.riskFlags || []).length === 0
        );

        if (aiDecision.decision !== 'TRADE' && !softProbeEligible) {
          symbolRejects.push({ symbol, reason: `ai_no_trade:${(aiDecision.reasons || [])[0] || 'model_blocked'}` });
          continue;
        }

        if (Number(aiDecision.confidence || 0) < profile.minConfidencePct && !softProbeEligible) {
          symbolRejects.push({ symbol, reason: `symbol_confidence_gate:${Number(aiDecision.confidence || 0)}<${profile.minConfidencePct}` });
          continue;
        }

        if (plan.decision !== 'TRADE' || !plan.side || !plan.entry || !plan.stopLoss || !plan.takeProfit) {
          symbolRejects.push({ symbol, reason: (plan.reasons || []).join('|') || 'plan_blocked' });
          continue;
        }

        if (softProbeEligible) {
          const probePlan = {
            ...plan,
            leverageCap: 1,
            probeMode: true,
            reasons: [...(plan.reasons || []), 'soft_probe_unlock_range_regime'],
          };
          selectedCandidates.push({
            plan: probePlan,
            confidence: Number(aiDecision.confidence || snapshot.regimeConfidence || 0),
            sideSource: 'RULES',
            side,
            profile,
          });
        } else {
          selectedCandidates.push({
            plan,
            confidence: Number(aiDecision.confidence || snapshot.regimeConfidence || 0),
            sideSource,
            side,
            profile,
          });
        }
      }

      lastCycleSymbolRejects = symbolRejects;
      if (!selectedCandidates.length) {
        lastAiGateDecision = 'NO_TRADE';
        lastFinalExecutionDecision = 'NO_TRADE';
        lastSideSource = 'N/A';
        lastChosenSide = 'N/A';
        lastWorkerAction = 'skip';
        lastWorkerReason = symbolRejects.length
          ? `plan_blocked:${symbolRejects.map((r) => `${r.symbol}:${r.reason}`).join(';')}`
          : 'plan_blocked:no_reason';
        armedTrigger = null;
        return;
      }

      lastAiGateDecision = 'TRADE';
      lastSideSource = selectedCandidates[0].sideSource;
      lastChosenSide = selectedCandidates[0].side;

      const aiStale = !lastAiDecisionAt || (Date.now() - new Date(lastAiDecisionAt).getTime()) > AI_FRESHNESS_MAX_MS;
      if (aiStale) {
        lastWorkerAction = 'skip';
        lastFallbackMode = true;
        lastFinalExecutionDecision = 'NO_TRADE';
        lastWorkerReason = 'ai_stale_guard_blocked';
        armedTrigger = null;
        return;
      }
      lastFallbackMode = false;
      lastExecutionSource = 'HYBRID';

      const maxOpenPositions = Math.max(1, Number((s.riskSettings as any).maxOpenPositions || 1));
      const openNow = Number(svc.getModelAccount('1')?.positions?.length || 0);
      const slotsLeft = Math.max(0, maxOpenPositions - openNow);
      const maxTradesToday = Number(s.riskSettings.maxTradesPerDay || 5);
      const tradesToday = Number(svc.getModelAccount('1')?.tradesToday || 0);
      const tradesLeft = Math.max(0, maxTradesToday - tradesToday);
      const executionBudget = Math.max(0, Math.min(slotsLeft, tradesLeft, selectedCandidates.length));

      if (executionBudget <= 0) {
        lastFinalExecutionDecision = 'NO_TRADE';
        lastWorkerAction = 'skip';
        lastWorkerReason = `capacity_blocked:slots_left=${slotsLeft};trades_left=${tradesLeft}`;
        armedTrigger = null;
        return;
      }

      const openedSymbols: string[] = [];
      const rejectionRows: string[] = [];
      const now = Date.now();

      for (const candidate of selectedCandidates.slice(0, executionBudget)) {
        const plan = candidate.plan;
        const signalKey = `${plan.symbol}:${plan.side}:${Math.round(plan.entry)}`;
        if (signalKey === lastAutoSignalKey && now - lastAutoSignalAt < 15 * 60 * 1000) {
          rejectionRows.push(`${plan.symbol}:duplicate_cooldown`);
          continue;
        }

        const probeMode = Boolean((plan as any).probeMode);
        const profile = candidate.profile;
        const probeQty = probeMode
          ? (() => {
              const currentPrice = Number(plan.entry || 0);
              const accountBal = Number(portfolio?.currentBalance || portfolio?.allocatedBalance || balance || 0);
              if (!(currentPrice > 0) || !(accountBal > 0)) return undefined;
              const baseUsd = accountBal * (Number(s.riskSettings.maxPositionSizePct || 7) / 100);
              const probeUsd = Math.max(10, baseUsd * 0.35);
              return probeUsd / currentPrice;
            })()
          : undefined;

        const adaptiveQty = !probeMode
          ? (() => {
              const currentPrice = Number(plan.entry || 0);
              const accountBal = Number(portfolio?.currentBalance || portfolio?.allocatedBalance || balance || 0);
              if (!(currentPrice > 0) || !(accountBal > 0)) return undefined;
              const baseUsd = accountBal * (Number(s.riskSettings.maxPositionSizePct || 5) / 100);
              const symbolUsd = Math.max(10, baseUsd * Number(profile.sizeMultiplier || 1));
              return symbolUsd / currentPrice;
            })()
          : undefined;

        const minLeverage = Math.max(10, Number((s.riskSettings as any).minLeverage || 10));
        const maxLeverage = Math.max(minLeverage, Number(s.riskSettings.maxLeverage || 20));
        const preferredLeverage = probeMode
          ? minLeverage
          : Number(candidate.confidence || 0) >= 75
            ? maxLeverage
            : minLeverage;

        const signal: TradeSignal = {
          modelId: '1',
          symbol: plan.symbol,
          side: plan.side,
          type: 'MARKET',
          quantity: probeQty ?? adaptiveQty,
          confidence: Math.max(0, Math.min(1, Number(candidate.confidence || 0) / 100)),
          reason: `auto_worker_unified regime=${snapshot.marketRegime} rr=${Number(plan.expectedRMultiple || 0).toFixed(2)} edge=${Number(plan.expectedNetEdgeBps || 0).toFixed(1)}bps${probeMode ? ' soft_probe=1' : ''}`,
          stopLoss: plan.stopLoss,
          takeProfit: plan.takeProfit,
          leverage: preferredLeverage,
          timestamp: new Date(),
        };

        const ok = await svc.processTradeSignal(signal);
        if (ok) {
          openedSymbols.push(`${signal.symbol}:${signal.side}`);
          lastAutoSignalKey = signalKey;
          lastAutoSignalAt = now;
          logger.info('auto_execution_trade_opened', { symbol: signal.symbol, side: signal.side, confidence: signal.confidence });
        } else {
          const reject = svc.getLastSignalRejectReason();
          rejectionRows.push(`${signal.symbol}:${reject || 'signal_rejected_by_risk_gate'}`);
          logger.warn('ai_decision_rejected', {
            symbol: signal.symbol,
            side: signal.side,
            reason: reject || 'signal_rejected_by_risk_gate',
          });
        }
      }

      if (openedSymbols.length > 0) {
        lastFinalExecutionDecision = 'TRADE';
        lastWorkerAction = 'trade_opened';
        lastWorkerReason = openedSymbols.join(',');
        armedTrigger = null;
      } else {
        lastFinalExecutionDecision = 'NO_TRADE';
        lastWorkerAction = 'skip';
        lastWorkerReason = rejectionRows.length ? `signal_rejected:${rejectionRows.join(';')}` : 'signal_rejected:no_candidate_executed';
      }

      // Refresh account state from exchange before generating monitor feedback,
      // so position monitor still works after backend restarts.
      await svc.updatePositions();
      const openPositions = svc.getModelAccount('1')?.positions || [];
      lastPositionFeedback = openPositions.slice(0, 5).map((p) => buildPositionFeedback(p));
      for (const feedback of lastPositionFeedback) {
        journalService.append({
          ts: feedback.ts,
          type: 'ai_position_feedback',
          model: 'deepseek',
          symbol: feedback.symbol,
          decision: feedback.stance,
          confidence: feedback.confidence,
          reasons: [feedback.summary],
          gateResult: 'position_monitor',
        });
      }
    } catch (error: any) {
      const msg = String(error?.message || 'unknown');
      const degraded = /enotfound|econnreset|timeout|aborted|network/i.test(msg);
      lastWorkerAction = 'error';
      lastWorkerReason = degraded ? 'network_provider_degraded' : msg;
      logger.warn('auto_execution_worker_cycle_failed', {
        error: msg,
        degraded,
      });
    } finally {
      lastWorkerReasonHuman = humanizeWorkerReason(lastWorkerReason);
    }
  };

  // Run immediately at startup, then continue every 60s.
  runCycle();
  setInterval(runCycle, 60_000);
}

function isTradingServiceHealthy(svc: LiveTradingService | null): boolean {
  if (!svc) return false;
  try {
    const status = svc.getTradingStatus();
    return Boolean(status.connected) && Number(status.accounts || 0) > 0;
  } catch {
    return false;
  }
}

async function ensureTradingService(forceReinit = false) {
  const s = settingsStore.get();
  if (!s.masterApiKey || !s.masterSecretKey) {
    tradingService = null;
    return null;
  }

  if (!forceReinit && isTradingServiceHealthy(tradingService)) {
    return tradingService;
  }

  if (tradingService && !forceReinit) {
    try {
      const stale = tradingService.getTradingStatus();
      logger.warn('trading_service_reinit_required', {
        connected: stale.connected,
        accounts: stale.accounts,
        enabled: stale.enabled,
      });
    } catch {
      logger.warn('trading_service_reinit_required', { reason: 'status_probe_failed' });
    }
  }

  const nextService = new LiveTradingService(
    { apiKey: s.masterApiKey, secretKey: s.masterSecretKey, testnet: s.testnet },
    buildTradingConfigFromSettings()
  );

  try {
    await nextService.initialize();

    // DeepSeek-only account
    const deepseekAccount = s.modelAccounts.find((m) => m.modelId === 1) || {
      modelId: 1,
      modelName: 'DeepSeek Chat V3.1',
      balance: 10000,
      tradingEnabled: false,
    };

    nextService.createModelAccount('1', 'DeepSeek Chat V3.1', deepseekAccount.balance || 10000);
    nextService.setTradingEnabled(s.tradingEnabled);
    tradingService = nextService;
  } catch (error: any) {
    tradingService = null;
    logger.error('trading_service_init_failed', {
      error: error?.message || 'unknown',
      testnet: Boolean(s.testnet),
    });
    throw error;
  }

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

  startExecutionWorker();
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
    const currentSettings = settingsStore.get();
    const portfolioEnabled = Boolean(currentSettings.modelAccounts?.[0]?.tradingEnabled);
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
      providerMode: 'multi_provider',
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

router.get('/symbol-profiles', async (_req, res) => {
  try {
    const profiles = getExecutionSymbolProfiles();
    const watchlist = getWatchlistSymbols().map((symbol) => ({
      symbol,
      tradable: profiles.some((p) => p.symbol === `${symbol}USDT`),
      watchlistOnly: !profiles.some((p) => p.symbol === `${symbol}USDT`),
    }));

    res.json({
      success: true,
      executionSymbols: getExecutionSymbols(),
      profiles,
      watchlist,
    });
  } catch (error: any) {
    logger.error('symbol_profiles_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'symbol_profiles_failed' });
  }
});

router.get('/worker-status', async (req, res) => {
  let effectivePositionFeedback = lastPositionFeedback;

  // Keep this route lightweight. It should always return the last known worker
  // and AI heartbeat state even if exchange refreshes are slow or degraded.
  // Use locally tracked positions only; do not block on live exchange calls here.
  if (!effectivePositionFeedback.length) {
    try {
      const svc = await ensureTradingService();
      if (svc) {
        const openPositions = svc.getModelAccount('1')?.positions || [];
        if (openPositions.length > 0) {
          effectivePositionFeedback = openPositions.slice(0, 5).map((p) => buildPositionFeedback(p));
          lastPositionFeedback = effectivePositionFeedback;
        }
      }
    } catch {
      // keep empty cache on transient failures
    }
  }

  res.json({
    success: true,
    running: executionWorkerStarted,
    intervalSec: 60,
    lastRunAt: lastWorkerRunAt,
    lastAction: lastWorkerAction,
    lastReason: lastWorkerReason,
    lastReasonHuman: lastWorkerReasonHuman,
    lastAutoSignalAt: lastAutoSignalAt ? new Date(lastAutoSignalAt).toISOString() : null,
    lastAutoSignalKey: lastAutoSignalKey || null,
    armedTrigger: armedTrigger
      ? {
          key: armedTrigger.key,
          cyclesWithoutFill: armedTrigger.cyclesWithoutFill,
          armedAt: new Date(armedTrigger.armedAt).toISOString(),
          maxCycles: STALE_TRIGGER_MAX_CYCLES,
        }
      : null,
    executionSource: lastExecutionSource,
    aiLastHeartbeatAt: lastAiDecisionAt,
    aiFreshnessMaxMs: AI_FRESHNESS_MAX_MS,
    fallbackMode: lastFallbackMode,
    symbolRejects: lastCycleSymbolRejects,
    positionFeedback: effectivePositionFeedback,
    policy: {
      maxOpenPositions: Math.max(1, Number((settingsStore.get().riskSettings as any).maxOpenPositions || 1)),
      cooldownMinutes: Number(settingsStore.get().riskSettings.cooldownMinutes || 30),
    },
    aiGateDecision: lastAiGateDecision,
    finalExecutionDecision: lastFinalExecutionDecision,
    sideSource: lastSideSource,
    chosenSide: lastChosenSide,
    aiConversations: lastAiConversations,
  });
});

router.get('/settings', (req, res) => {
  const s = settingsStore.get();
  const masked = (v: string) => (v ? '********' : '');
  res.json({
    ...s,
    masterApiKey: masked(s.masterApiKey),
    masterSecretKey: '',
    deepseekApiKey: '',
    openaiApiKey: '',
    geminiApiKey: '',
    notificationSettings: {
      ...s.notificationSettings,
      telegramBotToken: '',
    },
    hasMasterApiKey: Boolean(s.masterApiKey),
    hasMasterSecretKey: Boolean(s.masterSecretKey),
    hasDeepseekApiKey: Boolean(s.deepseekApiKey),
    hasOpenaiApiKey: Boolean((s as any).openaiApiKey),
    hasGeminiApiKey: Boolean((s as any).geminiApiKey),
    hasTelegramBotToken: Boolean(s.notificationSettings.telegramBotToken),
    providerMode: 'multi_provider',
    modelAccounts: [{ modelId: 1, modelName: 'AI Portfolio Engine', tradingEnabled: s.modelAccounts[0]?.tradingEnabled ?? false, balance: s.modelAccounts[0]?.balance ?? 10000 }],
  });
});

router.post('/settings', authenticateAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const current = settingsStore.get();

    const requestedProvider = String(payload.aiProvider || current.aiProvider || 'deepseek').toLowerCase();
    const aiProvider = (requestedProvider === 'openai' || requestedProvider === 'gemini' || requestedProvider === 'deepseek')
      ? requestedProvider as 'deepseek' | 'openai' | 'gemini'
      : 'deepseek';

    const next = {
      ...current,
      masterApiKey: keepOrUpdateSecret(current.masterApiKey, payload.masterApiKey),
      masterSecretKey: keepOrUpdateSecret(current.masterSecretKey, payload.masterSecretKey),
      aiProvider,
      deepseekApiKey: keepOrUpdateSecret(current.deepseekApiKey, payload.deepseekApiKey),
      openaiApiKey: keepOrUpdateSecret((current as any).openaiApiKey || '', payload.openaiApiKey),
      geminiApiKey: keepOrUpdateSecret((current as any).geminiApiKey || '', payload.geminiApiKey),
      testnet: payload.testnet ?? current.testnet,
      tradingEnabled: payload.tradingEnabled ?? current.tradingEnabled,
      tradeConfirmation: payload.tradeConfirmation ?? current.tradeConfirmation ?? false,
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
      selfLearningSettings: {
        ...(current as any).selfLearningSettings,
        ...(payload.selfLearningSettings || {}),
      },
    };

    const auditChanges = buildSettingsAuditChanges(current, next);
    settingsStore.set(next);
    tradingService = null; // force re-init with new settings
    await ensureTradingService();

    logger.info('settings_saved', {
      testnet: next.testnet,
      tradingEnabled: next.tradingEnabled,
      aiProvider: next.aiProvider,
      portfolioEnabled: next.modelAccounts?.[0]?.tradingEnabled ?? false,
    });

    if (Object.keys(auditChanges).length > 0) {
      settingsAudit.append({
        ts: new Date().toISOString(),
        actor: 'dashboard_admin',
        type: 'settings_saved',
        summary: `Updated ${Object.keys(auditChanges).length} settings field(s)`,
        changes: auditChanges,
      });
    }

    scheduleNextSelfLearningRun(false);

    res.json({ success: true, settings: next, providerMode: 'multi_provider' });
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

router.post('/manual-trade', authenticateAdmin, async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.status(400).json({ error: 'Trading service not initialized. Configure API keys first.' });

    const body = req.body || {};
    const symbol = String(body.symbol || '').trim().toUpperCase();
    const side = String(body.side || '').trim().toUpperCase();
    const type = String(body.type || 'MARKET').trim().toUpperCase();
    const confidenceRaw = Number(body.confidence);
    const confidence = confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw;
    const reason = String(body.reason || body.notes || 'Manual trade entry').trim();

    if (!symbol || !['BUY', 'SELL'].includes(side) || !['MARKET', 'LIMIT'].includes(type)) {
      return res.status(400).json({ success: false, error: 'invalid_manual_trade_fields' });
    }

    if (!Number.isFinite(confidence) || confidence <= 0 || confidence > 1) {
      return res.status(400).json({ success: false, error: 'confidence_must_be_between_0_and_1_or_0_and_100' });
    }

    const signal: TradeSignal = {
      modelId: '1',
      symbol,
      side: side as 'BUY' | 'SELL',
      type: type as 'MARKET' | 'LIMIT',
      quantity: Number.isFinite(Number(body.quantity)) && Number(body.quantity) > 0 ? Number(body.quantity) : undefined,
      price: Number.isFinite(Number(body.price)) && Number(body.price) > 0 ? Number(body.price) : undefined,
      stopLoss: Number.isFinite(Number(body.stopLoss)) && Number(body.stopLoss) > 0 ? Number(body.stopLoss) : undefined,
      takeProfit: Number.isFinite(Number(body.takeProfit)) && Number(body.takeProfit) > 0 ? Number(body.takeProfit) : undefined,
      leverage: Number.isFinite(Number(body.leverage)) && Number(body.leverage) > 0 ? Number(body.leverage) : undefined,
      confidence,
      reason: `[manual] ${reason}`,
      timestamp: new Date(),
    };

    const success = await svc.processTradeSignal(signal);
    const rejectReason = success ? null : svc.getLastSignalRejectReason();

    journalService.append({
      ts: new Date().toISOString(),
      type: 'manual_signal',
      source: 'manual',
      enteredBy: 'dashboard',
      symbol,
      side,
      confidence,
      reason,
      accepted: success,
      rejectReason,
    });

    logger.info('manual_trade_processed', {
      success,
      symbol,
      side,
      source: 'manual',
      rejectReason,
    });

    if (!success) {
      return res.status(400).json({
        success: false,
        error: rejectReason || 'manual_trade_rejected',
        rejectReason,
      });
    }

    return res.json({
      success: true,
      source: 'manual',
      signal,
    });
  } catch (error: any) {
    logger.error('manual_trade_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'manual_trade_failed' });
  }
});

router.get('/open-orders', async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.json({ success: true, orders: [] });

    const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : undefined;
    const orders = await svc.getOpenOrders(symbol);

    const normalized = orders
      .filter((o: any) => String(o?.status || '').toUpperCase() === 'NEW')
      .map((o: any) => ({
        orderId: Number(o.orderId),
        symbol: String(o.symbol || ''),
        side: String(o.side || '').toUpperCase(),
        type: String(o.type || '').toUpperCase(),
        price: Number(o.price || 0),
        origQty: Number(o.origQty || 0),
        executedQty: Number(o.executedQty || 0),
        status: String(o.status || '').toUpperCase(),
        time: Number(o.time || Date.now()),
      }))
      .sort((a: any, b: any) => b.time - a.time);

    res.json({ success: true, orders: normalized });
  } catch (error: any) {
    logger.error('open_orders_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'open_orders_failed' });
  }
});

router.post('/cancel-order', authenticateAdmin, async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.status(400).json({ success: false, error: 'Trading service not initialized' });

    const symbol = String(req.body?.symbol || '').trim().toUpperCase();
    const orderId = Number(req.body?.orderId);
    if (!symbol || !Number.isFinite(orderId) || orderId <= 0) {
      return res.status(400).json({ success: false, error: 'symbol_and_valid_orderId_required' });
    }

    const result = await svc.cancelOpenOrder(symbol, orderId);
    journalService.append({
      ts: new Date().toISOString(),
      type: 'manual_order_cancel',
      source: 'manual',
      enteredBy: 'dashboard',
      symbol,
      orderId,
      status: String(result?.status || 'CANCELED').toUpperCase(),
    });

    res.json({ success: true, result });
  } catch (error: any) {
    logger.error('cancel_order_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'cancel_order_failed' });
  }
});

router.post('/cancel-open-orders', authenticateAdmin, async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.status(400).json({ success: false, error: 'Trading service not initialized' });

    const symbolFilter = req.body?.symbol ? String(req.body.symbol).trim().toUpperCase() : undefined;
    const orders = await svc.getOpenOrders(symbolFilter);
    const pending = orders.filter((o: any) => String(o?.status || '').toUpperCase() === 'NEW');

    const canceled: Array<{ symbol: string; orderId: number }> = [];
    const failed: Array<{ symbol: string; orderId: number; error: string }> = [];

    for (const order of pending) {
      const symbol = String(order?.symbol || '').toUpperCase();
      const orderId = Number(order?.orderId);
      if (!symbol || !Number.isFinite(orderId) || orderId <= 0) continue;

      try {
        await svc.cancelOpenOrder(symbol, orderId);
        canceled.push({ symbol, orderId });
        journalService.append({
          ts: new Date().toISOString(),
          type: 'manual_order_cancel',
          source: 'manual',
          enteredBy: 'dashboard',
          symbol,
          orderId,
          status: 'CANCELED',
        });
      } catch (error: any) {
        failed.push({ symbol, orderId, error: String(error?.message || 'cancel_failed') });
      }
    }

    res.json({
      success: failed.length === 0,
      requested: pending.length,
      canceledCount: canceled.length,
      failedCount: failed.length,
      canceled,
      failed,
    });
  } catch (error: any) {
    logger.error('cancel_open_orders_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'cancel_open_orders_failed' });
  }
});

router.post('/update-stop-loss', authenticateAdmin, async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.status(400).json({ success: false, error: 'Trading service not initialized' });

    const symbol = String(req.body?.symbol || '').trim().toUpperCase();
    const stopLoss = Number(req.body?.stopLoss);
    if (!symbol || !Number.isFinite(stopLoss) || stopLoss <= 0) {
      return res.status(400).json({ success: false, error: 'symbol_and_valid_stopLoss_required' });
    }

    const result = await svc.updateStopLoss('1', symbol, stopLoss);
    journalService.append({
      ts: new Date().toISOString(),
      type: 'manual_stop_update',
      source: 'manual',
      enteredBy: 'dashboard',
      symbol,
      stopLoss,
    });

    return res.json({ success: true, result });
  } catch (error: any) {
    logger.error('update_stop_loss_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'update_stop_loss_failed' });
  }
});

router.post('/positions/secure-break-even', authenticateAdmin, async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.status(400).json({ success: false, error: 'Trading service not initialized' });

    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
    const symbol = String(symbols[0] || req.body?.symbol || '').trim().toUpperCase();
    const bufferPct = Number(req.body?.bufferPct);
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol_required' });
    }

    const result = await svc.secureBreakEven('1', symbol, Number.isFinite(bufferPct) ? bufferPct : 0.001);
    return res.json({ success: true, result });
  } catch (error: any) {
    logger.error('secure_break_even_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'secure_break_even_failed' });
  }
});

router.post('/positions/partial-close', authenticateAdmin, async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.status(400).json({ success: false, error: 'Trading service not initialized' });

    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
    const symbol = String(symbols[0] || req.body?.symbol || '').trim().toUpperCase();
    const percent = Number(req.body?.percent);
    if (!symbol || !Number.isFinite(percent) || percent <= 0 || percent >= 100) {
      return res.status(400).json({ success: false, error: 'symbol_and_valid_percent_required' });
    }

    const result = await svc.partialClosePosition('1', symbol, percent);
    return res.json({ success: true, result });
  } catch (error: any) {
    logger.error('partial_close_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'partial_close_failed' });
  }
});

router.post('/close-position', authenticateAdmin, async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.status(400).json({ success: false, error: 'Trading service not initialized' });

    const symbol = String(req.body?.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol_required' });
    }

    await svc.closePosition('1', symbol, 'manual_close');
    logger.warn('position_closed_single', { modelId: 1, symbol });
    res.json({ success: true, symbol, message: `${symbol} position closed` });
  } catch (error: any) {
    logger.error('close_position_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'close_position_failed' });
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
      providerMode: 'multi_provider',
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

router.get('/trade-intelligence', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || getExecutionSymbols().join(',')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const svc = await ensureTradingService();
    let positions: any[] = [];
    if (svc) {
      try {
        await svc.updatePositions();
        positions = svc.getModelAccount('1')?.positions || [];
      } catch {
        positions = svc.getModelAccount('1')?.positions || [];
      }
    }
    const [snapshot, entries] = await Promise.all([
      riskIntel.getSnapshot(symbols),
      getLearningJournalEntries(5000, 500),
    ]);
    const intelligence = tradeIntelligence.build(snapshot, positions, entries);
    res.json({ success: true, ...intelligence });
  } catch (error: any) {
    logger.error('trade_intelligence_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'trade_intelligence_failed' });
  }
});

router.get('/operator-intelligence', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || getExecutionSymbols().join(',')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const svc = await ensureTradingService();
    let positions: any[] = [];
    if (svc) {
      try {
        await svc.updatePositions();
        positions = svc.getModelAccount('1')?.positions || [];
      } catch {
        positions = svc.getModelAccount('1')?.positions || [];
      }
    }

    const [snapshot, entries] = await Promise.all([
      riskIntel.getSnapshot(symbols),
      getLearningJournalEntries(5000, 500),
    ]);
    const tradePayload = tradeIntelligence.build(snapshot, positions, entries);
    const payload = await operatorIntelligence.build({
      symbols,
      snapshot,
      tradeIntelligence: tradePayload,
      journalEntries: entries,
      worker: {
        aiGateDecision: lastAiGateDecision,
        finalExecutionDecision: lastFinalExecutionDecision,
        lastReason: lastWorkerReason,
        lastReasonHuman: humanizeWorkerReason(lastWorkerReason),
      },
    });
    res.json({ success: true, ...payload });
  } catch (error: any) {
    logger.error('operator_intelligence_failed', { error: error?.message || 'unknown' });
    res.status(500).json({ success: false, error: error?.message || 'operator_intelligence_failed' });
  }
});

router.get('/journal', async (req, res) => {
  try {
    const svc = await ensureTradingService();
    if (!svc) return res.json({ entries: [], review: {} });

    const limit = Number(req.query.limit || 200);
    const lastN = Number(req.query.reviewWindow || 100);
    const tradeCloseLimit = Number(req.query.tradeCloseLimit || 0);
    const tradeCloseScanLimit = Number(req.query.tradeCloseScanLimit || 5000);
    const readLimit = Math.max(limit, tradeCloseLimit, tradeCloseScanLimit);

    const liveEntries = svc.getJournalEntries(readLimit) || [];
    const fileEntries = journalService.list(readLimit) || [];
    const allMerged = [...liveEntries, ...fileEntries]
      .sort((a: any, b: any) => new Date(String(b?.ts || 0)).getTime() - new Date(String(a?.ts || 0)).getTime());

    const baseWindow = allMerged.slice(0, limit);

    const entries = tradeCloseLimit > 0
      ? (() => {
          const tradeCloses = allMerged.filter((e: any) => e?.type === 'trade_close').slice(0, tradeCloseLimit);
          const dedup = new Map<string, any>();
          [...baseWindow, ...tradeCloses].forEach((e: any) => {
            const key = `${e?.ts || ''}|${e?.type || ''}|${e?.modelId || ''}|${e?.symbol || ''}|${e?.reason || ''}`;
            if (!dedup.has(key)) dedup.set(key, e);
          });
          return Array.from(dedup.values())
            .sort((a: any, b: any) => new Date(String(b?.ts || 0)).getTime() - new Date(String(a?.ts || 0)).getTime());
        })()
      : baseWindow;

    const review = svc.getJournalReview(lastN);
    const paperTrading = Boolean((settingsStore.get().riskSettings as any)?.paperTrading);

    res.json({
      entries,
      review,
      executionMode: paperTrading ? 'paper' : 'live',
      policy: {
        minLeverage: Number((settingsStore.get().riskSettings as any)?.minLeverage || 10),
        maxLeverage: Number(settingsStore.get().riskSettings.maxLeverage || 20),
        maxOpenPositions: Number((settingsStore.get().riskSettings as any)?.maxOpenPositions || 4),
        maxTradesPerDay: Number(settingsStore.get().riskSettings.maxTradesPerDay || 8),
        maxConsecutiveLosses: Number(settingsStore.get().riskSettings.maxConsecutiveLosses || 3),
        minConfidence: Number(settingsStore.get().riskSettings.minConfidence || 0.6),
      },
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

router.get('/helix/self-learning/status', async (_req, res) => {
  try {
    const cfg = getSelfLearningSettings();
    const entries = await getLearningJournalEntries(10_000);
    const closedTrades = entries.filter((e: any) => e?.type === 'trade_close').length;
    const latestAuditReview = promotionAudit.list(50).find((entry: any) => entry?.type === 'self_learning_review');
    const fallbackLastResult = latestAuditReview
      ? {
          success: true,
          completedAt: latestAuditReview.ts,
          mode: latestAuditReview.mode || 'scheduled',
          evidence: {
            closedTrades,
            requiredClosedTrades: cfg.minClosedTrades,
            readinessPct: cfg.minClosedTrades > 0 ? Math.min(100, Math.round((closedTrades / cfg.minClosedTrades) * 100)) : 0,
          },
          record: {
            result: {
              decision: latestAuditReview.decision || 'n/a',
              reasons: latestAuditReview.reasons || [],
            },
          },
          riskAdjustment: latestAuditReview.riskAdjustment || null,
          nextAction: latestAuditReview.nextAction || null,
        }
      : null;
    res.json({
      success: true,
      running: selfLearningRunning,
      schedulerStarted: selfLearningSchedulerStarted,
      settings: cfg,
      evidence: {
        closedTrades,
        requiredClosedTrades: cfg.minClosedTrades,
        readinessPct: cfg.minClosedTrades > 0 ? Math.min(100, Math.round((closedTrades / cfg.minClosedTrades) * 100)) : 0,
      },
      lastRunAt: lastSelfLearningRunAt || fallbackLastResult?.completedAt || null,
      nextRunAt: nextSelfLearningRunAt,
      lastError: lastSelfLearningError,
      lastResult: lastSelfLearningResult || fallbackLastResult,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'self_learning_status_failed' });
  }
});

router.post('/helix/self-learning/run', authenticateAdmin, async (_req, res) => {
  try {
    const result = await runSelfLearningReview('manual');
    scheduleNextSelfLearningRun(false);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'self_learning_run_failed' });
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

router.get('/settings-audit', authenticateAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    res.json({ success: true, entries: settingsAudit.list(limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'settings_audit_list_failed' });
  }
});

startSelfLearningScheduler();

void ensureTradingService().catch((error: any) => {
  logger.error('trading_service_bootstrap_failed', {
    error: error?.message || 'unknown',
  });
});

export default router;
