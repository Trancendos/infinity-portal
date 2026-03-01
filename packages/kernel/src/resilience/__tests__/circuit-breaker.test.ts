/**
 * Unit tests for Circuit Breaker
 */

import { CircuitBreaker, CircuitState, CircuitBreakerError } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-breaker',
      failureThreshold: 3,
      resetTimeout: 1000,
      successThreshold: 2,
      callTimeout: 5000,
    });
  });

  afterEach(() => {
    breaker.reset();
  });

  describe('CLOSED state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should pass through successful calls', async () => {
      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should count failures', async () => {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getMetrics().failedCalls).toBe(1);
    });

    it('should open after reaching failure threshold', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reset failure count on success', async () => {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      await breaker.execute(() => Promise.resolve('success'));

      // Should still be closed since success resets count
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }
    });

    it('should reject calls immediately', async () => {
      await expect(
        breaker.execute(() => Promise.resolve('success'))
      ).rejects.toThrow(CircuitBreakerError);
    });

    it('should track rejected calls', async () => {
      try {
        await breaker.execute(() => Promise.resolve('success'));
      } catch (e) {}

      expect(breaker.getMetrics().rejectedCalls).toBe(1);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Next call should go through (HALF_OPEN)
      const result = await breaker.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      breaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 3,
        resetTimeout: 100,
        successThreshold: 2,
        callTimeout: 5000,
      });

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    it('should close after reaching success threshold', async () => {
      await breaker.execute(() => Promise.resolve('ok'));
      await breaker.execute(() => Promise.resolve('ok'));

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open again on failure', async () => {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail again')));
      } catch (e) {}

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('timeout', () => {
    it('should timeout slow calls', async () => {
      const slowBreaker = new CircuitBreaker({
        name: 'slow-breaker',
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
        callTimeout: 100,
      });

      await expect(
        slowBreaker.execute(() => new Promise(resolve => setTimeout(resolve, 500)))
      ).rejects.toThrow('timed out');
    });
  });

  describe('metrics', () => {
    it('should track all metrics', async () => {
      await breaker.execute(() => Promise.resolve('ok'));
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      const metrics = breaker.getMetrics();
      expect(metrics.totalCalls).toBe(2);
      expect(metrics.successfulCalls).toBe(1);
      expect(metrics.failedCalls).toBe(1);
      expect(metrics.name).toBe('test-breaker');
    });
  });

  describe('state change callback', () => {
    it('should call onStateChange when state changes', async () => {
      const stateChanges: Array<{ from: CircuitState; to: CircuitState }> = [];

      const callbackBreaker = new CircuitBreaker({
        name: 'callback-breaker',
        failureThreshold: 2,
        resetTimeout: 1000,
        successThreshold: 1,
        callTimeout: 5000,
        onStateChange: (from, to) => stateChanges.push({ from, to }),
      });

      for (let i = 0; i < 2; i++) {
        try {
          await callbackBreaker.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toEqual({
        from: CircuitState.CLOSED,
        to: CircuitState.OPEN,
      });
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      await breaker.execute(() => Promise.resolve('ok'));
      breaker.reset();

      const metrics = breaker.getMetrics();
      expect(metrics.totalCalls).toBe(0);
      expect(metrics.successfulCalls).toBe(0);
      expect(metrics.failedCalls).toBe(0);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});