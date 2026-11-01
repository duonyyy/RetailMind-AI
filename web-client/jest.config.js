module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'es2022',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          jsx: 'react-jsx',
          skipLibCheck: true,
        },
      },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
