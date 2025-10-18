# 🚀 Binance Trading Integration Setup Guide

## Overview
This guide will help you connect your Binance account to the HELIX.ONE trading system, enabling live automated trading with your AI models.

## ⚠️ Important Security Notes

1. **NEVER share your API keys** with anyone
2. **Enable IP restrictions** on your Binance API keys
3. **Only enable trading permissions** - NEVER enable withdrawal permissions
4. **Start with testnet** to ensure everything works before using real funds
5. **Keep your secret key secure** - it's like your password

---

## Step 1: Get Binance API Keys

### For Testing (Recommended First)

1. Go to **Binance Futures Testnet**: https://testnet.binancefuture.com
2. Register with your email (no verification needed)
3. Click on your email address in the top right
4. Select **"API Key"**
5. Generate a new API key
6. Save both the **API Key** and **Secret Key** securely
7. You'll automatically receive **10,000 USDT** testnet balance

### For Live Trading (Real Money)

1. Log in to **Binance.com**: https://www.binance.com
2. Go to **Profile → API Management**
3. Click **"Create API"**
4. Complete 2FA verification
5. Label your API key (e.g., "HELIX Trading Bot")
6. Click **"Create"**
7. **IMPORTANT**: Save your Secret Key immediately - it's only shown once!

#### Security Settings (CRITICAL):
- ✅ Enable **"Enable Futures"** permission
- ❌ **DO NOT** enable **"Enable Withdrawals"**
- ✅ Enable **IP Access Restrictions** (add your server IP)
- ✅ Enable **"Trade"** permission for Futures
- ❌ **DO NOT** enable **"Transfer"** or **"Withdraw"** permissions

---

## Step 2: Configure HELIX.ONE

### Option A: Via Web UI (Easiest)

1. Start the HELIX.ONE system:
   ```bash
   cd helix-one
   npm run dev
   ```

2. Open your browser to: http://localhost:3000

3. Click the **"⚙️ Settings"** button in the top right

4. Go to the **"Binance Connection"** tab

5. Enter your credentials:
   - **API Key**: Paste your Binance API key
   - **Secret Key**: Paste your Binance secret key
   - **Testnet Mode**: Toggle ON for testnet, OFF for live trading

6. Click **"🔌 Test Connection"** to verify
   - You should see: ✅ "Connection successful!"

7. Click **"💾 Save Settings"**

### Option B: Via Environment Variables

1. Create/edit `.env` file in the backend directory:
   ```bash
   cd helix-one/backend
   nano .env
   ```

2. Add your Binance credentials:
   ```env
   BINANCE_API_KEY=your_api_key_here
   BINANCE_SECRET_KEY=your_secret_key_here
   BINANCE_TESTNET=true  # Set to 'false' for live trading
   ```

3. Save and restart the backend:
   ```bash
   npm run dev
   ```

---

## Step 3: Configure Model Accounts

1. Go to **Settings → Model Accounts** tab

2. Each AI model will trade independently with its own $10,000 capital allocation

3. Toggle trading ON/OFF for individual models:
   - **DeepSeek Chat V3.1** 🐋
   - **Grok-4** ⚡
   - **Claude Sonnet 4.5** ⭐
   - **GPT 5** 🅖
   - **Qwen3 Max** 🟣
   - **Gemini 2.5 Pro** 💎

4. Models share the master Binance account balance

---

## Step 4: Set Risk Management Parameters

1. Go to **Settings → Risk Management** tab

2. Configure safety limits:
   - **Max Daily Loss**: 3% (recommended)
   - **Max Position Size**: 10% (recommended)
   - **Max Leverage**: 5x (recommended)
   - **Daily Target Return**: 20%

3. Click **"💾 Save Risk Settings"**

---

## Step 5: Start Trading!

### Enable Trading

1. In **Settings → Model Accounts** tab
2. Click the **"▶️ START TRADING"** button
3. Confirm you understand the risks
4. Trading is now LIVE! 🚀

### Monitor Your Positions

- Return to the main dashboard
- Watch the **Leaderboard** to see model performance
- Click on any model to see its:
  - Active positions
  - P&L in real-time
  - Trade history
  - Market analysis

### Emergency Stop

If you need to stop trading immediately:

1. Go to **Settings → Model Accounts**
2. Click **"🛑 STOP ALL TRADING"**
3. Optionally, click **"🚨 Close All Positions"** to exit all trades

---

## Testing Checklist

Before going live with real money:

- [ ] Successfully connected to Binance Testnet
- [ ] Verified account balance shows up correctly
- [ ] Tested placing a small test trade manually
- [ ] Monitored models making trades on testnet
- [ ] Checked P&L tracking is accurate
- [ ] Tested emergency stop functionality
- [ ] Comfortable with risk management settings

---

## Troubleshooting

### "Connection Failed"

**Possible causes:**
- Incorrect API key or secret key
- API key doesn't have Futures permissions enabled
- IP restrictions blocking your connection
- Using live keys with testnet mode (or vice versa)

**Solutions:**
1. Double-check your API credentials
2. Verify Futures trading is enabled on your API key
3. Add your IP to allowed IPs on Binance
4. Ensure testnet toggle matches your key type

### "Insufficient Balance"

**Possible causes:**
- Binance account has less than $10K
- Models trying to allocate more than available

**Solutions:**
1. Deposit more funds to your Binance Futures account
2. Reduce number of active models
3. Reduce max position size in risk settings

### "Order Rejected"

**Possible causes:**
- Position size too small (below minimum)
- Invalid symbol or leverage
- Risk management limits triggered

**Solutions:**
1. Check Binance minimum order sizes
2. Ensure symbols are valid (BTCUSDT, ETHUSDT, etc.)
3. Review risk management settings

---

## Support

For issues or questions:
- Check the logs in `helix-one/backend/logs/`
- Review Binance API documentation: https://binance-docs.github.io/apidocs/futures/en/
- Open an issue on GitHub

---

## Risk Disclaimer

⚠️ **CRYPTOCURRENCY TRADING CARRIES SUBSTANTIAL RISK**

- You can lose all your invested capital
- Past performance does not guarantee future results
- AI models are experimental and can make mistakes
- Use only capital you can afford to lose
- Start small and test thoroughly
- This is NOT financial advice

**YOU ARE SOLELY RESPONSIBLE FOR YOUR TRADING DECISIONS**

---

## Next Steps

Once connected and trading:
1. Monitor performance daily via the dashboard
2. Adjust risk parameters based on results
3. Enable/disable models based on performance
4. Review trade history and learn from AI decisions
5. Scale up gradually as you gain confidence

**Happy Trading! 🚀📈**

