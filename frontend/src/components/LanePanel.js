import React from 'react';

const LANE_TYPE_INFO = {
  normal:       { icon: '→', color: '#5B8DB8', bg: '#EBF3FA' },
  narrow:       { icon: '↔', color: '#D4903C', bg: '#FAF0EB' },
  intersection: { icon: '✦', color: '#4E9E54', bg: '#EBF5EB' },
  human_zone:   { icon: '👤', color: '#A060A0', bg: '#F3EBF3' },
};

const SAFETY_COLORS = {
  low:      '#6BB86F',
  normal:   '#5B8DB8',
  high:     '#E8A843',
  critical: '#E85040',
};

export default function LanePanel({ lanes }) {
  const sorted = [...lanes].sort((a, b) => (b.congestion_score || 0) - (a.congestion_score || 0));
  const reserved = lanes.filter(l => l.is_reserved);

  const typeCounts = lanes.reduce((acc, l) => {
    acc[l.lane_type] = (acc[l.lane_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Type summary */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #EDECEA', padding: '10px 12px' }}>
        <div style={{ fontSize: 10, color: '#8A98A8', fontWeight: 500, textTransform: 'uppercase',
          letterSpacing: '0.05em', fontFamily: "'DM Mono', monospace", marginBottom: 9 }}>
          Lane Types ({lanes.length} total)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {Object.entries(typeCounts).map(([type, count]) => {
            const info = LANE_TYPE_INFO[type] || LANE_TYPE_INFO.normal;
            return (
              <div key={type} style={{ background: info.bg, borderRadius: 8, padding: '8px 10px',
                display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 14 }}>{info.icon}</span>
                <div>
                  <div style={{ fontSize: 9, color: info.color, fontWeight: 600,
                    textTransform: 'capitalize' }}>{type.replace('_', ' ')}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2A3A',
                    fontFamily: "'DM Mono', monospace", lineHeight: 1.1 }}>{count}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reserved lanes */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #EDECEA', padding: '10px 12px' }}>
        <div style={{ fontSize: 10, color: '#8A98A8', fontWeight: 500, textTransform: 'uppercase',
          letterSpacing: '0.05em', fontFamily: "'DM Mono', monospace", marginBottom: 7 }}>
          🔒 Reserved ({reserved.length})
        </div>
        {reserved.length === 0 ? (
          <p style={{ fontSize: 11, color: '#B0B8C4', textAlign: 'center', padding: '4px 0' }}>No active reservations</p>
        ) : (
          reserved.slice(0, 6).map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', background: '#FFF8F0', borderRadius: 7,
              padding: '5px 9px', marginBottom: 4, border: '1px solid #FFE0C0' }}>
              <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: '#5A6572' }}>{l.name}</span>
              <span style={{ fontSize: 9, color: '#C47030', fontWeight: 600 }}>LOCKED</span>
            </div>
          ))
        )}
      </div>

      {/* Congestion list */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #EDECEA', padding: '10px 12px' }}>
        <div style={{ fontSize: 10, color: '#8A98A8', fontWeight: 500, textTransform: 'uppercase',
          letterSpacing: '0.05em', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
          Lane Congestion
        </div>
        {sorted.slice(0, 10).map(lane => {
          const info = LANE_TYPE_INFO[lane.lane_type] || LANE_TYPE_INFO.normal;
          const c = lane.congestion_score || 0;
          return (
            <div key={lane.id} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10 }}>{info.icon}</span>
                  <span style={{ fontSize: 10, color: '#5A6572', fontFamily: "'DM Mono', monospace" }}>{lane.name}</span>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 9,
                    background: `${SAFETY_COLORS[lane.safety_level] || '#5B8DB8'}18`,
                    color: SAFETY_COLORS[lane.safety_level] || '#5B8DB8', fontWeight: 600 }}>
                    {lane.safety_level}
                  </span>
                </div>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace",
                  color: c > 0.5 ? '#E85040' : '#8A98A8' }}>{Math.round(c * 100)}%</span>
              </div>
              <div style={{ background: '#F4F2ED', borderRadius: 10, height: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 10,
                  width: `${c * 100}%`,
                  background: c > 0.7 ? '#E85040' : c > 0.4 ? '#E8A843' : '#6BB86F',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Speed limits card */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #EDECEA', padding: '10px 12px' }}>
        <div style={{ fontSize: 10, color: '#8A98A8', fontWeight: 500, textTransform: 'uppercase',
          letterSpacing: '0.05em', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
          Speed Policy
        </div>
        {[
          { label: 'Human Zones',    speed: '0.4', color: '#A060A0', icon: '👤' },
          { label: 'Critical Safety',speed: '0.5', color: '#E85040', icon: '⚠️' },
          { label: 'Intersections',  speed: '0.6', color: '#4E9E54', icon: '✦' },
          { label: 'Narrow Lanes',   speed: '0.7', color: '#D4903C', icon: '↔' },
          { label: 'Normal',         speed: '1.0', color: '#5B8DB8', icon: '→' },
          { label: 'Express',        speed: '1.2', color: '#6BB86F', icon: '⚡' },
        ].map(({ label, speed, color, icon }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #F5F3EF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12 }}>{icon}</span>
              <span style={{ fontSize: 10, color: '#5A6572' }}>{label}</span>
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11,
              fontWeight: 700, color }}>{speed} u/s</span>
          </div>
        ))}
      </div>
    </div>
  );
}
