/**
 * Unit tests for Agent Registry
 */

import { AgentRegistry } from '../../src/agent-registry';
import { createMockAgent } from '../../../tests/utils/test-helpers';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('register', () => {
    it('should register a new agent', () => {
      const agent = createMockAgent();
      const result = registry.register(agent);
      
      expect(result).toBe(true);
      expect(registry.get(agent.id)).toEqual(agent);
    });

    it('should not register duplicate agents', () => {
      const agent = createMockAgent();
      registry.register(agent);
      
      const result = registry.register(agent);
      expect(result).toBe(false);
    });

    it('should throw error for invalid agent', () => {
      expect(() => {
        registry.register({} as any);
      }).toThrow('Invalid agent');
    });
  });

  describe('get', () => {
    it('should retrieve a registered agent', () => {
      const agent = createMockAgent();
      registry.register(agent);
      
      const retrieved = registry.get(agent.id);
      expect(retrieved).toEqual(agent);
    });

    it('should return null for non-existent agent', () => {
      const retrieved = registry.get('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    it('should list all registered agents', () => {
      const agent1 = createMockAgent({ name: 'Agent 1' });
      const agent2 = createMockAgent({ name: 'Agent 2' });
      
      registry.register(agent1);
      registry.register(agent2);
      
      const agents = registry.list();
      expect(agents).toHaveLength(2);
      expect(agents).toContainEqual(agent1);
      expect(agents).toContainEqual(agent2);
    });

    it('should filter agents by type', () => {
      const agent1 = createMockAgent({ type: 'assistant' });
      const agent2 = createMockAgent({ type: 'worker' });
      
      registry.register(agent1);
      registry.register(agent2);
      
      const assistants = registry.list({ type: 'assistant' });
      expect(assistants).toHaveLength(1);
      expect(assistants[0]).toEqual(agent1);
    });

    it('should filter agents by status', () => {
      const agent1 = createMockAgent({ status: 'active' });
      const agent2 = createMockAgent({ status: 'inactive' });
      
      registry.register(agent1);
      registry.register(agent2);
      
      const activeAgents = registry.list({ status: 'active' });
      expect(activeAgents).toHaveLength(1);
      expect(activeAgents[0]).toEqual(agent1);
    });
  });

  describe('unregister', () => {
    it('should unregister an agent', () => {
      const agent = createMockAgent();
      registry.register(agent);
      
      const result = registry.unregister(agent.id);
      expect(result).toBe(true);
      expect(registry.get(agent.id)).toBeNull();
    });

    it('should return false for non-existent agent', () => {
      const result = registry.unregister('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('update', () => {
    it('should update an existing agent', () => {
      const agent = createMockAgent({ name: 'Original Name' });
      registry.register(agent);
      
      const updated = { ...agent, name: 'Updated Name' };
      const result = registry.update(updated);
      
      expect(result).toBe(true);
      expect(registry.get(agent.id)?.name).toBe('Updated Name');
    });

    it('should return false for non-existent agent', () => {
      const agent = createMockAgent();
      const result = registry.update(agent);
      
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all registered agents', () => {
      const agent1 = createMockAgent();
      const agent2 = createMockAgent();
      
      registry.register(agent1);
      registry.register(agent2);
      
      registry.clear();
      
      expect(registry.list()).toHaveLength(0);
    });
  });
});