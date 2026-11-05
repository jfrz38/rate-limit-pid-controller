import express from 'express';
import {
  pidControllerErrorHandler,
  pidControllerMiddleware,
} from '../../../code/adapters/express/dist/index.js';

const { middleware, shutdown } = pidControllerMiddleware({
  pid: {
    config: {
      initialThreshold: 768,
      maxConcurrentRequests: 2,
      statistics: { minSamples: 10, minPercentileSamples: 10 },
    },
    priority: { getPriority: (request) => request.get('x-priority') },
  },
});

const app = express();
app.use(middleware);

const DEFAULT_EXECUTION_TIME_MS = 100;
const MAX_EXECUTION_TIME_MS = 60_000;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
app.get('/test', async (request, response) => {
  const executionTimeHeader = request.get('execution-time');
  const executionTime =
    executionTimeHeader === undefined
      ? DEFAULT_EXECUTION_TIME_MS
      : Number(executionTimeHeader);

  if (
    !Number.isFinite(executionTime) ||
    executionTime < 0 ||
    executionTime > MAX_EXECUTION_TIME_MS
  ) {
    return response.status(400).json({
      error: `execution-time must be between 0 and ${MAX_EXECUTION_TIME_MS}`,
    });
  }

  await sleep(executionTime);
  response.json({ ok: true, simulatedDelay: executionTime });
});
app.use(pidControllerErrorHandler());

const server = app.listen(3000, () => console.log('Server running on http://localhost:3000'));
function close() {
  shutdown();
  server.close();
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
