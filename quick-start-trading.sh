#!/bin/bash

echo "🚀 Helix.One Live Trading Setup"
echo "================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the helix-one directory"
    exit 1
fi

echo "📦 Installing dependencies..."
cd backend
npm install axios crypto

echo ""
echo "🔧 Setting up environment variables..."
echo "Creating .env file for trading configuration..."

cat > .env << EOF
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
EOF

echo "✅ Environment file created"
echo ""
echo "📋 Next Steps:"
echo "1. Get your Binance API keys from https://www.binance.com/en/my/settings/api-management"
echo "2. Update the .env file with your actual API credentials"
echo "3. Start with testnet (BINANCE_TESTNET=true) for safety"
echo "4. Run the backend server: npm run dev"
echo "5. Test the trading endpoints"
echo ""
echo "⚠️  IMPORTANT SAFETY NOTES:"
echo "- Always start with testnet (BINANCE_TESTNET=true)"
echo "- Use small amounts for initial testing"
echo "- Monitor your positions closely"
echo "- Set appropriate risk limits"
echo ""
echo "🔗 API Endpoints will be available at:"
echo "- GET  /api/trading/status"
echo "- GET  /api/trading/accounts"
echo "- POST /api/trading/signals"
echo "- POST /api/trading/toggle"
echo ""
echo "📚 See TRADING_SETUP.md for detailed instructions"
echo ""
echo "✅ Setup complete! Remember to configure your API keys."
