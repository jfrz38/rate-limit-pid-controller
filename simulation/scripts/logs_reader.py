from pathlib import Path
from datetime import datetime
import re, json
import matplotlib.pyplot as plt
from datetime import datetime

base_folder = Path(__file__).resolve().parent
logs_folder = base_folder / "nodejs/results/logs"
images_folder = base_folder / "nodejs/results/result.png"

date_format = "%Y-%m-%dT%H-%M-%S.%fZ"
log_file = max(
    logs_folder.glob("*.log"),
    key=lambda f: datetime.strptime(f.stem, date_format)
)

with open(log_file, "r", encoding="utf-8") as f:
    log_data = f.read()

completed_request_regex = r"Completed request with priority (\d+)"
max_concurrent_request_regex = r"Max concurrent requests updated to: (\d+)"
new_inflight_limit_regex = r"New inflightLimit:  (\d+)"
updating_timeout_regex = r"Updating timeout from (\d+) to (\d+)"
rejected_request_regex = r"Request rejected due to low priority: Priority: (\d+) over threshold: (\d+)"
threshold_modified_regex = r"Threshold modified from (\d+) to: (\d+)"
initial_threshold_regex = r"Initial threshold: (\d+)"
evicted_request_regex = r"Evicted request with priority (\d+)"
target_latency_regex = r"New targetLatency: (\d+)"

completed_requests = []
max_concurrent_requests = []
new_inflights_limit = []
updating_timeouts = []
rejected_requests = []
threshold_modified = []
evicted_requests = []
target_latencies = []

lines = log_data.split("\n")
object_data = [json.loads(line) for line in lines if line.strip()]
for line in object_data:
    timestamp = line["time"]
    message = line["msg"]

    m = re.search(completed_request_regex, message)
    if m: 
        priority = int(m.group(1));
        completed_requests.append({"timestamp": timestamp, "priority": priority})

    m = re.search(max_concurrent_request_regex, message)
    if m: 
        concurrent_requests = int(m.group(1))
        max_concurrent_requests.append({"timestamp": timestamp, "current_value": concurrent_requests})

    m = re.search(new_inflight_limit_regex, message)
    if m: 
        inflight_limit = int(m.group(1))
        new_inflights_limit.append({"timestamp": timestamp, "inflight_limit": inflight_limit})

    m = re.search(updating_timeout_regex, message)
    if m: 
        old_timeout = int(m.group(1))
        new_timeout = int(m.group(2))
        updating_timeouts.append({"timestamp": timestamp, "old_timeout": old_timeout, "new_timeout": new_timeout})

    m = re.search(rejected_request_regex, message)
    if m: 
        current_priority = int(m.group(1))
        current_threshold = int(m.group(2))
        rejected_requests.append({ "timestamp": timestamp, "priority": current_priority })
        threshold_modified.append({"timestamp": timestamp, "threshold": current_threshold})

    m = re.search(threshold_modified_regex, message)
    if m:
        last_threshold = int(m.group(1))
        new_threshold = int(m.group(1))
        threshold_modified.append({"timestamp": timestamp, "last_threshold": last_threshold, "threshold": new_threshold})

    m = re.search(initial_threshold_regex, message)
    if m:
        threshold = int(m.group(1))
        threshold_modified.insert(0, {"timestamp": timestamp, "threshold": threshold})
    
    m = re.search(evicted_request_regex, message)
    if m:
        priority = int(m.group(1))
        evicted_requests.append({"timestamp": timestamp, "priority": priority})

    m = re.search(target_latency_regex, message)
    if m:
        target_latency = (m.group(1))
        target_latencies.append({"timestamp": timestamp, "target_latency": target_latency})

rejected_requests_timestamps = [datetime.fromtimestamp(d["timestamp"]/1000) for d in rejected_requests]
rejected_requests_values = [d["priority"] for d in rejected_requests]  # first_value
completed_requests_timestamps = [datetime.fromtimestamp(d["timestamp"]/1000) for d in completed_requests]
completed_requests_values = [d["priority"] for d in completed_requests]
threshold_modified_timestamps = [datetime.fromtimestamp(d["timestamp"]/1000) for d in threshold_modified]
threshold_modified_values = [d["threshold"] for d in threshold_modified]
evicted_requests_timestamps = [datetime.fromtimestamp(d["timestamp"]/1000) for d in evicted_requests]
evicted_requests_values = [d["priority"] for d in evicted_requests]
target_latency_timestamps = [datetime.fromtimestamp(d["timestamp"]/1000) for d in target_latencies]
target_latency_values = [d["target_latency"] for d in target_latencies]

latest_timestamp = max(
    t for t in [
        rejected_requests_timestamps[-1] if rejected_requests_timestamps else None,
        completed_requests_timestamps[-1] if completed_requests_timestamps else None,
        threshold_modified_timestamps[-1] if threshold_modified_timestamps else None,
        evicted_requests_timestamps[-1] if evicted_requests_timestamps else None,
        target_latency_timestamps[-1] if target_latency_timestamps else None,
    ]
    if t is not None
)
latest_threshold = threshold_modified_values[-1]
threshold_modified_timestamps.append(latest_timestamp)
threshold_modified_values.append(latest_threshold)

plt.figure(figsize=(10,5))
plt.scatter(rejected_requests_timestamps, rejected_requests_values, color="red", label="Rejected")
plt.scatter(completed_requests_timestamps, completed_requests_values, color="green", label="Completed")
plt.scatter(evicted_requests_timestamps, evicted_requests_values, color="yellow", label="Evicted")
plt.plot(threshold_modified_timestamps, threshold_modified_values, color="blue", label="Threshold")
# plt.plot(target_latency_timestamps, target_latency_values, color="purple", label="Target latency")


plt.xlabel("Time")
plt.ylabel("Priority")
plt.title("Rejected by priority")
plt.xticks(rotation=45)
plt.tight_layout()

max_threshold = max(threshold_modified_values)

if max_threshold != None:
    plt.yticks(range(0, max_threshold + 100, 100)) 

plt.savefig(images_folder, dpi=300)
plt.show()
