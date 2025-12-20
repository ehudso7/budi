import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { setupTestContainers, teardownTestContainers, cleanDatabase, prisma } from './setup';

let app: FastifyInstance;

describe('Auth API', () => {
  beforeAll(async () => {
    await setupTestContainers();

    // Create test app
    app = Fastify();

    // Register routes
    const { registerV1Routes } = await import('../../src/routes/v1');
    await app.register(registerV1Routes, { prefix: '/v1' });
    await app.ready();
  }, 60000);

  afterAll(async () => {
    await app.close();
    await teardownTestContainers();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /v1/auth/register', () => {
    it('should register a new user and return a token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'test@example.com' },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('user');
      expect(body.user.email).toBe('test@example.com');
    });

    it('should return existing user if already registered', async () => {
      // First registration
      await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'existing@example.com' },
      });

      // Second registration with same email
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'existing@example.com' },
      });

      expect(response.statusCode).toBe(200);

      const users = await prisma.user.findMany({
        where: { email: 'existing@example.com' },
      });
      expect(users.length).toBe(1);
    });

    it('should reject invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'not-an-email' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/auth/me', () => {
    it('should return current user when authenticated', async () => {
      // Register user first
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'me@example.com' },
      });

      const { token } = JSON.parse(registerResponse.body);

      // Get current user
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.email).toBe('me@example.com');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
