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
  external: ['express', '@jfrz38/pid-controller-core'],
  bundle: true
});
