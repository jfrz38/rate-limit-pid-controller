# Cinnamon-inspired Rate Limiter

This project is an **opinionated implementation of a rate limiter**, inspired by Uber’s [Cinnamon blog post](https://www.uber.com/en-ES/blog/cinnamon-using-century-old-tech-to-build-a-mean-load-shedder/?uclick_id=023fa4c1-0abf-4379-ad4d-62ed0a214924).  
It is written in **plain TypeScript**, with the goal of being easily integrated as a dependency in **NestJS** projects — but it can also be used in any Node.js environment.

## Motivation

Uber’s Cinnamon introduced a novel approach to rate limiting by combining **PID controllers** with traffic-shaping techniques.  
Unlike classic token bucket or leaky bucket implementations, this design allows for:

- Dynamic adjustments based on system feedback.
- Smoother request handling under varying loads.
- Avoidance of over-provisioning while keeping latencies predictable.

This library takes those principles and applies them in a **simplified, opinionated TypeScript implementation**.

## Features

- ✅ Written in **plain TypeScript** (no external dependencies required).
- ✅ Provides **PID-controller-based rate limiting**.
- ✅ Built with **express compatibility** in mind (and also **NestJS**).
- ✅ Tracks request lifecycle events (launch, success, failure).
- ✅ Interval-based statistics for adaptive control.

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

    use(req: any, res: any, next: (error?: any) => void) {
        const task = async () => {
            await new Promise<void>((resolve) => {
                next();
                resolve();
            });
        };

        // Get priority from header or whatever
        const priority = 5;
        this.pidController.run(task, priority);
    }

}

```

## References

[Cinnamon: Using Century Old Tech to Build a Mean Load Shedder](https://www.uber.com/en-ES/blog/cinnamon-using-century-old-tech-to-build-a-mean-load-shedder/?uclick_id=023fa4c1-0abf-4379-ad4d-62ed0a214924)
[PID Controller for Cinnamon](https://www.uber.com/en-ES/blog/pid-controller-for-cinnamon/?uclick_id=023fa4c1-0abf-4379-ad4d-62ed0a214924)
[Cinnamon Auto-Tuner: Adaptive Concurrency in the Wild](https://www.uber.com/en-ES/blog/cinnamon-auto-tuner-adaptive-concurrency-in-the-wild/)
