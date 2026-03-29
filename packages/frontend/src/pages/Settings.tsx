import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileExport, faFileImport, faPlus, faPencil, faTrash } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api/client';
import { useAppSettings, isMixedContent, type OriginPosition } from '../store/appSettingsStore';
import type { MachineProfile, MaterialPreset } from '../types';

// ─── Machine Profiles ────────────────────────────────────────────────────────

const EMPTY_PROFILE: Omit<MachineProfile, 'id'> = {
  name: '',
  workArea: { x: 300, y: 200 },
  maxFeedRate: { x: 5000, y: 5000 },
  maxSpindleSpeed: 1000,
  homingEnabled: false,
};

function ProfileForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Omit<MachineProfile, 'id'>;
  onSave: (p: Omit<MachineProfile, 'id'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 uppercase">Profile Name</label>
          <input
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Work Area X (mm)</label>
          <input
            type="number"
            value={form.workArea.x}
            onChange={(e) => set('workArea', { ...form.workArea, x: Number(e.target.value) })}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Work Area Y (mm)</label>
          <input
            type="number"
            value={form.workArea.y}
            onChange={(e) => set('workArea', { ...form.workArea, y: Number(e.target.value) })}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Max Feed X</label>
          <input
            type="number"
            value={form.maxFeedRate.x}
            onChange={(e) => set('maxFeedRate', { ...form.maxFeedRate, x: Number(e.target.value) })}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Max Feed Y</label>
          <input
            type="number"
            value={form.maxFeedRate.y}
            onChange={(e) => set('maxFeedRate', { ...form.maxFeedRate, y: Number(e.target.value) })}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Max Laser Power (S-value, GRBL $30)</label>
          <input
            type="number"
            value={form.maxSpindleSpeed}
            onChange={(e) => set('maxSpindleSpeed', Number(e.target.value))}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <input
            id="homing"
            type="checkbox"
            checked={form.homingEnabled}
            onChange={(e) => set('homingEnabled', e.target.checked)}
            className="accent-orange-500"
          />
          <label htmlFor="homing" className="text-sm text-gray-300">
            Homing Enabled
          </label>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="px-4 py-1.5 rounded bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Material Presets ─────────────────────────────────────────────────────────

const EMPTY_PRESET: Omit<MaterialPreset, 'id'> = {
  name: '',
  thickness: 3,
  engrave: { feedRate: 2000, power: 30 },
  cutThin: { feedRate: 800, power: 80 },
  cutThick: { feedRate: 400, power: 100 },
};

function PresetForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Omit<MaterialPreset, 'id'>;
  onSave: (p: Omit<MaterialPreset, 'id'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  type OpKey = 'engrave' | 'cutThin' | 'cutThick';
  const setOp = (key: OpKey, field: 'feedRate' | 'power', value: number) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], [field]: value } }));

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 uppercase">Material Name</label>
          <input
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Thickness (mm)</label>
          <input
            type="number"
            value={form.thickness}
            step={0.1}
            onChange={(e) => set('thickness', Number(e.target.value))}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {(
        [
          ['engrave', 'Engrave'],
          ['cutThin', 'Cut (Thin)'],
          ['cutThick', 'Cut (Thick)'],
        ] as [OpKey, string][]
      ).map(([key, label]) => (
        <div key={key}>
          <div className="text-xs text-gray-500 uppercase mb-1">{label}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-600">Feed (mm/min)</label>
              <input
                type="number"
                value={form[key].feedRate}
                onChange={(e) => setOp(key, 'feedRate', Number(e.target.value))}
                className="mt-0.5 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Power (%)</label>
              <input
                type="number"
                value={form[key].power}
                min={0}
                max={100}
                onChange={(e) => setOp(key, 'power', Number(e.target.value))}
                className="mt-0.5 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="px-4 py-1.5 rounded bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const backendUrl = useAppSettings((s) => s.backendUrl);
  const setBackendUrl = useAppSettings((s) => s.setBackendUrl);
  const originPosition = useAppSettings((s) => s.originPosition);
  const setOriginPosition = useAppSettings((s) => s.setOriginPosition);
  const units = useAppSettings((s) => s.units);
  const setUnits = useAppSettings((s) => s.setUnits);
  const safetyConfirmation = useAppSettings((s) => s.safetyConfirmation);
  const setSafetyConfirmation = useAppSettings((s) => s.setSafetyConfirmation);
  const autoScrollConsole = useAppSettings((s) => s.autoScrollConsole);
  const setAutoScrollConsole = useAppSettings((s) => s.setAutoScrollConsole);
  const autoZoomOnLayerSelect = useAppSettings((s) => s.autoZoomOnLayerSelect);
  const setAutoZoomOnLayerSelect = useAppSettings((s) => s.setAutoZoomOnLayerSelect);
  const autoPanOnLayerSelect = useAppSettings((s) => s.autoPanOnLayerSelect);
  const setAutoPanOnLayerSelect = useAppSettings((s) => s.setAutoPanOnLayerSelect);
  const singleExpandedOp = useAppSettings((s) => s.singleExpandedOp);
  const setSingleExpandedOp = useAppSettings((s) => s.setSingleExpandedOp);

  const [pendingUrl, setPendingUrl] = useState(backendUrl);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<MachineProfile[]>([]);
  const [presets, setPresets] = useState<MaterialPreset[]>([]);
  const [editingProfile, setEditingProfile] = useState<MachineProfile | null>(null);
  const [addingProfile, setAddingProfile] = useState(false);
  const [editingPreset, setEditingPreset] = useState<MaterialPreset | null>(null);
  const [addingPreset, setAddingPreset] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileDragOver, setProfileDragOver] = useState(false);
  const [presetDragOver, setPresetDragOver] = useState(false);
  const profileImportRef = useRef<HTMLInputElement>(null);
  const presetImportRef = useRef<HTMLInputElement>(null);

  const handleSaveUrl = () => {
    setBackendUrl(pendingUrl.trim() || 'http://localhost:3001');
  };

  const handleTestConnection = async () => {
    const url = pendingUrl.trim() || backendUrl;
    if (isMixedContent(url)) {
      setTestStatus('✗ Mixed content – browser blocks HTTP connections from HTTPS pages (see warning below)');
      setTimeout(() => setTestStatus(null), 6000);
      return;
    }
    setTestStatus('Testing…');
    try {
      const r = await fetch(`${url}/api/ports`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) setTestStatus('✓ Connected');
      else setTestStatus(`✗ HTTP ${r.status}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('timeout') || msg.includes('abort')) {
        setTestStatus('✗ Timed out (3s)');
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setTestStatus('✗ Network error – backend unreachable');
      } else {
        setTestStatus(`✗ ${msg}`);
      }
    }
    setTimeout(() => setTestStatus(null), 4000);
  };

  // Export helpers
  const sanitizeFilename = (name: string) =>
    name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim() || 'export';

  const exportJson = (filename: string, data: unknown) => {
    const json = JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import profiles from JSON
  const importProfilesFromJson = async (json: unknown) => {
    if (!Array.isArray(json)) return;
    for (const p of json as MachineProfile[]) {
      try {
        const created = await api.post('/api/machines', p) as MachineProfile;
        setProfiles((ps) => {
          const existing = ps.find(x => x.id === created.id);
          return existing ? ps.map(x => x.id === created.id ? created : x) : [...ps, created];
        });
      } catch (err) { console.error('Import profile failed', err); }
    }
  };

  const handleProfileImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      await importProfilesFromJson(json);
    } catch { /* ignore */ }
    e.target.value = '';
  };

  const handleProfileImportDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setProfileDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      await importProfilesFromJson(json);
    } catch { /* ignore */ }
  };

  // Import presets from JSON
  const importPresetsFromJson = async (json: unknown) => {
    if (!Array.isArray(json)) return;
    for (const p of json as MaterialPreset[]) {
      try {
        const created = await api.post('/api/material-presets', p) as MaterialPreset;
        setPresets((ps) => {
          const existing = ps.find(x => x.id === created.id);
          return existing ? ps.map(x => x.id === created.id ? created : x) : [...ps, created];
        });
      } catch (err) { console.error('Import preset failed', err); }
    }
  };

  const handlePresetImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      await importPresetsFromJson(json);
    } catch { /* ignore */ }
    e.target.value = '';
  };

  const handlePresetImportDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setPresetDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      await importPresetsFromJson(json);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [p, m] = await Promise.all([
          api.get('/api/machines') as Promise<MachineProfile[]>,
          api.get('/api/material-presets') as Promise<MaterialPreset[]>,
        ]);
        setProfiles(p);
        setPresets(m);
      } catch {
        // silently ignore if endpoints not available
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  // Profile actions
  const saveProfile = async (data: Omit<MachineProfile, 'id'>) => {
    try {
      if (editingProfile) {
        const updated = await api.post(`/api/machines/${editingProfile.id}`, { ...data, id: editingProfile.id }) as MachineProfile;
        setProfiles((ps) => ps.map((p) => (p.id === editingProfile.id ? updated : p)));
      } else {
        const created = await api.post('/api/machines', data) as MachineProfile;
        setProfiles((ps) => [...ps, created]);
      }
    } catch (err) {
      console.error('Save profile failed', err);
    }
    setEditingProfile(null);
    setAddingProfile(false);
  };

  const deleteProfile = async (id: string) => {
    try {
      await api.delete(`/api/machines/${id}`);
      setProfiles((ps) => ps.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Delete profile failed', err);
    }
  };

  // Preset actions
  const savePreset = async (data: Omit<MaterialPreset, 'id'>) => {
    try {
      if (editingPreset) {
        const updated = await api.post(`/api/material-presets/${editingPreset.id}`, { ...data, id: editingPreset.id }) as MaterialPreset;
        setPresets((ps) => ps.map((p) => (p.id === editingPreset.id ? updated : p)));
      } else {
        const created = await api.post('/api/material-presets', data) as MaterialPreset;
        setPresets((ps) => [...ps, created]);
      }
    } catch (err) {
      console.error('Save preset failed', err);
    }
    setEditingPreset(null);
    setAddingPreset(false);
  };

  const deletePreset = async (id: string) => {
    try {
      await api.delete(`/api/material-presets/${id}`);
      setPresets((ps) => ps.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Delete preset failed', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-10">
      <h1 className="text-2xl font-bold text-gray-100">Settings</h1>

      {/* ── Connection ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-3">Connection</h2>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 uppercase">Backend URL</label>
            <div className="flex gap-2 mt-1">
              <input
                value={pendingUrl}
                onChange={e => setPendingUrl(e.target.value)}
                placeholder="http://localhost:3001"
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
              />
              <button onClick={() => { void handleSaveUrl(); }} className="px-3 py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors">Save</button>
              <button onClick={() => { void handleTestConnection(); }} className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors">Test</button>
            </div>
            {testStatus && <span className="text-xs text-gray-400 mt-1 block">{testStatus}</span>}
          </div>

          {/* Mixed-content warning – shown when on HTTPS with an http:// backend URL */}
          {isMixedContent(pendingUrl) && (
            <div className="rounded-md bg-amber-900/30 border border-amber-700/50 p-3 text-xs text-amber-300 space-y-2">
              <p className="font-semibold">⚠️ Mixed content – connection will be blocked by your browser</p>
              <p>
                This app is served over <strong>HTTPS</strong> but your backend URL uses plain <strong>HTTP</strong>.
                Browsers block insecure WebSocket (<code>ws://</code>) and fetch (<code>http://</code>)
                connections from HTTPS pages, so LaserFlow cannot reach your local machine.
              </p>
              <p className="font-medium">To connect from GitHub Pages, choose one option:</p>
              <ul className="list-disc list-inside space-y-1 text-amber-400/90">
                <li>
                  Put an <strong>HTTPS reverse proxy</strong> (e.g. nginx + a certificate trusted by your
                  browser) in front of your backend and enter an <code>https://…</code> URL here.
                </li>
                <li>
                  Use a <strong>secure tunnel</strong> such as{' '}
                  <code>cloudflared tunnel</code> or <code>ngrok</code> to expose your backend over HTTPS,
                  then paste the tunnel URL here.
                </li>
                <li>
                  <strong>Run the frontend locally</strong> (served over HTTP) so the browser allows
                  plain <code>ws://</code> connections: clone the repo and run <code>npm run dev</code>.
                </li>
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-500">
            When the frontend is served locally over HTTP, enter your backend URL (e.g.{' '}
            <code>http://192.168.1.100:3001</code>). When served over HTTPS (GitHub Pages), use an{' '}
            <code>https://</code> URL or a secure tunnel to avoid mixed-content restrictions.
          </p>
        </div>
      </section>

      {/* ── Machine Profiles ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-200">Machine Profiles</h2>
          <div className="flex gap-2">
            <button
              onClick={() => exportJson('machine-profiles.json', profiles)}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors flex items-center gap-1.5"
            >
              <FontAwesomeIcon icon={faFileExport} />
              Export All
            </button>
            <button
              onClick={() => profileImportRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors flex items-center gap-1.5"
            >
              <FontAwesomeIcon icon={faFileImport} />
              Import JSON
            </button>
            <input type="file" accept=".json" className="hidden" ref={profileImportRef} onChange={e => { void handleProfileImportFile(e); }} />
            {!addingProfile && !editingProfile && (
              <button
                onClick={() => setAddingProfile(true)}
                className="px-3 py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors flex items-center gap-1.5"
              >
                <FontAwesomeIcon icon={faPlus} />
                Add Profile
              </button>
            )}
          </div>
        </div>

        {addingProfile && (
          <div className="mb-3">
            <ProfileForm
              initial={EMPTY_PROFILE}
              onSave={(data) => { void saveProfile(data); }}
              onCancel={() => setAddingProfile(false)}
            />
          </div>
        )}

        <div className="space-y-3">
          {profiles.length === 0 && !addingProfile && (
            <p className="text-sm text-gray-500 py-4 text-center border border-dashed border-gray-700 rounded-lg">
              No machine profiles yet
            </p>
          )}
          {profiles.map((p) =>
            editingProfile?.id === p.id ? (
              <ProfileForm
                key={p.id}
                initial={p}
                onSave={(data) => { void saveProfile(data); }}
                onCancel={() => setEditingProfile(null)}
              />
            ) : (
              <div
                key={p.id}
                className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-4 py-3"
              >
                <div>
                  <div className="font-medium text-gray-100">{p.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {p.workArea.x}×{p.workArea.y} mm · max S={p.maxSpindleSpeed}
                    {p.homingEnabled ? ' · homing on' : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => exportJson(`machine-profile-${sanitizeFilename(p.name)}.json`, p)}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors flex items-center gap-1.5"
                    title="Export this profile"
                  >
                    <FontAwesomeIcon icon={faFileExport} />
                    Export
                  </button>
                  <button
                    onClick={() => setEditingProfile(p)}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors flex items-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faPencil} />
                    Edit
                  </button>
                  <button
                    onClick={() => { void deleteProfile(p.id); }}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
        {/* Profile import drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setProfileDragOver(true); }}
          onDragLeave={() => setProfileDragOver(false)}
          onDrop={e => { void handleProfileImportDrop(e); }}
          className={`mt-2 border-2 border-dashed rounded-lg p-4 text-center text-sm text-gray-500 transition-colors ${profileDragOver ? 'border-orange-400 bg-orange-900/10' : 'border-gray-700'}`}
        >
          Drop JSON file here to import profiles
        </div>
      </section>

      {/* ── Material Presets ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-200">Material Presets</h2>
          <div className="flex gap-2">
            <button
              onClick={() => exportJson('material-presets.json', presets)}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors flex items-center gap-1.5"
            >
              <FontAwesomeIcon icon={faFileExport} />
              Export All
            </button>
            <button
              onClick={() => presetImportRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors flex items-center gap-1.5"
            >
              <FontAwesomeIcon icon={faFileImport} />
              Import JSON
            </button>
            <input type="file" accept=".json" className="hidden" ref={presetImportRef} onChange={e => { void handlePresetImportFile(e); }} />
            {!addingPreset && !editingPreset && (
              <button
                onClick={() => setAddingPreset(true)}
                className="px-3 py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors flex items-center gap-1.5"
              >
                <FontAwesomeIcon icon={faPlus} />
                Add Preset
              </button>
            )}
          </div>
        </div>

        {addingPreset && (
          <div className="mb-3">
            <PresetForm
              initial={EMPTY_PRESET}
              onSave={(data) => { void savePreset(data); }}
              onCancel={() => setAddingPreset(false)}
            />
          </div>
        )}

        <div className="space-y-3">
          {presets.length === 0 && !addingPreset && (
            <p className="text-sm text-gray-500 py-4 text-center border border-dashed border-gray-700 rounded-lg">
              No material presets yet
            </p>
          )}
          {presets.map((p) =>
            editingPreset?.id === p.id ? (
              <PresetForm
                key={p.id}
                initial={p}
                onSave={(data) => { void savePreset(data); }}
                onCancel={() => setEditingPreset(null)}
              />
            ) : (
              <div
                key={p.id}
                className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-4 py-3"
              >
                <div>
                  <div className="font-medium text-gray-100">{p.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {p.thickness}mm · engrave {p.engrave.feedRate}mm/min@{p.engrave.power}%
                    · cut {p.cutThin.feedRate}mm/min@{p.cutThin.power}%
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => exportJson(`material-preset-${sanitizeFilename(p.name)}.json`, p)}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors flex items-center gap-1.5"
                    title="Export this preset"
                  >
                    <FontAwesomeIcon icon={faFileExport} />
                    Export
                  </button>
                  <button
                    onClick={() => setEditingPreset(p)}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors flex items-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faPencil} />
                    Edit
                  </button>
                  <button
                    onClick={() => { void deletePreset(p.id); }}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
        {/* Preset import drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setPresetDragOver(true); }}
          onDragLeave={() => setPresetDragOver(false)}
          onDrop={e => { void handlePresetImportDrop(e); }}
          className={`mt-2 border-2 border-dashed rounded-lg p-4 text-center text-sm text-gray-500 transition-colors ${presetDragOver ? 'border-orange-400 bg-orange-900/10' : 'border-gray-700'}`}
        >
          Drop JSON file here to import presets
        </div>
      </section>

      {/* ── App Settings ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-3">App Settings</h2>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Origin Position</div>
              <div className="text-xs text-gray-500">Where is (0,0) on your machine bed</div>
            </div>
            <select
              value={originPosition}
              onChange={e => setOriginPosition(e.target.value as OriginPosition)}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            >
              <option value="bottom-left">Bottom-Left (standard GRBL)</option>
              <option value="top-left">Top-Left</option>
            </select>
          </div>
          <div className="border-t border-gray-700" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Units</div>
              <div className="text-xs text-gray-500">Display units for distances</div>
            </div>
            <select
              value={units}
              onChange={e => setUnits(e.target.value as 'mm' | 'in')}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            >
              <option value="mm">Millimeters (mm)</option>
              <option value="in">Inches (in)</option>
            </select>
          </div>
          <div className="border-t border-gray-700" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Safety Confirmation</div>
              <div className="text-xs text-gray-500">Require confirmation before starting a job</div>
            </div>
            <input
              type="checkbox"
              checked={safetyConfirmation}
              onChange={e => setSafetyConfirmation(e.target.checked)}
              className="accent-orange-500 w-4 h-4"
            />
          </div>
          <div className="border-t border-gray-700" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Auto-scroll Console</div>
              <div className="text-xs text-gray-500">Automatically scroll to latest console output</div>
            </div>
            <input
              type="checkbox"
              checked={autoScrollConsole}
              onChange={e => setAutoScrollConsole(e.target.checked)}
              className="accent-orange-500 w-4 h-4"
            />
          </div>
          <div className="border-t border-gray-700" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Auto-zoom to selected layer</div>
              <div className="text-xs text-gray-500">Pan and zoom the canvas to fit a layer when you select it</div>
            </div>
            <input
              type="checkbox"
              checked={autoZoomOnLayerSelect}
              onChange={e => setAutoZoomOnLayerSelect(e.target.checked)}
              className="accent-orange-500 w-4 h-4"
            />
          </div>
          <div className="border-t border-gray-700" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Auto-pan to selected layer</div>
              <div className="text-xs text-gray-500">Center the canvas on a layer when you select it (without changing zoom)</div>
            </div>
            <input
              type="checkbox"
              checked={autoPanOnLayerSelect}
              onChange={e => setAutoPanOnLayerSelect(e.target.checked)}
              className="accent-orange-500 w-4 h-4"
            />
          </div>
          <div className="border-t border-gray-700" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Single expanded operation</div>
              <div className="text-xs text-gray-500">Keep only one operation expanded at a time in the Operations panel</div>
            </div>
            <input
              type="checkbox"
              checked={singleExpandedOp}
              onChange={e => setSingleExpandedOp(e.target.checked)}
              className="accent-orange-500 w-4 h-4"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
