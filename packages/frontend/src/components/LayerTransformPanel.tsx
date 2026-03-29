import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Layer, PivotAnchor } from '../types';
import { computeShapesBoundingBox, computeLayerWorldBBox, computeMultiLayerWorldBBox, type BBox } from '../utils/geometry';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsLeftRight, faArrowsUpDown, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';

interface Props {
  layers: Layer[];
  onUpdate: (id: string, partial: Partial<Layer>) => void;
  originPosition?: 'bottom-left' | 'top-left';
  workH?: number;
  onPreviewChange?: (preview: { deltaX: number; deltaY: number; deltaRotation: number }) => void;
}

/** Parse a decimal string that may use comma or dot as separator */
function parseDecimal(v: string): number {
  return Number(v.replace(/,/g, '.'));
}

type SizeMode = 'scale' | 'absolute';
type PosRotMode = 'absolute' | 'relative';

const PIVOT_GRID: PivotAnchor[][] = [
  ['tl', 'tc', 'tr'],
  ['ml', 'mc', 'mr'],
  ['bl', 'bc', 'br'],
];

/** Get the pivot point coordinates (in natural/unscaled shape space) from a bbox and anchor. */
function getPivotCoords(bbox: BBox | null, pivot: PivotAnchor): { px: number; py: number } {
  if (!bbox) return { px: 0, py: 0 };
  const col = pivot[1] === 'l' ? 0 : pivot[1] === 'c' ? 0.5 : 1;
  const row = pivot[0] === 't' ? 0 : pivot[0] === 'm' ? 0.5 : 1;
  return {
    px: bbox.minX + bbox.width * col,
    py: bbox.minY + bbox.height * row,
  };
}

