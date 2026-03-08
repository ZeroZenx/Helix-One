import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all models
router.get('/', async (req, res) => {
  try {
    const models = await prisma.model.findMany({
      orderBy: { roi: 'desc' },
      include: {
        positions: {
          where: { status: 'open' }
        },
        trades: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    res.json(models);
  } catch (error: any) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single model by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const model = await prisma.model.findUnique({
      where: { id: parseInt(id) },
      include: {
        positions: true,
        trades: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    res.json(model);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update model
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const model = await prisma.model.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    
    res.json(model);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk update models (for real-time updates)
router.post('/bulk-update', async (req, res) => {
  try {
    const { models } = req.body;
    
    if (!Array.isArray(models)) {
      return res.status(400).json({ error: 'Models must be an array' });
    }
    
    // Update each model
    const updatePromises = models.map((modelData: any) => {
      const { id, ...data } = modelData;
      return prisma.model.update({
        where: { id: parseInt(id) },
        data: {
          currentBalance: data.currentBalance,
          roi: data.roi,
          drawdown: data.drawdown,
          winRate: data.winRate,
          totalTrades: data.totalTrades,
          fees: data.fees,
          biggestWin: data.biggestWin,
          biggestLoss: data.biggestLoss,
          sharpe: data.sharpe
        }
      });
    });
    
    await Promise.all(updatePromises);
    
    res.json({ success: true, updated: models.length });
  } catch (error: any) {
    console.error('Bulk update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize models (seed data)
router.post('/initialize', async (req, res) => {
  try {
    const initialModels = Array.isArray(req.body?.models) ? req.body.models : [];
    if (initialModels.length === 0) {
      return res.status(400).json({ error: 'No models provided. Send an explicit models array in request body.' });
    }
    
    const created = [];
    for (const modelData of initialModels) {
      const existing = await prisma.model.findUnique({
        where: { name: modelData.name }
      });
      
      if (!existing) {
        const model = await prisma.model.create({
          data: modelData
        });
        created.push(model);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Initialized ${created.length} new models`,
      created 
    });
  } catch (error: any) {
    console.error('Initialize error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save performance snapshot
router.post('/snapshot', async (req, res) => {
  try {
    const { modelId, totalValue } = req.body;
    
    const snapshot = await prisma.performanceSnapshot.create({
      data: {
        modelId: modelId ? parseInt(modelId) : null,
        totalValue
      }
    });
    
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get performance history
router.get('/performance/history', async (req, res) => {
  try {
    const { modelId, hours = 24 } = req.query;
    
    const since = new Date(Date.now() - parseInt(hours as string) * 60 * 60 * 1000);
    
    const snapshots = await prisma.performanceSnapshot.findMany({
      where: {
        modelId: modelId ? parseInt(modelId as string) : undefined,
        timestamp: { gte: since }
      },
      orderBy: { timestamp: 'asc' }
    });
    
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
