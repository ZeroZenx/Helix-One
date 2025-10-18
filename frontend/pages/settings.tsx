import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface BinanceAccount {
  connected: boolean;
  apiKey: string;
  testnet: boolean;
  balance: number;
  tradingEnabled: boolean;
  lastSync: Date | null;
}

interface ModelAccount {
  modelId: number;
  modelName: string;
  apiKey: string;
  secretKey: string;
  balance: number;
  tradingEnabled: boolean;
  positionsCount: number;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'connection' | 'models' | 'risk'>('connection');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // Master Account Settings
  const [masterApiKey, setMasterApiKey] = useState('');
  const [masterSecretKey, setMasterSecretKey] = useState('');
  const [useTestnet, setUseTestnet] = useState(true);
  const [globalTradingEnabled, setGlobalTradingEnabled] = useState(false);
  
  // Model Accounts
  const [modelAccounts, setModelAccounts] = useState<ModelAccount[]>([
    { modelId: 1, modelName: 'DeepSeek Chat V3.1', apiKey: '', secretKey: '', balance: 10000, tradingEnabled: false, positionsCount: 0 },
    { modelId: 2, modelName: 'Grok-4', apiKey: '', secretKey: '', balance: 10000, tradingEnabled: false, positionsCount: 0 },
    { modelId: 3, modelName: 'Claude Sonnet 4.5', apiKey: '', secretKey: '', balance: 10000, tradingEnabled: false, positionsCount: 0 },
    { modelId: 4, modelName: 'GPT 5', apiKey: '', secretKey: '', balance: 10000, tradingEnabled: false, positionsCount: 0 },
    { modelId: 5, modelName: 'Qwen3 Max', apiKey: '', secretKey: '', balance: 10000, tradingEnabled: false, positionsCount: 0 },
    { modelId: 6, modelName: 'Gemini 2.5 Pro', apiKey: '', secretKey: '', balance: 10000, tradingEnabled: false, positionsCount: 0 },
  ]);
  
  // Risk Management Settings
  const [maxDailyLoss, setMaxDailyLoss] = useState(3);
  const [maxPositionSize, setMaxPositionSize] = useState(10);
  const [maxLeverage, setMaxLeverage] = useState(5);
  const [dailyTargetReturn, setDailyTargetReturn] = useState(20);

