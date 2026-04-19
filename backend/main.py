"""
TrafficOS - Lane-Aware Multi-Robot Traffic Control System
FastAPI Backend with WebSocket real-time updates
"""
import asyncio
import json
import math
import random
import uuid
from collections import defaultdict
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="TrafficOS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── WebSocket Manager ─────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, data: dict):
        msg = json.dumps(data)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)

manager = ConnectionManager()

# ─── Map Builder ───────────────────────────────────────────────────────────────
COLS, ROWS = 7, 5
SX, SY, GAP = 70, 60, 108

ROBOT_COLORS = [
    "#E07B54","#5B8DB8","#6BB86F","#B87BA3","#D4A843",
    "#5BB8B0","#B85B6E","#8B8BB8","#B8A55B","#6BB8A5",
    "#E05454","#548BE0","#85B864","#A870A8","#D4C843",
]

def build_map():
    nodes = []
    lanes = []
    grid = []

    for r in range(ROWS):
        row = []
        for c in range(COLS):
            ntype = "normal"
            if r == 0 or r == ROWS - 1:
                ntype = "depot"
            if c == 0 or c == COLS - 1:
                ntype = "charging"
            if r == 2 and c == 3:
                ntype = "intersection"
            node = {
                "id": str(uuid.uuid4()),
                "name": f"N{r}{c}",
                "x": SX + c * GAP,
                "y": SY + r * GAP,
                "node_type": ntype,
            }
            row.append(node)
            nodes.append(node)
        grid.append(row)

    # Horizontal lanes
    for r in range(ROWS):
        for c in range(COLS - 1):
            a, b = grid[r][c], grid[r][c + 1]
            lt, sl, ms, cap = "normal", "normal", 1.0, 2
            if r == 2:
                lt, sl, ms, cap = "intersection", "high", 0.6, 1
            if c == 3:
                lt, sl, ms, cap = "human_zone", "critical", 0.4, 1
            fr, to = (a, b) if r % 2 == 0 else (b, a)
            lanes.append({
                "id": str(uuid.uuid4()), "name": f"H{r}{c}",
                "from_node": fr["id"], "to_node": to["id"],
                "directed": True, "max_speed": ms,
                "safety_level": sl, "lane_type": lt,
                "capacity": cap, "congestion_score": 0.0,
                "historical_usage": 0, "is_reserved": False, "reserved_by": None,
            })

    # Vertical lanes
    for c in range(COLS):
        for r in range(ROWS - 1):
            a, b = grid[r][c], grid[r + 1][c]
            lt, sl, ms, cap = "normal", "normal", 1.0, 2
            if c == 0 or c == COLS - 1:
                lt, sl, ms, cap = "narrow", "high", 0.7, 1
            if c == 3:
                sl, ms = "critical", 0.5
            fr, to = (a, b) if c % 2 == 0 else (b, a)
            lanes.append({
                "id": str(uuid.uuid4()), "name": f"V{c}{r}",
                "from_node": fr["id"], "to_node": to["id"],
                "directed": True, "max_speed": ms,
                "safety_level": sl, "lane_type": lt,
                "capacity": cap, "congestion_score": 0.0,
                "historical_usage": 0, "is_reserved": False, "reserved_by": None,
            })

    # Undirected cross lanes
    for r in range(1, ROWS - 1, 2):
        for c in range(1, COLS - 1, 2):
            a, b = grid[r][c], grid[r][c + 1]
            lanes.append({
                "id": str(uuid.uuid4()), "name": f"X{r}{c}",
                "from_node": a["id"], "to_node": b["id"],
                "directed": False, "max_speed": 0.8,
                "safety_level": "normal", "lane_type": "normal",
                "capacity": 2, "congestion_score": 0.0,
                "historical_usage": 0, "is_reserved": False, "reserved_by": None,
            })

    return nodes, lanes, grid

