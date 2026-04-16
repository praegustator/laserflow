import { useEffect, useState } from 'react';
import { useMachineStore } from '../store/machineStore';
import MachineStatus from './MachineStatus';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 250000];

interface Props {
  /** Show the MachineStatus block below the connect button (default: true) */
  showStatus?: boolean;
}

/**
 * Reusable port-selection + connect/disconnect block.
 * Used by both Console and Queue pages.
 */
export default function ConnectionPanel({ showStatus = true }: Props) {
  const ports = useMachineStore(s => s.ports);
  const selectedPort = useMachineStore(s => s.selectedPort);
  const baudRate = useMachineStore(s => s.baudRate);
  const connectionStatus = useMachineStore(s => s.connectionStatus);
  const fetchPorts = useMachineStore(s => s.fetchPorts);
  const connect = useMachineStore(s => s.connect);
  const disconnect = useMachineStore(s => s.disconnect);
  const setSelectedPort = useMachineStore(s => s.setSelectedPort);
  const setBaudRate = useMachineStore(s => s.setBaudRate);

  const [error, setError] = useState<string | null>(null);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  // Poll ports while disconnected
  useEffect(() => {
    void fetchPorts();
    if (isConnected) return;
    const interval = setInterval(() => { void fetchPorts(); }, 3000);
    return () => clearInterval(interval);
  }, [fetchPorts, isConnected]);

  const handleConnect = async () => {
    setError(null);
    try {
      await connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    await disconnect();
  };

  return (
    <div className="space-y-3">
      {/* Serial port selector */}
      <div>
        <label className="text-xs text-gray-500 uppercase">Serial Port</label>
        <div className="flex gap-1 mt-1">
          <select
            value={selectedPort}
            onChange={e => setSelectedPort(e.target.value)}
            disabled={isConnected}
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-orange-500 disabled:opacity-50"
          >
            {ports.length === 0 && <option value="">No ports found</option>}
            {ports.map(p => (
              <option key={p.path} value={p.path}>
                {p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => { void fetchPorts(); }}
            className="px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 flex-shrink-0"
            title="Refresh ports"
          >↺</button>
        </div>
        {ports.length === 0 && import.meta.env.VITE_IS_DOCKER === 'true' && (
          <p className="text-xs text-amber-400/80 mt-1.5">
            Running in Docker? Edit <code className="font-mono">docker-compose.yml</code> and uncomment the <code className="font-mono">devices:</code> section to pass your USB serial device through to the container, then rebuild.
          </p>
        )}
      </div>

      {/* Baud rate */}
      <div>
        <label className="text-xs text-gray-500 uppercase">Baud Rate</label>
        <select
          value={baudRate}
          onChange={e => setBaudRate(Number(e.target.value))}
          disabled={isConnected}
          className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-orange-500 disabled:opacity-50"
        >
          {BAUD_RATES.map(r => (
            <option key={r} value={r}>{r.toLocaleString()}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 rounded p-2">{error}</p>
      )}

      {/* Connect / Disconnect */}
      {!isConnected ? (
        <button
          onClick={() => { void handleConnect(); }}
          disabled={isConnecting || !selectedPort}
          className="w-full py-1.5 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
        >
          {isConnecting ? 'Connecting…' : '⚡ Connect'}
        </button>
      ) : (
        <button
          onClick={() => { void handleDisconnect(); }}
          className="w-full py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
        >
          ✕ Disconnect
        </button>
      )}

      {/* Machine status */}
      {showStatus && (
        <div>
          <div className="text-xs text-gray-500 uppercase mb-2">Machine Status</div>
          <MachineStatus />
        </div>
      )}
    </div>
  );
}
