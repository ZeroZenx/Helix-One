import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Responsive, WidthProvider, type ResponsiveLayouts } from 'react-grid-layout/legacy';
import { fetchWithTimeout, getTradingApiBaseUrl } from '../src/utils/api';

type TradingStatus = {
  connected: boolean;
  enabled: boolean;
  accounts: number;
  engineConnected?: boolean;
  globalTradingEnabled?: boolean;
  portfolioTradingEnabled?: boolean;
  activePortfolios?: Array<{
    modelId: number;
    modelName: string;
    currentBalance: number;
    positionsCount: number;
    positions?: Array<{
      symbol: string;
      side: 'LONG' | 'SHORT';
      size: number;
      entryPrice: number;
      currentPrice: number;
      pnl: number;
      leverage: number;
      stopLoss?: number;
      takeProfit?: number;
      runnerMode?: boolean;
      partialTakenPct?: number;
      bestPrice?: number;
      openedAt: string;
    }>;
    tradingEnabled: boolean;
    killSwitchTriggered?: boolean;
    cooldownUntil?: string | null;
    tradesToday?: number;
    dailyPnl?: number;
  }>;
};

type SettingsPayload = {
  modelAccounts?: Array<{
    modelId: number;
    modelName: string;
    tradingEnabled: boolean;
    balance: number;
  }>;
  riskSettings?: {
    maxDailyLossPct?: number;
    maxPositionSizePct?: number;
    maxLeverage?: number;
    minLeverage?: number;
    maxOpenPositions?: number;
    killSwitchDrawdownPct?: number;
    cooldownMinutes?: number;
    maxTradesPerDay?: number;
    maxConsecutiveLosses?: number;
    minConfidence?: number;
    paperTrading?: boolean;
    breakEvenBufferPct?: number;
    breakEvenFeeBps?: number;
    breakEvenSlippageBps?: number;
    letWinnersRunEnabled?: boolean;
    runnerActivationR?: number;
    runnerPartialTakeProfitPct?: number;
    runnerTrailPct?: number;
  };
};

type BriefingPayload = {
  generatedAt?: string;
  deepseekDecision?: DeepSeekDecision;
  account?: {
    balance?: number;
    availableMargin?: number;
    previousDayPnl?: number;
    consecutiveLosses?: number;
  };
  market?: {
    regime?: string;
    regimeConfidence?: number;
    liquidityState?: string;
    volatilityState?: string;
    funding?: Array<{ symbol: string; fundingRate: number; markPrice: number }>;
    openInterest?: Array<{ symbol: string; openInterestUsd: number }>;
  };
  news?: Array<{ source: string; title: string }>;
  recommendedRiskLevel?: string;
  notes?: string[];
};

type RiskContext = {
  riskFlags?: string[];
  marketRegime?: string;
  regimeConfidence?: number;
  liquidityState?: 'good' | 'acceptable' | 'poor';
  volatilityState?: 'low' | 'normal' | 'high';
};

type JournalEntry = {
  ts: string;
  type: string;
  symbol?: string;
  side?: 'BUY' | 'SELL' | 'LONG' | 'SHORT' | null;
  entry?: number;
  qty?: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl?: number;
  decision?: string;
  confidence?: number;
  reasons?: string[];
  riskFlags?: string[];
  gateResult?: string;
  provider?: string;
};

type JournalReview = {
  tradeCount?: number;
  winRate?: number;
  avgPnl?: number;
  expectancy?: number;
  netPnl?: number;
  grossWin?: number;
  grossLoss?: number;
  bestTrade?: number;
  worstTrade?: number;
  maxDrawdownApprox?: number;
  profitFactor?: number;
  maxWinStreak?: number;
  maxLossStreak?: number;
};

type JournalPayload = {
  entries?: JournalEntry[];
  review?: JournalReview;
  executionMode?: 'paper' | 'live';
  policy?: {
    minLeverage?: number;
    maxLeverage?: number;
    maxOpenPositions?: number;
    maxTradesPerDay?: number;
    maxConsecutiveLosses?: number;
    minConfidence?: number;
  };
};

type TradeCandidate = {
  symbol: string;
  bias: 'LONG' | 'SHORT' | 'WATCH';
  setupType: string;
  qualityScore: number;
  confidence: number;
  state: 'READY' | 'WATCH' | 'BLOCKED';
  blocker?: string | null;
  thesis?: string;
  confirm?: string;
  invalidate?: string;
  expectedRR?: number | null;
  entryZone?: { low: number | null; high: number | null };
  stopLoss?: number | null;
  targets?: number[];
  scores?: {
    structure?: number;
    liquidity?: number;
    momentum?: number;
    volatility?: number;
    riskReward?: number;
    journalMemory?: number;
  };
};

type TradeIntelligencePayload = {
  success?: boolean;
  generatedAt?: string;
  topCandidate?: TradeCandidate | null;
  candidates?: TradeCandidate[];
  positionManagement?: Array<{
    symbol: string;
    side: string;
    state: string;
    holdScore: number;
    reduceScore: number;
    exitScore: number;
    recommendation: string;
    reason: string;
    currentR?: number | null;
    distanceToStopPct?: number | null;
    distanceToTargetPct?: number | null;
  }>;
  portfolioBrief?: {
    stance: string;
    mainRisk: string;
    bestOpportunity: string;
    action: string;
  };
  journalMemory?: {
    sampleSize: number;
    bySymbol: Record<string, { closes: number; winRate: number; avgPnl: number; netPnl: number }>;
  };
};

type OperatorIntelligencePayload = {
  success?: boolean;
  generatedAt?: string;
  multiTimeframe?: {
    alignmentScore: number;
    marketBias: 'LONG' | 'SHORT' | 'MIXED' | 'NEUTRAL';
    symbols: Array<{
      symbol: string;
      alignment: string;
      score: number;
      note: string;
      timeframes: Array<{
        interval: string;
        bias: 'LONG' | 'SHORT' | 'NEUTRAL';
        strength: number;
        momentumPct: number;
        emaTrendPct: number;
        rsi14: number;
      }>;
    }>;
  };
  eventRisk?: {
    level: 'low' | 'medium' | 'high';
    score: number;
    drivers: string[];
    action: string;
    headlines: Array<{ source: string; title: string; severity: 'low' | 'medium' | 'high' }>;
  };
  executionQuality?: {
    grade: 'A' | 'B' | 'C' | 'D' | 'N/A';
    sampleSize: number;
    avgSlippageBps: number;
    worstSlippageBps: number;
    fillRatePct: number;
    rejectedSignals: number;
    notes: string[];
  };
  aiRulesAlignment?: {
    score: number;
    state: 'aligned' | 'watch' | 'diverging';
    note: string;
    disagreements: Array<{ ts: string; symbol: string; aiDecision: string; rulesDecision: string; reason: string }>;
  };
  operatorBrief?: {
    headline: string;
    priority: string;
    improvement: string;
    action: string;
  };
};

type Coin = {
  symbol: string;
  price: number;
  change: number;
};

type DecisionState = 'SCANNING' | 'WAITING_FOR_TRIGGER' | 'TRIGGER_ARMED' | 'EXECUTION_WINDOW_OPEN' | 'LOCKED_RISK';

type DeepSeekDecision = {
  decision?: 'TRADE' | 'NO_TRADE' | 'COOLDOWN';
  state?: DecisionState;
  now_action?: string;
  trigger_conditions?: string[];
  invalidators?: string[];
  entry_plan?: {
    zone?: string;
    stop?: string;
    tp1?: string;
    tp2?: string;
    rr?: string;
  };
  confidence?: number;
  reasoning_summary?: string;
  changes_since_last?: string[];
  market_narrative?: string;
  bias?: 'LONG' | 'SHORT' | 'NEUTRAL';
  cancel_if?: string[];
  scenarios?: Array<{
    name?: string;
    trigger?: string;
    invalidation?: string;
    expected_rr?: string;
    action?: 'WAIT' | 'PREPARE' | 'EXECUTE';
  }>;
  risk_coach?: {
    blocker?: string;
    fix_next?: string[];
  };
};

const API = getTradingApiBaseUrl();

const TRACKED_SYMBOLS = [
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'solana', symbol: 'SOL' },
  { id: 'ripple', symbol: 'XRP' },
  { id: 'dogecoin', symbol: 'DOGE' },
  { id: 'binancecoin', symbol: 'BNB' },
];

const EXEC_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT'];

const ResponsiveGridLayout = WidthProvider(Responsive);

const DASHBOARD_LAYOUT_STORAGE_KEY = 'helix.dashboard.layouts.v2';

const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const GRID_COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const GRID_ROW_HEIGHT = 36;
const GRID_MARGIN: [number, number] = [12, 12];
const RESIZE_HANDLES: Array<'s' | 'w' | 'e' | 'n' | 'sw' | 'nw' | 'se' | 'ne'> = ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'];

const DEFAULT_WIDGET_LAYOUTS: ResponsiveLayouts = {
  lg: [
    { i: 'market-overview', x: 0, y: 0, w: 3, h: 13, minW: 2, minH: 8, maxW: 6, maxH: 24 },
    { i: 'decision-summary', x: 3, y: 0, w: 6, h: 13, minW: 4, minH: 9, maxW: 9, maxH: 26 },
    { i: 'ops-snapshot', x: 9, y: 0, w: 3, h: 13, minW: 2, minH: 8, maxW: 5, maxH: 22 },
    { i: 'manual-trade', x: 0, y: 13, w: 5, h: 18, minW: 3, minH: 12, maxW: 8, maxH: 34 },
    { i: 'open-positions', x: 5, y: 13, w: 7, h: 18, minW: 4, minH: 10, maxW: 12, maxH: 34 },
    { i: 'deepseek-live', x: 0, y: 31, w: 7, h: 18, minW: 4, minH: 12, maxW: 12, maxH: 36 },
    { i: 'live-feed', x: 7, y: 31, w: 5, h: 18, minW: 3, minH: 10, maxW: 7, maxH: 32 },
    { i: 'recent-trades', x: 0, y: 49, w: 12, h: 16, minW: 4, minH: 10, maxW: 12, maxH: 32 },
  ],
  md: [
    { i: 'market-overview', x: 0, y: 0, w: 4, h: 13, minW: 2, minH: 8, maxW: 6, maxH: 24 },
    { i: 'decision-summary', x: 4, y: 0, w: 6, h: 13, minW: 4, minH: 9, maxW: 10, maxH: 26 },
    { i: 'ops-snapshot', x: 0, y: 13, w: 4, h: 12, minW: 2, minH: 8, maxW: 6, maxH: 22 },
    { i: 'manual-trade', x: 4, y: 13, w: 6, h: 18, minW: 3, minH: 12, maxW: 10, maxH: 34 },
    { i: 'open-positions', x: 0, y: 31, w: 10, h: 17, minW: 4, minH: 10, maxW: 10, maxH: 34 },
    { i: 'deepseek-live', x: 0, y: 48, w: 6, h: 18, minW: 4, minH: 12, maxW: 10, maxH: 36 },
    { i: 'live-feed', x: 6, y: 48, w: 4, h: 18, minW: 3, minH: 10, maxW: 7, maxH: 32 },
    { i: 'recent-trades', x: 0, y: 66, w: 10, h: 15, minW: 4, minH: 10, maxW: 10, maxH: 32 },
  ],
  sm: [
    { i: 'market-overview', x: 0, y: 0, w: 3, h: 13, minW: 2, minH: 8, maxW: 6, maxH: 24 },
    { i: 'decision-summary', x: 3, y: 0, w: 3, h: 15, minW: 3, minH: 9, maxW: 6, maxH: 28 },
    { i: 'ops-snapshot', x: 0, y: 15, w: 3, h: 12, minW: 2, minH: 8, maxW: 6, maxH: 22 },
    { i: 'manual-trade', x: 3, y: 15, w: 3, h: 20, minW: 3, minH: 12, maxW: 6, maxH: 36 },
    { i: 'open-positions', x: 0, y: 35, w: 6, h: 17, minW: 3, minH: 10, maxW: 6, maxH: 34 },
    { i: 'deepseek-live', x: 0, y: 52, w: 6, h: 18, minW: 3, minH: 12, maxW: 6, maxH: 36 },
    { i: 'live-feed', x: 0, y: 70, w: 3, h: 15, minW: 3, minH: 10, maxW: 6, maxH: 32 },
    { i: 'recent-trades', x: 3, y: 70, w: 3, h: 15, minW: 3, minH: 10, maxW: 6, maxH: 32 },
  ],
  xs: [
    { i: 'market-overview', x: 0, y: 0, w: 4, h: 12, minW: 2, minH: 8, maxW: 4, maxH: 24 },
    { i: 'decision-summary', x: 0, y: 12, w: 4, h: 15, minW: 3, minH: 9, maxW: 4, maxH: 28 },
    { i: 'ops-snapshot', x: 0, y: 27, w: 4, h: 12, minW: 2, minH: 8, maxW: 4, maxH: 22 },
    { i: 'manual-trade', x: 0, y: 39, w: 4, h: 22, minW: 3, minH: 12, maxW: 4, maxH: 38 },
    { i: 'open-positions', x: 0, y: 61, w: 4, h: 17, minW: 3, minH: 10, maxW: 4, maxH: 34 },
    { i: 'deepseek-live', x: 0, y: 78, w: 4, h: 18, minW: 3, minH: 12, maxW: 4, maxH: 36 },
    { i: 'live-feed', x: 0, y: 96, w: 4, h: 15, minW: 3, minH: 10, maxW: 4, maxH: 32 },
    { i: 'recent-trades', x: 0, y: 111, w: 4, h: 15, minW: 3, minH: 10, maxW: 4, maxH: 32 },
  ],
  xxs: [
    { i: 'market-overview', x: 0, y: 0, w: 2, h: 12, minW: 2, minH: 8, maxW: 2, maxH: 24 },
    { i: 'decision-summary', x: 0, y: 12, w: 2, h: 16, minW: 2, minH: 9, maxW: 2, maxH: 30 },
    { i: 'ops-snapshot', x: 0, y: 28, w: 2, h: 12, minW: 2, minH: 8, maxW: 2, maxH: 22 },
    { i: 'manual-trade', x: 0, y: 40, w: 2, h: 24, minW: 2, minH: 12, maxW: 2, maxH: 40 },
    { i: 'open-positions', x: 0, y: 64, w: 2, h: 18, minW: 2, minH: 10, maxW: 2, maxH: 36 },
    { i: 'deepseek-live', x: 0, y: 82, w: 2, h: 20, minW: 2, minH: 12, maxW: 2, maxH: 38 },
    { i: 'live-feed', x: 0, y: 102, w: 2, h: 16, minW: 2, minH: 10, maxW: 2, maxH: 34 },
    { i: 'recent-trades', x: 0, y: 118, w: 2, h: 16, minW: 2, minH: 10, maxW: 2, maxH: 34 },
  ],
};

function mergeStoredLayouts(stored: ResponsiveLayouts): ResponsiveLayouts {
  const merged: ResponsiveLayouts = {};
  for (const [breakpoint, defaults] of Object.entries(DEFAULT_WIDGET_LAYOUTS)) {
    const cols = GRID_COLS[breakpoint as keyof typeof GRID_COLS] || 12;
    const storedById = new Map((stored[breakpoint] || []).map((item) => [item.i, item]));
    merged[breakpoint] = defaults.map((defaultItem) => {
      const savedItem = storedById.get(defaultItem.i) || {};
      const minW = Number(defaultItem.minW || 1);
      const minH = Number(defaultItem.minH || 1);
      const maxW = Math.min(Number(defaultItem.maxW || cols), cols);
      const maxH = Number(defaultItem.maxH || 40);
      const rawW = Number((savedItem as any).w ?? defaultItem.w);
      const rawH = Number((savedItem as any).h ?? defaultItem.h);
      const w = Math.max(minW, Math.min(maxW, Number.isFinite(rawW) ? rawW : defaultItem.w));
      const h = Math.max(minH, Math.min(maxH, Number.isFinite(rawH) ? rawH : defaultItem.h));
      const rawX = Number((savedItem as any).x ?? defaultItem.x);
      const rawY = Number((savedItem as any).y ?? defaultItem.y);

      return {
        ...defaultItem,
        ...savedItem,
        x: Math.max(0, Math.min(cols - w, Number.isFinite(rawX) ? rawX : defaultItem.x)),
        y: Math.max(0, Number.isFinite(rawY) ? rawY : defaultItem.y),
        w,
        h,
        minW,
        minH,
        maxW,
        maxH,
      };
    });
  }
  return merged;
}

function loadStoredWidgetLayouts(): ResponsiveLayouts {
  if (typeof window === 'undefined') return DEFAULT_WIDGET_LAYOUTS;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_WIDGET_LAYOUTS;
    const parsed = JSON.parse(raw);
    return mergeStoredLayouts(parsed);
  } catch {
    return DEFAULT_WIDGET_LAYOUTS;
  }
}

