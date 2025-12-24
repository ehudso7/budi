/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["localhost"],
  },
  // Transpile workspace packages for Next.js (only contracts, API uses dynamic import)
  transpilePackages: ["@budi/contracts"],
  // Mark Node.js-specific packages as external to prevent bundling issues
  experimental: {
    serverComponentsExternalPackages: [
      "@budi/api",
      "fastify",
      "@fastify/cors",
      "@fastify/jwt",
      "@prisma/client",
      "ioredis",
    ],
  },
  // Externalize @budi/api to prevent webpack from bundling it at build time
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark @budi/api and its dependencies as external
      // Use 'module' instead of 'commonjs' since @budi/api is an ES module
      config.externals = config.externals || [];
      config.externals.push({
        "@budi/api": "module @budi/api",
      });
    }
    return config;
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
