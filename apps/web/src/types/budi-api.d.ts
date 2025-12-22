// Type declarations for @budi/api - loaded at runtime via dynamic import
declare module "@budi/api" {
  import type { FastifyInstance } from "fastify";
  export function buildApp(): Promise<FastifyInstance>;
}
