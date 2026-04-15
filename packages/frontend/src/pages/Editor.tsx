import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useProjectStore } from '../store/projectStore';
import { useAppSettings } from '../store/appSettingsStore';
import { useToastStore } from '../store/toastStore';
import { useMachineStore } from '../store/machineStore';
import { useKeyboardShortcuts, type ShortcutDef } from '../hooks/useKeyboardShortcuts';
import SvgCanvas, { type TransformPreview, type SvgCanvasHandle } from '../components/SvgCanvas';
import OperationsPanel from '../components/OperationsPanel';
import LayerTransformPanel from '../components/LayerTransformPanel';
import ShapeTransformPanel from '../components/ShapeTransformPanel';
import ImageImportDialog from '../components/ImageImportDialog';
import type { Layer, PivotAnchor } from '../types';
import { hasMultipleSubpaths, computeLayerWorldBBox, computeMultiLayerWorldBBox, worldAnchorPoint } from '../utils/geometry';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faTrash, faFileImport, faObjectGroup, faLayerGroup, faScissors, faArrowUpFromBracket, faMagnifyingGlassPlus, faMagnifyingGlassMinus, faExpand, faCompress, faBezierCurve, faImage, faCrosshairs, faXmark, faPencil } from '@fortawesome/free-solid-svg-icons';

const LAYER_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|bmp|webp)$/i;

const PIVOT_GRID: PivotAnchor[][] = [
  ['tl', 'tc', 'tr'],
  ['ml', 'mc', 'mr'],
  ['bl', 'bc', 'br'],
];

const PIVOT_LABELS: Record<PivotAnchor, string> = {
  tl: 'Top-left', tc: 'Top-centre', tr: 'Top-right',
  ml: 'Middle-left', mc: 'Centre', mr: 'Middle-right',
  bl: 'Bottom-left', bc: 'Bottom-centre', br: 'Bottom-right',
};

interface AlignPickerProps {
  targetLabel: string;
  onConfirm: (sourceAnchor: PivotAnchor, targetAnchor: PivotAnchor) => void;
  onCancel: () => void;
}

