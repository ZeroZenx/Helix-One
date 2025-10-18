# Live Trading Setup Guide

## 🚀 Connecting to Binance for Live Trading

This guide will help you connect your AI trading system to Binance for live trading.

### 1. Binance API Setup

#### Step 1: Create Binance Account
1. Go to [Binance.com](https://binance.com) and create an account
2. Complete KYC verification
3. Enable 2FA for security

#### Step 2: Create API Keys
1. Go to [API Management](https://www.binance.com/en/my/settings/api-management)
2. Click "Create API"
3. Choose "System generated" for API Key
4. Set API restrictions:
   - **IP Access Restriction**: Add your server IP
   - **API Key Permissions**: Enable "Enable Futures" and "Enable Reading"
5. Save your API Key and Secret Key securely

#### Step 3: Test with Testnet (Recommended)
1. Go to [Binance Testnet](https://testnet.binancefuture.com/)
2. Create testnet API keys
3. Use testnet for initial testing

### 2. Environment Configuration

Create a `.env` file in the backend directory:

```bash
# Binance API Configuration
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_SECRET_KEY=your_binance_secret_key_here
BINANCE_TESTNET=true

# Trading Configuration
MAX_POSITION_SIZE=0.1
MAX_DAILY_LOSS=0.05
MAX_LEVERAGE=5
STOP_LOSS_PERCENTAGE=0.02
TAKE_PROFIT_PERCENTAGE=0.05
MIN_TRADE_AMOUNT=10

# Model Allocations (in USDT)
DEEPSEEK_ALLOCATION=1000
CLAUDE_ALLOCATION=1000
GPT5_ALLOCATION=1000
GEMINI_ALLOCATION=1000
QWEN_ALLOCATION=1000
GROK_ALLOCATION=1000
```

### 3. Install Dependencies

```bash
cd helix-one/backend
npm install axios crypto
```

### 4. Initialize Trading Service

Add this to your main server file:

```typescript
import { initializeTrading } from './routes/trading';

// Initialize trading service
const binanceConfig = {
  apiKey: process.env.BINANCE_API_KEY,
  secretKey: process.env.BINANCE_SECRET_KEY,
  testnet: process.env.BINANCE_TESTNET === 'true'
};

await initializeTrading(binanceConfig);
```

### 5. API Endpoints

The trading service provides these endpoints:

#### Get Trading Status
```bash
GET /api/trading/status
```

#### Get Model Accounts
```bash
GET /api/trading/accounts
```

#### Create Model Account
```bash
POST /api/trading/accounts
{
  "modelId": "deepseek-1",
  "modelName": "DeepSeek Chat V3.1",
  "allocatedBalance": 1000
}
```

#### Process Trade Signal
```bash
POST /api/trading/signals
{
  "modelId": "deepseek-1",
  "symbol": "BTC",
  "side": "BUY",
  "type": "MARKET",
  "quantity": 0.01,
  "leverage": 2,
  "confidence": 0.85,
  "reason": "Strong bullish momentum detected"
}
```

#### Toggle Trading
```bash
POST /api/trading/toggle
{
  "enabled": true
}
```

### 6. Risk Management Features

#### Position Sizing
- Maximum 10% of account per position
- Minimum $10 trade amount
- Dynamic position sizing based on confidence

#### Stop Loss & Take Profit
- Automatic 2% stop loss
- 5% take profit targets
- Trailing stops for winners

#### Daily Limits
- Maximum 5% daily loss per model
- Automatic trading halt on limit breach
- Real-time P&L monitoring

### 7. Integration with AI Models

#### Frontend Integration
Update your frontend to send trade signals:

```typescript
const sendTradeSignal = async (modelId: string, signal: TradeSignal) => {
  const response = await fetch('/api/trading/signals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signal)
  });
  return response.json();
};
```

#### Real-time Updates
The trading service emits events for real-time updates:

```typescript
tradingService.on('tradeExecuted', (data) => {
  console.log('Trade executed:', data);
  // Update UI with new trade
});

tradingService.on('tradeError', (data) => {
  console.log('Trade error:', data);
  // Handle error
});
```

### 8. Safety Features

#### Testnet First
- Always test with Binance testnet first
- Verify all functionality before live trading
- Start with small amounts

#### Monitoring
- Real-time position tracking
- P&L monitoring
- Risk alerts
- Trade history logging

#### Emergency Controls
- Emergency stop button
- Close all positions
- Disable trading per model
- Account balance monitoring

### 9. Security Best Practices

#### API Key Security
- Never commit API keys to version control
- Use environment variables
- Restrict API key permissions
- Enable IP whitelisting

#### Server Security
- Use HTTPS
- Implement rate limiting
- Monitor for unusual activity
- Regular security audits

### 10. Monitoring & Alerts

#### Real-time Dashboard
- Live P&L tracking
- Position monitoring
- Trade execution logs
- Risk metrics

#### Alerts
- Email/SMS on large losses
- Position size warnings
- Connection issues
- API rate limit alerts

### 11. Getting Started Checklist

- [ ] Binance account created and verified
- [ ] API keys generated with proper permissions
- [ ] Testnet testing completed
- [ ] Environment variables configured
- [ ] Dependencies installed
- [ ] Trading service initialized
- [ ] Model accounts created
- [ ] Risk limits set
- [ ] Monitoring dashboard active
- [ ] Emergency procedures tested

### 12. Support

For issues or questions:
- Check Binance API documentation
- Review error logs
- Test with small amounts first
- Use testnet for development

## ⚠️ Important Warnings

1. **Start Small**: Begin with small amounts to test the system
2. **Use Testnet**: Always test thoroughly before live trading
3. **Monitor Closely**: Keep an eye on positions and P&L
4. **Set Limits**: Use appropriate risk management
5. **Backup Plans**: Have emergency stop procedures ready

## 🎯 Next Steps

1. Set up your Binance account and API keys
2. Configure the environment variables
3. Test with the testnet
4. Create model accounts
5. Start with paper trading
6. Gradually increase to live trading

Remember: Trading involves risk. Only trade with money you can afford to lose!
