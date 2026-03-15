import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { fetchWithTimeout, getTradingApiBaseUrl } from '../src/utils/api';

const API = getTradingApiBaseUrl();

type Banner = { type: 'success' | 'error'; text: string } | null;

type UiPrefs = {
  baseCurrency: 'USDT' | 'USDC' | 'BUSD';
  slippageTolerancePct: number;
  tradeConfirmation: boolean;
  orderTimeoutSec: number;
  useDeepSeekBrain: boolean;
};

const defaultUiPrefs: UiPrefs = {
  baseCurrency: 'USDT',
  slippageTolerancePct: 0.25,
  tradeConfirmation: false,
  orderTimeoutSec: 30,
  useDeepSeekBrain: true,
};

type SettingsTab = 'General' | 'Trading' | 'Risk Management' | 'Notifications' | 'Advanced';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const [banner, setBanner] = useState<Banner>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string>('');

  const [adminKey, setAdminKey] = useState('');
  const [masterApiKey, setMasterApiKey] = useState('');
  const [masterSecretKey, setMasterSecretKey] = useState('');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [testnet, setTestnet] = useState(false);
  const [globalTradingEnabled, setGlobalTradingEnabled] = useState(false);
  const [portfolioTradingEnabled, setPortfolioTradingEnabled] = useState(false);
  const [deepseekBalance, setDeepseekBalance] = useState(10000);

  const [maxDailyLossPct, setMaxDailyLossPct] = useState(3);
  const [maxPositionSizePct, setMaxPositionSizePct] = useState(10);
  const [maxLeverage, setMaxLeverage] = useState(5);
  const [killSwitchDrawdownPct, setKillSwitchDrawdownPct] = useState(5);
  const [cooldownMinutes, setCooldownMinutes] = useState(30);
  const [maxTradesPerDay, setMaxTradesPerDay] = useState(5);
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState(3);
  const [minConfidence, setMinConfidence] = useState(0.7);
  const [deepseekDecisionEnabled, setDeepseekDecisionEnabled] = useState(true);
  const [notificationsPush, setNotificationsPush] = useState(true);
  const [notificationsEmail, setNotificationsEmail] = useState(false);
  const [notificationsTelegram, setNotificationsTelegram] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramUserId, setTelegramUserId] = useState('');
  const [telegramPairingCode, setTelegramPairingCode] = useState('');
  const [telegramMinSeverity, setTelegramMinSeverity] = useState<'info' | 'warning' | 'critical'>('info');
  const [telegramRateLimitSec, setTelegramRateLimitSec] = useState(120);
  const [testingTelegram, setTestingTelegram] = useState(false);

  const [hasMasterApiKey, setHasMasterApiKey] = useState(false);
  const [hasMasterSecretKey, setHasMasterSecretKey] = useState(false);
  const [hasDeepseekApiKey, setHasDeepseekApiKey] = useState(false);
  const [hasTelegramBotToken, setHasTelegramBotToken] = useState(false);

  const [status, setStatus] = useState<any>(null);
  const [briefing, setBriefing] = useState<any>(null);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(defaultUiPrefs);
  const [activeTab, setActiveTab] = useState<SettingsTab>('General');

  const [helixEvalOutput, setHelixEvalOutput] = useState<any>(null);
  const [darwinOutput, setDarwinOutput] = useState<any>(null);
  const [experimentsOutput, setExperimentsOutput] = useState<any>(null);
  const [walkForwardOutput, setWalkForwardOutput] = useState<any>(null);
  const [contractValidateOutput, setContractValidateOutput] = useState<any>(null);
  const [promotionEvalOutput, setPromotionEvalOutput] = useState<any>(null);
  const [leaderboardOutput, setLeaderboardOutput] = useState<any>(null);
  const [runsOutput, setRunsOutput] = useState<any>(null);
  const [liveGovernanceOutput, setLiveGovernanceOutput] = useState<any>(null);
  const [lastLivePayload, setLastLivePayload] = useState<any>(null);
  const [promotionDryRun, setPromotionDryRun] = useState(true);
  const [promotionConfirmText, setPromotionConfirmText] = useState('');
  const [executionAudit, setExecutionAudit] = useState<any[]>([]);
  const [workerStatus, setWorkerStatus] = useState<any>(null);

  const authHeaders = useMemo(() => (adminKey ? { 'x-admin-key': adminKey } : {}), [adminKey]);

  const riskValidation = useMemo(() => {
    const errors: string[] = [];
    if (maxDailyLossPct <= 0 || maxDailyLossPct > 100) errors.push('Max daily loss must be 0-100%.');
    if (maxPositionSizePct <= 0 || maxPositionSizePct > 100) errors.push('Max position size must be 0-100%.');
    if (killSwitchDrawdownPct <= 0 || killSwitchDrawdownPct > 100) errors.push('Kill-switch drawdown must be 0-100%.');
    if (maxLeverage < 1 || maxLeverage > 125) errors.push('Max leverage must be between 1 and 125.');
    if (cooldownMinutes < 0 || cooldownMinutes > 1440) errors.push('Cooldown must be 0-1440 minutes.');
    if (maxTradesPerDay < 1 || maxTradesPerDay > 100) errors.push('Max trades/day must be 1-100.');
    if (maxConsecutiveLosses < 1 || maxConsecutiveLosses > 20) errors.push('Max consecutive losses must be 1-20.');
    if (minConfidence < 0 || minConfidence > 1) errors.push('Min confidence must be 0.00-1.00.');
    return errors;
  }, [maxDailyLossPct, maxPositionSizePct, killSwitchDrawdownPct, maxLeverage, cooldownMinutes, maxTradesPerDay, maxConsecutiveLosses, minConfidence]);

  function applySettings(s: any) {
    const isMasked = (v: string) => /^\*+$/.test(v || '');

    setHasMasterApiKey(Boolean(s.hasMasterApiKey));
    setHasMasterSecretKey(Boolean(s.hasMasterSecretKey));
    setHasDeepseekApiKey(Boolean(s.hasDeepseekApiKey));
    setHasTelegramBotToken(Boolean(s.hasTelegramBotToken));

    if (typeof s.masterApiKey === 'string' && s.masterApiKey && !isMasked(s.masterApiKey)) {
      setMasterApiKey(s.masterApiKey);
    } else if (Boolean(s.hasMasterApiKey) && !masterApiKey) {
      setMasterApiKey('********');
    }

    if (typeof s.masterSecretKey === 'string' && s.masterSecretKey && !isMasked(s.masterSecretKey)) {
      setMasterSecretKey(s.masterSecretKey);
    } else if (Boolean(s.hasMasterSecretKey) && !masterSecretKey) {
      setMasterSecretKey('********');
    }

    if (typeof s.deepseekApiKey === 'string' && s.deepseekApiKey && !isMasked(s.deepseekApiKey)) {
      setDeepseekApiKey(s.deepseekApiKey);
    } else if (Boolean(s.hasDeepseekApiKey) && !deepseekApiKey) {
      setDeepseekApiKey('********');
    }

    setTestnet(Boolean(s.testnet));

    setGlobalTradingEnabled(Boolean(s.tradingEnabled));

    const account = s.modelAccounts?.[0] || {};
    setPortfolioTradingEnabled(Boolean(account.tradingEnabled));
    setDeepseekBalance(Number(account.balance || 10000));

    const r = s.riskSettings || {};
    setMaxDailyLossPct(Number(r.maxDailyLossPct ?? 3));
    setMaxPositionSizePct(Number(r.maxPositionSizePct ?? 10));
    setMaxLeverage(Number(r.maxLeverage ?? 5));
    setKillSwitchDrawdownPct(Number(r.killSwitchDrawdownPct ?? 5));
    setCooldownMinutes(Number(r.cooldownMinutes ?? 30));
    setMaxTradesPerDay(Number(r.maxTradesPerDay ?? 5));
    setMaxConsecutiveLosses(Number(r.maxConsecutiveLosses ?? 3));
    setMinConfidence(Number(r.minConfidence ?? 0.7));
    setDeepseekDecisionEnabled(r.deepseekDecisionEnabled !== false);

    const n = s.notificationSettings || {};
    setNotificationsPush(Boolean(n.pushEnabled ?? true));
    setNotificationsEmail(Boolean(n.emailEnabled ?? false));
    setNotificationsTelegram(Boolean(n.telegramEnabled ?? false));
    setNotificationEmail(String(n.email || ''));
    if (typeof n.telegramBotToken === 'string' && n.telegramBotToken && !isMasked(String(n.telegramBotToken))) {
      setTelegramBotToken(String(n.telegramBotToken));
    } else if (Boolean(s.hasTelegramBotToken) && !telegramBotToken) {
      setTelegramBotToken('********');
    }
    setTelegramUserId(String(n.telegramUserId || ''));
    setTelegramPairingCode(String(n.telegramPairingCode || ''));
    setTelegramMinSeverity((n.telegramMinSeverity || 'info') as 'info' | 'warning' | 'critical');
    setTelegramRateLimitSec(Number(n.telegramRateLimitSec ?? 120));
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setRefreshing(true);

    let loadedCore = false;
    try {
      const settingsRes = await fetchWithTimeout(`${API}/settings`, {}, 4000);
      if (!settingsRes.ok) throw new Error('Unable to load settings');
      const settingsData = await settingsRes.json();
      applySettings(settingsData);
      loadedCore = true;
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error: any) {
      if (!silent) {
        const isTimeout = error?.name === 'AbortError';
        setBanner({
          type: 'error',
          text: isTimeout ? 'Settings request timed out. Check API availability.' : 'Failed to refresh trading settings.',
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }

    try {
      const [statusResult, briefingResult, workerResult] = await Promise.allSettled([
        fetchWithTimeout(`${API}/status`, {}, 2500),
        fetchWithTimeout(`${API}/daily-briefing`, {}, 2500),
        fetchWithTimeout(`${API}/worker-status`, {}, 2500),
      ]);

      if (statusResult.status === 'fulfilled' && statusResult.value.ok) {
        setStatus(await statusResult.value.json());
      }

      if (briefingResult.status === 'fulfilled' && briefingResult.value.ok) {
        setBriefing(await briefingResult.value.json());
      }

      if (workerResult.status === 'fulfilled' && workerResult.value.ok) {
        setWorkerStatus(await workerResult.value.json());
      }

      if (adminKey) {
        try {
          const auditRes = await fetchWithTimeout(`${API}/helix/promotion-audit?limit=30`, { headers: { ...authHeaders } }, 2500);
          if (auditRes.ok) {
            const audit = await auditRes.json();
            if (Array.isArray(audit?.entries)) setExecutionAudit(audit.entries);
          }
        } catch {
          // ignore audit fetch failures
        }
      }

      if (!loadedCore && statusResult.status !== 'fulfilled' && briefingResult.status !== 'fulfilled') {
        setBanner({ type: 'error', text: 'Unable to load settings data from API.' });
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('helix_ui_prefs_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        setUiPrefs({ ...defaultUiPrefs, ...parsed });
      }
    } catch {
      // ignore local preference parse errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('helix_ui_prefs_v1', JSON.stringify(uiPrefs));
    } catch {
      // ignore local preference save errors
    }
  }, [uiPrefs]);

  useEffect(() => {
    if (!adminKey) return;
    fetchWithTimeout(`${API}/helix/promotion-audit?limit=30`, { headers: { ...authHeaders } }, 2500)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.entries)) setExecutionAudit(data.entries);
      })
      .catch(() => {
        // ignore initial audit fetch failure
      });
  }, [adminKey]);

  async function saveSettings() {
    if (riskValidation.length) {
      setBanner({ type: 'error', text: riskValidation[0] });
      return;
    }

    setSaving(true);
    setBanner(null);
    try {
      const includeSecret = (v: string) => {
        const t = String(v || '').trim();
        return t.length > 0 && !/^\*+$/.test(t);
      };

      const payload: any = {
        testnet,
        tradingEnabled: globalTradingEnabled,
        modelAccounts: [
          {
            modelId: 1,
            modelName: 'DeepSeek Chat V3.1',
            tradingEnabled: portfolioTradingEnabled,
            balance: deepseekBalance,
          },
        ],
        riskSettings: {
          maxDailyLossPct,
          maxPositionSizePct,
          maxLeverage,
          killSwitchDrawdownPct,
          cooldownMinutes,
          maxTradesPerDay,
          maxConsecutiveLosses,
          minConfidence,
          deepseekDecisionEnabled,
        },
        notificationSettings: {
          pushEnabled: notificationsPush,
          emailEnabled: notificationsEmail,
          telegramEnabled: notificationsTelegram,
          email: notificationEmail,
          telegramUserId,
          telegramPairingCode,
          telegramMinSeverity,
          telegramRateLimitSec,
        },
      };

      if (includeSecret(masterApiKey)) payload.masterApiKey = masterApiKey.trim();
      if (includeSecret(masterSecretKey)) payload.masterSecretKey = masterSecretKey.trim();
      if (includeSecret(deepseekApiKey)) payload.deepseekApiKey = deepseekApiKey.trim();
      if (includeSecret(telegramBotToken)) payload.notificationSettings.telegramBotToken = telegramBotToken.trim();

      const res = await fetchWithTimeout(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      const savedAt = new Date().toLocaleTimeString();
      setLastSavedAt(savedAt);
      setBanner({ type: 'success', text: `Settings saved at ${savedAt}.` });
      await load(true);
    } catch (e: any) {
      setBanner({ type: 'error', text: e?.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setBanner(null);
    try {
      const res = await fetchWithTimeout(`${API}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ apiKey: masterApiKey, secretKey: masterSecretKey, testnet }),
      });
      const data = await res.json();
      if (res.ok && data.connected) {
        setBanner({ type: 'success', text: 'Binance connection successful.' });
      } else {
        const msg = String(data.error || 'Connection failed.');
        if (msg.includes('Invalid API-key') && testnet) {
          setBanner({ type: 'error', text: 'Invalid key for testnet. Disable "Use testnet" or use Binance Futures testnet keys.' });
        } else {
          setBanner({ type: 'error', text: msg });
        }
      }
    } catch {
      setBanner({ type: 'error', text: 'Connection test failed.' });
    } finally {
      setTesting(false);
    }
  }

  async function testTelegramConnection() {
    setTestingTelegram(true);
    setBanner(null);
    try {
      const res = await fetchWithTimeout(`${API}/telegram/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          botToken: telegramBotToken,
          chatId: telegramUserId,
          pairingCode: telegramPairingCode,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setBanner({ type: 'success', text: 'Telegram linked and test message sent.' });
      } else {
        setBanner({ type: 'error', text: String(data?.error || 'Telegram test failed.') });
      }
    } catch (e: any) {
      setBanner({ type: 'error', text: e?.message || 'Telegram test failed.' });
    } finally {
      setTestingTelegram(false);
    }
  }

  async function toggleTrading(next: boolean) {
    const ok = window.confirm(`${next ? 'Enable' : 'Disable'} global trading?`);
    if (!ok) return;

    const res = await fetchWithTimeout(`${API}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ enabled: next }),
    });

    if (res.ok) {
      setBanner({ type: 'success', text: `Trading ${next ? 'enabled' : 'disabled'}.` });
      setGlobalTradingEnabled(next);
      await load(true);
    } else {
      setBanner({ type: 'error', text: 'Failed to toggle trading.' });
    }
  }

  async function updatePortfolioTradingEnabled(next: boolean) {
    const previous = portfolioTradingEnabled;
    setPortfolioTradingEnabled(next);

    try {
      const payload: any = {
        testnet,
        tradingEnabled: globalTradingEnabled,
        modelAccounts: [
          {
            modelId: 1,
            modelName: 'DeepSeek Chat V3.1',
            tradingEnabled: next,
            balance: deepseekBalance,
          },
        ],
        riskSettings: {
          maxDailyLossPct,
          maxPositionSizePct,
          maxLeverage,
          killSwitchDrawdownPct,
          cooldownMinutes,
          maxTradesPerDay,
          maxConsecutiveLosses,
          minConfidence,
        },
        notificationSettings: {
          pushEnabled: notificationsPush,
          emailEnabled: notificationsEmail,
          telegramEnabled: notificationsTelegram,
          email: notificationEmail,
          telegramUserId,
          telegramPairingCode,
          telegramMinSeverity,
          telegramRateLimitSec,
        },
      };

      const res = await fetchWithTimeout(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      }, 6000);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'save_failed');

      setLastSavedAt(new Date().toLocaleTimeString());
      setBanner({ type: 'success', text: `DeepSeek Portfolio Trading ${next ? 'enabled' : 'disabled'} and saved.` });
      await load(true);
    } catch (e: any) {
      setPortfolioTradingEnabled(previous);
      setBanner({ type: 'error', text: e?.message || 'Failed to persist DeepSeek Portfolio Trading.' });
    }
  }

  async function closeAllPositions() {
    const ok = window.confirm('Close ALL open positions now? This is immediate.');
    if (!ok) return;

    const res = await fetchWithTimeout(`${API}/close-positions`, { method: 'POST', headers: { ...authHeaders } });
    if (res.ok) {
      setBanner({ type: 'success', text: 'All positions closed.' });
      await load(true);
    } else {
      setBanner({ type: 'error', text: 'Failed to close positions.' });
    }
  }

  async function runHelixEvaluateSample() {
    try {
      const payload = {
        snapshot: {
          symbol: 'BTCUSDT',
          price: 68000,
          change24hPct: 1.2,
          trendStrength: 68,
          volatilityPct: 1.5,
          spreadBps: 3.8,
          volumeScore: 74,
          sector: 'technology',
        },
        candidate: {
          symbol: 'BTCUSDT',
          side: 'BUY',
          entry: 68000,
          stopLoss: 66750,
          takeProfit: 70600,
          confidence: 78,
          thesis: 'Momentum continuation above 24h range.',
          style: 'momentum',
        },
        constraints: {
          equityUsd: Number(account.balance || 10000),
          availableMarginUsd: Number(account.availableMargin || 5000),
          currentDrawdownPct: 1.2,
          maxDrawdownPct: killSwitchDrawdownPct,
          perTradeRiskPct: 1.0,
          maxOpenPositions: 4,
          openPositions: 1,
          slippageBps: 4,
          feesBps: 6,
        },
      };

      const res = await fetchWithTimeout(`${API}/helix/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'helix evaluate failed');
      setHelixEvalOutput(data);
      setBanner({ type: 'success', text: 'Helix evaluate sample completed.' });
    } catch (e: any) {
      setBanner({ type: 'error', text: e?.message || 'Helix evaluate sample failed.' });
    }
  }

  async function runHelixEvaluateLive() {
    try {
      const riskRes = await fetchWithTimeout(`${API}/risk-context?symbols=BTCUSDT,ETHUSDT`, {}, 3500);
      const riskData = riskRes.ok ? await riskRes.json() : null;

      const micro = Array.isArray(riskData?.microstructure)
        ? riskData.microstructure.find((m: any) => m.symbol === 'BTCUSDT') || riskData.microstructure[0]
        : null;

      const price = Number(micro?.markPrice || 68000);
      const trendStrength = Math.max(10, Math.min(95, Number(riskData?.regimeConfidence || market.regimeConfidence || 60)));
      const change24hPct = Number(micro?.change24hPct || 0);
      const spreadBps = Number(micro?.spreadBps || 5);
      const volatilityPct = Number(micro?.atrPct || 1.2);
      const volumeScore = spreadBps <= 3 ? 80 : spreadBps <= 7 ? 60 : 40;

      const stopDistance = Math.max(price * 0.008, 1);
      const payload = {
        snapshot: {
          symbol: 'BTCUSDT',
          price,
          change24hPct,
          trendStrength,
          volatilityPct,
          spreadBps,
          volumeScore,
          sector: 'technology',
        },
        candidate: {
          symbol: 'BTCUSDT',
          side: change24hPct >= 0 ? 'BUY' : 'SELL',
          entry: price,
          stopLoss: change24hPct >= 0 ? price - stopDistance : price + stopDistance,
          takeProfit: change24hPct >= 0 ? price + stopDistance * 2 : price - stopDistance * 2,
          confidence: Math.max(55, Math.min(90, trendStrength)),
          thesis: `Live regime=${market.regime || 'unclear'} change24h=${change24hPct.toFixed(2)}%`,
          style: market.regime === 'range' ? 'mean_reversion' : 'momentum',
        },
        constraints: {
          equityUsd: Number(account.balance || deepseekBalance || 10000),
          availableMarginUsd: Number(account.availableMargin || 0),
          currentDrawdownPct: Number(status?.activePortfolios?.[0]
            ? ((Number(status.activePortfolios[0].currentBalance || 0) < Number(deepseekBalance || 1))
              ? ((Number(deepseekBalance || 1) - Number(status.activePortfolios[0].currentBalance || 0)) / Number(deepseekBalance || 1)) * 100
              : 0)
            : 0),
          maxDrawdownPct: killSwitchDrawdownPct,
          perTradeRiskPct: Math.min(1.5, Math.max(0.25, maxPositionSizePct / 20)),
          maxOpenPositions: Math.max(1, Math.min(10, maxTradesPerDay)),
          openPositions: Number(status?.activePortfolios?.[0]?.positionsCount || 0),
          slippageBps: Number(uiPrefs.slippageTolerancePct || 0.25) * 100,
          feesBps: testnet ? 2 : 6,
        },
      };

      const res = await fetchWithTimeout(`${API}/helix/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'helix evaluate live failed');
      setLastLivePayload(payload);
      setHelixEvalOutput({ mode: 'live', payload, response: data });
      setBanner({ type: 'success', text: 'Helix LIVE evaluate completed.' });
    } catch (e: any) {
      setBanner({ type: 'error', text: e?.message || 'Helix live evaluate failed.' });
    }
  }

  async function promoteLivePlanToTradeSignal() {
    try {
      const plan = helixEvalOutput?.response?.plan;
      const payload = lastLivePayload;
      if (!plan || !payload) throw new Error('Run "Layered Evaluate LIVE" first.');

      const hardBlocks: string[] = [];
      if (plan.decision !== 'TRADE') hardBlocks.push('decision_not_trade');
      if (Boolean(plan.killSwitchTriggered)) hardBlocks.push('kill_switch_triggered');
      if (Number(plan.expectedRMultiple || 0) < 1.5) hardBlocks.push('rr_below_1.5');
      if (Number(plan.expectedNetEdgeBps || 0) <= 0) hardBlocks.push('edge_not_positive_after_costs');

      const side = plan.side === 'BUY' || plan.side === 'SELL' ? plan.side : null;
      const entry = Number(plan.entry || 0);
      const stopLoss = Number(plan.stopLoss || 0);
      const takeProfit = Number(plan.takeProfit || 0);
      if (!side || !entry || !stopLoss || !takeProfit) hardBlocks.push('missing_trade_fields');

      const confidenceRaw = Number(payload?.candidate?.confidence || 0);
      const confidence = Math.max(0, Math.min(1, confidenceRaw / 100));
      if (confidence < minConfidence) hardBlocks.push('confidence_below_runtime_floor');

      if (hardBlocks.length > 0) {
        throw new Error(`Promotion blocked by safety checks: ${hardBlocks.join(', ')}`);
      }

      const confirmText = [
        `Promote LIVE plan to executable signal?`,
        `Symbol: ${plan.symbol}`,
        `Side: ${side}`,
        `Entry: ${entry}`,
        `Stop: ${stopLoss}`,
        `TP: ${takeProfit}`,
        `Confidence: ${(confidence * 100).toFixed(1)}%`,
      ].join('\n');

      const ok = window.confirm(confirmText);
      if (!ok) return;

      const requiredPhrase = 'PROMOTE LIVE';
      if (promotionConfirmText.trim().toUpperCase() !== requiredPhrase) {
        throw new Error(`Type confirmation phrase exactly: ${requiredPhrase}`);
      }

      const signal = {
        modelId: '1',
        symbol: String(plan.symbol || 'BTCUSDT'),
        side,
        type: 'MARKET',
        confidence,
        reason: `Promoted from Helix LIVE layered plan | R=${Number(plan.expectedRMultiple || 0).toFixed(2)} edgeBps=${Number(plan.expectedNetEdgeBps || 0).toFixed(1)}`,
        stopLoss,
        takeProfit,
        timestamp: new Date().toISOString(),
      };

      if (promotionDryRun) {
        await appendAudit({
          type: 'promotion_dry_run',
          symbol: signal.symbol,
          side: signal.side,
          confidence: signal.confidence,
          reason: signal.reason,
          checks: 'passed',
        });
        setBanner({ type: 'success', text: 'Dry-run complete: plan passed all checks (no signal sent).' });
        return;
      }

      const res = await fetchWithTimeout(`${API}/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(signal),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'signal_submit_failed');

      await appendAudit({
        type: 'promotion_submitted',
        symbol: signal.symbol,
        side: signal.side,
        confidence: signal.confidence,
        signalResult: data,
      });
      setBanner({ type: 'success', text: 'LIVE plan promoted and signal submitted.' });
      await load(true);
    } catch (e: any) {
      await appendAudit({ type: 'promotion_failed', error: e?.message || 'unknown_error' });
      setBanner({ type: 'error', text: e?.message || 'Failed to promote live plan.' });
    }
  }

  async function runDarwinSample() {
    try {
      const payload = {
        floor: 0.3,
        ceiling: 2.5,
        performanceByAgent: {
          macro: 0.42,
          sector: 0.15,
          style: 0.31,
          cro: 0.56,
          execution: -0.07,
          cio: 0.11,
        },
      };
      const res = await fetchWithTimeout(`${API}/helix/darwin/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'darwin update failed');
      setDarwinOutput(data);
      setBanner({ type: 'success', text: 'Darwinian weights updated with sample payload.' });
    } catch (e: any) {
      setBanner({ type: 'error', text: e?.message || 'Darwin sample failed.' });
    }
  }

  async function runPromptExperimentSample() {
    try {
      const startRes = await fetchWithTimeout(`${API}/helix/prompt-experiments/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          promptFile: 'prompts/system_trading_brain.md',
          objectiveMetric: 'expectancy',
          lookbackDays: 5,
          baselineValue: 0.08,
          summary: 'Sample run from Settings UI',
        }),
      });
      const started = await startRes.json();
      if (!startRes.ok) throw new Error(started?.error || 'start failed');

      const completeRes = await fetchWithTimeout(`${API}/helix/prompt-experiments/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ id: started?.experiment?.id, candidateValue: 0.11 }),
      });
      const completed = await completeRes.json();
      if (!completeRes.ok) throw new Error(completed?.error || 'complete failed');

      const listRes = await fetchWithTimeout(`${API}/helix/prompt-experiments?limit=10`, { headers: { ...authHeaders } });
      const listed = await listRes.json();
      if (!listRes.ok) throw new Error(listed?.error || 'list failed');

      setExperimentsOutput({ started, completed, listed });
      setBanner({ type: 'success', text: 'Prompt experiment sample lifecycle completed.' });
    } catch (e: any) {
      setBanner({ type: 'error', text: e?.message || 'Prompt experiment sample failed.' });
    }
  }

  async function runWalkForwardSample() {
    try {
      const payload = {
        trades: [
          { ts: '2026-03-01T00:00:00.000Z', symbol: 'BTCUSDT', side: 'BUY', entry: 62000, exit: 62800, feesBps: 4, slippageBps: 3 },
          { ts: '2026-03-02T00:00:00.000Z', symbol: 'BTCUSDT', side: 'SELL', entry: 62800, exit: 62350, feesBps: 4, slippageBps: 3 },
          { ts: '2026-03-03T00:00:00.000Z', symbol: 'ETHUSDT', side: 'BUY', entry: 3400, exit: 3465, feesBps: 4, slippageBps: 4 },
          { ts: '2026-03-04T00:00:00.000Z', symbol: 'ETHUSDT', side: 'BUY', entry: 3465, exit: 3432, feesBps: 4, slippageBps: 4 },
        ],
        windows: [
          {
            trainStart: '2026-03-01T00:00:00.000Z',
            trainEnd: '2026-03-02T23:59:59.000Z',
            testStart: '2026-03-03T00:00:00.000Z',
            testEnd: '2026-03-04T23:59:59.000Z',
          },
        ],
      };
      const res = await fetchWithTimeout(`${API}/helix/walk-forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'walk-forward failed');
      setWalkForwardOutput(data);
      setBanner({ type: 'success', text: 'Walk-forward sample completed.' });
    } catch (e: any) {
      setBanner({ type: 'error', text: e?.message || 'Walk-forward sample failed.' });
    }
  }

  async function runExperimentGovernanceSamples() {
    try {
      const contract = {
        objective: 'slippageAdjustedExpectancyR',
        window: {
          trainStart: '2026-03-01T00:00:00.000Z',
          trainEnd: '2026-03-07T23:59:59.000Z',
          testStart: '2026-03-08T00:00:00.000Z',
          testEnd: '2026-03-12T23:59:59.000Z',
        },
        minSamples: 30,
        hardRiskGates: {
          maxDrawdownPct: 8,
          maxTurnover: 80,
          requirePositiveEdge: true,
          minExpectedNetEdgeBps: 0,
        },
        rollbackTarget: 'prompts/system_trading_brain.md@main',
        atomicChange: {
          type: 'prompt',
          changedKeys: ['entry_filter.threshold'],
        },
        improvementDelta: 0.01,
      };

      const baselineMetrics = {
        sampleSize: 44,
        maxDrawdownPct: 6.2,
        turnover: 54,
        expectancyR: 0.12,
        slippageAdjustedExpectancyR: 0.09,
        sharpe: 1.05,
        expectedNetEdgeBps: 11,
      };

      const candidateMetrics = {
        sampleSize: 49,
        maxDrawdownPct: 6.4,
        turnover: 58,
        expectancyR: 0.14,
        slippageAdjustedExpectancyR: 0.12,
        sharpe: 1.22,
        expectedNetEdgeBps: 14,
      };

      const regimeSlices = [
        { regime: 'trend', sampleSize: 18, slippageAdjustedExpectancyR: 0.13, maxDrawdownPct: 4.8, turnover: 20 },
        { regime: 'range', sampleSize: 16, slippageAdjustedExpectancyR: 0.10, maxDrawdownPct: 5.9, turnover: 21 },
        { regime: 'event_driven', sampleSize: 15, slippageAdjustedExpectancyR: 0.11, maxDrawdownPct: 6.4, turnover: 17 },
      ];

      const validateRes = await fetchWithTimeout(`${API}/helix/experiment-contract/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ contract }),
      });
      const validateData = await validateRes.json();
      if (!validateRes.ok) throw new Error(validateData?.error || 'contract validation failed');
      setContractValidateOutput(validateData);

      const evalRes = await fetchWithTimeout(`${API}/helix/experiment-contract/evaluate-promotion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ contract, baselineMetrics, candidateMetrics, regimeSlices }),
      });
      const evalData = await evalRes.json();
      if (!evalRes.ok) throw new Error(evalData?.error || 'promotion evaluation failed');
      setPromotionEvalOutput(evalData);

      const leaderboardRes = await fetchWithTimeout(`${API}/helix/experiment-contract/leaderboard?limit=10`, { headers: { ...authHeaders } });
      const leaderboardData = await leaderboardRes.json();
      if (!leaderboardRes.ok) throw new Error(leaderboardData?.error || 'leaderboard failed');
      setLeaderboardOutput(leaderboardData);

      const runsRes = await fetchWithTimeout(`${API}/helix/experiment-contract/runs?limit=10`, { headers: { ...authHeaders } });
      const runsData = await runsRes.json();
      if (!runsRes.ok) throw new Error(runsData?.error || 'runs fetch failed');
      setRunsOutput(runsData);

      setBanner({ type: 'success', text: 'Experiment governance samples completed.' });
    } catch (e: any) {
      setBanner({ type: 'error', text: e?.message || 'Experiment governance sample failed.' });
    }
  }

  async function runExperimentGovernanceLive() {
    try {
      const payload = {
        allocatedBalance: deepseekBalance,
        minSamples: 30,
        contract: {
          objective: 'slippageAdjustedExpectancyR',
          hardRiskGates: {
            maxDrawdownPct: killSwitchDrawdownPct,
            maxTurnover: 120,
            minExpectedNetEdgeBps: 0,
          },
          rollbackTarget: 'prompts/system_trading_brain.md@main',
          atomicChange: { type: 'prompt', changedKeys: ['live.auto_feed'] },
          improvementDelta: 0,
          regimeSpecialized: false,
        },
      };

      const liveRes = await fetchWithTimeout(`${API}/helix/experiment-contract/live-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });
      const liveData = await liveRes.json();
      if (!liveRes.ok) throw new Error(liveData?.error || 'live governance evaluate failed');
      setLiveGovernanceOutput(liveData);

      const leaderboardRes = await fetchWithTimeout(`${API}/helix/experiment-contract/leaderboard?limit=10`, { headers: { ...authHeaders } });
      const leaderboardData = await leaderboardRes.json();
      if (leaderboardRes.ok) setLeaderboardOutput(leaderboardData);

      const runsRes = await fetchWithTimeout(`${API}/helix/experiment-contract/runs?limit=10`, { headers: { ...authHeaders } });
      const runsData = await runsRes.json();
      if (runsRes.ok) setRunsOutput(runsData);

      setBanner({ type: 'success', text: 'Live governance auto-feed evaluation completed.' });
    } catch (e: any) {
      setBanner({ type: 'error', text: e?.message || 'Live governance evaluation failed.' });
    }
  }

  const appendAudit = async (entry: any) => {
    const normalized = { ts: new Date().toISOString(), ...entry };
    setExecutionAudit((prev) => [normalized, ...prev].slice(0, 30));

    if (!adminKey) return;
    try {
      const res = await fetchWithTimeout(`${API}/helix/promotion-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(normalized),
      }, 2500);

      if (res.ok) {
        const data = await res.json();
        if (data?.entry) {
          setExecutionAudit((prev) => [data.entry, ...prev.filter((x) => x.ts !== normalized.ts || x.type !== normalized.type)].slice(0, 30));
        }
      }
    } catch {
      // keep local audit even if persistence fails
    }
  };

  const account = briefing?.account || {};
  const market = briefing?.market || {};

  const livePlan = helixEvalOutput?.response?.plan;
  const governanceRecord = liveGovernanceOutput?.record;
  const governanceResult = governanceRecord?.result;
  const evidenceCount = Number(liveGovernanceOutput?.inputs?.candidateMetrics?.sampleSize || 0);
  const evidenceTarget = Number(liveGovernanceOutput?.inputs?.contract?.minSamples || 30);

  const fallbackAction = workerStatus?.lastAction === 'trade_opened'
    ? 'TRADE OPENED'
    : Number(market.regimeConfidence || 0) >= 60
      ? 'TRADE CANDIDATE'
      : 'WAIT / NO TRADE';

  const traderSummary = {
    actionNow: livePlan?.decision === 'TRADE' ? 'TRADE CANDIDATE' : fallbackAction,
    confidencePct: Number(helixEvalOutput?.payload?.candidate?.confidence || market.regimeConfidence || 0),
    riskUsd: Number(livePlan?.riskUsd || 0),
    positionUsd: Number(livePlan?.positionSizeUsd || 0),
    expectedEdgeBps: Number(livePlan?.expectedNetEdgeBps || 0),
    rMultiple: Number(livePlan?.expectedRMultiple || 0),
    rationale: Array.isArray(livePlan?.reasons) && livePlan.reasons.length
      ? livePlan.reasons
      : [
          `worker=${String(workerStatus?.lastAction || 'unknown')}`,
          `reason=${String(workerStatus?.lastReason || 'n/a')}`,
          `regime=${String(market.regime || 'unknown')}`,
        ],
    promotionDecision: governanceResult?.decision || 'n/a',
    promotionReasons: Array.isArray(governanceResult?.reasons) ? governanceResult.reasons : [],
  };

  const labRecommendation = evidenceCount < evidenceTarget
    ? 'No action needed now. Let auto-trading continue and collect more closed trades.'
    : 'Weekly checks ready: run Governance LIVE Auto-Feed and Walk-Forward, then review.';

  return (
    <>
      <Head>
        <title>HELIX.ONE | Settings</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen text-slate-100" style={{ fontFamily: 'IBM Plex Sans, Space Grotesk, sans-serif', background: 'radial-gradient(1200px 800px at 20% 0%, #1a2438 0%, #0b101a 40%, #05070c 100%)' }}>
        <div className="mx-auto max-w-[1500px] px-4 md:px-8 py-5">
          <header className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-4 md:p-5 shadow-2xl shadow-black/30">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold tracking-wide" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  <span className="text-emerald-300">HELIX</span>.ONE
                </div>
                <span className="text-xl font-semibold">Settings</span>
              </div>
              <div className="flex items-center gap-3">
                <a href="/" className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-medium">Dashboard</a>
              </div>
            </div>
          </header>

          <div className="mt-5 grid grid-cols-1 xl:grid-cols-12 gap-4">
            <aside className="xl:col-span-2 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-3">
              <div className="space-y-1 text-sm">
                {(['General', 'Trading', 'Risk Management', 'Notifications', 'Advanced'] as SettingsTab[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setActiveTab(item)}
                    className={`w-full text-left rounded-lg px-3 py-2 transition ${
                      activeTab === item
                        ? 'bg-cyan-400/20 border border-cyan-300/40 text-cyan-100'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </aside>

            <main className="xl:col-span-10 grid grid-cols-1 lg:grid-cols-12 gap-4">
              {banner && (
                <div className={`lg:col-span-12 rounded-lg px-4 py-3 text-sm ${banner.type === 'success' ? 'bg-emerald-900/50 text-emerald-100 border border-emerald-500/40' : 'bg-red-900/50 text-red-100 border border-red-500/40'}`}>
                  {banner.text}
                </div>
              )}

              {loading && !lastUpdated && <div className="lg:col-span-12 text-sm text-slate-300">Loading settings...</div>}
              <div className="lg:col-span-12 text-xs text-slate-400">
                {refreshing ? 'Refreshing…' : `Last updated: ${lastUpdated || '—'}`}
              </div>
              {lastSavedAt && <div className="lg:col-span-12 text-xs text-emerald-300">Last saved: {lastSavedAt}</div>}

              {activeTab === 'General' && (
              <Panel className="lg:col-span-4" title="General">
                <TextField label="Admin Key" type="password" value={adminKey} onChange={setAdminKey} />
                <TextField label="Binance API Key" type="password" value={masterApiKey} onChange={setMasterApiKey} placeholder={hasMasterApiKey ? '********' : ''} status={hasMasterApiKey ? 'Saved' : 'Not set'} />
                <TextField label="Binance API Secret" type="password" value={masterSecretKey} onChange={setMasterSecretKey} placeholder={hasMasterSecretKey ? '********' : ''} status={hasMasterSecretKey ? 'Saved' : 'Not set'} />
                <TextField label="DeepSeek API Key" type="password" value={deepseekApiKey} onChange={setDeepseekApiKey} placeholder={hasDeepseekApiKey ? '********' : ''} status={hasDeepseekApiKey ? 'Saved' : 'Not set'} />

                <div className="pt-2">
                  <Toggle label="Trading Mode (Live/Testnet)" checked={!testnet} onChange={(v) => setTestnet(!v)} onLabel="Live" offLabel="Testnet" />
                </div>

                <div className="mt-3 flex gap-2">
                  <button className="flex-1 rounded-lg border border-cyan-300/30 bg-cyan-500/20 hover:bg-cyan-500/30 px-3 py-2 text-sm" onClick={testConnection} disabled={testing}>{testing ? 'Testing...' : 'Test Connection'}</button>
                  <button className="flex-1 rounded-lg border border-emerald-300/30 bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-2 text-sm" onClick={saveSettings} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </Panel>
              )}

              {activeTab === 'Trading' && (
              <Panel className="lg:col-span-4" title="Trading">
                <SelectField
                  label="Default Base Currency"
                  value={uiPrefs.baseCurrency}
                  options={['USDT', 'USDC', 'BUSD']}
                  onChange={(v) => setUiPrefs((p) => ({ ...p, baseCurrency: v as UiPrefs['baseCurrency'] }))}
                />

                <NumberField label="Slippage Tolerance (%)" value={uiPrefs.slippageTolerancePct} setValue={(v) => setUiPrefs((p) => ({ ...p, slippageTolerancePct: v }))} step="0.01" />
                <NumberField label="Timeout for Orders (seconds)" value={uiPrefs.orderTimeoutSec} setValue={(v) => setUiPrefs((p) => ({ ...p, orderTimeoutSec: v }))} />

                <div className="space-y-3 pt-1">
                  <Toggle label="Trade Confirmation" checked={uiPrefs.tradeConfirmation} onChange={(v) => setUiPrefs((p) => ({ ...p, tradeConfirmation: v }))} onLabel="Enabled" offLabel="Disabled" />
                  <Toggle label="Use DeepSeek Strategy Brain" checked={uiPrefs.useDeepSeekBrain} onChange={(v) => setUiPrefs((p) => ({ ...p, useDeepSeekBrain: v }))} onLabel="Enabled" offLabel="Disabled" />
                  <Toggle label="Global Trading" checked={globalTradingEnabled} onChange={toggleTrading} onLabel="Enabled" offLabel="Disabled" />
                  <Toggle label="DeepSeek Portfolio Trading" checked={portfolioTradingEnabled} onChange={updatePortfolioTradingEnabled} onLabel="Enabled" offLabel="Disabled" />
                </div>
              </Panel>
              )}

              {activeTab === 'Risk Management' && (
              <Panel className="lg:col-span-4" title="Risk Management">
                <NumberField label="Max Daily Loss (%)" value={maxDailyLossPct} setValue={setMaxDailyLossPct} step="0.1" />
                <NumberField label="Max Position Size (%)" value={maxPositionSizePct} setValue={setMaxPositionSizePct} />
                <NumberField label="Max Leverage" value={maxLeverage} setValue={setMaxLeverage} />
                <NumberField label="Kill-Switch Drawdown (%)" value={killSwitchDrawdownPct} setValue={setKillSwitchDrawdownPct} step="0.1" />
                <NumberField label="Cooldown Period (minutes)" value={cooldownMinutes} setValue={setCooldownMinutes} />
                <NumberField label="Max Trades Per Day" value={maxTradesPerDay} setValue={setMaxTradesPerDay} />
                <NumberField label="Max Consecutive Losses" value={maxConsecutiveLosses} setValue={setMaxConsecutiveLosses} />
                <NumberField label="Confidence Floor (0-1)" value={minConfidence} setValue={setMinConfidence} step="0.01" />
                <div className="pt-1">
                  <Toggle
                    label="DeepSeek AI Decision Gate"
                    checked={deepseekDecisionEnabled}
                    onChange={setDeepseekDecisionEnabled}
                    onLabel="Enabled"
                    offLabel="Disabled"
                  />
                </div>
                <NumberField label="Allocated Portfolio Balance" value={deepseekBalance} setValue={setDeepseekBalance} step="1" />

                <button className="mt-3 w-full rounded-lg border border-emerald-300/30 bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-2 text-sm" onClick={saveSettings} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>

                {riskValidation.length > 0 && <div className="mt-2 text-xs text-amber-300">{riskValidation[0]}</div>}
              </Panel>
              )}

              {(activeTab === 'Trading' || activeTab === 'Advanced') && (
              <Panel className="lg:col-span-8" title="Operations">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button className="rounded-lg border border-red-400/40 bg-red-900/30 hover:bg-red-900/50 px-3 py-2 text-sm" onClick={closeAllPositions}>Close All Positions</button>
                  <button className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm" onClick={() => load(true)}>{refreshing ? 'Refreshing...' : 'Refresh Data'}</button>
                  <button className="rounded-lg border border-cyan-300/30 bg-cyan-500/20 hover:bg-cyan-500/30 px-3 py-2 text-sm" onClick={testConnection}>{testing ? 'Testing...' : 'Retest Binance API'}</button>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <InfoRow label="Balance" value={typeof account.balance === 'number' ? money(account.balance) : '—'} />
                  <InfoRow label="Available Margin" value={typeof account.availableMargin === 'number' ? money(account.availableMargin) : '—'} />
                  <InfoRow label="Consecutive Losses" value={String(account.consecutiveLosses ?? '—')} />
                  <InfoRow label="Recommended Risk" value={String(briefing?.recommendedRiskLevel || '—').toUpperCase()} />
                  <InfoRow label="Market Regime" value={String(market.regime || '—').toUpperCase()} />
                  <InfoRow label="Regime Confidence" value={`${market.regimeConfidence ?? '—'}%`} />
                </div>
              </Panel>
              )}

              {activeTab === 'Notifications' && (
              <Panel className="lg:col-span-4" title="Notifications">
                <div className="space-y-3">
                  <Toggle label="Push Alerts" checked={notificationsPush} onChange={setNotificationsPush} onLabel="On" offLabel="Off" />
                  <Toggle label="Email Alerts" checked={notificationsEmail} onChange={setNotificationsEmail} onLabel="On" offLabel="Off" />
                  <Toggle label="Telegram Alerts" checked={notificationsTelegram} onChange={setNotificationsTelegram} onLabel="On" offLabel="Off" />
                  <TextField label="Email Address" type="text" value={notificationEmail} onChange={setNotificationEmail} />
                  <TextField label="Telegram Bot Token" type="password" value={telegramBotToken} onChange={setTelegramBotToken} placeholder={hasTelegramBotToken ? '********' : ''} status={hasTelegramBotToken ? 'Saved' : 'Not set'} />
                  <TextField label="Telegram User ID" type="text" value={telegramUserId} onChange={setTelegramUserId} />
                  <TextField label="Telegram Pairing Code" type="text" value={telegramPairingCode} onChange={setTelegramPairingCode} />
                  <SelectField label="Telegram Min Severity" value={telegramMinSeverity} options={['info', 'warning', 'critical']} onChange={(v) => setTelegramMinSeverity(v as 'info' | 'warning' | 'critical')} />
                  <NumberField label="Telegram Rate Limit (seconds)" value={telegramRateLimitSec} setValue={setTelegramRateLimitSec} />
                  <button className="w-full rounded-lg border border-cyan-300/30 bg-cyan-500/20 hover:bg-cyan-500/30 px-3 py-2 text-sm" onClick={testTelegramConnection} disabled={testingTelegram}>
                    {testingTelegram ? 'Testing Telegram...' : 'Test Telegram Connection'}
                  </button>
                </div>
              </Panel>
              )}

              {(activeTab === 'General' || activeTab === 'Advanced') && (
              <Panel className="lg:col-span-4" title="Active Services">
                <ServiceRow name="Backend Engine" state={status ? (Boolean(status?.engineConnected) ? 'running' : 'down') : 'unknown'} meta={`Last update ${lastUpdated || '—'}`} />
                <ServiceRow name="Frontend Server" state={lastUpdated ? 'running' : 'unknown'} meta={`Auto-refresh ${refreshing ? 'active' : 'idle'}`} />
                <button className="mt-4 w-full rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm" onClick={() => load(true)}>
                  Refresh Service Status
                </button>
              </Panel>
              )}

              {activeTab === 'Advanced' && (
              <Panel className="lg:col-span-8" title="Helix Evolution Lab (New)">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button className="rounded-lg border border-cyan-300/30 bg-cyan-500/20 hover:bg-cyan-500/30 px-3 py-2 text-sm" onClick={runHelixEvaluateSample}>Run Layered Evaluate Sample</button>
                  <button className="rounded-lg border border-sky-300/30 bg-sky-500/20 hover:bg-sky-500/30 px-3 py-2 text-sm" onClick={runHelixEvaluateLive}>Run Layered Evaluate LIVE</button>
                  <button
                    className="rounded-lg border border-red-300/30 bg-red-500/20 hover:bg-red-500/30 px-3 py-2 text-sm disabled:opacity-50"
                    onClick={promoteLivePlanToTradeSignal}
                    disabled={!helixEvalOutput?.response?.plan || helixEvalOutput?.mode !== 'live'}
                  >
                    Promote LIVE Plan → Executable Signal
                  </button>
                  <button className="rounded-lg border border-purple-300/30 bg-purple-500/20 hover:bg-purple-500/30 px-3 py-2 text-sm" onClick={runDarwinSample}>Run Darwin Weights Sample</button>
                  <button className="rounded-lg border border-amber-300/30 bg-amber-500/20 hover:bg-amber-500/30 px-3 py-2 text-sm" onClick={runPromptExperimentSample}>Run Prompt Experiment Sample</button>
                  <button className="rounded-lg border border-emerald-300/30 bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-2 text-sm" onClick={runWalkForwardSample}>Run Walk-Forward Sample</button>
                  <button className="rounded-lg border border-fuchsia-300/30 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 px-3 py-2 text-sm" onClick={runExperimentGovernanceSamples}>Run Experiment Governance Samples</button>
                  <button className="rounded-lg border border-indigo-300/30 bg-indigo-500/20 hover:bg-indigo-500/30 px-3 py-2 text-sm" onClick={runExperimentGovernanceLive}>Run Experiment Governance LIVE Auto-Feed</button>
                </div>

                <div className="mt-4 text-xs text-slate-400">These buttons call the new backend endpoints you requested and dump latest JSON below.</div>

                <div className="mt-3 rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-3 text-xs">
                  <div className="text-cyan-100 font-semibold">Operator Playbook (Built-in)</div>
                  <div className="mt-2 text-slate-200"><span className="text-slate-400">Default:</span> ignore this lab during normal auto-trading.</div>
                  <div className="mt-1 text-slate-200"><span className="text-slate-400">Touch lab when:</span> performance drifts, regime shifts hard, or you are testing strategy changes.</div>
                  <div className="mt-1 text-slate-200"><span className="text-slate-400">Weekly only:</span> Run <b>Experiment Governance LIVE Auto-Feed</b> + <b>Walk-Forward</b>.</div>
                  <div className="mt-2 rounded-md border border-white/10 bg-white/5 p-2 text-emerald-200">Now: {labRecommendation}</div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <TraderSummaryCard summary={traderSummary} />
                  <EvidenceCard evidenceCount={evidenceCount} evidenceTarget={evidenceTarget} marketRegime={String(market.regime || 'unknown')} />
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Toggle
                    label="Promotion Dry-Run (recommended)"
                    checked={promotionDryRun}
                    onChange={setPromotionDryRun}
                    onLabel="ON"
                    offLabel="OFF"
                  />
                  <TextField
                    label="Second Confirmation Phrase"
                    value={promotionConfirmText}
                    onChange={setPromotionConfirmText}
                    placeholder="Type: PROMOTE LIVE"
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3">
                  {helixEvalOutput && <JsonBlock title="Evaluate Output" value={helixEvalOutput} />}
                  {darwinOutput && <JsonBlock title="Darwin Output" value={darwinOutput} />}
                  {experimentsOutput && <JsonBlock title="Prompt Experiment Output" value={experimentsOutput} />}
                  {walkForwardOutput && <JsonBlock title="Walk-Forward Output" value={walkForwardOutput} />}
                  {contractValidateOutput && <JsonBlock title="Contract Validate Output" value={contractValidateOutput} />}
                  {promotionEvalOutput && <JsonBlock title="Promotion Evaluate Output" value={promotionEvalOutput} />}
                  {leaderboardOutput && <JsonBlock title="Leaderboard Output" value={leaderboardOutput} />}
                  {runsOutput && <JsonBlock title="Experiment Runs Output" value={runsOutput} />}
                  {liveGovernanceOutput && <JsonBlock title="Live Governance Auto-Feed Output" value={liveGovernanceOutput} />}
                  <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                    <div className="text-xs text-slate-400 mb-2">Execution Audit Log (latest 30)</div>
                    {executionAudit.length === 0 ? (
                      <div className="text-xs text-slate-500">No promotion events yet.</div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-auto">
                        {executionAudit.map((row, idx) => (
                          <div key={idx} className="text-xs text-slate-200 border border-white/5 rounded p-2">
                            <div className="text-slate-400">{row.ts} • {row.type}</div>
                            <pre className="whitespace-pre-wrap">{JSON.stringify(row, null, 2)}</pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
              )}
            </main>
          </div>

          <footer className="mt-8 border-t border-white/10 pt-5 text-center text-sm text-slate-400">
            <p>© 2024 Helix.One - All rights reserved.</p>
            <p className="mt-1">Powered by the Helix Engine • Real-time algorithmic trading</p>
            <p className="mt-1">Built by Darren Headley</p>
          </footer>
        </div>
      </div>
    </>
  );
}

function Panel({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-4 shadow-xl shadow-black/30 ${className}`}>
      <h2 className="text-2xl font-semibold mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h2>
      {children}
    </section>
  );
}

function TextField({ label, value, onChange, type = 'text', placeholder = '', status }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; status?: 'Saved' | 'Not set' }) {
  const statusTone = status === 'Saved' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40' : 'bg-amber-500/20 text-amber-200 border-amber-400/40';
  return (
    <label className="block space-y-1 mb-2">
      <div className="text-sm text-slate-300 flex items-center justify-between">
        <span>{label}</span>
        {status && <span className={`text-[10px] rounded-full border px-2 py-0.5 ${statusTone}`}>{status}</span>}
      </div>
      <input type={type} autoComplete="off" placeholder={placeholder} className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NumberField({ label, value, setValue, step = '1' }: { label: string; value: number; setValue: (v: number) => void; step?: string }) {
  return (
    <label className="block space-y-1 mb-2">
      <div className="text-sm text-slate-300">{label}</div>
      <input type="number" step={step} className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" value={value} onChange={(e) => setValue(Number(e.target.value))} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1 mb-2">
      <div className="text-sm text-slate-300">{label}</div>
      <select className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange, onLabel, offLabel }: { label: string; checked: boolean; onChange: (v: boolean) => void; onLabel: string; offLabel: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <span className="text-sm text-slate-200">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-20 rounded-full border transition ${checked ? 'bg-emerald-500/30 border-emerald-400/60' : 'bg-slate-700/50 border-white/20'}`}
      >
        <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-12' : 'translate-x-0'}`} />
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-slate-100">{checked ? onLabel : offLabel}</span>
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function ServiceRow({ name, state, meta }: { name: string; state: 'running' | 'down' | 'unknown'; meta: string }) {
  const badge = state === 'running'
    ? 'bg-emerald-500/30 text-emerald-200'
    : state === 'down'
      ? 'bg-red-500/30 text-red-200'
      : 'bg-amber-500/30 text-amber-200';
  const label = state === 'running' ? 'Running' : state === 'down' ? 'Down' : 'Unknown';
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 mb-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-200">{name}</span>
        <span className={`text-xs rounded-full px-2 py-0.5 ${badge}`}>{label}</span>
      </div>
      <div className="text-xs text-slate-400 mt-1">{meta}</div>
    </div>
  );
}

function TraderSummaryCard({ summary }: { summary: any }) {
  const edgeTone = summary.expectedEdgeBps > 0 ? 'text-emerald-300' : 'text-red-300';
  const actionTone = summary.actionNow.includes('TRADE') ? 'text-emerald-200' : 'text-amber-200';
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
      <div className="text-xs text-slate-400 mb-2">Trader Summary (Human View)</div>
      <div className={`text-sm font-semibold ${actionTone}`}>Action now: {summary.actionNow}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="text-slate-300">Confidence: <span className="text-slate-100">{summary.confidencePct || 0}%</span></div>
        <div className="text-slate-300">Risk/trade: <span className="text-slate-100">${Number(summary.riskUsd || 0).toFixed(4)}</span></div>
        <div className="text-slate-300">Position size: <span className="text-slate-100">${Number(summary.positionUsd || 0).toFixed(4)}</span></div>
        <div className="text-slate-300">R multiple: <span className="text-slate-100">{Number(summary.rMultiple || 0).toFixed(2)}</span></div>
      </div>
      <div className={`mt-2 text-xs ${edgeTone}`}>Expected edge: {Number(summary.expectedEdgeBps || 0).toFixed(2)} bps</div>
      <div className="mt-2 text-xs text-slate-300">Execution rationale: {(summary.rationale || []).join(', ') || 'n/a'}</div>
      <div className="mt-2 text-xs text-slate-300">Promotion decision: <span className="text-slate-100 uppercase">{summary.promotionDecision}</span></div>
      <div className="mt-1 text-xs text-slate-400">Promotion reasons: {(summary.promotionReasons || []).join(', ') || 'No governance run yet'}</div>
    </div>
  );
}

function EvidenceCard({ evidenceCount, evidenceTarget, marketRegime }: { evidenceCount: number; evidenceTarget: number; marketRegime: string }) {
  const pct = evidenceTarget > 0 ? Math.min(100, Math.round((evidenceCount / evidenceTarget) * 100)) : 0;
  const ready = evidenceCount >= evidenceTarget;
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
      <div className="text-xs text-slate-400 mb-2">Governance Readiness</div>
      <div className={`text-sm font-semibold ${ready ? 'text-emerald-200' : 'text-amber-200'}`}>
        {ready ? 'Evidence threshold met' : 'Not enough evidence yet'} ({evidenceCount}/{evidenceTarget} closed trades)
      </div>
      <div className="mt-2 h-2 w-full bg-slate-800 rounded">
        <div className={`h-2 rounded ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-slate-300">Current regime: <span className="text-slate-100 uppercase">{marketRegime}</span></div>
      {!ready && <div className="mt-2 text-xs text-slate-400">Next step: collect more closed trades or import historical trade data before trusting promotion decisions.</div>}
    </div>
  );
}

function money(v: number) {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function JsonBlock({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
      <div className="text-xs text-slate-400 mb-2">{title}</div>
      <pre className="text-xs text-slate-200 overflow-auto max-h-64 whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
