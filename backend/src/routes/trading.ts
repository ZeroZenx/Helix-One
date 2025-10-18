import { Router } from 'express';
import { LiveTradingService, TradingConfig, TradeSignal } from '../services/LiveTradingService';
import { BinanceService } from '../services/BinanceService';

const router = Router();

// Initialize trading service (this would be done in your main app)
let tradingService: LiveTradingService | null = null;

// Trading configuration
const tradingConfig: TradingConfig = {
  maxPositionSize: 0.1, // 10% of account per position
  maxDailyLoss: 0.05, // 5% max daily loss
  maxLeverage: 5, // 5x max leverage
  stopLossPercentage: 0.02, // 2% stop loss
  takeProfitPercentage: 0.05, // 5% take profit
  minTradeAmount: 10 // $10 minimum trade
};

// Initialize trading service
export const initializeTrading = async (binanceConfig: any) => {
  try {
    tradingService = new LiveTradingService(binanceConfig, tradingConfig);
    await tradingService.initialize();
    console.log('✅ Trading service initialized');
    return tradingService;
  } catch (error) {
    console.error('Failed to initialize trading service:', error);
    throw error;
  }
};

// Get trading status
router.get('/status', (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  const status = tradingService.getTradingStatus();
  res.json(status);
});

// Get all model accounts
router.get('/accounts', (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  const accounts = tradingService.getAllModelAccounts();
  res.json(accounts);
});

// Get specific model account
router.get('/accounts/:modelId', (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  const { modelId } = req.params;
  const account = tradingService.getModelAccount(modelId);
  
  if (!account) {
    return res.status(404).json({ error: 'Model account not found' });
  }

  res.json(account);
});

// Create model account
router.post('/accounts', (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  const { modelId, modelName, allocatedBalance } = req.body;

  if (!modelId || !modelName || !allocatedBalance) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const account = tradingService.createModelAccount(modelId, modelName, allocatedBalance);
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process trade signal
router.post('/signals', async (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  const signal: TradeSignal = req.body;

  // Validate signal
  if (!signal.modelId || !signal.symbol || !signal.side || !signal.type) {
    return res.status(400).json({ error: 'Invalid signal format' });
  }

  try {
    const success = await tradingService.processTradeSignal(signal);
    res.json({ success, signal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle trading
router.post('/toggle', (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  const { enabled } = req.body;
  tradingService.setTradingEnabled(enabled);
  
  res.json({ enabled, message: `Trading ${enabled ? 'enabled' : 'disabled'}` });
});

// Update positions
router.post('/update-positions', async (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  try {
    await tradingService.updatePositions();
    res.json({ success: true, message: 'Positions updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Close all positions for a model
router.post('/close-positions/:modelId', async (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  const { modelId } = req.params;

  try {
    await tradingService.closeAllPositions(modelId);
    res.json({ success: true, message: `All positions closed for model ${modelId}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Binance account info
router.get('/binance/account', async (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  try {
    // This would require access to the Binance service
    // For now, return a placeholder
    res.json({ message: 'Binance account info endpoint' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Binance connectivity
router.get('/binance/test', async (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  try {
    // This would test the Binance connection
    res.json({ connected: true, message: 'Binance connection test' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test connection with provided credentials
router.post('/test-connection', async (req, res) => {
  const { apiKey, secretKey, testnet } = req.body;

  if (!apiKey || !secretKey) {
    return res.status(400).json({ error: 'API key and secret key are required' });
  }

  try {
    const binanceService = new BinanceService(apiKey, secretKey, testnet);
    const accountInfo = await binanceService.getAccountInfo();
    res.json({ success: true, connected: true, accountInfo });
  } catch (error: any) {
    res.status(500).json({ success: false, connected: false, error: error.message });
  }
});

// Get current settings
router.get('/settings', (req, res) => {
  // In production, load from database
  // For now, return mock data
  res.json({
    masterApiKey: '',
    testnet: true,
    tradingEnabled: tradingService?.getTradingStatus().enabled || false,
    modelAccounts: tradingService?.getAllModelAccounts() || []
  });
});

// Save settings
router.post('/settings', async (req, res) => {
  const { masterApiKey, masterSecretKey, testnet, modelAccounts, riskSettings } = req.body;

  try {
    // In production, save to database
    // For now, just reinitialize trading service if keys are provided
    if (masterApiKey && masterSecretKey) {
      const binanceConfig = {
        apiKey: masterApiKey,
        secretKey: masterSecretKey,
        testnet
      };

      // Update trading config if risk settings provided
      if (riskSettings) {
        tradingConfig.maxDailyLoss = riskSettings.maxDailyLoss / 100;
        tradingConfig.maxPositionSize = riskSettings.maxPositionSize / 100;
        tradingConfig.maxLeverage = riskSettings.maxLeverage;
      }

      tradingService = new LiveTradingService(binanceConfig, tradingConfig);
      await tradingService.initialize();

      // Initialize model accounts
      if (modelAccounts) {
        for (const model of modelAccounts) {
          tradingService.createModelAccount(model.modelId.toString(), model.modelName, 10000);
        }
      }
    }

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Close all positions (across all models)
router.post('/close-positions', async (req, res) => {
  if (!tradingService) {
    return res.status(400).json({ error: 'Trading service not initialized' });
  }

  const { modelId } = req.body;

  try {
    if (modelId) {
      await tradingService.closeAllPositions(modelId);
      res.json({ success: true, message: `All positions closed for model ${modelId}` });
    } else {
      // Close for all models
      const accounts = tradingService.getAllModelAccounts();
      for (const account of accounts) {
        await tradingService.closeAllPositions(account.modelId);
      }
      res.json({ success: true, message: 'All positions closed for all models' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
