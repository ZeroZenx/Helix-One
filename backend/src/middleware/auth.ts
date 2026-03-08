import { Request, Response, NextFunction } from 'express';

export const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
  const configured = process.env.TRADING_ADMIN_KEY;

  // If no key is configured, keep current behavior for local/dev convenience.
  if (!configured) return next();

  const provided = req.header('x-admin-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!provided || provided !== configured) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};
