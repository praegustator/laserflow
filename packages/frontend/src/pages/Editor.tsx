import { useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useProjectStore } from '../store/projectStore';
import { useMachineStore } from '../store/machineStore';
import { useAppSettings } from '../store/appSettingsStore';
import { useToastStore } from '../store/toastStore';
import { useKeyboardShortcuts, type ShortcutDef } from '../hooks/useKeyboardShortcuts';
import SvgCanvas from '../components/SvgCanvas';
import OperationsPanel from '../components/OperationsPanel';
import LayerTransformPanel from '../components/LayerTransformPanel';
import { computeShapesBoundingBox } from '../utils/geometry';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faTrash } from '@fortawesome/free-solid-svg-icons';

const LAYER_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

export default function Editor() {
  const projects = useProjectStore(s => s.projects);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const setActiveProjectId = useProjectStore(s => s.setActiveProjectId);
  const importSvgFile = useProjectStore(s => s.importSvgFile);
  const removeLayer = useProjectStore(s => s.removeLayer);
  const renameLayer = useProjectStore(s => s.renameLayer);
  const toggleLayerVisibility = useProjectStore(s => s.toggleLayerVisibility);
  const reorderLayer = useProjectStore(s => s.reorderLayer);
  const updateLayerTransform = useProjectStore(s => s.updateLayerTransform);
  const moveShapeToNewLayer = useProjectStore(s => s.moveShapeToNewLayer);
  const moveShapesToNewLayer = useProjectStore(s => s.moveShapesToNewLayer);
  const removeShapes = useProjectStore(s => s.removeShapes);
  const renameShape = useProjectStore(s => s.renameShape);
  const saveVersion = useProjectStore(s => s.saveVersion);
  const restoreVersion = useProjectStore(s => s.restoreVersion);
  const deleteVersion = useProjectStore(s => s.deleteVersion);
  const connectionStatus = useMachineStore(s => s.connectionStatus);
  const sendCommand = useMachineStore(s => s.sendCommand);
  const originPosition = useAppSettings(s => s.originPosition);
  const addToast = useToastStore(s => s.addToast);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set());
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set());
  const [expandedLayerIds, setExpandedLayerIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [showVersions, setShowVersions] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const [editingShapeLayerId, setEditingShapeLayerId] = useState<string | null>(null);
  const [editingShapeName, setEditingShapeName] = useState('');
  // Drag-and-drop state for layer reordering
  const dragLayerId = useRef<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  // Transform panel height (resizable via drag handle)
  const [transformPanelHeight, setTransformPanelHeight] = useState(400);
  const transformDragRef = useRef<{ startY: number; startH: number } | null>(null);

  const project = projects.find(p => p.id === activeProjectId) ?? null;

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const svgFiles = Array.from(files).filter(f => f.name.endsWith('.svg'));
    for (const file of svgFiles) {
      try {
        await importSvgFile(file);
        addToast('success', `Imported ${file.name}`);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Upload failed');
      }
    }
  }, [importSvgFile, addToast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files);
  };

  const handleFrame = async () => {
    if (!project) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const layer of project.layers) {
      if (!layer.visible) continue;
      const bbox = computeShapesBoundingBox(layer.shapes);
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
    const feed = 3000;
    try {
      await sendCommand('G90 G21');
      await sendCommand('M5 S0');
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

  const toggleExpandLayer = (layerId: string) => {
    setExpandedLayerIds(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  };

  const handleSaveVersion = () => {
    const label = versionLabel.trim() || `v${(project?.versions.length ?? 0) + 1}`;
    saveVersion(label);
    setVersionLabel('');
    setShowVersionDialog(false);
    addToast('success', `Saved version "${label}"`);
  };

  /** Double-click on layer name to start inline editing */
  const startEditingLayerName = (layerId: string, currentName: string) => {
    setEditingLayerId(layerId);
    setEditingLayerName(currentName);
  };

  const commitLayerName = () => {
    if (editingLayerId && editingLayerName.trim()) {
      renameLayer(editingLayerId, editingLayerName.trim());
    }
    setEditingLayerId(null);
    setEditingLayerName('');
  };

  /** Double-click on shape name to start inline editing */
  const startEditingShapeName = (shapeId: string, layerId: string, currentName: string) => {
    setEditingShapeId(shapeId);
    setEditingShapeLayerId(layerId);
    setEditingShapeName(currentName);
  };

  const commitShapeName = () => {
    if (editingShapeId && editingShapeLayerId && editingShapeName.trim()) {
      renameShape(editingShapeId, editingShapeLayerId, editingShapeName.trim());
    }
    setEditingShapeId(null);
    setEditingShapeLayerId(null);
    setEditingShapeName('');
  };

  /** Shape selection — supports Shift/Cmd multi-select */
  const handleShapeClick = (shapeId: string, layerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLayerIds(new Set([layerId]));
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      // Toggle selection
      setSelectedShapeIds(prev => {
        const next = new Set(prev);
        if (next.has(shapeId)) next.delete(shapeId);
        else next.add(shapeId);
        return next;
      });
    } else {
      setSelectedShapeIds(new Set([shapeId]));
    }
  };

  /** Shape clicked on the canvas — supports Cmd/Ctrl multi-select */
  const handleCanvasShapeClick = (shapeId: string, layerId: string, e: React.MouseEvent) => {
    const currentSingleLayer = selectedLayerIds.size === 1 ? Array.from(selectedLayerIds)[0] : null;
    if (e.metaKey || e.ctrlKey) {
      // Multi-select: toggle shape in selection within same layer
      if (currentSingleLayer === layerId) {
        setSelectedShapeIds(prev => {
          const next = new Set(prev);
          if (next.has(shapeId)) next.delete(shapeId);
          else next.add(shapeId);
          return next;
        });
      } else {
        // Different layer — start fresh selection in new layer
        setSelectedLayerIds(new Set([layerId]));
        setSelectedShapeIds(new Set([shapeId]));
      }
    } else {
      setSelectedLayerIds(new Set([layerId]));
      setSelectedShapeIds(new Set([shapeId]));
    }
    // Auto-expand the layer to show shapes
    setExpandedLayerIds(prev => {
      const next = new Set(prev);
      next.add(layerId);
      return next;
    });
  };

  /** Delete selected shapes */
  const handleDeleteSelectedShapes = () => {
    const singleLayerId = selectedLayerIds.size === 1 ? Array.from(selectedLayerIds)[0] : null;
    if (!singleLayerId || selectedShapeIds.size === 0) return;
    removeShapes(Array.from(selectedShapeIds), singleLayerId);
    addToast('info', `Removed ${selectedShapeIds.size} shape(s)`);
    setSelectedShapeIds(new Set());
  };

  /** Pop selected shapes to new layer */
  const handlePopSelectedToNewLayer = () => {
    const singleLayerId = selectedLayerIds.size === 1 ? Array.from(selectedLayerIds)[0] : null;
    if (!singleLayerId || selectedShapeIds.size === 0 || !project) return;
    const layer = project.layers.find(l => l.id === singleLayerId);
    if (!layer) return;
    const shapeIds = Array.from(selectedShapeIds);
    const shapes = layer.shapes.filter(s => selectedShapeIds.has(s.id));
    if (shapes.length === 0) return;
    if (shapes.length === 1) {
      moveShapeToNewLayer(shapes[0].id, singleLayerId, shapes[0].name);
    } else {
      moveShapesToNewLayer(shapeIds, singleLayerId, `${layer.name} (selection)`);
    }
    addToast('info', `Popped ${shapes.length} shape(s) to new layer`);
    setSelectedShapeIds(new Set());
  };

  /** Layer drag-and-drop handlers */
  const handleLayerDragStart = (layerId: string) => { dragLayerId.current = layerId; };
  const handleLayerDragOver = (layerId: string) => { setDragOverLayerId(layerId); };
  const handleLayerDrop = (toLayerId: string) => {
    if (dragLayerId.current && dragLayerId.current !== toLayerId && project) {
      const toIndex = project.layers.findIndex(l => l.id === toLayerId);
      if (toIndex >= 0) reorderLayer(dragLayerId.current, toIndex);
    }
    dragLayerId.current = null;
    setDragOverLayerId(null);
  };

  const canFrame = connectionStatus === 'connected' && (project?.layers.length ?? 0) > 0;

  const shortcuts = useMemo<ShortcutDef[]>(() => {
    const singleLayerId = selectedLayerIds.size === 1 ? Array.from(selectedLayerIds)[0] : null;
    return [
      { key: 'i', ctrl: true, label: 'Import SVG', handler: () => fileInputRef.current?.click() },
      { key: 'Delete', label: 'Remove layer', handler: () => {
        if (selectedShapeIds.size > 0 && singleLayerId) {
          removeShapes(Array.from(selectedShapeIds), singleLayerId);
          setSelectedShapeIds(new Set());
        } else if (singleLayerId) {
          removeLayer(singleLayerId);
          setSelectedLayerIds(new Set());
        }
      }},
      { key: 'Escape', label: 'Deselect', handler: () => { setSelectedLayerIds(new Set()); setSelectedShapeIds(new Set()); } },
    ];
  }, [selectedLayerIds, selectedShapeIds, removeLayer, removeShapes]);
  useKeyboardShortcuts(shortcuts);

  return (
    <div
      className="flex flex-col h-full min-h-0"
    >
      {/* Top bar */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <label className="text-xs text-gray-500 uppercase flex-shrink-0">Project</label>
        <select
          value={activeProjectId ?? ''}
          onChange={e => setActiveProjectId(e.target.value || null)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500 max-w-xs"
        >
          <option value="">— Select a project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {project && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              title="Import SVG (Ctrl+I)"
            >+ Import SVG</button>
            <button
              onClick={() => setShowVersionDialog(true)}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              title="Save current state as a version"
            >💾 Save Version</button>
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              title="View saved versions"
            >📋 Versions ({project.versions.length})</button>
          </>
        )}
        <input ref={fileInputRef} type="file" accept=".svg" multiple className="hidden" onChange={handleFileChange} />
        <div className="flex-1" />
        <button
          onClick={() => { void handleFrame(); }}
          disabled={!canFrame}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors"
          title="Rapid-traverse the bounding box to verify placement"
        >⬜ Frame</button>
        {connectionStatus !== 'connected' && (
          <span className="text-xs text-yellow-500">⚠ Connect machine first</span>
        )}
      </div>

      {/* Version save dialog */}
      {showVersionDialog && (
        <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
          <input
            type="text"
            value={versionLabel}
            onChange={e => setVersionLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveVersion(); }}
            placeholder="Version label (e.g. v1, before-changes)"
            autoFocus
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
          <button onClick={handleSaveVersion} className="px-3 py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors">Save</button>
          <button onClick={() => { setShowVersionDialog(false); setVersionLabel(''); }} className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">Cancel</button>
        </div>
      )}

      {/* Versions list */}
      {showVersions && project && (
        <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 px-4 py-2 max-h-40 overflow-y-auto">
          {project.versions.length === 0 ? (
            <p className="text-xs text-gray-600 py-1">No saved versions</p>
          ) : (
            project.versions.map(v => (
              <div key={v.id} className="flex items-center gap-2 py-1">
                <span className="text-xs text-gray-300 font-medium flex-1">{v.label}</span>
                <span className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleString()}</span>
                <button
                  onClick={() => { restoreVersion(v.id); addToast('info', `Restored "${v.label}"`); }}
                  className="text-xs text-orange-400 hover:text-orange-300"
                >Restore</button>
                <button
                  onClick={() => deleteVersion(v.id)}
                  className="text-xs text-gray-500 hover:text-red-400"
                >✕</button>
              </div>
            ))
          )}
        </div>
      )}

      {project ? (
        <PanelGroup
          orientation="horizontal"
          className="flex-1 min-h-0"
          resizeTargetMinimumSize={{ coarse: 44, fine: 8 }}
        >
          {/* Left panel: Layers/Shapes + transform */}
          <Panel defaultSize="22%" minSize="200px" groupResizeBehavior="preserve-pixel-size" className="bg-gray-900 flex flex-col min-h-0">
            <div
              className="px-3 py-2 border-b border-gray-700 flex items-center justify-between flex-shrink-0 relative"
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragLeave={e => { e.stopPropagation(); setDragOver(false); }}
              onDrop={e => { e.stopPropagation(); handleDrop(e); }}
            >
              <span className="text-sm font-semibold text-gray-200">🔲 Shapes &amp; Layers</span>
              <button onClick={() => fileInputRef.current?.click()} className="text-xs text-orange-400 hover:text-orange-300">+ Import</button>
              {dragOver && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80 border-2 border-dashed border-orange-400 rounded pointer-events-none">
                  <p className="text-sm font-bold text-orange-400">Drop SVG file(s)</p>
                </div>
              )}
            </div>

            {/* Layers list — click outside layers to deselect */}
            <div
              className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0"
              onClick={() => { setSelectedLayerIds(new Set()); setSelectedShapeIds(new Set()); }}
            >
              {project.layers.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-4">No layers yet — import an SVG</p>
              )}
              {project.layers.map((layer, idx) => (
                <div
                  key={layer.id}
                  draggable
                  onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; handleLayerDragStart(layer.id); }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; handleLayerDragOver(layer.id); }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); handleLayerDrop(layer.id); }}
                  onDragEnd={() => { dragLayerId.current = null; setDragOverLayerId(null); }}
                  onClick={e => {
                    e.stopPropagation();
                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                      // Multi-select: toggle this layer
                      setSelectedLayerIds(prev => {
                        const next = new Set(prev);
                        if (next.has(layer.id)) next.delete(layer.id);
                        else next.add(layer.id);
                        return next;
                      });
                    } else {
                      setSelectedLayerIds(new Set([layer.id]));
                    }
                    setSelectedShapeIds(new Set());
                  }}
                  className={`rounded-lg border p-2 cursor-pointer transition-colors ${selectedLayerIds.has(layer.id) ? 'border-orange-500 bg-gray-800' : 'border-gray-700 hover:border-gray-600'} ${dragOverLayerId === layer.id ? 'border-blue-400 border-dashed' : ''}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-600 cursor-grab active:cursor-grabbing select-none mr-0.5" title="Drag to reorder">⠿</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: LAYER_COLORS[idx % LAYER_COLORS.length] }}
                    />
                    <button
                      onClick={e => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
                      className={`text-xs w-5 text-center ${layer.visible ? 'text-gray-200' : 'text-gray-600'}`}
                      title="Toggle visibility"
                    ><FontAwesomeIcon icon={layer.visible ? faEye : faEyeSlash} /></button>

                    {/* Layer name — double-click to edit */}
                    {editingLayerId === layer.id ? (
                      <input
                        type="text"
                        value={editingLayerName}
                        onChange={e => setEditingLayerName(e.target.value)}
                        onBlur={commitLayerName}
                        onKeyDown={e => { if (e.key === 'Enter') commitLayerName(); if (e.key === 'Escape') { setEditingLayerId(null); setEditingLayerName(''); } }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        className="flex-1 text-xs bg-gray-900 border border-orange-500 rounded px-1 py-0 text-gray-100 focus:outline-none min-w-0"
                      />
                    ) : (
                      <span
                        className="flex-1 text-xs text-gray-200 truncate"
                        title={`${layer.name} — double-click to rename`}
                        onDoubleClick={e => { e.stopPropagation(); startEditingLayerName(layer.id, layer.name); }}
                      >{layer.name}</span>
                    )}

                    {/* Expand/collapse shapes */}
                    {layer.shapes.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleExpandLayer(layer.id); }}
                        className="text-gray-500 hover:text-gray-200 text-xs"
                        title={expandedLayerIds.has(layer.id) ? 'Collapse shapes' : `Expand ${layer.shapes.length} shapes`}
                      >{expandedLayerIds.has(layer.id) ? '▾' : `▸ ${layer.shapes.length}`}</button>
                    )}
                    <button onClick={e => { e.stopPropagation(); removeLayer(layer.id); if (selectedLayerIds.has(layer.id)) setSelectedLayerIds(prev => { const n = new Set(prev); n.delete(layer.id); return n; }); }} className="text-gray-500 hover:text-red-400 text-xs" title="Delete layer"><FontAwesomeIcon icon={faTrash} /></button>
                  </div>

                  {/* Expanded shapes */}
                  {expandedLayerIds.has(layer.id) && (
                    <div className="mt-1.5 ml-5 space-y-0.5 select-none">
                      {layer.shapes.map(shape => {
                        const isShapeSelected = selectedShapeIds.has(shape.id);
                        return (
                          <div
                            key={shape.id}
                            onClick={e => handleShapeClick(shape.id, layer.id, e)}
                            className={`flex items-center gap-1.5 text-xs cursor-pointer rounded px-1 py-0.5 transition-colors ${
                              isShapeSelected ? 'bg-yellow-900/40 text-yellow-200' : 'hover:bg-gray-700/50'
                            }`}
                          >
                            {editingShapeId === shape.id ? (
                              <input
                                type="text"
                                value={editingShapeName}
                                onChange={e => setEditingShapeName(e.target.value)}
                                onBlur={commitShapeName}
                                onKeyDown={e => { if (e.key === 'Enter') commitShapeName(); if (e.key === 'Escape') { setEditingShapeId(null); setEditingShapeName(''); } }}
                                onClick={e => e.stopPropagation()}
                                autoFocus
                                className="flex-1 text-xs bg-gray-900 border border-orange-500 rounded px-1 py-0 text-gray-100 focus:outline-none min-w-0"
                              />
                            ) : (
                              <span
                                className={`truncate flex-1 ${isShapeSelected ? 'text-yellow-200' : 'text-gray-400'}`}
                                title={`${shape.name} — double-click to rename`}
                                onDoubleClick={e => { e.stopPropagation(); startEditingShapeName(shape.id, layer.id, shape.name); }}
                              >{shape.name}</span>
                            )}
                          </div>
                        );
                      })}

                      {/* Shape selection actions */}
                      {selectedShapeIds.size > 0 && selectedLayerIds.has(layer.id) && (
                        <div className="flex items-center gap-1 mt-1 pt-1 border-t border-gray-700">
                          <span className="text-xs text-gray-500">{selectedShapeIds.size} selected</span>
                          <div className="flex-1" />
                          <button
                            onClick={e => { e.stopPropagation(); handlePopSelectedToNewLayer(); }}
                            className="text-xs text-orange-400 hover:text-orange-300"
                            title="Pop selected shapes to new layer"
                          >Pop</button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteSelectedShapes(); }}
                            className="text-xs text-red-400 hover:text-red-300"
                            title="Delete selected shapes"
                          >Delete</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Layer transform panel — shown at bottom when layer(s) are selected */}
            {selectedLayerIds.size === 1 && (() => {
              const singleId = Array.from(selectedLayerIds)[0];
              const selectedLayer = project.layers.find(l => l.id === singleId);
              if (!selectedLayer) return null;
              return (
                <div className="flex-shrink-0 flex flex-col" style={{ height: transformPanelHeight, minHeight: 120, maxHeight: '70%' }}>
                  {/* Draggable resize handle */}
                  <div
                    className="h-1.5 cursor-row-resize bg-gray-700 hover:bg-orange-500/60 active:bg-orange-500 transition-colors flex items-center justify-center"
                    onMouseDown={e => {
                      e.preventDefault();
                      transformDragRef.current = { startY: e.clientY, startH: transformPanelHeight };
                      const onMove = (ev: MouseEvent) => {
                        if (!transformDragRef.current) return;
                        const delta = transformDragRef.current.startY - ev.clientY;
                        setTransformPanelHeight(Math.max(120, Math.min(800, transformDragRef.current.startH + delta)));
                      };
                      const onUp = () => { transformDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                  >
                    <div className="w-8 h-0.5 rounded-full bg-gray-600" />
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-2">
                    <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">
                      Transform — {selectedLayer.name}
                    </p>
                    <LayerTransformPanel
                      layer={selectedLayer}
                      onUpdate={(id, partial) => updateLayerTransform(id, partial)}
                    />
                  </div>
                </div>
              );
            })()}
          </Panel>

          <PanelResizeHandle className="group w-2 bg-gray-800 hover:bg-orange-500/60 active:bg-orange-500 transition-colors cursor-col-resize flex items-center justify-center">
            <div className="w-0.5 h-8 rounded-full bg-gray-600 group-hover:bg-orange-400 transition-colors" />
          </PanelResizeHandle>

          {/* Canvas */}
          <Panel defaultSize="53%" minSize="300px" className="min-w-0 min-h-0">
            <SvgCanvas
              layers={project.layers}
              operations={project.operations}
              selectedLayerId={selectedLayerIds.size === 1 ? Array.from(selectedLayerIds)[0] : null}
              selectedShapeIds={selectedShapeIds}
              onSelectLayer={(id) => setSelectedLayerIds(new Set([id]))}
              onSelectShape={handleCanvasShapeClick}
              originPosition={originPosition}
            />
          </Panel>

          <PanelResizeHandle className="group w-2 bg-gray-800 hover:bg-orange-500/60 active:bg-orange-500 transition-colors cursor-col-resize flex items-center justify-center">
            <div className="w-0.5 h-8 rounded-full bg-gray-600 group-hover:bg-orange-400 transition-colors" />
          </PanelResizeHandle>

          {/* Operations panel */}
          <Panel defaultSize="25%" minSize="220px" groupResizeBehavior="preserve-pixel-size" className="bg-gray-900 flex flex-col min-h-0">
            <OperationsPanel
              project={project}
              layers={project.layers}
              originPosition={originPosition}
              selectedLayerIds={selectedLayerIds}
            />
          </Panel>
        </PanelGroup>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <div className="text-5xl mb-4">📁</div>
            <h2 className="text-lg font-semibold text-gray-400">No project selected</h2>
            <p className="text-sm text-gray-600 mt-2 mb-6">Select a project above or create one from the Dashboard</p>
            <button onClick={() => { void navigate('/'); }} className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors">Go to Dashboard</button>
          </div>
        </div>
      )}
    </div>
  );
}
