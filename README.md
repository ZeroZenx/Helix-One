# HELIX.ONE

![Status](https://img.shields.io/badge/status-active-22c55e)
![Model](https://img.shields.io/badge/model-DeepSeek--only-3b82f6)
![Runtime](https://img.shields.io/badge/runtime-Next.js%2014%20%2B%20Node.js-111827)
![Exchange](https://img.shields.io/badge/exchange-Binance%20Futures-f59e0b)
![Risk](https://img.shields.io/badge/risk-controls%20enforced-ef4444)

AI-assisted crypto futures command center with live Binance integration, risk gating, and a DeepSeek-driven decision pipeline.

> **Current architecture:** single-model execution path (DeepSeek-only), not a 6-model arena.

---

## Overview

HELIX.ONE is a real-time trading system built for disciplined execution:

- **Live dashboard** for account state, market context, and execution readiness
- **DeepSeek decision brain** for structured trade/no-trade guidance
- **Risk-first execution worker** with hard guardrails
- **Binance Futures integration** (testnet or live)
- **Operational controls** for settings, toggles, and emergency close

The system is designed to prioritize consistency and risk controls over hype.

---

## What It Does Today

### Dashboard (Frontend)
- Connection state (`LIVE/OFFLINE`, `CONNECTED/DISCONNECTED`)
- Wallet balance, available margin, daily P&L
- Open positions and recent trade activity
- Market snapshot (BTC/ETH/SOL/XRP/DOGE/BNB)
- Regime + liquidity + volatility context
- DeepSeek decision panel:
  - Decision mode (`TRADE`, `NO_TRADE`, `COOLDOWN`)
  - Trigger state (`SCANNING`, `TRIGGER_ARMED`, etc.)
  - Entry zone, invalidators, trigger diagnostics
- Worker heartbeat (last run, last action, reason)

### Backend / Trading Engine
- Loads and manages trading settings
- Pulls exchange account + positions
- Applies risk constraints before signal execution
- Tracks journal entries (`trade_open`, `trade_close`, signal rejections)
- Exposes API endpoints for UI + operations

### Risk Controls
- Max daily loss
- Max position size
- Max leverage
- Kill-switch drawdown
- Cooldown handling
- Max trades per day
- Max consecutive losses

---

## Tech Stack

**Frontend**
- Next.js 14
- React + TypeScript
- Tailwind CSS

**Backend**
- Node.js + Express
- TypeScript
- Binance Futures API integration

**Data / Runtime**
- Local JSON/JSONL state + journal artifacts
- LaunchAgent scripts for persistent local service operation (macOS)

---

## Project Structure

```text
Helix-One/
├── frontend/
│   ├── pages/
│   │   ├── index.tsx
│   │   └── settings.tsx
│   └── src/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   └── services/
│   └── data/
├── launchd/
├── logs/
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm
- Binance Futures API credentials (use testnet first)

### 1) Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2) Configure backend env

```bash
cd ../backend
cp .env.example .env
```

Set at minimum:

```env
BINANCE_API_KEY=your_key
BINANCE_SECRET_KEY=your_secret
BINANCE_TESTNET=true
PORT=3001
```

### 3) Run locally

Backend:
```bash
cd backend
npm run dev
```

Frontend:
```bash
cd frontend
npm run dev
```

Open:
- Frontend: `http://127.0.0.1:3010` (project default)
- Backend API: `http://127.0.0.1:3001`

---

## Core API Endpoints

Base: `/api/trading`

- `GET /health`
- `GET /status`
- `GET /settings`
- `POST /settings`
- `POST /test-connection`
- `POST /toggle`
- `POST /close-positions`
- `GET /daily-briefing`
- `GET /risk-context`
- `GET /journal`
- `GET /worker-status`

(Additional internal/admin routes exist for experimentation and operations.)

---

## Security & Safety

- Never commit real API keys/secrets
- Use Binance keys with **no withdrawal permission**
- Prefer **testnet** while validating configuration
- Enforce conservative risk limits before live mode
- Monitor worker heartbeat and rejection reasons continuously

---

## Risk Disclaimer

Crypto futures trading is high risk.

- Losses can exceed expectations quickly
- No model output is guaranteed
- This system is tooling, **not financial advice**
- You are responsible for all execution decisions

Trade small, verify behavior, and use strict guardrails.

---

## Status Note

If you previously saw HELIX.ONE described as a 6-model tournament, that was an earlier concept. The current production implementation is focused on a single DeepSeek-driven execution path with hardened risk controls.
