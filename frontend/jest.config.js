/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  collectCoverageFrom: [
    'src/app/**/*.tsx',
    '!src/app/**/__tests__/**',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Exclude integration tests from default runs
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.test\\.(ts|tsx)$',
  ],
  // Use jsdom for React component tests
  projects: [
    {
      displayName: 'client',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/src/app/**/__tests__/**/*.test.tsx',
        '<rootDir>/src/hooks/**/__tests__/**/*.test.ts',
        '<rootDir>/src/components/**/__tests__/**/*.test.tsx',
        '<rootDir>/src/contexts/**/__tests__/**/*.test.tsx',
        '<rootDir>/src/lib/**/__tests__/**/*.test.ts',
        '<rootDir>/src/config/**/__tests__/**/*.test.ts',
        '<rootDir>/src/types/**/__tests__/**/*.test.ts',
      ],
      testPathIgnorePatterns: [
        '/node_modules/',
        '\\.integration\\.test\\.(ts|tsx)$',
      ],
      roots: ['<rootDir>/src'],
      setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
      moduleNameMapper: {
        '^@/lib/api-client$': '<rootDir>/src/__mocks__/api-client.ts',
        '^@/(.*)$': '<rootDir>/src/$1',
        '^react-markdown$': '<rootDir>/src/__mocks__/react-markdown.tsx',
        '^remark-breaks$': '<rootDir>/src/__mocks__/remark-breaks.ts',
        '^firebase/app$': '<rootDir>/src/__mocks__/firebase/app.ts',
        '^firebase/auth$': '<rootDir>/src/__mocks__/firebase/auth.ts',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            jsx: 'react-jsx',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
          }
        }]
      },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/src/**/__tests__/**/*.integration.test.ts',
        '<rootDir>/src/**/__tests__/**/*.integration.test.tsx',
      ],
      testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/src/__tests__/contract/',
      ],
      roots: ['<rootDir>/src'],
      setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^react-markdown$': '<rootDir>/src/__mocks__/react-markdown.tsx',
        '^remark-breaks$': '<rootDir>/src/__mocks__/remark-breaks.ts',
        '^firebase/app$': '<rootDir>/src/__mocks__/firebase/app.ts',
        '^firebase/auth$': '<rootDir>/src/__mocks__/firebase/auth.ts',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            jsx: 'react-jsx',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
          }
        }]
      },
    },
    {
      displayName: 'contract',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/__tests__/contract/**/*.integration.test.ts'],
      // Exclude setup test and the realtime-events tests (handled by 'realtime-contract' project)
      testPathIgnorePatterns: [
        '/node_modules/',
        '000-setup\\.integration\\.test\\.ts$',
        'realtime-events\\.integration\\.test\\.ts$',
      ],
      roots: ['<rootDir>/src'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      globalSetup: '<rootDir>/src/__tests__/contract/globalSetup.ts',
      testTimeout: 30000,
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: { esModuleInterop: true, allowSyntheticDefaultImports: true }
        }]
      },
    },
    {
      displayName: 'scripts',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/scripts/**/__tests__/**/*.test.ts'],
      roots: ['<rootDir>/scripts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: { esModuleInterop: true, allowSyntheticDefaultImports: true }
        }]
      },
    },
    {
      // Realtime event contract tests — subscribe to Centrifugo WebSocket channels and verify
      // event payload shapes against backend-triggered actions.
      //
      // Requires: CENTRIFUGO_URL, CENTRIFUGO_WS_URL, CENTRIFUGO_TOKEN_SECRET, CENTRIFUGO_API_KEY,
      //           API_BASE_URL to be set in the environment.
      displayName: 'realtime-contract',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/__tests__/contract/realtime-events.integration.test.ts'],
      testPathIgnorePatterns: ['/node_modules/'],
      roots: ['<rootDir>/src'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      // Reuse the same globalSetup as contract tests (creates namespace, users, sessions, etc.)
      globalSetup: '<rootDir>/src/__tests__/contract/globalSetup.ts',
      // Longer timeout — Centrifugo subscribe + backend action + receive can take a few seconds
      testTimeout: 30000,
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: { esModuleInterop: true, allowSyntheticDefaultImports: true }
        }]
      },
    },
  ],
};
