/**
 * @trancendos/shared-core — Error Classes
 * Standardized error hierarchy for the Trancendos Ecosystem.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
    };
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  public readonly details: unknown;

  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), details: this.details };
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_REQUIRED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(message = 'Rate limit exceeded', retryAfterSeconds = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE', true);
  }
}

export class IntegrityError extends AppError {
  constructor(message = 'Data integrity violation') {
    super(message, 500, 'INTEGRITY_ERROR', false);
  }
}