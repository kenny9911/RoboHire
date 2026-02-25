import type { Request, Response, NextFunction } from 'express';
import { generateRequestId } from '../services/LoggerService.js';

/**
 * Attaches a unique requestId to every incoming request and sets the
 * X-Request-Id response header so clients can correlate responses.
 */
export function attachRequestId(req: Request, res: Response, next: NextFunction): void {
  const id = generateRequestId();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
