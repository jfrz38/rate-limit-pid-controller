import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import matplotlib.pyplot as plt


BASE = Path(__file__).resolve().parent
LOGS_FOLDER = BASE / "runner/results/logs"
DEFAULT_IMAGE = BASE / "runner/results/last_execution.png"
DATE_FORMAT = "%Y-%m-%dT%H-%M-%S.%fZ"

PATTERNS = {
    "completed": re.compile(r"Completed request.*: Priority (\d+)"),
    "rejected": re.compile(r"Rejected request.*: Priority (\d+)/(\d+)"),
    "evicted": re.compile(r"Evicted request.*: Priority (\d+)"),
    "threshold_mod": re.compile(r"Threshold modified from ([\d.]+) to: ([\d.]+)"),
    "threshold_init": re.compile(r"Initial threshold: ([\d.]+)"),
    "inflight": re.compile(r"New inflightLimit: (\d+)"),
    "target": re.compile(r"New targetLatency: ([\d.]+)"),
    "timeout": re.compile(r"Updating timeout from ([\d.]+) to ([\d.]+)"),
}
JSON_EXTRACT = re.compile(r"(\{.*\})")


def parse_line(line: str) -> dict | None:
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        match = JSON_EXTRACT.search(line)
        if not match:
            return None
        try:
            data = json.loads(match.group(1))
            data.setdefault("msg", line.strip())
            return data
        except json.JSONDecodeError:
            return None


def parse_log(log_file: Path) -> dict:
    objects = []
    with log_file.open(encoding="utf-8") as source:
        for raw_line in source:
            obj = parse_line(raw_line)
            if obj and isinstance(obj.get("time"), (int, float)):
                objects.append(obj)

    if not objects:
        raise ValueError(f"No data found in {log_file}")

    start_time = min(obj["time"] for obj in objects)
    end_time = max(obj["time"] for obj in objects)
    result = {
        "log_file": log_file,
        "duration": (end_time - start_time) / 1000,
        "completed": [],
        "rejected": [],
        "evicted": [],
        "threshold": [],
        "inflight": [],
        "percentile_latency": [],
        "minimum_latency": [],
        "average_latency": [],
        "aggregated_latency": [],
        "target_latency": [],
        "throughput": [],
        "timeout": [],
        "phases": [],
        "scenario": None,
        "seed": None,
        "summary": {},
    }

    threshold_fallback = []
    has_explicit_threshold_changes = False

    for obj in objects:
        timestamp = (obj["time"] - start_time) / 1000
        message = str(obj.get("msg", ""))
        event = obj.get("event")
        metadata = obj.get("metadata", {})
        if not isinstance(metadata, dict):
            metadata = {}

        if event == "CONTROLLER_INIT":
            capacity = metadata.get("capacity", {})
            timeout = metadata.get("timeout", {}).get("priorityQueue", {})
            threshold = metadata.get("threshold", {})
            if isinstance(capacity, dict) and isinstance(capacity.get("maxConcurrentRequests"), (int, float)):
                result["inflight"].append((timestamp, float(capacity["maxConcurrentRequests"])))
            if isinstance(timeout, dict) and isinstance(timeout.get("value"), (int, float)):
                result["timeout"].append((timestamp, float(timeout["value"])))
            if isinstance(threshold, dict) and isinstance(threshold.get("initial"), (int, float)):
                result["threshold"].append((timestamp, float(threshold["initial"])))
        elif event == "SCENARIO_START":
            result["scenario"] = metadata.get("scenario")
            result["seed"] = metadata.get("seed")
        elif event == "PHASE_START":
            result["phases"].append((timestamp, metadata.get("phase", "unknown")))
        elif event == "SCENARIO_SUMMARY":
            result["summary"] = metadata
        elif event == "REQUEST_COMPLETED" and isinstance(metadata.get("priority"), (int, float)):
            result["completed"].append((timestamp, int(metadata["priority"])))
        elif event == "REQUEST_REJECTED" and isinstance(metadata.get("priority"), (int, float)):
            result["rejected"].append((timestamp, int(metadata["priority"])))
            if isinstance(metadata.get("threshold"), (int, float)):
                threshold_fallback.append((timestamp, float(metadata["threshold"])))
        elif event == "REQUEST_EVICTED" and isinstance(metadata.get("priority"), (int, float)):
            result["evicted"].append((timestamp, int(metadata["priority"])))
        elif event == "ADMISSION_THRESHOLD":
            result["threshold"].append((timestamp, float(obj["threshold"])))
            has_explicit_threshold_changes |= (
                isinstance(metadata.get("previous"), (int, float))
                or PATTERNS["threshold_mod"].search(message) is not None
            )
        elif event == "QUEUE_TIMEOUT":
            result["timeout"].append((timestamp, float(obj["timeout"])))
        elif event == "LATENCY_TARGET":
            result["target_latency"].append((timestamp, float(obj["targetLatency"])))
        elif event == "LATENCY_RESET":
            result["target_latency"].append((timestamp, float(obj["targetLatency"])))
        elif event == "LATENCY_AGGREGATED":
            value = obj.get("aggregatedLatency")
            result["aggregated_latency"].append((timestamp, math.nan if value is None else float(value)))
        elif event == "CONCURRENCY_BUCKET":
            result["inflight"].append((timestamp, float(obj["inflightLimit"])))
            result["percentile_latency"].append((timestamp, float(obj["percentileLatency"])))
            result["minimum_latency"].append((timestamp, float(obj["minimumLatency"])))
            result["average_latency"].append((timestamp, float(obj["averageLatency"])))
            result["aggregated_latency"].append((timestamp, float(obj["aggregatedLatency"])))
            result["target_latency"].append((timestamp, float(obj["targetLatency"])))
            result["throughput"].append((timestamp, float(obj["throughputPerSecond"])))
        elif event == "CONCURRENCY_LIMIT":
            result["inflight"].append((timestamp, float(obj["inflightLimit"])))
        elif event == "STATISTICS_SNAPSHOT":
            result["percentile_latency"].append((timestamp, float(obj["percentileLatency"])))
            result["minimum_latency"].append((timestamp, float(obj["minimumLatency"])))
            result["average_latency"].append((timestamp, float(obj["averageLatency"])))
            result["throughput"].append((timestamp, float(obj["throughputPerSecond"])))

        if event != "REQUEST_COMPLETED" and (match := PATTERNS["completed"].search(message)):
            result["completed"].append((timestamp, int(match.group(1))))
        if event != "REQUEST_REJECTED" and (match := PATTERNS["rejected"].search(message)):
            result["rejected"].append((timestamp, int(match.group(1))))
            if event != "ADMISSION_THRESHOLD":
                threshold_fallback.append((timestamp, float(match.group(2))))
        if event != "REQUEST_EVICTED" and (match := PATTERNS["evicted"].search(message)):
            result["evicted"].append((timestamp, int(match.group(1))))
        if event != "ADMISSION_THRESHOLD" and (match := PATTERNS["threshold_mod"].search(message)):
            result["threshold"].append((timestamp, float(match.group(2))))
            has_explicit_threshold_changes = True
        if match := PATTERNS["threshold_init"].search(message):
            result["threshold"].insert(0, (timestamp, float(match.group(1))))
        if event not in {"CONCURRENCY_BUCKET", "CONCURRENCY_LIMIT"} and (match := PATTERNS["inflight"].search(message)):
            result["inflight"].append((timestamp, float(match.group(1))))
        if event not in {"LATENCY_TARGET", "LATENCY_RESET"} and (match := PATTERNS["target"].search(message)):
            result["target_latency"].append((timestamp, float(match.group(1))))
        if event != "QUEUE_TIMEOUT" and (match := PATTERNS["timeout"].search(message)):
            result["timeout"].append((timestamp, float(match.group(2))))

    if not has_explicit_threshold_changes:
        result["threshold"].extend(threshold_fallback)

    time_series = (
        "completed", "rejected", "evicted", "threshold", "inflight",
        "percentile_latency", "minimum_latency", "average_latency", "aggregated_latency",
        "target_latency", "throughput", "timeout", "phases",
    )
    for key in time_series:
        result[key].sort(key=lambda item: item[0])
    for key in ("threshold", "inflight", "target_latency", "timeout"):
        result[key] = compact_state_series(result[key])
    return result


