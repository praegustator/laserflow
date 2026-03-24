import { useRef, useState, useCallback, useEffect } from 'react';
import type { PathGeometry, Operation, MachineProfile } from '../types';

interface Props {
  geometry: PathGeometry[];
  operations: Operation[];
  machineProfile?: MachineProfile | null;
}

const OP_COLORS: Record<string, string> = {
  cut: '#ef4444',
  engrave: '#3b82f6',
  ignore: '#6b7280',
};

const GRID_SPACING = 10; // mm

export default function SvgCanvas({ geometry, operations, machineProfile }: Props) {
  const workW = machineProfile?.workArea.x ?? 300;
  const workH = machineProfile?.workArea.y ?? 200;

  // Viewport transform: pan (tx,ty) and scale
  const [transform, setTransform] = useState({ tx: 40, ty: 40, scale: 1.5 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Fit on mount or when work area changes
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const scaleX = (width - 80) / workW;
    const scaleY = (height - 80) / workH;
    const scale = Math.min(scaleX, scaleY);
    setTransform({
      tx: (width - workW * scale) / 2,
      ty: (height - workH * scale) / 2,
      scale,
    });
  }, [workW, workH]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((t) => {
      const newScale = Math.max(0.1, Math.min(50, t.scale * factor));
      // Zoom toward cursor
      const rect = svgRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      return {
        scale: newScale,
        tx: cx - (cx - t.tx) * (newScale / t.scale),
        ty: cy - (cy - t.ty) * (newScale / t.scale),
      };
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.tx, ty: transform.ty };
  }, [transform]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setTransform((t) => ({
      ...t,
      tx: dragStart.current.tx + e.clientX - dragStart.current.x,
      ty: dragStart.current.ty + e.clientY - dragStart.current.y,
    }));
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Build operation lookup by layerId
  const opByLayer = new Map<string, Operation>();
  operations.forEach((op) => opByLayer.set(op.id, op));

  const getColor = (path: PathGeometry) => {
    if (path.layerId) {
      const op = opByLayer.get(path.layerId);
      if (op) return OP_COLORS[op.type] ?? OP_COLORS.cut;
    }
    // fallback: first operation color
    if (operations.length > 0) return OP_COLORS[operations[0].type] ?? OP_COLORS.cut;
    return OP_COLORS.cut;
  };

  // Grid lines
  const gridLines: React.ReactNode[] = [];
  for (let x = 0; x <= workW; x += GRID_SPACING) {
    gridLines.push(
      <line
        key={`gx${x}`}
        x1={x} y1={0} x2={x} y2={workH}
        stroke="#374151" strokeWidth={x % 50 === 0 ? 0.4 : 0.2}
      />,
    );
  }
  for (let y = 0; y <= workH; y += GRID_SPACING) {
    gridLines.push(
      <line
        key={`gy${y}`}
        x1={0} y1={y} x2={workW} y2={y}
        stroke="#374151" strokeWidth={y % 50 === 0 ? 0.4 : 0.2}
      />,
    );
  }

  const { tx, ty, scale } = transform;

  return (
    <svg
      ref={svgRef}
      className="w-full h-full bg-gray-950 cursor-grab active:cursor-grabbing select-none"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <g transform={`translate(${tx},${ty}) scale(${scale})`}>
        {/* Work area background */}
        <rect x={0} y={0} width={workW} height={workH} fill="#111827" />
        {/* Grid */}
        {gridLines}
        {/* Border */}
        <rect
          x={0} y={0} width={workW} height={workH}
          fill="none" stroke="#4b5563" strokeWidth={0.5}
        />
        {/* Geometry paths */}
        {geometry.map((path, i) => (
          <path
            key={i}
            d={path.d}
            fill="none"
            stroke={getColor(path)}
            strokeWidth={0.4}
            opacity={0.9}
          />
        ))}
        {/* Origin marker */}
        <circle cx={0} cy={0} r={1} fill="#f97316" />
        <line x1={-3} y1={0} x2={3} y2={0} stroke="#f97316" strokeWidth={0.3} />
        <line x1={0} y1={-3} x2={0} y2={3} stroke="#f97316" strokeWidth={0.3} />
      </g>
      {/* Scale indicator */}
      <text x={8} y={16} fill="#6b7280" fontSize={10}>
        {workW}×{workH} mm | {scale.toFixed(2)}×
      </text>
    </svg>
  );
}
