# PID Controller - Simulation Suite

This directory contains the necessary tools to stress-test the PID controller, generate synthetic traffic patterns, and run real-world server examples. It is designed to demonstrate how the controller reacts to different load levels in real-time.

## Scenarios

Scenarios are generated using normal distributions to create realistic variations in execution times and request intervals.

The following scenarios are available:

| Scenario          | Requests | Description                                                                   |
|-------------------|----------|-------------------------------------------------------------------------------|
| `base`            | 10,000   | Standard traffic with balanced priorities and moderate latency.               |
| `aggressive_peak` | 10,000   | Fast incoming requests with very short sleep times and low importance.        |
| `high_latency`    | 10,000   | Simulates a slow backend where tasks take significantly longer to complete.   |
| `high_volume`     | 10,000   | Large amount of requests with short intervals, testing the throughput limits. |
| `priority_spike`  | 5,000    | A sudden surge of high-priority (critical) requests.                          |
| `stress`          | 50,000   | Long-running high-load test to verify the stability of the PID over time.     |
| `low_latency`     | 10,000   | Optimal conditions used as a baseline for performance.                        |

## Scripts

Run PID controller and read logs to create an example image:

🏗️ **in progress...**

![Last execution](./scripts/runner/results/last_exectution.png)

> [!WARNING]  
> To output logs it is necessary to set logger level at least `debug` which is done automatically when run for tests.

## Servers

Practical examples using frameworks (**Express** and **NestJS** ) and its PID adapters. These servers allow you to test the PID controller implementation in a real HTTP environment calling it directly.

Both server implements PID middleware and error handler. Their route and logic are the same, both accept priority in `x-priority` header and also another header to simulate latency: `execution-time`.

You can test any of them calling via HTTP:

```bash
curl -H "x-priority: 4" -H "execution-time: 2000" http://localhost:3000/test
```

This `curl` will send a priority `4` and the server will be 2 seconds processing the request.
