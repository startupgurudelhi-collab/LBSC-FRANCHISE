import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { env } from '../config/env.js';
import { sanitizeForLogging } from '../utils/loggerSanitizer.js';
import type { ApiResponse } from '../types/index.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const timestamp = new Date().toISOString();

  // 1. Handled custom AppErrors
  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        stack: env.NODE_ENV === 'development' ? err.stack : undefined,
      },
      meta: {
        timestamp,
        version: '1.0.0',
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // 2. Zod validation errors
  if (err instanceof ZodError) {
    const formattedIssues = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters or payload',
        details: formattedIssues,
      },
      meta: {
        timestamp,
        version: '1.0.0',
      },
    };
    res.status(422).json(response);
    return;
  }

  // 3. Syntax error (e.g. malformed JSON in body)
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload in request body',
      },
      meta: {
        timestamp,
        version: '1.0.0',
      },
    };
    res.status(400).json(response);
    return;
  }

  // 4. Unhandled internal server errors
  console.error('[Unhandled Error]', sanitizeForLogging(err));

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
      stack: env.NODE_ENV === 'development' ? err.stack : undefined,
    },
    meta: {
      timestamp,
      version: '1.0.0',
    },
  };

  res.status(500).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
  };
  res.status(404).json(response);
}
