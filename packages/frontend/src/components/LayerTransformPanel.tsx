import { useState, useEffect, useCallback } from 'react';
import type { Layer, PathGeometry } from '../types';

interface Props {
  layer: Layer;
  onUpdate: (id: string, partial: Partial<Layer>) => void;
}

/** Compute the axis-aligned bounding box of an array of SVG path geometries.
 *  This is a fast approximation using the path data "d" string — it looks at
 *  all numeric coordinate pairs in move/line/curve commands.
 */
function computeBoundingBox(geometry: PathGeometry[]): { width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const g of geometry) {
    // Extract all numbers from the path data.
    // Path data looks like "M 10 20 L 30 40 C 50 60 ..."
    const nums = g.d.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) continue;
    // Pair them as (x, y)
    for (let i = 0; i < nums.length - 1; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { width: maxX - minX, height: maxY - minY };
}

/** Parse a decimal string that may use comma or dot as separator */
function parseDecimal(v: string): number {
  return Number(v.replace(',', '.'));
}

type SizeMode = 'scale' | 'absolute';

export default function LayerTransformPanel({ layer, onUpdate }: Props) {
  const [sizeMode, setSizeMode] = useState<SizeMode>('scale');
  const [ratioLocked, setRatioLocked] = useState(true);
  const bbox = computeBoundingBox(layer.geometry);

  // Local text state so the user can type freely (including commas)
  const [localScaleX, setLocalScaleX] = useState(String(layer.scaleX));
  const [localScaleY, setLocalScaleY] = useState(String(layer.scaleY));
  const [localOffsetX, setLocalOffsetX] = useState(String(layer.offsetX));
  const [localOffsetY, setLocalOffsetY] = useState(String(layer.offsetY));

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
    const w = naturalW * layer.scaleX;
    const h = naturalH * layer.scaleY;
    setLocalAbsW(String(Math.round(w * 100) / 100));
    setLocalAbsH(String(Math.round(h * 100) / 100));
  }, [layer.scaleX, layer.scaleY, layer.offsetX, layer.offsetY, naturalW, naturalH]);

  const commitOffset = useCallback((field: 'offsetX' | 'offsetY', raw: string) => {
    const v = parseDecimal(raw);
    if (Number.isFinite(v)) {
      onUpdate(layer.id, { [field]: v });
    }
  }, [layer.id, onUpdate]);

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

  const inputClass = 'w-full text-xs bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 focus:outline-none focus:border-orange-500';

  return (
    <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
      {/* Position */}
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

      {/* Size mode toggle + ratio lock */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSizeMode(sizeMode === 'scale' ? 'absolute' : 'scale')}
          className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          title={sizeMode === 'scale' ? 'Switch to absolute size (mm)' : 'Switch to scale multiplier'}
        >
          {sizeMode === 'scale' ? 'Scale ×' : 'Size mm'}
        </button>
        <button
          onClick={() => setRatioLocked(!ratioLocked)}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${ratioLocked ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          title={ratioLocked ? 'Aspect ratio locked — click to unlock' : 'Aspect ratio unlocked — click to lock'}
        >
          {ratioLocked ? '🔒' : '🔓'}
        </button>
      </div>

      {/* Scale or absolute size inputs */}
      {sizeMode === 'scale' ? (
        <div className="grid grid-cols-2 gap-1">
          <div>
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
          <div>
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
        <div className="grid grid-cols-2 gap-1">
          <div>
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
          <div>
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

      {/* Info line */}
      {bbox && (
        <p className="text-xs text-gray-600">
          Original: {naturalW.toFixed(1)} × {naturalH.toFixed(1)} mm
          {sizeMode === 'scale' && ` → ${absW.toFixed(1)} × ${absH.toFixed(1)} mm`}
        </p>
      )}
    </div>
  );
}
