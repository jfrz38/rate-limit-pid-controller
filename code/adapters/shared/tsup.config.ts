import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    compilerOptions: {
      composite: false
    }
  },
  clean: true,
  minify: true,
  sourcemap: true,
  external: ['@jfrz38/adaptive-admission-node'],
  target: 'node24',
});
