/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: '/api/:path*'  // Use relative path - same port in production
        }
      ]
    };
  },
  experimental: {
    outputFileTracingRoot: __dirname,
  }
};

module.exports = nextConfig;