  useEffect(() => {
    loadSettings();
    checkTradingStatus();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/trading/settings');
      if (response.ok) {
        const data = await response.json();
        setMasterApiKey(data.masterApiKey || '');
        setUseTestnet(data.testnet || true);
        setGlobalTradingEnabled(data.tradingEnabled || false);
        if (data.modelAccounts) {
          setModelAccounts(data.modelAccounts);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const checkTradingStatus = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/trading/status');
      if (response.ok) {
        const data = await response.json();
        setGlobalTradingEnabled(data.globalTradingEnabled || false);
        if (data.activePortfolios) {
          const updatedModels = modelAccounts.map(model => {
            const portfolio = data.activePortfolios.find((p: any) => p.modelId === model.modelId);
            if (portfolio) {
              return {
                ...model,
                balance: portfolio.currentBalance,
                tradingEnabled: portfolio.tradingEnabled,
                positionsCount: portfolio.positionsCount
              };
            }
            return model;
          });
          setModelAccounts(updatedModels);
        }
      }
    } catch (error) {
      console.error('Error checking trading status:', error);
    }
  };

  const testConnection = async () => {
    if (!masterApiKey || !masterSecretKey) {
      setConnectionStatus('error');
      return;
    }

    setTesting(true);
    setConnectionStatus('idle');

    try {
      const response = await fetch('http://localhost:3001/api/trading/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: masterApiKey,
          secretKey: masterSecretKey,
          testnet: useTestnet
        })
      });

      if (response.ok) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionStatus('error');
    } finally {
      setTesting(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);

    try {
      const response = await fetch('http://localhost:3001/api/trading/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterApiKey,
          masterSecretKey,
          testnet: useTestnet,
          modelAccounts,
          riskSettings: {
            maxDailyLoss,
            maxPositionSize,
            maxLeverage,
            dailyTargetReturn
          }
        })
      });

      if (response.ok) {
        alert('Settings saved successfully!');
      } else {
        alert('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleGlobalTrading = async () => {
    try {
      const newState = !globalTradingEnabled;
      const response = await fetch('http://localhost:3001/api/trading/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: newState })
      });

      if (response.ok) {
        setGlobalTradingEnabled(newState);
        alert(`Global trading ${newState ? 'ENABLED' : 'DISABLED'}`);
      }
    } catch (error) {
      console.error('Error toggling trading:', error);
    }
  };

  const closeAllPositions = async () => {
    if (!confirm('Are you sure you want to close ALL open positions across all models?')) {
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/trading/close-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (response.ok) {
        alert('All positions closed successfully');
        checkTradingStatus();
      } else {
        alert('Failed to close positions');
      }
    } catch (error) {
      console.error('Error closing positions:', error);
      alert('Error closing positions');
    }
  };

  const updateModelAccount = (modelId: number, field: string, value: any) => {
    setModelAccounts(prev => 
      prev.map(model => 
        model.modelId === modelId ? { ...model, [field]: value } : model
      )
    );
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border-b border-gray-800">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">⚙️ Trading System Settings</h1>
              <p className="text-gray-400 mt-1">Configure Binance API and manage trading parameters</p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-4 py-2 rounded-full text-sm font-bold ${
                globalTradingEnabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                Trading: {globalTradingEnabled ? 'ENABLED' : 'DISABLED'}
              </div>
              <a href="/" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
                ← Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-900 p-2 rounded-lg">
          <button
            onClick={() => setActiveTab('connection')}
            className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'connection' 
                ? 'bg-cyan-500 text-black' 
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            🔌 Binance Connection
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'models' 
                ? 'bg-cyan-500 text-black' 
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            🤖 Model Accounts
          </button>
          <button
            onClick={() => setActiveTab('risk')}
            className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'risk' 
                ? 'bg-cyan-500 text-black' 
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            🛡️ Risk Management
          </button>
        </div>

        {/* Connection Tab */}
        {activeTab === 'connection' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Warning Banner */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-yellow-400 mb-1">Security Warning</h3>
                  <p className="text-sm text-gray-300">
                    Never share your API keys with anyone. Enable IP restrictions and trading-only permissions on Binance.
                    Start with testnet mode to ensure everything works correctly before using real funds.
                  </p>
                </div>
              </div>
            </div>

            {/* Master Account Settings */}
            <div className="bg-gray-900 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Master Binance Account</h2>
              
              <div className="space-y-4">
                {/* Testnet Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                  <div>
                    <div className="font-bold">Testnet Mode</div>
                    <div className="text-sm text-gray-400">Use Binance Futures Testnet (recommended for testing)</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useTestnet}
                      onChange={(e) => setUseTestnet(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>

                {/* API Key */}
                <div>
                  <label className="block text-sm font-bold mb-2">API Key</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={masterApiKey}
                      onChange={(e) => setMasterApiKey(e.target.value)}
                      placeholder="Enter your Binance API key"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      {showApiKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* Secret Key */}
                <div>
                  <label className="block text-sm font-bold mb-2">Secret Key</label>
                  <div className="relative">
                    <input
                      type={showSecretKey ? 'text' : 'password'}
                      value={masterSecretKey}
                      onChange={(e) => setMasterSecretKey(e.target.value)}
                      placeholder="Enter your Binance secret key"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      {showSecretKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* Connection Status */}
                {connectionStatus !== 'idle' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`p-4 rounded-lg ${
                      connectionStatus === 'success' 
                        ? 'bg-green-500/20 border border-green-500/30 text-green-400' 
                        : 'bg-red-500/20 border border-red-500/30 text-red-400'
                    }`}
                  >
                    {connectionStatus === 'success' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xl">✅</span>
                        <span className="font-bold">Connection successful! Your Binance account is connected.</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xl">❌</span>
                        <span className="font-bold">Connection failed. Please check your API keys and try again.</span>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={testConnection}
                    disabled={testing || !masterApiKey || !masterSecretKey}
                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-bold transition-all"
                  >
                    {testing ? '🔄 Testing...' : '🔌 Test Connection'}
                  </button>
                  <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-bold transition-all"
                  >
                    {saving ? '💾 Saving...' : '💾 Save Settings'}
                  </button>
                </div>
              </div>
            </div>

            {/* How to Get API Keys */}
            <div className="bg-gray-900 rounded-lg p-6">
              <h3 className="text-lg font-bold mb-3">📚 How to Get Binance API Keys</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <p><strong>For Testnet (Recommended for Testing):</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-4">
                  <li>Go to <a href="https://testnet.binancefuture.com" target="_blank" className="text-cyan-400 hover:underline">https://testnet.binancefuture.com</a></li>
                  <li>Register with your email (no verification needed)</li>
                  <li>Generate API keys from the dashboard</li>
                  <li>You'll receive 10,000 USDT testnet balance</li>
                </ol>
                
                <p className="mt-4"><strong>For Live Trading (Real Money):</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-4">
                  <li>Log in to <a href="https://www.binance.com" target="_blank" className="text-cyan-400 hover:underline">Binance.com</a></li>
                  <li>Go to API Management in your account settings</li>
                  <li>Create a new API key</li>
                  <li>Enable "Futures" permissions only</li>
                  <li>Enable IP restrictions for security</li>
                  <li>⚠️ NEVER enable withdrawal permissions</li>
                </ol>
              </div>
            </div>
          </motion.div>
        )}

        {/* Model Accounts Tab */}
        {activeTab === 'models' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-gray-900 rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold">AI Model Trading Accounts</h2>
                  <p className="text-sm text-gray-400 mt-1">Each model can have its own sub-account or share the master account</p>
                </div>
                <button
                  onClick={toggleGlobalTrading}
                  className={`px-6 py-3 rounded-lg font-bold transition-all ${
                    globalTradingEnabled 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {globalTradingEnabled ? '🛑 STOP ALL TRADING' : '▶️ START TRADING'}
                </button>
              </div>

              <div className="space-y-4">
                {modelAccounts.map((model) => (
                  <div key={model.modelId} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-lg">{model.modelName}</h3>
                        <div className="text-sm text-gray-400">
                          Balance: ${model.balance.toLocaleString()} • 
                          Open Positions: {model.positionsCount}
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={model.tradingEnabled}
                          onChange={(e) => updateModelAccount(model.modelId, 'tradingEnabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                      </label>
                    </div>

                    <div className="text-xs text-gray-500">
                      Using master account credentials (shared balance)
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={closeAllPositions}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold transition-all"
                >
                  🚨 Close All Positions
                </button>
                <button
                  onClick={checkTradingStatus}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition-all"
                >
                  🔄 Refresh Status
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Risk Management Tab */}
        {activeTab === 'risk' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-gray-900 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-6">Risk Management Parameters</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Max Daily Loss */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <label className="block text-sm font-bold mb-2">Max Daily Loss (%)</label>
                  <input
                    type="number"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-xs text-gray-400 mt-2">Trading stops if loss exceeds this percentage</p>
                </div>

                {/* Max Position Size */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <label className="block text-sm font-bold mb-2">Max Position Size (%)</label>
                  <input
                    type="number"
                    value={maxPositionSize}
                    onChange={(e) => setMaxPositionSize(Number(e.target.value))}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-xs text-gray-400 mt-2">Maximum capital per single position</p>
                </div>

                {/* Max Leverage */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <label className="block text-sm font-bold mb-2">Max Leverage (x)</label>
                  <input
                    type="number"
                    value={maxLeverage}
                    onChange={(e) => setMaxLeverage(Number(e.target.value))}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-xs text-gray-400 mt-2">Maximum leverage allowed for positions</p>
                </div>

                {/* Daily Target Return */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <label className="block text-sm font-bold mb-2">Daily Target Return (%)</label>
                  <input
                    type="number"
                    value={dailyTargetReturn}
                    onChange={(e) => setDailyTargetReturn(Number(e.target.value))}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-xs text-gray-400 mt-2">Target daily return percentage</p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-bold transition-all"
                >
                  {saving ? '💾 Saving...' : '💾 Save Risk Settings'}
                </button>
              </div>
            </div>

            {/* Current Risk Status */}
            <div className="bg-gray-900 rounded-lg p-6">
              <h3 className="text-lg font-bold mb-4">Current Risk Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-400">Daily P&L</div>
                  <div className="text-xl font-bold text-green-400">+$234.50</div>
                  <div className="text-xs text-gray-500">+2.35%</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-400">Max Drawdown</div>
                  <div className="text-xl font-bold text-red-400">-$87.20</div>
                  <div className="text-xs text-gray-500">-0.87%</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-400">Total Positions</div>
                  <div className="text-xl font-bold text-white">12</div>
                  <div className="text-xs text-gray-500">Across 6 models</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-400">Risk Level</div>
                  <div className="text-xl font-bold text-yellow-400">MEDIUM</div>
                  <div className="text-xs text-gray-500">Within limits</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
