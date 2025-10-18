import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://frontend:3000'],
  credentials: true
}));
app.use(express.json());

// Live model data - updates in real-time (Nof1.ai style)
const models = [
  { id: 1, name: 'DEEPSEEK CHAT V3.1', currentBalance: 10385.25, roi: 3.85, drawdown: -1.2, winRate: 68.5, avgLeverage: 2.1, totalTrades: 127, status: 'active', strategy: 'momentum', icon: '🧠', color: '#3B82F6' },
  { id: 2, name: 'Claude 4.5 Sonnet', currentBalance: 9985.73, roi: -0.14, drawdown: -2.1, winRate: 72.3, avgLeverage: 1.4, totalTrades: 94, status: 'active', strategy: 'mean_reversion', icon: '⭐', color: '#F59E0B' },
  { id: 3, name: 'Gemini 2.5 Pro', currentBalance: 9859.75, roi: -1.40, drawdown: -3.5, winRate: 65.2, avgLeverage: 2.8, totalTrades: 156, status: 'active', strategy: 'hybrid', icon: '💎', color: '#10B981' },
  { id: 4, name: 'GPT 5', currentBalance: 10014.69, roi: 0.15, drawdown: -1.8, winRate: 71.0, avgLeverage: 1.8, totalTrades: 82, status: 'active', strategy: 'momentum', icon: '🅖', color: '#8B5CF6' },
  { id: 5, name: 'Grok 4', currentBalance: 9880.02, roi: -1.20, drawdown: -2.7, winRate: 69.8, avgLeverage: 2.2, totalTrades: 113, status: 'active', strategy: 'hybrid', icon: '⚡', color: '#EF4444' },
  { id: 6, name: 'Qwen 3 Max', currentBalance: 9437.07, roi: -5.63, drawdown: -6.2, winRate: 58.2, avgLeverage: 3.1, totalTrades: 89, status: 'active', strategy: 'momentum', icon: '🟣', color: '#A855F7' },
  { id: 7, name: 'BTC BUY&HOLD', currentBalance: 9992.41, roi: -0.08, drawdown: -0.5, winRate: 100.0, avgLeverage: 1.0, totalTrades: 1, status: 'active', strategy: 'buy_hold', icon: '₿', color: '#F59E0B' }
];

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/models', (req, res) => {
  // Sort by ROI descending
  const sorted = [...models].sort((a, b) => b.roi - a.roi);
  res.json(sorted);
});

app.get('/api/models/:id', (req, res) => {
  const model = models.find(m => m.id === parseInt(req.params.id));
  if (model) {
    res.json(model);
  } else {
    res.status(404).json({ error: 'Model not found' });
  }
});

// AI routes - temporarily disabled due to Prisma dependency
// import aiRoutes from './routes/ai';
// app.use('/api/ai', aiRoutes);

// WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join:leaderboard', () => {
    socket.join('leaderboard');
    socket.emit('leaderboard:update', models);
  });
});

// Broadcast updates every 5 seconds
setInterval(() => {
  models.forEach(m => {
    m.roi += (Math.random() - 0.5) * 0.1;
    m.currentBalance = 10000 * (1 + m.roi / 100);
  });
  io.to('leaderboard').emit('leaderboard:update', models);
}, 5000);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Helix.One Backend running on port ${PORT}`);
  console.log(`📊 WebSocket server ready`);
});

