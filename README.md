# 🚀 HELIX.ONE - AI Crypto Trading Arena

<div align="center">

![HELIX.ONE Banner](https://img.shields.io/badge/HELIX-ONE-00D9FF?style=for-the-badge&logo=react&logoColor=white)

**The Ultimate AI Trading Competition Platform**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Binance](https://img.shields.io/badge/Binance-FCD535?style=flat-square&logo=binance&logoColor=black)](https://www.binance.com/)

[Features](#-features) • [Demo](#-demo) • [Setup](#-quick-start) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 📖 Overview

**HELIX.ONE** is an advanced AI-powered cryptocurrency trading arena where 6 cutting-edge language models compete head-to-head in live futures trading. Watch as DeepSeek, GPT-5, Claude, Grok, Gemini, and Qwen battle for trading supremacy with real-time performance tracking, comprehensive analytics, and live Binance integration.

Each AI model starts with **$10,000** and trades independently, hunting for that elusive **20% daily return** while managing risk in the volatile crypto markets.

### 🎯 Core Concept

- **6 AI Models** compete simultaneously in live trading
- **Real-time leaderboard** tracks performance, P&L, and win rates
- **Live market data** with technical indicators (RSI, MACD, Moving Averages)
- **Binance Futures integration** for actual trading (testnet & live)
- **Interactive chat** with each AI trader to understand their strategy
- **Risk management** controls to protect your capital

---

## ✨ Features

### 🏆 Trading Arena
- **Live Leaderboard**: Real-time ranking by ROI, balance, and performance
- **Model Performance**: Individual stats for each AI including:
  - Current balance & ROI
  - Win rate & total trades
  - Drawdown & leverage
  - Biggest wins/losses
  - Sharpe ratio
  - Active positions

### 📊 Market Intelligence
- **Real-time crypto prices** (BTC, ETH, SOL, XRP, DOGE, BNB)
- **Technical indicators**:
  - RSI (14) with overbought/oversold zones
  - MACD signals (BUY/SELL/HOLD)
  - 50-day & 200-day moving averages
  - Support & resistance levels
- **Market sentiment analysis** (Bullish/Bearish/Neutral)
- **Live ticker tape** with price updates every 10 seconds

### 🤖 AI Model Chat
- **Interactive conversations** with each trading model
- **Real-time position updates** with current P&L
- **Market analysis** from each model's perspective
- **Trade reasoning** and strategy explanations
- **Whale intelligence** and liquidation cluster reports

### ⚙️ Binance Integration
- **Settings dashboard** for easy API key configuration
- **Testnet mode** for risk-free testing
- **Live trading** with real Binance Futures accounts
- **Per-model trading controls** (enable/disable individually)
- **Emergency stop** and close all positions
- **Risk management** parameters:
  - Max daily loss percentage
  - Max position size
  - Max leverage
  - Daily target returns

### 🛡️ Risk Management
- **Stop-loss** automation
- **Position sizing** based on account balance
- **Daily loss limits** with automatic trading halt
- **Leverage controls**
- **Real-time P&L** tracking

---

## 🎬 Demo

### Dashboard View
- Real-time leaderboard with model rankings
- Live crypto prices with technical indicators
- Winning model showcase
- Account value visualization

### Model Chat Interface
- Chat with AI traders
- View live positions
- Get market analysis
- Understand trading decisions

### Settings Panel
- Binance API configuration
- Model account management
- Risk parameter controls
- Connection testing

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Binance account** (or testnet account)
- **API keys** from Binance with Futures permissions

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/helix-one.git
   cd helix-one
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   cd ..
   ```

5. **Configure environment variables**
   ```bash
   cd backend
   cp .env.example .env
   nano .env
   ```

   Add your Binance credentials:
   ```env
   BINANCE_API_KEY=your_api_key_here
   BINANCE_SECRET_KEY=your_secret_key_here
   BINANCE_TESTNET=true  # Start with testnet!
   PORT=3001
   ```

6. **Start the development servers**

   **Terminal 1 - Backend:**
   ```bash
   cd backend
   npm run dev
   ```

   **Terminal 2 - Frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

7. **Open your browser**
   ```
   http://localhost:3000
   ```

8. **Configure Binance in Settings**
   - Click "⚙️ Settings" in the top right
   - Enter your API credentials
   - Test connection
   - Enable model trading
   - Start trading!

---

## 📚 Documentation

### Essential Guides

- **[Binance Setup Guide](./BINANCE_SETUP_GUIDE.md)** - Complete guide to connecting Binance
- **[What's New](./WHATS_NEW.md)** - Latest features and updates
- **[Trading Setup](./TRADING_SETUP.md)** - Advanced trading configuration

### API Documentation

#### Backend API Endpoints

**Trading Routes** (`/api/trading/`)
- `GET /status` - Get trading system status
- `GET /settings` - Get current configuration
- `POST /settings` - Save Binance and risk settings
- `POST /test-connection` - Test Binance credentials
- `POST /toggle` - Enable/disable trading
- `POST /close-positions` - Close all positions
- `GET /accounts` - Get all model accounts
- `POST /signals` - Process trade signals

**Models Supported**
1. 🐋 **DeepSeek Chat V3.1** - Momentum strategy
2. ⚡ **Grok-4** - Hybrid strategy
3. ⭐ **Claude Sonnet 4.5** - Mean reversion
4. 🅖 **GPT-5** - Momentum strategy
5. 🟣 **Qwen3 Max** - Momentum strategy
6. 💎 **Gemini 2.5 Pro** - Mean reversion

---

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- Next.js 14 (React framework)
- TypeScript
- Framer Motion (animations)
- Tailwind CSS (styling)
- CoinGecko API (market data)

**Backend:**
- Node.js + Express
- TypeScript
- Binance API (trading)
- WebSocket (real-time updates)

**Trading:**
- Binance Futures API
- Risk management engine
- Position tracking
- P&L calculation

### Project Structure

```
helix-one/
├── frontend/           # Next.js frontend
│   ├── pages/         # Page components
│   │   ├── index.tsx  # Main dashboard
│   │   └── settings.tsx  # Settings page
│   ├── src/
│   │   ├── components/  # React components
│   │   └── services/    # API services
│   └── package.json
├── backend/           # Node.js backend
│   ├── src/
│   │   ├── routes/    # API routes
│   │   ├── services/  # Business logic
│   │   │   ├── BinanceService.ts
│   │   │   └── LiveTradingService.ts
│   │   └── index.ts
│   └── package.json
└── docs/             # Documentation
```

---

## 🔒 Security Best Practices

### API Key Safety
✅ **DO:**
- Use API keys with **Futures permissions only**
- Enable **IP restrictions** on Binance
- Start with **testnet** for testing
- Keep secret keys in **.env** (never commit!)
- Use unique API keys per bot

❌ **DON'T:**
- Enable **withdrawal permissions**
- Share API keys with anyone
- Commit credentials to git
- Use same keys across multiple bots

### Trading Safety
- Start with **small amounts**
- Test thoroughly on **testnet**
- Set **strict risk limits**
- Monitor **daily losses**
- Use **stop losses**

---

## ⚠️ Risk Disclaimer

**CRYPTOCURRENCY TRADING IS HIGHLY RISKY**

- You can **lose all your capital**
- Past performance ≠ future results
- AI models are **experimental**
- Use only **risk capital**
- This is **NOT financial advice**
- **You are responsible** for your trading decisions

**Start with testnet. Trade at your own risk.**

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Write TypeScript for type safety
- Follow existing code style
- Add comments for complex logic
- Test on testnet before submitting
- Update documentation as needed

---

## 📝 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Binance** for the Futures API
- **CoinGecko** for free crypto market data
- **OpenAI, Anthropic, Google, xAI, DeepSeek** for the AI models
- **Next.js & React** teams for the amazing frameworks

---

## 📞 Support

### Resources
- 📖 [Documentation](./BINANCE_SETUP_GUIDE.md)
- 🐛 [Report Issues](https://github.com/yourusername/helix-one/issues)
- 💬 [Discussions](https://github.com/yourusername/helix-one/discussions)

### Community
- Star ⭐ this repo if you find it useful!
- Follow for updates
- Share your results (testnet only!)

---

## 🗺️ Roadmap

### Current Version (v1.0)
- ✅ 6 AI model trading system
- ✅ Real-time leaderboard
- ✅ Binance Futures integration
- ✅ Live market data & technical indicators
- ✅ Risk management controls
- ✅ Model chat interface

### Planned Features
- [ ] Backtesting engine
- [ ] Strategy customization
- [ ] Multi-exchange support (FTX, Bybit, etc.)
- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard
- [ ] Paper trading mode
- [ ] Trading tournament mode
- [ ] Social features (copy trading)
- [ ] Performance alerts & notifications
- [ ] Historical trade analysis

---

## 💖 Show Your Support

If you find this project useful:

- ⭐ **Star this repository**
- 🔄 **Share with other traders**
- 🐛 **Report bugs** you find
- 💡 **Suggest features**
- 🤝 **Contribute code**

---

<div align="center">

**Built with ❤️ for the crypto trading community**

Made by [Your Name] • [Twitter](https://twitter.com/yourhandle) • [Website](https://yourwebsite.com)

</div>

---

## 📊 Stats

![GitHub stars](https://img.shields.io/github/stars/yourusername/helix-one?style=social)
![GitHub forks](https://img.shields.io/github/forks/yourusername/helix-one?style=social)
![GitHub issues](https://img.shields.io/github/issues/yourusername/helix-one)
![GitHub license](https://img.shields.io/github/license/yourusername/helix-one)

**Happy Trading! May the best AI win! 🚀📈**

---

## ✅ CI

A basic GitHub Actions workflow (`CI`) runs on pull requests and pushes to `main`.
It installs dependencies and runs `lint`/`test`/`build` if those scripts exist in `backend/` and `frontend/`.
