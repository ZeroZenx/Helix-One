# 🤖 Helix.One - Complete AI Integration Guide

## 5 AI Providers Integrated!

Helix.One now supports **5 major AI providers** for maximum flexibility and redundancy:

1. **OpenAI** (GPT-4 Turbo)
2. **DeepSeek** (DeepSeek Chat)
3. **Claude** (Claude 3.5 Sonnet)
4. **Gemini** (Google Gemini Pro)
5. **Grok** (xAI Grok)

---

## 🔧 **Setup Guide**

### **1. Get API Keys**

#### **OpenAI (GPT-4)**
- Visit: https://platform.openai.com/api-keys
- Create new secret key
- Copy key starting with `sk-`
- **Cost:** ~$0.01-0.03 per request

#### **DeepSeek**
- Visit: https://platform.deepseek.com/
- Sign up and get API key
- **Cost:** ~$0.001-0.003 per request (cheapest!)

#### **Claude (Anthropic)**
- Visit: https://console.anthropic.com/
- Get API key from dashboard
- **Cost:** ~$0.015-0.075 per request
- **Note:** Best for complex reasoning

#### **Gemini (Google)**
- Visit: https://makersuite.google.com/app/apikey
- Create API key
- **Cost:** Free tier available, then $0.0005-0.002 per request

#### **Grok (xAI)**
- Visit: https://x.ai/api
- Request API access
- Get API key
- **Cost:** TBD (new platform)

---

### **2. Add to Environment**

Edit `.env` file:

```bash
# AI Provider API Keys
OPENAI_API_KEY=sk-your-openai-key
DEEPSEEK_API_KEY=sk-your-deepseek-key
ANTHROPIC_API_KEY=sk-ant-your-claude-key
GOOGLE_API_KEY=your-google-gemini-key
GROK_API_KEY=xai-your-grok-key
```

### **3. Restart Backend**

```bash
cd helix-one
docker-compose restart backend
```

---

## 🎯 **AI Features**

### **1. Model Chat** 💬

Chat with your trading models:

```bash
curl -X POST http://localhost:4001/api/ai/chat/1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is your current strategy?",
    "provider": "claude"
  }'
```

**Available Providers:** `openai`, `deepseek`, `claude`, `gemini`, `grok`

### **2. Market Analysis** 📊

Get AI-powered market insights:

```bash
curl http://localhost:4001/api/ai/market-analysis?provider=gemini
```

### **3. Trading Signals** 🎯

AI-generated trade recommendations:

```bash
curl -X POST http://localhost:4001/api/ai/trading-signal \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "provider": "deepseek"
  }'
```

### **4. Performance Analysis** 📈

AI analyzes model performance:

```bash
curl http://localhost:4001/api/ai/analyze/1?provider=openai \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🔍 **Provider Comparison**

| Provider | Speed | Cost | Best For | Quality |
|----------|-------|------|----------|---------|
| **DeepSeek** | ⚡⚡⚡ | 💰 | Quick queries, Signals | ⭐⭐⭐⭐ |
| **Gemini** | ⚡⚡⚡ | 💰 | Free tier, Testing | ⭐⭐⭐⭐ |
| **Grok** | ⚡⚡ | 💰💰 | Real-time data | ⭐⭐⭐⭐ |
| **OpenAI** | ⚡⚡ | 💰💰💰 | Complex reasoning | ⭐⭐⭐⭐⭐ |
| **Claude** | ⚡⚡ | 💰💰💰 | Deep analysis | ⭐⭐⭐⭐⭐ |

### **Recommendations:**

- **Quick Signals:** DeepSeek or Gemini (fast & cheap)
- **Market Analysis:** Grok (real-time aware)
- **Model Chat:** Claude (natural conversation)
- **Deep Analysis:** OpenAI GPT-4 or Claude 3.5
- **Budget:** Gemini (free tier) or DeepSeek (cheapest)

---

## 💬 **Model Chat Examples**

### **Example Conversations:**

```javascript
// Ask about strategy
"What indicators do you use for your momentum strategy?"

// Performance questions
"Why is your win rate 68% and not higher?"

// Market outlook
"What's your view on Bitcoin right now?"

// Parameter questions
"Should I increase your leverage?"

// Comparison
"How do you compare to the Hybrid model?"
```

**The AI responds as the model**, using its actual stats!

---

## 🔌 **API Endpoints Summary**

```
POST   /api/ai/chat/:modelId           - Chat with model
GET    /api/ai/market-analysis         - Get market insights
POST   /api/ai/trading-signal          - Get AI trade signal
GET    /api/ai/analyze/:modelId        - Analyze performance
GET    /api/ai/status                  - Check AI availability
```

---

## 🎨 **Frontend Integration**

Update the **MODEL CHAT >** tab:

```typescript
const [messages, setMessages] = useState([]);
const [input, setInput] = useState('');
const [provider, setProvider] = useState<'openai' | 'deepseek' | 'claude' | 'gemini' | 'grok'>('claude');

