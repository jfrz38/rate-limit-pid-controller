import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scenarios" / "scenario_generator.py"
SPEC = importlib.util.spec_from_file_location("scenario_generator", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {MODULE_PATH}")
scenario_generator = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = scenario_generator
SPEC.loader.exec_module(scenario_generator)


class ScenarioGeneratorTest(unittest.TestCase):
    def test_same_seed_generates_the_same_trace(self):
        first = scenario_generator.generate_requests("base", 42)
        second = scenario_generator.generate_requests("base", 42)

        self.assertEqual(first, second)

    def test_different_seeds_generate_different_traces(self):
        first = scenario_generator.generate_requests("base", 42)
        second = scenario_generator.generate_requests("base", 43)

        self.assertNotEqual(first, second)

    def test_base_uses_global_arrival_rate_and_valid_priorities(self):
        requests = scenario_generator.generate_requests("base", 42)

        self.assertEqual(len(requests), 120 * 12)
        self.assertGreaterEqual(requests[0].arrival_time_ms, 0)
        self.assertLess(requests[-1].arrival_time_ms, 120_000)
        self.assertTrue(all(request.execution_time_ms >= 1 for request in requests))
        self.assertTrue(all(0 <= request.priority_value <= 767 for request in requests))

    def test_adaptive_soak_has_ten_minutes_and_all_expected_phases(self):
        requests = scenario_generator.generate_requests("adaptive_soak_10m", 42)

        self.assertEqual(len(requests), 12_180)
        self.assertLess(requests[-1].arrival_time_ms, 600_000)
        self.assertEqual(
            {request.phase for request in requests},
            {
                "warmup",
                "capacity_discovery",
                "overload",
                "latency_degradation",
                "recovery",
                "cooldown",
            },
        )


if __name__ == "__main__":
    unittest.main()
