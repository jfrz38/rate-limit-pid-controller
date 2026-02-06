import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: {
    compilerOptions: {
      composite: false
    }
  },
  clean: true,
  minify: true,
  sourcemap: true,
  external: ['@jfrz38/pid-controller-core'], 
  target: 'es2020',
});
