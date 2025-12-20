import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { setupTestContainers, teardownTestContainers, cleanDatabase, prisma } from './setup';

let app: FastifyInstance;
let authToken: string;
let projectId: string;

describe('Tracks API', () => {
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
    const authResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'test@example.com' },
    });
    authToken = JSON.parse(authResponse.body).token;

    // Create project
    const projectResponse = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { name: 'Test Project' },
    });
    projectId = JSON.parse(projectResponse.body).id;
  });

  describe('POST /v1/projects/:projectId/tracks/import', () => {
    it('should import a track', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tracks/import`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          name: 'Test Track.wav',
          key: 'uploads/test-track-key.wav',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.name).toBe('Test Track.wav');
      expect(body.projectId).toBe(projectId);
      expect(body.status).toBe('uploaded');
    });
  });

  describe('GET /v1/projects/:projectId/tracks', () => {
    it('should return project tracks', async () => {
      // Import tracks
      await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tracks/import`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Track 1.wav', key: 'uploads/track1.wav' },
      });

      await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tracks/import`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Track 2.wav', key: 'uploads/track2.wav' },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectId}/tracks`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);

      const tracks = JSON.parse(response.body);
      expect(tracks.length).toBe(2);
    });
  });

  describe('POST /v1/tracks/:id/analyze', () => {
    it('should queue analysis job', async () => {
      // Import track
      const importResponse = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tracks/import`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Track.wav', key: 'uploads/track.wav' },
      });
      const trackId = JSON.parse(importResponse.body).id;

      const response = await app.inject({
        method: 'POST',
        url: `/v1/tracks/${trackId}/analyze`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.type).toBe('analyze');
      expect(body.status).toBe('pending');
      expect(body.trackId).toBe(trackId);

      // Verify job was created in database
      const job = await prisma.job.findUnique({
        where: { id: body.id },
      });
      expect(job).not.toBeNull();
    });

    it('should update track status to analyzing', async () => {
      const importResponse = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tracks/import`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Track.wav', key: 'uploads/track.wav' },
      });
      const trackId = JSON.parse(importResponse.body).id;

      await app.inject({
        method: 'POST',
        url: `/v1/tracks/${trackId}/analyze`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const track = await prisma.track.findUnique({
        where: { id: trackId },
      });
      expect(track?.status).toBe('analyzing');
    });
  });

  describe('POST /v1/tracks/:id/master', () => {
    it('should queue mastering job', async () => {
      // Import and "analyze" track
      const importResponse = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tracks/import`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Track.wav', key: 'uploads/track.wav' },
      });
      const trackId = JSON.parse(importResponse.body).id;

      // Manually update track to analyzed state
      await prisma.track.update({
        where: { id: trackId },
        data: { status: 'analyzed' },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/tracks/${trackId}/master`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          profile: 'balanced',
          loudnessTarget: 'streaming',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.type).toBe('master');
      expect(body.status).toBe('pending');
    });

    it('should reject mastering non-analyzed track', async () => {
      const importResponse = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tracks/import`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Track.wav', key: 'uploads/track.wav' },
      });
      const trackId = JSON.parse(importResponse.body).id;

      const response = await app.inject({
        method: 'POST',
        url: `/v1/tracks/${trackId}/master`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          profile: 'balanced',
          loudnessTarget: 'streaming',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /v1/tracks/:id', () => {
    it('should delete track', async () => {
      const importResponse = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tracks/import`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { name: 'Track.wav', key: 'uploads/track.wav' },
      });
      const trackId = JSON.parse(importResponse.body).id;

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/v1/tracks/${trackId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(deleteResponse.statusCode).toBe(204);

      const track = await prisma.track.findUnique({
        where: { id: trackId },
      });
      expect(track).toBeNull();
    });
  });
});
