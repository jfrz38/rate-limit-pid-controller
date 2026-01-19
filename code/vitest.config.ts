import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()], 
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'], 
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**'],
  },
});
