import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseScenario } from '../index';

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
