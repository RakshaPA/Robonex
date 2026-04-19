import { useState, useEffect, useRef, useCallback } from 'react';

const BASE_URL = 'http://localhost:8000';
const WS_URL   = 'ws://localhost:8000/ws';

const DEFAULT_STATE = {
  robots: [], lanes: [], nodes: [], heatmap: {},
  metrics: {
    total_throughput: 0, deadlock_count: 0, avg_speed: 0,
    avg_delay: 0, avg_congestion: 0, avg_battery: 100,
    active_robots: 0, total_robots: 0, max_heat: 1,
    hot_lanes: [], status_counts: {}, near_miss_count: 0,
    lane_utilization: 0,
  },
  running: false, tick: 0, connected: false,
  speed_multiplier: 1.0, near_miss_ids: [],
  signal_phase: 0, signal_progress: 0,
  task_summary: { queued: 0, active: 0, completed: 0, tasks_list: [], active_tasks: [], recent_completed: [] },
  metrics_history: [],
};

export function useSimulation() {
  const [state, setState] = useState(DEFAULT_STATE);
  const wsRef      = useRef(null);
  const reconnRef  = useRef(null);
  const mountedRef = useRef(true);

  // ── WebSocket connection ──────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setState(s => ({ ...s, connected: true }));
      clearTimeout(reconnRef.current);
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(e.data);
        // Normalize lanes: backend sends extra fields (occupancy, heat_value) - keep them
        const lanes = Array.isArray(data.lanes) ? data.lanes : null;
        const robots = Array.isArray(data.robots) ? data.robots : null;
        const nodes  = Array.isArray(data.nodes)  ? data.nodes  : null;
        setState(s => ({
          ...s,
          robots:           robots           ?? s.robots,
          lanes:            lanes            ?? s.lanes,
          nodes:            nodes            ?? s.nodes,
          heatmap:          data.heatmap          ?? s.heatmap,
          metrics:          data.metrics          ?? s.metrics,
          running:          data.running          ?? s.running,
          tick:             data.tick             ?? s.tick,
          speed_multiplier: data.speed_multiplier ?? s.speed_multiplier,
          near_miss_ids:    Array.isArray(data.near_miss_ids) ? data.near_miss_ids : s.near_miss_ids,
          signal_phase:     data.signal_phase     ?? s.signal_phase,
          signal_progress:  data.signal_progress  ?? s.signal_progress,
          task_summary:     data.task_summary     ?? s.task_summary,
          metrics_history:  Array.isArray(data.metrics_history) ? data.metrics_history : s.metrics_history,
          connected: true,
        }));
      } catch (err) {
        console.warn('[WS] parse error:', err);
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setState(s => ({ ...s, connected: false }));
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setState(s => ({ ...s, connected: false }));
      // Auto-reconnect after 2s
      reconnRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 2000);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  // ── API helpers ───────────────────────────────────────────────────────────
  const api = useCallback(async (method, path, body) => {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return await res.json();
    } catch (err) {
      console.error('API error:', path, err);
      return null;
    }
  }, []);

  // ── Simulation controls ───────────────────────────────────────────────────
  const startSim = useCallback(async () => {
    // Optimistic update so button flips immediately
    setState(s => ({ ...s, running: true }));
    await api('POST', '/api/simulation/start');
  }, [api]);

  const stopSim = useCallback(async () => {
    setState(s => ({ ...s, running: false }));
    await api('POST', '/api/simulation/stop');
  }, [api]);

  const resetSim = useCallback(async (robotCount = 10) => {
    setState(s => ({ ...s, running: false, tick: 0, robots: [], lanes: [], nodes: [] }));
    await api('POST', '/api/simulation/reset', { robot_count: robotCount });
  }, [api]);

  const setSpeed = useCallback(async (multiplier) => {
    setState(s => ({ ...s, speed_multiplier: multiplier }));
    await api('POST', '/api/simulation/speed', { multiplier });
  }, [api]);

  // ── Robot controls ────────────────────────────────────────────────────────
  const emergencyStop = useCallback(async (robotId) => {
    // Optimistic UI update
    setState(s => ({
      ...s,
      robots: s.robots.map(r =>
        r.id === robotId ? { ...r, status: 'emergency_stop', speed: 0 } : r
      ),
    }));
    await api('POST', `/api/robots/${robotId}/emergency-stop`);
  }, [api]);

  const resumeRobot = useCallback(async (robotId) => {
    setState(s => ({
      ...s,
      robots: s.robots.map(r =>
        r.id === robotId ? { ...r, status: 'planning' } : r
      ),
    }));
    await api('POST', `/api/robots/${robotId}/resume`);
  }, [api]);

  const setRobotGoal = useCallback(async (robotId, goalNodeId) => {
    await api('POST', `/api/robots/${robotId}/goal`, { goal_node_id: goalNodeId });
  }, [api]);

  // ── Lane controls ─────────────────────────────────────────────────────────
  const blockLane = useCallback(async (laneId) => {
    // Optimistic toggle
    setState(s => ({
      ...s,
      lanes: s.lanes.map(l =>
        l.id === laneId ? { ...l, is_blocked: !l.is_blocked } : l
      ),
    }));
    await api('POST', `/api/lanes/${laneId}/block`);
  }, [api]);

  const unblockAll = useCallback(async () => {
    setState(s => ({
      ...s,
      lanes: s.lanes.map(l => ({ ...l, is_blocked: false })),
    }));
    await api('POST', '/api/lanes/unblock-all');
  }, [api]);

  return {
    state,
    startSim, stopSim, resetSim, setSpeed,
    emergencyStop, resumeRobot, setRobotGoal,
    blockLane, unblockAll,
  };
}