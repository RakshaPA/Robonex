import asyncio
import json
import math
import random
import time
import uuid
from collections import defaultdict, deque
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

# ─── WebSocket Manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        msg = json.dumps(data, default=str)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self.active:
                self.active.remove(ws)

manager = ConnectionManager()

# ─── Map Builder ──────────────────────────────────────────────────────────────
COLS, ROWS = 7, 5
SX, SY, GAP = 70, 60, 108
ROBOT_COLORS = [
    "#E07B54","#5B8DB8","#6BB86F","#B87BA3","#D4A843",
    "#5BB8B0","#B85B6E","#8B8BB8","#B8A55B","#6BB8A5",
    "#E05454","#548BE0","#85B864","#A870A8","#D4C843",
]

def build_map():
    nodes, lanes, grid = [], [], []
    for r in range(ROWS):
        row = []
        for c in range(COLS):
            ntype = "normal"
            if r == 0 or r == ROWS - 1: ntype = "depot"
            if c == 0 or c == COLS - 1: ntype = "charging"
            if r == 2 and c == 3:       ntype = "intersection"
            node = {"id": str(uuid.uuid4()), "name": f"N{r}{c}",
                    "x": SX + c * GAP, "y": SY + r * GAP, "node_type": ntype}
            row.append(node); nodes.append(node)
        grid.append(row)

    # Horizontal lanes
    for r in range(ROWS):
        for c in range(COLS - 1):
            a, b = grid[r][c], grid[r][c + 1]
            lt, sl, ms, cap = "normal", "normal", 1.0, 2
            if r == 2: lt, sl, ms, cap = "intersection", "high", 0.6, 1
            if c == 3: lt, sl, ms, cap = "human_zone", "critical", 0.4, 1
            fr, to = (a, b) if r % 2 == 0 else (b, a)
            lanes.append({"id": str(uuid.uuid4()), "name": f"H{r}{c}",
                          "from_node": fr["id"], "to_node": to["id"],
                          "directed": True, "max_speed": ms, "safety_level": sl,
                          "lane_type": lt, "capacity": cap, "congestion_score": 0.0,
                          "historical_usage": 0, "is_reserved": False, "reserved_by": None,
                          "is_blocked": False, "signal_state": "green"})

    # Vertical lanes
    for c in range(COLS):
        for r in range(ROWS - 1):
            a, b = grid[r][c], grid[r + 1][c]
            lt, sl, ms, cap = "normal", "normal", 1.0, 2
            if c == 0 or c == COLS - 1: lt, sl, ms, cap = "narrow", "high", 0.7, 1
            if c == 3: sl, ms = "critical", 0.5
            fr, to = (a, b) if c % 2 == 0 else (b, a)
            lanes.append({"id": str(uuid.uuid4()), "name": f"V{c}{r}",
                          "from_node": fr["id"], "to_node": to["id"],
                          "directed": True, "max_speed": ms, "safety_level": sl,
                          "lane_type": lt, "capacity": cap, "congestion_score": 0.0,
                          "historical_usage": 0, "is_reserved": False, "reserved_by": None,
                          "is_blocked": False, "signal_state": "green"})

    # Undirected cross lanes
    for r in range(1, ROWS - 1, 2):
        for c in range(1, COLS - 1, 2):
            a, b = grid[r][c], grid[r][c + 1]
            lanes.append({"id": str(uuid.uuid4()), "name": f"X{r}{c}",
                          "from_node": a["id"], "to_node": b["id"],
                          "directed": False, "max_speed": 0.8, "safety_level": "normal",
                          "lane_type": "normal", "capacity": 2, "congestion_score": 0.0,
                          "historical_usage": 0, "is_reserved": False, "reserved_by": None,
                          "is_blocked": False, "signal_state": "green"})
    return nodes, lanes, grid


