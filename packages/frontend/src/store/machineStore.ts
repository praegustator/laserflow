import { create } from 'zustand';
import { api } from '../api/client';
import type { MachineState, PortInfo, ConsoleEntry } from '../types';

const LAST_PORT_KEY = 'laserflow_last_port';

interface MachineStore {
  /** Whether the frontend WebSocket can reach the backend server */
  backendConnected: boolean;
  /** User has opted to continue using the app without a backend (demo mode) */
  demoMode: boolean;
  /** Serial connection to the physical machine (via backend) */
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  machineState: MachineState | null;
  selectedPort: string;
  baudRate: number;
  consoleLog: ConsoleEntry[];
  ports: PortInfo[];
  /** Whether to automatically reconnect when the serial port disconnects unexpectedly */
  shouldAutoReconnect: boolean;

  setBackendConnected: (v: boolean) => void;
  setDemoMode: (v: boolean) => void;
  fetchPorts: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Called when the backend notifies that the serial port closed unexpectedly */
  handleUnexpectedDisconnect: () => void;
  sendCommand: (command: string) => Promise<void>;
  addConsoleEntry: (entry: Omit<ConsoleEntry, 'id' | 'timestamp'>) => void;
  clearConsoleLog: () => void;
  /** Drop any buffered-but-not-yet-rendered console entries (used on STOP). */
  flushConsoleBuffer: () => void;
  setMachineState: (state: Partial<MachineState>) => void;
  setSelectedPort: (port: string) => void;
  setBaudRate: (rate: number) => void;
}

let _entryCounter = 0;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY_MS = 3000;

/**
 * Console entries can arrive from the machine far faster than React can
 * re-render (hundreds per second while streaming a job). Committing one Zustand
 * update per message makes the UI fall ever further behind the real machine, so
 * the live console keeps scrolling long after the job is done or stopped.
 *
 * To stay in sync we buffer incoming entries and flush them in a single batched
 * state update at most ~12×/second (every FLUSH_INTERVAL_MS).
 */
const CONSOLE_LIMIT = 500;
const FLUSH_INTERVAL_MS = 80;
let _consoleBuffer: ConsoleEntry[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useMachineStore = create<MachineStore>((set, get) => ({
  backendConnected: false,
  demoMode: false,
  connectionStatus: 'disconnected',
  machineState: null,
  selectedPort: '',
  baudRate: 115200,
  consoleLog: [],
  ports: [],
  shouldAutoReconnect: false,

  setBackendConnected: (v) => set({ backendConnected: v, ...(v ? { demoMode: false } : {}) }),
  setDemoMode: (v) => set({ demoMode: v }),

  fetchPorts: async () => {
    const ports = await api.get('/api/ports') as PortInfo[];
    set({ ports });

    const { selectedPort, connectionStatus, shouldAutoReconnect } = get();
    const lastPort = localStorage.getItem(LAST_PORT_KEY) ?? '';

    // Prefer the remembered port over the first available port
    if (lastPort && ports.some(p => p.path === lastPort)) {
      if (!selectedPort || selectedPort !== lastPort) {
        set({ selectedPort: lastPort });
      }
      // Auto-connect if the last port reappeared and we should reconnect
      if (shouldAutoReconnect && connectionStatus === 'disconnected') {
        void get().connect();
      }
    } else if (ports.length > 0 && !selectedPort) {
      set({ selectedPort: ports[0].path });
    }
  },

  connect: async () => {
    const { selectedPort, baudRate } = get();
    set({ connectionStatus: 'connecting' });
    try {
      await api.post('/api/connect', { port: selectedPort, baudRate });
      // Remember this port for future auto-reconnects
      localStorage.setItem(LAST_PORT_KEY, selectedPort);
      _reconnectAttempts = 0;
      set({ connectionStatus: 'connected', shouldAutoReconnect: true });
    } catch (err) {
      set({ connectionStatus: 'disconnected' });
      throw err;
    }
  },

  disconnect: async () => {
    // Cancel any pending auto-reconnect — user explicitly disconnected
    if (_reconnectTimer !== null) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
    _reconnectAttempts = 0;
    set({ shouldAutoReconnect: false });
    await api.post('/api/disconnect');
    set({
      connectionStatus: 'disconnected',
      machineState: null,
    });
  },

  handleUnexpectedDisconnect: () => {
    set({ connectionStatus: 'disconnected', machineState: null });
    const { shouldAutoReconnect, selectedPort } = get();
    if (!shouldAutoReconnect || !selectedPort) return;
    if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      // Give up after max attempts; port polling will take over when the device reappears
      _reconnectAttempts = 0;
      return;
    }
    // Exponential backoff capped at 30 s
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** _reconnectAttempts, 30000);
    _reconnectAttempts += 1;
    if (_reconnectTimer !== null) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      if (get().connectionStatus === 'disconnected' && get().shouldAutoReconnect) {
        void get().connect().catch(() => {
          get().handleUnexpectedDisconnect();
        });
      }
    }, delay);
  },

  sendCommand: async (command: string) => {
    get().addConsoleEntry({ direction: 'out', line: command });
    await api.post('/api/command', { command });
  },

  addConsoleEntry: (entry) => {
    const id = String(++_entryCounter);
    const newEntry: ConsoleEntry = { ...entry, id, timestamp: Date.now() };
    _consoleBuffer.push(newEntry);
    if (_flushTimer === null) {
      _flushTimer = setTimeout(() => {
        _flushTimer = null;
        const batch = _consoleBuffer;
        _consoleBuffer = [];
        if (batch.length === 0) return;
        set((s) => ({
          consoleLog: [...s.consoleLog, ...batch].slice(-CONSOLE_LIMIT),
        }));
      }, FLUSH_INTERVAL_MS);
    }
  },

  clearConsoleLog: () => {
    _consoleBuffer = [];
    if (_flushTimer !== null) {
      clearTimeout(_flushTimer);
      _flushTimer = null;
    }
    set({ consoleLog: [] });
  },

  flushConsoleBuffer: () => {
    _consoleBuffer = [];
    if (_flushTimer !== null) {
      clearTimeout(_flushTimer);
      _flushTimer = null;
    }
  },

  setMachineState: (partial) => {
    set((s) => {
      const base: MachineState = s.machineState ?? {
        state: 'Idle',
        position: { x: 0, y: 0, z: 0 },
        workPosition: { x: 0, y: 0, z: 0 },
        feed: 0,
        spindle: 0,
      };
      return { machineState: { ...base, ...partial } };
    });
  },

  setSelectedPort: (port) => set({ selectedPort: port }),
  setBaudRate: (rate) => set({ baudRate: rate }),
}));
