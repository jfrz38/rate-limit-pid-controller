# Rate Limiter PID Controller

[![CodeQL](https://github.com/jfrz38/rate-limit-pid-controller/actions/workflows/codeql.yml/badge.svg)](https://github.com/jfrz38/rate-limit-pid-controller/actions/workflows/codeql.yml)
[![license](https://img.shields.io/github/license/jfrz38/rate-limit-pid-controller)](https://github.com/jfrz38/rate-limit-pid-controller/blob/main/LICENSE)

This project is an **opinionated implementation of a rate limiter**, inspired by Uber’s [Cinnamon blog post](https://www.uber.com/en-ES/blog/cinnamon-using-century-old-tech-to-build-a-mean-load-shedder/?uclick_id=023fa4c1-0abf-4379-ad4d-62ed0a214924).  
It is designed to be framework-agnostic and written in plain TypeScript with zero heavy dependencies, with the goal of being easily integrated as a dependency in plain NodeJs or using a framework such as **Express** or **NestJS**.

## Usage

Choose how you want to integrate the PID rate limiter:

- **Standalone Core**  
  Use the PID controller directly in any Node.js project without HTTP protocols.  
  🔗 [Core README](./code/core/README.md) [![npm](https://img.shields.io/npm/v/@jfrz38/pid-controller-core)](https://www.npmjs.com/package/@jfrz38/pid-controller-core)

- **Framework Adapters**  
  Plug the controller into your framework with minimal setup:  
  🔗 [Express Adapter](./code/adapters/express/README.md) [![npm](https://img.shields.io/npm/v/@jfrz38/pid-controller-express)](https://www.npmjs.com/package/@jfrz38/pid-controller-express)  
  🔗 [NestJS Adapter](./code/adapters/nestjs/README.md) [![npm](https://img.shields.io/npm/v/@jfrz38/pid-controller-nestjs)](https://www.npmjs.com/package/@jfrz38/pid-controller-nestjs)

> You can either control requests manually via the core or handle them automatically with middleware.

Also you can explore [simulation examples](./simulation/README.md) to see how the PID controller behaves under different traffic loads and latency scenarios..

## Motivation

Uber’s Cinnamon introduced a novel approach to rate limiting by combining **PID controllers** with traffic-shaping techniques.  
Unlike classic token bucket or leaky bucket implementations, this design allows for:

- Adjust limits **dynamically** based on system feedback.
- Handle bursts and varying loads **smoothly**.
- Maintain **predictable latencies** while avoiding over-provisioning.

This project implements a **simplified, opinionated version** of Cinnamon’s approach for easy integration and experimentation.

<sub><sup>_(simplified logic):_</sub></sup>

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontFamily': 'Inter, Arial, sans-serif'}, 'flowchart': {'curve': 'basis'}}}%%
flowchart LR
  Traffic([Incoming traffic]) --> Gate{Priority gate}
  Gate -->|Accepted| App[Application]
  Gate -->|Shed| Rejected[Fast rejection]

  App -. health signals .-> Controller[PID controller]
  Rejected -. pressure signals .-> Controller
  Controller -. adjusts threshold .-> Gate

  style Traffic fill:#eef6ff,stroke:#4f8cc9,stroke-width:1.5px
  style Gate fill:#fff7e6,stroke:#d7971f,stroke-width:1.5px
  style App fill:#ebf8f0,stroke:#3b9b61,stroke-width:1.5px
  style Rejected fill:#fff0f0,stroke:#d45b5b,stroke-width:1.5px
  style Controller fill:#f4f1ff,stroke:#7a64c7,stroke-width:1.5px
```

> [!NOTE]  
> Check extended explanation into [Core project](./code/core/README.md#All%20pieces%20together).

## Features

- PID-based dynamic rate limiting.
- Pluggable adapters for different frameworks (e.g., NestJS, Express).
- Configurable thresholds, recovery, and overload handling.
- Designed for **high concurrency** environments.
- Priority-based shedding dropping background tasks during high-load periods while keeping critical requests alive.

## How it works

Standard rate limiters are static: you set 100 RPS, and it stays at 100 RPS. This project uses a **PID Controller**, which acts like a **smart thermostat** for your server:

1. **Error Calculation**: It constantly compares your current system health (latency/concurrency) against a "ideal" target.
2. **Dynamic Thresholding**: Instead of a fixed number, it calculates a **Priority Threshold**.
3. **Load Shedding**: Only requests with a priority higher than the current threshold are allowed.
4. **Self-Correction**: If the server slows down, the PID raises the threshold automatically. As it recovers, it gracefully lowers it back.

## Packages and releases

This repository contains several npm packages that are versioned and released independently:

- `@jfrz38/pid-controller-core` uses tags like `core-vX.Y.Z`.
- `@jfrz38/pid-controller-express` uses tags like `express-vX.Y.Z`.
- `@jfrz38/pid-controller-nestjs` uses tags like `nestjs-vX.Y.Z`.

GitHub Releases are therefore package-specific. `npm` is the source of truth for each package's `latest` version, because npm tracks the `latest` dist-tag per package while GitHub only has one repository-level latest release.

## Development

Common project tasks are exposed through the root `Makefile`:

```bash
make install-code
make build
make test
make ci
```

Package-specific checks are also available:

```bash
make validate-core
make validate-express
make validate-nestjs
```

Run `make help` to list all available targets.

## References

- [Cinnamon: Using Century Old Tech to Build a Mean Load Shedder](https://www.uber.com/en-ES/blog/cinnamon-using-century-old-tech-to-build-a-mean-load-shedder/?uclick_id=023fa4c1-0abf-4379-ad4d-62ed0a214924).  
- [PID Controller for Cinnamon](https://www.uber.com/en-ES/blog/pid-controller-for-cinnamon/?uclick_id=023fa4c1-0abf-4379-ad4d-62ed0a214924).  
- [Cinnamon Auto-Tuner: Adaptive Concurrency in the Wild](https://www.uber.com/en-ES/blog/cinnamon-auto-tuner-adaptive-concurrency-in-the-wild/).  
