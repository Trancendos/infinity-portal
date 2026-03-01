/**
 * Test helper utilities
 */

import { randomString, randomEmail, randomId, wait } from '../setup';

/**
 * Create a mock user object
 */
export const createMockUser = (overrides = {}) => ({
  id: randomId(),
  email: randomEmail(),
  name: `Test User ${randomString(5)}`,
  role: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Create a mock service object
 */
export const createMockService = (overrides = {}) => ({
  id: randomId(),
  name: `Test Service ${randomString(5)}`,
  version: '1.0.0',
  description: 'Test service description',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Create a mock AI agent object
 */
export const createMockAgent = (overrides = {}) => ({
  id: randomId(),
  name: `Test Agent ${randomString(5)}`,
  type: 'assistant',
  model: 'gpt-4',
  status: 'active',
  capabilities: ['text', 'code'],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Create a mock document object
 */
export const createMockDocument = (overrides = {}) => ({
  id: randomId(),
  title: `Test Document ${randomString(5)}`,
  content: 'Test document content',
  type: 'text',
  status: 'draft',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Create a mock workflow object
 */
export const createMockWorkflow = (overrides = {}) => ({
  id: randomId(),
  name: `Test Workflow ${randomString(5)}`,
  description: 'Test workflow description',
  status: 'active',
  steps: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Mock async function with delay
 */
export const mockAsync = <T>(data: T, delay: number = 100): Promise<T> => {
  return new Promise(resolve => {
    setTimeout(() => resolve(data), delay);
  });
};

/**
 * Mock API response
 */
export const mockApiResponse = <T>(data: T, status: number = 200) => ({
  data,
  status,
  ok: status >= 200 && status < 300,
  json: async () => data,
});

/**
 * Mock error response
 */
export const mockErrorResponse = (message: string, status: number = 500) => ({
  error: message,
  status,
  ok: false,
  json: async () => ({ error: message }),
});

/**
 * Create a mock database connection
 */
export const createMockDb = () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
});

/**
 * Create a mock cache client
 */
export const createMockCache = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  flush: jest.fn(),
});

/**
 * Create a mock event emitter
 */
export const createMockEventEmitter = () => ({
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  once: jest.fn(),
});

/**
 * Wait for condition to be true
 */
export const waitForCondition = async (
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (condition()) {
      return;
    }
    await wait(interval);
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
};

/**
 * Retry function with exponential backoff
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await wait(baseDelay * Math.pow(2, i));
    }
  }
  throw new Error('Max retries exceeded');
};

/**
 * Deep clone object
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Compare two objects deeply
 */
export const deepEqual = (obj1: unknown, obj2: unknown): boolean => {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
};

export { randomString, randomEmail, randomId, wait };