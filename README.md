# 🤖 TrafficOS — Lane-Aware Multi-Robot Traffic Control System

A full-stack hackathon project implementing multi-robot coordination with
lane reservations, A* pathfinding, deadlock detection, and a live heatmap dashboard.

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | Python 3.11 + FastAPI + WebSocket |
| Frontend | React 18 + Recharts + HTML Canvas |
| Database | PostgreSQL (optional — schema in `backend/schema.sql`) |

---

## Project Structure

```
trafficos/
├── backend/
│   ├── main.py            ← FastAPI server + simulation engine
│   ├── requirements.txt   ← Python dependencies
│   └── schema.sql         ← PostgreSQL schema (optional)
│
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js                     ← Main app layout & tabs
│   │   ├── index.js                   ← React entry point
│   │   ├── hooks/
│   │   │   └── useSimulation.js       ← WebSocket + REST hook
│   │   └── components/
│   │       ├── SimulationCanvas.js    ← Canvas renderer (robots, lanes, heatmap)
│   │       ├── MetricsPanel.js        ← KPIs, charts, battery
│   │       ├── RobotPanel.js          ← Robot list & controls
│   │       └── LanePanel.js           ← Lane types & congestion
│   └── package.json
│
├── start.sh               ← One-command startup
└── README.md
```

---

## Quick Start

### Step 1 — Backend (Python)

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
# → Server at http://localhost:8000
# → WebSocket at ws://localhost:8000/ws
# → API docs at http://localhost:8000/docs
```

### Step 2 — Frontend (React)

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm start
# → App at http://localhost:3000
```

Or use the one-command script:

```bash
bash start.sh
```

---

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/state` | Full simulation state |
| POST | `/api/simulation/start` | Start simulation |
| POST | `/api/simulation/stop` | Pause simulation |
| POST | `/api/simulation/reset` | Reset with new map `{"robot_count": 10}` |
| GET | `/api/robots` | List all robots |
| GET | `/api/robots/{id}` | Get robot details |
| POST | `/api/robots/{id}/emergency-stop` | Emergency stop a robot |
| POST | `/api/robots/{id}/resume` | Resume a stopped robot |
| GET | `/api/lanes` | List all lanes with live data |
| GET | `/api/heatmap` | Lane usage heatmap |
| GET | `/api/metrics` | Performance metrics |

### WebSocket

Connect to `ws://localhost:8000/ws`

Events received:
- `init` — Full initial state on connect
- `state_update` — Sent every 200ms with robots, lanes, metrics, heatmap

---

## Core Algorithms

### A* Pathfinding with Lane Costs

```
lane_cost = (1 / max_speed)
          + (congestion_score × 3)
          + (human_zone penalty × 2)
          + (narrow lane penalty × 1.5)
          + (reservation penalty × 5 if reserved by other)
          + (capacity penalty × 4 if lane is full)
```

### Deadlock Detection

Builds a wait-graph where each waiting robot points to the lane it needs,
and that lane points to the robot holding it. Cycles in this graph = deadlocks.
Resolution: preempt the lowest-priority robot in the cycle and force it to reroute.

### Adaptive Speed Control

```
effective_speed = base_max_speed
                × safety_multiplier    (critical=0.3, high=0.5, low=1.2)
                × lane_type_multiplier (human_zone=0.4, narrow=0.7, intersection=0.6)
                × (1 - congestion × 0.6)
                × battery_factor       (0.5 if battery < 20%)
```

### Lane Reservation

Critical safety lanes and intersections require exclusive reservation before entry.
If reservation is denied, robot waits up to 4 seconds then dynamically replans.

---

## Warehouse Map

- **7 × 5 grid** = 35 nodes, ~75 lanes
- **Depot nodes** (top/bottom): spawn & goal points
- **Charging nodes** (left/right edges): battery indicators
- **Intersection node** (center): critical reservation zone
- **Human zones**: column 3 lanes — lowest speed, critical safety
- **Narrow lanes**: edge columns — reduced capacity
- **Alternating flow**: rows alternate left-right / right-left

---

## Evaluation Metrics

| Metric | Where to find |
|--------|--------------|
| Deadlocks resolved | Metrics panel → Deadlocks card |
| Average speed | Metrics panel → Speed History chart |
| Lane utilization | Lanes tab → Congestion bars |
| Throughput | Bottom status bar → Throughput |
| Fleet battery | Metrics panel → Fleet Battery |
| Hot lanes | Metrics panel → 🔥 Hottest Lanes |

---

## Video Demo Script (5–10 min)

1. **Intro** — Show the warehouse map, explain node types and lane colors
2. **Live sim** — Start with 10 robots, show them navigating
3. **Heatmap** — Toggle heatmap, explain usage intensity
4. **Robot inspect** — Click a robot, show speed/battery/path/delay
5. **Emergency stop** — Stop a robot, show the ring, resume it
6. **Congestion** — Increase to 15 robots, show congestion bars turn red
7. **Deadlock** — Explain the wait graph cycle detection
8. **Lanes tab** — Show reservation panel, speed policies
9. **Metrics** — Walk through all KPIs
10. **Reset** — Reset with different robot count, show fresh simulation
