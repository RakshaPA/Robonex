import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const STATUS_COLORS = {
  moving:         '#6BB86F',
  idle:           '#B0BECC',
  waiting:        '#E8A843',
  emergency_stop: '#E85040',
  planning:       '#8B9AB8',
};

function Card({ title, children, style }) {
  return (
    <div style={{
      background: 'white', borderRadius: 10, border: '1px solid #EDECEA',
      padding: '10px 12px', marginBottom: 8, ...style,
    }}>
      {title && <div style={{ fontSize: 10, color: '#8A98A8', fontWeight: 500,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        fontFamily: "'DM Mono', monospace", marginBottom: 7 }}>
        {title}
      </div>}
      {children}
    </div>
  );
}

function Pill({ label, color }) {
  return (
    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10,
      background: `${color}22`, color, fontWeight: 600 }}>
      {label}
    </span>
  );
}

export default function MetricsPanel({ metrics, robots, running, tick }) {
  const histRef = useRef([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!tick) return;
    histRef.current = [
      ...histRef.current.slice(-39),
      { t: tick, speed: parseFloat((metrics.avg_speed || 0).toFixed(2)) },
    ];
    setHistory([...histRef.current]);
  }, [tick]);

  const statusData = Object.entries(metrics.status_counts || {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#CCC' }));

  const congPct = Math.round((metrics.avg_congestion || 0) * 100);
  const hotLanes = metrics.hot_lanes || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Live badge + tick */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#8A98A8',
          background: '#F4F2ED', borderRadius: 5, padding: '3px 8px' }}>
          TICK #{(tick || 0).toLocaleString()}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
          color: running ? '#6BB86F' : '#E85040' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%',
            background: running ? '#6BB86F' : '#E85040',
            display: 'inline-block',
            boxShadow: running ? '0 0 6px #6BB86F' : 'none' }} />
          {running ? 'LIVE' : 'PAUSED'}
        </span>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 8 }}>
        {[
          { label: 'Throughput', val: metrics.total_throughput || 0, icon: '📦', color: '#5B8DB8' },
          { label: 'Deadlocks',  val: metrics.deadlock_count   || 0, icon: '🔓',
            color: (metrics.deadlock_count || 0) > 0 ? '#E8A843' : '#6BB86F' },
          { label: 'Avg Speed',  val: (metrics.avg_speed  || 0).toFixed(2), icon: '⚡', color: '#6BB86F', unit: 'u/s' },
          { label: 'Avg Delay',  val: (metrics.avg_delay  || 0).toFixed(1), icon: '⏱', color: '#E07B54', unit: 's' },
        ].map(({ label, val, icon, color, unit }) => (
          <div key={label} style={{ background: 'white', border: '1px solid #EDECEA',
            borderRadius: 9, padding: '9px 11px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: '#8A98A8', fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
              <span style={{ fontSize: 14 }}>{icon}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color,
                fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{val}</span>
              {unit && <span style={{ fontSize: 10, color: '#8A98A8' }}>{unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Robot status pie */}
      <Card title="Robot Status">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ResponsiveContainer width={80} height={80}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%"
                innerRadius={20} outerRadius={36}
                dataKey="value" strokeWidth={0}>
                {statusData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {statusData.map(({ name, value, fill }) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: 2, background: fill, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#5A6572', flex: 1, textTransform: 'capitalize' }}>
                  {name.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1A2A3A',
                  fontFamily: "'DM Mono', monospace" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Congestion bar */}
      <Card title="Network Congestion">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: '#5A6572' }}>Avg across all lanes</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700,
            color: congPct > 50 ? '#E85040' : '#6BB86F' }}>{congPct}%</span>
        </div>
        <div style={{ background: '#F4F2ED', borderRadius: 20, height: 7, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${congPct}%`, borderRadius: 20,
            background: congPct > 70 ? '#E85040' : congPct > 40 ? '#E8A843' : '#6BB86F',
            transition: 'width 0.5s ease',
          }} />
        </div>
      </Card>

      {/* Speed trend */}
      <Card title="Speed History">
        <ResponsiveContainer width="100%" height={55}>
          <AreaChart data={history} margin={{ top: 2, right: 2, bottom: 0, left: -25 }}>
            <Tooltip
              contentStyle={{ background: 'white', border: '1px solid #EEE', borderRadius: 7, fontSize: 11 }}
              formatter={v => [`${v} u/s`, 'Speed']}
              labelFormatter={() => ''}
            />
            <Area type="monotone" dataKey="speed"
              stroke="#5B8DB8" fill="rgba(91,141,184,0.12)"
              strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Hot Lanes */}
      {hotLanes.length > 0 && (
        <Card title="🔥 Hottest Lanes">
          {hotLanes.map(({ id, heat, name }) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
                color: '#5A6572', flex: 1, minWidth: 0, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              <div style={{ flex: 2, background: '#F4F2ED', borderRadius: 10, height: 5, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, Math.round((heat / Math.max(metrics.max_heat || 1, 1)) * 100))}%`,
                  background: 'linear-gradient(90deg,#E8A843,#E85040)',
                  borderRadius: 10,
                }} />
              </div>
              <span style={{ fontSize: 10, color: '#8A98A8',
                fontFamily: "'DM Mono', monospace", minWidth: 22, textAlign: 'right' }}>{heat}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Battery */}
      <Card title="Fleet Battery">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 7 }}>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace",
            color: (metrics.avg_battery || 100) > 30 ? '#6BB86F' : '#E85040' }}>
            {Math.round(metrics.avg_battery || 100)}%
          </span>
          <span style={{ fontSize: 10, color: '#8A98A8' }}>fleet avg</span>
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {robots.slice(0, 15).map(r => (
            <div key={r.id} title={`${r.name}: ${Math.round(r.battery || 0)}%`} style={{
              width: 8,
              height: Math.max(3, Math.round(((r.battery || 0) / 100) * 22)),
              background: (r.battery || 0) > 30 ? '#6BB86F' : '#E85040',
              borderRadius: 2,
              opacity: r.status === 'emergency_stop' ? 0.3 : 1,
              transition: 'height 0.4s ease',
            }} />
          ))}
        </div>
      </Card>
    </div>
  );
}
