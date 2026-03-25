import { useRef, useState, useCallback, useEffect } from 'react';
import type { Layer, Operation, MachineProfile } from '../types';
import { computeShapesBoundingBox } from '../utils/geometry';

interface Props {
  layers: Layer[];
  operations: Operation[];
  selectedLayerId: string | null;
  selectedShapeIds?: Set<string>;
  onSelectLayer: (id: string) => void;
  onSelectShape?: (shapeId: string, layerId: string, e: React.MouseEvent) => void;
  originPosition: 'bottom-left' | 'top-left';
  machineProfile?: MachineProfile | null;
}

const OP_COLORS: Record<string, string> = {
  cut: '#ef4444',
  engrave: '#3b82f6',
  ignore: '#6b7280',
};

const LAYER_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

const GRID_SPACING = 10; // mm

export default function SvgCanvas({ layers, operations, selectedLayerId, selectedShapeIds, onSelectLayer, onSelectShape, originPosition, machineProfile }: Props) {
  const workW = machineProfile?.workArea.x ?? 300;
  const workH = machineProfile?.workArea.y ?? 200;

  const [transform, setTransform] = useState({ tx: 40, ty: 40, scale: 1.5 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

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

  // Get color for a layer based on operations
  const getLayerColor = (layerId: string, layerIdx: number) => {
    const op = operations.find(o => o.layerIds?.includes(layerId) || o.layerId === layerId);
    if (op) return OP_COLORS[op.type] ?? OP_COLORS.cut;
    return LAYER_COLORS[layerIdx % LAYER_COLORS.length];
  };

  // Grid lines
  const gridLines: React.ReactNode[] = [];
  for (let x = 0; x <= workW; x += GRID_SPACING) {
    gridLines.push(
      <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={workH} stroke="#374151" strokeWidth={x % 50 === 0 ? 0.4 : 0.2} />,
    );
  }
  for (let y = 0; y <= workH; y += GRID_SPACING) {
    gridLines.push(
      <line key={`gy${y}`} x1={0} y1={y} x2={workW} y2={y} stroke="#374151" strokeWidth={y % 50 === 0 ? 0.4 : 0.2} />,
    );
  }

  const { tx, ty, scale } = transform;

  const coordGroupTransform = originPosition === 'bottom-left'
    ? `scale(1,-1) translate(0, ${-workH})`
    : undefined;

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
        <rect x={0} y={0} width={workW} height={workH} fill="none" stroke="#4b5563" strokeWidth={0.5} />

        {/* Coordinate group (possibly flipped) */}
        <g transform={coordGroupTransform}>
          {/* Layers */}
          {layers.map((layer, idx) => {
            if (!layer.visible) return null;
            const color = getLayerColor(layer.id, idx);
            const isSelected = layer.id === selectedLayerId;
            const rotation = layer.rotation ?? 0;
            const mX = layer.mirrorX ?? false;
            const mY = layer.mirrorY ?? false;

            // Build transform: translate, then rotate/mirror around the offset point, then scale
            const parts: string[] = [];
            parts.push(`translate(${layer.offsetX},${layer.offsetY})`);
            parts.push(`scale(${mX ? -layer.scaleX : layer.scaleX},${mY ? -layer.scaleY : layer.scaleY})`);
            if (rotation !== 0) {
              // Rotate around the pivot point within the bounding box
              const bbox = computeShapesBoundingBox(layer.shapes);
              const pivot = layer.pivot ?? 'tl';
              let cx = 0, cy = 0;
              if (bbox) {
                const col = pivot[1] === 'l' ? 0 : pivot[1] === 'c' ? 0.5 : 1;
                const row = pivot[0] === 't' ? 0 : pivot[0] === 'm' ? 0.5 : 1;
                cx = bbox.minX + bbox.width * col;
                cy = bbox.minY + bbox.height * row;
              }
              parts.push(`rotate(${rotation},${cx},${cy})`);
            }

            // Compute bounding box for overlay
            const bbox = computeShapesBoundingBox(layer.shapes);
            const pivot = layer.pivot ?? 'tl';
            let pivotX = 0, pivotY = 0;
            if (bbox) {
              const col = pivot[1] === 'l' ? 0 : pivot[1] === 'c' ? 0.5 : 1;
              const row = pivot[0] === 't' ? 0 : pivot[0] === 'm' ? 0.5 : 1;
              pivotX = bbox.minX + bbox.width * col;
              pivotY = bbox.minY + bbox.height * row;
            }

            return (
              <g
                key={layer.id}
                transform={parts.join(' ')}
                onClick={(e) => { e.stopPropagation(); onSelectLayer(layer.id); }}
                style={{ cursor: 'pointer' }}
                opacity={isSelected ? 1 : 0.75}
              >
                {layer.shapes.map((shape) => {
                  const isShapeSelected = selectedShapeIds?.has(shape.id) ?? false;
                  return (
                    <path
                      key={shape.id}
                      d={shape.d}
                      fill="none"
                      stroke={isShapeSelected ? '#facc15' : color}
                      strokeWidth={isShapeSelected ? 0.8 : isSelected ? 0.6 : 0.4}
                      opacity={0.9}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectShape) {
                          onSelectShape(shape.id, layer.id, e);
                        } else {
                          onSelectLayer(layer.id);
                        }
                      }}
                    />
                  );
                })}
                {/* Bounding box and pivot point for selected layer */}
                {isSelected && bbox && (
                  <>
                    <rect
                      x={bbox.minX}
                      y={bbox.minY}
                      width={bbox.width}
                      height={bbox.height}
                      fill="none"
                      stroke={color}
                      strokeWidth={0.3}
                      strokeDasharray="2 1.5"
                      opacity={0.5}
                    />
                    {/* Pivot point */}
                    <circle cx={pivotX} cy={pivotY} r={1.2} fill={color} opacity={0.7} />
                    <line x1={pivotX - 2} y1={pivotY} x2={pivotX + 2} y2={pivotY} stroke={color} strokeWidth={0.3} opacity={0.7} />
                    <line x1={pivotX} y1={pivotY - 2} x2={pivotX} y2={pivotY + 2} stroke={color} strokeWidth={0.3} opacity={0.7} />
                  </>
                )}
              </g>
            );
          })}

          {/* Origin cross */}
          <circle cx={0} cy={0} r={1} fill="#f97316" />
          <line x1={-3} y1={0} x2={3} y2={0} stroke="#f97316" strokeWidth={0.3} />
          <line x1={0} y1={-3} x2={0} y2={3} stroke="#f97316" strokeWidth={0.3} />
        </g>
      </g>
      {/* Scale indicator */}
      <text x={8} y={16} fill="#6b7280" fontSize={10}>
        {workW}×{workH} mm | {scale.toFixed(2)}× | origin: {originPosition}
      </text>
    </svg>
  );
}
