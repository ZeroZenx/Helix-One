import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
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
    killSwitchDrawdownPct?: number;
    cooldownMinutes?: number;
    maxTradesPerDay?: number;
    maxConsecutiveLosses?: number;
    minConfidence?: number;
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
  pnl?: number;
  decision?: string;
  confidence?: number;
  reasons?: string[];
  riskFlags?: string[];
  gateResult?: string;
  provider?: string;
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

const EXEC_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

export default function Home() {
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [status, setStatus] = useState<TradingStatus | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null);
  const [riskContext, setRiskContext] = useState<RiskContext | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [workerStatus, setWorkerStatus] = useState<any>(null);
  const [cycleChanges, setCycleChanges] = useState<string[]>([]);
  const [uiBuildId, setUiBuildId] = useState('unknown');
  const [feedFilter, setFeedFilter] = useState<'ALL' | 'DECISIONS' | 'RISK' | 'EXECUTION'>('ALL');
  const [replayIndex, setReplayIndex] = useState(0);
  const [richExpanded, setRichExpanded] = useState(false);
  const previousCycleRef = useRef<{ regimeConfidence: number; volatility: string; fundingRatePct: number } | null>(null);

  const liveConnected = Boolean(status?.engineConnected);
  const account = briefing?.account || {};
  const market = briefing?.market || {};
  const risks = (riskContext?.riskFlags || briefing?.notes || []).slice(0, 3);
  const portfolio = status?.activePortfolios?.[0];
  const riskSettings = settings?.riskSettings || {};

  const walletBalance = Number(account.balance || 0);
  const availableMargin = Number(account.availableMargin || 0);
  const livePositions = portfolio?.positions || [];
  const openPositions = livePositions.length;

  const riskPosture = useMemo(() => {
    if (!liveConnected) return { label: 'DISCONNECTED', tone: 'bg-red-500/20 text-red-300 border-red-500/40' };
    if (risks.length > 1 || market.volatilityState === 'high') return { label: 'REDUCED', tone: 'bg-amber-500/20 text-amber-200 border-amber-500/40' };
    return { label: 'NORMAL', tone: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40' };
  }, [liveConnected, risks.length, market.volatilityState]);

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

  async function loadDashboard() {
    try {
      const [statusRes, settingsRes, briefingRes, riskRes, journalRes, workerRes] = await Promise.allSettled([
        fetchWithTimeout(`${API}/status`),
        fetchWithTimeout(`${API}/settings`),
        fetchWithTimeout(`${API}/daily-briefing`),
        fetchWithTimeout(`${API}/risk-context?symbols=BTCUSDT,ETHUSDT,SOLUSDT`),
        fetchWithTimeout(`${API}/journal?limit=300&tradeCloseLimit=50&tradeCloseScanLimit=5000`),
        fetchWithTimeout(`${API}/worker-status`),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        setStatus((await statusRes.value.json()) as TradingStatus);
      }

      if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
        setSettings((await settingsRes.value.json()) as SettingsPayload);
      }

      if (briefingRes.status === 'fulfilled' && briefingRes.value.ok) {
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
      }

      if (riskRes.status === 'fulfilled' && riskRes.value.ok) {
        setRiskContext((await riskRes.value.json()) as RiskContext);
      }

      if (journalRes.status === 'fulfilled' && journalRes.value.ok) {
        const payload = await journalRes.value.json();
        setJournal(Array.isArray(payload?.entries) ? payload.entries : []);
      }

      if (workerRes.status === 'fulfilled' && workerRes.value.ok) {
        const payload = await workerRes.value.json();
        setWorkerStatus(payload);
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
    try {
      await fetchWithTimeout(`${API}/positions/secure-break-even`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol], bufferPct: 0.001 }),
      });
      await loadDashboard();
    } catch {
      // noop
    }
  }

  async function takePartial(symbol: string, percent = 5) {
    try {
      await fetchWithTimeout(`${API}/positions/partial-close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol], percent }),
      });
      await loadDashboard();
    } catch {
      // noop
    }
  }

  useEffect(() => {
    loadDashboard();
    loadMarket();
    if (typeof window !== 'undefined') {
      setUiBuildId((window as any)?.__NEXT_DATA__?.buildId || 'unknown');
    }
    const id = setInterval(() => {
      loadDashboard();
      loadMarket();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const activeTradeRows = livePositions.slice(0, 6).map((p) => {
    const stop = Number((p as any).stopLoss || 0);
    const entry = Number(p.entryPrice || 0);
    const size = Number(p.size || 0);
    const side = String((p as any).side || 'LONG');
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
    return {
      ts: p.openedAt,
      symbol: p.symbol,
      side,
      qty: p.size,
      entry: p.entryPrice,
      stop,
      slStatus,
      secured,
    };
  });
  const recentTradeRows = journal
    .filter((j) => j.type === 'trade_close')
    .sort((a, b) => new Date(String(b.ts || 0)).getTime() - new Date(String(a.ts || 0)).getTime())
    .slice(0, 12);
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
      detail: `${r.reason} • conf ${r.confidence}%`,
      tone: r.decision === 'TRADE' ? 'text-emerald-300' : r.decision === 'NO_TRADE' ? 'text-amber-300' : 'text-red-300',
    }));
    const actionRows = (workerStatus?.lastRunAt && workerStatus?.lastAction)
      ? [{
          ts: workerStatus.lastRunAt,
          label: `Worker ${String(workerStatus.lastAction).toUpperCase()}`,
          detail: String(workerStatus?.lastReasonHuman || workerStatus?.lastReason || 'n/a'),
          tone: 'text-cyan-300',
        }]
      : [];

    return [...actionRows, ...cycleRows]
      .sort((a, b) => new Date(String(b.ts || 0)).getTime() - new Date(String(a.ts || 0)).getTime())
      .slice(0, 12);
  }, [aiDecisionRows, workerStatus?.lastRunAt, workerStatus?.lastAction, workerStatus?.lastReasonHuman, workerStatus?.lastReason]);

  const replayCursor = timelineEvents[Math.min(replayIndex, Math.max(0, timelineEvents.length - 1))] || null;

  const postTradeQuality = useMemo(() => {
    const rows = recentTradeRows.slice(0, 8);
    const wins = rows.filter((r) => Number(r.pnl || 0) > 0).length;
    const losses = rows.filter((r) => Number(r.pnl || 0) < 0).length;
    const avgPnl = rows.length ? rows.reduce((sum, r) => sum + Number(r.pnl || 0), 0) / rows.length : 0;
    const ruleAdherence = Math.max(50, 100 - risks.length * 10 - (decision.label === 'NO_TRADE' ? 5 : 0));
    return {
      sample: rows.length,
      winRate: rows.length ? Math.round((wins / rows.length) * 100) : 0,
      losses,
      avgPnl,
      slippage: 'n/a',
      rrAchieved: rows.length ? (avgPnl > 0 ? '>= 1.2 (estimated)' : '< 1.0 (estimated)') : 'n/a',
      ruleAdherence,
    };
  }, [recentTradeRows, risks.length, decision.label]);

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="min-h-screen text-slate-100" style={{ fontFamily: 'IBM Plex Sans, Space Grotesk, sans-serif', background: 'radial-gradient(1200px 800px at 20% 0%, #1a2438 0%, #0b101a 40%, #05070c 100%)' }}>
        <div className="mx-auto w-full max-w-[1420px] px-3 sm:px-4 md:px-6 py-4 md:py-5">
          <header className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-4 md:p-5 shadow-2xl shadow-black/30">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-2xl sm:text-3xl font-bold tracking-wide" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  <span className="text-emerald-300">HELIX</span>.ONE
                </div>
                <StatusPill tone={liveConnected ? 'good' : 'bad'}>{liveConnected ? 'LIVE' : 'OFFLINE'}</StatusPill>
                <StatusPill tone={liveConnected ? 'good' : 'bad'}>{liveConnected ? 'CONNECTED' : 'DISCONNECTED'}</StatusPill>
                <div className="text-slate-400 text-sm">Last update: {lastUpdated || '—'}</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setRichExpanded((v) => !v)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${richExpanded ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200' : 'border-white/15 bg-white/5 hover:bg-white/10 text-slate-200'}`}>
                  {richExpanded ? 'Rich Intel: ON' : 'Rich Intel: OFF'}
                </button>
                <a href="/settings" className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-medium">Settings</a>
              </div>
            </div>
          </header>

          <main className="mt-5 space-y-5">
            {error && <div className="rounded-xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-red-100 text-sm">{error}</div>}

            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <TopMetric label="Binance Wallet Balance" value={walletBalance > 0 ? money(walletBalance) : '—'} />
              <TopMetric label="Available Margin" value={availableMargin > 0 ? money(availableMargin) : '—'} tone="green" />
              <TopMetric label="Daily P&L" value={typeof account.previousDayPnl === 'number' ? signedMoney(account.previousDayPnl) : '—'} tone={Number(account.previousDayPnl || 0) >= 0 ? 'green' : 'red'} />
              <TopMetric label="Open Positions" value={String(openPositions)} />
              <div className={`rounded-xl border px-4 py-3 ${riskPosture.tone}`}>
                <div className="text-xs uppercase tracking-wider text-slate-300/80">Risk Posture</div>
                <div className="text-2xl font-semibold mt-1">{riskPosture.label}</div>
              </div>
            </section>

            <section className="sticky top-2 z-20 rounded-2xl border border-cyan-400/30 bg-slate-900/85 backdrop-blur-md p-3 md:p-4 shadow-lg shadow-black/30">
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

            <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Panel className="xl:col-span-4" title="Market & Risk Overview">
                <div className="space-y-1">
                  {coins.map((c) => (
                    <div key={c.symbol} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div className="font-semibold">{c.symbol}</div>
                      <div className="text-right">
                        <div className="font-semibold">${c.price.toFixed(c.price < 1 ? 4 : 2)}</div>
                        <div className={`text-xs ${c.change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{c.change >= 0 ? '+' : ''}{c.change.toFixed(2)}%</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <InfoRow label="Regime" value={`${String(market.regime || 'unclear').toUpperCase()} | Confidence: ${Number(market.regimeConfidence || 0)}%`} />
                  <InfoRow label="Liquidity" value={String(market.liquidityState || 'unknown').toUpperCase()} />
                  <InfoRow label="Volatility" value={String(market.volatilityState || 'unknown').toUpperCase()} />
                  <InfoRow label="Funding / OI" value={formatFunding(market.funding, market.openInterest)} />
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Multi-Symbol Radar</div>
                  <div className="space-y-2">
                    {symbolBrains.map((s) => (
                      <div key={s.symbol} className="flex items-center justify-between text-xs border-b border-white/10 pb-1 last:border-b-0">
                        <div className="font-semibold">{s.symbol}</div>
                        <div className={`${s.state === 'OPEN' || s.state === 'ARMED' ? 'text-emerald-300' : s.state === 'BLOCKED' ? 'text-red-300' : 'text-amber-300'}`}>{s.state}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Action Readiness Score</div>
                    <div className={`text-sm font-bold ${readinessScore >= 75 ? 'text-emerald-300' : readinessScore >= 55 ? 'text-amber-300' : 'text-red-300'}`}>{readinessScore}/100</div>
                  </div>
                  <div className="h-2 rounded bg-black/30 overflow-hidden">
                    <div className={`h-full ${readinessScore >= 75 ? 'bg-emerald-400' : readinessScore >= 55 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${readinessScore}%` }} />
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 overflow-auto">
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Symbol Heat Matrix</div>
                  <table className="w-full text-[11px] min-w-[420px]">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="text-left py-1">Symbol</th>
                        <th className="text-right py-1">Structure</th>
                        <th className="text-right py-1">Momentum</th>
                        <th className="text-right py-1">Volume</th>
                        <th className="text-right py-1">Risk</th>
                        <th className="text-right py-1">Final Gate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heatMatrixRows.map((r) => (
                        <tr key={r.symbol} className="border-t border-white/10">
                          <td className="py-1 font-semibold">{r.symbol}</td>
                          <td className="py-1 text-right"><HeatCell value={r.structure} /></td>
                          <td className="py-1 text-right"><HeatCell value={r.momentum} /></td>
                          <td className="py-1 text-right"><HeatCell value={r.volume} /></td>
                          <td className="py-1 text-right"><HeatCell value={r.risk} /></td>
                          <td className="py-1 text-right"><HeatCell value={r.gate} blocked={r.blocked} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel className="xl:col-span-5" title="DeepSeek Decision Brain (Operator Mode)">
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    decision.label === 'TRADE'
                      ? 'border-emerald-500/70 bg-emerald-950/20'
                      : 'border-red-500/70 bg-red-950/30'
                  }`}
                >
                  <div className="text-center text-sm tracking-wide text-slate-300">CURRENT DECISION:</div>
                  <div
                    className={`text-center text-4xl font-bold mt-1 tracking-wide ${
                      decision.label === 'TRADE' ? 'text-emerald-300' : 'text-red-300'
                    }`}
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    {decision.label}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <StateChip state={decision.state} />
                  <span className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-slate-200">Confidence: {decision.confidence}%</span>
                  <span className={`rounded-full border px-2 py-1 font-semibold ${decision.label === 'TRADE' ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-amber-400/50 bg-amber-500/15 text-amber-200'}`}>
                    {decision.label === 'TRADE' ? 'CAN TRADE NOW' : 'DO NOT TRADE NOW'}
                  </span>
                </div>

                <div className="mt-4 divide-y divide-white/10 text-sm">
                  <DetailRow
                    label="Setup Quality"
                    value={decision.quality}
                    highlight={decision.label === 'TRADE' ? 'text-emerald-300' : 'text-red-300'}
                  />
                  <DetailRow label="Risk Flags" value={risks.length ? risks.join(', ') : 'None'} highlight={risks.length ? 'text-amber-300' : 'text-emerald-300'} />
                  <DetailRow label="Pre-Checks" value={`${decision.checks} ${decision.failedChecks > 0 ? '(some failed)' : ''}`} highlight={decision.failedChecks > 0 ? 'text-amber-300' : 'text-emerald-300'} />
                  <DetailRow label="Rule Bias" value={String(decision.ruleBias || 'N/A')} />
                  <DetailRow label="AI Gate" value={String(decision.aiGate || 'N/A')} highlight={String(decision.aiGate || '') === 'NO_TRADE' ? 'text-amber-300' : 'text-emerald-300'} />
                  <DetailRow label="Side Source" value={`${String(decision.sideSource || 'N/A')} ${String(decision.chosenSide || 'N/A') !== 'N/A' ? `(${String(decision.chosenSide)})` : ''}`} />
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <LiveBlock title="NOW" tone="emerald" items={[decision.nowAction, `Entry Zone: ${decision.entryPlan.zone}`, `Plan: SL ${decision.entryPlan.stop} • TP1 ${decision.entryPlan.tp1} • TP2 ${decision.entryPlan.tp2} • R:R ${decision.entryPlan.rr}`]} />
                  <LiveBlock title="TRIGGERS" tone="blue" items={decision.triggerConditions} />
                  <LiveBlock title="RISK GUARDRAILS" tone="amber" items={decision.invalidators} />
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-200">
                  <div className="uppercase tracking-wide text-slate-400 mb-2">Trigger Progress Tracker</div>
                  <div className="space-y-2">
                    {triggerDiagnostics.items.slice(0, 5).map((item) => {
                      const state = item.passed ? 'passed' : (decision.label === 'TRADE' ? 'waiting' : 'failed');
                      return (
                        <div key={item.key} className="rounded border border-white/10 bg-black/20 px-2 py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-200">{item.label}</span>
                            <span className={state === 'passed' ? 'text-emerald-300' : state === 'waiting' ? 'text-amber-300' : 'text-red-300'}>
                              {state === 'passed' ? '✅ PASSED' : state === 'waiting' ? '⏳ WAITING' : '❌ FAILED'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-200">
                  <summary className="uppercase tracking-wide text-slate-400 cursor-pointer">Trigger Diagnostics (Why/Why Not)</summary>
                  <div className="mt-2 mb-2 text-slate-300">Blocking condition now: <span className="text-amber-200">{triggerDiagnostics.blockerNow}</span></div>
                  <div className="space-y-1">
                    {triggerDiagnostics.items.map((item) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <span>{item.passed ? '✅' : (decision.label === 'TRADE' ? '⏳' : '❌')}</span>
                        <span className={item.passed ? 'text-emerald-200' : (decision.label === 'TRADE' ? 'text-amber-200' : 'text-red-200')}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </details>

                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-200">
                  <div className="uppercase tracking-wide text-slate-400 mb-1">Why now</div>
                  {decision.label === 'NO_TRADE' && decision.ruleBias === 'TRADE' && (
                    <div className="mb-2 rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-amber-200">Execution blocked by AI gate this cycle.</div>
                  )}
                  <div>{decision.reasoningSummary}</div>
                  <div className="mt-2 rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-cyan-200">{String((decision as any).actionableNext || '')}</div>
                </div>

                {richExpanded && (
                  <>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-200">
                  <div className="uppercase tracking-wide text-slate-400 mb-1">What changed</div>
                  {decision.changesSinceLast.length ? (
                    <ul className="list-disc ml-4 space-y-1">
                      {decision.changesSinceLast.slice(0, 4).map((c, i) => (
                        <li key={`${c}-${i}`}>{c}</li>
                      ))}
                    </ul>
                  ) : (
                    <div>No material change since last cycle.</div>
                  )}
                </div>

                <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                  <div className="uppercase tracking-wide text-cyan-300 mb-1">DeepSeek Playbook</div>
                  <div className="mb-1"><span className="text-cyan-200">Narrative:</span> {deepseekPlaybook.narrative}</div>
                  <div className="mb-1"><span className="text-cyan-200">Bias:</span> {deepseekPlaybook.bias}</div>
                  <div className="mb-1"><span className="text-cyan-200">Must happen next:</span></div>
                  <ul className="list-disc ml-4 space-y-0.5">{deepseekPlaybook.mustHappen.map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}</ul>
                  <div className="mt-2 mb-1"><span className="text-cyan-200">Cancel if:</span></div>
                  <ul className="list-disc ml-4 space-y-0.5">{deepseekPlaybook.cancelIf.map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}</ul>
                </div>

                <div className="mt-3 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-3 text-xs text-indigo-100">
                  <div className="uppercase tracking-wide text-indigo-300 mb-2">DeepSeek Scenario Engine</div>
                  <div className="space-y-2">
                    {deepseekScenarios.map((s, i) => (
                      <div key={`${s.name}-${i}`} className="rounded border border-white/15 bg-black/20 p-2">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">{s.name}</div>
                          <div className="text-[10px] rounded border border-white/20 px-1.5 py-0.5">{s.action}</div>
                        </div>
                        <div className="mt-1">Trigger: {s.trigger}</div>
                        <div>Invalidation: {s.invalidation}</div>
                        <div>Expected R:R: {s.expected_rr}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <div className="uppercase tracking-wide text-amber-300 mb-1">DeepSeek Risk Coach</div>
                  <div className="mb-1"><span className="text-amber-200">Blocker:</span> {deepseekRiskCoach.blocker}</div>
                  <div className="mb-1 text-amber-200">What to fix before next cycle:</div>
                  <ul className="list-disc ml-4 space-y-0.5">{deepseekRiskCoach.fixNext.map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}</ul>
                </div>
                  </>
                )}
              </Panel>

              <Panel className="xl:col-span-3" title="Ops & Risk">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <MiniMetric label="Daily Loss" value={`${Number(riskSettings.maxDailyLossPct ?? 3).toFixed(1)}%`} />
                  <MiniMetric label="Position Size" value={`${Number(riskSettings.maxPositionSizePct ?? 10).toFixed(0)}%`} />
                  <MiniMetric label="Leverage" value={`${Number(riskSettings.maxLeverage ?? 5)}x`} />
                  <MiniMetric label="Trades/Day" value={`${Number(riskSettings.maxTradesPerDay ?? 5)}`} />
                  <MiniMetric label="Worker" value={workerStatus?.running ? 'ON' : 'OFF'} />
                  <MiniMetric label="Interval" value={`${Number(workerStatus?.intervalSec || 60)}s`} />
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs">
                  <div className="text-slate-400">Execution Policy</div>
                  <div className="text-slate-100">max_open_positions: {Number(workerStatus?.policy?.maxOpenPositions || 1)}</div>
                  <div className="text-slate-100">cooldown_minutes: {Number(workerStatus?.policy?.cooldownMinutes || 30)}</div>
                  <div className="text-slate-400 mt-1">Execution Source</div>
                  <div className="text-slate-100 font-semibold">{String(workerStatus?.executionSource || 'HYBRID')}</div>
                  <div className="text-slate-400 mt-1">AI Last Heartbeat</div>
                  <div className="text-slate-100">{workerStatus?.aiLastHeartbeatAt ? new Date(workerStatus.aiLastHeartbeatAt).toLocaleTimeString() : '—'}</div>
                  {workerStatus?.fallbackMode && <div className="mt-1 inline-block rounded border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">FALLBACK MODE</div>}
                </div>

                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs">
                  <div className="text-slate-400 mb-2">Risk Capacity</div>
                  <div className="grid grid-cols-2 gap-2">
                    <MiniMetric label="Trades Used" value={`${riskCapacity.tradesToday}/${riskCapacity.maxTrades}`} />
                    <MiniMetric label="Slots Left" value={`${riskCapacity.tradeSlotsLeft}`} />
                    <MiniMetric label="Loss Used" value={`${riskCapacity.dailyLossUsedPct.toFixed(2)}%`} />
                    <MiniMetric label="Loss Capacity Left" value={`${riskCapacity.lossCapacityLeftPct.toFixed(2)}%`} />
                    <MiniMetric label="Open/Max" value={`${riskCapacity.openPositions}/${riskCapacity.maxOpenPositions}`} />
                    <MiniMetric label="Cooldown" value={riskCapacity.cooldownMinutes > 0 ? `${riskCapacity.cooldownMinutes}m` : 'none'} />
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-slate-400">Last Run</div>
                      <div className="text-slate-100 font-semibold text-sm">{workerStatus?.lastRunAt ? new Date(workerStatus.lastRunAt).toLocaleTimeString() : '—'}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Last Action</div>
                      <div className={`inline-flex mt-0.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${String(workerStatus?.lastAction || '').toUpperCase() === 'SKIP' ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' : 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'}`}>
                        {String(workerStatus?.lastAction || '—').toUpperCase()}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-400 mb-1">Reason (human)</div>
                    <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-slate-100 leading-relaxed">{reasonBreakdown.headline}</div>
                  </div>

                  {reasonBreakdown.hasStructuredReasons && (
                    <div className="space-y-2">
                      <div className="text-slate-400">By Symbol</div>
                      <div className="space-y-2">
                        {reasonBreakdown.bySymbol.map((item) => (
                          <div key={`${item.symbol}-${item.reason}`} className="rounded border border-white/10 bg-black/20 px-3 py-2">
                            <div className="text-[11px] font-semibold text-cyan-200">{item.symbol}</div>
                            <div className="text-slate-200 leading-relaxed">{item.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Live Feed</div>
                    <div className="flex flex-wrap gap-1">
                      {(['ALL', 'DECISIONS', 'RISK', 'EXECUTION'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFeedFilter(f)}
                          className={`rounded border px-2 py-0.5 text-[10px] ${feedFilter === f ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200' : 'border-white/20 text-slate-300 hover:bg-white/10'}`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-200 max-h-44 overflow-auto pr-1">
                    {filteredFeed.length ? filteredFeed.slice(0, 8).map((evt, i) => <div key={`${evt}-${i}`} className="whitespace-normal leading-relaxed rounded border border-white/10 bg-black/20 px-2 py-1.5">• {evt}</div>) : <div className="text-slate-400">No events for this filter.</div>}
                  </div>
                </div>
              </Panel>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Panel className="xl:col-span-8" title="Active Positions">
                <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="text-left py-2">Pair</th>
                      <th className="text-left py-2">Side</th>
                      <th className="text-right py-2">Size</th>
                      <th className="text-right py-2">Entry</th>
                      <th className="text-right py-2">Stop</th>
                      <th className="text-left py-2">SL Status</th>
                      <th className="text-right py-2">Secured (est)</th>
                      <th className="text-right py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTradeRows.length === 0 ? (
                      <tr><td colSpan={8} className="py-3 text-slate-400">No active positions</td></tr>
                    ) : activeTradeRows.map((t, i) => (
                      <tr key={`${t.ts}-${i}`} className="border-t border-white/10">
                        <td className="py-2 font-semibold">{t.symbol || '—'}</td>
                        <td className={`py-2 ${String(t.side || '').toUpperCase() === 'LONG' ? 'text-emerald-300' : 'text-red-300'}`}>{String(t.side || '—').toUpperCase()}</td>
                        <td className="py-2 text-right">{typeof t.qty === 'number' ? t.qty.toFixed(6) : '—'}</td>
                        <td className="py-2 text-right">{typeof t.entry === 'number' ? t.entry.toFixed(2) : '—'}</td>
                        <td className="py-2 text-right">{t.stop > 0 ? t.stop.toFixed(2) : '—'}</td>
                        <td className={`py-2 ${t.slStatus === 'Locked Profit' ? 'text-emerald-300' : t.slStatus === 'Break-even' ? 'text-cyan-300' : 'text-slate-300'}`}>{t.slStatus}</td>
                        <td className={`py-2 text-right font-semibold ${Number(t.secured || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signedMoney(Number(t.secured || 0))}</td>
                        <td className="py-2 text-right space-x-1">
                          <button onClick={() => secureBreakEven(String(t.symbol || ''))} className="rounded border border-cyan-400/40 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-500/10">BE+0.1%</button>
                          <button onClick={() => takePartial(String(t.symbol || ''), 10)} className="rounded border border-emerald-400/40 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/10">TP 10%</button>
                          <button onClick={() => takePartial(String(t.symbol || ''), 30)} className="rounded border border-emerald-400/40 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/10">TP 30%</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Panel>

              <Panel className="xl:col-span-4" title="Recent Trades">
                <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full min-w-[320px] text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="text-left py-2">Pair</th>
                      <th className="text-left py-2">Side</th>
                      <th className="text-right py-2">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTradeRows.length === 0 ? (
                      <tr><td colSpan={3} className="py-3 text-slate-400">No closed trades yet</td></tr>
                    ) : recentTradeRows.map((t, i) => (
                      <tr key={`${t.ts}-${i}`} className="border-t border-white/10">
                        <td className="py-2 font-semibold">{t.symbol || '—'}</td>
                        <td className={`py-2 ${String(t.side).toUpperCase() === 'BUY' ? 'text-emerald-300' : 'text-red-300'}`}>{String(t.side || '—').toUpperCase()}</td>
                        <td className={`py-2 text-right font-semibold ${Number(t.pnl || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signedMoney(Number(t.pnl || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Panel>

            </section>

            {richExpanded && (
            <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Panel className="xl:col-span-5" title="Post-Trade Quality Panel">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <MiniMetric label="Sample Size" value={`${postTradeQuality.sample}`} />
                  <MiniMetric label="Win Rate" value={`${postTradeQuality.winRate}%`} />
                  <MiniMetric label="Avg PnL" value={signedMoney(postTradeQuality.avgPnl)} />
                  <MiniMetric label="Loss Count" value={`${postTradeQuality.losses}`} />
                  <MiniMetric label="RR Achieved" value={postTradeQuality.rrAchieved} />
                  <MiniMetric label="Rule Adherence" value={`${postTradeQuality.ruleAdherence}%`} />
                </div>
                <div className="mt-3 text-xs text-slate-300 rounded border border-white/10 bg-black/20 p-2">
                  Slippage: {postTradeQuality.slippage} (wire in exchange fill audit for exact value).
                </div>
              </Panel>

              <Panel className="xl:col-span-7" title="Session Replay (Recent Cycles)">
                {timelineEvents.length === 0 ? (
                  <div className="text-slate-400 text-sm">No replay events yet.</div>
                ) : (
                  <>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, timelineEvents.length - 1)}
                      value={Math.min(replayIndex, Math.max(0, timelineEvents.length - 1))}
                      onChange={(e) => setReplayIndex(Number(e.target.value || 0))}
                      className="w-full"
                    />
                    {replayCursor && (
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <div className={`font-semibold ${replayCursor.tone}`}>{replayCursor.label}</div>
                          <div className="text-slate-400 text-xs">{new Date(replayCursor.ts).toLocaleTimeString()}</div>
                        </div>
                        <div className="mt-1 text-slate-200">{replayCursor.detail}</div>
                      </div>
                    )}
                    <div className="mt-2 space-y-1 text-xs max-h-28 overflow-auto pr-1">
                      {timelineEvents.slice(0, 8).map((evt, i) => (
                        <div key={`${evt.ts}-${i}`} className="rounded border border-white/10 bg-black/20 px-2 py-1">
                          <span className={evt.tone}>{evt.label}</span>
                          <span className="text-slate-400"> • {new Date(evt.ts).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Panel>
            </section>
            )}

            {richExpanded && (
            <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Panel className="xl:col-span-12" title="AI Trace + News">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">DeepSeek AI Decision Trace</div>
                    <div className="text-[11px] text-slate-400 mb-2">
                      Heartbeat: {workerStatus?.aiLastHeartbeatAt ? new Date(workerStatus.aiLastHeartbeatAt).toLocaleTimeString() : '—'}
                      {workerStatus?.fallbackMode ? <span className="ml-2 text-amber-300">(STALE/FALLBACK)</span> : <span className="ml-2 text-emerald-300">(LIVE)</span>}
                    </div>
                    <div className="space-y-1 text-xs max-h-64 overflow-auto pr-1">
                      {aiDecisionRows.length === 0 ? (
                        <div className="text-slate-400">No AI decision logs yet.</div>
                      ) : aiDecisionRows.map((r, i) => (
                        <div key={`${r.ts}-${i}`} className="border-b border-white/10 pb-1 last:border-b-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200">{r.symbol}</span>
                            <span className={`${r.decision === 'TRADE' ? 'text-emerald-300' : r.decision === 'NO_TRADE' ? 'text-amber-300' : 'text-red-300'}`}>{r.decision}</span>
                          </div>
                          <div className="text-slate-400">conf {r.confidence}% • {new Date(r.ts).toLocaleTimeString()}</div>
                          <div className="text-slate-300 line-clamp-2">{r.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">DeepSeek Position Monitor</div>
                    <div className="space-y-1 text-xs max-h-64 overflow-auto pr-1">
                      {aiPositionFeedbackRows.length === 0 ? (
                        <div className="text-slate-400">No active AI position feedback.</div>
                      ) : aiPositionFeedbackRows.map((r: any, i: number) => (
                        <div key={`${r.ts}-${r.symbol}-${i}`} className="border-b border-white/10 pb-1 last:border-b-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200">{r.symbol}</span>
                            <span className="text-cyan-300">{String(r.stance || 'WATCH')}</span>
                          </div>
                          <div className="text-slate-400">conf {Number(r.confidence || 0)}% • {r.ts ? new Date(r.ts).toLocaleTimeString() : 'now'}</div>
                          <div className="text-slate-300 line-clamp-2">{String(r.summary || '')}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">AI Conversation Stream</div>
                    <div className="space-y-1 text-xs max-h-64 overflow-auto pr-1">
                      {aiConversationRows.length === 0 ? (
                        <div className="text-slate-400">No conversation cycles yet.</div>
                      ) : aiConversationRows.map((r: any, i: number) => (
                        <div key={`${r.ts}-${r.symbol}-${i}`} className="border-b border-white/10 pb-1 last:border-b-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200">{r.symbol}</span>
                            <span className="text-slate-300">{Number(r.confidence || 0)}%</span>
                          </div>
                          <div className="text-slate-400">sent: {String(r.promptSummary || '')}</div>
                          <div className="text-slate-300">recv: {String(r.responseSummary || '')}</div>
                          <div className="text-cyan-300">Δ {String(r.delta || 'no change')}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    {(briefing?.news || []).slice(0, 5).map((n, i) => (
                      <div key={`${n.source}-${i}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
                        <div className="text-[10px] text-slate-400">{n.source}</div>
                        <div className="text-slate-200 line-clamp-3">{n.title}</div>
                      </div>
                    ))}
                    {(!briefing?.news || briefing.news.length === 0) && <div className="text-slate-400">No headlines right now.</div>}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">DeepSeek Operator Feed</div>
                    <div className="space-y-2 text-xs max-h-48 overflow-auto pr-1">
                      {deepseekOperatorFeed.map((row, i) => (
                        <div key={`${row.ts}-${i}`} className="rounded border border-white/10 bg-black/20 px-2 py-1.5">
                          <div className="text-slate-200">{row.text}</div>
                          <div className="text-cyan-300 text-[11px] mt-1">Δ {row.delta || 'no change'}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">DeepSeek Learning Loop</div>
                    <div className="space-y-2 text-xs max-h-48 overflow-auto pr-1">
                      {deepseekLearningLoop.map((row, i) => (
                        <div key={`${row.lesson}-${i}`} className="rounded border border-white/10 bg-black/20 px-2 py-1.5">
                          <div className="text-slate-200">{row.lesson}</div>
                          <div className="text-amber-200 mt-1">Next tweak: {row.tweak}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            </section>
            )}
          </main>

          <footer className="mt-8 border-t border-white/10 pt-5 text-center text-sm text-slate-400">
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
    <section className={`rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-3 sm:p-4 shadow-xl shadow-black/30 ${className}`}>
      <h2 className="text-lg sm:text-xl font-semibold mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h2>
      {children}
    </section>
  );
}

function TopMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'red' }) {
  const toneClass = tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-red-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-md px-3 sm:px-4 py-3">
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

function signedMoney(v: number) {
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
