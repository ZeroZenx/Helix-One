# 📊 Helix.One - Visual Analytics Dashboard Guide

## Overview

The Visual Analytics Dashboard provides deep insights into trading model performance, parameter evolution, and learning progress through interactive charts and visualizations.

---

## 🎯 Features

### 1. Performance Chart
- **Equity curve** over time
- Shows balance growth/decline
- Interactive tooltips with exact values
- Zoom and pan capabilities

### 2. Drawdown Analysis
- **Drawdown intensity** visualization
- Peak balance tracking
- Risk exposure over time
- Color-coded severity

### 3. Trade Distribution
- **Scatter plot** of profit vs duration
- Color-coded by win/loss
- Bubble size indicates profit percentage
- Identifies optimal trade patterns

### 4. Parameter Evolution
- **ML parameter changes** over time
- Shows how the model is learning
- Tracks lookback windows, risk factor, leverage
- Training sample count

### 5. Performance Metrics
- Comprehensive statistics cards
- Win rate, Sharpe ratio, profit factor
- Best/worst trades
- Average trade duration

### 6. Time-Based Analytics
- Performance by hour of day
- Performance by day of week
- Identifies optimal trading windows

---

## 🚀 Quick Start

### Access the Dashboard

```bash
# 1. Login to admin panel
http://localhost:3000/admin

# 2. Navigate to Analytics
http://localhost:3000/admin/analytics
```

### Via API

```bash
# Get admin token
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@helix.one","password":"admin123"}' \
  | jq -r '.token')

# Get analytics for model 1
curl http://localhost:4000/api/analytics/model/1 \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## 📊 API Endpoints

### Get Model Analytics

```bash
GET /api/analytics/model/:modelId
Headers: Authorization: Bearer <token>
```

Response:
```json
{
  "model": {
    "id": 1,
    "name": "Helix_Momentum_Alpha",
    "strategy": "momentum",
    "status": "active"
  },
  "equityCurve": [
    { "time": "2025-10-18T10:00:00Z", "value": 10000, "roi": 0 },
    { "time": "2025-10-18T11:00:00Z", "value": 10124, "roi": 1.24 }
  ],
  "drawdownSeries": [
    { "time": "2025-10-18T10:00:00Z", "value": 0, "peak": 10000 },
    { "time": "2025-10-18T11:00:00Z", "value": -2.3, "peak": 10124 }
  ],
  "trades": [
    {
      "profit": 124,
      "duration": 45,
      "signal": "BUY",
      "profitPct": 1.24,
      "leverage": 2.0
    }
  ],
  "parameters": [
    {
      "time": "2025-10-18T12:00:00Z",
      "lookback_short": 15,
      "lookback_long": 80,
      "risk_factor": 1.2,
      "optimal_leverage": 2.3,
      "training_samples": 127
    }
  ],
  "metrics": {
    "totalTrades": 127,
    "winRate": 68.5,
    "sharpeRatio": 1.85,
    "profitFactor": 2.34,
    "avgProfit": 45.20,
    "bestTrade": 580,
    "worstTrade": -240
  },
  "timeAnalytics": {
    "byHour": [...],
    "byDayOfWeek": [...]
  }
}
```

### Get System Analytics

```bash
GET /api/analytics/system
Headers: Authorization: Bearer <token>
```

---

## 📈 Understanding the Charts

### Equity Curve

**What it shows**: Total balance over time

**How to read**:
- Upward trend = Profitable
- Downward trend = Losing money
- Slope = Rate of return
- Smoothness = Consistency

**Key insights**:
- Steep climbs indicate strong performance periods
- Plateaus suggest consolidation or low activity
- Sharp drops indicate large losses or drawdowns

### Drawdown Chart

**What it shows**: Distance from peak balance

**How to read**:
- Zero line = At peak (new high)
- Negative values = Current drawdown
- Deeper = More risk exposure

**Key insights**:
- Frequent deep drawdowns = High risk strategy
- Quick recoveries = Robust strategy
- Extended drawdowns = Need for intervention

### Trade Scatter

**What it shows**: Relationship between trade duration and profit

**How to read**:
- X-axis = How long trade was open
- Y-axis = Profit/loss amount
- Green dots = Winners
- Red dots = Losers
- Size = Profit percentage

**Key insights**:
- Clustered winners = Consistent strategy
- Short profitable trades = Good timing
- Long losing trades = Poor exit strategy

### Parameter Evolution

**What it shows**: How ML parameters change as the model learns

**How to read**:
- Each line = Different parameter
- Changes over time = Model adapting
- Stable lines = Optimal parameters found
- Oscillations = Still exploring

**Key insights**:
- Converging parameters = Model learning complete
- Diverging parameters = Strategy unstable
- Step changes = Major learning events

---

## 🧪 Example Use Cases

### 1. Performance Analysis

```javascript
// View model performance
const analytics = await api.get('/api/analytics/model/1');

