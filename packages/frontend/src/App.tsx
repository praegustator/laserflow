import { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Console from './pages/Console';
import Editor from './pages/Editor';
import Settings from './pages/Settings';
import GcodePreview from './pages/GcodePreview';
import { createWebSocket } from './api/client';
import { useMachineStore } from './store/machineStore';
import { useJobStore } from './store/jobStore';
import { useAppSettings } from './store/appSettingsStore';
import type { WsMessage, MachineState, JobProgress } from './types';

function AppInner() {
  const addConsoleEntry = useMachineStore((s) => s.addConsoleEntry);
  const setMachineState = useMachineStore((s) => s.setMachineState);
  const setBackendConnected = useMachineStore((s) => s.setBackendConnected);
  const updateJobProgress = useJobStore((s) => s.updateJobProgress);
  const updateJobStatus = useJobStore((s) => s.updateJobStatus);
  const backendUrl = useAppSettings((s) => s.backendUrl);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function cleanup() {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    }

    function connect() {
      const ws = createWebSocket(
        (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string) as WsMessage;
            if (msg.type === 'console') {
              addConsoleEntry({ direction: 'in', line: String(msg.data) });
            } else if (msg.type === 'machineStatus') {
              setMachineState(msg.data as Partial<MachineState>);
            } else if (msg.type === 'jobProgress') {
              const p = msg.data as { jobId: string } & JobProgress;
              updateJobProgress(p.jobId, {
                currentLine: p.currentLine,
                totalLines: p.totalLines,
                elapsed: p.elapsed,
                eta: p.eta,
              });
              if (p.currentLine >= p.totalLines && p.totalLines > 0) {
                updateJobStatus(p.jobId, 'completed');
              }
            }
          } catch {
            // ignore malformed messages
          }
        },
        () => {
          setBackendConnected(true);
        },
        () => {
          setBackendConnected(false);
          // Reconnect after 3s on close
          reconnectTimer.current = setTimeout(connect, 3000);
        },
      );
      wsRef.current = ws;
    }

    connect();
    return cleanup;
  }, [backendUrl, addConsoleEntry, setMachineState, setBackendConnected, updateJobProgress, updateJobStatus]);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="console" element={<Console />} />
        <Route path="editor" element={<Editor />} />
        <Route path="settings" element={<Settings />} />
        <Route path="gcode-preview" element={<GcodePreview />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  );
}
