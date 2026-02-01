/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  collectCoverageFrom: [
    'src/server/**/*.ts',
    'src/app/**/*.tsx',
    '!src/server/__tests__/**',
    '!src/app/**/__tests__/**',
    '!src/server/index.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^uuid$': '<rootDir>/src/server/__tests__/test-utils/uuid-mock.ts',
  },
  // Exclude integration tests from default runs
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.test\\.(ts|tsx)$',
  ],
  // Use jsdom for React component tests
  projects: [
    {
      displayName: 'server',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/server/**/__tests__/**/*.test.ts',
        '<rootDir>/src/app/api/**/__tests__/**/*.test.ts',
        '<rootDir>/src/lib/**/__tests__/**/*.test.ts',
        '<rootDir>/src/config/**/__tests__/**/*.test.ts',
      ],
      testPathIgnorePatterns: [
        '/node_modules/',
        '\\.integration\\.test\\.(ts|tsx)$',
      ],
      roots: ['<rootDir>/src'],
      setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^uuid$': '<rootDir>/src/server/__tests__/test-utils/uuid-mock.ts',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            jsx: 'react',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
          }
        }]
      },
    },
    {
      displayName: 'client',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/src/app/**/__tests__/**/*.test.tsx',
        '<rootDir>/src/hooks/**/__tests__/**/*.test.ts',
        '<rootDir>/src/components/**/__tests__/**/*.test.tsx',
        '<rootDir>/src/contexts/**/__tests__/**/*.test.tsx',
      ],
      testPathIgnorePatterns: [
        '/node_modules/',
        '\\.integration\\.test\\.(ts|tsx)$',
      ],
      roots: ['<rootDir>/src'],
      setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^uuid$': '<rootDir>/src/server/__tests__/test-utils/uuid-mock.ts',
        '^react-markdown$': '<rootDir>/src/__mocks__/react-markdown.tsx',
        '^remark-breaks$': '<rootDir>/src/__mocks__/remark-breaks.ts',
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
  ],
};
