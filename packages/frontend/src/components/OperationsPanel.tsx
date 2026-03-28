import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Operation, OperationType, Layer, MaterialPreset, Project } from '../types';
import { useProjectStore } from '../store/projectStore';
import { useToastStore } from '../store/toastStore';
import { useMachineStore } from '../store/machineStore';
import { useAppSettings } from '../store/appSettingsStore';
import { api } from '../api/client';
import { computeBoundingBox } from '../utils/geometry';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircle as faCircleSolid, faTrash, faClone, faChevronUp, faChevronDown, faGears, faEye, faBorderAll } from '@fortawesome/free-solid-svg-icons';
import { faCircle as faCircleRegular } from '@fortawesome/free-regular-svg-icons';

const OP_TYPE_LABELS: Record<OperationType, string> = {
  cut: '✂ Cut',
  engrave: '✏ Engrave',
  ignore: '✕ Ignore',
};

const OP_COLORS: Record<OperationType, string> = {
  cut: 'text-red-400',
  engrave: 'text-blue-400',
  ignore: 'text-gray-500',
};

interface OperationRowProps {
  op: Operation;
  onChange: (updated: Partial<Operation>) => void;
  onRemove: () => void;
  onToggleEnabled: () => void;
  onDuplicate: () => void;
  presets: MaterialPreset[];
  layers: Layer[];
  onAssignLayer: (layerId: string) => void;
  onUnassignLayer: (layerId: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: () => void;
  isDragOver: boolean;
}

function OperationRow({ op, onChange, onRemove, onToggleEnabled, onDuplicate, presets, layers, onAssignLayer, onUnassignLayer, onDragStart, onDragOver, onDrop, isDragOver }: OperationRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [localLabel, setLocalLabel] = useState(op.label ?? '');
  const [editingPower, setEditingPower] = useState(false);
  const [localPower, setLocalPower] = useState(String(op.power));

  const commitLabel = () => {
    const trimmed = localLabel.trim();
    onChange({ label: trimmed || undefined });
    setEditingLabel(false);
  };

  const commitPower = () => {
    const val = Math.max(0, Math.min(100, Math.round(Number(localPower) || 0)));
    onChange({ power: val });
    setLocalPower(String(val));
    setEditingPower(false);
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${op.enabled ? 'border-gray-700' : 'border-gray-800 opacity-60'} ${isDragOver ? 'border-orange-400 border-dashed' : ''}`}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(op.id); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      {/* Header — drag handle is restricted to this element only */}
      <div
        className="flex items-center gap-1 px-2 py-2 bg-gray-800 cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(op.id); }}
        onDragEnd={() => onDrop()}
      >
        <span className="text-xs text-gray-600 select-none mr-0.5">⠿</span>
        <button
          onClick={onToggleEnabled}
          className={`text-xs w-6 text-center flex-shrink-0 ${op.enabled ? 'text-green-400' : 'text-gray-600'}`}
          title={op.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        ><FontAwesomeIcon icon={op.enabled ? faCircleSolid : faCircleRegular} /></button>

        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <span className={`text-sm font-semibold ${OP_COLORS[op.type]}`}>
            {OP_TYPE_LABELS[op.type]}
          </span>
          {editingLabel ? (
            <input
              type="text"
              value={localLabel}
              onChange={e => setLocalLabel(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setEditingLabel(false); setLocalLabel(op.label ?? ''); } }}
              onClick={e => e.stopPropagation()}
              autoFocus
              className="flex-1 text-xs bg-gray-900 border border-orange-500 rounded px-1 py-0 text-gray-100 focus:outline-none min-w-0"
            />
          ) : (
            <span
              className={`text-xs truncate ${op.label ? 'text-gray-500' : 'text-gray-600 italic'}`}
              title="Double-click to rename"
              onDoubleClick={e => { e.stopPropagation(); setLocalLabel(op.label ?? ''); setEditingLabel(true); }}
            >{op.label ? `(${op.label})` : ''}</span>
          )}
          {op.layerIds.length === 0 && op.enabled && (
            <span className="text-xs text-yellow-500 ml-1 flex-shrink-0" title="No layers assigned">⚠</span>
          )}
          <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
            {op.feedRate}mm/min · {op.power}% · ×{op.passes}
          </span>
          <span className="text-gray-500 text-xs flex-shrink-0"><FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} /></span>
        </button>

        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={onDuplicate} className="text-gray-500 hover:text-gray-200 text-xs" title="Duplicate"><FontAwesomeIcon icon={faClone} /></button>
          <button onClick={onRemove} className="text-gray-500 hover:text-red-400 text-xs" title="Remove"><FontAwesomeIcon icon={faTrash} /></button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-3 py-3 bg-gray-900 space-y-3">
          {/* Assigned layers */}
          <div>
            <label className="text-xs text-gray-500 uppercase">Assigned Layers</label>
            <div className="mt-1 space-y-1">
              {op.layerIds.length === 0 && (
                <p className="text-xs text-yellow-500 italic">⚠ No layers assigned — operation inactive</p>
              )}
              {op.layerIds.map(lid => {
                const layer = layers.find(l => l.id === lid);
                return (
                  <div key={lid} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-300 truncate flex-1">{layer?.name ?? lid}</span>
                    <button onClick={() => onUnassignLayer(lid)} className="text-gray-500 hover:text-red-400">✕</button>
                  </div>
                );
              })}
            </div>
            {/* Add layer dropdown */}
            {layers.filter(l => !op.layerIds.includes(l.id)).length > 0 && (
              <select
                value=""
                onChange={e => { if (e.target.value) onAssignLayer(e.target.value); }}
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-orange-500"
              >
                <option value="">+ Assign layer…</option>
                {layers.filter(l => !op.layerIds.includes(l.id)).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-gray-500 uppercase">Type</label>
            <div className="flex gap-1 mt-1">
              {(['cut', 'engrave', 'ignore'] as OperationType[]).map(t => (
                <button
                  key={t}
                  onClick={() => onChange({ type: t })}
                  className={`flex-1 py-1 text-xs rounded font-semibold transition-colors ${
                    op.type === t
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >{t}</button>
              ))}
            </div>
          </div>

