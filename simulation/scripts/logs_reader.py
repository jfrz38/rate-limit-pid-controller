from pathlib import Path
from datetime import datetime
import re, json
import matplotlib.pyplot as plt

base = Path(__file__).resolve().parent
logs_folder = base / "nodejs/results/logs"
out_image = base / "nodejs/results/result.png"

date_format = "%Y-%m-%dT%H-%M-%S.%fZ"
log_file = max(logs_folder.glob("*.log"), key=lambda f: datetime.strptime(f.stem, date_format))

R = {
    "completed": r"Completed request with priority (\d+)",
    "rejected": r"Rejected request. Priority (\d+)/(\d+)",
    "evicted": r"Evicted request with priority (\d+)",
    "threshold_mod": r"Threshold modified from (\d+) to: (\d+)",
    "threshold_init": r"Initial threshold: (\d+)",
}

json_extract = re.compile(r'(\{.*\})')

def parse_line(line):
    try:
        return json.loads(line)
    except:
        match = json_extract.search(line)
        if match:
            try:
                data = json.loads(match.group(1))
                data["msg"] = line
                return data
            except: return None
    return None

completed, rejected, evicted, threshold, all_data = [], [], [], [], []

with open(log_file, encoding="utf-8") as f:
    for raw in f:
        obj = parse_line(raw)
        if not obj: continue
        all_data.append(obj)

if not all_data:
    print("No data found")
    exit()

start_ts = all_data[0]["time"]
def rel_t(ts): return (ts - start_ts) / 1000.0
end_ts = all_data[-1]["time"]

for obj in all_data:
    ts = rel_t(obj["time"])
    msg = obj["msg"]

    if m := re.search(R["completed"], msg):
        completed.append((ts, int(m.group(1))))
    
    if m := re.search(R["rejected"], msg):
        rejected.append((ts, int(m.group(1))))
        threshold.append((ts, int(m.group(2))))
        
    if m := re.search(R["evicted"], msg):
        evicted.append((ts, int(m.group(1))))
        
    if m := re.search(R["threshold_mod"], msg):
        threshold.append((ts, int(m.group(2))))
        
    if m := re.search(R["threshold_init"], msg):
        threshold.insert(0, (ts, int(m.group(1))))

def get_t(seq): return [t for t, _ in seq]
def get_v(seq): return [v for _, v in seq]

plt.style.use("seaborn-v0_8-muted")
fig, ax = plt.subplots(figsize=(14, 7))

if threshold:
    threshold.sort() 
    t_ts = get_t(threshold)
    t_vs = get_v(threshold)
    t_ts.append(rel_t(all_data[-1]["time"]))
    t_vs.append(t_vs[-1])
    
    ax.step(t_ts, t_vs, where="post", lw=2, color="#2c3e50", label="Threshold", zorder=3)
    ax.fill_between(t_ts, t_vs, step="post", alpha=0.1, color="#2c3e50")

if completed:
    ax.scatter(get_t(completed), get_v(completed),
               s=25, alpha=0.5, color="#27ae60", label="Completed", zorder=4)

if rejected:
    ax.scatter(get_t(rejected), get_v(rejected),
               s=50, marker="x", color="#e74c3c", label="Rejected", zorder=5)

if evicted:
    ax.scatter(get_t(evicted), get_v(evicted),
               s=40, marker="^", color="#f1c40f", label="Evicted", zorder=4)

ax.set_xlabel("Seconds since start", fontweight="bold")
ax.set_ylabel("Priority / Threshold", fontweight="bold")
ax.set_title(f"PID Traffic Control Analysis\nFile: {log_file.name}", pad=20)

ax.grid(True, which="both", linestyle="--", alpha=0.5)
ax.set_ylim(0, None)

ax.legend(loc='upper center', 
          bbox_to_anchor=(0.5, -0.15), 
          ncol=4, 
          frameon=True, 
          shadow=True,
          borderaxespad=0.)

plt.tight_layout()
plt.savefig(out_image, dpi=300, bbox_inches="tight")
plt.show()
