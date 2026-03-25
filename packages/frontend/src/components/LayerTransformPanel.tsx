import { useState, useEffect, useCallback } from 'react';
import type { Layer, PivotAnchor } from '../types';
import { computeShapesBoundingBox, type BBox } from '../utils/geometry';

interface Props {
  layer: Layer;
  onUpdate: (id: string, partial: Partial<Layer>) => void;
}

/** Parse a decimal string that may use comma or dot as separator */
function parseDecimal(v: string): number {
  return Number(v.replace(/,/g, '.'));
}

type SizeMode = 'scale' | 'absolute';
type PositionMode = 'absolute' | 'relative';

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

export default function LayerTransformPanel({ layer, onUpdate }: Props) {
  const [sizeMode, setSizeMode] = useState<SizeMode>('scale');
  const [posMode, setPosMode] = useState<PositionMode>('absolute');
  const [ratioLocked, setRatioLocked] = useState(true);
  const bbox = computeShapesBoundingBox(layer.shapes);

  // Local text state so the user can type freely (including commas)
  const [localScaleX, setLocalScaleX] = useState(String(layer.scaleX));
  const [localScaleY, setLocalScaleY] = useState(String(layer.scaleY));
  const [localOffsetX, setLocalOffsetX] = useState(String(layer.offsetX));
  const [localOffsetY, setLocalOffsetY] = useState(String(layer.offsetY));
  const [localRotation, setLocalRotation] = useState(String(layer.rotation ?? 0));
  // Delta inputs for relative positioning mode
  const [deltaX, setDeltaX] = useState('0');
  const [deltaY, setDeltaY] = useState('0');

  // Derived absolute sizes
  const naturalW = bbox?.width ?? 0;
  const naturalH = bbox?.height ?? 0;
  const absW = naturalW * layer.scaleX;
  const absH = naturalH * layer.scaleY;
  const [localAbsW, setLocalAbsW] = useState(String(Math.round(absW * 100) / 100));
  const [localAbsH, setLocalAbsH] = useState(String(Math.round(absH * 100) / 100));

  // Sync local text state when the layer prop changes externally
  useEffect(() => {
    setLocalScaleX(String(layer.scaleX));
    setLocalScaleY(String(layer.scaleY));
    setLocalOffsetX(String(layer.offsetX));
    setLocalOffsetY(String(layer.offsetY));
    setLocalRotation(String(layer.rotation ?? 0));
    const w = naturalW * layer.scaleX;
    const h = naturalH * layer.scaleY;
    setLocalAbsW(String(Math.round(w * 100) / 100));
    setLocalAbsH(String(Math.round(h * 100) / 100));
  }, [layer.scaleX, layer.scaleY, layer.offsetX, layer.offsetY, layer.rotation, naturalW, naturalH]);

  const commitOffset = useCallback((field: 'offsetX' | 'offsetY', raw: string) => {
    const v = parseDecimal(raw);
    if (Number.isFinite(v)) {
      onUpdate(layer.id, { [field]: v });
    }
  }, [layer.id, onUpdate]);

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

  /**
   * Flip mirror and adjust the layer offset so the pivot stays at the same world position.
   * With transform: translate(ox, oy) rotate(a, sxm*pivotX, sym*pivotY) scale(sxm, sym)
   * The pivot's world X = ox + sxm * pivotX  (independent of rotation at angle=0 or uniform).
   * When toggling mirrorX (sxm changes sign), to keep pivot_world_X constant:
   *   new_ox = old_ox + 2 * scaleX * pivotX   (when turning ON mirror)
   *   new_ox = old_ox - 2 * scaleX * pivotX   (when turning OFF mirror)
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

  return (
    <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
      {/* Position — absolute or relative */}
      <div className="flex items-center gap-1 mb-0.5">
        <label className="text-xs text-gray-500 flex-1">Position</label>
        <button
          onClick={() => { setPosMode(posMode === 'absolute' ? 'relative' : 'absolute'); setDeltaX('0'); setDeltaY('0'); }}
          className="text-xs px-1.5 py-0 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          title={posMode === 'absolute' ? 'Switch to relative (move by delta)' : 'Switch to absolute position'}
        >{posMode === 'absolute' ? 'Abs' : 'Rel'}</button>
      </div>

      {posMode === 'absolute' ? (
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className="text-xs text-gray-500">X (mm)</label>
            <input
              type="text"
              inputMode="decimal"
              value={localOffsetX}
              onChange={e => setLocalOffsetX(e.target.value)}
              onBlur={() => commitOffset('offsetX', localOffsetX)}
              onKeyDown={e => { if (e.key === 'Enter') commitOffset('offsetX', localOffsetX); }}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Y (mm)</label>
            <input
              type="text"
              inputMode="decimal"
              value={localOffsetY}
              onChange={e => setLocalOffsetY(e.target.value)}
              onBlur={() => commitOffset('offsetY', localOffsetY)}
              onKeyDown={e => { if (e.key === 'Enter') commitOffset('offsetY', localOffsetY); }}
              className={inputClass}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="text-xs text-gray-500">ΔX (mm)</label>
              <input
                type="text"
                inputMode="decimal"
                value={deltaX}
                onChange={e => setDeltaX(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitDelta(); }}
                className={inputClass}
                placeholder="+10 or -5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">ΔY (mm)</label>
              <input
                type="text"
                inputMode="decimal"
                value={deltaY}
                onChange={e => setDeltaY(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitDelta(); }}
                className={inputClass}
                placeholder="+10 or -5"
              />
            </div>
          </div>
          <button
            onClick={commitDelta}
            className="w-full text-xs py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors"
          >Move by delta</button>
          <p className="text-xs text-gray-600">
            Current: ({layer.offsetX.toFixed(2)}, {layer.offsetY.toFixed(2)}) mm
          </p>
        </div>
      )}

      {/* Size mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSizeMode(sizeMode === 'scale' ? 'absolute' : 'scale')}
          className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          title={sizeMode === 'scale' ? 'Switch to absolute size (mm)' : 'Switch to scale multiplier'}
        >
          {sizeMode === 'scale' ? 'Scale ×' : 'Size mm'}
        </button>
      </div>

      {/* Scale or absolute size inputs with ratio lock between them */}
      {sizeMode === 'scale' ? (
        <div className="flex items-end gap-1">
          <div className="flex-1">
            <label className="text-xs text-gray-500">Scale X</label>
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
          <button
            onClick={() => setRatioLocked(!ratioLocked)}
            className={`flex-shrink-0 text-xs px-1 py-0.5 rounded transition-colors mb-px ${ratioLocked ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            title={ratioLocked ? 'Aspect ratio locked — click to unlock' : 'Aspect ratio unlocked — click to lock'}
          >
            {ratioLocked ? '🔒' : '🔓'}
          </button>
          <div className="flex-1">
            <label className="text-xs text-gray-500">Scale Y</label>
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
            <label className="text-xs text-gray-500">W (mm)</label>
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
          <button
            onClick={() => setRatioLocked(!ratioLocked)}
            className={`flex-shrink-0 text-xs px-1 py-0.5 rounded transition-colors mb-px ${ratioLocked ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            title={ratioLocked ? 'Aspect ratio locked — click to unlock' : 'Aspect ratio unlocked — click to lock'}
          >
            {ratioLocked ? '🔒' : '🔓'}
          </button>
          <div className="flex-1">
            <label className="text-xs text-gray-500">H (mm)</label>
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
        </div>
      )}

      {/* Rotation */}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <label className="text-xs text-gray-500">Rotation (°)</label>
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
        {/* Mirror buttons — flip around the layer's pivot point */}
        <div>
          <label className="text-xs text-gray-500">Flip (around pivot)</label>
          <div className="flex gap-1 mt-0.5">
            <button
              onClick={handleFlipX}
              className="flex-1 text-xs py-0.5 rounded transition-colors bg-gray-700 text-gray-400 hover:bg-gray-600 active:bg-orange-600 active:text-white"
              title="Flip horizontally around pivot"
            >↔ X</button>
            <button
              onClick={handleFlipY}
              className="flex-1 text-xs py-0.5 rounded transition-colors bg-gray-700 text-gray-400 hover:bg-gray-600 active:bg-orange-600 active:text-white"
              title="Flip vertically around pivot"
            >↕ Y</button>
          </div>
        </div>
      </div>

      {/* Pivot point selector */}
      <div>
        <label className="text-xs text-gray-500">Pivot</label>
        <div className="inline-grid grid-cols-3 gap-px mt-0.5 ml-2">
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

      {/* Info line */}
      {bbox && (
        <p className="text-xs text-gray-600">
          Natural: {naturalW.toFixed(1)} × {naturalH.toFixed(1)} mm
          {sizeMode === 'scale' && ` → ${absW.toFixed(1)} × ${absH.toFixed(1)} mm`}
        </p>
      )}
    </div>
  );
}
