import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { setupTestContainers, teardownTestContainers, cleanDatabase } from './setup';

let app: FastifyInstance;
let authToken: string;

describe('Projects API', () => {
  beforeAll(async () => {
    await setupTestContainers();

    app = Fastify();
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

    // Create authenticated user
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'test@example.com' },
    });
    authToken = JSON.parse(response.body).token;
  });

  describe('POST /v1/projects', () => {
    it('should create a new project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'My Album', type: 'album' },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.name).toBe('My Album');
      expect(body.type).toBe('album');
      expect(body.status).toBe('draft');
    });

    it('should default to single type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'My Single' },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.type).toBe('single');
    });

    it('should reject without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/projects', () => {
    it('should return empty list initially', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual([]);
    });

    it('should return user projects', async () => {
      // Create projects
      await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Project 1' },
      });

      await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Project 2' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);

      const projects = JSON.parse(response.body);
      expect(projects.length).toBe(2);
    });

    it('should not return other users projects', async () => {
      // Create project as first user
      await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'User 1 Project' },
      });

      // Create second user
      const user2Response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'user2@example.com' },
      });
      const user2Token = JSON.parse(user2Response.body).token;

      // Get projects as second user
      const response = await app.inject({
        method: 'GET',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${user2Token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual([]);
    });
  });

  describe('GET /v1/projects/:id', () => {
    it('should return project by id', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Test Project' },
      });

      const project = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/projects/${project.id}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.id).toBe(project.id);
      expect(body.name).toBe('Test Project');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/projects/non-existent-id',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /v1/projects/:id', () => {
    it('should delete project', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'To Delete' },
      });

      const project = JSON.parse(createResponse.body);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/v1/projects/${project.id}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify deletion
      const getResponse = await app.inject({
        method: 'GET',
        url: `/v1/projects/${project.id}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(getResponse.statusCode).toBe(404);
    });
  });
});
