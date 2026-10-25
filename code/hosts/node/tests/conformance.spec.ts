import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  componentErrorPayload,
  createComponentController,
  type ComponentAction,
} from '../src/component-runtime.js';
import { resolveConfiguration } from '../src/configuration.js';
import type { ControllerOptions } from '../src/types.js';

interface Scenario {
  name: string;
  configuration?: Record<string, unknown>;
  expectCreateError?: Record<string, unknown>;
  steps?: Array<Record<string, any>>;
}

const scenariosDirectory = new URL('../conformance/conformance/scenarios/', import.meta.url);
const scenarioFiles = readdirSync(scenariosDirectory)
  .filter((file) => file.endsWith('.json'))
  .sort();

describe('WebAssembly component conformance', () => {
  for (const file of scenarioFiles) {
    const scenarios = JSON.parse(readFileSync(new URL(file, scenariosDirectory), 'utf8')) as Scenario[];
    describe(file, () => {
      for (const scenario of scenarios) {
        test(scenario.name, () => executeScenario(scenario));
      }
    });
  }

  test('reports wasm32 collection bound overflow through the WIT boundary', () => {
    const configuration = resolveConfiguration({ maxConcurrentRequests: 4_294_967_296n });

    try {
      createComponentController(configuration);
      throw new Error('expected wasm32 collection bound overflow');
    } catch (error) {
      expect(componentErrorPayload(error)).toEqual({
        tag: 'numeric-overflow',
        val: 'max-concurrent-requests',
      });
    }
  });

  test('creates independent component resources', () => {
    const options = {
      maxConcurrentRequests: 1,
      pid: { intervalMs: 10_000 },
    } satisfies ControllerOptions;
    const first = createComponentController(resolveConfiguration(options));
    const second = createComponentController(resolveConfiguration(options));

    expect(first.submit(0, 0n).requestId).toBe(0n);
    expect(second.submit(0, 0n).requestId).toBe(0n);
    expect(first.submit(1, 0n).actions).toEqual([]);
    expect(second.submit(1, 0n).actions).toEqual([]);
  });
});

function executeScenario(scenario: Scenario): void {
  if (scenario.expectCreateError) {
    try {
      createComponentController(resolveConfiguration(scenario.configuration as ControllerOptions));
      throw new Error('expected controller creation to fail');
    } catch (error) {
      expect(normalizeError(componentErrorPayload(error))).toEqual(scenario.expectCreateError);
    }
    return;
  }

  const controller = createComponentController(resolveConfiguration(scenario.configuration as ControllerOptions));
  const aliases = new Map<string, bigint>();
  const reverseAliases = new Map<bigint, string>();

  for (const step of scenario.steps ?? []) {
    switch (step.operation) {
      case 'submit':
        verifyMutation(step, () => {
          const submission = controller.submit(step.priority, BigInt(step.atMs));
          aliases.set(step.as, submission.requestId);
          reverseAliases.set(submission.requestId, step.as);
          return normalizeActions(submission.actions, reverseAliases);
        });
        break;
      case 'complete':
        verifyMutation(step, () => normalizeActions(controller.complete(
          requestId(step.request, aliases),
          step.outcome,
          BigInt(step.atMs),
        ), reverseAliases));
        break;
      case 'cancel':
        verifyMutation(step, () => normalizeActions(controller.cancel(
          requestId(step.request, aliases),
          BigInt(step.atMs),
        ), reverseAliases));
        break;
      case 'advance-time':
        verifyMutation(step, () => normalizeActions(controller.advanceTime(BigInt(step.atMs)), reverseAliases));
        break;
      case 'shutdown':
        verifyMutation(step, () => normalizeActions(controller.shutdown(BigInt(step.atMs)), reverseAliases));
        break;
      case 'next-deadline':
        expect(toJsonInteger(controller.nextDeadline())).toEqual(step.expectMs);
        break;
      case 'latest-statistics': {
        const actual = controller.latestStatistics();
        if (step.expect === null) {
          expect(actual).toBeUndefined();
        } else {
          const normalized = normalizeStatistics(actual!);
          expect(normalized).toEqual(expect.objectContaining({
            ...step.expect,
            averageLatencyMs: expect.closeTo(step.expect.averageLatencyMs, 10),
            throughputPerSecond: expect.closeTo(step.expect.throughputPerSecond, 10),
          }));
        }
        break;
      }
      case 'priority-percentile':
        expect(controller.priorityPercentile(step.percentile) ?? null).toEqual(step.expect);
        break;
      default:
        throw new Error(`unknown conformance operation: ${step.operation}`);
    }
  }
}

