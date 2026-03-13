import fs from 'fs';
import path from 'path';

export type HelixLayer = 'macro' | 'sector' | 'style' | 'risk' | 'execution';

export interface CandidateTrade {
  symbol: string;
  side: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  thesis: string;
  regimeBias?: 'risk_on' | 'risk_off' | 'neutral';
  sector?: string;
  style?: string;
}

export interface LayerEnvelope<T> {
  layer: HelixLayer;
  generatedAt: string;
  payload: T;
}

export interface MarketSnapshot {
  symbol: string;
  price: number;
  change24hPct: number;
  trendStrength: number; // 0-100
  volatilityPct: number;
  spreadBps: number;
  volumeScore: number; // 0-100
  sector?: string;
}

export interface PortfolioConstraints {
  equityUsd: number;
  availableMarginUsd: number;
  currentDrawdownPct: number;
  maxDrawdownPct: number;
  perTradeRiskPct: number;
  maxOpenPositions: number;
  openPositions: number;
  slippageBps: number;
  feesBps: number;
}

interface AgentWeightBook {
  updatedAt: string;
  floor: number;
  ceiling: number;
  weights: Record<string, number>;
}

interface PromptExperiment {
  id: string;
  startedAt: string;
  status: 'running' | 'kept' | 'reverted';
  objectiveMetric: 'expectancy' | 'sharpe' | 'max_drawdown';
  lookbackDays: number;
  baselineValue: number;
  candidateValue?: number;
  promptFile: string;
  summary: string;
}

export interface ExecutionPlan {
  decision: 'TRADE' | 'NO_TRADE';
  symbol: string;
  side: 'BUY' | 'SELL' | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskUsd: number;
  positionSizeUsd: number;
  expectedRMultiple: number;
  expectedNetEdgeBps: number;
  reasons: string[];
  killSwitchTriggered: boolean;
  handoff: {
    macro: LayerEnvelope<{ regime: 'risk_on' | 'risk_off' | 'neutral'; confidence: number }>;
    sector: LayerEnvelope<{ preferredSectors: string[]; blockedSectors: string[] }>;
    style: LayerEnvelope<{ preferredStyle: string; minConfidence: number }>;
    risk: LayerEnvelope<{ approved: boolean; blocks: string[]; adjustedSizeMultiplier: number }>;
  };
}

export class HelixEvolutionService {
  private weightsPath = path.resolve(process.cwd(), 'data', 'darwinian-weights.json');
  private experimentsPath = path.resolve(process.cwd(), 'data', 'prompt-experiments.json');

  evaluateTrade(snapshot: MarketSnapshot, candidate: CandidateTrade, constraints: PortfolioConstraints): ExecutionPlan {
    const macro = this.buildMacroLayer(snapshot);
    const sector = this.buildSectorLayer(snapshot, macro.payload.regime);
    const style = this.buildStyleLayer(candidate, macro.payload.regime);
    const risk = this.buildRiskLayer(snapshot, candidate, constraints, macro.payload.regime, style.payload.minConfidence);

    const stopDistance = Math.abs(candidate.entry - candidate.stopLoss);
    const riskUsd = constraints.equityUsd * (constraints.perTradeRiskPct / 100);
    const safeStopDistance = stopDistance <= 0 ? candidate.entry * 0.003 : stopDistance;
    const rawSize = riskUsd / safeStopDistance;
    const adjustedSize = Math.max(0, rawSize * risk.payload.adjustedSizeMultiplier);
    const positionSizeUsd = adjustedSize * candidate.entry;

    const grossEdgeBps = ((Math.abs(candidate.takeProfit - candidate.entry) / candidate.entry) * 10000) * (candidate.confidence / 100);
    const costsBps = constraints.slippageBps + constraints.feesBps;
    const expectedNetEdgeBps = grossEdgeBps - costsBps;
    const expectedRMultiple = stopDistance > 0 ? Math.abs(candidate.takeProfit - candidate.entry) / stopDistance : 0;

    const blocks = [...risk.payload.blocks];
    if (macro.payload.regime === 'risk_off' && candidate.side === 'BUY') blocks.push('macro_regime_risk_off_for_longs');
    if (macro.payload.regime === 'risk_on' && candidate.side === 'SELL') blocks.push('macro_regime_risk_on_for_shorts');
    if (candidate.confidence < style.payload.minConfidence) blocks.push('below_style_min_confidence');
    if (expectedRMultiple < 1.5) blocks.push('rr_below_minimum');
    if (expectedNetEdgeBps <= 0) blocks.push('negative_edge_after_costs');

    const decision = blocks.length === 0 ? 'TRADE' : 'NO_TRADE';

    return {
      decision,
      symbol: candidate.symbol,
      side: decision === 'TRADE' ? candidate.side : null,
      entry: decision === 'TRADE' ? candidate.entry : null,
      stopLoss: decision === 'TRADE' ? candidate.stopLoss : null,
      takeProfit: decision === 'TRADE' ? candidate.takeProfit : null,
      riskUsd,
      positionSizeUsd: decision === 'TRADE' ? positionSizeUsd : 0,
      expectedRMultiple,
      expectedNetEdgeBps,
      reasons: decision === 'TRADE' ? ['passed_layered_gates', `regime=${macro.payload.regime}`, `style=${style.payload.preferredStyle}`] : blocks,
      killSwitchTriggered: blocks.includes('kill_switch_drawdown'),
      handoff: { macro, sector, style, risk },
    };
  }

