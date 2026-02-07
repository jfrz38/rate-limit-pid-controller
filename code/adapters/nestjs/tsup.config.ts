import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: {
    compilerOptions: {
      composite: false
    }
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@nestjs/common', '@nestjs/core', '@jfrz38/pid-controller-core'],
  noExternal: ['@jfrz38/pid-controller-shared'],
  bundle: true
});
