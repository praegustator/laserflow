import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Job, Operation, OperationType, Layer } from '../types';
import { useJobStore } from '../store/jobStore';

const OP_TYPE_LABELS: Record<OperationType, string> = {
  cut: '✂ Cut',
  engrave: '✏ Engrave',
  ignore: '✕ Ignore',
};

const OP_COLORS: Record<OperationType, string> = {
  cut: 'text-red-400',
  engrave: 'text-blue-400',
  ignore: 'text-gray-500',
};

interface OperationRowProps {
  op: Operation;
  onChange: (updated: Operation) => void;
}

function OperationRow({ op, onChange }: OperationRowProps) {
  const [expanded, setExpanded] = useState(false);

  const update = <K extends keyof Operation>(key: K, value: Operation[K]) => {
    onChange({ ...op, [key]: value });
  };

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-800 hover:bg-gray-750 text-left"
      >
        <span className={`text-sm font-semibold ${OP_COLORS[op.type]}`}>
          {OP_TYPE_LABELS[op.type]}
        </span>
        <span className="text-xs text-gray-500 ml-auto">
          {op.feedRate} mm/min · {op.power}% · ×{op.passes}
        </span>
        <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-3 py-3 bg-gray-900 space-y-3">
          {/* Type */}
          <div>
            <label className="text-xs text-gray-500 uppercase">Type</label>
            <div className="flex gap-1 mt-1">
              {(['cut', 'engrave', 'ignore'] as OperationType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => update('type', t)}
                  className={`flex-1 py-1 text-xs rounded font-semibold transition-colors ${
                    op.type === t
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {op.type !== 'ignore' && (
            <>
              {/* Feed rate */}
              <div>
                <label className="text-xs text-gray-500 uppercase">
                  Feed Rate (mm/min)
                </label>
                <input
                  type="number"
                  value={op.feedRate}
                  min={1}
                  max={10000}
                  onChange={(e) => update('feedRate', Number(e.target.value))}
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Power */}
              <div>
                <div className="flex justify-between">
                  <label className="text-xs text-gray-500 uppercase">Power (%)</label>
                  <span className="text-xs text-gray-400">{op.power}%</span>
                </div>
                <input
                  type="range"
                  value={op.power}
                  min={0}
                  max={100}
                  onChange={(e) => update('power', Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>

              {/* Passes */}
              <div>
                <label className="text-xs text-gray-500 uppercase">Passes</label>
                <input
                  type="number"
                  value={op.passes}
                  min={1}
                  max={20}
                  onChange={(e) => update('passes', Number(e.target.value))}
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Z offset */}
              <div>
                <label className="text-xs text-gray-500 uppercase">Z Offset (mm)</label>
                <input
                  type="number"
                  value={op.zOffset ?? 0}
                  step={0.1}
                  onChange={(e) => update('zOffset', Number(e.target.value))}
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  job: Job;
  operations: Operation[];
  onOperationsChange: (ops: Operation[]) => void;
  layers: Layer[];
  selectedLayerId: string | null;
  originPosition: string;
}

export default function OperationsPanel({ job, operations, onOperationsChange, layers, selectedLayerId: _selectedLayerId, originPosition }: Props) {
  const generateGcode = useJobStore((s) => s.generateGcode);
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateOp = (index: number, updated: Operation) => {
    const next = operations.map((op, i) => (i === index ? updated : op));
    onOperationsChange(next);
  };

  const addOperation = () => {
    const newOp: Operation = {
      id: `op-${Date.now()}`,
      type: 'cut',
      feedRate: 800,
      power: 80,
      passes: 1,
    };
    onOperationsChange([...operations, newOp]);
  };

  const removeOp = (index: number) => {
    onOperationsChange(operations.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const layerTransforms = Object.fromEntries(
        layers.map(l => [l.id, { offsetX: l.offsetX, offsetY: l.offsetY, scaleX: l.scaleX, scaleY: l.scaleY }])
      );
      await generateGcode(
        job.id,
        operations,
        undefined,
        layerTransforms,
        originPosition === 'bottom-left',
        undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate G-code');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-200">Operations</h2>
        <p className="text-xs text-gray-500 mt-0.5">{job.name}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        {operations.length === 0 ? (
          <div className="text-center text-gray-600 text-sm py-8">
            No operations. Add one below.
          </div>
        ) : (
          operations.map((op, i) => (
            <div key={op.id} className="relative group">
              <OperationRow op={op} onChange={(u) => updateOp(i, u)} />
              <button
                onClick={() => removeOp(i)}
                className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs transition-opacity"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-700 space-y-2">
        <button
          onClick={addOperation}
          className="w-full py-1.5 text-sm rounded border border-dashed border-gray-600 text-gray-400 hover:border-orange-500 hover:text-orange-400 transition-colors"
        >
          + Add Operation
        </button>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <button
          onClick={() => { void handleGenerate(); }}
          disabled={generating || operations.length === 0}
          className="w-full py-2 text-sm rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
        >
          {generating ? 'Generating…' : '⚙ Generate G-code'}
        </button>

        {job.gcode && (
          <p className="text-xs text-green-400 text-center">
            ✓ G-code ready ({job.gcode.split('\n').length.toLocaleString()} lines)
          </p>
        )}
        {job.gcode && (
          <button
            onClick={() => { void navigate('/gcode-preview'); }}
            className="w-full py-1.5 text-sm rounded border border-gray-600 text-gray-300 hover:border-orange-500 hover:text-orange-400 transition-colors"
          >
            📋 Preview G-code →
          </button>
        )}
      </div>
    </div>
  );
}