  updateDarwinianWeights(performanceByAgent: Record<string, number>, floor = 0.3, ceiling = 2.5): AgentWeightBook {
    const book = this.readWeightBook(floor, ceiling);
    const entries = Object.entries(performanceByAgent).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return book;

    const q = Math.max(1, Math.floor(entries.length / 4));
    const top = new Set(entries.slice(0, q).map(([agent]) => agent));
    const bottom = new Set(entries.slice(-q).map(([agent]) => agent));

    for (const [agent] of entries) {
      const current = book.weights[agent] ?? 1;
      if (top.has(agent)) book.weights[agent] = Math.min(ceiling, current * 1.05);
      else if (bottom.has(agent)) book.weights[agent] = Math.max(floor, current * 0.95);
      else book.weights[agent] = current;
    }

    book.updatedAt = new Date().toISOString();
    this.writeJson(this.weightsPath, book);
    return book;
  }

  startPromptExperiment(input: {
    promptFile: string;
    objectiveMetric: 'expectancy' | 'sharpe' | 'max_drawdown';
    lookbackDays: number;
    baselineValue: number;
    summary: string;
  }): PromptExperiment {
    const experiments = this.readExperiments();
    const experiment: PromptExperiment = {
      id: `exp_${Date.now()}`,
      startedAt: new Date().toISOString(),
      status: 'running',
      objectiveMetric: input.objectiveMetric,
      lookbackDays: input.lookbackDays,
      baselineValue: input.baselineValue,
      promptFile: input.promptFile,
      summary: input.summary,
    };
    experiments.unshift(experiment);
    this.writeJson(this.experimentsPath, experiments);
    return experiment;
  }

  completePromptExperiment(id: string, candidateValue: number): PromptExperiment | null {
    const experiments = this.readExperiments();
    const target = experiments.find((x) => x.id === id);
    if (!target) return null;

    target.candidateValue = candidateValue;
    if (target.objectiveMetric === 'max_drawdown') {
      target.status = candidateValue < target.baselineValue ? 'kept' : 'reverted';
    } else {
      target.status = candidateValue > target.baselineValue ? 'kept' : 'reverted';
    }

    this.writeJson(this.experimentsPath, experiments);
    return target;
  }

  listPromptExperiments(limit = 20): PromptExperiment[] {
    return this.readExperiments().slice(0, Math.max(1, limit));
  }

