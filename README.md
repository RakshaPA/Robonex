# Robonex

A real-time warehouse traffic management system that coordinates multiple autonomous robots across a structured grid — handling pathfinding, congestion, deadlocks, and lane safety all at once.

---

## What it does

Robonex simulates a warehouse where anywhere from 6 to 15 robots navigate simultaneously. Each robot finds its own path using A* with lane-cost awareness, respects lane reservations at intersections, adapts its speed based on congestion and battery, and automatically recovers from deadlocks. Everything is streamed live to a React dashboard over WebSocket at 10Hz.

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | Python 3.10+ · FastAPI · WebSocket · Uvicorn |
| Frontend | React 18 · HTML Canvas · Recharts |
| Database | PostgreSQL *(optional — schema included)* |
| Protocol | REST API + WebSocket |

---

## Project Structure

```
Robonex/
│
├── backend/
│   ├── main.py              # FastAPI server + simulation engine
│   ├── requirements.txt
│   ├── schema.sql           # PostgreSQL schema (optional)
│   ├── check.py             # Pre-flight health checker
│   └── .env.example
│
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.js
│       ├── App.js
│       ├── hooks/
│       │   └── useSimulation.js
│       └── components/
│           ├── SimulationCanvas.js
│           ├── MetricsPanel.js
│           ├── RobotPanel.js
│           ├── LanePanel.js
│           └── AnalyticsPanel.js
│
├── start.sh
└── README.md
```

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 16+ and npm

### 1. Run the health check
```bash
cd backend
python check.py
```
This verifies your Python version, installed packages, port availability, Node.js, and project files before you start anything.

### 2. Start the backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```

- API → `http://localhost:8000`
- Swagger docs → `http://localhost:8000/docs`
- WebSocket → `ws://localhost:8000/ws`

### 3. Start the frontend
```bash
cd frontend
npm install
npm start
```

- App → `http://localhost:3000`

### One-command startup (Linux/Mac)
```bash
bash start.sh
```

---

## The Warehouse Map

A **7 × 5 grid** — 35 nodes connected by ~75 lanes.

| Node Type    | Colour | Description |
|--------------|--------|-------------|
| Depot        | 🔵 Blue | Spawn and delivery points (top/bottom rows) |
| Charging     | 🟡 Yellow ⚡ | Battery stations (left/right edges) |
| Intersection | 🟢 Green | Controlled junctions with traffic signals |
| Normal       | ⚫ Grey | Standard waypoints |

| Lane Type    | Colour | Speed | Capacity |
|--------------|--------|-------|----------|
| Normal       | Blue   | 1.0 u/s | 2 robots |
| Narrow       | Orange | 0.7 u/s | 1 robot |
| Intersection | Green  | 0.6 u/s | 1 robot |
| Human Zone   | Red    | 0.4 u/s | 1 robot |

---

## Core Algorithms

### A* Pathfinding

Each lane gets a cost based on its type, current congestion, and whether it's already reserved:

```
lane_cost = (1 / max_speed)
          + (congestion × 3)
          + (2×  if human_zone)
          + (1.5× if narrow)
          + (5×  if reserved by another robot)
          + (4×  if lane at full capacity)
          + (∞   if blocked)
```

### Adaptive Speed Control

Robots don't all move at the same speed — they adjust based on battery, lane type, and surrounding congestion:

```
effective_speed = base_speed
                × safety_mult    [critical=0.3, high=0.5, low=1.2]
                × lane_type_mult [human_zone=0.4, narrow=0.7, intersection=0.6]
                × (1 − congestion × 0.6)
                × 0.5  (if battery < 20%)
```

### Lane Reservation

Critical and intersection lanes require an exclusive reservation before a robot enters. If denied, the robot waits up to 5 seconds, then replans a path around that lane.

### Traffic Signals

Intersection lanes alternate between **H-GREEN** and **V-GREEN** every 40 ticks. A red-signal lane costs 1,000,000 in the pathfinder — robots wait or reroute automatically.

### Deadlock Detection

A wait-graph is rebuilt every 15 ticks. If a cycle is found, it's a deadlock. The lowest-priority robot in the cycle gets preempted and forced to replan.

### Near-Miss Detection

Every 5 ticks, any two active robots within 22px of each other are flagged. Both flash red on the canvas and the near-miss counter increments.

### Task Queue

Tasks have priorities 1–3 and are assigned from a priority queue. Idle robots pick up the highest-priority available task. The queue auto-refills when it runs low.

---

## Dashboard

