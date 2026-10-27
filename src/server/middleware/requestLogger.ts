import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (env.LOG_LEVEL === 'error') {
    return next();
  }

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl || req.url;

    // Filter out asset requests or spam
    if (!url.startsWith('/api') && !url.startsWith('/health')) {
      return;
    }

    const indicator = status >= 500 ? '🔴' : status >= 400 ? '🟡' : '🟢';
    console.log(`${indicator} [${method}] ${url} -> ${status} (${duration}ms)`);
  });

  next();
}
