import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    resolve: ['@jfrz38/pid-controller-shared'],
    compilerOptions: {
      composite: false,
    },
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['fastify', 'fastify-plugin', '@jfrz38/adaptive-admission-node'],
  noExternal: ['@jfrz38/pid-controller-shared'],
  bundle: true,
});
