# PID Controller - Express adapter

This is the **Express** adapter for the [PID Controller](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/core). It allows you to easily integrate adaptive rate limiting and load shedding into your Express applications as a standard middleware.

## Features

- **Middleware Integration**: Seamlessly injects the PID control loop into your request pipeline.
- **Automatic Error Handling**: Includes a specialized error handler to manage `rejected` requests.
- **Priority Extraction**: Flexible configuration to determine request priority from headers, tokens, or any part of the express `request` object.

## Installation

```bash
npm install @jfrz38/pid-controller-express
```

## Configuration

Configuration objects allow three values, where `config` is the same as explained into [PID core](https://github.com/jfrz38/rate-limit-pid-controller/blob/main/code/core/README.md#Configuration%20Reference):

| Parameter                  | Type                       | Default                     | Description                                                                  |
|----------------------------|----------------------------|-----------------------------|------------------------------------------------------------------------------|
| `pid.config`               | Parameters                 | -                           | Configuration for the PID engine. See core for more information.             |
| `pid.priority.getPriority` | `(req: Request) => number` | `req.headers['x-priority']` | Function to get priority from the request.                                   |

## Error Handler configuration

| Parameter    | Type    | Default                                    | Description                                                                                     |
|--------------|---------|--------------------------------------------|-------------------------------------------------------------------------------------------------|
| `message`    | string  | Too many requests, please try again later. | A custom descriptive message for the error                                                      |
| `retryAfter` | number  | -                                          | The value in seconds for the 'Retry-After' HTTP header                                          |
| `code`       | number  | 429                                        | The HTTP status code to return.                                                                 |
| `response`   | object  | object with default `title` and `message`  | The custom JSON body object to be sent to the client.                                           |
| `title`      | string  | RATE_LIMIT_EXCEEDED                        | A short string representing the error title or category.                                        |
| `hideError`  | boolean | `true`                                     | If true, prevents the internal PID exception message from being included in the final response. |

## Quick Start

The adapter provides a **middleware** to intercept requests and an **error handler** to manage shedding events:

```js
const express = require('express');
const { pidControllerMiddleware, pidControllerErrorHandler } = require('@jfrz38/pid-controller-express')

// Initialize the middleware with your configuration. Check pid-controller-core for more information
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

// Use middleware and/or error handler
app.use(middleware);
app.use(pidControllerErrorHandler({
  code: 503,
  message: 'Custom message for the error'
}))

app.get('/test', async (req, res) => {
    res.json({ ok: true });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Try: curl -H "x-priority: 4" http://localhost:3000/test`);
});
```

## Error Handling

When the controller decides to reject the request due to low priority, it throws a specific internal error that `pidControllerErrorHandler()` handle.

- **Default Behavior**: Returns `429 Too Many Request`.
- **Customization**: You can override the status code and response body using the rules parameter during initialization.
