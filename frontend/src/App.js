import React, { useState, useCallback } from 'react';
import { useSimulation } from './hooks/useSimulation';
import SimulationCanvas from './components/SimulationCanvas';
import MetricsPanel from './components/MetricsPanel';
import RobotPanel from './components/RobotPanel';
import LanePanel from './components/LanePanel';

const TABS = ['Monitor', 'Robots', 'Lanes'];

/* ── tiny reusable styles ─────────────────────────────────────── */
const hdrBtn = (active) => ({
  padding: '5px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
  transition: 'all 0.15s',
  background: active ? 'white'       : 'transparent',
  color:      active ? '#1A2A3A'     : '#8A98A8',
  boxShadow:  active ? '0 1px 4px rgba(0,0,0,0.09)' : 'none',
});

const ctrlBtn = (variant = 'default') => ({
  padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
  fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
  transition: 'all 0.15s',
  ...(variant === 'primary'  ? { background: 'linear-gradient(135deg,#5B8DB8,#6BB86F)', color: 'white', border: 'none' }
    : variant === 'danger'   ? { background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2' }
    : { background: 'white', color: '#5A6572', border: '1px solid #DDDBD6' }),
});

function StatBar({ label, val, icon, color }) {
  return (
    <div style={{ background: 'white', borderRadius: 9, border: '1px solid #EDECEA',
      padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 9, color: '#8A98A8', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace",
          color: color || '#1A2A3A', lineHeight: 1.1 }}>{val}</div>
      </div>
    </div>
  );
}

export default function App() {
  const { state, startSim, stopSim, resetSim, emergencyStop, resumeRobot } = useSimulation();
  const [tab,          setTab]          = useState('Monitor');
  const [selRobot,     setSelRobot]     = useState(null);
  const [showHeatmap,  setShowHeatmap]  = useState(true);
  const [robotCount,   setRobotCount]   = useState(10);

  const handleRobotClick = useCallback(id => setSelRobot(id), []);

  const { robots, lanes, nodes, heatmap, metrics, running, tick, connected } = state;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F4F2ED' }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <header style={{
        background: 'white', borderBottom: '1px solid #E8E6E0',
        padding: '0 18px', display: 'flex', alignItems: 'center',
        gap: 12, height: 52, flexShrink: 0,
        boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg,#5B8DB8,#6BB86F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: 'white', fontWeight: 700 }}>🤖</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A2A3A', lineHeight: 1.2 }}>TrafficOS</div>
            <div style={{ fontSize: 9, color: '#8A98A8', letterSpacing: '0.06em',
              fontFamily: "'DM Mono', monospace" }}>MULTI-ROBOT CONTROL</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 2, background: '#F4F2ED', borderRadius: 9, padding: 3, marginLeft: 8 }}>
          {TABS.map(t => (
            <button key={t} style={hdrBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Connection badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px',
          borderRadius: 16, background: connected ? '#E8F5E9' : '#FFEBEE' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
            background: connected ? '#6BB86F' : '#E85040',
            boxShadow: connected ? '0 0 5px #6BB86F' : 'none' }} />
          <span style={{ fontSize: 10, fontWeight: 700,
            color: connected ? '#2E7D32' : '#C62828' }}>
            {connected ? 'Connected' : 'Offline'}
          </span>
        </div>

        {/* Heatmap toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <div
            onClick={() => setShowHeatmap(h => !h)}
            style={{ width: 34, height: 18, borderRadius: 9, cursor: 'pointer', position: 'relative',
              background: showHeatmap ? '#5B8DB8' : '#CCC', transition: 'background 0.2s' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'white',
              position: 'absolute', top: 3, left: showHeatmap ? 19 : 3,
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }} />
          </div>
          <span style={{ fontSize: 11, color: '#5A6572', fontWeight: 500 }}>Heatmap</span>
        </label>

        {/* Robot count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5,
          background: '#F4F2ED', borderRadius: 7, padding: '4px 8px' }}>
          <span style={{ fontSize: 11, color: '#8A98A8' }}>Robots:</span>
          <select
            value={robotCount}
            onChange={e => setRobotCount(Number(e.target.value))}
            style={{ border: 'none', background: 'transparent', fontSize: 12,
              fontWeight: 700, color: '#1A2A3A', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif" }}>
            {[6, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <button style={ctrlBtn()} onClick={() => resetSim(robotCount)}>↺ Reset</button>

        {running
          ? <button style={ctrlBtn('danger')}  onClick={stopSim}>⏸ Pause</button>
          : <button style={ctrlBtn('primary')} onClick={startSim}>▶ Start</button>
        }
      </header>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex',
        padding: '14px 16px', gap: 14 }}>

        {tab === 'Monitor' && (
          <>
            {/* Left: Canvas + stats bar */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              {/* Canvas card */}
              <div style={{ background: 'white', borderRadius: 12, padding: 14,
                border: '1px solid #EDECEA', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
                  <div>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1A2A3A', marginBottom: 1 }}>
                      Warehouse Floor
                    </h2>
                    <p style={{ fontSize: 11, color: '#8A98A8' }}>
                      Click any robot to inspect · Colors show lane type · Heatmap = usage
                    </p>
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#8A98A8',
                    background: '#F4F2ED', borderRadius: 6, padding: '3px 9px' }}>
                    TICK #{tick.toLocaleString()}
                  </div>
                </div>
                <SimulationCanvas
                  robots={robots} lanes={lanes} nodes={nodes} heatmap={heatmap}
                  selectedRobot={selRobot} onRobotClick={handleRobotClick}
                  showHeatmap={showHeatmap}
                />
              </div>

              {/* Stats bottom bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, flexShrink: 0 }}>
                <StatBar label="Robots"     val={robots.length}                             icon="🤖" />
                <StatBar label="Moving"     val={robots.filter(r=>r.status==='moving').length}  icon="▶" color="#6BB86F" />
                <StatBar label="Waiting"    val={robots.filter(r=>r.status==='waiting').length} icon="⏸" color="#E8A843" />
                <StatBar label="Lanes"      val={lanes.length}                              icon="🛣" />
                <StatBar label="Throughput" val={metrics.total_throughput || 0}             icon="📦" color="#5B8DB8" />
              </div>
            </div>

            {/* Right: Metrics panel */}
            <div style={{ width: 248, flexShrink: 0, overflowY: 'auto' }}>
              <MetricsPanel metrics={metrics} robots={robots} running={running} tick={tick} />
            </div>
          </>
        )}

        {tab === 'Robots' && (
          <>
            <div style={{ flex: 1, background: 'white', borderRadius: 12, padding: 14,
              border: '1px solid #EDECEA', minWidth: 0 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1A2A3A', marginBottom: 10 }}>
                Robot Positions
              </h2>
              <SimulationCanvas
                robots={robots} lanes={lanes} nodes={nodes} heatmap={heatmap}
                selectedRobot={selRobot} onRobotClick={handleRobotClick}
                showHeatmap={false}
              />
            </div>
            <div style={{ width: 266, flexShrink: 0, overflowY: 'auto' }}>
              <RobotPanel
                robots={robots}
                selectedRobot={selRobot}
                onSelect={setSelRobot}
                onEmergencyStop={emergencyStop}
                onResume={resumeRobot}
              />
            </div>
          </>
        )}

        {tab === 'Lanes' && (
          <>
            <div style={{ flex: 1, background: 'white', borderRadius: 12, padding: 14,
              border: '1px solid #EDECEA', minWidth: 0 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1A2A3A', marginBottom: 10 }}>
                Lane Heatmap & Congestion
              </h2>
              <SimulationCanvas
                robots={robots} lanes={lanes} nodes={nodes} heatmap={heatmap}
                selectedRobot={selRobot} onRobotClick={handleRobotClick}
                showHeatmap={true}
              />
            </div>
            <div style={{ width: 266, flexShrink: 0, overflowY: 'auto' }}>
              <LanePanel lanes={lanes} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
