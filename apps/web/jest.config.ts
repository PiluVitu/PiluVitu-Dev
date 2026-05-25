import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { moduleResolution: 'node' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@piluvitu/tools/(.*)$': '<rootDir>/../../packages/tools/src/$1',
    '^@piluvitu/tools$': '<rootDir>/../../packages/tools/src/index.ts',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // Build output mirrors package.json + source, causing Haste name collisions
  // and duplicate test discovery. Keep Jest pointed at source only.
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.next/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}

export default config
