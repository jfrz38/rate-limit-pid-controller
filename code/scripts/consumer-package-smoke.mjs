import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const codeDirectory = resolve(import.meta.dirname, '..');
const root = mkdtempSync(join(tmpdir(), 'adaptive-admission-consumers-'));
const artifacts = join(root, 'artifacts');
const consumer = join(root, 'consumer');
const expressVersion = process.env.SMOKE_EXPRESS_VERSION ?? '5.2.1';
const fastifyVersion = process.env.SMOKE_FASTIFY_VERSION ?? '5.12.8';
const nestVersion = process.env.SMOKE_NEST_VERSION ?? '12.1.0';

try {
  run('pnpm', ['--filter', '@jfrz38/pid-controller-express...', 'build'], codeDirectory);
  run('pnpm', ['--filter', '@jfrz38/pid-controller-fastify...', 'build'], codeDirectory);
  run('pnpm', ['--filter', '@jfrz38/pid-controller-nestjs...', 'build'], codeDirectory);
  mkdirSync(artifacts, { recursive: true });
  run('pnpm', ['pack', '--pack-destination', artifacts], join(codeDirectory, 'hosts/node'));
  run('pnpm', ['pack', '--pack-destination', artifacts], join(codeDirectory, 'adapters/express'));
  run('pnpm', ['pack', '--pack-destination', artifacts], join(codeDirectory, 'adapters/fastify'));
  run('pnpm', ['pack', '--pack-destination', artifacts], join(codeDirectory, 'adapters/nestjs'));

  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const tarballs = readdirSync(artifacts).filter((name) => name.endsWith('.tgz')).map((name) => join(artifacts, name));
  run('pnpm', [
    'add', '--save-exact', '--ignore-scripts', ...tarballs,
    `express@${expressVersion}`,
    `fastify@${fastifyVersion}`,
    `@nestjs/common@${nestVersion}`,
    `@nestjs/core@${nestVersion}`,
    `@nestjs/platform-express@${nestVersion}`,
    `@nestjs/platform-fastify@${nestVersion}`,
    'reflect-metadata@0.2.2', 'rxjs@7.8.2',
  ], consumer);

  writeFileSync(join(consumer, 'smoke.mjs'), `
import 'reflect-metadata';
import express from 'express';
import Fastify from 'fastify';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { pidControllerErrorHandler, pidControllerMiddleware } from '@jfrz38/pid-controller-express';
import { pidControllerPlugin } from '@jfrz38/pid-controller-fastify';
import { PidControllerModule } from '@jfrz38/pid-controller-nestjs';

await smokeExpress();
await smokeFastify();
await smokeNest('NestJS Express');
await smokeNest('NestJS Fastify', () => new FastifyAdapter());

async function smokeExpress() {
  const admission = pidControllerMiddleware({ pid: { config: { maxConcurrentRequests: 1 } } });
  const app = express();
  app.use(admission.middleware);
  app.get('/', (_request, response) => response.json({ ok: true }));
  app.use(pidControllerErrorHandler());
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    await assertOk('Express', await fetch('http://127.0.0.1:' + address.port + '/'));
  } finally {
    admission.shutdown();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function smokeFastify() {
  const app = Fastify();

  try {
    await app.register(pidControllerPlugin, {
      pid: { config: { maxConcurrentRequests: 1 } },
    });
    app.get('/', async () => ({ ok: true }));
    const url = await app.listen({ port: 0, host: '127.0.0.1' });
    await assertOk('Fastify', await fetch(url));
  } finally {
    await app.close();
  }
}

async function smokeNest(label, adapter) {
  class SmokeController {
    root() {
      return { ok: true };
    }
  }
  Get()(SmokeController.prototype, 'root', Object.getOwnPropertyDescriptor(SmokeController.prototype, 'root'));
  Controller()(SmokeController);

  class SmokeModule {}
  Module({
    imports: [PidControllerModule.forRoot({ pid: { config: { maxConcurrentRequests: 1 } } })],
    controllers: [SmokeController],
  })(SmokeModule);

  const app = adapter
    ? await NestFactory.create(SmokeModule, adapter(), { logger: false })
    : await NestFactory.create(SmokeModule, { logger: false });

  try {
    await app.listen(0, '127.0.0.1');
    await assertOk(label, await fetch(await app.getUrl()));
  } finally {
    await app.close();
  }
}

async function assertOk(label, response) {
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(label + ' package smoke failed: ' + response.status + ' ' + JSON.stringify(body));
  }
}
`);
  run('node', ['smoke.mjs'], consumer);
  console.log('Consumer package smoke passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}

function run(command, args, cwd, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnvironment },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}
