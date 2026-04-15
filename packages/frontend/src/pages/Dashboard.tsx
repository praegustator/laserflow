import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../store/projectStore';
import { useJobStore } from '../store/jobStore';
import { useAppSettings } from '../store/appSettingsStore';
import { useMachineStore } from '../store/machineStore';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faTableCells, faList, faSort, faSortUp, faSortDown, faPencil } from '@fortawesome/free-solid-svg-icons';

type SortKey = 'updatedAt' | 'name' | 'layers' | 'ops';
type SortDir = 'asc' | 'desc';

const SORT_LABELS: Record<SortKey, string> = {
  updatedAt: 'Last modified',
  name: 'Name',
  layers: 'Layers',
  ops: 'Operations',
};

export default function Dashboard() {
  const projects = useProjectStore(s => s.projects);
  const createProject = useProjectStore(s => s.createProject);
  const deleteProject = useProjectStore(s => s.deleteProject);
  const renameProject = useProjectStore(s => s.renameProject);
  const setActiveProjectId = useProjectStore(s => s.setActiveProjectId);
  const jobs = useJobStore(s => s.jobs);
  const fetchJobs = useJobStore(s => s.fetchJobs);
  const backendConnected = useMachineStore(s => s.backendConnected);
  const navigate = useNavigate();
  const viewMode = useAppSettings(s => s.projectsViewMode);
  const setViewMode = useAppSettings(s => s.setProjectsViewMode);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  useEffect(() => { if (backendConnected) void fetchJobs(); }, [fetchJobs, backendConnected]);

  const jobCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const job of jobs) {
      if (job.projectId) counts[job.projectId] = (counts[job.projectId] || 0) + 1;
    }
    return counts;
  }, [jobs]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'updatedAt') cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'layers') cmp = a.layers.length - b.layers.length;
      else if (sortKey === 'ops') cmp = a.operations.length - b.operations.length;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [projects, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'updatedAt' ? 'desc' : 'asc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <FontAwesomeIcon icon={faSort} className="text-gray-600 ml-1" />;
    return <FontAwesomeIcon icon={sortDir === 'asc' ? faSortUp : faSortDown} className="text-orange-400 ml-1" />;
  };

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled Project';
    const project = createProject(name);
    setActiveProjectId(project.id);
    setNewName('');
    setShowCreate(false);
    void navigate('/editor');
  };

  const handleOpen = (id: string) => {
    setActiveProjectId(id);
    void navigate('/editor');
  };

  const statLine = (p: typeof projects[0]) => {
    const jobCount = jobCountByProject[p.id] ?? 0;
    return [
      `${p.layers.length} layer${p.layers.length !== 1 ? 's' : ''}`,
      `${p.operations.length} op${p.operations.length !== 1 ? 's' : ''}`,
      `${p.versions.length} version${p.versions.length !== 1 ? 's' : ''}`,
      jobCount > 0 ? `${jobCount} job${jobCount !== 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' · ');
  };

  const projectStatus = (project: typeof projects[0]): { label: string; className: string } => {
    if (project.gcode) return { label: 'Ready', className: 'bg-green-600 text-white' };
    if (project.layers.length > 0) return { label: 'Draft', className: 'bg-yellow-600 text-white' };
    return { label: 'New', className: 'bg-gray-600 text-gray-200' };
  };

  const StatusBadge = ({ project, small }: { project: typeof projects[0]; small?: boolean }) => {
    const status = projectStatus(project);
    return (
      <span className={`${small ? 'px-1.5' : 'px-2'} py-0.5 rounded-full text-xs font-semibold ${status.className} flex-shrink-0`}>
        {status.label}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Projects</h1>
          <p className="text-sm text-gray-400 mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort buttons — only shown in card view (table view uses its own column headers) */}
          {viewMode === 'card' && (
            <div className="flex items-center gap-1">
              {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => handleSort(k)}
                  className={`px-2 py-1 text-xs rounded transition-colors flex items-center ${sortKey === k ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
                >{SORT_LABELS[k]}<SortIcon k={k} /></button>
              ))}
            </div>
          )}
          {/* View toggle */}
          <div className="flex border border-gray-700 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('card')}
              className={`px-2 py-1 text-xs transition-colors ${viewMode === 'card' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
              title="Card view"
            ><FontAwesomeIcon icon={faTableCells} /></button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 text-xs transition-colors ${viewMode === 'table' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
              title="Table view"
            ><FontAwesomeIcon icon={faList} /></button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
          >+ New Project</button>
        </div>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="mb-6 bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <label className="text-sm text-gray-300 font-medium">Project Name</label>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="My Laser Project"
            autoFocus
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-1.5 text-sm rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors">Create</button>
            <button onClick={() => { setShowCreate(false); setNewName(''); }} className="px-4 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {projects.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-800 rounded-xl">
          <div className="text-5xl mb-4">📁</div>
          <h2 className="text-lg font-semibold text-gray-400">No projects yet</h2>
          <p className="text-sm text-gray-600 mt-2 mb-6">Create a new project to get started</p>
          <button onClick={() => setShowCreate(true)} className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors">+ New Project</button>
        </div>
      ) : viewMode === 'card' ? (
        /* ── Card view ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sortedProjects.map(project => (
            <div
              key={project.id}
              onClick={() => handleOpen(project.id)}
              className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3 cursor-pointer transition-all duration-150 hover:border-orange-500/60 hover:shadow-lg hover:shadow-orange-500/5 hover:scale-[1.01] active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {editingProjectId === project.id ? (
                    <input
                      type="text"
                      value={editingProjectName}
                      onChange={e => setEditingProjectName(e.target.value)}
                      onBlur={() => { if (editingProjectName.trim()) renameProject(project.id, editingProjectName.trim()); setEditingProjectId(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') { if (editingProjectName.trim()) renameProject(project.id, editingProjectName.trim()); setEditingProjectId(null); } if (e.key === 'Escape') setEditingProjectId(null); }}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                      className="font-semibold w-full bg-gray-900 border border-orange-500 rounded px-1 py-0 text-gray-100 focus:outline-none text-sm"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="font-semibold text-gray-100 truncate">{project.name}</h3>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingProjectName(project.name); setEditingProjectId(project.id); }}
                        className="text-gray-600 hover:text-orange-400 text-[10px] flex-shrink-0"
                        title="Rename project"
                      ><FontAwesomeIcon icon={faPencil} /></button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">Last modified: {new Date(project.updatedAt).toLocaleString()}</p>
                </div>
                <StatusBadge project={project} />
              </div>
              <p className="text-xs text-gray-400">{statLine(project)}</p>
              <div className="flex gap-2 pt-1">
                <div className="flex-1" />
                <button onClick={e => { e.stopPropagation(); deleteProject(project.id); }} className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-300 transition-colors"><FontAwesomeIcon icon={faTrash} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Table view ── */
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-xs text-gray-400 uppercase">
              <tr>
                <th className="px-4 py-2 text-left cursor-pointer hover:text-gray-200 select-none" onClick={() => handleSort('name')}>
                  Name <SortIcon k="name" />
                </th>
                <th className="px-3 py-2 text-right cursor-pointer hover:text-gray-200 select-none" onClick={() => handleSort('layers')}>
                  Layers <SortIcon k="layers" />
                </th>
                <th className="px-3 py-2 text-right cursor-pointer hover:text-gray-200 select-none" onClick={() => handleSort('ops')}>
                  Ops <SortIcon k="ops" />
                </th>
                <th className="px-3 py-2 text-right text-gray-400">Versions</th>
                <th className="px-3 py-2 text-right text-gray-400">Jobs</th>
                <th className="px-3 py-2 text-right cursor-pointer hover:text-gray-200 select-none" onClick={() => handleSort('updatedAt')}>
                  Modified <SortIcon k="updatedAt" />
                </th>
                <th className="px-3 py-2 text-right">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {sortedProjects.map(project => {
                const jobCount = jobCountByProject[project.id] ?? 0;
                return (
                  <tr key={project.id} className="bg-gray-900 hover:bg-gray-800 transition-colors cursor-pointer" onClick={() => handleOpen(project.id)}>
                    <td className="px-4 py-2.5 font-medium text-gray-100 truncate max-w-[180px]">{project.name}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{project.layers.length}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{project.operations.length}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{project.versions.length}</td>
                    <td className={`px-3 py-2.5 text-right ${jobCount > 0 ? 'text-blue-400' : 'text-gray-600'}`}>{jobCount}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 text-xs whitespace-nowrap">{new Date(project.updatedAt).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">
                      <StatusBadge project={project} small />
                    </td>
                    <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      <button onClick={() => deleteProject(project.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors"><FontAwesomeIcon icon={faTrash} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
