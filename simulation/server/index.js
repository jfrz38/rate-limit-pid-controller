const express = require('express');
const { PidControllerRateLimit } = require('../../code/core/dist/src/pid-controller-rate-limit');

const app = express();

const pidController = new PidControllerRateLimit({
    threshold: {
        initial: 300
    },
    capacity: {
        maxConcurrentRequests: 4,
    },
    log: { level: 'debug' }
});

app.use(async (req, res, next) => {
    const priority = parseInt(req.headers['priority']) || 5;
    const executionTime = parseInt(req.headers['execution-time']) || 1000;

    const task = () => new Promise((resolve) => {
        setTimeout(() => {
            next(); 
            res.on('finish', resolve);
        }, executionTime);
    });

    try {
        await pidController.run(task, priority);
    } catch (error) {
        console.log(error)
        res.status(429).json({
            error: 'Too Many Requests',
            message: error.message,
            priority: priority
        });
    }
});

app.get('/', (req, res) => {
    res.send('OK');
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Try: curl -H "priority: 4" -H "execution-time: 2000" http://localhost:3000`);
});