# ─── Task Queue ───────────────────────────────────────────────────────────────
class TaskQueue:
    def __init__(self):
        self.tasks: deque = deque()
        self.active: dict[str, dict] = {}
        self.completed: list[dict] = []

    def add_task(self, from_node: str, to_node: str, priority: int = 1) -> dict:
        task = {"id": str(uuid.uuid4()), "from_node": from_node, "to_node": to_node,
                "priority": priority, "status": "queued",
                "created_at": time.time(), "assigned_to": None, "completed_at": None}
        task_list = list(self.tasks)
        inserted = False
        for i, t in enumerate(task_list):
            if priority > t["priority"]:
                task_list.insert(i, task); inserted = True; break
        if not inserted: task_list.append(task)
        self.tasks = deque(task_list)
        return task

    def assign_next(self, robot_id: str) -> Optional[dict]:
        if not self.tasks: return None
        task = self.tasks.popleft()
        task["status"] = "active"; task["assigned_to"] = robot_id
        self.active[robot_id] = task
        return task

    def complete_task(self, robot_id: str):
        task = self.active.pop(robot_id, None)
        if task:
            task["status"] = "completed"; task["completed_at"] = time.time()
            self.completed.append(task)
            if len(self.completed) > 50: self.completed.pop(0)

    def get_summary(self) -> dict:
        return {"queued": len(self.tasks), "active": len(self.active),
                "completed": len(self.completed),
                "tasks_list": list(self.tasks)[:10],
                "active_tasks": list(self.active.values()),
                "recent_completed": self.completed[-5:]}


# ─── Traffic Signal Controller ────────────────────────────────────────────────
class SignalController:
    def __init__(self, phase_ticks: int = 40):
        self.phase_ticks = phase_ticks
        self.current_phase = 0
        self.tick_in_phase = 0
        self.h_lanes: list[str] = []
        self.v_lanes: list[str] = []

    def register_lanes(self, lanes: list[dict]):
        self.h_lanes = [l["id"] for l in lanes if l["lane_type"] == "intersection" and l["name"].startswith("H")]
        self.v_lanes = [l["id"] for l in lanes if l["lane_type"] == "intersection" and l["name"].startswith("V")]

    def tick(self, lanes: dict):
        self.tick_in_phase += 1
        if self.tick_in_phase >= self.phase_ticks:
            self.tick_in_phase = 0
            self.current_phase = 1 - self.current_phase
        green_ids = set(self.h_lanes if self.current_phase == 0 else self.v_lanes)
        red_ids   = set(self.v_lanes if self.current_phase == 0 else self.h_lanes)
        for lid, lane in lanes.items():
            if lid in green_ids:   lane["signal_state"] = "green"
            elif lid in red_ids:   lane["signal_state"] = "red"

    def phase_progress(self) -> float:
        return self.tick_in_phase / max(self.phase_ticks, 1)


# ─── Near-Miss Detection ──────────────────────────────────────────────────────
NEAR_MISS_DISTANCE = 22.0

def detect_near_misses(robots: dict) -> list[str]:
    robot_list = [r for r in robots.values() if r["status"] not in ("idle", "emergency_stop")]
    flagged = set()
    for i, a in enumerate(robot_list):
        for b in robot_list[i + 1:]:
            if math.hypot(a["x"] - b["x"], a["y"] - b["y"]) < NEAR_MISS_DISTANCE:
                flagged.add(a["id"]); flagged.add(b["id"])
    return list(flagged)


