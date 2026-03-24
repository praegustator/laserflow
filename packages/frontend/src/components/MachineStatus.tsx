import { useMachineStore } from '../store/machineStore';

const STATE_COLORS: Record<string, string> = {
  Disconnected: 'bg-gray-600 text-gray-200',
  Idle: 'bg-green-600 text-white',
  Run: 'bg-blue-600 text-white',
  Hold: 'bg-yellow-500 text-gray-900',
  Alarm: 'bg-red-600 text-white',
  Error: 'bg-red-700 text-white',
};

interface Props {
  compact?: boolean;
}

export default function MachineStatus({ compact = false }: Props) {
  const connectionStatus = useMachineStore((s) => s.connectionStatus);
  const machineState = useMachineStore((s) => s.machineState);

  const stateName =
    connectionStatus === 'disconnected'
      ? 'Disconnected'
      : connectionStatus === 'connecting'
        ? 'Connecting…'
        : (machineState?.state ?? 'Unknown');

  const colorClass = STATE_COLORS[stateName] ?? 'bg-gray-600 text-gray-200';
  const pos = machineState?.workPosition;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>
          {stateName}
        </span>
        {pos && (
          <span className="text-xs font-mono text-gray-400">
            X{pos.x.toFixed(2)} Y{pos.y.toFixed(2)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colorClass}`}>
          {stateName}
        </span>
      </div>
      {machineState && (
        <div className="grid grid-cols-2 gap-2 text-sm font-mono">
          <div>
            <div className="text-gray-500 text-xs uppercase mb-1">Work Pos</div>
            <div className="text-gray-200">
              X {machineState.workPosition.x.toFixed(3)}
            </div>
            <div className="text-gray-200">
              Y {machineState.workPosition.y.toFixed(3)}
            </div>
            <div className="text-gray-200">
              Z {machineState.workPosition.z.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase mb-1">Machine</div>
            <div className="text-gray-200">
              X {machineState.position.x.toFixed(3)}
            </div>
            <div className="text-gray-200">
              Y {machineState.position.y.toFixed(3)}
            </div>
            <div className="text-gray-200">
              Z {machineState.position.z.toFixed(3)}
            </div>
          </div>
        </div>
      )}
      {machineState && (
        <div className="text-xs text-gray-400 flex gap-4">
          <span>Feed: {machineState.feed} mm/min</span>
          <span>Spindle: {machineState.spindle} RPM</span>
        </div>
      )}
    </div>
  );
}