# ─── Simulation Engine ──────────────────────────────────────────────────────────
class TrafficSimulation:
    def __init__(self):
        self.nodes: dict = {}
        self.lanes: dict = {}
        self.robots: dict = {}
        self.lane_occ: dict[str, set] = {}
        self.reservations: dict[str, str] = {}
        self.heatmap: dict[str, int] = {}
        self.tick = 0
        self.running = False
        self.total_throughput = 0
        self.deadlock_count = 0
        self._task: Optional[asyncio.Task] = None

    def init_map(self, nodes, lanes):
        self.nodes = {n["id"]: n for n in nodes}
        self.lanes = {l["id"]: l for l in lanes}
        self.lane_occ = {l["id"]: set() for l in lanes}
        self.heatmap = {l["id"]: 0 for l in lanes}
        self.reservations = {}

    def spawn_robots(self, count: int):
        self.robots = {}
        node_ids = list(self.nodes.keys())
        used = set()
        for i in range(count):
            tries = 0
            sid = random.choice(node_ids)
            while sid in used and tries < 50:
                sid = random.choice(node_ids)
                tries += 1
            used.add(sid)
            sn = self.nodes[sid]
            rid = str(uuid.uuid4())
            self.robots[rid] = {
                "id": rid, "name": f"R{str(i+1).zfill(2)}",
                "current_node": sid, "goal_node": None,
                "x": float(sn["x"]), "y": float(sn["y"]),
                "color": ROBOT_COLORS[i % len(ROBOT_COLORS)],
                "battery": 80.0 + random.random() * 20,
                "priority": random.randint(1, 3),
                "status": "idle", "speed": 0.0,
                "progress": 0.0, "path_index": 0, "path": [],
                "wait_time": 0.0, "waiting_for_lane": None,
                "total_delay": 0.0, "tasks_completed": 0,
            }

    # A* Pathfinding
    def _heuristic(self, a_id: str, b_id: str) -> float:
        a, b = self.nodes.get(a_id), self.nodes.get(b_id)
        if not a or not b:
            return 1e9
        return math.hypot(a["x"] - b["x"], a["y"] - b["y"])

    def _lane_cost(self, lane: dict, robot_id: str) -> float:
        cost = 1.0 / max(lane["max_speed"], 0.1)
        cost += lane["congestion_score"] * 3
        if lane["lane_type"] == "human_zone":
            cost *= 2
        if lane["lane_type"] == "narrow":
            cost *= 1.5
        if lane["is_reserved"] and lane["reserved_by"] != robot_id:
            cost *= 5
        occ_size = len(self.lane_occ.get(lane["id"], set()))
        if occ_size >= lane.get("capacity", 2):
            cost *= 4
        return cost

    def _neighbors(self, node_id: str):
        for lane in self.lanes.values():
            if lane["from_node"] == node_id:
                yield lane, lane["to_node"]
            elif not lane["directed"] and lane["to_node"] == node_id:
                yield lane, lane["from_node"]

    def find_path(self, start: str, goal: str, robot_id: str):
        if not start or not goal or start == goal:
            return []
        open_set = {start}
        came_from = {}
        g = defaultdict(lambda: 1e9)
        g[start] = 0
        f = defaultdict(lambda: 1e9)
        f[start] = self._heuristic(start, goal)
        iters = 0
        while open_set and iters < 300:
            iters += 1
            cur = min(open_set, key=lambda x: f[x])
            if cur == goal:
                path = []
                while cur in came_from:
                    prev, lane_id = came_from[cur]
                    path.insert(0, {"from": prev, "to": cur, "lane_id": lane_id})
                    cur = prev
                return path
            open_set.discard(cur)
            for lane, nb in self._neighbors(cur):
                tg = g[cur] + self._lane_cost(lane, robot_id)
                if tg < g[nb]:
                    came_from[nb] = (cur, lane["id"])
                    g[nb] = tg
                    f[nb] = tg + self._heuristic(nb, goal)
                    open_set.add(nb)
        return None

    def assign_goal(self, robot_id: str, goal_id: str) -> bool:
        r = self.robots.get(robot_id)
        if not r:
            return False
        r["goal_node"] = goal_id
        path = self.find_path(r["current_node"], goal_id, robot_id)
        if path:
            r["path"] = path
            r["path_index"] = 0
            r["progress"] = 0.0
            r["status"] = "moving"
            return True
        r["status"] = "idle"
        return False

    def assign_random_goal(self, robot_id: str):
        r = self.robots.get(robot_id)
        if not r or len(self.nodes) < 2:
            return
        node_ids = list(self.nodes.keys())
        gid = random.choice(node_ids)
        tries = 0
        while gid == r["current_node"] and tries < 20:
            gid = random.choice(node_ids)
            tries += 1
        self.assign_goal(robot_id, gid)

    def reserve_lane(self, lane_id: str, robot_id: str) -> bool:
        lane = self.lanes.get(lane_id)
        if not lane:
            return False
        if lane["safety_level"] == "critical" or lane["lane_type"] == "intersection":
            if lane["is_reserved"] and lane["reserved_by"] != robot_id:
                return False
            lane["is_reserved"] = True
            lane["reserved_by"] = robot_id
            self.reservations[lane_id] = robot_id
        return True

    def release_lane(self, lane_id: str, robot_id: str):
        lane = self.lanes.get(lane_id)
        if lane and lane.get("reserved_by") == robot_id:
            lane["is_reserved"] = False
            lane["reserved_by"] = None
            self.reservations.pop(lane_id, None)

    def enter_lane(self, lane_id: str, robot_id: str):
        self.lane_occ[lane_id].add(robot_id)
        lane = self.lanes.get(lane_id)
        if lane:
            cap = lane.get("capacity", 2)
            lane["congestion_score"] = min(1.0, len(self.lane_occ[lane_id]) / cap)
            lane["historical_usage"] = lane.get("historical_usage", 0) + 1
            self.heatmap[lane_id] = self.heatmap.get(lane_id, 0) + 1

    def exit_lane(self, lane_id: str, robot_id: str):
        self.lane_occ[lane_id].discard(robot_id)
        lane = self.lanes.get(lane_id)
        if lane:
            cap = lane.get("capacity", 2)
            lane["congestion_score"] = max(0.0, len(self.lane_occ[lane_id]) / cap)
        self.release_lane(lane_id, robot_id)

    def adaptive_speed(self, robot: dict, lane: dict) -> float:
        s = lane.get("max_speed", 1.0)
        sl = lane.get("safety_level", "normal")
        if sl == "critical":
            s *= 0.3
        elif sl == "high":
            s *= 0.5
        elif sl == "low":
            s *= 1.2
        lt = lane.get("lane_type", "normal")
        if lt == "human_zone":
            s *= 0.4
        elif lt == "narrow":
            s *= 0.7
        elif lt == "intersection":
            s *= 0.6
        s *= max(0.1, 1 - lane["congestion_score"] * 0.6)
        if robot.get("battery", 100) < 20:
            s *= 0.5
        return max(0.05, min(s, lane.get("max_speed", 1.0)))

    def step_robot(self, robot: dict, dt: float):
        rid = robot["id"]
        if robot["status"] in ("emergency_stop",):
            return
        if robot["status"] == "idle":
            self.assign_random_goal(rid)
            return
        path = robot.get("path", [])
        pidx = robot.get("path_index", 0)
        if not path or pidx >= len(path):
            self.total_throughput += 1
            robot["tasks_completed"] = robot.get("tasks_completed", 0) + 1
            robot["status"] = "idle"
            return

        step = path[pidx]
        lane = self.lanes.get(step["lane_id"])
        if not lane:
            robot["path_index"] += 1
            return

        # Try reserve before entering
        if robot.get("progress", 0) == 0.0:
            if not self.reserve_lane(step["lane_id"], rid):
                robot["status"] = "waiting"
                robot["waiting_for_lane"] = step["lane_id"]
                robot["wait_time"] = robot.get("wait_time", 0) + dt
                robot["total_delay"] = robot.get("total_delay", 0) + dt
                if robot["wait_time"] > 4.0:
                    robot["wait_time"] = 0
                    robot["waiting_for_lane"] = None
                    robot["status"] = "planning"
                    np = self.find_path(robot["current_node"], robot.get("goal_node"), rid)
                    if np:
                        robot["path"] = np
                        robot["path_index"] = 0
                        robot["progress"] = 0.0
                        robot["status"] = "moving"
                    else:
                        robot["status"] = "idle"
                return
            self.enter_lane(step["lane_id"], rid)
            robot["status"] = "moving"
            robot["waiting_for_lane"] = None
            robot["wait_time"] = 0

        robot["speed"] = self.adaptive_speed(robot, lane)
        fn = self.nodes.get(step["from"])
        tn = self.nodes.get(step["to"])
        if not fn or not tn:
            robot["path_index"] += 1
            return

        ll = max(math.hypot(tn["x"] - fn["x"], tn["y"] - fn["y"]), 1.0)
        robot["progress"] = min(1.0, robot.get("progress", 0) + (robot["speed"] * dt) / ll)
        robot["x"] = fn["x"] + (tn["x"] - fn["x"]) * robot["progress"]
        robot["y"] = fn["y"] + (tn["y"] - fn["y"]) * robot["progress"]
        robot["battery"] = max(0.0, robot.get("battery", 100) - 0.008 * robot["speed"] * dt)

        if robot["battery"] <= 0:
            robot["status"] = "emergency_stop"
            robot["speed"] = 0
            self.exit_lane(step["lane_id"], rid)
            return

        if robot["progress"] >= 1.0:
            self.exit_lane(step["lane_id"], rid)
            robot["current_node"] = step["to"]
            robot["x"] = float(tn["x"])
            robot["y"] = float(tn["y"])
            robot["path_index"] += 1
            robot["progress"] = 0.0

    def detect_deadlocks(self):
        waiting = {
            r["id"]: r["waiting_for_lane"]
            for r in self.robots.values()
            if r["status"] == "waiting" and r.get("waiting_for_lane")
        }
        if len(waiting) < 2:
            return []
        groups = []
        visited = set()
        for start in waiting:
            if start in visited:
                continue
            chain = [start]
            chain_set = {start}
            cur = start
            while True:
                wl = waiting.get(cur)
                if not wl:
                    break
                holder = self.reservations.get(wl)
                if not holder:
                    break
                if holder in chain_set:
                    idx = chain.index(holder)
                    groups.append(chain[idx:])
                    break
                chain.append(holder)
                chain_set.add(holder)
                cur = holder
            for x in chain:
                visited.add(x)
        return groups

    def resolve_deadlock(self, group: list):
        if not group:
            return
        victim_id = min(
            group,
            key=lambda rid: self.robots.get(rid, {}).get("priority", 999),
        )
        r = self.robots.get(victim_id)
        if not r:
            return
        for lane_id, holder in list(self.reservations.items()):
            if holder == victim_id:
                self.release_lane(lane_id, victim_id)
        r["status"] = "planning"
        r["waiting_for_lane"] = None
        r["wait_time"] = 0
        r["total_delay"] = r.get("total_delay", 0) + 2
        self.deadlock_count += 1
        np = self.find_path(r["current_node"], r.get("goal_node"), victim_id)
        if np:
            r["path"] = np
            r["path_index"] = 0
            r["progress"] = 0.0
            r["status"] = "moving"
        else:
            r["status"] = "idle"

    def get_state(self):
        robots_list = list(self.robots.values())
        lanes_list = [
            {**l, "occupancy": len(self.lane_occ.get(l["id"], set())),
             "heat_value": self.heatmap.get(l["id"], 0)}
            for l in self.lanes.values()
        ]
        nodes_list = list(self.nodes.values())
        status_counts = defaultdict(int)
        total_speed = total_delay = battery_sum = 0.0
        active = 0
        for r in robots_list:
            status_counts[r["status"]] += 1
            if r["status"] == "moving":
                total_speed += r["speed"]
                active += 1
            total_delay += r.get("total_delay", 0)
            battery_sum += r.get("battery", 100)
        n = len(robots_list) or 1
        total_cong = sum(l["congestion_score"] for l in self.lanes.values())
        avg_cong = total_cong / max(len(self.lanes), 1)
        max_heat = max(self.heatmap.values(), default=1)
        hot = sorted(
            [{"id": lid, "heat": h, "name": self.lanes[lid]["name"]}
             for lid, h in self.heatmap.items() if h > 0 and lid in self.lanes],
            key=lambda x: -x["heat"],
        )[:5]
        return {
            "type": "state_update",
            "tick": self.tick,
            "running": self.running,
            "robots": robots_list,
            "lanes": lanes_list,
            "nodes": nodes_list,
            "heatmap": dict(self.heatmap),
            "metrics": {
                "total_throughput": self.total_throughput,
                "deadlock_count": self.deadlock_count,
                "avg_speed": round(total_speed / max(active, 1), 3),
                "avg_delay": round(total_delay / n, 2),
                "avg_congestion": round(avg_cong, 3),
                "avg_battery": round(battery_sum / n, 1),
                "active_robots": active,
                "total_robots": len(robots_list),
                "max_heat": max_heat,
                "hot_lanes": hot,
                "status_counts": dict(status_counts),
                "lane_utilization": round(
                    sum(1 for o in self.lane_occ.values() if o) / max(len(self.lanes), 1), 3
                ),
            },
        }

    async def run_loop(self):
        dt = 0.12
        self.running = True
        while self.running:
            self.tick += 1
            for r in list(self.robots.values()):
                self.step_robot(r, dt)
            if self.tick % 15 == 0:
                for g in self.detect_deadlocks():
                    self.resolve_deadlock(g)
            if self.tick % 8 == 0:
                for l in self.lanes.values():
                    l["congestion_score"] = max(0.0, l["congestion_score"] - 0.015)
            if self.tick % 2 == 0:
                await manager.broadcast(self.get_state())
            await asyncio.sleep(0.1)

    def start(self):
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self.run_loop())

    def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
            self._task = None

