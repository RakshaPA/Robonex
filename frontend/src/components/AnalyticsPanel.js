import React from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

function Card({ title, children, dark }) {
  return (
    <div style={{
      background: dark ? '#1E2A3A' : 'white',
      borderRadius: 10,
      border: `1px solid ${dark ? '#2A3A4A' : '#EDECEA'}`,
      padding: '12px 14px',
      marginBottom: 12,
    }}>
      {title && (
        <div style={{ fontSize: 11, color: dark ? '#7A9AB8' : '#8A98A8', fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          fontFamily: "'DM Mono', monospace", marginBottom: 10 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

const TT_STYLE = { background: 'white', border: '1px solid #EEE', borderRadius: 8, fontSize: 11 };

export default function AnalyticsPanel({ history = [], metrics = {}, taskSummary = {}, dark = false }) {
  const textColor    = dark ? '#A0B4C8' : '#5A6572';
  const gridColor    = dark ? '#2A3A4A' : '#F0EEE8';
  const tooltipStyle = dark
    ? { background: '#1E2A3A', border: '1px solid #2A3A4A', borderRadius: 8, fontSize: 11, color: '#A0B4C8' }
    : TT_STYLE;

  // Show every entry until we have 20+, then downsample
  const chartData = history.length > 20
    ? history.filter((_, i) => i % 2 === 0).slice(-60)
    : history.slice(-60);

  const hasData = chartData.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Throughput',  val: metrics.total_throughput || 0,                       color: '#5B8DB8', icon: '📦' },
          { label: 'Near Misses', val: metrics.near_miss_count  || 0,                       color: '#E85040', icon: '⚠️' },
          { label: 'Tasks Done',  val: taskSummary.completed    || 0,                       color: '#6BB86F', icon: '✅' },
          { label: 'Deadlocks',   val: metrics.deadlock_count   || 0,                       color: '#E8A843', icon: '🔓' },
          { label: 'Task Queue',  val: taskSummary.queued       || 0,                       color: '#B87BA3', icon: '📋' },
          { label: 'Lane Util',   val: `${Math.round((metrics.lane_utilization || 0) * 100)}%`, color: '#5BB8B0', icon: '🛣️' },
        ].map(({ label, val, color, icon }) => (
          <div key={label} style={{
            background: dark ? '#1E2A3A' : 'white',
            border: `1px solid ${dark ? '#2A3A4A' : '#EDECEA'}`,
            borderRadius: 9, padding: '9px 11px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 9, color: dark ? '#7A9AB8' : '#8A98A8', fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
              <span style={{ fontSize: 13 }}>{icon}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color,
              fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Empty state until data accumulates */}
      {!hasData && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          color: dark ? '#4A6A8A' : '#AAB4BE', fontSize: 13,
          border: `1px dashed ${dark ? '#2A3A4A' : '#DDD'}`,
          borderRadius: 10, marginBottom: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Collecting data…</div>
          <div style={{ fontSize: 11 }}>Charts will appear after a few seconds of simulation.</div>
        </div>
      )}

      {/* Time-series charts — only render once data is available */}
      {hasData && (
        <>
          {/* Speed + Congestion */}
          <Card title="Speed & Congestion over Time" dark={dark}>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="tick" hide />
                <YAxis domain={[0, 4]} tick={{ fontSize: 9, fill: textColor }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v.toFixed(2)]} labelFormatter={() => ''} />
                <Legend wrapperStyle={{ fontSize: 10, color: textColor }} />
                <Line type="monotone" dataKey="avg_speed"      stroke="#5B8DB8" strokeWidth={2} dot={false} name="Speed" />
                <Line type="monotone" dataKey="avg_congestion" stroke="#E85040" strokeWidth={2} dot={false} name="Congestion" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Active vs Waiting */}
          <Card title="Active vs Waiting Robots" dark={dark}>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="tick" hide />
                <YAxis tick={{ fontSize: 9, fill: textColor }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ''} />
                <Area type="monotone" dataKey="active_robots"  stroke="#6BB86F" fill="rgba(107,184,111,0.15)" strokeWidth={2} dot={false} name="Active" />
                <Area type="monotone" dataKey="waiting_robots" stroke="#E8A843" fill="rgba(232,168,67,0.15)"  strokeWidth={2} dot={false} name="Waiting" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Battery trend */}
          <Card title="Fleet Battery %" dark={dark}>
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -28 }}>
                <XAxis dataKey="tick" hide />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: textColor }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`]} labelFormatter={() => ''} />
                <Area type="monotone" dataKey="avg_battery" stroke="#D4A843" fill="rgba(212,168,67,0.15)" strokeWidth={2} dot={false} name="Battery" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Near-miss events */}
          <Card title="Near-Miss Events" dark={dark}>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -28 }}>
                <XAxis dataKey="tick" hide />
                <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: textColor }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ''} />
                <Bar dataKey="near_misses" fill="#E85040" opacity={0.7} radius={[2, 2, 0, 0]} name="Near Misses" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {/* Task Queue Status — always visible */}
      <Card title="Task Queue" dark={dark}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
          {[
            { label: 'Queued',    val: taskSummary.queued    || 0, color: '#B87BA3' },
            { label: 'Active',    val: taskSummary.active    || 0, color: '#5B8DB8' },
            { label: 'Completed', val: taskSummary.completed || 0, color: '#6BB86F' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              background: dark ? '#16202E' : '#F7F6F3',
              borderRadius: 7, padding: '7px 9px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: dark ? '#7A9AB8' : '#8A98A8', fontWeight: 500 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Active tasks */}
        {(taskSummary.active_tasks || []).length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: dark ? '#7A9AB8' : '#8A98A8', fontWeight: 500, marginBottom: 5 }}>
              Active Assignments
            </div>
            {(taskSummary.active_tasks || []).slice(0, 4).map(task => (
              <div key={task.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: dark ? '#16202E' : '#F7F6F3', borderRadius: 6,
                padding: '5px 8px', marginBottom: 3,
              }}>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace",
                  color: dark ? '#A0B4C8' : '#5A6572' }}>
                  {(task.assigned_to || '').slice(0, 6)}…
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3].map(p => (
                    <div key={p} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: p <= task.priority ? '#D4A843' : (dark ? '#2A3A4A' : '#DDD'),
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 9, color: '#6BB86F', fontWeight: 600 }}>P{task.priority}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent completed */}
        {(taskSummary.recent_completed || []).length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: dark ? '#7A9AB8' : '#8A98A8', fontWeight: 500, marginBottom: 5 }}>
              Recently Completed
            </div>
            {(taskSummary.recent_completed || []).slice(-3).reverse().map(task => (
              <div key={task.id} style={{
                display: 'flex', justifyContent: 'space-between',
                background: dark ? '#16202E' : '#F0FAF0', borderRadius: 6,
                padding: '4px 8px', marginBottom: 3,
                border: `1px solid ${dark ? '#1A3A1A' : '#C8E6C9'}`,
              }}>
                <span style={{ fontSize: 10, color: '#6BB86F', fontFamily: "'DM Mono', monospace" }}>
                  ✓ Task done
                </span>
                <span style={{ fontSize: 9, color: dark ? '#7A9AB8' : '#8A98A8' }}>P{task.priority}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}