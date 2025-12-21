import { PrismaClient } from '../../generated/prisma/index.js';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import Redis from 'ioredis';

let postgresContainer: StartedTestContainer;
let redisContainer: StartedTestContainer;
let prisma: PrismaClient;
let redis: Redis;

export async function setupTestContainers() {
  // Start PostgreSQL container
  postgresContainer = await new GenericContainer('postgres:15-alpine')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'budi_test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
    .start();

  // Start Redis container
  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();

  const postgresPort = postgresContainer.getMappedPort(5432);
  const redisPort = redisContainer.getMappedPort(6379);

  // Set environment variables
  process.env.DATABASE_URL = `postgresql://test:test@localhost:${postgresPort}/budi_test`;
  process.env.REDIS_URL = `redis://localhost:${redisPort}`;
  process.env.JWT_SECRET = 'test-secret-key-for-testing';
  process.env.S3_ENDPOINT = 'http://localhost:9000';
  process.env.S3_ACCESS_KEY = 'minioadmin';
  process.env.S3_SECRET_KEY = 'minioadmin';
  process.env.S3_BUCKET = 'budi-test';

  // Initialize Prisma client
  prisma = new PrismaClient();
  await prisma.$connect();

  // Run migrations
  const { execSync } = await import('child_process');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  // Initialize Redis client
  redis = new Redis(process.env.REDIS_URL);

  return { prisma, redis };
}

export async function teardownTestContainers() {
  if (prisma) {
    await prisma.$disconnect();
  }
  if (redis) {
    redis.disconnect();
  }
  if (postgresContainer) {
    await postgresContainer.stop();
  }
  if (redisContainer) {
    await redisContainer.stop();
  }
}

export async function cleanDatabase() {
  if (!prisma) return;

  const tables = [
    'Export',
    'CodecPreview',
    'QcReport',
    'Master',
    'AnalysisReport',
    'Job',
    'Track',
    'Project',
    'User',
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
  }
}

export { prisma, redis };