const sendMessage = async () => {
  const response = await fetch(`http://localhost:4001/api/ai/chat/${modelId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: input, provider })
  });
  
  const data = await response.json();
  setMessages([...messages, 
    { role: 'user', content: input },
    { role: 'assistant', content: data.response }
  ]);
};

// Render:
<select value={provider} onChange={(e) => setProvider(e.target.value)}>
  <option value="openai">OpenAI GPT-4</option>
  <option value="deepseek">DeepSeek</option>
  <option value="claude">Claude 3.5</option>
  <option value="gemini">Gemini Pro</option>
  <option value="grok">Grok</option>
</select>
```

---

## 🧪 **Testing**

### **Check Available Providers:**

```bash
curl http://localhost:4001/api/ai/status
```

Response:
```json
{
  "available": ["openai", "deepseek", "claude", "gemini", "grok"],
  "total": 5,
  "providers": {
    "openai": true,
    "deepseek": true,
    "claude": true,
    "gemini": true,
    "grok": true
  }
}
```

### **Test Each Provider:**

```bash
# OpenAI
curl -X POST http://localhost:4001/api/ai/chat/1 \
  -d '{"message":"Hello","provider":"openai"}'

# DeepSeek
curl -X POST http://localhost:4001/api/ai/chat/1 \
  -d '{"message":"Hello","provider":"deepseek"}'

# Claude
curl -X POST http://localhost:4001/api/ai/chat/1 \
  -d '{"message":"Hello","provider":"claude"}'

# Gemini
curl -X POST http://localhost:4001/api/ai/chat/1 \
  -d '{"message":"Hello","provider":"gemini"}'

# Grok
curl -X POST http://localhost:4001/api/ai/chat/1 \
  -d '{"message":"Hello","provider":"grok"}'
```

---

## 💰 **Cost Comparison**

### **Per 1000 Requests:**

| Provider | Input Cost | Output Cost | Total (est) |
|----------|------------|-------------|-------------|
| **DeepSeek** | $1 | $2 | **$3** ⭐ Cheapest |
| **Gemini** | $0.50 | $1.50 | **$2** (Free tier) |
| **Grok** | TBD | TBD | **TBD** |
| **OpenAI** | $10 | $30 | **$40** |
| **Claude** | $15 | $75 | **$90** |

**Budget Strategy:**
- Use **Gemini** (free tier) for development
- Use **DeepSeek** for production (cheapest)
- Use **Claude/OpenAI** for important decisions only

---

## 🚀 **Use Cases**

### **1. AI-Powered Model Selection**

Ask AI which model to allocate more funds to:

```bash
curl -X POST http://localhost:4001/api/ai/chat/1 \
  -d '{
    "message": "Based on market conditions, should I increase capital allocation?",
    "provider": "claude"
  }'
```

### **2. Strategy Optimization**

Get AI suggestions for parameter tuning:

```bash
curl http://localhost:4001/api/ai/analyze/1?provider=openai \
  -H "Authorization: Bearer $TOKEN"
```

### **3. Real-Time Trading Signals**

Before executing a trade:

```bash
curl -X POST http://localhost:4001/api/ai/trading-signal \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "symbol": "ETHUSDT",
    "provider": "deepseek"
  }'
```

### **4. Market Sentiment**

Get overall market view:

```bash
curl http://localhost:4001/api/ai/market-analysis?provider=grok
```

---

## 🎯 **Best Practices**

### **1. Provider Selection**

- **Quick questions** → DeepSeek or Gemini
- **Complex analysis** → Claude or OpenAI
- **Real-time data** → Grok (once available)
- **Budget conscious** → Gemini (free) or DeepSeek

### **2. Fallback Strategy**

```typescript
async function getAIResponse(message, preferredProvider) {
  const providers = ['deepseek', 'gemini', 'claude', 'openai', 'grok'];
  
  for (const provider of providers) {
    try {
      return await callAI(message, provider);
    } catch (error) {
      console.log(`${provider} failed, trying next...`);
    }
  }
  
  throw new Error('All AI providers failed');
}
```

### **3. Rate Limiting**

Monitor your usage:
- OpenAI: https://platform.openai.com/usage
- DeepSeek: Check dashboard
- Claude: https://console.anthropic.com/
- Gemini: https://console.cloud.google.com/

---

## 📚 **Environment Variables**

Complete `.env` configuration:

```bash
# ====== AI PROVIDERS ======

# OpenAI (GPT-4)
OPENAI_API_KEY=sk-proj-...

# DeepSeek (Cheapest)
DEEPSEEK_API_KEY=sk-...

# Claude (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...

# Gemini (Google) - Has free tier!
GOOGLE_API_KEY=AIza...

# Grok (xAI) - New!
GROK_API_KEY=xai-...
```

---

## ✅ **Summary**

**You now have integrated:**

✅ **5 AI providers** (OpenAI, DeepSeek, Claude, Gemini, Grok)  
✅ **Model chat** - Talk to your bots  
✅ **Market analysis** - AI insights  
✅ **Trading signals** - AI recommendations  
✅ **Performance analysis** - AI optimization tips  
✅ **Automatic fallback** - If one fails, try another  

**All integrated into Helix.One!** 🚀

---

## 🎊 **Next Steps:**

1. **Get API keys** (start with Gemini - it's free!)
2. **Add to `.env`** file
3. **Restart backend:** `docker-compose restart backend`
4. **Test:** `curl http://localhost:4001/api/ai/status`
5. **Chat with models!** 💬

---

**Your Helix.One platform now has AI superpowers from 5 providers!** 🤖✨

Choose the best AI for each task and let them power your trading decisions!

