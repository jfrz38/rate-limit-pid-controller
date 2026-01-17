# PID Controller - NodeJS

## Installation

```bash
npm install @jfrz38/rate-limit-pid-controller
```

## Usage

A minimal example:

```ts
import { Injectable, NestMiddleware } from "@nestjs/common";
import { PidControllerRateLimit } from '@jfrz38/rate-limit-pid-controller';

@Injectable()
export class TrafficControlMiddleware implements NestMiddleware {

    constructor(private readonly pidController: PidControllerRateLimit) { }

    async use(req: any, res: any, next: (error?: any) => void) {
        const task = () => new Promise<void>((resolve) => {
            next();
            res.on('finish', resolve);
        });

        // Get priority from header or whatever
        const priority = req.headers['pid-controller-priority'] || 5;
        await this.pidController.run(task, priority);
    }
}
```
