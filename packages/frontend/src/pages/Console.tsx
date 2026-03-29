import { useState } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useMachineStore } from '../store/machineStore';
import ConnectionPanel from '../components/ConnectionPanel';
import ConsoleLog from '../components/ConsoleLog';
import JogControls from '../components/JogControls';

export default function Console() {
  const sendCommand = useMachineStore((s) => s.sendCommand);
  const [cmdInput, setCmdInput] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex h-full min-h-0">
      <PanelGroup orientation="horizontal" className="h-full" resizeTargetMinimumSize={{ coarse: 44, fine: 8 }}>
        {/* Left: Connection controls */}
        <Panel defaultSize="22%" minSize="200px" groupResizeBehavior="preserve-pixel-size" className="bg-gray-900 border-r border-gray-800 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Connection</h2>
            <ConnectionPanel showStatus />
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
