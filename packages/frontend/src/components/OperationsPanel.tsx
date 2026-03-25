import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Operation, OperationType, Layer, MaterialPreset, Project } from '../types';
import { useProjectStore } from '../store/projectStore';
import { useJobStore } from '../store/jobStore';
import { useToastStore } from '../store/toastStore';
import { api } from '../api/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircle as faCircleSolid, faTrash, faClone, faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons';
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

  const commitLabel = () => {
    const trimmed = localLabel.trim();
    onChange({ label: trimmed || undefined });
    setEditingLabel(false);
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${op.enabled ? 'border-gray-700' : 'border-gray-800 opacity-60'} ${isDragOver ? 'border-orange-400 border-dashed' : ''}`}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(op.id); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(op.id); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      onDragEnd={() => onDrop()}
    >
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-2 bg-gray-800 cursor-grab active:cursor-grabbing">
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
                <p className="text-xs text-gray-600 italic">No layers assigned</p>
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
                  <span className="text-xs text-gray-400">{op.power}%</span>
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
  const startJob = useJobStore(s => s.startJob);
  const addToast = useToastStore(s => s.addToast);
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
      });
      addToast('success', 'G-code generated — job ready');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to generate G-code');
    } finally {
      setGenerating(false);
    }
  };

  const handleStart = async () => {
    if (!project.jobId) {
      addToast('error', 'Generate G-code first');
      return;
    }
    try {
      await startJob(project.jobId);
      addToast('success', 'Job started');
      void navigate('/console');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to start job');
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

        <button
          onClick={() => {
            if (gcodeUpToDate) {
              void navigate('/gcode-preview');
            } else {
              void handleGenerate();
            }
          }}
          disabled={generating || !hasEnabledOps}
          className="w-full py-2 text-sm rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          title={gcodeUpToDate ? 'G-code is up to date — click to preview' : 'Generate G-code from operations'}
        >{generating ? 'Generating…' : gcodeUpToDate ? '📋 Preview G-code →' : '⚙ Generate G-code'}</button>

        {project.gcode && (
          <p className={`text-xs text-center ${gcodeUpToDate ? 'text-green-400' : 'text-yellow-500'}`}>
            {gcodeUpToDate ? '✓ G-code ready' : '⚠ Changes pending — regenerate'}
            {' '}({project.gcode.split('\n').length.toLocaleString()} lines)
          </p>
        )}
        {project.gcode && (
          <button
            onClick={() => { void handleStart(); }}
            className="w-full py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-semibold transition-colors"
          >▶ Start Job</button>
        )}
      </div>
    </div>
  );
}
