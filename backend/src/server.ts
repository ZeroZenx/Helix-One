import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tradingRoutes from './routes/trading';
import aiRoutes from './routes/ai';

dotenv.config();

const app = express();

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests and explicit allow-lists.
      if (!origin) return callback(null, true);
      if (configuredOrigins.includes('*')) return callback(null, true);
      if (configuredOrigins.length === 0) return callback(null, true);
      if (configuredOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Trading routes
app.use('/api/trading', tradingRoutes);
app.use('/api/ai', aiRoutes);

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`🚀 HELIX.ONE Backend running on port ${PORT}`);
  console.log(`📊 API available at http://${HOST}:${PORT}`);
  console.log(`⚙️  Settings endpoint: http://${HOST}:${PORT}/api/trading/settings`);
});