  private buildMacroLayer(snapshot: MarketSnapshot): LayerEnvelope<{ regime: 'risk_on' | 'risk_off' | 'neutral'; confidence: number }> {
    let regime: 'risk_on' | 'risk_off' | 'neutral' = 'neutral';
    if (snapshot.change24hPct > 1 && snapshot.trendStrength >= 55) regime = 'risk_on';
    else if (snapshot.change24hPct < -1 || snapshot.volatilityPct > 3) regime = 'risk_off';

    const confidence = Math.max(35, Math.min(92, Math.round((snapshot.trendStrength * 0.6) + (Math.max(0, 100 - snapshot.spreadBps * 4) * 0.4))));
    return { layer: 'macro', generatedAt: new Date().toISOString(), payload: { regime, confidence } };
  }

  private buildSectorLayer(snapshot: MarketSnapshot, regime: 'risk_on' | 'risk_off' | 'neutral'): LayerEnvelope<{ preferredSectors: string[]; blockedSectors: string[] }> {
    const sector = snapshot.sector || 'unknown';
    const defensive = ['utilities', 'healthcare', 'consumer_staples'];
    const cyclical = ['technology', 'financials', 'consumer_discretionary'];

    const preferredSectors = regime === 'risk_on' ? cyclical : regime === 'risk_off' ? defensive : [sector];
    const blockedSectors = regime === 'risk_on' ? defensive : regime === 'risk_off' ? cyclical : [];

    return { layer: 'sector', generatedAt: new Date().toISOString(), payload: { preferredSectors, blockedSectors } };
  }

  private buildStyleLayer(candidate: CandidateTrade, regime: 'risk_on' | 'risk_off' | 'neutral'): LayerEnvelope<{ preferredStyle: string; minConfidence: number }> {
    let preferredStyle = candidate.style || 'balanced';
    let minConfidence = 65;

    if (regime === 'risk_on') {
      preferredStyle = 'momentum';
      minConfidence = 62;
    } else if (regime === 'risk_off') {
      preferredStyle = 'mean_reversion_defensive';
      minConfidence = 72;
    }

    return {
      layer: 'style',
      generatedAt: new Date().toISOString(),
      payload: { preferredStyle, minConfidence },
    };
  }

  private buildRiskLayer(
    snapshot: MarketSnapshot,
    candidate: CandidateTrade,
    constraints: PortfolioConstraints,
    regime: 'risk_on' | 'risk_off' | 'neutral',
    minConfidence: number
  ): LayerEnvelope<{ approved: boolean; blocks: string[]; adjustedSizeMultiplier: number }> {
    const blocks: string[] = [];
    let adjustedSizeMultiplier = 1;

    if (constraints.currentDrawdownPct >= constraints.maxDrawdownPct) blocks.push('kill_switch_drawdown');
    if (constraints.openPositions >= constraints.maxOpenPositions) blocks.push('max_open_positions_reached');
    if (snapshot.spreadBps > 12) blocks.push('spread_too_wide');
    if (snapshot.volumeScore < 35) blocks.push('insufficient_liquidity_score');
    if (candidate.confidence < minConfidence) blocks.push('confidence_below_gate');

    if (regime === 'risk_off') adjustedSizeMultiplier *= 0.6;
    if (snapshot.volatilityPct > 2.5) adjustedSizeMultiplier *= 0.7;
    if (snapshot.spreadBps > 7) adjustedSizeMultiplier *= 0.8;

    return {
      layer: 'risk',
      generatedAt: new Date().toISOString(),
      payload: {
        approved: blocks.length === 0,
        blocks,
        adjustedSizeMultiplier,
      },
    };
  }

  private readWeightBook(floor: number, ceiling: number): AgentWeightBook {
    if (!fs.existsSync(this.weightsPath)) {
      return { updatedAt: new Date().toISOString(), floor, ceiling, weights: {} };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.weightsPath, 'utf8')) as AgentWeightBook;
      return {
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        floor: typeof parsed.floor === 'number' ? parsed.floor : floor,
        ceiling: typeof parsed.ceiling === 'number' ? parsed.ceiling : ceiling,
        weights: parsed.weights || {},
      };
    } catch {
      return { updatedAt: new Date().toISOString(), floor, ceiling, weights: {} };
    }
  }

  private readExperiments(): PromptExperiment[] {
    if (!fs.existsSync(this.experimentsPath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.experimentsPath, 'utf8')) as PromptExperiment[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeJson(filePath: string, payload: unknown) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  }
}
