import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tradingRoutes from './routes/trading';

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Trading routes
app.use('/api/trading', tradingRoutes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 HELIX.ONE Backend running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}`);
  console.log(`⚙️  Settings endpoint: http://localhost:${PORT}/api/trading/settings`);
});