def values(sequence: list[tuple[float, float]], index: int) -> list[float]:
    return [item[index] for item in sequence]


def compact_state_series(sequence: list[tuple[float, float]]) -> list[tuple[float, float]]:
    compacted = []
    for timestamp, value in sorted(sequence):
        if compacted and compacted[-1][0] == timestamp:
            compacted[-1] = (timestamp, value)
            if len(compacted) > 1 and compacted[-2][1] == value:
                compacted.pop()
        elif not compacted or compacted[-1][1] != value:
            compacted.append((timestamp, value))
    return compacted


def extended_state_series(
    sequence: list[tuple[float, float]], duration: float
) -> list[tuple[float, float]]:
    extended = compact_state_series(sequence)
    if extended and extended[-1][0] < duration:
        extended.append((duration, extended[-1][1]))
    return extended


def shade_phases(axes, phases: list[tuple[float, str]], duration: float) -> None:
    colors = ("#dceef8", "#f9e4c8")
    for index, (start, name) in enumerate(phases):
        end = phases[index + 1][0] if index + 1 < len(phases) else duration
        for axis in axes:
            axis.axvspan(start, end, color=colors[index % len(colors)], alpha=0.18, zorder=0)
        axes[0].text((start + end) / 2, 1.01, name, ha="center", va="bottom",
                     transform=axes[0].get_xaxis_transform(), fontsize=8)


