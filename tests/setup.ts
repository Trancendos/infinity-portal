// Test setup file
import { jest } from '@jest/globals';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.API_KEY = 'test-api-key';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  // Generate random test data
  randomString: (length: number = 10): string => {
    return Math.random().toString(36).substring(2, 2 + length);
  },
  
  // Generate test email
  randomEmail: (): string => {
    return `test-${Date.now()}@example.com`;
  },
  
  // Generate test ID
  randomId: (): string => {
    return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  },
  
  // Wait for async operations
  wait: (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};