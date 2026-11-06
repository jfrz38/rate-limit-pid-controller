import 'reflect-metadata';

import {
  Controller,
  Get,
  Header,
  HttpCode,
  Module,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, test } from 'vitest';

import { PidControllerModule } from '../../src/module/pid-controller.module';

@Controller()
class CharacterizationController {
  @Get('resource')
  @HttpCode(201)
  @Header('x-platform', 'express')
  resource() {
    return { admitted: true };
  }

  @Get('failure')
  failure() {
    throw new Error('application failed');
  }

  @Get('health')
  health() {
    return { status: 'up' };
  }

  @Get('limited')
  limited() {
    return { admitted: true };
  }
}

describe('NestJS adapter on Express', () => {
  const applications: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((application) => application.close()));
  });

  test('preserves an admitted response from a real Nest application', async () => {
    const url = await startApplication(PidControllerModule.forRoot({}), applications);

    const response = await fetch(`${url}/resource`);

    expect(response.status).toBe(201);
    expect(response.headers.get('x-platform')).toBe('express');
    await expect(response.json()).resolves.toEqual({ admitted: true });
  });

  test('maps an admission rejection without executing the controller route', async () => {
    const url = await startApplication(PidControllerModule.forRoot({
      pid: {
        config: { initialThreshold: 1 },
        priority: { getPriority: () => 1 },
      },
    }), applications);

    const response = await fetch(`${url}/limited`);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    });
  });

  test('does not convert an application failure into an admission error', async () => {
    const url = await startApplication(PidControllerModule.forRoot({}), applications);

    const response = await fetch(`${url}/failure`);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  test('keeps an excluded route outside admission control', async () => {
    const url = await startApplication(PidControllerModule.forRoot({
      pid: {
        config: { initialThreshold: 1 },
        priority: { getPriority: () => 1 },
      },
      routes: { excludeRoutes: ['health'] },
    }), applications);

    const health = await fetch(`${url}/health`);
    const limited = await fetch(`${url}/limited`);

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'up' });
    expect(limited.status).toBe(429);
  });
});

async function startApplication(
  pidControllerModule: ReturnType<typeof PidControllerModule.forRoot>,
  applications: INestApplication[],
): Promise<string> {
  @Module({
    imports: [pidControllerModule],
    controllers: [CharacterizationController],
  })
  class CharacterizationModule {}

  const application = await NestFactory.create(CharacterizationModule, { logger: false });
  applications.push(application);
  await application.listen(0, '127.0.0.1');
  return application.getUrl();
}
