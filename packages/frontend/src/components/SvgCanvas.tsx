import { useRef, useState, useCallback, useEffect } from 'react';
import type { Layer, Operation, MachineProfile } from '../types';
import { computeShapesBoundingBox } from '../utils/geometry';
import { useAppSettings } from '../store/appSettingsStore';

interface Props {
  layers: Layer[];
  operations: Operation[];
  selectedLayerIds: Set<string>;
  selectedShapeIds?: Set<string>;
  onSelectLayer: (id: string) => void;
  onSelectShape?: (shapeId: string, layerId: string, e: React.MouseEvent) => void;
  onUpdateLayer?: (id: string, partial: Partial<Layer>) => void;
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

export default function SvgCanvas({ layers, operations, selectedLayerIds, selectedShapeIds, onSelectLayer, onSelectShape, onUpdateLayer, originPosition, machineProfile }: Props) {
  const settingsWorkW = useAppSettings(s => s.workAreaWidth);
  const settingsWorkH = useAppSettings(s => s.workAreaHeight);
  const workW = machineProfile?.workArea.x ?? settingsWorkW;
  const workH = machineProfile?.workArea.y ?? settingsWorkH;

  const [transform, setTransform] = useState({ tx: 40, ty: 40, scale: 1.5 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Shift-drag (move) / Alt-drag (rotate) state
  type InteractMode = 'pan' | 'move' | 'rotate';
  const interactMode = useRef<InteractMode>('pan');
  const interactStart = useRef({ x: 0, y: 0 });
  // Store initial layer offsets/rotations at drag start for smooth interactive editing
  const interactLayerSnap = useRef<Map<string, { offsetX: number; offsetY: number; rotation: number }>>(new Map());

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

    // Determine interaction mode
    if ((e.shiftKey || e.altKey) && selectedLayerIds.size > 0 && onUpdateLayer) {
      interactMode.current = e.altKey ? 'rotate' : 'move';
      interactStart.current = { x: e.clientX, y: e.clientY };
      // Snapshot current layer state
      const snap = new Map<string, { offsetX: number; offsetY: number; rotation: number }>();
      for (const lid of selectedLayerIds) {
        const l = layers.find(la => la.id === lid);
        if (l) snap.set(lid, { offsetX: l.offsetX, offsetY: l.offsetY, rotation: l.rotation ?? 0 });
      }
      interactLayerSnap.current = snap;
    } else {
      interactMode.current = 'pan';
      dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.tx, ty: transform.ty };
    }
  }, [transform, selectedLayerIds, layers, onUpdateLayer]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    if (interactMode.current === 'move' && onUpdateLayer) {
      const dx = (e.clientX - interactStart.current.x) / transform.scale;
      const dy = (e.clientY - interactStart.current.y) / transform.scale;
      for (const [lid, snap] of interactLayerSnap.current) {
        onUpdateLayer(lid, { offsetX: snap.offsetX + dx, offsetY: snap.offsetY + dy });
      }
    } else if (interactMode.current === 'rotate' && onUpdateLayer) {
      const dx = e.clientX - interactStart.current.x;
      const angleDelta = dx * 0.5; // 0.5 degrees per pixel
      for (const [lid, snap] of interactLayerSnap.current) {
        onUpdateLayer(lid, { rotation: (snap.rotation + angleDelta) % 360 });
      }
    } else {
      setTransform((t) => ({
        ...t,
        tx: dragStart.current.tx + e.clientX - dragStart.current.x,
        ty: dragStart.current.ty + e.clientY - dragStart.current.y,
      }));
    }
  }, [transform.scale, onUpdateLayer]);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    interactMode.current = 'pan';
  }, []);

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

  // Origin position only affects where the origin marker is drawn.
  // Shapes always render in native SVG coordinates (Y down) so they are never upside-down.
  // The actual origin flip for G-code is handled by the backend compiler.

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

        {/* Layers — rendered in native SVG coordinates */}
        <g>
          {layers.map((layer, idx) => {
            if (!layer.visible) return null;
            const color = getLayerColor(layer.id, idx);
            const isSelected = selectedLayerIds.has(layer.id);
            const rotation = layer.rotation ?? 0;
            const mX = layer.mirrorX ?? false;
            const mY = layer.mirrorY ?? false;
            const sxm = mX ? -layer.scaleX : layer.scaleX;
            const sym = mY ? -layer.scaleY : layer.scaleY;

            // Compute pivot in natural (unscaled) space from the bounding box
            const bbox = computeShapesBoundingBox(layer.shapes);
            const pivot = layer.pivot ?? 'tl';
            let pivotX = 0, pivotY = 0;
            if (bbox) {
              const col = pivot[1] === 'l' ? 0 : pivot[1] === 'c' ? 0.5 : 1;
              const row = pivot[0] === 't' ? 0 : pivot[0] === 'm' ? 0.5 : 1;
              pivotX = bbox.minX + bbox.width * col;
              pivotY = bbox.minY + bbox.height * row;
            }

            // Correct pivot-centric transform order (right-to-left application to shape coords):
            //   1. scale/mirror   2. rotate around scaled pivot   3. translate
            // This ensures rotation and mirroring both happen around the layer's pivot point.
            const parts: string[] = [
              `translate(${layer.offsetX},${layer.offsetY})`,
              `rotate(${rotation},${sxm * pivotX},${sym * pivotY})`,
              `scale(${sxm},${sym})`,
            ];

            // Inverse scale factor so bounding box / pivot stay constant screen size
            const invSx = 1 / Math.max(Math.abs(sxm), 0.001);
            const invSy = 1 / Math.max(Math.abs(sym), 0.001);
            // Cross-hair arm length in shape-local units (constant visual size)
            const armX = 2 * invSx;
            const armY = 2 * invSy;

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
                      vectorEffect="non-scaling-stroke"
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
                {/* Bounding box and pivot point for selected layer — non-scaling */}
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
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Pivot point — fixed visual size regardless of layer scale */}
                    <ellipse cx={pivotX} cy={pivotY} rx={1.2 * invSx} ry={1.2 * invSy} fill={color} opacity={0.7} />
                    <line x1={pivotX - armX} y1={pivotY} x2={pivotX + armX} y2={pivotY} stroke={color} strokeWidth={0.3} opacity={0.7} vectorEffect="non-scaling-stroke" />
                    <line x1={pivotX} y1={pivotY - armY} x2={pivotX} y2={pivotY + armY} stroke={color} strokeWidth={0.3} opacity={0.7} vectorEffect="non-scaling-stroke" />
                  </>
                )}
              </g>
            );
          })}

          {/* Origin cross — positioned according to origin setting */}
          {(() => {
            const ox = 0;
            const oy = originPosition === 'bottom-left' ? workH : 0;
            return (
              <>
                <circle cx={ox} cy={oy} r={1} fill="#f97316" />
                <line x1={ox - 3} y1={oy} x2={ox + 3} y2={oy} stroke="#f97316" strokeWidth={0.3} />
                <line x1={ox} y1={oy - 3} x2={ox} y2={oy + 3} stroke="#f97316" strokeWidth={0.3} />
              </>
            );
          })()}
        </g>
      </g>
      {/* Scale indicator */}
      <text x={8} y={16} fill="#6b7280" fontSize={10}>
        {workW}×{workH} mm | {scale.toFixed(2)}× | origin: {originPosition}
      </text>
    </svg>
  );
}
