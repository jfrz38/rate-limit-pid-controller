import csv
import os
import numpy as np
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
results_dir = os.path.join(script_dir, "./generated")
os.makedirs(results_dir, exist_ok=True)

def generate_request(scenario, num_requests):
    if scenario == "aggressive_peak":
        execution_mu, execution_sigma = 0.2, 0.05
        sleep_mu, sleep_sigma = 0.1, 0.05
        priorities = np.random.choice([0,1,2,3,4,5], size=num_requests, p=[0.05,0.05,0.1,0.2,0.3,0.3])
    elif scenario == "base":
        execution_mu, execution_sigma = 0.5, 0.1
        sleep_mu, sleep_sigma = 0.5, 0.1
        priorities = np.random.choice([0,1,2,3,4,5], size=num_requests, p=[0.05,0.1,0.15,0.2,0.25,0.25])
    elif scenario == "high_latency":
        execution_mu, execution_sigma = 1.2, 0.1
        sleep_mu, sleep_sigma = 0.5, 0.2
        priorities = np.random.choice([0,1,2,3,4,5], size=num_requests, p=[0.05,0.05,0.1,0.3,0.25,0.25])
    elif scenario == "high_volume":
        execution_mu, execution_sigma = 0.5, 0.1
        sleep_mu, sleep_sigma = 0.2, 0.05
        priorities = np.random.choice([0,1,2,3,4,5], size=num_requests, p=[0.05,0.05,0.1,0.2,0.25,0.35])
    elif scenario == "low_latency":
        execution_mu, execution_sigma = 0.8, 0.05
        sleep_mu, sleep_sigma = 0.5, 0.1
        priorities = np.random.choice([0,1,2,3,4,5], size=num_requests, p=[0.1,0.1,0.15,0.2,0.25,0.2])
    elif scenario == "stress":
        execution_mu, execution_sigma = 0.8, 0.2
        sleep_mu, sleep_sigma = 0.1, 0.05
        priorities = np.random.choice([0,1,2,3,4,5], size=num_requests, p=[0.05,0.05,0.1,0.2,0.3,0.3])
    elif scenario == "priority_spike":
        execution_mu, execution_sigma = 0.3, 0.1
        sleep_mu, sleep_sigma = 0.2, 0.05
        priorities = np.random.choice([0,1,2,3,4,5], size=num_requests, p=[0.2,0.2,0.2,0.15,0.15,0.1])
    else:
        raise ValueError("Unknown scenario")
    
    execution_times = np.random.normal(execution_mu, execution_sigma, num_requests)
    sleep_times = np.random.normal(sleep_mu, sleep_sigma, num_requests)

    execution_times = np.clip(execution_times, 0, None)
    sleep_times = np.clip(sleep_times, 0, None)

    return execution_times, sleep_times, priorities

def generate_csv(scenario, num_requests):
    filepath = os.path.join(results_dir, f"{scenario}.csv")
    with open(filepath, mode="w", newline="") as csvfile:
        fieldnames = ["requestId", "priority", "executionTime", "sleepTime"]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        execution_times, sleep_times, priorities = generate_request(scenario, num_requests)
        for i in range(0, num_requests):
            writer.writerow({
                "requestId": i + 1,
                "executionTime": execution_times[i],
                "sleepTime": sleep_times[i],
                "priority": priorities[i]
            })
    print(f"CSV generated: {filepath}")

scenarios = {
    "aggressive_peak": 10000,
    "base": 10000,
    "high_latency": 10000,
    "high_volume": 10000,
    "low_latency": 10000,
    "stress": 50000,
    "priority_spike": 5000
}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_scenario = sys.argv[1]
        
        if target_scenario in scenarios:
            generate_csv(target_scenario, scenarios[target_scenario])
        else:
            print(f"Error: Scenario '{target_scenario}' is not defined in config.")
            sys.exit(1)
    else:
        print("No scenario specified. Generating all scenarios...")
        for scenario, num_requests in scenarios.items():
            generate_csv(scenario, num_requests)

