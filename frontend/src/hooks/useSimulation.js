import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL  = 'ws://localhost:8000/ws';
const API_URL = 'http://localhost:8000/api';

export function useSimulation() {
  const [state, setState] = useState({
    robots: [], lanes: [], nodes: [], heatmap: {}, metrics: {},
    running: false, tick: 0, connected: false,
  });

  const wsRef      = useRef(null);
  const reconnRef  = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setState(p => ({ ...p, connected: true }));

      ws.onmessage = e => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'state_update' || d.type === 'init') {
            setState(p => ({
              ...p,
              robots:  d.robots  ?? p.robots,
              lanes:   d.lanes   ?? p.lanes,
              nodes:   d.nodes   ?? p.nodes,
              heatmap: d.heatmap ?? p.heatmap,
              metrics: d.metrics ?? p.metrics,
              running: d.running ?? p.running,
              tick:    d.tick    ?? p.tick,
            }));
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        setState(p => ({ ...p, connected: false }));
        reconnRef.current = setTimeout(connect, 2500);
      };

      ws.onerror = () => ws.close();
    } catch (_) {
      reconnRef.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => { clearTimeout(reconnRef.current); wsRef.current?.close(); };
  }, [connect]);

  const api = useCallback(async (endpoint, method = 'GET', body = null) => {
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return await res.json();
    } catch (e) { console.error('API error:', e); return null; }
  }, []);

  return {
    state,
    startSim:      ()      => api('/simulation/start', 'POST'),
    stopSim:       ()      => api('/simulation/stop',  'POST'),
    resetSim:      (count) => api('/simulation/reset', 'POST', { robot_count: count }),
    emergencyStop: (id)    => api(`/robots/${id}/emergency-stop`, 'POST'),
    resumeRobot:   (id)    => api(`/robots/${id}/resume`,         'POST'),
  };
}
