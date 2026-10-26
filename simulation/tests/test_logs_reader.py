import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "logs_reader.py"
SPEC = importlib.util.spec_from_file_location("logs_reader", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {MODULE_PATH}")
logs_reader = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(logs_reader)


class LogsReaderTest(unittest.TestCase):
    def test_parses_structured_simulation_and_controller_events(self):
        entries = [
            {"time": 1_000, "msg": "Initial threshold: 768"},
            {"time": 1_050, "event": "CONTROLLER_INIT", "metadata": {
                "capacity": {"maxConcurrentRequests": 2},
                "timeout": {"priorityQueue": {"value": 500}},
            }, "msg": "init"},
            {"time": 1_100, "event": "SCENARIO_START", "metadata": {"scenario": "base", "seed": 7}, "msg": "start"},
            {"time": 1_200, "event": "PHASE_START", "metadata": {"phase": "steady"}, "msg": "phase"},
            {"time": 2_000, "event": "ADMISSION_THRESHOLD", "threshold": 400, "msg": "Threshold modified from 768 to: 400"},
            {"time": 3_000, "event": "QUEUE_TIMEOUT", "timeout": 30, "msg": "Updating timeout from 500 to 30"},
            {"time": 4_000, "event": "CONCURRENCY_BUCKET", "snapshotId": 1, "percentileLatency": 80,
             "minimumLatency": 50, "aggregatedLatency": 75, "targetLatency": 60,
             "throughputPerSecond": 20, "inflightLimit": 3, "msg": "bucket"},
            {"time": 5_000, "event": "LATENCY_TARGET", "targetLatency": 55, "msg": "New targetLatency: 55"},
            {"time": 6_000, "event": "SCENARIO_SUMMARY", "metadata": {
                "submitted": 1,
                "completed": 1,
                "dispatchLag": {"samples": 1, "p95Ms": 3, "maxMs": 5},
            }, "msg": "summary"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            log_file = Path(directory) / "test.log"
            log_file.write_text("\n".join(json.dumps(entry) for entry in entries), encoding="utf-8")

            data = logs_reader.parse_log(log_file)
            output = Path(directory) / "report.png"
            logs_reader.render_report(data, output, show=False)
            self.assertTrue(output.is_file())

        self.assertEqual(data["scenario"], "base")
        self.assertEqual(data["seed"], 7)
        self.assertEqual(data["phases"], [(0.2, "steady")])
        self.assertEqual(data["threshold"][-1], (1.0, 400.0))
        self.assertEqual(data["inflight"], [(0.05, 2.0), (3.0, 3.0)])
        self.assertEqual(data["percentile_latency"], [(3.0, 80.0)])
        self.assertEqual(data["throughput"], [(3.0, 20.0)])
        self.assertEqual(data["timeout"], [(0.05, 500.0), (2.0, 30.0)])
        self.assertEqual(data["target_latency"][-1], (4.0, 55.0))
        self.assertEqual(data["summary"]["completed"], 1)
        self.assertEqual(data["summary"]["dispatchLag"]["p95Ms"], 3)

    def test_keeps_legacy_message_parsing(self):
        entries = [
            {"time": 1_000, "msg": "Initial threshold: 768"},
            {"time": 2_000, "msg": "New inflightLimit: 4"},
            {"time": 3_000, "msg": "New targetLatency: 70"},
            {"time": 4_000, "msg": "Updating timeout from 500 to 25"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            log_file = Path(directory) / "legacy.log"
            log_file.write_text("\n".join(json.dumps(entry) for entry in entries), encoding="utf-8")

            data = logs_reader.parse_log(log_file)

        self.assertEqual(data["inflight"], [(1.0, 4.0)])
        self.assertEqual(data["target_latency"], [(2.0, 70.0)])
        self.assertEqual(data["timeout"], [(3.0, 25.0)])

    def test_parses_rust_runner_outcomes_without_duplicating_compatible_messages(self):
        entries = [
            {"time": 1_000, "event": "SCENARIO_START", "metadata": {
                "backend": "rust-wasm", "scenario": "base", "seed": 7,
            }, "msg": "start"},
            {"time": 2_000, "event": "REQUEST_COMPLETED", "metadata": {
                "requestId": 1, "priority": 10,
            }, "msg": "Completed request 1: Priority 10"},
            {"time": 3_000, "event": "REQUEST_REJECTED", "metadata": {
                "requestId": 2, "priority": 500, "threshold": 400,
            }, "msg": "Rejected request 2: Priority 500"},
            {"time": 4_000, "event": "REQUEST_EVICTED", "metadata": {
                "requestId": 3, "priority": 600,
            }, "msg": "Evicted request 3: Priority 600"},
            {"time": 5_000, "event": "CONCURRENCY_LIMIT", "inflightLimit": 3,
             "metadata": {"previous": 2, "current": 3}, "msg": "New inflightLimit: 3"},
            {"time": 6_000, "event": "STATISTICS_SNAPSHOT", "percentileLatency": 90,
             "minimumLatency": 50, "averageLatency": 70, "throughputPerSecond": 20,
             "maxInFlight": 3, "metadata": {"snapshotId": 1}, "msg": "snapshot"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            log_file = Path(directory) / "rust.log"
            log_file.write_text("\n".join(json.dumps(entry) for entry in entries), encoding="utf-8")

            data = logs_reader.parse_log(log_file)

        self.assertEqual(data["completed"], [(1.0, 10)])
        self.assertEqual(data["rejected"], [(2.0, 500)])
        self.assertEqual(data["evicted"], [(3.0, 600)])
        self.assertEqual(data["threshold"], [(2.0, 400.0)])
        self.assertEqual(data["inflight"], [(4.0, 3.0)])
        self.assertEqual(data["percentile_latency"], [(5.0, 90.0)])
        self.assertEqual(data["minimum_latency"], [(5.0, 50.0)])
        self.assertEqual(data["average_latency"], [(5.0, 70.0)])
        self.assertEqual(data["throughput"], [(5.0, 20.0)])

    def test_selects_latest_log_across_typescript_and_rust_names(self):
        with tempfile.TemporaryDirectory() as directory:
            logs = Path(directory)
            older = logs / "2026-01-01T10-00-00.000Z.log"
            newer = logs / "2026-01-01T10-00-01.000Z-rust.log"
            older.touch()
            newer.touch()

            self.assertEqual(logs_reader.latest_log(logs), newer)


if __name__ == "__main__":
    unittest.main()
