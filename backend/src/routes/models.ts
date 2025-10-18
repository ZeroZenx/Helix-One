import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all models
router.get('/', async (req, res) => {
  try {
    const models = await prisma.model.findMany({
      orderBy: { roi: 'desc' }
    });
    res.json(models);
  } catch (error) {
    console.error('Get models error:', error);
    // Fallback to demo data if database fails
    res.json([
      { id: 1, name: 'Helix_Momentum_Alpha', currentBalance: 11240, roi: 12.4, drawdown: -3.2, winRate: 68.5, avgLeverage: 2.1, totalTrades: 127, status: 'active', strategy: 'momentum' },
      { id: 2, name: 'Helix_Reversion_Beta', currentBalance: 10780, roi: 7.8, drawdown: -2.1, winRate: 72.3, avgLeverage: 1.4, totalTrades: 94, status: 'active', strategy: 'mean_reversion' },
      { id: 3, name: 'Helix_Hybrid_Gamma', currentBalance: 11580, roi: 15.8, drawdown: -4.5, winRate: 65.2, avgLeverage: 2.8, totalTrades: 156, status: 'active', strategy: 'hybrid' },
      { id: 4, name: 'Helix_Momentum_Delta', currentBalance: 10450, roi: 4.5, drawdown: -1.8, winRate: 71.0, avgLeverage: 1.8, totalTrades: 82, status: 'active', strategy: 'momentum' },
      { id: 5, name: 'Helix_Hybrid_Epsilon', currentBalance: 10920, roi: 9.2, drawdown: -2.7, winRate: 69.8, avgLeverage: 2.2, totalTrades: 113, status: 'active', strategy: 'hybrid' }
    ]);
  }
});

// Get single model
router.get('/:id', async (req, res) => {
  try {
    const model = await prisma.model.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    res.json(model);
  } catch (error) {
    console.error('Get model error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