### Header Controls

| Control | Description |
|---------|-------------|
| **Monitor / Robots / Lanes / Analytics** | Switch views |
| **● LIVE** | Green = connected, Red = disconnected |
| **H-GREEN / V-GREEN** | Current signal phase with progress bar |
| **0.25× 0.5× 1× 2× 4×** | Simulation speed |
| **Robots: N ▾** | Set robot count (6–15), applies on Reset |
| **🚧 Block Lane** | Click lane midpoints on the canvas to block/unblock |
| **🎯 Set Goal** | Click a robot then a node to manually route it |
| **Clear Blocks** | Remove all blocked lanes |
| **↺ Reset** | Restart the simulation |
| **⏸ / ▶** | Pause or resume |
| **🌙 / ☀️** | Dark/light mode |

### Monitor Tab
Live canvas with robots, lane heatmap, and signal glows. Shows throughput, deadlocks, avg speed, avg delay, a robot status pie chart, network congestion, speed history, hottest lanes, and fleet battery.

### Robots Tab
Full robot list with speed, battery, and status. Click any robot for a detail panel — tasks completed, delay, priority, path steps. Emergency stop and resume controls per robot.

### Lanes Tab
Lane type breakdown, active reservations, per-lane congestion bars, and speed policy reference.

### Analytics Tab
Historical charts updated live: speed and congestion trends, active vs waiting robots, fleet battery, near-miss events, task queue status, active assignments, and recently completed tasks.

---

## Interacting with the Simulation

### Blocking a Lane
1. Click **Block Lane** — a yellow banner appears
2. Click the midpoint of any lane on the canvas
3. The lane turns red with ✕ — all robots reroute instantly
4. Click the same lane again to unblock
5. **Clear Blocks** removes everything at once

### Manual Goal Assignment
1. Click **Set Goal** — a blue banner appears
2. Click a robot on the canvas
3. Click a destination node
4. The robot replans and navigates there immediately

### Heatmap
Toggle the **Heatmap** switch to overlay lane usage intensity. Blue is low traffic, orange and red are heavily used. The top 5 hottest lanes are listed below the canvas. Resets with the simulation.

---

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/state` | Full simulation state |
| POST | `/api/simulation/start` | Start |
| POST | `/api/simulation/stop` | Pause |
| POST | `/api/simulation/reset` | Reset `{"robot_count": 10}` |
| POST | `/api/simulation/speed` | Set speed `{"multiplier": 2.0}` |
| GET | `/api/robots` | All robots |
| POST | `/api/robots/{id}/emergency-stop` | Emergency stop |
| POST | `/api/robots/{id}/resume` | Resume |
| POST | `/api/robots/{id}/goal` | Route `{"goal_node_id": "..."}` |
| GET | `/api/lanes` | All lanes with live data |
| POST | `/api/lanes/{id}/block` | Toggle block |
| POST | `/api/lanes/unblock-all` | Clear all blocks |
| GET | `/api/tasks` | Task queue |
| POST | `/api/tasks/add` | Add task `{"priority": 2}` |
| GET | `/api/metrics` | Current metrics |
| GET | `/api/metrics/history` | History (last 120 snapshots) |
| GET | `/api/heatmap` | Lane heatmap data |

### WebSocket — `ws://localhost:8000/ws`

| Event | Trigger | Payload |
|-------|---------|---------|
| `init` | On connect | Full state |
| `state_update` | Every 200ms | robots, lanes, heatmap, metrics, near_miss_ids, signal_phase, task_summary, metrics_history |

---

## Metrics

| Metric | Description |
|--------|-------------|
| Throughput | Total tasks completed |
| Deadlocks | Total deadlocks detected and resolved |
| Avg Speed | Mean speed of actively moving robots |
| Avg Delay | Mean extra wait vs optimal route |
| Congestion | Average lane congestion (0–100%) |
| Battery | Fleet average battery % |
| Lane Utilization | % of lanes with active robots |
| Near Misses | Robots currently in proximity alert |

---

## Environment Config

Copy `backend/.env.example` → `backend/.env` and adjust as needed:

```env
HOST=0.0.0.0
PORT=8000
DEFAULT_ROBOT_COUNT=10
SIM_TICK_RATE_MS=100
MAX_WAIT_BEFORE_REPLAN=5.0
NEAR_MISS_DISTANCE=22.0
SIGNAL_PHASE_TICKS=40
```

---

*Robonex — Built for the Lane-Aware Multi-Robot Traffic Control Hackathon*
