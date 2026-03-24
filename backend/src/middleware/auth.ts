import { Request, Response, NextFunction } from 'express';

export const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
  const configured = (process.env.TRADING_ADMIN_KEY || '').trim();
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  if (!configured) {
    if (isProduction) {
      return res.status(503).json({ error: 'Admin auth misconfigured: TRADING_ADMIN_KEY is required in production.' });
    }
    // Local/dev fallback: allow when key is intentionally unset.
    return next();
  }

  const provided = req.header('x-admin-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!provided || provided !== configured) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};
