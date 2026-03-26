import { useState, useCallback, useMemo } from 'react';
import type { Shape } from '../types';
import { computeShapesBoundingBox, transformPath, type AffineMatrix } from '../utils/geometry';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsLeftRight, faArrowsUpDown, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';

interface Props {
  shapes: Shape[];
  layerId: string;
  onUpdatePaths: (layerId: string, updates: Record<string, string>) => void;
  originPosition?: 'bottom-left' | 'top-left';
  workH?: number;
}

/** Parse a decimal string that may use comma or dot as separator */
function parseDecimal(v: string): number {
  return Number(v.replace(/,/g, '.'));
}

/**
 * Build a translation matrix.
 */
function translateMatrix(dx: number, dy: number): AffineMatrix {
  return [1, 0, 0, 1, dx, dy];
}

/**
 * Build a scale matrix around a center point.
 */
function scaleAroundMatrix(sx: number, sy: number, cx: number, cy: number): AffineMatrix {
  return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
}

/**
 * Build a rotation matrix around a center point.
 * @param deg - rotation in degrees (clockwise)
 */
function rotateAroundMatrix(deg: number, cx: number, cy: number): AffineMatrix {
  const theta = (deg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [cos, sin, -sin, cos, -cos * cx + sin * cy + cx, -sin * cx - cos * cy + cy];
}

export default function ShapeTransformPanel({ shapes, layerId, onUpdatePaths, originPosition = 'top-left', workH = 200 }: Props) {
  const [ratioLocked, setRatioLocked] = useState(true);

  // Delta inputs
  const [deltaX, setDeltaX] = useState('0');
  const [deltaY, setDeltaY] = useState('0');
  const [deltaScaleX, setDeltaScaleX] = useState('1');
  const [deltaScaleY, setDeltaScaleY] = useState('1');
  const [deltaRot, setDeltaRot] = useState('0');

  const bbox = useMemo(() => computeShapesBoundingBox(shapes), [shapes]);

  // Info
  const w = bbox?.width ?? 0;
  const h = bbox?.height ?? 0;
  const cx = bbox ? bbox.minX + bbox.width / 2 : 0;
  const cy = bbox ? bbox.minY + bbox.height / 2 : 0;
  const displayCy = originPosition === 'bottom-left' ? workH - cy : cy;

  /** Apply an affine matrix to all selected shapes and commit. */
  const applyMatrix = useCallback((matrix: AffineMatrix) => {
    const updates: Record<string, string> = {};
    for (const s of shapes) {
      updates[s.id] = transformPath(s.d, matrix);
    }
    onUpdatePaths(layerId, updates);
  }, [shapes, layerId, onUpdatePaths]);

  /** Apply relative move delta. */
  const commitDelta = useCallback(() => {
    const dx = parseDecimal(deltaX);
    const dy = parseDecimal(deltaY);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (dx === 0 && dy === 0) return;
    const svgDy = originPosition === 'bottom-left' ? -dy : dy;
    applyMatrix(translateMatrix(dx, svgDy));
    setDeltaX('0');
    setDeltaY('0');
  }, [deltaX, deltaY, originPosition, applyMatrix]);

  /** Apply relative scale around the shapes' center. */
  const commitDeltaScale = useCallback(() => {
    const dsx = parseDecimal(deltaScaleX);
    const dsy = ratioLocked ? dsx : parseDecimal(deltaScaleY);
    if (!Number.isFinite(dsx) || dsx <= 0 || !Number.isFinite(dsy) || dsy <= 0) return;
    if (dsx === 1 && dsy === 1) return;
    applyMatrix(scaleAroundMatrix(dsx, dsy, cx, cy));
    setDeltaScaleX('1');
    setDeltaScaleY('1');
  }, [deltaScaleX, deltaScaleY, ratioLocked, cx, cy, applyMatrix]);

  /** Apply relative rotation around the shapes' center. */
  const commitDeltaRot = useCallback(() => {
    const dr = parseDecimal(deltaRot);
    if (!Number.isFinite(dr) || dr === 0) return;
    applyMatrix(rotateAroundMatrix(dr, cx, cy));
    setDeltaRot('0');
  }, [deltaRot, cx, cy, applyMatrix]);

  /** Flip horizontally around the center. */
  const handleFlipX = useCallback(() => {
    applyMatrix(scaleAroundMatrix(-1, 1, cx, cy));
  }, [cx, cy, applyMatrix]);

  /** Flip vertically around the center. */
  const handleFlipY = useCallback(() => {
    applyMatrix(scaleAroundMatrix(1, -1, cx, cy));
  }, [cx, cy, applyMatrix]);

  const inputClass = 'w-full text-xs bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 focus:outline-none focus:border-orange-500';

  return (
    <div className="mt-1 space-y-2" onClick={e => e.stopPropagation()}>
      {/* ── Position (relative) ── */}
      <div>
        <label className="text-xs text-gray-500">Position</label>
        <div className="flex items-end gap-1">
          <div className="flex-1">
            <label className="text-xs text-gray-500">ΔX</label>
            <input
              type="text" inputMode="decimal" value={deltaX}
              onChange={e => setDeltaX(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitDelta(); }}
              className={inputClass} placeholder="±mm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500">ΔY</label>
            <input
              type="text" inputMode="decimal" value={deltaY}
              onChange={e => setDeltaY(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitDelta(); }}
              className={inputClass} placeholder="±mm"
            />
          </div>
          <button onClick={commitDelta}
            className="text-xs px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors flex-shrink-0"
          >Move</button>
        </div>
      </div>

      {/* ── Size (relative scale) ── */}
      <div>
        <div className="flex items-center gap-1 mb-0.5">
          <label className="text-xs text-gray-500 flex-1">Size</label>
          <span className="text-xs text-gray-600 italic">relative ×</span>
          <button
            onClick={() => setRatioLocked(!ratioLocked)}
            className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded transition-colors ${ratioLocked ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            title={ratioLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
          >
            <FontAwesomeIcon icon={ratioLocked ? faLock : faLockOpen} />
          </button>
        </div>
        <div className="flex items-end gap-1">
          <div className="flex-1">
            <label className="text-xs text-gray-500">×X</label>
            <input
              type="text" inputMode="decimal" value={deltaScaleX}
              onChange={e => setDeltaScaleX(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitDeltaScale(); }}
              className={inputClass} placeholder="1.0"
            />
          </div>
          {!ratioLocked && (
            <div className="flex-1">
              <label className="text-xs text-gray-500">×Y</label>
              <input
                type="text" inputMode="decimal" value={deltaScaleY}
                onChange={e => setDeltaScaleY(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitDeltaScale(); }}
                className={inputClass} placeholder="1.0"
              />
            </div>
          )}
          <button onClick={commitDeltaScale}
            className="text-xs px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors flex-shrink-0"
          >Scale</button>
        </div>
      </div>

      {/* ── Rotation ── */}
      <div>
        <label className="text-xs text-gray-500">Rotation</label>
        <div className="flex items-end gap-1">
          <div className="flex-1">
            <label className="text-xs text-gray-500">Δ°</label>
            <input
              type="text" inputMode="decimal" value={deltaRot}
              onChange={e => setDeltaRot(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitDeltaRot(); }}
              className={inputClass} placeholder="±°"
            />
          </div>
          <button onClick={commitDeltaRot}
            className="text-xs px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors flex-shrink-0"
          >Rotate</button>
        </div>
      </div>

      {/* ── Flip ── */}
      <div>
        <label className="text-xs text-gray-500 mb-0.5 block">Flip</label>
        <div className="flex gap-1">
          <button
            onClick={handleFlipX}
            className="flex items-center justify-center w-7 h-7 rounded transition-colors bg-gray-700 text-gray-400 hover:bg-gray-600 active:bg-orange-600 active:text-white"
            title="Flip horizontally"
          ><FontAwesomeIcon icon={faArrowsLeftRight} className="text-xs" /></button>
          <button
            onClick={handleFlipY}
            className="flex items-center justify-center w-7 h-7 rounded transition-colors bg-gray-700 text-gray-400 hover:bg-gray-600 active:bg-orange-600 active:text-white"
            title="Flip vertically"
          ><FontAwesomeIcon icon={faArrowsUpDown} className="text-xs" /></button>
        </div>
      </div>

      {/* Info line */}
      {bbox && (
        <p className="text-xs text-gray-600">
          {w.toFixed(1)}×{h.toFixed(1)} mm
          {' · center '}({cx.toFixed(1)}, {displayCy.toFixed(1)})
        </p>
      )}
    </div>
  );
}
