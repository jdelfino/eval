/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empty turbopack config to silence the error - we use webpack config below
  turbopack: {},
  // Exclude data directory from file watching to prevent HMR during tests
  // Writing to data/*.json files should not trigger hot reload
  webpack: (config, { isServer, dev }) => {
    // Only apply watchOptions in development mode
    if (!isServer && dev) {
      config.watchOptions = config.watchOptions || {};

      // Add our ignored patterns
      const toIgnore = [
        '**/data/**',
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
      ];

      // Initialize or append to ignored array
      if (!config.watchOptions.ignored) {
        config.watchOptions.ignored = toIgnore;
      } else if (Array.isArray(config.watchOptions.ignored)) {
        config.watchOptions.ignored = [...config.watchOptions.ignored, ...toIgnore];
      }
    }
    return config;
  },
}

module.exports = nextConfig