function verifyMutation(step: Record<string, any>, operation: () => unknown): void {
  if (step.error) {
    try {
      operation();
      throw new Error(`expected ${step.operation} to fail`);
    } catch (error) {
      expect(normalizeError(componentErrorPayload(error))).toEqual(step.error);
    }
    return;
  }
  expect(operation()).toEqual(step.actions);
}

function normalizeActions(actions: ComponentAction[], aliases: Map<bigint, string>): unknown[] {
  return actions.map((action) => {
    switch (action.tag) {
      case 'threshold-changed':
      case 'concurrency-changed':
        return {
          type: action.tag,
          previous: toJsonInteger(action.val.previous),
          current: toJsonInteger(action.val.current),
        };
      case 'start':
        return { type: 'start', request: alias(action.val, aliases) };
      case 'reject':
        return {
          type: 'reject',
          request: alias(action.val.requestId, aliases),
          reason: action.val.reason.tag === 'threshold'
            ? { type: 'threshold', ...action.val.reason.val }
            : { type: action.val.reason.tag },
        };
      case 'evict':
        return {
          type: 'evict',
          request: alias(action.val.requestId, aliases),
          reason: action.val.reason,
        };
      case 'cancel':
        return {
          type: 'cancel',
          request: alias(action.val.requestId, aliases),
          reason: action.val.reason,
        };
    }
  });
}

function normalizeError(payload: unknown): Record<string, unknown> | undefined {
  if (!isVariant(payload)) {
    return undefined;
  }
  if (payload.tag === 'controller') {
    return normalizeError(payload.val);
  }
  switch (payload.tag) {
    case 'threshold-out-of-range':
    case 'statistics-percentile-out-of-range':
    case 'priority-out-of-range':
      return { type: payload.tag, value: payload.val };
    case 'statistics-window-order':
      return { type: payload.tag, minimumMs: toJsonInteger(payload.val.minimumMs), maximumMs: toJsonInteger(payload.val.maximumMs) };
    case 'statistics-sample-limit-too-small':
      return { type: payload.tag, maximum: toJsonInteger(payload.val.maximum), required: toJsonInteger(payload.val.required) };
    case 'invalid-pid-gain':
      return { type: payload.tag, name: payload.val };
    case 'time-regression':
      return { type: payload.tag, previousMs: toJsonInteger(payload.val.previousMs), receivedMs: toJsonInteger(payload.val.receivedMs) };
    case 'unknown-request':
      return { type: payload.tag, requestId: toJsonInteger(payload.val) };
    case 'invalid-transition':
      return {
        type: payload.tag,
        requestId: toJsonInteger(payload.val.requestId),
        operation: payload.val.operation,
        state: payload.val.state,
      };
    case 'numeric-overflow':
      return { type: payload.tag, field: payload.val };
    default:
      return { type: payload.tag };
  }
}

function normalizeStatistics(snapshot: Record<string, any>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, toJsonInteger(value)]));
}

function isVariant(value: unknown): value is { tag: string; val?: any } {
  return typeof value === 'object' && value !== null && 'tag' in value;
}

function requestId(request: string | number, aliases: Map<string, bigint>): bigint {
  if (typeof request === 'number') {
    return BigInt(request);
  }
  const id = aliases.get(request);
  if (id === undefined) {
    throw new Error(`unknown request alias: ${request}`);
  }
  return id;
}

function alias(requestId: bigint, aliases: Map<bigint, string>): string {
  const value = aliases.get(requestId);
  if (value === undefined) {
    throw new Error(`missing alias for request ${requestId}`);
  }
  return value;
}

function toJsonInteger(value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}
