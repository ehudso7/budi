// Unit tests for circuit breaker
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Redis
vi.mock("../../src/lib/redis.js", () => ({
  default: {
    hgetall: vi.fn().mockResolvedValue({}),
    hset: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
}));

// Mock metrics
vi.mock("../../src/lib/metrics.js", () => ({
  Metrics: {
    errors: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  createCircuitBreaker,
  CircuitOpenError,
} from "../../src/lib/circuitBreaker.js";

describe("Circuit Breaker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCircuitBreaker", () => {
    it("should create a circuit breaker with default config", () => {
      const breaker = createCircuitBreaker({ name: "test" });

      expect(breaker).toHaveProperty("execute");
      expect(breaker).toHaveProperty("getState");
      expect(breaker).toHaveProperty("reset");
      expect(breaker).toHaveProperty("open");
    });

    it("should execute function when circuit is closed", async () => {
      const breaker = createCircuitBreaker({ name: "test-closed" });
      const fn = vi.fn().mockResolvedValue("success");

      const result = await breaker.execute(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should propagate errors from the function", async () => {
      const breaker = createCircuitBreaker({ name: "test-error" });
      const fn = vi.fn().mockRejectedValue(new Error("test error"));

      await expect(breaker.execute(fn)).rejects.toThrow("test error");
    });
  });

  describe("CircuitOpenError", () => {
    it("should have correct name and message", () => {
      const error = new CircuitOpenError("stripe");

      expect(error.name).toBe("CircuitOpenError");
      expect(error.message).toBe("Circuit breaker 'stripe' is open");
      expect(error.circuitName).toBe("stripe");
    });

    it("should be instanceof Error", () => {
      const error = new CircuitOpenError("test");

      expect(error instanceof Error).toBe(true);
      expect(error instanceof CircuitOpenError).toBe(true);
    });
  });

  describe("getState", () => {
    it("should return default state for new circuit", async () => {
      const breaker = createCircuitBreaker({ name: "test-state" });
      const state = await breaker.getState();

      expect(state.state).toBe("closed");
      expect(state.failures).toBe(0);
      expect(state.successes).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset circuit to closed state", async () => {
      const breaker = createCircuitBreaker({ name: "test-reset" });

      await breaker.reset();
      const state = await breaker.getState();

      expect(state.state).toBe("closed");
      expect(state.failures).toBe(0);
    });
  });
});
