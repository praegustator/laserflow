import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Operation, OperationType, Layer, MaterialPreset, Project } from '../types';
import { useProjectStore } from '../store/projectStore';
import { useToastStore } from '../store/toastStore';
import { useAppSettings } from '../store/appSettingsStore';
import { api } from '../api/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faToggleOn, faToggleOff, faTrash, faClone, faGears, faEye } from '@fortawesome/free-solid-svg-icons';

const OP_TYPE_LABELS: Record<OperationType, string> = {
  cut: '✂ Cut',
  engrave: '✏ Engrave',
};

const OP_COLORS: Record<OperationType, string> = {
  cut: 'text-red-400',
  engrave: 'text-blue-400',
};

/* ─── Helper: compute shared value across operations (null = mixed) ─── */
function sharedValue<T>(ops: Operation[], accessor: (op: Operation) => T): T | null {
  if (ops.length === 0) return null;
  const first = accessor(ops[0]);
  return ops.every(o => accessor(o) === first) ? first : null;
}

/* ─── Operation Parameters Panel (shown when 1+ operations are selected) ─── */
interface OperationParamsPanelProps {
  selectedOps: Operation[];
  presets: MaterialPreset[];
  onChange: (partial: Partial<Operation>) => void;
}

function OperationParamsPanel({ selectedOps, presets, onChange }: OperationParamsPanelProps) {
  const [editingPower, setEditingPower] = useState(false);
  const [localPower, setLocalPower] = useState('');

  const multiType = sharedValue(selectedOps, o => o.type);
  const multiFeedRate = sharedValue(selectedOps, o => o.feedRate);
  const multiPower = sharedValue(selectedOps, o => o.power);
  const multiPasses = sharedValue(selectedOps, o => o.passes);
  const multiZOffset = sharedValue(selectedOps, o => o.zOffset ?? 0);
  const multiLineInterval = sharedValue(selectedOps, o => o.engraveLineInterval ?? 0.1);
  const multiLineAngle = sharedValue(selectedOps, o => o.engraveLineAngle ?? 0);

  const anyEngrave = selectedOps.some(o => o.type === 'engrave');

  const commitPower = () => {
    const val = Math.max(0, Math.min(100, Math.round(Number(localPower) || 0)));
    onChange({ power: val });
    setLocalPower(String(val));
    setEditingPower(false);
  };

  const label = selectedOps.length === 1
    ? selectedOps[0].label || selectedOps[0].type
    : `${selectedOps.length} operations`;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        Parameters — {label}
      </p>

      {/* Type */}
      <div>
        <label className="text-xs text-gray-500 uppercase">Type</label>
        <div className="flex gap-1 mt-1">
          {(['cut', 'engrave'] as OperationType[]).map(t => (
            <button
              key={t}
              onClick={() => onChange({ type: t })}
              className={`flex-1 py-1 text-xs rounded font-semibold transition-colors ${
                multiType === t
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >{t}</button>
          ))}
        </div>
      </div>

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
                  // Apply cut or engrave preset depending on majority type
                  const useEngrave = multiType === 'engrave';
                  const settings = useEngrave ? preset.engrave : preset.cutThin;
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
              value={multiFeedRate ?? ''}
              placeholder={multiFeedRate === null ? 'mixed' : undefined}
              min={1}
              max={10000}
              onChange={e => { if (e.target.value) onChange({ feedRate: Number(e.target.value) }); }}
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Power */}
          <div>
            <div className="flex justify-between">
              <label className="text-xs text-gray-500 uppercase">Power (%)</label>
              {editingPower ? (
                <input
                  type="text"
                  inputMode="numeric"
                  value={localPower}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setLocalPower(v); }}
                  onBlur={commitPower}
                  onFocus={e => e.currentTarget.select()}
                  onKeyDown={e => { if (e.key === 'Enter') commitPower(); if (e.key === 'Escape') setEditingPower(false); }}
                  autoFocus
                  className="w-14 text-xs bg-gray-900 border border-orange-500 rounded px-1 py-0 text-gray-100 text-right focus:outline-none"
                />
              ) : (
                <span
                  className="text-xs text-gray-400 cursor-pointer hover:text-gray-200"
                  title="Double-click to enter power value"
                  onDoubleClick={() => { setLocalPower(String(multiPower ?? '')); setEditingPower(true); }}
                >{multiPower !== null ? `${multiPower}%` : 'mixed'}</span>
              )}
            </div>
            <input
              type="range"
              value={multiPower ?? 50}
              min={0}
              max={100}
              onChange={e => onChange({ power: Number(e.target.value) })}
              className={`w-full accent-orange-500 ${multiPower === null ? 'opacity-40' : ''}`}
            />
          </div>

          {/* Passes */}
          <div>
            <label className="text-xs text-gray-500 uppercase">Passes</label>
            <input
              type="number"
              value={multiPasses ?? ''}
              placeholder={multiPasses === null ? 'mixed' : undefined}
              min={1}
              max={20}
              onChange={e => { if (e.target.value) onChange({ passes: Number(e.target.value) }); }}
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Z Offset */}
          <div>
            <label className="text-xs text-gray-500 uppercase">Z Offset (mm)</label>
            <input
              type="number"
              value={multiZOffset ?? ''}
              placeholder={multiZOffset === null ? 'mixed' : undefined}
              step={0.1}
              onChange={e => { if (e.target.value !== '') onChange({ zOffset: Number(e.target.value) }); }}
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Engrave fill settings — shown when any selected op is engrave */}
          {anyEngrave && (
            <>
              <div className="pt-1 border-t border-gray-800">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Fill Engrave Settings</p>
                <p className="text-xs text-gray-600 mb-2">Controls hatch-fill for shapes with a fill colour.</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase">Line Interval (mm)</label>
                <input
                  type="number"
                  value={multiLineInterval ?? ''}
                  placeholder={multiLineInterval === null ? 'mixed' : undefined}
                  min={0.01}
                  max={10}
                  step={0.01}
                  onChange={e => { if (e.target.value) onChange({ engraveLineInterval: Number(e.target.value) }); }}
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase">Line Angle (°)</label>
                <input
                  type="number"
                  value={multiLineAngle ?? ''}
                  placeholder={multiLineAngle === null ? 'mixed' : undefined}
                  min={0}
                  max={359}
                  step={1}
                  onChange={e => { if (e.target.value !== '') onChange({ engraveLineAngle: Number(e.target.value) }); }}
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>
            </>
          )}
        </>
    </div>
  );
}

/* ─── Operation Row (compact: header + assigned layers only) ─── */

interface OperationRowProps {
  op: Operation;
  index: number;
  onRemove: () => void;
  onToggleEnabled: () => void;
  onDuplicate: () => void;
  onRename: (label: string | undefined) => void;
  layers: Layer[];
  onAssignLayer: (layerId: string) => void;
  onUnassignLayer: (layerId: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: () => void;
  isDragOver: boolean;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  isLayerHighlighted: boolean;
}

function OperationRow({ op, index, onRemove, onToggleEnabled, onDuplicate, onRename, layers, onAssignLayer, onUnassignLayer, onDragStart, onDragOver, onDrop, isDragOver, isSelected, onSelect, isLayerHighlighted }: OperationRowProps) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [localLabel, setLocalLabel] = useState(op.label ?? '');

  const commitLabel = () => {
    const trimmed = localLabel.trim();
    onRename(trimmed || undefined);
    setEditingLabel(false);
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${op.enabled ? 'border-gray-700' : 'border-gray-800 opacity-60'} ${isDragOver ? 'border-orange-400 border-dashed' : ''} ${isSelected ? 'ring-1 ring-orange-500' : ''}`}
      onClick={onSelect}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(op.id); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      {/* Header — drag handle is restricted to this element only */}
      <div
        className={`flex items-center gap-1 px-2 py-2 ${isLayerHighlighted ? 'bg-blue-900/25' : 'bg-gray-800'} cursor-grab active:cursor-grabbing`}
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(op.id); }}
        onDragEnd={() => onDrop()}
      >
        <span className="text-xs text-gray-600 select-none mr-0.5">⠿</span>
        <span className="text-xs text-gray-500 select-none w-5 text-center flex-shrink-0">{index}</span>
        <button
          onClick={onToggleEnabled}
          className={`text-xs w-6 text-center flex-shrink-0 ${op.enabled ? 'text-orange-400' : 'text-gray-600'}`}
          title={op.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        ><FontAwesomeIcon icon={op.enabled ? faToggleOn : faToggleOff} /></button>

        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className={`text-sm font-semibold whitespace-nowrap ${OP_COLORS[op.type]}`}>
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
              className={`text-xs truncate ${op.label ? 'text-gray-500' : 'text-gray-700 italic'}`}
              title="Double-click to rename"
              onDoubleClick={e => { e.stopPropagation(); setLocalLabel(op.label ?? ''); setEditingLabel(true); }}
            >{op.label ? `(${op.label})` : '(unnamed)'}</span>
          )}
          {op.layerIds.length === 0 && op.enabled && (
            <span className="text-xs text-yellow-500 ml-1 flex-shrink-0" title="No layers assigned">⚠</span>
          )}
          <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
            {op.feedRate}mm/min · {op.power}% · ×{op.passes}
          </span>
        </div>

        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={onDuplicate} className="text-gray-500 hover:text-gray-200 text-xs" title="Duplicate"><FontAwesomeIcon icon={faClone} /></button>
          <button onClick={onRemove} className="text-gray-500 hover:text-red-400 text-xs" title="Remove"><FontAwesomeIcon icon={faTrash} /></button>
        </div>
      </div>

      {/* Body — assigned layers always visible */}
      <div className="px-3 py-3 bg-gray-900 space-y-3">
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
      </div>
    </div>
  );
}