# ─── Simulation Engine ────────────────────────────────────────────────────────
class TrafficSimulation:
    def __init__(self):
        self.nodes: dict = {}; self.lanes: dict = {}
        self.robots: dict = {}; self.lane_occ: dict = {}
        self.reservations: dict = {}; self.heatmap: dict = {}
        self.tick = 0; self.running = False; self.paused = False
        self._keep_running = False
        self.speed_multiplier = 1.0
        self.total_throughput = 0; self.deadlock_count = 0
        self.near_miss_ids: list[str] = []
        self.metrics_history: deque = deque(maxlen=120)
        self.task_queue = TaskQueue()
        self.signal_ctrl = SignalController(phase_ticks=40)
        self._task: Optional[asyncio.Task] = None
        self.goal_reached: list[dict] = []


    def init_map(self, nodes, lanes):
        self.nodes = {n["id"]: n for n in nodes}
        self.lanes = {l["id"]: l for l in lanes}
        self.lane_occ = {l["id"]: set() for l in lanes}
        self.heatmap  = {l["id"]: 0 for l in lanes}
        self.reservations = {}
        self.signal_ctrl.register_lanes(lanes)
        self._seed_tasks(10)

    def _seed_tasks(self, count: int):
        node_ids = list(self.nodes.keys())
        if len(node_ids) < 2: return
        for _ in range(count):
            a, b = random.sample(node_ids, 2)
            self.task_queue.add_task(a, b, priority=random.randint(1, 3))

    def spawn_robots(self, count: int):
        self.robots = {}
        node_ids = list(self.nodes.keys()); used = set()
        for i in range(count):
            sid = random.choice(node_ids); tries = 0
            while sid in used and tries < 50: sid = random.choice(node_ids); tries += 1
            used.add(sid); sn = self.nodes[sid]; rid = str(uuid.uuid4())
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
                "near_miss": False, "current_task_id": None,
            }

    def _heuristic(self, a_id: str, b_id: str) -> float:
        a, b = self.nodes.get(a_id), self.nodes.get(b_id)
        if not a or not b: return 1e9
        return math.hypot(a["x"] - b["x"], a["y"] - b["y"])

    def _lane_cost(self, lane: dict, robot_id: str) -> float:
        if lane.get("is_blocked"):             return 1e9
        if lane.get("signal_state") == "red":  return 1e6
        cost = 1.0 / max(lane["max_speed"], 0.1)
        cost += lane["congestion_score"] * 3
        if lane["lane_type"] == "human_zone": cost *= 2
        if lane["lane_type"] == "narrow":     cost *= 1.5
        if lane.get("is_reserved") and lane.get("reserved_by") != robot_id: cost *= 5
        if len(self.lane_occ.get(lane["id"], set())) >= lane.get("capacity", 2): cost *= 4
        return cost

    def _neighbors(self, node_id: str):
        for lane in self.lanes.values():
            if lane.get("is_blocked"): continue
            if lane["from_node"] == node_id:                          yield lane, lane["to_node"]
            elif not lane["directed"] and lane["to_node"] == node_id: yield lane, lane["from_node"]

    def find_path(self, start: str, goal: str, robot_id: str):
        if not start or not goal or start == goal: return []
        open_set = {start}; came_from: dict = {}
        g = defaultdict(lambda: 1e9); g[start] = 0
        f = defaultdict(lambda: 1e9); f[start] = self._heuristic(start, goal)
        iters = 0
        while open_set and iters < 400:
            iters += 1
            cur = min(open_set, key=lambda x: f[x])
            if cur == goal:
                path = []
                while cur in came_from:
                    prev, lid = came_from[cur]; path.insert(0, {"from": prev, "to": cur, "lane_id": lid}); cur = prev
                return path
            open_set.discard(cur)
            for lane, nb in self._neighbors(cur):
                tg = g[cur] + self._lane_cost(lane, robot_id)
                if tg < g[nb]:
                    came_from[nb] = (cur, lane["id"]); g[nb] = tg
                    f[nb] = tg + self._heuristic(nb, goal); open_set.add(nb)
        return None

    def assign_goal(self, robot_id: str, goal_id: str) -> bool:
        r = self.robots.get(robot_id)
        if not r: return False
        r["goal_node"] = goal_id
        path = self.find_path(r["current_node"], goal_id, robot_id)
        if path:
            r["path"] = path; r["path_index"] = 0; r["progress"] = 0.0; r["status"] = "moving"
            return True
        r["status"] = "idle"; return False

    def assign_task(self, robot_id: str):
        r = self.robots.get(robot_id)
        if not r: return
        task = self.task_queue.assign_next(robot_id)
        if task:
            r["current_task_id"] = task["id"]
            if r["current_node"] != task["from_node"]: self.assign_goal(robot_id, task["from_node"])
            else:                                       self.assign_goal(robot_id, task["to_node"])
        else:
            self._random_goal(robot_id)

    def _random_goal(self, robot_id: str):
        r = self.robots.get(robot_id)
        if not r or len(self.nodes) < 2: return
        node_ids = list(self.nodes.keys())
        gid, tries = random.choice(node_ids), 0
        while gid == r["current_node"] and tries < 20: gid = random.choice(node_ids); tries += 1
        self.assign_goal(robot_id, gid)

    def reserve_lane(self, lid: str, rid: str) -> bool:
        lane = self.lanes.get(lid)
        if not lane or lane.get("is_blocked"): return False
        if lane.get("signal_state") == "red":  return False
        # Capacity check for all lane types
        occupants = self.lane_occ.get(lid, set())
        cap = lane.get("capacity", 2)
        if len(occupants) >= cap and rid not in occupants:
            return False
        # Reservation for critical / intersection lanes
        if lane["safety_level"] == "critical" or lane["lane_type"] == "intersection":
            if lane["is_reserved"] and lane["reserved_by"] != rid: return False
            lane["is_reserved"] = True; lane["reserved_by"] = rid; self.reservations[lid] = rid
        return True

    def release_lane(self, lid: str, rid: str):
        lane = self.lanes.get(lid)
        if lane and lane.get("reserved_by") == rid:
            lane["is_reserved"] = False; lane["reserved_by"] = None; self.reservations.pop(lid, None)

    def enter_lane(self, lid: str, rid: str):
        self.lane_occ[lid].add(rid)
        lane = self.lanes.get(lid)
        if lane:
            lane["congestion_score"] = min(1.0, len(self.lane_occ[lid]) / lane.get("capacity", 2))
            lane["historical_usage"] = lane.get("historical_usage", 0) + 1
            self.heatmap[lid] = self.heatmap.get(lid, 0) + 1

    def exit_lane(self, lid: str, rid: str):
        self.lane_occ[lid].discard(rid)
        lane = self.lanes.get(lid)
        if lane: lane["congestion_score"] = max(0.0, len(self.lane_occ[lid]) / lane.get("capacity", 2))
        self.release_lane(lid, rid)

    def adaptive_speed(self, robot: dict, lane: dict) -> float:
        # Base speed scaled by lane type (lane_length ~108px, need ~1.0+ to cross in ~5 ticks)
        s = lane.get("max_speed", 1.0) * 3.0  # Scale up so robots visibly move
        # Safety-level nudge only — do not double-penalise lane_type
        sl = lane.get("safety_level", "normal")
        if sl == "critical":  s *= 0.85
        elif sl == "high":    s *= 0.92
        elif sl == "low":     s *= 1.10
        # Congestion slowdown: still keeps robots moving at ≥40% speed
        s *= max(0.40, 1.0 - lane["congestion_score"] * 0.50)
        # Low battery conservation
        if robot.get("battery", 100) < 20:
            s *= 0.60
        return max(0.5, min(s, lane.get("max_speed", 1.0) * 3.0))

    def step_robot(self, robot: dict, dt: float):
        rid = robot["id"]
        if robot["status"] == "emergency_stop": return
        if robot["status"] == "idle": self.assign_task(rid); return

        path = robot.get("path", []); pidx = robot.get("path_index", 0)
        if not path or pidx >= len(path):
            # Check if goal reached
            if robot.get("goal_node") and robot["current_node"] == robot["goal_node"]:
                self.goal_reached.append({"robot_id": rid, "node_id": robot["goal_node"], "tick": self.tick})
                robot["goal_node"] = None  # Clear goal after reaching
            task = self.task_queue.active.get(rid)
            if task:
                if robot["current_node"] == task["from_node"]:
                    # First leg done — now move to actual destination
                    self.assign_goal(rid, task["to_node"]); return
                else:
                    # Task fully complete
                    self.task_queue.complete_task(rid)
                    robot["current_task_id"] = None
                    robot["tasks_completed"] = robot.get("tasks_completed", 0) + 1
                    self.total_throughput += 1
            else:
                # Random-goal completed (no task attached)
                robot["tasks_completed"] = robot.get("tasks_completed", 0) + 1
                self.total_throughput += 1
            robot["status"] = "idle"; return

        # ── FIX: guard against empty-path on a freshly-planned robot ──
        if not path:
            robot["status"] = "idle"; return

        step = path[pidx]
        lane = self.lanes.get(step["lane_id"])
        if not lane or lane.get("is_blocked"):
            robot["status"] = "planning"
            np = self.find_path(robot["current_node"], robot.get("goal_node"), rid)
            if np: robot["path"] = np; robot["path_index"] = 0; robot["progress"] = 0.0; robot["status"] = "moving"
            else:  robot["status"] = "idle"
            return

        if robot.get("progress", 0.0) == 0.0:
            if not self.reserve_lane(step["lane_id"], rid):
                robot["status"] = "waiting"; robot["waiting_for_lane"] = step["lane_id"]
                robot["wait_time"] = robot.get("wait_time", 0) + dt
                robot["total_delay"] = robot.get("total_delay", 0) + dt
                if robot["wait_time"] > 5.0:
                    robot["wait_time"] = 0; robot["waiting_for_lane"] = None; robot["status"] = "planning"
                    np = self.find_path(robot["current_node"], robot.get("goal_node"), rid)
                    if np: robot["path"] = np; robot["path_index"] = 0; robot["progress"] = 0.0; robot["status"] = "moving"
                    else:  robot["status"] = "idle"
                return
            self.enter_lane(step["lane_id"], rid)
            robot["status"] = "moving"; robot["waiting_for_lane"] = None; robot["wait_time"] = 0

        robot["speed"] = self.adaptive_speed(robot, lane)
        fn = self.nodes.get(step["from"]); tn = self.nodes.get(step["to"])
        if not fn or not tn: robot["path_index"] += 1; return

        ll = max(math.hypot(tn["x"] - fn["x"], tn["y"] - fn["y"]), 1.0)
        robot["progress"] = min(1.0, robot.get("progress", 0) + (robot["speed"] * dt) / ll)
        robot["x"] = fn["x"] + (tn["x"] - fn["x"]) * robot["progress"]
        robot["y"] = fn["y"] + (tn["y"] - fn["y"]) * robot["progress"]
        # Reduced battery drain so robots don't die too quickly
        robot["battery"] = max(0.0, robot.get("battery", 100) - 0.0008 * robot["speed"] * dt)

        if robot["battery"] <= 0:
            robot["status"] = "emergency_stop"; robot["speed"] = 0.0
            self.exit_lane(step["lane_id"], rid); return

        if robot["progress"] >= 1.0:
            self.exit_lane(step["lane_id"], rid)
            robot["current_node"] = step["to"]; robot["x"] = float(tn["x"]); robot["y"] = float(tn["y"])
            robot["path_index"] += 1; robot["progress"] = 0.0
            # Recharge at charging nodes
            node = self.nodes.get(step["to"])
            if node and node.get("node_type") == "charging":
                robot["battery"] = min(100.0, robot.get("battery", 0) + 25.0)
                if robot.get("status") == "emergency_stop":
                    robot["status"] = "idle"

    def detect_deadlocks(self):
        waiting = {r["id"]: r["waiting_for_lane"] for r in self.robots.values()
                   if r["status"] == "waiting" and r.get("waiting_for_lane")}
        if len(waiting) < 2: return []
        groups, visited = [], set()
        for start in waiting:
            if start in visited: continue
            chain, chain_set, cur = [start], {start}, start
            while True:
                wl = waiting.get(cur)
                if not wl: break
                holder = self.reservations.get(wl)
                if not holder: break
                if holder in chain_set: groups.append(chain[chain.index(holder):]); break
                chain.append(holder); chain_set.add(holder); cur = holder
            for x in chain: visited.add(x)
        return groups

    def resolve_deadlock(self, group: list):
        if not group: return
        victim = min(group, key=lambda rid: self.robots.get(rid, {}).get("priority", 999))
        r = self.robots.get(victim)
        if not r: return
        for lid, holder in list(self.reservations.items()):
            if holder == victim: self.release_lane(lid, victim)
        r["status"] = "planning"; r["waiting_for_lane"] = None; r["wait_time"] = 0
        r["total_delay"] = r.get("total_delay", 0) + 2; self.deadlock_count += 1
        np = self.find_path(r["current_node"], r.get("goal_node"), victim)
        if np: r["path"] = np; r["path_index"] = 0; r["progress"] = 0.0; r["status"] = "moving"
        else:  r["status"] = "idle"

    def _snapshot_metrics(self):
        robots = list(self.robots.values()); n = max(len(robots), 1)
        moving = [r for r in robots if r["status"] == "moving"]
        self.metrics_history.append({
            "tick": self.tick,
            "avg_speed": round(sum(r["speed"] for r in moving) / max(len(moving), 1), 3),
            "throughput": self.total_throughput,
            "deadlocks": self.deadlock_count,
            "avg_congestion": round(sum(l["congestion_score"] for l in self.lanes.values()) / max(len(self.lanes), 1), 3),
            "active_robots": len(moving),
            "waiting_robots": sum(1 for r in robots if r["status"] == "waiting"),
            "avg_battery": round(sum(r.get("battery", 100) for r in robots) / n, 1),
            "near_misses": len(self.near_miss_ids),
        })

    def get_state(self):
        robots = list(self.robots.values())
        lanes  = [{**l, "occupancy": len(self.lane_occ.get(l["id"], set())),
                   "heat_value": self.heatmap.get(l["id"], 0)} for l in self.lanes.values()]
        n = max(len(robots), 1); sc = defaultdict(int)
        total_speed = total_delay = batt_sum = 0.0; active = 0
        for r in robots:
            sc[r["status"]] += 1
            if r["status"] == "moving": total_speed += r["speed"]; active += 1
            total_delay += r.get("total_delay", 0); batt_sum += r.get("battery", 100)
        avg_cong = sum(l["congestion_score"] for l in self.lanes.values()) / max(len(self.lanes), 1)
        max_heat = max(self.heatmap.values(), default=1)
        hot = sorted([{"id": lid, "heat": h, "name": self.lanes[lid]["name"]}
                      for lid, h in self.heatmap.items() if h > 0 and lid in self.lanes],
                     key=lambda x: -x["heat"])[:5]
        goal_reached_copy = self.goal_reached.copy()
        self.goal_reached.clear()
        return {
            "type": "state_update", "tick": self.tick, "running": self.running,
            "speed_multiplier": self.speed_multiplier,
            "robots": robots, "lanes": lanes, "nodes": list(self.nodes.values()),
            "heatmap": dict(self.heatmap), "near_miss_ids": self.near_miss_ids,
            "signal_phase": self.signal_ctrl.current_phase,
            "signal_progress": round(self.signal_ctrl.phase_progress(), 2),
            "task_summary": self.task_queue.get_summary(),
            "metrics_history": list(self.metrics_history)[-60:],
            "goal_reached": goal_reached_copy,
            "metrics": {
                "total_throughput": self.total_throughput, "deadlock_count": self.deadlock_count,
                "avg_speed": round(total_speed / max(active, 1), 3),
                "avg_delay": round(total_delay / n, 2), "avg_congestion": round(avg_cong, 3),
                "avg_battery": round(batt_sum / n, 1), "active_robots": active,
                "total_robots": len(robots), "max_heat": max_heat, "hot_lanes": hot,
                "status_counts": dict(sc), "near_miss_count": len(self.near_miss_ids),
                "lane_utilization": round(sum(1 for o in self.lane_occ.values() if o) / max(len(self.lanes), 1), 3),
            },
        }


    async def run_loop(self):
        self.running = True
        self.paused  = False
        base_dt = 0.35  # Increased for visible robot movement
        while self._keep_running:
            if self.paused:
                await asyncio.sleep(0.1)
                continue
            self.running = True
            self.tick += 1
            dt = base_dt * self.speed_multiplier
            self.signal_ctrl.tick(self.lanes)
            for r in list(self.robots.values()): self.step_robot(r, dt)
            if self.tick % 5  == 0: self.near_miss_ids = detect_near_misses(self.robots)
            if self.tick % 10 == 0:
                for g in self.detect_deadlocks(): self.resolve_deadlock(g)
            if self.tick % 6  == 0:
                for l in self.lanes.values(): l["congestion_score"] = max(0.0, l["congestion_score"] - 0.015)
            if self.tick % 5 == 0: self._snapshot_metrics()  # Snapshot every 5 ticks for analytics
            if len(self.task_queue.tasks) < 5: self._seed_tasks(5)
            await manager.broadcast(self.get_state())
            await asyncio.sleep(0.05)  # Fixed 50ms = ~20 ticks/sec
        self.running = False

    def start(self):
        """Start or resume the simulation loop."""
        if self._task and not self._task.done():
            # Loop already running — just unpause
            self.paused = False
            self.running = True
            return
        # Fresh start
        self._keep_running = True
        self.paused = False
        self._task = asyncio.create_task(self.run_loop())

    def pause(self):
        """Pause without killing the loop task."""
        self.paused  = True
        self.running = False

    def stop(self):
        """Full stop — kills the loop (used only on reset)."""
        self._keep_running = False
        self.paused  = False
        self.running = False
        if self._task:
            self._task.cancel()
            self._task = None


