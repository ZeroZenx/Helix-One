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

// Public endpoints (read-only)
router.get('/market-analysis', getMarketAnalysis);
router.get('/status', getAIStatus);

// Admin-only endpoints
router.post('/chat/:modelId', authenticateAdmin, chatWithModel);
router.post('/trading-signal', authenticateAdmin, getTradingSignal);
router.get('/analyze/:modelId', authenticateAdmin, analyzeModelPerformance);

export default router;

