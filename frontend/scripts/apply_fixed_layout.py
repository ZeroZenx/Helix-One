from pathlib import Path

p = Path('/Users/darrenheadley/.openclaw/workspace/Helix-One/frontend/pages/index.tsx')
text = p.read_text()
start = text.index('            {!showDisconnectedShell && (')
end = text.index('            )}\n          </main>', start)
new_block = '''            {!showDisconnectedShell && (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-slate-300">
                  <div className="font-semibold text-slate-100">Dashboard layout refreshed</div>
                  <div className="mt-1 text-slate-400">Using a fixed clean layout for better spacing, consistency, and readability.</div>
                </div>

                <section className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-start">
                  <div className="xl:col-span-4">
                    <Panel title="Market Overview">
                      <div className="space-y-2">
                        {coins.slice(0, 5).map((c) => (
                          <div key={c.symbol} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                            <div>
                              <div className="font-semibold text-slate-100">{c.symbol}</div>
                              <div className="text-[11px] text-slate-400">Live market snapshot</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-slate-100">${c.price.toFixed(c.price < 1 ? 4 : 2)}</div>
                              <div className={`text-xs ${c.change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{c.change >= 0 ? '+' : ''}{c.change.toFixed(2)}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 space-y-2 text-sm">
                        <InfoRow label="Regime" value={`${String(market.regime || 'unclear').toUpperCase()} • ${Number(market.regimeConfidence || 0)}%`} />
                        <InfoRow label="Liquidity" value={String(market.liquidityState || 'unknown').toUpperCase()} />
                        <InfoRow label="Volatility" value={String(market.volatilityState || 'unknown').toUpperCase()} />
                        <InfoRow label="Funding / OI" value={formatFunding(market.funding, market.openInterest)} />
                      </div>
                    </Panel>
                  </div>

                  <div className="xl:col-span-5">
                    <Panel title="Decision Summary">
                      <div className={`rounded-xl border px-4 py-4 ${decision.label === 'TRADE' ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">Current decision</div>
                            <div className={`mt-1 text-3xl font-bold ${decision.label === 'TRADE' ? 'text-emerald-300' : 'text-amber-200'}`}>{decision.label}</div>
                            <div className="mt-2 text-sm text-slate-300">{decision.reasoningSummary}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="text-slate-400">Confidence</div>
                            <div className="font-semibold text-slate-100">{decision.confidence}%</div>
                            <div className="mt-2 text-slate-400">Readiness</div>
                            <div className="font-semibold text-slate-100">{readinessScore}/100</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">Action Plan</div>
                          <div className="space-y-2 text-slate-200">
                            <div><span className="text-slate-400">Side:</span> {String(decision.chosenSide || 'N/A')}</div>
                            <div><span className="text-slate-400">Entry zone:</span> {decision.entryPlan.zone}</div>
                            <div><span className="text-slate-400">Stop / TP:</span> {decision.entryPlan.stop} • {decision.entryPlan.tp1} • {decision.entryPlan.tp2}</div>
                            <div><span className="text-slate-400">Next trigger:</span> {String((decision as any).actionableNext || decision.triggerConditions?.[0] || 'Awaiting signal')}</div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">Guardrails</div>
                          <div className="space-y-2 text-slate-200">
                            <div><span className="text-slate-400">Risk flags:</span> {risks.length ? risks.join(', ') : 'None'}</div>
                            <div><span className="text-slate-400">Invalidation:</span> {decision.invalidators?.[0] || '—'}</div>
                            <div><span className="text-slate-400">Min leverage:</span> {Number((riskSettings as any).minLeverage ?? 10)}x</div>
                            <div><span className="text-slate-400">Max open positions:</span> {Number((riskSettings as any).maxOpenPositions ?? 4)}</div>
                          </div>
                        </div>
                      </div>
                    </Panel>
                  </div>

                  <div className="xl:col-span-3">
                    <Panel title="Ops Snapshot">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <MiniMetric label="Daily Loss" value={`${Number(riskSettings.maxDailyLossPct ?? 3).toFixed(1)}%`} />
                        <MiniMetric label="Pos Size" value={`${Number(riskSettings.maxPositionSizePct ?? 8).toFixed(0)}%`} />
                        <MiniMetric label="Leverage" value={`${Number((riskSettings as any).minLeverage ?? 10)}x–${Number(riskSettings.maxLeverage ?? 20)}x`} />
                        <MiniMetric label="Trades/Day" value={`${Number(riskSettings.maxTradesPerDay ?? 8)}`} />
                        <MiniMetric label="Open Pos." value={`${openPositions}/${Number((riskSettings as any).maxOpenPositions ?? 4)}`} />
                        <MiniMetric label="Worker" value={workerStatus?.running ? 'ON' : 'OFF'} />
                      </div>
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300 space-y-1">
                        <div>Last action: <span className="text-slate-100 font-semibold">{String(workerStatus?.lastAction || '—').toUpperCase()}</span></div>
                        <div>Last run: <span className="text-slate-100">{workerStatus?.lastRunAt ? new Date(workerStatus.lastRunAt).toLocaleTimeString() : '—'}</span></div>
                        <div>Execution mode: <span className="text-slate-100 uppercase">{paperTradingEnabled ? 'paper' : 'live'}</span></div>
                        <div>Execution source: <span className="text-slate-100">{String(workerStatus?.executionSource || 'HYBRID')}</span></div>
                        <div>AI heartbeat: <span className="text-slate-100">{workerStatus?.aiLastHeartbeatAt ? new Date(workerStatus.aiLastHeartbeatAt).toLocaleTimeString() : '—'}</span></div>
                        {workerStatus?.fallbackMode && <div className="inline-block rounded border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">FALLBACK MODE</div>}
                      </div>
                    </Panel>
                  </div>

                  <div className="xl:col-span-4">
                    <Panel title="Manual Trade">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="space-y-3 md:col-span-2">
                          <div>
                            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Admin Key</label>
                            <input type="password" value={manualAdminKey} onChange={(e) => setManualAdminKey(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100" placeholder="Enter admin key" />
                          </div>
                          {manualFeedback && <div className={`rounded border px-3 py-2 text-xs ${manualFeedback.kind === 'success' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-red-400/40 bg-red-500/10 text-red-200'}`}>{manualFeedback.text}</div>}
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Symbol</label>
                          <select value={manualSymbol} onChange={(e) => setManualSymbol(e.target.value as any)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100">
                            {EXEC_SYMBOLS.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Side</label>
                          <select value={manualSide} onChange={(e) => setManualSide(e.target.value as any)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100">
                            <option value="BUY">BUY</option>
                            <option value="SELL">SELL</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Order Type</label>
                          <select value={manualType} onChange={(e) => setManualType(e.target.value as any)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100">
                            <option value="MARKET">MARKET</option>
                            <option value="LIMIT">LIMIT</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Leverage</label>
                          <input type="number" value={manualLeverage} onChange={(e) => setManualLeverage(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100" min="1" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Quantity</label>
                          <input type="number" value={manualQty} onChange={(e) => setManualQty(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100" placeholder="Optional" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Limit Price</label>
                          <input type="number" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100" placeholder={manualType === 'LIMIT' ? 'Required for LIMIT' : 'Only for LIMIT'} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Stop Loss</label>
                          <input type="number" value={manualStopLoss} onChange={(e) => setManualStopLoss(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Take Profit</label>
                          <input type="number" value={manualTakeProfit} onChange={(e) => setManualTakeProfit(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Confidence</label>
                          <input type="number" value={manualConfidence} onChange={(e) => setManualConfidence(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100" min="1" max="100" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Reason</label>
                          <textarea value={manualReason} onChange={(e) => setManualReason(e.target.value)} className="min-h-[92px] w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-slate-100" />
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                          <button onClick={submitManualTrade} disabled={manualSubmitting} className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">
                            {manualSubmitting ? 'Submitting…' : 'Submit Manual Trade'}
                          </button>
                        </div>
                      </div>
                    </Panel>
                  </div>

                  <div className="xl:col-span-8">
                    <Panel title="Open Positions">
                      <div className="text-[11px] text-slate-400 mb-2">Manage SL, BE, and partial take-profit directly from the active positions table.</div>
                      <div className="overflow-x-auto -mx-1 px-1">
                        <table className="w-full min-w-[1080px] text-sm">
                          <thead className="text-slate-400">
                            <tr><th className="text-left py-2">Pair</th><th className="text-left py-2">Side</th><th className="text-right py-2">Entry</th><th className="text-right py-2">Mark</th><th className="text-right py-2">PnL</th><th className="text-right py-2">Stop</th><th className="text-left py-2">SL Status</th><th className="text-right py-2">Secured</th><th className="text-right py-2">Actions</th></tr>
                          </thead>
                          <tbody>
                            {activeTradeRows.length === 0 ? (
                              <tr><td colSpan={9} className="py-3 text-slate-400">No active positions</td></tr>
                            ) : activeTradeRows.map((t, i) => (
                              <tr key={`${t.ts}-${i}`} className="border-t border-white/10">
                                <td className="py-2 font-semibold">{t.symbol || '—'}</td><td className={`py-2 ${String(t.side || '').toUpperCase() === 'LONG' ? 'text-emerald-300' : 'text-red-300'}`}>{String(t.side || '—').toUpperCase()}</td><td className="py-2 text-right">{typeof t.entry === 'number' ? t.entry.toFixed(2) : '—'}</td><td className="py-2 text-right">{typeof t.mark === 'number' && t.mark > 0 ? t.mark.toFixed(2) : '—'}</td><td className={`py-2 text-right font-semibold ${t.pnlState === 'profit' ? 'text-emerald-300' : t.pnlState === 'loss' ? 'text-red-300' : 'text-slate-300'}`}>{signedMoney(Number(t.unrealized || 0))}</td><td className="py-2 text-right">{t.stop > 0 ? t.stop.toFixed(2) : '—'}</td><td className={`py-2 ${t.slStatus === 'Locked Profit' ? 'text-emerald-300' : t.slStatus === 'Break-even' ? 'text-cyan-300' : 'text-slate-300'}`}>{t.slStatus}</td><td className={`py-2 text-right font-semibold ${Number(t.secured || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signedMoney(Number(t.secured || 0))}</td>
                                <td className="py-2 text-right space-x-1 whitespace-nowrap">
                                  <button onClick={() => secureBreakEven(String(t.symbol || ''))} className="rounded border border-cyan-400/40 px-1.5 py-0.5 text-[10px] text-cyan-200 hover:bg-cyan-500/10">BE+0.1%</button>
                                  <button onClick={() => takePartial(String(t.symbol || ''), 10)} className="rounded border border-emerald-400/40 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/10">TP 10%</button>
                                  <button onClick={() => takePartial(String(t.symbol || ''), 30)} className="rounded border border-emerald-400/40 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/10">TP 30%</button>
                                  <input type="number" value={slDrafts[String(t.symbol || '')] ?? (Number(t.stop || 0) > 0 ? Number(t.stop).toFixed(2) : '')} onChange={(e) => setSlDrafts((prev) => ({ ...prev, [String(t.symbol || '')]: e.target.value }))} className="ml-1 w-24 rounded border border-white/20 bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-100" placeholder="New SL" />
                                  <button onClick={() => updateStopLoss(String(t.symbol || ''), Number(t.stop || 0))} className="rounded border border-amber-400/40 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/10">Update SL</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </div>

                  <div className="xl:col-span-4">
                    <Panel title="Recent Trades & Performance">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <MiniMetric label="Win Rate" value={`${postTradeQuality.winRate}%`} />
                        <MiniMetric label="Net PnL" value={signedMoney(postTradeQuality.netPnl)} />
                        <MiniMetric label="Profit Factor" value={Number(postTradeQuality.profitFactor || 0).toFixed(2)} />
                        <MiniMetric label="Max DD" value={signedMoney(-postTradeQuality.maxDrawdownApprox)} />
                      </div>
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs">
                        <div className="text-slate-400 mb-2">Open Orders ({openOrders.length})</div>
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                          <label className="text-slate-300">Filter</label>
                          <select value={openOrderFilter} onChange={(e) => setOpenOrderFilter(e.target.value as 'ALL' | 'BTCUSDT' | 'ETHUSDT' | 'XRPUSDT' | 'DOGEUSDT' | 'BNBUSDT')} className="rounded border border-white/20 bg-black/30 px-2 py-1 text-slate-100">
                            <option value="ALL">ALL</option><option value="BTCUSDT">BTCUSDT</option><option value="ETHUSDT">ETHUSDT</option><option value="XRPUSDT">XRPUSDT</option><option value="DOGEUSDT">DOGEUSDT</option><option value="BNBUSDT">BNBUSDT</option>
                          </select>
                          <button onClick={() => cancelAllOpenOrders('FILTERED')} className="rounded border border-amber-400/40 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-500/10">Cancel Filtered</button>
                          <button onClick={() => cancelAllOpenOrders('ALL')} className="rounded border border-red-400/40 px-2 py-1 text-[10px] text-red-200 hover:bg-red-500/10">Cancel All</button>
                        </div>
                        {ordersFeedback && <div className={`mb-2 rounded border px-2 py-1.5 text-xs ${ordersFeedback.kind === 'success' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-red-400/40 bg-red-500/10 text-red-200'}`}>{ordersFeedback.text}</div>}
                        <div className="max-h-32 overflow-auto pr-1 space-y-1">
                          {visibleOpenOrders.length === 0 ? <div className="text-slate-400">No open orders for this filter</div> : visibleOpenOrders.map((o) => (
                            <div key={`${o.symbol}-${o.orderId}`} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.02] px-2 py-1.5">
                              <div className="text-slate-200">{o.symbol} • {o.side} • {Number(o.price || 0) > 0 ? Number(o.price).toFixed(2) : 'MKT'}</div>
                              <button onClick={() => cancelOpenOrder({ symbol: o.symbol, orderId: o.orderId })} className="rounded border border-red-400/40 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-500/10">Cancel</button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 overflow-x-auto -mx-1 px-1">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead className="text-slate-400"><tr><th className="text-left py-2">Time</th><th className="text-left py-2">Pair</th><th className="text-left py-2">Side</th><th className="text-right py-2">PnL</th></tr></thead>
                          <tbody>
                            {recentTradeRows.length === 0 ? <tr><td colSpan={4} className="py-3 text-slate-400">No closed trades yet</td></tr> : recentTradeRows.slice(0, 8).map((t, i) => (
                              <tr key={`${t.ts}-${i}`} className="border-t border-white/10">
                                <td className="py-2 text-slate-300">{formatDateTime(t.ts)}</td><td className="py-2 font-semibold">{t.symbol || '—'}</td><td className={`py-2 ${String(t.side).toUpperCase() === 'BUY' ? 'text-emerald-300' : 'text-red-300'}`}>{String(t.side || '—').toUpperCase()}</td><td className={`py-2 text-right font-semibold ${Number(t.pnl || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signedMoney(Number(t.pnl || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </div>
                </section>
              </div>
            )}'''
text = text[:start] + new_block + text[end:]
p.write_text(text)
print('replaced dashboard block')
PY
npm run build
PORT_PID=$(/usr/sbin/lsof -tiTCP:3010 -sTCP:LISTEN)
kill -TERM "$PORT_PID"
sleep 3
cd /Users/darrenheadley/.openclaw/workspace/Helix-One/frontend
nohup npm run start > /Users/darrenheadley/.openclaw/workspace/Helix-One/logs/frontend.manual.out.log 2> /Users/darrenheadley/.openclaw/workspace/Helix-One/logs/frontend.manual.err.log < /dev/null &
sleep 5
curl -I --max-time 10 http://127.0.0.1:3010