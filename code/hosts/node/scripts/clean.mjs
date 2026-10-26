import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await Promise.all([
  rm(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true }),
  rm(fileURLToPath(new URL('../src/generated', import.meta.url)), { recursive: true, force: true }),
]);
