import { RiskIntelSnapshot } from './RiskIntelService';

export type SetupType = 'trend_pullback' | 'breakout' | 'reversal' | 'range_reversion' | 'momentum_continuation' | 'no_setup';
export type TradeBias = 'LONG' | 'SHORT' | 'WATCH';

export interface TradeCandidate {
  symbol: string;
  bias: TradeBias;
  setupType: SetupType;
  qualityScore: number;
  scores: {
    structure: number;
    liquidity: number;
    momentum: number;
    volatility: number;
    riskReward: number;
    journalMemory: number;
  };
  entryZone: { low: number | null; high: number | null };
  stopLoss: number | null;
  targets: number[];
  expectedRR: number | null;
  confidence: number;
  state: 'READY' | 'WATCH' | 'BLOCKED';
  blocker: string | null;
  thesis: string;
  confirm: string;
  invalidate: string;
  metrics: {
    price: number;
    spreadBps: number;
    atrPct: number;
    rsi14: number;
    momentum15mPct: number;
    volume24hUsd: number;
    support: number;
    resistance: number;
  };
}

export interface PositionManagementInsight {
  symbol: string;
  side: string;
  state: 'winning' | 'under_pressure' | 'flat';
  holdScore: number;
  reduceScore: number;
  exitScore: number;
  recommendation: string;
  reason: string;
  currentR: number | null;
  distanceToStopPct: number | null;
  distanceToTargetPct: number | null;
}

export interface TradeIntelligencePayload {
  generatedAt: string;
  marketSummary: {
    regime: string;
    regimeConfidence: number;
    liquidityState: string;
    volatilityState: string;
    riskFlags: string[];
  };
  topCandidate: TradeCandidate | null;
  candidates: TradeCandidate[];
  positionManagement: PositionManagementInsight[];
  portfolioBrief: {
    stance: string;
    mainRisk: string;
    bestOpportunity: string;
    action: string;
  };
  journalMemory: {
    sampleSize: number;
    bySymbol: Record<string, { closes: number; winRate: number; avgPnl: number; netPnl: number }>;
  };
}

type JournalEntry = { type?: string; symbol?: string; pnl?: number; ts?: string };

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
}

function round(n: number, places = 2) {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** places;
  return Math.round(n * p) / p;
}

export class TradeIntelligenceService {
  build(snapshot: RiskIntelSnapshot, positions: any[] = [], journalEntries: JournalEntry[] = []): TradeIntelligencePayload {
    const journalMemory = this.buildJournalMemory(journalEntries);
    const candidates = snapshot.microstructure
      .map((micro) => this.scoreCandidate(snapshot, micro, journalMemory.bySymbol[micro.symbol]))
      .sort((a, b) => b.qualityScore - a.qualityScore);
    const topCandidate = candidates[0] || null;
    const positionManagement = positions.map((p) => this.scorePosition(p));

    return {
      generatedAt: new Date().toISOString(),
      marketSummary: {
        regime: snapshot.marketRegime,
        regimeConfidence: snapshot.regimeConfidence,
        liquidityState: snapshot.liquidityState,
        volatilityState: snapshot.volatilityState,
        riskFlags: snapshot.riskFlags || [],
      },
      topCandidate,
      candidates,
      positionManagement,
      portfolioBrief: this.buildPortfolioBrief(snapshot, topCandidate, positionManagement),
      journalMemory,
    };
  }

