const express = require('express');
const { pidControllerMiddleware, pidControllerErrorHandler } = require('@jfrz38/pid-controller-express')

const { middleware } = pidControllerMiddleware(
    {
        priority: {
            getPriority: (req) => Number(req.headers['x-priority'])
        },
        pidConfig: {
            log: { level: 'debug' },
            statistics: {
                minRequestsForLatencyPercentile: 10,
                minRequestsForStats: 10
            }
        }
    }
);

const app = express();
app.use(middleware);
app.use(pidControllerErrorHandler())

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
