import React from 'react';

const STATUS = {
  moving:         { bg: '#E8F5E9', color: '#2E7D32', label: '▶ Moving' },
  idle:           { bg: '#F5F5F5', color: '#757575', label: '● Idle' },
  waiting:        { bg: '#FFF8E1', color: '#F57F17', label: '⏸ Wait' },
  emergency_stop: { bg: '#FFEBEE', color: '#C62828', label: '⛔ Stop' },
  planning:       { bg: '#E3F2FD', color: '#1565C0', label: '◉ Plan' },
};

function StatBox({ label, value }) {
  return (
    <div style={{ background: '#F7F6F3', borderRadius: 7, padding: '6px 9px' }}>
      <div style={{ fontSize: 9, color: '#8A98A8', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1A2A3A',
        fontFamily: "'DM Mono', monospace", lineHeight: 1.3 }}>{value}</div>
    </div>
  );
}

export default function RobotPanel({ robots, selectedRobot, onSelect, onEmergencyStop, onResume }) {
  const sel = robots.find(r => r.id === selectedRobot);
  const badge = s => STATUS[s] || STATUS.idle;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Selected robot detail */}
      {sel && (
        <div style={{
          background: 'white', borderRadius: 10,
          border: `1.5px solid ${sel.color}40`,
          boxShadow: `0 2px 12px ${sel.color}18`,
          padding: '12px 13px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: sel.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 700, fontSize: 12, flexShrink: 0,
            }}>
              {sel.name.replace('R', '')}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#1A2A3A', fontSize: 13 }}>{sel.name}</div>
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 14, fontWeight: 600,
                background: badge(sel.status).bg, color: badge(sel.status).color,
                display: 'inline-block', marginTop: 2,
              }}>
                {badge(sel.status).label}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 9 }}>
            <StatBox label="Speed"    value={`${(sel.speed || 0).toFixed(2)} u/s`} />
            <StatBox label="Battery"  value={`${Math.round(sel.battery || 0)}%`} />
            <StatBox label="Tasks"    value={sel.tasks_completed || 0} />
            <StatBox label="Delay"    value={`${(sel.total_delay || 0).toFixed(1)}s`} />
            <StatBox label="Priority" value={sel.priority || 1} />
            <StatBox label="Path"     value={`${(sel.path || []).length} steps`} />
          </div>

          {/* Battery bar */}
          <div style={{ background: '#F4F2ED', borderRadius: 20, height: 5, marginBottom: 9 }}>
            <div style={{
              height: '100%', borderRadius: 20, transition: 'width 0.3s ease',
              width: `${sel.battery || 0}%`,
              background: (sel.battery || 0) > 30 ? '#6BB86F' : '#E85040',
            }} />
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 6 }}>
            {sel.status !== 'emergency_stop' ? (
              <button
                onClick={() => onEmergencyStop(sel.id)}
                style={{
                  flex: 1, padding: '7px 8px', borderRadius: 7, border: '1px solid #FFCDD2',
                  background: '#FFEBEE', color: '#C62828', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}
              >
                ⛔ Emergency Stop
              </button>
            ) : (
              <button
                onClick={() => onResume(sel.id)}
                style={{
                  flex: 1, padding: '7px 8px', borderRadius: 7, border: '1px solid #C8E6C9',
                  background: '#E8F5E9', color: '#2E7D32', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}
              >
                ▶ Resume Robot
              </button>
            )}
          </div>
        </div>
      )}

      {/* Robot List */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #EDECEA', overflow: 'hidden' }}>
        <div style={{
          padding: '9px 12px', borderBottom: '1px solid #F2F0EC',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: '#8A98A8', fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            fontFamily: "'DM Mono', monospace" }}>
            Fleet ({robots.length})
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {['moving','waiting','emergency_stop'].map(s => {
              const cnt = robots.filter(r => r.status === s).length;
              if (!cnt) return null;
              const b = badge(s);
              return (
                <span key={s} style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 10,
                  background: b.bg, color: b.color, fontWeight: 600,
                }}>
                  {cnt}
                </span>
              );
            })}
          </div>
        </div>

        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {robots.map(r => {
            const b = badge(r.status);
            const isSel = selectedRobot === r.id;
            return (
              <div
                key={r.id}
                onClick={() => onSelect(isSel ? null : r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px',
                  background: isSel ? '#F8F7F4' : 'transparent',
                  borderLeft: `3px solid ${isSel ? r.color : 'transparent'}`,
                  borderBottom: '1px solid #F5F3EF',
                  cursor: 'pointer', transition: 'background 0.12s',
                }}
              >
                <div style={{
                  width: 9, height: 9, borderRadius: '50%', background: r.color, flexShrink: 0,
                  boxShadow: r.status === 'moving' ? `0 0 6px ${r.color}` : 'none',
                }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#1A2A3A', flex: 1,
                  fontFamily: "'DM Mono', monospace" }}>{r.name}</span>
                <span style={{ fontSize: 10, color: '#8A98A8',
                  fontFamily: "'DM Mono', monospace" }}>{(r.speed || 0).toFixed(1)}</span>
                {/* mini battery */}
                <div style={{ width: 22, background: '#EDECEA', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${r.battery || 0}%`,
                    background: (r.battery || 0) > 30 ? '#6BB86F' : '#E85040',
                  }} />
                </div>
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 9,
                  background: b.bg, color: b.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lane Legend */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #EDECEA',
        padding: '10px 12px' }}>
        <div style={{ fontSize: 10, color: '#8A98A8', fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          fontFamily: "'DM Mono', monospace", marginBottom: 7 }}>Lane Legend</div>
        {[
          { color: '#B8CEDE', label: 'Normal  — 1.0x speed' },
          { color: '#D4B080', label: 'Narrow  — 0.7x speed' },
          { color: '#8EC48E', label: 'Intersection — 0.6x' },
          { color: '#CC9090', label: 'Human Zone — 0.4x' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <div style={{ width: 20, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#5A6572' }}>{label}</span>
          </div>
        ))}
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #F0EEE8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 44, height: 6, borderRadius: 3,
              background: 'linear-gradient(90deg, #B8CEDE, #E85040)', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#5A6572' }}>Heatmap intensity</span>
          </div>
        </div>
      </div>
    </div>
  );
}
