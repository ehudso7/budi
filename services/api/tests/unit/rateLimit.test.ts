// Unit tests for rate limiting
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Redis before importing the module
vi.mock("../../src/lib/redis.js", () => {
  const mockPipeline = {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    zcount: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([
      [null, 0], // zremrangebyscore result
      [null, 5], // zcard result (5 existing requests)
      [null, 1], // zadd result
      [null, 1], // expire result
    ]),
  };

  return {
    default: {
      pipeline: vi.fn(() => mockPipeline),
      keys: vi.fn().mockResolvedValue([]),
      del: vi.fn().mockResolvedValue(0),
    },
    redis: {
      pipeline: vi.fn(() => mockPipeline),
      keys: vi.fn().mockResolvedValue([]),
      del: vi.fn().mockResolvedValue(0),
    },
  };
});

import {
  checkRateLimit,
  checkOperationLimit,
  getRateLimitStatus,
  resetRateLimits,
} from "../../src/lib/rateLimit.js";

describe("Rate Limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkRateLimit", () => {
    it("should allow requests under the limit", async () => {
      const result = await checkRateLimit("user-123", "FREE", 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.limit).toBe(10); // FREE plan limit
    });

    it("should return different limits for different plans", async () => {
      const freeResult = await checkRateLimit("user-1", "FREE");
      const proResult = await checkRateLimit("user-2", "PRO");
      const enterpriseResult = await checkRateLimit("user-3", "ENTERPRISE");

      expect(freeResult.limit).toBe(10);
      expect(proResult.limit).toBe(60);
      expect(enterpriseResult.limit).toBe(300);
    });
  });

  describe("checkOperationLimit", () => {
    it("should check operation-specific limits", async () => {
      const result = await checkOperationLimit("user-123", "track:upload", "FREE");

      expect(result).toHaveProperty("allowed");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("remaining");
    });

    it("should return unlimited for unknown operations", async () => {
      const result = await checkOperationLimit("user-123", "unknown:operation", "FREE");

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    });
  });

  describe("getRateLimitStatus", () => {
    it("should return minute and hour limits", async () => {
      const status = await getRateLimitStatus("user-123", "PRO");

      expect(status).toHaveProperty("minute");
      expect(status).toHaveProperty("hour");
      expect(status.minute.limit).toBe(60);
      expect(status.hour.limit).toBe(1000);
    });
  });

  describe("resetRateLimits", () => {
    it("should reset rate limits for a user", async () => {
      await expect(resetRateLimits("user-123")).resolves.not.toThrow();
    });
  });
});
