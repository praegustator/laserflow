import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../store/projectStore';

export default function Dashboard() {
  const projects = useProjectStore(s => s.projects);
  const createProject = useProjectStore(s => s.createProject);
  const deleteProject = useProjectStore(s => s.deleteProject);
  const setActiveProjectId = useProjectStore(s => s.setActiveProjectId);
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Projects</h1>
          <p className="text-sm text-gray-400 mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
        >+ New Project</button>
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

      {/* Project list */}
      {projects.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-800 rounded-xl">
          <div className="text-5xl mb-4">📁</div>
          <h2 className="text-lg font-semibold text-gray-400">No projects yet</h2>
          <p className="text-sm text-gray-600 mt-2 mb-6">
            Create a new project to get started
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
          >+ New Project</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map(project => (
            <div
              key={project.id}
              className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-100 truncate">{project.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(project.updatedAt).toLocaleString()}
                  </p>
                </div>
                {project.gcode && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-600 text-white flex-shrink-0">
                    ready
                  </span>
                )}
              </div>

              <div className="flex gap-4 text-xs text-gray-400">
                <span>{project.files.length} file{project.files.length !== 1 ? 's' : ''}</span>
                <span>{project.layers.length} layer{project.layers.length !== 1 ? 's' : ''}</span>
                <span>{project.operations.length} op{project.operations.length !== 1 ? 's' : ''}</span>
                {project.versions.length > 0 && (
                  <span>{project.versions.length} version{project.versions.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => handleOpen(project.id)}
                  className="px-3 py-1 text-xs rounded bg-orange-700 hover:bg-orange-600 text-white transition-colors"
                >Open</button>
                <button
                  onClick={() => deleteProject(project.id)}
                  className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-300 transition-colors ml-auto"
                >🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