  private scoreCandidate(snapshot: RiskIntelSnapshot, micro: RiskIntelSnapshot['microstructure'][number], memory?: { closes: number; winRate: number; avgPnl: number; netPnl: number }): TradeCandidate {
    const price = this.estimatePrice(micro);
    const available = Boolean(micro.available && price > 0);
    const momentum = Number(micro.momentum15mPct || 0);
    const trend = Number(micro.emaTrendPct || 0);
    const rsi = Number(micro.rsi14 || 50);
    const atrPct = Number(micro.atrPct || 0);
    const support = Number(micro.support || 0);
    const resistance = Number(micro.resistance || 0);
    const spreadBps = Number(micro.spreadBps || 0);
    const volumeUsd = Number(micro.volume24hUsd || 0);

    const bias: TradeBias = !available
      ? 'WATCH'
      : trend > 0.08 && momentum >= -0.08
        ? 'LONG'
        : trend < -0.08 && momentum <= 0.08
          ? 'SHORT'
          : rsi <= 35
            ? 'LONG'
            : rsi >= 65
              ? 'SHORT'
              : 'WATCH';

    const setupType: SetupType = !available
      ? 'no_setup'
      : snapshot.marketRegime === 'range'
        ? 'range_reversion'
        : snapshot.marketRegime === 'breakout' || snapshot.marketRegime === 'breakdown'
          ? 'breakout'
          : Math.abs(momentum) > 0.25 && Math.sign(momentum) === Math.sign(trend || momentum)
            ? 'momentum_continuation'
            : rsi <= 35 || rsi >= 65
              ? 'reversal'
              : Math.abs(trend) > 0.08
                ? 'trend_pullback'
                : 'no_setup';

    const structure = available ? this.structureScore(price, support, resistance, bias, setupType) : 0;
    const liquidity = available ? clamp(100 - spreadBps * 7 + Math.min(18, Math.log10(Math.max(1, volumeUsd)) * 2)) : 0;
    const momentumScore = available ? clamp(50 + Math.abs(momentum) * 80 + Math.abs(trend) * 45 - (rsi > 78 || rsi < 22 ? 18 : 0)) : 0;
    const volatility = available ? clamp(atrPct <= 0 ? 30 : atrPct < 0.25 ? 58 : atrPct <= 1.1 ? 82 : atrPct <= 1.8 ? 62 : 35) : 0;
    const plan = this.buildPlan(price, support, resistance, atrPct, bias);
    const riskReward = plan.expectedRR ? clamp(plan.expectedRR * 32) : 0;
    const journalMemory = memory && memory.closes >= 3 ? clamp(50 + (memory.winRate - 50) * 0.7 + memory.avgPnl * 1.5) : 50;

    const qualityScore = Math.round(
      structure * 0.24 +
      liquidity * 0.18 +
      momentumScore * 0.18 +
      volatility * 0.14 +
      riskReward * 0.18 +
      journalMemory * 0.08
    );

    const blockers: string[] = [];
    if (!available) blockers.push('market data unavailable');
    if (snapshot.riskFlags?.some((r) => /poor|high volatility|unavailable/i.test(String(r)))) blockers.push('market quality risk active');
    if (liquidity < 55) blockers.push('liquidity/spread not clean enough');
    if (structure < 55) blockers.push('structure not clean enough');
    if (riskReward < 55) blockers.push('risk reward not strong enough');
    if (qualityScore < 68) blockers.push('setup quality below execution grade');

    const state: TradeCandidate['state'] = blockers.length ? (qualityScore >= 58 ? 'WATCH' : 'BLOCKED') : 'READY';
    const confidence = clamp(Math.round((qualityScore * 0.7) + (Number(snapshot.regimeConfidence || 0) * 0.3)));

    return {
      symbol: micro.symbol,
      bias,
      setupType,
      qualityScore,
      scores: {
        structure: Math.round(structure),
        liquidity: Math.round(liquidity),
        momentum: Math.round(momentumScore),
        volatility: Math.round(volatility),
        riskReward: Math.round(riskReward),
        journalMemory: Math.round(journalMemory),
      },
      entryZone: plan.entryZone,
      stopLoss: plan.stopLoss,
      targets: plan.targets,
      expectedRR: plan.expectedRR,
      confidence,
      state,
      blocker: blockers[0] || null,
      thesis: this.thesis(micro.symbol, bias, setupType, snapshot.marketRegime, qualityScore),
      confirm: this.confirmationText(bias, plan.entryZone, setupType),
      invalidate: plan.stopLoss ? `Price trades through ${round(plan.stopLoss, price < 1 ? 5 : 2)}` : 'Invalidation unavailable until market data is clean',
      metrics: {
        price,
        spreadBps: round(spreadBps, 2),
        atrPct: round(atrPct, 3),
        rsi14: round(rsi, 2),
        momentum15mPct: round(momentum, 3),
        volume24hUsd: round(volumeUsd, 0),
        support,
        resistance,
      },
    };
  }