# ─── Global Simulation Instance ────────────────────────────────────────────────
sim = TrafficSimulation()

@app.on_event("startup")
async def startup():
    nodes, lanes, grid = build_map()
    sim.init_map(nodes, lanes)
    sim.spawn_robots(10)
    sim.start()

# ─── REST API ──────────────────────────────────────────────────────────────────
@app.get("/api/state")
def get_state():
    return sim.get_state()

@app.post("/api/simulation/start")
def start_sim():
    sim.start()
    return {"status": "started"}

@app.post("/api/simulation/stop")
def stop_sim():
    sim.stop()
    return {"status": "stopped"}

@app.post("/api/simulation/reset")
async def reset_sim(body: dict = {}):
    count = body.get("robot_count", 10)
    sim.stop()
    sim.tick = 0
    sim.total_throughput = 0
    sim.deadlock_count = 0
    sim.reservations = {}
    nodes, lanes, grid = build_map()
    sim.init_map(nodes, lanes)
    sim.spawn_robots(count)
    await asyncio.sleep(0.05)
    sim.start()
    return {"status": "reset", "robots": count}

@app.get("/api/robots")
def get_robots():
    return list(sim.robots.values())

@app.get("/api/robots/{robot_id}")
def get_robot(robot_id: str):
    r = sim.robots.get(robot_id)
    if not r:
        return {"error": "not found"}, 404
    return r

@app.post("/api/robots/{robot_id}/emergency-stop")
def emergency_stop(robot_id: str):
    r = sim.robots.get(robot_id)
    if r:
        r["status"] = "emergency_stop"
        r["speed"] = 0.0
    return {"success": bool(r)}

@app.post("/api/robots/{robot_id}/resume")
def resume_robot(robot_id: str):
    r = sim.robots.get(robot_id)
    if not r:
        return {"success": False}
    r["status"] = "planning"
    goal = r.get("goal_node")
    if goal:
        sim.assign_goal(robot_id, goal)
    else:
        sim.assign_random_goal(robot_id)
    return {"success": True}

@app.get("/api/lanes")
def get_lanes():
    return [
        {**l, "occupancy": len(sim.lane_occ.get(l["id"], set())),
         "heat_value": sim.heatmap.get(l["id"], 0)}
        for l in sim.lanes.values()
    ]

@app.get("/api/metrics")
def get_metrics():
    return sim.get_state()["metrics"]

@app.get("/api/heatmap")
def get_heatmap():
    return sim.heatmap

# ─── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        await ws.send_text(json.dumps({**sim.get_state(), "type": "init"}))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
