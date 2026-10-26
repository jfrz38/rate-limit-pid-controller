import { cp, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const generatedSource = fileURLToPath(new URL('../src/generated', import.meta.url));
const generatedDistribution = fileURLToPath(new URL('../dist/generated', import.meta.url));
const distribution = fileURLToPath(new URL('../dist', import.meta.url));

await rm(distribution, { recursive: true, force: true });

const node = process.execPath;
let result = spawnSync(node, ['scripts/generate.mjs'], {
  cwd: packageDirectory,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`binding generation exited with status ${result.status}`);

const tsc = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
  cwd: packageDirectory,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`TypeScript compilation exited with status ${result.status}`);

await mkdir(generatedDistribution, { recursive: true });
await cp(generatedSource, generatedDistribution, { recursive: true });
