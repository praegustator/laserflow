import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';
import type { Project, ProjectFile, ProjectVersion, Layer, Shape, Operation, PathGeometry, Job } from '../types';

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

  // Layer management
  addLayer: (name: string) => void;
  removeLayer: (layerId: string) => void;
  renameLayer: (layerId: string, name: string) => void;
  updateLayerTransform: (layerId: string, partial: Partial<Pick<Layer, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation' | 'mirrorX' | 'mirrorY' | 'pivot'>>) => void;
  toggleLayerVisibility: (layerId: string) => void;
  moveLayerUp: (layerId: string) => void;
  moveLayerDown: (layerId: string) => void;

  // Shape management
  moveShapeToLayer: (shapeId: string, fromLayerId: string, toLayerId: string) => void;
  moveShapeToNewLayer: (shapeId: string, fromLayerId: string, newLayerName: string) => void;
  moveShapesToLayer: (shapeIds: string[], fromLayerId: string, toLayerId: string) => void;
  removeShapes: (shapeIds: string[], layerId: string) => void;

  // Operations
  addOperation: () => void;
  updateOperation: (opId: string, partial: Partial<Operation>) => void;
  removeOperation: (opId: string) => void;
  moveOperationUp: (opId: string) => void;
  moveOperationDown: (opId: string) => void;
  toggleOperationEnabled: (opId: string) => void;
  assignLayerToOperation: (opId: string, layerId: string) => void;
  unassignLayerFromOperation: (opId: string, layerId: string) => void;
  duplicateOperation: (opId: string) => void;

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

        const fileId = uid();
        const shapes: Shape[] = job.geometry.map((g, idx) => ({
          id: `${fileId}-shape-${idx}`,
          name: `Shape ${idx + 1}`,
          d: g.d,
          sourceFileId: fileId,
        }));

        const projectFile: ProjectFile = {
          id: fileId,
          name: file.name.replace(/\.svg$/i, ''),
          sourceSvg: job.sourceSvg ?? '',
          shapes,
        };

        // Create a default layer for this file with all shapes
        const layerId = uid();
        const layer: Layer = {
          id: layerId,
          name: file.name.replace(/\.svg$/i, ''),
          shapes: [...shapes],
          visible: true,
          offsetX: 0,
          offsetY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          mirrorX: false,
          mirrorY: false,
          pivot: 'tl',
        };

        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            files: [...p.files, projectFile],
            layers: [...p.layers, layer],
          })),
        }));
      },

      addLayer: (name: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
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
          pivot: 'tl',
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

      updateLayerTransform: (layerId: string, partial) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l => l.id === layerId ? { ...l, ...partial } : l),
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
            return { ...p, layers: next };
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
            if (!shape) return p;
            const newLayer: Layer = {
              id: uid(),
              name: newLayerName,
              shapes: [shape],
              visible: true,
              offsetX: 0,
              offsetY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              mirrorX: false,
              mirrorY: false,
              pivot: 'tl',
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

      removeShapes: (shapeIds: string[], layerId: string) => {
        const { activeProjectId } = get();
        if (!activeProjectId || shapeIds.length === 0) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            layers: p.layers.map(l =>
              l.id === layerId ? { ...l, shapes: l.shapes.filter(sh => !shapeIds.includes(sh.id)) } : l
            ),
          })),
        }));
      },

      addOperation: () => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
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
          })),
        }));
      },

      updateOperation: (opId: string, partial: Partial<Operation>) => {
        const { activeProjectId } = get();
        if (!activeProjectId) return;
        set(s => ({
          projects: updateProject(s.projects, activeProjectId, p => ({
            ...p,
            operations: p.operations.map(op => op.id === opId ? { ...op, ...partial } : op),
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
            return { ...p, operations: next };
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
            return { ...p, operations: next };
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
          })),
        }));
      },

      duplicateOperation: (opId: string) => {
        const { activeProjectId, projects } = get();
        const project = getActiveProject(projects, activeProjectId);
        if (!project) return;
        const original = project.operations.find(op => op.id === opId);
        if (!original) return;
        const dup: Operation = {
          ...structuredClone(original),
          id: uid(),
          label: original.label ? `${original.label} (copy)` : undefined,
        };
        const idx = project.operations.findIndex(op => op.id === opId);
        set(s => ({
          projects: updateProject(s.projects, activeProjectId!, p => {
            const ops = [...p.operations];
            ops.splice(idx + 1, 0, dup);
            return { ...p, operations: ops };
          }),
        }));
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

        const enabledOps = project.operations.filter(op => op.enabled && op.type !== 'ignore');
        if (enabledOps.length === 0) throw new Error('No enabled operations');

        // Collect geometry from all layers referenced by enabled operations
        const geometry: PathGeometry[] = [];
        const layerTransforms: Record<string, { offsetX: number; offsetY: number; scaleX: number; scaleY: number; rotation: number; mirrorX: boolean; mirrorY: boolean }> = {};

        for (const op of enabledOps) {
          for (const layerId of op.layerIds) {
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
              geometry.push({ d: shape.d, layerId });
            }
          }
        }

        if (geometry.length === 0) throw new Error('No geometry in the selected layers');

        const result = await api.post('/api/jobs/compile', {
          name: project.name,
          geometry,
          operations: enabledOps.map(op => ({
            id: op.id,
            type: op.type,
            feedRate: op.feedRate,
            power: op.power,
            passes: op.passes,
            zOffset: op.zOffset,
            layerIds: op.layerIds,
          })),
          machineId,
          layerTransforms,
          originFlip,
          workH,
        }) as Job;

        set(s => ({
          projects: updateProject(s.projects, activeProjectId!, p => ({
            ...p,
            jobId: result.id,
            gcode: result.gcode,
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
