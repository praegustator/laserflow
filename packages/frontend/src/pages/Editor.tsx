import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useJobStore } from '../store/jobStore';
import { useMachineStore } from '../store/machineStore';
import { useAppSettings } from '../store/appSettingsStore';
import { useToastStore } from '../store/toastStore';
import { useKeyboardShortcuts, type ShortcutDef } from '../hooks/useKeyboardShortcuts';
import SvgCanvas from '../components/SvgCanvas';
import OperationsPanel from '../components/OperationsPanel';
import LayerTransformPanel from '../components/LayerTransformPanel';
import { computeBoundingBox } from '../utils/geometry';
import type { Operation } from '../types';

const LAYER_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

export default function Editor() {
  const jobs = useJobStore(s => s.jobs);
  const activeJobId = useJobStore(s => s.activeJobId);
  const setActiveJobId = useJobStore(s => s.setActiveJobId);
  const fetchJobs = useJobStore(s => s.fetchJobs);
  const startJob = useJobStore(s => s.startJob);
  const uploadJob = useJobStore(s => s.uploadJob);
  const storeLayers = useJobStore(s => s.layers);
  const updateLayer = useJobStore(s => s.updateLayer);
  const removeLayer = useJobStore(s => s.removeLayer);
  const moveLayerUp = useJobStore(s => s.moveLayerUp);
  const moveLayerDown = useJobStore(s => s.moveLayerDown);
  const connectionStatus = useMachineStore(s => s.connectionStatus);
  const sendCommand = useMachineStore(s => s.sendCommand);
  const originPosition = useAppSettings(s => s.originPosition);
  const addToast = useToastStore(s => s.addToast);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { void fetchJobs(); }, [fetchJobs]);

  const activeJob = jobs.find(j => j.id === activeJobId) ?? null;

  useEffect(() => {
    if (activeJob) {
      setOperations(activeJob.operations.length > 0 ? activeJob.operations : []);
    }
  }, [activeJob]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const svgFiles = Array.from(files).filter(f => f.name.endsWith('.svg'));
    for (const file of svgFiles) {
      try {
        const job = await uploadJob(file);
        if (!activeJobId) setActiveJobId(job.id);
        addToast('success', `Imported ${file.name}`);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Upload failed');
      }
    }
  }, [uploadJob, activeJobId, setActiveJobId, addToast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files);
  };

  const handleStart = async () => {
    if (!activeJob) return;
    setStarting(true);
    try {
      await startJob(activeJob.id);
      addToast('success', 'Job started');
      void navigate('/console');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to start job');
    } finally {
      setStarting(false);
    }
  };

  const canStart = connectionStatus === 'connected' && !!activeJob?.gcode && !starting;
  const canFrame = connectionStatus === 'connected' && storeLayers.length > 0;

  const handleFrame = async () => {
    // Compute bounding box of all visible layers (applying layer transforms)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const layer of storeLayers) {
      if (!layer.visible) continue;
      const bbox = computeBoundingBox(layer.geometry);
      if (!bbox) continue;
      const x0 = layer.offsetX + bbox.minX * layer.scaleX;
      const y0 = layer.offsetY + bbox.minY * layer.scaleY;
      const x1 = layer.offsetX + bbox.maxX * layer.scaleX;
      const y1 = layer.offsetY + bbox.maxY * layer.scaleY;
      minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
      minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
    }
    if (!Number.isFinite(minX)) {
      addToast('info', 'No visible geometry to frame');
      return;
    }
    // Send rapid traverse around bounding box (laser off)
    const feed = 3000;
    try {
      await sendCommand('G90 G21'); // absolute, mm
      await sendCommand('M5 S0'); // laser off
      await sendCommand(`G0 X${minX.toFixed(2)} Y${minY.toFixed(2)} F${feed}`);
      await sendCommand(`G0 X${maxX.toFixed(2)} Y${minY.toFixed(2)}`);
      await sendCommand(`G0 X${maxX.toFixed(2)} Y${maxY.toFixed(2)}`);
      await sendCommand(`G0 X${minX.toFixed(2)} Y${maxY.toFixed(2)}`);
      await sendCommand(`G0 X${minX.toFixed(2)} Y${minY.toFixed(2)}`);
      addToast('success', `Framed: ${(maxX - minX).toFixed(1)} × ${(maxY - minY).toFixed(1)} mm`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Frame failed');
    }
  };

  // Keyboard shortcuts
  const shortcuts = useMemo<ShortcutDef[]>(() => [
    { key: 'i', ctrl: true, label: 'Import SVG', handler: () => fileInputRef.current?.click() },
    { key: 'Delete', label: 'Remove layer', handler: () => { if (selectedLayerId) { removeLayer(selectedLayerId); setSelectedLayerId(null); } } },
    { key: 'Escape', label: 'Deselect', handler: () => setSelectedLayerId(null) },
  ], [selectedLayerId, removeLayer]);
  useKeyboardShortcuts(shortcuts);

  return (
    <div
      className="flex flex-col h-full min-h-0"
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/80 border-4 border-dashed border-orange-400 pointer-events-none">
          <p className="text-2xl font-bold text-orange-400">Drop SVG file(s)</p>
        </div>
      )}
      {/* Top bar */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <label className="text-xs text-gray-500 uppercase flex-shrink-0">Job</label>
        <select
          value={activeJobId ?? ''}
          onChange={e => setActiveJobId(e.target.value || null)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500 max-w-xs"
        >
          <option value="">— Select a job —</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
          title="Import SVG (Ctrl+I)"
        >+ Import SVG</button>
        <input ref={fileInputRef} type="file" accept=".svg" multiple className="hidden" onChange={handleFileChange} />
        <div className="flex-1" />
        <button
          onClick={() => { void handleFrame(); }}
          disabled={!canFrame}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors"
          title="Rapid-traverse the bounding box to verify placement"
        >⬜ Frame</button>
        <button
          onClick={() => { void handleStart(); }}
          disabled={!canStart}
          className="px-4 py-1.5 text-sm rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
        >{starting ? 'Starting…' : '▶ Start Job'}</button>
        {connectionStatus !== 'connected' && (
          <span className="text-xs text-yellow-500">⚠ Connect machine first</span>
        )}
      </div>

      {activeJob ? (
        <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
          {/* Layers panel */}
          <Panel defaultSize={18} minSize={12} maxSize={35} className="bg-gray-900 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-300 uppercase">Layers</span>
              <button onClick={() => fileInputRef.current?.click()} className="text-xs text-orange-400 hover:text-orange-300">+ Add</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
              {storeLayers.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-4">No layers yet</p>
              )}
              {storeLayers.map((layer, idx) => (
                <div
                  key={layer.id}
                  onClick={() => setSelectedLayerId(layer.id)}
                  className={`rounded-lg border p-2 cursor-pointer transition-colors ${selectedLayerId === layer.id ? 'border-orange-500 bg-gray-800' : 'border-gray-700 hover:border-gray-600'}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: LAYER_COLORS[idx % LAYER_COLORS.length] }}
                      title={`Layer colour ${idx + 1}`}
                    />
                    <button
                      onClick={e => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                      className={`text-xs w-5 text-center ${layer.visible ? 'text-gray-200' : 'text-gray-600'}`}
                      title="Toggle visibility"
                    >{layer.visible ? '👁' : '🚫'}</button>
                    <span className="flex-1 text-xs text-gray-200 truncate" title={layer.name}>{layer.name}</span>
                    <button onClick={e => { e.stopPropagation(); moveLayerUp(layer.id); }} className="text-gray-500 hover:text-gray-200 text-xs" title="Move up" disabled={idx === 0}>↑</button>
                    <button onClick={e => { e.stopPropagation(); moveLayerDown(layer.id); }} className="text-gray-500 hover:text-gray-200 text-xs" title="Move down" disabled={idx === storeLayers.length - 1}>↓</button>
                    <button onClick={e => { e.stopPropagation(); removeLayer(layer.id); if (selectedLayerId === layer.id) setSelectedLayerId(null); }} className="text-gray-500 hover:text-red-400 text-xs" title="Remove">✕</button>
                  </div>
                  {selectedLayerId === layer.id && (
                    <LayerTransformPanel layer={layer} onUpdate={updateLayer} />
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-gray-800 hover:bg-orange-500/40 transition-colors cursor-col-resize" />

          {/* Canvas */}
          <Panel defaultSize={57} minSize={30} className="min-w-0 min-h-0">
            <SvgCanvas
              layers={storeLayers}
              operations={operations}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
              originPosition={originPosition}
            />
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-gray-800 hover:bg-orange-500/40 transition-colors cursor-col-resize" />

          {/* Operations panel */}
          <Panel defaultSize={25} minSize={15} maxSize={40} className="bg-gray-900 flex flex-col min-h-0">
            <OperationsPanel
              job={activeJob}
              operations={operations}
              onOperationsChange={setOperations}
              layers={storeLayers}
              selectedLayerId={selectedLayerId}
              originPosition={originPosition}
            />
          </Panel>
        </PanelGroup>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <div className="text-5xl mb-4">🖼</div>
            <h2 className="text-lg font-semibold text-gray-400">No job selected</h2>
            <p className="text-sm text-gray-600 mt-2 mb-6">Import an SVG file or select a job above</p>
            <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors">Import SVG</button>
          </div>
        </div>
      )}
    </div>
  );
}
