/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Empty turbopack config to silence the error - we use webpack config below
  turbopack: {},
  // Allow Firebase signInWithPopup to communicate back to the opener window.
  // Without this, COOP isolation blocks the popup from closing and returning
  // the auth result, breaking federated sign-in (Google, GitHub, Microsoft).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            // Prevent browsers from serving stale HTML that references old JS
            // chunk URLs after a deploy. 'no-cache' revalidates with the server
            // (using ETags) before using any cached copy, without disabling
            // caching entirely.
            key: 'Cache-Control',
            value: 'no-cache',
          },
        ],
      },
    ];
  },
  // Proxy /api/* to the Go backend when API_PROXY_URL is set.
  // In dev/test: avoids CORS by routing through Next.js.
  // In production: not needed (Ingress/Gateway handles routing).
  async rewrites() {
    const apiUrl = process.env.API_PROXY_URL;
    if (!apiUrl) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
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