  private buildPlan(price: number, support: number, resistance: number, atrPct: number, bias: TradeBias) {
    if (!price || bias === 'WATCH') {
      return { entryZone: { low: null, high: null }, stopLoss: null, targets: [], expectedRR: null };
    }
    const atr = Math.max(price * Math.max(atrPct, 0.25) / 100, price * 0.003);
    const zonePad = Math.max(atr * 0.25, price * 0.001);
    if (bias === 'LONG') {
      const entryLow = Math.max(0, price - zonePad);
      const entryHigh = price + zonePad;
      const stopLoss = support > 0 && support < entryLow ? Math.min(support - atr * 0.2, entryLow - atr) : entryLow - atr;
      const risk = Math.max(entryHigh - stopLoss, price * 0.001);
      const targets = [entryHigh + risk * 1.5, entryHigh + risk * 2.4];
      return { entryZone: { low: entryLow, high: entryHigh }, stopLoss, targets, expectedRR: (targets[1] - entryHigh) / risk };
    }
    const entryLow = price - zonePad;
    const entryHigh = price + zonePad;
    const stopLoss = resistance > 0 && resistance > entryHigh ? Math.max(resistance + atr * 0.2, entryHigh + atr) : entryHigh + atr;
    const risk = Math.max(stopLoss - entryLow, price * 0.001);
    const targets = [entryLow - risk * 1.5, entryLow - risk * 2.4].filter((x) => x > 0);
    return { entryZone: { low: entryLow, high: entryHigh }, stopLoss, targets, expectedRR: targets[1] ? (entryLow - targets[1]) / risk : null };
  }

  private structureScore(price: number, support: number, resistance: number, bias: TradeBias, setupType: SetupType) {
    if (!price || bias === 'WATCH') return 45;
    const distanceToSupport = support > 0 ? ((price - support) / price) * 100 : 2;
    const distanceToResistance = resistance > 0 ? ((resistance - price) / price) * 100 : 2;
    let score = 62;
    if (bias === 'LONG') {
      score += distanceToSupport < 0.8 ? 16 : distanceToSupport < 1.6 ? 9 : -4;
      score += distanceToResistance > 0.7 ? 10 : -12;
    } else {
      score += distanceToResistance < 0.8 ? 16 : distanceToResistance < 1.6 ? 9 : -4;
      score += distanceToSupport > 0.7 ? 10 : -12;
    }
    if (setupType === 'trend_pullback' || setupType === 'range_reversion') score += 6;
    if (setupType === 'no_setup') score -= 18;
    return clamp(score);
  }

  private scorePosition(position: any): PositionManagementInsight {
    const side = String(position?.side || '').toUpperCase();
    const entry = Number(position?.entryPrice || 0);
    const mark = Number(position?.currentPrice || 0);
    const stop = Number(position?.stopLoss || 0);
    const target = Number(position?.takeProfit || 0);
    const pnl = Number(position?.pnl || 0);
    const isLong = side === 'LONG';
    const favorable = entry > 0 && mark > 0 ? (isLong ? mark - entry : entry - mark) : 0;
    const risk = stop > 0 && entry > 0 ? Math.abs(entry - stop) : 0;
    const currentR = risk > 0 ? favorable / risk : null;
    const state = pnl > 0.01 ? 'winning' : pnl < -0.01 ? 'under_pressure' : 'flat';
    const distanceToStopPct = stop > 0 && mark > 0 ? Math.abs(mark - stop) / mark * 100 : null;
    const distanceToTargetPct = target > 0 && mark > 0 ? Math.abs(target - mark) / mark * 100 : null;
    const protectedStop = stop > 0 && entry > 0 && (isLong ? stop >= entry : stop <= entry);
    const holdScore = clamp(55 + (currentR || 0) * 18 + (protectedStop ? 10 : 0) - (state === 'under_pressure' ? 18 : 0));
    const reduceScore = clamp(35 + (currentR || 0) * 16 + (!protectedStop && state === 'winning' ? 12 : 0));
    const exitScore = clamp(state === 'under_pressure' ? 58 : 22 - (currentR || 0) * 8);
    const recommendation = state === 'winning'
      ? protectedStop ? 'Let runner work; trail behind structure if momentum continues.' : 'Protect profit: consider BE+ before giving the move back.'
      : state === 'under_pressure'
        ? 'Respect invalidation. Do not widen the stop while trade is under pressure.'
        : 'Hold only if structure remains valid; wait for momentum confirmation.';
    const reason = currentR !== null
      ? `${position.symbol} is at ${round(currentR, 2)}R with ${protectedStop ? 'protected' : 'unprotected'} stop posture.`
      : `${position.symbol} needs stop/target context for clean management scoring.`;

    return {
      symbol: String(position?.symbol || 'UNKNOWN'),
      side,
      state,
      holdScore: Math.round(holdScore),
      reduceScore: Math.round(reduceScore),
      exitScore: Math.round(exitScore),
      recommendation,
      reason,
      currentR: currentR === null ? null : round(currentR, 2),
      distanceToStopPct: distanceToStopPct === null ? null : round(distanceToStopPct, 2),
      distanceToTargetPct: distanceToTargetPct === null ? null : round(distanceToTargetPct, 2),
    };
  }

