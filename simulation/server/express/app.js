const express = require('express');
const { pidControllerMiddleware, pidControllerErrorHandler } = require('@jfrz38/pid-controller-express')

// TODO: Mirar si se está cogiendo el código y mensaje para express porque no veo el objeto en la entrada del middleware.
const { middleware } = pidControllerMiddleware(
  {
    pid: {
      config: {
        threshold: {
          initial: 200
        },
        capacity: {
          cores: 1,
          maxConcurrentRequests: 2
        },
        log: {
          level: 'debug'
        },
        statistics: {
          minRequestsForLatencyPercentile: 10,
          minRequestsForStats: 10
        }
      },
      priority: {
        getPriority: (req) => req.get('x-priority')
      },
    }
  }
);

const app = express();
app.use(middleware);
app.use(pidControllerErrorHandler({
  code: 503,
  message: 'Custom message for the error'
}))

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/test', async (req, res) => {
  const executionTime = Number(req.headers['execution-time']) || 100;

  await sleep(executionTime);

  res.json({
    ok: true,
    simulatedDelay: executionTime
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Try: curl -H "x-priority: 4" -H "execution-time: 2000" http://localhost:3000/test`);
});
