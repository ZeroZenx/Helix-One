import { Router } from 'express';
import {
  chatWithModel,
  getMarketAnalysis,
  getTradingSignal,
  analyzeModelPerformance,
  getAIStatus
} from '../controllers/ai.controller';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

// Public endpoints (rate-limited in production)
router.post('/chat/:modelId', chatWithModel);
router.get('/market-analysis', getMarketAnalysis);

// Admin-only endpoints
router.post('/trading-signal', authenticateAdmin, getTradingSignal);
router.get('/analyze/:modelId', authenticateAdmin, analyzeModelPerformance);
router.get('/status', getAIStatus);

export default router;

