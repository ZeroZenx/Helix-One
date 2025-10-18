import { Request, Response, NextFunction } from 'express';

export const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Simple auth middleware - for demo, just pass through
  // In production, verify JWT token
  next();
};

