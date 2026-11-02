import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    compilerOptions: {
      composite: false
    }
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@nestjs/common', '@nestjs/core', '@jfrz38/adaptive-admission-node'],
  noExternal: ['@jfrz38/pid-controller-shared'],
  bundle: true
});
