import type { Request, Response, NextFunction } from 'express';
import { generateRequestId } from '../services/LoggerService.js';
import { withRequestContext } from '../lib/requestContext.js';

/**
 * Attaches a unique requestId to every incoming request and sets the
 * X-Request-Id response header so clients can correlate responses.
 */
export function attachRequestId(req: Request, res: Response, next: NextFunction): void {
  const inboundId = req.get('x-request-id');
  const id =
    typeof inboundId === 'string' && inboundId.trim().length > 0
      ? inboundId.trim().slice(0, 128)
      : generateRequestId();

  withRequestContext(id, () => {
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  });
}
