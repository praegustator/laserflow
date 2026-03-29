import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Layer, Operation, MachineProfile } from '../types';
import { computeShapesBoundingBox, computeMultiLayerWorldBBox } from '../utils/geometry';
import { useAppSettings } from '../store/appSettingsStore';

/** Preview delta applied to selected layers (for relative transform preview) */
export interface TransformPreview {
  deltaX: number;
  deltaY: number;
  deltaRotation: number;
}

/** Bounding box type used for fitLayers */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** Imperative handle exposed via ref */
export interface SvgCanvasHandle {
  fitAll: () => void;
  fitLayers: (bbox: BBox) => void;
  panToLayers: (bbox: BBox) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

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
  /** When set, renders a ghost preview of selected layers shifted by this delta */
  transformPreview?: TransformPreview;
  /** Called whenever the canvas zoom scale changes */
  onZoomChange?: (scale: number) => void;
}

const OP_COLORS: Record<string, string> = {
  cut: '#ef4444',
  engrave: '#3b82f6',
  ignore: '#6b7280',
};

const LAYER_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

/**
 * Pick a "nice" grid step size in millimetres that targets ~50 screen pixels
 * between adjacent grid lines at the given canvas zoom `scale` (px/mm).
 */
function computeGridStep(scale: number): number {
  const NICE_STEPS = [0.5, 1, 2, 5, 10, 25, 50, 100];
  const rawStep = 50 / scale; // target ~50 screen px between lines
  return NICE_STEPS.find(s => s >= rawStep) ?? 100;
}

/** Degrees of rotation per pixel of horizontal mouse drag */
const ROTATE_SENSITIVITY = 0.5;

