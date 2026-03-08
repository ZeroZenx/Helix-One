import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
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
    tradingEnabled: boolean;
    killSwitchTriggered?: boolean;
    cooldownUntil?: string | null;
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
  side?: 'BUY' | 'SELL';
  entry?: number;
  qty?: number;
  pnl?: number;
};

type Coin = {
  symbol: string;
  price: number;
  change: number;
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

export default function Home() {
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [status, setStatus] = useState<TradingStatus | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null);
  const [riskContext, setRiskContext] = useState<RiskContext | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [coins, setCoins] = useState<Coin[]>([]);

  const liveConnected = Boolean(status?.engineConnected);
  const account = briefing?.account || {};
  const market = briefing?.market || {};
  const risks = (riskContext?.riskFlags || briefing?.notes || []).slice(0, 3);
  const portfolio = status?.activePortfolios?.[0];
  const riskSettings = settings?.riskSettings || {};

  const walletBalance = Number(account.balance || 0);
  const availableMargin = Number(account.availableMargin || 0);
  const openPositions = Number(portfolio?.positionsCount || 0);

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

    return {
      label: failedChecks > 0 ? 'NO_TRADE' : 'TRADE',
      quality: failedChecks > 0 ? 'LOW CONFIDENCE' : 'VALID SETUP',
      checks: `${Math.max(0, 6 - failedChecks)} / 6 Checks`,
      next: failedChecks > 0 ? 'Monitoring & Review' : 'Prepare Entry Plan',
      failedChecks,
    };
  }, [liveConnected, market.regime, market.regimeConfidence, market.liquidityState, market.volatilityState, risks.length]);

  async function loadDashboard() {
    try {
      const [statusRes, settingsRes, briefingRes, riskRes, journalRes] = await Promise.allSettled([
        fetchWithTimeout(`${API}/status`),
        fetchWithTimeout(`${API}/settings`),
        fetchWithTimeout(`${API}/daily-briefing`),
        fetchWithTimeout(`${API}/risk-context?symbols=BTCUSDT,ETHUSDT,SOLUSDT`),
        fetchWithTimeout(`${API}/journal?limit=20`),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        setStatus((await statusRes.value.json()) as TradingStatus);
      }

      if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
        setSettings((await settingsRes.value.json()) as SettingsPayload);
      }

      if (briefingRes.status === 'fulfilled' && briefingRes.value.ok) {
        setBriefing((await briefingRes.value.json()) as BriefingPayload);
      }

      if (riskRes.status === 'fulfilled' && riskRes.value.ok) {
        setRiskContext((await riskRes.value.json()) as RiskContext);
      }

      if (journalRes.status === 'fulfilled' && journalRes.value.ok) {
        const payload = await journalRes.value.json();
        setJournal(Array.isArray(payload?.entries) ? payload.entries : []);
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

  useEffect(() => {
    loadDashboard();
    loadMarket();
    const id = setInterval(() => {
      loadDashboard();
      loadMarket();
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const activeTradeRows = journal.filter((j) => j.type === 'trade_open').slice(0, 4);
  const recentTradeRows = journal.filter((j) => j.type === 'trade_close').slice(0, 6);

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
        <div className="mx-auto max-w-[1440px] px-4 md:px-8 py-5">
          <header className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-4 md:p-5 shadow-2xl shadow-black/30">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-3xl font-bold tracking-wide" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  <span className="text-emerald-300">HELIX</span>.ONE
                </div>
                <StatusPill tone={liveConnected ? 'good' : 'bad'}>{liveConnected ? 'LIVE' : 'OFFLINE'}</StatusPill>
                <StatusPill tone={liveConnected ? 'good' : 'bad'}>{liveConnected ? 'CONNECTED' : 'DISCONNECTED'}</StatusPill>
                <div className="text-slate-400 text-sm">Last update: {lastUpdated || '—'}</div>
              </div>
              <div className="flex items-center gap-3">
                <a href="/settings" className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-medium">Settings</a>
              </div>
            </div>
          </header>

          <main className="mt-5 space-y-5">
            {error && <div className="rounded-xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-red-100 text-sm">{error}</div>}

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              <TopMetric label="Binance Wallet Balance" value={walletBalance > 0 ? money(walletBalance) : '—'} />
              <TopMetric label="Available Margin" value={availableMargin > 0 ? money(availableMargin) : '—'} tone="green" />
              <TopMetric label="Daily P&L" value={typeof account.previousDayPnl === 'number' ? signedMoney(account.previousDayPnl) : '—'} tone={Number(account.previousDayPnl || 0) >= 0 ? 'green' : 'red'} />
              <TopMetric label="Open Positions" value={String(openPositions)} />
              <div className={`rounded-xl border px-4 py-3 ${riskPosture.tone}`}>
                <div className="text-xs uppercase tracking-wider text-slate-300/80">Risk Posture</div>
                <div className="text-2xl font-semibold mt-1">{riskPosture.label}</div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Panel className="xl:col-span-3" title="Market & Risk Overview">
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
              </Panel>

              <Panel className="xl:col-span-6" title="DeepSeek Decision Brain">
                <div className={`rounded-xl border px-4 py-3 ${decision.label === 'NO_TRADE' ? 'border-red-500/70 bg-red-950/30' : 'border-emerald-500/70 bg-emerald-950/20'}`}>
                  <div className="text-center text-sm tracking-wide text-slate-300">CURRENT DECISION:</div>
                  <div className={`text-center text-4xl font-bold mt-1 tracking-wide ${decision.label === 'NO_TRADE' ? 'text-red-300' : 'text-emerald-300'}`} style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{decision.label}</div>
                </div>

                <div className="mt-4 divide-y divide-white/10 text-sm">
                  <DetailRow label="Setup Quality" value={decision.quality} highlight={decision.label === 'NO_TRADE' ? 'text-red-300' : 'text-emerald-300'} />
                  <DetailRow label="Risk Flags" value={risks.length ? risks.join(', ') : 'None'} highlight={risks.length ? 'text-amber-300' : 'text-emerald-300'} />
                  <DetailRow label="Pre-Checks" value={`${decision.checks} ${decision.failedChecks > 0 ? '(some failed)' : ''}`} highlight={decision.failedChecks > 0 ? 'text-amber-300' : 'text-emerald-300'} />
                  <DetailRow label="Next Steps" value={decision.next} />
                </div>
              </Panel>

              <Panel className="xl:col-span-3" title="Risk Controls">
                <div className="space-y-2 text-sm">
                  <InfoRow label="Max Daily Loss" value={`${Number(riskSettings.maxDailyLossPct ?? 3).toFixed(1)}%`} />
                  <InfoRow label="Max Position Size" value={`${Number(riskSettings.maxPositionSizePct ?? 10).toFixed(0)}%`} />
                  <InfoRow label="Max Leverage" value={`${Number(riskSettings.maxLeverage ?? 5)}x`} />
                  <InfoRow label="Kill Switch Drawdown" value={`-${Number(riskSettings.killSwitchDrawdownPct ?? 5).toFixed(1)}%`} />
                  <InfoRow label="Cooldown Period" value={`${Number(riskSettings.cooldownMinutes ?? 30)} Min`} />
                  <InfoRow label="Max Trades Per Day" value={`${Number(riskSettings.maxTradesPerDay ?? 5)}`} />
                  <InfoRow label="Max Consecutive Losses" value={`${Number(riskSettings.maxConsecutiveLosses ?? 3)}`} />
                </div>
              </Panel>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Panel className="xl:col-span-5" title="Active Positions">
                <table className="w-full text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="text-left py-2">Pair</th>
                      <th className="text-right py-2">Size</th>
                      <th className="text-right py-2">Entry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTradeRows.length === 0 ? (
                      <tr><td colSpan={3} className="py-3 text-slate-400">No active positions</td></tr>
                    ) : activeTradeRows.map((t, i) => (
                      <tr key={`${t.ts}-${i}`} className="border-t border-white/10">
                        <td className="py-2 font-semibold">{t.symbol || '—'}</td>
                        <td className="py-2 text-right">{typeof t.qty === 'number' ? t.qty.toFixed(4) : '—'}</td>
                        <td className="py-2 text-right">{typeof t.entry === 'number' ? t.entry.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>

              <Panel className="xl:col-span-4" title="Recent Trades">
                <table className="w-full text-sm">
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
              </Panel>

              <Panel className="xl:col-span-3" title="News & Macro Risk">
                <div className="space-y-2 text-sm">
                  {(briefing?.news || []).slice(0, 6).map((n, i) => (
                    <div key={`${n.source}-${i}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div className="text-xs text-slate-400">{n.source}</div>
                      <div className="text-slate-200">{n.title}</div>
                    </div>
                  ))}
                  {(!briefing?.news || briefing.news.length === 0) && <div className="text-slate-400">No headlines right now.</div>}
                </div>
              </Panel>
            </section>
          </main>

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
      <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h2>
      {children}
    </section>
  );
}

function TopMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'red' }) {
  const toneClass = tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-red-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-md px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${toneClass}`} style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</div>
    </div>
  );
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
