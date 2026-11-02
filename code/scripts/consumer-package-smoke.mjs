import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const codeDirectory = resolve(import.meta.dirname, '..');
const root = mkdtempSync(join(tmpdir(), 'adaptive-admission-consumers-'));
const artifacts = join(root, 'artifacts');
const consumer = join(root, 'consumer');
const expressVersion = process.env.SMOKE_EXPRESS_VERSION ?? '5.2.1';
const nestVersion = process.env.SMOKE_NEST_VERSION ?? '12.1.0';

try {
  run('pnpm', ['--filter', '@jfrz38/pid-controller-express...', 'build'], codeDirectory);
  run('pnpm', ['--filter', '@jfrz38/pid-controller-nestjs...', 'build'], codeDirectory);
  run('pnpm', ['pack', '--pack-destination', artifacts], join(codeDirectory, 'hosts/node'), {
    ADAPTIVE_ADMISSION_SNAPSHOT_PACK: 'package-smoke',
  });
  run('pnpm', ['pack', '--pack-destination', artifacts], join(codeDirectory, 'adapters/express'));
  run('pnpm', ['pack', '--pack-destination', artifacts], join(codeDirectory, 'adapters/nestjs'));

  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const tarballs = readdirSync(artifacts).filter((name) => name.endsWith('.tgz')).map((name) => join(artifacts, name));
  run('pnpm', [
    'add', '--save-exact', ...tarballs,
    `express@${expressVersion}`,
    `@nestjs/common@${nestVersion}`,
    `@nestjs/core@${nestVersion}`,
    `@nestjs/platform-express@${nestVersion}`,
    'reflect-metadata@0.2.2', 'rxjs@7.8.2',
  ], consumer);

  writeFileSync(join(consumer, 'smoke.mjs'), `
import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { pidControllerErrorHandler, pidControllerMiddleware } from '@jfrz38/pid-controller-express';
import { PidControllerModule } from '@jfrz38/pid-controller-nestjs';

const admission = pidControllerMiddleware({ pid: { config: { maxConcurrentRequests: 1 } } });
const expressApp = express();
expressApp.use(admission.middleware);
expressApp.get('/', (_request, response) => response.json({ ok: true }));
expressApp.use(pidControllerErrorHandler());
const server = expressApp.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const address = server.address();
const response = await fetch('http://127.0.0.1:' + address.port + '/');
if (!response.ok || !(await response.json()).ok) throw new Error('Express package smoke failed');
admission.shutdown();
await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

const nest = await NestFactory.createApplicationContext(PidControllerModule.forRoot({}), { logger: false });
const controller = nest.get('PID_CONTROLLER');
if (await controller.run(() => 42) !== 42) throw new Error('NestJS package smoke failed');
await nest.close();
`);
  run('node', ['smoke.mjs'], consumer);
  console.log('Consumer package smoke passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}

function run(command, args, cwd, extraEnvironment = {}) {
  const executable = process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  const result = spawnSync(executable, args, {
    cwd,
    env: { ...process.env, ...extraEnvironment },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}
