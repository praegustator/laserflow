import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useJobStore } from '../store/jobStore';
import { useMachineStore } from '../store/machineStore';
import { useAppSettings } from '../store/appSettingsStore';
import SvgCanvas from '../components/SvgCanvas';
import OperationsPanel from '../components/OperationsPanel';
import LayerTransformPanel from '../components/LayerTransformPanel';
import type { Operation } from '../types';

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
  const originPosition = useAppSettings(s => s.originPosition);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    }
  }, [uploadJob, activeJobId, setActiveJobId]);

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
    setError(null);
    try {
      await startJob(activeJob.id);
      void navigate('/console');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job');
    } finally {
      setStarting(false);
    }
  };

  const canStart = connectionStatus === 'connected' && !!activeJob?.gcode && !starting;

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
        >+ Import SVG</button>
        <input ref={fileInputRef} type="file" accept=".svg" multiple className="hidden" onChange={handleFileChange} />
        <div className="flex-1" />
        {error && <p className="text-xs text-red-400">{error}</p>}
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