export default function Home() {
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [status, setStatus] = useState<TradingStatus | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null);
  const [riskContext, setRiskContext] = useState<RiskContext | null>(null);
  const [tradeIntelligence, setTradeIntelligence] = useState<TradeIntelligencePayload | null>(null);
  const [operatorIntelligence, setOperatorIntelligence] = useState<OperatorIntelligencePayload | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalReview, setJournalReview] = useState<JournalReview | null>(null);
  const [journalMeta, setJournalMeta] = useState<JournalPayload | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [workerStatus, setWorkerStatus] = useState<any>(null);
  const [cycleChanges, setCycleChanges] = useState<string[]>([]);
  const [uiBuildId, setUiBuildId] = useState('unknown');
  const [feedFilter, setFeedFilter] = useState<'ALL' | 'DECISIONS' | 'RISK' | 'EXECUTION'>('ALL');
  const [replayIndex, setReplayIndex] = useState(0);
  const [widgetLayouts, setWidgetLayouts] = useState<ResponsiveLayouts>(DEFAULT_WIDGET_LAYOUTS);
  const [layoutInteraction, setLayoutInteraction] = useState<'idle' | 'dragging' | 'resizing'>('idle');

  const [manualAdminKey, setManualAdminKey] = useState('');
  const [manualSymbol, setManualSymbol] = useState<'BTCUSDT' | 'ETHUSDT' | 'XRPUSDT' | 'DOGEUSDT' | 'BNBUSDT'>('BTCUSDT');
  const [manualSide, setManualSide] = useState<'BUY' | 'SELL'>('BUY');
  const [manualType, setManualType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [manualQty, setManualQty] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualStopLoss, setManualStopLoss] = useState('');
  const [manualTakeProfit, setManualTakeProfit] = useState('');
  const [manualLeverage, setManualLeverage] = useState('1');
  const [manualConfidence, setManualConfidence] = useState('70');
  const [manualReason, setManualReason] = useState('Manual discretionary setup');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualFeedback, setManualFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [slDrafts, setSlDrafts] = useState<Record<string, string>>({});
  const [openOrders, setOpenOrders] = useState<Array<{ orderId: number; symbol: string; side: string; type: string; price: number; origQty: number; executedQty: number; status: string; time: number }>>([]);
  const [ordersFeedback, setOrdersFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [openOrderFilter, setOpenOrderFilter] = useState<'ALL' | 'BTCUSDT' | 'ETHUSDT' | 'XRPUSDT' | 'DOGEUSDT' | 'BNBUSDT'>('ALL');
  const previousCycleRef = useRef<{ regimeConfidence: number; volatility: string; fundingRatePct: number } | null>(null);

  const liveConnected = Boolean(status?.engineConnected || workerStatus);
  const account = briefing?.account || {};
  const market = briefing?.market || {};
  const risks = (riskContext?.riskFlags || briefing?.notes || []).slice(0, 3);
  const portfolio = status?.activePortfolios?.[0];
  const riskSettings = settings?.riskSettings || {};
  const paperTradingEnabled = Boolean((riskSettings as any).paperTrading);

  const walletBalance = Number(account.balance || 0);
  const availableMargin = Number(account.availableMargin || 0);
  const livePositions = portfolio?.positions || [];
  const openPositions = livePositions.length;

  const riskPosture = useMemo(() => {
    if (!liveConnected) return { label: 'DISCONNECTED', tone: 'bg-red-500/20 text-red-300 border-red-500/40' };
    if (risks.length > 1 || market.volatilityState === 'high') return { label: 'REDUCED', tone: 'bg-amber-500/20 text-amber-200 border-amber-500/40' };
    return { label: 'NORMAL', tone: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40' };
  }, [liveConnected, risks.length, market.volatilityState]);

  const showDisconnectedShell = !liveConnected && walletBalance <= 0 && availableMargin <= 0;

  const decision = useMemo(() => {
    const failedChecks = [
      !liveConnected,
      !market.regime,
      (market.regimeConfidence || 0) < 60,
      market.liquidityState === 'poor',
      market.volatilityState === 'high',
      risks.length > 0,
    ].filter(Boolean).length;

    const now = Date.now();
    const cooldownUntilTs = portfolio?.cooldownUntil ? Date.parse(portfolio.cooldownUntil) : NaN;
    const cooldownActive = Number.isFinite(cooldownUntilTs) && cooldownUntilTs > now;
    const killSwitchActive = Boolean(portfolio?.killSwitchTriggered);

    const ruleMode: 'TRADE' | 'NO_TRADE' | 'COOLDOWN' = killSwitchActive || cooldownActive
      ? 'COOLDOWN'
      : failedChecks > 0
        ? 'NO_TRADE'
        : 'TRADE';

    const deepseek = briefing?.deepseekDecision || null;
    const mode = deepseek?.decision || ruleMode;
    const finalExecutionDecision: 'TRADE' | 'NO_TRADE' = workerStatus?.finalExecutionDecision === 'NO_TRADE' ? 'NO_TRADE' : mode === 'TRADE' ? 'TRADE' : 'NO_TRADE';
    const regime = String(market.regime || 'unclear').toUpperCase();
    const volatility = String(market.volatilityState || 'unknown').toUpperCase();
    const liquidity = String(market.liquidityState || 'unknown').toUpperCase();

    const btc = coins.find((c) => c.symbol === 'BTC')?.price || 0;
    const zoneLow = btc > 0 ? (btc * 0.998).toFixed(0) : '—';
    const zoneHigh = btc > 0 ? (btc * 1.002).toFixed(0) : '—';
    const stop = btc > 0 ? (btc * 0.993).toFixed(0) : '—';
    const tp1 = btc > 0 ? (btc * 1.006).toFixed(0) : '—';
    const tp2 = btc > 0 ? (btc * 1.012).toFixed(0) : '—';

    const zoneLowNum = btc > 0 ? btc * 0.998 : 0;
    const zoneHighNum = btc > 0 ? btc * 1.002 : 0;
    const inEntryZone = btc > 0 && btc >= zoneLowNum && btc <= zoneHighNum;
    const softUnlock =
      mode === 'TRADE' &&
      (market.regimeConfidence || 0) >= 60 &&
      String(market.liquidityState || '').toLowerCase() === 'good' &&
      String(market.volatilityState || '').toLowerCase() !== 'high' &&
      inEntryZone;

    const defaultState: DecisionState = mode === 'COOLDOWN'
      ? 'LOCKED_RISK'
      : mode === 'NO_TRADE'
        ? 'SCANNING'
        : (market.regimeConfidence || 0) >= 70 || softUnlock
          ? 'TRIGGER_ARMED'
          : 'WAITING_FOR_TRIGGER';

    const state = deepseek?.state || defaultState;

    const nowAction = deepseek?.now_action || (
      mode === 'COOLDOWN'
        ? 'Pause all entries. Risk lock is active.'
        : mode === 'NO_TRADE'
          ? 'Stand by. Continue scanning for a clean trigger.'
          : softUnlock
            ? `Soft unlock active: in-zone + good liquidity + low volatility. Execute with ${Number(riskSettings.maxLeverage ?? 5)}x max leverage.`
            : `Wait for confirmation candle and execute with ${Number(riskSettings.maxLeverage ?? 5)}x max leverage.`
    );

    const triggerConditions = deepseek?.trigger_conditions || (
      mode === 'TRADE'
        ? [
            `15m close confirms ${regime} continuation`,
            `Entry zone holds (${zoneLow} - ${zoneHigh})`,
            'Momentum and volume expand into breakout',
          ]
        : [
            'Regime confidence >= 60%',
            'Liquidity is not POOR',
            'Volatility is not HIGH',
          ]
    );

    const invalidators = deepseek?.invalidators || (
      mode === 'COOLDOWN'
        ? ['Risk lock remains active until cooldown clears']
        : [
            `Price loses ${zoneLow} support`,
            `Volatility flips to HIGH (currently ${volatility})`,
            'Any new risk flag appears',
          ]
    );

    const entryPlan = {
      zone: deepseek?.entry_plan?.zone || `${zoneLow} - ${zoneHigh}`,
      stop: deepseek?.entry_plan?.stop || stop,
      tp1: deepseek?.entry_plan?.tp1 || tp1,
      tp2: deepseek?.entry_plan?.tp2 || tp2,
      rr: deepseek?.entry_plan?.rr || '>= 1.5',
    };

    const actionableNext = mode === 'TRADE'
      ? `Need now: 15m confirmation close + hold above ${zoneLow} + momentum/volume expansion in zone ${zoneLow}-${zoneHigh}.`
      : `Need now: rebuild setup quality before entry — watch 15m structure around ${zoneLow}-${zoneHigh}.`;

    return {
      label: finalExecutionDecision,
      ruleBias: mode,
      aiGate: String(workerStatus?.aiGateDecision || 'N/A'),
      sideSource: String(workerStatus?.sideSource || 'N/A'),
      chosenSide: String(workerStatus?.chosenSide || 'N/A'),
      quality: finalExecutionDecision === 'TRADE' ? 'VALID SETUP' : mode === 'COOLDOWN' ? 'LOCKED' : 'LOW CONFIDENCE',
      checks: `${Math.max(0, 6 - failedChecks)} / 6 Checks`,
      failedChecks,
      state,
      confidence: Number(deepseek?.confidence ?? market.regimeConfidence ?? 0),
      nowAction,
      triggerConditions,
      invalidators,
      entryPlan,
      reasoningSummary:
        deepseek?.reasoning_summary ||
        `Rules-first gate active. Regime ${regime}, liquidity ${liquidity}, volatility ${volatility}.`,
      changesSinceLast: deepseek?.changes_since_last?.length ? deepseek.changes_since_last : cycleChanges,
      actionableNext,
    };
  }, [
    liveConnected,
    market.regime,
    market.regimeConfidence,
    market.liquidityState,
    market.volatilityState,
    risks.length,
    portfolio?.cooldownUntil,
    portfolio?.killSwitchTriggered,
    riskSettings.maxLeverage,
    briefing?.deepseekDecision,
    workerStatus?.finalExecutionDecision,
    workerStatus?.aiGateDecision,
    workerStatus?.sideSource,
    workerStatus?.chosenSide,
    coins,
    cycleChanges,
  ]);

  const triggerDiagnostics = useMemo(() => {
    const diagnostics = [
      {
        key: 'regime_confidence',
        label: `Regime confidence >= 60% (now ${Number(market.regimeConfidence || 0)}%)`,
        passed: Number(market.regimeConfidence || 0) >= 60,
      },
      {
        key: 'liquidity',
        label: `Liquidity not POOR (now ${String(market.liquidityState || 'unknown').toUpperCase()})`,
        passed: String(market.liquidityState || '').toLowerCase() !== 'poor',
      },
      {
        key: 'volatility',
        label: `Volatility not HIGH (now ${String(market.volatilityState || 'unknown').toUpperCase()})`,
        passed: String(market.volatilityState || '').toLowerCase() !== 'high',
      },
      {
        key: 'risk_flags',
        label: `No active risk flags (${risks.length})`,
        passed: risks.length === 0,
      },
      {
        key: 'mode',
        label: `Decision mode allows entry (${decision.label})`,
        passed: decision.label === 'TRADE',
      },
      {
        key: 'state',
        label: `Execution state armed/open (${decision.state.replaceAll('_', ' ')})`,
        passed: decision.state === 'TRIGGER_ARMED' || decision.state === 'EXECUTION_WINDOW_OPEN',
      },
    ];

    const blocked = diagnostics.filter((d) => !d.passed).map((d) => d.label);
    return {
      items: diagnostics,
      blocked,
      blockerNow: blocked[0] || 'No blocker. Waiting for trigger candle confirmation.',
    };
  }, [decision.label, decision.state, market.regimeConfidence, market.liquidityState, market.volatilityState, risks.length]);

  const symbolBrains = useMemo(() => {
    const rejectMap = new Map<string, string>();
    for (const r of (workerStatus?.symbolRejects || [])) {
      if (r?.symbol) rejectMap.set(String(r.symbol), String(r.reason || 'blocked'));
    }

    return EXEC_SYMBOLS.map((symbol) => {
      const base = symbol.replace('USDT', '');
      const coin = coins.find((c) => c.symbol === base);
      const hasPosition = livePositions.some((p) => p.symbol === symbol);
      const confidence = Number(market.regimeConfidence || 0);
      const blockedReason = rejectMap.get(symbol) || '';
      const state = hasPosition ? 'OPEN' : (blockedReason ? 'BLOCKED' : (confidence >= 60 ? 'ARMED' : 'SCANNING'));
      const action = hasPosition
        ? `Position open @ ${livePositions.find((p) => p.symbol === symbol)?.entryPrice?.toFixed(2) || '—'}`
        : blockedReason
          ? `Blocked: ${blockedReason}`
          : confidence >= 60
            ? 'Ready when trigger confirms'
            : 'Watching for confidence lift';

      return {
        symbol,
        price: coin?.price || 0,
        change: coin?.change || 0,
        confidence,
        state,
        action,
      };
    });
  }, [workerStatus?.symbolRejects, coins, livePositions, market.regimeConfidence]);

  const latestAiBySymbol = useMemo(() => {
    const map = new Map<string, any>();
    journal
      .filter((j) => j.type === 'ai_decision' && j.symbol)
      .sort((a, b) => new Date(String(b.ts || 0)).getTime() - new Date(String(a.ts || 0)).getTime())
      .forEach((j) => {
        const symbol = String(j.symbol || '').toUpperCase();
        if (symbol && !map.has(symbol)) map.set(symbol, j);
      });
    return map;
  }, [journal]);

  const tradeCandidates = useMemo(() => tradeIntelligence?.candidates || [], [tradeIntelligence]);
  const topTradeCandidate = tradeIntelligence?.topCandidate || tradeCandidates[0] || null;
  const candidateBySymbol = useMemo(() => {
    return new Map(tradeCandidates.map((candidate) => [String(candidate.symbol || '').toUpperCase(), candidate]));
  }, [tradeCandidates]);
  const positionInsightBySymbol = useMemo(() => {
    return new Map((tradeIntelligence?.positionManagement || []).map((insight) => [String(insight.symbol || '').toUpperCase(), insight]));
  }, [tradeIntelligence?.positionManagement]);

  const tradeFocus = useMemo(() => {
    const open = livePositions[0];
    const latestConversation = Array.isArray(workerStatus?.aiConversations) ? workerStatus.aiConversations[0] : null;
    const candidateSymbol = String(
      open?.symbol
      || latestConversation?.symbol
      || topTradeCandidate?.symbol
      || workerStatus?.lastAutoSignalKey?.split(':')?.[0]
      || Array.from(latestAiBySymbol.keys())[0]
      || 'BTCUSDT'
    ).toUpperCase();
    const base = candidateSymbol.replace('USDT', '');
    const coin = coins.find((c) => c.symbol === base);
    const aiJournal = latestAiBySymbol.get(candidateSymbol);
    const candidate = candidateBySymbol.get(candidateSymbol) || null;
    const symbolBrain = symbolBrains.find((s) => s.symbol === candidateSymbol);
    const reject = (workerStatus?.symbolRejects || []).find((r: any) => String(r?.symbol || '').toUpperCase() === candidateSymbol);
    const chosenSide = String(workerStatus?.chosenSide || decision.chosenSide || 'N/A').toUpperCase();
    const side = open?.side
      ? String(open.side).toUpperCase()
      : chosenSide === 'BUY'
        ? 'LONG'
        : chosenSide === 'SELL'
          ? 'SHORT'
          : String(candidate?.bias || (aiJournal as any)?.side || 'WATCH').toUpperCase();
    const setupState = open
      ? 'OPEN POSITION'
      : candidate?.state
        ? candidate.state
      : reject
        ? 'BLOCKED'
        : decision.label === 'TRADE'
          ? 'READY'
          : decision.state.replaceAll('_', ' ');
    const price = Number(coin?.price || open?.currentPrice || 0);
    const isShort = side === 'SHORT' || side === 'SELL';
    const formatPlanPrice = (value: number) => {
      if (!Number.isFinite(value) || value <= 0) return '—';
      return value >= 100 ? value.toFixed(0) : value >= 1 ? value.toFixed(2) : value.toFixed(5);
    };
    const fallbackEntryLow = price > 0 ? price * 0.998 : 0;
    const fallbackEntryHigh = price > 0 ? price * 1.002 : 0;
    const fallbackStop = price > 0 ? (isShort ? price * 1.007 : price * 0.993) : 0;
    const fallbackTp1 = price > 0 ? (isShort ? price * 0.994 : price * 1.006) : 0;
    const fallbackTp2 = price > 0 ? (isShort ? price * 0.988 : price * 1.012) : 0;
    const planEntry = Number((aiJournal as any)?.entry || 0);
    const planStop = Number((aiJournal as any)?.stopLoss || 0);
    const planTarget = Number((aiJournal as any)?.takeProfit || 0);
    const candidateEntryLow = Number(candidate?.entryZone?.low || 0);
    const candidateEntryHigh = Number(candidate?.entryZone?.high || 0);
    const entryZone = candidateEntryLow > 0 && candidateEntryHigh > 0
      ? `${formatPlanPrice(candidateEntryLow)} - ${formatPlanPrice(candidateEntryHigh)}`
      : planEntry > 0
      ? `${formatPlanPrice(planEntry * 0.998)} - ${formatPlanPrice(planEntry * 1.002)}`
      : price > 0
        ? `${formatPlanPrice(fallbackEntryLow)} - ${formatPlanPrice(fallbackEntryHigh)}`
        : '—';
    const stop = formatPlanPrice(Number(candidate?.stopLoss || 0) > 0 ? Number(candidate?.stopLoss || 0) : planStop > 0 ? planStop : fallbackStop);
    const candidateTargets = Array.isArray(candidate?.targets) ? candidate.targets.filter((target) => Number(target) > 0) : [];
    const targets = candidateTargets.length > 0
      ? candidateTargets.slice(0, 2).map((target) => formatPlanPrice(Number(target))).join(' / ')
      : planTarget > 0
      ? formatPlanPrice(planTarget)
      : [fallbackTp1, fallbackTp2].map(formatPlanPrice).filter((x) => x !== '—').join(' / ') || '—';
    const expectedR = Number(candidate?.expectedRR || (aiJournal as any)?.expectedRMultiple || 0);
    const edgeBps = Number((aiJournal as any)?.expectedNetEdgeBps || 0);
    const waitFor = candidate?.state === 'READY' && candidate.confirm
      ? candidate.confirm
      : candidate?.blocker
        ? candidate.blocker
        : candidate?.confirm
          ? candidate.confirm
          : decision.label === 'TRADE'
      ? `Wait for ${candidateSymbol} to hold ${entryZone}, confirm ${side} momentum, then execute only if RR stays >= ${expectedR > 0 ? expectedR.toFixed(2) : '1.50'}.`
      : (reject ? String(reject.reason || '').replace(/^ai_no_trade:/, 'AI no trade: ').replace(/_/g, ' ') : triggerDiagnostics.blockerNow);
    const watched = symbolBrains.slice(0, 5).map((s) => `${s.symbol.replace('USDT', '')}:${s.state}`).join('  ');

    return {
      symbol: candidateSymbol,
      price,
      side,
      setupState,
      confidence: Number((aiJournal as any)?.confidence || decision.confidence || 0),
      expectedR: expectedR > 0 ? expectedR.toFixed(2) : String(decision.entryPlan.rr || '>= 1.5'),
      edge: Number.isFinite(edgeBps) && edgeBps !== 0 ? `${edgeBps.toFixed(1)} bps` : 'waiting',
      entryZone,
      stop,
      targets,
      waitFor,
      watched,
      blocker: reject ? String(reject.reason || '').replace(/^ai_no_trade:/, 'AI no trade: ').replace(/_/g, ' ') : '',
      journalDecision: String((aiJournal as any)?.decision || decision.label || 'NO_TRADE').toUpperCase(),
      symbolState: symbolBrain?.state || 'SCANNING',
      qualityScore: Number(candidate?.qualityScore || 0),
      setupType: String(candidate?.setupType || setupState).replace(/_/g, ' '),
      thesis: candidate?.thesis || '',
      confirm: candidate?.confirm || '',
      invalidate: candidate?.invalidate || decision.invalidators?.[0] || 'Structure invalidation not reported',
      qualityScores: candidate?.scores || null,
      candidateState: candidate?.state || setupState,
    };
  }, [
    livePositions,
    workerStatus?.aiConversations,
    topTradeCandidate?.symbol,
    workerStatus?.lastAutoSignalKey,
    workerStatus?.symbolRejects,
    workerStatus?.chosenSide,
    coins,
    latestAiBySymbol,
    candidateBySymbol,
    symbolBrains,
    decision,
    triggerDiagnostics.blockerNow,
  ]);

  const liveFeed = useMemo(() => {
    const events: string[] = [];
    if (workerStatus?.lastRunAt) events.push(`Worker cycle: ${new Date(workerStatus.lastRunAt).toLocaleTimeString()}`);
    if (workerStatus?.lastAction) events.push(`Action: ${String(workerStatus.lastAction).toUpperCase()} — ${workerStatus?.lastReasonHuman || workerStatus?.lastReason || 'n/a'}`);
    for (const c of cycleChanges.slice(0, 3)) events.push(c);
    for (const j of journal.slice(0, 3)) {
      if (j.type === 'trade_close') events.push(`Closed ${j.symbol || 'pair'} • PnL ${signedMoney(Number(j.pnl || 0))}`);
      if (j.type === 'trade_open') events.push(`Opened ${j.symbol || 'pair'} • qty ${Number(j.qty || 0).toFixed(6)}`);
    }
    return events.slice(0, 8);
  }, [workerStatus?.lastRunAt, workerStatus?.lastAction, workerStatus?.lastReason, cycleChanges, journal]);

  const lastReasonText = String(workerStatus?.lastReasonHuman || workerStatus?.lastReason || '—');

  const reasonBreakdown = useMemo(() => {
    const bySymbol: Array<{ symbol: string; reason: string }> = [];
    const symbolRegex = /([A-Z]{3,}USDT):\s*([^•]+?)(?=(?:\s*•\s*[A-Z]{3,}USDT:)|$)/g;
    let match: RegExpExecArray | null;

    while ((match = symbolRegex.exec(lastReasonText)) !== null) {
      bySymbol.push({
        symbol: match[1],
        reason: match[2].trim(),
      });
    }

    const headline = lastReasonText.split(/\s*•\s*/)[0]?.trim() || '—';

    return {
      headline,
      bySymbol,
      hasStructuredReasons: bySymbol.length > 0,
    };
  }, [lastReasonText]);

  async function pingStatusFast() {
    try {
      const res = await fetchWithTimeout(`${API}/status`, {}, 20000);
      if (!res.ok) return;
      const payload = (await res.json()) as TradingStatus;
      setStatus(payload);
      setError('');
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // keep previous status when ping fails
    }
  }

  async function loadDashboard() {
    try {
      const [statusRes, settingsRes, briefingRes, riskRes, intelligenceRes, operatorRes, journalRes, workerRes, openOrdersRes] = await Promise.allSettled([
        fetchWithTimeout(`${API}/status`, {}, 20000),
        fetchWithTimeout(`${API}/settings`),
        fetchWithTimeout(`${API}/daily-briefing`),
        fetchWithTimeout(`${API}/risk-context?symbols=${EXEC_SYMBOLS.join(',')}`),
        fetchWithTimeout(`${API}/trade-intelligence?symbols=${EXEC_SYMBOLS.join(',')}`),
        fetchWithTimeout(`${API}/operator-intelligence?symbols=${EXEC_SYMBOLS.join(',')}`, {}, 25000),
        fetchWithTimeout(`${API}/journal?limit=300&tradeCloseLimit=50&tradeCloseScanLimit=5000`),
        fetchWithTimeout(`${API}/worker-status`),
        fetchWithTimeout(`${API}/open-orders`),
      ]);

      let statusApplied = false;
      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        try {
          const statusPayload = (await statusRes.value.json()) as TradingStatus;
          setStatus(statusPayload);
          statusApplied = true;
        } catch {
          // keep previous status if payload parse fails
        }
      }

      if (!statusApplied) {
        try {
          const fallbackRes = await fetchWithTimeout(`${API}/status`);
          if (fallbackRes.ok) {
            const statusPayload = (await fallbackRes.json()) as TradingStatus;
            setStatus(statusPayload);
            statusApplied = true;
          }
        } catch {
          // keep previous status
        }
      }

      if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
        try {
          setSettings((await settingsRes.value.json()) as SettingsPayload);
        } catch {
          // ignore malformed settings payload
        }
      }

      if (briefingRes.status === 'fulfilled' && briefingRes.value.ok) {
        try {
          const nextBriefing = (await briefingRes.value.json()) as BriefingPayload;

          const nextConfidence = Number(nextBriefing.market?.regimeConfidence || 0);
          const nextVolatility = String(nextBriefing.market?.volatilityState || 'unknown').toUpperCase();
          const nextFundingPct = Number(nextBriefing.market?.funding?.[0]?.fundingRate || 0) * 100;

          const prev = previousCycleRef.current;
          if (prev) {
            const changes: string[] = [];
            if (prev.regimeConfidence !== nextConfidence) {
              changes.push(`Regime confidence: ${prev.regimeConfidence}% → ${nextConfidence}%`);
            }
            if (prev.volatility !== nextVolatility) {
              changes.push(`Volatility: ${prev.volatility} → ${nextVolatility}`);
            }
            if (Math.abs(prev.fundingRatePct - nextFundingPct) >= 0.01) {
              changes.push(`Funding: ${prev.fundingRatePct.toFixed(2)}% → ${nextFundingPct.toFixed(2)}%`);
            }
            setCycleChanges(changes);
          }

          previousCycleRef.current = {
            regimeConfidence: nextConfidence,
            volatility: nextVolatility,
            fundingRatePct: nextFundingPct,
          };

          setBriefing(nextBriefing);
        } catch {
          // ignore malformed briefing payload
        }
      }

      if (riskRes.status === 'fulfilled' && riskRes.value.ok) {
        try {
          setRiskContext((await riskRes.value.json()) as RiskContext);
        } catch {
          // ignore malformed risk payload
        }
      }

      if (intelligenceRes.status === 'fulfilled' && intelligenceRes.value.ok) {
        try {
          setTradeIntelligence((await intelligenceRes.value.json()) as TradeIntelligencePayload);
        } catch {
          // ignore malformed trade intelligence payload
        }
      }

      if (operatorRes.status === 'fulfilled' && operatorRes.value.ok) {
        try {
          setOperatorIntelligence((await operatorRes.value.json()) as OperatorIntelligencePayload);
        } catch {
          // ignore malformed operator intelligence payload
        }
      }

      if (journalRes.status === 'fulfilled' && journalRes.value.ok) {
        try {
          const payload = await journalRes.value.json();
          setJournal(Array.isArray(payload?.entries) ? payload.entries : []);
        } catch {
          // ignore malformed journal payload
        }
      }

      if (workerRes.status === 'fulfilled' && workerRes.value.ok) {
        try {
          const payload = await workerRes.value.json();
          setWorkerStatus(payload);
        } catch {
          // ignore malformed worker payload
        }
      }

      if (openOrdersRes.status === 'fulfilled' && openOrdersRes.value.ok) {
        try {
          const payload = await openOrdersRes.value.json();
          setOpenOrders(Array.isArray(payload?.orders) ? payload.orders : []);
        } catch {
          // ignore malformed open-orders payload
        }
      }

      setLastUpdated(new Date().toLocaleTimeString());
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load dashboard');
    }
  }

  async function loadMarket() {
    try {
      const ids = TRACKED_SYMBOLS.map((x) => x.id).join(',');
      const res = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false&price_change_percentage=24h`);
      if (!res.ok) return;
      const data = await res.json();
      const mapped = TRACKED_SYMBOLS.map((x) => {
        const m = data.find((d: any) => d.id === x.id);
        return {
          symbol: x.symbol,
          price: Number(m?.current_price || 0),
          change: Number(m?.price_change_percentage_24h || 0),
        };
      });
      setCoins(mapped);
    } catch {
      // keep last successful snapshot
    }
  }

  async function secureBreakEven(symbol: string) {
    if (!manualAdminKey.trim()) {
      setManualFeedback({ kind: 'error', text: 'Admin Key is required to secure Break Even.' });
      return;
    }

    try {
      const res = await fetchWithTimeout(`${API}/positions/secure-break-even`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': manualAdminKey.trim(),
        },
        body: JSON.stringify({ symbols: [symbol], bufferPct: 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setManualFeedback({ kind: 'error', text: `BE update failed: ${String(data?.error || 'secure_break_even_failed')}` });
        return;
      }
      const result = data?.result || (Array.isArray(data.results) ? data.results[0] : data);
      const stopLoss = Number(result?.stopLoss || 0);
      const feeBps = Number(result?.feeBps ?? (riskSettings as any).breakEvenFeeBps ?? 8);
      const slippageBps = Number(result?.slippageBps ?? (riskSettings as any).breakEvenSlippageBps ?? 5);
      const stopText = stopLoss > 0 ? ` at ${formatPrice(stopLoss)}` : '';
      setManualFeedback({ kind: 'success', text: `${symbol} Stop Loss moved to BE+${stopText}, covering estimated fees (${feeBps} bps) and slippage (${slippageBps} bps).` });
      await loadDashboard();
    } catch (e: any) {
      setManualFeedback({ kind: 'error', text: e?.message || 'Failed to secure Break Even.' });
    }
  }

  async function takePartial(symbol: string, percent = 5) {
    if (!manualAdminKey.trim()) {
      setManualFeedback({ kind: 'error', text: 'Admin Key is required to take partial profit.' });
      return;
    }

    try {
      const res = await fetchWithTimeout(`${API}/positions/partial-close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': manualAdminKey.trim(),
        },
        body: JSON.stringify({ symbols: [symbol], percent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setManualFeedback({ kind: 'error', text: `Partial close failed: ${String(data?.error || 'partial_close_failed')}` });
        return;
      }
      setManualFeedback({ kind: 'success', text: `${symbol} partial close executed for ${percent}%.` });
      await loadDashboard();
    } catch (e: any) {
      setManualFeedback({ kind: 'error', text: e?.message || 'Failed to take partial profit.' });
    }
  }

  async function closePosition(symbol: string) {
    if (!manualAdminKey.trim()) {
      setManualFeedback({ kind: 'error', text: 'Admin Key is required to close a trade.' });
      return;
    }

    const confirmText = `Close ${symbol} position now?`;
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;

    try {
      const res = await fetchWithTimeout(`${API}/close-position`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': manualAdminKey.trim(),
        },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setManualFeedback({ kind: 'error', text: `Close failed: ${String(data?.error || 'close_position_failed')}` });
        return;
      }
      setManualFeedback({ kind: 'success', text: `${symbol} position closed.` });
      await loadDashboard();
    } catch (e: any) {
      setManualFeedback({ kind: 'error', text: e?.message || 'Failed to close position.' });
    }
  }

  async function updateStopLoss(symbol: string, fallbackStop: number) {
    if (!manualAdminKey.trim()) {
      setManualFeedback({ kind: 'error', text: 'Admin Key is required to update Stop Loss.' });
      return;
    }

    const raw = slDrafts[symbol];
    const stopLoss = Number(raw && raw.trim() ? raw : fallbackStop);
    if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
      setManualFeedback({ kind: 'error', text: `Invalid Stop Loss for ${symbol}.` });
      return;
    }

    const confirmText = `Update ${symbol} Stop Loss to ${stopLoss}?`;
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;

    try {
      const res = await fetchWithTimeout(`${API}/update-stop-loss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': manualAdminKey.trim(),
        },
        body: JSON.stringify({ symbol, stopLoss }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setManualFeedback({ kind: 'error', text: `SL update failed: ${String(data?.error || 'update_stop_loss_failed')}` });
        return;
      }

      setManualFeedback({ kind: 'success', text: `${symbol} Stop Loss updated to ${stopLoss}.` });
      await loadDashboard();
    } catch (e: any) {
      setManualFeedback({ kind: 'error', text: e?.message || 'Failed to update Stop Loss.' });
    }
  }

  async function submitManualTrade() {
    setManualFeedback(null);

    if (!manualAdminKey.trim()) {
      setManualFeedback({ kind: 'error', text: 'Admin key is required for manual trade submission.' });
      return;
    }

    const confidenceNum = Number(manualConfidence);
    if (!Number.isFinite(confidenceNum) || confidenceNum <= 0 || confidenceNum > 100) {
      setManualFeedback({ kind: 'error', text: 'Confidence must be between 1 and 100.' });
      return;
    }

    if (!manualStopLoss || !manualTakeProfit) {
      setManualFeedback({ kind: 'error', text: 'Stop Loss and Take Profit are required.' });
      return;
    }

    const payload: any = {
      symbol: manualSymbol,
      side: manualSide,
      type: manualType,
      confidence: confidenceNum,
      reason: manualReason || 'Manual discretionary setup',
      stopLoss: Number(manualStopLoss),
      takeProfit: Number(manualTakeProfit),
      leverage: Number(manualLeverage || 1),
    };

    if (manualQty && Number.isFinite(Number(manualQty)) && Number(manualQty) > 0) {
      payload.quantity = Number(manualQty);
    }

    if (manualType === 'LIMIT' && manualPrice && Number.isFinite(Number(manualPrice)) && Number(manualPrice) > 0) {
      payload.price = Number(manualPrice);
    }

    const confirmText = `Submit manual ${manualSide} ${manualSymbol} trade now?`;
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;

    try {
      setManualSubmitting(true);
      const res = await fetchWithTimeout(`${API}/manual-trade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': manualAdminKey.trim(),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const reason = String(data?.rejectReason || data?.error || 'manual_trade_rejected');
        setManualFeedback({ kind: 'error', text: `Manual trade rejected: ${reason}` });
        return;
      }

      setManualFeedback({ kind: 'success', text: 'Manual trade submitted successfully.' });
      await loadDashboard();
    } catch (e: any) {
      setManualFeedback({ kind: 'error', text: e?.message || 'Failed to submit manual trade.' });
    } finally {
      setManualSubmitting(false);
    }
  }

  async function cancelOpenOrder(order: { symbol: string; orderId: number }) {
    setOrdersFeedback(null);
    if (!manualAdminKey.trim()) {
      setOrdersFeedback({ kind: 'error', text: 'Admin Key is required to cancel orders.' });
      return;
    }

    const confirmText = `Cancel ${order.symbol} order #${order.orderId}?`;
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;

    try {
      const res = await fetchWithTimeout(`${API}/cancel-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': manualAdminKey.trim(),
        },
        body: JSON.stringify({ symbol: order.symbol, orderId: order.orderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setOrdersFeedback({ kind: 'error', text: `Cancel failed: ${String(data?.error || 'cancel_order_failed')}` });
        return;
      }
      setOrdersFeedback({ kind: 'success', text: `Canceled order #${order.orderId} (${order.symbol})` });
      await loadDashboard();
    } catch (e: any) {
      setOrdersFeedback({ kind: 'error', text: e?.message || 'Failed to cancel order.' });
    }
  }

  async function cancelAllOpenOrders(scope: 'ALL' | 'FILTERED') {
    setOrdersFeedback(null);
    if (!manualAdminKey.trim()) {
      setOrdersFeedback({ kind: 'error', text: 'Admin Key is required to cancel orders.' });
      return;
    }

    const symbol = scope === 'FILTERED' && openOrderFilter !== 'ALL' ? openOrderFilter : undefined;
    const confirmText = symbol
      ? `Cancel all open orders for ${symbol}?`
      : 'Cancel ALL open orders?';
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;

    try {
      const res = await fetchWithTimeout(`${API}/cancel-open-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': manualAdminKey.trim(),
        },
        body: JSON.stringify(symbol ? { symbol } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        setOrdersFeedback({ kind: 'error', text: `Bulk cancel failed: ${String(data?.error || 'cancel_open_orders_failed')}` });
        return;
      }

      setOrdersFeedback({ kind: 'success', text: `Canceled ${Number(data?.canceledCount || 0)} order(s).` });
      await loadDashboard();
    } catch (e: any) {
      setOrdersFeedback({ kind: 'error', text: e?.message || 'Failed to cancel open orders.' });
    }
  }

  useEffect(() => {
    setWidgetLayouts(loadStoredWidgetLayouts());
    pingStatusFast();
    loadDashboard();
    loadMarket();
    if (typeof window !== 'undefined') {
      setUiBuildId((window as any)?.__NEXT_DATA__?.buildId || 'unknown');
    }
    const id = setInterval(() => {
      pingStatusFast();
      loadDashboard();
      loadMarket();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  function persistWidgetLayouts(nextLayouts: ResponsiveLayouts) {
    setWidgetLayouts(nextLayouts);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(nextLayouts));
    }
  }

  const beProtectionPct = Math.max(0, Number((riskSettings as any).breakEvenBufferPct ?? 0.001))
    + Math.max(0, Number((riskSettings as any).breakEvenFeeBps ?? 8)) / 10000
    + Math.max(0, Number((riskSettings as any).breakEvenSlippageBps ?? 5)) / 10000;
  const runnerPartialPct = Math.max(5, Math.min(80, Number((riskSettings as any).runnerPartialTakeProfitPct ?? 30)));
  const runnerActivationR = Math.max(1, Math.min(10, Number((riskSettings as any).runnerActivationR ?? 2)));
  const runnerTrailPct = Math.max(0.1, Math.min(20, Number((riskSettings as any).runnerTrailPct ?? 0.006) * 100));
  const winnersRunEnabled = (riskSettings as any).letWinnersRunEnabled !== false;

  const activeTradeRows = livePositions.slice(0, 6).map((p) => {
    const stop = Number((p as any).stopLoss || 0);
    const entry = Number(p.entryPrice || 0);
    const size = Number(p.size || 0);
    const side = String((p as any).side || 'LONG');
    const mark = Number((p as any).currentPrice || 0);
    const unrealized = Number((p as any).pnl || 0);
    const secured = stop > 0
      ? side === 'LONG'
        ? (stop - entry) * size
        : (entry - stop) * size
      : 0;
    const slStatus = stop <= 0
      ? 'N/A'
      : secured > 0
        ? 'Locked Profit'
        : Math.abs(stop - entry) / Math.max(1, entry) < 0.002
          ? 'Break-even'
          : 'Initial';
    const pnlState = unrealized > 0.000001 ? 'profit' : unrealized < -0.000001 ? 'loss' : 'flat';
    const bePlusStop = entry > 0
      ? side === 'LONG'
        ? entry * (1 + beProtectionPct)
        : entry * (1 - beProtectionPct)
      : 0;
    return {
      ts: p.openedAt,
      symbol: p.symbol,
      side,
      qty: p.size,
      entry: p.entryPrice,
      mark,
      stop,
      takeProfit: Number((p as any).takeProfit || 0),
      slStatus,
      secured,
      unrealized,
      pnlState,
      bePlusStop,
      runnerMode: Boolean((p as any).runnerMode),
      partialTakenPct: Number((p as any).partialTakenPct || 0),
      bestPrice: Number((p as any).bestPrice || 0),
    };
  });
  const managedPositionRows = activeTradeRows.map((t) => {
    const intelligenceInsight = positionInsightBySymbol.get(String(t.symbol || '').toUpperCase());
    const side = String(t.side || '').toUpperCase();
    const isLong = side === 'LONG' || side === 'BUY';
    const entry = Number(t.entry || 0);
    const mark = Number(t.mark || 0);
    const stop = Number(t.stop || 0);
    const takeProfit = Number(t.takeProfit || 0);
    const unrealized = Number(t.unrealized || 0);
    const qty = Number(t.qty || 0);
    const riskToStop = stop > 0 && mark > 0 && qty > 0 ? Math.abs(mark - stop) * qty : 0;
    const rewardToTarget = takeProfit > 0 && mark > 0 && qty > 0 ? Math.abs(takeProfit - mark) * qty : 0;
    const movePct = entry > 0 && mark > 0 ? ((mark - entry) / entry) * (isLong ? 100 : -100) : 0;
    const distanceToStopPct = stop > 0 && mark > 0 ? (Math.abs(mark - stop) / mark) * 100 : 0;
    const distanceToTargetPct = takeProfit > 0 && mark > 0 ? (Math.abs(takeProfit - mark) / mark) * 100 : 0;
    const nextAction = intelligenceInsight?.recommendation || (stop <= 0
      ? 'Add a protective stop before doing anything else.'
      : unrealized > 0 && t.slStatus === 'Initial'
        ? 'Winner is open. Watch for BE lock conditions before giving profit back.'
        : unrealized > 0 && t.slStatus === 'Break-even'
          ? 'Risk is neutralized. Manage toward partial profit or trail only after structure confirms.'
          : unrealized > 0 && t.slStatus === 'Locked Profit'
            ? 'Profit is protected. Let the trade work unless structure breaks.'
            : unrealized < 0
              ? 'Trade is under pressure. Respect the stop; do not widen risk.'
              : 'Position is flat. Wait for movement toward stop or target before adjusting.');

    return {
      ...t,
      side,
      isLong,
      riskToStop,
      rewardToTarget,
      movePct,
      distanceToStopPct,
      distanceToTargetPct,
      nextAction,
      managementReason: intelligenceInsight?.reason || '',
      managementState: intelligenceInsight?.state || '',
      currentR: Number(intelligenceInsight?.currentR || 0),
      holdScore: Number(intelligenceInsight?.holdScore || 0),
      reduceScore: Number(intelligenceInsight?.reduceScore || 0),
      exitScore: Number(intelligenceInsight?.exitScore || 0),
    };
  });
  const recentTradeRows = journal
    .filter((j) => j.type === 'trade_close')
    .sort((a, b) => new Date(String(b.ts || 0)).getTime() - new Date(String(a.ts || 0)).getTime())
    .slice(0, 20)
    .map((j) => {
      const rawDirection = String((j as any).positionSide || (j as any).direction || (j as any).side || '').toUpperCase();
      const direction = rawDirection === 'BUY' ? 'LONG' : rawDirection === 'SELL' ? 'SHORT' : (rawDirection || '—');
      const ts = String((j as any).closedAt || j.ts || '');
      return {
        ts,
        symbol: String((j as any).symbol || '—'),
        side: direction,
        direction,
        pnl: Number((j as any).pnl || 0),
      };
    });
  const aiDecisionRows = Array.from(
    new Map(
      journal
        .filter((j) => j.type === 'ai_decision')
        .sort((a, b) => new Date(String(b.ts || 0)).getTime() - new Date(String(a.ts || 0)).getTime())
        .map((j) => {
          const row = {
            ts: j.ts,
            symbol: j.symbol || '—',
            decision: String(j.decision || '—').toUpperCase(),
            confidence: Number(j.confidence || 0),
            reason: (() => {
              const base = Array.isArray(j.reasons) && j.reasons.length ? j.reasons[0] : (j.gateResult || 'n/a');
              const b = String(base).toLowerCase();
              if (b.includes('unable to generate signal')) {
                return 'No clean setup this cycle; DeepSeek confidence too weak to issue a trade.';
              }
              if (b.includes('model_output_invalid_json')) {
                return 'DeepSeek response format invalid this cycle; parser fallback blocked execution.';
              }
              if (b.includes('regime') && b.includes('unclear')) {
                return 'AI disagreement: regime interpretation mismatch (engine shows qualified trend context).';
              }
              return String(base).replace(/_/g, ' ');
            })(),
          };
          const key = `${row.ts}|${row.symbol}|${row.decision}|${row.reason}`;
          return [key, row] as const;
        })
    ).values()
  ).slice(0, 8);

  const aiPositionFeedbackRows = Array.isArray(workerStatus?.positionFeedback)
    ? workerStatus.positionFeedback.slice(0, 6)
    : [];

  const aiConversationRows = Array.isArray(workerStatus?.aiConversations)
    ? workerStatus.aiConversations.slice(0, 10)
    : [];

  const latestAiConversation = aiConversationRows[0] || null;
  const deepseekFreshnessMs = workerStatus?.aiLastHeartbeatAt
    ? Date.now() - new Date(workerStatus.aiLastHeartbeatAt).getTime()
    : Number.POSITIVE_INFINITY;
  const deepseekFresh = Number.isFinite(deepseekFreshnessMs)
    && deepseekFreshnessMs <= Number(workerStatus?.aiFreshnessMaxMs || 5 * 60_000);

  const workerCycleAgeSec = workerStatus?.lastRunAt
    ? Math.max(0, Math.round((Date.now() - new Date(workerStatus.lastRunAt).getTime()) / 1000))
    : null;
  const workerHealth = workerStatus?.running
    ? workerCycleAgeSec !== null && workerCycleAgeSec <= Number(workerStatus?.intervalSec || 60) * 2
      ? 'HEALTHY'
      : 'STALE'
    : 'OFF';
  const workerNextCycleSec = workerCycleAgeSec === null
    ? null
    : Math.max(0, Number(workerStatus?.intervalSec || 60) - workerCycleAgeSec);
  const workerRejectRows = Array.isArray(workerStatus?.symbolRejects)
    ? workerStatus.symbolRejects.slice(0, 5).map((row: any) => {
        const symbol = String(row?.symbol || '—').toUpperCase();
        const base = symbol.replace('USDT', '');
        const coin = coins.find((c) => c.symbol === base);
        const aiRow = latestAiBySymbol.get(symbol);
        const brain = symbolBrains.find((s) => s.symbol === symbol);
        return {
          symbol,
          reason: String(row?.reason || 'blocked').replace(/^ai_no_trade:/, '').replace(/_/g, ' '),
          price: Number(coin?.price || 0),
          change: Number(coin?.change || 0),
          confidence: Number((aiRow as any)?.confidence || brain?.confidence || 0),
          expectedR: Number((aiRow as any)?.expectedRMultiple || 0),
          edge: Number((aiRow as any)?.expectedNetEdgeBps || 0),
          decision: String((aiRow as any)?.decision || 'NO_TRADE').toUpperCase(),
          gate: String((aiRow as any)?.gateResult || 'blocked').toUpperCase(),
          reviewedAt: String((aiRow as any)?.ts || ''),
          scannerState: String(brain?.state || 'SCANNING'),
        };
      })
    : [];
  const workerArmedTrigger = workerStatus?.armedTrigger || null;
  const compactWorkerReason = useMemo(() => {
    const raw = String(workerStatus?.lastReasonHuman || workerStatus?.lastReason || 'Waiting for worker cycle.');
    if (workerRejectRows.length > 1) {
      const normalizedReasons = workerRejectRows.map((row) => row.reason.replace(/\s+/g, ' ').trim());
      const shared = normalizedReasons.find((reason) => reason && normalizedReasons.every((candidate) => candidate === reason));
      return shared
        ? `No trade. Shared blocker: ${shared}`
        : `No trade. ${workerRejectRows.length} symbols blocked this cycle.`;
    }
    return raw
      .replace(/^No trade this cycle\.\s*/i, 'No trade. ')
      .replace(/\s*•\s*/g, ' | ');
  }, [workerStatus?.lastReasonHuman, workerStatus?.lastReason, workerRejectRows]);

  const marketPulseRows = useMemo(() => {
    const rejectMap = new Map<string, string>();
    for (const r of (workerStatus?.symbolRejects || [])) {
      if (r?.symbol) rejectMap.set(String(r.symbol), String(r.reason || 'blocked'));
    }

    return EXEC_SYMBOLS.map((symbol) => {
      const base = symbol.replace('USDT', '');
      const coin = coins.find((c) => c.symbol === base);
      const hasPosition = livePositions.some((p) => p.symbol === symbol);
      const blocked = rejectMap.has(symbol);
      const isFocus = tradeFocus.symbol === symbol;
      const state = hasPosition ? 'OPEN' : isFocus ? 'FOCUS' : blocked ? 'BLOCKED' : Number(market.regimeConfidence || 0) >= 60 ? 'ARMED' : 'SCAN';
      return {
        symbol,
        base,
        price: Number(coin?.price || 0),
        change: Number(coin?.change || 0),
        state,
        focused: isFocus,
      };
    });
  }, [workerStatus?.symbolRejects, coins, livePositions, tradeFocus.symbol, market.regimeConfidence]);

  const marketOverviewRows = useMemo(() => {
    const pulseByBase = new Map(marketPulseRows.map((row) => [row.base, row]));
    return coins.slice(0, 5).map((coin) => {
      const pulse = pulseByBase.get(coin.symbol);
      const brain = symbolBrains.find((row) => row.symbol === `${coin.symbol}USDT`);
      const symbol = `${coin.symbol}USDT`;
      const candidate = candidateBySymbol.get(symbol);
      const state = pulse?.state || candidate?.state || brain?.state || (coin.symbol === 'SOL' ? 'WATCH' : 'SCAN');
      const strength = Math.max(8, Math.min(100, Number(candidate?.qualityScore || 0) || 50 + Number(coin.change || 0) * 10));
      const aiRow = latestAiBySymbol.get(symbol);
      const decisionText = candidate
        ? `${candidate.bias} ${String(candidate.setupType || 'setup').replace(/_/g, ' ')} • Q${candidate.qualityScore}`
        : String((aiRow as any)?.decision || (state === 'WATCH' ? 'WATCH' : decision.label || 'NO_TRADE')).toUpperCase();
      return {
        symbol: coin.symbol,
        fullSymbol: symbol,
        price: Number(coin.price || 0),
        change: Number(coin.change || 0),
        state,
        focused: Boolean(pulse?.focused || tradeFocus.symbol === symbol),
        strength,
        decisionText,
        qualityScore: Number(candidate?.qualityScore || 0),
        setupType: candidate?.setupType || '',
        bias: candidate?.bias || 'WATCH',
      };
    });
  }, [coins, marketPulseRows, symbolBrains, candidateBySymbol, latestAiBySymbol, decision.label, tradeFocus.symbol]);

  const marketQuality = useMemo(() => {
    const regimeConfidence = Number(market.regimeConfidence || 0);
    const liquidity = String(market.liquidityState || 'unknown').toLowerCase();
    const volatility = String(market.volatilityState || 'unknown').toLowerCase();
    const score = Math.max(0, Math.min(100,
      Math.round(
        (regimeConfidence * 0.45)
        + (liquidity === 'good' ? 30 : liquidity === 'acceptable' ? 20 : 8)
        + (volatility === 'low' ? 25 : volatility === 'normal' ? 18 : 7)
      )
    ));
    return {
      score,
      label: score >= 75 ? 'Clean tape' : score >= 60 ? 'Selective' : 'Wait mode',
    };
  }, [market.regimeConfidence, market.liquidityState, market.volatilityState]);

  const manualTradePreview = useMemo(() => {
    const base = manualSymbol.replace('USDT', '');
    const coin = coins.find((c) => c.symbol === base);
    const marketPrice = Number(coin?.price || 0);
    const limitPrice = Number(manualPrice || 0);
    const entry = manualType === 'LIMIT' && limitPrice > 0 ? limitPrice : marketPrice;
    const stop = Number(manualStopLoss || 0);
    const target = Number(manualTakeProfit || 0);
    const qty = Number(manualQty || 0);
    const isBuy = manualSide === 'BUY';
    const riskPerUnit = entry > 0 && stop > 0 ? Math.abs(entry - stop) : 0;
    const rewardPerUnit = entry > 0 && target > 0 ? Math.abs(target - entry) : 0;
    const rr = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0;
    const stopAligned = !stop || !entry ? false : isBuy ? stop < entry : stop > entry;
    const targetAligned = !target || !entry ? false : isBuy ? target > entry : target < entry;
    const riskUsd = qty > 0 && riskPerUnit > 0 ? qty * riskPerUnit : 0;
    const notional = qty > 0 && entry > 0 ? qty * entry : 0;
    const ready = Boolean(manualAdminKey.trim() && manualSymbol && stopAligned && targetAligned && Number(manualConfidence || 0) >= 1);
    return {
      base,
      marketPrice,
      entry,
      rr,
      riskUsd,
      notional,
      stopAligned,
      targetAligned,
      ready,
      posture: ready ? 'Ticket armed' : 'Needs risk plan',
      priceText: entry > 0 ? `$${entry.toFixed(entry < 1 ? 5 : 2)}` : '—',
      rrText: rr > 0 && Number.isFinite(rr) ? `${rr.toFixed(2)}R` : '—',
      riskText: riskUsd > 0 && Number.isFinite(riskUsd) ? signedMoney(-riskUsd) : 'size optional',
      notionalText: notional > 0 && Number.isFinite(notional) ? `$${notional.toFixed(2)}` : '—',
    };
  }, [manualSymbol, manualPrice, manualType, manualStopLoss, manualTakeProfit, manualQty, manualSide, manualAdminKey, manualConfidence, coins]);

  const readinessScore = useMemo(() => {
    const scoreParts = [
      (market.regimeConfidence || 0) >= 60 ? 20 : Math.round((Number(market.regimeConfidence || 0) / 60) * 20),
      String(market.liquidityState || '').toLowerCase() === 'good' ? 20 : String(market.liquidityState || '').toLowerCase() === 'acceptable' ? 12 : 5,
      String(market.volatilityState || '').toLowerCase() === 'low' ? 20 : String(market.volatilityState || '').toLowerCase() === 'normal' ? 14 : 5,
      risks.length === 0 ? 20 : Math.max(5, 20 - risks.length * 7),
      decision.label === 'TRADE' ? 20 : decision.state === 'TRIGGER_ARMED' ? 12 : 6,
    ];
    return Math.max(0, Math.min(100, scoreParts.reduce((a, b) => a + b, 0)));
  }, [market.regimeConfidence, market.liquidityState, market.volatilityState, risks.length, decision.label, decision.state]);

  const riskCapacity = useMemo(() => {
    const maxTrades = Number(riskSettings.maxTradesPerDay ?? 5);

    // Prefer backend portfolio counter (authoritative) and fallback to deduped journal count.
    const backendTradesToday = Number((portfolio as any)?.tradesToday);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dedupTradeOpens = new Set(
      journal
        .filter((j) => j.type === 'trade_open')
        .filter((j) => {
          const t = new Date(String(j.ts || '')).getTime();
          return Number.isFinite(t) && t >= startOfDay.getTime();
        })
        .map((j) => `${j.ts}|${j.symbol || ''}|${j.side || ''}|${j.entry || ''}|${j.qty || ''}`)
    );
    const rawTradesToday = Number.isFinite(backendTradesToday) && backendTradesToday >= 0
      ? backendTradesToday
      : dedupTradeOpens.size;
    const tradesToday = Math.min(maxTrades, Math.max(0, rawTradesToday));

    const dailyLossLimitPct = Number(riskSettings.maxDailyLossPct ?? 3);
    const dayPnl = Number(account.previousDayPnl || 0);
    const dailyLossUsedPct = dayPnl < 0 && walletBalance > 0
      ? Math.min(100, (Math.abs(dayPnl) / walletBalance) * 100)
      : 0;
    const tradeSlotsLeft = Math.max(0, maxTrades - tradesToday);
    const cooldownUntilTs = portfolio?.cooldownUntil ? Date.parse(portfolio.cooldownUntil) : NaN;
    const cooldownMinutes = Number.isFinite(cooldownUntilTs) && cooldownUntilTs > Date.now()
      ? Math.ceil((cooldownUntilTs - Date.now()) / 60000)
      : 0;

    return {
      maxTrades,
      tradesToday,
      tradeSlotsLeft,
      dailyLossLimitPct,
      dailyLossUsedPct,
      lossCapacityLeftPct: Math.max(0, dailyLossLimitPct - dailyLossUsedPct),
      openPositions: livePositions.length,
      maxOpenPositions: Number(workerStatus?.policy?.maxOpenPositions || 1),
      cooldownMinutes,
    };
  }, [riskSettings.maxTradesPerDay, riskSettings.maxDailyLossPct, journal, account.previousDayPnl, walletBalance, portfolio?.cooldownUntil, livePositions.length, workerStatus?.policy?.maxOpenPositions]);

  const heatMatrixRows = useMemo(() => {
    const rejectMap = new Map<string, string>();
    for (const r of (workerStatus?.symbolRejects || [])) {
      if (r?.symbol) rejectMap.set(String(r.symbol), String(r.reason || 'blocked'));
    }

    return EXEC_SYMBOLS.map((symbol) => {
      const base = symbol.replace('USDT', '');
      const coin = coins.find((c) => c.symbol === base);
      const change = Number(coin?.change || 0);
      const structure = Math.min(100, Math.max(0, 50 + Math.round(change * 5)));
      const momentum = Math.min(100, Math.max(0, 50 + Math.round(change * 7)));
      const volume = (market.regimeConfidence || 0);
      const risk = Math.max(0, 100 - (risks.length * 20) - (String(market.volatilityState || '').toLowerCase() === 'high' ? 25 : 0));
      const blocked = rejectMap.has(symbol);
      const gate = blocked ? 25 : decision.label === 'TRADE' ? 85 : 45;
      return { symbol, structure, momentum, volume, risk, gate, blocked };
    });
  }, [workerStatus?.symbolRejects, coins, market.regimeConfidence, market.volatilityState, risks.length, decision.label]);

  const timelineEvents = useMemo(() => {
    const cycleRows = aiDecisionRows.map((r) => ({
      ts: r.ts,
      label: `${r.symbol} ${r.decision}`,
      detail: `${r.reason} • confidence ${r.confidence}%`,
      tone: r.decision === 'TRADE' ? 'text-emerald-300' : r.decision === 'NO_TRADE' ? 'text-amber-300' : 'text-red-300',
    }));
    const actionRows = (workerStatus?.lastRunAt && workerStatus?.lastAction)
      ? [{
          ts: workerStatus.lastRunAt,
          label: `Worker ${String(workerStatus.lastAction).toUpperCase()}`,
          detail: compactWorkerReason,
          tone: 'text-cyan-300',
        }]
      : [];

    return [...actionRows, ...cycleRows]
      .sort((a, b) => new Date(String(b.ts || 0)).getTime() - new Date(String(a.ts || 0)).getTime())
      .slice(0, 12);
  }, [aiDecisionRows, workerStatus?.lastRunAt, workerStatus?.lastAction, compactWorkerReason]);

  const lifecycleBrief = useMemo(() => {
    const latestTrade = journal.find((j) => j.type === 'trade_open' || j.type === 'trade_close');
    const blockedCount = workerRejectRows.length;
    const reviewRows = (workerRejectRows.length ? workerRejectRows : aiDecisionRows).slice(0, 5).map((row: any) => ({
      symbol: String(row.symbol || '—').toUpperCase(),
      state: String(row.decision || row.scannerState || 'REVIEWED').toUpperCase(),
      reason: String(row.reason || 'No clean trigger yet.').replace(/^AI says no trade:\s*/i, ''),
      confidence: Number(row.confidence || 0),
      price: Number(row.price || 0),
      change: Number(row.change || 0),
    }));

    return {
      headline: latestTrade
        ? `${String(latestTrade.type).replace('trade_', '').toUpperCase()} ${String(latestTrade.symbol || 'trade')}`
        : workerStatus?.lastAction
          ? `${String(workerStatus.lastAction).toUpperCase()} cycle complete`
          : 'Waiting for first cycle',
      operatorReadout: compactWorkerReason,
      action: String(workerStatus?.lastAction || 'idle').toUpperCase(),
      focus: tradeFocus.symbol,
      blockedCount,
      reviewedCount: reviewRows.length,
      lastTs: String(workerStatus?.lastRunAt || aiDecisionRows[0]?.ts || ''),
      reviewRows,
    };
  }, [journal, workerRejectRows, aiDecisionRows, workerStatus?.lastAction, workerStatus?.lastRunAt, compactWorkerReason, tradeFocus.symbol]);

  const replayCursor = timelineEvents[Math.min(replayIndex, Math.max(0, timelineEvents.length - 1))] || null;
  const visibleOpenOrders = useMemo(() => {
    if (openOrderFilter === 'ALL') return openOrders;
    return openOrders.filter((o) => o.symbol === openOrderFilter);
  }, [openOrders, openOrderFilter]);


  const postTradeQuality = useMemo(() => {
    const rows = recentTradeRows.slice(0, 8);
    const pnls = rows.map((r) => Number(r.pnl || 0));
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p < 0);
    const avgPnl = rows.length ? pnls.reduce((sum, p) => sum + p, 0) / rows.length : 0;
    const netPnl = pnls.reduce((sum, p) => sum + p, 0);
    const grossWin = wins.reduce((sum, p) => sum + p, 0);
    const grossLoss = Math.abs(losses.reduce((sum, p) => sum + p, 0));
    const bestTrade = pnls.length ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length ? Math.min(...pnls) : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;
    let equity = 0;
    let peak = 0;
    let maxDrawdownApprox = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    for (const pnl of pnls) {
      equity += pnl;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDrawdownApprox) maxDrawdownApprox = dd;
      if (pnl > 0) {
        currentWinStreak += 1;
        currentLossStreak = 0;
      } else if (pnl < 0) {
        currentLossStreak += 1;
        currentWinStreak = 0;
      }
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    }
    const ruleAdherence = Math.max(50, 100 - risks.length * 10 - (decision.label === 'NO_TRADE' ? 5 : 0));
    return {
      sample: rows.length,
      winRate: rows.length ? Math.round((wins.length / rows.length) * 100) : 0,
      losses: losses.length,
      avgPnl,
      netPnl,
      grossWin,
      grossLoss,
      bestTrade,
      worstTrade,
      profitFactor,
      maxDrawdownApprox,
      maxWinStreak,
      maxLossStreak,
      slippage: 'n/a',
      rrAchieved: rows.length ? (avgPnl > 0 ? '>= 1.2 (estimated)' : '< 1.0 (estimated)') : 'n/a',
      ruleAdherence,
    };
  }, [recentTradeRows, risks.length, decision.label]);

  const performanceBrief = useMemo(() => {
    const rows = recentTradeRows.slice(0, 8);
    const last = rows[0];
    const net = Number(postTradeQuality.netPnl || 0);
    const profitFactor = Number(postTradeQuality.profitFactor || 0);
    const health = net > 0 && profitFactor >= 1.2
      ? 'EDGE POSITIVE'
      : net > 0
        ? 'EDGE MIXED'
        : rows.length
          ? 'DEFENSIVE'
          : 'WAITING';
    const tone = health === 'EDGE POSITIVE' ? 'green' : health === 'EDGE MIXED' ? 'cyan' : health === 'DEFENSIVE' ? 'amber' : 'cyan';
    const wins = rows.filter((row) => Number(row.pnl || 0) > 0).length;
    const losses = rows.filter((row) => Number(row.pnl || 0) < 0).length;
    const message = rows.length
      ? `${wins} wins / ${losses} losses in the latest ${rows.length} closes. Last close: ${last?.symbol || '—'} ${signedMoney(Number(last?.pnl || 0))}.`
      : 'No closed trades yet. Performance will populate after the first completed trade.';
    return {
      health,
      tone,
      message,
      lastSymbol: last?.symbol || '—',
      lastPnl: signedMoney(Number(last?.pnl || 0)),
    };
  }, [recentTradeRows, postTradeQuality.netPnl, postTradeQuality.profitFactor]);

  const deepseekPlaybook = useMemo(() => {
    const ds = briefing?.deepseekDecision || {};
    const narrative = ds.market_narrative || decision.reasoningSummary;
    const bias = ds.bias || (decision.chosenSide === 'BUY' ? 'LONG' : decision.chosenSide === 'SELL' ? 'SHORT' : 'NEUTRAL');
    const mustHappen = (decision.triggerConditions || []).slice(0, 3);
    const cancelIf = (ds.cancel_if && ds.cancel_if.length ? ds.cancel_if : decision.invalidators || []).slice(0, 3);
    return { narrative, bias, mustHappen, cancelIf };
  }, [briefing?.deepseekDecision, decision.reasoningSummary, decision.chosenSide, decision.triggerConditions, decision.invalidators]);

  const deepseekScenarios = useMemo(() => {
    const ds = briefing?.deepseekDecision || {};
    const fromModel = Array.isArray(ds.scenarios) ? ds.scenarios.filter(Boolean).slice(0, 3) : [];
    if (fromModel.length > 0) {
      return fromModel.map((s: any, idx: number) => ({
        name: s?.name || (idx === 0 ? 'Base Case' : idx === 1 ? 'Bull Breakout' : 'Bear Failure'),
        trigger: s?.trigger || 'Await structure confirmation.',
        invalidation: s?.invalidation || 'Invalid if structure breaks.',
        expected_rr: s?.expected_rr || String(decision.entryPlan?.rr || '>= 1.5'),
        action: s?.action || 'WAIT',
      }));
    }
    const zone = String(decision.entryPlan?.zone || '—');
    const stop = String(decision.entryPlan?.stop || '—');
    return [
      {
        name: 'Base Case',
        trigger: `15m close + hold in ${zone} with momentum/volume expansion.`,
        invalidation: `Price loses support and closes below stop reference ${stop}.`,
        expected_rr: String(decision.entryPlan?.rr || '>= 1.5'),
        action: decision.label === 'TRADE' ? 'PREPARE' : 'WAIT',
      },
      {
        name: 'Bull Breakout',
        trigger: 'Consecutive higher highs with expanding volume above trigger zone.',
        invalidation: 'Breakout retest fails with weak follow-through volume.',
        expected_rr: '>= 1.8',
        action: decision.label === 'TRADE' ? 'EXECUTE' : 'PREPARE',
      },
      {
        name: 'Bear Failure',
        trigger: 'Failed breakout and rejection at resistance with negative momentum.',
        invalidation: 'Recovery above trigger zone with renewed expansion.',
        expected_rr: '>= 1.4',
        action: 'WAIT',
      },
    ];
  }, [briefing?.deepseekDecision, decision.entryPlan, decision.label]);

  const deepseekRiskCoach = useMemo(() => {
    const ds = briefing?.deepseekDecision?.risk_coach;
    const blocker = ds?.blocker || triggerDiagnostics.blockerNow || reasonBreakdown.headline;
    const fixNext = ds?.fix_next?.length
      ? ds.fix_next.slice(0, 3)
      : [
          'Wait for clean 15m confirmation + hold in the entry zone.',
          'Require momentum + volume expansion to validate continuation.',
          'Keep risk gates unchanged; avoid forcing entries during unclear structure.',
        ];
    return { blocker, fixNext };
  }, [briefing?.deepseekDecision, triggerDiagnostics.blockerNow, reasonBreakdown.headline]);

  const deepseekBriefing = useMemo(() => {
    const latest = latestAiConversation;
    const intelligenceBrief = tradeIntelligence?.portfolioBrief;
    const latestSymbol = String(latest?.symbol || tradeFocus.symbol || 'the watchlist').toUpperCase();
    const latestResponse = String(latest?.responseSummary || decision.reasoningSummary || '');
    const totalUnrealized = managedPositionRows.reduce((sum, row) => sum + Number(row.unrealized || 0), 0);
    const protectedCount = managedPositionRows.filter((row) => row.slStatus === 'Break-even' || row.slStatus === 'Locked Profit').length;
    const missingStopCount = managedPositionRows.filter((row) => Number(row.stop || 0) <= 0).length;
    const pressureCount = managedPositionRows.filter((row) => Number(row.unrealized || 0) < 0).length;
    const managementFocus = managedPositionRows
      .slice()
      .sort((a, b) => {
        if (Number(a.stop || 0) <= 0 && Number(b.stop || 0) > 0) return -1;
        if (Number(b.stop || 0) <= 0 && Number(a.stop || 0) > 0) return 1;
        return Math.abs(Number(b.unrealized || 0)) - Math.abs(Number(a.unrealized || 0));
      })[0];
    const blocker = latestResponse
      .replace(/^NO_TRADE\s*\(/i, '')
      .replace(/\)$/g, '')
      .replace(/_/g, ' ')
      .trim();
    const stance = intelligenceBrief?.stance || (managedPositionRows.length
      ? `I am managing ${managedPositionRows.length} open ${managedPositionRows.length === 1 ? 'position' : 'positions'} with net unrealized P&L at ${signedMoney(totalUnrealized)}.`
      : decision.label === 'TRADE'
        ? `I have a tradable setup forming on ${tradeFocus.symbol}.`
        : `I am protecting capital and keeping ${latestSymbol} on watch.`);
    const plainReason = intelligenceBrief?.bestOpportunity || (managedPositionRows.length
      ? `${managementFocus?.symbol || 'Portfolio'} is the current management focus. ${managementFocus?.nextAction || 'Keep monitoring open exposure and do not add risk without confirmation.'}`
      : blocker || deepseekRiskCoach.blocker || 'The setup is not clean enough to justify risk yet.');
    const closest = aiConversationRows.slice(0, 5).map((row: any) => ({
      symbol: String(row.symbol || 'MARKET').toUpperCase(),
      confidence: Number(row.confidence || 0),
      verdict: String(row.responseSummary || 'Monitoring').replace(/^NO_TRADE\s*\(/i, '').replace(/\)$/g, ''),
      delta: String(row.delta || 'no change'),
    }));
    const topCandidate = closest
      .slice()
      .sort((a, b) => b.confidence - a.confidence)[0];

    return {
      stance,
      plainReason,
      topCandidate,
      closest,
      next: intelligenceBrief?.action || (managedPositionRows.length
        ? missingStopCount > 0
          ? `${missingStopCount} open ${missingStopCount === 1 ? 'position needs' : 'positions need'} a protective stop before any new risk is considered.`
          : pressureCount > 0
            ? `${pressureCount} position${pressureCount === 1 ? ' is' : 's are'} under pressure. Respect invalidation; do not widen stops.`
            : `Manage winners: ${protectedCount}/${managedPositionRows.length} positions have BE or locked-profit protection. Watch for partial TP or trail conditions.`
        : decision.label === 'TRADE'
          ? `If ${tradeFocus.symbol} holds ${tradeFocus.entryZone} and RR stays near ${tradeFocus.expectedR}, I can allow execution.`
          : `I need regime confidence above the threshold, clean structure, and confirmation around ${tradeFocus.entryZone} before approving risk.`),
      riskTone: intelligenceBrief?.mainRisk || (managedPositionRows.length
        ? `${protectedCount}/${managedPositionRows.length} protected by BE/locked stops. ${risks.length ? `Active risk note: ${risks.slice(0, 2).join(', ')}.` : 'No major platform risk flags currently reported.'}`
        : risks.length
          ? `Risk note: ${risks.slice(0, 2).join(', ')}.`
          : 'Risk note: no major risk flags currently reported.'),
    };
  }, [
    latestAiConversation,
    tradeIntelligence?.portfolioBrief,
    tradeFocus.symbol,
    tradeFocus.entryZone,
    tradeFocus.expectedR,
    decision.label,
    decision.reasoningSummary,
    deepseekRiskCoach.blocker,
    aiConversationRows,
    risks,
    managedPositionRows,
  ]);

  const deepseekOperatorFeed = useMemo(() => {
    const rows = aiConversationRows.slice(0, 6).map((r: any) => ({
      ts: r.ts,
      text: `${String(r.symbol || 'Market')}: ${String(r.responseSummary || 'Monitoring setup')}`,
      delta: String(r.delta || ''),
    }));
    if (rows.length) return rows;
    return [
      {
        ts: new Date().toISOString(),
        text: decision.label === 'TRADE'
          ? 'Execution window open. Waiting for final candle confirmation before entry.'
          : 'No clean setup yet. Monitoring structure, momentum, and volume for valid trigger.',
        delta: 'baseline',
      },
    ];
  }, [aiConversationRows, decision.label]);

  const deepseekLearningLoop = useMemo(() => {
    const rows = recentTradeRows.slice(0, 10);
    if (!rows.length) {
      return [{
        lesson: 'No recent closed trades to learn from yet.',
        tweak: 'Keep collecting samples before changing live rules.',
      }];
    }
    const losses = rows.filter((r) => Number(r.pnl || 0) < 0);
    const wins = rows.filter((r) => Number(r.pnl || 0) > 0);
    const avgLoss = losses.length ? losses.reduce((s, r) => s + Number(r.pnl || 0), 0) / losses.length : 0;
    const avgWin = wins.length ? wins.reduce((s, r) => s + Number(r.pnl || 0), 0) / wins.length : 0;
    return [
      {
        lesson: `Last ${rows.length} closes: ${wins.length} wins / ${losses.length} losses.`,
        tweak: 'Adjust only one filter at a time; validate changes in paper mode first.',
      },
      {
        lesson: losses.length ? `Average loss: ${signedMoney(avgLoss)}.` : 'No losses in current sample.',
        tweak: 'If losses cluster in squeeze/unclear structure, tighten breakout confirmation filter.',
      },
      {
        lesson: wins.length ? `Average win: ${signedMoney(avgWin)}.` : 'No wins in current sample yet.',
        tweak: 'When wins appear with strong volume expansion, prioritize that condition in entries.',
      },
    ];
  }, [recentTradeRows]);

  const filteredFeed = useMemo(() => {
    const classify = (evt: string) => {
      const s = evt.toLowerCase();
      if (s.includes('risk') || s.includes('cooldown') || s.includes('invalid')) return 'RISK';
      if (s.includes('opened') || s.includes('closed') || s.includes('action:')) return 'EXECUTION';
      return 'DECISIONS';
    };

    if (feedFilter === 'ALL') return liveFeed;
    return liveFeed.filter((evt) => classify(evt) === feedFilter);
  }, [liveFeed, feedFilter]);

  return (
    <>
      <Head>
        <title>HELIX.ONE | DeepSeek Trading Command</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="https://unpkg.com/react-grid-layout/css/styles.css" />
        <link rel="stylesheet" href="https://unpkg.com/react-resizable/css/styles.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="helix-shell min-h-screen text-slate-100" style={{ fontFamily: 'IBM Plex Sans, Space Grotesk, sans-serif' }}>
        <div className="mx-auto w-full max-w-[1420px] px-2 sm:px-3 md:px-5 lg:px-6 py-3 sm:py-4 md:py-5">
          <header className="helix-command-bar rounded-2xl border border-cyan-300/15 bg-slate-950/70 backdrop-blur-md p-3 sm:p-4 md:p-5 shadow-2xl shadow-cyan-950/30">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-2xl sm:text-3xl font-bold tracking-wide" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  <span className="text-emerald-300">HELIX</span>.ONE
                </div>
                <StatusPill tone={liveConnected ? 'good' : 'bad'}>{liveConnected ? 'LIVE' : 'OFFLINE'}</StatusPill>
                <StatusPill tone={liveConnected ? 'good' : 'bad'}>{liveConnected ? 'CONNECTED' : 'DISCONNECTED'}</StatusPill>
                <StatusPill tone={paperTradingEnabled ? 'bad' : 'good'}>{paperTradingEnabled ? 'PAPER MODE' : 'LIVE EXECUTION'}</StatusPill>
                <div className="text-slate-400 text-sm">Last update: {lastUpdated || '—'}</div>
              </div>
              <div className="flex items-center gap-3">
                <a href="/settings" className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-medium">Settings</a>
              </div>
            </div>
          </header>

          <main className="mt-4 sm:mt-5 space-y-4 sm:space-y-5">
            {error && <div className="rounded-xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-red-100 text-sm">{error}</div>}
            {paperTradingEnabled && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-900/30 px-4 py-3 text-amber-100 text-sm">
                Paper Trading Mode is enabled. Orders are being simulated and are not sent to the exchange.
              </div>
            )}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-300">
              Ops Mode: <span className="font-semibold text-slate-100 uppercase">{journalMeta?.executionMode || (paperTradingEnabled ? 'paper' : 'live')}</span>
              <span className="mx-2 text-slate-500">•</span>
              Policy: {Number(journalMeta?.policy?.minLeverage ?? (riskSettings as any).minLeverage ?? 10)}x–{Number(journalMeta?.policy?.maxLeverage ?? riskSettings.maxLeverage ?? 20)}x, max {Number(journalMeta?.policy?.maxOpenPositions ?? (riskSettings as any).maxOpenPositions ?? 4)} open, {Number(journalMeta?.policy?.maxTradesPerDay ?? riskSettings.maxTradesPerDay ?? 8)} trades/day
            </div>

            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-1.5 sm:gap-2">
              <TopMetric label="Binance Wallet Balance" value={walletBalance > 0 ? money(walletBalance) : '—'} />
              <TopMetric label="Available Margin" value={availableMargin > 0 ? money(availableMargin) : '—'} tone="green" />
              <TopMetric label="Daily P&L" value={typeof account.previousDayPnl === 'number' ? signedMoney(account.previousDayPnl) : '—'} tone={Number(account.previousDayPnl || 0) >= 0 ? 'green' : 'red'} />
              <TopMetric label="Open Positions" value={String(openPositions)} />
              <div className={`rounded-xl border px-4 py-3 ${riskPosture.tone}`}>
                <div className="text-xs uppercase tracking-wider text-slate-300/80">Risk Posture</div>
                <div className="text-2xl font-semibold mt-1">{riskPosture.label}</div>
              </div>
            </section>

            <section className="helix-pulse-strip rounded-2xl border border-cyan-300/15 bg-slate-950/55 p-2.5 sm:p-3 shadow-xl shadow-black/25">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/80">Market Pulse</div>
                <div className="text-[11px] text-slate-400">Focus: <span className="font-semibold text-slate-100">{tradeFocus.symbol}</span> • Next worker cycle: <span className="text-cyan-200">{workerNextCycleSec === null ? '—' : `${workerNextCycleSec}s`}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {marketPulseRows.map((row) => (
                  <div key={row.symbol} className={`helix-pulse-card rounded-xl border px-3 py-2 ${row.focused ? 'border-cyan-300/60 bg-cyan-400/10' : row.state === 'BLOCKED' ? 'border-amber-300/20 bg-amber-500/[0.05]' : row.state === 'OPEN' ? 'border-emerald-300/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${row.state === 'OPEN' ? 'bg-emerald-300' : row.focused ? 'bg-cyan-300' : row.state === 'BLOCKED' ? 'bg-amber-300' : 'bg-slate-400'} helix-node-pulse`} />
                        <span className="font-semibold text-slate-100">{row.base}</span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">{row.state}</span>
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <div className="text-sm font-semibold text-slate-100">{row.price > 0 ? `$${row.price.toFixed(row.price < 1 ? 4 : 2)}` : '—'}</div>
                      <div className={`text-xs ${row.change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%</div>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded bg-white/10">
                      <div className={`h-full rounded ${row.change >= 0 ? 'bg-emerald-300' : 'bg-red-300'}`} style={{ width: `${Math.min(100, Math.max(12, Math.abs(row.change) * 12 + 22))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="sticky top-1 sm:top-2 z-20 rounded-2xl border border-cyan-400/30 bg-slate-900/85 backdrop-blur-md p-2.5 sm:p-3 md:p-4 shadow-lg shadow-black/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Decision</div>
                  <div className={`font-bold text-lg ${decision.label === 'TRADE' ? 'text-emerald-300' : 'text-amber-300'}`}>{decision.label}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Side</div>
                  <div className="font-semibold text-slate-100">{String(decision.chosenSide || 'N/A')}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Confidence / Readiness</div>
                  <div className="font-semibold text-slate-100">{decision.confidence}% / {readinessScore}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Invalidation</div>
                  <div className="font-semibold text-red-300">{decision.invalidators?.[0] || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Next Trigger</div>
                  <div className="font-semibold text-cyan-200">{String((decision as any).actionableNext || decision.triggerConditions?.[0] || 'Awaiting signal')}</div>
                </div>
              </div>
            </section>

            {showDisconnectedShell && (
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
                <Panel className="lg:col-span-2" title="System Status">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-lg font-semibold text-slate-100">Dashboard is waiting for live data</div>
                    <div className="mt-2 text-sm text-slate-300 leading-relaxed">
                      HELIX.ONE is rendering, but the trading engine is not connected right now. Instead of showing noisy empty-state operator panels, this view stays focused on connection status and active policy.
                    </div>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-wide text-slate-400">Engine</div>
                        <div className="mt-1 font-semibold text-red-300">Offline / disconnected</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-wide text-slate-400">Execution Mode</div>
                        <div className="mt-1 font-semibold text-slate-100 uppercase">{paperTradingEnabled ? 'paper' : 'live'}</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-wide text-slate-400">Leverage Policy</div>
                        <div className="mt-1 font-semibold text-slate-100">{Number((riskSettings as any).minLeverage ?? 10)}x – {Number(riskSettings.maxLeverage ?? 20)}x</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-wide text-slate-400">Trade Limits</div>
                        <div className="mt-1 font-semibold text-slate-100">{Number((riskSettings as any).maxOpenPositions ?? 4)} open • {Number(riskSettings.maxTradesPerDay ?? 8)} / day</div>
                      </div>
                    </div>
                  </div>
                </Panel>

                <Panel title="What to check">
                  <div className="space-y-2 text-sm text-slate-300">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">1. Confirm backend is running and reachable.</div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">2. Confirm Binance/API credentials are loaded in Settings.</div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">3. Reconnect the engine before relying on operator analytics.</div>
                  </div>
                </Panel>
              </section>
            )}

            {!showDisconnectedShell && (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-slate-300">
                  <div className="font-semibold text-slate-100">Dashboard layout builder active</div>
                  <div className="mt-1 text-slate-400">Drag from widget headers. Resize from any edge or corner. Layout snaps to grid and reflows neighboring widgets without overlap.</div>
                </div>

                <ResponsiveGridLayout
                  className={`helix-widget-grid ${layoutInteraction !== 'idle' ? `is-${layoutInteraction}` : ''}`}
                  layouts={widgetLayouts}
                  breakpoints={GRID_BREAKPOINTS}
                  cols={GRID_COLS}
                  rowHeight={GRID_ROW_HEIGHT}
                  margin={GRID_MARGIN}
                  containerPadding={[0, 0]}
                  draggableHandle=".widget-drag-handle"
                  draggableCancel="input,textarea,select,button,a,.no-drag"
                  resizeHandles={RESIZE_HANDLES}
                  isDraggable
                  isResizable
                  compactType="vertical"
                  preventCollision={false}
                  allowOverlap={false}
                  useCSSTransforms
                  measureBeforeMount={false}
                  onDragStart={() => setLayoutInteraction('dragging')}
                  onResizeStart={() => setLayoutInteraction('resizing')}
                  onDragStop={(_layout, _oldItem, _newItem, _placeholder, _event, _element) => setLayoutInteraction('idle')}
                  onResizeStop={(_layout, _oldItem, _newItem, _placeholder, _event, _element) => setLayoutInteraction('idle')}
                  onLayoutChange={(_currentLayout, allLayouts) => persistWidgetLayouts(allLayouts)}
                >
                  <div key="market-overview" data-grid={(widgetLayouts.lg || DEFAULT_WIDGET_LAYOUTS.lg).find((item) => item.i === "market-overview")}>
                    <Panel title="Market Overview" className="helix-market-panel relative h-full overflow-hidden">
                      <div className="widget-drag-handle mb-3 flex cursor-move items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 pr-10 text-[11px] uppercase tracking-wide text-slate-400">
                        <span>Drag to move</span><span>Resize edges or corners</span>
                      </div>
                      <div className="pointer-events-none absolute bottom-2 right-2 text-slate-500 text-lg leading-none">◢</div>
                      <div className="mb-3 rounded-2xl border border-cyan-300/20 bg-black/25 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">Market state</div>
                            <div className="mt-1 text-2xl font-black tracking-tight text-slate-50">
                              {String(market.regime || 'unclear').toUpperCase()}
                              <span className="ml-2 text-sm font-semibold text-slate-400">{Number(market.regimeConfidence || 0)}%</span>
                            </div>
                          </div>
                          <div className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${marketQuality.score >= 60 ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-300/30 bg-amber-400/10 text-amber-200'}`}>
                            {marketQuality.label}
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-lime-200" style={{ width: `${Math.max(3, marketQuality.score)}%` }} />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
                            <div className="text-slate-500">Liquidity</div>
                            <div className="mt-1 font-bold text-slate-100">{String(market.liquidityState || 'unknown').toUpperCase()}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
                            <div className="text-slate-500">Volatility</div>
                            <div className="mt-1 font-bold text-slate-100">{String(market.volatilityState || 'unknown').toUpperCase()}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
                            <div className="text-slate-500">Funding / OI</div>
                            <div className="mt-1 truncate font-bold text-slate-100">{formatFunding(market.funding, market.openInterest)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {marketOverviewRows.map((row) => (
                          <div key={row.symbol} className={`helix-market-row rounded-2xl border px-3 py-2.5 ${row.focused ? 'border-cyan-300/50 bg-cyan-400/10' : 'border-white/10 bg-white/[0.035]'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full ${row.change >= 0 ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.7)]' : 'bg-red-300 shadow-[0_0_12px_rgba(252,165,165,0.7)]'}`} />
                                  <span className="font-black tracking-wide text-slate-50">{row.symbol}</span>
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${row.focused ? 'border-cyan-300/40 text-cyan-100' : 'border-white/10 text-slate-400'}`}>{row.state}</span>
                                  {row.qualityScore > 0 && (
                                    <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200">Q{row.qualityScore}</span>
                                  )}
                                </div>
                                <div className="mt-1 text-[11px] text-slate-400">{row.decisionText} • live market snapshot</div>
                              </div>
                              <div className="text-right">
                                <div className="font-black text-slate-50">${row.price.toFixed(row.price < 1 ? 4 : 2)}</div>
                                <div className={`text-xs font-bold ${row.change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%</div>
                              </div>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div className={`h-full rounded-full ${row.change >= 0 ? 'bg-emerald-300' : 'bg-red-300'}`} style={{ width: `${row.strength}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Panel>
                  </div>

                  <div key="decision-summary" data-grid={(widgetLayouts.lg || DEFAULT_WIDGET_LAYOUTS.lg).find((item) => item.i === "decision-summary")}>
                    <Panel title="Trade Targeting HUD" className="helix-hud-panel">
                      <div className="widget-drag-handle mb-3 flex cursor-move items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
                        <span>Drag to move</span><span>Resize edges or corners</span>
                      </div>
                    <div className={`helix-targeting-hud rounded-2xl border px-4 py-4 ${decision.label === 'TRADE' ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-cyan-400/30 bg-cyan-500/[0.06]'}`}>
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/80">Current Target</div>
                          <div className="mt-1 flex flex-wrap items-center gap-3">
                            <span className="text-4xl font-bold tracking-tight text-slate-50" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{tradeFocus.symbol}</span>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tradeFocus.side === 'LONG' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : tradeFocus.side === 'SHORT' ? 'border-red-400/40 bg-red-500/10 text-red-200' : 'border-slate-400/30 bg-slate-500/10 text-slate-200'}`}>{tradeFocus.side}</span>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${decision.label === 'TRADE' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/40 bg-amber-500/10 text-amber-200'}`}>{decision.label}</span>
                            <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold capitalize text-cyan-100">{tradeFocus.setupType}</span>
                          </div>
                          {tradeFocus.thesis && <div className="mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-cyan-100">{tradeFocus.thesis}</div>}
                          <div className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{tradeFocus.waitFor}</div>
                        </div>
                        <div className="mx-auto flex h-32 w-32 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-black/30 helix-orb">
                          <div className="text-center">
                            <div className="text-3xl font-bold text-cyan-100">{tradeFocus.qualityScore || readinessScore}</div>
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">{tradeFocus.qualityScore ? 'quality' : 'readiness'}</div>
                            <div className="mt-1 text-xs text-slate-300">{tradeFocus.confidence}% conf</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <HudMetric label="Entry Zone" value={tradeFocus.entryZone} tone="cyan" />
                      <HudMetric label="Stop Loss" value={tradeFocus.stop} tone="red" />
                      <HudMetric label="Targets" value={tradeFocus.targets} tone="green" />
                      <HudMetric label="Expected R:R" value={tradeFocus.expectedR} tone="amber" />
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border border-cyan-300/15 bg-black/25 p-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70 mb-2">Awaiting Confirmation</div>
                        <div className="space-y-2 text-slate-200">
                          <div><span className="text-slate-400">Primary trigger:</span> {tradeFocus.waitFor}</div>
                          <div><span className="text-slate-400">Market:</span> {String(market.regime || 'unclear').toUpperCase()} • {String(market.liquidityState || 'unknown').toUpperCase()} liquidity • {String(market.volatilityState || 'unknown').toUpperCase()} volatility</div>
                          <div><span className="text-slate-400">Watched:</span> {tradeFocus.watched || 'Waiting for scanner'}</div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-cyan-300/15 bg-black/25 p-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70 mb-2">Risk Guardrails</div>
                        <div className="space-y-2 text-slate-200">
                          <div><span className="text-slate-400">Risk flags:</span> {risks.length ? risks.join(', ') : 'None'}</div>
                          <div><span className="text-slate-400">Invalidation:</span> {tradeFocus.invalidate || decision.invalidators?.[0] || '—'}</div>
                          <div><span className="text-slate-400">Edge:</span> {tradeFocus.edge} • AI decision {tradeFocus.journalDecision}</div>
                          <div><span className="text-slate-400">Limits:</span> {Number((riskSettings as any).minLeverage ?? 10)}x min / {Number(riskSettings.maxLeverage ?? 20)}x max • {Number((riskSettings as any).maxOpenPositions ?? 4)} max open</div>
                        </div>
                      </div>
                    </div>
                    {tradeFocus.qualityScores && (
                      <div className="mt-3 rounded-2xl border border-cyan-300/15 bg-black/25 p-3">
                        <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">Trade Quality Radar</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {Object.entries(tradeFocus.qualityScores).map(([label, value]) => {
                            const pct = Math.max(0, Math.min(100, Number(value || 0)));
                            return (
                              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-xs">
                                <div className="flex justify-between gap-2 text-slate-300">
                                  <span className="capitalize">{label.replace(/([A-Z])/g, ' $1')}</span>
                                  <span className="font-bold text-slate-100">{pct}</span>
                                </div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${Math.max(3, pct)}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {tradeCandidates.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                        {tradeCandidates.slice(0, 3).map((candidate) => (
                          <div key={candidate.symbol} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-slate-50">{candidate.symbol}</span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${candidate.state === 'READY' ? 'border-emerald-300/40 text-emerald-200' : candidate.state === 'BLOCKED' ? 'border-red-300/40 text-red-200' : 'border-amber-300/40 text-amber-200'}`}>{candidate.state}</span>
                            </div>
                            <div className="mt-2 text-slate-300">{candidate.bias} • {String(candidate.setupType || 'setup').replace(/_/g, ' ')}</div>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-slate-500">Quality</span>
                              <span className="font-black text-cyan-100">{candidate.qualityScore}/100</span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${Math.max(3, Number(candidate.qualityScore || 0))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    </Panel>
                  </div>

                  <div key="ops-snapshot" data-grid={(widgetLayouts.lg || DEFAULT_WIDGET_LAYOUTS.lg).find((item) => item.i === "ops-snapshot")}>
                    <Panel title="Worker Runtime + Risk Shield" className="helix-worker-panel">
                      <div className="widget-drag-handle mb-3 flex cursor-move items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
                        <span>Drag to move</span><span>Resize edges or corners</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <HudMetric label="Worker" value={workerHealth} tone={workerHealth === 'HEALTHY' ? 'green' : workerHealth === 'STALE' ? 'amber' : 'red'} />
                        <HudMetric label="Next Cycle" value={workerNextCycleSec === null ? '—' : `${workerNextCycleSec}s`} tone="cyan" />
                        <HudMetric label="AI Fresh" value={deepseekFresh ? 'YES' : 'NO'} tone={deepseekFresh ? 'green' : 'amber'} />
                        <HudMetric label="Source" value={String(workerStatus?.executionSource || 'HYBRID')} tone="cyan" />
                      </div>

                      <div className={`mt-3 rounded-xl border p-3 text-xs ${workerHealth === 'HEALTHY' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : workerHealth === 'STALE' ? 'border-amber-400/30 bg-amber-500/10 text-amber-100' : 'border-red-400/30 bg-red-500/10 text-red-100'}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-current/30 bg-black/25 helix-node-pulse">
                            <span className="text-lg">●</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">Worker {workerHealth}</span>
                              <span className="text-slate-300">{workerStatus?.lastRunAt ? new Date(workerStatus.lastRunAt).toLocaleTimeString() : 'not run yet'}</span>
                            </div>
                            <div className="mt-1 text-slate-200">Last action: <span className="font-semibold text-slate-100">{String(workerStatus?.lastAction || 'idle').toUpperCase()}</span></div>
                          </div>
                        </div>
                        <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2.5">
                          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Cycle Summary</div>
                          <div className="mt-1 break-words text-sm font-medium leading-relaxed text-slate-100">{compactWorkerReason}</div>
                        </div>
                        {workerRejectRows.length > 0 && (
                          <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {workerRejectRows.map((row) => (
                              <details key={`${row.symbol}-${row.reason}`} className="no-drag group rounded-lg border border-amber-300/20 bg-amber-500/[0.06] px-2.5 py-2 transition hover:border-amber-200/45 hover:bg-amber-500/[0.1]">
                                <summary className="cursor-pointer list-none">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-amber-100">{row.symbol}</span>
                                    <span className="rounded-full border border-amber-300/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-200">blocked</span>
                                  </div>
                                  <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-300">{row.reason}</div>
                                  <div className="mt-1 text-[10px] text-cyan-300 opacity-70">Click for diagnostics</div>
                                </summary>
                                <div className="mt-2 border-t border-white/10 pt-2 text-[11px] text-slate-300">
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <div>Price <span className="font-semibold text-slate-100">{row.price > 0 ? `$${row.price.toFixed(row.price < 1 ? 4 : 2)}` : '—'}</span></div>
                                    <div>Move <span className={row.change >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-red-300'}>{row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%</span></div>
                                    <div>AI Conf <span className="font-semibold text-slate-100">{row.confidence}%</span></div>
                                    <div>Gate <span className="font-semibold text-slate-100">{row.gate}</span></div>
                                    <div>Expected R <span className="font-semibold text-slate-100">{row.expectedR > 0 ? row.expectedR.toFixed(2) : '—'}</span></div>
                                    <div>Edge <span className="font-semibold text-slate-100">{row.edge ? `${row.edge.toFixed(1)} bps` : '—'}</span></div>
                                  </div>
                                  <div className="mt-2 rounded border border-white/10 bg-black/20 px-2 py-1.5">
                                    <div><span className="text-slate-500">Scanner:</span> {row.scannerState}</div>
                                    <div><span className="text-slate-500">Reviewed:</span> {row.reviewedAt ? new Date(row.reviewedAt).toLocaleTimeString() : '—'}</div>
                                    <div><span className="text-slate-500">Needs:</span> confidence, structure, and trigger quality to improve before risk is allowed.</div>
                                  </div>
                                </div>
                              </details>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">Execution State</div>
                          <div className="space-y-1 text-slate-300">
                            <div>AI gate: <span className="font-semibold text-slate-100">{String(workerStatus?.aiGateDecision || 'N/A')}</span></div>
                            <div>Final decision: <span className="font-semibold text-slate-100">{String(workerStatus?.finalExecutionDecision || 'NO_TRADE')}</span></div>
                            <div>Chosen side: <span className="font-semibold text-slate-100">{String(workerStatus?.chosenSide || 'N/A')}</span> via {String(workerStatus?.sideSource || 'N/A')}</div>
                            <div>Last signal: <span className="font-semibold text-slate-100">{workerStatus?.lastAutoSignalKey || '—'}</span></div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-emerald-300/15 bg-emerald-500/[0.04] p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">Risk Shield</div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${riskPosture.label === 'NORMAL' ? 'border-emerald-400/40 text-emerald-200' : 'border-amber-400/40 text-amber-200'}`}>{riskPosture.label}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-slate-300">
                            <div>Daily loss <span className="font-semibold text-slate-100">{Number(riskSettings.maxDailyLossPct ?? 3).toFixed(1)}%</span></div>
                            <div>Pos size <span className="font-semibold text-slate-100">{Number(riskSettings.maxPositionSizePct ?? 8).toFixed(0)}%</span></div>
                            <div>Leverage <span className="font-semibold text-slate-100">{Number((riskSettings as any).minLeverage ?? 10)}x-{Number(riskSettings.maxLeverage ?? 20)}x</span></div>
                            <div>Open <span className="font-semibold text-slate-100">{openPositions}/{Number(workerStatus?.policy?.maxOpenPositions ?? (riskSettings as any).maxOpenPositions ?? 4)}</span></div>
                            <div>Trades/day <span className="font-semibold text-slate-100">{Number(riskSettings.maxTradesPerDay ?? 8)}</span></div>
                            <div>Cooldown <span className="font-semibold text-slate-100">{Number(workerStatus?.policy?.cooldownMinutes ?? riskSettings.cooldownMinutes ?? 30)}m</span></div>
                          </div>
                        </div>
                      </div>

                      {workerArmedTrigger && (
                        <div className="mt-3 rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                          <div className="font-semibold">Armed trigger</div>
                          <div className="mt-1 break-words text-slate-200">{workerArmedTrigger.key}</div>
                          <div className="mt-1 text-slate-300">Cycles without fill: {Number(workerArmedTrigger.cyclesWithoutFill || 0)} / {Number(workerArmedTrigger.maxCycles || 0)}</div>
                        </div>
                      )}

                      {workerStatus?.fallbackMode && (
                        <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          Fallback mode active: rules are protecting execution while AI confidence or response quality is degraded.
                        </div>
                      )}
                    </Panel>
                  </div>

                  <div key="manual-trade" data-grid={(widgetLayouts.lg || DEFAULT_WIDGET_LAYOUTS.lg).find((item) => item.i === "manual-trade")}>
                    <Panel title="Manual Trade" className="helix-ticket-panel">
                      <div className="widget-drag-handle mb-3 flex cursor-move items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
                        <span>Drag to move</span><span>Resize edges or corners</span>
                      </div>
                      <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-black/25 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">Execution ticket</div>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-2xl font-black text-slate-50">{manualSymbol}</span>
                              <span className={`text-sm font-bold ${manualSide === 'BUY' ? 'text-emerald-300' : 'text-red-300'}`}>{manualSide}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-400">{manualType} entry preview: {manualTradePreview.priceText}</div>
                          </div>
                          <div className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${manualTradePreview.ready ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-300/30 bg-amber-400/10 text-amber-200'}`}>
                            {manualTradePreview.posture}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
                            <div className="text-slate-500">R:R</div>
                            <div className="mt-1 font-black text-slate-100">{manualTradePreview.rrText}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
                            <div className="text-slate-500">Risk</div>
                            <div className="mt-1 font-black text-slate-100">{manualTradePreview.riskText}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
                            <div className="text-slate-500">Notional</div>
                            <div className="mt-1 font-black text-slate-100">{manualTradePreview.notionalText}</div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <span className={`rounded-full border px-2 py-1 ${manualTradePreview.stopAligned ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-red-300/30 bg-red-400/10 text-red-200'}`}>Stop {manualTradePreview.stopAligned ? 'aligned' : 'needs check'}</span>
                          <span className={`rounded-full border px-2 py-1 ${manualTradePreview.targetAligned ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-red-300/30 bg-red-400/10 text-red-200'}`}>Target {manualTradePreview.targetAligned ? 'aligned' : 'needs check'}</span>
                          <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-cyan-100">Live mark ${manualTradePreview.marketPrice > 0 ? manualTradePreview.marketPrice.toFixed(manualTradePreview.marketPrice < 1 ? 5 : 2) : '—'}</span>
                        </div>
                      </div>

                      {manualFeedback && <div className={`mb-3 rounded-xl border px-3 py-2 text-xs ${manualFeedback.kind === 'success' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-red-400/40 bg-red-500/10 text-red-200'}`}>{manualFeedback.text}</div>}

                      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Admin Key</label>
                          <input type="password" value={manualAdminKey} onChange={(e) => setManualAdminKey(e.target.value)} className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10" placeholder="Enter admin key to unlock manual execution" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Symbol</label>
                          <select value={manualSymbol} onChange={(e) => setManualSymbol(e.target.value as any)} className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10">
                            {EXEC_SYMBOLS.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Side</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setManualSide('BUY')} className={`rounded-xl border px-3 py-2 text-sm font-black transition ${manualSide === 'BUY' ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-black/30 text-slate-300 hover:bg-white/5'}`}>BUY</button>
                            <button type="button" onClick={() => setManualSide('SELL')} className={`rounded-xl border px-3 py-2 text-sm font-black transition ${manualSide === 'SELL' ? 'border-red-300/50 bg-red-400/15 text-red-100' : 'border-white/10 bg-black/30 text-slate-300 hover:bg-white/5'}`}>SELL</button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Order Type</label>
                          <select value={manualType} onChange={(e) => setManualType(e.target.value as any)} className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10">
                            <option value="MARKET">MARKET</option>
                            <option value="LIMIT">LIMIT</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Leverage</label>
                          <input type="number" value={manualLeverage} onChange={(e) => setManualLeverage(e.target.value)} className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10" min="1" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Quantity</label>
                          <input type="number" value={manualQty} onChange={(e) => setManualQty(e.target.value)} className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10" placeholder="Optional" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Limit Price</label>
                          <input type="number" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10" placeholder={manualType === 'LIMIT' ? 'Required for LIMIT' : 'Only for LIMIT'} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Stop Loss</label>
                          <input type="number" value={manualStopLoss} onChange={(e) => setManualStopLoss(e.target.value)} className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Take Profit</label>
                          <input type="number" value={manualTakeProfit} onChange={(e) => setManualTakeProfit(e.target.value)} className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Confidence</label>
                          <input type="number" value={manualConfidence} onChange={(e) => setManualConfidence(e.target.value)} className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10" min="1" max="100" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Reason</label>
                          <textarea value={manualReason} onChange={(e) => setManualReason(e.target.value)} className="min-h-[92px] w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10" />
                        </div>
                        <div className="md:col-span-2">
                          <button onClick={submitManualTrade} disabled={manualSubmitting} className={`w-full rounded-2xl border px-4 py-3 text-sm font-black uppercase tracking-[0.2em] transition disabled:opacity-50 ${manualTradePreview.ready ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25' : 'border-amber-300/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15'}`}>
                          {manualSubmitting ? 'Submitting…' : 'Submit Manual Trade'}
                        </button>
                      </div>
                    </div>
                    </Panel>
                  </div>

                  <div key="open-positions" data-grid={(widgetLayouts.lg || DEFAULT_WIDGET_LAYOUTS.lg).find((item) => item.i === "open-positions")}>
                    <Panel title="Position Command Deck" className="helix-position-panel">
                      <div className="widget-drag-handle mb-3 flex cursor-move items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
                        <span>Drag to move</span><span>Resize edges or corners</span>
                      </div>
                      <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                        <HudMetric label="Active" value={String(activeTradeRows.length)} tone={activeTradeRows.length ? 'green' : 'cyan'} />
                        <HudMetric label="Unrealized" value={signedMoney(activeTradeRows.reduce((sum, t) => sum + Number(t.unrealized || 0), 0))} tone={activeTradeRows.reduce((sum, t) => sum + Number(t.unrealized || 0), 0) >= 0 ? 'green' : 'red'} />
                        <HudMetric label="Secured" value={signedMoney(activeTradeRows.reduce((sum, t) => sum + Number(t.secured || 0), 0))} tone="cyan" />
                        <HudMetric label="Risk Tools" value="BE+ / Runner / SL" tone="amber" />
                      </div>
                      <div className="mb-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.05] px-3 py-2 text-xs leading-relaxed text-cyan-100">
                        BE+ protects past raw entry by estimating exchange fees, slippage, and your safety buffer. Winner mode takes a partial, moves risk to BE+, then trails the remaining runner instead of killing the whole trade at the first target.
                      </div>

                      {activeTradeRows.length === 0 ? (
                        <div className="rounded-2xl border border-cyan-300/15 bg-black/25 p-5 text-center">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/[0.06] text-2xl text-cyan-100 helix-orb">◇</div>
                          <div className="mt-3 text-lg font-semibold text-slate-100">No active positions</div>
                          <div className="mt-2 text-sm leading-relaxed text-slate-400">
                            Position controls will arm automatically when Binance reports an open trade. You’ll get cost-aware BE+, partial profit controls, runner mode, and stop-loss adjustment here.
                          </div>
                          <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-300">BE+ waits for an open position</div>
                            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-300">Partial take-profit is disabled until size exists</div>
                            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-300">SL edits require Admin Key</div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeTradeRows.map((t, i) => (
                            <div key={`${t.ts}-${i}`} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xl font-bold text-slate-100">{t.symbol || '—'}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${String(t.side || '').toUpperCase() === 'LONG' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-red-400/40 bg-red-500/10 text-red-200'}`}>{String(t.side || '—').toUpperCase()}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${t.slStatus === 'Locked Profit' ? 'border-emerald-400/40 text-emerald-200' : t.slStatus === 'Break-even' ? 'border-cyan-400/40 text-cyan-200' : 'border-amber-400/40 text-amber-200'}`}>{t.slStatus}</span>
                                    {t.runnerMode && <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">Runner live</span>}
                                  </div>
                                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300 md:grid-cols-4">
                                    <div>Entry <span className="font-semibold text-slate-100">{typeof t.entry === 'number' ? t.entry.toFixed(2) : '—'}</span></div>
                                    <div>Mark <span className="font-semibold text-slate-100">{typeof t.mark === 'number' && t.mark > 0 ? t.mark.toFixed(2) : '—'}</span></div>
                                    <div>PnL <span className={`font-semibold ${t.pnlState === 'profit' ? 'text-emerald-300' : t.pnlState === 'loss' ? 'text-red-300' : 'text-slate-300'}`}>{signedMoney(Number(t.unrealized || 0))}</span></div>
                                    <div>Secured <span className={`font-semibold ${Number(t.secured || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signedMoney(Number(t.secured || 0))}</span></div>
                                  </div>
                                  <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-slate-300 sm:grid-cols-3">
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">BE+ stop <span className="font-semibold text-cyan-200">{Number(t.bePlusStop || 0) > 0 ? formatPrice(Number(t.bePlusStop)) : '—'}</span></div>
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">Runner <span className="font-semibold text-emerald-200">{winnersRunEnabled ? `${runnerPartialPct}% off @ ${runnerActivationR.toFixed(1)}R, trail ${runnerTrailPct.toFixed(2)}%` : 'Off'}</span></div>
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">Partial taken <span className="font-semibold text-slate-100">{Number(t.partialTakenPct || 0) > 0 ? `${Number(t.partialTakenPct).toFixed(0)}%` : 'None yet'}</span></div>
                                  </div>
                                </div>
                                <div className="min-w-[260px] rounded-xl border border-white/10 bg-white/[0.03] p-2">
                                  <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">Position Controls</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    <button onClick={() => secureBreakEven(String(t.symbol || ''))} className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20">Set BE+</button>
                                    <button onClick={() => takePartial(String(t.symbol || ''), 20)} className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20">TP 20%</button>
                                    <button onClick={() => takePartial(String(t.symbol || ''), 30)} className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20">TP 30%</button>
                                    <button onClick={() => closePosition(String(t.symbol || ''))} className="rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-200 hover:bg-red-500/20">Close</button>
                                  </div>
                                  <div className="mt-2 flex gap-1.5">
                                    <input type="number" value={slDrafts[String(t.symbol || '')] ?? (Number(t.stop || 0) > 0 ? Number(t.stop).toFixed(2) : '')} onChange={(e) => setSlDrafts((prev) => ({ ...prev, [String(t.symbol || '')]: e.target.value }))} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/30 px-2 py-1 text-[10px] text-slate-100" placeholder="New stop loss" />
                                    <button onClick={() => updateStopLoss(String(t.symbol || ''), Number(t.stop || 0))} className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20">Update SL</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                  </div>

                  <div key="deepseek-live" data-grid={(widgetLayouts.lg || DEFAULT_WIDGET_LAYOUTS.lg).find((item) => item.i === "deepseek-live")}>
                    <Panel title="DeepSeek Live Brain" className="helix-brain-panel">
                      <div className="widget-drag-handle mb-3 flex cursor-move items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
                        <span>Drag to move</span><span>Resize edges or corners</span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <HudMetric label="Mode" value={managedPositionRows.length ? 'MANAGING' : String(workerStatus?.aiGateDecision || 'N/A')} tone={managedPositionRows.length ? 'green' : String(workerStatus?.aiGateDecision || '').includes('TRADE') ? 'green' : 'amber'} />
                        <HudMetric label="Final" value={String(workerStatus?.finalExecutionDecision || 'NO_TRADE')} tone={String(workerStatus?.finalExecutionDecision || '') === 'TRADE' ? 'green' : 'amber'} />
                        <HudMetric label="Open Trades" value={String(managedPositionRows.length)} tone={managedPositionRows.length ? 'green' : 'cyan'} />
                        <HudMetric label="Fresh" value={deepseekFresh ? 'YES' : 'NO'} tone={deepseekFresh ? 'green' : 'amber'} />
                      </div>

                      <div className={`helix-brain-core mt-3 rounded-2xl border px-4 py-4 text-xs ${deepseekFresh ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>
                        <div className="flex items-center gap-4">
                          <div className="helix-brain-orb flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-black/30">
                            <span className="text-2xl">◌</span>
                          </div>
                          <div>
                            <div className="font-semibold">{deepseekFresh ? 'DeepSeek heartbeat is fresh' : 'Waiting for fresh DeepSeek heartbeat'}</div>
                            <div className="mt-1 text-slate-300">
                              Last AI response: {workerStatus?.aiLastHeartbeatAt ? new Date(workerStatus.aiLastHeartbeatAt).toLocaleTimeString() : '—'}
                              <span className="mx-2 text-slate-500">•</span>
                              Source: {String(workerStatus?.executionSource || 'HYBRID')}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-cyan-300/15 bg-black/25 p-4">
                        <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">Portfolio Manager Briefing</div>
                        <div className="text-lg font-semibold leading-snug text-slate-100">{deepseekBriefing.stance}</div>
                        <div className="mt-2 text-sm leading-relaxed text-slate-300">{deepseekBriefing.plainReason}</div>
                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">What would change my mind</div>
                            <div className="mt-1 text-sm leading-relaxed text-cyan-100">{deepseekBriefing.next}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">Risk posture</div>
                            <div className="mt-1 text-sm leading-relaxed text-amber-100">{deepseekBriefing.riskTone}</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-cyan-300/15 bg-black/25 p-4">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">Operator Edge Stack</div>
                            <div className="mt-1 text-sm leading-relaxed text-slate-300">
                              {operatorIntelligence?.operatorBrief?.headline || 'Building multi-timeframe, event-risk, execution-quality, and AI/rules alignment context.'}
                            </div>
                          </div>
                          <div className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-cyan-100">
                            Bias {operatorIntelligence?.multiTimeframe?.marketBias || '—'}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                          <HudMetric label="MTF Align" value={operatorIntelligence?.multiTimeframe ? `${operatorIntelligence.multiTimeframe.alignmentScore}%` : '—'} tone={(operatorIntelligence?.multiTimeframe?.alignmentScore || 0) >= 65 ? 'green' : 'amber'} />
                          <HudMetric label="Event Risk" value={String(operatorIntelligence?.eventRisk?.level || '—').toUpperCase()} tone={operatorIntelligence?.eventRisk?.level === 'high' ? 'red' : operatorIntelligence?.eventRisk?.level === 'medium' ? 'amber' : 'green'} />
                          <HudMetric label="Exec Grade" value={operatorIntelligence?.executionQuality?.grade || '—'} tone={['A', 'B'].includes(String(operatorIntelligence?.executionQuality?.grade)) ? 'green' : operatorIntelligence?.executionQuality?.grade === 'C' ? 'amber' : 'red'} />
                          <HudMetric label="AI/Rules" value={operatorIntelligence?.aiRulesAlignment ? `${operatorIntelligence.aiRulesAlignment.score}%` : '—'} tone={(operatorIntelligence?.aiRulesAlignment?.score || 0) >= 82 ? 'green' : 'amber'} />
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">Best Timeframe Alignment</div>
                            {(operatorIntelligence?.multiTimeframe?.symbols || []).slice(0, 3).map((row) => (
                              <div key={row.symbol} className="mb-2 last:mb-0 rounded-lg border border-white/10 bg-black/20 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-black text-slate-100">{row.symbol}</span>
                                  <span className="font-bold text-cyan-100">{row.score}%</span>
                                </div>
                                <div className="mt-1 text-slate-400">{row.note}</div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {row.timeframes.map((tf) => (
                                    <span key={`${row.symbol}-${tf.interval}`} className={`rounded-full border px-2 py-0.5 text-[10px] ${tf.bias === 'LONG' ? 'border-emerald-300/30 text-emerald-200' : tf.bias === 'SHORT' ? 'border-red-300/30 text-red-200' : 'border-slate-300/20 text-slate-300'}`}>
                                      {tf.interval} {tf.bias}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {!operatorIntelligence?.multiTimeframe?.symbols?.length && <div className="text-slate-400">Waiting for timeframe scan.</div>}
                          </div>
                          <div className="space-y-2">
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                              <div className="text-[10px] uppercase tracking-wide text-slate-400">Priority</div>
                              <div className="mt-1 leading-relaxed text-amber-100">{operatorIntelligence?.operatorBrief?.priority || 'Waiting for operator intelligence.'}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                              <div className="text-[10px] uppercase tracking-wide text-slate-400">Execution Quality</div>
                              <div className="mt-1 leading-relaxed text-slate-300">
                                {operatorIntelligence?.operatorBrief?.improvement || 'Slippage and fill-rate telemetry will populate from live trade records.'}
                              </div>
                              {operatorIntelligence?.executionQuality && (
                                <div className="mt-2 text-slate-400">
                                  Fill {operatorIntelligence.executionQuality.fillRatePct}% • Avg slip {operatorIntelligence.executionQuality.avgSlippageBps} bps • Rejects {operatorIntelligence.executionQuality.rejectedSignals}
                                </div>
                              )}
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                              <div className="text-[10px] uppercase tracking-wide text-slate-400">Action</div>
                              <div className="mt-1 leading-relaxed text-cyan-100">{operatorIntelligence?.operatorBrief?.action || 'Keep scanning until the next backend intelligence cycle completes.'}</div>
                            </div>
                          </div>
                        </div>
                        {operatorIntelligence?.aiRulesAlignment?.disagreements?.length ? (
                          <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.045] p-3 text-xs">
                            <div className="mb-2 text-[10px] uppercase tracking-wide text-amber-200">AI / Rules Disagreements</div>
                            {operatorIntelligence.aiRulesAlignment.disagreements.slice(0, 3).map((row) => (
                              <div key={`${row.ts}-${row.symbol}-${row.rulesDecision}`} className="mb-2 last:mb-0 text-slate-300">
                                <span className="font-bold text-slate-100">{row.symbol}</span> {row.aiDecision} → {row.rulesDecision}: {row.reason}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {managedPositionRows.length > 0 && (
                        <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.045] p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-200/80">Open Trade Supervision</div>
                              <div className="mt-1 text-sm text-slate-300">DeepSeek keeps scanning, but open risk is now the first job.</div>
                            </div>
                            <div className="rounded-full border border-emerald-300/30 bg-black/25 px-3 py-1 text-[11px] font-bold text-emerald-100">
                              Net {signedMoney(managedPositionRows.reduce((sum, row) => sum + Number(row.unrealized || 0), 0))}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                            {managedPositionRows.slice(0, 4).map((row) => (
                              <div key={`${row.symbol}-${row.ts}`} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base font-black text-slate-50">{row.symbol}</span>
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${row.side === 'LONG' ? 'border-emerald-300/40 text-emerald-200' : 'border-red-300/40 text-red-200'}`}>{row.side}</span>
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${row.slStatus === 'Locked Profit' ? 'border-emerald-300/40 text-emerald-200' : row.slStatus === 'Break-even' ? 'border-cyan-300/40 text-cyan-200' : 'border-amber-300/40 text-amber-200'}`}>{row.slStatus}</span>
                                    </div>
                                    <div className="mt-1 text-slate-400">Entry {Number(row.entry || 0).toFixed(Number(row.entry || 0) < 1 ? 5 : 2)} • Mark {Number(row.mark || 0).toFixed(Number(row.mark || 0) < 1 ? 5 : 2)}</div>
                                  </div>
                                  <div className={`text-right text-sm font-black ${Number(row.unrealized || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                    {signedMoney(Number(row.unrealized || 0))}
                                    <div className="mt-1 text-[11px] font-semibold text-slate-500">{row.movePct >= 0 ? '+' : ''}{row.movePct.toFixed(2)}%</div>
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                  <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                                    <div className="text-slate-500">Stop distance</div>
                                    <div className="mt-1 font-bold text-slate-100">{Number(row.stop || 0) > 0 ? `${row.distanceToStopPct.toFixed(2)}%` : 'missing'}</div>
                                  </div>
                                  <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                                    <div className="text-slate-500">Target distance</div>
                                    <div className="mt-1 font-bold text-slate-100">{Number(row.takeProfit || 0) > 0 ? `${row.distanceToTargetPct.toFixed(2)}%` : 'not set'}</div>
                                  </div>
                                </div>
                                {(row.holdScore > 0 || row.reduceScore > 0 || row.exitScore > 0) && (
                                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                                    <div className="rounded-lg border border-emerald-300/15 bg-emerald-400/[0.045] p-2">
                                      <div className="text-slate-500">Hold</div>
                                      <div className="mt-1 font-black text-emerald-200">{row.holdScore}</div>
                                    </div>
                                    <div className="rounded-lg border border-amber-300/15 bg-amber-400/[0.045] p-2">
                                      <div className="text-slate-500">Reduce</div>
                                      <div className="mt-1 font-black text-amber-200">{row.reduceScore}</div>
                                    </div>
                                    <div className="rounded-lg border border-red-300/15 bg-red-400/[0.045] p-2">
                                      <div className="text-slate-500">Exit</div>
                                      <div className="mt-1 font-black text-red-200">{row.exitScore}</div>
                                    </div>
                                  </div>
                                )}
                                <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.045] p-2.5 leading-relaxed text-cyan-100">
                                  {row.nextAction}
                                  {row.managementReason && <div className="mt-1 text-slate-300">{row.managementReason}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-slate-400">
                          <span>{managedPositionRows.length ? 'Market scanner still running' : 'Symbols DeepSeek just reviewed'}</span>
                          <span>{aiConversationRows.length} cached</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {(aiConversationRows.length ? aiConversationRows.slice(0, 5) : [{
                            ts: '',
                            symbol: '—',
                            promptSummary: 'Waiting for first live DeepSeek cycle.',
                            responseSummary: 'No response yet.',
                            confidence: 0,
                            delta: 'idle',
                          }]).map((row: any, i: number) => (
                            <div key={`${row.ts || 'empty'}-${row.symbol}-${i}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold text-slate-100">{String(row.symbol || 'MARKET')}</div>
                                <div className="rounded-full border border-amber-300/25 px-2 py-0.5 text-[10px] text-amber-100">{Number(row.confidence || 0)}% conf</div>
                              </div>
                              <div className="mt-1 line-clamp-2 break-words text-slate-300">{String(row.responseSummary || 'Monitoring').replace(/^NO_TRADE\s*\(/i, '').replace(/\)$/g, '')}</div>
                              <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-slate-500">{row.ts ? new Date(row.ts).toLocaleTimeString() : '—'}</span>
                                <span className="text-cyan-300">{String(row.delta || 'no change')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <details className="no-drag mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-slate-400">Raw DeepSeek exchange</summary>
                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                          <div>
                            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Prompt summary</div>
                            <div className="max-h-32 overflow-auto whitespace-pre-wrap break-words leading-relaxed text-slate-300">{latestAiConversation?.promptSummary || 'No prompt recorded yet.'}</div>
                          </div>
                          <div>
                            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Response summary</div>
                            <div className="max-h-32 overflow-auto whitespace-pre-wrap break-words leading-relaxed text-cyan-200">{latestAiConversation?.responseSummary || 'No response recorded yet.'}</div>
                          </div>
                        </div>
                      </details>
                    </Panel>
                  </div>

                  <div key="live-feed" data-grid={(widgetLayouts.lg || DEFAULT_WIDGET_LAYOUTS.lg).find((item) => item.i === "live-feed")}>
                    <Panel title="Trade Lifecycle Timeline" className="helix-lifecycle-panel">
                      <div className="widget-drag-handle mb-3 flex cursor-move items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
                        <span>Drag to move</span><span>Resize edges or corners</span>
                      </div>
                      <div className="rounded-2xl border border-cyan-300/20 bg-black/25 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">Cycle readout</div>
                            <div className="mt-1 text-xl font-black text-slate-50">{lifecycleBrief.headline}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              Focus {lifecycleBrief.focus} • reviewed {lifecycleBrief.reviewedCount} symbols • blocked {lifecycleBrief.blockedCount}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${lifecycleBrief.action === 'TRADE' ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200' : lifecycleBrief.action === 'SKIP' ? 'border-amber-300/40 bg-amber-400/10 text-amber-200' : 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100'}`}>
                              {lifecycleBrief.action}
                            </div>
                            <div className="mt-2 text-[11px] text-slate-500">{lifecycleBrief.lastTs ? new Date(lifecycleBrief.lastTs).toLocaleTimeString() : '—'}</div>
                          </div>
                        </div>
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm leading-relaxed text-slate-200">
                          {lifecycleBrief.operatorReadout}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        {lifecycleBrief.reviewRows.map((row) => (
                          <div key={`${row.symbol}-${row.reason}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-xs transition hover:border-cyan-300/30 hover:bg-cyan-400/[0.06]">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-black tracking-wide text-slate-50">{row.symbol}</div>
                                <div className="mt-1 text-slate-400">
                                  {row.price > 0 ? `$${row.price.toFixed(row.price < 1 ? 5 : 2)}` : 'price n/a'}
                                  {row.change !== 0 && <span className={row.change >= 0 ? 'text-emerald-300' : 'text-red-300'}> • {row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%</span>}
                                </div>
                              </div>
                              <div className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${row.state === 'TRADE' ? 'border-emerald-300/40 text-emerald-200' : 'border-amber-300/30 text-amber-200'}`}>
                                {row.state}
                              </div>
                            </div>
                            <div className="mt-2 line-clamp-2 text-slate-300">{row.reason}</div>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${Math.max(4, Math.min(100, row.confidence))}%` }} />
                              </div>
                              <span className="text-[11px] text-slate-400">{row.confidence}%</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <details className="no-drag mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs">
                        <summary className="cursor-pointer list-none font-bold uppercase tracking-[0.18em] text-slate-400">Diagnostics stream</summary>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                          {(['ALL', 'DECISIONS', 'RISK', 'EXECUTION'] as const).map((filter) => (
                            <button
                              key={filter}
                              onClick={() => setFeedFilter(filter)}
                              className={`rounded-full border px-2.5 py-1 ${feedFilter === filter ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'}`}
                            >
                              {filter}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 space-y-2">
                          {(filteredFeed.length ? filteredFeed : ['No feed events yet. Waiting for the next worker cycle.']).slice(0, 4).map((evt, i) => (
                            <div key={`${evt}-${i}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 leading-relaxed text-slate-300">
                              {evt}
                            </div>
                          ))}
                          {deepseekOperatorFeed.slice(0, 3).map((row, i) => (
                            <div key={`${row.ts}-${i}`} className="rounded-lg border border-cyan-300/15 bg-cyan-400/[0.04] px-3 py-2">
                              <div className="break-words text-slate-200">{row.text}</div>
                              <div className="mt-1 text-[11px] text-cyan-300">Delta: {row.delta || 'no change'}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    </Panel>
                  </div>

                  <div key="recent-trades" data-grid={(widgetLayouts.lg || DEFAULT_WIDGET_LAYOUTS.lg).find((item) => item.i === "recent-trades")}>
                    <Panel title="Recent Trades & Performance" className="helix-performance-panel">
                      <div className="widget-drag-handle mb-3 flex cursor-move items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
                        <span>Drag to move</span><span>Resize edges or corners</span>
                      </div>
                      <div className="rounded-2xl border border-cyan-300/20 bg-black/25 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">Performance health</div>
                            <div className="mt-1 text-2xl font-black tracking-tight text-slate-50">{performanceBrief.health}</div>
                            <div className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{performanceBrief.message}</div>
                          </div>
                          <div className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${performanceBrief.tone === 'green' ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : performanceBrief.tone === 'amber' ? 'border-amber-300/30 bg-amber-400/10 text-amber-200' : 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100'}`}>
                            Last {performanceBrief.lastSymbol} {performanceBrief.lastPnl}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                        <HudMetric label="Win Rate" value={`${postTradeQuality.winRate}%`} tone={postTradeQuality.winRate >= 55 ? 'green' : postTradeQuality.winRate >= 45 ? 'amber' : 'red'} />
                        <HudMetric label="Net PnL" value={signedMoney(postTradeQuality.netPnl)} tone={Number(postTradeQuality.netPnl || 0) >= 0 ? 'green' : 'red'} />
                        <HudMetric label="Profit Factor" value={Number(postTradeQuality.profitFactor || 0).toFixed(2)} tone={Number(postTradeQuality.profitFactor || 0) >= 1.2 ? 'green' : Number(postTradeQuality.profitFactor || 0) >= 1 ? 'amber' : 'red'} />
                        <HudMetric label="Max DD" value={signedMoney(-postTradeQuality.maxDrawdownApprox)} tone={Number(postTradeQuality.maxDrawdownApprox || 0) <= 10 ? 'green' : 'amber'} />
                      </div>

                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-xs">
                        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Open Order Control</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100">{openOrders.length} open orders • {visibleOpenOrders.length} shown</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select value={openOrderFilter} onChange={(e) => setOpenOrderFilter(e.target.value as 'ALL' | 'BTCUSDT' | 'ETHUSDT' | 'XRPUSDT' | 'DOGEUSDT' | 'BNBUSDT')} className="rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10">
                              <option value="ALL">ALL</option><option value="BTCUSDT">BTCUSDT</option><option value="ETHUSDT">ETHUSDT</option><option value="XRPUSDT">XRPUSDT</option><option value="DOGEUSDT">DOGEUSDT</option><option value="BNBUSDT">BNBUSDT</option>
                            </select>
                            <button onClick={() => cancelAllOpenOrders('FILTERED')} className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-200 hover:bg-amber-500/20">Cancel Filtered</button>
                            <button onClick={() => cancelAllOpenOrders('ALL')} className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-200 hover:bg-red-500/20">Cancel All</button>
                          </div>
                        </div>
                        {ordersFeedback && <div className={`mb-2 rounded-xl border px-3 py-2 text-xs ${ordersFeedback.kind === 'success' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-red-400/40 bg-red-500/10 text-red-200'}`}>{ordersFeedback.text}</div>}
                        <div className="max-h-36 space-y-1.5 overflow-auto pr-1">
                          {visibleOpenOrders.length === 0 ? (
                            <div className="rounded-xl border border-cyan-300/15 bg-black/25 p-4 text-center text-slate-400">
                              No open orders for this filter. The order book is clean.
                            </div>
                          ) : visibleOpenOrders.map((o) => (
                            <div key={`${o.symbol}-${o.orderId}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                              <div className="min-w-0">
                                <div className="font-bold text-slate-100">{o.symbol} <span className={String(o.side).toUpperCase() === 'BUY' ? 'text-emerald-300' : 'text-red-300'}>{o.side}</span></div>
                                <div className="mt-0.5 text-[11px] text-slate-400">{o.type} • {Number(o.price || 0) > 0 ? Number(o.price).toFixed(2) : 'MKT'} • qty {Number(o.origQty || 0).toFixed(5)}</div>
                              </div>
                              <button onClick={() => cancelOpenOrder({ symbol: o.symbol, orderId: o.orderId })} className="shrink-0 rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-200 hover:bg-red-500/20">Cancel</button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Recent Closes</div>
                            <div className="mt-1 text-sm text-slate-300">Latest realized outcomes from the journal.</div>
                          </div>
                          <div className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[11px] text-slate-300">{recentTradeRows.length} closes</div>
                        </div>
                        <div className="space-y-2">
                          {recentTradeRows.length === 0 ? (
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-slate-400">No closed trades yet</div>
                          ) : recentTradeRows.slice(0, 8).map((t, i) => (
                            <div key={`${t.ts}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-black text-slate-100">{t.symbol || '—'}</span>
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${String(t.side).toUpperCase() === 'LONG' ? 'border-emerald-300/30 text-emerald-200' : String(t.side).toUpperCase() === 'SHORT' ? 'border-red-300/30 text-red-200' : 'border-slate-300/20 text-slate-300'}`}>{String(t.side || 'CLOSE').toUpperCase()}</span>
                                </div>
                                <div className="mt-1 text-slate-500">{formatDateTime(t.ts)}</div>
                              </div>
                              <div className={`text-right text-base font-black ${Number(t.pnl || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                {signedMoney(Number(t.pnl || 0))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Panel>
                  </div>
                </ResponsiveGridLayout>
              </div>
            )}
          </main>

          <footer className="mt-3 border-t border-white/10 pt-2.5 text-center text-sm text-slate-400">
            <p>© 2024 Helix.One - All rights reserved.</p>
            <p className="mt-1">Powered by the Helix Engine • Real-time algorithmic trading</p>
            <p className="mt-1">Built by Darren Headley</p>
            <p className="mt-1 text-[11px] text-slate-500">UI Build: {uiBuildId}</p>
          </footer>
        </div>
      </div>
    </>
  );
}

function StateChip({ state }: { state: DecisionState }) {
  const tone =
    state === 'EXECUTION_WINDOW_OPEN'
      ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
      : state === 'TRIGGER_ARMED'
        ? 'border-blue-500/40 bg-blue-500/20 text-blue-200'
        : state === 'LOCKED_RISK'
          ? 'border-amber-500/40 bg-amber-500/20 text-amber-200'
          : 'border-white/20 bg-white/5 text-slate-200';

  return <span className={`rounded-full border px-2 py-1 font-medium tracking-wide ${tone}`}>{state.replaceAll('_', ' ')}</span>;
}

function LiveBlock({ title, items, tone }: { title: string; items: string[]; tone: 'emerald' | 'blue' | 'amber' }) {
  const toneMap = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10',
    blue: 'border-blue-500/30 bg-blue-500/10',
    amber: 'border-amber-500/30 bg-amber-500/10',
  } as const;

  return (
    <div className={`rounded-xl border p-3 ${toneMap[tone]}`}>
      <div className="uppercase tracking-wide text-slate-300 mb-2">{title}</div>
      <ul className="list-disc ml-4 space-y-1 text-slate-100">
        {items.slice(0, 4).map((item, i) => (
          <li key={`${title}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-3 sm:p-4 shadow-xl shadow-black/30 ${className}`}>
      <h2 className="shrink-0 text-lg sm:text-xl font-semibold mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h2>
      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {children}
      </div>
    </section>
  );
}

function TopMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'red' }) {
  const toneClass = tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-red-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-md px-2.5 sm:px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-2xl sm:text-3xl font-semibold mt-1 ${toneClass}`} style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-slate-100 font-semibold">{value}</div>
    </div>
  );
}

function HudMetric({ label, value, tone = 'cyan' }: { label: string; value: string; tone?: 'cyan' | 'green' | 'amber' | 'red' }) {
  const toneClass = {
    cyan: 'border-cyan-300/20 bg-cyan-400/[0.07] text-cyan-100',
    green: 'border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-100',
    amber: 'border-amber-300/20 bg-amber-400/[0.07] text-amber-100',
    red: 'border-red-300/20 bg-red-400/[0.07] text-red-100',
  }[tone];

  return (
    <div className={`rounded-xl border px-3 py-2 shadow-inner shadow-black/20 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function HeatCell({ value, blocked = false }: { value: number; blocked?: boolean }) {
  const v = Math.max(0, Math.min(100, Number(value || 0)));
  const tone = blocked ? 'text-red-300 border-red-400/40 bg-red-500/10' : v >= 70 ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' : v >= 50 ? 'text-amber-300 border-amber-400/40 bg-amber-500/10' : 'text-red-300 border-red-400/40 bg-red-500/10';
  return <span className={`inline-flex min-w-12 justify-center rounded border px-1.5 py-0.5 ${tone}`}>{v}</span>;
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: 'good' | 'bad' }) {
  const cls = tone === 'good' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200' : 'border-red-500/50 bg-red-500/20 text-red-200';
  return <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider ${cls}`}>{children}</span>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 py-2">
      <span className="text-slate-300">{label}</span>
      <span className="font-semibold text-slate-100 text-right">{value}</span>
    </div>
  );
}

function DetailRow({ label, value, highlight = '' }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 py-2">
      <span className="text-slate-300">{label}</span>
      <span className={`font-semibold ${highlight || 'text-slate-100'}`}>{value}</span>
    </div>
  );
}

function formatFunding(
  funding: Array<{ symbol: string; fundingRate: number }> | undefined,
  oi: Array<{ symbol: string; openInterestUsd: number }> | undefined
) {
  const f = funding?.[0];
  const o = oi?.[0];
  const fundingPct = f ? `${(Number(f.fundingRate || 0) * 100).toFixed(2)}%` : '—';
  const openInterest = o ? `${(Number(o.openInterestUsd || 0) / 1_000_000_000).toFixed(2)}B` : '—';
  return `${fundingPct} / ${openInterest}`;
}

function money(v: number) {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPrice(v: number) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(6);
}

function signedMoney(v: number) {
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDateTime(ts: string | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
