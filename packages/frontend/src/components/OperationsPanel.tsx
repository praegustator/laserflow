import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Operation, OperationType, EngravePattern, Layer, MaterialPreset, Project } from '../types';
import { useProjectStore } from '../store/projectStore';
import { useJobStore } from '../store/jobStore';
import { useToastStore } from '../store/toastStore';
import { useAppSettings } from '../store/appSettingsStore';
import { api } from '../api/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faToggleOn, faToggleOff, faTrash, faClone, faPlus, faGears, faEye, faPencil } from '@fortawesome/free-solid-svg-icons';

const OP_TYPE_LABELS: Record<OperationType, string> = {
  cut: 'Cut',
  engrave: 'Engrave',
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
  const multiType = sharedValue(selectedOps, o => o.type);
  const multiFeedRate = sharedValue(selectedOps, o => o.feedRate);
  const multiPower = sharedValue(selectedOps, o => o.power);
  const multiPasses = sharedValue(selectedOps, o => o.passes);
  const multiZOffset = sharedValue(selectedOps, o => o.zOffset ?? 0);
  const multiLineInterval = sharedValue(selectedOps, o => o.engraveLineInterval ?? 0.1);
  const multiLineAngle = sharedValue(selectedOps, o => o.engraveLineAngle ?? 0);
  const multiPattern = sharedValue(selectedOps, o => o.engravePattern ?? 'lines');

  const anyEngrave = selectedOps.some(o => o.type === 'engrave');
  const patternHasAngle = multiPattern === 'lines' || multiPattern === 'crosshatch' || multiPattern === 'dots' || multiPattern === null;

  // Local text state for each numeric field — always-visible inputs
  const [localFeedRate, setLocalFeedRate] = useState(String(multiFeedRate ?? ''));
  const [localPower, setLocalPower] = useState(String(multiPower ?? ''));
  const [localPasses, setLocalPasses] = useState(String(multiPasses ?? ''));
  const [localZOffset, setLocalZOffset] = useState(String(multiZOffset ?? 0));
  const [localLineInterval, setLocalLineInterval] = useState(String(multiLineInterval ?? 0.1));
  const [localLineAngle, setLocalLineAngle] = useState(String(multiLineAngle ?? 0));

  // Sync local state when the external values change (e.g. after commit or preset apply)
  useEffect(() => { setLocalFeedRate(multiFeedRate !== null ? String(multiFeedRate) : ''); }, [multiFeedRate]);
  useEffect(() => { setLocalPower(multiPower !== null ? String(multiPower) : ''); }, [multiPower]);
  useEffect(() => { setLocalPasses(multiPasses !== null ? String(multiPasses) : ''); }, [multiPasses]);
  useEffect(() => { setLocalZOffset(multiZOffset !== null ? String(multiZOffset) : ''); }, [multiZOffset]);
  useEffect(() => { setLocalLineInterval(multiLineInterval !== null ? String(multiLineInterval) : ''); }, [multiLineInterval]);
  useEffect(() => { setLocalLineAngle(multiLineAngle !== null ? String(multiLineAngle) : ''); }, [multiLineAngle]);

  const commitFeedRate = () => {
    const val = Math.max(1, Math.min(10000, Math.round(Number(localFeedRate) || 1)));
    onChange({ feedRate: val });
  };

  const commitPower = () => {
    const val = Math.max(0, Math.min(100, Math.round(Number(localPower) || 0)));
    onChange({ power: val });
  };

  const commitPasses = () => {
    const val = Math.max(1, Math.min(20, Math.round(Number(localPasses) || 1)));
    onChange({ passes: val });
  };

  const commitZOffset = () => {
    const val = Number(localZOffset) || 0;
    onChange({ zOffset: Math.round(val * 10) / 10 });
  };

  const commitLineInterval = () => {
    const val = Math.max(0.01, Math.min(10, Number(localLineInterval) || 0.1));
    onChange({ engraveLineInterval: Math.round(val * 100) / 100 });
  };

  const commitLineAngle = () => {
    const val = Math.max(0, Math.min(359, Math.round(Number(localLineAngle) || 0)));
    onChange({ engraveLineAngle: val });
  };

  const label = selectedOps.length === 1
    ? selectedOps[0].label || selectedOps[0].type
    : `${selectedOps.length} operations`;

  // Shared input class — matches transform panel style
  const inputCls = 'w-16 text-xs bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 text-right focus:outline-none focus:border-orange-500';

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
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-gray-500 uppercase shrink-0">Feed Rate (mm/min)</label>
            <input
              type="text" inputMode="numeric"
              value={localFeedRate}
              onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setLocalFeedRate(v); }}
              onBlur={commitFeedRate}
              onFocus={e => e.currentTarget.select()}
              onKeyDown={e => { if (e.key === 'Enter') commitFeedRate(); }}
              placeholder={multiFeedRate === null ? 'mixed' : undefined}
              className={inputCls}
            />
          </div>

          {/* Power */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-gray-500 uppercase shrink-0">Power (%)</label>
              <input
                type="text" inputMode="numeric"
                value={localPower}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setLocalPower(v); }}
                onBlur={commitPower}
                onFocus={e => e.currentTarget.select()}
                onKeyDown={e => { if (e.key === 'Enter') commitPower(); }}
                placeholder={multiPower === null ? 'mixed' : undefined}
                className={inputCls}
              />
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
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-gray-500 uppercase shrink-0">Passes</label>
            <input
              type="text" inputMode="numeric"
              value={localPasses}
              onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setLocalPasses(v); }}
              onBlur={commitPasses}
              onFocus={e => e.currentTarget.select()}
              onKeyDown={e => { if (e.key === 'Enter') commitPasses(); }}
              placeholder={multiPasses === null ? 'mixed' : undefined}
              className={inputCls}
            />
          </div>

          {/* Z Offset */}
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-gray-500 uppercase shrink-0">Z Offset (mm)</label>
            <input
              type="text" inputMode="decimal"
              value={localZOffset}
              onChange={e => { const v = e.target.value; if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) setLocalZOffset(v); }}
              onBlur={commitZOffset}
              onFocus={e => e.currentTarget.select()}
              onKeyDown={e => { if (e.key === 'Enter') commitZOffset(); }}
              placeholder={multiZOffset === null ? 'mixed' : undefined}
              className={inputCls}
            />
          </div>

          {/* Engrave fill settings — shown when any selected op is engrave */}
          {anyEngrave && (
            <>
              <div className="pt-1 border-t border-gray-800">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Fill Engrave Settings</p>
                <p className="text-xs text-gray-600 mb-2">Controls fill for shapes with a fill colour.</p>
              </div>

              {/* Pattern selector */}
              <div>
                <label className="text-xs text-gray-500 uppercase">Pattern</label>
                <div className="grid grid-cols-4 gap-1 mt-1">
                  {(['lines', 'crosshatch', 'spiral', 'dots'] as EngravePattern[]).map(p => (
                    <button
                      key={p}
                      onClick={() => onChange({ engravePattern: p })}
                      className={`py-1 text-xs rounded font-semibold transition-colors capitalize ${
                        multiPattern === p
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      title={p}
                    >{p === 'crosshatch' ? 'Cross' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
                  ))}
                </div>
              </div>

              {/* Spacing */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-gray-500 uppercase shrink-0">Spacing (mm)</label>
                <input
                  type="text" inputMode="decimal"
                  value={localLineInterval}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setLocalLineInterval(v); }}
                  onBlur={commitLineInterval}
                  onFocus={e => e.currentTarget.select()}
                  onKeyDown={e => { if (e.key === 'Enter') commitLineInterval(); }}
                  placeholder={multiLineInterval === null ? 'mixed' : undefined}
                  className={inputCls}
                />
              </div>

              {/* Angle — only for line/crosshatch/dot patterns */}
              {patternHasAngle && (
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-gray-500 uppercase shrink-0">Angle (°)</label>
                  <input
                    type="text" inputMode="numeric"
                    value={localLineAngle}
                    onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setLocalLineAngle(v); }}
                    onBlur={commitLineAngle}
                    onFocus={e => e.currentTarget.select()}
                    onKeyDown={e => { if (e.key === 'Enter') commitLineAngle(); }}
                    placeholder={multiLineAngle === null ? 'mixed' : undefined}
                    className={inputCls}
                  />
                </div>
              )}
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
  const [assignOpen, setAssignOpen] = useState(false);
  const assignRef = useRef<HTMLDivElement>(null);

  const commitLabel = () => {
    const trimmed = localLabel.trim();
    onRename(trimmed || undefined);
    setEditingLabel(false);
  };

  // Close assign popover when clicking outside
  useEffect(() => {
    if (!assignOpen) return;
    const handler = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setAssignOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [assignOpen]);

  const unassignedLayers = layers.filter(l => !op.layerIds.includes(l.id));

  return (
    <div
      className={`border rounded-lg overflow-visible transition-colors ${op.enabled ? 'border-gray-700' : 'border-gray-800 opacity-60'} ${isDragOver ? 'border-orange-400 border-dashed' : ''} ${isSelected ? 'ring-1 ring-orange-500' : ''}`}
      onClick={onSelect}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(op.id); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      {/* Header row */}
      <div
        className={`flex items-center gap-1 px-2 py-1.5 ${isLayerHighlighted ? 'bg-blue-900/25' : 'bg-gray-800'} cursor-grab active:cursor-grabbing`}
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(op.id); }}
        onDragEnd={() => onDrop()}
      >
        <span className="text-xs text-gray-600 select-none mr-0.5">⠿</span>
        <span className="text-xs text-gray-500 select-none w-5 text-center flex-shrink-0">{index}</span>
        <button
          onClick={e => { e.stopPropagation(); onToggleEnabled(); }}
          className={`text-xs w-6 text-center flex-shrink-0 ${op.enabled ? 'text-orange-400' : 'text-gray-600'}`}
          title={op.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        ><FontAwesomeIcon icon={op.enabled ? faToggleOn : faToggleOff} /></button>

        <span className={`text-xs font-semibold whitespace-nowrap flex-shrink-0 ${OP_COLORS[op.type]}`}>
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
            className="flex-1 min-w-0 text-xs bg-gray-900 border border-orange-500 rounded px-1 py-0 text-gray-100 focus:outline-none"
          />
        ) : (
          <>
            {op.label ? (
              <span
                className="text-xs text-gray-400 italic truncate max-w-[80px]"
                title="Double-click to rename"
                onDoubleClick={e => { e.stopPropagation(); setLocalLabel(op.label ?? ''); setEditingLabel(true); }}
              >({op.label})</span>
            ) : null}
            <button
              onClick={e => { e.stopPropagation(); setLocalLabel(op.label ?? ''); setEditingLabel(true); }}
              className="text-gray-600 hover:text-orange-400 text-[10px] flex-shrink-0"
              title="Rename operation"
            ><FontAwesomeIcon icon={faPencil} /></button>
          </>
        )}

        <div className="flex-1 min-w-0" />

        {op.layerIds.length === 0 && op.enabled && (
          <span className="text-xs text-yellow-500" title="No layers assigned">⚠</span>
        )}

        <span className="text-xs text-gray-600 flex-shrink-0 hidden xl:block">
          {op.feedRate}mm/min · {op.power}% · ×{op.passes}
        </span>

        <div className="flex gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onDuplicate} className="text-gray-500 hover:text-gray-200 text-xs" title="Duplicate"><FontAwesomeIcon icon={faClone} /></button>
          <button onClick={onRemove} className="text-gray-500 hover:text-red-400 text-xs" title="Remove"><FontAwesomeIcon icon={faTrash} /></button>
        </div>
      </div>

      {/* Layer assignment section — always visible */}
      <div className="px-2 py-1.5 bg-gray-850 border-t border-gray-700/50" onClick={e => e.stopPropagation()}>
          <div className="flex flex-wrap gap-1 items-center">
            {op.layerIds.map(lid => {
              const layer = layers.find(l => l.id === lid);
              return (
                <span
                  key={lid}
                  className="inline-flex items-center gap-0.5 bg-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-300 leading-4"
                >
                  <span className="truncate max-w-[80px]" title={layer?.name ?? lid}>{layer?.name ?? lid}</span>
                  <button
                    onClick={() => onUnassignLayer(lid)}
                    className="text-gray-500 hover:text-red-400 leading-none ml-0.5"
                    title="Remove"
                  >×</button>
                </span>
              );
            })}

            {/* + assign button with popover */}
            {unassignedLayers.length > 0 && (
              <div className="relative" ref={assignRef}>
                <button
                  onClick={e => { e.stopPropagation(); setAssignOpen(o => !o); }}
                  className="inline-flex items-center justify-center gap-0.5 h-5 px-1.5 rounded bg-gray-700 hover:bg-orange-600 text-gray-400 hover:text-white text-xs leading-none transition-colors"
                  title="Assign layer"
                ><FontAwesomeIcon icon={faPlus} className="text-[10px]" /> <span className="text-[10px]">Add</span></button>
                {assignOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-[140px] py-1" onClick={e => e.stopPropagation()}>
                    {unassignedLayers.map(l => (
                      <button
                        key={l.id}
                        onClick={() => { onAssignLayer(l.id); setAssignOpen(false); }}
                        className="w-full text-left px-3 py-1 text-xs text-gray-200 hover:bg-gray-700 truncate"
                      >{l.name}</button>
                    ))}
                  </div>
                )}
              </div>
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
  const setActiveJobId = useJobStore(s => s.setActiveJobId);
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
          operations.map((op, idx) => {
            const isOpSelected = selectedOpIds.has(op.id);
            const isLayerHighlighted = !isOpSelected && !!selectedLayerIds && op.layerIds.some(lid => selectedLayerIds.has(lid));
            const isDragging = dragOpId.current === op.id;
            const isDropTarget = dragOverId === op.id && dragOpId.current !== op.id;
            const dragFromIdx = dragOpId.current ? operations.findIndex(o => o.id === dragOpId.current) : -1;
            const showBefore = isDropTarget && dragFromIdx > idx;
            const showAfter = isDropTarget && dragFromIdx < idx;
            return (
            <div key={op.id}>
              {showBefore && (
                <div className="h-8 border-2 border-dashed border-orange-400/50 rounded-lg mb-2" />
              )}
              <div className={isDragging ? 'opacity-40' : ''}>
              <OperationRow
                op={op}
                index={idx + 1}
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
                isDragOver={isDropTarget}
                isSelected={isOpSelected}
                onSelect={(e) => handleSelectOp(op.id, e)}
                isLayerHighlighted={isLayerHighlighted}
              />
              </div>
              {showAfter && (
                <div className="h-8 border-2 border-dashed border-orange-400/50 rounded-lg mt-2" />
              )}
            </div>
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
            onClick={() => { setActiveJobId(null); void navigate('/gcode-preview'); }}
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