console.log('Win Rate:', analytics.metrics.winRate);
console.log('Sharpe Ratio:', analytics.metrics.sharpeRatio);
console.log('Profit Factor:', analytics.metrics.profitFactor);
```

### 2. Identify Best Trading Times

```javascript
// Find best hour to trade
const byHour = analytics.timeAnalytics.byHour;
const bestHour = byHour.reduce((best, current) => 
  current.profit > best.profit ? current : best
);

console.log(`Best hour: ${bestHour.hour}:00`);
console.log(`Profit: $${bestHour.profit}`);
```

### 3. Compare Parameters Before/After Learning

```javascript
// Get parameter history
const params = analytics.parameters;

if (params.length > 1) {
  const before = params[0];
  const after = params[params.length - 1];
  
  console.log('Lookback Short:', before.lookback_short, '→', after.lookback_short);
  console.log('Risk Factor:', before.risk_factor, '→', after.risk_factor);
}
```

---

## 📥 Export Data for Offline Analysis

### Export to CSV

```bash
# Run exporter
docker-compose exec engine python ml/analytics_exporter.py

# Files saved to engine/data/exports/
# - parameters_YYYYMMDD_HHMMSS.csv
# - summary_YYYYMMDD_HHMMSS.json
```

### Use in Excel

1. Export CSV from engine
2. Copy to your local machine:
```bash
docker cp helix-one-engine-1:/app/data/exports/parameters_*.csv ./
```
3. Open in Excel or Google Sheets
4. Create pivot tables and charts

### Use in Python/Jupyter

```python
import pandas as pd

# Load exported data
df = pd.read_csv('parameters_20251018_103000.csv')

# Analyze
print(df.describe())
print(df.groupby('model_name')['metric_win_rate'].mean())

# Plot
import matplotlib.pyplot as plt
df.plot(x='timestamp', y='lookback_short', kind='line')
plt.show()
```

---

## 🎨 Customization

### Change Chart Colors

Edit component files:

```typescript
// PerformanceChart.tsx
<Line stroke="#3b82f6" />  // Change to any color

// DrawdownChart.tsx
<stop offset="5%" stopColor="#ef4444" />  // Change gradient
```

### Add New Metrics

1. Add to `analytics.service.ts`:
```typescript
private calculatePerformanceMetrics(model, trades) {
  return {
    ...existing_metrics,
    myCustomMetric: calculateCustom(trades)
  };
}
```

2. Display in frontend:
```typescript
<MetricCard
  label="Custom Metric"
  value={data.metrics.myCustomMetric}
  icon="🎯"
/>
```

### Add New Charts

1. Create component in `components/analytics/`
2. Fetch data in analytics page
3. Render component in page

---

## 🐛 Troubleshooting

### No Data Showing

**Check if model has trades:**
```bash
curl http://localhost:4000/api/models/1/trades | jq 'length'
```

**Check if analytics endpoint works:**
```bash
curl http://localhost:4000/api/analytics/model/1 \
  -H "Authorization: Bearer $TOKEN"
```

### Parameter Evolution Empty

**Cause**: ML training hasn't run yet

**Solution**:
```bash
docker-compose exec engine python training_loop.py once
```

### Charts Not Rendering

**Check browser console** for errors

**Verify data format:**
```javascript
console.log(data.equityCurve);  // Should be array of objects with time, value
```

---

## 📚 Advanced Analytics

### Calculate Custom Metrics

```typescript
// In analytics.service.ts
private calculateAdvancedMetrics(trades: any[]) {
  // Maximum consecutive wins
  let maxConsecutiveWins = 0;
  let currentStreak = 0;
  
  for (const trade of trades) {
    if (trade.profit > 0) {
      currentStreak++;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  return { maxConsecutiveWins };
}
```

### Export to Different Formats

```python
# analytics_exporter.py
def export_to_parquet(self):
    df = pd.read_json(self.params_file)
    df.to_parquet('parameters.parquet')

def export_to_excel(self):
    df = pd.read_json(self.params_file)
    df.to_excel('parameters.xlsx', index=False)
```

---

## ✅ Summary

The Analytics Dashboard gives you:

- ✅ **Visual insights** into model performance
- ✅ **ML parameter tracking** to see learning progress
- ✅ **Trade pattern analysis** for optimization
- ✅ **Time-based analytics** for scheduling
- ✅ **Export capabilities** for offline study
- ✅ **Real-time updates** as data changes
- ✅ **Beautiful charts** built with Recharts

**Navigate to http://localhost:3000/admin/analytics to explore!**

---

**Built with 📊 by the Helix.One Team**

