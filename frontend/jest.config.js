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
      ],
      testPathIgnorePatterns: [
        '/node_modules/',
        '\\.integration\\.test\\.(ts|tsx)$',
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
  ],
};