sim = TrafficSimulation()

@app.on_event("startup")
async def startup():
    nodes, lanes, grid = build_map()
    sim.init_map(nodes, lanes)
    sim.spawn_robots(10)
    # Pre-assign goals so robots start moving on tick 1, not waiting for idle→assign_task
    for rid in list(sim.robots.keys()):
        sim.assign_task(rid)
    sim.start()

# ── REST API ──────────────────────────────────────────────────────────────────
@app.get("/api/state")
def get_state(): return sim.get_state()

@app.post("/api/simulation/start")
async def start_sim(): 
    sim.start()
    await manager.broadcast(sim.get_state())
    return {"status": "started", "running": True}

@app.post("/api/simulation/stop")
async def stop_sim(): 
    sim.pause()
    await manager.broadcast(sim.get_state())
    return {"status": "paused", "running": False}

@app.post("/api/simulation/reset")
async def reset_sim(body: dict = {}):
    count = body.get("robot_count", 10)
    sim.stop()   # full kill for reset
    sim.tick = 0; sim.total_throughput = 0; sim.deadlock_count = 0
    sim.near_miss_ids = []; sim.reservations = {}
    sim.goal_reached.clear(); sim.metrics_history.clear(); sim.task_queue = TaskQueue()
    sim.signal_ctrl = SignalController(phase_ticks=40)
    nodes, lanes, grid = build_map()
    sim.init_map(nodes, lanes); sim.spawn_robots(count)
    # Give the event loop a couple of cycles to process the task cancellation
    # Pre-assign goals so robots move immediately after reset
    for rid in list(sim.robots.keys()):
        sim.assign_task(rid)
    await asyncio.sleep(0.15); sim.start()
    await manager.broadcast(sim.get_state())
    return {"status": "reset", "robots": count}