  private buildJournalMemory(entries: JournalEntry[]) {
    const closes = entries.filter((e) => e?.type === 'trade_close' && e.symbol);
    const bySymbol: TradeIntelligencePayload['journalMemory']['bySymbol'] = {};
    for (const close of closes) {
      const symbol = String(close.symbol || '').toUpperCase();
      if (!symbol) continue;
      const row = bySymbol[symbol] || { closes: 0, winRate: 0, avgPnl: 0, netPnl: 0 };
      row.closes += 1;
      row.netPnl += Number(close.pnl || 0);
      row.avgPnl = row.netPnl / row.closes;
      bySymbol[symbol] = row;
    }
    for (const [symbol, row] of Object.entries(bySymbol)) {
      const wins = closes.filter((e) => String(e.symbol || '').toUpperCase() === symbol && Number(e.pnl || 0) > 0).length;
      row.winRate = row.closes ? Math.round((wins / row.closes) * 100) : 0;
      row.avgPnl = round(row.avgPnl, 2);
      row.netPnl = round(row.netPnl, 2);
    }
    return { sampleSize: closes.length, bySymbol };
  }

  private buildPortfolioBrief(snapshot: RiskIntelSnapshot, top: TradeCandidate | null, positions: PositionManagementInsight[]) {
    if (positions.length > 0) {
      const underPressure = positions.filter((p) => p.state === 'under_pressure');
      const winners = positions.filter((p) => p.state === 'winning');
      return {
        stance: `Managing ${positions.length} open ${positions.length === 1 ? 'position' : 'positions'} while scanner keeps ranking new setups.`,
        mainRisk: underPressure.length ? `${underPressure.length} position(s) are under pressure; do not widen stops.` : 'Open risk is stable; focus on protecting winners and avoiding correlated overexposure.',
        bestOpportunity: top ? `${top.symbol} ${top.bias} ${top.setupType.replace(/_/g, ' ')} scored ${top.qualityScore}/100.` : 'No clean external opportunity ranked yet.',
        action: winners.length ? 'Protect profit with BE+/trail logic and let the strongest runner continue.' : 'Hold only valid positions; wait for higher-quality external setup before adding risk.',
      };
    }

    return {
      stance: top ? `Best scanner focus is ${top.symbol}; no open position management load right now.` : 'No clean candidate available.',
      mainRisk: snapshot.riskFlags?.[0] || 'No major platform risk flag currently reported.',
      bestOpportunity: top ? `${top.symbol} ${top.bias} ${top.setupType.replace(/_/g, ' ')} scored ${top.qualityScore}/100.` : 'Market scanner is waiting for cleaner structure.',
      action: top?.state === 'READY' ? `Prepare for ${top.bias} only after confirmation: ${top.confirm}` : top?.blocker || 'Keep scanning.',
    };
  }

  private thesis(symbol: string, bias: TradeBias, setupType: SetupType, regime: string, score: number) {
    if (bias === 'WATCH' || setupType === 'no_setup') return `${symbol} does not have a clean trade thesis yet.`;
    return `${symbol} ${bias} ${setupType.replace(/_/g, ' ')} in ${regime} regime; setup quality ${score}/100.`;
  }

  private confirmationText(bias: TradeBias, zone: { low: number | null; high: number | null }, setupType: SetupType) {
    if (bias === 'WATCH' || !zone.low || !zone.high) return 'Wait for cleaner direction, structure, and invalidation.';
    const low = round(zone.low, zone.low < 1 ? 5 : 2);
    const high = round(zone.high, zone.high < 1 ? 5 : 2);
    return `Need ${bias} confirmation around ${low}-${high}, with momentum holding and spread staying tight.`;
  }

  private estimatePrice(micro: RiskIntelSnapshot['microstructure'][number]) {
    const support = Number(micro.support || 0);
    const resistance = Number(micro.resistance || 0);
    if (support > 0 && resistance > 0) return (support + resistance) / 2;
    return Math.max(support, resistance, 0);
  }
}
