import React, { useRef, useEffect, useCallback } from 'react';

const CW = 860, CH = 500;

const LANE_COLORS = {
  normal:       '#B8CEDE',
  narrow:       '#D4B080',
  intersection: '#8EC48E',
  human_zone:   '#CC9090',
};

function lerp(c1, c2, t) {
  const h = s => parseInt(s, 16);
  const r1=h(c1.slice(1,3)), g1=h(c1.slice(3,5)), b1=h(c1.slice(5,7));
  const r2=h(c2.slice(1,3)), g2=h(c2.slice(3,5)), b2=h(c2.slice(5,7));
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

export default function SimulationCanvas({ robots, lanes, nodes, heatmap, selectedRobot, onRobotClick, showHeatmap }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const dataRef   = useRef({ robots, lanes, nodes, heatmap, selectedRobot, showHeatmap });

  useEffect(() => { dataRef.current = { robots, lanes, nodes, heatmap, selectedRobot, showHeatmap }; },
    [robots, lanes, nodes, heatmap, selectedRobot, showHeatmap]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { robots, lanes, nodes, heatmap, selectedRobot, showHeatmap } = dataRef.current;

    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    ctx.clearRect(0, 0, CW, CH);

    // Background
    ctx.fillStyle = '#FAFAF7';
    ctx.fillRect(0, 0, CW, CH);

    // Grid dots
    ctx.fillStyle = '#E8E6E0';
    for (let x = 30; x < CW; x += 40)
      for (let y = 30; y < CH; y += 40) {
        ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI*2); ctx.fill();
      }

    const maxHeat = Math.max(...Object.values(heatmap), 1);

    // Draw lanes
    lanes.forEach(lane => {
      const fn = nodeMap[lane.from_node];
      const tn = nodeMap[lane.to_node];
      if (!fn || !tn) return;

      const heat = (heatmap[lane.id] || 0) / maxHeat;
      const color = (showHeatmap && heat > 0.05)
        ? lerp('#B8CEDE', '#E85040', heat)
        : (LANE_COLORS[lane.lane_type] || '#B8CEDE');

      const lw = lane.lane_type === 'narrow' ? 5 : lane.lane_type === 'intersection' ? 14 : 10;

      // Reserved glow
      if (lane.is_reserved) {
        ctx.beginPath(); ctx.moveTo(fn.x, fn.y); ctx.lineTo(tn.x, tn.y);
        ctx.strokeStyle = 'rgba(210,120,50,0.4)';
        ctx.lineWidth = lw + 6; ctx.lineCap = 'round'; ctx.stroke();
      }

      // Lane body
      ctx.beginPath(); ctx.moveTo(fn.x, fn.y); ctx.lineTo(tn.x, tn.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.setLineDash(
        lane.safety_level === 'critical' ? [4, 4] :
        lane.safety_level === 'high'     ? [8, 4] : []
      );
      ctx.stroke(); ctx.setLineDash([]);

      // Congestion fill
      if (lane.congestion_score > 0.15) {
        const ang = Math.atan2(tn.y - fn.y, tn.x - fn.x);
        const ll  = Math.hypot(tn.x - fn.x, tn.y - fn.y);
        ctx.save();
        ctx.translate(fn.x, fn.y); ctx.rotate(ang);
        ctx.fillStyle = `rgba(220,70,40,${lane.congestion_score * 0.35})`;
        ctx.fillRect(0, -lw/2, ll * lane.congestion_score, lw);
        ctx.restore();
      }

      // Direction arrow
      if (lane.directed) {
        const mx = (fn.x + tn.x) / 2, my = (fn.y + tn.y) / 2;
        const ang = Math.atan2(tn.y - fn.y, tn.x - fn.x);
        ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(5, 0); ctx.lineTo(-5, 3);
        ctx.fillStyle = 'rgba(90, 110, 130, 0.35)'; ctx.fill();
        ctx.restore();
      }
    });

    // Draw nodes
    nodes.forEach(n => {
      const r = n.node_type === 'intersection' ? 11 :
                n.node_type === 'depot'         ? 10 :
                n.node_type === 'charging'      ? 9 : 6;
      const color = n.node_type === 'depot'        ? '#5B8DB8' :
                    n.node_type === 'intersection' ? '#6BB86F' :
                    n.node_type === 'charging'     ? '#D4A843' : '#8B9AAA';

      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();

      ctx.fillStyle = 'rgba(80,95,110,0.7)';
      ctx.font = '8px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(n.name, n.x, n.y - r - 3);

      if (n.node_type === 'charging') {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 7px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', n.x, n.y);
        ctx.textBaseline = 'alphabetic';
      }
    });

    // Draw robots
    robots.forEach(robot => {
      const isSel = selectedRobot === robot.id;
      const sz = isSel ? 13 : 10;

      // Shadow
      ctx.beginPath(); ctx.arc(robot.x + 2, robot.y + 2, sz, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();

      // Body
      ctx.globalAlpha = robot.status === 'emergency_stop' ? 0.45 : 1;
      ctx.beginPath(); ctx.arc(robot.x, robot.y, sz, 0, Math.PI*2);
      ctx.fillStyle = robot.color; ctx.fill();
      ctx.globalAlpha = 1;

      // Outline
      ctx.strokeStyle = isSel ? '#1A2A3A' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = isSel ? 2.5 : 1.5; ctx.stroke();

      // Status ring
      if (robot.status === 'waiting') {
        ctx.beginPath(); ctx.arc(robot.x, robot.y, sz + 5, 0, Math.PI*2);
        ctx.strokeStyle = '#E8A843'; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      } else if (robot.status === 'emergency_stop') {
        ctx.beginPath(); ctx.arc(robot.x, robot.y, sz + 5, 0, Math.PI*2);
        ctx.strokeStyle = '#E85040'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Battery arc
      const battAng = ((robot.battery || 0) / 100) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(robot.x, robot.y, sz + 3, -Math.PI / 2, -Math.PI / 2 + battAng);
      ctx.strokeStyle = (robot.battery || 0) > 30 ? '#6BB86F' : '#E85040';
      ctx.lineWidth = 2; ctx.stroke();

      // Speed dot
      if (robot.status === 'moving' && (robot.speed || 0) > 0.1) {
        ctx.beginPath(); ctx.arc(robot.x, robot.y, 2.5, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      }

      // Label
      ctx.fillStyle = 'rgba(30,44,60,0.75)';
      ctx.font = '8px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(robot.name, robot.x, robot.y + sz + 11);
    });

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  const handleClick = useCallback(e => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CW / rect.width;
    const scaleY = CH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;
    for (const r of dataRef.current.robots) {
      if (Math.hypot(r.x - mx, r.y - my) < 16) { onRobotClick?.(r.id); return; }
    }
    onRobotClick?.(null);
  }, [onRobotClick]);

  return (
    <canvas
      ref={canvasRef}
      width={CW} height={CH}
      onClick={handleClick}
      style={{ width: '100%', height: 'auto', borderRadius: 12, cursor: 'crosshair',
               display: 'block', boxShadow: '0 2px 16px rgba(0,0,0,0.05)' }}
    />
  );
}
