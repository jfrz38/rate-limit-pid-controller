export interface ScenarioRequest {
  requestId: number;
  scenario: string;
  seed: number;
  phase: string;
  arrivalTimeMs: number;
  executionTimeMs: number;
  priorityTier: number;
  priorityValue: number;
}

export function parseScenario(content: string): ScenarioRequest[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const headers = lines.shift()?.split(',') ?? [];
  const expectedHeaders = [
    'requestId', 'scenario', 'seed', 'phase', 'arrivalTimeMs', 'executionTimeMs', 'priorityTier', 'priorityValue',
  ];

  if (headers.join(',') !== expectedHeaders.join(',')) {
    throw new Error(`Invalid scenario headers: ${headers.join(',')}`);
  }

  const requests = lines.map((line, index) => {
    const values = line.split(',');
    if (values.length !== expectedHeaders.length) {
      throw new Error(`Invalid column count at scenario row ${index + 2}`);
    }
    const request: ScenarioRequest = {
      requestId: Number(values[0]),
      scenario: values[1],
      seed: Number(values[2]),
      phase: values[3],
      arrivalTimeMs: Number(values[4]),
      executionTimeMs: Number(values[5]),
      priorityTier: Number(values[6]),
      priorityValue: Number(values[7]),
    };
    const numericValues = [request.requestId, request.seed, request.arrivalTimeMs, request.executionTimeMs,
      request.priorityTier, request.priorityValue];
    if (numericValues.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid numeric value at scenario row ${index + 2}`);
    }
    if (request.arrivalTimeMs < 0 || request.executionTimeMs < 0) {
      throw new Error(`Negative timing value at scenario row ${index + 2}`);
    }
    if (!Number.isInteger(request.requestId) || !Number.isInteger(request.seed)
      || !Number.isInteger(request.priorityTier) || !Number.isInteger(request.priorityValue)
      || request.priorityTier < 0 || request.priorityTier > 5
      || request.priorityValue < 0 || request.priorityValue > 767
      || Math.floor(request.priorityValue / 128) !== request.priorityTier) {
      throw new Error(`Invalid identity or priority at scenario row ${index + 2}`);
    }
    if (!request.scenario || !request.phase) {
      throw new Error(`Missing scenario or phase at scenario row ${index + 2}`);
    }
    return request;
  }).sort((left, right) => left.arrivalTimeMs - right.arrivalTimeMs);

  if (requests.some((request) => request.scenario !== requests[0].scenario || request.seed !== requests[0].seed)) {
    throw new Error('Scenario rows must use one scenario name and seed');
  }
  return requests;
}
