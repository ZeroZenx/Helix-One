import axios from 'axios';
import { RiskIntelSnapshot } from './RiskIntelService';
import { TradeIntelligencePayload } from './TradeIntelligenceService';

type JournalEntry = Record<string, any>;

export interface OperatorIntelligencePayload {
  generatedAt: string;
  multiTimeframe: {
    alignmentScore: number;
    marketBias: 'LONG' | 'SHORT' | 'MIXED' | 'NEUTRAL';
    symbols: Array<{
      symbol: string;
      alignment: 'aligned_long' | 'aligned_short' | 'mixed' | 'neutral' | 'unavailable';
      score: number;
      timeframes: Array<{
        interval: '5m' | '15m' | '1h' | '4h';
        bias: 'LONG' | 'SHORT' | 'NEUTRAL';
        strength: number;
        momentumPct: number;
        emaTrendPct: number;
        rsi14: number;
      }>;
      note: string;
    }>;
  };
  eventRisk: {
    level: 'low' | 'medium' | 'high';
    score: number;
    drivers: string[];
    headlines: Array<{ source: string; title: string; severity: 'low' | 'medium' | 'high' }>;
    action: string;
  };
  executionQuality: {
    grade: 'A' | 'B' | 'C' | 'D' | 'N/A';
    sampleSize: number;
    avgSlippageBps: number;
    worstSlippageBps: number;
    fillRatePct: number;
    rejectedSignals: number;
    notes: string[];
  };
  aiRulesAlignment: {
    score: number;
    state: 'aligned' | 'watch' | 'diverging';
    disagreements: Array<{
      ts: string;
      symbol: string;
      aiDecision: string;
      rulesDecision: string;
      reason: string;
    }>;
    note: string;
  };
  operatorBrief: {
    headline: string;
    priority: string;
    improvement: string;
    action: string;
  };
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
}

function round(n: number, places = 2) {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** places;
  return Math.round(n * p) / p;
}

