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

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
app.get('/test', async (request, response) => {
  const executionTime = Number(request.headers['execution-time']) || 100;
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
