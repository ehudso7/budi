/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["localhost"],
  },
  // Transpile workspace packages for Next.js
  transpilePackages: ["@budi/api", "@budi/contracts"],
  // Disable static generation for API routes that use Fastify
  experimental: {
    serverComponentsExternalPackages: [
      "fastify",
      "@fastify/cors",
      "@fastify/jwt",
      "@prisma/client",
      "ioredis",
    ],
  },
  // Rewrite API calls to external server in development (optional)
  async rewrites() {
    // In production, API is handled by the Next.js API route
    // In development, optionally proxy to a separate API server
    if (process.env.NEXT_PUBLIC_API_URL) {
      return [
        {
          source: "/api/:path*",
          destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
