import { useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useProjectStore } from '../store/projectStore';
import { useAppSettings } from '../store/appSettingsStore';
import { useToastStore } from '../store/toastStore';
import { useKeyboardShortcuts, type ShortcutDef } from '../hooks/useKeyboardShortcuts';
import SvgCanvas, { type TransformPreview } from '../components/SvgCanvas';
import OperationsPanel from '../components/OperationsPanel';
import LayerTransformPanel from '../components/LayerTransformPanel';
import ShapeTransformPanel from '../components/ShapeTransformPanel';
import type { Layer } from '../types';
import { hasMultipleSubpaths } from '../utils/geometry';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faTrash, faFileImport, faObjectGroup, faLayerGroup, faScissors, faArrowUpFromBracket } from '@fortawesome/free-solid-svg-icons';

const LAYER_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

export default function Editor() {
  const projects = useProjectStore(s => s.projects);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const importSvgFile = useProjectStore(s => s.importSvgFile);
  const removeLayer = useProjectStore(s => s.removeLayer);
  const renameLayer = useProjectStore(s => s.renameLayer);
  const updateLayerColor = useProjectStore(s => s.updateLayerColor);
  const toggleLayerVisibility = useProjectStore(s => s.toggleLayerVisibility);
  const reorderLayer = useProjectStore(s => s.reorderLayer);
  const updateLayerTransform = useProjectStore(s => s.updateLayerTransform);
  const moveShapeToNewLayer = useProjectStore(s => s.moveShapeToNewLayer);
  const moveShapesToNewLayer = useProjectStore(s => s.moveShapesToNewLayer);
  const removeShapes = useProjectStore(s => s.removeShapes);
  const renameShape = useProjectStore(s => s.renameShape);
  const mergeLayers = useProjectStore(s => s.mergeLayers);
  const splitShapeSubpaths = useProjectStore(s => s.splitShapeSubpaths);
  const splitLayerIntoShapeLayers = useProjectStore(s => s.splitLayerIntoShapeLayers);
  const updateShapePaths = useProjectStore(s => s.updateShapePaths);
  const saveVersion = useProjectStore(s => s.saveVersion);
  const restoreVersion = useProjectStore(s => s.restoreVersion);
  const deleteVersion = useProjectStore(s => s.deleteVersion);
  const originPosition = useAppSettings(s => s.originPosition);
  const workAreaHeight = useAppSettings(s => s.workAreaHeight);
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
  // Color picker state
  const [colorPickerLayerId, setColorPickerLayerId] = useState<string | null>(null);
  // Drag-and-drop state for layer reordering
  const dragLayerId = useRef<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  // Transform panel height (resizable via drag handle)
  const [transformPanelHeight, setTransformPanelHeight] = useState(400);
  const transformDragRef = useRef<{ startY: number; startH: number } | null>(null);
  // Preview delta for relative transforms
  const [transformPreview, setTransformPreview] = useState<TransformPreview>({ deltaX: 0, deltaY: 0, deltaRotation: 0 });

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

  /** Split selected shape (which must have multiple subpaths) into separate shapes */
  const handleSplitShapeSubpaths = () => {
    const singleLayerId = selectedLayerIds.size === 1 ? Array.from(selectedLayerIds)[0] : null;
    if (!singleLayerId || selectedShapeIds.size !== 1) return;
    const shapeId = Array.from(selectedShapeIds)[0];
    const ok = splitShapeSubpaths(shapeId, singleLayerId);
    if (ok) {
      addToast('info', 'Shape split into subpaths');
      setSelectedShapeIds(new Set());
    }
  };

  /** Split a layer into separate layers, one per shape */
  const handleSplitLayerIntoShapeLayers = (layerId: string) => {
    const newIds = splitLayerIntoShapeLayers(layerId);
    if (newIds.length > 0) {
      setSelectedLayerIds(new Set(newIds));
      setSelectedShapeIds(new Set());
      addToast('info', `Split into ${newIds.length} layers`);
    }
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


  /** Delete all currently selected layers */
  const handleDeleteSelectedLayers = useCallback(() => {
    if (selectedLayerIds.size === 0) return;
    for (const lid of selectedLayerIds) removeLayer(lid);
    addToast('info', `Removed ${selectedLayerIds.size} layer(s)`);
    setSelectedLayerIds(new Set());
    setSelectedShapeIds(new Set());
  }, [selectedLayerIds, removeLayer, addToast]);

  const shortcuts = useMemo<ShortcutDef[]>(() => {
    const singleLayerId = selectedLayerIds.size === 1 ? Array.from(selectedLayerIds)[0] : null;
    return [
      { key: 'i', ctrl: true, label: 'Import SVG', handler: () => fileInputRef.current?.click() },
      { key: 'Delete', label: 'Remove layer', handler: () => {
        if (selectedShapeIds.size > 0 && singleLayerId) {
          removeShapes(Array.from(selectedShapeIds), singleLayerId);
          setSelectedShapeIds(new Set());
        } else if (selectedLayerIds.size > 0) {
          for (const lid of selectedLayerIds) removeLayer(lid);
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
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center gap-3">
        {project ? (
          <>
            <span className="text-sm font-semibold text-gray-100">{project.name}</span>
            <span className="text-xs text-gray-500">
              {project.files.length} file{project.files.length !== 1 ? 's' : ''} · {project.layers.length} layer{project.layers.length !== 1 ? 's' : ''} · {project.operations.length} op{project.operations.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-600">· {new Date(project.updatedAt).toLocaleString()}</span>
            <div className="flex-1" />
            <button
              onClick={() => setShowVersionDialog(true)}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              title="Save current state as a version"
            >💾 Save Version</button>
            <div className="relative">
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                title="View saved versions"
              >📋 Versions ({project.versions.length})</button>
              {showVersions && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowVersions(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg w-80 max-h-60 overflow-y-auto"
                    onKeyDown={e => { if (e.key === 'Escape') setShowVersions(false); }}
                  >
                    {project.versions.length === 0 ? (
                      <p className="text-xs text-gray-600 px-3 py-2">No saved versions</p>
                    ) : (
                      project.versions.map(v => (
                        <div key={v.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700/50">
                          <span className="text-xs text-gray-300 font-medium flex-1">{v.label}</span>
                          <span className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleString()}</span>
                          <button
                            onClick={() => { restoreVersion(v.id); addToast('info', `Restored "${v.label}"`); setShowVersions(false); }}
                            className="text-xs text-orange-400 hover:text-orange-300"
                          >Restore</button>
                          <button
                            onClick={e => { e.stopPropagation(); deleteVersion(v.id); }}
                            className="text-xs text-gray-500 hover:text-red-400"
                          >✕</button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <span className="text-xs text-gray-500">
            No project open —{' '}
            <button onClick={() => void navigate('/')} className="text-orange-400 hover:text-orange-300">go to Projects</button>
            {' '}to open one
          </span>
        )}
        <input ref={fileInputRef} type="file" accept=".svg" multiple className="hidden" onChange={handleFileChange} />
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

      {project ? (
        <PanelGroup
          orientation="horizontal"
          className="flex-1 min-h-0"
          resizeTargetMinimumSize={{ coarse: 44, fine: 8 }}
        >
          {/* Left panel: Layers/Shapes + transform */}
          <Panel defaultSize="22%" minSize="200px" groupResizeBehavior="preserve-pixel-size" className="bg-gray-900 flex flex-col min-h-0">
            <div
              className="px-3 py-2 border-b border-gray-700 flex items-center justify-between flex-shrink-0"
            >
              <span className="text-sm font-semibold text-gray-200"><FontAwesomeIcon icon={faLayerGroup} className="mr-1.5" />Shapes &amp; Layers</span>
              {project.layers.length > 0 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
                ><FontAwesomeIcon icon={faFileImport} /> Import SVG</button>
              )}
            </div>

            {/* Layers list — click outside layers to deselect */}
            <div
              className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0 relative"
              onClick={() => { setSelectedLayerIds(new Set()); setSelectedShapeIds(new Set()); }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragLeave={e => { e.stopPropagation(); setDragOver(false); }}
              onDrop={e => { e.stopPropagation(); handleDrop(e); }}
            >
              {dragOver && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80 border-2 border-dashed border-orange-400 rounded pointer-events-none">
                  <p className="text-sm font-bold text-orange-400">Drop SVG file(s) here</p>
                </div>
              )}
              {project.layers.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-full border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-orange-500/60 transition-colors"
                  onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  <FontAwesomeIcon icon={faFileImport} className="text-3xl text-gray-600 mb-3" />
                  <p className="text-sm font-semibold text-gray-400">Import or drop SVG here</p>
                  <p className="text-xs text-gray-600 mt-1">Click to browse or drag &amp; drop</p>
                </div>
              ) : (
                project.layers.map((layer, idx) => {
                const currentColor = layer.color ?? LAYER_COLORS[idx % LAYER_COLORS.length];
                return (
                <div
                  key={layer.id}
                  draggable
                  onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; handleLayerDragStart(layer.id); }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; handleLayerDragOver(layer.id); }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); handleLayerDrop(layer.id); }}
                  onDragEnd={() => { dragLayerId.current = null; setDragOverLayerId(null); }}
                  onClick={e => {
                    e.stopPropagation();
                    setColorPickerLayerId(null);
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
                    {/* Color dot — click to open color picker */}
                    <div className="relative">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 cursor-pointer ring-1 ring-transparent hover:ring-gray-400 block"
                        style={{ backgroundColor: currentColor }}
                        title="Click to change layer color"
                        onClick={e => { e.stopPropagation(); setColorPickerLayerId(colorPickerLayerId === layer.id ? null : layer.id); }}
                      />
                      {colorPickerLayerId === layer.id && (
                        <div
                          className="absolute top-5 left-0 z-50 bg-gray-800 border border-gray-600 rounded-lg p-2 shadow-lg min-w-[150px]"
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="color"
                            value={currentColor}
                            onChange={e => { updateLayerColor(layer.id, e.target.value); }}
                            className="w-full h-24 cursor-pointer bg-transparent border-0 p-0 rounded"
                            title="Pick custom color"
                          />
                          <div className="flex items-center gap-1 mt-1.5">
                            <input
                              type="text"
                              value={currentColor}
                              onChange={e => {
                                const v = e.target.value;
                                if (/^#[0-9a-fA-F]{6}$/.test(v)) updateLayerColor(layer.id, v);
                              }}
                              onBlur={e => {
                                let v = e.target.value.trim();
                                if (!v.startsWith('#')) v = '#' + v;
                                if (/^#[0-9a-fA-F]{6}$/.test(v)) updateLayerColor(layer.id, v);
                              }}
                              className="flex-1 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-100 font-mono focus:outline-none focus:border-orange-500 min-w-0"
                              title="Hex color — click to copy"
                              onClick={e => { (e.target as HTMLInputElement).select(); }}
                            />
                          </div>
                          <div className="grid grid-cols-6 gap-1 mt-1.5">
                            {LAYER_COLORS.map(c => (
                              <button
                                key={c}
                                className={`w-4 h-4 rounded-full border-2 ${currentColor === c ? 'border-white' : 'border-transparent'} hover:border-gray-300`}
                                style={{ backgroundColor: c }}
                                title={c}
                                onClick={e => { e.stopPropagation(); updateLayerColor(layer.id, c); setColorPickerLayerId(null); }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
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
                    {layer.shapes.length >= 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleExpandLayer(layer.id); }}
                        className="text-gray-500 hover:text-gray-200 text-xs"
                        title={expandedLayerIds.has(layer.id) ? 'Collapse shapes' : `Expand ${layer.shapes.length} shape${layer.shapes.length !== 1 ? 's' : ''}`}
                      >{expandedLayerIds.has(layer.id) ? '▾' : `▸ ${layer.shapes.length}`}</button>
                    )}
                    {layer.shapes.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); handleSplitLayerIntoShapeLayers(layer.id); }}
                        className="text-gray-500 hover:text-blue-400 text-xs"
                        title={`Split layer into ${layer.shapes.length} layers (one per shape)`}
                      ><FontAwesomeIcon icon={faScissors} /></button>
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

                      {/* Shape selection actions — applied to selected shapes */}
                      {selectedShapeIds.size > 0 && selectedLayerIds.has(layer.id) && (
                        <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-gray-700">
                          <span className="text-xs text-gray-500">{selectedShapeIds.size} shape{selectedShapeIds.size !== 1 ? 's' : ''} selected</span>
                          <div className="flex-1" />
                          {/* Show Split only when exactly one shape is selected and it has multiple subpaths */}
                          {selectedShapeIds.size === 1 && (() => {
                            const shape = layer.shapes.find(s => selectedShapeIds.has(s.id));
                            return shape && hasMultipleSubpaths(shape.d) ? (
                              <button
                                onClick={e => { e.stopPropagation(); handleSplitShapeSubpaths(); }}
                                className="text-xs text-blue-400 hover:text-blue-300"
                                title="Split selected shape into separate shapes by subpath"
                              ><FontAwesomeIcon icon={faScissors} /> <span className="text-[10px]">Split</span></button>
                            ) : null;
                          })()}
                          <button
                            onClick={e => { e.stopPropagation(); handlePopSelectedToNewLayer(); }}
                            className="text-xs text-orange-400 hover:text-orange-300"
                            title="Pop selected shapes to a new layer"
                          ><FontAwesomeIcon icon={faArrowUpFromBracket} /> <span className="text-[10px]">Pop</span></button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteSelectedShapes(); }}
                            className="text-xs text-red-400 hover:text-red-300"
                            title="Delete selected shapes"
                          ><FontAwesomeIcon icon={faTrash} /> <span className="text-[10px]">Delete</span></button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )})
              )}

              {/* Bulk actions for multi-layer selection */}
              {selectedLayerIds.size > 1 && (
                <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-700">
                  <span className="text-xs text-gray-500">{selectedLayerIds.size} layers selected</span>
                  <div className="flex-1" />
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteSelectedLayers(); }}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    title="Delete selected layers"
                  ><FontAwesomeIcon icon={faTrash} /> Delete</button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (!project) return;
                      const ids = Array.from(selectedLayerIds);
                      const targetId = mergeLayers(ids);
                      if (!targetId) return;
                      setSelectedLayerIds(new Set([targetId]));
                      const targetName = project.layers.find(l => l.id === targetId)?.name ?? 'layer';
                      addToast('info', `Merged ${ids.length} layers into "${targetName}"`);
                    }}
                    className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
                    title="Merge selected layers into one"
                  ><FontAwesomeIcon icon={faObjectGroup} /> Merge</button>
                </div>
              )}
            </div>

            {/* Layer/Shape transform panel — shown at bottom when layer(s) are selected */}
            {selectedLayerIds.size >= 1 && (() => {
              const selectedLayers = Array.from(selectedLayerIds)
                .map(id => project.layers.find(l => l.id === id))
                .filter(Boolean) as Layer[];
              if (selectedLayers.length === 0) return null;

              // Determine if we're in shape mode: single layer selected + shapes selected within it
              const singleLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;
              const selectedShapesInLayer = singleLayer
                ? singleLayer.shapes.filter(s => selectedShapeIds.has(s.id))
                : [];
              const shapeMode = singleLayer && selectedShapesInLayer.length > 0;

              // Build the title label
              let titleLabel: string;
              if (shapeMode && singleLayer) {
                const shapeLabel = selectedShapesInLayer.length === 1
                  ? selectedShapesInLayer[0].name
                  : `${selectedShapesInLayer.length} shapes`;
                titleLabel = `${singleLayer.name} – ${shapeLabel}`;
              } else {
                titleLabel = selectedLayers.length === 1
                  ? selectedLayers[0].name
                  : `${selectedLayers.length} layers`;
              }

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
                      Transform — {titleLabel}
                    </p>
                    {shapeMode && singleLayer ? (
                      <ShapeTransformPanel
                        shapes={selectedShapesInLayer}
                        layerId={singleLayer.id}
                        onUpdatePaths={updateShapePaths}
                        originPosition={originPosition}
                        workH={workAreaHeight}
                      />
                    ) : (
                      <LayerTransformPanel
                        layers={selectedLayers}
                        onUpdate={(id, partial) => updateLayerTransform(id, partial)}
                        originPosition={originPosition}
                        workH={workAreaHeight}
                        onPreviewChange={setTransformPreview}
                      />
                    )}
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
              selectedLayerIds={selectedLayerIds}
              selectedShapeIds={selectedShapeIds}
              onSelectLayer={(id) => setSelectedLayerIds(new Set([id]))}
              onSelectShape={handleCanvasShapeClick}
              onUpdateLayer={(id, partial) => updateLayerTransform(id, partial)}
              originPosition={originPosition}
              transformPreview={transformPreview}
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
            <p className="text-sm text-gray-600 mt-2 mb-6">Open a project from the Projects tab to get started</p>
            <button onClick={() => { void navigate('/'); }} className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors">Go to Projects</button>
          </div>
        </div>
      )}
    </div>
  );
}
