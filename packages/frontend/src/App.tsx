import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Console from './pages/Console';
import Editor from './pages/Editor';
import Settings from './pages/Settings';
import { createWebSocket } from './api/client';
import { useMachineStore } from './store/machineStore';
import { useJobStore } from './store/jobStore';
import type { WsMessage, MachineState, JobProgress } from './types';

function AppInner() {
  const addConsoleEntry = useMachineStore((s) => s.addConsoleEntry);
  const setMachineState = useMachineStore((s) => s.setMachineState);
  const updateJobProgress = useJobStore((s) => s.updateJobProgress);
  const updateJobStatus = useJobStore((s) => s.updateJobStatus);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
        undefined,
        () => {
          // Reconnect after 3s on close
          reconnectTimer.current = setTimeout(connect, 3000);
        },
      );
      wsRef.current = ws;
    }

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [addConsoleEntry, setMachineState, updateJobProgress, updateJobStatus]);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="console" element={<Console />} />
        <Route path="editor" element={<Editor />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
