// Circuit Breaker pattern implementation for external service calls
import redis from "./redis.js";
import { Metrics } from "./metrics.js";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes in half-open to close
  timeout: number; // Time in ms before trying again (half-open)
  resetTimeout: number; // Time in ms before resetting failure count
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, "name"> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  resetTimeout: 60000, // 1 minute
};

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number;
  lastStateChange: number;
}

/**
 * Get current circuit breaker state from Redis
 */
async function getState(name: string): Promise<CircuitBreakerState> {
  try {
    const key = `circuit:${name}`;
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return {
        state: "closed",
        failures: 0,
        successes: 0,
        lastFailure: 0,
        lastStateChange: Date.now(),
      };
    }

    return {
      state: (data.state as CircuitState) || "closed",
      failures: parseInt(data.failures || "0", 10),
      successes: parseInt(data.successes || "0", 10),
      lastFailure: parseInt(data.lastFailure || "0", 10),
      lastStateChange: parseInt(data.lastStateChange || "0", 10),
    };
  } catch {
    // Redis unavailable - return default closed state
    return {
      state: "closed",
      failures: 0,
      successes: 0,
      lastFailure: 0,
      lastStateChange: Date.now(),
    };
  }
}

/**
 * Update circuit breaker state in Redis
 */
async function setState(name: string, state: Partial<CircuitBreakerState>): Promise<void> {
  try {
    const key = `circuit:${name}`;
    const updates: string[] = [];

    if (state.state !== undefined) updates.push("state", state.state);
    if (state.failures !== undefined) updates.push("failures", state.failures.toString());
    if (state.successes !== undefined) updates.push("successes", state.successes.toString());
    if (state.lastFailure !== undefined) updates.push("lastFailure", state.lastFailure.toString());
    if (state.lastStateChange !== undefined) updates.push("lastStateChange", state.lastStateChange.toString());

    if (updates.length > 0) {
      await redis.hset(key, ...updates);
      await redis.expire(key, 24 * 60 * 60); // TTL: 24 hours
    }
  } catch {
    // Redis unavailable - silently ignore state updates
  }
}

/**
 * Create a circuit breaker for a service
 */
export function createCircuitBreaker(config: Partial<CircuitBreakerConfig> & { name: string }) {
  const fullConfig: CircuitBreakerConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      const state = await getState(fullConfig.name);
      const now = Date.now();

      // Check if we should reset failure count
      if (state.state === "closed" && state.failures > 0) {
        if (now - state.lastFailure > fullConfig.resetTimeout) {
          await setState(fullConfig.name, { failures: 0 });
          state.failures = 0;
        }
      }

      // Check current state
      if (state.state === "open") {
        // Check if timeout has passed
        if (now - state.lastStateChange >= fullConfig.timeout) {
          // Transition to half-open
          await setState(fullConfig.name, {
            state: "half-open",
            lastStateChange: now,
            successes: 0,
          });
          state.state = "half-open";
        } else {
          // Circuit is open, fail fast
          await Metrics.errors("circuit_open", fullConfig.name);
          throw new CircuitOpenError(fullConfig.name);
        }
      }

      try {
        const result = await fn();

        // Success handling
        if (state.state === "half-open") {
          const newSuccesses = state.successes + 1;
          if (newSuccesses >= fullConfig.successThreshold) {
            // Close the circuit
            await setState(fullConfig.name, {
              state: "closed",
              failures: 0,
              successes: 0,
              lastStateChange: now,
            });
          } else {
            await setState(fullConfig.name, { successes: newSuccesses });
          }
        }

        return result;
      } catch (error) {
        // Failure handling
        const newFailures = state.failures + 1;

        if (state.state === "half-open") {
          // Any failure in half-open opens the circuit
          await setState(fullConfig.name, {
            state: "open",
            lastFailure: now,
            lastStateChange: now,
          });
          await Metrics.errors("circuit_opened", fullConfig.name);
        } else if (newFailures >= fullConfig.failureThreshold) {
          // Open the circuit
          await setState(fullConfig.name, {
            state: "open",
            failures: newFailures,
            lastFailure: now,
            lastStateChange: now,
          });
          await Metrics.errors("circuit_opened", fullConfig.name);
        } else {
          // Just increment failure count
          await setState(fullConfig.name, {
            failures: newFailures,
            lastFailure: now,
          });
        }

        throw error;
      }
    },

    /**
     * Get current circuit state
     */
    async getState(): Promise<CircuitBreakerState> {
      return getState(fullConfig.name);
    },

    /**
     * Force reset the circuit to closed
     */
    async reset(): Promise<void> {
      await setState(fullConfig.name, {
        state: "closed",
        failures: 0,
        successes: 0,
        lastStateChange: Date.now(),
      });
    },

    /**
     * Force open the circuit (for maintenance)
     */
    async open(): Promise<void> {
      await setState(fullConfig.name, {
        state: "open",
        lastStateChange: Date.now(),
      });
    },
  };
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(public readonly circuitName: string) {
    super(`Circuit breaker '${circuitName}' is open`);
    this.name = "CircuitOpenError";
  }
}

// Pre-configured circuit breakers for common services
export const CircuitBreakers = {
  stripe: createCircuitBreaker({ name: "stripe", failureThreshold: 3, timeout: 60000 }),
  apns: createCircuitBreaker({ name: "apns", failureThreshold: 5, timeout: 30000 }),
  appStore: createCircuitBreaker({ name: "app_store", failureThreshold: 3, timeout: 60000 }),
  s3: createCircuitBreaker({ name: "s3", failureThreshold: 5, timeout: 15000 }),
};

/**
 * Get status of all circuit breakers
 */
export async function getAllCircuitStatus(): Promise<Record<string, CircuitBreakerState>> {
  const status: Record<string, CircuitBreakerState> = {};

  for (const [name, breaker] of Object.entries(CircuitBreakers)) {
    status[name] = await breaker.getState();
  }

  return status;
}
