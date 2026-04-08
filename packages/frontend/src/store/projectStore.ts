import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';
import type { Project, ProjectFile, ProjectVersion, Layer, Shape, Operation, PathGeometry, Job, PivotAnchor } from '../types';
import { computeShapesBoundingBox, bakeLayerTransform, splitPathIntoSubpaths, computeMultiLayerWorldBBox, worldAnchorPoint } from '../utils/geometry';
import { useAppSettings, type OriginPosition } from './appSettingsStore';

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Return the default layer pivot anchor that matches the board origin position. */
function defaultPivot(originPosition: OriginPosition): PivotAnchor {
  return originPosition === 'bottom-left' ? 'bl' : 'tl';
}

interface ProjectStore {
  projects: Project[];
  activeProjectId: string | null;

  // Project CRUD
  createProject: (name: string) => Project;
  deleteProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  setActiveProjectId: (id: string | null) => void;

  // File import
  importSvgFile: (file: File) => Promise<void>;
  importImageFile: (file: File, dpi?: number) => Promise<void>;
  /** Import SVG data pushed from an external tool (e.g. Adobe Illustrator). */
  importSvgFromPush: (data: { geometry: PathGeometry[]; sourceSvg: string; filename: string }) => void;

  // Layer management
  addLayer: (name: string) => void;
  removeLayer: (layerId: string) => void;
  renameLayer: (layerId: string, name: string) => void;
  updateLayerColor: (layerId: string, color: string) => void;
  updateLayerTransform: (layerId: string, partial: Partial<Pick<Layer, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation' | 'mirrorX' | 'mirrorY' | 'pivot'>>) => void;
  toggleLayerVisibility: (layerId: string) => void;
  moveLayerUp: (layerId: string) => void;
  moveLayerDown: (layerId: string) => void;
  reorderLayer: (layerId: string, toIndex: number) => void;

  // Shape management
  moveShapeToLayer: (shapeId: string, fromLayerId: string, toLayerId: string) => void;
  moveShapeToNewLayer: (shapeId: string, fromLayerId: string, newLayerName: string) => void;
  moveShapesToLayer: (shapeIds: string[], fromLayerId: string, toLayerId: string) => void;
  moveShapesToNewLayer: (shapeIds: string[], fromLayerId: string, newLayerName: string) => void;
  removeShapes: (shapeIds: string[], layerId: string) => void;
  renameShape: (shapeId: string, layerId: string, name: string) => void;
  /** Update the SVG path data for one or more shapes within a layer. */
  updateShapePaths: (layerId: string, updates: Record<string, string>) => void;

  /** Merge multiple layers into one, baking each layer's transform into its shape paths. */
  mergeLayers: (layerIds: string[]) => string | null;

  /** Split a shape whose `d` contains multiple subpaths into separate shapes (one per subpath). */
  splitShapeSubpaths: (shapeId: string, layerId: string) => boolean;

  /** Split a layer into separate layers, one per shape (original layer is removed). */
  splitLayerIntoShapeLayers: (layerId: string) => string[];

  /**
   * Align one or more layers so that `sourceAnchor` of their combined world bounding box
   * coincides with (targetWx, targetWy) in world space.
   */
  alignLayersToPoint: (sourceLayerIds: string[], targetWx: number, targetWy: number, sourceAnchor: PivotAnchor) => void;

  // Operations
  addOperation: () => string | null;
  addOperationForLayers: (layerIds: string[]) => string | null;
  updateOperation: (opId: string, partial: Partial<Operation>) => void;
  removeOperation: (opId: string) => void;
  moveOperationUp: (opId: string) => void;
  moveOperationDown: (opId: string) => void;
  reorderOperation: (opId: string, toIndex: number) => void;
  toggleOperationEnabled: (opId: string) => void;
  assignLayerToOperation: (opId: string, layerId: string) => void;
  unassignLayerFromOperation: (opId: string, layerId: string) => void;
  duplicateOperation: (opId: string, selectedLayerIds?: string[]) => string | null;

  // Versioning
  saveVersion: (label: string) => void;
  restoreVersion: (versionId: string) => void;
  deleteVersion: (versionId: string) => void;

  // Job generation
  compileJob: (opts?: {
    machineId?: string;
    originFlip?: boolean;
    workH?: number;
  }) => Promise<Job>;
}

function getActiveProject(projects: Project[], id: string | null): Project | undefined {
  return projects.find(p => p.id === id);
}

function updateProject(projects: Project[], id: string, updater: (p: Project) => Project): Project[] {
  return projects.map(p => p.id === id ? updater({ ...p, updatedAt: new Date().toISOString() }) : p);
}

/** Shared helper: build shapes, ProjectFile, and Layer from parsed SVG geometry. */
function buildSvgImportData(geometry: PathGeometry[], sourceSvg: string, filename: string): { projectFile: ProjectFile; layer: Layer } {
  const fileId = uid();
  const shapes: Shape[] = geometry.map((g, idx) => ({
    id: `${fileId}-shape-${idx}`,
    name: `Shape ${idx + 1}`,
    d: g.d,
    sourceFileId: fileId,
    fill: g.fill,
  }));

  const projectFile: ProjectFile = {
    id: fileId,
    name: filename,
    sourceSvg,
    shapes,
  };

  const bbox = computeShapesBoundingBox(shapes);
  const { originPosition, workAreaHeight } = useAppSettings.getState();
  const offsetX = bbox ? -bbox.minX : 0;
  let offsetY = 0;
  if (bbox) {
    if (originPosition === 'bottom-left') {
      offsetY = workAreaHeight - bbox.maxY;
    } else {
      offsetY = -bbox.minY;
    }
  }

  const layerId = uid();
  const layer: Layer = {
    id: layerId,
    name: filename,
    shapes: [...shapes],
    visible: true,
    offsetX,
    offsetY,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    mirrorX: false,
    mirrorY: false,
    pivot: defaultPivot(originPosition),
  };

  return { projectFile, layer };
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      createProject: (name: string) => {
        const project: Project = {
          id: uid(),
          name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          files: [],
          layers: [],
          operations: [],
          versions: [],
        };
        set(s => ({ projects: [project, ...s.projects], activeProjectId: project.id }));
        return project;
      },

      deleteProject: (id: string) => {
        set(s => ({
          projects: s.projects.filter(p => p.id !== id),
          activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
        }));
      },

      renameProject: (id: string, name: string) => {
        set(s => ({ projects: updateProject(s.projects, id, p => ({ ...p, name })) }));
      },

      setActiveProjectId: (id: string | null) => {
        set({ activeProjectId: id });
      },

      importSvgFile: async (file: File) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;

        // Upload SVG to backend for parsing
        const form = new FormData();
        form.append('file', file);
        const job = await api.postForm('/api/jobs', form) as { id: string; geometry: PathGeometry[]; sourceSvg?: string };

        const filename = file.name.replace(/\.svg$/i, '');
        const { projectFile, layer } = buildSvgImportData(job.geometry, job.sourceSvg ?? '', filename);

        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            files: [...p.files, projectFile],
            layers: [...p.layers, layer],
            gcodeUpToDate: false,
          })),
        }));
      },

      importSvgFromPush: (data: { geometry: PathGeometry[]; sourceSvg: string; filename: string }) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;

        const { projectFile, layer } = buildSvgImportData(data.geometry, data.sourceSvg, data.filename);

        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            files: [...p.files, projectFile],
            layers: [...p.layers, layer],
            gcodeUpToDate: false,
          })),
        }));
      },

      importImageFile: async (file: File, dpi?: number) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;

        // Read file as data URL
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read image file'));
          reader.readAsDataURL(file);
        });

        // Get image dimensions
        const { width: imgW, height: imgH } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => reject(new Error('Failed to decode image'));
          img.src = dataUrl;
        });

        if (imgW === 0 || imgH === 0) throw new Error('Image has zero dimensions');

        // Convert pixels to mm using the supplied DPI (default 96 — the CSS/browser standard).
        const effectiveDpi = dpi && dpi > 0 ? dpi : 96;
        const widthMm = (imgW / effectiveDpi) * 25.4;
        const heightMm = (imgH / effectiveDpi) * 25.4;

        const fileId = uid();
        const baseName = file.name.replace(/\.[^.]+$/, '');

        // Create a rectangle path matching the image dimensions
        const rectPath = `M 0 0 L ${widthMm} 0 L ${widthMm} ${heightMm} L 0 ${heightMm} Z`;

        const shape: Shape = {
          id: `${fileId}-image-0`,
          name: baseName,
          d: rectPath,
          sourceFileId: fileId,
          imageDataUrl: dataUrl,
        };

        const projectFile: ProjectFile = {
          id: fileId,
          name: baseName,
          sourceSvg: '', // no SVG content for raster images
          shapes: [shape],
        };

        // Position layer based on origin setting
        const { originPosition, workAreaHeight } = useAppSettings.getState();
        const offsetX = 0;
        let offsetY = 0;
        if (originPosition === 'bottom-left') {
          offsetY = workAreaHeight - heightMm;
        }

        const layerId = uid();
        const layer: Layer = {
          id: layerId,
          name: baseName,
          shapes: [shape],
          visible: true,
          offsetX,
          offsetY,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          mirrorX: false,
          mirrorY: false,
          pivot: defaultPivot(originPosition),
        };

        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            files: [...p.files, projectFile],
            layers: [...p.layers, layer],
            gcodeUpToDate: false,
          })),
        }));
      },

      addLayer: (name: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        const { originPosition } = useAppSettings.getState();
        const layer: Layer = {
          id: uid(),
          name,
          shapes: [],
          visible: true,
          offsetX: 0,
          offsetY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          mirrorX: false,
          mirrorY: false,
          pivot: defaultPivot(originPosition),
        };
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: [...p.layers, layer],
          })),
        }));
      },

      removeLayer: (layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.filter(l => l.id !== layerId),
            operations: p.operations.map(op => ({
              ...op,
              layerIds: op.layerIds.filter(lid => lid !== layerId),
            })),
            gcodeUpToDate: false,
          })),
        }));
      },

      renameLayer: (layerId: string, name: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l => l.id === layerId ? { ...l, name } : l),
          })),
        }));
      },

      updateLayerColor: (layerId: string, color: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l => l.id === layerId ? { ...l, color } : l),
          })),
        }));
      },

      updateLayerTransform: (layerId: string, partial) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l => l.id === layerId ? { ...l, ...partial } : l),
            gcodeUpToDate: false,
          })),
        }));
      },

      toggleLayerVisibility: (layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l),
          })),
        }));
      },

      moveLayerUp: (layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const idx = p.layers.findIndex(l => l.id === layerId);
            if (idx <= 0) return p;
            const next = [...p.layers];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            return { ...p, layers: next, gcodeUpToDate: false };
          }),
        }));
      },

      moveLayerDown: (layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const idx = p.layers.findIndex(l => l.id === layerId);
            if (idx < 0 || idx >= p.layers.length - 1) return p;
            const next = [...p.layers];
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            return { ...p, layers: next, gcodeUpToDate: false };
          }),
        }));
      },

      reorderLayer: (layerId: string, toIndex: number) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const idx = p.layers.findIndex(l => l.id === layerId);
            if (idx < 0) return p;
            const next = [...p.layers];
            const [item] = next.splice(idx, 1);
            next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
            return { ...p, layers: next };
          }),
        }));
      },

      moveShapeToLayer: (shapeId: string, fromLayerId: string, toLayerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId || fromLayerId === toLayerId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const fromLayer = p.layers.find(l => l.id === fromLayerId);
            const shape = fromLayer?.shapes.find(sh => sh.id === shapeId);
            if (!shape) return p;
            return {
              ...p,
              layers: p.layers.map(l => {
                if (l.id === fromLayerId) return { ...l, shapes: l.shapes.filter(sh => sh.id !== shapeId) };
                if (l.id === toLayerId) return { ...l, shapes: [...l.shapes, shape] };
                return l;
              }),
            };
          }),
        }));
      },

      moveShapeToNewLayer: (shapeId: string, fromLayerId: string, newLayerName: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const fromLayer = p.layers.find(l => l.id === fromLayerId);
            const shape = fromLayer?.shapes.find(sh => sh.id === shapeId);
            if (!shape || !fromLayer) return p;
            const newLayer: Layer = {
              id: uid(),
              name: newLayerName,
              shapes: [shape],
              visible: true,
              offsetX: fromLayer.offsetX ?? 0,
              offsetY: fromLayer.offsetY ?? 0,
              scaleX: fromLayer.scaleX ?? 1,
              scaleY: fromLayer.scaleY ?? 1,
              rotation: fromLayer.rotation ?? 0,
              mirrorX: fromLayer.mirrorX ?? false,
              mirrorY: fromLayer.mirrorY ?? false,
              pivot: fromLayer.pivot ?? 'tl',
            };
            return {
              ...p,
              layers: [
                ...p.layers.map(l =>
                  l.id === fromLayerId ? { ...l, shapes: l.shapes.filter(sh => sh.id !== shapeId) } : l
                ),
                newLayer,
              ],
            };
          }),
        }));
      },

      moveShapesToLayer: (shapeIds: string[], fromLayerId: string, toLayerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId || fromLayerId === toLayerId || shapeIds.length === 0) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const fromLayer = p.layers.find(l => l.id === fromLayerId);
            if (!fromLayer) return p;
            const shapes = fromLayer.shapes.filter(sh => shapeIds.includes(sh.id));
            if (shapes.length === 0) return p;
            return {
              ...p,
              layers: p.layers.map(l => {
                if (l.id === fromLayerId) return { ...l, shapes: l.shapes.filter(sh => !shapeIds.includes(sh.id)) };
                if (l.id === toLayerId) return { ...l, shapes: [...l.shapes, ...shapes] };
                return l;
              }),
            };
          }),
        }));
      },

      moveShapesToNewLayer: (shapeIds: string[], fromLayerId: string, newLayerName: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId || shapeIds.length === 0) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const fromLayer = p.layers.find(l => l.id === fromLayerId);
            if (!fromLayer) return p;
            const shapes = fromLayer.shapes.filter(sh => shapeIds.includes(sh.id));
            if (shapes.length === 0) return p;
            const newLayer: Layer = {
              id: uid(),
              name: newLayerName,
              shapes,
              visible: true,
              offsetX: fromLayer.offsetX ?? 0,
              offsetY: fromLayer.offsetY ?? 0,
              scaleX: fromLayer.scaleX ?? 1,
              scaleY: fromLayer.scaleY ?? 1,
              rotation: fromLayer.rotation ?? 0,
              mirrorX: fromLayer.mirrorX ?? false,
              mirrorY: fromLayer.mirrorY ?? false,
              pivot: fromLayer.pivot ?? 'tl',
            };
            return {
              ...p,
              layers: [
                ...p.layers.map(l =>
                  l.id === fromLayerId ? { ...l, shapes: l.shapes.filter(sh => !shapeIds.includes(sh.id)) } : l
                ),
                newLayer,
              ],
            };
          }),
        }));
      },

      removeShapes: (shapeIds: string[], layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId || shapeIds.length === 0) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l =>
              l.id === layerId ? { ...l, shapes: l.shapes.filter(sh => !shapeIds.includes(sh.id)) } : l
            ),
            gcodeUpToDate: false,
          })),
        }));
      },

      renameShape: (shapeId: string, layerId: string, name: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l =>
              l.id === layerId
                ? { ...l, shapes: l.shapes.map(sh => sh.id === shapeId ? { ...sh, name } : sh) }
                : l
            ),
          })),
        }));
      },

      updateShapePaths: (layerId: string, updates: Record<string, string>) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l =>
              l.id === layerId
                ? { ...l, shapes: l.shapes.map(sh => updates[sh.id] !== undefined ? { ...sh, d: updates[sh.id] } : sh) }
                : l
            ),
            gcodeUpToDate: false,
          })),
        }));
      },

      mergeLayers: (layerIds: string[]) => {
        const { activeProjectId } = get();
        if (!activeProjectId || layerIds.length < 2) return null;
        const project = getActiveProject(get().projects, activeProjectId);
        if (!project) return null;
        const mergingLayers = layerIds.map(id => project.layers.find(l => l.id === id)).filter(Boolean) as Layer[];
        if (mergingLayers.length < 2) return null;
        const target = mergingLayers[0];
        const rest = mergingLayers.slice(1);
        const restIds = new Set(rest.map(l => l.id));

        // Bake all layers' transforms into their shapes' path data
        const targetShapes = bakeLayerTransform(target);
        const otherShapes: Shape[] = [];
        for (const l of rest) {
          otherShapes.push(...bakeLayerTransform(l));
        }
        const allShapes = [...targetShapes, ...otherShapes];

        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers
              .filter(l => !restIds.has(l.id))
              .map(l => l.id === target.id ? {
                ...l,
                shapes: allShapes,
                offsetX: 0,
                offsetY: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                mirrorX: false,
                mirrorY: false,
                pivot: defaultPivot(useAppSettings.getState().originPosition),
              } : l),
            operations: p.operations.map(op => ({
              ...op,
              layerIds: op.layerIds.map(lid => restIds.has(lid) ? target.id : lid)
                .filter((lid, i, arr) => arr.indexOf(lid) === i),
            })),
            gcodeUpToDate: false,
          })),
        }));
        return target.id;
      },

      splitShapeSubpaths: (shapeId: string, layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return false;
        const project = getActiveProject(get().projects, activeProjectId);
        if (!project) return false;
        const layer = project.layers.find(l => l.id === layerId);
        if (!layer) return false;
        const shape = layer.shapes.find(s => s.id === shapeId);
        if (!shape) return false;
        const subpaths = splitPathIntoSubpaths(shape.d);
        if (subpaths.length < 2) return false;
        const newShapes: Shape[] = subpaths.map((d, i) => ({
          id: uid(),
          name: `${shape.name} ${i + 1}`,
          d,
          sourceFileId: shape.sourceFileId,
        }));
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l =>
              l.id === layerId
                ? { ...l, shapes: l.shapes.flatMap(sh => sh.id === shapeId ? newShapes : [sh]) }
                : l
            ),
            gcodeUpToDate: false,
          })),
        }));
        return true;
      },

      splitLayerIntoShapeLayers: (layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return [];
        const project = getActiveProject(get().projects, activeProjectId);
        if (!project) return [];
        const layer = project.layers.find(l => l.id === layerId);
        if (!layer || layer.shapes.length < 2) return [];
        const newLayers: Layer[] = layer.shapes.map((shape, i) => ({
          id: uid(),
          name: shape.name || `${layer.name} ${i + 1}`,
          shapes: [shape],
          visible: layer.visible,
          offsetX: layer.offsetX,
          offsetY: layer.offsetY,
          scaleX: layer.scaleX,
          scaleY: layer.scaleY,
          rotation: layer.rotation,
          mirrorX: layer.mirrorX,
          mirrorY: layer.mirrorY,
          pivot: layer.pivot,
        }));
        const newIds = newLayers.map(l => l.id);
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const idx = p.layers.findIndex(l => l.id === layerId);
            const layersBefore = p.layers.slice(0, idx);
            const layersAfter = p.layers.slice(idx + 1);
            return {
              ...p,
              layers: [...layersBefore, ...newLayers, ...layersAfter],
              operations: p.operations.map(op => {
                if (!op.layerIds.includes(layerId)) return op;
                const filtered = op.layerIds.filter(lid => lid !== layerId);
                const merged = [...filtered, ...newIds];
                return { ...op, layerIds: merged.filter((lid, i, arr) => arr.indexOf(lid) === i) };
              }),
              gcodeUpToDate: false,
            };
          }),
        }));
        return newIds;
      },

      alignLayersToPoint: (sourceLayerIds, targetWx, targetWy, sourceAnchor) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        const project = getActiveProject(get().projects, activeProjectId);
        if (!project) return;
        const sourceLayers = sourceLayerIds
          .map(id => project.layers.find(l => l.id === id))
          .filter(Boolean) as Layer[];
        if (sourceLayers.length === 0) return;
        const worldBbox = computeMultiLayerWorldBBox(sourceLayers);
        if (!worldBbox) return;
        const sourcePoint = worldAnchorPoint(worldBbox, sourceAnchor);
        const dx = targetWx - sourcePoint.x;
        const dy = targetWy - sourcePoint.y;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l =>
              sourceLayerIds.includes(l.id)
                ? { ...l, offsetX: l.offsetX + dx, offsetY: l.offsetY + dy }
                : l,
            ),
            gcodeUpToDate: false,
          })),
        }));
      },

      addOperation: () => {
        const { activeProjectId } = get();
        if (!activeProjectId) return null;
        const op: Operation = {
          id: uid(),
          type: 'cut',
          feedRate: 800,
          power: 80,
          passes: 1,
          layerIds: [],
          enabled: true,
        };
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            operations: [...p.operations, op],
            gcodeUpToDate: false,
          })),
        }));
        return op.id;
      },

      addOperationForLayers: (layerIds: string[]) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return null;
        const op: Operation = {
          id: uid(),
          type: 'cut',
          feedRate: 800,
          power: 80,
          passes: 1,
          layerIds,
          enabled: true,
        };
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            operations: [...p.operations, op],
            gcodeUpToDate: false,
          })),
        }));
        return op.id;
      },

      updateOperation: (opId: string, partial: Partial<Operation>) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            operations: p.operations.map(op => op.id === opId ? { ...op, ...partial } : op),
            gcodeUpToDate: false,
          })),
        }));
      },

      removeOperation: (opId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            operations: p.operations.filter(op => op.id !== opId),
            gcodeUpToDate: false,
          })),
        }));
      },

      moveOperationUp: (opId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const idx = p.operations.findIndex(op => op.id === opId);
            if (idx <= 0) return p;
            const next = [...p.operations];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            return { ...p, operations: next, gcodeUpToDate: false };
          }),
        }));
      },

      moveOperationDown: (opId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const idx = p.operations.findIndex(op => op.id === opId);
            if (idx < 0 || idx >= p.operations.length - 1) return p;
            const next = [...p.operations];
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            return { ...p, operations: next, gcodeUpToDate: false };
          }),
        }));
      },

      reorderOperation: (opId: string, toIndex: number) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => {
            const idx = p.operations.findIndex(op => op.id === opId);
            if (idx < 0) return p;
            const next = [...p.operations];
            const [item] = next.splice(idx, 1);
            next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
            return { ...p, operations: next, gcodeUpToDate: false };
          }),
        }));
      },

      toggleOperationEnabled: (opId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            operations: p.operations.map(op =>
              op.id === opId ? { ...op, enabled: !op.enabled } : op
            ),
            gcodeUpToDate: false,
          })),
        }));
      },

      assignLayerToOperation: (opId: string, layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            operations: p.operations.map(op =>
              op.id === opId && !op.layerIds.includes(layerId)
                ? { ...op, layerIds: [...op.layerIds, layerId] }
                : op
            ),
            gcodeUpToDate: false,
          })),
        }));
      },

      unassignLayerFromOperation: (opId: string, layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            operations: p.operations.map(op =>
              op.id === opId
                ? { ...op, layerIds: op.layerIds.filter(lid => lid !== layerId) }
                : op
            ),
            gcodeUpToDate: false,
          })),
        }));
      },

      duplicateOperation: (opId: string, selectedLayerIds?: string[]) => {
        const { activeProjectId, projects } = get();
        const project = getActiveProject(projects, activeProjectId);
        if (!project) return null;
        const original = project.operations.find(op => op.id === opId);
        if (!original) return null;
        const dup: Operation = {
          ...structuredClone(original),
          id: uid(),
          label: `${original.label ?? original.type} (copy)`,
          layerIds: selectedLayerIds && selectedLayerIds.length > 0 ? selectedLayerIds : structuredClone(original.layerIds),
        };
        const idx = project.operations.findIndex(op => op.id === opId);
        set(s => ({
          projects: updateProject(s.projects, activeProjectId!, p => {
            const ops = [...p.operations];
            ops.splice(idx + 1, 0, dup);
            return { ...p, operations: ops, gcodeUpToDate: false };
          }),
        }));
        return dup.id;
      },

      saveVersion: (label: string) => {
        const { activeProjectId, projects } = get();
        const project = getActiveProject(projects, activeProjectId);
        if (!project) return;
        const version: ProjectVersion = {
          id: uid(),
          label,
          createdAt: new Date().toISOString(),
          snapshot: {
            files: structuredClone(project.files),
            layers: structuredClone(project.layers),
            operations: structuredClone(project.operations),
          },
        };
        set(s => ({
          projects: updateProject(s.projects, activeProjectId!, p => ({
            ...p,
            versions: [...p.versions, version],
          })),
        }));
      },

      restoreVersion: (versionId: string) => {
        const { activeProjectId, projects } = get();
        const project = getActiveProject(projects, activeProjectId);
        if (!project) return;
        const version = project.versions.find(v => v.id === versionId);
        if (!version) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId!, p => ({
            ...p,
            files: structuredClone(version.snapshot.files),
            layers: structuredClone(version.snapshot.layers),
            operations: structuredClone(version.snapshot.operations),
            gcodeUpToDate: false,
          })),
        }));
      },

      deleteVersion: (versionId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            versions: p.versions.filter(v => v.id !== versionId),
          })),
        }));
      },

      compileJob: async (opts) => {
        const { machineId, originFlip, workH } = opts ?? {};
        const { activeProjectId, projects } = get();
        const project = getActiveProject(projects, activeProjectId);
        if (!project) throw new Error('No active project');

        const enabledOps = project.operations.filter(op => op.enabled);
        if (enabledOps.length === 0) throw new Error('No enabled operations');

        // Collect geometry from all layers referenced by enabled operations.
        // Each layer's geometry is added only once even when multiple operations
        // reference the same layer; the backend generator filters by layerIds per
        // operation so duplicates here would cause extra passes.
        const geometry: PathGeometry[] = [];
        const layerTransforms: Record<string, { offsetX: number; offsetY: number; scaleX: number; scaleY: number; rotation: number; mirrorX: boolean; mirrorY: boolean }> = {};
        const seenLayerIds = new Set<string>();

        for (const op of enabledOps) {
          for (const layerId of op.layerIds) {
            if (seenLayerIds.has(layerId)) continue;
            seenLayerIds.add(layerId);
            const layer = project.layers.find(l => l.id === layerId);
            if (!layer) continue;
            layerTransforms[layerId] = {
              offsetX: layer.offsetX,
              offsetY: layer.offsetY,
              scaleX: layer.scaleX,
              scaleY: layer.scaleY,
              rotation: layer.rotation ?? 0,
              mirrorX: layer.mirrorX ?? false,
              mirrorY: layer.mirrorY ?? false,
            };
            for (const shape of layer.shapes) {
              geometry.push({ d: shape.d, layerId, fill: shape.fill, imageDataUrl: shape.imageDataUrl });
            }
          }
        }

        if (geometry.length === 0) throw new Error('No geometry in the selected layers');

        // Build default job name with project name, version (if set), and operation count
        const version = project.versions.length > 0 ? project.versions[0].label : undefined;
        const opCount = enabledOps.length;
        const defaultName = version
          ? `${project.name} (${version}) - ${opCount} op${opCount !== 1 ? 's' : ''}`
          : `${project.name} - ${opCount} op${opCount !== 1 ? 's' : ''}`;

        const result = await api.post('/api/jobs/compile', {
          name: defaultName,
          geometry,
          operations: enabledOps.map(op => ({
            id: op.id,
            type: op.type,
            feedRate: op.feedRate,
            power: op.power,
            passes: op.passes,
            zOffset: op.zOffset,
            layerIds: op.layerIds,
            engraveLineInterval: op.engraveLineInterval,
            engraveLineAngle: op.engraveLineAngle,
            engravePattern: op.engravePattern,
          })),
          machineId,
          layerTransforms,
          originFlip,
          workH,
          projectId: project.id,
          projectVersion: version,
        }) as Job;

        set(s => ({
          projects: updateProject(s.projects, activeProjectId!, p => ({
            ...p,
            jobId: result.id,
            gcode: result.gcode,
            gcodeUpToDate: true,
          })),
        }));

        return result;
      },
    }),
    {
      name: 'laserflow-projects',
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);
