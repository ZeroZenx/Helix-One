import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { fetchWithTimeout, getTradingApiBaseUrl } from '../../src/utils/api';

type StatusPayload = {
  activePortfolios?: Array<{
    modelId: number;
    modelName: string;
    currentBalance: number;
    positionsCount: number;
    tradingEnabled: boolean;
  }>;
};

type JournalEntry = {
  ts?: string;
  timestamp?: string;
  event?: string;
  symbol?: string;
  side?: string;
  realizedPnl?: number;
};

const API = getTradingApiBaseUrl();

export default function ModelDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [portfolio, setPortfolio] = useState<StatusPayload['activePortfolios'][number] | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);

  useEffect(() => {
    if (!id) return;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const modelId = Number(id);
        const [statusRes, journalRes] = await Promise.all([
          fetchWithTimeout(`${API}/status`),
          fetchWithTimeout(`${API}/journal?limit=100`),
        ]);

        if (!statusRes.ok) throw new Error('Failed to load model status');
        const statusData = (await statusRes.json()) as StatusPayload;
        const found = (statusData.activePortfolios || []).find((p) => Number(p.modelId) === modelId);
        if (!found) throw new Error('Model not found in active portfolios');

        setPortfolio(found);

        if (journalRes.ok) {
          const data = await journalRes.json();
          setJournal((data.entries || []) as JournalEntry[]);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load model');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  const realized = useMemo(
    () => journal.reduce((sum, j) => sum + Number(j.realizedPnl || 0), 0),
    [journal]
  );

  if (loading) return <div className="min-h-screen bg-black text-white p-8">Loading model...</div>;

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <h1 className="text-2xl font-bold mb-3">Model unavailable</h1>
        {error && <p className="text-red-400 mb-4">{error}</p>}
        <a href="/" className="underline">Back to Dashboard</a>
      </div>
    );
  }

  const pnl = portfolio.currentBalance - 10000;
  const roi = (pnl / 10000) * 100;

  return (
    <div className="min-h-screen bg-black text-white p-8" style={{ backgroundColor: '#000', color: '#fff', minHeight: '100vh' }}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{portfolio.modelName}</h1>
          <a href="/" className="underline">Back</a>
        </div>

        {error && <div className="bg-red-900 text-red-100 p-3 rounded">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card k="Current Balance" v={`$${portfolio.currentBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
          <Card k="Return" v={`${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`} tone={roi >= 0 ? 'good' : 'bad'} />
          <Card k="Unrealized P&L" v={`${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`} tone={pnl >= 0 ? 'good' : 'bad'} />
          <Card k="Open Positions" v={String(portfolio.positionsCount)} />
        </div>

        <section className="bg-gray-900 rounded-lg p-4">
          <h2 className="font-bold text-xl mb-3">Execution Journal (Recent)</h2>
          {journal.length === 0 ? (
            <p className="text-gray-400">No journal entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left py-2">Time</th>
                    <th className="text-left py-2">Event</th>
                    <th className="text-left py-2">Symbol</th>
                    <th className="text-left py-2">Side</th>
                    <th className="text-right py-2">Realized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.slice(0, 25).map((j, idx) => {
                    const realizedPnl = Number(j.realizedPnl || 0);
                    return (
                      <tr key={idx} className="border-b border-gray-800">
                        <td className="py-2">{j.ts || j.timestamp ? new Date(j.ts || j.timestamp || '').toLocaleString() : '—'}</td>
                        <td className="py-2">{j.event || '—'}</td>
                        <td className="py-2">{j.symbol || '—'}</td>
                        <td className="py-2">{j.side || '—'}</td>
                        <td className={`py-2 text-right ${realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 text-sm text-gray-400">Net realized P&L: <span className={realized >= 0 ? 'text-green-400' : 'text-red-400'}>{realized >= 0 ? '+' : ''}${realized.toFixed(2)}</span></div>
        </section>
      </div>
    </div>
  );
}

function Card({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="text-xs text-gray-400">{k}</div>
      <div className={`text-xl font-bold ${tone === 'good' ? 'text-green-400' : tone === 'bad' ? 'text-red-400' : ''}`}>{v}</div>
    </div>
  );
}
