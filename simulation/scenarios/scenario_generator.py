import argparse
import csv
import os
from dataclasses import asdict, dataclass

import numpy as np


DEFAULT_SEED = 20260913
PRIORITY_COHORTS = 128

script_dir = os.path.dirname(os.path.abspath(__file__))
results_dir = os.path.join(script_dir, "generated")


@dataclass(frozen=True)
class Phase:
    name: str
    duration_seconds: float
    requests_per_second: float
    execution_mean_ms: float
    execution_stddev_ms: float
    priority_weights: tuple[float, float, float, float, float, float]


@dataclass(frozen=True)
class Request:
    request_id: int
    scenario: str
    seed: int
    phase: str
    arrival_time_ms: float
    execution_time_ms: float
    priority_tier: int
    priority_value: int


BALANCED = (0.05, 0.10, 0.15, 0.20, 0.25, 0.25)
LOW_IMPORTANCE = (0.03, 0.05, 0.07, 0.15, 0.30, 0.40)
HIGH_IMPORTANCE = (0.35, 0.30, 0.15, 0.10, 0.06, 0.04)


SCENARIOS: dict[str, tuple[Phase, ...]] = {
    "base": (
        Phase("steady", 120, 12, 80, 10, BALANCED),
    ),
    "aggressive_peak": (
        Phase("warmup", 20, 8, 80, 10, BALANCED),
        Phase("peak", 40, 50, 80, 10, LOW_IMPORTANCE),
        Phase("recovery", 30, 8, 80, 10, BALANCED),
    ),
    "high_latency": (
        Phase("steady", 120, 8, 300, 40, BALANCED),
    ),
    "high_volume": (
        Phase("steady", 120, 35, 80, 10, LOW_IMPORTANCE),
    ),
    "low_latency": (
        Phase("steady", 120, 15, 30, 5, BALANCED),
    ),
    "priority_spike": (
        Phase("baseline", 40, 20, 80, 10, BALANCED),
        Phase("critical_spike", 40, 20, 80, 10, HIGH_IMPORTANCE),
        Phase("recovery", 40, 20, 80, 10, BALANCED),
    ),
    "stress": (
        Phase("warmup", 60, 10, 80, 10, BALANCED),
        Phase("overload", 120, 50, 100, 20, LOW_IMPORTANCE),
        Phase("degraded", 120, 20, 300, 40, BALANCED),
        Phase("recovery", 60, 6, 70, 10, BALANCED),
    ),
    "adaptive_soak_10m": (
        Phase("warmup", 90, 8, 80, 10, BALANCED),
        Phase("capacity_discovery", 120, 20, 80, 10, BALANCED),
        Phase("overload", 120, 50, 80, 10, LOW_IMPORTANCE),
        Phase("latency_degradation", 120, 20, 300, 40, BALANCED),
        Phase("recovery", 90, 6, 70, 8, BALANCED),
        Phase("cooldown", 60, 2, 70, 8, BALANCED),
    ),
    "aggressive_peak_10m": (
        Phase("warmup", 120, 10, 80, 10, BALANCED),
        Phase("super_aggressive_peak", 120, 200, 120, 20, LOW_IMPORTANCE),
        Phase("recovery", 120, 8, 80, 10, BALANCED),
        Phase("moderate_load", 120, 20, 80, 10, BALANCED),
        Phase("cooldown", 120, 4, 70, 8, BALANCED),
    ),
}


def generate_requests(scenario: str, seed: int) -> list[Request]:
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario}")

    rng = np.random.default_rng(seed)
    requests: list[Request] = []
    phase_start_ms = 0.0

    for phase in SCENARIOS[scenario]:
        request_count = round(phase.duration_seconds * phase.requests_per_second)
        interval_ms = 1000 / phase.requests_per_second
        arrivals = (np.arange(request_count) + 0.5) * interval_ms
        jitter = rng.uniform(-0.2, 0.2, request_count) * interval_ms
        arrivals = np.sort(np.clip(arrivals + jitter, 0, phase.duration_seconds * 1000 - 0.001))
        execution_times = np.maximum(
            1,
            rng.normal(phase.execution_mean_ms, phase.execution_stddev_ms, request_count),
        )
        tiers = rng.choice(6, size=request_count, p=phase.priority_weights)
        cohorts = rng.integers(0, PRIORITY_COHORTS, size=request_count)

        for arrival, execution, tier, cohort in zip(arrivals, execution_times, tiers, cohorts):
            requests.append(Request(
                request_id=len(requests) + 1,
                scenario=scenario,
                seed=seed,
                phase=phase.name,
                arrival_time_ms=phase_start_ms + float(arrival),
                execution_time_ms=float(execution),
                priority_tier=int(tier),
                priority_value=int(tier) * PRIORITY_COHORTS + int(cohort),
            ))

        phase_start_ms += phase.duration_seconds * 1000

    return requests


def generate_csv(scenario: str, seed: int = DEFAULT_SEED) -> str:
    os.makedirs(results_dir, exist_ok=True)
    filepath = os.path.join(results_dir, f"{scenario}.csv")
    requests = generate_requests(scenario, seed)

    with open(filepath, mode="w", newline="", encoding="utf-8") as csvfile:
        fieldnames = [
            "requestId",
            "scenario",
            "seed",
            "phase",
            "arrivalTimeMs",
            "executionTimeMs",
            "priorityTier",
            "priorityValue",
        ]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for request in requests:
            row = asdict(request)
            writer.writerow({
                "requestId": row["request_id"],
                "scenario": row["scenario"],
                "seed": row["seed"],
                "phase": row["phase"],
                "arrivalTimeMs": f'{row["arrival_time_ms"]:.3f}',
                "executionTimeMs": f'{row["execution_time_ms"]:.3f}',
                "priorityTier": row["priority_tier"],
                "priorityValue": row["priority_value"],
            })

    print(f"CSV generated: {filepath} ({len(requests)} requests, seed {seed})")
    return filepath


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a deterministic PID simulation trace")
    parser.add_argument("scenario", choices=SCENARIOS.keys())
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    generate_csv(args.scenario, args.seed)