def render_report(data: dict, output: Path = DEFAULT_IMAGE, show: bool = True) -> None:
    plt.style.use("seaborn-v0_8-muted")
    figure, axes = plt.subplots(4, 1, figsize=(16, 13), sharex=True)
    traffic_axis, concurrency_axis, latency_axis, throughput_axis = axes

    threshold = extended_state_series(data["threshold"], data["duration"])
    if threshold:
        traffic_axis.step(values(threshold, 0), values(threshold, 1), where="post",
                          lw=2, color="#2c3e50", label="Threshold")

    outcome_styles = {
        "completed": ("#27ae60", "."),
        "rejected": ("#e74c3c", "x"),
        "evicted": ("#f39c12", "^"),
    }
    for outcome, (color, marker) in outcome_styles.items():
        sequence = data[outcome]
        if sequence:
            traffic_axis.scatter(values(sequence, 0), values(sequence, 1), s=12, alpha=0.35,
                                 color=color, marker=marker, label=f"{outcome.title()} ({len(sequence)})")
    traffic_axis.set_ylabel("Priority")
    traffic_axis.legend(loc="upper right", ncol=4, fontsize=8)

    if data["inflight"]:
        inflight = extended_state_series(data["inflight"], data["duration"])
        concurrency_axis.step(values(inflight, 0), values(inflight, 1),
                              where="post", color="#8e44ad", label="Inflight limit")
    concurrency_axis.set_ylabel("Concurrency")
    concurrency_axis.legend(loc="upper right", fontsize=8)

    latency_series = (
        ("percentile_latency", "P90", "#c0392b"),
        ("average_latency", "Average", "#8e44ad"),
        ("aggregated_latency", "Filtered P90", "#e67e22"),
        ("minimum_latency", "Minimum", "#16a085"),
    )
    for key, label, color in latency_series:
        if data[key]:
            latency_axis.plot(values(data[key], 0), values(data[key], 1), marker="o", ms=3,
                              color=color, label=label)
    if data["target_latency"]:
        target = extended_state_series(data["target_latency"], data["duration"])
        latency_axis.step(values(target, 0), values(target, 1), where="post", marker="o", ms=3,
                          color="#2980b9", label="Target")
    latency_axis.set_ylabel("Latency (ms)")
    latency_axis.legend(loc="upper right", ncol=4, fontsize=8)

    if data["throughput"]:
        throughput_axis.plot(values(data["throughput"], 0), values(data["throughput"], 1),
                             marker="o", ms=3, color="#27ae60", label="Throughput (req/s)")
    timeout_axis = throughput_axis.twinx()
    if data["timeout"]:
        timeout = extended_state_series(data["timeout"], data["duration"])
        timeout_axis.step(values(timeout, 0), values(timeout, 1), where="post",
                          color="#7f8c8d", label="Queue timeout")
    throughput_axis.set_ylabel("Throughput (req/s)")
    timeout_axis.set_ylabel("Timeout (ms)")
    throughput_axis.set_xlabel("Seconds since start")
    lines = throughput_axis.get_lines() + timeout_axis.get_lines()
    if lines:
        throughput_axis.legend(lines, [line.get_label() for line in lines], loc="upper right", fontsize=8)

    shade_phases(axes, data["phases"], data["duration"])
    for axis in axes:
        axis.grid(True, linestyle="--", alpha=0.35)
        axis.set_xlim(0, max(1, data["duration"]))

    summary = data["summary"]
    total = summary.get("submitted", sum(len(data[key]) for key in outcome_styles))
    failed = summary.get("failed")
    failure_summary = f" - {failed} failed" if isinstance(failed, int) else ""
    scenario = data["scenario"] or "unknown"
    seed = data["seed"] if data["seed"] is not None else "unknown"
    dispatch_lag = summary.get("dispatchLag", {})
    if isinstance(dispatch_lag, dict) and dispatch_lag.get("samples"):
        lag_summary = (
            f" - dispatch lag P95 {dispatch_lag.get('p95Ms', 0):.1f} ms"
            f", max {dispatch_lag.get('maxMs', 0):.1f} ms"
        )
    else:
        lag_summary = ""
    figure.suptitle(
        f"PID traffic control - {scenario} - seed {seed} - {total} requests"
        f"{failure_summary}{lag_summary}",
        fontsize=15,
    )
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    figure.text(0.99, 0.018, f"Log: {data['log_file'].stem}", ha="right", fontsize=8, color="gray")
    figure.text(0.99, 0.005, f"Generated: {generated_at} UTC", ha="right", fontsize=8, color="gray")
    figure.tight_layout(rect=(0, 0.035, 1, 0.97))
    figure.savefig(output, dpi=220, bbox_inches="tight")
    if show:
        plt.show()
    plt.close(figure)


def latest_log(logs_folder: Path = LOGS_FOLDER) -> Path:
    candidates = list(logs_folder.glob("*.log"))
    if not candidates:
        raise FileNotFoundError(f"No logs found in {logs_folder}")
    return max(candidates, key=lambda path: datetime.strptime(
        path.stem.removesuffix("-rust"), DATE_FORMAT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render the latest PID simulation log")
    parser.add_argument("scenario", nargs="?", help="Legacy title hint; scenario metadata is preferred")
    parser.add_argument("--log", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_IMAGE)
    parser.add_argument("--no-show", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data = parse_log(args.log or latest_log())
    if not data["scenario"] and args.scenario:
        data["scenario"] = args.scenario
    render_report(data, args.output, show=not args.no_show)


if __name__ == "__main__":
    main()