interface Props {
  project: Project;
  layers: Layer[];
  selectedLayerIds?: Set<string>;
  onSelectedOpIdsChange?: (layerIds: Set<string>) => void;
}

export default function OperationsPanel({ project, layers, selectedLayerIds, onSelectedOpIdsChange }: Props) {
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
  const originPosition = useAppSettings(s => s.originPosition);
  const workAreaHeight = useAppSettings(s => s.workAreaHeight);
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [presets, setPresets] = useState<MaterialPreset[]>([]);
  const dragOpId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedOpIds, setSelectedOpIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get('/api/material-presets')
      .then(data => setPresets(data as MaterialPreset[]))
      .catch(() => { console.warn('Failed to load material presets'); });
  }, []);

  // Notify parent of layer IDs referenced by currently selected ops (for cross-highlighting)
  useEffect(() => {
    if (!onSelectedOpIdsChange) return;
    const layerIds = new Set<string>();
    for (const op of project.operations) {
      if (selectedOpIds.has(op.id)) {
        op.layerIds.forEach(lid => layerIds.add(lid));
      }
    }
    onSelectedOpIdsChange(layerIds);
  }, [selectedOpIds, project.operations, onSelectedOpIdsChange]);

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

  const handleSelectOp = (id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedOpIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else if (e.shiftKey && selectedOpIds.size > 0) {
      const opIds = project.operations.map(op => op.id);
      const lastSelected = Array.from(selectedOpIds).pop()!;
      const fromIdx = opIds.indexOf(lastSelected);
      const toIdx = opIds.indexOf(id);
      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      setSelectedOpIds(new Set(opIds.slice(lo, hi + 1)));
    } else {
      setSelectedOpIds(prev => prev.has(id) && prev.size === 1 ? new Set() : new Set([id]));
    }
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

  const operations = project.operations;
  const hasEnabledOps = operations.some(o => o.enabled);
  const gcodeUpToDate = project.gcodeUpToDate === true && !!project.gcode;

  // Selected operations for the params panel (shown when 1+ ops selected)
  const selectedOps = operations.filter(o => selectedOpIds.has(o.id));

  const applyToSelected = (partial: Partial<Operation>) => {
    for (const id of selectedOpIds) {
      updateOperation(id, partial);
    }
  };

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
          operations.map((op) => {
            const isOpSelected = selectedOpIds.has(op.id);
            const isLayerHighlighted = !isOpSelected && !!selectedLayerIds && op.layerIds.some(lid => selectedLayerIds.has(lid));
            return (
            <OperationRow
              key={op.id}
              op={op}
              index={operations.indexOf(op) + 1}
              onRemove={() => removeOperation(op.id)}
              onToggleEnabled={() => toggleOperationEnabled(op.id)}
              onDuplicate={() => {
                const layerIds = selectedLayerIds ? Array.from(selectedLayerIds) : undefined;
                const newId = duplicateOperation(op.id, layerIds);
                if (newId) {
                  setSelectedOpIds(new Set([newId]));
                }
              }}
              onRename={label => updateOperation(op.id, { label })}
              layers={layers}
              onAssignLayer={layerId => assignLayerToOperation(op.id, layerId)}
              onUnassignLayer={layerId => unassignLayerFromOperation(op.id, layerId)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              isDragOver={dragOverId === op.id}
              isSelected={isOpSelected}
              onSelect={(e) => handleSelectOp(op.id, e)}
              isLayerHighlighted={isLayerHighlighted}
            />
            );
          })
        )}
      </div>

      {/* Separate parameters panel — shown when 1+ operations are selected */}
      {selectedOps.length >= 1 && (
        <div className="flex-shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-3 overflow-y-auto" style={{ maxHeight: '50%' }}>
          <OperationParamsPanel
            selectedOps={selectedOps}
            presets={presets}
            onChange={applyToSelected}
          />
        </div>
      )}

      <div className="px-4 py-3 border-t border-gray-700 space-y-2">
        <button
          onClick={() => {
            const ids = selectedLayerIds ? Array.from(selectedLayerIds) : [];
            let newId: string | null;
            if (ids.length > 0) {
              newId = addOperationForLayers(ids);
            } else {
              newId = addOperation();
            }
            if (newId) {
              setSelectedOpIds(new Set([newId]));
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