export class OperatorIntelligenceService {
  async build(input: {
    symbols: string[];
    snapshot: RiskIntelSnapshot;
    tradeIntelligence: TradeIntelligencePayload;
    journalEntries: JournalEntry[];
    worker?: {
      aiGateDecision?: string;
      finalExecutionDecision?: string;
      lastReason?: string;
      lastReasonHuman?: string;
    };
  }): Promise<OperatorIntelligencePayload> {
    const [multiTimeframe, eventRisk, executionQuality, aiRulesAlignment] = await Promise.all([
      this.buildMultiTimeframe(input.symbols, input.snapshot),
      Promise.resolve(this.buildEventRisk(input.snapshot)),
      Promise.resolve(this.buildExecutionQuality(input.journalEntries)),
      Promise.resolve(this.buildAiRulesAlignment(input.journalEntries, input.worker)),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      multiTimeframe,
      eventRisk,
      executionQuality,
      aiRulesAlignment,
      operatorBrief: this.buildOperatorBrief({
        multiTimeframe,
        eventRisk,
        executionQuality,
        aiRulesAlignment,
        topCandidate: input.tradeIntelligence.topCandidate,
      }),
    };
  }

  private async buildMultiTimeframe(symbols: string[], snapshot: RiskIntelSnapshot): Promise<OperatorIntelligencePayload['multiTimeframe']> {
    const rows = await Promise.all(symbols.map(async (symbol) => {
      const fromSnapshot = snapshot.microstructure.find((m) => m.symbol === symbol);
      const tf5m = fromSnapshot && fromSnapshot.available
        ? {
            interval: '5m' as const,
            bias: this.biasFromMetrics(fromSnapshot.emaTrendPct, fromSnapshot.momentum15mPct, fromSnapshot.rsi14),
            strength: this.strengthFromMetrics(fromSnapshot.emaTrendPct, fromSnapshot.momentum15mPct, fromSnapshot.rsi14),
            momentumPct: round(fromSnapshot.momentum15mPct, 3),
            emaTrendPct: round(fromSnapshot.emaTrendPct, 3),
            rsi14: round(fromSnapshot.rsi14, 2),
          }
        : null;

      const fetched = await Promise.all(['15m', '1h', '4h'].map((interval) => this.fetchTimeframe(symbol, interval as '15m' | '1h' | '4h')));
      const timeframes = [tf5m, ...fetched].filter(Boolean) as OperatorIntelligencePayload['multiTimeframe']['symbols'][number]['timeframes'];
      if (!timeframes.length) {
        return {
          symbol,
          alignment: 'unavailable' as const,
          score: 0,
          timeframes,
          note: 'Timeframe data unavailable; do not trust directional confirmation.',
        };
      }

      const longCount = timeframes.filter((tf) => tf.bias === 'LONG').length;
      const shortCount = timeframes.filter((tf) => tf.bias === 'SHORT').length;
      const avgStrength = timeframes.reduce((sum, tf) => sum + tf.strength, 0) / timeframes.length;
      const agreement = Math.max(longCount, shortCount) / timeframes.length;
      const score = Math.round(clamp(avgStrength * 0.65 + agreement * 35));
      const alignment: 'aligned_long' | 'aligned_short' | 'mixed' | 'neutral' = longCount >= 3 ? 'aligned_long' : shortCount >= 3 ? 'aligned_short' : longCount === shortCount ? 'neutral' : 'mixed';
      const dominant = longCount > shortCount ? 'long' : shortCount > longCount ? 'short' : 'neutral';

      return {
        symbol,
        alignment,
        score,
        timeframes,
        note: alignment === 'mixed'
          ? `${symbol} has split timeframe evidence; wait for higher-timeframe agreement.`
          : alignment === 'neutral'
            ? `${symbol} is directionally neutral across timeframes.`
            : `${symbol} has ${dominant} alignment across ${Math.max(longCount, shortCount)}/${timeframes.length} tracked timeframes.`,
      };
    }));

    const avgScore = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0;
    const alignedLong = rows.filter((row) => row.alignment === 'aligned_long').length;
    const alignedShort = rows.filter((row) => row.alignment === 'aligned_short').length;
    const marketBias = alignedLong > alignedShort ? 'LONG' : alignedShort > alignedLong ? 'SHORT' : avgScore >= 60 ? 'MIXED' : 'NEUTRAL';

    return {
      alignmentScore: avgScore,
      marketBias,
      symbols: rows.sort((a, b) => b.score - a.score),
    };
  }

  private async fetchTimeframe(symbol: string, interval: '15m' | '1h' | '4h') {
    try {
      const res = await axios.get('https://fapi.binance.com/fapi/v1/klines', {
        params: { symbol, interval, limit: 120 },
        timeout: 7000,
      });
      const closes = (res.data || []).map((k: any) => Number(k[4] || 0)).filter((x: number) => x > 0);
      if (closes.length < 20) return null;
      const last = closes[closes.length - 1];
      const lookback = interval === '15m' ? 4 : interval === '1h' ? 3 : 2;
      const prior = closes[Math.max(0, closes.length - 1 - lookback)] || last;
      const momentumPct = prior > 0 ? ((last - prior) / prior) * 100 : 0;
      const ema20 = this.ema(closes, 20);
      const ema50 = this.ema(closes, 50);
      const emaTrendPct = last > 0 ? ((ema20 - ema50) / last) * 100 : 0;
      const rsi14 = this.rsi(closes, 14);
      return {
        interval,
        bias: this.biasFromMetrics(emaTrendPct, momentumPct, rsi14),
        strength: this.strengthFromMetrics(emaTrendPct, momentumPct, rsi14),
        momentumPct: round(momentumPct, 3),
        emaTrendPct: round(emaTrendPct, 3),
        rsi14: round(rsi14, 2),
      };
    } catch {
      return null;
    }
  }

  private buildEventRisk(snapshot: RiskIntelSnapshot): OperatorIntelligencePayload['eventRisk'] {
    const drivers: string[] = [];
    const headlines = (snapshot.newsHeadlines || []).slice(0, 8).map((headline) => {
      const text = `${headline.source} ${headline.title}`.toLowerCase();
      const high = /(hack|exploit|sec|lawsuit|halt|outage|delist|cpi|fomc|rate decision|fed|war|sanction|liquidation)/i.test(text);
      const medium = /(etf|inflation|jobs|unemployment|funding|binance|regulation|macro|volatility)/i.test(text);
      const severity: 'low' | 'medium' | 'high' = high ? 'high' : medium ? 'medium' : 'low';
      if (severity !== 'low') drivers.push(`${severity}: ${headline.title}`);
      return { ...headline, severity };
    });

    if ((snapshot.riskFlags || []).some((flag) => /funding|event|news|volatility/i.test(String(flag)))) {
      drivers.push(...snapshot.riskFlags.filter((flag) => /funding|event|news|volatility/i.test(String(flag))).slice(0, 3));
    }
    if (!headlines.length) drivers.push('Live headline feed unavailable; treat news context as incomplete.');

    const highCount = headlines.filter((h) => h.severity === 'high').length;
    const mediumCount = headlines.filter((h) => h.severity === 'medium').length;
    const score = clamp(highCount * 35 + mediumCount * 15 + (drivers.some((d) => /unavailable/i.test(d)) ? 15 : 0));
    const level = score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low';

    return {
      level,
      score: Math.round(score),
      drivers: drivers.slice(0, 5),
      headlines,
      action: level === 'high'
        ? 'Stand down or cut aggressiveness until event risk clears.'
        : level === 'medium'
          ? 'Trade only A-grade setups and demand cleaner confirmation.'
          : 'News risk is acceptable; normal selection rules apply.',
    };
  }

  private buildExecutionQuality(entries: JournalEntry[]): OperatorIntelligencePayload['executionQuality'] {
    const opens = entries.filter((e) => e?.type === 'trade_open');
    const rejects = entries.filter((e) => e?.type === 'signal_rejected');
    const withSlip = opens
      .map((e) => Number(e?.execution?.slippageBps ?? e?.slippageBps))
      .filter((v) => Number.isFinite(v));
    const avgSlippageBps = withSlip.length ? withSlip.reduce((sum, v) => sum + Math.abs(v), 0) / withSlip.length : 0;
    const worstSlippageBps = withSlip.length ? Math.max(...withSlip.map((v) => Math.abs(v))) : 0;
    const attempts = opens.length + rejects.length;
    const fillRatePct = attempts ? (opens.length / attempts) * 100 : 0;
    const notes: string[] = [];
    if (!withSlip.length) notes.push('Slippage telemetry will improve as new trade_open records include execution details.');
    if (avgSlippageBps > 8) notes.push('Average slippage is elevated; prefer limit entries or tighter liquidity filters.');
    if (fillRatePct > 0 && fillRatePct < 45) notes.push('Low fill rate; entry logic may be too aggressive or blocked by rules.');
    if (!notes.length) notes.push('Execution quality is within current telemetry limits.');
    const grade = !attempts ? 'N/A' : avgSlippageBps <= 3 && fillRatePct >= 70 ? 'A' : avgSlippageBps <= 7 && fillRatePct >= 55 ? 'B' : avgSlippageBps <= 12 ? 'C' : 'D';

    return {
      grade,
      sampleSize: opens.length,
      avgSlippageBps: round(avgSlippageBps, 2),
      worstSlippageBps: round(worstSlippageBps, 2),
      fillRatePct: round(fillRatePct, 1),
      rejectedSignals: rejects.length,
      notes,
    };
  }

  private buildAiRulesAlignment(entries: JournalEntry[], worker?: {
    aiGateDecision?: string;
    finalExecutionDecision?: string;
    lastReason?: string;
    lastReasonHuman?: string;
  }): OperatorIntelligencePayload['aiRulesAlignment'] {
    const sorted = entries
      .slice()
      .sort((a, b) => new Date(String(b?.ts || 0)).getTime() - new Date(String(a?.ts || 0)).getTime());
    const opens = sorted.filter((e) => e?.type === 'trade_open');
    const rejects = sorted.filter((e) => e?.type === 'signal_rejected');
    const disagreements: OperatorIntelligencePayload['aiRulesAlignment']['disagreements'] = [];

    for (const decision of sorted.filter((e) => e?.type === 'ai_decision').slice(0, 60)) {
      const ts = new Date(String(decision.ts || 0)).getTime();
      const symbol = String(decision.symbol || '').toUpperCase();
      const aiDecision = String(decision.decision || '').toUpperCase();
      if (!symbol || !Number.isFinite(ts)) continue;
      const nearbyOpen = opens.find((e) => String(e.symbol || '').toUpperCase() === symbol && Math.abs(new Date(String(e.ts || 0)).getTime() - ts) <= 120_000);
      const nearbyReject = rejects.find((e) => String(e.symbol || '').toUpperCase() === symbol && Math.abs(new Date(String(e.ts || 0)).getTime() - ts) <= 120_000);
      if (aiDecision === 'TRADE' && !nearbyOpen) {
        disagreements.push({
          ts: String(decision.ts || ''),
          symbol,
          aiDecision,
          rulesDecision: nearbyReject ? 'REJECTED' : 'NO_EXECUTION',
          reason: String(nearbyReject?.reason || decision.gateResult || 'AI wanted trade but execution did not follow.'),
        });
      }
      if (aiDecision === 'NO_TRADE' && nearbyOpen) {
        disagreements.push({
          ts: String(decision.ts || ''),
          symbol,
          aiDecision,
          rulesDecision: 'TRADE_OPENED',
          reason: 'Rules/execution opened a trade near an AI no-trade decision; review sequencing and journal timing.',
        });
      }
    }

    const currentAi = String(worker?.aiGateDecision || '').toUpperCase();
    const currentFinal = String(worker?.finalExecutionDecision || '').toUpperCase();
    if (currentAi && currentFinal && currentAi !== 'N/A' && currentAi !== currentFinal) {
      disagreements.unshift({
        ts: new Date().toISOString(),
        symbol: 'CURRENT',
        aiDecision: currentAi,
        rulesDecision: currentFinal,
        reason: String(worker?.lastReasonHuman || worker?.lastReason || 'Current AI gate and final execution decision differ.'),
      });
    }

    const sample = Math.max(1, sorted.filter((e) => e?.type === 'ai_decision').slice(0, 60).length);
    const score = Math.round(clamp(100 - (disagreements.length / sample) * 120));
    const state = score >= 82 ? 'aligned' : score >= 62 ? 'watch' : 'diverging';
    return {
      score,
      state,
      disagreements: disagreements.slice(0, 8),
      note: state === 'aligned'
        ? 'AI and rules are mostly agreeing; no immediate arbitration issue.'
        : state === 'watch'
          ? 'Some AI/rules divergence detected; keep reviewing blocked trade candidates.'
          : 'AI/rules divergence is elevated; review gates, prompt output, and execution sequencing.',
    };
  }

  private buildOperatorBrief(input: {
    multiTimeframe: OperatorIntelligencePayload['multiTimeframe'];
    eventRisk: OperatorIntelligencePayload['eventRisk'];
    executionQuality: OperatorIntelligencePayload['executionQuality'];
    aiRulesAlignment: OperatorIntelligencePayload['aiRulesAlignment'];
    topCandidate: TradeIntelligencePayload['topCandidate'];
  }): OperatorIntelligencePayload['operatorBrief'] {
    const top = input.topCandidate;
    const blockers = [
      input.eventRisk.level === 'high' ? 'event risk is high' : '',
      input.multiTimeframe.alignmentScore < 55 ? 'timeframe alignment is weak' : '',
      input.executionQuality.grade === 'D' ? 'execution quality is poor' : '',
      input.aiRulesAlignment.state === 'diverging' ? 'AI/rules disagreement is elevated' : '',
    ].filter(Boolean);

    return {
      headline: top
        ? `${top.symbol} is the best ranked setup at ${top.qualityScore}/100; market bias is ${input.multiTimeframe.marketBias}.`
        : `No ranked setup is strong enough; market bias is ${input.multiTimeframe.marketBias}.`,
      priority: blockers[0] || 'Find A-grade alignment, then protect execution quality.',
      improvement: input.executionQuality.grade === 'N/A'
        ? 'Collect more execution telemetry so slippage and fill quality become measurable.'
        : `Current execution grade is ${input.executionQuality.grade}; average slippage ${input.executionQuality.avgSlippageBps} bps.`,
      action: blockers.length
        ? `Do not increase aggression yet: ${blockers.join(', ')}.`
        : top?.state === 'READY'
          ? `Only act if ${top.symbol} confirms ${top.bias} with timeframe alignment intact.`
          : 'Keep scanning; wait for confirmation and cleaner alignment.',
    };
  }

  private biasFromMetrics(emaTrendPct: number, momentumPct: number, rsi14: number): 'LONG' | 'SHORT' | 'NEUTRAL' {
    const score = Number(emaTrendPct || 0) * 1.2 + Number(momentumPct || 0) * 0.9 + (Number(rsi14 || 50) - 50) * 0.015;
    if (score > 0.12) return 'LONG';
    if (score < -0.12) return 'SHORT';
    return 'NEUTRAL';
  }

  private strengthFromMetrics(emaTrendPct: number, momentumPct: number, rsi14: number) {
    return Math.round(clamp(45 + Math.abs(Number(emaTrendPct || 0)) * 80 + Math.abs(Number(momentumPct || 0)) * 70 + Math.abs(Number(rsi14 || 50) - 50) * 0.5));
  }

  private ema(values: number[], period: number) {
    if (!values.length) return 0;
    const k = 2 / (period + 1);
    return values.reduce((ema, value, idx) => idx === 0 ? value : value * k + ema * (1 - k), values[0]);
  }

  private rsi(values: number[], period = 14) {
    if (values.length <= period) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = values.length - period; i < values.length; i += 1) {
      const delta = values[i] - values[i - 1];
      if (delta >= 0) gains += delta;
      else losses -= delta;
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }
}