@app.post("/api/simulation/speed")
def set_speed(body: dict = {}):
    mult = max(0.25, min(4.0, float(body.get("multiplier", 1.0))))
    sim.speed_multiplier = mult; return {"speed_multiplier": mult}

@app.get("/api/robots")
def get_robots(): return list(sim.robots.values())

@app.get("/api/robots/{robot_id}")
def get_robot(robot_id: str):
    r = sim.robots.get(robot_id); return r if r else {"error": "not found"}

@app.post("/api/robots/{robot_id}/emergency-stop")
def emergency_stop(robot_id: str):
    r = sim.robots.get(robot_id)
    if r: r["status"] = "emergency_stop"; r["speed"] = 0.0
    return {"success": bool(r)}

@app.post("/api/robots/{robot_id}/resume")
def resume_robot(robot_id: str):
    r = sim.robots.get(robot_id)
    if not r: return {"success": False}
    r["status"] = "planning"
    sim.assign_goal(robot_id, r.get("goal_node")) if r.get("goal_node") else sim.assign_task(robot_id)
    return {"success": True}

@app.post("/api/robots/{robot_id}/goal")
def set_robot_goal(robot_id: str, body: dict = {}):
    goal_id = body.get("goal_node_id")
    if not goal_id: return {"success": False, "error": "goal_node_id required"}
    return {"success": sim.assign_goal(robot_id, goal_id)}

