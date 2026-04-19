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
  const r1=h(c1.slice(1,3)),g1=h(c1.slice(3,5)),b1=h(c1.slice(5,7));
  const r2=h(c2.slice(1,3)),g2=h(c2.slice(3,5)),b2=h(c2.slice(5,7));
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

export default function SimulationCanvas({
  robots=[], lanes=[], nodes=[], heatmap={},
  selectedRobot=null, onRobotClick,
  showHeatmap=true,
  nearMissIds=[],
  blockMode=false,
  goalMode=false,
  goalStep='select_robot',
  onLaneClick,
  onNodeClick,
  dark=false,
}) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const flashRef  = useRef(0);
  const dirtyRef  = useRef(true);

  // Single ref holds ALL current props — avoids stale closure in draw/click
  const dataRef = useRef({
    robots, lanes, nodes, heatmap, selectedRobot, showHeatmap,
    nearMissIds, blockMode, goalMode, goalStep, dark,
  });

  useEffect(() => {
    dataRef.current = {
      robots, lanes, nodes, heatmap, selectedRobot, showHeatmap,
      nearMissIds, blockMode, goalMode, goalStep, dark,
    };
    dirtyRef.current = true;
  }); // no dep array — always sync every render

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const {
      robots, lanes, nodes, heatmap, selectedRobot, showHeatmap,
      nearMissIds, blockMode, goalMode, goalStep, dark,
    } = dataRef.current;

    flashRef.current = (flashRef.current + 1) % 30;
    const flashOn = flashRef.current < 15;

    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    ctx.clearRect(0, 0, CW, CH);

    // Background
    ctx.fillStyle = dark ? '#1A2230' : '#FAFAF7';
    ctx.fillRect(0, 0, CW, CH);

    // Grid dots
    ctx.fillStyle = dark ? '#2A3444' : '#E8E6E0';
    for (let x = 30; x < CW; x += 40)
      for (let y = 30; y < CH; y += 40) {
        ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI*2); ctx.fill();
      }

    const heatValues = Object.values(heatmap);
    const maxHeat = heatValues.length ? Math.max(...heatValues, 1) : 1;
    const nearSet = new Set(nearMissIds);

    // ── Lanes ──────────────────────────────────────────────────────────────
    lanes.forEach(lane => {
      const fn = nodeMap[lane.from_node], tn = nodeMap[lane.to_node];
      if (!fn || !tn) return;

      if (lane.is_blocked) {
        ctx.beginPath(); ctx.moveTo(fn.x,fn.y); ctx.lineTo(tn.x,tn.y);
        ctx.strokeStyle='#E85040'; ctx.lineWidth=14; ctx.lineCap='round';
        ctx.setLineDash([6,6]); ctx.stroke(); ctx.setLineDash([]);
        const mx=(fn.x+tn.x)/2, my=(fn.y+tn.y)/2;
        ctx.fillStyle='#E85040'; ctx.font='bold 14px sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('✕',mx,my); ctx.textBaseline='alphabetic';
        return;
      }

      const heat = (heatmap[lane.id]||0) / maxHeat;
      let color;
      if (showHeatmap && heat>0.05) {
        color = lerp('#B8CEDE','#E85040',heat);
      } else if (dark) {
        color = lane.lane_type==='normal'?'#2E4560':lane.lane_type==='narrow'?'#4A3820':
                lane.lane_type==='intersection'?'#1E4030':lane.lane_type==='human_zone'?'#4A2020':'#2E4560';
      } else {
        color = LANE_COLORS[lane.lane_type]||'#B8CEDE';
      }

      if (lane.signal_state==='red' && lane.lane_type==='intersection') {
        ctx.beginPath(); ctx.moveTo(fn.x,fn.y); ctx.lineTo(tn.x,tn.y);
        ctx.strokeStyle='rgba(232,80,64,0.35)'; ctx.lineWidth=18; ctx.lineCap='round'; ctx.stroke();
      } else if (lane.signal_state==='green' && lane.lane_type==='intersection') {
        ctx.beginPath(); ctx.moveTo(fn.x,fn.y); ctx.lineTo(tn.x,tn.y);
        ctx.strokeStyle='rgba(107,184,111,0.25)'; ctx.lineWidth=18; ctx.lineCap='round'; ctx.stroke();
      }

      const lw = lane.lane_type==='narrow'?5:lane.lane_type==='intersection'?14:10;

      if (lane.is_reserved) {
        ctx.beginPath(); ctx.moveTo(fn.x,fn.y); ctx.lineTo(tn.x,tn.y);
        ctx.strokeStyle='rgba(210,120,50,0.4)'; ctx.lineWidth=lw+6; ctx.lineCap='round'; ctx.stroke();
      }

      ctx.beginPath(); ctx.moveTo(fn.x,fn.y); ctx.lineTo(tn.x,tn.y);
      ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.lineCap='round';
      ctx.setLineDash(lane.safety_level==='critical'?[4,4]:lane.safety_level==='high'?[8,4]:[]);
      ctx.stroke(); ctx.setLineDash([]);

      if (lane.congestion_score>0.15) {
        const ang=Math.atan2(tn.y-fn.y,tn.x-fn.x);
        const ll=Math.hypot(tn.x-fn.x,tn.y-fn.y);
        ctx.save(); ctx.translate(fn.x,fn.y); ctx.rotate(ang);
        ctx.fillStyle=`rgba(220,70,40,${lane.congestion_score*0.35})`;
        ctx.fillRect(0,-lw/2,ll*lane.congestion_score,lw); ctx.restore();
      }

      if (lane.directed) {
        const mx=(fn.x+tn.x)/2, my=(fn.y+tn.y)/2;
        const ang=Math.atan2(tn.y-fn.y,tn.x-fn.x);
        ctx.save(); ctx.translate(mx,my); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(-5,-3); ctx.lineTo(5,0); ctx.lineTo(-5,3);
        ctx.fillStyle=dark?'rgba(150,170,190,0.4)':'rgba(90,110,130,0.35)'; ctx.fill();
        ctx.restore();
      }

      // Highlight lane midpoints in block mode
      if (blockMode) {
        const mx=(fn.x+tn.x)/2, my=(fn.y+tn.y)/2;
        ctx.beginPath(); ctx.arc(mx,my,6,0,Math.PI*2);
        ctx.fillStyle='rgba(255,100,0,0.25)'; ctx.fill();
        ctx.strokeStyle='rgba(255,100,0,0.6)'; ctx.lineWidth=1.5; ctx.stroke();
      }
    });

    // Signal badges on intersection nodes
    nodes.forEach(n => {
      if (n.node_type==='intersection') {
        const intLanes = lanes.filter(l=>(l.from_node===n.id||l.to_node===n.id)&&l.lane_type==='intersection');
        const hasRed = intLanes.some(l=>l.signal_state==='red');
        ctx.beginPath(); ctx.arc(n.x-14,n.y-14,5,0,Math.PI*2);
        ctx.fillStyle=hasRed?'#E85040':'#6BB86F'; ctx.fill();
        ctx.strokeStyle=dark?'#1A2230':'white'; ctx.lineWidth=1.5; ctx.stroke();
      }
    });

    // ── Nodes ──────────────────────────────────────────────────────────────
    nodes.forEach(n => {
      const r2 = n.node_type==='intersection'?11:n.node_type==='depot'?10:n.node_type==='charging'?9:6;
      const nc = n.node_type==='depot'?'#5B8DB8':n.node_type==='intersection'?'#6BB86F':
                 n.node_type==='charging'?'#D4A843':(dark?'#4A5A6A':'#8B9AAA');

      // Pulsing ring on nodes during goal select_node step
      if (goalMode && goalStep==='select_node') {
        ctx.beginPath(); ctx.arc(n.x,n.y,r2+6,0,Math.PI*2);
        ctx.strokeStyle=flashOn?'rgba(91,141,184,0.7)':'rgba(91,141,184,0.2)';
        ctx.lineWidth=2; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
      }

      ctx.beginPath(); ctx.arc(n.x,n.y,r2,0,Math.PI*2);
      ctx.fillStyle=nc; ctx.fill();
      ctx.strokeStyle=dark?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.9)';
      ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle=dark?'rgba(180,195,210,0.7)':'rgba(80,95,110,0.7)';
      ctx.font='8px "DM Mono",monospace'; ctx.textAlign='center';
      ctx.fillText(n.name,n.x,n.y-r2-3);
      if (n.node_type==='charging') {
        ctx.fillStyle='white'; ctx.font='bold 7px sans-serif';
        ctx.textBaseline='middle'; ctx.fillText('⚡',n.x,n.y); ctx.textBaseline='alphabetic';
      }
    });

    // ── Robots ─────────────────────────────────────────────────────────────
    robots.forEach(robot => {
      const isSel  = selectedRobot===robot.id;
      const isNear = nearSet.has(robot.id);
      if (robot.x === undefined || robot.y === undefined) return;
      const sz     = isSel?13:10;
      const fNear  = isNear && flashOn;

      if (fNear) {
        ctx.beginPath(); ctx.arc(robot.x,robot.y,sz+9,0,Math.PI*2);
        ctx.fillStyle='rgba(232,80,64,0.25)'; ctx.fill();
      }

      // Highlight robots during goal select_robot step
      if (goalMode && goalStep==='select_robot') {
        ctx.beginPath(); ctx.arc(robot.x,robot.y,sz+8,0,Math.PI*2);
        ctx.strokeStyle=flashOn?'rgba(91,141,184,0.8)':'rgba(91,141,184,0.2)';
        ctx.lineWidth=2; ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
      }

      // Shadow
      ctx.beginPath(); ctx.arc(robot.x+2,robot.y+2,sz,0,Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,0.15)'; ctx.fill();

      // Body
      ctx.globalAlpha = robot.status==='emergency_stop'?0.4:1;
      ctx.beginPath(); ctx.arc(robot.x,robot.y,sz,0,Math.PI*2);
      ctx.fillStyle=fNear?'#E85040':robot.color; ctx.fill();
      ctx.globalAlpha=1;

      // Outline
      ctx.strokeStyle = isSel?(dark?'#FFFFFF':'#1A2A3A'):(fNear?'#FF0000':(dark?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.9)'));
      ctx.lineWidth = isSel?2.5:fNear?2:1.5; ctx.stroke();

      // Status ring
      if (robot.status==='waiting') {
        ctx.beginPath(); ctx.arc(robot.x,robot.y,sz+5,0,Math.PI*2);
        ctx.strokeStyle='#E8A843'; ctx.lineWidth=1.5; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
      } else if (robot.status==='emergency_stop') {
        ctx.beginPath(); ctx.arc(robot.x,robot.y,sz+5,0,Math.PI*2);
        ctx.strokeStyle='#E85040'; ctx.lineWidth=2; ctx.stroke();
      }

      // Battery arc
      const battAng=((robot.battery||0)/100)*Math.PI*2;
      ctx.beginPath(); ctx.arc(robot.x,robot.y,sz+3,-Math.PI/2,-Math.PI/2+battAng);
      ctx.strokeStyle=(robot.battery||0)>30?'#6BB86F':'#E85040'; ctx.lineWidth=2; ctx.stroke();

      // Priority badge
      if (robot.priority===3) {
        ctx.beginPath(); ctx.arc(robot.x+sz-2,robot.y-sz+2,5,0,Math.PI*2);
        ctx.fillStyle='#D4A843'; ctx.fill();
        ctx.fillStyle='white'; ctx.font='bold 6px sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('!',robot.x+sz-2,robot.y-sz+2); ctx.textBaseline='alphabetic';
      }

      // Moving dot
      if (robot.status==='moving'&&(robot.speed||0)>0.1) {
        ctx.beginPath(); ctx.arc(robot.x,robot.y,2.5,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fill();
      }

      // Label
      ctx.fillStyle=dark?'rgba(180,195,210,0.85)':'rgba(30,44,60,0.75)';
      ctx.font='8px "DM Mono",monospace'; ctx.textAlign='center';
      ctx.fillText(robot.name,robot.x,robot.y+sz+11);
    });

    rafRef.current = requestAnimationFrame(draw);
  }, []); // stable — reads from dataRef

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleClick = useCallback(e => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = CW / rect.width, scaleY = CH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;
    const { robots, lanes, nodes, blockMode, goalMode, goalStep } = dataRef.current;

    // GOAL MODE — step 1: pick robot only
    if (goalMode && goalStep==='select_robot') {
      for (const r of robots) {
        if (Math.hypot(r.x-mx,r.y-my)<18) { onRobotClick?.(r.id); return; }
      }
      return; // ignore clicks on empty space
    }

    // GOAL MODE — step 2: pick node only
    if (goalMode && goalStep==='select_node') {
      for (const n of nodes) {
        if (Math.hypot(n.x-mx,n.y-my)<22) { onNodeClick?.(n.id); return; }
      }
      return; // ignore clicks on empty space
    }

    // BLOCK MODE — click nearest lane midpoint
    if (blockMode) {
      const nodeMap={};
      nodes.forEach(n => { nodeMap[n.id]=n; });
      let best=null, bestDist=30;
      for (const lane of lanes) {
        const fn=nodeMap[lane.from_node], tn=nodeMap[lane.to_node];
        if (!fn||!tn) continue;
        const midX=(fn.x+tn.x)/2, midY=(fn.y+tn.y)/2;
        const d=Math.hypot(midX-mx,midY-my);
        if (d<bestDist) { bestDist=d; best=lane.id; }
      }
      if (best) onLaneClick?.(best);
      return;
    }

    // NORMAL MODE — click robot / deselect
    for (const r of robots) {
      if (Math.hypot(r.x-mx,r.y-my)<16) { onRobotClick?.(r.id); return; }
    }
    onRobotClick?.(null);
  }, [onRobotClick, onLaneClick, onNodeClick]);

  const cursor = (goalMode && goalStep==='select_robot') ? 'crosshair'
               : (goalMode && goalStep==='select_node')  ? 'cell'
               : blockMode ? 'crosshair' : 'pointer';

  return (
    <canvas
      ref={canvasRef}
      width={CW} height={CH}
      onClick={handleClick}
      style={{ width:'100%', height:'auto', borderRadius:12, cursor, display:'block',
        boxShadow:'0 2px 16px rgba(0,0,0,0.08)' }}
    />
  );
}