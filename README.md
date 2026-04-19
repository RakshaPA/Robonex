# Robonex — Lane-Aware Multi-Robot Traffic Control System

> A real-time warehouse traffic management platform for coordinating multiple autonomous robots with lane-based rules, dynamic congestion, deadlock resolution, and live analytics.

---

## Overview

Robonex simulates a structured warehouse environment where 6–15 robots navigate simultaneously using:
- **A\* pathfinding** with lane-cost awareness
- **Lane reservation** for intersection safety
- **Deadlock detection** with automatic resolution
- **Adaptive speed control** per lane type and congestion
- **Real-time WebSocket** state sync at 10Hz

---

## 🏗️ Tech Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | Python 3.10+ · FastAPI · WebSocket · Uvicorn |
| Frontend | React 18 · HTML Canvas · Recharts |
| Database | PostgreSQL *(optional — schema included)* |
| Protocol | REST API + WebSocket real-time |

---

## 📁 Project Structure

```
Robonex/
│
├── backend/
│   ├── main.py              # FastAPI server + full simulation engine
│   ├── requirements.txt     # Python dependencies
│   ├── schema.sql           # PostgreSQL schema (optional persistence)
│   ├── check.py             # Pre-flight health checker
│   └── .env.example         # Environment config template
│
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.js
│       ├── App.js                          # Main layout · tabs · header
│       ├── hooks/
│       │   └── useSimulation.js            # WebSocket + REST hook
│       └── components/
│           ├── SimulationCanvas.js         # Canvas renderer
│           ├── MetricsPanel.js             # KPIs · charts · battery
│           ├── RobotPanel.js               # Robot list · detail · controls
│           ├── LanePanel.js                # Lane types · congestion
│           └── AnalyticsPanel.js           # Historical charts · task queue
│
├── start.sh                 # One-command startup (Linux/Mac)
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10 or higher
- Node.js 16 or higher + npm

### Step 1 — Health check
```bash
cd backend
python check.py
```

### Step 2 — Start backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```
- Backend → `http://localhost:8000`
- Swagger API docs → `http://localhost:8000/docs`
- WebSocket → `ws://localhost:8000/ws`

### Step 3 — Start frontend
```bash
cd frontend
npm install
npm start
```
- App → `http://localhost:3000`

### One-command (Linux/Mac)
```bash
bash start.sh
```

---

## 🗺️ Warehouse Map

A **7 × 5 grid** — 35 nodes, ~75 lanes.

| Node Type    | Colour  | Description |
|--------------|---------|-------------|
| Depot        | 🔵 Blue  | Spawn & delivery points (top/bottom rows) |
| Charging     | 🟡 Yellow ⚡ | Battery stations (left/right edges) |
| Intersection | 🟢 Green | Controlled junction with traffic signals |
| Normal       | ⚫ Grey  | Standard waypoints |

| Lane Type    | Colour | Speed | Capacity |
|--------------|--------|-------|----------|
| Normal       | Blue   | 1.0 u/s | 2 robots |
| Narrow       | Orange | 0.7 u/s | 1 robot  |
| Intersection | Green  | 0.6 u/s | 1 robot  |
| Human Zone   | Red    | 0.4 u/s | 1 robot  |

---

## 🧠 Core Algorithms

### A\* Pathfinding
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
```
effective_speed = base_speed
                × safety_mult    [critical=0.3, high=0.5, low=1.2]
                × lane_type_mult [human_zone=0.4, narrow=0.7, intersection=0.6]
                × (1 − congestion × 0.6)
                × 0.5  (if battery < 20%)
```

### Lane Reservation
Critical and intersection lanes require exclusive reservation before entry. If denied, robot waits up to 5 seconds then replans around the lane.

### Traffic Signals
Intersection lanes alternate **H-GREEN ↔ V-GREEN** every 40 ticks. Red-signal lanes cost 1,000,000 — robots wait or reroute.

### Deadlock Detection
Builds a wait-graph every 15 ticks. Cycles = deadlock. Lowest-priority robot in the cycle is preempted and forced to replan.

### Near-Miss Detection
Every 5 ticks, robots within **22px** of each other are flagged — both flash red on canvas, ⚠️ counter increments.

### Task Queue
Priority queue (1–3) of from→to delivery tasks. Idle robots pick the highest-priority task. Task queue auto-refills when low.

---

## 🎮 Feature Guide

### Header Controls

| Control | Description |
|---------|-------------|
| **Monitor / Robots / Lanes / Analytics** | Switch dashboard views |
| **● LIVE** | Green = connected, Red = disconnected |
| **H-GREEN / V-GREEN + progress bar** | Current traffic signal phase |
| **0.25× 0.5× 1× 2× 4×** | Simulation speed multiplier |
| **Robots: N ▾** | Select robot count (6–15), applies on Reset |
| **🚧 Block Lane** | Toggle block mode → click lane midpoints to block/unblock |
| **🎯 Set Goal** | Toggle goal mode → click robot then click destination node |
| **Clear Blocks** | Remove all blocked lanes instantly |
| **↺ Reset** | Restart simulation |
| **⏸ Pause / ▶ Start** | Pause or resume |
| **🌙 / ☀️** | Dark / light mode toggle |

