import fs from 'fs';
import path from 'path';

export type ObjectiveMetric = 'slippageAdjustedExpectancyR' | 'expectancyR' | 'sharpe';
export type PromotionDecision = 'kept' | 'reverted' | 'insufficient_evidence';
export type Regime = 'trend' | 'range' | 'event_driven' | 'unknown';

export interface ExperimentContractV1 {
  objective: ObjectiveMetric;
  window: {
    trainStart: string;
    trainEnd: string;
    testStart: string;
    testEnd: string;
  };
  minSamples: number;
  hardRiskGates: {
    maxDrawdownPct: number;
    maxTurnover: number;
    requirePositiveEdge: boolean;
    minExpectedNetEdgeBps: number;
  };
  rollbackTarget: string;
  atomicChange: {
    type: 'prompt' | 'param' | 'risk_template';
    changedKeys: string[];
  };
  regimeSpecialized?: boolean;
  requiredRegimes?: Regime[];
  improvementDelta?: number;
}

export interface ExperimentMetrics {
  sampleSize: number;
  maxDrawdownPct: number;
  turnover: number;
  expectancyR: number;
  slippageAdjustedExpectancyR: number;
  sharpe: number;
  expectedNetEdgeBps: number;
  hardRiskFailed?: boolean;
}

export interface RegimeSlice {
  regime: Regime;
  sampleSize: number;
  slippageAdjustedExpectancyR: number;
  maxDrawdownPct: number;
  turnover: number;
}

export interface PromotionEvaluationResult {
  decision: PromotionDecision;
  reasons: string[];
  postmortem: string;
  score: {
    baseline: number;
    candidate: number;
    delta: number;
  };
  regimeCoverage: {
    uniqueRegimes: Regime[];
    sufficient: boolean;
  };
}

export interface ExperimentRunRecord {
  id: string;
  createdAt: string;
  contract: ExperimentContractV1;
  baselineMetrics: ExperimentMetrics;
  candidateMetrics: ExperimentMetrics;
  regimeSlices: RegimeSlice[];
  result: PromotionEvaluationResult;
}

export class ExperimentGovernanceService {
  private runsPath = path.resolve(process.cwd(), 'data', 'experiment-runs.json');