function AlignPivotPicker({ targetLabel, onConfirm, onCancel }: AlignPickerProps) {
  const [sourceAnchor, setSourceAnchor] = useState<PivotAnchor>('mc');
  const [targetAnchor, setTargetAnchor] = useState<PivotAnchor>('mc');

  const AnchorGrid = ({ value, onChange, label }: { value: PivotAnchor; onChange: (a: PivotAnchor) => void; label: string }) => (
    <div>
      <p className="text-xs text-gray-500 uppercase mb-1">{label}</p>
      <div className="grid grid-cols-3 gap-0.5 w-20">
        {PIVOT_GRID.flat().map(a => (
          <button
            key={a}
            onClick={() => onChange(a)}
            title={PIVOT_LABELS[a]}
            className={`w-6 h-6 rounded text-xs flex items-center justify-center transition-colors ${
              value === a ? 'bg-orange-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
            }`}
          >●</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="absolute inset-x-0 top-0 z-20 bg-gray-900 border-b border-orange-500 px-3 py-3 shadow-lg">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide">Align to: {targetLabel}</p>
          <p className="text-xs text-gray-500 mt-0.5">Pick a point on the selection and a point on the target.</p>
        </div>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-200 text-xs flex-shrink-0">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
      <div className="flex gap-6 items-start">
        <AnchorGrid value={sourceAnchor} onChange={setSourceAnchor} label="Selection point" />
        <div className="text-gray-500 text-lg mt-5">→</div>
        <AnchorGrid value={targetAnchor} onChange={setTargetAnchor} label="Target point" />
      </div>
      <button
        onClick={() => onConfirm(sourceAnchor, targetAnchor)}
        className="mt-3 w-full py-1 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors"
      >Align</button>
    </div>
  );
}

/* ─── Ruler Calibration overlay ─── */
interface RulerCalibrationProps {
  onApply: (pxPerMm: number) => void;
  onClose: () => void;
}

function RulerCalibration({ onApply, onClose }: RulerCalibrationProps) {
  // Default ruler length: 100 mm rendered at the current scale
  const defaultLengthMm = 100;
  // Approximate inner width of the ruler bar container (dialog is w-[480px] minus padding)
  const FALLBACK_RULER_WIDTH = 468;
  // Start the bar at half the container width so the handle is centred and easy to grab
  const [lengthPx, setLengthPx] = useState(Math.round(FALLBACK_RULER_WIDTH / 2));
  const [inputMm, setInputMm] = useState(String(defaultLengthMm));
  const [manualDpi, setManualDpi] = useState('');
  const [dragging, setDragging] = useState(false);
  const rulerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; px: number } | null>(null);
  const rulerWidth = () => rulerRef.current?.clientWidth ?? FALLBACK_RULER_WIDTH;

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, px: lengthPx };
    setDragging(true);
    setManualDpi(''); // clear manual DPI when dragging
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const delta = e.clientX - dragStartRef.current.x;
      const maxPx = rulerWidth();
      setLengthPx(Math.max(10, Math.min(maxPx, dragStartRef.current.px + delta)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging]);

  const targetMm = Math.max(1, parseFloat(inputMm) || defaultLengthMm);
  // If the user entered a DPI value directly, use that; otherwise derive from the bar
  const manualDpiNum = parseFloat(manualDpi);
  const derivedPxPerMm = (manualDpi !== '' && manualDpiNum > 0) ? manualDpiNum / 25.4 : lengthPx / targetMm;

  return (
    <div className="absolute inset-0 z-30 bg-gray-950/90 flex flex-col items-center justify-center gap-6 select-none">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 shadow-2xl w-[480px] space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">📐 Calibrate zoom to physical ruler</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-xs"><FontAwesomeIcon icon={faXmark} /></button>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          Drag the handle to match a known length on your physical ruler,
          then enter that length in mm and click <strong className="text-orange-400">Apply</strong>.
          Or enter your monitor DPI directly below.
        </p>

        {/* Draggable ruler bar */}
        <div ref={rulerRef} className="relative h-10 bg-gray-800 rounded overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-orange-500/30 border-r-2 border-orange-400 rounded-l flex items-center"
            style={{ width: Math.min(lengthPx, rulerWidth()) }}
          >
            <span className="text-xs text-orange-300 px-2 truncate">{Math.round(lengthPx)} px</span>
          </div>
          {/* Drag handle — centred at the bar edge */}
          <div
            className={`absolute top-0 h-full w-5 flex items-center justify-center cursor-col-resize z-10 ${dragging ? 'text-orange-300' : 'text-orange-500 hover:text-orange-300'}`}
            style={{ left: Math.min(lengthPx, rulerWidth()) - 10 }}
            onMouseDown={onMouseDown}
          >
            <div className="w-1.5 h-7 bg-current rounded-full" />
          </div>
        </div>

        {/* Physical length input */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400 flex-shrink-0">This bar measures</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={inputMm}
            onChange={e => { setInputMm(e.target.value); setManualDpi(''); }}
            className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-orange-500 text-right"
          />
          <label className="text-xs text-gray-400">mm on my ruler</label>
        </div>

        {/* Manual DPI entry */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400 flex-shrink-0">Or enter DPI directly</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={manualDpi}
            placeholder={String(Math.round(derivedPxPerMm * 25.4))}
            onChange={e => setManualDpi(e.target.value)}
            className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-orange-500 text-right"
          />
          <label className="text-xs text-gray-400">DPI</label>
        </div>

        <p className="text-xs text-gray-500">
          Derived scale: <span className="text-orange-400 font-mono">{derivedPxPerMm.toFixed(4)} px/mm</span>
          {' '}({Math.round(derivedPxPerMm * 25.4)} DPI)
        </p>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onApply(derivedPxPerMm)}
            className="flex-1 py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors"
          >Apply calibration</button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function Editor() {
  const projects = useProjectStore(s => s.projects);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const importSvgFile = useProjectStore(s => s.importSvgFile);
  const importImageFile = useProjectStore(s => s.importImageFile);
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
  const alignLayersToPoint = useProjectStore(s => s.alignLayersToPoint);
  const renameProject = useProjectStore(s => s.renameProject);
  const pendingImports = useProjectStore(s => s.pendingImports);
  const acceptPendingImport = useProjectStore(s => s.acceptPendingImport);
  const declinePendingImport = useProjectStore(s => s.declinePendingImport);
  const originPosition = useAppSettings(s => s.originPosition);
  const workAreaHeight = useAppSettings(s => s.workAreaHeight);
  const autoZoomOnLayerSelect = useAppSettings(s => s.autoZoomOnLayerSelect);
  const autoPanOnLayerSelect = useAppSettings(s => s.autoPanOnLayerSelect);
  const calibratedPxPerMm = useAppSettings(s => s.calibratedPxPerMm);
  const setCalibratedPxPerMm = useAppSettings(s => s.setCalibratedPxPerMm);
  const addToast = useToastStore(s => s.addToast);
  const backendConnected = useMachineStore(s => s.backendConnected);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<SvgCanvasHandle>(null);

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
  // Layer IDs highlighted because they belong to the currently selected operation(s)
  const [opHighlightedLayerIds, setOpHighlightedLayerIds] = useState<Set<string>>(new Set());
  // Drag-and-drop state for layer reordering
  const dragLayerId = useRef<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  // Transform panel height (resizable via drag handle)
  const [transformPanelHeight, setTransformPanelHeight] = useState(400);
  const transformDragRef = useRef<{ startY: number; startH: number } | null>(null);
  // Preview delta for relative transforms
  const [transformPreview, setTransformPreview] = useState<TransformPreview>({ deltaX: 0, deltaY: 0, deltaRotation: 0 });
  // Pivot anchor for multi-layer selections — lifted here so SvgCanvas can sync with the panel
  const [multiPivotAnchor, setMultiPivotAnchor] = useState<PivotAnchor>('tl');
  // Current canvas zoom level (scale factor, e.g. 1.5 = 150%)
  const [currentZoom, setCurrentZoom] = useState(1.5);
  // Editable zoom %
  const [editingZoom, setEditingZoom] = useState(false);
  const [localZoom, setLocalZoom] = useState('');
  // Image import dialog state: queue of image files waiting for DPI confirmation
  const [imageImportQueue, setImageImportQueue] = useState<File[]>([]);
  // Alignment mode state
  const [alignMode, setAlignMode] = useState(false);
  const [alignTarget, setAlignTarget] = useState<{ type: 'layer'; layerId: string; label: string } | { type: 'board'; label: string } | null>(null);
  // Ruler calibration overlay
  const [showRulerCalibration, setShowRulerCalibration] = useState(false);
  // Project name editing
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState('');

  const project = projects.find(p => p.id === activeProjectId) ?? null;

  // Keep a ref to the latest project so the auto-zoom effect always sees current layers
  // without re-triggering on every layer transform update.
  const projectRef = useRef(project);
  projectRef.current = project;

  // Auto-zoom/pan canvas to fit selected layer(s) when selection changes
  useEffect(() => {
    if (!canvasRef.current || !projectRef.current || selectedLayerIds.size === 0) return;
    const selectedLayers = projectRef.current.layers.filter(l => selectedLayerIds.has(l.id) && l.visible);
    if (selectedLayers.length === 0) return;
    const bbox = selectedLayers.length === 1
      ? computeLayerWorldBBox(selectedLayers[0])
      : computeMultiLayerWorldBBox(selectedLayers);
    if (!bbox || bbox.width === 0 || bbox.height === 0) return;
    if (autoZoomOnLayerSelect) {
      canvasRef.current.fitLayers(bbox);
    } else if (autoPanOnLayerSelect) {
      canvasRef.current.panToLayers(bbox);
    }
  }, [selectedLayerIds, autoZoomOnLayerSelect, autoPanOnLayerSelect]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles: File[] = [];
    for (const file of Array.from(files)) {
      try {
        if (file.name.endsWith('.svg')) {
          if (!backendConnected) {
            addToast('error', 'SVG import requires the backend server. Start the server to import SVG files.');
            continue;
          }
          await importSvgFile(file);
          addToast('success', `Imported ${file.name}`);
        } else if (IMAGE_EXTENSIONS.test(file.name)) {
          // Queue image files for the import dialog (DPI confirmation)
          imageFiles.push(file);
        } else {
          addToast('error', `Unsupported file type: ${file.name}`);
        }
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Upload failed');
      }
    }
    if (imageFiles.length > 0) {
      setImageImportQueue(prev => [...prev, ...imageFiles]);
    }
  }, [importSvgFile, addToast, backendConnected]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleFiles(e.target.files);
    e.target.value = '';
  };

  // Image import dialog: confirm with chosen DPI
  const handleImageImportConfirm = useCallback(async (file: File, dpi: number) => {
    try {
      await importImageFile(file, dpi);
      addToast('success', `Imported ${file.name}`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Import failed');
    }
    // Advance to next file in queue (or close dialog)
    setImageImportQueue(prev => prev.slice(1));
  }, [importImageFile, addToast]);

  const handleImageImportCancel = useCallback(() => {
    // Skip the current file and advance to next (or close dialog)
    setImageImportQueue(prev => prev.slice(1));
  }, []);

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
    // If the layer has only one shape, treat a click on that shape as selecting the layer itself
    const layer = project?.layers.find(l => l.id === layerId);
    if (layer && layer.shapes.length === 1) {
      setSelectedLayerIds(new Set([layerId]));
      setSelectedShapeIds(new Set());
      return;
    }

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

  const exitAlignMode = useCallback(() => {
    setAlignMode(false);
    setAlignTarget(null);
  }, []);

  /** Called when user confirms alignment in the popup */
  const handleAlignConfirm = useCallback((sourceAnchor: PivotAnchor, targetAnchor: PivotAnchor) => {
    if (!alignTarget || !project) return;
    const workAreaWidth = useAppSettings.getState().workAreaWidth;
    const workH = useAppSettings.getState().workAreaHeight;
    let targetWx: number, targetWy: number;
    if (alignTarget.type === 'board') {
      const boardBbox = { minX: 0, minY: 0, maxX: workAreaWidth, maxY: workH, width: workAreaWidth, height: workH };
      const pt = worldAnchorPoint(boardBbox, targetAnchor);
      targetWx = pt.x;
      targetWy = pt.y;
    } else {
      const targetLayer = project.layers.find(l => l.id === alignTarget.layerId);
      if (!targetLayer) { exitAlignMode(); return; }
      const bbox = computeLayerWorldBBox(targetLayer);
      if (!bbox) { exitAlignMode(); return; }
      const pt = worldAnchorPoint(bbox, targetAnchor);
      targetWx = pt.x;
      targetWy = pt.y;
    }
    alignLayersToPoint(Array.from(selectedLayerIds), targetWx, targetWy, sourceAnchor);
    exitAlignMode();
  }, [alignTarget, project, alignLayersToPoint, selectedLayerIds, exitAlignMode]);

  const shortcuts = useMemo<ShortcutDef[]>(() => {
    const singleLayerId = selectedLayerIds.size === 1 ? Array.from(selectedLayerIds)[0] : null;
    return [
      { key: 'i', ctrl: true, label: 'Import file', handler: () => fileInputRef.current?.click() },
      { key: 'Delete', label: 'Remove layer', handler: () => {
        if (selectedShapeIds.size > 0 && singleLayerId) {
          removeShapes(Array.from(selectedShapeIds), singleLayerId);
          setSelectedShapeIds(new Set());
        } else if (selectedLayerIds.size > 0) {
          for (const lid of selectedLayerIds) removeLayer(lid);
          setSelectedLayerIds(new Set());
        }
      }},
      { key: 'Escape', label: 'Deselect / cancel align', handler: () => {
        if (alignMode) { exitAlignMode(); return; }
        setSelectedLayerIds(new Set()); setSelectedShapeIds(new Set());
      }},
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
            {editingProjectName ? (
              <input
                type="text"
                value={projectNameDraft}
                onChange={e => setProjectNameDraft(e.target.value)}
                onBlur={() => { if (projectNameDraft.trim()) renameProject(project.id, projectNameDraft.trim()); setEditingProjectName(false); }}
                onKeyDown={e => { if (e.key === 'Enter') { if (projectNameDraft.trim()) renameProject(project.id, projectNameDraft.trim()); setEditingProjectName(false); } if (e.key === 'Escape') setEditingProjectName(false); }}
                autoFocus
                className="text-sm font-semibold bg-gray-800 border border-orange-500 rounded px-1 py-0 text-gray-100 focus:outline-none min-w-[100px]"
              />
            ) : (
              <>
                <span
                  className="text-sm font-semibold text-gray-100"
                  title="Double-click to rename"
                  onDoubleClick={() => { setProjectNameDraft(project.name); setEditingProjectName(true); }}
                >{project.name}</span>
                <button
                  onClick={() => { setProjectNameDraft(project.name); setEditingProjectName(true); }}
                  className="text-gray-600 hover:text-orange-400 text-[10px] ml-1"
                  title="Rename project"
                ><FontAwesomeIcon icon={faPencil} /></button>
              </>
            )}
            <span className="text-xs text-gray-500">
              {project.layers.length} layer{project.layers.length !== 1 ? 's' : ''} · {project.operations.length} op{project.operations.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-600">· {new Date(project.updatedAt).toLocaleString()}</span>
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
        <input ref={fileInputRef} type="file" accept=".svg,.png,.jpg,.jpeg,.gif,.bmp,.webp" multiple className="hidden" onChange={handleFileChange} />
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
                  title={!backendConnected ? 'SVG import requires the backend; images can still be imported' : 'Import SVG or image file'}
                ><FontAwesomeIcon icon={faFileImport} /> Import</button>
              )}
            </div>

            {/* Layers list — click outside layers to deselect */}
            <div
              className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0 relative"
              onClick={() => { if (!alignMode) { setSelectedLayerIds(new Set()); setSelectedShapeIds(new Set()); } }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragLeave={e => { e.stopPropagation(); setDragOver(false); }}
              onDrop={e => { e.stopPropagation(); handleDrop(e); }}
            >
              {/* Align mode banner */}
              {alignMode && !alignTarget && (
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-orange-900/80 border border-orange-500 rounded px-2 py-1.5 mb-1 backdrop-blur-sm">
                  <FontAwesomeIcon icon={faCrosshairs} className="text-orange-400 text-xs flex-shrink-0" />
                  <span className="text-xs text-orange-200 flex-1">Click a layer to align to, or:</span>
                  <button
                    onClick={e => { e.stopPropagation(); setAlignTarget({ type: 'board', label: 'Board' }); }}
                    className="text-xs px-1.5 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white"
                  >Board</button>
                  <button onClick={e => { e.stopPropagation(); exitAlignMode(); }} className="text-orange-400 hover:text-orange-200 text-xs ml-1">
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              )}
              {dragOver && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80 border-2 border-dashed border-orange-400 rounded pointer-events-none">
                  <p className="text-sm font-bold text-orange-400">Drop SVG/image file(s) here</p>
                </div>
              )}
              {/* ── Pending imports from Illustrator / external tools ── */}
              {pendingImports.length > 0 && (
                <div className="space-y-1 mb-2" onClick={e => e.stopPropagation()}>
                  <span className="text-[10px] uppercase tracking-wider text-yellow-500 font-semibold px-1">Pending Imports</span>
                  {pendingImports.map(pi => (
                    <div key={pi.id} className="rounded-lg border border-yellow-600/60 bg-yellow-900/20 p-2 flex items-center gap-2">
                      <FontAwesomeIcon icon={faFileImport} className="text-yellow-500 text-xs flex-shrink-0" />
                      <span className="text-xs text-gray-200 truncate flex-1" title={pi.filename}>{pi.filename}</span>
                      <button
                        onClick={() => acceptPendingImport(pi.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-green-700 hover:bg-green-600 text-white font-semibold transition-colors"
                        title="Insert into project"
                      >Insert</button>
                      <button
                        onClick={() => declinePendingImport(pi.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold transition-colors"
                        title="Dismiss"
                      >Dismiss</button>
                    </div>
                  ))}
                </div>
              )}
              {project.layers.length === 0 && pendingImports.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-full border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-orange-500/60 transition-colors"
                  onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  <FontAwesomeIcon icon={faFileImport} className="text-3xl text-gray-600 mb-3" />
                  <p className="text-sm font-semibold text-gray-400">Import SVG or image here</p>
                  <p className="text-xs text-gray-600 mt-1">Click to browse or drag &amp; drop (SVG, PNG, JPEG)</p>
                </div>
              ) : (
                project.layers.map((layer, idx) => {
                const currentColor = layer.color ?? LAYER_COLORS[idx % LAYER_COLORS.length];
                const isDragging = dragLayerId.current === layer.id;
                const isDropTarget = dragOverLayerId === layer.id && dragLayerId.current !== layer.id;
                const dragFromIdx = dragLayerId.current ? project.layers.findIndex(l => l.id === dragLayerId.current) : -1;
                const showBefore = isDropTarget && dragFromIdx > idx;
                const showAfter = isDropTarget && dragFromIdx < idx;
                return (
                <div key={layer.id}>
                {showBefore && (
                  <div className="h-8 border-2 border-dashed border-orange-400/50 rounded-lg mb-1" />
                )}
                <div
                  className={isDragging ? 'opacity-40' : ''}
                >
                <div
                  draggable
                  onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; handleLayerDragStart(layer.id); }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; handleLayerDragOver(layer.id); }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); handleLayerDrop(layer.id); }}
                  onDragEnd={() => { dragLayerId.current = null; setDragOverLayerId(null); }}
                  onClick={e => {
                    e.stopPropagation();
                    setColorPickerLayerId(null);
                    // In align mode, non-selected layers become the alignment target
                    if (alignMode && !selectedLayerIds.has(layer.id)) {
                      setAlignTarget({ type: 'layer', layerId: layer.id, label: layer.name });
                      return;
                    }
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
                  className={`rounded-lg border p-2 cursor-pointer transition-colors ${
                    selectedLayerIds.has(layer.id)
                      ? 'border-orange-500 bg-gray-800'
                      : alignMode && !selectedLayerIds.has(layer.id)
                        ? 'border-blue-500/60 hover:border-blue-400 hover:bg-blue-900/20'
                        : opHighlightedLayerIds.has(layer.id)
                          ? 'border-gray-700 bg-blue-900/20'
                          : 'border-gray-700 hover:border-gray-600'
                  }`}
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
                      <>
                        <span
                          className="flex-1 text-xs text-gray-200 truncate"
                          title={`${layer.name} — double-click to rename`}
                          onDoubleClick={e => { e.stopPropagation(); startEditingLayerName(layer.id, layer.name); }}
                        >{layer.name}</span>
                        <button
                          onClick={e => { e.stopPropagation(); startEditingLayerName(layer.id, layer.name); }}
                          className="text-gray-600 hover:text-orange-400 text-[10px] flex-shrink-0 ml-0.5"
                          title="Rename layer"
                        ><FontAwesomeIcon icon={faPencil} /></button>
                      </>
                    )}

                    {/* Expand/collapse shapes — only when layer has multiple shapes */}
                    {layer.shapes.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleExpandLayer(layer.id); }}
                        className="text-gray-500 hover:text-gray-200 text-xs"
                        title={expandedLayerIds.has(layer.id) ? 'Collapse shapes' : `Expand ${layer.shapes.length} shapes`}
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
                              <>
                                <FontAwesomeIcon
                                  icon={shape.imageDataUrl ? faImage : faBezierCurve}
                                  className={`flex-shrink-0 text-[9px] ${shape.imageDataUrl ? 'text-purple-400' : 'text-sky-400'}`}
                                  title={shape.imageDataUrl ? 'Raster image (PNG/JPEG)' : 'Vector shape (SVG)'}
                                />
                                <span
                                  className={`truncate flex-1 ${isShapeSelected ? 'text-yellow-200' : 'text-gray-400'}`}
                                  title={`${shape.name} — double-click to rename`}
                                  onDoubleClick={e => { e.stopPropagation(); startEditingShapeName(shape.id, layer.id, shape.name); }}
                                >{shape.name}</span>
                                <button
                                  onClick={e => { e.stopPropagation(); startEditingShapeName(shape.id, layer.id, shape.name); }}
                                  className="text-gray-600 hover:text-orange-400 text-[9px] flex-shrink-0 ml-0.5"
                                  title="Rename shape"
                                ><FontAwesomeIcon icon={faPencil} /></button>
                              </>
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
                </div>
                {showAfter && (
                  <div className="h-8 border-2 border-dashed border-orange-400/50 rounded-lg mt-1" />
                )}
                </div>
              )})
              )}

              {/* Bulk actions for multi-layer selection */}
              {selectedLayerIds.size >= 1 && (
                <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-700">
                  <span className="text-xs text-gray-500">{selectedLayerIds.size} layer{selectedLayerIds.size !== 1 ? 's' : ''} selected</span>
                  <div className="flex-1" />
                  {!alignMode && (
                    <button
                      onClick={e => { e.stopPropagation(); setAlignMode(true); }}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      title="Align selected layers to another layer or the board"
                    ><FontAwesomeIcon icon={faCrosshairs} /> Align</button>
                  )}
                  {selectedLayerIds.size > 1 && (
                    <>
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
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Alignment pivot picker overlay */}
            {alignTarget && (
              <div className="relative flex-shrink-0">
                <AlignPivotPicker
                  targetLabel={alignTarget.label}
                  onConfirm={handleAlignConfirm}
                  onCancel={exitAlignMode}
                />
              </div>
            )}

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
                        multiPivot={multiPivotAnchor}
                        onMultiPivotChange={setMultiPivotAnchor}
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
          <Panel defaultSize="53%" minSize="300px" className="min-w-0 min-h-0 relative">
            {/* Navigation toolbar */}
            <div className="absolute top-2 right-2 z-10 flex gap-1 items-center bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-1">
              <button
                onClick={() => canvasRef.current?.zoomIn()}
                className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded text-xs transition-colors"
                title="Zoom in"
              ><FontAwesomeIcon icon={faMagnifyingGlassPlus} /></button>
              {editingZoom ? (
                <input
                  type="text"
                  inputMode="numeric"
                  value={localZoom}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setLocalZoom(v); }}
                  onBlur={() => {
                    const pct = Math.max(1, Math.min(5000, Number(localZoom) || 100));
                    const newScale = calibratedPxPerMm ? pct / 100 * calibratedPxPerMm : pct / 100;
                    canvasRef.current?.setScale(newScale);
                    setEditingZoom(false);
                  }}
                  onFocus={e => e.currentTarget.select()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.currentTarget.blur(); }
                    if (e.key === 'Escape') setEditingZoom(false);
                  }}
                  autoFocus
                  className="w-14 text-xs bg-gray-900 border border-orange-500 rounded px-1 py-0 text-gray-100 text-center focus:outline-none"
                />
              ) : (
                <span
                  className="text-xs text-gray-300 min-w-[3rem] text-center tabular-nums select-none cursor-pointer hover:text-gray-100"
                  title={calibratedPxPerMm
                    ? `${currentZoom.toFixed(3)} px/mm — double-click to set zoom`
                    : `${currentZoom.toFixed(3)} px/mm — double-click to set zoom`}
                  onDoubleClick={() => {
                    const pct = Math.round((calibratedPxPerMm ? currentZoom / calibratedPxPerMm : currentZoom) * 100);
                    setLocalZoom(String(pct));
                    setEditingZoom(true);
                  }}
                >
                  {Math.round((calibratedPxPerMm ? currentZoom / calibratedPxPerMm : currentZoom) * 100)}%
                </span>
              )}
              <button
                onClick={() => canvasRef.current?.zoomOut()}
                className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded text-xs transition-colors"
                title="Zoom out"
              ><FontAwesomeIcon icon={faMagnifyingGlassMinus} /></button>
              <div className="w-px bg-gray-600 mx-0.5" />
              <button
                onClick={() => {
                  if (selectedLayerIds.size > 0 && project) {
                    const sel = project.layers.filter(l => selectedLayerIds.has(l.id) && l.visible);
                    const bbox = sel.length === 1 ? computeLayerWorldBBox(sel[0]) : computeMultiLayerWorldBBox(sel);
                    if (bbox && bbox.width > 0) canvasRef.current?.fitLayers(bbox);
                  }
                }}
                disabled={selectedLayerIds.size === 0}
                className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded text-xs transition-colors disabled:opacity-30"
                title="Fit selected layer(s)"
              ><FontAwesomeIcon icon={faCompress} /></button>
              <button
                onClick={() => canvasRef.current?.fitAll()}
                className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded text-xs transition-colors"
                title="Fit entire work area"
              ><FontAwesomeIcon icon={faExpand} /></button>
              <div className="w-px bg-gray-600 mx-0.5" />
              <button
                onClick={() => setShowRulerCalibration(true)}
                className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded text-xs transition-colors"
                title="Calibrate zoom to physical ruler"
              >📐</button>
            </div>

            {/* Uncalibrated warning */}
            {!calibratedPxPerMm && (
              <div
                className="absolute top-12 right-2 z-10 flex items-center gap-1.5 bg-yellow-900/80 backdrop-blur-sm border border-yellow-700/60 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-yellow-800/80 transition-colors"
                title="Screen not calibrated — displayed sizes may not match real dimensions. Click to calibrate."
                onClick={() => setShowRulerCalibration(true)}
              >
                <span className="text-yellow-400 text-xs">⚠</span>
                <span className="text-yellow-300/90 text-[10px]">Size may be inaccurate — calibrate 📐</span>
              </div>
            )}

            {/* Ruler calibration overlay */}
            {showRulerCalibration && (
              <RulerCalibration
                onApply={pxPerMm => { setCalibratedPxPerMm(pxPerMm); canvasRef.current?.setScale(pxPerMm); setShowRulerCalibration(false); }}
                onClose={() => setShowRulerCalibration(false)}
              />
            )}
            <SvgCanvas
              ref={canvasRef}
              layers={project.layers}
              operations={project.operations}
              selectedLayerIds={selectedLayerIds}
              selectedShapeIds={selectedShapeIds}
              onSelectLayer={(id) => setSelectedLayerIds(new Set([id]))}
              onSelectShape={handleCanvasShapeClick}
              onUpdateLayer={(id, partial) => updateLayerTransform(id, partial)}
              originPosition={originPosition}
              transformPreview={transformPreview}
              multiPivotAnchor={multiPivotAnchor}
              onZoomChange={setCurrentZoom}
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
              selectedLayerIds={selectedLayerIds}
              onSelectedOpIdsChange={setOpHighlightedLayerIds}
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

      {/* Image import dialog (DPI confirmation) */}
      {imageImportQueue.length > 0 && (
        <ImageImportDialog
          file={imageImportQueue[0]}
          onConfirm={handleImageImportConfirm}
          onCancel={handleImageImportCancel}
        />
      )}
    </div>
  );
}
