import nextConfig from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextConfig,
  {
    rules: {
      // Warn on unused variables, but allow underscore-prefixed ones
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // No console.log in production code
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Disable overly strict React 19 compiler rules — revisit when codebase is ready
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      // Allow unescaped entities — too noisy for apostrophes in text
      "react/no-unescaped-entities": "off",
      // Project uses external/dynamic images
      "@next/next/no-img-element": "off",
    },
  },
  {
    // Ignore test files, config files, and build output
    ignores: [
      "**/__tests__/**",
      "**/__mocks__/**",
      "*.config.*",
      "jest.*.js",
      ".next/**",
      "node_modules/**",
      "supabase/**",
      "ops/**",
      "e2e/**",
      "playwright.config.ts",
      "src/setupTests.ts",
      "src/__mocks__/**",
    ],
  },
];
