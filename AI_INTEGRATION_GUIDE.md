# 🤖 Helix.One - AI Integration Guide (OpenAI + DeepSeek)

## Overview

Helix.One now integrates with **OpenAI** (GPT-4) and **DeepSeek** to provide AI-powered trading insights, model chat, and market analysis.

---

## ✨ **AI Features Added:**

### 1. **Model Chat** 💬
Chat directly with your trading models using AI. Ask questions like:
- "Why did you take that last trade?"
- "What's your current market outlook?"
- "How can I improve your win rate?"

### 2. **Market Analysis** 📊
Get AI-powered analysis of current market conditions:
- Overall sentiment
- Key opportunities
- Risk factors
- Recommended actions

### 3. **Trading Signals** 🎯
AI generates trading recommendations:
- BUY/SELL/HOLD signals
- Confidence scores
- Detailed reasoning

### 4. **Performance Analysis** 📈
AI analyzes model performance and suggests:
- Parameter adjustments
- Risk management improvements
- Strategy optimizations

---

## 🔧 **Setup**

### **Step 1: Get API Keys**

**OpenAI:**
1. Go to https://platform.openai.com/api-keys
2. Create new API key
3. Copy the key

**DeepSeek:**
1. Go to https://platform.deepseek.com/
2. Sign up and get API key
3. Copy the key

### **Step 2: Configure Environment**

Add to your `.env` file:

```bash
# AI Configuration
OPENAI_API_KEY=sk-your-openai-key-here
DEEPSEEK_API_KEY=sk-your-deepseek-key-here
```

### **Step 3: Restart Backend**

```bash
cd helix-one
docker-compose restart backend
```

---

## 🔌 **API Endpoints**

### **Chat with Model**

```bash
POST /api/ai/chat/:modelId
Content-Type: application/json

{
  "message": "What's your strategy?",
  "provider": "openai"  // or "deepseek"
}
```

**Response:**
```json
{
  "model": "Helix_Momentum_Alpha",
  "response": "I use a momentum-based strategy focusing on moving average crossovers...",
  "provider": "openai"
}
```

### **Get Market Analysis**

```bash
GET /api/ai/market-analysis?provider=deepseek
```

**Response:**
```json
{
  "analysis": "Current market shows bullish momentum...",
  "marketData": {...},
  "provider": "deepseek"
}
```

### **Get Trading Signal**

```bash
POST /api/ai/trading-signal
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "symbol": "BTCUSDT",
  "provider": "deepseek"
}
```

**Response:**
```json
{
  "signal": "BUY",
  "confidence": 0.85,
  "reasoning": "Strong momentum with RSI at 65...",
  "symbol": "BTCUSDT"
}
```

### **Analyze Performance**

```bash
GET /api/ai/analyze/:modelId?provider=openai
Authorization: Bearer <admin-token>
```

---

## 💻 **Frontend Integration**

Update the **MODEL CHAT** tab to use real AI:

```typescript
// In your frontend
const chatWithModel = async (modelId: number, message: string) => {
  const response = await fetch(`http://localhost:4001/api/ai/chat/${modelId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message, 
      provider: 'openai'  // or 'deepseek'
    })
  });
  
  const data = await response.json();
  return data.response;
};
```

---

## 🎨 **Example Use Cases**

### **1. Model Chat**

```bash
curl -X POST http://localhost:4001/api/ai/chat/1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Explain your last 5 trades",
    "provider": "openai"
  }'
```

### **2. Get Market Insights**

```bash
curl http://localhost:4001/api/ai/market-analysis?provider=deepseek
```

### **3. AI Trading Signal**

```bash
TOKEN=your-admin-token

curl -X POST http://localhost:4001/api/ai/trading-signal \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "ETHUSDT",
    "provider": "deepseek"
  }'
```

### **4. Performance Analysis**

```bash
curl http://localhost:4001/api/ai/analyze/1?provider=openai \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🧠 **AI Provider Comparison**

| Feature | OpenAI (GPT-4) | DeepSeek |
|---------|----------------|----------|
| **Speed** | Moderate | Fast |
| **Cost** | Higher | Lower |
| **Quality** | Excellent | Very Good |
| **Best For** | Complex analysis | Quick insights |
| **Trading Signals** | ✅ | ✅ |
| **Chat** | ✅ | ✅ |
| **Analysis** | ✅ Best | ✅ Good |

**Recommendation:** 
- Use **OpenAI** for performance analysis and complex questions
- Use **DeepSeek** for quick trading signals and market analysis

---

