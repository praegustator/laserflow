import { useEffect, useState } from 'react';
import { api } from '../api/client';
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
          <label className="text-xs text-gray-500 uppercase">Max Spindle Speed</label>
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
  const [profiles, setProfiles] = useState<MachineProfile[]>([]);
  const [presets, setPresets] = useState<MaterialPreset[]>([]);
  const [editingProfile, setEditingProfile] = useState<MachineProfile | null>(null);
  const [addingProfile, setAddingProfile] = useState(false);
  const [editingPreset, setEditingPreset] = useState<MaterialPreset | null>(null);
  const [addingPreset, setAddingPreset] = useState(false);
  const [loading, setLoading] = useState(true);

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

      {/* ── Machine Profiles ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-200">Machine Profiles</h2>
          {!addingProfile && !editingProfile && (
            <button
              onClick={() => setAddingProfile(true)}
              className="px-3 py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors"
            >
              + Add Profile
            </button>
          )}
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
                    {p.workArea.x}×{p.workArea.y} mm · max {p.maxSpindleSpeed} RPM
                    {p.homingEnabled ? ' · homing on' : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingProfile(p)}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => { void deleteProfile(p.id); }}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      {/* ── Material Presets ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-200">Material Presets</h2>
          {!addingPreset && !editingPreset && (
            <button
              onClick={() => setAddingPreset(true)}
              className="px-3 py-1.5 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors"
            >
              + Add Preset
            </button>
          )}
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
                    onClick={() => setEditingPreset(p)}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => { void deletePreset(p.id); }}
                    className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      {/* ── App Settings ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-3">App Settings</h2>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Units</div>
              <div className="text-xs text-gray-500">Display units for distances</div>
            </div>
            <select className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500">
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
            <input type="checkbox" defaultChecked className="accent-orange-500 w-4 h-4" />
          </div>
          <div className="border-t border-gray-700" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Auto-scroll Console</div>
              <div className="text-xs text-gray-500">Automatically scroll to latest console output</div>
            </div>
            <input type="checkbox" defaultChecked className="accent-orange-500 w-4 h-4" />
          </div>
        </div>
      </section>
    </div>
  );
}
