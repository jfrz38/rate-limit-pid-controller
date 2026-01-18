import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {}]
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testPathIgnorePatterns: [
    '/node_modules/', 
    '/dist/',
    '<rootDir>/dist/',
    '<rootDir>/.*/dist/',
    '<rootDir>/node_modules/',
    '<rootDir>/.*/node_modules/']
};

export default config;