  validateContract(input: Partial<ExperimentContractV1>) {
    const errors: string[] = [];

    if (!input.objective || !['slippageAdjustedExpectancyR', 'expectancyR', 'sharpe'].includes(input.objective)) {
      errors.push('objective must be one of slippageAdjustedExpectancyR|expectancyR|sharpe');
    }

    if (!input.window?.trainStart || !input.window?.trainEnd || !input.window?.testStart || !input.window?.testEnd) {
      errors.push('window.trainStart/trainEnd/testStart/testEnd are required');
    }

    if ((input.minSamples ?? 0) < 1) errors.push('minSamples must be >= 1');

    if (!input.hardRiskGates) {
      errors.push('hardRiskGates are required');
    } else {
      if (input.hardRiskGates.maxDrawdownPct <= 0) errors.push('hardRiskGates.maxDrawdownPct must be > 0');
      if (input.hardRiskGates.maxTurnover <= 0) errors.push('hardRiskGates.maxTurnover must be > 0');
    }

    if (!input.rollbackTarget || String(input.rollbackTarget).trim().length === 0) {
      errors.push('rollbackTarget is required');
    }

    if (!input.atomicChange || !input.atomicChange.type) {
      errors.push('atomicChange.type is required');
    } else {
      if (!['prompt', 'param', 'risk_template'].includes(input.atomicChange.type)) {
        errors.push('atomicChange.type must be prompt|param|risk_template');
      }
      if (!Array.isArray(input.atomicChange.changedKeys) || input.atomicChange.changedKeys.length !== 1) {
        errors.push('atomicChange.changedKeys must contain exactly one changed key (atomic change)');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  evaluatePromotion(input: {
    contract: ExperimentContractV1;
    baselineMetrics: ExperimentMetrics;
    candidateMetrics: ExperimentMetrics;
    regimeSlices: RegimeSlice[];
  }): PromotionEvaluationResult {
    const reasons: string[] = [];
    const { contract, baselineMetrics, candidateMetrics, regimeSlices } = input;

    const baseline = this.metricValue(contract.objective, baselineMetrics);
    const candidate = this.metricValue(contract.objective, candidateMetrics);
    const delta = candidate - baseline;
    const requiredDelta = contract.improvementDelta ?? 0;

    // hard gates always win
    if (candidateMetrics.hardRiskFailed) reasons.push('hard_risk_gate_failed');
    if (candidateMetrics.maxDrawdownPct > contract.hardRiskGates.maxDrawdownPct) reasons.push('drawdown_above_threshold');
    if (candidateMetrics.turnover > contract.hardRiskGates.maxTurnover) reasons.push('turnover_above_threshold');
    if (contract.hardRiskGates.requirePositiveEdge && candidateMetrics.expectedNetEdgeBps <= contract.hardRiskGates.minExpectedNetEdgeBps) {
      reasons.push('non_positive_edge_after_costs');
    }

    if (candidateMetrics.sampleSize < contract.minSamples) reasons.push('insufficient_sample_size');

    const uniqueRegimes = Array.from(new Set(regimeSlices.filter((r) => r.sampleSize > 0).map((r) => r.regime)));
    const requiredRegimes: Regime[] = contract.requiredRegimes && contract.requiredRegimes.length > 0
      ? contract.requiredRegimes
      : ['trend', 'range', 'event_driven'];

    const hasRegimeCoverage = contract.regimeSpecialized === true
      ? true
      : requiredRegimes.every((r) => uniqueRegimes.includes(r));

    if (!hasRegimeCoverage) reasons.push('insufficient_regime_diversity');

    if (delta <= requiredDelta) reasons.push('objective_improvement_below_delta');

    let decision: PromotionDecision;
    if (reasons.some((x) => ['hard_risk_gate_failed', 'drawdown_above_threshold', 'turnover_above_threshold', 'non_positive_edge_after_costs'].includes(x))) {
      decision = 'reverted';
    } else if (reasons.some((x) => ['insufficient_sample_size', 'insufficient_regime_diversity'].includes(x))) {
      decision = 'insufficient_evidence';
    } else if (reasons.includes('objective_improvement_below_delta')) {
      decision = 'reverted';
    } else {
      decision = 'kept';
      reasons.push('all_gates_passed');
    }

    const postmortem = this.buildPostmortem(decision, reasons, contract, baselineMetrics, candidateMetrics);

    return {
      decision,
      reasons,
      postmortem,
      score: { baseline, candidate, delta },
      regimeCoverage: { uniqueRegimes, sufficient: hasRegimeCoverage },
    };
  }

  recordRun(input: {
    contract: ExperimentContractV1;
    baselineMetrics: ExperimentMetrics;
    candidateMetrics: ExperimentMetrics;
    regimeSlices: RegimeSlice[];
  }) {
    const result = this.evaluatePromotion(input);
    const runs = this.readRuns();
    const record: ExperimentRunRecord = {
      id: `run_${Date.now()}`,
      createdAt: new Date().toISOString(),
      contract: input.contract,
      baselineMetrics: input.baselineMetrics,
      candidateMetrics: input.candidateMetrics,
      regimeSlices: input.regimeSlices,
      result,
    };
    runs.unshift(record);
    this.writeRuns(runs.slice(0, 500));
    return record;
  }

  leaderboard(limit = 20) {
    const runs = this.readRuns().slice(0, Math.max(1, limit));
    return runs
      .map((run) => {
        const delta = run.result.score.delta;
        const stabilityPenalty = (Math.max(0, run.candidateMetrics.maxDrawdownPct - run.baselineMetrics.maxDrawdownPct) * 0.5)
          + (Math.max(0, run.candidateMetrics.turnover - run.baselineMetrics.turnover) * 0.01);
        const rankScore = delta - stabilityPenalty;
        return {
          id: run.id,
          createdAt: run.createdAt,
          decision: run.result.decision,
          objective: run.contract.objective,
          delta,
          stabilityPenalty,
          rankScore,
          postmortem: run.result.postmortem,
        };
      })
      .sort((a, b) => b.rankScore - a.rankScore);
  }

  listRuns(limit = 50) {
    return this.readRuns().slice(0, Math.max(1, limit));
  }

  private metricValue(metric: ObjectiveMetric, m: ExperimentMetrics): number {
    if (metric === 'sharpe') return m.sharpe;
    if (metric === 'expectancyR') return m.expectancyR;
    return m.slippageAdjustedExpectancyR;
  }

  private buildPostmortem(
    decision: PromotionDecision,
    reasons: string[],
    contract: ExperimentContractV1,
    baselineMetrics: ExperimentMetrics,
    candidateMetrics: ExperimentMetrics
  ) {
    if (decision === 'kept') {
      return `Kept: ${contract.atomicChange.type}/${contract.atomicChange.changedKeys[0]} improved ${contract.objective} while staying within drawdown/turnover/edge gates.`;
    }
    if (decision === 'insufficient_evidence') {
      return `Insufficient evidence: ${reasons.join(', ')}. Increase sample size/regime coverage before promotion.`;
    }
    return `Reverted: ${reasons.join(', ')}. Baseline kept at ${contract.rollbackTarget}. Candidate metrics ${JSON.stringify(candidateMetrics)} vs baseline ${JSON.stringify(baselineMetrics)}.`;
  }

  private readRuns(): ExperimentRunRecord[] {
    if (!fs.existsSync(this.runsPath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.runsPath, 'utf8')) as ExperimentRunRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeRuns(runs: ExperimentRunRecord[]) {
    fs.mkdirSync(path.dirname(this.runsPath), { recursive: true });
    fs.writeFileSync(this.runsPath, JSON.stringify(runs, null, 2));
  }
}