export default function LayerTransformPanel({ layers, onUpdate, originPosition = 'top-left', workH = 200, onPreviewChange }: Props) {
  const multi = layers.length > 1;
  const layer = layers[0]; // Primary layer for single-layer mode
  const [sizeMode, setSizeMode] = useState<SizeMode>('scale');
  const [posRotMode, setPosRotMode] = useState<PosRotMode>('absolute');
  const [ratioLocked, setRatioLocked] = useState(true);
  const bbox = computeShapesBoundingBox(layer.shapes);

  // Multi-layer pivot anchor (for the combined bounding box)
  const [multiPivot, setMultiPivot] = useState<PivotAnchor>('tl');

  // Allow both absolute and relative for multi-layer
  const effectivePosRotMode = posRotMode;

  // Local text state so the user can type freely (including commas)
  const [localScaleX, setLocalScaleX] = useState(String(layer.scaleX));
  const [localScaleY, setLocalScaleY] = useState(String(layer.scaleY));
  const [localRotation, setLocalRotation] = useState(String(layer.rotation ?? 0));
  // Delta inputs for relative positioning mode
  const [deltaX, setDeltaX] = useState('0');
  const [deltaY, setDeltaY] = useState('0');
  const [deltaRot, setDeltaRot] = useState('0');
  // Delta inputs for relative scaling
  const [deltaScaleX, setDeltaScaleX] = useState('1');
  const [deltaScaleY, setDeltaScaleY] = useState('1');

  // Derived absolute sizes (single layer)
  const naturalW = bbox?.width ?? 0;
  const naturalH = bbox?.height ?? 0;
  const absW = naturalW * layer.scaleX;
  const absH = naturalH * layer.scaleY;
  const [localAbsW, setLocalAbsW] = useState(String(Math.round(absW * 100) / 100));
  const [localAbsH, setLocalAbsH] = useState(String(Math.round(absH * 100) / 100));

  // Compute pivot world position for display (single-layer)
  const { px: pivotNatX, py: pivotNatY } = getPivotCoords(bbox, layer.pivot ?? 'tl');
  const pivotWorldX = layer.offsetX + layer.scaleX * pivotNatX;
  const pivotWorldY = layer.offsetY + layer.scaleY * pivotNatY;

  // Multi-layer combined world bounding box
  const multiLayerKey = layers.map(l => `${l.id}:${l.offsetX}:${l.offsetY}:${l.scaleX}:${l.scaleY}:${l.rotation}:${l.mirrorX}:${l.mirrorY}`).join('|');
  const multiWorldBBox = useMemo(
    () => multi ? computeMultiLayerWorldBBox(layers) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [multi, multiLayerKey]
  );

  // Multi-layer pivot point (on the combined world bbox)
  const multiPivotWorld = useMemo(() => {
    if (!multiWorldBBox) return { px: 0, py: 0 };
    return getPivotCoords(multiWorldBBox, multiPivot);
  }, [multiWorldBBox, multiPivot]);

  // Choose which pivot position to show based on mode
  const displayPivotX = multi ? multiPivotWorld.px : pivotWorldX;
  const displayPivotY = multi ? multiPivotWorld.py : pivotWorldY;

  // Convert Y to user-facing coordinate: for bottom-left origin, Y=0 is at the bottom (workH in SVG space)
  const displayY = originPosition === 'bottom-left' ? workH - displayPivotY : displayPivotY;

  // For absolute position inputs, show/edit the pivot world position (not the raw offset)
  const [localPivotX, setLocalPivotX] = useState(String(Math.round(displayPivotX * 100) / 100));
  const [localPivotY, setLocalPivotY] = useState(String(Math.round(displayY * 100) / 100));

  // Sync local text state when the layer prop changes externally
  useEffect(() => {
    setLocalScaleX(String(layer.scaleX));
    setLocalScaleY(String(layer.scaleY));
    setLocalRotation(String(layer.rotation ?? 0));
    const w = naturalW * layer.scaleX;
    const h = naturalH * layer.scaleY;
    setLocalAbsW(String(Math.round(w * 100) / 100));
    setLocalAbsH(String(Math.round(h * 100) / 100));
    setLocalPivotX(String(Math.round(displayPivotX * 100) / 100));
    const dy = originPosition === 'bottom-left' ? workH - displayPivotY : displayPivotY;
    setLocalPivotY(String(Math.round(dy * 100) / 100));
  }, [layer.scaleX, layer.scaleY, layer.offsetX, layer.offsetY, layer.rotation, naturalW, naturalH, displayPivotX, displayPivotY, originPosition, workH]);

  // Send preview delta to parent when relative values change
  useEffect(() => {
    if (!onPreviewChange) return;
    if (effectivePosRotMode !== 'relative') {
      onPreviewChange({ deltaX: 0, deltaY: 0, deltaRotation: 0 });
      return;
    }
    const dx = parseDecimal(deltaX);
    const dy = parseDecimal(deltaY);
    const dr = parseDecimal(deltaRot);
    onPreviewChange({
      deltaX: Number.isFinite(dx) ? dx : 0,
      deltaY: Number.isFinite(dy) ? dy : 0,
      deltaRotation: Number.isFinite(dr) ? dr : 0,
    });
  }, [deltaX, deltaY, deltaRot, effectivePosRotMode, onPreviewChange]);

  /** Commit absolute pivot position — compute the required offset. */
  const commitPivotPos = useCallback((axis: 'x' | 'y', raw: string) => {
    const v = parseDecimal(raw);
    if (!Number.isFinite(v)) return;

    if (multi) {
      // Multi-layer: compute delta from current pivot position and apply to all layers
      const svgTarget = axis === 'y' && originPosition === 'bottom-left' ? workH - v : v;
      const currentSvg = axis === 'x' ? displayPivotX : displayPivotY;
      const d = svgTarget - currentSvg;
      for (const l of layers) {
        if (axis === 'x') {
          onUpdate(l.id, { offsetX: l.offsetX + d });
        } else {
          onUpdate(l.id, { offsetY: l.offsetY + d });
        }
      }
    } else {
      if (axis === 'x') {
        onUpdate(layer.id, { offsetX: v - layer.scaleX * pivotNatX });
      } else {
        // For bottom-left origin, user Y is measured from bottom: svgY = workH - userY
        const svgY = originPosition === 'bottom-left' ? workH - v : v;
        onUpdate(layer.id, { offsetY: svgY - layer.scaleY * pivotNatY });
      }
    }
  }, [multi, layers, layer.id, layer.scaleX, layer.scaleY, pivotNatX, pivotNatY, displayPivotX, displayPivotY, onUpdate, originPosition, workH]);

  /** Apply a relative delta to the current offset and reset delta fields. */
  const commitDelta = useCallback(() => {
    const dx = parseDecimal(deltaX);
    const dy = parseDecimal(deltaY);
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      for (const l of layers) {
        onUpdate(l.id, {
          offsetX: l.offsetX + dx,
          offsetY: l.offsetY + dy,
        });
      }
    }
    setDeltaX('0');
    setDeltaY('0');
  }, [layers, deltaX, deltaY, onUpdate]);

  /** Commit absolute scale, adjusting offset to keep pivot fixed. */
  const commitScale = useCallback((axis: 'x' | 'y', raw: string) => {
    const v = parseDecimal(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    const newSx = (ratioLocked || axis === 'x') ? v : layer.scaleX;
    const newSy = (ratioLocked || axis === 'y') ? v : layer.scaleY;
    // Adjust offset so the pivot world position stays fixed
    const newOffsetX = pivotWorldX - newSx * pivotNatX;
    const newOffsetY = pivotWorldY - newSy * pivotNatY;
    onUpdate(layer.id, { scaleX: newSx, scaleY: newSy, offsetX: newOffsetX, offsetY: newOffsetY });
  }, [layer.id, layer.scaleX, layer.scaleY, ratioLocked, pivotWorldX, pivotWorldY, pivotNatX, pivotNatY, onUpdate]);

  const commitAbsSize = useCallback((axis: 'w' | 'h', raw: string) => {
    const v = parseDecimal(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    const refDim = axis === 'w' ? naturalW : naturalH;
    if (refDim === 0) return;
    const newScale = v / refDim;
    const newSx = (ratioLocked || axis === 'w') ? newScale : layer.scaleX;
    const newSy = (ratioLocked || axis === 'h') ? newScale : layer.scaleY;
    // Adjust offset so the pivot world position stays fixed
    const newOffsetX = pivotWorldX - newSx * pivotNatX;
    const newOffsetY = pivotWorldY - newSy * pivotNatY;
    onUpdate(layer.id, { scaleX: newSx, scaleY: newSy, offsetX: newOffsetX, offsetY: newOffsetY });
  }, [layer.id, layer.scaleX, layer.scaleY, ratioLocked, naturalW, naturalH, pivotWorldX, pivotWorldY, pivotNatX, pivotNatY, onUpdate]);

  /**
   * Rotate all selected layers by `dr` degrees around the joint pivot (`multiPivotWorld`).
   * Each layer's own rotation property is incremented by dr, and its world-space offset
   * is orbited around the joint pivot so the group rotates as a whole.
   */
  const applyGroupRotation = useCallback((dr: number) => {
    if (!Number.isFinite(dr) || dr === 0) return;
    const θ = (dr * Math.PI) / 180;
    const cos = Math.cos(θ);
    const sin = Math.sin(θ);
    const jx = multiPivotWorld.px;
    const jy = multiPivotWorld.py;
    for (const l of layers) {
      const wb = computeLayerWorldBBox(l);
      // Use the layer's world bbox center as the representative point to orbit
      const wx = wb ? wb.minX + wb.width / 2 : l.offsetX;
      const wy = wb ? wb.minY + wb.height / 2 : l.offsetY;
      const dx = wx - jx;
      const dy = wy - jy;
      const newWx = jx + dx * cos - dy * sin;
      const newWy = jy + dx * sin + dy * cos;
      onUpdate(l.id, {
        rotation: ((l.rotation ?? 0) + dr) % 360,
        offsetX: l.offsetX + (newWx - wx),
        offsetY: l.offsetY + (newWy - wy),
      });
    }
  }, [layers, multiPivotWorld, onUpdate]);

  const commitRotation = useCallback((raw: string) => {
    const v = parseDecimal(raw);
    if (!Number.isFinite(v)) return;
    if (!multi) {
      onUpdate(layer.id, { rotation: v % 360 });
    } else {
      // Treat as a delta relative to the first layer's current rotation
      const dr = v - (layer.rotation ?? 0);
      applyGroupRotation(dr);
    }
  }, [multi, layer.id, layer.rotation, applyGroupRotation, onUpdate]);

  /** Apply a relative delta to the current rotation and reset. */
  const commitDeltaRot = useCallback(() => {
    const dr = parseDecimal(deltaRot);
    if (Number.isFinite(dr)) {
      if (multi) {
        applyGroupRotation(dr);
      } else {
        onUpdate(layer.id, { rotation: ((layer.rotation ?? 0) + dr) % 360 });
      }
    }
    setDeltaRot('0');
  }, [multi, layer.id, layer.rotation, deltaRot, applyGroupRotation, onUpdate]);

  /** Apply a relative scale multiplier to selected layer(s) and reset.
   *  Single-layer: keeps that layer's own pivot fixed in world space.
   *  Multi-layer: scales each layer's world position relative to the shared joint pivot. */
  const commitDeltaScale = useCallback(() => {
    const dsx = parseDecimal(deltaScaleX);
    const dsy = ratioLocked ? dsx : parseDecimal(deltaScaleY);
    if (!Number.isFinite(dsx) || dsx <= 0 || !Number.isFinite(dsy) || dsy <= 0) return;

    if (multi) {
      // Joint pivot in world space
      const jx = multiPivotWorld.px;
      const jy = multiPivotWorld.py;
      for (const l of layers) {
        // Scale each layer's offset relative to the joint pivot:
        //   new_offsetX = jx + (offsetX - jx) * dsx
        //   new_offsetY = jy + (offsetY - jy) * dsy
        onUpdate(l.id, {
          scaleX: l.scaleX * dsx,
          scaleY: l.scaleY * dsy,
          offsetX: jx + (l.offsetX - jx) * dsx,
          offsetY: jy + (l.offsetY - jy) * dsy,
        });
      }
    } else {
      const lbbox = computeShapesBoundingBox(layer.shapes);
      const { px, py } = getPivotCoords(lbbox, layer.pivot ?? 'tl');
      const oldWorldX = layer.offsetX + layer.scaleX * px;
      const oldWorldY = layer.offsetY + layer.scaleY * py;
      const newSx = layer.scaleX * dsx;
      const newSy = layer.scaleY * dsy;
      onUpdate(layer.id, {
        scaleX: newSx,
        scaleY: newSy,
        offsetX: oldWorldX - newSx * px,
        offsetY: oldWorldY - newSy * py,
      });
    }
    setDeltaScaleX('1');
    setDeltaScaleY('1');
  }, [multi, layers, layer, deltaScaleX, deltaScaleY, ratioLocked, multiPivotWorld, onUpdate]);

  /**
   * Flip mirror and adjust the layer offset so the pivot stays at the same world position.
   */
  const handleFlipX = useCallback(() => {
    for (const l of layers) {
      const lbbox = computeShapesBoundingBox(l.shapes);
      const { px } = getPivotCoords(lbbox, l.pivot ?? 'tl');
      const newMirrorX = !(l.mirrorX ?? false);
      const adjustment = newMirrorX ? 2 * l.scaleX * px : -2 * l.scaleX * px;
      onUpdate(l.id, { mirrorX: newMirrorX, offsetX: l.offsetX + adjustment });
    }
  }, [layers, onUpdate]);

  const handleFlipY = useCallback(() => {
    for (const l of layers) {
      const lbbox = computeShapesBoundingBox(l.shapes);
      const { py } = getPivotCoords(lbbox, l.pivot ?? 'tl');
      const newMirrorY = !(l.mirrorY ?? false);
      const adjustment = newMirrorY ? 2 * l.scaleY * py : -2 * l.scaleY * py;
      onUpdate(l.id, { mirrorY: newMirrorY, offsetY: l.offsetY + adjustment });
    }
  }, [layers, onUpdate]);

  const inputClass = 'w-full text-xs bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 focus:outline-none focus:border-orange-500';
  const btnActive = 'text-xs px-1.5 py-0.5 rounded bg-orange-600 text-white font-medium';
  const btnInactive = 'text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 hover:bg-gray-600 transition-colors';

  return (
    <div className="mt-1 space-y-2" onClick={e => e.stopPropagation()}>
      {/* ── Position & Rotation abs/rel toggle ── */}
      <div className="flex items-center gap-1 mb-0.5">
        <label className="text-xs text-gray-500 flex-1">Position &amp; Rotation</label>
        <button onClick={() => { setPosRotMode('absolute'); setDeltaX('0'); setDeltaY('0'); setDeltaRot('0'); }} className={effectivePosRotMode === 'absolute' ? btnActive : btnInactive}>Abs</button>
        <button onClick={() => { setPosRotMode('relative'); setDeltaX('0'); setDeltaY('0'); setDeltaRot('0'); }} className={effectivePosRotMode === 'relative' ? btnActive : btnInactive}>Rel</button>
      </div>

      {/* ── Position ── */}
      <div>
        <label className="text-xs text-gray-500">Position</label>

        {effectivePosRotMode === 'absolute' ? (
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <label className="text-xs text-gray-500">X</label>
              <input
                type="text"
                inputMode="decimal"
                value={localPivotX}
                onChange={e => setLocalPivotX(e.target.value)}
                onBlur={() => commitPivotPos('x', localPivotX)}
                onKeyDown={e => { if (e.key === 'Enter') commitPivotPos('x', localPivotX); }}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Y</label>
              <input
                type="text"
                inputMode="decimal"
                value={localPivotY}
                onChange={e => setLocalPivotY(e.target.value)}
                onBlur={() => commitPivotPos('y', localPivotY)}
                onKeyDown={e => { if (e.key === 'Enter') commitPivotPos('y', localPivotY); }}
                className={inputClass}
              />
            </div>
            <span className="text-xs text-gray-600 pb-0.5 flex-shrink-0">mm</span>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-end gap-1">
              <div className="flex-1">
                <label className="text-xs text-gray-500">ΔX</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={deltaX}
                  onChange={e => setDeltaX(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitDelta(); }}
                  className={inputClass}
                  placeholder="±mm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">ΔY</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={deltaY}
                  onChange={e => setDeltaY(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitDelta(); }}
                  className={inputClass}
                  placeholder="±mm"
                />
              </div>
              <button
                onClick={commitDelta}
                className="text-xs px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors flex-shrink-0"
              >Move</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Size ── */}
      <div>
        <div className="flex items-center gap-1 mb-0.5">
          <label className="text-xs text-gray-500 flex-1">Size</label>
          {effectivePosRotMode === 'absolute' && !multi && (
            <>
              <button onClick={() => setSizeMode('scale')} className={sizeMode === 'scale' ? btnActive : btnInactive}>Scale ×</button>
              <button onClick={() => setSizeMode('absolute')} className={sizeMode === 'absolute' ? btnActive : btnInactive}>mm</button>
            </>
          )}
          {(multi && effectivePosRotMode === 'absolute') && <span className="text-xs text-gray-600 italic">{multiWorldBBox ? `${multiWorldBBox.width.toFixed(1)}×${multiWorldBBox.height.toFixed(1)} mm` : '—'}</span>}
          {effectivePosRotMode === 'relative' && <span className="text-xs text-gray-600 italic">relative ×</span>}
          <button
            onClick={() => setRatioLocked(!ratioLocked)}
            className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded transition-colors ${ratioLocked ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            title={ratioLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
          >
            <FontAwesomeIcon icon={ratioLocked ? faLock : faLockOpen} />
          </button>
        </div>

        {(effectivePosRotMode === 'relative' || (multi && effectivePosRotMode === 'absolute')) ? (
          /* Relative scale multiplier (multi-layer or single layer in relative mode) */
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <label className="text-xs text-gray-500">×X</label>
              <input
                type="text"
                inputMode="decimal"
                value={deltaScaleX}
                onChange={e => setDeltaScaleX(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitDeltaScale(); }}
                className={inputClass}
                placeholder="1.0"
              />
            </div>
            {!ratioLocked && (
              <div className="flex-1">
                <label className="text-xs text-gray-500">×Y</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={deltaScaleY}
                  onChange={e => setDeltaScaleY(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitDeltaScale(); }}
                  className={inputClass}
                  placeholder="1.0"
                />
              </div>
            )}
            <button
              onClick={commitDeltaScale}
              className="text-xs px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors flex-shrink-0"
            >Scale</button>
          </div>
        ) : sizeMode === 'scale' ? (
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <label className="text-xs text-gray-500">X</label>
              <input
                type="text"
                inputMode="decimal"
                value={localScaleX}
                onChange={e => setLocalScaleX(e.target.value)}
                onBlur={() => commitScale('x', localScaleX)}
                onKeyDown={e => { if (e.key === 'Enter') commitScale('x', localScaleX); }}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Y</label>
              <input
                type="text"
                inputMode="decimal"
                value={localScaleY}
                onChange={e => setLocalScaleY(e.target.value)}
                onBlur={() => commitScale('y', localScaleY)}
                onKeyDown={e => { if (e.key === 'Enter') commitScale('y', localScaleY); }}
                className={inputClass}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <label className="text-xs text-gray-500">W</label>
              <input
                type="text"
                inputMode="decimal"
                value={localAbsW}
                onChange={e => setLocalAbsW(e.target.value)}
                onBlur={() => commitAbsSize('w', localAbsW)}
                onKeyDown={e => { if (e.key === 'Enter') commitAbsSize('w', localAbsW); }}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">H</label>
              <input
                type="text"
                inputMode="decimal"
                value={localAbsH}
                onChange={e => setLocalAbsH(e.target.value)}
                onBlur={() => commitAbsSize('h', localAbsH)}
                onKeyDown={e => { if (e.key === 'Enter') commitAbsSize('h', localAbsH); }}
                className={inputClass}
              />
            </div>
            <span className="text-xs text-gray-600 pb-0.5 flex-shrink-0">mm</span>
          </div>
        )}
      </div>

      {/* ── Rotation ── */}
      <div>
        <label className="text-xs text-gray-500">Rotation</label>

        {effectivePosRotMode === 'absolute' ? (
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <input
                type="text"
                inputMode="decimal"
                value={localRotation}
                onChange={e => setLocalRotation(e.target.value)}
                onBlur={() => commitRotation(localRotation)}
                onKeyDown={e => { if (e.key === 'Enter') commitRotation(localRotation); }}
                className={inputClass}
              />
            </div>
            <span className="text-xs text-gray-600 pb-0.5 flex-shrink-0">°</span>
          </div>
        ) : (
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Δ°</label>
              <input
                type="text"
                inputMode="decimal"
                value={deltaRot}
                onChange={e => setDeltaRot(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitDeltaRot(); }}
                className={inputClass}
                placeholder="±°"
              />
            </div>
            <button
              onClick={commitDeltaRot}
              className="text-xs px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors flex-shrink-0"
            >Rotate</button>
          </div>
        )}
      </div>

      {/* ── Flip & Pivot ── */}
      <div className="flex items-start gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Flip</label>
          <div className="flex gap-1">
            <button
              onClick={handleFlipX}
              className="flex items-center justify-center w-7 h-7 rounded transition-colors bg-gray-700 text-gray-400 hover:bg-gray-600 active:bg-orange-600 active:text-white"
              title="Flip horizontally around pivot"
            ><FontAwesomeIcon icon={faArrowsLeftRight} className="text-xs" /></button>
            <button
              onClick={handleFlipY}
              className="flex items-center justify-center w-7 h-7 rounded transition-colors bg-gray-700 text-gray-400 hover:bg-gray-600 active:bg-orange-600 active:text-white"
              title="Flip vertically around pivot"
            ><FontAwesomeIcon icon={faArrowsUpDown} className="text-xs" /></button>
          </div>
        </div>
        {!multi && (
          <div className="ml-1">
            <label className="text-xs text-gray-500 mb-1 block">Pivot</label>
            <div className="inline-grid grid-cols-3 gap-0.5">
              {PIVOT_GRID.map((row) =>
                row.map((anchor) => (
                  <button
                    key={anchor}
                    onClick={() => onUpdate(layer.id, { pivot: anchor })}
                    className={`w-4 h-4 rounded-sm transition-colors ${
                      (layer.pivot ?? 'tl') === anchor
                        ? 'bg-orange-500'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    title={anchor}
                  />
                ))
              )}
            </div>
          </div>
        )}
        {multi && effectivePosRotMode === 'absolute' && (
          <div className="ml-1">
            <label className="text-xs text-gray-500 mb-1 block">Pivot</label>
            <div className="inline-grid grid-cols-3 gap-0.5">
              {PIVOT_GRID.map((row) =>
                row.map((anchor) => (
                  <button
                    key={anchor}
                    onClick={() => setMultiPivot(anchor)}
                    className={`w-4 h-4 rounded-sm transition-colors ${
                      multiPivot === anchor
                        ? 'bg-orange-500'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    title={anchor}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info line */}
      {!multi && bbox && (
        <p className="text-xs text-gray-600">
          {naturalW.toFixed(1)}×{naturalH.toFixed(1)} mm
          {sizeMode === 'scale' && ` → ${absW.toFixed(1)}×${absH.toFixed(1)} mm`}
          {' · pivot '}({pivotWorldX.toFixed(1)}, {displayY.toFixed(1)})
        </p>
      )}
      {multi && multiWorldBBox && (
        <p className="text-xs text-gray-600">
          {multiWorldBBox.width.toFixed(1)}×{multiWorldBBox.height.toFixed(1)} mm
          {' · pivot '}({displayPivotX.toFixed(1)}, {displayY.toFixed(1)})
        </p>
      )}
    </div>
  );
}