export default forwardRef<SvgCanvasHandle, Props>(function SvgCanvas({ layers, operations, selectedLayerIds, selectedShapeIds, onSelectLayer, onSelectShape, onUpdateLayer, originPosition, machineProfile, transformPreview, onZoomChange }, ref) {
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

  useEffect(() => {
    onZoomChange?.(transform.scale);
  }, [transform.scale, onZoomChange]);

  useImperativeHandle(ref, () => ({
    fitAll() {
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
    },
    fitLayers(bbox: BBox) {
      const el = svgRef.current;
      if (!el || bbox.width === 0 || bbox.height === 0) return;
      const { width, height } = el.getBoundingClientRect();
      const pad = 60;
      const scale = Math.min((width - pad * 2) / bbox.width, (height - pad * 2) / bbox.height, 50);
      setTransform({
        tx: (width - bbox.width * scale) / 2 - bbox.minX * scale,
        ty: (height - bbox.height * scale) / 2 - bbox.minY * scale,
        scale,
      });
    },
    panToLayers(bbox: BBox) {
      const el = svgRef.current;
      if (!el || bbox.width === 0 || bbox.height === 0) return;
      const { width, height } = el.getBoundingClientRect();
      const centerX = (bbox.minX + bbox.maxX) / 2;
      const centerY = (bbox.minY + bbox.maxY) / 2;
      setTransform(t => ({
        ...t,
        tx: width / 2 - centerX * t.scale,
        ty: height / 2 - centerY * t.scale,
      }));
    },
    zoomIn() {
      setTransform(t => {
        const el = svgRef.current;
        const newScale = Math.min(50, t.scale * 1.25);
        if (!el) return { ...t, scale: newScale };
        const { width, height } = el.getBoundingClientRect();
        const cx = width / 2, cy = height / 2;
        return { scale: newScale, tx: cx - (cx - t.tx) * (newScale / t.scale), ty: cy - (cy - t.ty) * (newScale / t.scale) };
      });
    },
    zoomOut() {
      setTransform(t => {
        const el = svgRef.current;
        const newScale = Math.max(0.1, t.scale * 0.8);
        if (!el) return { ...t, scale: newScale };
        const { width, height } = el.getBoundingClientRect();
        const cx = width / 2, cy = height / 2;
        return { scale: newScale, tx: cx - (cx - t.tx) * (newScale / t.scale), ty: cy - (cy - t.ty) * (newScale / t.scale) };
      });
    },
  }), [workW, workH]);

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
      const angleDelta = dx * ROTATE_SENSITIVITY;
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

  // Get color for a layer based on operations or custom color
  const getLayerColor = (layerId: string, layerIdx: number) => {
    const op = operations.find(o => o.layerIds?.includes(layerId) || o.layerId === layerId);
    if (op) return OP_COLORS[op.type] ?? OP_COLORS.cut;
    const layer = layers[layerIdx];
    if (layer?.color) return layer.color;
    return LAYER_COLORS[layerIdx % LAYER_COLORS.length];
  };

  // Adaptive grid lines — granularity changes with zoom, thickness stays constant
  const gridStep = computeGridStep(scale);
  const majorMultiple = 5; // major line every 5 minor steps
  const gridLines: React.ReactNode[] = [];
  const GRID_EPSILON = 0.001; // small tolerance for floating-point edge inclusion
  let xi = 0;
  while (xi * gridStep <= workW + GRID_EPSILON) {
    const x = xi * gridStep;
    const isMajor = xi % majorMultiple === 0;
    gridLines.push(
      <line key={`gx${xi}`} x1={x} y1={0} x2={x} y2={workH}
        stroke="#374151" strokeWidth={isMajor ? 0.6 : 0.3}
        vectorEffect="non-scaling-stroke"
      />,
    );
    xi++;
  }
  let yi = 0;
  while (yi * gridStep <= workH + GRID_EPSILON) {
    const y = yi * gridStep;
    const isMajor = yi % majorMultiple === 0;
    gridLines.push(
      <line key={`gy${yi}`} x1={0} y1={y} x2={workW} y2={y}
        stroke="#374151" strokeWidth={isMajor ? 0.6 : 0.3}
        vectorEffect="non-scaling-stroke"
      />,
    );
    yi++;
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
            const invSx = 1 / Math.max(Math.abs(sxm), 0.001); // 0.001: epsilon to avoid division by zero
            const invSy = 1 / Math.max(Math.abs(sym), 0.001);
            // Named constants for fixed screen-space sizes of the pivot indicator
            const PIVOT_RADIUS_PX = 5;
            const PIVOT_ARM_LENGTH_PX = 10;
            // Convert to layer pre-scale coordinates (cancelled by invS*, clamped by /scale)
            const pivotRx = PIVOT_RADIUS_PX * invSx / scale;
            const pivotRy = PIVOT_RADIUS_PX * invSy / scale;
            const armX = PIVOT_ARM_LENGTH_PX * invSx / scale;
            const armY = PIVOT_ARM_LENGTH_PX * invSy / scale;
            // Bounding box dash array: scale-independent (6px dash, 3px gap)
            const bboxDash = `${6 / scale} ${3 / scale}`;

            return (
              <g
                key={layer.id}
                transform={parts.join(' ')}
                onClick={(e) => { e.stopPropagation(); onSelectLayer(layer.id); }}
                style={{ cursor: 'pointer' }}
                opacity={isSelected ? 1 : 0.92}
              >
                {layer.shapes.map((shape) => {
                  const isShapeSelected = selectedShapeIds?.has(shape.id) ?? false;
                  // When a layer is selected (single or multi), give its shapes a brighter stroke
                  const strokeColor = isShapeSelected ? '#facc15' : isSelected ? '#ffffff' : color;
                  const sw = isShapeSelected ? 0.8 : isSelected ? 0.6 : 0.4;

                  // Raster image shapes: render <image> element with outline rectangle
                  if (shape.imageDataUrl) {
                    const shapeBbox = computeShapesBoundingBox([shape]);
                    const ix = shapeBbox?.minX ?? 0;
                    const iy = shapeBbox?.minY ?? 0;
                    const iw = shapeBbox?.width ?? 0;
                    const ih = shapeBbox?.height ?? 0;
                    return (
                      <g key={shape.id}>
                        <image
                          href={shape.imageDataUrl}
                          x={ix}
                          y={iy}
                          width={iw}
                          height={ih}
                          preserveAspectRatio="none"
                          opacity={0.85}
                          style={{ pointerEvents: 'none' }}
                        />
                        {/* Outline rectangle for selection */}
                        <rect
                          x={ix}
                          y={iy}
                          width={iw}
                          height={ih}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={sw}
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
                      </g>
                    );
                  }

                  return (
                    <g key={shape.id}>
                      {/* Selection glow for shapes in selected layers */}
                      {isSelected && !isShapeSelected && (
                        <path
                          d={shape.d}
                          fill="none"
                          stroke={color}
                          strokeWidth={1.6}
                          opacity={0.25}
                          vectorEffect="non-scaling-stroke"
                          style={{ pointerEvents: 'none' }}
                        />
                      )}
                      <path
                        d={shape.d}
                        fill={shape.fill ?? 'none'}
                        fillOpacity={shape.fill ? 0.35 : undefined}
                        stroke={strokeColor}
                        strokeWidth={sw}
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
                    </g>
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
                      strokeDasharray={bboxDash}
                      opacity={0.5}
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Pivot point — fixed visual size regardless of zoom or layer scale */}
                    <ellipse cx={pivotX} cy={pivotY} rx={pivotRx} ry={pivotRy} fill={color} opacity={0.7} />
                    <line x1={pivotX - armX} y1={pivotY} x2={pivotX + armX} y2={pivotY} stroke={color} strokeWidth={0.3} opacity={0.7} vectorEffect="non-scaling-stroke" />
                    <line x1={pivotX} y1={pivotY - armY} x2={pivotX} y2={pivotY + armY} stroke={color} strokeWidth={0.3} opacity={0.7} vectorEffect="non-scaling-stroke" />
                  </>
                )}
              </g>
            );
          })}

          {/* Combined bounding box for multi-layer selection */}
          {selectedLayerIds.size > 1 && (() => {
            const selectedLayers = layers.filter(l => selectedLayerIds.has(l.id) && l.visible);
            if (selectedLayers.length < 2) return null;
            const wb = computeMultiLayerWorldBBox(selectedLayers);
            if (!wb) return null;
            return (
              <rect
                x={wb.minX}
                y={wb.minY}
                width={wb.width}
                height={wb.height}
                fill="none"
                stroke="#facc15"
                strokeWidth={0.4}
                strokeDasharray={`${8 / scale} ${4 / scale}`}
                opacity={0.6}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
            );
          })()}

          {/* Ghost preview for relative transform */}
          {transformPreview && (transformPreview.deltaX !== 0 || transformPreview.deltaY !== 0 || transformPreview.deltaRotation !== 0) && (
            layers.filter(l => selectedLayerIds.has(l.id) && l.visible).map((layer) => {
              const rotation = (layer.rotation ?? 0) + transformPreview.deltaRotation;
              const mX = layer.mirrorX ?? false;
              const mY = layer.mirrorY ?? false;
              const sxm = mX ? -layer.scaleX : layer.scaleX;
              const sym = mY ? -layer.scaleY : layer.scaleY;
              const gBbox = computeShapesBoundingBox(layer.shapes);
              const pivot = layer.pivot ?? 'tl';
              let gPivotX = 0, gPivotY = 0;
              if (gBbox) {
                const col = pivot[1] === 'l' ? 0 : pivot[1] === 'c' ? 0.5 : 1;
                const row = pivot[0] === 't' ? 0 : pivot[0] === 'm' ? 0.5 : 1;
                gPivotX = gBbox.minX + gBbox.width * col;
                gPivotY = gBbox.minY + gBbox.height * row;
              }
              const gParts = [
                `translate(${layer.offsetX + transformPreview.deltaX},${layer.offsetY + transformPreview.deltaY})`,
                `rotate(${rotation},${sxm * gPivotX},${sym * gPivotY})`,
                `scale(${sxm},${sym})`,
              ];
              return (
                <g key={`preview-${layer.id}`} transform={gParts.join(' ')} opacity={0.3} style={{ pointerEvents: 'none' }}>
                  {layer.shapes.map(shape => (
                    <path key={shape.id} d={shape.d} fill="none" stroke="#facc15" strokeWidth={0.5} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              );
            })
          )}

          {/* Origin cross and axis direction arrows — REMOVED from here; rendered in screen space below */}
        </g>
      </g>

      {/* Origin cross and axis direction arrows — fixed screen size, not affected by zoom */}
      {(() => {
        const oy = originPosition === 'bottom-left' ? workH : 0;
        const oxPx = tx; // ox=0 in work coords → tx + 0*scale = tx
        const oyPx = ty + oy * scale;
        const ARROW_LEN = 50; // screen pixels
        const ARROWHEAD_SIZE = 7; // arrowhead tip length in pixels
        const yDir = originPosition === 'bottom-left' ? -1 : 1;
        return (
          <>
            <circle cx={oxPx} cy={oyPx} r={4} fill="#f97316" />
            <line x1={oxPx - 6} y1={oyPx} x2={oxPx + 6} y2={oyPx} stroke="#f97316" strokeWidth={1} />
            <line x1={oxPx} y1={oyPx - 6} x2={oxPx} y2={oyPx + 6} stroke="#f97316" strokeWidth={1} />
            {/* X axis arrow — always points right */}
            <line x1={oxPx} y1={oyPx} x2={oxPx + ARROW_LEN} y2={oyPx} stroke="#f97316" strokeWidth={1.5} opacity={0.8} />
            <polygon points={`${oxPx + ARROW_LEN},${oyPx} ${oxPx + ARROW_LEN - ARROWHEAD_SIZE},${oyPx - ARROWHEAD_SIZE * 0.5} ${oxPx + ARROW_LEN - ARROWHEAD_SIZE},${oyPx + ARROWHEAD_SIZE * 0.5}`} fill="#f97316" opacity={0.8} />
            <text x={oxPx + ARROW_LEN + 4} y={oyPx + 4} fill="#f97316" fontSize={12} fontFamily="monospace" opacity={0.9}>X</text>
            {/* Y axis arrow */}
            <line x1={oxPx} y1={oyPx} x2={oxPx} y2={oyPx + yDir * ARROW_LEN} stroke="#f97316" strokeWidth={1.5} opacity={0.8} />
            <polygon points={`${oxPx},${oyPx + yDir * ARROW_LEN} ${oxPx - ARROWHEAD_SIZE * 0.5},${oyPx + yDir * (ARROW_LEN - ARROWHEAD_SIZE)} ${oxPx + ARROWHEAD_SIZE * 0.5},${oyPx + yDir * (ARROW_LEN - ARROWHEAD_SIZE)}`} fill="#f97316" opacity={0.8} />
            <text x={oxPx + 4} y={oyPx + yDir * (ARROW_LEN + 4)} fill="#f97316" fontSize={12} fontFamily="monospace" opacity={0.9}>Y</text>
          </>
        );
      })()}

      {/* Canvas info — work area size, grid spacing, origin */}
      <text x={8} y={16} fill="#6b7280" fontSize={10}>
        {workW}×{workH} mm | grid: {gridStep}mm | origin: {originPosition}
      </text>
    </svg>
  );
});
