import { useState, useEffect, useCallback } from 'react';
import type { Layer, PivotAnchor } from '../types';
import { computeShapesBoundingBox, type BBox } from '../utils/geometry';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsLeftRight, faArrowsUpDown } from '@fortawesome/free-solid-svg-icons';

interface Props {
  layer: Layer;
  onUpdate: (id: string, partial: Partial<Layer>) => void;
  originPosition?: 'bottom-left' | 'top-left';
  workH?: number;
}

/** Parse a decimal string that may use comma or dot as separator */
function parseDecimal(v: string): number {
  return Number(v.replace(/,/g, '.'));
}

type SizeMode = 'scale' | 'absolute';
type PositionMode = 'absolute' | 'relative';
type RotationMode = 'absolute' | 'relative';

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

export default function LayerTransformPanel({ layer, onUpdate, originPosition = 'top-left', workH = 200 }: Props) {
  const [sizeMode, setSizeMode] = useState<SizeMode>('scale');
  const [posMode, setPosMode] = useState<PositionMode>('absolute');
  const [rotMode, setRotMode] = useState<RotationMode>('absolute');
  const [ratioLocked, setRatioLocked] = useState(true);
  const bbox = computeShapesBoundingBox(layer.shapes);

  // Local text state so the user can type freely (including commas)
  const [localScaleX, setLocalScaleX] = useState(String(layer.scaleX));
  const [localScaleY, setLocalScaleY] = useState(String(layer.scaleY));
  const [localRotation, setLocalRotation] = useState(String(layer.rotation ?? 0));
  // Delta inputs for relative positioning mode
  const [deltaX, setDeltaX] = useState('0');
  const [deltaY, setDeltaY] = useState('0');
  const [deltaRot, setDeltaRot] = useState('0');

  // Derived absolute sizes
  const naturalW = bbox?.width ?? 0;
  const naturalH = bbox?.height ?? 0;
  const absW = naturalW * layer.scaleX;
  const absH = naturalH * layer.scaleY;
  const [localAbsW, setLocalAbsW] = useState(String(Math.round(absW * 100) / 100));
  const [localAbsH, setLocalAbsH] = useState(String(Math.round(absH * 100) / 100));

  // Compute pivot world position for display
  const { px: pivotNatX, py: pivotNatY } = getPivotCoords(bbox, layer.pivot ?? 'tl');
  const pivotWorldX = layer.offsetX + layer.scaleX * pivotNatX;
  const pivotWorldY = layer.offsetY + layer.scaleY * pivotNatY;

  // Convert Y to user-facing coordinate: for bottom-left origin, Y=0 is at the bottom (workH in SVG space)
  const displayY = originPosition === 'bottom-left' ? workH - pivotWorldY : pivotWorldY;

  // For absolute position inputs, show/edit the pivot world position (not the raw offset)
  const [localPivotX, setLocalPivotX] = useState(String(Math.round(pivotWorldX * 100) / 100));
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
    setLocalPivotX(String(Math.round(pivotWorldX * 100) / 100));
    const dy = originPosition === 'bottom-left' ? workH - pivotWorldY : pivotWorldY;
    setLocalPivotY(String(Math.round(dy * 100) / 100));
  }, [layer.scaleX, layer.scaleY, layer.offsetX, layer.offsetY, layer.rotation, naturalW, naturalH, pivotWorldX, pivotWorldY, originPosition, workH]);

  /** Commit absolute pivot position — compute the required offset. */
  const commitPivotPos = useCallback((axis: 'x' | 'y', raw: string) => {
    const v = parseDecimal(raw);
    if (!Number.isFinite(v)) return;
    if (axis === 'x') {
      onUpdate(layer.id, { offsetX: v - layer.scaleX * pivotNatX });
    } else {
      // For bottom-left origin, user Y is measured from bottom: svgY = workH - userY
      const svgY = originPosition === 'bottom-left' ? workH - v : v;
      onUpdate(layer.id, { offsetY: svgY - layer.scaleY * pivotNatY });
    }
  }, [layer.id, layer.scaleX, layer.scaleY, pivotNatX, pivotNatY, onUpdate, originPosition, workH]);

  /** Apply a relative delta to the current offset and reset delta fields. */
  const commitDelta = useCallback(() => {
    const dx = parseDecimal(deltaX);
    const dy = parseDecimal(deltaY);
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      onUpdate(layer.id, {
        offsetX: layer.offsetX + dx,
        offsetY: layer.offsetY + dy,
      });
    }
    setDeltaX('0');
    setDeltaY('0');
  }, [layer.id, layer.offsetX, layer.offsetY, deltaX, deltaY, onUpdate]);

  const commitScale = useCallback((axis: 'x' | 'y', raw: string) => {
    const v = parseDecimal(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    if (ratioLocked) {
      onUpdate(layer.id, { scaleX: v, scaleY: v });
    } else {
      onUpdate(layer.id, axis === 'x' ? { scaleX: v } : { scaleY: v });
    }
  }, [layer.id, ratioLocked, onUpdate]);

  const commitAbsSize = useCallback((axis: 'w' | 'h', raw: string) => {
    const v = parseDecimal(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    const refDim = axis === 'w' ? naturalW : naturalH;
    if (refDim === 0) return;
    const newScale = v / refDim;
    if (ratioLocked) {
      onUpdate(layer.id, { scaleX: newScale, scaleY: newScale });
    } else {
      onUpdate(layer.id, axis === 'w' ? { scaleX: newScale } : { scaleY: newScale });
    }
  }, [layer.id, ratioLocked, naturalW, naturalH, onUpdate]);

  const commitRotation = useCallback((raw: string) => {
    const v = parseDecimal(raw);
    if (Number.isFinite(v)) {
      onUpdate(layer.id, { rotation: v % 360 });
    }
  }, [layer.id, onUpdate]);

  /** Apply a relative delta to the current rotation and reset. */
  const commitDeltaRot = useCallback(() => {
    const dr = parseDecimal(deltaRot);
    if (Number.isFinite(dr)) {
      onUpdate(layer.id, { rotation: ((layer.rotation ?? 0) + dr) % 360 });
    }
    setDeltaRot('0');
  }, [layer.id, layer.rotation, deltaRot, onUpdate]);

  /**
   * Flip mirror and adjust the layer offset so the pivot stays at the same world position.
   */
  const handleFlipX = useCallback(() => {
    const { px } = getPivotCoords(bbox, layer.pivot ?? 'tl');
    const newMirrorX = !(layer.mirrorX ?? false);
    const adjustment = newMirrorX ? 2 * layer.scaleX * px : -2 * layer.scaleX * px;
    onUpdate(layer.id, { mirrorX: newMirrorX, offsetX: layer.offsetX + adjustment });
  }, [layer, bbox, onUpdate]);

  const handleFlipY = useCallback(() => {
    const { py } = getPivotCoords(bbox, layer.pivot ?? 'tl');
    const newMirrorY = !(layer.mirrorY ?? false);
    const adjustment = newMirrorY ? 2 * layer.scaleY * py : -2 * layer.scaleY * py;
    onUpdate(layer.id, { mirrorY: newMirrorY, offsetY: layer.offsetY + adjustment });
  }, [layer, bbox, onUpdate]);

  const inputClass = 'w-full text-xs bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 focus:outline-none focus:border-orange-500';
  const btnActive = 'text-xs px-1.5 py-0.5 rounded bg-orange-600 text-white font-medium';
  const btnInactive = 'text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 hover:bg-gray-600 transition-colors';

  return (
    <div className="mt-1 space-y-2" onClick={e => e.stopPropagation()}>
      {/* ── Position ── */}
      <div>
        <div className="flex items-center gap-1 mb-0.5">
          <label className="text-xs text-gray-500 flex-1">Position</label>
          <button onClick={() => { setPosMode('absolute'); setDeltaX('0'); setDeltaY('0'); }} className={posMode === 'absolute' ? btnActive : btnInactive}>Abs</button>
          <button onClick={() => { setPosMode('relative'); setDeltaX('0'); setDeltaY('0'); }} className={posMode === 'relative' ? btnActive : btnInactive}>Rel</button>
        </div>

        {posMode === 'absolute' ? (
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
          <button onClick={() => setSizeMode('scale')} className={sizeMode === 'scale' ? btnActive : btnInactive}>Scale ×</button>
          <button onClick={() => setSizeMode('absolute')} className={sizeMode === 'absolute' ? btnActive : btnInactive}>mm</button>
          <button
            onClick={() => setRatioLocked(!ratioLocked)}
            className={`flex-shrink-0 text-xs px-1 py-0.5 rounded transition-colors ${ratioLocked ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            title={ratioLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
          >
            {ratioLocked ? '🔒' : '🔓'}
          </button>
        </div>

        {sizeMode === 'scale' ? (
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
        <div className="flex items-center gap-1 mb-0.5">
          <label className="text-xs text-gray-500 flex-1">Rotation</label>
          <button onClick={() => { setRotMode('absolute'); setDeltaRot('0'); }} className={rotMode === 'absolute' ? btnActive : btnInactive}>Abs</button>
          <button onClick={() => { setRotMode('relative'); setDeltaRot('0'); }} className={rotMode === 'relative' ? btnActive : btnInactive}>Rel</button>
        </div>

        {rotMode === 'absolute' ? (
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
          <label className="text-xs text-gray-500">Flip</label>
          <div className="flex gap-1 mt-0.5">
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
        <div>
          <label className="text-xs text-gray-500">Pivot</label>
          <div className="inline-grid grid-cols-3 gap-px mt-0.5">
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
      </div>

      {/* Info line */}
      {bbox && (
        <p className="text-xs text-gray-600">
          {naturalW.toFixed(1)}×{naturalH.toFixed(1)} mm
          {sizeMode === 'scale' && ` → ${absW.toFixed(1)}×${absH.toFixed(1)} mm`}
          {' · pivot '}({pivotWorldX.toFixed(1)}, {displayY.toFixed(1)})
        </p>
      )}
    </div>
  );
}