---

### Monitor Tab
Main live dashboard:
- Canvas with robots, lanes, heatmap, signal glows
- **Throughput, Deadlocks, Avg Speed, Avg Delay** cards
- Robot Status pie chart
- Network Congestion bar
- Speed History chart
- 🔥 Hottest Lanes
- Fleet Battery visual

---

### Robots Tab
- Full robot list: name, speed, battery, status badge
- Click any robot → detail panel shows: speed, battery %, tasks completed, delay, priority, path steps
- **⛔ Emergency Stop** — freezes robot immediately
- **▶ Resume** — robot replans and continues

---

### Lanes Tab
- Lane type count cards
- 🔒 Active reservations list
- Per-lane congestion bars (green → orange → red)
- Speed policy reference

---

### Analytics Tab
Historical charts updated live:
- Speed & Congestion dual line chart
- Active vs Waiting robots area chart
- Fleet Battery % trend
- Near-Miss Events bar chart
- Task Queue: queued / active / completed counts
- Active task assignments with priority indicators
- Recently completed task log

---

### Block Lane Mode
1. Click **🚧 Block Lane** → yellow banner appears
2. Click the **midpoint** of any lane on canvas
3. Lane turns red with ✕ → all robots instantly reroute
4. Click same lane again to unblock
5. **Clear Blocks** removes all at once
6. **Exit Block** leaves the mode

---

### Manual Goal Assignment
1. Click **🎯 Set Goal** → blue banner appears
2. Click a **robot** on canvas
3. Click a **node circle** on canvas
4. Robot immediately replans and navigates there

---

### Near-Miss Flash
- Fully automatic
- Two active robots within 22px → both flash red
- **⚠️ N NEAR MISS** badge pulses in bottom bar
- Analytics tab tracks frequency over time

---

### Traffic Signals
- Automatic, runs in background
- Intersection lanes glow green or red depending on phase
- Small coloured dot on each intersection node shows live state
- H-GREEN = horizontal open, vertical wait
- V-GREEN = vertical open, horizontal wait

---

### Heatmap
- Toggle with **Heatmap** switch
- Blue = cool / rarely used
- Orange → Red = hot / heavily used
- Hottest Lanes list shows top 5
- Resets on simulation reset

---

### Dark Mode
- Click 🌙 for dark theme
- Click ☀️ for light theme
- Canvas, panels, charts, badges all adapt

---

## 🔌 REST API Reference

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

### WebSocket `ws://localhost:8000/ws`

| Event | Trigger | Payload |
|-------|---------|---------|
| `init` | On connect | Full state |
| `state_update` | Every 200ms | robots, lanes, heatmap, metrics, near_miss_ids, signal_phase, task_summary, metrics_history |

---

## 📊 Metrics Reference

| Metric | What it measures |
|--------|-----------------|
| Throughput | Total tasks completed |
| Deadlocks | Total deadlocks detected and resolved |
| Avg Speed | Mean speed of actively moving robots |
| Avg Delay | Mean extra wait time vs optimal route |
| Congestion | Average lane congestion (0–100%) |
| Battery | Fleet average battery % |
| Lane Utilization | % of lanes with active robots |
| Near Misses | Robots currently in proximity alert |

---

## 🎬 Video Demo Script (5–10 min)

1. **Intro** — Warehouse map, node types, lane colours
2. **Speed demo** — 0.25× slow motion → 4× fast forward → back to 1×
3. **Heatmap** — Toggle, explain blue→red intensity
4. **Traffic signals** — Point to H-GREEN indicator, show intersection glow switching
5. **Scale up** — Change to 15 robots, reset, show crowded warehouse
6. **Block a lane** — Block mode, click a busy lane, watch robots reroute
7. **Near-miss** — Point out red flashing robots and ⚠️ badge
8. **Manual route** — Set Goal, route a robot to a depot
9. **Analytics tab** — Speed/congestion charts, task queue, battery trend
10. **Robots tab** — Emergency stop one robot, resume it
11. **Deadlock explain** — Show the algorithm in the code (wait-graph cycles)
12. **Dark mode** — Toggle for a polished finish

---

## ⚙️ Environment Config

Copy `backend/.env.example` → `backend/.env`:

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

## 🧪 Pre-flight Check

```bash
cd backend
python check.py
```

Verifies: Python version · packages · port availability · all project files · Node.js · PostgreSQL (optional)

---

*Robonex — Built for the Lane-Aware Multi-Robot Traffic Control Hackathon*