          {op.type !== 'ignore' && (
            <>
              {/* Material preset quick-apply */}
              {presets.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 uppercase">Material Preset</label>
                  <select
                    value=""
                    onChange={e => {
                      const preset = presets.find(p => p.id === e.target.value);
                      if (!preset) return;
                      const settings = op.type === 'engrave' ? preset.engrave : preset.cutThin;
                      onChange({ feedRate: settings.feedRate, power: settings.power, label: preset.name });
                    }}
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">— Apply preset —</option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.thickness}mm)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Feed rate */}
              <div>
                <label className="text-xs text-gray-500 uppercase">Feed Rate (mm/min)</label>
                <input
                  type="number"
                  value={op.feedRate}
                  min={1}
                  max={10000}
                  onChange={e => onChange({ feedRate: Number(e.target.value) })}
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Power */}
              <div>
                <div className="flex justify-between">
                  <label className="text-xs text-gray-500 uppercase">Power (%)</label>
                  {editingPower ? (
                    <input
                      type="number"
                      value={localPower}
                      min={0}
                      max={100}
                      onChange={e => setLocalPower(e.target.value)}
                      onBlur={commitPower}
                      onKeyDown={e => { if (e.key === 'Enter') commitPower(); if (e.key === 'Escape') { setEditingPower(false); setLocalPower(String(op.power)); } }}
                      autoFocus
                      className="w-14 text-xs bg-gray-900 border border-orange-500 rounded px-1 py-0 text-gray-100 text-right focus:outline-none"
                    />
                  ) : (
                    <span
                      className="text-xs text-gray-400 cursor-pointer hover:text-gray-200"
                      title="Double-click to enter power value"
                      onDoubleClick={() => { setLocalPower(String(op.power)); setEditingPower(true); }}
                    >{op.power}%</span>
                  )}
                </div>
                <input
                  type="range"
                  value={op.power}
                  min={0}
                  max={100}
                  onChange={e => onChange({ power: Number(e.target.value) })}
                  className="w-full accent-orange-500"
                />
              </div>

              {/* Passes */}
              <div>
                <label className="text-xs text-gray-500 uppercase">Passes</label>
                <input
                  type="number"
                  value={op.passes}
                  min={1}
                  max={20}
                  onChange={e => onChange({ passes: Number(e.target.value) })}
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Z offset */}
              <div>
                <label className="text-xs text-gray-500 uppercase">Z Offset (mm)</label>
                <input
                  type="number"
                  value={op.zOffset ?? 0}
                  step={0.1}
                  onChange={e => onChange({ zOffset: Number(e.target.value) })}
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  project: Project;
  layers: Layer[];
  originPosition: string;
  selectedLayerIds?: Set<string>;
}

export default function OperationsPanel({ project, layers, originPosition, selectedLayerIds }: Props) {
  const addOperation = useProjectStore(s => s.addOperation);
  const addOperationForLayers = useProjectStore(s => s.addOperationForLayers);
  const updateOperation = useProjectStore(s => s.updateOperation);
  const removeOperation = useProjectStore(s => s.removeOperation);
  const reorderOperation = useProjectStore(s => s.reorderOperation);
  const toggleOperationEnabled = useProjectStore(s => s.toggleOperationEnabled);
  const assignLayerToOperation = useProjectStore(s => s.assignLayerToOperation);
  const unassignLayerFromOperation = useProjectStore(s => s.unassignLayerFromOperation);
  const duplicateOperation = useProjectStore(s => s.duplicateOperation);
  const compileJob = useProjectStore(s => s.compileJob);
  const addToast = useToastStore(s => s.addToast);
  const connectionStatus = useMachineStore(s => s.connectionStatus);
  const sendCommand = useMachineStore(s => s.sendCommand);
  const workAreaHeight = useAppSettings(s => s.workAreaHeight);
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [presets, setPresets] = useState<MaterialPreset[]>([]);
  const dragOpId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/material-presets')
      .then(data => setPresets(data as MaterialPreset[]))
      .catch(() => { console.warn('Failed to load material presets'); });
  }, []);

  const handleDragStart = (id: string) => { dragOpId.current = id; };
  const handleDragOver = (id: string) => { setDragOverId(id); };
  const handleDrop = () => {
    if (dragOpId.current && dragOverId && dragOpId.current !== dragOverId) {
      const toIndex = project.operations.findIndex(op => op.id === dragOverId);
      if (toIndex >= 0) reorderOperation(dragOpId.current, toIndex);
    }
    dragOpId.current = null;
    setDragOverId(null);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await compileJob({
        originFlip: originPosition === 'bottom-left',
        workH: workAreaHeight,
      });
      addToast('success', 'G-code generated — job ready');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to generate G-code');
    } finally {
      setGenerating(false);
    }
  };

  /** Trace the bounding-box frame of all enabled-operation geometry with laser off. */
  const handleTraceFrame = async () => {
    const enabledOps = project.operations.filter(o => o.enabled && o.type !== 'ignore');
    if (enabledOps.length === 0) {
      addToast('error', 'No enabled operations');
      return;
    }

    // Compute the bounding box of all operation geometry with layer transforms applied
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasGeometry = false;
    for (const op of enabledOps) {
      for (const layerId of op.layerIds) {
        const layer = layers.find(l => l.id === layerId);
        if (!layer || layer.shapes.length === 0) continue;
        const layerBbox = computeBoundingBox(layer.shapes.map(s => ({ d: s.d })));
        if (!layerBbox) continue;
        hasGeometry = true;
        // Transform the four corners of the layer bbox through the layer transform
        const corners = [
          [layerBbox.minX, layerBbox.minY],
          [layerBbox.maxX, layerBbox.minY],
          [layerBbox.maxX, layerBbox.maxY],
          [layerBbox.minX, layerBbox.maxY],
        ];
        for (const [cx, cy] of corners) {
          const tx = layer.offsetX + cx * layer.scaleX;
          let ty = layer.offsetY + cy * layer.scaleY;
          if (originPosition === 'bottom-left') {
            ty = workAreaHeight - ty;
          }
          if (tx < minX) minX = tx;
          if (ty < minY) minY = ty;
          if (tx > maxX) maxX = tx;
          if (ty > maxY) maxY = ty;
        }
      }
    }

    if (!hasGeometry || !Number.isFinite(minX)) {
      addToast('error', 'No geometry in enabled operations');
      return;
    }

    const fmt = (n: number) => n.toFixed(3);
    const feedRate = Math.max(...enabledOps.map(o => o.feedRate));

    // Send G-code commands sequentially to trace the frame rectangle with laser off
    try {
      await sendCommand('M5');
      await sendCommand('G90');
      await sendCommand(`G0 X${fmt(minX)} Y${fmt(minY)}`);
      await sendCommand(`G1 X${fmt(maxX)} Y${fmt(minY)} F${feedRate}`);
      await sendCommand(`G1 X${fmt(maxX)} Y${fmt(maxY)} F${feedRate}`);
      await sendCommand(`G1 X${fmt(minX)} Y${fmt(maxY)} F${feedRate}`);
      await sendCommand(`G1 X${fmt(minX)} Y${fmt(minY)} F${feedRate}`);
      addToast('success', 'Tracing job frame…');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to trace frame');
    }
  };

  const operations = project.operations;
  const hasEnabledOps = operations.some(o => o.enabled);
  const gcodeUpToDate = project.gcodeUpToDate === true && !!project.gcode;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-200">Operations</h2>
        <p className="text-xs text-gray-500 mt-0.5">{project.name}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {operations.length === 0 ? (
          <div className="text-center text-gray-600 text-sm py-8">
            No operations. Add one below.
          </div>
        ) : (
          operations.map((op) => (
            <OperationRow
              key={op.id}
              op={op}
              onChange={partial => updateOperation(op.id, partial)}
              onRemove={() => removeOperation(op.id)}
              onToggleEnabled={() => toggleOperationEnabled(op.id)}
              onDuplicate={() => duplicateOperation(op.id)}
              presets={presets}
              layers={layers}
              onAssignLayer={layerId => assignLayerToOperation(op.id, layerId)}
              onUnassignLayer={layerId => unassignLayerFromOperation(op.id, layerId)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              isDragOver={dragOverId === op.id}
            />
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-700 space-y-2">
        <button
          onClick={() => {
            const ids = selectedLayerIds ? Array.from(selectedLayerIds) : [];
            if (ids.length > 0) {
              addOperationForLayers(ids);
            } else {
              addOperation();
            }
          }}
          className="w-full py-1.5 text-sm rounded border border-dashed border-gray-600 text-gray-400 hover:border-orange-500 hover:text-orange-400 transition-colors"
        >{selectedLayerIds && selectedLayerIds.size > 0
          ? `+ Add Operation for ${selectedLayerIds.size} layer${selectedLayerIds.size !== 1 ? 's' : ''}`
          : '+ Add Operation'}</button>

        <div className="flex gap-2">
          <button
            onClick={() => { void handleGenerate(); }}
            disabled={generating || !hasEnabledOps || gcodeUpToDate}
            className="flex-1 py-2 text-sm rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            title={gcodeUpToDate ? 'G-code is up to date' : 'Generate G-code from operations'}
          ><FontAwesomeIcon icon={faGears} className="mr-1" />{generating ? 'Generating…' : 'Generate'}</button>
          <button
            onClick={() => { void navigate('/gcode-preview'); }}
            disabled={!gcodeUpToDate}
            className="flex-1 py-2 text-sm rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            title={gcodeUpToDate ? 'Preview generated G-code' : 'Generate G-code first'}
          ><FontAwesomeIcon icon={faEye} className="mr-1" />Preview</button>
        </div>

        <button
          onClick={() => { void handleTraceFrame(); }}
          disabled={!hasEnabledOps || connectionStatus !== 'connected'}
          className="w-full py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 font-semibold transition-colors"
          title="Trace the bounding box of all operation geometry with laser off"
        ><FontAwesomeIcon icon={faBorderAll} className="mr-1" />Trace Frame</button>

        {project.gcode && (
          <p className={`text-xs text-center ${gcodeUpToDate ? 'text-green-400' : 'text-yellow-500'}`}>
            {gcodeUpToDate ? '✓ G-code ready' : '⚠ Changes pending — regenerate'}
            {' '}({project.gcode.split('\n').length.toLocaleString()} lines)
          </p>
        )}
      </div>
    </div>
  );
}
