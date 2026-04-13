import { useState, useEffect, useMemo } from 'react';
import { useAppSettings } from '../store/appSettingsStore';
import { api } from '../api/client';

/** Common DPI presets for quick selection. */
const DPI_PRESETS = [72, 96, 150, 254, 300, 600];

interface ImageInfo {
  width: number;
  height: number;
  dpi: number | null;
  widthMm: number | null;
  heightMm: number | null;
}

interface Props {
  file: File;
  onConfirm: (file: File, dpi: number) => void;
  onCancel: () => void;
}

export default function ImageImportDialog({ file, onConfirm, onCancel }: Props) {
  const workAreaWidth = useAppSettings(s => s.workAreaWidth);
  const workAreaHeight = useAppSettings(s => s.workAreaHeight);
  const originPosition = useAppSettings(s => s.originPosition);

  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dpi, setDpi] = useState<number>(96);
  const [dpiInput, setDpiInput] = useState('96');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Load image preview and fetch DPI metadata from backend
  useEffect(() => {
    let cancelled = false;

    // Create a local preview URL for the image thumbnail
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Helper: get pixel dimensions from the browser
    const getPixelDimensions = (): Promise<{ width: number; height: number }> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.src = objectUrl;
      });

    // Try to fetch metadata from backend; fall back to browser-only on failure
    const form = new FormData();
    form.append('file', file);
    (api.postForm('/api/image-info', form) as Promise<ImageInfo>)
      .then((info) => {
        if (cancelled) return;
        setImageInfo(info);
        const detectedDpi = info.dpi && info.dpi > 0 ? info.dpi : 96;
        setDpi(detectedDpi);
        setDpiInput(String(detectedDpi));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Backend unavailable — fall back to browser-only (no embedded-DPI detection)
        getPixelDimensions()
          .then(({ width, height }) => {
            if (cancelled) return;
            setImageInfo({ width, height, dpi: null, widthMm: null, heightMm: null });
            setDpi(96);
            setDpiInput('96');
            setLoading(false);
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            setError(err instanceof Error ? err.message : 'Failed to read image');
            setLoading(false);
          });
      });

    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  // Computed physical dimensions based on current DPI
  const dimensions = useMemo(() => {
    if (!imageInfo) return null;
    const w = (imageInfo.width / dpi) * 25.4;
    const h = (imageInfo.height / dpi) * 25.4;
    return { widthMm: w, heightMm: h };
  }, [imageInfo, dpi]);

  // Handle DPI input changes
  const handleDpiChange = (value: string) => {
    setDpiInput(value);
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      setDpi(parsed);
    }
  };

  const handleDpiBlur = () => {
    // Snap to current valid value on blur
    setDpiInput(String(dpi));
  };

  const handleConfirm = () => {
    onConfirm(file, dpi);
  };

  // Board preview: render a scaled-down representation of the work area with the image projected on it
  const PREVIEW_MAX_W = 360;
  const PREVIEW_MAX_H = 280;
  const boardScale = Math.min(PREVIEW_MAX_W / workAreaWidth, PREVIEW_MAX_H / workAreaHeight);
  const boardW = workAreaWidth * boardScale;
  const boardH = workAreaHeight * boardScale;

  const imgScaledW = dimensions ? dimensions.widthMm * boardScale : 0;
  const imgScaledH = dimensions ? dimensions.heightMm * boardScale : 0;

  // Position image: top-left of work area for top-left origin, bottom-left for bottom-left origin
  const imgTop = originPosition === 'bottom-left' ? boardH - imgScaledH : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">Import Image</h3>
          <span className="text-xs text-gray-400 truncate ml-2 max-w-[200px]">{file.name}</span>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              Reading image metadata…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-400 text-sm">{error}</div>
          ) : imageInfo && dimensions ? (
            <>
              {/* Board preview with image projected on it */}
              <div className="flex justify-center mb-4">
                <div
                  className="relative border border-gray-600 bg-gray-900/60 overflow-hidden"
                  style={{ width: boardW, height: boardH }}
                >
                  {/* Grid lines */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${boardW} ${boardH}`}>
                    {/* Vertical grid lines every 10mm */}
                    {Array.from({ length: Math.floor(workAreaWidth / 10) + 1 }, (_, i) => (
                      <line
                        key={`v${i}`}
                        x1={i * 10 * boardScale}
                        y1={0}
                        x2={i * 10 * boardScale}
                        y2={boardH}
                        stroke="rgba(100,116,139,0.2)"
                        strokeWidth={i % 5 === 0 ? 0.8 : 0.3}
                      />
                    ))}
                    {/* Horizontal grid lines every 10mm */}
                    {Array.from({ length: Math.floor(workAreaHeight / 10) + 1 }, (_, i) => (
                      <line
                        key={`h${i}`}
                        x1={0}
                        y1={i * 10 * boardScale}
                        x2={boardW}
                        y2={i * 10 * boardScale}
                        stroke="rgba(100,116,139,0.2)"
                        strokeWidth={i % 5 === 0 ? 0.8 : 0.3}
                      />
                    ))}
                    {/* Image outline */}
                    <rect
                      x={0}
                      y={imgTop}
                      width={imgScaledW}
                      height={imgScaledH}
                      fill="none"
                      stroke="#f97316"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />
                  </svg>
                  {/* Image preview */}
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="absolute object-contain opacity-80"
                      style={{
                        left: 0,
                        top: imgTop,
                        width: imgScaledW,
                        height: imgScaledH,
                      }}
                    />
                  )}
                  {/* Board label */}
                  <span className="absolute bottom-1 right-1 text-[9px] text-gray-500">
                    {workAreaWidth}×{workAreaHeight} mm
                  </span>
                  {/* Origin marker */}
                  <span
                    className="absolute text-[9px] text-orange-500 font-bold"
                    style={{
                      left: 2,
                      ...(originPosition === 'bottom-left' ? { bottom: 2 } : { top: 2 }),
                    }}
                  >
                    ⊕
                  </span>
                </div>
              </div>

              {/* Info row */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mb-4">
                <div className="text-gray-400">
                  Pixels: <span className="text-gray-200">{imageInfo.width} × {imageInfo.height}</span>
                </div>
                <div className="text-gray-400">
                  Detected DPI: <span className="text-gray-200">{imageInfo.dpi ?? 'none'}</span>
                </div>
                <div className="text-gray-400">
                  Physical size: <span className="text-orange-300 font-medium">{dimensions.widthMm.toFixed(1)} × {dimensions.heightMm.toFixed(1)} mm</span>
                </div>
                <div className="text-gray-400">
                  ≈ <span className="text-gray-200">{(dimensions.widthMm / 10).toFixed(2)} × {(dimensions.heightMm / 10).toFixed(2)} cm</span>
                </div>
              </div>

              {/* DPI control */}
              <div className="flex items-center gap-3 mb-1">
                <label className="text-xs text-gray-400 whitespace-nowrap">DPI:</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={dpiInput}
                  onChange={(e) => handleDpiChange(e.target.value)}
                  onBlur={handleDpiBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                  className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500 text-center"
                />
                <div className="flex gap-1 flex-wrap">
                  {DPI_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => { setDpi(preset); setDpiInput(String(preset)); }}
                      className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                        dpi === preset
                          ? 'bg-orange-600 border-orange-500 text-white'
                          : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Overflow warning */}
              {dimensions.widthMm > workAreaWidth || dimensions.heightMm > workAreaHeight ? (
                <p className="text-[10px] text-yellow-500 mt-2">
                  ⚠ Image exceeds work area ({workAreaWidth}×{workAreaHeight} mm). You can scale the layer after import.
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !!error}
            className="px-4 py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors disabled:opacity-40"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
