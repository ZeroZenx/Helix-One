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
const EXECUTION_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
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
  if (r === 'trading_or_portfolio_disabled') return 'Trading is currently disabled in settings.';
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
    maxUnprotectedPositionSeconds: 15,
    stopPlacementRetries: 4,
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

      const exchangeAccount = await svc.getExchangeAccountInfo();
      const balance = Number(exchangeAccount?.totalWalletBalance || 0);
      const availableMargin = Number(exchangeAccount?.availableBalance || 0);
      const portfolio = svc.getModelAccount('1');

      const snapshot = await riskIntel.getSnapshot(EXECUTION_SYMBOLS);
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
        notes: snapshot.riskFlags,
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
      const selectedCandidates: Array<{ plan: any; confidence: number; sideSource: 'AI' | 'RULES'; side: 'BUY' | 'SELL' }> = [];

      for (const symbol of EXECUTION_SYMBOLS) {
        const symbolFunding = snapshot.funding.find((x) => x.symbol === symbol) || snapshot.funding[0];
        const currentPrice = Number(symbolFunding?.markPrice || 0);
        if (currentPrice <= 0) {
          symbolRejects.push({ symbol, reason: 'missing_price' });
          continue;
        }

        const stopDistance = currentPrice * 0.005;
        const micro = (snapshot as any).microstructure?.find((m: any) => m.symbol === symbol) || {};
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
        const trendStrength = Math.max(35, Math.min(95, Number(aiDecision.confidence || snapshot.regimeConfidence || 50)));
        const volatilityPct = snapshot.volatilityState === 'high' ? 2.6 : snapshot.volatilityState === 'low' ? 1.0 : 1.8;
        const spreadBps = snapshot.liquidityState === 'poor' ? 15 : snapshot.liquidityState === 'acceptable' ? 8 : 4;
        const volumeScore = snapshot.liquidityState === 'good' ? 75 : snapshot.liquidityState === 'acceptable' ? 55 : 30;

        const candidate = {
          symbol,
          side,
          entry: aiDecision.entry ?? currentPrice,
          stopLoss: aiDecision.stop_loss ?? (side === 'BUY' ? currentPrice - stopDistance : currentPrice + stopDistance),
          takeProfit: aiDecision.take_profit ?? (side === 'BUY' ? currentPrice + stopDistance * 2 : currentPrice - stopDistance * 2),
          confidence: trendStrength,
          thesis: `ai=${aiDecision.decision} regime=${snapshot.marketRegime} confidence=${aiDecision.confidence} side=${side} side_source=${aiDecision.side ? 'ai' : 'rules'}`,
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

        const reasons = [...(aiDecision.reasons || []), ...(plan.reasons || [])];
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
          decision: aiDecision.decision === 'TRADE' && plan.decision === 'TRADE' ? 'TRADE' : 'NO_TRADE',
          confidence: Number(aiDecision.confidence || snapshot.regimeConfidence || 0),
          reasons,
          gateResult: plan.decision === 'TRADE' ? 'passed' : 'blocked',
          regime: snapshot.marketRegime,
          liquidityState: snapshot.liquidityState,
          volatilityState: snapshot.volatilityState,
          expectedRMultiple: Number(plan.expectedRMultiple || aiDecision.expected_rr || 0),
          expectedNetEdgeBps: Number(plan.expectedNetEdgeBps || 0),
        });

        const softProbeEligible = (
          aiDecision.decision !== 'TRADE' &&
          snapshot.marketRegime === 'range' &&
          Number(snapshot.regimeConfidence || 0) >= 60 &&
          snapshot.liquidityState === 'good' &&
          snapshot.volatilityState !== 'high'
        );

        if (aiDecision.decision !== 'TRADE' && !softProbeEligible) {
          symbolRejects.push({ symbol, reason: `ai_no_trade:${(aiDecision.reasons || [])[0] || 'model_blocked'}` });
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
          });
        } else {
          selectedCandidates.push({
            plan,
            confidence: Number(aiDecision.confidence || snapshot.regimeConfidence || 0),
            sideSource,
            side,
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

        const signal: TradeSignal = {
          modelId: '1',
          symbol: plan.symbol,
          side: plan.side,
          type: 'MARKET',
          quantity: probeQty,
          confidence: Math.max(0, Math.min(1, Number(candidate.confidence || 0) / 100)),
          reason: `auto_worker_unified regime=${snapshot.marketRegime} rr=${Number(plan.expectedRMultiple || 0).toFixed(2)} edge=${Number(plan.expectedNetEdgeBps || 0).toFixed(1)}bps${probeMode ? ' soft_probe=1' : ''}`,
          stopLoss: plan.stopLoss,
          takeProfit: plan.takeProfit,
          leverage: probeMode ? 1 : Math.min(s.riskSettings.maxLeverage || 2, 2),
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

router.get('/worker-status', async (req, res) => {
  let effectivePositionFeedback = lastPositionFeedback;

  // Fallback hydration: if monitor cache is empty but there are live positions,
  // rebuild feedback at response-time so UI is never blank for open positions.
  if (!effectivePositionFeedback.length) {
    try {
      const svc = await ensureTradingService();
      if (svc) {
        await svc.updatePositions();
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
    };

    settingsStore.set(next);
    tradingService = null; // force re-init with new settings
    await ensureTradingService();

    logger.info('settings_saved', {
      testnet: next.testnet,
      tradingEnabled: next.tradingEnabled,
      aiProvider: next.aiProvider,
      portfolioEnabled: next.modelAccounts?.[0]?.tradingEnabled ?? false,
    });

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

    res.json({
      entries,
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
