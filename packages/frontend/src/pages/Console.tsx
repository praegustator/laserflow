import { useEffect, useState } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useMachineStore } from '../store/machineStore';
import MachineStatus from '../components/MachineStatus';
import ConsoleLog from '../components/ConsoleLog';
import JogControls from '../components/JogControls';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 250000];

export default function Console() {
  const ports = useMachineStore((s) => s.ports);
  const selectedPort = useMachineStore((s) => s.selectedPort);
  const baudRate = useMachineStore((s) => s.baudRate);
  const connectionStatus = useMachineStore((s) => s.connectionStatus);
  const fetchPorts = useMachineStore((s) => s.fetchPorts);
  const connect = useMachineStore((s) => s.connect);
  const disconnect = useMachineStore((s) => s.disconnect);
  const setSelectedPort = useMachineStore((s) => s.setSelectedPort);
  const setBaudRate = useMachineStore((s) => s.setBaudRate);
  const sendCommand = useMachineStore((s) => s.sendCommand);
  const [cmdInput, setCmdInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchPorts();
    // Poll the port list every 3 seconds while disconnected so a newly
    // plugged-in device is detected and auto-connected if it matches the
    // last used port. Stop polling once connected to avoid unnecessary calls.
    if (connectionStatus === 'connected') return;
    const interval = setInterval(() => { void fetchPorts(); }, 3000);
    return () => clearInterval(interval);
  }, [fetchPorts, connectionStatus]);

  const handleConnect = async () => {
    setError(null);
    try {
      await connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = cmdInput.trim();
    if (!cmd) return;
    setCmdInput('');
    try {
      await sendCommand(cmd);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send command');
    }
  };

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="flex h-full min-h-0">
      <PanelGroup orientation="horizontal" className="h-full" resizeTargetMinimumSize={{ coarse: 44, fine: 8 }}>
        {/* Left: Connection controls */}
        <Panel defaultSize="22%" minSize="200px" groupResizeBehavior="preserve-pixel-size" className="bg-gray-900 border-r border-gray-800 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            Connection
          </h2>

          {/* Port */}
          <div>
            <label className="text-xs text-gray-500 uppercase">Serial Port</label>
            <div className="flex gap-1 mt-1">
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                disabled={isConnected}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500 disabled:opacity-50"
              >
                {ports.length === 0 && (
                  <option value="">No ports found</option>
                )}
                {ports.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path}
                    {p.manufacturer ? ` (${p.manufacturer})` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => { void fetchPorts(); }}
                className="px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300"
                title="Refresh ports"
              >
                ↺
              </button>
            </div>
          </div>

          {/* Baud rate */}
          <div>
            <label className="text-xs text-gray-500 uppercase">Baud Rate</label>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              disabled={isConnected}
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500 disabled:opacity-50"
            >
              {BAUD_RATES.map((r) => (
                <option key={r} value={r}>
                  {r.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          {/* Connect/Disconnect */}
          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 rounded p-2">{error}</p>
          )}
          {!isConnected ? (
            <button
              onClick={() => { void handleConnect(); }}
              disabled={isConnecting || !selectedPort}
              className="w-full py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {isConnecting ? 'Connecting…' : '⚡ Connect'}
            </button>
          ) : (
            <button
              onClick={() => { void handleDisconnect(); }}
              className="w-full py-2 rounded-lg bg-red-800 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
            >
              ✕ Disconnect
            </button>
          )}

          {/* Machine status */}
          <div>
            <div className="text-xs text-gray-500 uppercase mb-2">Machine Status</div>
            <MachineStatus />
          </div>
          </div>
        </Panel>

        <PanelResizeHandle className="group w-2 bg-gray-800 hover:bg-orange-500/60 active:bg-orange-500 transition-colors cursor-col-resize flex items-center justify-center">
            <div className="w-0.5 h-8 rounded-full bg-gray-600 group-hover:bg-orange-400 transition-colors" />
          </PanelResizeHandle>

        {/* Center: Console */}
        <Panel minSize="300px" className="flex flex-col min-w-0 min-h-0">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-300">GRBL Console</h2>
            <span className="text-xs text-gray-600 ml-auto">last 500 entries</span>
          </div>

          <ConsoleLog />

          {/* Input */}
          <form onSubmit={(e) => { void handleSend(e); }} className="border-t border-gray-800 p-3 flex gap-2">
            <input
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              disabled={!isConnected}
              placeholder={isConnected ? 'Send command… (e.g. ?, $, G0X0Y0)' : 'Connect to send commands'}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500 disabled:opacity-50 font-mono"
            />
            <button
              type="submit"
              disabled={!isConnected || !cmdInput.trim()}
              className="px-4 py-1.5 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              Send
            </button>
          </form>
        </Panel>

        <PanelResizeHandle className="group w-2 bg-gray-800 hover:bg-orange-500/60 active:bg-orange-500 transition-colors cursor-col-resize flex items-center justify-center">
            <div className="w-0.5 h-8 rounded-full bg-gray-600 group-hover:bg-orange-400 transition-colors" />
          </PanelResizeHandle>

        {/* Right: Jog controls */}
        <Panel defaultSize="22%" minSize="200px" groupResizeBehavior="preserve-pixel-size" className="bg-gray-900 border-l border-gray-800 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
            Jog Controls
          </h2>
          <JogControls />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
