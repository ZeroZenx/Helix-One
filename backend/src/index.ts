import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Routes
import authRoutes from './routes/auth';
import modelsRoutes from './routes/models';
import tradesRoutes from './routes/trades';
import usersRoutes from './routes/users';
import adminRoutes from './routes/admin';
import executionRoutes from './routes/execution';
import walletRoutes from './routes/wallet';
import alertsRoutes from './routes/alerts';
import learningRoutes from './routes/learning';
import analyticsRoutes from './routes/analytics';
import tradingRoutes from './routes/trading';

// Services
import { WebSocketService } from './services/WebSocketService';
import { LeaderboardService } from './services/LeaderboardService';
import { AlertService } from './alerts/alert.service';
import { setSocketIO } from './controllers/admin.controller';
import { setAlertService } from './controllers/alerts.controller';
import { initializeTrading } from './routes/trading';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Initialize services
export const prisma = new PrismaClient();
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Export for use in routes
export let socketIO: Server;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/execution', executionRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/trading', tradingRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize WebSocket service
const wsService = new WebSocketService(io, prisma, redis);
wsService.initialize();

// Initialize Leaderboard service
const leaderboardService = new LeaderboardService(prisma, redis, io);
leaderboardService.startPeriodicUpdate();

// Initialize Alert service
const alertService = new AlertService(io);
socketIO = io;
setSocketIO(io);
setAlertService(alertService);

console.log('✅ Alert system initialized');

// Initialize Trading service
const initializeTradingService = async () => {
  try {
    const binanceConfig = {
      apiKey: process.env.BINANCE_API_KEY,
      secretKey: process.env.BINANCE_SECRET_KEY,
      testnet: process.env.BINANCE_TESTNET === 'true'
    };

    if (binanceConfig.apiKey && binanceConfig.secretKey) {
      await initializeTrading(binanceConfig);
      console.log('✅ Trading service initialized');
    } else {
      console.log('⚠️ Trading service not initialized - missing Binance credentials');
    }
  } catch (error) {
    console.error('❌ Failed to initialize trading service:', error);
  }
};

initializeTradingService();

// Start server
const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Helix.One Backend running on port ${PORT}`);
  console.log(`📊 WebSocket server ready`);
  console.log(`🔗 Database connected`);
  console.log(`⚡ Redis connected`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await prisma.$disconnect();
  await redis.quit();
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
});

