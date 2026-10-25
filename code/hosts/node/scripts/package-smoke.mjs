import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'adaptive-admission-node-'));
const artifactDirectory = join(temporaryDirectory, 'artifact');
const consumerDirectory = join(temporaryDirectory, 'consumer');
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('npm_execpath is required to run the package smoke test');
const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'));

try {
  await Promise.all([
    mkdir(artifactDirectory, { recursive: true }),
    mkdir(consumerDirectory, { recursive: true }),
  ]);
  runPnpm(['pack', '--pack-destination', artifactDirectory], packageDirectory);

  const artifactName = `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`;
  const artifact = join(artifactDirectory, artifactName);
  await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({
    name: 'adaptive-admission-node-smoke',
    private: true,
    type: 'module',
  }));
  runPnpm(['add', '--ignore-workspace', artifact], consumerDirectory);
  await writeFile(join(consumerDirectory, 'smoke.mjs'), `
    import { AdaptiveAdmissionController, Priority } from '@jfrz38/adaptive-admission-node';
    const controller = new AdaptiveAdmissionController({ pid: { intervalMs: 10_000 } });
    const value = await controller.run(() => 42, Priority.fromValue(0));
    controller.shutdown();
    if (value !== 42) throw new Error('unexpected task result');
  `);
  run(process.execPath, ['smoke.mjs'], consumerDirectory);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} exited with status ${result.status}`);
}

function runPnpm(args, cwd) {
  if (pnpm.endsWith('.exe')) {
    run(pnpm, args, cwd);
  } else {
    run(process.execPath, [pnpm, ...args], cwd);
  }
}