@app.get("/api/lanes")
def get_lanes():
    return [{**l, "occupancy": len(sim.lane_occ.get(l["id"], set())),
             "heat_value": sim.heatmap.get(l["id"], 0)} for l in sim.lanes.values()]

@app.post("/api/lanes/{lane_id}/block")
def block_lane(lane_id: str):
    lane = sim.lanes.get(lane_id)
    if not lane: return {"success": False, "error": "Lane not found"}
    lane["is_blocked"] = not lane.get("is_blocked", False)
    for r in sim.robots.values():
        if r.get("status") in ("moving", "waiting"):
            path = r.get("path", [])
            pidx = r.get("path_index", 0)
            if path and pidx < len(path) and path[pidx].get("lane_id") == lane_id:
                r["status"] = "planning"
                np = sim.find_path(r["current_node"], r.get("goal_node"), r["id"])
                if np: r["path"] = np; r["path_index"] = 0; r["progress"] = 0.0; r["status"] = "moving"
    return {"success": True, "is_blocked": lane["is_blocked"], "lane_id": lane_id}

@app.post("/api/lanes/unblock-all")
def unblock_all():
    for lane in sim.lanes.values(): lane["is_blocked"] = False
    return {"success": True}

@app.get("/api/tasks")
def get_tasks(): return sim.task_queue.get_summary()

@app.post("/api/tasks/add")
def add_task(body: dict = {}):
    node_ids = list(sim.nodes.keys())
    if len(node_ids) < 2: return {"success": False}
    a = body.get("from_node") or random.choice(node_ids)
    b = body.get("to_node")   or random.choice(node_ids)
    task = sim.task_queue.add_task(a, b, int(body.get("priority", 1)))
    return {"success": True, "task": task}

@app.get("/api/metrics")
def get_metrics(): return sim.get_state()["metrics"]

@app.get("/api/metrics/history")
def get_metrics_history(): return list(sim.metrics_history)

@app.get("/api/heatmap")
def get_heatmap(): return sim.heatmap

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        await ws.send_text(json.dumps({**sim.get_state(), "type": "init"}, default=str))
        while True: await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)