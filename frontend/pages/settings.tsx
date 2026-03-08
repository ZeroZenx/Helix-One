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

  const [status, setStatus] = useState<any>(null);
  const [briefing, setBriefing] = useState<any>(null);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(defaultUiPrefs);
  const [activeTab, setActiveTab] = useState<SettingsTab>('General');

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
    if (typeof s.masterApiKey === 'string' && s.masterApiKey && !isMasked(s.masterApiKey)) setMasterApiKey(s.masterApiKey);
    if (typeof s.masterSecretKey === 'string' && s.masterSecretKey) setMasterSecretKey(s.masterSecretKey);
    if (typeof s.deepseekApiKey === 'string' && s.deepseekApiKey) setDeepseekApiKey(s.deepseekApiKey);
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

    const n = s.notificationSettings || {};
    setNotificationsPush(Boolean(n.pushEnabled ?? true));
    setNotificationsEmail(Boolean(n.emailEnabled ?? false));
    setNotificationsTelegram(Boolean(n.telegramEnabled ?? false));
    setNotificationEmail(String(n.email || ''));
    if (typeof n.telegramBotToken === 'string' && n.telegramBotToken) setTelegramBotToken(String(n.telegramBotToken));
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
      const [statusResult, briefingResult] = await Promise.allSettled([
        fetchWithTimeout(`${API}/status`, {}, 2500),
        fetchWithTimeout(`${API}/daily-briefing`, {}, 2500),
      ]);

      if (statusResult.status === 'fulfilled' && statusResult.value.ok) {
        setStatus(await statusResult.value.json());
      }

      if (briefingResult.status === 'fulfilled' && briefingResult.value.ok) {
        setBriefing(await briefingResult.value.json());
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

  async function saveSettings() {
    if (riskValidation.length) {
      setBanner({ type: 'error', text: riskValidation[0] });
      return;
    }

    setSaving(true);
    setBanner(null);
    try {
      const res = await fetchWithTimeout(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          masterApiKey,
          masterSecretKey,
          deepseekApiKey,
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
          },
          notificationSettings: {
            pushEnabled: notificationsPush,
            emailEnabled: notificationsEmail,
            telegramEnabled: notificationsTelegram,
            email: notificationEmail,
            telegramBotToken,
            telegramUserId,
            telegramPairingCode,
            telegramMinSeverity,
            telegramRateLimitSec,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      setBanner({ type: 'success', text: 'Settings saved.' });
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

  const account = briefing?.account || {};
  const market = briefing?.market || {};

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

              {loading && <div className="lg:col-span-12 text-sm text-slate-300">Loading settings...</div>}

              {activeTab === 'General' && (
              <Panel className="lg:col-span-4" title="General">
                <TextField label="Admin Key" type="password" value={adminKey} onChange={setAdminKey} />
                <TextField label="Binance API Key" type="password" value={masterApiKey} onChange={setMasterApiKey} />
                <TextField label="Binance API Secret" type="password" value={masterSecretKey} onChange={setMasterSecretKey} />
                <TextField label="DeepSeek API Key" type="password" value={deepseekApiKey} onChange={setDeepseekApiKey} />

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
                  <Toggle label="DeepSeek Portfolio Trading" checked={portfolioTradingEnabled} onChange={setPortfolioTradingEnabled} onLabel="Enabled" offLabel="Disabled" />
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
                  <TextField label="Telegram Bot Token" type="password" value={telegramBotToken} onChange={setTelegramBotToken} />
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

function TextField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block space-y-1 mb-2">
      <div className="text-sm text-slate-300">{label}</div>
      <input type={type} autoComplete="off" className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" value={value} onChange={(e) => onChange(e.target.value)} />
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

function money(v: number) {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
