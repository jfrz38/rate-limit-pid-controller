# Cinnamon-inspired Rate Limiter

This project is an **opinionated implementation of a rate limiter**, inspired by Uber’s [Cinnamon blog post](https://www.uber.com/en-ES/blog/cinnamon-using-century-old-tech-to-build-a-mean-load-shedder/?uclick_id=023fa4c1-0abf-4379-ad4d-62ed0a214924).  
It is written as long as possible in **plain language** without heavy dependencies or frameworks, with the goal of being easily integrated as a dependency in the current framework such as **NestJS**.

## Motivation

Uber’s Cinnamon introduced a novel approach to rate limiting by combining **PID controllers** with traffic-shaping techniques.  
Unlike classic token bucket or leaky bucket implementations, this design allows for:

- Dynamic adjustments based on system feedback.
- Smoother request handling under varying loads.
- Avoidance of over-provisioning while keeping latencies predictable.

This library takes those principles based on Uber's blog and applies them in a **simplified and opinionated implementation**.

## References

[Cinnamon: Using Century Old Tech to Build a Mean Load Shedder](https://www.uber.com/en-ES/blog/cinnamon-using-century-old-tech-to-build-a-mean-load-shedder/?uclick_id=023fa4c1-0abf-4379-ad4d-62ed0a214924)
[PID Controller for Cinnamon](https://www.uber.com/en-ES/blog/pid-controller-for-cinnamon/?uclick_id=023fa4c1-0abf-4379-ad4d-62ed0a214924)
[Cinnamon Auto-Tuner: Adaptive Concurrency in the Wild](https://www.uber.com/en-ES/blog/cinnamon-auto-tuner-adaptive-concurrency-in-the-wild/)
