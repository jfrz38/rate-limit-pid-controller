import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DispatchLagMetrics, dispatchDelayMs, parseScenario } from '../index';

const HEADER = 'requestId,scenario,seed,phase,arrivalTimeMs,executionTimeMs,priorityTier,priorityValue';

describe('parseScenario', () => {
  test('parses and orders a deterministic scenario trace', () => {
    const requests = parseScenario([
      HEADER,
      '2,base,42,steady,200,80,1,129',
      '1,base,42,steady,100,70,0,3',
    ].join('\n'));

    assert.deepEqual(requests.map((request) => request.requestId), [1, 2]);
    assert.equal(requests[0].priorityValue, 3);
    assert.equal(requests[0].executionTimeMs, 70);
  });

  test('rejects the legacy worker-relative format', () => {
    assert.throws(
      () => parseScenario('requestId,priority,executionTime,sleepTime\n1,2,0.5,0.5'),
      /Invalid scenario headers/,
    );
  });

  test('rejects negative timing values', () => {
    assert.throws(
      () => parseScenario(`${HEADER}\n1,base,42,steady,-1,80,0,3`),
      /Negative timing value/,
    );
  });

  test('rejects inconsistent tier and full priority value', () => {
    assert.throws(
      () => parseScenario(`${HEADER}\n1,base,42,steady,1,80,2,3`),
      /Invalid identity or priority/,
    );
  });

  test('rejects rows from different seeds', () => {
    assert.throws(
      () => parseScenario(`${HEADER}\n1,base,42,steady,1,80,0,3\n2,base,43,steady,2,80,0,4`),
      /one scenario name and seed/,
    );
  });
});

describe('dispatch timing', () => {
  test('does not schedule a zero-delay timer for overdue arrivals', () => {
    assert.equal(dispatchDelayMs(100, 80), 20);
    assert.equal(dispatchDelayMs(100, 100), 0);
    assert.equal(dispatchDelayMs(100, 120), 0);
  });

  test('summarizes dispatch lag for execution validity checks', () => {
    const metrics = new DispatchLagMetrics();
    metrics.record(100, 100);
    metrics.record(200, 202);
    metrics.record(300, 310);
    metrics.record(400, 400);
    metrics.record(500, 504);

    assert.deepEqual(metrics.summarize(), {
      samples: 5,
      delayedRequests: 3,
      p50Ms: 2,
      p95Ms: 4,
      maxMs: 10,
    });
  });
});