## 💡 **Model Chat Examples**

Ask your models questions like:

- "What market conditions are best for your strategy?"
- "Why is your win rate higher than other models?"
- "Should I adjust your leverage?"
- "What's your biggest risk right now?"
- "How do you compare to the Hybrid model?"
- "What would improve your performance?"

The AI will respond **as the model**, using its actual stats!

---

## 🔒 **Security & Costs**

### **API Key Security:**
- ✅ Stored in environment variables
- ✅ Never exposed to frontend
- ✅ Backend-only access

### **Cost Management:**
- OpenAI GPT-4: ~$0.01-0.03 per request
- DeepSeek: ~$0.001-0.003 per request
- Add rate limiting in production
- Monitor usage via provider dashboards

### **Rate Limiting:**

```typescript
// Add to production
import rateLimit from 'express-rate-limit';

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // 100 requests per 15 minutes
});

app.use('/api/ai', aiLimiter);
```

---

## 🎯 **Frontend Implementation**

Update your **MODEL CHAT >** tab to be functional:

```typescript
// frontend/pages/index.tsx - MODEL CHAT tab

const [chatMessages, setChatMessages] = useState<any[]>([]);
const [chatInput, setChatInput] = useState('');
const [aiProvider, setAIProvider] = useState('openai');

const sendMessage = async () => {
  if (!chatInput.trim()) return;
  
  // Add user message
  const userMsg = { role: 'user', content: chatInput };
  setChatMessages(prev => [...prev, userMsg]);
  setChatInput('');
  
  // Get AI response
  try {
    const response = await fetch(`http://localhost:4001/api/ai/chat/${selectedModel.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: chatInput, 
        provider: aiProvider 
      })
    });
    
    const data = await response.json();
    const aiMsg = { role: 'assistant', content: data.response };
    setChatMessages(prev => [...prev, aiMsg]);
  } catch (error) {
    console.error('Chat error:', error);
  }
};

// Render in MODEL CHAT tab:
<div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-xl font-bold">Chat with {selectedModel?.name}</h3>
    <select value={aiProvider} onChange={(e) => setAIProvider(e.target.value)}>
      <option value="openai">OpenAI GPT-4</option>
      <option value="deepseek">DeepSeek</option>
    </select>
  </div>
  
  <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
    {chatMessages.map((msg, i) => (
      <div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
        <div className={`inline-block p-3 rounded-lg ${
          msg.role === 'user' 
            ? 'bg-cyan-500/20 text-cyan-400' 
            : 'bg-gray-800 text-white'
        }`}>
          {msg.content}
        </div>
      </div>
    ))}
  </div>
  
  <div className="flex gap-2">
    <input
      type="text"
      value={chatInput}
      onChange={(e) => setChatInput(e.target.value)}
      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
      placeholder="Ask the model anything..."
      className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
    />
    <button onClick={sendMessage} className="px-6 py-2 bg-cyan-500 text-black font-bold rounded-lg">
      Send
    </button>
  </div>
</div>
```

---

## 🧪 **Testing**

### **1. Test AI Availability**

```bash
curl http://localhost:4001/api/ai/status
```

Response:
```json
{
  "available": ["openai", "deepseek"],
  "openai": true,
  "deepseek": true
}
```

### **2. Test Model Chat**

```bash
curl -X POST http://localhost:4001/api/ai/chat/1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is your trading strategy?",
    "provider": "openai"
  }'
```

---

## 💰 **Pricing**

### **OpenAI (GPT-4 Turbo):**
- Input: $0.01 / 1K tokens
- Output: $0.03 / 1K tokens
- Average chat: ~$0.01-0.03

### **DeepSeek:**
- Input: $0.001 / 1K tokens
- Output: $0.002 / 1K tokens
- Average chat: ~$0.001-0.003

**Recommendation:** Use DeepSeek for most queries (10x cheaper), OpenAI for complex analysis.

---

## 🎯 **Next Steps**

1. **Get API keys** (links above)
2. **Add to .env** file
3. **Restart backend**
4. **Test with curl** commands
5. **Enable MODEL CHAT** tab in frontend
6. **Enjoy AI-powered trading!** 🚀

---

## ⚠️ **Important Notes**

- API keys are **sensitive** - never commit to git
- Monitor usage to avoid unexpected costs
- Start with DeepSeek (cheaper) for testing
- Add rate limiting in production
- Both providers work great for trading analysis

---

**Your Helix.One platform now has AI superpowers!** 🤖✨

Check the MODEL CHAT > tab once you add your API keys!

