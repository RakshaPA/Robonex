import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSimulation } from './hooks/useSimulation';
import SimulationCanvas from './components/SimulationCanvas';
import MetricsPanel from './components/MetricsPanel';
import RobotPanel from './components/RobotPanel';
import LanePanel from './components/LanePanel';
import AnalyticsPanel from './components/AnalyticsPanel';

const TABS   = ['Monitor', 'Robots', 'Lanes', 'Analytics'];
const SPEEDS = [
  { label: '0.25×', val: 0.25 },
  { label: '0.5×',  val: 0.5  },
  { label: '1×',    val: 1.0  },
  { label: '2×',    val: 2.0  },
  { label: '4×',    val: 4.0  },
];

export default function App() {
  const {
    state, startSim, stopSim, resetSim, setSpeed,
    emergencyStop, resumeRobot, setRobotGoal,
    blockLane, unblockAll,
  } = useSimulation();

  const [tab,         setTab]        = useState('Monitor');
  const [selRobot,    setSelRobot]   = useState(null);
  const [showHeatmap, setHeatmap]    = useState(true);
  const [robotCount,  setRobotCount] = useState(8);
  const [dark,        setDark]       = useState(false);
  const [blockMode,   setBlockMode]  = useState(false);
  const [goalMode,    setGoalMode]   = useState(false);
  const [goalStep,    setGoalStep]   = useState('select_robot');
  const [goalRobot,   setGoalRobot]  = useState(null);
  const countSynced = useRef(false);

  const {
    robots, lanes, nodes, heatmap, metrics, running, tick, connected,
    speed_multiplier, near_miss_ids, signal_phase, signal_progress,
    task_summary, metrics_history,
  } = state;

  // Sync robot count with backend once on first data
  useEffect(() => {
    if (!countSynced.current && robots.length > 0) {
      setRobotCount(robots.length);
      countSynced.current = true;
    }
  }, [robots.length]);

  // When user changes robot count, auto-reset the simulation
  const handleRobotCountChange = useCallback((newCount) => {
    setRobotCount(newCount);
    countSynced.current = false;
    resetSim(newCount);
  }, [resetSim]);

  /* ── Goal mode ────────────────────────────────────────────────────────── */
  const enterGoalMode = useCallback(() => {
    setGoalMode(true);
    setGoalStep('select_robot');
    setGoalRobot(null);
    setSelRobot(null);
    setBlockMode(false);
  }, []);

  const exitGoalMode = useCallback(() => {
    setGoalMode(false);
    setGoalStep('select_robot');
    setGoalRobot(null);
  }, []);

  const handleRobotClick = useCallback(id => {
    if (goalMode) {
      if (id) { setGoalRobot(id); setSelRobot(id); setGoalStep('select_node'); }
      return;
    }
    setSelRobot(prev => prev === id ? null : id);
  }, [goalMode]);

  const handleNodeClick = useCallback(nodeId => {
    if (goalMode && goalStep === 'select_node' && goalRobot) {
      setRobotGoal(goalRobot, nodeId);
      exitGoalMode();
    }
  }, [goalMode, goalStep, goalRobot, setRobotGoal, exitGoalMode]);

  const handleLaneClick = useCallback(laneId => {
    if (blockMode) blockLane(laneId);
  }, [blockMode, blockLane]);

  const handleReset = useCallback(() => {
    countSynced.current = false;
    resetSim(robotCount);
  }, [resetSim, robotCount]);

  /* ── Colours ──────────────────────────────────────────────────────────── */
  const bg     = dark ? '#0F1720' : '#F4F2ED';
  const cardBg = dark ? '#1A2230' : '#FFFFFF';
  const border = dark ? '#2A3A4A' : '#EDECEA';
  const text   = dark ? '#C0D0E0' : '#1A2A3A';
  const muted  = dark ? '#7A9AB8' : '#8A98A8';

  const navBtn = active => ({
    padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer',
    fontSize:11, fontWeight:500, fontFamily:"'DM Sans',sans-serif", transition:'all .15s',
    background: active ? (dark?'#2A3A4A':'white') : 'transparent',
    color:      active ? text : muted,
    boxShadow:  active ? (dark?'0 1px 4px rgba(0,0,0,.4)':'0 1px 4px rgba(0,0,0,.09)') : 'none',
  });

  const ctrlBtn = (v='default') => ({
    padding:'5px 12px', borderRadius:7, cursor:'pointer', transition:'all .15s', flexShrink:0,
    fontSize:11, fontWeight:500, fontFamily:"'DM Sans',sans-serif",
    ...(v==='primary' ? { background:'linear-gradient(135deg,#5B8DB8,#6BB86F)', color:'white', border:'none' }
      : v==='danger'  ? { background:'#FFEBEE', color:'#C62828', border:'1px solid #FFCDD2' }
      : v==='warn'    ? { background:'#FFF8E1', color:'#F57F17', border:'1px solid #FFE082' }
      : v==='active'  ? { background:dark?'#2A3A4A':'#EBF3FA', color:'#5B8DB8', border:`1px solid ${dark?'#3A5A7A':'#B8CEDE'}` }
      :                 { background:dark?'#1E2A3A':'white', color:muted, border:`1px solid ${border}` }),
  });

  const selectedName = goalRobot ? (robots.find(r=>r.id===goalRobot)?.name || '') : '';
  const goalHint = goalStep==='select_robot'
    ? '🎯 Goal Mode — Step 1: Click any robot on the canvas.'
    : `🎯 Goal Mode — Step 2: ${selectedName} selected. Click any node circle to route it there.`;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:bg, color:text, transition:'all .2s' }}>

      {/* HEADER */}
      <header style={{
        background:cardBg, borderBottom:`1px solid ${border}`,
        padding:'0 14px', display:'flex', alignItems:'center',
        gap:6, height:50, flexShrink:0,
        boxShadow:dark?'0 1px 8px rgba(0,0,0,.3)':'0 1px 6px rgba(0,0,0,.04)',
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
          <div style={{ width:28,height:28,borderRadius:8, background:'linear-gradient(135deg,#5B8DB8,#6BB86F)',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:'white',fontWeight:700 }}>🤖</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:text, lineHeight:1.1 }}>Robonex</div>
            <div style={{ fontSize:9, color:muted, letterSpacing:'.06em', fontFamily:"'DM Mono',monospace" }}>MULTI-ROBOT CONTROL</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display:'flex', gap:2, background:dark?'#0F1720':'#F4F2ED', borderRadius:7, padding:3, marginLeft:4, flexShrink:0 }}>
          {TABS.map(t => <button key={t} style={navBtn(tab===t)} onClick={() => setTab(t)}>{t}</button>)}
        </nav>

        <div style={{ flex:1 }} />

        {/* Live */}
        <div style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', flexShrink:0,
          borderRadius:14, background:connected?(dark?'#1A3A1A':'#E8F5E9'):(dark?'#3A1A1A':'#FFEBEE') }}>
          <span style={{ width:6,height:6,borderRadius:'50%',display:'inline-block',
            background:connected?'#6BB86F':'#E85040', boxShadow:connected?'0 0 5px #6BB86F':'none' }} />
          <span style={{ fontSize:10, fontWeight:700, color:connected?'#2E7D32':'#C62828' }}>
            {connected?'LIVE':'OFFLINE'}
          </span>
        </div>

        {/* Signal */}
        <div style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', flexShrink:0,
          borderRadius:7, background:dark?'#1E2A3A':'#F4F2ED' }}>
          <div style={{ width:7,height:7,borderRadius:'50%',
            background:signal_phase===0?'#6BB86F':'#E85040',
            boxShadow:`0 0 4px ${signal_phase===0?'#6BB86F':'#E85040'}` }} />
          <span style={{ color:muted, fontFamily:"'DM Mono',monospace", fontSize:9 }}>
            {signal_phase===0?'H-GREEN':'V-GREEN'}
          </span>
          <div style={{ width:28,height:3,background:dark?'#2A3A4A':'#DDD',borderRadius:2,overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${signal_progress*100}%`,
              background:signal_phase===0?'#6BB86F':'#E85040', transition:'width .2s' }} />
          </div>
        </div>

        {/* Speed */}
        <div style={{ display:'flex', gap:2, background:dark?'#0F1720':'#F4F2ED', borderRadius:6, padding:2, flexShrink:0 }}>
          {SPEEDS.map(s => (
            <button key={s.val} onClick={() => setSpeed(s.val)} style={{
              padding:'3px 6px', border:'none', borderRadius:4, cursor:'pointer',
              fontSize:10, fontWeight:600, fontFamily:"'DM Mono',monospace", transition:'all .15s',
              background: Math.abs(speed_multiplier-s.val)<0.01 ? (dark?'#3A5A7A':'#5B8DB8') : 'transparent',
              color:       Math.abs(speed_multiplier-s.val)<0.01 ? 'white' : muted,
            }}>{s.label}</button>
          ))}
        </div>

        {/* Robot count */}
        <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0,
          background:dark?'#1E2A3A':'#F4F2ED', borderRadius:6, padding:'3px 7px' }}>
          <span style={{ fontSize:10, color:muted }}>Robots:</span>
          <select value={robotCount} onChange={e => handleRobotCountChange(Number(e.target.value))}
            style={{ border:'none', background:'transparent', fontSize:11, fontWeight:700, color:text, cursor:'pointer' }}>
            {[6,8,10,12,15].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <button style={ctrlBtn(blockMode?'warn':'default')}
          onClick={() => { setBlockMode(b => !b); if (!blockMode) exitGoalMode(); }}>
          {blockMode ? '🚧 Exit Block' : '🚧 Block Lane'}
        </button>

        <button style={ctrlBtn(goalMode?'active':'default')}
          onClick={() => { goalMode ? exitGoalMode() : enterGoalMode(); setBlockMode(false); }}>
          {goalMode ? '❌ Cancel Goal' : '🎯 Set Goal'}
        </button>

        <button style={ctrlBtn()} onClick={unblockAll}>Clear Blocks</button>
        <button style={ctrlBtn()} onClick={handleReset}>↺ Reset</button>

        {running
          ? <button style={ctrlBtn('danger')}  onClick={stopSim}>⏸ Pause</button>
          : <button style={ctrlBtn('primary')} onClick={startSim}>▶ Play</button>
        }

        <button onClick={() => setDark(d => !d)} style={{
          width:28,height:28,borderRadius:'50%',border:`1px solid ${border}`,
          background:dark?'#2A3A4A':'#F4F2ED',cursor:'pointer',fontSize:13,
          display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
        }}>{dark?'☀️':'🌙'}</button>
      </header>

      {/* MODE BANNER */}
      {(blockMode || goalMode) && (
        <div style={{
          background:blockMode?'#FFF3E0':'#E3F2FD',
          borderBottom:`1px solid ${blockMode?'#FFE082':'#BBDEFB'}`,
          padding:'5px 16px', fontSize:11, fontWeight:500, flexShrink:0,
          color:blockMode?'#E65100':'#1565C0',
          display:'flex', alignItems:'center', gap:8,
        }}>
          {blockMode ? '🚧 Block Mode: Click the midpoint of any lane on the canvas to block/unblock it.' : goalHint}
          <button onClick={blockMode ? () => setBlockMode(false) : exitGoalMode}
            style={{ marginLeft:'auto', fontSize:10, padding:'2px 8px', borderRadius:5,
              border:'none', background:'rgba(0,0,0,0.08)', cursor:'pointer', color:'inherit' }}>
            ✕ Exit
          </button>
        </div>
      )}

      {/* MAIN */}
      <main style={{ flex:1, display:'flex', overflow:'hidden', padding:'10px 12px', gap:10 }}>
        {tab !== 'Analytics' && (
          <>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8, minWidth:0, overflowY:'auto' }}>
              <div style={{ background:cardBg, borderRadius:12, padding:12, border:`1px solid ${border}`, flexShrink:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div>
                    <h2 style={{ fontSize:13, fontWeight:700, color:text, margin:0 }}>
                      {tab==='Monitor'?'Warehouse Floor':tab==='Robots'?'Robot Positions':'Lane Heatmap'}
                    </h2>
                    <p style={{ fontSize:10, color:muted, margin:'2px 0 0' }}>
                      {blockMode ? '🚧 Click lane midpoints to block/unblock'
                       : goalMode && goalStep==='select_robot' ? '🎯 Click a robot to select it'
                       : goalMode && goalStep==='select_node'  ? '🎯 Click a node circle to route the robot'
                       : 'Click robots to inspect · Heatmap = usage intensity'}
                    </p>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {near_miss_ids.length > 0 && (
                      <div style={{ padding:'3px 8px', borderRadius:14, background:'#FFEBEE' }}>
                        <span style={{ fontSize:9, fontWeight:700, color:'#C62828' }}>
                          ⚠️ {near_miss_ids.length} NEAR MISS{near_miss_ids.length>1?'ES':''}
                        </span>
                      </div>
                    )}
                    {(tab==='Monitor'||tab==='Lanes') && (
                      <div onClick={() => setHeatmap(h => !h)}
                        style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
                        <div style={{ width:30, height:16, borderRadius:8, position:'relative',
                          background:showHeatmap?'#5B8DB8':(dark?'#2A3A4A':'#CCC'), transition:'background .2s' }}>
                          <div style={{ width:10, height:10, borderRadius:'50%', background:'white',
                            position:'absolute', top:3, left:showHeatmap?17:3,
                            transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
                        </div>
                        <span style={{ fontSize:10, color:muted, fontWeight:500 }}>Heatmap</span>
                      </div>
                    )}
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:muted,
                      background:dark?'#16202E':'#F4F2ED', borderRadius:5, padding:'2px 7px' }}>
                      TICK #{tick.toLocaleString()}
                    </span>
                  </div>
                </div>

                <SimulationCanvas
                  robots={robots} lanes={lanes} nodes={nodes} heatmap={heatmap}
                  selectedRobot={selRobot} onRobotClick={handleRobotClick}
                  showHeatmap={showHeatmap && (tab==='Monitor'||tab==='Lanes')}
                  nearMissIds={near_miss_ids} blockMode={blockMode}
                  goalMode={goalMode} goalStep={goalStep}
                  onLaneClick={handleLaneClick} onNodeClick={handleNodeClick} dark={dark}
                />
              </div>

              {/* Stats bar */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, flexShrink:0 }}>
                {[
                  { label:'Robots',     val:robots.length,                                  icon:'🤖', color:text },
                  { label:'Moving',     val:robots.filter(r=>r.status==='moving').length,   icon:'▶',  color:'#6BB86F' },
                  { label:'Waiting',    val:robots.filter(r=>r.status==='waiting').length,  icon:'⏸',  color:'#E8A843' },
                  { label:'Near Miss',  val:near_miss_ids.length,                           icon:'⚠️', color:near_miss_ids.length>0?'#E85040':text },
                  { label:'Tasks Done', val:metrics.total_throughput||0,                    icon:'📦', color:'#5B8DB8' },
                ].map(({ label, val, icon, color }) => (
                  <div key={label} style={{ background:cardBg, borderRadius:8, border:`1px solid ${border}`,
                    padding:'8px 10px', display:'flex', alignItems:'center', gap:7 }}>
                    <span style={{ fontSize:15 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize:9, color:muted, fontWeight:500 }}>{label}</div>
                      <div style={{ fontSize:17, fontWeight:700, fontFamily:"'DM Mono',monospace", color, lineHeight:1 }}>{val}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right panel */}
            <div style={{ width:248, flexShrink:0, overflowY:'auto' }}>
              {tab==='Monitor' && <MetricsPanel metrics={metrics} robots={robots} running={running} tick={tick} dark={dark} />}
              {tab==='Robots' && (
                <RobotPanel
                  robots={robots} selectedRobot={selRobot}
                  onSelect={id => {
                    if (goalMode && id) { setGoalRobot(id); setSelRobot(id); setGoalStep('select_node'); }
                    else { setSelRobot(prev => prev===id ? null : id); }
                  }}
                  onEmergencyStop={emergencyStop}
                  onResume={resumeRobot}
                  dark={dark}
                />
              )}
              {tab==='Lanes' && <LanePanel lanes={lanes} dark={dark} />}
            </div>
          </>
        )}

        {tab==='Analytics' && (
          <div style={{ flex:1, overflowY:'auto', paddingRight:4 }}>
            <AnalyticsPanel history={metrics_history} metrics={metrics} taskSummary={task_summary} dark={dark} />
          </div>
        )}
      </main>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}`}</style>
    </div>
  );
}